import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {PGlite} from '../app/node_modules/@electric-sql/pglite/dist/index.js';
import {createGmailProcessor} from '../app/pipeline/gmail-processor.mjs';

test('fictional Gmail extraction persists, repeats cache, and changes require revision-checked review',async(t)=>{
 const db=new PGlite(),A='11111111-1111-4111-8111-111111111111',B='22222222-2222-4222-8222-222222222222';
 const q=async(sql,args=[])=>(await db.query(sql,args)).rows;
 const scalar=async(sql,args=[])=>Object.values((await q(sql,args))[0])[0];
 const as=async(role,user,fn)=>{await db.exec(`set role ${role}`);await q("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({sub:user})]);try{return await fn();}finally{await db.exec('reset role');}};
 const rpc=(name,args)=>as('service_role',A,()=>scalar(`select public.${name}(${Object.keys(args).map((k,i)=>`${k}=>$${i+1}`).join(',')})`,Object.values(args)));
 const auth=(name,args,user=A)=>as('authenticated',user,()=>scalar(`select public.${name}(${Object.keys(args).map((k,i)=>`${k}=>$${i+1}`).join(',')})`,Object.values(args)));
 let modelCalls=0;let cancel=false;
 const fields={action:'Submit research report',requirements:['Keep the edited analysis section'],condition:null,deadline:null};
 const generate=async({payload})=>{
  modelCalls++;const evidence={messageId:payload.currentMessage.id,quote:payload.currentMessage.body};
  const result={category:'Actionable',confidence:95,summary:'Research report request.',explanation:'An explicit request.',evidence,tasks:[],waitingFor:[],suggestedFollowUps:[],uncertainties:[],topicRelevance:{decision:'relevant',reason:'All permitted topics.'},taskChanges:[]};
  if(payload.currentMessage.id==='original')result.tasks=[{...fields,owner:payload.user.email,evidence,topicRelevance:'relevant'}];
  else {
   const target=payload.existingTaskContext[0];assert.ok(target,'Relevant accepted task was loaded');
   result.category=cancel?'Passive':'Actionable';result.taskChanges=[{topicRelevance:'relevant',kind:cancel?'cancel':'edit',targetTaskId:target.id,expectedRevision:target.revision,changedFields:cancel?[]:['deadline'],
    fields:cancel?null:{...target.acceptedFields,deadline:{date:'2026-11-09',time:null,timeZone:'America/Chicago',wording:'now due November 9',boundary:'on'}},reason:cancel?'Explicit report cancellation.':'Explicit deadline revision.',evidence}];
  }
  return {value:result,attempts:1,usage:{totalTokens:100},latencyMs:1};
 };
 try {
  await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;grant usage on schema auth to anon,authenticated,service_role;create table auth.users(id uuid primary key,email text);create function auth.uid() returns uuid language sql stable as $$select (nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub')::uuid$$;`);
  await q('insert into auth.users values($1,$2),($3,$4)',[A,'student@example.org',B,'other@example.org']);
  const path=new URL('../app/supabase/migrations/',import.meta.url);for(const name of (await readdir(path)).filter(n=>n.endsWith('.sql')).sort())await db.exec(await readFile(new URL(name,path),'utf8'));
  await q("insert into private.storage_provider_limits(model,requests_per_minute) values('test-model',1000)");
  const rules={allow:{labels:[],keywords:[],senders:[],domains:['example.org'],subjectKeywords:[]},block:{labels:[],keywords:[],senders:[],domains:[],subjectKeywords:[]}};
  const limits={maxMessages:5,maxAgeDays:90,maxMessageChars:12000,maxTotalChars:24000};
  await auth('scan_settings_save',{p_revision:0,p_rules:rules,p_context:limits,p_consent:true,p_paused:false,p_disclosure:'gmail-scan-v1',p_semantic:{include:[],exclude:[]}});
  await q("insert into private.google_connections(user_id,state,generation,subject,email,scopes) values($1,'connected',1,'12345','student@example.org','[\"https://www.googleapis.com/auth/gmail.readonly\"]')",[A]);
  const work=await rpc('gmail_scan_service',{p_user:A,p_action:'claim',p_data:{mode:'initial'}});
  const processor=createGmailProcessor({rpc,user:{id:A,email:'student@example.org'},work,settings:{contextLimits:limits,model:'test-model',version:'test',maxOutputTokens:8192,maxAttempts:1,timeoutMs:60000},systemPrompt:'Fictional injected model.',generate});
  const input=id=>({message:{id,threadId:'thread1',from:'teacher@example.org',subject:'Research report',sentAt:new Date(Date.parse(work.end)-3600000).toISOString(),labels:[],body:id==='original'?'Please submit the research report.':cancel?'The research report is cancelled.':'The research report is now due November 9.'},threadContext:[],rules,contextLimits:limits});
  let taskId,change;
  await t.test('new task persists as a suggestion and repeated/approved sources avoid inference',async()=>{
   assert.equal((await processor(input('original'))).saved,true);assert.equal(modelCalls,1);
   assert.equal((await processor(input('original'))).reused,true);assert.equal(modelCalls,1);
   const suggestion=(await q('select * from public.storage_suggestions'))[0];
   taskId=(await auth('storage_action',{p_kind:'suggestion',p_id:suggestion.id,p_action:'approve',p_revision:0,p_fields:null})).taskId;
   assert.equal((await processor(input('original'))).reused,true);assert.equal(modelCalls,1);
  });
  await t.test('deadline revision is proposed, with accepted user values preserved until approval',async()=>{
   assert.equal((await processor(input('update'))).saved,true);assert.equal(modelCalls,2);
   assert.equal((await scalar('select accepted_fields from public.tasks where id=$1',[taskId])).deadline,null);
   change=(await q('select * from public.gmail_task_changes'))[0];assert.equal(change.target_task_id,taskId);assert.equal(change.expected_revision,0);
   assert.deepEqual(change.fields.requirements,fields.requirements);
   await assert.rejects(auth('gmail_change_review',{p_id:change.id,p_revision:0,p_action:'approve'},B),{code:'42501'});
  });
  await t.test('stale target requires explicit rebase then renewed approval, without losing user edits',async()=>{
   await auth('storage_action',{p_kind:'task',p_id:taskId,p_action:'edit',p_revision:0,p_fields:{...fields,requirements:['User changed this after inference']}});
   await assert.rejects(auth('gmail_change_review',{p_id:change.id,p_revision:0,p_action:'approve'}),{code:'PT409'});
   await auth('gmail_change_review',{p_id:change.id,p_revision:0,p_action:'rebase',p_task_revision:1});
   assert.equal((await scalar('select accepted_fields from public.tasks where id=$1',[taskId])).deadline,null);
   await auth('gmail_change_review',{p_id:change.id,p_revision:1,p_action:'approve'});
   const task=await scalar('select accepted_fields from public.tasks where id=$1',[taskId]);assert.equal(task.deadline.date,'2026-11-09');assert.deepEqual(task.requirements,['User changed this after inference']);
  });
  await t.test('cancellation remains a separate review proposal and preserves accepted values',async()=>{
   cancel=true;
   // A new scan/processor has an independent bounded inference allowance.
   const again=createGmailProcessor({rpc,user:{id:A,email:'student@example.org'},work,settings:{contextLimits:limits,model:'test-model',version:'test',maxOutputTokens:8192,maxAttempts:1,timeoutMs:60000},systemPrompt:'Fictional injected model.',generate});
   await again(input('cancel'));
   const cancellation=(await q("select * from public.gmail_task_changes where kind='cancel'"))[0];
   assert.equal(await scalar('select cancelled_at from public.tasks where id=$1',[taskId]),null);
   await auth('gmail_change_review',{p_id:cancellation.id,p_revision:0,p_action:'approve'});
   assert.ok(await scalar('select cancelled_at from public.tasks where id=$1',[taskId]));
   assert.equal((await scalar('select accepted_fields from public.tasks where id=$1',[taskId])).deadline.date,'2026-11-09');
   assert.equal((await again(input('cancel'))).reused,true);
  });
 } finally {await db.close();}
});

test('repeat scans reuse results, re-extraction never duplicates review items, deletion and cancellation hold',async(t)=>{
 const db=new PGlite(),A='11111111-1111-4111-8111-111111111111';
 const q=async(sql,args=[])=>(await db.query(sql,args)).rows;
 const scalar=async(sql,args=[])=>Object.values((await q(sql,args))[0])[0];
 const as=async(role,fn)=>{await db.exec(`set role ${role}`);await q("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({sub:A})]);try{return await fn();}finally{await db.exec('reset role');}};
 const call=(role,name,args)=>as(role,()=>scalar(`select public.${name}(${Object.keys(args).map((k,i)=>`${k}=>$${i+1}`).join(',')})`,Object.values(args)));
 const rpc=(name,args)=>call('service_role',name,args);const auth=(name,args)=>call('authenticated',name,args);
 const email='student@example.org';let modelCalls=0;const script={};
 const task=(action,evidence)=>({action,requirements:[],condition:null,deadline:null,owner:email,evidence,topicRelevance:'relevant'});
 const generate=async({payload})=>{
  modelCalls++;const id=payload.currentMessage.id,evidence={messageId:id,quote:payload.currentMessage.body};
  const extra=script[id]?.(payload,evidence)??{};const tasks=extra.tasks??[],taskChanges=extra.taskChanges??[];
  return {value:{category:tasks.length||taskChanges.some(c=>c.kind==='edit')?'Actionable':'Passive',confidence:90,summary:'Fictional.',explanation:'Fictional.',evidence,tasks,waitingFor:[],suggestedFollowUps:[],uncertainties:[],topicRelevance:{decision:'relevant',reason:'No topic limits.'},taskChanges},attempts:1,usage:{totalTokens:10},latencyMs:1};
 };
 const editChange=(target,evidence,date)=>({topicRelevance:'relevant',kind:'edit',targetTaskId:target.id,expectedRevision:target.revision,changedFields:['deadline'],
  fields:{...target.acceptedFields,deadline:{date,time:null,timeZone:'America/Chicago',wording:'moved',boundary:'on'}},reason:'Explicit revision.',evidence});
 const rules={allow:{labels:[],keywords:[],senders:[],domains:['example.org'],subjectKeywords:[]},block:{labels:[],keywords:[],senders:[],domains:[],subjectKeywords:[]}};
 const limits={maxMessages:5,maxAgeDays:90,maxMessageChars:12000,maxTotalChars:24000};
 try {
  await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;grant usage on schema auth to anon,authenticated,service_role;create table auth.users(id uuid primary key,email text);create function auth.uid() returns uuid language sql stable as $$select (nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub')::uuid$$;`);
  await q('insert into auth.users values($1,$2)',[A,email]);
  const path=new URL('../app/supabase/migrations/',import.meta.url);for(const name of (await readdir(path)).filter(n=>n.endsWith('.sql')).sort())await db.exec(await readFile(new URL(name,path),'utf8'));
  await q("insert into private.storage_provider_limits(model,requests_per_minute) values('test-model',1000)");
  await auth('scan_settings_save',{p_revision:0,p_rules:rules,p_context:limits,p_consent:true,p_paused:false,p_disclosure:'gmail-scan-v1',p_semantic:{include:[],exclude:[]}});
  await q("insert into private.google_connections(user_id,state,generation,subject,email,scopes) values($1,'connected',1,'12345',$2,'[\"https://www.googleapis.com/auth/gmail.readonly\"]')",[A,email]);
  const work=await rpc('gmail_scan_service',{p_user:A,p_action:'claim',p_data:{mode:'initial'}});
  const hoursAgo=h=>new Date(Date.parse(work.end)-h*3600000).toISOString();
  const proc=(w=work)=>createGmailProcessor({rpc,user:{id:A,email},work:w,settings:{contextLimits:limits,model:'test-model',version:'test',maxOutputTokens:8192,maxAttempts:1,timeoutMs:60000},systemPrompt:'Fictional injected model.',generate});
  const message=(id,hours,body)=>({id,threadId:'thread1',from:'teacher@example.org',subject:'Course work',sentAt:hoursAgo(hours),labels:[],body});
  const input=(m,context=[],r=rules)=>({message:m,threadContext:context,rules:r,contextLimits:limits});
  const approveFor=async action=>{const s=(await q("select * from public.storage_suggestions where fields->>'action'=$1 order by created_at limit 1",[action]))[0];return (await auth('storage_action',{p_kind:'suggestion',p_id:s.id,p_action:'approve',p_revision:s.revision,p_fields:null})).taskId;};
  const O=message('m-original',6,'Please submit the research report.'),R=message('m-reply',5,'Also upload the slides.');
  let reportId,slidesId;
  await t.test('the source message does not treat its own task as a new dependency when thread context exists',async()=>{
   script['m-original']=(p,e)=>({tasks:[task('Submit research report',e)]});
   script['m-reply']=(p,e)=>({tasks:[task('Upload the slides',e)]});
   await proc()(input(O));await proc()(input(R,[O]));assert.equal(modelCalls,2);
   slidesId=await approveFor('Upload the slides');
   assert.equal((await proc()(input(R,[O]))).reused,true);assert.equal(modelCalls,2);
  });
  await t.test('an earlier task newly approved in the thread is offered once, without duplicating suggestions',async()=>{
   reportId=await approveFor('Submit research report');
   await proc()(input(R,[O]));assert.equal(modelCalls,3);
   assert.equal(await scalar("select count(*)::int from public.storage_suggestions where fields->>'action'='Upload the slides'"),1);
   assert.equal((await proc()(input(R,[O]))).reused,true);assert.equal(modelCalls,3);
  });
  await t.test('a later scan day and unrelated rule edits reuse stored results instead of re-inferring',async()=>{
   const before=modelCalls,later={...work,end:new Date(Date.parse(work.end)+86400000).toISOString()};
   assert.equal((await proc(later)(input(O))).reused,true);
   const widened={...rules,allow:{...rules.allow,senders:['new.person@example.net']}};
   assert.equal((await proc()(input(O,[],widened))).reused,true);
   assert.equal(modelCalls,before);
  });
  const U=message('m-update',4,'The research report is now due November 9. Also bring a printed copy.');
  await t.test('re-extraction after a task edit supersedes proposals and does not duplicate new tasks',async()=>{
   script['m-update']=(p,e)=>({tasks:[task('Bring a printed copy',e)],taskChanges:p.existingTaskContext.filter(c=>c.id===reportId).map(c=>editChange(c,e,'2026-11-09'))});
   await proc()(input(U));
   const report=(await q('select * from public.tasks where id=$1',[reportId]))[0];
   await auth('storage_action',{p_kind:'task',p_id:reportId,p_action:'edit',p_revision:report.revision,p_fields:{...report.accepted_fields,requirements:['User note']}});
   const before=modelCalls;await proc()(input(U));assert.equal(modelCalls,before+1);
   assert.equal(await scalar("select count(*)::int from public.storage_suggestions where fields->>'action'='Bring a printed copy'"),1);
   assert.equal(await scalar("select count(*)::int from public.gmail_task_changes where state='pending'"),1);
   assert.equal(await scalar("select count(*)::int from public.gmail_task_changes where state='superseded'"),1);
   const pending=(await q("select * from public.gmail_task_changes where state='pending'"))[0];
   assert.equal(pending.expected_revision,1);assert.deepEqual(pending.fields.requirements,['User note']);
  });
  await t.test('a dismissed proposal is not raised again by unrelated re-extraction',async()=>{
   const pending=(await q("select * from public.gmail_task_changes where state='pending'"))[0];
   await auth('gmail_change_review',{p_id:pending.id,p_revision:pending.revision,p_action:'dismiss'});
   const slides=(await q('select revision from public.tasks where id=$1',[slidesId]))[0];
   await auth('storage_action',{p_kind:'task',p_id:slidesId,p_action:'edit',p_revision:slides.revision,p_fields:{action:'Upload the slides',requirements:['Use the template'],condition:null,deadline:null}});
   const before=modelCalls;await proc()(input(U));assert.equal(modelCalls,before+1);
   assert.equal(await scalar("select count(*)::int from public.gmail_task_changes where state='pending'"),0);
  });
  await t.test('task completion alone does not spend another model call on a later thread message',async()=>{
   const slides=(await q('select revision from public.tasks where id=$1',[slidesId]))[0];
   await auth('storage_action',{p_kind:'task',p_id:slidesId,p_action:'complete',p_revision:slides.revision,p_fields:null});
   const before=modelCalls;assert.equal((await proc()(input(U))).reused,true);assert.equal(modelCalls,before);
  });
  await t.test('cancelled tasks only allow deletion, and deleting suppresses the approved change source',async()=>{
   const C=message('m-cancel',3,'The research report is cancelled.');
   script['m-cancel']=(p,e)=>({taskChanges:p.existingTaskContext.filter(c=>c.id===reportId).map(c=>({topicRelevance:'relevant',kind:'cancel',targetTaskId:c.id,expectedRevision:c.revision,changedFields:[],fields:null,reason:'Explicit cancellation.',evidence:e}))});
   await proc()(input(C));
   const change=(await q("select * from public.gmail_task_changes where kind='cancel' and state='pending'"))[0];
   await auth('gmail_change_review',{p_id:change.id,p_revision:change.revision,p_action:'approve'});
   const report=(await q('select * from public.tasks where id=$1',[reportId]))[0];assert.ok(report.cancelled_at);
   await assert.rejects(auth('storage_action',{p_kind:'task',p_id:reportId,p_action:'complete',p_revision:report.revision,p_fields:null}),{code:'PT409'});
   await assert.rejects(auth('storage_action',{p_kind:'task',p_id:reportId,p_action:'preview_calendar',p_revision:report.revision,p_fields:{title:'Fictional',allDay:true,date:'2026-11-09',timeZone:'America/Chicago'}}),{code:'PT409'});
   await auth('storage_action',{p_kind:'task',p_id:reportId,p_action:'delete',p_revision:report.revision,p_fields:null});
   await assert.rejects(proc()(input(C)),{code:'STORAGE_SUPPRESSED'});
  });
  await t.test('source deletion purges retained metadata and is reported to retrieval',async()=>{
   const source=(await q("select * from public.storage_sources where message_id='m-reply'"))[0];
   assert.ok(source.permission_metadata);
   await auth('storage_action',{p_kind:'source',p_id:source.id,p_action:'delete',p_revision:null,p_fields:null});
   const after=(await q('select * from public.storage_sources where id=$1',[source.id]))[0];
   assert.equal(after.permission_metadata,null);
   assert.equal(await scalar('select count(*)::int from private.gmail_result_cache where source_id=$1',[source.id]),0);
   assert.equal(await scalar('select count(*)::int from private.storage_jobs where source_id=$1 and gmail_guard is not null',[source.id]),0);
   assert.ok((await rpc('gmail_suppressed_messages',{p_user:A,p_lease:work.lease})).includes('m-reply'));
  });
  await t.test('cleanup removes expired proposal text but keeps approved provenance',async()=>{
   await q("update public.gmail_task_changes set expires_at=now()-interval '1 day'");
   await as('service_role',()=>scalar('select public.storage_cleanup()'));
   assert.equal(await scalar("select count(*)::int from public.gmail_task_changes where state<>'approved'"),0);
   const kept=await q("select fields,baseline,reason from public.gmail_task_changes where state='approved'");
   assert.ok(kept.every(row=>row.fields===null&&row.baseline===null&&row.reason==='Expired.'));
  });
 } finally {await db.close();}
});
