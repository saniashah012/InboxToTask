# Installation

## Local Supabase foundation

See [local Supabase setup](supabase/README.md) for the local-only permission migrations,
authenticated fictional-email endpoint, database tests, and current verification limits.
The hosted backend has not been modified by this local setup.

## Local AI extraction pipeline (no Supabase required)

Requirements: Node.js 22 or later. No npm dependency installation is needed for this backend module.

From the repository root:

```sh
node --test "Checkpoint 3/tests/pipeline.test.mjs"
node "Checkpoint 3/app/pipeline/cli.mjs" --all
```

The first command runs offline tests; the second previews filtering/context selection without model inference. Neither loads a key or calls an API.

For actual inference, create the ignored `Checkpoint 3/app/.env` with `GEMINI_API_KEY` set locally. Never commit the real value or place it in frontend variables. Then run:

```sh
node "Checkpoint 3/app/pipeline/cli.mjs" --case E01 --live
```

This submits one fictional CP2 email to Gemini and consumes API quota. Use `--all --live` to evaluate all 20 targets. See the [pipeline guide](pipeline/README.md) for input/output contracts, Windows Node PATH troubleshooting, model settings, and limitations. This pipeline is not yet connected to the dashboard or scheduled Gmail access.

## Local production build

Requirements: Node.js 22 and pnpm 10.

From `Checkpoint 3/app/web`, install the locked dependencies and build:

```sh
corepack pnpm install --frozen-lockfile
corepack pnpm build
```

The production files are written to `Checkpoint 3/app/web/dist`. No environment
variables are required for the preview demo. Authenticated use requires the
frontend variables listed in `Checkpoint 3/app/web/.env.example`.

## Vercel deployment

1. Import the repository into Vercel.
2. Set the **Root Directory** to `Checkpoint 3/app/web`.
3. Use the Vite framework preset, install command `pnpm install --frozen-lockfile`,
   build command `pnpm build`, and output directory `dist`.
4. Add `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` for the
   Production, Preview, and Development environments that should support sign-in.
   These are browser configuration values; never add a service-role key or
   `GEMINI_API_KEY` to Vite variables.
5. In Supabase Auth, enable Google and configure its OAuth client. Set the
   Supabase Auth site URL to the production app origin and add the exact Vercel
   preview and local origins to the redirect allow list. Register the Supabase
   Google callback URL in the Google OAuth client. Use profile/email scopes
   only; Gmail access requires separate future authorization.
6. Apply the version-controlled migrations only after reviewing/reconciling the
   hosted migration history. This frontend change does not apply or deploy them.

Without the Supabase frontend variables, Google sign-in remains unavailable.
Select **Preview onboarding** to walk through setup with a fictional Gmail
account, or select **Explore demo** to skip directly to the sample dashboard.
Preview scans, connection actions, calendar-event previews, and preference
edits only update local in-memory state; they do not access external accounts,
process real messages, or save preferences to Supabase. In authenticated mode,
onboarding preferences are saved to the signed-in user’s row. Gmail remains
unauthorized and scanning stays disabled.
