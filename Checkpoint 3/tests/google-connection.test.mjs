import test from 'node:test';
import assert from 'node:assert/strict';
import { createTokenCipher, createGoogleConnection, createGoogleHandler, createGoogleProvider, GMAIL_SCOPE, CALENDAR_SCOPE } from '../app/supabase/functions/_shared/google-connection.mjs';

const user={id:'11111111-1111-4111-8111-111111111111',email:'student@example.org'};
const cipher=()=>createTokenCipher({keys:JSON.stringify({v1:Buffer.alloc(32,7).toString('base64')}),activeKey:'v1'});

test('AES-GCM binds ciphertext to account, purpose and key; supports old keys during rotation',async()=>{
  const c=cipher(), sealed=await c.seal(user.id,'credentials',{refreshToken:'fictional-secret'});
  assert.ok(!sealed.includes('fictional-secret'));
  assert.deepEqual(await c.open(user.id,'credentials',sealed),{refreshToken:'fictional-secret'});
  await assert.rejects(c.open('other-user','credentials',sealed));
  await assert.rejects(c.open(user.id,'verifier',sealed));
  const parts=sealed.split('.'); parts[2]=(parts[2][0]==='A'?'B':'A')+parts[2].slice(1);
  await assert.rejects(c.open(user.id,'credentials',parts.join('.')));
  const rotated=createTokenCipher({keys:JSON.stringify({v1:Buffer.alloc(32,7).toString('base64'),v2:Buffer.alloc(32,8).toString('base64')}),activeKey:'v2'});
  assert.equal((await rotated.open(user.id,'credentials',sealed)).refreshToken,'fictional-secret');
  assert.match(await rotated.seal(user.id,'credentials',{}),/^v2\./);
});

function trial({identity={subject:'12345',email:user.email},scopes=[GMAIL_SCOPE],refreshToken='fictional-refresh',finish='connected',previous=false}={}) {
  const c=cipher(); let pending; let state; let exchanges=0; let saved;
  const provider={authorization(s,ch,email){state=s; assert.equal(ch.length,43); assert.equal(email,user.email); return 'https://accounts.google.com/o/oauth2/v2/auth';},
    async exchange(code,verifier){ exchanges++; assert.equal(code,'fictional-code'); assert.equal(verifier.length,43); return {accessToken:'fictional-access',refreshToken,scopes,expiresAt:'2026-11-05T12:00:00Z'}; },
    async identity(){return identity;}};
  const rpc=async(uid,action,data)=>{
    if(action==='start'){pending={...data,userId:uid,generation:1};return {state:'started'};}
    if(action==='consume'){if(!pending || pending.hash!==data.hash)return {state:'invalid_state'}; const result=pending;pending=null;return {...result,state:'consumed',...(previous?{subject:'12345',scopes:[GMAIL_SCOPE],credentials:await c.seal(user.id,'credentials',{accessToken:'old-access',refreshToken:'old-refresh'})}:{})};}
    if(action==='finish'){saved=data;return {state:finish};}
    throw new Error('Unexpected RPC');
  };
  const connection=createGoogleConnection({rpc,cipher:c,provider});
  return {connection,c,get state(){return state},get exchanges(){return exchanges},get saved(){return saved}};
}

test('connection callback consumes hashed state once, uses encrypted PKCE verifier, stores encrypted tokens',async()=>{
  const t=trial(); await t.connection.start(user);
  await t.connection.callback(new URLSearchParams({state:t.state,code:'fictional-code'}));
  assert.equal(t.saved.email,user.email);
  assert.equal((await t.c.open(user.id,'credentials',t.saved.credentials)).refreshToken,'fictional-refresh');
  assert.ok(!JSON.stringify(t.saved).includes('fictional-refresh'));
  await assert.rejects(t.connection.callback(new URLSearchParams({state:t.state,code:'fictional-code'})),{code:'GOOGLE_INVALID_STATE'});
  assert.equal(t.exchanges,1);
});

test('denied consent consumes state without exchanging a code',async()=>{
  const t=trial(); await t.connection.start(user);
  await assert.rejects(t.connection.callback(new URLSearchParams({state:t.state,error:'access_denied'})),{code:'GOOGLE_CONSENT_DENIED'});
  assert.equal(t.exchanges,0); assert.equal(t.saved,undefined);
  await assert.rejects(t.connection.callback(new URLSearchParams({state:t.state,code:'fictional-code'})),{code:'GOOGLE_INVALID_STATE'});
});

test('Calendar upgrade retains existing refresh token and requires both grants before persistence',async()=>{
 const t=trial({previous:true,scopes:[GMAIL_SCOPE,CALENDAR_SCOPE],refreshToken:null});
 await t.connection.start(user,true);
 await t.connection.callback(new URLSearchParams({state:t.state,code:'fictional-code'}));
 assert.equal((await t.c.open(user.id,'credentials',t.saved.credentials)).refreshToken,'old-refresh');
 for(const scopes of [[GMAIL_SCOPE],[CALENDAR_SCOPE]]) {
  const partial=trial({previous:true,scopes});await partial.connection.start(user,true);
  await assert.rejects(partial.connection.callback(new URLSearchParams({state:partial.state,code:'fictional-code'})));
  assert.equal(partial.saved,undefined);
 }
 const denied=trial({previous:true});await denied.connection.start(user,true);
 await assert.rejects(denied.connection.callback(new URLSearchParams({state:denied.state,error:'access_denied'})),{code:'GOOGLE_CONSENT_DENIED'});
 assert.equal(denied.saved,undefined);assert.equal(denied.exchanges,0);
});

test('Calendar scope is optional for Gmail-only authorization and requested only by explicit upgrade',()=>{
 const p=createGoogleProvider({clientId:'fictional',clientSecret:'fictional',callbackUrl:'https://backend.test/callback'});
 const gmail=new URL(p.authorization('state','challenge',user.email));assert.ok(!gmail.searchParams.get('scope').includes(CALENDAR_SCOPE));
 const calendar=new URL(p.authorization('state','challenge',user.email,true));assert.ok(calendar.searchParams.get('scope').includes(CALENDAR_SCOPE));
});

test('Calendar scope checks do not acquire a Gmail refresh lease; refreshed grants reflect Calendar loss',async()=>{
 const c=cipher();let requested,finished;
 const missing=createGoogleConnection({cipher:c,provider:{},rpc:async(_,action,data)=>{assert.equal(action,'refresh_claim');requested=data;return {state:'scope_required'};}});
 await assert.rejects(missing.accessToken(user.id,CALENDAR_SCOPE),{code:'GOOGLE_CALENDAR_SCOPE_REQUIRED'});
 assert.equal(requested.requiredScope,CALENDAR_SCOPE);
 const saved=await c.seal(user.id,'credentials',{accessToken:'old',refreshToken:'preserved'});
 const connection=createGoogleConnection({cipher:c,provider:{refresh:async()=>({accessToken:'new',scopes:[GMAIL_SCOPE],expiresAt:'2099-01-01T00:00:00Z'})},
  rpc:async(_,action,data)=>{if(action==='refresh_claim')return {state:'refresh',credentials:saved,scopes:[GMAIL_SCOPE,CALENDAR_SCOPE],generation:1,lease:'lease'};assert.equal(action,'refresh_finish');finished=data;return {state:'ready'};}});
 await assert.rejects(connection.accessToken(user.id,CALENDAR_SCOPE),{code:'GOOGLE_CALENDAR_SCOPE_REQUIRED'});
 assert.deepEqual(finished.scopes,[GMAIL_SCOPE]);assert.equal((await c.open(user.id,'credentials',finished.credentials)).refreshToken,'preserved');
});

test('wrong account, partial consent, missing offline token, stale commit never report connected',async()=>{
  for(const [options,code] of [
    [{identity:{subject:'12345',email:'other@example.org'}},'GOOGLE_ACCOUNT_MISMATCH'],
    [{scopes:['openid']},'GOOGLE_SCOPE_REQUIRED'],
    [{refreshToken:null},'GOOGLE_OFFLINE_ACCESS_REQUIRED'],
    [{finish:'stale'},'GOOGLE_CONNECTION_STALE'],
  ]) {
    const t=trial(options);await t.connection.start(user);
    await assert.rejects(t.connection.callback(new URLSearchParams({state:t.state,code:'fictional-code'})),{code});
    if(code!=='GOOGLE_CONNECTION_STALE')assert.equal(t.saved,undefined);
  }
});

test('refresh preserves omitted refresh token and fences late results',async()=>{
  for(const state of ['ready','stale']) {
    const c=cipher(), saved=await c.seal(user.id,'credentials',{accessToken:'old-access',refreshToken:'old-refresh'});
    let finish;
    const connection=createGoogleConnection({cipher:c,
      rpc:async(uid,action,data)=>{
        if(action==='refresh_claim')return {state:'refresh',generation:3,lease:'lease',credentials:saved};
        assert.equal(action,'refresh_finish');finish=data;return {state};
      },provider:{async refresh(token){assert.equal(token,'old-refresh');return {accessToken:'new-access',scopes:[],expiresAt:'2026-11-05T12:00:00Z'};}}});
    if(state==='stale')await assert.rejects(connection.accessToken(user.id),{code:'GOOGLE_CONNECTION_STALE'});
    else assert.equal(await connection.accessToken(user.id),'new-access');
    assert.deepEqual(await c.open(user.id,'credentials',finish.credentials),{accessToken:'new-access',refreshToken:'old-refresh'});
  }
});

test('revocation transitions to reconnect; transient refresh failure uses retry state',async()=>{
  for(const revoked of [true,false]) {
    const c=cipher();let reason;
    const connection=createGoogleConnection({cipher:c,
      rpc:async(uid,action,data)=>action==='refresh_claim'?{state:'refresh',generation:1,lease:'lease',credentials:await c.seal(user.id,'credentials',{refreshToken:'fictional'})}:(reason=data.reason,{state:'retry_later'}),
      provider:{async refresh(){throw Object.assign(new Error('sensitive provider diagnostic'),{code:revoked?'GOOGLE_REVOKED':'GOOGLE_PROVIDER_UNAVAILABLE'});}}});
    await assert.rejects(connection.accessToken(user.id),{code:revoked?'GOOGLE_RECONNECT_REQUIRED':'GOOGLE_PROVIDER_UNAVAILABLE'});
    assert.equal(reason,revoked?'revoked':'temporary');
  }
});

test('failed revocation leaves disconnect pending and retains retryable ciphertext',async()=>{
  const c=cipher();const calls=[];
  const connection=createGoogleConnection({cipher:c,rpc:async(uid,action)=>{
    calls.push(action);return {state:'disconnecting',generation:2,credentials:await c.seal(user.id,'credentials',{refreshToken:'fictional'})};
  },provider:{async revoke(){throw Object.assign(new Error(),{code:'GOOGLE_REVOCATION_PENDING'});}}});
  await assert.rejects(connection.disconnect(user.id),{code:'GOOGLE_REVOCATION_PENDING'});
  assert.deepEqual(calls,['disconnect']);
});

test('HTTP gates reject anonymous/foreign origins/oversized and caller-selected identity; never expose access tokens',async()=>{
  let owner;
  const handler=createGoogleHandler({enabled:true,allowedOrigins:['http://127.0.0.1:5173'],verifyUser:async(token)=>token==='valid'?user:null,
    connection:{async accessToken(uid){owner=uid;return 'never-return-this-token';},async start(){throw new Error('secret diagnostic');}}});
  const req=(body,headers={})=>new Request('https://example.test',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer valid',...headers},body:JSON.stringify(body)});
  assert.equal((await handler(req({action:'check'},{Authorization:''}))).status,401);
  assert.equal((await handler(req({action:'check'},{Origin:'https://evil.test'}))).status,403);
  assert.equal((await handler(req({action:'check',userId:'other'}))).status,400);
  assert.equal((await handler(req({action:'x'.repeat(1000)}))).status,400);
  const result=await handler(req({action:'check'})); assert.equal(owner,user.id);
  assert.deepEqual(await result.json(),{state:'connected',scanningEnabled:false});
  assert.ok(!(await (await handler(req({action:'connect'}))).text()).includes('secret diagnostic'));
});

test('callback redirects to fixed return URL with sanitized outcome only',async()=>{
  const handler=createGoogleHandler({enabled:true,callback:true,returnUrl:'http://127.0.0.1:5173/storage',connection:{async callback(){throw new Error('secret');}}});
  const result=await handler(new Request('https://backend.test?state=sensitive&code=secret&next=https://evil.test'));
  assert.equal(result.status,303);assert.equal(result.headers.get('Location'),'http://127.0.0.1:5173/storage?google=failed');
  assert.equal(result.headers.get('Referrer-Policy'),'no-referrer');assert.equal(await result.text(),'');
});

test('provider uses fixed HTTPS endpoints, offline consent, scope checking, and fixed errors',async()=>{
  const calls=[];
  const provider=createGoogleProvider({clientId:'fictional-client',clientSecret:'fictional-secret',callbackUrl:'https://backend.test/callback',
    fetchImpl:async(url,options)=>{calls.push({url,options});return new Response(JSON.stringify({error:'invalid_grant',error_description:'sensitive prose'}),{status:400});}});
  const url=new URL(provider.authorization('state','challenge',user.email));
  assert.equal(url.searchParams.get('access_type'),'offline');assert.equal(url.searchParams.get('code_challenge_method'),'S256');
  assert.equal(url.searchParams.get('include_granted_scopes'),'true');
  await assert.rejects(provider.refresh('fictional-refresh'),{code:'GOOGLE_REVOKED',message:'GOOGLE_REVOKED'});
  assert.equal(calls[0].url,'https://oauth2.googleapis.com/token');assert.equal(calls[0].options.redirect,'error');
});

test('provider revocation accepts only success/already-invalid and never swallows throttling',async()=>{
  for(const [status,error,ok] of [[200,null,true],[400,'invalid_token',true],[400,'invalid_request',false],[429,'rate_limit_exceeded',false],[503,'temporary',false]]) {
    const provider=createGoogleProvider({clientId:'fictional',clientSecret:'fictional',callbackUrl:'https://backend.test',
      fetchImpl:async()=>new Response(JSON.stringify({error}),{status})});
    if(ok)await provider.revoke('fictional-token');else await assert.rejects(provider.revoke('fictional-token'),{code:'GOOGLE_REVOCATION_PENDING'});
  }
});
