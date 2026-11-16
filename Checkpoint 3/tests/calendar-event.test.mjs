import test from 'node:test';
import assert from 'node:assert/strict';
import {validateCalendarDraft} from '../app/supabase/functions/_shared/calendar-draft.mjs';
import {createCalendarWriter,createCalendarHandler} from '../app/supabase/functions/_shared/calendar-event.mjs';
const draft={title:'Submit report',date:'2026-11-09',allDay:true,timeZone:'America/Chicago'};
const taskId='11111111-1111-4111-8111-111111111111',user='22222222-2222-4222-8222-222222222222';
const eventId='ittaabbcc001122',eventUrl='https://www.google.com/calendar/event?eid=fictional';
const event={id:eventId,htmlLink:eventUrl,extendedProperties:{private:{inboxToTaskOperation:eventId}}};
test('Calendar validates real dates, explicit duration, IANA zones and DST boundaries',()=>{
 assert.deepEqual(validateCalendarDraft(draft).event,{summary:'Submit report',start:{date:'2026-11-09'},end:{date:'2026-11-10'}});
 const timed={...draft,allDay:false,startTime:'09:00',endDate:draft.date,endTime:'10:00'};
 assert.equal(validateCalendarDraft(timed).event.start.dateTime,'2026-11-09T15:00:00.000Z');
 for(const value of [{...draft,date:''},{...draft,date:'2026-02-30'},{...draft,timeZone:'wrong/zone'},{...draft,title:' '},{...draft,calendarId:'other'},
  {...timed,endTime:''},{...timed,endTime:'08:00'},{...timed,date:'2026-03-08',startTime:'02:30'},
  {...timed,date:'2026-11-01',startTime:'01:30'}]) assert.throws(()=>validateCalendarDraft(value));
});
function trial(responses) {
 const calls=[],rpcCalls=[];
 const writer=createCalendarWriter({connection:{async accessToken(id,scope){assert.equal(id,user);assert.match(scope,/calendar.events.owned$/);return 'backend-token';}},
  rpc:async(id,action,data)=>{assert.equal(id,user);rpcCalls.push({action,data});return action==='claim'?{state:'claimed',lease:'lease',eventId,draft}:action==='finish'?{state:data.state,eventUrl:data.eventUrl}:{state:'ready'};},
  fetchImpl:async(url,options)=>{calls.push({url,options});const next=responses.shift();if(next instanceof Error)throw next;return new Response(JSON.stringify(next?.body??{}),{status:next?.status??200});}});
 return {writer,calls,rpcCalls};
}
const input={taskId,taskRevision:0,draft};
test('Calendar inserts into primary only and persists provider receipt',async()=>{
 const t=trial([{status:404},{body:event}]);
 assert.equal((await t.writer(user,input)).eventUrl,eventUrl);
 assert.equal(t.calls.length,2);assert.match(t.calls[1].url,/calendars\/primary\/events$/);
 const body=JSON.parse(t.calls[1].options.body);assert.equal(body.id,eventId);assert.equal(body.attendees,undefined);
 assert.deepEqual(t.rpcCalls.map(x=>x.action),['claim','assert','finish']);
});
test('lost insert response records unknown; retry finds original event without another insert',async()=>{
 const first=trial([{status:404},new Error('private provider diagnostic')]);
 await assert.rejects(first.writer(user,input),{code:'CALENDAR_PROVIDER_UNAVAILABLE'});
 assert.equal(first.rpcCalls.at(-1).data.state,'unknown');
 const retry=trial([{body:event}]);assert.equal((await retry.writer(user,input)).state,'succeeded');assert.equal(retry.calls.length,1);
});
test('duplicate provider ID is reconciled; foreign or cancelled events never report success',async()=>{
 const t=trial([{status:404},{status:409},{body:event}]);assert.equal((await t.writer(user,input)).state,'succeeded');
 for(const body of [{...event,status:'cancelled'},{...event,extendedProperties:{}},{...event,htmlLink:'https://evil.example/'}]){
  const t=trial([{body}]);await assert.rejects(t.writer(user,input),{code:'CALENDAR_UNRESOLVED'});assert.equal(t.rpcCalls.at(-1).data.state,'unknown');
 }
});
test('definitive rejection permits correction, while stale tasks never insert',async()=>{
 const t=trial([{status:404},{status:400}]);await assert.rejects(t.writer(user,input));assert.equal(t.rpcCalls.at(-1).data.state,'failed');
 let inserts=0;
 const writer=createCalendarWriter({connection:{accessToken:async()=>''},rpc:async(_,action)=>{if(action==='claim')return {state:'claimed',eventId,draft};throw Object.assign(new Error(),{code:'STALE_CALENDAR_TASK'});},
  fetchImpl:async(_,options)=>{if(options.method==='POST')inserts++;return new Response('{}',{status:404});}});
 await assert.rejects(writer(user,input),{code:'STALE_CALENDAR_TASK'});assert.equal(inserts,0);
});
test('handler verifies identity, rejects caller ownership and bounds body before writer',async()=>{
 let calls=0;const handler=createCalendarHandler({enabled:true,allowedOrigins:['http://localhost:5173'],verifyUser:async token=>token==='valid'?{id:user}:null,
  writer:async(id,doc)=>{calls++;assert.equal(id,user);assert.equal(doc.taskId,taskId);return {state:'succeeded',eventUrl};}});
 const request=(body,token='valid',origin='http://localhost:5173')=>new Request('http://backend/calendar_event',{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json',Origin:origin},body:JSON.stringify(body)});
 assert.equal((await handler(request(input,'invalid'))).status,401);
 assert.equal((await handler(request(input,'valid','https://other.example'))).status,403);
 assert.equal((await handler(request({padding:'x'.repeat(7000)}))).status,400);
 assert.equal((await handler(request(input))).status,200);assert.equal(calls,1);
 const t=trial([]);await assert.rejects(t.writer(user,{...input,userId:user}),{code:'INVALID_REQUEST'});assert.equal(t.calls.length,0);
});

// Read, update and remove act on the event the app already created.
const timed={title:'Project sync',date:'2026-12-01',allDay:false,startTime:'15:00',endDate:'2026-12-01',endTime:'15:30',timeZone:'America/Chicago'};
const stored={state:'succeeded',eventId,eventUrl,draft};
function ops(responses,rpcImpl) {
 const calls=[],rpcCalls=[];
 const writer=createCalendarWriter({connection:{async accessToken(id,scope){assert.equal(id,user);assert.match(scope,/calendar.events.owned$/);return 'backend-token';}},
  rpc:async(id,action,data)=>{assert.equal(id,user);rpcCalls.push({action,data});return rpcImpl(action,data);},
  fetchImpl:async(url,options)=>{calls.push({url,options});const next=responses.shift();if(next instanceof Error)throw next;
   const status=next?.status??200;return new Response(status===204?null:JSON.stringify(next?.body??{}),{status});}});
 return {writer,calls,rpcCalls,actions:()=>rpcCalls.map(x=>x.action)};
}
const removal=(action,data)=>action==='remove_claim'?{state:'claimed',lease:'lease',eventId}:{state:data.state};
test('remove deletes the app event without notifications; an event already gone counts as removed',async()=>{
 for(const status of [204,404,410]){
  const t=ops([{status}],removal);
  assert.deepEqual(await t.writer(user,{action:'remove',taskId}),{state:'removed'});
  assert.equal(t.calls.length,1);assert.equal(t.calls[0].options.method,'DELETE');
  assert.equal(t.calls[0].url,`https://www.googleapis.com/calendar/v3/calendars/primary/events/${eventId}?sendUpdates=none`);
  assert.deepEqual(t.actions(),['remove_claim','remove_finish']);assert.equal(t.rpcCalls[1].data.state,'removed');assert.equal(t.rpcCalls[1].data.lease,'lease');
 }
});
test('a lost removal stays retryable, a refusal restores the event, and nothing is removed without a record',async()=>{
 for(const response of [new Error('private provider diagnostic'),{status:500}]){
  const t=ops([response],removal);
  await assert.rejects(t.writer(user,{action:'remove',taskId}),{code:'CALENDAR_PROVIDER_UNAVAILABLE'});
  assert.equal(t.rpcCalls.at(-1).data.state,'unknown');
 }
 for(const [status,code] of [[403,'CALENDAR_AUTH_OR_PERMISSION'],[429,'CALENDAR_RATE_LIMITED']]){
  const t=ops([{status}],removal);
  await assert.rejects(t.writer(user,{action:'remove',taskId}),{code});
  assert.equal(t.rpcCalls.at(-1).data.state,'refused');
 }
 const none=ops([],()=>{throw Object.assign(new Error(),{code:'CALENDAR_NOT_ADDED'});});
 await assert.rejects(none.writer(user,{action:'remove',taskId}),{code:'CALENDAR_NOT_ADDED'});assert.equal(none.calls.length,0);
});
const reading=(action)=>action==='read'?stored:action==='gone'?{state:'removed'}:{state:'succeeded'};
test('read returns the event as Google has it now and saves it for the task card',async()=>{
 const body={...event,etag:'"v7"',summary:'Project sync',start:{dateTime:'2026-12-01T15:00:00-06:00',timeZone:'America/Chicago'},end:{dateTime:'2026-12-01T21:30:00Z',timeZone:'America/Chicago'}};
 const t=ops([{body}],reading);
 assert.deepEqual(await t.writer(user,{action:'read',taskId}),{state:'succeeded',eventUrl,draft:timed,version:'"v7"'});
 assert.equal(t.calls[0].options.method,undefined);assert.match(t.calls[0].url,new RegExp(`/primary/events/${eventId}$`));
 assert.deepEqual(t.actions(),['read','sync']);assert.deepEqual(t.rpcCalls[1].data,{taskId,draft:timed,eventUrl});
 // An all-day event keeps the saved time zone; a missing title is shown as Google shows it.
 const day=ops([{body:{...event,etag:'"v8"',start:{date:'2026-11-12'},end:{date:'2026-11-13'}}}],reading);
 assert.deepEqual((await day.writer(user,{action:'read',taskId})).draft,{title:'(No title)',date:'2026-11-12',allDay:true,timeZone:'America/Chicago'});
 // Failing to save the summary does not hide what was just read.
 const unsaved=ops([{body}],(action)=>{if(action==='sync')throw new Error('storage');return stored;});
 assert.equal((await unsaved.writer(user,{action:'read',taskId})).version,'"v7"');
});
test('read reports an event deleted in Google, and never trusts a foreign or unsettled one',async()=>{
 for(const response of [{status:404},{status:410},{body:{id:eventId,status:'cancelled'}}]){
  const t=ops([response],reading);
  assert.deepEqual(await t.writer(user,{action:'read',taskId}),{state:'removed',reason:'deleted_in_google'});
  assert.deepEqual(t.actions(),['read','gone']);
 }
 for(const body of [{...event,etag:'"v1"',extendedProperties:{},start:{date:'2026-11-12'}},{...event,id:'other',etag:'"v1"',start:{date:'2026-11-12'}},
  {...event,etag:'"v1"',htmlLink:'https://evil.example/',start:{date:'2026-11-12'}},{...event,start:{date:'2026-11-12'}},{...event,etag:'"v1"',start:{dateTime:'not a time'}}]){
  const t=ops([{body}],reading);
  await assert.rejects(t.writer(user,{action:'read',taskId}),{code:'CALENDAR_UNRESOLVED'});assert.deepEqual(t.actions(),['read']);
 }
 for(const [status,code] of [[403,'CALENDAR_AUTH_OR_PERMISSION'],[429,'CALENDAR_RATE_LIMITED'],[500,'CALENDAR_PROVIDER_UNAVAILABLE']]){
  await assert.rejects(ops([{status}],reading).writer(user,{action:'read',taskId}),{code});
 }
 // An unsettled removal or update is reported as stored, without asking Google.
 const pending=ops([],()=>({state:'removing',eventId,eventUrl,draft}));
 assert.deepEqual(await pending.writer(user,{action:'read',taskId}),{state:'removing',draft,eventUrl});assert.equal(pending.calls.length,0);
 await assert.rejects(ops([],()=>({state:'none'})).writer(user,{action:'read',taskId}),{code:'CALENDAR_NOT_ADDED'});
});
const marked={...event,etag:'"v2"',extendedProperties:{private:{inboxToTaskOperation:eventId,inboxToTaskUpdate:'marker'}}};
const updating=(retry=false)=>(action,data)=>action==='update_claim'?{state:'claimed',lease:'lease',eventId,draft:data.draft,updateToken:'marker',retry}
 :action==='assert'?{state:'ready'}:{state:data.state};
const change={action:'update',taskId,draft:timed,version:'"v1"'};
test('update changes the same event only if it is unchanged since it was read',async()=>{
 const t=ops([{body:{...event,etag:'"v1"'}},{body:marked}],updating());
 assert.deepEqual(await t.writer(user,change),{state:'succeeded',eventUrl,draft:timed,version:'"v2"'});
 assert.equal(t.calls.length,2);const patch=t.calls[1];
 assert.equal(patch.options.method,'PATCH');assert.equal(patch.options.headers['If-Match'],'"v1"');
 assert.equal(patch.url,`https://www.googleapis.com/calendar/v3/calendars/primary/events/${eventId}?sendUpdates=none`);
 const body=JSON.parse(patch.options.body);
 assert.deepEqual(body,{summary:'Project sync',start:{date:null,dateTime:'2026-12-01T21:00:00.000Z',timeZone:'America/Chicago'},end:{date:null,dateTime:'2026-12-01T21:30:00.000Z',timeZone:'America/Chicago'},
  extendedProperties:{private:{inboxToTaskOperation:eventId,inboxToTaskUpdate:'marker'}}});
 assert.deepEqual(t.actions(),['update_claim','assert','update_finish']);
 assert.deepEqual(t.rpcCalls.at(-1).data,{taskId,lease:'lease',state:'succeeded',eventUrl});
 // Changing a timed event to all-day clears its times.
 const day=ops([{body:{...event,etag:'"v1"'}},{body:marked}],updating());
 await day.writer(user,{...change,draft});
 assert.deepEqual(JSON.parse(day.calls[1].options.body).start,{date:'2026-11-09',dateTime:null,timeZone:null});
 // Google refuses a write to an event that changed after it was read.
 const stale=ops([{body:{...event,etag:'"v3"'}},{status:412}],updating());
 await assert.rejects(stale.writer(user,change),{code:'CALENDAR_EVENT_CHANGED'});assert.equal(stale.rpcCalls.at(-1).data.state,'changed');
});
test('a lost update is settled by retrying the same values, without writing twice',async()=>{
 const first=ops([{body:{...event,etag:'"v1"'}},new Error('private provider diagnostic')],updating());
 await assert.rejects(first.writer(user,change),{code:'CALENDAR_PROVIDER_UNAVAILABLE'});assert.equal(first.rpcCalls.at(-1).data.state,'unknown');
 // The earlier write landed: its marker is on the event, so the retry only records it.
 const landed=ops([{body:marked}],updating(true));
 assert.equal((await landed.writer(user,change)).version,'"v2"');assert.equal(landed.calls.length,1);
 assert.deepEqual(landed.actions(),['update_claim','update_finish']);
 // It did not land: the retry writes, still guarded by the version that was read.
 const missed=ops([{body:{...event,etag:'"v1"'}},{body:marked}],updating(true));
 assert.equal((await missed.writer(user,change)).state,'succeeded');assert.equal(missed.calls[1].options.headers['If-Match'],'"v1"');
 // While an earlier attempt is in doubt, a failed look at Google settles nothing.
 const doubt=ops([{status:403}],updating(true));
 await assert.rejects(doubt.writer(user,change),{code:'CALENDAR_AUTH_OR_PERMISSION'});assert.equal(doubt.rpcCalls.at(-1).data.state,'unknown');
});
test('update never writes for a deleted event, a closed task, a refusal or a foreign event',async()=>{
 for(const responses of [[{status:404}],[{body:{id:eventId,status:'cancelled'}}],[{body:{...event,etag:'"v1"'}},{status:410}]]){
  const t=ops(responses,updating());
  assert.deepEqual(await t.writer(user,change),{state:'removed',reason:'deleted_in_google'});assert.equal(t.rpcCalls.at(-1).data.state,'removed');
 }
 const closed=ops([],()=>{throw Object.assign(new Error(),{code:'STALE_CALENDAR_TASK'});});
 await assert.rejects(closed.writer(user,change),{code:'STALE_CALENDAR_TASK'});assert.equal(closed.calls.length,0);
 // The task changed between the claim and the write: nothing is sent and the saved event stands.
 const moved=ops([{body:{...event,etag:'"v1"'}}],(action,data)=>{if(action==='assert')throw Object.assign(new Error(),{code:'STALE_CALENDAR_TASK'});return updating()(action,data);});
 await assert.rejects(moved.writer(user,change),{code:'STALE_CALENDAR_TASK'});assert.equal(moved.calls.length,1);assert.equal(moved.rpcCalls.at(-1).data.state,'failed');
 for(const [status,code] of [[400,'CALENDAR_PROVIDER_UNAVAILABLE'],[403,'CALENDAR_AUTH_OR_PERMISSION'],[429,'CALENDAR_RATE_LIMITED']]){
  const t=ops([{body:{...event,etag:'"v1"'}},{status}],updating());
  await assert.rejects(t.writer(user,change),{code});assert.equal(t.rpcCalls.at(-1).data.state,'failed');
 }
 const foreign=ops([{body:{...event,etag:'"v1"',extendedProperties:{}}}],updating());
 await assert.rejects(foreign.writer(user,change),{code:'CALENDAR_UNRESOLVED'});assert.equal(foreign.calls.length,1);assert.equal(foreign.rpcCalls.at(-1).data.state,'failed');
});
test('actions accept only their own fields, and new conflicts answer 409',async()=>{
 for(const body of [{action:'delete',taskId},{action:'read',taskId,draft},{action:'remove',taskId,taskRevision:0},{action:'update',taskId,draft:timed},
  {action:'update',taskId,draft:timed,version:'"v1"\r\nX-Injected: 1'},{action:'update',taskId,draft:timed,version:''},{action:'update',taskId,draft:timed,version:'"v1"',taskRevision:0},
  {action:'create',taskId,taskRevision:0,draft,version:'"v1"'},{action:'read',taskId:'not-a-task'},{action:'toString',taskId}]){
  const t=ops([],()=>assert.fail('no storage call'));
  await assert.rejects(t.writer(user,body),{code:'INVALID_REQUEST'});assert.equal(t.calls.length,0);
 }
 await assert.rejects(ops([],()=>assert.fail('no storage call')).writer(user,{...change,draft:{...timed,endTime:'14:00'}}),{code:'INVALID_CALENDAR_DRAFT'});
 // "create" may be named, and stays the default.
 const named=trial([{status:404},{body:event}]);assert.equal((await named.writer(user,{action:'create',...input})).eventUrl,eventUrl);
 for(const code of ['CALENDAR_NOT_ADDED','CALENDAR_EVENT_CHANGED']){
  const handler=createCalendarHandler({enabled:true,verifyUser:async()=>({id:user}),writer:async()=>{throw Object.assign(new Error(),{code});}});
  const response=await handler(new Request('http://backend/calendar_event',{method:'POST',headers:{Authorization:'Bearer valid','Content-Type':'application/json'},body:JSON.stringify({action:'remove',taskId})}));
  assert.equal(response.status,409);assert.deepEqual(await response.json(),{error:code});
 }
});
