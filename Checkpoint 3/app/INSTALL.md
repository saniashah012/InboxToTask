# Installation

To set up InboxToTask locally, run commands from the folder named in each step. On macOS or Linux, use `npm` and `npx` instead of `npm.cmd` and `npx.cmd`.

Hosted Gmail scanning is not deployed or verified, and automatic scanning does not exist. Use a dedicated Google account with fictional mail: permitted email bodies are sent to Gemini. Read [safety and privacy](../docs/safety_privacy.md) first. For a short teammate walkthrough, see [local setup and use](../docs/local-setup-and-use.md).

## Requirements

**To sign in, connect Gmail or scan, you need your own Google Cloud setup.** The team's Google projects, accounts and keys are not shared, so step 5 walks you through creating yours. Allow about 30–45 minutes the first time.

- Node.js 22 or later, with Corepack for the pinned pnpm
- Docker Desktop with Linux containers, running (backend only)
- A Google account you can use for testing, ideally a new one holding only fictional mail
- Two Google Cloud projects, both free to create: one for app sign-in and one for Gmail access (step 5)
- A Gemini API key, needed only for scanning (step 5.6)

Steps 1 and 2 need none of this.

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

Copy each template only if the private file does not already exist. All private files are ignored by Git. Never commit or share them.

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

- `supabase:prepare` copies prompts and the pipeline into the ignored Edge bundle. Rerun it after changing them.
- `start` applies migrations to a new database. `migration up` applies only pending ones to an existing database. Do not run a database reset to apply migrations, because it erases local data.
- Stay local: do not add `--remote` or link and push to a hosted project.

Copy the local URL and publishable key into `web/.env` as `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`. `npx.cmd supabase --agent no status` shows them, along with server keys: never put a service-role key in `web/.env`, or paste status output into a chat or report. The product page's sign-in, connection and scan controls need only those two values. `VITE_STORAGE_ENABLED`, `VITE_GOOGLE_AUTH_ENABLED` and `VITE_GOOGLE_CONNECTION_ENABLED` gate only the `/storage` development tester's controls; set them to `true` if you use it.

## 5. Set up Google Cloud

You create two Google Cloud projects: one for signing in to the app and one for Gmail access. They are separate because Google can revoke every grant in a project at once, so disconnecting Gmail should not also break sign-in. Both projects stay in Google's **Testing** mode, which needs no Google review but allows only the accounts you list as test users.

Use the same Google account throughout: the one you will sign in with must also be the Gmail account you connect, and it must be a test user in both projects. Use `127.0.0.1`, not `localhost`, in every address below.

Google's console layout changes from time to time. If a menu name differs, use the console's search bar for the same name.

### 5.1 Create the sign-in project

1. Open [Google Cloud Console](https://console.cloud.google.com/). In the project selector at the top, choose **New Project**, name it `InboxToTask Sign-In`, and create it. Make sure it is selected afterwards.
2. Open **Google Auth Platform** (search for it) and choose **Get started**.
   - **App information:** app name `InboxToTask Sign-In`, and your email as the support email.
   - **Audience:** **External**. Personal Gmail accounts need External; a school-managed account may be blocked by its administrator.
   - **Contact information:** your email. Accept the policy and create.
3. Under **Audience**, keep the publishing status as **Testing**, and under **Test users** add your test Google account.
4. Under **Data Access**, choose **Add or remove scopes** and select only `openid`, `.../auth/userinfo.email` and `.../auth/userinfo.profile`. Save. No Gmail scope belongs in this project.
5. Optional: copy the **project ID** (not the project number) into `GOOGLE_SIGNIN_PROJECT_ID` in `supabase/.env`. It's a note for you; the app doesn't read it.

### 5.2 Create the sign-in OAuth client

1. In **Google Auth Platform > Clients**, choose **Create client**, type **Web application**, name `InboxToTask Local Sign-In`.
2. Under **Authorized redirect URIs**, add exactly `http://127.0.0.1:54321/auth/v1/callback`. This address belongs to local Supabase Auth, not the frontend. Leave authorized JavaScript origins empty.
3. Create the client and copy its values into `supabase/.env`:

   | Variable | Value |
   | --- | --- |
   | `SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID` | The client ID |
   | `SUPABASE_AUTH_EXTERNAL_GOOGLE_SECRET` | The client secret (the name ends in `_SECRET`, not `_CLIENT_SECRET`) |

   Google shows the secret in full only once; download it or copy it before closing the dialog.

[config.toml](supabase/config.toml) already enables Google sign-in with these two variables and allows the local frontend addresses.

### 5.3 Create the Gmail project

1. Create a second project named `InboxToTask Gmail` and select it.
2. Under **APIs & Services > Library**, search for **Gmail API** and choose **Enable**.
3. Set up **Google Auth Platform** as in 5.1, with the app name `InboxToTask Gmail`, **External** audience, **Testing** status, and the **same test account** under **Test users**.
4. Under **Data Access**, add `openid`, `.../auth/userinfo.email` and `https://www.googleapis.com/auth/gmail.readonly`. Google lists the last one as restricted; that is expected and fine in Testing mode.
5. Optional: copy this project's ID into `GOOGLE_GMAIL_PROJECT_ID` in `supabase/functions/.env`.

### 5.4 Create the Gmail OAuth client

1. In this project's **Google Auth Platform > Clients**, create a **Web application** client named `InboxToTask Local Gmail`.
2. Under **Authorized redirect URIs**, add exactly `http://127.0.0.1:54321/functions/v1/google_callback`.
3. Copy its values into `supabase/functions/.env`:

   | Variable | Value |
   | --- | --- |
   | `GOOGLE_CLIENT_ID` | This Gmail client's ID, not the sign-in client's |
   | `GOOGLE_CLIENT_SECRET` | This Gmail client's secret |

### 5.5 Finish the backend Google settings

In `supabase/functions/.env`, set:

| Setting | Value |
| --- | --- |
| `GOOGLE_CALLBACK_URL` | Keep the template's `http://127.0.0.1:54321/functions/v1/google_callback` |
| `GOOGLE_RETURN_URL` | Keep the template's `http://127.0.0.1:5173/`, not `/storage` |
| `APP_ORIGINS` | Keep the template's `http://localhost:5173,http://127.0.0.1:5173`, or list your exact frontend origins. Other browser origins are refused with `ORIGIN_NOT_ALLOWED` |
| `GOOGLE_TOKEN_ACTIVE_KEY` | `v1` on a new setup |
| `GOOGLE_TOKEN_KEYS` | `{"v1":"<base64 key>"}`, using a key you generate as below |
| `ENABLE_GOOGLE_CONNECTION` | `true`, once all of the above are filled |

The token key encrypts saved Google credentials. Generate one privately, and never replace a key that already encrypted saved connections:

```powershell
node -p "require('node:crypto').randomBytes(32).toString('base64')"
```

Restart local Supabase so Auth loads the new sign-in settings. This keeps local data:

```powershell
# From Checkpoint 3/app
npx.cmd supabase --agent no stop
npx.cmd supabase --agent no start
```

### 5.6 Get a Gemini API key (for scanning)

Sign-in and connecting Gmail work without this; only step 7 needs it.

1. Open [Google AI Studio](https://aistudio.google.com/) with your Google account and choose **Get API key**, then **Create API key**. You can create it in either project above or in a new one.
2. Keep the key private. It goes only in `supabase/functions/.env` as `GEMINI_API_KEY` (step 7), and in `Checkpoint 3/app/.env` if you use the pipeline CLI (step 9). Never put it in `web/.env` or any `VITE_*` variable.
3. Check Google's current Gemini API terms for how your prompts may be used, especially on the free tier. With fictional mail this matters less, but don't scan a real inbox.

### 5.7 Expect these limits

- In Testing mode, Google lets only listed test users sign in or connect, and Gmail grants expire after seven days. Reconnect Gmail when that happens.
- To stop testing, remove the app's access on your Google account's **Third-party apps & services** page, or delete the two projects.

## 6. Run the app

Use two terminals:

```powershell
# Terminal 1, from Checkpoint 3/app
npx.cmd supabase --agent no functions serve --env-file supabase/functions/.env

# Terminal 2, from Checkpoint 3/app/web
corepack pnpm dev --host 127.0.0.1
```

Check first whether ports 54321 and 5173 are already serving. Open `http://127.0.0.1:5173/` and sign in with Google. Use `127.0.0.1` throughout, because `localhost` is a different OAuth origin.

Under **Connection and permissions**, connect Gmail with the same address. Connecting reads no mail, and scans stay refused while scanning is off. Signed-in users see the workspace page; the designed dashboard is not yet connected to real data.

## 7. Turn on manual scanning deliberately

Each model call uses Gemini quota. Do this only with the dedicated fictional mailbox.

1. In `supabase/functions/.env`, set:

   ```text
   ENABLE_GOOGLE_CONNECTION=true
   ENABLE_GMAIL_SCAN=true
   GEMINI_API_KEY=<your private key>
   ```

   To override the [default model](prompts/model-settings.json), add `GEMINI_MODEL=<model id>`. Keep the key in this file only, never in a `VITE_*` variable.
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
| `redirect_uri_mismatch` | Host, port and path must match the registered URI exactly. Sign-in uses `http://127.0.0.1:54321/auth/v1/callback`; Gmail uses `http://127.0.0.1:54321/functions/v1/google_callback`. `localhost` and `127.0.0.1` are different |
| Access blocked, or "app has not completed the Google verification process" | The account is listed under **Test users** in that project (both projects need it), and the publishing status is **Testing** |
| Gmail connection fails with a different account | Sign in and connect Gmail with the same Google account |
| Sign-in client ID or secret seems ignored | Values are in `supabase/.env` (not `functions/.env`), and local Supabase was stopped and started again |
| "Manual Gmail scanning is disabled" | All three settings in step 7, then restart `functions serve` |
| Scan refused | Consent saved, not paused, at least one sender or domain, Gmail connected with the same address |
| "A scan is running or cooling down" | Wait 60 seconds, or 30 seconds for a connection attempt |
| Missing test mail | Gmail may have filed it as spam; **Scan more** stays in the saved window |
| Google sign-in unavailable | `web/.env` values set and Vite restarted |

## Hosted deployment

Hosted deployment is separate from local setup. The hosted session reports 20 ledger versions through `20261106040000`, with Gmail functions not deployed, so connecting and scanning work only locally. Reported by Sania on preview `ffa915a`: settings save and reload, sign-out and back in, the stale-tab 409 (`PT409`), and two-account isolation in the tested workspace flows passed. Test values were restored, consent stayed off, and no inboxes were connected. Not covered: onboarding, chips, RLS penetration, review, manual resolution and source links. These checks predate the current `main`. After the PR #22 merge, Sania reports production sign-in passed and accounts A and B went straight to the workspace without saving. Workspace tabs, settings and stale-save behavior on the newest code remain unconfirmed. The Vercel production branch is `main`, per Sania, so treat a merge as a production deployment. Instant Rollback is available, but it does not undo migrations. Applying migrations or deploying functions needs a separate decision. Requirements are in [the backend guide](supabase/README.md) and the [Google setup rollout section](supabase/GOOGLE_AUTH.md#hosted-rollout-separate-from-local-implementation). Keep `ENABLE_GMAIL_SCAN` off on hosted.

For a frontend build, set the Vercel root directory to `Checkpoint 3/app/web`, use the Vite preset, and set install command `pnpm install --frozen-lockfile`, build command `pnpm build` and output `dist`. Only `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` belong in its environment. `/storage` is excluded from production builds.
