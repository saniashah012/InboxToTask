// Fictional development evaluation only. No email input path or environment output.
// Offline by default. --live makes at most one attempt per selected case, spaced
// 20 seconds apart, and stops on provider failure. Reports contain fictional output.
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { extract, prepareInput, PipelineError } from '../app/pipeline/core.mjs';
import { createGeminiGenerator } from '../app/pipeline/gemini.mjs';
import { evaluate } from '../app/pipeline/evaluate.mjs';

export function reviewChecks(output, expected, id, userEmail) {
  const evaluation = evaluate(output.result, expected, userEmail);
  const checks = { ...evaluation.checks };
  if (expected.needsReview !== undefined) checks.reviewRouting = output.needsReview === expected.needsReview;
  if (expected.needsReview) checks.specificUncertainty = output.result.uncertainties.length > 0;
  const prose = [output.result.summary, output.result.explanation,
    ...output.result.tasks.flatMap((t) => [t.action, ...t.requirements])].join(' ');
  // Focused guards catch the observed paraphrases; human review remains required.
  if (id === 'E03') {
    checks.byBoundary = output.result.tasks.every((t) => t.deadline?.boundary === 'by');
    checks.noBeforeNoon = !/before\s+(?:(?:the\s+)?deadline|noon|12(?::00)?)/i.test(prose);
  }
  if (id === 'E09') {
    checks.noInventedHour = output.result.tasks.every((t) => !t.deadline?.time);
    checks.triggerPreserved = output.result.tasks.every((t) => /(?:if|no|not|without|unless|haven.t)/i.test(t.condition ?? ''));
    checks.noReminderSendBy = !/(?:send|sending)\b[^.!?;]{0,40}\breminder\s+by\b/i.test(prose);
  }
  return { checks, passed: Object.values(checks).every(Boolean), humanReview: evaluation.humanReview };
}

async function main() {
  const args = process.argv.slice(2);
  if (args.some((arg) => !['--live', '--cp2'].includes(arg)) || new Set(args).size !== args.length) throw new PipelineError('INVALID_CLI_ARGUMENTS');
  const live = args.includes('--live'), full = args.includes('--cp2');
  const read = async (path) => JSON.parse(await readFile(new URL(path, import.meta.url), 'utf8'));
  const fixture = await read('./fixtures/cp2-inbox.json');
  const answerKey = await read('./fixtures/cp2-expected.json');
  const probes = await read('./fixtures/extraction-review.json');
  const settings = { ...await read('../app/prompts/model-settings.json'), model: 'gemini-3.6-flash', maxAttempts: 1 };
  const systemPrompt = await readFile(new URL('../app/prompts/extraction.system.txt', import.meta.url), 'utf8');
  const cases = fixture.cases.filter((c) => full || ['E03', 'E09', 'E12'].includes(c.message.id))
    .map((c) => ({ input: { user: fixture.user, analysisTime: fixture.analysisTime, rules: fixture.rules, ...c }, expected: answerKey[c.message.id] }));
  if (!full) for (const probe of probes) cases.push({
    input: { user: fixture.user, analysisTime: fixture.analysisTime, rules: fixture.rules, threadContext: [],
      message: { ...fixture.cases[0].message, id: probe.id, threadId: `thread-${probe.id}`, subject: 'Fictional review regression', body: probe.body } },
    expected: probe.expected,
  });
  let generate;
  if (live) {
    try { process.loadEnvFile(fileURLToPath(new URL('../app/.env', import.meta.url))); }
    catch (error) { if (error.code !== 'ENOENT') throw new PipelineError('ENV_LOAD_FAILED'); }
    generate = createGeminiGenerator({ apiKey: process.env.GEMINI_API_KEY });
  }
  const report = { mode: live ? 'LIVE_API' : 'OFFLINE_PLAN_NO_INFERENCE', startedAt: new Date().toISOString(),
    settings, promptSha256: createHash('sha256').update(systemPrompt).digest('hex'),
    evaluatorVersion: 'review-v2-condition-checkpoint',
    cases: cases.map(({ input, expected }) => ({ id: input.message.id, expected })),
    selected: cases.length, results: [] };
  // Unique report per run; never overwrite the earlier baseline.
  const reportUrl = new URL(`./extraction-${full ? 'cp2' : 'review'}-${report.startedAt.replace(/[:.]/g, '-')}.json`, import.meta.url);
  console.log(JSON.stringify({ mode: report.mode, selected: cases.length, model: settings.model, version: settings.version }));
  for (const { input, expected } of cases) {
    if (!live) {
      const prepared = prepareInput(input, settings.contextLimits);
      console.log(JSON.stringify({ id: input.message.id, status: prepared.status }));
      continue;
    }
    if (report.results.length) await new Promise((resolve) => setTimeout(resolve, 20000));
    let failed = false;
    try {
      const output = await extract(input, { settings, systemPrompt, generate });
      const evaluation = reviewChecks(output, expected, input.message.id, input.user.email);
      report.results.push({ id: input.message.id, output, evaluation });
      console.log(JSON.stringify({ id: input.message.id, passed: evaluation.passed, checks: evaluation.checks, needsReview: output.needsReview }));
    } catch (error) {
      failed = true;
      const code = error instanceof PipelineError ? error.code : 'UNEXPECTED_PIPELINE_ERROR';
      report.results.push({ id: input.message.id, error: code });
      console.log(JSON.stringify({ id: input.message.id, error: code, stopped: true }));
    }
    await writeFile(reportUrl, JSON.stringify(report, null, 2) + '\n');
    if (failed) break;
  }
  if (live) {
    const passed = report.results.filter((r) => r.evaluation?.passed).length;
    console.log(JSON.stringify({ report: fileURLToPath(reportUrl), passed, selected: cases.length,
      note: 'Fictional development cases; wording guards are partial. Manually inspect outputs. Failed-request usage may be unknown.' }));
    if (passed !== cases.length) process.exitCode = 1;
  }
}
if (process.argv[1] === fileURLToPath(import.meta.url)) main().catch((error) => {
  console.error(error instanceof PipelineError ? error.code : 'EVALUATION_STARTUP_FAILED');
  process.exitCode = 1;
});
