// Metadata-only diagnosis: no email/prompt submission or generation request.
// The runtime loads credentials internally; never print env, headers or raw errors.
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

async function main() {
  const settings = JSON.parse(await readFile(new URL('../prompts/model-settings.json', import.meta.url), 'utf8'));
  const args = process.argv.slice(2);
  if (args.length) {
    if (args.length !== 2 || args[0] !== '--model') throw new Error();
    settings.model = args[1];
  }
  if (!/^[a-z0-9.-]+$/.test(settings.model)) throw new Error();
  try { process.loadEnvFile(fileURLToPath(new URL('../.env', import.meta.url))); }
  catch (error) { if (error.code !== 'ENOENT') throw new Error(); }
  const key = process.env.GEMINI_API_KEY;
  if (!key || /replace_with|your_actual|your_.*key/i.test(key)) {
    console.log(JSON.stringify({ error: 'MISSING_API_KEY' })); process.exitCode = 1; return;
  }
  let response;
  try {
    response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${settings.model}`, {
      headers: { 'x-goog-api-key': key }, redirect: 'error', signal: AbortSignal.timeout(30000),
    });
  } catch {
    console.log(JSON.stringify({ error: 'NETWORK_OR_TIMEOUT', generationRequests: 0 }));
    process.exitCode = 1; return;
  }
  // Only emit fixed diagnostic categories and a whitelist of public model capabilities.
  let data;
  try { data = await response.json(); } catch { data = {}; }
  const statuses = new Set(['INVALID_ARGUMENT', 'UNAUTHENTICATED', 'PERMISSION_DENIED', 'NOT_FOUND', 'RESOURCE_EXHAUSTED', 'UNAVAILABLE', 'INTERNAL']);
  console.log(JSON.stringify({
    configuredModel: settings.model, metadataHttpStatus: response.status,
    providerStatus: statuses.has(data.error?.status) ? data.error.status : null,
    generationSupported: response.ok ? data.supportedGenerationMethods?.includes('generateContent') ?? null : null,
    generationRequests: 0,
    nextStep: response.ok
      ? 'Model metadata is accessible. This does not prove generation capacity, billing eligibility, or extraction accuracy. A generation HTTP 503 needs a later retry or an explicitly selected available alternative.'
      : 'Check model availability, project permissions, API restrictions, or provider status according to the HTTP status. No alternate model was called.',
  }, null, 2));
  if (!response.ok) process.exitCode = 1;
}
main().catch(() => { console.error('DIAGNOSTIC_STARTUP_FAILED'); process.exitCode = 1; });
