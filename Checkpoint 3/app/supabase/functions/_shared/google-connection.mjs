// No provider response bodies, credentials, codes, or state values are logged.
export const GMAIL_SCOPE = 'https://www.googleapis.com/auth/gmail.readonly';
export const CALENDAR_SCOPE = 'https://www.googleapis.com/auth/calendar.events.owned';
const SCOPES = ['openid', 'email', GMAIL_SCOPE];
const fail = (code) => Object.assign(new Error(code), { code });
const bytes = (s) => new TextEncoder().encode(s);
const b64 = (a) => btoa(String.fromCharCode(...a));
const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const random = () => b64(crypto.getRandomValues(new Uint8Array(32))).replaceAll('+','-').replaceAll('/','_').replaceAll('=','');
const hash = async (s) => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes(s))), (n)=>n.toString(16).padStart(2,'0')).join('');
const challenge = async (s) => b64(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes(s)))).replaceAll('+','-').replaceAll('/','_').replaceAll('=','');

export function createTokenCipher({ keys, activeKey }) {
  const keyring = JSON.parse(keys || '{}');
  if (!/^[a-zA-Z0-9_-]{1,30}$/.test(activeKey ?? '') || !keyring[activeKey]) throw fail('GOOGLE_NOT_CONFIGURED');
  const load = async (id) => {
    const raw = unb64(keyring[id] ?? '');
    if (raw.length !== 32) throw fail('GOOGLE_NOT_CONFIGURED');
    return crypto.subtle.importKey('raw',raw,'AES-GCM',false,['encrypt','decrypt']);
  };
  return {
    async seal(user, purpose, data) {
      const iv = crypto.getRandomValues(new Uint8Array(12));
      const encrypted = await crypto.subtle.encrypt({name:'AES-GCM',iv,
        additionalData:bytes(`${user}:${purpose}:${activeKey}`)},await load(activeKey),bytes(JSON.stringify(data)));
      return `${activeKey}.${b64(iv)}.${b64(new Uint8Array(encrypted))}`;
    },
    async open(user, purpose, value) {
      const [id,iv,ciphertext,...extra] = String(value).split('.');
      if (extra.length || !id || !iv || !ciphertext) throw fail('GOOGLE_CREDENTIALS_UNAVAILABLE');
      try {
        const plain = await crypto.subtle.decrypt({name:'AES-GCM',iv:unb64(iv),
          additionalData:bytes(`${user}:${purpose}:${id}`)},await load(id),unb64(ciphertext));
        return JSON.parse(new TextDecoder().decode(plain));
      } catch { throw fail('GOOGLE_CREDENTIALS_UNAVAILABLE'); }
    },
  };
}

export function createGoogleRpc({ url, serviceKey, fetchImpl = fetch }) {
  return async (user, action, data = {}) => {
    if (!url || !serviceKey) throw fail('GOOGLE_NOT_CONFIGURED');
    const response = await fetchImpl(`${url.replace(/\/$/,'')}/rest/v1/rpc/google_connection_service`, {
      method:'POST', redirect:'error', signal:AbortSignal.timeout(10000),
      headers:{apikey:serviceKey,Authorization:`Bearer ${serviceKey}`,'Content-Type':'application/json'},
      body:JSON.stringify({p_user:user,p_action:action,p_data:data}),
    });
    if (!response.ok) throw fail('GOOGLE_STORAGE_UNAVAILABLE');
    return response.json();
  };
}

export function createGoogleProvider({ clientId, clientSecret, callbackUrl, fetchImpl = fetch, now = () => Date.now() }) {
  const requestToken = async (params) => {
    const response = await fetchImpl('https://oauth2.googleapis.com/token', {
      method:'POST',redirect:'error',signal:AbortSignal.timeout(10000),
      headers:{'Content-Type':'application/x-www-form-urlencoded'},
      body:new URLSearchParams({client_id:clientId,client_secret:clientSecret,...params}),
    });
    let data; try { data = await response.json(); } catch { throw fail('GOOGLE_PROVIDER_UNAVAILABLE'); }
    if (!response.ok) throw fail(data?.error==='invalid_grant' ? 'GOOGLE_REVOKED' : 'GOOGLE_PROVIDER_UNAVAILABLE');
    if (typeof data.access_token!=='string' || data.access_token.length>10000 || !data.access_token
      || data.token_type?.toLowerCase()!=='bearer' || !Number.isFinite(data.expires_in)
      || data.expires_in<=0 || data.expires_in>86400
      || (data.refresh_token != null && (typeof data.refresh_token!=='string' || !data.refresh_token || data.refresh_token.length>10000))) {
      throw fail('GOOGLE_PROVIDER_UNAVAILABLE');
    }
    return { accessToken:data.access_token,refreshToken:data.refresh_token,
      expiresAt:new Date(now()+data.expires_in*1000).toISOString(),
      scopes:typeof data.scope==='string' ? data.scope.split(/\s+/).filter(Boolean) : [] };
  };
  return {
    authorization(state, verifierChallenge, email, calendar = false) {
      const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
      url.search = new URLSearchParams({client_id:clientId,redirect_uri:callbackUrl,response_type:'code',
        scope:[...SCOPES,...(calendar ? [CALENDAR_SCOPE] : [])].join(' '),state,access_type:'offline',prompt:'consent select_account',
        include_granted_scopes:'true',login_hint:email,code_challenge:verifierChallenge,code_challenge_method:'S256'}).toString();
      return url.href;
    },
    exchange: (code, verifier) => requestToken({grant_type:'authorization_code',code,code_verifier:verifier,redirect_uri:callbackUrl}),
    refresh: (refreshToken) => requestToken({grant_type:'refresh_token',refresh_token:refreshToken}),
    async identity(accessToken) {
      const response = await fetchImpl('https://openidconnect.googleapis.com/v1/userinfo', {
        headers:{Authorization:`Bearer ${accessToken}`},redirect:'error',signal:AbortSignal.timeout(10000),
      });
      if (!response.ok) throw fail('GOOGLE_PROVIDER_UNAVAILABLE');
      const data = await response.json();
      if (typeof data.sub!=='string' || !/^[0-9]{1,255}$/.test(data.sub)
        || data.email_verified!==true || typeof data.email!=='string' || data.email.length>320) throw fail('GOOGLE_ACCOUNT_MISMATCH');
      return {subject:data.sub,email:data.email};
    },
    async revoke(token) {
      const response = await fetchImpl('https://oauth2.googleapis.com/revoke', {
        method:'POST',redirect:'error',signal:AbortSignal.timeout(10000),
        headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({token}),
      });
      if (response.ok) return;
      // Google reports an already-invalid token as invalid_token. Do not treat
      // rate limits, invalid requests, or transport failures as revoked.
      let data; try { data=await response.json(); } catch { /* fixed error */ }
      if (response.status===400 && data?.error==='invalid_token') return;
      throw fail('GOOGLE_REVOCATION_PENDING');
    },
  };
}

export function createGoogleConnection({ rpc, cipher, provider }) {
  // For trusted backend consumers only. Never serialize the returned token into
  // an HTTP response. The DB lease prevents concurrent refresh token races.
  const accessToken = async (user, requiredScope = GMAIL_SCOPE) => {
    const claim = await rpc(user,'refresh_claim',requiredScope===GMAIL_SCOPE?{}:{requiredScope});
    if (claim.state==='scope_required') throw fail('GOOGLE_CALENDAR_SCOPE_REQUIRED');
    if (!['ready','refresh'].includes(claim.state)) throw fail(claim.state==='reconnect_required' ? 'GOOGLE_RECONNECT_REQUIRED' : 'GOOGLE_CONNECTION_BUSY');
    if (requiredScope !== GMAIL_SCOPE && !claim.scopes?.includes(requiredScope)) throw fail('GOOGLE_CALENDAR_SCOPE_REQUIRED');
    const saved = await cipher.open(user,'credentials',claim.credentials);
    if (claim.state==='ready') return saved.accessToken;
    let tokens;
    try {
      tokens = await provider.refresh(saved.refreshToken);
      if (tokens.scopes.length && !tokens.scopes.includes(GMAIL_SCOPE)) throw fail('GOOGLE_REVOKED');
    } catch (error) {
      await rpc(user,'refresh_fail',{generation:claim.generation,lease:claim.lease,
        reason:error.code==='GOOGLE_REVOKED'?'revoked':'temporary'});
      throw fail(error.code==='GOOGLE_REVOKED'?'GOOGLE_RECONNECT_REQUIRED':'GOOGLE_PROVIDER_UNAVAILABLE');
    }
    const encrypted = await cipher.seal(user,'credentials',{accessToken:tokens.accessToken,refreshToken:tokens.refreshToken ?? saved.refreshToken});
    const result=await rpc(user,'refresh_finish',{generation:claim.generation,lease:claim.lease,credentials:encrypted,expiresAt:tokens.expiresAt,...(tokens.scopes.length?{scopes:tokens.scopes}:{})});
    if(result.state!=='ready') throw fail('GOOGLE_CONNECTION_STALE');
    if (requiredScope!==GMAIL_SCOPE && tokens.scopes.length && !tokens.scopes.includes(requiredScope)) throw fail('GOOGLE_CALENDAR_SCOPE_REQUIRED');
    return tokens.accessToken;
  };
  return {
    accessToken,
    async start(user, calendar = false) {
      const state=random(), verifier=random();
      const result=await rpc(user.id,'start',{hash:await hash(state),email:user.email,calendar,
        verifier:await cipher.seal(user.id,'verifier',{verifier})});
      if(result.state!=='started') throw fail('GOOGLE_CONNECTION_BUSY');
      return {authorizationUrl:provider.authorization(state,await challenge(verifier),user.email,calendar)};
    },
    async callback(params) {
      const state=params.get('state');
      if (!state || !/^[A-Za-z0-9_-]{43}$/.test(state) || params.getAll('state').length!==1) throw fail('GOOGLE_INVALID_STATE');
      const pending=await rpc(null,'consume',{hash:await hash(state)});
      if(pending.state!=='consumed') throw fail('GOOGLE_INVALID_STATE');
      try {
      if(params.has('error')) throw fail('GOOGLE_CONSENT_DENIED');
      const code=params.get('code');
      if(!code || code.length>4096 || params.getAll('code').length!==1) throw fail('GOOGLE_INVALID_STATE');
      const {verifier}=await cipher.open(pending.userId,'verifier',pending.verifier);
      const tokens=await provider.exchange(code,verifier);
      // No token persistence occurs until identity and the granted scope pass.
      const identity=await provider.identity(tokens.accessToken);
      if(identity.email.toLowerCase()!==pending.email.toLowerCase()
        || (pending.subject && pending.subject!==identity.subject)) throw fail('GOOGLE_ACCOUNT_MISMATCH');
      if(!tokens.scopes.includes(GMAIL_SCOPE)) throw fail('GOOGLE_SCOPE_REQUIRED');
      if ((pending.calendar || pending.scopes?.includes(CALENDAR_SCOPE)) && !tokens.scopes.includes(CALENDAR_SCOPE)) throw fail('GOOGLE_CALENDAR_SCOPE_REQUIRED');
      // Reauthorization often omits the refresh token. Reuse only credentials
      // bound to the same verified account and fenced OAuth generation.
      const previous = pending.credentials ? await cipher.open(pending.userId,'credentials',pending.credentials) : null;
      const refreshToken = tokens.refreshToken ?? previous?.refreshToken;
      if(!refreshToken) throw fail('GOOGLE_OFFLINE_ACCESS_REQUIRED');
      const credentials=await cipher.seal(pending.userId,'credentials',{accessToken:tokens.accessToken,refreshToken});
      const result=await rpc(pending.userId,'finish',{generation:pending.generation,...identity,
        scopes:tokens.scopes,expiresAt:tokens.expiresAt,credentials});
      if(result.state!=='connected') throw fail('GOOGLE_CONNECTION_STALE');
      } finally {
        // Release the short callback/refresh exclusion even after denied consent.
        // A crashed callback expires automatically; generations fence late release.
        try { await rpc(pending.userId,'oauth_release',{generation:pending.generation}); } catch { /* bounded lease */ }
      }
    },
    async disconnect(user) {
      const claim=await rpc(user,'disconnect');
      if(claim.state==='disconnected') return;
      if(claim.credentials) {
        const saved=await cipher.open(user,'credentials',claim.credentials);
        await provider.revoke(saved.refreshToken);
      }
      const result=await rpc(user,'disconnect_finish',{generation:claim.generation});
      if(result.state!=='disconnected') throw fail('GOOGLE_CONNECTION_STALE');
    },
  };
}

export function createGoogleHandler({ connection, verifyUser, allowedOrigins=/** @type {string[]} */ ([]), returnUrl, callback=false, enabled=false }) {
  return async(request) => {
    const headers={'Cache-Control':'no-store','Referrer-Policy':'no-referrer','Content-Type':'application/json',Vary:'Origin'};
    const json=(status,data)=>new Response(JSON.stringify(data),{status,headers});
    const origin=request.headers.get('origin');
    if(!callback && origin && !allowedOrigins.includes(origin)) return json(403,{error:'ORIGIN_NOT_ALLOWED'});
    if(!callback && origin) headers['Access-Control-Allow-Origin']=origin;
    if(!callback && request.method==='OPTIONS') return new Response(null,{status:204,headers:{...headers,
      'Access-Control-Allow-Methods':'POST, OPTIONS','Access-Control-Allow-Headers':'authorization, apikey, content-type, x-client-info'}});
    if(request.method!==(callback?'GET':'POST')) return json(405,{error:'METHOD_NOT_ALLOWED'});
    if(!enabled || !connection) return json(503,{error:'GOOGLE_NOT_CONFIGURED'});
    if(callback) {
      let outcome='failed';
      try { await connection.callback(new URL(request.url).searchParams); outcome='connected'; }
      catch { /* Never reflect Google callback parameters/provider diagnostics. */ }
      const destination=new URL(returnUrl); destination.searchParams.set('google',outcome);
      return new Response(null,{status:303,headers:{...headers,Location:destination.href}});
    }
    const bearer=/^Bearer ([^\s]+)$/i.exec(request.headers.get('authorization')??'');
    if(!bearer) return json(401,{error:'AUTH_REQUIRED'});
    let user;
    try { user=await verifyUser(bearer[1]); } catch { return json(503,{error:'AUTH_UNAVAILABLE'}); }
    if(!user) return json(401,{error:'AUTH_REQUIRED'});
    // Tiny fixed contract; read a bounded stream rather than trusting length.
    let body;
    try {
      if(request.headers.get('content-type')?.split(';')[0].trim()!=='application/json') return json(415,{error:'JSON_REQUIRED'});
      const reader=request.body?.getReader(); if(!reader) throw fail('INVALID_REQUEST');
      const chunks=[]; let size=0;
      try { while(true) { const {done,value}=await reader.read(); if(done) break; size+=value.length;
        if(size>256) { await reader.cancel(); throw fail('INVALID_REQUEST'); } chunks.push(value); }
      } finally { reader.releaseLock(); }
      body=JSON.parse(new TextDecoder().decode(Uint8Array.from(chunks.flatMap((v)=>Array.from(v)))));
      if(!body || Array.isArray(body) || Object.keys(body).length!==1 || !['connect','connect_calendar','check','disconnect'].includes(body.action)) throw fail('INVALID_REQUEST');
    } catch { return json(400,{error:'INVALID_REQUEST'}); }
    try {
      if(body.action==='connect') return json(200,await connection.start(user));
      if(body.action==='connect_calendar') return json(200,await connection.start(user,true));
      if(body.action==='disconnect') { await connection.disconnect(user.id); return json(200,{state:'disconnected',scanningEnabled:false}); }
      await connection.accessToken(user.id);
      return json(200,{state:'connected',scanningEnabled:false});
    } catch(error) {
      const codes=['GOOGLE_CONNECTION_BUSY','GOOGLE_RECONNECT_REQUIRED','GOOGLE_CONNECTION_STALE',
        'GOOGLE_PROVIDER_UNAVAILABLE','GOOGLE_REVOCATION_PENDING','GOOGLE_CREDENTIALS_UNAVAILABLE'];
      return json(503,{error:codes.includes(error.code)?error.code:'GOOGLE_CONNECTION_UNAVAILABLE'});
    }
  };
}
