import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve, basename } from 'node:path';
import { extract, prepareInput, PipelineError } from './core.mjs';
import { createGeminiGenerator } from './gemini.mjs';
import { evaluate } from './evaluate.mjs';

// No env file is loaded for offline planning/tests. Live runs load the key
// internally, never print the environment or native provider errors.
const args = process.argv.slice(2);
const readJson = async (url) => JSON.parse(await readFile(url, 'utf8'));
async function main() {
  let live = false, all = false, caseId = 'E01', customPath = null, modelOverride = null, schemaMode = null;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--live') live = true;
    else if (args[i] === '--all') all = true;
    else if (args[i] === '--case' && args[i + 1]) caseId = args[++i];
    else if (args[i] === '--input' && args[i + 1]) customPath = resolve(args[++i]);
    else if (args[i] === '--model' && args[i + 1]) modelOverride = args[++i];
    else if (args[i] === '--schema-mode' && args[i + 1]) schemaMode = args[++i];
    else throw new PipelineError('INVALID_CLI_ARGUMENTS');
  }
  if (customPath && (all || /^\.env(?:\.|$)/i.test(basename(customPath)))) throw new PipelineError('INVALID_INPUT_PATH');
  const settings = await readJson(new URL('../prompts/model-settings.json', import.meta.url));
  if (modelOverride !== null) {
    if (!/^[a-z0-9.-]+$/.test(modelOverride)) throw new PipelineError('INVALID_MODEL_OVERRIDE');
    settings.model = modelOverride;
  }
  if (schemaMode !== null) {
    if (!['openapi', 'json-schema'].includes(schemaMode)) throw new PipelineError('INVALID_SCHEMA_MODE');
    settings.schemaMode = schemaMode;
  }
  const systemPrompt = await readFile(new URL('../prompts/extraction.system.txt', import.meta.url), 'utf8');
  const expected = customPath ? {} : await readJson(new URL('../../tests/fixtures/cp2-expected.json', import.meta.url));
  let inputs;
  if (customPath) inputs = [await readJson(customPath)];
  else {
    const fixture = await readJson(new URL('../../tests/fixtures/cp2-inbox.json', import.meta.url));
    const selected = fixture.cases.filter((c) => all || c.message.id === caseId);
    if (!selected.length) throw new PipelineError('UNKNOWN_FIXTURE_CASE');
    inputs = selected.map((c) => ({ user: fixture.user, analysisTime: fixture.analysisTime, rules: fixture.rules, ...c }));
  }
  let generate;
  if (live) {
    try { process.loadEnvFile(fileURLToPath(new URL('../.env', import.meta.url))); }
    catch (e) { if (e.code !== 'ENOENT') throw new PipelineError('ENV_LOAD_FAILED'); }
    generate = createGeminiGenerator({ apiKey: process.env.GEMINI_API_KEY });
  }
  console.log(JSON.stringify({ mode: live ? 'LIVE_API' : 'OFFLINE_PLAN_NO_INFERENCE', model: settings.model, schemaMode: settings.schemaMode ?? 'json-schema', version: settings.version, selected: inputs.length }));
  let failures = 0, checked = 0, passed = 0;
  for (const input of inputs) {
    try {
      if (!live) {
        const p = prepareInput(input, settings.contextLimits);
        console.log(JSON.stringify({ messageId: p.messageId, status: p.status, reason: p.reason,
          inputChars: p.inputChars, contextIds: p.payload?.threadContext.map((m) => m.id), warnings: p.payload?.contextWarnings }));
        continue;
      }
      const output = await extract(input, { settings, systemPrompt, generate });
      if (output.status === 'extracted' && expected[output.messageId]) {
        output.evaluation = evaluate(output.result, expected[output.messageId], input.user.email);
        checked++; if (output.evaluation.passed) passed++; else failures++;
      }
      if (output.status === 'needs_review') failures++;
      console.log(JSON.stringify(output, null, 2));
    } catch (error) {
      failures++;
      console.log(JSON.stringify({ messageId: input.message?.id, status: 'failed',
        error: error instanceof PipelineError ? error.code : 'UNEXPECTED_PIPELINE_ERROR',
        providerDiagnostic: error instanceof PipelineError ? error.providerDiagnostic ?? null : null,
        usage: error.usage ?? null }));
    }
  }
  console.log(JSON.stringify({ selected: inputs.length, evaluated: checked, passed, failures,
    note: 'Automated checks cover only part of extraction quality. Skipped messages are not classified. Costs require current provider pricing; no savings or accuracy claims from offline tests.' }));
  if (failures) process.exitCode = 1;
}
main().catch((error) => {
  console.error(error instanceof PipelineError ? error.code : 'STARTUP_FAILED_CHECK_CONFIG_AND_FIXTURES');
  process.exitCode = 1;
});
