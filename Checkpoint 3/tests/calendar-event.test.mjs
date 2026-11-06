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
