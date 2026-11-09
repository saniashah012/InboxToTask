import { corsGate, isJsonRequest, jsonResponder, readJsonBody, verifiedUser } from './http.mjs';

const BODY_LIMIT = 1024;

// Local integration scaffold, intentionally limited to bundled fictional cases.
// Does not accept arbitrary email or call Gmail. Persistence is supplied by the
// trusted extraction coordinator; caller input never supplies storage identity.
export function createFixtureHandler({ verifyUser, runExtraction, fixture,
  enabled = false, allowedOrigins = /** @type {string[]} */ ([]) }) {
  return async (request) => {
    const { headers, json: respond } = jsonResponder();
    const early = corsGate(request, allowedOrigins, { headers, json: respond });
    if (early) return early;
    if (request.method !== 'POST') return respond(405, { error: 'METHOD_NOT_ALLOWED' });
    const { user, response } = await verifiedUser(request, verifyUser, respond);
    if (response) return response;
    if (!enabled) return respond(503, { error: 'FIXTURE_EXTRACTION_DISABLED' });
    if (!isJsonRequest(request)) return respond(415, { error: 'JSON_REQUIRED' });
    let body;
    try { body = await readJsonBody(request, BODY_LIMIT); }
    catch (error) {
      return error?.code === 'BODY_TOO_LARGE'
        ? respond(413, { error: 'BODY_TOO_LARGE' }) : respond(400, { error: 'INVALID_JSON' });
    }
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
