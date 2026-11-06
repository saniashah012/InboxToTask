// Separate, authenticated retrieval-only milestone. Never returns message content.
export function createGmailScanHandler({ verifyUser, scan, enabled = false, allowedOrigins = /** @type {string[]} */ ([]) }) {
  return async request => {
    const origin = request.headers.get('origin');
    const headers = { 'Content-Type':'application/json', 'Cache-Control':'no-store', Vary:'Origin' };
    const json = (status, data) => new Response(JSON.stringify(data),{status,headers});
    if (origin && !allowedOrigins.includes(origin)) return json(403,{error:'ORIGIN_NOT_ALLOWED'});
    if (origin) headers['Access-Control-Allow-Origin'] = origin;
    if (request.method === 'OPTIONS') {
      headers['Access-Control-Allow-Methods'] = 'POST, OPTIONS';
      headers['Access-Control-Allow-Headers'] = 'authorization, apikey, content-type, x-client-info';
      return new Response(null,{status:204,headers});
    }
    if (request.method !== 'POST') return json(405,{error:'METHOD_NOT_ALLOWED'});
    const token = /^Bearer ([^\s]+)$/i.exec(request.headers.get('authorization') ?? '')?.[1];
    if (!token) return json(401,{error:'AUTH_REQUIRED'});
    let user;
    try { user = await verifyUser(token); } catch { return json(503,{error:'AUTH_UNAVAILABLE'}); }
    if (!user) return json(401,{error:'AUTH_REQUIRED'});
    if (!enabled) return json(503,{error:'GMAIL_SCAN_DISABLED'});
    if (request.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'application/json') return json(415,{error:'JSON_REQUIRED'});
    let body;
    try {
      const reader = request.body?.getReader(); if (!reader) throw new Error();
      let text = ''; let size = 0; const decoder = new TextDecoder('utf-8',{fatal:true});
      try {
        while (true) {
          const {done,value} = await reader.read(); if (done) break;
          size += value.length; if (size > 128) { await reader.cancel(); throw new Error(); }
          text += decoder.decode(value,{stream:true});
        }
        text += decoder.decode(); body = JSON.parse(text);
      } finally { reader.releaseLock(); }
    } catch { return json(400,{error:'INVALID_SCAN_REQUEST'}); }
    if (!body || Object.keys(body).length !== 1 || !['initial','more'].includes(body.mode)) return json(400,{error:'INVALID_SCAN_REQUEST'});
    try {
      const result = await scan(user,body.mode);
      return json(200,result);
    } catch (error) {
      const code = error?.code;
      if (code === 'STORAGE_STALE') return json(409,{error:'SCAN_PERMISSION_OR_REVISION_CHANGED'});
      if (code === 'SCAN_BUSY') return json(429,{error:code});
      return json(503,{error:'GMAIL_SCAN_UNAVAILABLE'});
    }
  };
}
