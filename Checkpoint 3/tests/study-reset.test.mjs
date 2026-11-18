// Offline PGlite test of the study reset operation (issue #101). Simulated Auth roles
// and a stub auth.users table, as in calendar-database.test.mjs. It does not show the
// operation works on hosted Supabase: roles, table ownership and the SQL Editor differ.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {PGlite} from '../app/node_modules/@electric-sql/pglite/dist/index.js';
import {createGmailProcessor} from '../app/pipeline/gmail-processor.mjs';

const OPS=new URL('../app/supabase/operations/study_reset.sql',import.meta.url);
const USERS={
 A:{id:'a1111111-1111-4111-8111-111111111111',email:'study-a@example.edu',subject:'fictional-sub-a'},
 B:{id:'b2222222-2222-4222-8222-222222222222',email:'study-b@example.edu',subject:'fictional-sub-b'},
 C:{id:'c3333333-3333-4333-8333-333333333333',email:'someone-else@example.edu',subject:'fictional-sub-c'},
};
const RESTORED=['public.storage_preferences','public.scan_settings','public.user_onboarding_preferences','public.storage_sources',
 'public.storage_extractions','public.storage_evidence','public.storage_suggestions','public.tasks','public.storage_task_sources',
 'public.storage_waiting_for','public.storage_followups','public.storage_calendar_operations','public.gmail_task_changes',
 'private.gmail_result_cache','private.storage_jobs','private.storage_attempts','private.storage_usage','private.storage_suppressions',
 'private.storage_source_suppressions','private.gmail_scan_work'];
const DUMPED=[...RESTORED,'private.calendar_events','private.google_connections','private.google_oauth_states'];
// The only columns a reset changes on purpose (moved forward, never back).
const FORWARD={'public.storage_preferences':['generation'],'public.scan_settings':['revision'],
 'private.gmail_scan_work':['settings_revision','storage_generation','last_complete_revision','last_complete_storage_generation']};
const scopes=['https://www.googleapis.com/auth/gmail.readonly','https://www.googleapis.com/auth/calendar.events.owned'];
const rules={allow:{labels:[],keywords:[],senders:[],domains:['example.edu'],subjectKeywords:[]},block:{labels:[],keywords:[],senders:[],domains:[],subjectKeywords:[]}};
const limits={maxMessages:5,maxAgeDays:90,maxMessageChars:12000,maxTotalChars:24000};

test('study reset restores the frozen state of one study account and touches nothing else',async t=>{
 const db=new PGlite();
 const q=async(sql,args=[])=>(await db.query(sql,args)).rows;
 const scalar=async(sql,args=[])=>Object.values((await q(sql,args))[0])[0];
 const as=async(role,user,fn)=>{await db.exec(`set role ${role}`);await q("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({sub:user})]);try{return await fn();}finally{await db.exec('reset role');}};
 const named=(name,args)=>`select public.${name}(${Object.keys(args).map((k,i)=>`${k}=>$${i+1}`).join(',')})`;
 const rpcFor=user=>(name,args)=>as('service_role',user,()=>scalar(named(name,args),Object.values(args)));
 const authFor=user=>(name,args)=>as('authenticated',user,()=>scalar(named(name,args),Object.values(args)));
 const reset=(code,label,cleared)=>scalar('select study_reset.reset($1,$2,$3)',[code,label,cleared]);
 const failedRows=()=>scalar("select count(*)::int from study_reset.log where result='failed'");
 const dump=async user=>{
  const out={};
  for(const tbl of DUMPED) out[tbl]=(await q(`select to_jsonb(x)::text j from ${tbl} x where x.user_id=$1`,[user])).map(r=>r.j).sort();
  out['auth.users']=(await q('select to_jsonb(u)::text j from auth.users u where u.id=$1',[user])).map(r=>r.j);
  return out;
 };
 const withoutForward=d=>Object.fromEntries(Object.entries(d).map(([tbl,rows])=>[tbl,rows.map(text=>{
  const row=JSON.parse(text);for(const col of FORWARD[tbl]??[])delete row[col];return JSON.stringify(row);}).sort()]));
 const counters=async user=>({generation:Number(await scalar('select generation from public.storage_preferences where user_id=$1',[user])),
  revision:Number(await scalar('select revision from public.scan_settings where user_id=$1',[user])),
  work:(await q('select settings_revision,storage_generation,last_complete_revision,last_complete_storage_generation from private.gmail_scan_work where user_id=$1',[user]))[0]});
 const relation=c=>Object.fromEntries(Object.entries(c.work).map(([k,v])=>[k,v===null?'none':Number(v)===(k.includes('revision')?c.revision:c.generation)?'current':'stale']));

 // Fake model: answers by message id; tasks are owned by the scanning user.
 const scripts={};
 const generate=async({payload})=>{
  const id=payload.currentMessage.id,evidence={messageId:id,quote:payload.currentMessage.body};
  const out={category:'Passive',confidence:90,summary:'Fictional study email.',explanation:'Fictional.',evidence,tasks:[],waitingFor:[],suggestedFollowUps:[],uncertainties:[],
   topicRelevance:{decision:'relevant',reason:'No topic limits.'},taskChanges:[],...(scripts[id]?.(payload,evidence)??{})};
  return {value:out,attempts:1,usage:{totalTokens:25},latencyMs:1};
 };
 const task=(payload,action,quote,id)=>({action,requirements:[],condition:null,deadline:null,owner:payload.user.email,evidence:{messageId:id,quote},topicRelevance:'relevant'});
 scripts.m1=(p,e)=>({category:'Actionable',tasks:[task(p,'Submit the lab report','Please submit the lab report.','m1'),task(p,'Email the TA','Also email the TA.','m1')]});
 scripts.m2=(p,e)=>({category:'Actionable',tasks:[task(p,'Read chapter four','Read chapter four before Friday.','m2')]});
 scripts.m3=(p,e)=>({waitingFor:[{action:'Send the transcript',owner:'registrar@example.edu',promisedDeadline:{date:'2026-01-05',time:null,timeZone:'America/Chicago',wording:'by January 5',boundary:'by'},evidence:e,topicRelevance:'relevant'}],
  suggestedFollowUps:[{action:'Ask about the transcript',recipient:'registrar@example.edu',waitingForIndex:0,rationale:'The promised date has passed.',evidence:e,topicRelevance:'relevant'}]});
 scripts.m4=(p,e)=>({category:'Actionable',tasks:[task(p,'Bring your laptop','Bring your laptop to the workshop.','m4')]});
 scripts.m5=(p,e)=>({category:'Actionable',taskChanges:p.existingTaskContext.filter(c=>c.acceptedFields.action==='Submit the lab report').map(c=>({topicRelevance:'relevant',kind:'edit',
  targetTaskId:c.id,expectedRevision:c.revision,changedFields:['deadline'],fields:{...c.acceptedFields,deadline:{date:'2026-11-20',time:null,timeZone:'America/Chicago',wording:'now due November 20',boundary:'on'}},
  reason:'Explicit deadline change.',evidence:e}))});
 scripts.m6=(p,e)=>({taskChanges:[{topicRelevance:'relevant',kind:'edit',targetTaskId:null,expectedRevision:null,changedFields:['deadline'],fields:null,reason:'Target is unclear.',evidence:e}]});
 scripts.m8=(p,e)=>({category:'Actionable',tasks:[task(p,'Submit the quiz','Submit the quiz by Monday.','m8')]});

 const scan=async(u,messages)=>{
  const rpc=rpcFor(u.id);
  const work=await rpc('gmail_scan_service',{p_user:u.id,p_action:'claim',p_data:{mode:'initial'}});
  assert.equal(work.state,'claimed');
  const at=h=>new Date(Date.parse(work.end)-h*3600000).toISOString();
  for(const [id,thread,hours,body,after] of messages){
   const proc=createGmailProcessor({rpc,user:{id:u.id,email:u.email},work,settings:{contextLimits:limits,model:'test-model',version:'test',maxOutputTokens:1000,maxAttempts:1,timeoutMs:60000},
    systemPrompt:'Fictional injected model.',generate});
   const result=await proc({message:{id,threadId:thread,from:'teacher@example.edu',subject:`Course note ${id}`,sentAt:at(hours),labels:[],body},threadContext:[],rules,contextLimits:limits});
   assert.equal(result.saved,true,`message ${id} saved`);
   if(after) await after();
  }
  await rpc('gmail_scan_service',{p_user:u.id,p_action:'finish',p_data:{lease:work.lease,continuation:null,result:{executionMode:'GMAIL_PERSISTENT_MANUAL',processed:messages.length}}});
 };
 const suggestion=async(u,action)=>(await q("select * from public.storage_suggestions where user_id=$1 and fields->>'action'=$2 order by created_at limit 1",[u.id,action]))[0];
 const taskRow=async(u,action)=>(await q("select * from public.tasks where user_id=$1 and title=$2 and deleted_at is null",[u.id,action]))[0];
 const act=(u,kind,id,action,revision,fields=null)=>authFor(u.id)('storage_action',{p_kind:kind,p_id:id,p_action:action,p_revision:revision,p_fields:fields});

 // A realistic frozen state: a scan plus a few decisions, across every restored table.
 const seed=async u=>{
  const auth=authFor(u.id);
  await auth('scan_settings_save',{p_revision:0,p_rules:rules,p_context:limits,p_consent:true,p_paused:false,p_disclosure:'gmail-scan-v1',p_semantic:{include:[],exclude:[]}});
  await as('authenticated',u.id,()=>q('insert into public.user_onboarding_preferences(user_id,included_types,selected_sources) values($1,$2,$3)',[u.id,['Assignments'],['teacher@example.edu']]));
  // OAuth cannot run offline: the connection row is written directly.
  await q("insert into private.google_connections(user_id,state,generation,subject,email,scopes,credentials,expires_at) values($1,'connected',1,$2,$3,$4,'encrypted-fictional','2099-01-01')",[u.id,u.subject,u.email,JSON.stringify(scopes)]);
  await scan(u,[
   ['m1','t1',6,'Please submit the lab report. Also email the TA.',async()=>{
    const s=await suggestion(u,'Submit the lab report');await act(u,'suggestion',s.id,'approve',s.revision);
    const d=await suggestion(u,'Email the TA');await act(u,'suggestion',d.id,'dismiss',d.revision);}],
   ['m2','t2',5,'Read chapter four before Friday.'],
   ['m3','t3',4.5,'The registrar will send your transcript.',async()=>{
    const f=(await q('select * from public.storage_followups where user_id=$1',[u.id]))[0];
    await act(u,'followup',f.id,'remind',f.revision,{reminderAt:'2026-11-18T15:00:00Z'});}],
   ['m4','t4',4,'Bring your laptop to the workshop.',async()=>{
    const s=await suggestion(u,'Bring your laptop');const {taskId}=await act(u,'suggestion',s.id,'approve',s.revision);
    await act(u,'task',taskId,'delete',0);}],
   ['m5','t1',3,'The lab report is now due November 20.'],
   ['m6','t6',2.5,'That deadline moved, check the portal.'],
   ['m7','t7',2,'An optional reading list is attached.',async()=>{
    const src=(await q("select id from public.storage_sources where user_id=$1 and message_id='m7'",[u.id]))[0];
    await act(u,'source',src.id,'delete',null);}],
  ]);
  const t1=await taskRow(u,'Submit the lab report');
  await act(u,'task',t1.id,'preview_calendar',t1.revision,{calendarId:'primary',title:'Submit the lab report',allDay:true,date:'2026-11-20',timeZone:'America/Chicago'});
 };

 try {
  await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;grant usage on schema auth to anon,authenticated,service_role;
   create table auth.users(id uuid primary key,email text);create function auth.uid() returns uuid language sql stable as $$select (nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub')::uuid$$;`);
  for(const u of Object.values(USERS)) await q('insert into auth.users values($1,$2)',[u.id,u.email]);
  const path=new URL('../app/supabase/migrations/',import.meta.url);
  for(const name of (await readdir(path)).filter(n=>n.endsWith('.sql')).sort())await db.exec(await readFile(new URL(name,path),'utf8'));
  const ops=await readFile(OPS,'utf8');
  await db.exec(ops);
  await q("insert into private.storage_provider_limits(model,requests_per_minute) values('test-model',1000)");
  for(const u of Object.values(USERS)) await seed(u);
  await q('insert into study_reset.accounts(user_id,label,email) values($1,$2,$3),($4,$5,$6)',[USERS.A.id,'A',USERS.A.email,USERS.B.id,'B',USERS.B.email]);

  const {A,B,C}=USERS;
  const seeded=await scalar(`select jsonb_build_object(${RESTORED.map(tbl=>`'${tbl}',(select count(*) from ${tbl} where user_id=$1)`).join(',')})`,[A.id]);
  for(const tbl of RESTORED) assert.ok(Number(seeded[tbl])>0,`seed has rows in ${tbl}`);

  await t.test('before a snapshot exists the reset refuses and changes nothing',async()=>{
   const before=await dump(B.id),failed=await failedRows();
   const out=await reset('P01','B',true);
   assert.equal(out.ok,false);assert.match(out.error,/STUDY_RESET_NO_SNAPSHOT/);
   assert.deepEqual(await dump(B.id),before);assert.equal(await failedRows(),failed+1);
  });

  let frozenA,frozenB,frozenOthers,snapA,snapB,frozenCounters;
  await t.test('take_snapshot freezes each account once and proves the snapshot restores',async()=>{
   snapA=await scalar("select study_reset.take_snapshot('A')");snapB=await scalar("select study_reset.take_snapshot('B')");
   assert.equal(snapA.ok,true);assert.equal(snapB.ok,true);
   assert.equal(snapA.digest,await scalar('select study_reset.digest($1)',[A.id]),'the dry run left the data as it was');
   for(const tbl of RESTORED) assert.equal(Number(snapA.counts[tbl]),Number(seeded[tbl]));
   await assert.rejects(q("select study_reset.take_snapshot('A')"),/STUDY_RESET_SNAPSHOT_EXISTS/);
   await assert.rejects(q("select study_reset.take_snapshot('C')"),/STUDY_RESET_UNKNOWN_LABEL/);
   frozenA=await dump(A.id);frozenB=await dump(B.id);frozenOthers={B:frozenB,C:await dump(C.id)};
   frozenCounters=await counters(A.id);
   assert.deepEqual(relation(frozenCounters),{settings_revision:'current',storage_generation:'current',last_complete_revision:'current',last_complete_storage_generation:'current'});
  });

  await t.test('a session changes account A through the app RPCs',async()=>{
   const auth=authFor(A.id),rpc=rpcFor(A.id);
   const read=await suggestion(A,'Read chapter four');const {taskId:t2}=await act(A,'suggestion',read.id,'approve',read.revision);
   const t1=await taskRow(A,'Submit the lab report');
   await act(A,'task',t1.id,'edit',t1.revision,{action:'Submit the lab report',requirements:['Attach the data sheet'],condition:null,deadline:null});
   const change=(await q("select * from public.gmail_task_changes where user_id=$1 and state='pending' and target_task_id is not null",[A.id]))[0];
   await auth('gmail_change_review',{p_id:change.id,p_revision:change.revision,p_action:'dismiss'});
   const ta=await suggestion(A,'Email the TA');await act(A,'suggestion',ta.id,'restore',ta.revision);
   // Calendar: the event record is created through the real service RPC.
   const claim=await rpc('calendar_event_service',{p_user:A.id,p_action:'claim',p_data:{taskId:t2,taskRevision:0,draft:{title:'Read chapter four',date:'2026-11-21',allDay:true,timeZone:'America/Chicago'}}});
   await rpc('calendar_event_service',{p_user:A.id,p_action:'finish',p_data:{taskId:t2,lease:claim.lease,state:'succeeded',eventUrl:'https://www.google.com/calendar/event?eid=fictional'}});
   const t1now=await taskRow(A,'Submit the lab report');await act(A,'task',t1now.id,'return_to_suggestions',t1now.revision);
   const m3=(await q("select id from public.storage_sources where user_id=$1 and message_id='m3'",[A.id]))[0];await act(A,'source',m3.id,'delete',null);
   const settings=await auth('scan_settings_get',{});
   await auth('scan_settings_save',{p_revision:settings.revision,p_rules:{...rules,allow:{...rules.allow,senders:['dean@example.edu']}},p_context:limits,p_consent:true,p_paused:false,p_disclosure:'gmail-scan-v1',p_semantic:{include:[],exclude:[]}});
   await auth('scan_auto_scan_save',{p_enabled:true});
   await act(A,'processing',null,'pause',null);await act(A,'processing',null,'resume',null);
   await as('authenticated',A.id,()=>q("update public.user_onboarding_preferences set excluded_types=$2 where user_id=$1",[A.id,['Newsletters']]));
   // The 30-second scan cooldown cannot be waited out in a test: written directly.
   await q("update private.gmail_scan_work set last_started=now()-interval '1 minute' where user_id=$1",[A.id]);
   await scan(A,[['m8','t8',1,'Submit the quiz by Monday.',async()=>{
    const s=await suggestion(A,'Submit the quiz');const {taskId}=await act(A,'suggestion',s.id,'approve',s.revision);await act(A,'task',taskId,'delete',0);}]]);
   await act(A,'task',t2,'preview_calendar',0,{calendarId:'primary',title:'Read chapter four',allDay:true,date:'2026-11-21',timeZone:'America/Chicago'});
   assert.notDeepEqual(withoutForward(await dump(A.id)),withoutForward(frozenA));
   assert.equal(await scalar('select count(*)::int from private.calendar_events where user_id=$1',[A.id]),1);
   assert.deepEqual(await dump(B.id),frozenB);
  });

  const refuses=async(name,call,pattern,{logged=true}={})=>{
   const before=await dump(A.id),others={B:await dump(B.id),C:await dump(C.id)},failed=await failedRows();
   const out=await call();
   assert.equal(out.ok,false,name);assert.match(out.error,pattern,name);
   assert.doesNotMatch(out.error,/@|[0-9a-f]{8}-[0-9a-f]{4}-/,`${name}: no address or id in the error`);
   assert.deepEqual(await dump(A.id),before,`${name}: account A unchanged`);
   assert.deepEqual({B:await dump(B.id),C:await dump(C.id)},others,`${name}: other accounts unchanged`);
   if(logged) assert.equal(await failedRows(),failed+1,`${name}: one failed log row`);
   return out;
  };

  await t.test('refusals change nothing and each leaves one failed log row',async()=>{
   await refuses('unknown label',()=>reset('P01','C',true),/STUDY_RESET_UNKNOWN_LABEL/);
   await refuses('null label',()=>reset('P01',null,true),/STUDY_RESET_UNKNOWN_LABEL/);
   for(const code of ['Jane Doe','p01','P1','P001','',null,'jane@example.edu']) await refuses(`participant ${code}`,()=>reset(code,'A',true),/STUDY_RESET_BAD_PARTICIPANT_CODE/);
   assert.equal(await scalar("select count(*)::int from study_reset.log where participant is not null and participant !~ '^(P[0-9]{2}|PILOT|R[0-9])$'"),0);
   assert.equal(await scalar("select count(*)::int from study_reset.log where error ~ '@'"),0);

   await q("delete from study_reset.accounts where label='B'");
   await refuses('one account row',()=>reset('P01','A',true),/STUDY_RESET_ACCOUNTS_NOT_TWO/);
   await q('insert into study_reset.accounts values($1,$2,$3)',[B.id,'B',B.email]);
   await assert.rejects(q('insert into study_reset.accounts values($1,$2,$3)',[C.id,'C',C.email]),/check/);
   // Pointing a label at another account finds no snapshot for it.
   await q("update study_reset.accounts set user_id=$1,email=$2 where label='A'",[C.id,C.email]);
   await refuses('user C',()=>reset('P01','A',true),/STUDY_RESET_NO_SNAPSHOT/);
   await q("update study_reset.accounts set user_id=$1,email=$2 where label='A'",[A.id,A.email]);

   await q("update auth.users set email='changed@example.edu' where id=$1",[A.id]);
   await refuses('changed sign-in address',()=>reset('P01','A',true),/STUDY_RESET_ACCOUNT_CHANGED/);
   await q('update auth.users set email=$2 where id=$1',[A.id,A.email]);

   await refuses('Calendar records without the flag',()=>reset('P01','A',false),/STUDY_RESET_CALENDAR_NOT_CLEARED/);
   await refuses('Calendar flag null',()=>reset('P01','A',null),/STUDY_RESET_CALENDAR_NOT_CLEARED/);

   await q('update private.google_connections set generation=generation+1 where user_id=$1',[A.id]);
   await refuses('reconnected Google',()=>reset('P01','A',true),/STUDY_RESET_CONNECTION_CHANGED/);
   await q('update private.google_connections set generation=generation-1 where user_id=$1',[A.id]);
   await q("update private.google_connections set state='disconnected' where user_id=$1",[A.id]);
   await refuses('disconnected Google',()=>reset('P01','A',true),/STUDY_RESET_CONNECTION_CHANGED/);
   await q("update private.google_connections set state='connected' where user_id=$1",[A.id]);

   // A scan in progress holds a live lease (cooldown written directly, as above).
   await q("update private.gmail_scan_work set last_started=now()-interval '1 minute' where user_id=$1",[A.id]);
   const work=await rpcFor(A.id)('gmail_scan_service',{p_user:A.id,p_action:'claim',p_data:{mode:'initial'}});
   await refuses('live scan lease',()=>reset('P01','A',true),/STUDY_RESET_LIVE_LEASE/);
   await rpcFor(A.id)('gmail_scan_service',{p_user:A.id,p_action:'finish',p_data:{lease:work.lease,continuation:null,result:{executionMode:'GMAIL_PERSISTENT_MANUAL',processed:0}}});
   const draft={title:'Read chapter four',date:'2026-11-22',allDay:true,timeZone:'America/Chicago'};
   const t2=(await taskRow(A,'Read chapter four')).id;
   const busy=await rpcFor(A.id)('calendar_event_service',{p_user:A.id,p_action:'update_claim',p_data:{taskId:t2,draft}});
   await refuses('live Calendar lease',()=>reset('P01','A',true),/STUDY_RESET_LIVE_LEASE/);
   await rpcFor(A.id)('calendar_event_service',{p_user:A.id,p_action:'update_finish',p_data:{taskId:t2,lease:busy.lease,state:'failed'}});

   // A trigger this file does not know about blocks the reset before anything changes.
   await db.exec('create function public.fictional_trigger() returns trigger language plpgsql as $$begin return new; end$$;create trigger fictional_extra before insert on public.storage_evidence for each row execute function public.fictional_trigger()');
   await refuses('unknown trigger',()=>reset('P01','A',true),/STUDY_RESET_SCHEMA_CHANGED/);
   await db.exec('drop trigger fictional_extra on public.storage_evidence;drop function public.fictional_trigger()');
   await q('create table public.fictional_notes(user_id uuid primary key)');
   await refuses('uncovered table',()=>reset('P01','A',true),/STUDY_RESET_SCHEMA_CHANGED/);
   await q('drop table public.fictional_notes');
  });

  await t.test('a failure in the middle of the restore rolls everything back and is logged once',async()=>{
   const original=await scalar("select row_data from study_reset.snapshot where user_id=$1 and tbl='public.storage_followups'",[A.id]);
   await q("update study_reset.snapshot set row_data=row_data||jsonb_build_object('evidence_id',gen_random_uuid()) where user_id=$1 and tbl='public.storage_followups'",[A.id]);
   const out=await refuses('foreign key failure mid-restore',()=>reset('P02','A',true),/23503/);
   assert.equal(await scalar("select count(*)::int from study_reset.log where participant='P02' and result='failed'"),1);
   assert.equal(await scalar("select count(*)::int from study_reset.log where participant='P02' and result='ok'"),0);
   assert.ok(out.error.length<=500);
   await q("update study_reset.snapshot set row_data=$2 where user_id=$1 and tbl='public.storage_followups'",[A.id,original]);
   // A restore that runs to the end but does not match the freeze is undone too.
   const row=(await q("select seq,row_data from study_reset.snapshot where user_id=$1 and tbl='public.storage_suggestions' order by seq limit 1",[A.id]))[0];
   await q("update study_reset.snapshot set row_data=jsonb_set(row_data,'{fields,action}','\"Tampered\"') where user_id=$1 and tbl='public.storage_suggestions' and seq=$2",[A.id,row.seq]);
   await refuses('digest mismatch',()=>reset('P03','A',true),/STUDY_RESET_DIGEST_MISMATCH/);
   await q("update study_reset.snapshot set row_data=$3 where user_id=$1 and tbl='public.storage_suggestions' and seq=$2",[A.id,row.seq,row.row_data]);
  });

  let firstDigest;
  await t.test('reset returns account A to the frozen rows and moves fencing counters forward',async()=>{
   const before=await counters(A.id),others={B:await dump(B.id),C:await dump(C.id)};
   const start=Date.now();const out=await reset('P01','A',true);const ms=Date.now()-start;
   assert.equal(out.ok,true,out.error);
   assert.equal(out.digest,snapA.digest);assert.equal(await scalar('select study_reset.digest($1)',[A.id]),snapA.digest);
   assert.deepEqual(out.counts,snapA.counts);
   assert.deepEqual(withoutForward(await dump(A.id)),withoutForward(frozenA),'row-by-row equal to the frozen copy');
   assert.equal(await scalar('select count(*)::int from private.calendar_events where user_id=$1',[A.id]),0);
   assert.deepEqual({B:await dump(B.id),C:await dump(C.id)},others,'B and C byte-identical');
   assert.deepEqual(others,frozenOthers);
   const after=await counters(A.id);
   assert.ok(after.generation>before.generation&&after.generation>frozenCounters.generation,'generation moved forward');
   assert.ok(after.revision>before.revision&&after.revision>frozenCounters.revision,'revision moved forward');
   for(const k of Object.keys(after.work)) assert.ok(Number(after.work[k])>Number(before.work[k]),`${k} moved forward`);
   assert.deepEqual(relation(after),relation(frozenCounters),'scan work keeps its frozen relation to the counters');
   const log=(await q("select * from study_reset.log where participant='P01' and result='ok'"))[0];
   assert.equal(log.label,'A');assert.equal(log.digest,snapA.digest);assert.equal(log.error,null);
   firstDigest=out.digest;
   t.diagnostic(`reset of account A took ${ms} ms in PGlite`);
  });

  await t.test('the restored account works with the app again',async()=>{
   const s=await suggestion(A,'Read chapter four');
   const stale=await authFor(A.id)('scan_settings_get',{});
   assert.equal(Number(stale.revision),(await counters(A.id)).revision);
   const {taskId}=await act(A,'suggestion',s.id,'approve',s.revision);assert.ok(taskId);
  });

  await t.test('two resets in a row both succeed with the same digest; B resets to its own freeze',async()=>{
   const others={B:await dump(B.id),C:await dump(C.id)};
   const again=await reset('P04','A',true);assert.equal(again.ok,true,again.error);assert.equal(again.digest,firstDigest);
   const third=await reset('R1','A',false);assert.equal(third.ok,true,third.error);assert.equal(third.digest,firstDigest);
   assert.deepEqual({B:await dump(B.id),C:await dump(C.id)},others);
   const b=await reset('PILOT','B',false);assert.equal(b.ok,true,b.error);assert.equal(b.digest,snapB.digest);
   assert.deepEqual(withoutForward(await dump(B.id)),withoutForward(frozenB));
   assert.deepEqual(await dump(C.id),frozenOthers.C,'C never changes');
  });

  await t.test('anon, authenticated and service_role cannot reach the schema or its functions',async()=>{
   const calls=["select study_reset.reset('P05','A',true)","select study_reset.take_snapshot('A',true)",`select study_reset.digest('${A.id}')`,
    `select study_reset.apply('${A.id}',true,true)`,'select * from study_reset.log','select * from study_reset.snapshot','select * from study_reset.accounts',
    "insert into study_reset.log(participant,label,started_at,finished_at,result) values('P99','A',now(),now(),'ok')"];
   for(const role of ['anon','authenticated','service_role']) for(const sql of calls)
    await as(role,A.id,()=>assert.rejects(q(sql),{code:'42501'},`${role}: ${sql}`));
   const grants=await scalar(`select count(*)::int from information_schema.role_routine_grants where routine_schema='study_reset' and grantee in ('PUBLIC','anon','authenticated','service_role')`);
   assert.equal(grants,0);
   const definers=await scalar("select count(*)::int from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='study_reset' and (p.prosecdef or p.proconfig is null)");
   assert.equal(definers,0,'no security definer functions, and every function sets search_path');
  });

  await t.test('running the operations file again keeps snapshots, accounts and the log',async()=>{
   const keep=async()=>({snapshot:await scalar('select count(*)::int from study_reset.snapshot'),freeze:await scalar('select jsonb_agg(f order by user_id) from study_reset.freeze_digest f'),
    log:await scalar('select count(*)::int from study_reset.log'),accounts:await scalar('select count(*)::int from study_reset.accounts')});
   const before=await keep();
   await db.exec(ops);
   assert.deepEqual(await keep(),before);
   const out=await reset('P06','A',true);assert.equal(out.ok,true,out.error);assert.equal(out.digest,firstDigest);
  });
 } finally {await db.close();}
});
