import { extract, prepareInput } from '../_shared/extraction/pipeline/core.mjs';
import schema from '../_shared/extraction/prompts/extraction.schema.mjs';
import { createGeminiGenerator } from '../_shared/extraction/pipeline/gemini.mjs';
import { fixture, settings, systemPrompt } from '../_shared/extraction/assets.mjs';
import { createUserVerifier } from '../_shared/auth.mjs';
import { createFixtureHandler } from '../_shared/fixture-handler.mjs';
import { createStorageRpc, createStoredProcessor } from '../_shared/storage.mjs';

const verifyUser = createUserVerifier({
  url: Deno.env.get('SUPABASE_URL'), publicKey: Deno.env.get('SUPABASE_ANON_KEY'),
});
const configuredModel = Deno.env.get('GEMINI_MODEL');
const effectiveSettings = { ...settings,
  ...(configuredModel ? { model: configuredModel } : {}), maxAttempts: 1 };
const rpc = createStorageRpc({ url: Deno.env.get('SUPABASE_URL'),
  serviceKey: Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') });
const processCase = createStoredProcessor({ rpc, prepareInput, settings: effectiveSettings, systemPrompt, schema,
  extractFn: (input: unknown) => extract(input, {
    settings: effectiveSettings, systemPrompt,
    generate: createGeminiGenerator({ apiKey: Deno.env.get('GEMINI_API_KEY') }),
  }),
});

Deno.serve(createFixtureHandler({
  verifyUser, fixture,
  enabled: Deno.env.get('ENABLE_FIXTURE_EXTRACTION') === 'true',
  allowedOrigins: (Deno.env.get('APP_ORIGINS') ?? '').split(',').map((s) => s.trim()).filter(Boolean),
  runExtraction: processCase,
}));
