const BODY_LIMIT = 1024;

async function readBoundedJson(request) {
  if (!request.body) throw new Error('INVALID_JSON');
  const reader = request.body.getReader();
  const chunks = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > BODY_LIMIT) {
        await reader.cancel();
        throw new Error('BODY_TOO_LARGE');
      }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const body = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { body.set(chunk, offset); offset += chunk.byteLength; }
  return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(body));
}

// Local integration scaffold, intentionally limited to bundled fictional cases.
// Does not accept arbitrary email or call Gmail. Persistence is supplied by the
// trusted extraction coordinator; caller input never supplies storage identity.
export function createFixtureHandler({ verifyUser, runExtraction, fixture,
  enabled = false, allowedOrigins = /** @type {string[]} */ ([]) }) {
  return async (request) => {
    const origin = request.headers.get('origin');
    const headers = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store',
      Vary: 'Origin' };
    const respond = (status, body) => new Response(JSON.stringify(body), { status, headers });
    if (origin && !allowedOrigins.includes(origin)) return respond(403, { error: 'ORIGIN_NOT_ALLOWED' });
    if (origin) headers['Access-Control-Allow-Origin'] = origin;
    if (request.method === 'OPTIONS') {
      headers['Access-Control-Allow-Methods'] = 'POST, OPTIONS';
      headers['Access-Control-Allow-Headers'] = 'authorization, apikey, content-type, x-client-info';
      return new Response(null, { status: 204, headers });
    }
    if (request.method !== 'POST') return respond(405, { error: 'METHOD_NOT_ALLOWED' });
    const match = /^Bearer ([^\s]+)$/i.exec(request.headers.get('authorization') ?? '');
    if (!match) return respond(401, { error: 'AUTH_REQUIRED' });
    let user;
    try { user = await verifyUser(match[1]); }
    catch { return respond(503, { error: 'AUTH_UNAVAILABLE' }); }
    if (!user) return respond(401, { error: 'AUTH_REQUIRED' });
    if (!enabled) return respond(503, { error: 'FIXTURE_EXTRACTION_DISABLED' });
    if (request.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'application/json') {
      return respond(415, { error: 'JSON_REQUIRED' });
    }
    let body;
    try { body = await readBoundedJson(request); }
    catch (error) { return respond(error.message === 'BODY_TOO_LARGE' ? 413 : 400,
      { error: error.message === 'BODY_TOO_LARGE' ? 'BODY_TOO_LARGE' : 'INVALID_JSON' }); }
    if (!body || typeof body !== 'object' || Array.isArray(body)
      || Object.keys(body).length !== 1 || !/^E(?:0[1-9]|1[0-9]|20)$/.test(body.caseId)) {
      return respond(400, { error: 'EXPECTED_CASE_ID_ONLY' });
    }
    const selected = fixture.cases.find((item) => item.message.id === body.caseId);
    if (!selected) return respond(404, { error: 'UNKNOWN_CASE' });
    // Identity and scope never come from the request body. Adapt fictional
    // self-sent context to the verified inbox owner, while keeping fixture data.
    const adaptMessage = (message) => ({ ...message,
      from: message.from === fixture.user.email ? user.email : message.from });
    const input = { ...selected,
      user: { ...fixture.user, email: user.email }, analysisTime: fixture.analysisTime,
      rules: { ...fixture.rules, allow: { ...fixture.rules.allow,
        senders: [...fixture.rules.allow.senders, user.email] } },
      message: adaptMessage(selected.message),
      threadContext: selected.threadContext.map(adaptMessage) };
    try {
      const output = await runExtraction(input, user);
      return respond(200, { mode: 'FICTIONAL_FIXTURE_ONLY', saved: output.saved === true, output });
    } catch (error) {
      // Never return/log raw model errors, submitted data, tokens or headers.
      if (error?.code === 'PROVIDER_HTTP_429') return respond(429, { error: 'PROVIDER_RATE_LIMITED' });
      if (['STORAGE_BUDGET', 'STORAGE_PROVIDER_LIMIT', 'STORAGE_RETRY_LATER', 'STORAGE_ATTEMPT_LIMIT'].includes(error?.code)) {
        return respond(429, { error: error.code });
      }
      if (['STORAGE_BUSY','STORAGE_PAUSED','STORAGE_SUPPRESSED','STORAGE_STALE'].includes(error?.code)) {
        return respond(409, { error: error.code });
      }
      if (['STORAGE_NOT_CONFIGURED','STORAGE_UNAVAILABLE'].includes(error?.code)) {
        return respond(503, { error: error.code });
      }
      if (['MISSING_API_KEY', 'INVALID_MODEL_SETTINGS'].includes(error?.code)) {
        return respond(503, { error: 'EXTRACTION_NOT_CONFIGURED' });
      }
      return respond(502, { error: 'EXTRACTION_FAILED' });
    }
  };
}
