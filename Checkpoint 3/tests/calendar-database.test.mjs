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
 } finally {await db.close();}
});
