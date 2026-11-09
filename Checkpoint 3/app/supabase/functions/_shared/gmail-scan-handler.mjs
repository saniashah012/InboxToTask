import { corsGate, isJsonRequest, jsonResponder, readJsonBody, verifiedUser } from './http.mjs';

// Separate, authenticated retrieval-only milestone. Never returns message content.
export function createGmailScanHandler({ verifyUser, scan, enabled = false, allowedOrigins = /** @type {string[]} */ ([]) }) {
  return async request => {
    const { headers, json } = jsonResponder();
    const early = corsGate(request, allowedOrigins, { headers, json });
    if (early) return early;
    if (request.method !== 'POST') return json(405,{error:'METHOD_NOT_ALLOWED'});
    const { user, response } = await verifiedUser(request, verifyUser, json);
    if (response) return response;
    if (!enabled) return json(503,{error:'GMAIL_SCAN_DISABLED'});
    if (!isJsonRequest(request)) return json(415,{error:'JSON_REQUIRED'});
    let body;
    try { body = await readJsonBody(request, 128); } catch { return json(400,{error:'INVALID_SCAN_REQUEST'}); }
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
