// Explicit integration trial against THIS project's running local stack only.
// Creates two temporary fictional Auth users and deletes them in finally.
// No model calls. Credentials stay in memory and are never printed.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { randomUUID, createHash } from 'node:crypto';

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
} finally {
  let failures=0;
  for(const user of users) {
    const deleted=await request(`/auth/v1/admin/users/${user.id}`,{method:'DELETE',key:status.SERVICE_ROLE_KEY}).catch(()=>null);
    if(!deleted || deleted.status>=300) failures++;
  }
  assert.equal(failures,0,'Temporary Auth user cleanup must succeed');
}
console.log(`Passed ${checks} local integration groups; temporary users removed; zero model calls.`);
