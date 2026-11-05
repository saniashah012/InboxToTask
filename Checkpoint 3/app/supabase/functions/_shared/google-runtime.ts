import { createUserVerifier } from './auth.mjs';
import { createGoogleConnection, createGoogleHandler, createGoogleProvider, createGoogleRpc, createTokenCipher } from './google-connection.mjs';

// Fail closed on absent/invalid secrets. No secret values or diagnostics logged.
export function googleRuntime(callback = false) {
  const env = (key: string) => Deno.env.get(key) ?? '';
  const origins = env('APP_ORIGINS').split(',').map((v) => v.trim()).filter(Boolean);
  let connection;
  let enabled = false;
  const returnUrl = env('GOOGLE_RETURN_URL');
  try {
    const redirect = new URL(env('GOOGLE_CALLBACK_URL'));
    const destination = new URL(returnUrl);
    const safe = (url: URL) => !url.username && !url.password && !url.search && !url.hash
      && (url.protocol === 'https:' || (url.protocol === 'http:' && ['localhost','127.0.0.1'].includes(url.hostname)));
    if (!safe(redirect) || !safe(destination) || !origins.includes(destination.origin)
      || !env('GOOGLE_CLIENT_ID') || !env('GOOGLE_CLIENT_SECRET')) throw new Error('CONFIG');
    connection = createGoogleConnection({
      rpc: createGoogleRpc({url:env('SUPABASE_URL'),serviceKey:env('SUPABASE_SERVICE_ROLE_KEY')}),
      cipher: createTokenCipher({keys:env('GOOGLE_TOKEN_KEYS'),activeKey:env('GOOGLE_TOKEN_ACTIVE_KEY')}),
      provider: createGoogleProvider({clientId:env('GOOGLE_CLIENT_ID'),clientSecret:env('GOOGLE_CLIENT_SECRET'),callbackUrl:redirect.href}),
    });
    enabled = env('ENABLE_GOOGLE_CONNECTION') === 'true';
  } catch { /* Disabled until configured. */ }
  return createGoogleHandler({connection, enabled, callback, returnUrl, allowedOrigins:origins,
    verifyUser:createUserVerifier({url:env('SUPABASE_URL'),publicKey:env('SUPABASE_ANON_KEY')})});
}
