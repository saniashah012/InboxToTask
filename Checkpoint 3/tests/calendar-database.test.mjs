import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {PGlite} from '../app/node_modules/@electric-sql/pglite/dist/index.js';

test('Calendar SQL authorization, leases, duplicate protection, revisions and OAuth preservation',async t=>{
 const db=new PGlite(),A='11111111-1111-4111-8111-111111111111',B='22222222-2222-4222-8222-222222222222';
 const scopes=['https://www.googleapis.com/auth/gmail.readonly','https://www.googleapis.com/auth/calendar.events.owned'];
 const q=async(sql,args=[])=>(await db.query(sql,args)).rows;
 const call=async(name,args)=>(await q(`select public.${name}(${args.map((_,i)=>`$${i+1}`).join(',')}) result`,args))[0].result;
 const as=async(role,user,fn)=>{await db.exec(`set role ${role}`);await q("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({sub:user})]);try{return await fn();}finally{await db.exec('reset role');}};
 const rpc=(user,action,data)=>as('service_role',user,()=>call('calendar_event_service',[user,action,data]));
 const draft={title:'Report',date:'2026-11-10',allDay:true,timeZone:'America/Chicago'};
 let id,claim;
 const link='https://www.google.com/calendar/event?eid=fictional',link2='https://www.google.com/calendar/event?eid=fictional2';
 const moved={title:'Report',date:'2026-11-12',allDay:false,startTime:'15:00',endDate:'2026-11-12',endTime:'15:30',timeZone:'America/Chicago'};
 const status=()=>as('authenticated',A,()=>call('calendar_event_status',[id]));
 try {
  await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;grant usage on schema auth to anon,authenticated,service_role;
   create table auth.users(id uuid primary key,email text);create function auth.uid() returns uuid language sql stable as $$select (nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub')::uuid$$;`);
  await q('insert into auth.users values($1,$2),($3,$4)',[A,'a@example.org',B,'b@example.org']);
  const path=new URL('../app/supabase/migrations/',import.meta.url);
  for(const name of (await readdir(path)).filter(n=>n.endsWith('.sql')).sort())await db.exec(await readFile(new URL(name,path),'utf8'));
  await q("insert into private.google_connections(user_id,state,subject,email,scopes,credentials,expires_at) values($1,'connected','123','a@example.org',$2,'encrypted','2099-01-01')",[A,JSON.stringify(scopes)]);
  id=(await q("insert into public.tasks(user_id,title,status,accepted_fields) values($1,'Report','approved',$2) returning id",[A,JSON.stringify({action:'Report',requirements:[],condition:null,deadline:null})]))[0].id;
  await t.test('private state and execution RPC deny browser and anonymous access',async()=>{
   for(const role of ['anon','authenticated']){
    await as(role,A,()=>assert.rejects(q('select * from private.calendar_events'),{code:'42501'}));
    await as(role,A,()=>assert.rejects(call('calendar_event_service',[A,'claim',{}]),{code:'42501'}));
    await as(role,A,()=>assert.rejects(call('google_connection_service_base',[A,'disconnect',{}]),{code:'42501'}));
   }
   assert.deepEqual(await as('authenticated',B,()=>call('calendar_event_status',[id])),{});
   await assert.rejects(rpc(B,'claim',{taskId:id,taskRevision:0,draft}),/GOOGLE_CALENDAR_SCOPE_REQUIRED/);
  });
  await t.test('Gmail-only connection cannot create; task changes are fenced',async()=>{
   await q('update private.google_connections set scopes=$1',[JSON.stringify([scopes[0]])]);
   const denied=await call('google_connection_service',[A,'refresh_claim',{requiredScope:scopes[1]}]);assert.equal(denied.state,'scope_required');
   assert.equal((await q('select refresh_lease from private.google_connections where user_id=$1',[A]))[0].refresh_lease,null);
   await assert.rejects(rpc(A,'claim',{taskId:id,taskRevision:0,draft}),/GOOGLE_CALENDAR_SCOPE_REQUIRED/);
   await q('update private.google_connections set scopes=$1',[JSON.stringify(scopes)]);
   await assert.rejects(rpc(A,'claim',{taskId:id,taskRevision:1,draft}),/STALE_CALENDAR_TASK/);
  });
  await t.test('ownership and cancellation/deletion eligibility are enforced by SQL',async()=>{
   await q("insert into private.google_connections(user_id,state,subject,scopes) values($1,'connected','456',$2)",[B,JSON.stringify(scopes)]);
   await assert.rejects(rpc(B,'claim',{taskId:id,taskRevision:0,draft}),/TASK_NOT_FOUND/);
   const other=(await q("insert into public.tasks(user_id,title,status,accepted_fields,cancelled_at) values($1,'Cancelled','approved',$2,now()) returning id",[A,JSON.stringify({action:'Cancelled',requirements:[],condition:null,deadline:null})]))[0].id;
   await assert.rejects(rpc(A,'claim',{taskId:other,taskRevision:0,draft}),/STALE_CALENDAR_TASK/);
   await q('update public.tasks set cancelled_at=null,deleted_at=now() where id=$1',[other]);
   await assert.rejects(rpc(A,'claim',{taskId:other,taskRevision:0,draft}),/STALE_CALENDAR_TASK/);
  });
  await t.test('concurrent claims serialize; unknown outcomes require identical draft and stable ID',async()=>{
   claim=await rpc(A,'claim',{taskId:id,taskRevision:0,draft});assert.equal(claim.state,'claimed');
   assert.match(claim.eventId,/^[0-9a-v]+$/);
   await assert.rejects(rpc(A,'claim',{taskId:id,taskRevision:0,draft}),/CALENDAR_BUSY/);
   await assert.rejects(rpc(A,'finish',{taskId:id,lease:null,state:'succeeded'}),/STALE_CALENDAR_OPERATION/);
   await rpc(A,'finish',{taskId:id,lease:claim.lease,state:'unknown'});
   await assert.rejects(rpc(A,'claim',{taskId:id,taskRevision:0,draft:{...draft,title:'Changed'}}),/CALENDAR_RETRY_ORIGINAL/);
   const retry=await rpc(A,'claim',{taskId:id,taskRevision:0,draft});assert.equal(retry.eventId,claim.eventId);assert.notEqual(retry.lease,claim.lease);claim=retry;
   await rpc(A,'finish',{taskId:id,lease:claim.lease,state:'succeeded',eventUrl:'https://www.google.com/calendar/event?eid=fictional'});
   assert.equal((await rpc(A,'claim',{taskId:id,taskRevision:0,draft})).state,'succeeded');
   assert.equal((await q('select count(*) n from private.calendar_events'))[0].n,1);
  });
  await t.test('one status read lists only the caller\'s events, with or without Calendar permission or a connection',async()=>{
   const mine=await as('authenticated',A,()=>call('calendar_event_statuses',[]));
   assert.deepEqual(mine,[{taskId:id,state:'succeeded',eventUrl:link,draft}]);
   assert.deepEqual(await as('authenticated',B,()=>call('calendar_event_statuses',[])),[]);
   await as('anon',A,()=>assert.rejects(call('calendar_event_statuses',[]),{code:'42501'}));
   // Stored status stays readable after Calendar permission is lost.
   await q('update private.google_connections set scopes=$1 where user_id=$2',[JSON.stringify([scopes[0]]),A]);
   assert.equal((await as('authenticated',A,()=>call('calendar_event_statuses',[]))).length,1);
   for(const action of ['read','remove_claim','update_claim']) await assert.rejects(rpc(A,action,{taskId:id,draft}),/GOOGLE_CALENDAR_SCOPE_REQUIRED/);
   await q('update private.google_connections set scopes=$1 where user_id=$2',[JSON.stringify(scopes),A]);
   // It also stays after Google is disconnected, since the event is still in the calendar.
   await q("update private.google_connections set state='disconnected',subject=null,scopes='[]' where user_id=$1",[A]);
   assert.deepEqual(await as('authenticated',A,()=>call('calendar_event_statuses',[])),mine);
   assert.deepEqual(await status(),{state:'succeeded',eventUrl:link,draft});
   // Connecting a different Google account hides the earlier account's events.
   await q("update private.google_connections set state='connected',subject='999',scopes=$2 where user_id=$1",[A,JSON.stringify(scopes)]);
   assert.deepEqual(await as('authenticated',A,()=>call('calendar_event_statuses',[])),[]);
   assert.deepEqual(await status(),{});
   await q("update private.google_connections set subject='123' where user_id=$1",[A]);
   assert.deepEqual(await as('authenticated',A,()=>call('calendar_event_statuses',[])),mine);
  });
  await t.test('update keeps the saved event until Google confirms, and a lost update keeps its values',async()=>{
   const first=await rpc(A,'update_claim',{taskId:id,draft:moved});
   assert.equal(first.state,'claimed');assert.equal(first.eventId,claim.eventId);assert.equal(first.retry,false);assert.deepEqual(first.draft,moved);
   assert.deepEqual(await status(),{state:'updating',eventUrl:link,draft});
   // Nothing else may touch the event while the update holds it.
   for(const action of ['update_claim','remove_claim']) await assert.rejects(rpc(A,action,{taskId:id,draft:moved}),/CALENDAR_BUSY/);
   await assert.rejects(rpc(A,'claim',{taskId:id,taskRevision:0,draft}),/CALENDAR_BUSY/);
   assert.equal((await rpc(A,'gone',{taskId:id})).state,'updating');assert.equal((await rpc(A,'sync',{taskId:id,draft:moved,eventUrl:link})).state,'updating');
   assert.equal((await rpc(A,'assert',{taskId:id,lease:first.lease})).state,'ready');
   await assert.rejects(rpc(A,'finish',{taskId:id,lease:first.lease,state:'succeeded',eventUrl:link}),/STALE_CALENDAR_OPERATION/);
   await assert.rejects(rpc(A,'update_finish',{taskId:id,lease:null,state:'succeeded',eventUrl:link}),/STALE_CALENDAR_OPERATION/);
   assert.equal((await rpc(A,'update_finish',{taskId:id,lease:first.lease,state:'unknown'})).state,'updating');
   // The lost update is retried with the same values and the same marker.
   await assert.rejects(rpc(A,'update_claim',{taskId:id,draft:{...moved,title:'Changed'}}),/CALENDAR_RETRY_ORIGINAL/);
   await assert.rejects(rpc(A,'claim',{taskId:id,taskRevision:0,draft}),/CALENDAR_BUSY/);
   const retry=await rpc(A,'update_claim',{taskId:id,draft:moved});
   assert.equal(retry.retry,true);assert.equal(retry.updateToken,first.updateToken);assert.notEqual(retry.lease,first.lease);
   await assert.rejects(rpc(A,'update_finish',{taskId:id,lease:first.lease,state:'succeeded',eventUrl:link}),/STALE_CALENDAR_OPERATION/);
   await assert.rejects(rpc(A,'update_finish',{taskId:id,lease:retry.lease,state:'succeeded',eventUrl:'https://evil.example/'}),/INVALID_CALENDAR_URL/);
   assert.deepEqual(await rpc(A,'update_finish',{taskId:id,lease:retry.lease,state:'succeeded',eventUrl:link2}),{state:'succeeded',eventUrl:link2,draft:moved});
   assert.deepEqual(await status(),{state:'succeeded',eventUrl:link2,draft:moved});
   // A refused or outdated update leaves the saved event as it was, with a fresh marker next time.
   for(const outcome of ['changed','failed']){
    const again=await rpc(A,'update_claim',{taskId:id,draft});
    assert.equal(again.retry,false);assert.notEqual(again.updateToken,first.updateToken);
    assert.equal((await rpc(A,'update_finish',{taskId:id,lease:again.lease,state:outcome})).state,outcome);
    assert.deepEqual(await status(),{state:'succeeded',eventUrl:link2,draft:moved});
   }
   assert.deepEqual((await q('select pending_draft,update_token,lease from private.calendar_events where task_id=$1',[id]))[0],{pending_draft:null,update_token:null,lease:null});
  });
  await t.test('read and sync follow Google without a lease; remove is retryable and frees the task for a new event',async()=>{
   assert.deepEqual(await rpc(A,'read',{taskId:id}),{state:'succeeded',eventId:claim.eventId,eventUrl:link2,draft:moved});
   await assert.rejects(rpc(A,'sync',{taskId:id,draft:moved,eventUrl:'https://evil.example/'}),/INVALID_CALENDAR_URL/);
   assert.equal((await rpc(A,'sync',{taskId:id,draft,eventUrl:link})).state,'succeeded');
   assert.deepEqual(await status(),{state:'succeeded',eventUrl:link,draft});
   const lost=await rpc(A,'remove_claim',{taskId:id});
   assert.equal(lost.state,'claimed');assert.equal(lost.eventId,claim.eventId);
   assert.equal((await status()).state,'removing');
   await assert.rejects(rpc(A,'remove_claim',{taskId:id}),/CALENDAR_BUSY/);
   await assert.rejects(rpc(A,'remove_finish',{taskId:id,lease:null,state:'removed'}),/STALE_CALENDAR_OPERATION/);
   assert.equal((await rpc(A,'remove_finish',{taskId:id,lease:lost.lease,state:'unknown'})).state,'removing');
   // In doubt: no create or update may run, but Remove can be pressed again.
   await assert.rejects(rpc(A,'claim',{taskId:id,taskRevision:0,draft}),/CALENDAR_BUSY/);
   await assert.rejects(rpc(A,'update_claim',{taskId:id,draft}),/CALENDAR_BUSY/);
   const refused=await rpc(A,'remove_claim',{taskId:id});
   assert.equal((await rpc(A,'remove_finish',{taskId:id,lease:refused.lease,state:'refused'})).state,'succeeded');
   assert.deepEqual(await status(),{state:'succeeded',eventUrl:link,draft});
   const done=await rpc(A,'remove_claim',{taskId:id});
   await assert.rejects(rpc(A,'remove_finish',{taskId:id,lease:lost.lease,state:'removed'}),/STALE_CALENDAR_OPERATION/);
   assert.deepEqual(await rpc(A,'remove_finish',{taskId:id,lease:done.lease,state:'removed'}),{state:'removed'});
   assert.deepEqual(await status(),{});assert.deepEqual(await as('authenticated',A,()=>call('calendar_event_statuses',[])),[]);
   assert.equal((await rpc(A,'read',{taskId:id})).state,'none');
   for(const action of ['remove_claim','update_claim']) await assert.rejects(rpc(A,action,{taskId:id,draft}),/CALENDAR_NOT_ADDED/);
   // Adding again makes a new event; the removed event's ID is never reused.
   const again=await rpc(A,'claim',{taskId:id,taskRevision:0,draft});
   assert.equal(again.state,'claimed');assert.notEqual(again.eventId,claim.eventId);
   await rpc(A,'finish',{taskId:id,lease:again.lease,state:'succeeded',eventUrl:link});
   claim=again;
   // Deleted in Google: the record is dropped the same way.
   assert.equal((await rpc(A,'gone',{taskId:id})).state,'removed');assert.equal((await rpc(A,'gone',{taskId:id})).state,'none');
   const third=await rpc(A,'claim',{taskId:id,taskRevision:0,draft});
   await rpc(A,'finish',{taskId:id,lease:third.lease,state:'succeeded',eventUrl:link});claim=third;
  });
  await t.test('a completed, cancelled or deleted task can still be read and removed, never created or updated',async()=>{
   const withEvent=async()=>{
    const task=(await q("insert into public.tasks(user_id,title,status,accepted_fields) values($1,'Closing','approved',$2) returning id",[A,JSON.stringify({action:'Closing',requirements:[],condition:null,deadline:null})]))[0].id;
    const made=await rpc(A,'claim',{taskId:task,taskRevision:0,draft});
    await rpc(A,'finish',{taskId:task,lease:made.lease,state:'succeeded',eventUrl:link});
    return task;
   };
   for(const closing of ["cancelled_at=now()","status='completed'","deleted_at=now()"]){
    const task=await withEvent();
    await q(`update public.tasks set ${closing} where id=$1`,[task]);
    await assert.rejects(rpc(A,'update_claim',{taskId:task,draft:moved}),/STALE_CALENDAR_TASK/);
    assert.equal((await rpc(A,'read',{taskId:task})).state,'succeeded');
    assert.equal((await as('authenticated',A,()=>call('calendar_event_status',[task]))).state,'succeeded');
    const refused=await rpc(A,'remove_claim',{taskId:task});
    assert.equal((await rpc(A,'remove_finish',{taskId:task,lease:refused.lease,state:'refused'})).state,'succeeded');
    const removing=await rpc(A,'remove_claim',{taskId:task});
    assert.equal((await rpc(A,'remove_finish',{taskId:task,lease:removing.lease,state:'removed'})).state,'removed');
    await assert.rejects(rpc(A,'claim',{taskId:task,taskRevision:0,draft}),/STALE_CALENDAR_TASK/);
   }
   // An update claimed while the task was open is refused at the last check once the task is cancelled.
   const task=await withEvent();
   const late=await rpc(A,'update_claim',{taskId:task,draft:moved});
   await q('update public.tasks set cancelled_at=now() where id=$1',[task]);
   await assert.rejects(rpc(A,'assert',{taskId:task,lease:late.lease}),/STALE_CALENDAR_TASK/);
   assert.equal((await rpc(A,'update_finish',{taskId:task,lease:late.lease,state:'failed'})).state,'failed');
   const removing=await rpc(A,'remove_claim',{taskId:task});
   assert.equal((await rpc(A,'remove_finish',{taskId:task,lease:removing.lease,state:'removed'})).state,'removed');
   assert.equal((await q('select count(*) n from private.calendar_events where task_id<>$1',[id]))[0].n,0);
   // Another account can never act on this task's event.
   for(const action of ['read','remove_claim','update_claim','gone']) await assert.rejects(rpc(B,action,{taskId:id,draft}),/TASK_NOT_FOUND/);
  });
  await t.test('OAuth upgrade intent is bound to single-use state and cancellation preserves Gmail credentials',async()=>{
   const start=await as('service_role',A,()=>call('google_connection_service',[A,'start',{hash:'a'.repeat(64),email:'a@example.org',verifier:'encrypted-verifier',calendar:true}]));assert.equal(start.state,'started');
   const pending=await as('service_role',A,()=>call('google_connection_service',[null,'consume',{hash:'a'.repeat(64)}]));assert.equal(pending.calendar,true);assert.equal(pending.credentials,'encrypted');
   assert.deepEqual(pending.scopes,scopes);
   assert.equal(pending.connectionState,'connected');
   const status=await as('authenticated',A,()=>call('google_connection_status',[]));assert.equal(status.state,'connected');assert.ok(!JSON.stringify(status).includes('encrypted'));
   assert.equal((await call('google_connection_service',[null,'consume',{hash:'a'.repeat(64)}])).state,'invalid_state');
   assert.equal((await call('google_connection_service',[A,'refresh_claim',{}])).state,'busy');
   await call('google_connection_service',[A,'oauth_release',{generation:pending.generation}]);
   assert.deepEqual((await call('google_connection_service',[A,'refresh_claim',{}])).scopes,scopes);
  });
  await t.test('Gmail-only reconnect after revocation drops Calendar and reports the revoked state',async()=>{
   // A refresh that Google rejects as revoked moves the connection to reconnect_required.
   await q("update private.google_connections set expires_at=now()-interval '1 hour',last_started_at=null where user_id=$1",[A]);
   const lease=await call('google_connection_service',[A,'refresh_claim',{}]);assert.equal(lease.state,'refresh');
   assert.equal((await call('google_connection_service',[A,'refresh_fail',{generation:lease.generation,lease:lease.lease,reason:'revoked'}])).state,'reconnect_required');
   assert.equal((await call('google_connection_service',[A,'refresh_claim',{requiredScope:scopes[1]}])).state,'reconnect_required');
   // Reconnect without asking for Calendar.
   assert.equal((await call('google_connection_service',[A,'start',{hash:'b'.repeat(64),email:'a@example.org',verifier:'encrypted-verifier'}])).state,'started');
   const pending=await call('google_connection_service',[null,'consume',{hash:'b'.repeat(64)}]);
   assert.equal(pending.state,'consumed');assert.equal(pending.calendar,false);assert.equal(pending.connectionState,'reconnect_required');
   const done=await call('google_connection_service',[A,'finish',{generation:pending.generation,subject:'123',email:'a@example.org',scopes:[scopes[0]],credentials:'fresh',expiresAt:'2099-01-01T00:00:00Z'}]);
   assert.equal(done.state,'connected');
   await call('google_connection_service',[A,'oauth_release',{generation:pending.generation}]);
   const status=await as('authenticated',A,()=>call('google_connection_status',[]));
   assert.equal(status.state,'connected');assert.deepEqual(status.scopes,[scopes[0]]);
   const claimed=await call('google_connection_service',[A,'refresh_claim',{}]);assert.equal(claimed.state,'ready');assert.equal(claimed.credentials,'fresh');
   assert.equal((await call('google_connection_service',[A,'refresh_claim',{requiredScope:scopes[1]}])).state,'scope_required');
   await assert.rejects(rpc(A,'claim',{taskId:id,taskRevision:0,draft}),/GOOGLE_CALENDAR_SCOPE_REQUIRED/);
  });
  await t.test('a full disconnect clears saved credentials, so a later reconnect has nothing old to reuse',async()=>{
   const out=await call('google_connection_service',[A,'disconnect',{}]);assert.equal(out.state,'disconnecting');
   assert.equal((await call('google_connection_service',[A,'start',{hash:'c'.repeat(64),email:'a@example.org',verifier:'v'}])).state,'disconnecting');
   assert.equal((await call('google_connection_service',[A,'disconnect_finish',{generation:out.generation}])).state,'disconnected');
   await q('update private.google_connections set last_started_at=null where user_id=$1',[A]);
   assert.equal((await call('google_connection_service',[A,'start',{hash:'c'.repeat(64),email:'a@example.org',verifier:'v'}])).state,'started');
   const pending=await call('google_connection_service',[null,'consume',{hash:'c'.repeat(64)}]);
   assert.equal(pending.connectionState,'disconnected');assert.equal(pending.credentials,null);assert.deepEqual(pending.scopes,[]);
  });
 } finally {await db.close();}
});
