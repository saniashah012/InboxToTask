# Installation

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
variables are required for this demo.

## Vercel deployment

1. Import the repository into Vercel.
2. Set the **Root Directory** to `Checkpoint 3/app/web`.
3. Use the Vite framework preset, install command `pnpm install --frozen-lockfile`,
   build command `pnpm build`, and output directory `dist`.
4. Do not add environment variables for the current prototype.

The deployed prototype displays sample demo data only. It does not connect to
Gmail, Supabase, AI services, or a calendar.
