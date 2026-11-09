// Request gates shared by the browser-facing Edge handlers. Each handler keeps
// its own check order, body limit and error codes. Responses never echo request
// data, tokens or Auth diagnostics.
const problem = (code) => Object.assign(new Error(code), { code });
const PREFLIGHT = { 'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info' };

// Uncached JSON responses. `headers` is shared so the CORS gate can add the origin.
export function jsonResponder(extraHeaders = {}) {
  const headers = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...extraHeaders, Vary: 'Origin' };
  return { headers, json: (status, body) => new Response(JSON.stringify(body), { status, headers }) };
}

// Exact-origin CORS. Returns a response to send now (foreign origin or
// preflight), or null to continue. Preflight never reaches Auth.
export function corsGate(request, allowedOrigins, { headers, json }) {
  const origin = request.headers.get('origin');
  if (origin && !allowedOrigins.includes(origin)) return json(403, { error: 'ORIGIN_NOT_ALLOWED' });
  if (origin) headers['Access-Control-Allow-Origin'] = origin;
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: { ...headers, ...PREFLIGHT } });
  return null;
}

// Verifies the bearer session with Auth. Returns { user } or { response }.
export async function verifiedUser(request, verifyUser, json) {
  const token = /^Bearer ([^\s]+)$/i.exec(request.headers.get('authorization') ?? '')?.[1];
  if (!token) return { response: json(401, { error: 'AUTH_REQUIRED' }) };
  let user;
  try { user = await verifyUser(token); } catch { return { response: json(503, { error: 'AUTH_UNAVAILABLE' }) }; }
  return user ? { user } : { response: json(401, { error: 'AUTH_REQUIRED' }) };
}

// Media types are case-insensitive; parameters such as charset are ignored.
export const isJsonRequest = (request) =>
  request.headers.get('content-type')?.split(';')[0].trim().toLowerCase() === 'application/json';

// Reads at most `limit` bytes without trusting Content-Length, then decodes
// strict UTF-8 JSON. Throws BODY_TOO_LARGE or INVALID_JSON (or a parse error).
export async function readJsonBody(request, limit) {
  const reader = request.body?.getReader();
  if (!reader) throw problem('INVALID_JSON');
  const chunks = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) {
        await reader.cancel();
        throw problem('BODY_TOO_LARGE');
      }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const body = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { body.set(chunk, offset); offset += chunk.byteLength; }
  return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(body));
}
