# Run and use InboxToTask locally (Windows)

This short guide is for team members who get the private Google and Gemini values from the project owner. If you're outside the team, or have no owner to ask, follow [INSTALL.md](../app/INSTALL.md) instead: it's the full reference, and there you create your own Google projects, encryption key and Gemini key. Google Cloud setup is in [GOOGLE_AUTH.md](../app/supabase/GOOGLE_AUTH.md#step-by-step-local-google-setup). This guide was written from the manifests, templates and UI source. It has **not** been run start to finish on a clean machine, so tell the project owner if a step fails.

Real Gmail connection and scanning work **only locally**. The hosted site cannot do either.

## 1. What you need first

| Need | Detail |
| --- | --- |
| Docker Desktop | Linux containers, running (the local database and Edge runtime use it) |
| Node.js | 22.6 or later. `engines` in `app/package.json` and `web/.mise.toml` say 22, but `npm.cmd run test:calendar` needs 22.6 |
| pnpm | 10.34.3, pinned in `web/package.json`. Use `corepack pnpm ...`; do not install pnpm separately. Corepack ships with Node before 25.0.0; see [INSTALL requirements](../app/INSTALL.md#requirements) for later versions |
| Repo access | A clone of the repository on `main`, which has the Gmail scan work (PR #22 is merged) |
| Google test user | The project owner must add your **dedicated test Gmail address** under Test users in **both** Google Cloud projects (sign-in and Gmail) |

**Private values you must get from the project owner through a private channel** (never chat, email or Git). Names only here:

Three of the four templates matter here. The fourth, `Checkpoint 3/app/.env.example`, is only for the pipeline CLI, so you can skip it.

| File (all ignored by Git) | Variables |
| --- | --- |
| `Checkpoint 3/app/supabase/.env` | `SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID`, `SUPABASE_AUTH_EXTERNAL_GOOGLE_SECRET` |
| `Checkpoint 3/app/supabase/functions/.env` | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_TOKEN_KEYS`, `GEMINI_API_KEY` |
| `Checkpoint 3/app/web/.env` | `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`. These are not secret and come from your own local stack in step 6 |

Also set in `supabase/functions/.env`: `GOOGLE_TOKEN_ACTIVE_KEY=v1`, `ENABLE_GOOGLE_CONNECTION=true` once `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` and `GOOGLE_TOKEN_KEYS` are filled (leave it on), and keep the template values for `GOOGLE_CALLBACK_URL`, `GOOGLE_RETURN_URL` (`http://127.0.0.1:5173/`) and `APP_ORIGINS`. Do not generate a new `GOOGLE_TOKEN_KEYS` if the owner gives you one. You can also create your own Google Cloud projects by following [INSTALL step 5](../app/INSTALL.md#5-set-up-google); then you need only your own secrets.

## 2. Setup

Use PowerShell and run each block from the named folder. Quote paths that contain spaces.

1. **Check ports first.** Nothing else should be using these (a result means something is already listening; stop and ask before continuing):

   ```powershell
   Get-NetTCPConnection -State Listen -LocalPort 54321,5173 -ErrorAction SilentlyContinue
   ```

2. **Install the backend tools** (from `Checkpoint 3/app`):

   ```powershell
   npm.cmd ci
   ```

3. **Install the frontend** (from `Checkpoint 3/app/web`):

   ```powershell
   corepack pnpm install --frozen-lockfile
   ```

4. **Create the three private files you need** by copying each template only if the private file does not already exist: `supabase/.env.example` to `supabase/.env`, `supabase/functions/.env.example` to `supabase/functions/.env`, and `web/.env.example` to `web/.env` (all under `Checkpoint 3/app`). Fill them from section 1. Leave `ENABLE_GMAIL_SCAN=false` for now.
5. **Start Supabase** (from `Checkpoint 3/app`; Docker must be running):

   ```powershell
   npm.cmd run supabase:prepare
   npx.cmd supabase --agent no start
   npx.cmd supabase --agent no migration up
   ```

   Never run a database reset to apply migrations: it erases local data.
6. **Copy the local URL and publishable key** into `web/.env`. Run `npx.cmd supabase --agent no status` and copy only the API URL and publishable key into `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`. Never put a service-role key there or paste status output into chat.
7. If you changed `supabase/.env` after starting, run `npx.cmd supabase --agent no stop` then `start` again. This keeps data.

## 3. Start and stop

Run in two terminals:

```powershell
# Terminal 1, from Checkpoint 3/app
npx.cmd supabase --agent no functions serve --env-file supabase/functions/.env

# Terminal 2, from Checkpoint 3/app/web
corepack pnpm dev --host 127.0.0.1
```

| Part | How to confirm it is up |
| --- | --- |
| Supabase | `npx.cmd supabase --agent no status` (from `Checkpoint 3/app`) lists services; port 54321 is listening |
| Functions | Terminal 1 stays running without errors; restart it after any change to `supabase/functions/.env` |
| Vite | Terminal 2 prints `http://127.0.0.1:5173/`; the sign-in page loads |

Always use `http://127.0.0.1:5173/`, not `localhost`: it is a different OAuth origin.

**Stop:** press Ctrl+C in each terminal, then `npx.cmd supabase --agent no stop` (from `Checkpoint 3/app`). Stopping keeps your data.

## 4. Use the app

Use only the dedicated test account.

1. **Sign in.** Click **Continue with Google**. Signed-in users land on the workspace with four sections: **Review**, **Accepted tasks**, **Information** and **Connection and permissions**.
2. **Connect Gmail.** Open **Connection and permissions**, click **Connect Google**, and approve with the same address. Connecting reads no mail. The status should read connected with your address.
3. **Save allowed senders and exclusions.** Under **Scanning permission and sources**, enter exact addresses under **Sender email addresses** and domains under **Sender domains** (one per line; domains do not include subdomains). Under **Subject exclusions**, list literal phrases to block, such as `Confidential`. An empty allowlist processes nothing. Keep it narrow: everything it permits can go to Gemini.
4. **Give consent and unpause.** Check *I consent to processing permitted Gmail content under the disclosure above.*, uncheck **Pause scanning**, then click **Save scanning settings**. The form collapses to a summary; **Edit settings** reopens it.
5. **Turn scanning on (deliberate).** In `supabase/functions/.env` set `ENABLE_GMAIL_SCAN=true`, with `GEMINI_API_KEY` set and `ENABLE_GOOGLE_CONNECTION=true` still on from section 1. Restart Terminal 1. Without all three, scans return "Manual Gmail scanning is disabled in the backend".
6. **Scan.** Under **Check Gmail**, click **Scan past seven days**. Counts appear under **Last batch**. Click **Scan more** when work remains. **Reload saved results** re-reads what is saved.
7. **Review and approve.** In **Review**, each suggestion shows an evidence quote and **Open conversation in Gmail**. Click **Approve task** (or **Dismiss**). Approval makes no model call and creates no Calendar event.
8. **Update proposals.** When a reply changes an accepted task, **Review** shows a before/after table (**Accepted at inference** vs **Proposed**). Click **Approve edit** (or **Approve cancellation**), or **Dismiss**. If the task changed meanwhile, use **Review against current revision** first. The update must be a reply in the same thread as an approved task.
9. **Accepted tasks and email history.** Under **Accepted tasks**, tasks from one thread group as "N tasks from this conversation". Each task has an **Email history** with **Show saved excerpt**.
10. **Export an ICS file.** On a task click **Export calendar file**, choose the start, then **Download ICS** and import it into your calendar yourself. The file holds only title and schedule. Nothing is written to Google Calendar.
11. **Information tab.** Informational emails appear as executive summaries with a Gmail link. **Mark as read** (and **Mark as unread**) is remembered only in that browser.
12. **Pause or disconnect.** To stop scanning, check **Pause scanning** and save, or withdraw consent. To remove access, click **Disconnect Gmail** (it tries to revoke the grant; you can also remove it at Google's account permissions page). **Sign out** ends only the app session.

## 5. Common problems

| Symptom | Cause and fix |
| --- | --- |
| Test mail never appears | Spam and Trash are not scanned. Check Gmail did not file it in Spam |
| Connect does nothing the second time | Connection attempts have a 30-second cooldown. Wait |
| Scan buttons disabled with a countdown | 60-second scan cooldown. Wait for it to end |
| Only some mail was processed | Each batch makes at most two model calls. Click **Scan more** |
| "Your daily processing allowance is used up" | Daily budget per UTC day (default 20 requests per account). Wait for the reset |
| Gmail access is no longer valid | Reconnect required. Click **Reconnect Google**. Test-mode grants expire after seven days |
| "Manual Gmail scanning is disabled" | `ENABLE_GMAIL_SCAN`, `ENABLE_GOOGLE_CONNECTION` and `GEMINI_API_KEY` must all be set, then restart `functions serve` |
| Scan refused | Consent saved, **Pause scanning** off, at least one sender or domain, Gmail connected with the same address |
| Sign-in goes straight in as the wrong person | Google sign-in silently reuses the current Google account. Sign out of Google in that browser first |
| `redirect_uri_mismatch` / Access blocked | Use `127.0.0.1`; the owner must add you as a test user. See GOOGLE_AUTH.md section 7 |

## 6. Safety

- Use **only a dedicated test Google account with fictional mail**. Permitted email bodies are sent to Gemini. Never connect a real mailbox.
- When you finish, set `ENABLE_GMAIL_SCAN=false` in `supabase/functions/.env` and restart `functions serve`.
- Never commit, paste or screenshot `.env` files, keys, callback URLs or `supabase status` output.

## 7. What does not work

- **Automatic scans:** not implemented. Scans are manual.
- **Google Calendar:** planned for CP4. ICS export is the current path.
- **Real data in the designed dashboard:** not connected. The workspace page above is the real-data surface.
- **Gmail connect and scan on the hosted site:** the Gmail functions are not deployed there.
- **Onboarding:** on the separate branch `claude/onboarding-connect-0e9360`, not merged; do not expect it in your build.
- **Waiting For view in the workspace:** not built. Those records are saved but not displayed.
- **Account deletion:** not built.
