# Manual Gmail scan: code review, fixes and live-acceptance runbook

Date: November 5, 2026. Local work only. No real Gmail or Gemini calls, no hosted
changes and no push. This continues the
[phase record](gmail-manual-scan-phases-2026-11-05.md); it is evidence for this run,
not proof of current runtime state.

## Defects found and fixed

Each fix has a regression test that failed before the change. Fixes to already-pushed
SQL are in a new migration,
[20261106000000_gmail_scan_hardening.sql](../app/supabase/migrations/20261106000000_gmail_scan_hardening.sql).

| Area | Defect | Fix |
| --- | --- | --- |
| Access rules | `address()` took the first `<...>` it found, so `"<prof@allowed.edu>" <evil@bad.test>` matched the allowlist and escaped sender exclusions. | Quoted names and comments are stripped first. Anything naming a second address is not permitted. |
| Scan liveness | One undecodable, image-only or quote-only message, one attempt-limited message, or one user-deleted message stopped every later scan at that ID. Metadata with no Subject did the same. | Per-message outcomes are recorded and the scan continues. Scan-wide conditions (rate limits, budgets, auth, stale permissions) still stop with coverage preserved. Scan more retries failures up to three times; a new seven-day scan tries them again. |
| Sender metadata | A missing or unparseable From stopped the scan. | Treated as not permitted, with no body fetched. Bad thread metadata is excluded from context with a warning. |
| Body limits | The per-message cap applied before quote cleanup, so long reply chains failed. | Caps apply to cleaned text. Unusable context becomes a warning, not a failed message. |
| Reuse | The cache key included the scan date and access rules, so a next-day repeat or an unrelated rule edit re-ran inference for everything. | Both removed. SQL rechecks current permission on every use, and a rule change that alters permitted context already changes the content hash. |
| Reuse | A message's own approved task counted as a new dependency whenever it had thread context. Completing a task also forced re-inference. | Candidates exclude tasks originating from this message or from later mail. Reuse compares accepted-value fingerprints for tasks currently offered. |
| Duplicates | Any re-extraction created duplicate suggestions, repeated dismissed proposals and left stale proposals open. | Earlier review decisions win: repeats are dropped, dismissed proposals stay dismissed, and open proposals become `superseded`. Information shows the newest summary per source. |
| Task matching | Word overlap was required, so "this moved to Friday" could not offer the task it changes. | All permitted same-thread tasks are candidates, ranked by overlap. Being a candidate is still not a match: the model must cite current-message evidence and validation checks the target. Cross-thread updates remain out of scope. |
| Cancellation | Cancelled tasks could still be completed, edited or previewed for Calendar. | Enforced by trigger; only deletion remains. |
| Deletion/retention | Source deletion kept `permission_metadata`, job guards and cached accepted values. Cleanup never expired proposals. Deleting a task did not suppress its approved update sources. | Purged by trigger, cache stores fingerprints only, cleanup expires proposal text and keeps approved provenance. |
| Configuration | Persistent mode with no model key took a lease and then failed. | Reports `GMAIL_SCAN_DISABLED` before any lease or mail read. |

## Validation

| Check | Scope | Result |
| --- | --- | --- |
| `npm.cmd test` | PGlite and injected model/Gmail | 155/155 |
| `supabase test db` | Actual local database, all migrations applied without reset | 71 pgTAP checks |
| `npm.cmd run test:local` | Actual Auth, PostgREST, Edge; disabled scan endpoint; injected model through the real storage transport | 13 groups, zero model calls |
| Deno check, `tsc --noEmit`, `pnpm build` | `gmail_scan`, frontend | Pass; existing main-chunk size warning |
| Browser, normal root route | Two temporary fictional accounts, seeded with an injected model | See below |

Browser coverage: saved review records, before/after comparison, disabled-scan message,
approve then reload, complete and undo, stale edit blocked until explicit rebase with
the user edit preserved, cancellation with no Complete action, batch counts, backlog,
and sign-out then second account with no first-account data. Accounts signed in through
the local `/storage` password form, not Google.

**Not established by any of this:** real Gmail responses, OAuth lifecycle, Gemini's
acceptance of `gmailSchema`, extraction or targeting accuracy, or hosted behavior.

## Known limitations

- An ambiguous (untargeted) proposal can only be dismissed; there is no target picker.
- The product workspace has no task-field editor; edits exist in the RPC and `/storage`.
- Each batch allows two model calls with a 60-second cooldown, so a full 100-message
  backlog needs about 50 Scan more requests. This is conservative and untuned.
- Scanning is newest-first and approval happens after scans, so an update usually
  becomes a targeted proposal on the scan after its original task is approved.
- Same-thread only. Different messages describing one task stay separate suggestions.
- Topic-free results are rejected unless every item is `relevant`. If live output
  breaks this rule it costs attempts, so watch it in the first live run.

## Phase 6 live-acceptance runbook

Prerequisites only the account owner can provide: a dedicated Gmail test account listed
as a test user, fictional test mail, and a private `GEMINI_API_KEY`.

1. In `supabase/functions/.env`, add the key and set `ENABLE_GMAIL_SCAN=true`.
   `GOOGLE_RETURN_URL` now points at the product root. `/storage` no longer receives
   the Google return unless that line is changed back.
2. From `Checkpoint 3/app`, run `npm.cmd run supabase:prepare`, then restart
   `npx.cmd supabase --agent no functions serve --env-file supabase/functions/.env`.
3. From `app/web`, run `corepack pnpm dev --host 127.0.0.1` and sign in at the root.
4. Connect Gmail and confirm zero scans on connection. Save an exact sender allowlist and
   consent. Keep it narrow: this account's allowlisted bodies go to Gemini.
5. Send fictional mail: an allowed task, a blocked sender, a blocked subject, a
   subdomain, a thread with an excluded middle message, and two tasks in one thread.
6. Scan, review and approve. Send a deadline change for one of the two tasks, scan,
   and confirm the proposal targets the correct task. Repeat and expect zero model calls.
7. Change settings during work, then finish the OAuth list in
   [the setup guide](../app/supabase/GOOGLE_AUTH.md): reload, refresh, denial, revocation,
   disconnect and reconnect. Record sanitized results.
8. Set `ENABLE_GMAIL_SCAN=false` again when finished.

Phase 7 stays blocked until this passes.
