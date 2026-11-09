# Installation

This is the full setup guide. It is for anyone setting up InboxToTask on their own, including instructors and people outside the team: you create your own Google projects, encryption key and Gemini key. Team members who get those values from the project owner can use the shorter [local setup and use](../docs/local-setup-and-use.md) guide, and this page stays the reference for both.

Run commands from the folder named in each step.

Hosted Gmail scanning is not deployed or verified, and automatic scanning does not exist. Use a dedicated Google account with fictional mail: permitted email bodies are sent to Gemini. Read [safety and privacy](../docs/safety_privacy.md) first.

## Windows, macOS and Linux

This guide was written and checked on Windows, in PowerShell. The macOS and Linux notes below have not been tested.

- **Commands:** on macOS or Linux, use `npm` and `npx` instead of `npm.cmd` and `npx.cmd`. `node` and `corepack` are the same everywhere.
- **Containers:** the local backend needs a running Docker-compatible runtime. On Windows, use Docker Desktop with Linux containers. For macOS and Linux, see [Supabase's prerequisites](https://supabase.com/docs/guides/local-development/cli/getting-started).

## Requirements

- Node.js 22.6 or later. `package.json` says 22, but `npm.cmd run test:calendar` uses a type-stripping flag that Node added in 22.6.
- Corepack, for the pinned pnpm. It ships with Node before 25.0.0. On Node 25 or later, install it first with `npm install -g corepack`. The first `corepack pnpm` command downloads pnpm and may ask you to confirm.
- A Docker-compatible runtime, running (backend only). See [above](#windows-macos-and-linux).
- For real sign-in and scanning only:
  - Two Google Cloud projects, which you can create with your own Google account.
  - A dedicated Google account to use as a throwaway test mailbox, plus a second account you control to send it fictional mail.
  - A Gemini API key, from [Google AI Studio](https://aistudio.google.com/apikey).

## 1. Install and run offline checks

No secrets, Docker, Gmail or model calls are needed.

```powershell
# From Checkpoint 3/app
npm.cmd ci
npm.cmd test
npm.cmd run test:calendar

# From Checkpoint 3/app/web
corepack pnpm install --frozen-lockfile
corepack pnpm exec tsc --noEmit
corepack pnpm build
```

## 2. Preview without a backend (optional)

```powershell
# From Checkpoint 3/app/web
corepack pnpm dev --host 127.0.0.1
```

Open `http://127.0.0.1:5173/` and choose **Preview onboarding** or **Explore demo**. This preview uses fictional data and simulated actions: it reads no mail and calls no model.

## 3. Create private configuration files

There are four templates. The first three run the app, and the fourth is only for the pipeline CLI in step 9. Copy each template you need only if the private file does not already exist. All private files are ignored by Git. Never commit or share them.

| Template | Private copy | Used by |
| --- | --- | --- |
| [supabase/.env.example](supabase/.env.example) | `supabase/.env` | Google sign-in for local Auth |
| [supabase/functions/.env.example](supabase/functions/.env.example) | `supabase/functions/.env` | Edge functions: Gmail connection and scanning |
| [web/.env.example](web/.env.example) | `web/.env` | Public browser values only |
| [.env.example](.env.example) | `.env` | Pipeline CLI only (step 9). Edge functions do not read it |

## 4. Start local Supabase

```powershell
# From Checkpoint 3/app
npm.cmd run supabase:prepare
npx.cmd supabase --agent no start
npx.cmd supabase --agent no migration up
```

- The first `start` downloads several container images and can take a while. Docker must be running.
- Google values are still blank at this point, so Google sign-in won't work until step 5. From reading the source of the pinned CLI (3.0.0), `start` should still succeed, but this hasn't been run. If it reports `Missing required field in config: auth.external.google.client_id`, do [Google setup, steps 2 and 3](supabase/GOOGLE_AUTH.md#step-by-step-local-google-setup) first, then run `start` again.
- `supabase:prepare` copies prompts and the pipeline into the ignored Edge bundle. Rerun it after changing them.
- `start` applies migrations to a new database. `migration up` applies only pending ones to an existing database. Do not run a database reset to apply migrations, because it erases local data.
- Stay local: do not add `--remote` or link and push to a hosted project.

Copy the local URL and publishable key into `web/.env` as `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`. `npx.cmd supabase --agent no status` shows them, along with server keys: never put a service-role key in `web/.env`, or paste status output into a chat or report. The product page's sign-in, connection and scan controls need only those two values. `VITE_STORAGE_ENABLED`, `VITE_GOOGLE_AUTH_ENABLED` and `VITE_GOOGLE_CONNECTION_ENABLED` gate only the `/storage` development tester's controls; set them to `true` if you use it.

## 5. Set up Google

Follow [Google setup, steps 2 to 5](supabase/GOOGLE_AUTH.md#step-by-step-local-google-setup): one project and client for sign-in, a second for Gmail, and the test account listed in both.

Then set these values in `supabase/functions/.env`. They replace the defaults that guide leaves for a team handoff:

| Setting | Value |
| --- | --- |
| `GOOGLE_RETURN_URL` | Keep the template's `http://127.0.0.1:5173/`, not `/storage` |
| `APP_ORIGINS` | Keep the template's `http://localhost:5173,http://127.0.0.1:5173`, or list your exact frontend origins. Other browser origins are refused with `ORIGIN_NOT_ALLOWED` |
| `ENABLE_GOOGLE_CONNECTION` | `true`, once `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` and the key below are filled. Leave it on |
| `GOOGLE_TOKEN_ACTIVE_KEY` | `v1` on a new setup |
| `GOOGLE_TOKEN_KEYS` | `{"v1":"<base64 key>"}` |

Generate the key privately, and do not replace an existing one that encrypted saved connections:

```powershell
node -p "require('node:crypto').randomBytes(32).toString('base64')"
```

You have just changed `supabase/.env`, so load it now: run `npx.cmd supabase --agent no stop`, then `npx.cmd supabase --agent no start`. That keeps local data. Do the same after any later change to sign-in settings.

Google test-mode Gmail grants expire after seven days, so reconnect when that happens.

## 6. Run the app

First check what is already using the ports:

```powershell
# Windows PowerShell
Get-NetTCPConnection -State Listen -LocalPort 54321,5173 -ErrorAction SilentlyContinue
```

```bash
# macOS or Linux
lsof -nP -iTCP:54321 -iTCP:5173 -sTCP:LISTEN
```

Port 54321 should be listening, because that is Supabase from step 4. Port 5173 should be free. If 5173 is busy, stop whatever is using it, or use that server if it is this app's Vite from an earlier run. If 54321 was already busy before step 4, stop the other program or Supabase project first. Don't move to other ports: Google redirects and `APP_ORIGINS` expect these, and Vite silently picks the next free port when 5173 is taken.

Then use two terminals:

```powershell
# Terminal 1, from Checkpoint 3/app
npx.cmd supabase --agent no functions serve --env-file supabase/functions/.env

# Terminal 2, from Checkpoint 3/app/web
corepack pnpm dev --host 127.0.0.1
```

Open `http://127.0.0.1:5173/` and sign in with Google. Use `127.0.0.1` throughout, because `localhost` is a different OAuth origin.

Under **Connection and permissions**, connect Gmail with the same address. Connecting reads no mail, and scans stay refused while scanning is off. Signed-in users see the workspace page; the designed dashboard is not yet connected to real data.

## 7. Turn on manual scanning deliberately

Each model call uses Gemini quota. Do this only with the dedicated fictional mailbox.

A new test mailbox has nothing to scan. Send it a few fictional emails from a second account you control, and allow only that sender in item 3 below. Never use real mail. The [labeled fictional set](../tests/fixtures/gmail-live-cases.json) has sample text.

1. In `supabase/functions/.env`, set:

   ```text
   ENABLE_GOOGLE_CONNECTION=true
   ENABLE_GMAIL_SCAN=true
   GEMINI_API_KEY=<your private key>
   ```

   `ENABLE_GOOGLE_CONNECTION` should already be on from step 5. Get the key from [Google AI Studio](https://aistudio.google.com/apikey). To override the [default model](prompts/model-settings.json), add `GEMINI_MODEL=<model id>`. Keep the key in this file only, never in a `VITE_*` variable.
2. Stop and restart the `functions serve` command. Settings load at startup.
3. In the app, under **Connection and permissions** (select **Edit settings** if you see a summary), save at least one exact sender or domain, give consent, and uncheck **Pause scanning**. Keep the list narrow: everything it permits can go to Gemini.
4. Under **Check Gmail**, click **Scan past seven days**. The scan buttons stay disabled with a countdown during the 60-second cooldown. Use **Scan more** when work remains.

Without all three settings, the endpoint returns `GMAIL_SCAN_DISABLED`. Without consent, sources or a connection, scans are refused. See the [walkthrough](../docs/use-cases.md#uc8-real-gmail-to-review-workflow).

## 8. Turn it off

1. In `supabase/functions/.env`, set `ENABLE_GMAIL_SCAN=false`. Clear `GEMINI_API_KEY` if you no longer need it.
2. Restart `functions serve`.
3. Click **Scan past seven days**. The page should say manual scanning is disabled. Saved results and settings remain.

For a single account, you can instead check **Pause scanning**, withdraw consent, or disconnect Gmail. Disconnecting attempts to revoke the grant. You can also remove access on Google's account permissions page.

`npm.cmd run test:local` expects scanning off and fails its disabled-endpoint step when it is on.

## 9. Pipeline CLI without Supabase (optional)

```powershell
# From Checkpoint 3/app. No key, no API call:
npm.cmd run extract:plan

# Sends one fictional email to Gemini; uses quota. Needs GEMINI_API_KEY in Checkpoint 3/app/.env:
node pipeline/cli.mjs --case E01 --live
```

The equivalent script is `npm.cmd run extract:live -- --case E01`. See the [pipeline guide](pipeline/README.md).

## Run the checks

From `Checkpoint 3/app`. None of these calls Gmail or a model.

| Command | Needs | Covers |
| --- | --- | --- |
| `npm.cmd test` | Nothing | Pipeline, retrieval, extraction, persistence, Google and settings with PGlite and injected responses |
| `npm.cmd run test:storage` | Nothing | Storage subset |
| `npm.cmd run test:google` | Nothing | Google connection subset |
| `npm.cmd run test:calendar` | Node 22.6+ | ICS export |
| `npx.cmd supabase --agent no test db` | Local stack | pgTAP on the real local database, rolled back |
| `npm.cmd run test:local` | Local stack, functions served with scanning and fixture extraction off | Real Auth, PostgREST and Edge gates, with temporary users |
| `npm.cmd run test:google:local` | Local stack, Google functions served disabled | Google endpoints, with temporary users |

Passing these does not show that live Gmail or extraction works. See [live results](../docs/use-cases.md#live-test-cases).

## Troubleshooting

| Symptom | Check |
| --- | --- |
| `redirect_uri_mismatch` | Host, port and path must match the registered URI exactly |
| Access blocked | Test account listed under the project's test users |
| "Manual Gmail scanning is disabled" | All three settings in step 7, then restart `functions serve` |
| Scan refused | Consent saved, not paused, at least one sender or domain, Gmail connected with the same address |
| "A scan is running or cooling down" | Wait 60 seconds, or 30 seconds for a connection attempt |
| Missing test mail | Gmail may have filed it as spam; **Scan more** stays in the saved window |
| Google sign-in unavailable | `web/.env` values set and Vite restarted |

## Hosted deployment

Hosted deployment is separate from local setup. The hosted session reports 20 ledger versions through `20261106040000`, with Gmail functions not deployed, so connecting and scanning work only locally. Reported by Sania on preview `ffa915a`: settings save and reload, sign-out and back in, the stale-tab 409 (`PT409`), and two-account isolation in the tested workspace flows passed. Test values were restored, consent stayed off, and no inboxes were connected. Not covered: onboarding, chips, RLS penetration, review, manual resolution and source links. These checks predate the current `main`. After the PR #22 merge, Sania reports production sign-in passed and accounts A and B went straight to the workspace without saving. Workspace tabs, settings and stale-save behavior on the newest code remain unconfirmed. The Vercel production branch is `main`, per Sania, so treat a merge as a production deployment. Instant Rollback is available, but it does not undo migrations. Applying migrations or deploying functions needs a separate decision. Requirements are in [the backend guide](supabase/README.md) and the [Google setup rollout section](supabase/GOOGLE_AUTH.md#hosted-rollout-separate-from-local-implementation). Keep `ENABLE_GMAIL_SCAN` off on hosted.

For a frontend build, set the Vercel root directory to `Checkpoint 3/app/web`, use the Vite preset, and set install command `pnpm install --frozen-lockfile`, build command `pnpm build` and output `dist`. Only `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` belong in its environment. `/storage` is excluded from production builds.
