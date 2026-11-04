import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { prepareInput, extract, validateExtraction, cleanBody } from '../app/pipeline/core.mjs';
import { createGeminiGenerator } from '../app/pipeline/gemini.mjs';
import { evaluate } from '../app/pipeline/evaluate.mjs';
import schema from '../app/prompts/extraction.schema.mjs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { buildProbe, redactDiagnostic } from '../app/pipeline/isolate.mjs';
import { toGeminiSchema, responseConfig } from '../app/pipeline/provider-schema.mjs';

const fixtures = JSON.parse(await readFile(new URL('./fixtures/cp2-inbox.json', import.meta.url), 'utf8'));
const settings = JSON.parse(await readFile(new URL('../app/prompts/model-settings.json', import.meta.url), 'utf8'));
const expected = JSON.parse(await readFile(new URL('./fixtures/cp2-expected.json', import.meta.url), 'utf8'));
const input = (id = 'E01') => structuredClone({ user: fixtures.user, analysisTime: fixtures.analysisTime, rules: fixtures.rules,
  ...fixtures.cases.find((c) => c.message.id === id) });
const prepared = (x = input()) => prepareInput(x, settings.contextLimits);
const value = () => ({
  category: 'Actionable', confidence: 95,
  evidence: { messageId: 'E01', quote: "Please upload this week's reading response" },
  explanation: 'An explicit upload request.', summary: 'A reading response is due October 7.',
  tasks: [{ action: 'Upload reading response', owner: 'student@example.org',
    deadline: { date: '2026-10-07', time: '17:00', timeZone: 'America/Chicago', wording: 'Wednesday, October 7, at 5 pm', boundary: 'by' },
    condition: null, requirements: [], evidence: { messageId: 'E01', quote: 'by Wednesday, October 7, at 5 pm' } }],
  waitingFor: [], suggestedFollowUps: [], uncertainties: [],
});
const generate = async () => ({ value: value(), attempts: 1, usage: { inputTokens: 10 }, latencyMs: 1 });
const run = (x, generator = generate) => extract(x, { settings, systemPrompt: 'Unit test prompt', generate: generator });
const request = { payload: prepared().payload, systemPrompt: 'Unit test prompt', settings, schema };
const response = (v = value(), reason = 'STOP') => new Response(JSON.stringify({
  candidates: [{ finishReason: reason, content: { parts: [{ text: JSON.stringify(v) }] } }],
  usageMetadata: { promptTokenCount: 100, candidatesTokenCount: 50, thoughtsTokenCount: 20, totalTokenCount: 170 },
}), { status: 200 });

test('all 20 original targets and answer-key IDs are present; expectations never enter model payload', () => {
  assert.equal(fixtures.cases.length, 20);
  assert.deepEqual(fixtures.cases.map((c) => c.message.id), Object.keys(expected));
  for (const c of fixtures.cases) {
    const p = prepared(input(c.message.id));
    assert.equal(p.status, 'prepared');
    assert.deepEqual(Object.keys(p.payload).sort(), ['analysisTime', 'contextWarnings', 'currentMessage', 'threadContext', 'user']);
  }
});
test('empty allowlist prevents inference', async () => {
  const x = input(); x.rules.allow.domains = [];
  let calls = 0;
  const result = await run(x, async () => { calls++; throw new Error('must not run'); });
  assert.equal(result.reason, 'NO_ALLOWLIST'); assert.equal(calls, 0); assert.equal(result.modelCalls, 0);
});
test('allow labels/senders/domains combine with OR; exclusions always win', async () => {
  for (const field of ['labels', 'senders', 'domains']) {
    const x = input(); x.rules.allow = { labels: [], senders: [], domains: [] };
    x.rules.allow[field] = [field === 'labels' ? 'CP2-fixture' : field === 'senders' ? 'lee@example.org' : 'example.org'];
    assert.equal(prepared(x).status, 'prepared');
    x.rules.block.senders = ['lee@example.org'];
    assert.equal((await run(x)).reason, 'EXCLUDED');
  }
});
test('domain matches are exact, not suffix/substrings; subject exclusions ignore case', () => {
  const x = input(); x.message.from = 'lee@notexample.org';
  assert.equal(prepared(x).reason, 'NOT_ALLOWED');
  x.message.from = 'lee@example.org'; x.rules.block.subjectKeywords = ['READING'];
  assert.equal(prepared(x).reason, 'EXCLUDED');
});
test('malformed rules and timestamps fail before inference', async () => {
  const x = input(); x.rules.allow.domains = [''];
  await assert.rejects(run(x), /INVALID_RULES/);
  const y = input(); y.message.sentAt = 'today';
  await assert.rejects(run(y), /INVALID_MESSAGE/);
});
test('each context message is filtered, with no excluded body in the payload', () => {
  const x = input('E08'); x.rules.block.senders = ['student@example.org'];
  const p = prepared(x);
  assert.equal(p.payload.threadContext.length, 1);
  assert.ok(!JSON.stringify(p.payload).includes('Just uploaded them'));
  assert.ok(p.payload.contextWarnings.some((w) => w.includes('privacy')));
});
test('context age and count limits preserve warnings and chronological order', () => {
  const x = input('E07'); x.contextLimits = { maxMessages: 1, maxAgeDays: 2 };
  const p = prepared(x);
  assert.equal(p.payload.threadContext.length, 1);
  assert.equal(p.payload.threadContext[0].id, 'E07-history-1');
  assert.ok(p.payload.contextWarnings.length > 0);
});
test('oversized current body goes to review without inference, not silent truncation', async () => {
  const x = input(); x.message.body = 'x'.repeat(12001);
  const r = await run(x, async () => { throw new Error('must not run'); });
  assert.equal(r.status, 'needs_review'); assert.equal(r.modelCalls, 0);
});
test('quoted private text is removed conservatively; negation and meaningful links preserved', () => {
  const c = cleanBody('Do not submit yet. https://example.org/assignment\n> private reply\nOn Tuesday someone wrote:\nprivate history');
  assert.equal(c.body, 'Do not submit yet. https://example.org/assignment'); assert.equal(c.removed, true);
});
test('wrong thread and duplicate context IDs fail closed', () => {
  const x = input('E07'); x.threadContext[0].threadId = 'other';
  assert.throws(() => prepared(x), /INVALID_CONTEXT_ID_OR_THREAD/);
});
test('one combined inference returns validated extraction and usage', async () => {
  const r = await run(input()); assert.equal(r.status, 'extracted'); assert.equal(r.modelCalls, 1);
  assert.equal(r.result.tasks[0].owner, 'student@example.org'); assert.equal(r.usage.inputTokens, 10);
});
test('schema rejects absent properties, extra properties, invalid enum and confidence', () => {
  for (const mutate of [v => delete v.tasks, v => v.extra = true, v => v.category = 'Unknown', v => v.confidence = 101]) {
    const v = value(); mutate(v); assert.throws(() => validateExtraction(v, prepared().payload), /INVALID_OUTPUT_SCHEMA/);
  }
});
test('rejects fabricated quotations and evidence from excluded sources', () => {
  const v = value(); v.tasks[0].evidence.quote = 'Invented text';
  assert.throws(() => validateExtraction(v, prepared().payload), /UNGROUNDED_EVIDENCE/);
  v.tasks[0].evidence = { messageId: 'excluded-id', quote: 'private' };
  assert.throws(() => validateExtraction(v, prepared().payload), /UNGROUNDED_EVIDENCE/);
});
test('category-task consistency and owner responsibility are enforced', () => {
  const v = value(); v.category = 'Passive';
  assert.throws(() => validateExtraction(v, prepared().payload), /CATEGORY_TASK_MISMATCH/);
  v.category = 'Actionable'; v.tasks[0].owner = 'someone@example.org';
  assert.throws(() => validateExtraction(v, prepared().payload), /WRONG_TASK_OWNER/);
});
test('missing deadline stays null and routes to review; invalid dates rejected', async () => {
  const v = value(); v.tasks[0].deadline = null;
  const r = await run(input(), async () => ({ value: v })); assert.equal(r.needsReview, true);
  const invalid = value(); invalid.tasks[0].deadline.date = '2026-02-30';
  assert.throws(() => validateExtraction(invalid, prepared().payload), /INVALID_DEADLINE/);
});
test('conditional reminders retain their trigger without creating a follow-up suggestion', () => {
  const x = input('E09'), v = value();
  v.evidence = { messageId: 'E09', quote: 'please send me a reminder' };
  v.tasks[0].evidence = v.evidence; v.tasks[0].deadline = null;
  v.tasks[0].condition = 'No feedback received by Friday afternoon';
  validateExtraction(v, prepared(x).payload);
  assert.ok(evaluate(v, { category: 'Actionable', taskCount: 1, conditional: true }, x.user.email).passed);
});
test('suggested follow-up requires a matching external owner and elapsed promised deadline', () => {
  const p = prepared(input('E19')).payload;
  const e = { messageId: 'E19', quote: "I'll sign it and send it back by Friday, October 2." };
  const v = { ...value(), category: 'Passive', evidence: e, tasks: [], waitingFor: [{ action: 'Return form', owner: 'alex@example.org',
    promisedDeadline: { date: '2026-10-02', time: null, timeZone: 'America/Chicago', wording: 'Friday, October 2', boundary: 'by' }, evidence: e }],
    suggestedFollowUps: [{ action: 'Ask about form', recipient: 'alex@example.org', waitingForIndex: 0, rationale: 'No resolution visible in supplied email history.', evidence: e }] };
  validateExtraction(v, p);
  v.waitingFor[0].promisedDeadline = null;
  assert.throws(() => validateExtraction(v, p), /UNSUPPORTED_FOLLOW_UP/);
});
test('transport uses header key, no tools, bounded output, and ignores thought parts', async () => {
  const fakeKey = 'unit-test-key-not-a-real-credential';
  const g = createGeminiGenerator({ apiKey: fakeKey, fetchImpl: async (url, options) => {
    assert.ok(!url.includes(fakeKey)); assert.equal(options.headers['x-goog-api-key'], fakeKey);
    const body = JSON.parse(options.body); assert.ok(!('tools' in body));
    assert.equal(body.generationConfig.thinkingConfig.thinkingLevel, 'LOW');
    assert.ok(!options.body.includes(fakeKey)); return response();
  } });
  const r = await g(request); assert.equal(r.usage.thinkingTokens, 20); assert.equal(r.attempts, 1);
});
test('provider failures expose only status, never raw error text or credentials', async () => {
  const g = createGeminiGenerator({ apiKey: 'unit-test-secret', fetchImpl: async () => new Response('sensitive provider diagnostic', { status: 403 }) });
  await assert.rejects(g(request), (e) => e.message === 'PROVIDER_HTTP_403');
  const network = createGeminiGenerator({ apiKey: 'unit-test-secret', fetchImpl: async () => { throw new Error('unit-test-secret'); } });
  await assert.rejects(network(request), (e) => e.message === 'NETWORK_OR_TIMEOUT');
});
test('transient retry is explicit and bounded; default makes one attempt', async () => {
  let calls = 0;
  const g = createGeminiGenerator({ apiKey: 'unit-test-key', sleepImpl: async () => {}, fetchImpl: async () => {
    calls++; return calls === 1 ? new Response('', { status: 429, headers: { 'retry-after': '0' } }) : response();
  } });
  await assert.rejects(g(request), /PROVIDER_HTTP_429/); assert.equal(calls, 1);
  calls = 0;
  assert.equal((await g({ ...request, settings: { ...settings, maxAttempts: 2 } })).attempts, 2);
});
test('truncated output is never accepted as a successful result', async () => {
  const g = createGeminiGenerator({ apiKey: 'unit-test-key', fetchImpl: async () => response(value(), 'MAX_TOKENS') });
  await assert.rejects(g(request), (e) => e.code === 'OUTPUT_TRUNCATED' && e.usage.totalTokens === 170);
});
test('malformed JSON and model refusal fail with safe diagnostics', async () => {
  const g = createGeminiGenerator({ apiKey: 'unit-test-key', fetchImpl: async () => new Response(JSON.stringify({
    candidates: [{ finishReason: 'STOP', content: { parts: [{ text: 'not json' }] } }],
  })) });
  await assert.rejects(g(request), /INVALID_OUTPUT_JSON/);
  const blocked = createGeminiGenerator({ apiKey: 'unit-test-key', fetchImpl: async () => response(value(), 'SAFETY') });
  await assert.rejects(blocked(request), /MODEL_BLOCKED_OR_INCOMPLETE/);
});
test('placeholder key is rejected without a network request', () => {
  assert.throws(() => createGeminiGenerator({ apiKey: 'replace_with_your_gemini_api_key' }), /MISSING_API_KEY/);
});

test('deadline-update fixture includes the permitted original without old request duplication', async () => {
  const x = JSON.parse(await readFile(new URL('./fixtures/deadline-update.json', import.meta.url), 'utf8'));
  const p = prepared(x);
  assert.equal(p.payload.threadContext.length, 1);
  assert.ok(p.payload.currentMessage.body.includes('November 8'));
  assert.ok(p.payload.threadContext[0].body.includes('five-page'));
});
test('injection stays inside user data; system instructions and tool permissions are unchanged', async () => {
  const x = JSON.parse(await readFile(new URL('./fixtures/prompt-injection.json', import.meta.url), 'utf8'));
  const p = prepared(x);
  const g = createGeminiGenerator({ apiKey: 'unit-test-key', fetchImpl: async (_url, options) => {
    const body = JSON.parse(options.body);
    assert.equal(body.systemInstruction.parts[0].text, 'trusted system instruction');
    assert.ok(body.contents[0].parts[0].text.includes('SYSTEM OVERRIDE'));
    assert.ok(!('tools' in body));
    return response();
  } });
  await g({ ...request, payload: p.payload, systemPrompt: 'trusted system instruction' });
});

test('one-run model override leaves default configuration unchanged and rejects path injection', () => {
  const cli = fileURLToPath(new URL('../app/pipeline/cli.mjs', import.meta.url));
  const output = execFileSync(process.execPath, [cli, '--case', 'E01', '--model', 'gemini-3.6-flash'], { encoding: 'utf8' });
  assert.equal(JSON.parse(output.split('\n')[0]).model, 'gemini-3.6-flash');
  assert.equal(settings.model, 'gemini-3.8-flash');
  assert.throws(() => execFileSync(process.execPath, [cli, '--model', '../bad'], { stdio: 'pipe' }));
});

test('provider diagnostic hints whitelist setting names without exposing message text', async () => {
  const g = createGeminiGenerator({ apiKey: 'unit-test-secret', fetchImpl: async () => new Response(JSON.stringify({
    error: { message: 'Unsupported thinkingConfig for unit-test-secret and private@example.org' },
  }), { status: 400 }) });
  await assert.rejects(g(request), (error) => {
    const detail = JSON.stringify(error.providerDiagnostic);
    assert.equal(error.providerDiagnostic.mentionsThinking, true);
    assert.ok(error.providerDiagnostic.knownFields.includes('thinkingConfig'));
    assert.ok(!detail.includes('unit-test-secret') && !detail.includes('private@example.org'));
    return true;
  });
});

test('isolation stages change one configuration group while preserving fictional inputs', () => {
  const p = prepared().payload;
  const minimal = buildProbe('minimal', p, 'system', settings);
  assert.deepEqual(Object.keys(minimal), ['contents']);
  assert.ok(!JSON.stringify(minimal).includes('student@example.org'));
  const baseline = buildProbe('baseline', p, 'system', settings);
  assert.ok(!Object.hasOwn(baseline, 'generationConfig'));
  const structured = buildProbe('schema', p, 'system', settings);
  assert.deepEqual(structured.contents, baseline.contents);
  assert.deepEqual(structured.generationConfig.responseFormat.text.schema, schema);
  assert.ok(!Object.hasOwn(structured.generationConfig, 'thinkingConfig'));
  const thinking = buildProbe('thinking', p, 'system', settings);
  assert.deepEqual(thinking.generationConfig.thinkingConfig, { thinkingLevel: 'LOW' });
  assert.ok(!Object.hasOwn(thinking.generationConfig, 'maxOutputTokens'));
  assert.equal(buildProbe('full', p, 'system', settings).generationConfig.maxOutputTokens, 8192);
  assert.throws(() => buildProbe('unknown', p, 'system', settings));
});

test('synthetic diagnostic redacts key and email before truncation', () => {
  const result = redactDiagnostic('Invalid responseMimeType secret-test-key test@example.org ' + 'x'.repeat(900), 'secret-test-key');
  assert.ok(result.includes('responseMimeType'));
  assert.ok(!result.includes('secret-test-key') && !result.includes('test@example.org'));
  assert.ok(result.length <= 800);
});

test('provider adapter preserves field semantics, per-task deadlines, enums and nullability', () => {
  const original = JSON.stringify(schema);
  const adapted = toGeminiSchema(schema);
  assert.equal(adapted.type, 'OBJECT');
  assert.deepEqual(adapted.required, Object.keys(schema.properties));
  assert.deepEqual(adapted.properties.category.enum, ['Actionable', 'Passive']);
  const task = adapted.properties.tasks.items;
  assert.equal(task.properties.deadline.type, 'OBJECT');
  assert.equal(task.properties.deadline.nullable, true);
  assert.deepEqual(task.properties.deadline.properties.boundary.enum, ['by', 'before', 'on', 'unspecified']);
  assert.equal(task.properties.deadline.properties.time.nullable, true);
  assert.ok(task.properties.owner && task.properties.evidence && task.properties.condition);
  assert.ok(!JSON.stringify(adapted).includes('additionalProperties'));
  assert.ok(!JSON.stringify(adapted).includes('maxLength'));
  assert.equal(JSON.stringify(schema), original);
});
test('responseSchema adapter is applied to provider request only; strict backend checks remain', async () => {
  const g = createGeminiGenerator({ apiKey: 'unit-test-key', fetchImpl: async (_url, options) => {
    const config = JSON.parse(options.body).generationConfig;
    assert.equal(config.responseSchema.type, 'OBJECT');
    assert.ok(!Object.hasOwn(config, 'responseJsonSchema'));
    return response();
  } });
  await g({ ...request, settings: { ...settings, schemaMode: 'openapi' } });
  const v = value(); v.confidence = 101;
  assert.throws(() => validateExtraction(v, prepared().payload), /INVALID_OUTPUT_SCHEMA/);
  assert.throws(() => responseConfig(schema, 'wrong'));
});
