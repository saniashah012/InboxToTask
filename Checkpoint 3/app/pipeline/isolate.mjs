// Controlled generation probes. Env is loaded internally ONLY during a live run.
import { readFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { prepareInput } from './core.mjs';
import schema from '../prompts/extraction.schema.mjs';
import { responseConfig } from './provider-schema.mjs';

export function redactDiagnostic(message, key) {
  if (typeof message !== 'string') return null;
  return message.replaceAll(key, '[REDACTED_KEY]')
    .replace(/AIza[A-Za-z0-9_-]+/g, '[REDACTED_KEY]')
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[REDACTED_EMAIL]')
    .slice(0, 800);
}

export function buildProbe(stage, payload, systemPrompt, settings, schemaMode = 'json-schema') {
  if (!['json-schema', 'openapi'].includes(schemaMode)) throw new Error('INVALID_SCHEMA_MODE');
  if (!['minimal', 'baseline', 'simple-schema', 'schema', 'thinking', 'full'].includes(stage)) throw new Error('INVALID_STAGE');
  if (stage === 'minimal') return { contents: [{ parts: [{ text: 'Return only the word OK.' }] }] };
  const body = {
    systemInstruction: { parts: [{ text: systemPrompt }] },
    contents: [{ role: 'user', parts: [{ text: JSON.stringify(payload) }] }],
  };
  // Identical email/system content for baseline -> schema -> thinking -> full.
  if (stage !== 'baseline') body.generationConfig = { responseFormat: { text: { mimeType: 'APPLICATION_JSON', schema } } };
  if (stage === 'simple-schema') body.generationConfig.responseFormat.text.schema = {
    type: 'object', properties: { category: { type: 'string', enum: ['Actionable', 'Passive'] } }, required: ['category'],
  };
  if (stage !== 'baseline' && schemaMode === 'openapi') {
    const selectedSchema = body.generationConfig.responseFormat.text.schema;
    body.generationConfig = responseConfig(selectedSchema, 'openapi');
  }
  if (['thinking', 'full'].includes(stage)) body.generationConfig.thinkingConfig = { thinkingLevel: settings.thinkingLevel };
  if (stage === 'full') body.generationConfig.maxOutputTokens = settings.maxOutputTokens;
  return body;
}

async function main() {
  const args = process.argv.slice(2);
  let stage = 'minimal', model, schemaMode;
  for (let i = 0; i < args.length; i += 2) {
    if (!args[i + 1] || !['--stage', '--model', '--schema-mode'].includes(args[i])) throw new Error();
    if (args[i] === '--stage') stage = args[i + 1];
    else if (args[i] === '--model') model = args[i + 1]; else schemaMode = args[i + 1];
  }
  const settings = JSON.parse(await readFile(new URL('../prompts/model-settings.json', import.meta.url), 'utf8'));
  model ??= settings.model;
  schemaMode ??= settings.schemaMode ?? 'json-schema';
  if (!/^[a-z0-9.-]+$/.test(model)) throw new Error();
  const fixture = JSON.parse(await readFile(new URL('../../tests/fixtures/cp2-inbox.json', import.meta.url), 'utf8'));
  const input = { user: fixture.user, analysisTime: fixture.analysisTime, rules: fixture.rules, ...fixture.cases[0] };
  const systemPrompt = await readFile(new URL('../prompts/extraction.system.txt', import.meta.url), 'utf8');
  const body = buildProbe(stage, prepareInput(input, settings.contextLimits).payload, systemPrompt, settings, schemaMode);
  try { process.loadEnvFile(fileURLToPath(new URL('../.env', import.meta.url))); }
  catch (error) { if (error.code !== 'ENOENT') throw new Error(); }
  const key = process.env.GEMINI_API_KEY;
  if (!key || /replace_with|your_actual|your_.*key/i.test(key)) {
    console.log(JSON.stringify({ error: 'MISSING_API_KEY' })); process.exitCode = 1; return;
  }
  console.log(JSON.stringify({ model, stage, schemaMode, generationRequests: 1, email: stage === 'minimal' ? 'none' : 'fictional E01', automaticRetries: 0 }));
  let response;
  try {
    response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: 'POST', redirect: 'error', signal: AbortSignal.timeout(60000),
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key }, body: JSON.stringify(body),
    });
  } catch {
    console.log(JSON.stringify({ error: 'NETWORK_OR_TIMEOUT', outcome: 'unknown' })); process.exitCode = 1; return;
  }
  let data;
  try { data = await response.json(); } catch { data = {}; }
  const statuses = ['INVALID_ARGUMENT', 'FAILED_PRECONDITION', 'UNAUTHENTICATED', 'PERMISSION_DENIED', 'NOT_FOUND', 'RESOURCE_EXHAUSTED', 'UNAVAILABLE', 'INTERNAL'];
  const message = String(data.error?.message ?? '').toLowerCase();
  const knownFields = ['thinkingConfig', 'thinkingLevel', 'responseJsonSchema', 'responseMimeType', 'maxOutputTokens'];
  const categories = {
    thinking: /thinking/.test(message), schema: /schema/.test(message),
    billing: /billing|payment|paid tier/.test(message), quota: /quota|rate limit/.test(message),
    location: /region|location|country/.test(message), permissions: /permission|api key|credential/.test(message),
  };
  console.log(JSON.stringify({ httpStatus: response.status,
    providerStatus: statuses.includes(data.error?.status) ? data.error.status : null,
    // Synthetic-only diagnostic: redact credentials before printing a bounded message.
    // Production pipeline still exposes fixed hints only, never provider prose.
    redactedMessage: response.ok ? null : redactDiagnostic(data.error?.message, key),
    diagnosticHints: response.ok ? null : { categories, knownFields: knownFields.filter((f) => message.includes(f.toLowerCase())) },
    finishReason: ['STOP', 'MAX_TOKENS', 'SAFETY'].includes(data.candidates?.[0]?.finishReason) ? data.candidates[0].finishReason : null,
    returnedModelVersion: /^[a-zA-Z0-9._/-]{1,150}$/.test(data.modelVersion ?? '') ? data.modelVersion : null,
    note: 'Synthetic probe only: error message is bounded and redacted; no generated text, credentials or environment contents printed. HTTP success alone is not extraction accuracy or proof of all billing/features.',
  }, null, 2));
  if (!response.ok) process.exitCode = 1;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(() => { console.error('ISOLATION_STARTUP_FAILED'); process.exitCode = 1; });
}
