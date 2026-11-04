import { extract } from '../_shared/extraction/pipeline/core.mjs';
import { createGeminiGenerator } from '../_shared/extraction/pipeline/gemini.mjs';
import { fixture, settings, systemPrompt } from '../_shared/extraction/assets.mjs';
import { createUserVerifier } from '../_shared/auth.mjs';
import { createFixtureHandler } from '../_shared/fixture-handler.mjs';

const verifyUser = createUserVerifier({
  url: Deno.env.get('SUPABASE_URL'), publicKey: Deno.env.get('SUPABASE_ANON_KEY'),
});
const configuredModel = Deno.env.get('GEMINI_MODEL');
const effectiveSettings = { ...settings,
  ...(configuredModel ? { model: configuredModel } : {}), maxAttempts: 1 };

Deno.serve(createFixtureHandler({
  verifyUser, fixture,
  enabled: Deno.env.get('ENABLE_FIXTURE_EXTRACTION') === 'true',
  allowedOrigins: (Deno.env.get('APP_ORIGINS') ?? '').split(',').map((s) => s.trim()).filter(Boolean),
  runExtraction: (input: unknown) => extract(input, {
    settings: effectiveSettings, systemPrompt,
    generate: createGeminiGenerator({ apiKey: Deno.env.get('GEMINI_API_KEY') }),
  }),
}));
