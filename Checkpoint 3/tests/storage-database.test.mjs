// PostgreSQL semantics without Docker. Auth/RPC HTTP behavior still needs the
// real Supabase stack; this harness does not replace those integration tests.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { PGlite } from '../app/node_modules/@electric-sql/pglite/dist/index.js';
import { createStoredProcessor } from '../app/supabase/functions/_shared/storage.mjs';
import { createFixtureHandler } from '../app/supabase/functions/_shared/fixture-handler.mjs';
import { extract, prepareInput } from '../app/pipeline/core.mjs';
import schema from '../app/prompts/extraction.schema.mjs';

const A='11111111-1111-4111-8111-111111111111', B='22222222-2222-4222-8222-222222222222';
const key = (n) => n.toString(16).padStart(64,'0');
const fields = { action: 'Upload response', requirements: ['Use Canvas'], condition: null,
  deadline: {date:'2026-10-07',time:'17:00',timeZone:'America/Chicago',wording:'by October 7 at 5 pm',boundary:'by'} };
const output = (owner='student@example.org') => ({ status:'extracted',needsReview:false,contextWarnings:[],
  modelCalls:1,returnedModelVersion:'test-model',usage:{totalTokens:1200},result:{
    category:'Actionable',confidence:95,summary:'Upload response.',evidence:{messageId:'E01',quote:'Please upload'},
    tasks:[{...fields,owner,evidence:{messageId:'E01',quote:'Please upload'}}],waitingFor:[],suggestedFollowUps:[],uncertainties:[]}});
const meta = (message='E01') => ({namespace:'fixture',messageId:message,threadId:`thread-${message}`,
  subject:'Fictional assignment',sender:'teacher@example.org',sentAt:'2026-10-05T07:30:00-05:00',analysisTime:'2026-10-05T09:00:00-05:00',version:'test-v1',model:'test-model'});

test('PostgreSQL storage migrations, transactions, privileges and lifecycle', async (t) => {
  const db = new PGlite();
  const query = async(sql, args=[]) => (await db.query(sql,args)).rows;
  const scalar = async(sql,args=[]) => Object.values((await query(sql,args))[0])[0];
  const as = async(role,user,fn) => {
    await db.exec(`set role ${role}`);
    await query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({sub:user,role})]);
    try { return await fn(); } finally { await db.exec('reset role'); }
  };
  const rpc = (name,args) => scalar(`select public.${name}(${args.map((_,i)=>`$${i+1}`).join(',')})`,args);
  const claim = (user,n,message='E01') => as('service_role',user,()=>rpc('storage_claim',[user,key(n),key(999),meta(message),12000]));
  const finish = (user,lease,data=output(user===A?'student@example.org':'b@example.org')) => as('service_role',user,()=>rpc('storage_finish',[user,lease.jobId,lease.leaseToken,data,meta()]));
  const action = (kind,id,verb,revision=0,doc=null,user=A) => as('authenticated',user,()=>rpc('storage_action',[kind,id,verb,revision,doc]));
  try {
    await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
      create schema auth; grant usage on schema auth to anon,authenticated,service_role;
      create table auth.users(id uuid primary key,email text);
      create function auth.uid() returns uuid language sql stable as $$select (nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub')::uuid$$;
      grant execute on function auth.uid() to public;`);
    await query('insert into auth.users values($1,$2),($3,$4)',[A,'student@example.org',B,'b@example.org']);
    const migrations=new URL('../app/supabase/migrations/',import.meta.url);
    for (const name of (await readdir(migrations)).filter((n)=>n.endsWith('.sql')).sort()) {
      await db.exec(await readFile(new URL(name,migrations),'utf8'));
      if(name.endsWith('tasks_access.sql')) {
        await query("insert into public.tasks(user_id,title,status) values($1,'Legacy task','pending')",[A]);
      }
    }
    // Semantic tests use fake inference; the shared limiter is tested separately.
    await query("insert into private.storage_provider_limits(model,requests_per_minute) values('test-model',1000)");
    await t.test('additive migration preserves legacy rows and nullable normalized fields',async()=>{
      assert.equal(await scalar("select count(*) from public.tasks where title='Legacy task' and accepted_fields is null"),1);
    });
    await t.test('anonymous and browser roles cannot create privileged model records',async()=>{
      await as('anon',A,()=>assert.rejects(query('select * from public.tasks'),{code:'42501'}));
      await as('authenticated',A,()=>assert.rejects(rpc('storage_claim',[A,key(1),key(999),meta(),12000]),{code:'42501'}));
      await as('authenticated',A,()=>assert.rejects(query("insert into public.tasks(user_id,title) values($1,'Forged')",[A]),{code:'42501'}));
    });
    await t.test('uncertain Passive extraction persists warnings and evidence without creating a task', async()=>{
      const lease=await claim(B,850,'E12');
      const data=output('b@example.org');
      data.needsReview=true; data.contextWarnings=['Earlier discussion is unavailable.'];
      data.result.category='Passive'; data.result.tasks=[];
      data.result.uncertainties=['Have you agreed to attend?'];
      const saved=await finish(B,lease,data);
      assert.equal(saved.suggestionCount,0);
      const row=(await as('authenticated',B,()=>query('select * from public.storage_extractions where id=$1',[saved.extractionId])))[0];
      assert.equal(row.needs_review,true);
      assert.deepEqual(row.warnings,['Earlier discussion is unavailable.','Have you agreed to attend?']);
      assert.equal(await scalar('select count(*) from public.storage_evidence where extraction_id=$1',[row.id]),1);
      assert.equal(await scalar('select count(*) from public.tasks where user_id=$1',[B]),0);
    });
    let receipt, suggestion, taskId;
    await t.test('claim reserves once and prevents overlapping inference',async()=>{
      const lease=await claim(A,1); assert.equal(lease.state,'claimed');
      await assert.rejects(finish(A,{...lease,leaseToken:null}),{code:'PT409'});
      assert.equal((await claim(A,1)).state,'busy');
      receipt=await finish(A,lease);
      assert.equal(receipt.suggestionCount,1);
      const cached=await claim(A,1); assert.equal(cached.state,'cached');
      assert.equal(cached.receipt.extractionId,receipt.extractionId);
      assert.equal(await scalar('select requests from private.storage_usage where user_id=$1',[A]),1);
      assert.equal(await scalar('select charged_or_reserved_tokens from private.storage_usage where user_id=$1',[A]),1200);
      assert.deepEqual(await finish(A,lease),receipt);
      suggestion=(await query('select * from public.storage_suggestions where extraction_id=$1',[receipt.extractionId]))[0];
    });
    await t.test('evidence is normalized; expiry immediately hides it before cleanup',async()=>{
      assert.equal((await as('authenticated',A,()=>query('select * from public.storage_evidence'))).length,2);
      await query("update public.storage_evidence set expires_at=now()-interval '1 second' where id=$1",[suggestion.evidence_id]);
      assert.equal((await as('authenticated',A,()=>query('select * from public.storage_evidence'))).length,1);
      await as('service_role',A,()=>rpc('storage_cleanup',[]));
      assert.equal(await scalar('select quote is null from public.storage_evidence where id=$1',[suggestion.evidence_id]),true);
    });
    await t.test('cross-user relations and review attempts are rejected',async()=>{
      await action('suggestion',suggestion.id,'approve',0,null,B).then(()=>assert.fail('cross-user approval'),e=>assert.equal(e.code,'42501'));
      await assert.rejects(query('insert into public.storage_evidence(user_id,extraction_id,message_id,quote) values($1,$2,$3,$4)',[B,receipt.extractionId,'E01','Forged']),{code:'23503'});
      assert.equal((await as('authenticated',B,()=>query('select * from public.storage_suggestions'))).length,0);
    });
    await t.test('approval is atomic and idempotent, preserving structured dates',async()=>{
      for (const revision of [null,-1]) {
        await assert.rejects(action('suggestion',suggestion.id,'approve',revision),{code:'PT409'});
      }
      taskId=(await action('suggestion',suggestion.id,'approve')).taskId;
      assert.equal((await action('suggestion',suggestion.id,'approve')).taskId,taskId);
      const task=(await query('select * from public.tasks where id=$1',[taskId]))[0];
      assert.deepEqual(task.accepted_fields.deadline,fields.deadline);
      assert.equal(task.due_at,null);
      assert.equal(await scalar('select count(*) from public.storage_task_sources where task_id=$1',[taskId]),1);
    });
    await t.test('edits use revisions and rescans do not overwrite accepted values',async()=>{
      await action('task',taskId,'edit',0,{...fields,action:'My corrected title',deadline:null});
      await assert.rejects(action('task',taskId,'edit',0,fields),{code:'PT409'});
      await claim(A,1);
      assert.equal(await scalar('select title from public.tasks where id=$1',[taskId]),'My corrected title');
    });
    await t.test('completion, undo and recompletion have correct retention state',async()=>{
      await action('task',taskId,'complete',1);
      assert.equal(await scalar('select delete_after=completed_at+interval \'30 days\' from public.tasks where id=$1',[taskId]),true);
      await action('task',taskId,'undo',2);
      assert.equal(await scalar('select completed_at is null and delete_after is null from public.tasks where id=$1',[taskId]),true);
      await as('service_role',A,()=>rpc('storage_cleanup',[]));
      assert.equal(await scalar('select count(*) from public.tasks where id=$1',[taskId]),1);
      await action('task',taskId,'complete',3);
      await action('task',taskId,'undo',4);
    });
    await t.test('invalid child data rolls back extraction and sibling writes',async()=>{
      const lease=await claim(A,2,'E02'); const bad=output();
      bad.result.tasks.push({...bad.result.tasks[0],owner:'attacker@example.org'});
      await assert.rejects(finish(A,lease,bad),{code:'22023'});
      assert.equal(await scalar('select count(*) from public.storage_extractions where extraction_key=$1',[key(2)]),0);
      await as('service_role',A,()=>rpc('storage_fail',[A,lease.jobId,lease.leaseToken,'unavailable']));
      assert.equal((await claim(A,2,'E02')).state,'retry_later');
    });
    await t.test('pause invalidates in-flight results and resume allows new work',async()=>{
      const lease=await claim(A,3,'E03');
      await action('processing',null,'pause');
      await assert.rejects(finish(A,lease),{code:'PT409'});
      assert.equal((await claim(A,4,'E04')).state,'paused');
      await action('processing',null,'resume');
    });
    await t.test('expired/replaced leases cannot commit and unknown failure reservations remain',async()=>{
      const old=await claim(A,5,'E05');
      await query("update private.storage_jobs set lease_until=now()-interval '1 second' where id=$1",[old.jobId]);
      const replacement=await claim(A,5,'E05'); assert.notEqual(replacement.leaseToken,old.leaseToken);
      await assert.rejects(finish(A,old),{code:'PT409'});
      await finish(A,replacement);
    });
    await t.test('passive results save digest/waiting-for and separate suggested follow-ups',async()=>{
      const lease=await claim(A,19,'E19'); const data=output();
      data.result.category='Passive'; data.result.tasks=[];
      data.result.waitingFor=[{action:'Return form',owner:'alex@example.org',promisedDeadline:fields.deadline,evidence:{messageId:'E19',quote:'I will return it'}}];
      data.result.suggestedFollowUps=[{action:'Follow up',recipient:'alex@example.org',waitingForIndex:0,rationale:'Promised date passed; no resolution visible.',evidence:{messageId:'E19',quote:'I will return it'}}];
      const saved=await finish(A,lease,data); assert.equal(saved.suggestionCount,0); assert.equal(saved.waitingForCount,1);
      const waiting=(await query('select * from public.storage_waiting_for where extraction_id=$1',[saved.extractionId]))[0];
      const followup=(await query('select * from public.storage_followups where waiting_for_id=$1',[waiting.id]))[0];
      await action('followup',followup.id,'remind',0,{reminderAt:'2026-11-05T15:00:00Z'});
      await action('waiting',waiting.id,'resolve');
      assert.equal(await scalar('select confirmed_reminder_at is null from public.storage_followups where id=$1',[followup.id]),true);
    });
    await t.test('budgets are reserved atomically and do not silently consume deferred work',async()=>{
      await query('update public.storage_preferences set daily_requests=1 where user_id=$1',[A]);
      const before=await scalar('select requests from private.storage_usage where user_id=$1',[A]);
      assert.equal((await claim(A,6,'E06')).state,'budget_deferred');
      assert.equal(await scalar('select requests from private.storage_usage where user_id=$1',[A]),before);
      await query('update public.storage_preferences set daily_requests=100 where user_id=$1',[A]);
    });
    await t.test('dismissal, restoration and user edits keep original model fields intact',async()=>{
      const lease=await claim(A,10,'E10'); const data=output();
      data.result.tasks.push({...data.result.tasks[0],action:'Send portfolio'});
      const saved=await finish(A,lease,data); assert.equal(saved.suggestionCount,2);
      const row=(await query('select * from public.storage_suggestions where extraction_id=$1 order by item_index',[saved.extractionId]))[0];
      await action('suggestion',row.id,'edit',0,{...fields,action:'My reviewed action'});
      await action('suggestion',row.id,'dismiss',1);
      assert.equal((await claim(A,10,'E10')).state,'cached');
      await action('suggestion',row.id,'restore',2);
      const approved=await action('suggestion',row.id,'approve',3);
      assert.equal(await scalar('select fields->>\'action\' from public.storage_suggestions where id=$1',[row.id]),fields.action);
      assert.equal(await scalar('select title from public.tasks where id=$1',[approved.taskId]),'My reviewed action');
    });
    await t.test('incoming updates are proposals, idempotent, and reject stale acceptance',async()=>{
      const lease=await claim(B,11,'E11'); const saved=await finish(B,lease);
      const row=(await query('select * from public.storage_suggestions where extraction_id=$1',[saved.extractionId]))[0];
      const target=(await action('suggestion',row.id,'approve',0,null,B)).taskId;
      const proposed={...fields,action:'Proposed deadline update'};
      const propose=(revision)=>as('service_role',B,()=>rpc('storage_propose_update',[B,target,revision,saved.extractionId,row.evidence_id,proposed]));
      const first=await propose(0); assert.equal(await propose(0),first);
      assert.equal(await scalar('select title from public.tasks where id=$1',[target]),fields.action);
      await action('task',target,'edit',0,{...fields,action:'Manual correction'},B);
      await assert.rejects(action('suggestion',first,'approve',0,null,B),{code:'PT409'});
      const current=await propose(1);
      await action('suggestion',current,'approve',0,null,B);
      assert.equal(await scalar('select title from public.tasks where id=$1',[target]),proposed.action);
    });
    await t.test('date-only, missing and exclusive boundaries survive; invalid edits fail',async()=>{
      for(const deadline of [null,{...fields.deadline,time:null},{...fields.deadline,boundary:'before'}]){
        assert.equal(await scalar('select private.valid_task_fields($1)',[{...fields,deadline}]),true);
      }
      for(const doc of [{...fields,owner:'spoofed'}, {...fields,deadline:{...fields.deadline,date:'2026-02-30'}},
        {...fields,deadline:{...fields.deadline,time:'24:00'}}, {...fields,requirements:[100]}]){
        assert.equal(await scalar('select private.valid_task_fields($1)',[doc]),false);
      }
    });
    await t.test('source deletion removes extracted content and fences in-flight/new-version work',async()=>{
      const lease=await claim(A,12,'E12'); const saved=await finish(A,lease);
      const row=(await query('select * from public.storage_suggestions where extraction_id=$1',[saved.extractionId]))[0];
      const retained=(await action('suggestion',row.id,'approve')).taskId;
      const inFlight=await claim(A,112,'E12');
      await action('source',saved.sourceId,'delete');
      await assert.rejects(finish(A,inFlight),{code:'PT409'});
      assert.equal((await claim(A,212,'E12')).state,'suppressed');
      assert.equal((await as('authenticated',A,()=>query('select * from public.storage_extractions where id=$1',[saved.extractionId]))).length,0);
      assert.equal((await as('authenticated',A,()=>query('select * from public.storage_suggestions where id=$1',[row.id]))).length,0);
      assert.equal(await scalar('select count(*) from public.tasks where id=$1',[retained]),1);
      assert.equal(await scalar('select count(*) from public.storage_evidence where extraction_id=$1 and quote is not null',[saved.extractionId]),0);
    });
    await t.test('activity exposes only the authenticated owner totals',async()=>{
      const aa=await as('authenticated',A,()=>rpc('storage_activity',[]));
      const bb=await as('authenticated',B,()=>rpc('storage_activity',[]));
      assert.ok(aa.requestsToday>bb.requestsToday);
      await as('anon',A,()=>assert.rejects(rpc('storage_activity',[]),{code:'42501'}));
    });
    await t.test('shared provider limits coordinate users before charging per-user budgets',async()=>{
      await db.exec('begin');
      try {
        await query("insert into private.storage_provider_limits(model,requests_per_minute) values('limited-model',1)");
        const limitedMeta={...meta('E13'),model:'limited-model'};
        const first=await as('service_role',A,()=>rpc('storage_claim',[A,key(313),key(999),limitedMeta,12000]));
        assert.equal(first.state,'claimed');
        const before=await scalar('select requests from private.storage_usage where user_id=$1',[B]);
        const deferred=await as('service_role',B,()=>rpc('storage_claim',[B,key(314),key(999),{...limitedMeta,messageId:'E14'},12000]));
        assert.equal(deferred.state,'provider_deferred');
        assert.equal(await scalar('select requests from private.storage_usage where user_id=$1',[B]),before);
      } finally { await db.exec('rollback'); }
    });
    await t.test('expired completed tasks are purged while active accepted tasks survive',async()=>{
      const expired=await scalar("insert into public.tasks(user_id,title,status,completed_at,delete_after) values($1,'Expired completed task','completed',now()-interval '31 days',now()-interval '1 day') returning id",[A]);
      const active=await scalar("insert into public.tasks(user_id,title,status) values($1,'Active task','approved') returning id",[A]);
      await as('service_role',A,()=>rpc('storage_cleanup',[]));
      assert.equal(await scalar('select count(*) from public.tasks where id=$1',[expired]),0);
      assert.equal(await scalar('select count(*) from public.tasks where id=$1',[active]),1);
    });
    await t.test('calendar storage requires separate approval and refuses stale task previews',async()=>{
      const first=await action('task',taskId,'preview_calendar',5,{calendarId:'primary',title:'Response',allDay:true,date:'2026-11-04',timeZone:'America/Chicago'});
      const op=await action('task',taskId,'preview_calendar',5,{calendarId:'primary',title:'Response',allDay:true,date:'2026-11-05',timeZone:'America/Chicago'});
      assert.equal(await scalar('select state from public.storage_calendar_operations where id=$1',[op.operationId]),'pending');
      assert.equal(await scalar('select count(*) from public.storage_calendar_operations where id=$1',[first.operationId]),0,'a new preview replaces the earlier pending one');
      assert.equal(await scalar("select count(*) from public.storage_calendar_operations where task_id=$1 and state='pending'",[taskId]),1);
      await action('task',taskId,'edit',5,{...fields,action:'Changed again'});
      await assert.rejects(action('calendar',op.operationId,'approve'),{code:'PT409'});
    });
    await t.test('manual deletion hides tasks and suppresses stale extraction reuse',async()=>{
      await action('task',taskId,'delete',6);
      assert.equal((await as('authenticated',A,()=>query('select * from public.tasks where id=$1',[taskId]))).length,0);
      assert.equal((await claim(A,1)).state,'suppressed');
      assert.equal((await claim(A,1001)).state,'suppressed');
      await as('service_role',A,()=>rpc('storage_cleanup',[]));
      assert.equal(await scalar('select count(*) from public.tasks where id=$1',[taskId]),0);
    });
    await t.test('account deletion cascades storage and blocks late writes',async()=>{
      const lease=await claim(B,20,'E20');
      await query('delete from auth.users where id=$1',[B]);
      await assert.rejects(finish(B,lease),{code:'PT409'});
      await assert.rejects(claim(B,20,'E20'),{code:'42501'});
    });
    await t.test('HTTP handler, canonical validator, SQL persistence and cache work together',async()=>{
      const fixture=JSON.parse(await readFile(new URL('./fixtures/cp2-inbox.json',import.meta.url)));
      const settings=JSON.parse(await readFile(new URL('../app/prompts/model-settings.json',import.meta.url)));
      const systemPrompt=await readFile(new URL('../app/prompts/extraction.system.txt',import.meta.url),'utf8');
      let modelCalls=0;
      const process=createStoredProcessor({settings,systemPrompt,schema,prepareInput,
        rpc:(name,args)=>as('service_role',A,()=>scalar(`select public.${name}(${Object.keys(args).map((key,i)=>`${key} => $${i+1}`).join(',')})`,Object.values(args))),
        extractFn:(input)=>extract(input,{settings,systemPrompt,generate:async()=>{
          modelCalls++;
          return {usage:{totalTokens:1200},value:{category:'Actionable',confidence:95,
            evidence:{messageId:'E16',quote:'Could you send a working link soon?'},explanation:'The sender requests a working portfolio link.',
            summary:'Nia requests a working portfolio link.',tasks:[{action:'Send a working portfolio link',owner:'student@example.org',
              deadline:null,condition:null,requirements:[],evidence:{messageId:'E16',quote:'Could you send a working link soon?'}}],
            waitingFor:[],suggestedFollowUps:[],uncertainties:[]}};
        }})});
      const handler=createFixtureHandler({fixture,enabled:true,verifyUser:async()=>({id:A,email:'student@example.org'}),runExtraction:process});
      const request=()=>new Request('http://local/analysis_email',{method:'POST',headers:{authorization:'Bearer test-user', 'content-type':'application/json'},body:'{"caseId":"E16"}'});
      const first=await handler(request()); assert.equal(first.status,200);
      const firstResult=await first.json(); assert.equal(firstResult.saved,true);
      const again=await (await handler(request())).json(); assert.equal(again.output.reused,true);
      assert.equal(again.output.receipt.extractionId,firstResult.output.receipt.extractionId);
      assert.equal(modelCalls,1);
      const pending=(await query('select * from public.storage_suggestions where extraction_id=$1',[firstResult.output.receipt.extractionId]))[0];
      const approved=await action('suggestion',pending.id,'approve');
      assert.equal(await scalar('select title from public.tasks where id=$1',[approved.taskId]),'Send a working portfolio link');
      assert.equal(await scalar('select accepted_fields->\'deadline\' from public.tasks where id=$1',[approved.taskId]),null);
    });
  } finally { await db.close(); }
});
