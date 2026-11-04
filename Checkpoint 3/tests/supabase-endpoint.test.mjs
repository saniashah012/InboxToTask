import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createUserVerifier } from '../app/supabase/functions/_shared/auth.mjs';
import { createFixtureHandler } from '../app/supabase/functions/_shared/fixture-handler.mjs';
import { extract } from '../app/pipeline/core.mjs';

const fixture = JSON.parse(await readFile(new URL('./fixtures/cp2-inbox.json', import.meta.url)));
const settings = JSON.parse(await readFile(new URL('../app/prompts/model-settings.json', import.meta.url)));
const systemPrompt = await readFile(new URL('../app/prompts/extraction.system.txt', import.meta.url), 'utf8');
const user = { id: '11111111-1111-4111-8111-111111111111', email: 'owner@test.example' };
const options = { fixture, enabled: true, allowedOrigins: ['http://localhost:5173'],
  verifyUser: async () => user, runExtraction: async (input) => ({ messageId: input.message.id }) };
const request = (body = { caseId: 'E01' }, headers = {}, method = 'POST') => new Request('http://local/analysis_email', {
  method, headers: { Authorization: 'Bearer test-user-token', 'Content-Type': 'application/json', ...headers },
  ...(method === 'POST' ? { body: typeof body === 'string' ? body : JSON.stringify(body) } : {}),
});

test('missing bearer token or public-key-only caller never invokes extraction', async () => {
  let calls = 0;
  const handler = createFixtureHandler({ ...options, runExtraction: async () => { calls++; } });
  assert.equal((await handler(request({}, { Authorization: '', apikey: 'public-key' }))).status, 401);
  const rejected = createFixtureHandler({ ...options, verifyUser: async () => null,
    runExtraction: async () => { calls++; } });
  assert.equal((await rejected(request({}, { Authorization: 'Bearer public-key' }))).status, 401);
  assert.equal(calls, 0);
});

test('Auth verifier calls the trusted Auth endpoint and returns only verified identity', async () => {
  const verify = createUserVerifier({ url: 'http://localhost:54321/', publicKey: 'public-key',
    fetchImpl: async (url, init) => {
      assert.equal(url, 'http://localhost:54321/auth/v1/user');
      assert.equal(init.headers.Authorization, 'Bearer session-token');
      assert.equal(init.headers.apikey, 'public-key');
      assert.equal(init.redirect, 'error');
      return Response.json({ ...user, app_metadata: { ignored: true } });
    } });
  assert.deepEqual(await verify('session-token'), user);
});

test('invalid/revoked credentials and anonymous Auth users are rejected', async () => {
  for (const response of [new Response(null, { status: 401 }), new Response(null, { status: 403 }),
    Response.json({ ...user, is_anonymous: true }), Response.json({ id: user.id })]) {
    const verify = createUserVerifier({ url: 'http://localhost', publicKey: 'key', fetchImpl: async () => response });
    assert.equal(await verify('invalid'), null);
  }
});

test('Auth outages fail closed and do not leak provider diagnostics', async () => {
  const handler = createFixtureHandler({ ...options,
    verifyUser: async () => { throw new Error('private auth diagnostic'); } });
  const response = await handler(request());
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { error: 'AUTH_UNAVAILABLE' });
});

test('fixture inference is disabled unless explicitly enabled', async () => {
  let calls = 0;
  const handler = createFixtureHandler({ ...options, enabled: false,
    runExtraction: async () => { calls++; } });
  assert.equal((await handler(request())).status, 503);
  assert.equal(calls, 0);
});

test('rejects caller-provided identity, rules, settings, email body and unknown case IDs', async () => {
  let calls = 0;
  const handler = createFixtureHandler({ ...options, runExtraction: async () => { calls++; } });
  for (const extra of ['user', 'rules', 'settings', 'body', 'threadContext']) {
    assert.equal((await handler(request({ caseId: 'E01', [extra]: 'override' }))).status, 400);
  }
  for (const body of [null, [], {}, { caseId: 'E99' }, { caseId: 1 }]) {
    assert.equal((await handler(request(body))).status, 400);
  }
  assert.equal(calls, 0);
});

test('streaming size limit applies without trusting Content-Length', async () => {
  const handler = createFixtureHandler(options);
  assert.equal((await handler(request(' '.repeat(1025)))).status, 413);
  assert.equal((await handler(request('{broken'))).status, 400);
  assert.equal((await handler(request({}, { 'Content-Type': 'text/plain' }))).status, 415);
});

test('CORS checks exact origins and preflight does not invoke Auth or Gemini', async () => {
  let calls = 0;
  const handler = createFixtureHandler({ ...options, verifyUser: async () => { calls++; return user; } });
  assert.equal((await handler(request({}, { Origin: 'http://localhost:5173.attacker.test' }))).status, 403);
  const preflight = await handler(request({}, { Origin: 'http://localhost:5173' }, 'OPTIONS'));
  assert.equal(preflight.status, 204);
  assert.equal(preflight.headers.get('Access-Control-Allow-Origin'), 'http://localhost:5173');
  assert.equal(calls, 0);
  assert.equal((await handler(request({}, {}, 'GET'))).status, 405);
});

test('binds identity to verified user and adapts permitted self-sent fixture history', async () => {
  let captured;
  const handler = createFixtureHandler({ ...options, runExtraction: async (input) => { captured = input; return {}; } });
  const response = await handler(request({ caseId: 'E08' }));
  assert.equal(response.status, 200);
  assert.equal(captured.user.email, user.email);
  assert.equal(captured.analysisTime, fixture.analysisTime);
  assert.equal(captured.threadContext.find((item) => item.id === 'E08-history-1').from, user.email);
  assert.ok(captured.rules.allow.senders.includes(user.email));
  assert.equal(response.headers.get('Cache-Control'), 'no-store');
  assert.equal((await response.json()).saved, false);
  assert.equal(fixture.cases.find((item) => item.message.id === 'E08').threadContext[0].from, fixture.user.email);
});

test('provider failures are sanitized, and throttling stays distinguishable', async () => {
  for (const [code, status, label] of [
    ['PROVIDER_HTTP_429', 429, 'PROVIDER_RATE_LIMITED'],
    ['MISSING_API_KEY', 503, 'EXTRACTION_NOT_CONFIGURED'],
    ['UNGROUNDED_EVIDENCE', 502, 'EXTRACTION_FAILED'],
  ]) {
    const handler = createFixtureHandler({ ...options, runExtraction: async () => {
      throw Object.assign(new Error('secret-key private email'), { code });
    } });
    const response = await handler(request());
    assert.equal(response.status, status);
    assert.deepEqual(await response.json(), { error: label });
  }
});

test('authenticated handler uses strict canonical extraction and rejects fabricated evidence', async () => {
  const result = {
    category: 'Passive', confidence: 98,
    evidence: { messageId: 'E04', quote: "Don't miss out!" },
    explanation: 'Optional promotion.', summary: 'Optional sale.',
    tasks: [], waitingFor: [], suggestedFollowUps: [], uncertainties: [],
  };
  const handler = createFixtureHandler({ ...options, runExtraction: (input) => extract(input, {
    settings, systemPrompt, generate: async () => ({ value: structuredClone(result), usage: {} }),
  }) });
  const good = await handler(request({ caseId: 'E04' }));
  assert.equal(good.status, 200);
  assert.equal((await good.json()).output.result.category, 'Passive');
  result.evidence.quote = 'Fabricated quotation';
  assert.equal((await handler(request({ caseId: 'E04' }))).status, 502);
});

test('all bundled fixture cases pass canonical input preparation through the handler', async () => {
  const { prepareInput } = await import('../app/pipeline/core.mjs');
  const handler = createFixtureHandler({ ...options, runExtraction: async (input) => {
    const prepared = prepareInput(input, settings.contextLimits);
    assert.equal(prepared.status, 'prepared');
    assert.equal(prepared.payload.user.email, user.email);
    return { messageId: input.message.id };
  } });
  for (const item of fixture.cases) {
    assert.equal((await handler(request({ caseId: item.message.id }))).status, 200, item.message.id);
  }
});
