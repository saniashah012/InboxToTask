import {validateCalendarDraft} from './calendar-draft.mjs';
import {CALENDAR_SCOPE} from './google-connection.mjs';
const fail = code => Object.assign(new Error(code),{code});
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EVENTS='https://www.googleapis.com/calendar/v3/calendars/primary/events';
const validLink = value => {
  try { const u=new URL(value); return u.protocol==='https:' && ['www.google.com','google.com'].includes(u.hostname) && u.pathname.startsWith('/calendar/') && !u.username && !u.password && !u.port && value.length<=2048; } catch { return false; }
};
// The event version (Google's etag) travels in an If-Match header, so it must
// be one printable line.
const validVersion = value => typeof value==='string' && /^[\x21-\x7e]{1,300}$/.test(value);
const ACTIONS={create:['taskId','taskRevision','draft'],read:['taskId'],update:['taskId','draft','version'],remove:['taskId']};

// A Google event as the form's draft. All-day events use Google's dates; timed
// ones are shown as wall-clock time in the event's zone, else the saved zone.
export function draftFromEvent(doc, saved={}) {
  const unresolved=()=>{ throw fail('CALENDAR_UNRESOLVED'); };
  const title=(typeof doc?.summary==='string' ? doc.summary.replace(/[\x00-\x1f\x7f]/g,' ').trim().slice(0,350) : '') || '(No title)';
  const zone=[doc?.start?.timeZone,saved?.timeZone,'America/Chicago'].find(z=>typeof z==='string' && z.length<=100 && z);
  let formatter;
  try { formatter=new Intl.DateTimeFormat('en-CA',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}); }
  catch { unresolved(); }
  if (typeof doc?.start?.date==='string') {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(doc.start.date)) unresolved();
    return {title,date:doc.start.date,allDay:true,timeZone:zone};
  }
  const wall = value => {
    const instant=Date.parse(typeof value==='string' ? value : '');
    if (!Number.isFinite(instant)) unresolved();
    const p=Object.fromEntries(formatter.formatToParts(new Date(instant)).map(part=>[part.type,part.value]));
    return {date:`${p.year}-${p.month}-${p.day}`,time:`${p.hour}:${p.minute}`};
  };
  const start=wall(doc?.start?.dateTime),end=wall(doc?.end?.dateTime);
  return {title,date:start.date,allDay:false,startTime:start.time,endDate:end.date,endTime:end.time,timeZone:zone};
}

// Explicit nulls clear the other form when an event changes between all-day and timed.
const patchTime = time => time.date ? {date:time.date,dateTime:null,timeZone:null} : {date:null,dateTime:time.dateTime,timeZone:time.timeZone};

export function createCalendarRpc({url,serviceKey,fetchImpl=fetch}) {
  return async(user,action,data) => {
    const response=await fetchImpl(`${url.replace(/\/$/,'')}/rest/v1/rpc/calendar_event_service`,{
      method:'POST',redirect:'error',signal:AbortSignal.timeout(10000),
      headers:{apikey:serviceKey,Authorization:`Bearer ${serviceKey}`,'Content-Type':'application/json'},
      body:JSON.stringify({p_user:user,p_action:action,p_data:data})});
    if (!response.ok) {
      let doc; try { doc=await response.json(); } catch { /* fixed codes only */ }
      const known=['GOOGLE_CALENDAR_SCOPE_REQUIRED','TASK_NOT_FOUND','CALENDAR_BUSY','STALE_CALENDAR_TASK','CALENDAR_RETRY_ORIGINAL','STALE_CALENDAR_OPERATION','CALENDAR_NOT_ADDED'];
      throw fail(known.includes(doc?.message)?doc.message:'CALENDAR_STORAGE_UNAVAILABLE');
    }
    return response.json();
  };
}

export function createCalendarWriter({rpc,connection,fetchImpl=fetch}) {
  const providerCode = status => [401,403].includes(status)?'CALENDAR_AUTH_OR_PERMISSION':status===429?'CALENDAR_RATE_LIMITED':'CALENDAR_PROVIDER_UNAVAILABLE';
  const owned = (doc,eventId) => doc?.id===eventId && doc?.extendedProperties?.private?.inboxToTaskOperation===eventId;

  async function create(user,input,request) {
    const {draft}=validateCalendarDraft(input.draft);
    const claim=await rpc(user,'claim',{taskId:input.taskId,taskRevision:input.taskRevision,draft});
    if (claim.state==='succeeded') return claim;
    if (claim.state!=='claimed') throw fail('CALENDAR_BUSY');
    const {event}=validateCalendarDraft(claim.draft);
    const context={taskId:input.taskId,lease:claim.lease};
    const endpoint=`${EVENTS}/${claim.eventId}`;
    const verify = async response => {
      const doc=await response.json();
      if (!owned(doc,claim.eventId) || doc.status==='cancelled' || !validLink(doc.htmlLink)) throw fail('CALENDAR_UNRESOLVED');
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
        const response=await request(EVENTS,{
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
          throw fail(providerCode(response.status));
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
  }

  // Reads the saved event from Google, so the form shows what is there now.
  async function read(user,input,request) {
    const stored=await rpc(user,'read',{taskId:input.taskId});
    if (stored.state==='none') throw fail('CALENDAR_NOT_ADDED');
    // An unsettled create, update or removal is reported as stored; its own retry settles it.
    if (stored.state!=='succeeded') return {state:stored.state,draft:stored.draft,...(stored.eventUrl?{eventUrl:stored.eventUrl}:{})};
    const gone = async() => {
      const result=await rpc(user,'gone',{taskId:input.taskId});
      return result.state==='removed' ? {state:'removed',reason:'deleted_in_google'} : {state:result.state};
    };
    let response;
    try { response=await request(`${EVENTS}/${stored.eventId}`); } catch { throw fail('CALENDAR_PROVIDER_UNAVAILABLE'); }
    if ([404,410].includes(response.status)) return gone();
    if (!response.ok) throw fail(providerCode(response.status));
    let doc; try { doc=await response.json(); } catch { throw fail('CALENDAR_PROVIDER_UNAVAILABLE'); }
    // The ID is the app's own random one, so a cancelled event under it is the deleted event.
    if (doc?.id===stored.eventId && doc.status==='cancelled') return gone();
    if (!owned(doc,stored.eventId) || !validLink(doc.htmlLink) || !validVersion(doc.etag)) throw fail('CALENDAR_UNRESOLVED');
    const draft=draftFromEvent(doc,stored.draft);
    // The task card's summary follows Google. A failed save here does not hide the details just read.
    try { await rpc(user,'sync',{taskId:input.taskId,draft,eventUrl:doc.htmlLink}); } catch { /* next read saves it */ }
    return {state:'succeeded',eventUrl:doc.htmlLink,draft,version:doc.etag};
  }

  // Changes the saved event in place. Google refuses the write if the event
  // changed after `version` was read, so a change made in Google is never overwritten.
  async function update(user,input,request) {
    const {draft}=validateCalendarDraft(input.draft);
    const claim=await rpc(user,'update_claim',{taskId:input.taskId,draft});
    if (claim.state!=='claimed') throw fail('CALENDAR_BUSY');
    const {event}=validateCalendarDraft(claim.draft);
    const context={taskId:input.taskId,lease:claim.lease};
    const endpoint=`${EVENTS}/${claim.eventId}`;
    // Until this attempt writes, nothing changed in Google, unless an earlier lost attempt may have.
    const untouched=claim.retry?'unknown':'failed';
    let state=untouched,deleted=false;
    try {
      const existing=await request(endpoint);
      if ([404,410].includes(existing.status)) { deleted=true; throw fail('CALENDAR_NOT_ADDED'); }
      if (!existing.ok) throw fail(providerCode(existing.status));
      let doc=await existing.json();
      if (doc?.id===claim.eventId && doc.status==='cancelled') { deleted=true; throw fail('CALENDAR_NOT_ADDED'); }
      if (!owned(doc,claim.eventId)) throw fail('CALENDAR_UNRESOLVED');
      // The marker shows that an earlier attempt whose answer was lost did land; do not write twice.
      if (doc.extendedProperties.private.inboxToTaskUpdate!==claim.updateToken) {
        // No marker: no earlier attempt landed, so a refusal before the write leaves Google untouched.
        state='failed';
        await rpc(user,'assert',context);
        state='unknown';
        const response=await request(`${endpoint}?sendUpdates=none`,{method:'PATCH',headers:{'If-Match':input.version},
          body:JSON.stringify({summary:event.summary,start:patchTime(event.start),end:patchTime(event.end),
            extendedProperties:{private:{inboxToTaskOperation:claim.eventId,inboxToTaskUpdate:claim.updateToken}}})});
        if (response.status===412) { state='changed'; throw fail('CALENDAR_EVENT_CHANGED'); }
        if ([404,410].includes(response.status)) { deleted=true; throw fail('CALENDAR_NOT_ADDED'); }
        if ([400,401,403,429].includes(response.status)) { state='failed'; throw fail(providerCode(response.status)); }
        if (!response.ok) throw fail('CALENDAR_PROVIDER_UNAVAILABLE');
        doc=await response.json();
      }
      state='unknown';
      if (!validLink(doc.htmlLink) || !validVersion(doc.etag)) throw fail('CALENDAR_UNRESOLVED');
      await rpc(user,'update_finish',{...context,state:'succeeded',eventUrl:doc.htmlLink});
      return {state:'succeeded',eventUrl:doc.htmlLink,draft:claim.draft,version:doc.etag};
    } catch(error) {
      if (deleted) {
        // Deleted in Google meanwhile: forget it, so the task can be added again.
        try { await rpc(user,'update_finish',{...context,state:'removed'}); return {state:'removed',reason:'deleted_in_google'}; }
        catch { throw fail('CALENDAR_PROVIDER_UNAVAILABLE'); }
      }
      try { await rpc(user,'update_finish',{...context,state}); } catch { /* a retry of the same values settles it */ }
      throw fail(['CALENDAR_EVENT_CHANGED','CALENDAR_AUTH_OR_PERMISSION','CALENDAR_RATE_LIMITED','STALE_CALENDAR_TASK','CALENDAR_UNRESOLVED'].includes(error.code)?error.code:'CALENDAR_PROVIDER_UNAVAILABLE');
    }
  }

  // Deletes the app's event from Google. An event that is already gone counts as removed.
  async function remove(user,input,request) {
    const claim=await rpc(user,'remove_claim',{taskId:input.taskId});
    if (claim.state!=='claimed') throw fail('CALENDAR_BUSY');
    const context={taskId:input.taskId,lease:claim.lease};
    let state='unknown',code='CALENDAR_PROVIDER_UNAVAILABLE';
    try {
      // sendUpdates=none: removing never emails anyone.
      const response=await request(`${EVENTS}/${claim.eventId}?sendUpdates=none`,{method:'DELETE'});
      if (response.ok || [404,410].includes(response.status)) state='removed';
      else if ([400,401,403,429].includes(response.status)) { state='refused'; code=providerCode(response.status); }
    } catch { /* lost answer: stays "removing"; removing again is safe */ }
    if (state==='removed') { await rpc(user,'remove_finish',{...context,state}); return {state:'removed'}; }
    try { await rpc(user,'remove_finish',{...context,state}); } catch { /* the lease expires; Remove can be retried */ }
    throw fail(code);
  }

  return async(user,input) => {
    if (!input || typeof input!=='object' || Array.isArray(input)) throw fail('INVALID_REQUEST');
    const action=input.action===undefined?'create':input.action;
    const allowed=Object.hasOwn(ACTIONS,action)?ACTIONS[action]:null;
    if (!allowed || Object.keys(input).some(k=>k!=='action' && !allowed.includes(k)) || !UUID.test(input.taskId??'')) throw fail('INVALID_REQUEST');
    if (action==='create' && (!Number.isSafeInteger(input.taskRevision) || input.taskRevision<0)) throw fail('INVALID_REQUEST');
    if (action==='update' && !validVersion(input.version)) throw fail('INVALID_REQUEST');
    if (action==='create' || action==='update') validateCalendarDraft(input.draft);
    // Scope and refresh checks precede operation creation. Tokens stay backend-only.
    const accessToken=await connection.accessToken(user,CALENDAR_SCOPE);
    const request=(url,options={})=>fetchImpl(url,{...options,redirect:'error',signal:AbortSignal.timeout(15000),
      headers:{Authorization:`Bearer ${accessToken}`,'Content-Type':'application/json',...(options.headers??{})}});
    return {create,read,update,remove}[action](user,input,request);
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
      const known=['INVALID_REQUEST','INVALID_CALENDAR_DRAFT','GOOGLE_CALENDAR_SCOPE_REQUIRED','GOOGLE_RECONNECT_REQUIRED','GOOGLE_CONNECTION_BUSY','CALENDAR_BUSY','STALE_CALENDAR_TASK','TASK_NOT_FOUND','CALENDAR_RETRY_ORIGINAL','STALE_CALENDAR_OPERATION','CALENDAR_NOT_ADDED','CALENDAR_EVENT_CHANGED','CALENDAR_AUTH_OR_PERMISSION','CALENDAR_RATE_LIMITED','CALENDAR_UNRESOLVED','CALENDAR_PROVIDER_UNAVAILABLE'];
      const code=known.includes(error.code)?error.code:'CALENDAR_UNAVAILABLE';
      return json(code.startsWith('INVALID')?400:code==='TASK_NOT_FOUND'?403:['CALENDAR_BUSY','STALE_CALENDAR_TASK','CALENDAR_RETRY_ORIGINAL','CALENDAR_NOT_ADDED','CALENDAR_EVENT_CHANGED'].includes(code)?409:503,{error:code});
    }
  };
}
