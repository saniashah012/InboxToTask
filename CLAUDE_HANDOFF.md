# InboxToTask Gmail scanning handoff

Updated November 5, 2026 (Central), after live local manual-scan testing and the merge of PR #22. Recheck Git,
PR and runtime state before acting; this describes that moment, not today. Read
[AGENTS.md](AGENTS.md), then [current state](<Checkpoint 3/CURRENT_STATE.md>), then this.

**Repository:** `C:/Users/mzhen/Desktop/School/IS492/IS-492-Project`

## Boundaries
Do not push, merge, deploy, apply anything to hosted, reset a database, or enable scanning
without the user's explicit go-ahead for that step. Phase 7 (automatic scans) has not started.
Never print environment values, tokens or real email. Scripts that read private files must
suppress raw errors: a parser error once printed a secret (see Security below).

## Where things stand

| Item | State |
| --- | --- |
| `main` | Has this work: PR #22 merged at `59461b6`, about 11:01 PM Central November 5. CI passed on it and production returned a new build |
| [PR #22](https://github.com/saniashah012/InboxToTask/pull/22) `mzheng/gmail-scan-hardening` | **Merged** by the user's decision. Instant Rollback target should be `e2b0009`; a rollback does not undo migrations |
| `feadf66` | Live-test fixes, manual resolution of ambiguous updates, test log |
| `cef7f06` | Source-email links from another session, kept as a separate commit by user request |
| PR #20 (Sania, chips) | Separate; recheck its state. Both it and PR #22 change `STORAGE.md` |
| Calendar events | **Postponed to CP4 by user decision.** Sania's original is on origin at `b6f84e6`. Rebased `mzheng/calendar-rebase` is on GitHub at `da4417d`, not merged, with its migration renamed `20261106050000`; offline tests reported passing, no live test, and its recorded OAuth reconnect failures block release |

**Ownership right now:** the "Gmail features in Figma prototype" session coordinates hosted changes and owns
`CURRENT_STATE.md` and the hosted records. The "CP3 progress check" session owns `docs/demo-script.md` and tonight's
order of commits. Several sessions share this checkout, so follow their rules: no stash, reset, restore, clean,
checkout, rebase or merge; stage named files only; no installs in `Checkpoint 3/app`; leave others' processes running.

## Hosted rollout
**November 9 update (checked directly, about 6:30 PM Central):** hosted Gmail is live.
`google_connection`, `google_callback` and `gmail_scan` were deployed at 00:20 UTC November 10, and
`ENABLE_GOOGLE_CONNECTION` and `ENABLE_GMAIL_SCAN` are true (read from secret digests). All five
November 9 migrations, including `20261109220000`, are applied (25 versions). Matthew approved the deployment in chat; a Claude Code session ran it, applying `20261109220000`, setting the function secrets and deploying the three functions (corrected November 9: an earlier version of this note said it was unrecorded).
A teammate's personal Google account was signed in and connected there; the user deleted
those accounts from hosted Auth. See [current state](<Checkpoint 3/CURRENT_STATE.md>) for details.
The rest of this section describes November 5–6 and is superseded where it conflicts.

Per the session coordinating hosted (reported, not checked here), hosted has all nine migrations below,
through `20261106040000`, applied by 03:50 UTC on November 6. At that time the Gmail functions were not
deployed there, so connecting Gmail and scanning worked only locally. Sania reports hosted preview checks passed on `ffa915a` for settings
save/reload, sign-out/in, stale-tab rejection and two-account isolation in the tested flows; they do not cover
onboarding, chips, RLS penetration, review, manual resolution or source links. After the PR #22 merge, Sania reports production sign-in passed and accounts A and B went straight to the workspace without saving. Workspace tabs, settings and stale-save behavior on the newest code remain unconfirmed. Recheck before relying on this. Merging does not apply migrations, and Vercel production deploys
from `main` per Sania. The earlier instruction to keep `ENABLE_GMAIL_SCAN` off on hosted was not
followed by the November 9 deployment; whether it stays on is the user's decision.

1. `20261105200000_source_semantic_contract.sql`
2. `20261105210000_manual_gmail_retrieval.sql`
3. `20261105212000_manual_gmail_pause_gate.sql`
4. `20261105220000_gmail_persistence.sql`
5. `20261105223000_gmail_scan_status.sql`
6. `20261106000000_gmail_scan_hardening.sql` (fixes defects in 4 and 5, do not stop before it)
7. `20261106010000_gmail_manual_resolution.sql`
8. `20261106030000_gmail_task_source_links.sql`
9. `20261106040000_gmail_token_recheck.sql`

Calendar's migration is not on hosted or on `main`. It redefines `google_connection_service`, so
review that against the Gmail flow when Calendar resumes in CP4.

## Local runtime
- All nine migrations above are applied locally without reset. Calendar's is not.
- `ENABLE_GMAIL_SCAN` was turned on the night of November 5 for the local demo; no scan has been confirmed since. Turn it off after the demo. A Gemini key remains in private `app/supabase/functions/.env`.
  `GOOGLE_RETURN_URL` points at the product root.
- Vite and `functions serve` were started from the previous session as background tasks. They
  may be gone; check ports 5173 and 54321 before starting duplicates.
- `npm.cmd run test:local` expects the flag off. With it on, its disabled-endpoint step fails.
- Local users: `inboxtotask@gmail.com` (dedicated test mailbox, fictional mail) and two others.
  One other account has a **real mailbox**: never save consent or scan on it.

## Security
- The local `GOOGLE_TOKEN_KEYS` value was printed into a session transcript by a script error,
  then rotated to `v2`. Stored local Gmail connections were cleared, so accounts show
  `reconnect_required` and must reconnect.
- The hosted key's status is not recorded here, because this repository is public.
- Clearing credentials could not revoke the test account's Google grant. The user can remove it
  on Google's permissions page.

## Product decisions
- Exact sender/domain inclusions combine with OR. Sender/domain and literal subject exclusions
  win. Domains exclude subdomains. Empty allowlist permits nothing. Topics never grant access.
- Empty topic inclusions mean no topic restriction (explicitly accepted by the user).
- **Ambiguous updates (explicit user decision):** apply nothing. Show the source and let the user
  choose the task and enter the values, or dismiss. Full bodies are not stored, so the source view
  is the saved sender, subject, date, excerpt and a Gmail link (explicitly chosen as naive for now).
- Targeted edits and cancellations stay reviewable proposals, with stale targets needing an explicit
  rebase. That was recommended, not separately confirmed.
- Five earlier messages within 90 days by default. Existing saved context is unchanged. Consent is
  separate from connecting. Task approval never authorizes Calendar writes.

## Evidence
Live results are the table in [UC8](<Checkpoint 3/docs/use-cases.md>), cases L01–L25, with the
[labeled email set](<Checkpoint 3/tests/fixtures/gmail-live-cases.json>). Latest automated results:
168 offline at `92b882a`; 71 pgTAP and 15 local API groups unmodified with scanning off, run at `cef7f06`.
Check GitHub for CI at the current branch tip.

**Not run live:** settings changed during a scan, Gmail or Gemini rate limits, wrong-account
connection, replayed OAuth state, domain and subdomain rules (needs a second sender). The Spam/Trash
context fix and the status recheck have automated coverage only. No scan ran after the final unpause.
One tester and about 15 emails do not measure extraction accuracy.

## Open findings
None blocked PR #22. Only the first two need SQL.
- "Last successful batch" does not update when a batch stops at the model-call limit.
- New-task option for an ambiguous update whose task is not listed (suggested, not requested).
- Every normal reply is marked for review, because quote removal adds a warning.
- A Gmail 403 from quota would show as "reconnect". Found by reading code, not observed.
- Clearer task labels in the resolver (due date and source email).
- The prompt says edits carry complete values while validation allows empty ones when untargeted.
  The prompt is in the cache key, so editing it invalidates saved results.
- Two calls per batch and 20 requests per day are too low for real use.

## Next work, in order
1. Collect Sania's pending results for workspace tabs, settings and stale saves on the newest code. Vercel production is `main` per Sania, so every merge deploys.
2. In CP4, resume Calendar from `mzheng/calendar-rebase`: review the shared OAuth changes, then after
   reconnecting, retest revocation (L17), refused refresh (L20) and a normal scan.
3. Onboarding work is on `claude/onboarding-connect-0e9360` at `91234dd`, not merged. Onboarding preview `91234dd` is ready, with its remaining checks still pending. Until confirmed merged, treat onboarding as not connected.
4. **Phase 5:** connect real data to the designed dashboard. `App.tsx` line 565 sends every signed-in
   user to the plain `ManualWorkspace`, so the designed onboarding and PR #20's chips cannot be reached.
   Their save path already uses `scan_settings_save`. Coordinate with PR #20 and Calendar, which both
   touch these files. Do not start until the user says so.
5. Finish the presentation: `docs/InboxToTask-CP3-presentation-draft.pptx` follows `docs/demo-script.md`. Remove
   DRAFT, assign speakers and rehearse. INSTALL has not been run on a clean machine.

## Deadline and demo
Repo reported due Nov 5 at 11:30 PM Central, demo Friday morning. `main` has this work. The test account's local daily limit was raised from 20 to 50 for the demo (16 used at last check for UTC day
2026-11-06, which resets at 6 PM Central Friday and is shared by rehearsal and demo). Demo setup needs `ENABLE_GMAIL_SCAN=true`, a functions
restart and a connected test account (reconnect if the status says so); turn the flag off afterward. A scan after unpausing has not
been run. The tester's personal address can appear on screen as the allowed sender.

## Testing notes
- Offline fixtures must use thread context and different days. Fixtures with neither hid real bugs here.
- Scan more stays in the saved time window, so new mail needs **Scan past seven days**.
- Gmail can file test mail as spam, and Google's account notices count as blocked candidates.
- Connection attempts have a 30-second cooldown, scans 60 seconds.
- The processor hides raw validation errors by design. To diagnose one, replay that fictional message
  against the model in a throwaway script without touching the database.
