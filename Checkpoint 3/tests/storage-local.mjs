// Explicit integration trial against THIS project's running local stack only.
// Creates two temporary fictional Auth users and deletes them in finally.
// No model calls. Credentials stay in memory and are never printed.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { randomUUID, createHash } from 'node:crypto';
import { createGmailProcessor } from '../app/pipeline/gmail-processor.mjs';
import { createStorageRpc } from '../app/supabase/functions/_shared/storage.mjs';

const app = fileURLToPath(new URL('../app/', import.meta.url));
const cli = fileURLToPath(new URL('../app/node_modules/supabase/dist/supabase.js', import.meta.url));
const status = JSON.parse(execFileSync(process.execPath,[cli,'--agent','no','status','-o','json'],
  {cwd:app,encoding:'utf8',stdio:['ignore','pipe','pipe']}));
const base = status.API_URL;
assert.ok(['http://127.0.0.1:54321','http://localhost:54321'].includes(base), 'Local URL required');
assert.ok(status.ANON_KEY && status.SERVICE_ROLE_KEY, 'Local legacy JWT keys required');
const users=[];
let checks=0;
async function request(path,{method='GET',body,key=status.ANON_KEY,token=key}={}) {
  const response=await fetch(`${base}${path}`,{method,headers:{apikey:key,Authorization:`Bearer ${token}`,
    'Content-Type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)}),signal:AbortSignal.timeout(15000)});
  const data=await response.json().catch(()=>null);
  return {status:response.status,data};
}
async function service(name,body) {
  const result=await request(`/rest/v1/rpc/${name}`,{method:'POST',body,key:status.SERVICE_ROLE_KEY});
  assert.equal(result.status,200,`${name}: HTTP ${result.status} (${result.data?.code ?? 'unknown'})`);
  return result.data;
}
async function userRequest(user,path,options={}) { return request(path,{...options,token:user.token}); }
async function action(user,kind,id,verb,revision=0,fields=null,expected=200) {
  const result=await userRequest(user,'/rest/v1/rpc/storage_action',{method:'POST',body:{
    p_kind:kind,p_id:id,p_action:verb,p_revision:revision,p_fields:fields}});
  assert.equal(result.status,expected,`${kind}/${verb}: HTTP ${result.status}`);
  return result.data;
}
function check(label) { checks++; console.log(`PASS ${label}`); }
try {
  for(let i=0;i<2;i++) {
    const email=`storage-${randomUUID()}@example.test`,password=`Local-${randomUUID()}!`;
    const created=await request('/auth/v1/admin/users',{method:'POST',key:status.SERVICE_ROLE_KEY,
      body:{email,password,email_confirm:true}});
    assert.equal(created.status,200,'Create fictional local Auth user');
    const user={id:created.data.id,email}; users.push(user);
    const signed=await request('/auth/v1/token?grant_type=password',{method:'POST',body:{email,password}});
    assert.equal(signed.status,200,'Password sign-in'); user.token=signed.data.access_token;
    const verified=await userRequest(user,'/auth/v1/user'); assert.equal(verified.data.id,user.id);
  }
  const [a,b]=users; check('real Auth creates, signs in, and verifies two isolated users');
  const anonymousEdge=await request('/functions/v1/analysis_email',{method:'POST',body:{caseId:'E01'}});
  assert.equal(anonymousEdge.status,401);
  const disabledEdge=await userRequest(a,'/functions/v1/analysis_email',{method:'POST',body:{caseId:'E01'}});
  assert.equal(disabledEdge.status,503);
  assert.equal(disabledEdge.data?.error,'FIXTURE_EXTRACTION_DISABLED');
  check('actual Edge Runtime rejects anonymous users and keeps fixture inference disabled');
  const hash=(s)=>createHash('sha256').update(s).digest('hex');
  const extractionKey=hash(randomUUID()),configKey=hash('local-integration-v1');
  const meta={namespace:'fixture',messageId:'E01',threadId:'local-trial',subject:'Fictional storage trial',
    sender:'teacher@example.test',sentAt:'2026-11-04T09:00:00Z',analysisTime:'2026-11-04T10:00:00Z',
    version:'local-trial-v1',model:'local-storage-test'};
  const claimArgs={p_user_id:a.id,p_key:extractionKey,p_config:configKey,p_meta:meta,p_reserve:12000};
  const denied=await userRequest(a,'/rest/v1/rpc/storage_claim',{method:'POST',body:claimArgs});
  assert.ok(denied.status>=400); check('browser role cannot invoke privileged claim');
  const lease=await service('storage_claim',claimArgs); assert.equal(lease.state,'claimed');
  const fields={action:'Submit fictional response',requirements:[],condition:null,
    deadline:{date:'2026-11-06',time:null,timeZone:'America/Chicago',wording:'by November 6',boundary:'by'}};
  const output={status:'extracted',needsReview:false,contextWarnings:[],modelCalls:0,returnedModelVersion:'local-storage-test',
    usage:{totalTokens:123},result:{category:'Actionable',confidence:95,summary:'Fictional storage test.',
      evidence:{messageId:'E01',quote:'Please submit'},tasks:[{...fields,owner:a.email,evidence:{messageId:'E01',quote:'Please submit'}}],
      waitingFor:[],suggestedFollowUps:[],uncertainties:[]}};
  const finishArgs={p_user_id:a.id,p_job_id:lease.jobId,p_lease:lease.leaseToken,p_output:output,p_meta:meta};
  const badLease=await request('/rest/v1/rpc/storage_finish',{method:'POST',key:status.SERVICE_ROLE_KEY,body:{...finishArgs,p_lease:null}});
  assert.equal(badLease.data?.code,'PT409');
  const receipt=await service('storage_finish',finishArgs); assert.equal(receipt.suggestionCount,1);
  const cached=await service('storage_claim',claimArgs); assert.equal(cached.state,'cached');
  assert.equal(cached.receipt.extractionId,receipt.extractionId); check('real PostgREST claim/finish/cache and NULL lease fencing');
  const own=await userRequest(a,'/rest/v1/storage_suggestions?select=*'); assert.equal(own.status,200); assert.equal(own.data.length,1);
  const suggestion=own.data[0];
  const other=await userRequest(b,'/rest/v1/storage_suggestions?select=*'); assert.equal(other.status,200); assert.equal(other.data.length,0);
  const anon=await request('/rest/v1/storage_suggestions?select=*'); assert.ok(anon.status>=400);
  await action(b,'suggestion',suggestion.id,'approve',0,null,403);
  await action(a,'suggestion',suggestion.id,'approve',null,null,409);
  check('actual JWT/RLS isolation, anonymous denial, cross-owner denial, NULL revision rejection');
  const approved=await action(a,'suggestion',suggestion.id,'approve');
  assert.equal((await action(a,'suggestion',suggestion.id,'approve')).taskId,approved.taskId);
  const reload=await userRequest(a,`/rest/v1/tasks?id=eq.${approved.taskId}&select=*`);
  assert.equal(reload.data[0].accepted_fields.deadline.time,null);
  assert.equal(reload.data[0].status,'approved');
  await action(a,'task',approved.taskId,'complete',0);
  await action(a,'task',approved.taskId,'undo',1);
  await action(a,'task',approved.taskId,'edit',0,fields,409);
  check('approval survives API reload; idempotency, date-only values, completion/undo, stale edits');
  await action(a,'processing',null,'pause');
  assert.equal((await service('storage_claim',claimArgs)).state,'paused');
  await action(a,'processing',null,'resume');
  const activity=await userRequest(a,'/rest/v1/rpc/storage_activity',{method:'POST',body:{}});
  assert.equal(activity.status,200);
  await action(a,'task',approved.taskId,'delete',2);
  assert.equal((await service('storage_claim',claimArgs)).state,'suppressed');
  check('processing pause/resume, activity, deletion suppression');
  const rpc=(user,name,body={})=>userRequest(user,`/rest/v1/rpc/${name}`,{method:'POST',body});
  const initial=await rpc(a,'scan_settings_get');assert.equal(initial.status,200);
  const phraseSettings={p_revision:initial.data.revision,p_rules:{
    allow:{labels:[],domains:[],keywords:[],senders:['teacher@example.org'],subjectKeywords:[]},
    block:{labels:[],senders:[],domains:[],keywords:[],subjectKeywords:['old subject']},
  },p_semantic:{include:[' School ','school'],exclude:['Financial']},p_context:initial.data.context_limits,p_consent:false,p_paused:true,p_disclosure:null};
  const saved=await rpc(a,'scan_settings_save',phraseSettings);assert.equal(saved.status,200);
  assert.deepEqual(saved.data.semantic_preferences.include,['school']);assert.equal(saved.data.consent,false);
  assert.deepEqual((await rpc(a,'scan_settings_get')).data.rules.block.subjectKeywords,['old subject']);
  assert.equal((await rpc(a,'scan_settings_save',phraseSettings)).status,409);
  assert.deepEqual((await rpc(b,'scan_settings_get')).data.rules.allow.keywords,[]);
  assert.ok((await request('/rest/v1/rpc/scan_settings_get',{method:'POST',body:{}})).status>=400);
  const scanAnonymous=await request('/functions/v1/gmail_scan',{method:'POST',body:{mode:'initial'}});assert.equal(scanAnonymous.status,401);
  const scanDisabled=await userRequest(a,'/functions/v1/gmail_scan',{method:'POST',body:{mode:'initial'}});assert.equal(scanDisabled.status,503);assert.equal(scanDisabled.data.error,'GMAIL_SCAN_DISABLED');
  check('source and semantic settings persist through HTTP, normalize, isolate owners and reject stale saves without consent');
  const scanBody={p_user:a.id,p_action:'claim',p_data:{mode:'initial'}};
  assert.equal((await userRequest(a,'/rest/v1/rpc/gmail_scan_service',{method:'POST',body:scanBody})).status,403);
  assert.equal((await request('/rest/v1/rpc/gmail_scan_service',{method:'POST',body:scanBody,key:status.SERVICE_ROLE_KEY})).status,409);
  const stateHash='c'.repeat(64);
  await service('google_connection_service',{p_user:a.id,p_action:'start',p_data:{hash:stateHash,email:a.email,verifier:'fictional-ciphertext'}});
  const pending=await service('google_connection_service',{p_user:null,p_action:'consume',p_data:{hash:stateHash}});
  await service('google_connection_service',{p_user:a.id,p_action:'finish',p_data:{generation:pending.generation,email:a.email,subject:'12345',credentials:'fictional-ciphertext',scopes:['https://www.googleapis.com/auth/gmail.readonly'],expiresAt:'2099-01-01T00:00:00Z'}});
  const consentSettings={...phraseSettings,p_revision:saved.data.revision,p_consent:true,p_paused:false,p_disclosure:'gmail-scan-v1'};
  const consentSaved=await rpc(a,'scan_settings_save',consentSettings);assert.equal(consentSaved.status,200);
  const scanClaim=await service('gmail_scan_service',scanBody);assert.equal(scanClaim.state,'claimed');
  assert.equal((await service('gmail_scan_service',scanBody)).state,'busy');
  assert.equal((await service('gmail_scan_service',{p_user:a.id,p_action:'assert',p_data:{lease:scanClaim.lease}})).state,'current');
  const paused=await rpc(a,'scan_settings_save',{...consentSettings,p_revision:consentSaved.data.revision,p_paused:true});assert.equal(paused.status,200);
  assert.equal((await request('/rest/v1/rpc/gmail_scan_service',{method:'POST',body:{p_user:a.id,p_action:'assert',p_data:{lease:scanClaim.lease}},key:status.SERVICE_ROLE_KEY})).status,409);
  check('manual scan HTTP coordination denies browser roles, requires consent, serializes claims and fences changed settings (fictional connection, no Gmail calls)');

  // Persistence through real Auth/PostgREST with the real transport. The model is an
  // injected fictional function: no Gmail or Gemini request happens here.
  const owner=b,gmailLimits={maxMessages:5,maxAgeDays:90,maxMessageChars:12000,maxTotalChars:24000};
  const gmailRules={allow:{labels:[],keywords:[],senders:['teacher@example.org'],domains:[],subjectKeywords:[]},block:{labels:[],keywords:[],senders:[],domains:[],subjectKeywords:[]}};
  const ownerSettings=await rpc(owner,'scan_settings_get');
  assert.equal((await rpc(owner,'scan_settings_save',{p_revision:ownerSettings.data.revision,p_rules:gmailRules,p_semantic:{include:[],exclude:[]},p_context:gmailLimits,p_consent:true,p_paused:false,p_disclosure:'gmail-scan-v1'})).status,200);
  const ownerHash='d'.repeat(64);
  await service('google_connection_service',{p_user:owner.id,p_action:'start',p_data:{hash:ownerHash,email:owner.email,verifier:'fictional-ciphertext'}});
  const ownerPending=await service('google_connection_service',{p_user:null,p_action:'consume',p_data:{hash:ownerHash}});
  await service('google_connection_service',{p_user:owner.id,p_action:'finish',p_data:{generation:ownerPending.generation,email:owner.email,subject:'67890',credentials:'fictional-ciphertext',scopes:['https://www.googleapis.com/auth/gmail.readonly'],expiresAt:'2099-01-01T00:00:00Z'}});
  const work=await service('gmail_scan_service',{p_user:owner.id,p_action:'claim',p_data:{mode:'initial'}});assert.equal(work.state,'claimed');
  assert.equal((await rpc(owner,'gmail_scan_status')).data.running,true);
  assert.equal((await rpc(a,'gmail_scan_status')).data.running,false);
  assert.ok((await request('/rest/v1/rpc/gmail_scan_status',{method:'POST',body:{}})).status>=400);
  assert.ok((await rpc(owner,'gmail_token_recheck',{p_user:owner.id})).status>=400,'gmail_token_recheck denied to browser roles');
  for(const name of ['gmail_task_context','gmail_process_claim','gmail_process_finish','gmail_process_assert','gmail_suppressed_messages']) {
    const denied=await rpc(owner,name,{p_user:owner.id,p_lease:work.lease});assert.ok(denied.status>=400,`${name} denied to browser roles`);
  }
  check('safe scan status is owner-scoped and service-only Gmail RPCs reject browser roles');
  const transport=createStorageRpc({url:base,serviceKey:status.SERVICE_ROLE_KEY});let modelCalls=0;
  const generate=async({payload})=>{
    modelCalls++;const evidence={messageId:payload.currentMessage.id,quote:payload.currentMessage.body};
    const target=payload.existingTaskContext[0],isUpdate=payload.currentMessage.id==='fictional-update';
    return {attempts:1,usage:{totalTokens:10},latencyMs:1,value:{category:'Actionable',confidence:90,summary:'Fictional.',explanation:'Fictional.',evidence,waitingFor:[],suggestedFollowUps:[],uncertainties:[],
      topicRelevance:{decision:'relevant',reason:'No topic limits.'},
      tasks:isUpdate?[]:[{action:'Submit fictional report',requirements:[],condition:null,deadline:null,owner:owner.email,evidence,topicRelevance:'relevant'}],
      taskChanges:isUpdate?[{topicRelevance:'relevant',kind:'edit',targetTaskId:target.id,expectedRevision:target.revision,changedFields:['deadline'],
        fields:{...target.acceptedFields,deadline:{date:'2026-11-09',time:null,timeZone:'America/Chicago',wording:'now due November 9',boundary:'on'}},reason:'Fictional revision.',evidence}]:[]}};
  };
  const processor=()=>createGmailProcessor({rpc:transport,user:owner,work,systemPrompt:'Fictional injected model.',generate,
    settings:{contextLimits:gmailLimits,model:'local-gmail-test',version:'local',maxOutputTokens:8192,maxAttempts:1,timeoutMs:60000}});
  const email=(id,hours,body)=>({message:{id,threadId:'fictional-thread',from:'teacher@example.org',subject:'Fictional report',labels:[],body,
    sentAt:new Date(Date.parse(work.end)-hours*3600000).toISOString()},threadContext:[],rules:gmailRules,contextLimits:gmailLimits});
  assert.equal((await processor()(email('fictional-original',3,'Please submit the fictional report.'))).saved,true);
  assert.equal((await processor()(email('fictional-original',3,'Please submit the fictional report.'))).reused,true);assert.equal(modelCalls,1);
  const pendingSuggestion=(await userRequest(owner,'/rest/v1/storage_suggestions?select=*&state=eq.pending')).data[0];
  const taskId=(await action(owner,'suggestion',pendingSuggestion.id,'approve')).taskId;
  assert.equal((await processor()(email('fictional-original',3,'Please submit the fictional report.'))).reused,true);assert.equal(modelCalls,1);
  check('real transport saves an injected extraction, reuses it on repeat, and approval causes no new inference');
  assert.equal((await processor()(email('fictional-update',1,'The fictional report is now due November 9.'))).saved,true);assert.equal(modelCalls,2);
  const proposal=(await userRequest(owner,'/rest/v1/gmail_task_changes?select=*')).data[0];
  assert.equal(proposal.target_task_id,taskId);assert.equal(proposal.expected_revision,0);
  assert.equal((await userRequest(a,'/rest/v1/gmail_task_changes?select=*')).data.length,0);
  assert.equal((await rpc(a,'gmail_change_review',{p_id:proposal.id,p_revision:0,p_action:'approve'})).status,403);
  assert.equal((await userRequest(owner,`/rest/v1/tasks?id=eq.${taskId}&select=accepted_fields`)).data[0].accepted_fields.deadline,null);
  const accepted=(await userRequest(owner,`/rest/v1/tasks?id=eq.${taskId}&select=accepted_fields`)).data[0].accepted_fields;
  await action(owner,'task',taskId,'edit',0,{...accepted,requirements:['Keep my fictional edit']});
  assert.equal((await rpc(owner,'gmail_change_review',{p_id:proposal.id,p_revision:0,p_action:'approve'})).status,409);
  assert.equal((await rpc(owner,'gmail_change_review',{p_id:proposal.id,p_revision:0,p_action:'rebase',p_task_revision:1})).status,200);
  assert.equal((await rpc(owner,'gmail_change_review',{p_id:proposal.id,p_revision:1,p_action:'approve',p_task_revision:null})).status,200);
  const updated=(await userRequest(owner,`/rest/v1/tasks?id=eq.${taskId}&select=accepted_fields`)).data[0].accepted_fields;
  assert.equal(updated.deadline.date,'2026-11-09');assert.deepEqual(updated.requirements,['Keep my fictional edit']);
  check('deadline change is a targeted proposal, isolated by owner, stale over HTTP, rebased without losing the user edit');
  const ambiguousGenerate=async({payload})=>{
    modelCalls++;const evidence={messageId:payload.currentMessage.id,quote:payload.currentMessage.body};
    return {attempts:1,usage:{totalTokens:10},latencyMs:1,value:{category:'Passive',confidence:60,summary:'Fictional.',explanation:'Fictional.',evidence,waitingFor:[],suggestedFollowUps:[],uncertainties:['Which task is this?'],tasks:[],
      topicRelevance:{decision:'relevant',reason:'No topic limits.'},taskChanges:[{topicRelevance:'relevant',kind:'edit',targetTaskId:null,expectedRevision:null,changedFields:['deadline'],fields:null,reason:'Fictional ambiguous reference.',evidence}]}};
  };
  await createGmailProcessor({rpc:transport,user:owner,work,systemPrompt:'Fictional injected model.',generate:ambiguousGenerate,
    settings:{contextLimits:gmailLimits,model:'local-gmail-test',version:'local',maxOutputTokens:8192,maxAttempts:1,timeoutMs:60000}})(email('fictional-ambiguous',0.5,'That deliverable is pushed back.'));
  const ambiguous=(await userRequest(owner,'/rest/v1/gmail_task_changes?select=*&state=eq.pending&target_task_id=is.null')).data[0];
  const resolveArgs={p_id:ambiguous.id,p_revision:0,p_task:taskId,p_task_revision:2,p_fields:{...updated,deadline:{date:'2026-11-20',time:null,timeZone:'America/Chicago',wording:'Entered by you.',boundary:'by'}}};
  assert.equal((await rpc(owner,'gmail_change_review',{p_id:ambiguous.id,p_revision:0,p_action:'approve',p_task_revision:null})).status,409);
  assert.equal((await rpc(a,'gmail_change_resolve',resolveArgs)).status,403);
  assert.ok((await request('/rest/v1/rpc/gmail_change_resolve',{method:'POST',body:resolveArgs})).status>=400);
  assert.equal((await rpc(owner,'gmail_change_resolve',{...resolveArgs,p_task_revision:1})).status,409);
  assert.equal((await rpc(owner,'gmail_change_resolve',resolveArgs)).status,200);
  assert.equal((await userRequest(owner,`/rest/v1/tasks?id=eq.${taskId}&select=accepted_fields`)).data[0].accepted_fields.deadline.date,'2026-11-20');
  check('an ambiguous proposal cannot be approved directly; the owner can resolve it with entered values, over HTTP, and other users cannot');
  const taskLinks=await rpc(owner,'gmail_task_source_links',{p_tasks:[taskId]});assert.equal(taskLinks.status,200);
  assert.deepEqual(new Set(taskLinks.data.map(l=>l.messageId)),new Set(['fictional-original','fictional-update','fictional-ambiguous']));
  assert.equal(taskLinks.data.find(l=>l.messageId==='fictional-original').role,'created');
  assert.equal(JSON.stringify(taskLinks.data).includes('fictional-ciphertext'),false);
  assert.deepEqual((await rpc(a,'gmail_task_source_links',{p_tasks:[taskId]})).data,[]);
  assert.ok((await request('/rest/v1/rpc/gmail_task_source_links',{method:'POST',body:{p_tasks:[taskId]}})).status>=400);
  check('task source links work over HTTP, return only the owner\'s sources, and reject anonymous callers');
  const gmailSource=(await userRequest(owner,'/rest/v1/storage_sources?select=id,message_id&message_id=eq.fictional-update')).data[0];
  await action(owner,'source',gmailSource.id,'delete',0);
  assert.ok((await service('gmail_suppressed_messages',{p_user:owner.id,p_lease:work.lease})).includes('fictional-update'));
  assert.equal((await service('gmail_scan_service',{p_user:owner.id,p_action:'finish',p_data:{lease:work.lease,continuation:null,result:{executionMode:'GMAIL_PERSISTENT_MANUAL',counts:{modelCalls},error:null,backlog:false}}})).state,'finished');
  const finished=(await rpc(owner,'gmail_scan_status')).data;assert.equal(finished.running,false);assert.ok(finished.lastSuccessful);assert.equal(finished.backlog,false);
  check('source deletion reaches retrieval suppression; finish records last successful batch in status');


} finally {
  let failures=0;
  for(const user of users) {
    const deleted=await request(`/auth/v1/admin/users/${user.id}`,{method:'DELETE',key:status.SERVICE_ROLE_KEY}).catch(()=>null);
    if(!deleted || deleted.status>=300) failures++;
  }
  assert.equal(failures,0,'Temporary Auth user cleanup must succeed');
}
console.log(`Passed ${checks} local integration groups; temporary users removed; zero model calls.`);
