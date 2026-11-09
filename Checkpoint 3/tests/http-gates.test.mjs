// Request gates shared by the browser-facing Edge handlers: exact-origin CORS,
// POST only, verified bearer session, JSON content type and a streamed body limit.
// Each handler keeps its own check order, body limit and error codes.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createFixtureHandler } from '../app/supabase/functions/_shared/fixture-handler.mjs';
import { createGmailScanHandler } from '../app/supabase/functions/_shared/gmail-scan-handler.mjs';
import { createGoogleHandler } from '../app/supabase/functions/_shared/google-connection.mjs';

const ORIGIN = 'http://localhost:5173';
const user = { id: '11111111-1111-4111-8111-111111111111', email: 'owner@example.edu' };
const fixture = { cases: [], user: { email: 'fixture@example.edu' }, rules: { allow: { senders: [] } } };

function verifier() {
  const calls = [];
  const verifyUser = async (token) => {
    calls.push(token);
    if (token === 'outage') throw new Error('private auth diagnostic');
    return token === 'valid' ? user : null;
  };
  return { calls, verifyUser };
}

const handlers = [
  { name: 'fixture', limit: 1024, valid: { caseId: 'E01' }, disabledCode: 'FIXTURE_EXTRACTION_DISABLED',
    authBeforeEnabled: true, tooLarge: [413, 'BODY_TOO_LARGE'], invalid: 'INVALID_JSON',
    make: (enabled, verifyUser) => createFixtureHandler({ verifyUser, fixture, enabled, allowedOrigins: [ORIGIN],
      runExtraction: async () => ({ saved: false }) }) },
  { name: 'gmail scan', limit: 128, valid: { mode: 'initial' }, disabledCode: 'GMAIL_SCAN_DISABLED',
    authBeforeEnabled: true, tooLarge: [400, 'INVALID_SCAN_REQUEST'], invalid: 'INVALID_SCAN_REQUEST',
    make: (enabled, verifyUser) => createGmailScanHandler({ verifyUser, enabled, allowedOrigins: [ORIGIN],
      scan: async () => ({ counts: {} }) }) },
  { name: 'google connection', limit: 256, valid: { action: 'check' }, disabledCode: 'GOOGLE_NOT_CONFIGURED',
    authBeforeEnabled: false, tooLarge: [400, 'INVALID_REQUEST'], invalid: 'INVALID_REQUEST',
    extraHeaders: { 'referrer-policy': 'no-referrer' },
    make: (enabled, verifyUser) => createGoogleHandler({ verifyUser, enabled, allowedOrigins: [ORIGIN],
      connection: { async accessToken() { return 'never-returned'; } } }) },
];

const send = (handler, { method = 'POST', headers = {}, body } = {}) => handler(new Request('http://local/fn', {
  method, headers: { Authorization: 'Bearer valid', 'Content-Type': 'application/json', ...headers },
  ...(method === 'POST' || method === 'PUT' ? { body: body ?? '{}' } : {}),
}));
const expectError = async (response, status, error) => {
  assert.equal(response.status, status);
  assert.deepEqual(await response.json(), { error });
};

for (const h of handlers) {
  test(`${h.name}: exact origins, preflight without Auth, POST only`, async () => {
    const auth = verifier();
    const handler = h.make(true, auth.verifyUser);
    const foreign = await send(handler, { headers: { Origin: 'https://evil.example.edu' }, body: JSON.stringify(h.valid) });
    await expectError(foreign, 403, 'ORIGIN_NOT_ALLOWED');
    assert.equal(foreign.headers.get('access-control-allow-origin'), null);

    const preflight = await send(handler, { method: 'OPTIONS', headers: { Origin: ORIGIN } });
    assert.equal(preflight.status, 204);
    assert.equal(preflight.headers.get('access-control-allow-origin'), ORIGIN);
    assert.equal(preflight.headers.get('access-control-allow-methods'), 'POST, OPTIONS');
    assert.equal(preflight.headers.get('access-control-allow-headers'), 'authorization, apikey, content-type, x-client-info');
    assert.equal(auth.calls.length, 0, 'neither rejected origins nor preflight reach Auth');

    await expectError(await send(handler, { method: 'GET' }), 405, 'METHOD_NOT_ALLOWED');
    await expectError(await send(handler, { method: 'PUT', body: JSON.stringify(h.valid) }), 405, 'METHOD_NOT_ALLOWED');
    assert.equal(auth.calls.length, 0);
  });

  test(`${h.name}: bearer session is verified and Auth outages fail closed`, async () => {
    const auth = verifier();
    const handler = h.make(true, auth.verifyUser);
    const body = JSON.stringify(h.valid);
    await expectError(await send(handler, { headers: { Authorization: '' }, body }), 401, 'AUTH_REQUIRED');
    await expectError(await send(handler, { headers: { Authorization: 'Basic valid' }, body }), 401, 'AUTH_REQUIRED');
    await expectError(await send(handler, { headers: { Authorization: 'Bearer valid extra' }, body }), 401, 'AUTH_REQUIRED');
    assert.equal(auth.calls.length, 0, 'malformed headers never reach Auth');
    await expectError(await send(handler, { headers: { Authorization: 'Bearer revoked' }, body }), 401, 'AUTH_REQUIRED');
    const outage = await send(handler, { headers: { Authorization: 'Bearer outage' }, body });
    assert.equal(outage.status, 503);
    assert.ok(!(await outage.text()).includes('private'));
  });

  test(`${h.name}: disabled flag is checked ${h.authBeforeEnabled ? 'after' : 'before'} Auth`, async () => {
    const auth = verifier();
    const handler = h.make(false, auth.verifyUser);
    const body = JSON.stringify(h.valid);
    await expectError(await send(handler, { body }), 503, h.disabledCode);
    const anonymous = await send(handler, { headers: { Authorization: '' }, body });
    if (h.authBeforeEnabled) await expectError(anonymous, 401, 'AUTH_REQUIRED');
    else await expectError(anonymous, 503, h.disabledCode);
  });

  test(`${h.name}: JSON content type, streamed size limit and strict body`, async () => {
    const handler = h.make(true, verifier().verifyUser);
    const body = JSON.stringify(h.valid);
    await expectError(await send(handler, { headers: { 'Content-Type': 'text/plain' }, body }), 415, 'JSON_REQUIRED');
    assert.notEqual((await send(handler, { headers: { 'Content-Type': 'application/json; charset=utf-8' }, body })).status, 415);
    // Media types are case-insensitive (all three handlers share one check).
    assert.notEqual((await send(handler, { headers: { 'Content-Type': 'Application/JSON' }, body })).status, 415);

    // Valid JSON just over the limit, sent without a trusted Content-Length.
    const padded = JSON.stringify({ ...h.valid, pad: 'x'.repeat(h.limit) });
    const stream = new ReadableStream({ start(c) { c.enqueue(new TextEncoder().encode(padded)); c.close(); } });
    const large = await handler(new Request('http://local/fn', { method: 'POST', duplex: 'half', body: stream,
      headers: { Authorization: 'Bearer valid', 'Content-Type': 'application/json' } }));
    await expectError(large, ...h.tooLarge);

    await expectError(await send(handler, { body: '{"broken"' }), 400, h.invalid);
    const invalidUtf8 = new Uint8Array([0x7b, 0x22, 0xff, 0x22, 0x3a, 0x31, 0x7d]);
    assert.equal((await send(handler, { body: invalidUtf8 })).status, 400);
  });

  test(`${h.name}: responses are never cached and vary by origin`, async () => {
    const handler = h.make(true, verifier().verifyUser);
    const response = await send(handler, { headers: { Origin: ORIGIN, Authorization: '' } });
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.equal(response.headers.get('vary'), 'Origin');
    assert.equal(response.headers.get('content-type'), 'application/json');
    assert.equal(response.headers.get('access-control-allow-origin'), ORIGIN);
    for (const [name, value] of Object.entries(h.extraHeaders ?? {})) assert.equal(response.headers.get(name), value);
  });
}

test('gmail scan: scan failures map to fixed codes without diagnostics', async () => {
  const failing = (error) => createGmailScanHandler({ verifyUser: async () => user, enabled: true, allowedOrigins: [],
    scan: async () => { throw error; } });
  const body = JSON.stringify({ mode: 'more' });
  const coded = (code) => Object.assign(new Error(`private ${code}`), { code });
  await expectError(await send(failing(coded('STORAGE_STALE')), { body }), 409, 'SCAN_PERMISSION_OR_REVISION_CHANGED');
  await expectError(await send(failing(coded('SCAN_BUSY')), { body }), 429, 'SCAN_BUSY');
  await expectError(await send(failing(new Error('private provider prose')), { body }), 503, 'GMAIL_SCAN_UNAVAILABLE');
});
