# Google sign-in and backend connection

This implements app sign-in and an account-bound Google connection. It does not
retrieve Gmail messages, enable scanning, call a model, or connect Calendar.
The prototype at `/` remains simulated; real controls are on `/storage`.

## Architecture and decisions

1. **App sign-in:** Supabase Google provider → frontend PKCE callback at
   `/storage/auth/callback` → the existing shared Supabase session/client.
   This requests only OpenID/email/profile and does not request offline Gmail access.
2. **Connect Google:** authenticated `google_connection` POST → Google consent →
   public `google_callback` GET → server-side code exchange/identity verification →
   encrypted private credentials → fixed frontend return destination.
3. The verified Supabase user owns the connection. The verified Google email must
   match that user's email, case-insensitively. A reconnect must also match the
   saved Google subject. Disconnect first to change the linked Google identity.
4. State is random, stored only as a SHA-256 hash, expires after ten minutes, and
   is atomically consumed once. The PKCE verifier is encrypted. Starting a new
   connection invalidates previous state; starts have a 30-second cooldown.
5. Tokens use AES-256-GCM with a fresh IV and account/purpose/key-ID authenticated
   context. Only ciphertext is stored. Keys are separate Edge secrets, not SQL or
   browser configuration. A keyring permits decrypting old keys during rotation.
6. Refresh uses a 45-second database lease, generation comparison, a 60-second
   expiry margin, and a 60-second transient-error cooldown. Each operation makes
   at most one provider request per endpoint; there is no automatic retry loop.
7. Disconnect immediately blocks backend token acquisition, invalidates pending
   state and stale callback/refresh commits, and revokes the saved refresh token.
   Credentials are erased after successful/already-invalid revocation. A failed
   revocation retains encrypted credentials in `disconnecting` for explicit retry.

The separate sign-in and Gmail authorization clients should use separate Google
Cloud projects when independent revocation is required. Google documents that
revocation can invalidate grants for **all clients in the same project**.
Separate clients alone do not isolate that effect.

No manual account merge is implemented. Supabase manages supported automatic
identity linking for matching verified email addresses; verify that behavior with
the project's Auth configuration before inviting existing users. Different-email
mailboxes are intentionally unsupported in this milestone.

## Hosted inspection, November 5, 2026

Read-only inspection of the linked `IS492_c3` project found:

- Applied history: `20261104050000` and `20261104100000`.
- The second migration creates `user_onboarding_preferences`; its recorded SQL
  was recovered as [the local migration](migrations/20261104100000_user_onboarding_preferences.sql).
- Hosted tables include `tasks`, `task_suggestions`, and
  `user_onboarding_preferences`. The normalized `storage_*` tables are absent.
  The task foundation matches the inspected legacy table's columns/checks.
- Hosted tasks/suggestions have direct owner-write policies and broad table grants.
  Pending local storage migrations narrow task writes to review RPCs. Coordinate
  this contract change with clients of the old endpoint before rollout.
- The only listed deployed function is `analysis_email`, version 6, last updated
  October 30. It has not been replaced or deployed by this implementation.
- The Google provider, hosted secrets, Google Cloud clients, and redirects have
  **not** been configured or verified. No hosted schema/data/function changes were made.
- The inspected hosted public schema was replayed in disposable PGlite and all
  seven pending migrations applied with fictional legacy rows preserved. This
  rehearses SQL compatibility, not hosted Auth/HTTP/deployment behavior.

Preserve hosted suggestions/onboarding data. The recovered onboarding fields are
not a validated scanning consent/allowlist contract. Do not infer consent from them.

## Google Cloud setup

Use dedicated test accounts containing fictional content. Configure branding,
support contact, audience, test users, and the appropriate OAuth testing status.

Create these Web application OAuth clients:

| Client | Requested scopes | Authorized redirect URI |
| --- | --- | --- |
| Supabase app sign-in | OpenID/email/profile | The Supabase Auth callback URL shown by your environment; hosted normally `https://<project-ref>.supabase.co/auth/v1/callback` |
| Backend Gmail connection | `openid email https://www.googleapis.com/auth/gmail.readonly` | Exact `GOOGLE_CALLBACK_URL`; local `http://127.0.0.1:54321/functions/v1/google_callback`, hosted `https://<project-ref>.supabase.co/functions/v1/google_callback` |

Enable Gmail API for the connection project. Calendar scopes/APIs are not needed.
If adding authorized JavaScript origins, enter origins such as
`http://127.0.0.1:5173`, without callback paths. Redirect URIs must match exactly,
including host, scheme, port, and path; localhost and 127.0.0.1 are different.

`gmail.readonly` is needed to support future permitted body retrieval; narrower
metadata access cannot support that feature. Requesting the scope does not make
scanning consent implicit. Verify Google's current restricted-scope verification,
testing-user limits, and testing-mode refresh-token expiry before live use/public
rollout. Do not assume a refresh token remains valid indefinitely.

## Local configuration

From [the app directory](../), use the existing dependencies and running Docker
stack. Do not reset the database to apply migrations.

```powershell
npx.cmd supabase --agent no migration up
npx.cmd supabase --agent no test db
```

For Google **sign-in**:

1. In [config.toml](config.toml), enable `[auth.external.google]`.
2. Supply `SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID` and
   `SUPABASE_AUTH_EXTERNAL_GOOGLE_SECRET` privately to the Supabase CLI environment
   (or its ignored `supabase/.env` file). These are the sign-in client credentials.
3. Ensure the exact frontend callback is in `additional_redirect_urls`. Both
   localhost and 127.0.0.1 port-5173 callbacks are included in the template.
4. Restart the local Auth service/stack as needed to load changed Auth config.
   Preserve local data; do not use `db reset` or a destructive stop option.

For the **backend Gmail connection**, copy [the function environment template](functions/.env.example)
to an ignored private file. Fill:

| Variable | Value |
| --- | --- |
| `ENABLE_GOOGLE_CONNECTION` | `true` after configuration |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Backend connection client's credentials |
| `GOOGLE_CALLBACK_URL` | Exact registered backend callback |
| `GOOGLE_RETURN_URL` | Fixed frontend return, e.g. `http://127.0.0.1:5173/storage` |
| `APP_ORIGINS` | Exact allowed frontend origins, including the return URL's origin |
| `GOOGLE_TOKEN_ACTIVE_KEY` | Key ID, initially `v1` |
| `GOOGLE_TOKEN_KEYS` | JSON map such as `{"v1":"<base64 of 32 random bytes>"}` |

Generate a cryptographically random 32-byte key privately; store it in your secret
manager. Do not reuse an example key, paste secrets into chat, or commit the file.
Supabase supplies its own URL/anon/service-role keys to Edge. Keep fixture
inference disabled. Serve all functions so both connection and callback routes exist:

```powershell
npx.cmd supabase --agent no functions serve --env-file supabase/functions/.env
```

Use [the frontend environment template](../web/.env.example) with the local public
URL/key and `VITE_STORAGE_ENABLED=true`. Enable `VITE_GOOGLE_AUTH_ENABLED` after
sign-in configuration, and `VITE_GOOGLE_CONNECTION_ENABLED` after backend setup.
Restart Vite after changing these flags. Run from [web](../web/):

```powershell
corepack pnpm exec tsc --noEmit
corepack pnpm build
corepack pnpm dev --host 127.0.0.1
```

Open `/storage`. Register `/storage/auth/callback` with your frontend hosting SPA
fallback so a direct callback request serves the React app. There is no second
Supabase client and no frontend Gmail token handoff.

## API and integration contract

- `google_connection_status()` is an authenticated RPC. Returns only `state`,
  optional `email`, `scopes`, `expiresAt`, and `scanningEnabled: false`.
- `POST /functions/v1/google_connection` requires a verified Supabase bearer and
  JSON containing exactly `{"action":"connect"}`, `{"action":"check"}`, or
  `{"action":"disconnect"}`. Caller-supplied identity is rejected.
- Connect returns the Google authorization URL. Check ensures a backend access
  token is available and refreshes if due; an unexpired cached token does not prove
  Google has not revoked the grant. No tokens are returned to the browser.
- The callback accepts Google's code/state, consumes state, exchanges server-side,
  checks verified email/subject/granted Gmail scope/offline token, and redirects to
  the fixed return URL with only `google=connected` or `google=failed`.
- Both function platform JWT gates are disabled deliberately: the connection
  handler verifies sessions through Auth itself; Google reaches the callback
  without a Supabase bearer, using the single-use state instead. CORS is not auth.
- `google_connection_service` is service-role-only; private tables deny direct
  browser and service-role table access. Fixed search paths/grants are explicit.
- Sign-out ends the app session, but keeps the Google connection. Disconnect is
  separate. Account deletion cascades credential rows; an account-deletion flow
  must revoke Google access **before** deleting the Auth account if remote
  revocation is required. SQL deletion alone cannot call Google.

Future scanning must check saved consent, effective filters, pause/deletion state,
and connection generation before retrieval, inference, and persistence. The current
fixture-only storage claim remains unchanged and cannot process real Gmail.
No scheduler or background token-refresh job is installed by these migrations.

State/code are necessarily carried in Google's callback request URL; never log
callback query strings at gateways/analytics. App code logs no tokens, request
payloads, provider bodies, or callback parameters. Failed/abandoned Google consent
may leave a grant visible in Google's account permissions even though the app did
not save credentials. Remove that grant in Google settings when abandoning setup.

## Verification and remaining live checks

See [the dated verification report](../../docs/google-auth-verification-2026-11-05.md)
for actual results and limitations: 99 offline tests, 40 real local database checks,
four Google local API/Edge groups, frontend type/build, Edge types, and browser checks.

Automated commands from [app](../):

```powershell
npm.cmd test
npm.cmd run test:google
npx.cmd supabase --agent no test db
npm.cmd run test:google:local
npx.cmd --yes --package deno deno check supabase/functions/google_connection/index.ts supabase/functions/google_callback/index.ts
```

The local API trial requires both Google functions served **disabled**. It creates
two fictional temporary users and deletes them in `finally`; it uses synthetic
token ciphertext placeholders, never Google/model calls. Offline tests exercise
real AES-GCM and simulated provider responses; PGlite tests PostgreSQL semantics.

Before claiming working Google integration, use configured test clients to verify:

- Google sign-in, existing verified-email identity linking, reload and sign-out.
- Successful connection, refused consent/partial scopes, wrong mailbox, expired or
  replayed state, and reconnect after revocation.
- Refresh after actual token expiry; disconnect and provider revocation, including
  transient failure and retry. Verify Google-side permissions removal.
- Browser/network/log inspection confirms no Gmail access/refresh tokens exposed.
- Connection triggers zero Gmail retrieval, scans, Calendar writes, or model calls.

For key rotation, retain old decrypting keys, set a new active key, and re-encrypt
existing credentials through controlled backend maintenance or reconnect users.
Changing the active key alone does not re-encrypt dormant credentials or pending
state. Remove old keys only after no records use them. Recover from a lost key by
revoking the grant in Google settings and performing controlled credential cleanup.

## Hosted rollout, separate from local implementation

1. Recheck hosted migration history/schema, back up data, and agree on the new task
   write contract with the frontend/old function owners. Preserve the recovered
   onboarding migration and existing `task_suggestions` data.
2. Rehearse pending migrations against a disposable copy of hosted schema/data.
   Migration-history reconciliation is complete in files, but production rollout
   compatibility has not been established by local tests alone. Older pending
   migrations precede the hosted onboarding migration; use the CLI's reviewed
   include-all migration workflow if required. Do not repair history by marking
   unexecuted SQL as applied.
3. Configure hosted Google provider credentials, Site URL, exact redirect allowlist,
   Google Cloud clients/test users, Edge secrets, and deployment origins privately.
   Local config edits do not configure hosted Auth.
4. Apply reviewed pending migrations; deploy `google_connection` and
   `google_callback` with their configured platform JWT behavior. Existing
   `analysis_email` replacement is a separate coordinated rollout.
5. Enable frontend flags and repeat the live checklist against the hosted project.
   Keep real Gmail processing disabled until phase 4 consent/rules and phase 5
   retrieval are implemented and verified.

Official references: [Supabase Google sign-in](https://supabase.com/docs/guides/auth/social-sign-in/auth-google),
[Google server OAuth/offline access/revocation](https://developers.google.com/identity/protocols/oauth2/web-server),
[Google OpenID discovery, including S256 PKCE](https://accounts.google.com/.well-known/openid-configuration),
[Google OAuth policies](https://developers.google.com/identity/protocols/oauth2/policies).
