import {validateCalendarDraft} from './calendar-draft.mjs';
import {CALENDAR_SCOPE} from './google-connection.mjs';
const fail = code => Object.assign(new Error(code),{code});
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const validLink = value => {
  try { const u=new URL(value); return u.protocol==='https:' && ['www.google.com','google.com'].includes(u.hostname) && u.pathname.startsWith('/calendar/') && !u.username && !u.password && !u.port && value.length<=2048; } catch { return false; }
};

export function createCalendarRpc({url,serviceKey,fetchImpl=fetch}) {
  return async(user,action,data) => {
    const response=await fetchImpl(`${url.replace(/\/$/,'')}/rest/v1/rpc/calendar_event_service`,{
      method:'POST',redirect:'error',signal:AbortSignal.timeout(10000),
      headers:{apikey:serviceKey,Authorization:`Bearer ${serviceKey}`,'Content-Type':'application/json'},
      body:JSON.stringify({p_user:user,p_action:action,p_data:data})});
    if (!response.ok) {
      let doc; try { doc=await response.json(); } catch { /* fixed codes only */ }
      const known=['GOOGLE_CALENDAR_SCOPE_REQUIRED','TASK_NOT_FOUND','CALENDAR_BUSY','STALE_CALENDAR_TASK','CALENDAR_RETRY_ORIGINAL','STALE_CALENDAR_OPERATION'];
      throw fail(known.includes(doc?.message)?doc.message:'CALENDAR_STORAGE_UNAVAILABLE');
    }
    return response.json();
  };
}

export function createCalendarWriter({rpc,connection,fetchImpl=fetch}) {
  return async(user,input) => {
    if (!input || Array.isArray(input) || Object.keys(input).some(k=>!['taskId','taskRevision','draft'].includes(k))
      || !UUID.test(input.taskId??'') || !Number.isSafeInteger(input.taskRevision) || input.taskRevision<0) throw fail('INVALID_REQUEST');
    const {draft}=validateCalendarDraft(input.draft);
    // Scope and refresh checks precede operation creation. Tokens stay backend-only.
    const accessToken=await connection.accessToken(user,CALENDAR_SCOPE);
    const claim=await rpc(user,'claim',{...input,draft});
    if (claim.state==='succeeded') return claim;
    if (claim.state!=='claimed') throw fail('CALENDAR_BUSY');
    const {event}=validateCalendarDraft(claim.draft);
    const context={taskId:input.taskId,lease:claim.lease};
    const endpoint=`https://www.googleapis.com/calendar/v3/calendars/primary/events/${claim.eventId}`;
    const request=(url,options={})=>fetchImpl(url,{...options,redirect:'error',signal:AbortSignal.timeout(15000),
      headers:{Authorization:`Bearer ${accessToken}`,'Content-Type':'application/json'}});
    const verify = async response => {
      const doc=await response.json();
      if (doc.id!==claim.eventId || doc.status==='cancelled' || doc.extendedProperties?.private?.inboxToTaskOperation!==claim.eventId || !validLink(doc.htmlLink)) throw fail('CALENDAR_UNRESOLVED');
      return doc.htmlLink;
    };
    let state='unknown';
    try {
      // Always reconcile the deterministic ID first, including after a lost
      // insert response or a database receipt failure.
      const existing=await request(endpoint);
      let eventUrl;
      if (existing.ok) eventUrl=await verify(existing);
      else if (existing.status===404) {
        await rpc(user,'assert',context);
        const response=await request('https://www.googleapis.com/calendar/v3/calendars/primary/events',{
          method:'POST',body:JSON.stringify({...event,id:claim.eventId,extendedProperties:{private:{inboxToTaskOperation:claim.eventId}}})});
        if (response.ok) eventUrl=await verify(response);
        else if (response.status===409) {
          const found=await request(endpoint);
          if (!found.ok) throw fail('CALENDAR_UNRESOLVED');
          eventUrl=await verify(found);
        } else {
          // A definitive rejection permits correction; transport/5xx outcomes
          // remain unknown and keep the original approved payload immutable.
          if ([400,401,403,429].includes(response.status)) state='failed';
          throw fail([401,403].includes(response.status)?'CALENDAR_AUTH_OR_PERMISSION':response.status===429?'CALENDAR_RATE_LIMITED':'CALENDAR_PROVIDER_UNAVAILABLE');
        }
      } else {
        if ([401,403,429].includes(existing.status)) state='unknown';
        throw fail([401,403].includes(existing.status)?'CALENDAR_AUTH_OR_PERMISSION':'CALENDAR_PROVIDER_UNAVAILABLE');
      }
      return await rpc(user,'finish',{...context,state:'succeeded',eventUrl});
    } catch(error) {
      try { await rpc(user,'finish',{...context,state}); } catch { /* retry reconciles provider ID; never report success */ }
      throw fail(['CALENDAR_AUTH_OR_PERMISSION','CALENDAR_RATE_LIMITED','STALE_CALENDAR_TASK','CALENDAR_UNRESOLVED'].includes(error.code)?error.code:'CALENDAR_PROVIDER_UNAVAILABLE');
    }
  };
}

export function createCalendarHandler({verifyUser,writer,allowedOrigins=/** @type {string[]} */ ([]),enabled=false}) {
  return async request => {
    const headers={'Content-Type':'application/json','Cache-Control':'no-store',Vary:'Origin'};
    const json=(status,body)=>new Response(JSON.stringify(body),{status,headers});
    const origin=request.headers.get('origin');
    if (origin && !allowedOrigins.includes(origin)) return json(403,{error:'ORIGIN_NOT_ALLOWED'});
    if (origin) headers['Access-Control-Allow-Origin']=origin;
    if (request.method==='OPTIONS') return new Response(null,{status:204,headers:{...headers,'Access-Control-Allow-Methods':'POST, OPTIONS','Access-Control-Allow-Headers':'authorization, apikey, content-type, x-client-info'}});
    if (request.method!=='POST') return json(405,{error:'METHOD_NOT_ALLOWED'});
    const bearer=/^Bearer ([^\s]+)$/i.exec(request.headers.get('authorization')??'');
    if (!bearer) return json(401,{error:'AUTH_REQUIRED'});
    let user;
    try { user=await verifyUser(bearer[1]); } catch { return json(503,{error:'AUTH_UNAVAILABLE'}); }
    if (!user) return json(401,{error:'AUTH_REQUIRED'});
    if (!enabled || !writer) return json(503,{error:'CALENDAR_DISABLED'});
    let input;
    try {
      if (request.headers.get('content-type')?.split(';')[0].trim()!=='application/json') return json(415,{error:'JSON_REQUIRED'});
      const reader=request.body?.getReader(); if (!reader) throw fail('INVALID_REQUEST');
      const chunks=[]; let length=0;
      try { while(true) { const {value,done}=await reader.read(); if(done)break; length+=value.length; if(length>6000){await reader.cancel();throw fail('INVALID_REQUEST');} chunks.push(...value); } }
      finally { reader.releaseLock(); }
      input=JSON.parse(new TextDecoder().decode(new Uint8Array(chunks)));
    } catch { return json(400,{error:'INVALID_REQUEST'}); }
    try { return json(200,await writer(user.id,input)); }
    catch(error) {
      const known=['INVALID_REQUEST','INVALID_CALENDAR_DRAFT','GOOGLE_CALENDAR_SCOPE_REQUIRED','GOOGLE_RECONNECT_REQUIRED','GOOGLE_CONNECTION_BUSY','CALENDAR_BUSY','STALE_CALENDAR_TASK','TASK_NOT_FOUND','CALENDAR_RETRY_ORIGINAL','STALE_CALENDAR_OPERATION','CALENDAR_AUTH_OR_PERMISSION','CALENDAR_RATE_LIMITED','CALENDAR_UNRESOLVED','CALENDAR_PROVIDER_UNAVAILABLE'];
      const code=known.includes(error.code)?error.code:'CALENDAR_UNAVAILABLE';
      return json(code.startsWith('INVALID')?400:code==='TASK_NOT_FOUND'?403:['CALENDAR_BUSY','STALE_CALENDAR_TASK','CALENDAR_RETRY_ORIGINAL'].includes(code)?409:503,{error:code});
    }
  };
}
