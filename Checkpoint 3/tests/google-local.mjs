// Real local Auth/PostgREST gates with synthetic encrypted-token placeholders.
// Never contacts Google or Gemini; temporary users are removed in finally.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {randomUUID,createHash} from 'node:crypto';
const app=fileURLToPath(new URL('../app/',import.meta.url));
const cli=fileURLToPath(new URL('../app/node_modules/supabase/dist/supabase.js',import.meta.url));
const status=JSON.parse(execFileSync(process.execPath,[cli,'--agent','no','status','-o','json'],{cwd:app,encoding:'utf8',stdio:['ignore','pipe','pipe']}));
assert.ok(['http://127.0.0.1:54321','http://localhost:54321'].includes(status.API_URL),'Local stack required');
const users=[];let checks=0;
async function request(path,{body,method='POST',token=status.ANON_KEY,key=status.ANON_KEY}={}) {
  const response=await fetch(status.API_URL+path,{method,headers:{apikey:key,Authorization:`Bearer ${token}`,'Content-Type':'application/json'},
    ...(body===undefined?{}:{body:JSON.stringify(body)}),signal:AbortSignal.timeout(15000)});
  return {status:response.status,data:await response.json().catch(()=>null)};
}
const service=async(user,action,data={})=>{
  const result=await request('/rest/v1/rpc/google_connection_service',{key:status.SERVICE_ROLE_KEY,token:status.SERVICE_ROLE_KEY,
    body:{p_user:user,p_action:action,p_data:data}});
  assert.equal(result.status,200,'Service RPC must return HTTP 200');return result.data;
};
const check=(s)=>{checks++;console.log(`PASS ${s}`);};
try {
  for(let i=0;i<2;i++) {
    const email=`google-local-${randomUUID()}@example.test`,password=`Local-${randomUUID()}!`;
    const result=await request('/auth/v1/admin/users',{key:status.SERVICE_ROLE_KEY,token:status.SERVICE_ROLE_KEY,body:{email,password,email_confirm:true}});
    assert.equal(result.status,200,'Create local test account');const user={id:result.data.id,email};users.push(user);
    const signed=await request('/auth/v1/token?grant_type=password',{body:{email,password}});
    assert.equal(signed.status,200,'Local sign-in');user.token=signed.data.access_token;
  }
  const [a,b]=users;
  const statusFor=(user)=>request('/rest/v1/rpc/google_connection_status',{token:user.token,body:{}});
  assert.equal((await statusFor(a)).data.state,'disconnected');
  assert.ok((await request('/rest/v1/rpc/google_connection_status',{body:{}})).status>=400);
  assert.ok((await request('/rest/v1/rpc/google_connection_service',{token:a.token,body:{p_user:a.id,p_action:'disconnect',p_data:{}}})).status>=400);
  assert.ok((await request('/rest/v1/google_connections?select=*',{token:a.token,method:'GET'})).status>=400);
  check('real Auth and PostgREST deny anonymous status, browser service RPC and credential-table access');
  const hash=createHash('sha256').update(randomUUID()).digest('hex');
  assert.equal((await service(a.id,'start',{hash,email:a.email,verifier:'synthetic-encrypted-verifier'})).state,'started');
  const pending=await service(null,'consume',{hash});assert.equal(pending.userId,a.id);
  assert.equal((await service(null,'consume',{hash})).state,'invalid_state');
  const finish={generation:pending.generation,email:a.email,subject:'123456789',credentials:'synthetic-encrypted-credentials',
    scopes:['https://www.googleapis.com/auth/gmail.readonly'],expiresAt:'2020-01-01T00:00:00Z'};
  assert.equal((await service(a.id,'finish',{...finish,generation:null})).state,'stale');
  assert.equal((await service(a.id,'finish',finish)).state,'connected');
  const own=(await statusFor(a)).data,other=(await statusFor(b)).data;
  assert.equal(own.email,a.email);assert.equal(own.scanningEnabled,false);
  assert.ok(!JSON.stringify(own).includes('credentials'));assert.equal(other.state,'disconnected');assert.ok(!JSON.stringify(other).includes(a.email));
  check('single-use OAuth state, safe owner status, two-user isolation and NULL-generation rejection');
  const claim=await service(a.id,'refresh_claim');assert.equal(claim.state,'refresh');
  assert.equal((await service(a.id,'refresh_claim')).state,'busy');
  assert.equal((await service(a.id,'refresh_finish',{generation:claim.generation,lease:null})).state,'stale');
  const stop=await service(a.id,'disconnect');assert.equal(stop.state,'disconnecting');
  assert.equal((await service(a.id,'finish',finish)).state,'stale');
  assert.equal((await service(a.id,'refresh_finish',{generation:claim.generation,lease:claim.lease})).state,'stale');
  assert.equal((await service(a.id,'disconnect_finish',{generation:stop.generation})).state,'disconnected');
  assert.equal((await statusFor(a)).data.email,null);
  check('real HTTP refresh locking, disconnect fencing, and credential removal');
  // New Edge functions deliberately stay disabled during this no-provider trial.
  for(const name of ['google_connection','google_callback']) {
    const gate=await request(`/functions/v1/${name}`,name==='google_callback'?{method:'GET'}:{token:a.token,body:{action:'connect'}});
    assert.equal(gate.status,503,'Disabled Google Edge gate');assert.equal(gate.data?.error,'GOOGLE_NOT_CONFIGURED');
  }
  check('actual Edge Runtime keeps both Google endpoints disabled without configuration');
} finally {
  let failures=0;
  for(const user of users) {
    const result=await request(`/auth/v1/admin/users/${user.id}`,{method:'DELETE',key:status.SERVICE_ROLE_KEY,token:status.SERVICE_ROLE_KEY}).catch(()=>null);
    if(!result || result.status!==200)failures++;
  }
  assert.equal(failures,0,'Temporary local account cleanup');
}
console.log(`Passed ${checks} Google local integration groups; temporary users removed; zero Google/model calls.`);
