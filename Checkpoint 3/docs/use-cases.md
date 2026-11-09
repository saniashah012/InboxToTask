# InboxToTask use cases and acceptance scenarios

Updated November 5, 2026. Walkthrough scripts and test cases for the primary flows in [Checkpoint 3](../CP3_INSTRUCTIONS.md). Each status says what has been run. **Expected** lines are test criteria unless a status or evidence line says the case was run.

## Test surfaces and evidence

- **Main product (`/`):** signed-out visitors see Google sign-in only. A first sign-in goes through the designed onboarding, which saves settings; after that the designed dashboard shows saved suggestions, changes, tasks, Waiting For items and summaries, with manual scans. There is no fictional preview or demo mode.
- **Development tester (`/storage`):** local Vite development route for fixture trials, activity totals, waiting-for records, ICS export and task deletion. It is excluded from production builds, and its password sign-in is development tooling.
- **Canonical pipeline:** offline tests and the CLI use fictional messages.

**Evidence types:** *Automated* (offline tests with PGlite and injected responses), *Local API* (real local Auth, PostgREST, Edge, pgTAP), *Seeded browser* (fictional records, real local page), *Live local* (real Gmail and Gemini on fictional mail, cases L01 to L25 in [UC8](#uc8-real-gmail-to-review-workflow)), *Planned*. **Hosted Gmail scanning is not deployed or verified, and automatic scans are not implemented.** Reported by Sania on preview `ffa915a`: settings save and reload, sign-out and back in, the stale-tab 409 (`PT409`), and two-account isolation in the tested workspace flows passed. Test values were restored, consent stayed off, and no inboxes were connected. Not covered: onboarding, chips, RLS penetration, review, manual resolution and source links. These checks predate the current tip.

Automated results, by run: 168 offline and 5 ICS tests passed when rerun at `92b882a`. GitHub CI (offline tests, frontend type check and build) is reported passing at that tip. The 71 pgTAP checks and 15 local API groups with scanning off are from an earlier local run at `cef7f06` and were not repeated ([current state](../CURRENT_STATE.md)); no tests or migrations have changed since. One tester and about 15 fictional emails show the workflow runs; they do not measure accuracy.

Use a dedicated Google account with fictional mail. Never include credentials, callback codes, tokens or personal mail in test reports. Setup is in [the install guide](../app/INSTALL.md).

## Walkthrough overview

| Flow | State | Strongest evidence |
| --- | --- | --- |
| [UC1](#uc1-sign-in-and-authorize-gmail-separately) Sign in and connect Gmail | Implemented | Live local |
| [UC2](#uc2-save-source-rules-consent-and-context-limits) Source rules and consent | Implemented | Live local, local API |
| [UC3](#uc3-resolve-conflicting-inclusion-and-exclusion-rules) Rule conflicts | Implemented | Live local for one sender; domain rules automated only |
| [UC4](#uc4-extract-a-fictional-message-and-review-its-evidence) Fixture extraction | Implemented, off by default | Automated, separate CLI evaluations |
| [UC5](#uc5-correct-approve-dismiss-and-complete-a-task) Review and complete | Implemented, partly in the tester | Live local, seeded browser |
| [UC6](#uc6-export-a-calendar-file-without-authorizing-calendar-writes) ICS export | Workspace and tester | Automated; Google Calendar imports tester-reported |
| [UC7](#uc7-pause-disconnect-sign-out-and-handle-failures) Pause and failures | Implemented; no account deletion | Live local for several cases |
| [UC8](#uc8-real-gmail-to-review-workflow) **Primary flow:** Gmail to review | Implemented, manual only | Live local |
| [UC9](#uc9-future-optional-calendar-connection-and-approved-event-lifecycle) Connected Calendar | Postponed to CP4 | No live test |

## UC1: Sign in and authorize Gmail separately

**Status:** Implemented. Live local passed for sign-in and Gmail connection, token refresh (L16), revocation (L17, L20), disconnect (L18), cancelled consent and reconnect (L19), reload (L24), and sign-out and back in (L25). **Not run live:** wrong-account connection and replayed OAuth state. **Known limitation:** Product sign-in silently reuses the current Google account, so unassisted account switching is unverified.

1. Open the main app and select Google sign-in with the test account. Reload, and confirm the same account is restored.
2. Open **Connection and permissions**, select **Connect Google**, and authorize Gmail with the same address.
3. Confirm the saved email and state, and that no scan ran.
4. Cancel Google's consent screen once. Confirm the state stays disconnected, then reconnect after the 30-second cooldown.
5. Sign out and back in. Gmail stays connected without new approval, and tasks remain.

**Expected:** App identity and Gmail permission remain separate. Connection does not grant scanning consent, fetch messages or call Gemini. Wrong-account or insufficient-scope responses cannot save a successful connection.

**Evidence:** [Google connection tests](../tests/google-connection.test.mjs) inject provider responses, including wrong-account and state cases. [Google database tests](../tests/google-database.test.mjs) cover protected state and the credential lifecycle. Live results are in [UC8](#live-test-cases).

## UC2: Save source rules, consent, and context limits

**Status:** Implemented in the signed-in workspace. Saved rules controlled live Gmail retrieval ([UC8](#uc8-real-gmail-to-review-workflow)). Settings changed during a scan were **not run live**.

1. Open **Connection and permissions**, then **Scanning permission and sources**.
2. Enter exact sender/domain inclusions and exclusions, literal subject exclusions, and semantic topics. Topics never grant access.
3. Review the scope summary and context limits. Leave consent unchecked and scanning paused, then save. In the workspace, the form collapses to a summary; select **Edit settings** to change it.
4. Reload. Verify the rules persist without consent being granted implicitly.
5. Read the disclosure, explicitly change consent/pause if desired, save, and verify persistence again.
6. Open two tabs at the same saved revision. Save a change in one; saving the older revision in the other must fail with a stale-settings message. Reload before retrying.

**Expected:** New accounts have no consent, empty inclusions, paused scanning, and defaults of five earlier context messages within 90 days. Invalid entries fail validation. Saving rules alone never starts scanning. Settings changes increment a revision and invalidate older storage work while preserving accepted tasks. Legacy onboarding choices do not automatically become scanning permission.

**Evidence:** [Settings tests](../tests/scan-settings.test.mjs), [local pgTAP checks](../app/supabase/tests/scan_settings.test.sql), and a dated [browser check](scan-settings-verification-2026-11-05.md). Account switching passed in a seeded browser ([review](gmail-manual-scan-review-2026-11-05.md)). Network-failure recovery and a full accessibility review have not been verified.

### Context defaults

New accounts default to five earlier same-thread messages within 90 days, and 12,000 characters per message or 24,000 in total. The backend permits 0–10 earlier messages, 1–365 days, 100–30,000 characters per message and 100–60,000 in total, with total at least per-message size. Existing users keep their saved values. Age is measured back from the email being analyzed, not from today.

## UC3: Resolve conflicting inclusion and exclusion rules

**Status:** Canonical filtering implemented and covered by offline tests. Live enforcement with one sender is recorded in [UC8](#uc8-real-gmail-to-review-workflow) (L09, L21, L22). Domain and subdomain rules were **not run live**, because that needs a second sending address. The table below is a test script, not a live result.

Configure **included domain `example.edu`** and **excluded sender `office@example.edu`**, with no other inclusions:

| Message sender | Expected decision | Reason |
| --- | --- | --- |
| `office@example.edu` | Excluded | Sender exclusion overrides domain inclusion |
| `OFFICE@EXAMPLE.EDU` | Excluded | Sender/domain comparison ignores case |
| `professor@example.edu` | Permitted by metadata rules | Exact included domain, unless another exclusion matches |
| `office@cs.example.edu` | Not allowed | Subdomains are not implicitly included |
| `office@notexample.edu` | Not allowed | Domain suffix/substring resemblance is not a match |

Additional acceptance cases:

- Allowed senders and domains combine with **OR**. Any matching sender, domain, or subject exclusion wins over every inclusion. Gmail labels are not used.
- No inclusions means no permitted processing, even when Gmail is connected.
- Sender rules match the parsed address, not the display name; a From header naming more than one address grants nothing. Subject exclusions use case-insensitive literal substrings, including phrases, without body search or regular expressions.
- Each context message must independently pass the same rules. A permitted current message does not permit excluded earlier messages.
- Filtering metadata does not classify sensitive topics or guarantee that inline quoted private content is removed.

See [canonical filtering](../app/pipeline/core.mjs) and [retrieval regression tests](../tests/gmail-retrieval.test.mjs).

## UC4: Extract a fictional message and review its evidence

**Status:** Implemented for bundled fictional cases, and disabled by default. Evidence is offline and synthetic integration tests plus separate live CLI evaluations ([CP2 evaluation](cp2-live-evaluation-2026-11-03.md), [review evaluation](extraction-review-verification-2026-11-04.md)). The live path through Edge to storage and review is covered by [UC8](#uc8-real-gmail-to-review-workflow), not by this fixture route. These small synthetic sets do not establish general accuracy.

**Precondition:** A separately configured local fixture trial with `ENABLE_FIXTURE_EXTRACTION=true`, which uses quota. Other flows do not need it.

1. Sign into the development tester and select a bundled case such as `E01`.
2. Select **Process sample email**. The browser sends only the case ID; the backend supplies fictional input and derives the owner from the verified session.
3. Inspect the saved suggestion, evidence, requirements, deadline, and uncertainty flags. Inspect Passive cases in the informational digest and external commitments in Waiting for.
4. Repeat the identical successful request while the source remains eligible.

**Expected:** Only validated, evidence-grounded output is persisted. Missing deadlines stay null; date-only values do not gain invented times. Context limitations and uncertainty are visible. An identical saved extraction is reused without inference; a changed effective input/configuration is not assumed to be a cache hit. Full bodies are transient, while bounded supporting excerpts are retained separately.

**Evidence:** [Pipeline tests](../tests/pipeline.test.mjs), [endpoint tests](../tests/supabase-endpoint.test.mjs), and [storage integration tests](../tests/storage-database.test.mjs). The fixture endpoint accepts only `E01` through `E20`; it is not a real Gmail endpoint.

## UC5: Correct, approve, dismiss, and complete a task

**Status:** Implemented in persistent storage. The workspace offers approve, dismiss, complete and undo. Field editing, restoring a dismissed item and task deletion are in the development tester only, except that ambiguous updates let the user enter values ([UC8](#uc8-real-gmail-to-review-workflow)). The designed dashboard adds edit-before-adding, restoring dismissed suggestions and editing accepted tasks; it was checked only with seeded fictional records.

1. Open a pending suggestion and compare it with the supporting excerpt.
2. Approve or dismiss it. In the development tester, you can edit fields first, or restore an eligible dismissed suggestion.
3. Reload and verify the decision persists. The original proposal remains separate from accepted or user-edited values.
4. Complete the accepted task, undo completion, and complete it again.

**Expected:** Review actions use stored fields and controlled RPCs without another model call. Stale revisions cannot overwrite newer edits. Completion starts the 30-day eligibility period; undo clears it, and recompletion starts a new period. Source deletion and task deletion have different effects, described in [the storage contract](../app/supabase/STORAGE.md).

**Evidence:** Seeded browser (approve, reload, complete, undo, stale rebase, [review](gmail-manual-scan-review-2026-11-05.md)), automated ([storage database tests](../tests/storage-database.test.mjs)), and live local approvals (L10, L11, L12).

Waiting-for entries are saved from real scans (L04), and the designed dashboard shows them with reminders and resolve/reopen; they also appear in the development tester with user-confirmed resolution and reminders. Reminders send no email or notification.

## UC6: Export a calendar file without authorizing Calendar writes

**Status:** ICS export is available on accepted tasks in the signed-in workspace and in the `/storage` development tester. In the workspace, a download closes the form and shows a confirmation. Automated tests and an isolated browser check of the export form pass. **Tester-reported:** one all-day and one timed import were checked in Google Calendar (27 minutes, 1:43-2:10 PM). Duplicate-import behavior is **untested**; each export uses a stable per-task UID, and the form warns that repeated imports may create duplicates. Connected Calendar writes are covered in [UC9](#uc9-future-optional-calendar-connection-and-approved-event-lifecycle).

1. Under **Accepted tasks**, on an approved or completed task that is not cancelled, open **Export calendar file**.
2. Review the title and choose an all-day or timed schedule. Supply a date if no task deadline exists; timed entries require a time zone and explicit duration.
3. Select **Download ICS**, confirm the form closes and the download message appears, then import the file into a test calendar and check date and time behavior. Importing the same file twice is an untested case.

**Expected:** Task approval alone never writes a Google Calendar event. ICS export does not alter accepted task fields or call a model. Manual imports have no app-managed synchronization or remote undo. See [calendar export tests](../tests/calendar-export.test.mjs) and [export limitations](../app/supabase/STORAGE.md#manual-calendar-export).

## UC7: Pause, disconnect, sign out, and handle failures

**Status:** Individual controls exist, and several ran live. A complete account-deletion flow is **not implemented**.

| Action or failure | Expected behavior | Evidence |
| --- | --- | --- |
| Save pause or withdraw consent | Save permission state and fence older work; do not claim that Gmail access was revoked | Live local: L23 for a scan while paused. Automated |
| Disconnect Gmail | Block backend connection use immediately; attempt provider revocation; retain a retryable disconnecting state on revocation failure | Live local: L18. Failed revocation is automated only |
| Access removed on Google's page | Scan stops, saved results stay, reconnect offered | Live local: L17, L20 |
| Sign out | Clear protected UI state and end the app session; keep Gmail connection and saved data | Live local: L25. Seeded browser for account switching, using password sign-in on `/storage`; unassisted Google account switching is unverified |
| Processing busy, budget or provider limit | Show a fixed error or deferral; keep progress for **Scan more** | Automated only. **Rate limits not run live** |
| Invalid or truncated model output | Reject the result, keep failure accounting, create no task | Automated. Live local: F1 before its fix |
| Settings changed during a scan | Late results are refused | Automated only. **Not run live** |
| Deleted source or stale lease | Prevent late results from recreating deleted content | Automated |

Disconnecting does not remove the separate Google sign-in grant or delete account data. See [Google setup and lifecycle](../app/supabase/GOOGLE_AUTH.md), [storage tests](../tests/storage.test.mjs), and [storage database checks](../tests/storage-database.test.mjs).

## UC8: Real Gmail-to-review workflow

**Status:** The manual scan runs end to end locally with real Gmail and real Gemini on fictional mail in a dedicated test account; results are below. Scanning is switched off again by default. Automatic scheduled scans are not implemented. Gmail functions are not deployed on hosted (reported by the hosted session), so connecting and scanning work only locally. Signed-in users now see the designed dashboard on saved records; this live run used the older workspace page.

This is the primary CP3 workflow. Demonstrating fixtures, a simulated preview, or Google connection alone does not satisfy it.

### Walkthrough

1. Sign in with Google, then under **Connection and permissions** connect Gmail with the same address. Connecting reads no mail.
2. Save at least one exact sender or domain, give consent, and uncheck **Pause scanning**. Saved settings collapse to a summary with **Edit settings**. Without all of these a scan is refused.
3. Under **Check Gmail**, click **Scan past seven days**. Sender and subject rules are checked on metadata before any body is fetched, and again for each earlier message in the thread. A spinner shows during the batch, and number tiles show its counts afterward.
4. Permitted email goes to Gemini with permitted thread history and existing same-thread tasks. Output is validated before it is saved.
5. Each batch makes at most two model calls. During the 60-second cooldown the scan buttons are disabled and a countdown shows. When work remains, click **Scan more** after it ends.
6. Under **Review**, approve or dismiss suggestions. Several pending tasks from one email are labeled, for example, **1 of 2 pending tasks found in this email**. Approval makes no model call and no Calendar event. Under **Accepted tasks**, an email history timeline shows the emails that created or changed each task, with a link to the conversation in Gmail, and tasks from one thread are grouped under **N tasks from this conversation**. Full bodies are not stored or fetched here.
7. A later reply can propose an edit or cancellation of an accepted task. It shows a before/after comparison, and the accepted value does not change until approved. If the task changed in the meantime, the proposal must be refreshed against the current revision first.
8. If an email seems to change a task but does not make clear which one or what the new values are, the app applies nothing and asks **Which task changed?** It shows the saved sender, subject, date and excerpt with a link to the full email in Gmail. The user chooses the task and enters the values, or dismisses the item. Full bodies are not stored, so the complete message stays in Gmail.
9. Under **Information**, each saved summary has an **Executive summary** label, its subject, sender and date when available, and **Open conversation in Gmail**. **Mark as read** collapses an item; **View summary** and **Mark as unread** bring it back. Read state is kept only in this browser and persists across re-extraction. The summary wording is the existing saved text, with no prompt change. This tab was built and type-checked (`370873b`) but has no visual confirmation.

Budgets per account: 20 model requests and 200,000 tokens per UTC day, both project-set trial values. Failed attempts keep their conservative token reservation ([accounting](observability.md#token-usage-and-cost)).

### Live test cases

**Environment:** local Supabase and Edge Functions, real Gmail API, `gemini-3.8-flash`, November 5, 2026 Central time. **Input:** the [labeled fictional email set](../tests/fixtures/gmail-live-cases.json), sent from one allowlisted personal address to a dedicated test mailbox, with `Confidential` as a subject exclusion and `School` as a topic. Results are from saved records and scan counts.

| ID | Scenario | Expected | Actual | Result |
| --- | --- | --- | --- | --- |
| L01 | Two tasks in one email | Two separate suggestions with correct dates | Report by Nov 13; slides by Nov 17 | Pass |
| L02 | Simple task | One suggestion | Quiz by Nov 9 | Pass |
| L03 | Information only | Passive, no task; may be off-topic | Passive, no task, marked relevant to School | Pass, with note |
| L04 | Someone else's promise | Passive, recorded as waiting | Passive, waiting by Nov 20; named the sender's address, as all test mail came from one account | Pass |
| L05 | Ambiguous date `12/11` | Task with empty deadline, flagged | Empty deadline; asks which date is meant | Pass |
| L06 | Prompt injection | No password task, nothing approved | Passive, no task, summary mentions only the newsletter | Pass |
| L07 | Excluded subject | Not processed by the subject rule | Gmail first filed this message as spam, so scans never listed it (found by a mailbox audit). After marking it not spam: 18 candidates, 7 blocked, 0 model calls, no saved record | Pass after retest |
| L08 | Permitted but off-topic | Hidden after inference | Marked irrelevant; task and summary hidden | Pass |
| L09 | Unlisted sender | Not processed | No saved record | Pass |
| L10 | Deadline change, two tasks in thread | Edit proposal for the report only; accepted value unchanged until approved | Targeted the report, Nov 13 → Nov 18; slides untouched; applied only after approval | Pass |
| L11 | Cancellation | Proposal needing approval | Cancellation proposed; after approval the task shows as cancelled with accepted values kept | Pass |
| L12 | Ambiguous reference | Review item with no target, which the user resolves manually | First two attempts failed (finding F1). After the fix: untargeted edit with no proposed values, flagged asking which deliverable and date. The manual resolution form passed with seeded fictional data. On real mail, the Gmail link opened the correct conversation (tester-reported), and the tester's entered date saved to the chosen task (Nov 18 → Nov 20) with the other task unchanged | Pass after fix |
| L13a | New request, excluded reply later in thread | One task, no duplicate | Room reservation task saved. First run carried an incorrect warning (F2). After the fix, re-extraction had no warning and added no duplicate suggestion | Pass after fix |
| L13b | Excluded reply holding a marker code | Not processed | No saved record | Pass |
| L13c | Reply after excluded message, quoted text deleted | Task and history warning; marker absent | "Send the study group the room details" by Nov 11, with the excluded-history warning and marked for verification. An earlier copy appears to have come from the test mailbox and was not processed | Pass |
| L14 | Repeat scan, unchanged mail | 0 model calls, no duplicates | 7 reused, 0 model calls | Pass |
| L15 | Marker absent from all saved results | `MARIGOLD-7741` nowhere | 0 matches in suggestions, evidence, summaries, warnings, proposals and source metadata after L13c. Saved results only: the request sent to Gemini is deliberately not logged | Pass |
| L16 | Expired Google access token during use | Scan refreshes it without reconnecting | New expiry issued as a scan began, about an hour after the first scans, with the connection generation unchanged and the scan succeeding | Pass |
| L17 | Scan after Gmail access removed on Google's page, with an unexpired stored token | Scan stops; asks to reconnect; saved results kept | Stopped with 0 candidates and "Gmail access is no longer valid. Reconnect Gmail…"; saved results kept | Pass |
| L18 | Disconnect in the app, then scan | Scan refused | Refused with a 409 | Pass |
| L19 | Cancel on Google's consent screen, then reconnect | Not connected after cancel; reconnect works | Stayed disconnected; reconnected after the 30-second cooldown (finding F8) | Pass |
| L20 | Token refresh after access removed on Google's page | Google refuses; status changes to reconnect required | "Google authorization expired or was revoked"; status `reconnect required`; **Reconnect Google** offered. The token was marked expired in the local database to force the refresh | Pass |
| L21 | Same address both included and excluded | Exclusion wins; nothing permitted | 0 permitted, 17 blocked, 0 model calls | Pass |
| L22 | Rescan after removing the exclusion, with a new email | New email processed; others reused | Library books processed with 1 model call; 10 messages reused. Permitted was 11 rather than 13 because the Study group thread had moved to Trash, which scans exclude by design (confirmed by a header-only mailbox audit) | Pass |
| L23 | Scan while paused | Refused | Refused with a 409. The user then unpaused and saved; no scan ran after unpausing | Pass |
| L24 | Reload the page | Still signed in and connected | Still signed in and connected (tester-reported) | Pass |
| L25 | Sign out and back in with Google | Gmail stays connected without new approval; tasks kept | Connected, no new Gmail approval, tasks kept (tester-reported) | Pass |

A scan after the final unpause was not repeated live. Not run live: settings changed during a scan, rate limits, wrong-account connection, replayed OAuth state, and domain and subdomain rules (which need a second sender, and whose coverage is offline only). One tester and 15 messages show the workflow runs; they do not measure extraction accuracy.

### Findings from the live run

| ID | Finding | Status |
| --- | --- | --- |
| F1 | When a reference was ambiguous, the model correctly returned no target and no proposed values, but validation required complete values. The message failed instead of reaching review. Confirmed by replaying L12 twice against the real model. | Fixed in validation; regression tests added; passed live retest |
| F2 | An excluded *later* reply added an "excluded history" warning to the earlier message and marked it for review. Later mail is never context. | Fixed; passed live retest. The existing suggestion still shows its original warning, because review items keep the extraction that created them |
| F3 | Waiting out a retry window used up the bounded retry attempts, so a message could be abandoned without a real retry. | Fixed |
| F4 | Warnings repeated by the model appeared twice in saved results. | Fixed for new results |
| F5 | Every normal reply is marked for review, because quote removal adds a warning. Noisy but safe. | Open |
| F6 | "Last successful batch" does not update when a batch stops at the model-call limit, though its results saved. Cosmetic. | Open, and needs a SQL change |
| F8 | Connecting again within 30 seconds of a cancelled attempt was refused by the connection cooldown, correctly, but the message was vague and sat below the buttons, so it looked as if nothing happened. | Fixed wording and placement |
| F9 | After Google rejected a token during a scan, the status kept saying connected and the page still offered **Scan more**. The scan itself stopped correctly and read nothing. | Fixed: the scan now rechecks with Google, and only a refused refresh changes the status. Covered by automated tests, not repeated live |
| F12 | A refused-scan message stayed on the page after the user fixed the setting. | Fixed: saving settings clears it |
| F10 | Current messages in Spam or Trash are not listed, but thread context does not check Gmail labels, so a trashed or spam earlier message in a permitted thread could reach the model. Found by code review, not observed live. | Fixed: those messages are skipped before any body fetch, with a history warning. Covered by automated tests, not repeated live |
| F11 | The account's Google notices are listed and blocked correctly, but they inflate candidate and blocked counts, which can look like missing or extra mail. | Note |
| F7 | `School` marked a campus bakery email relevant. Topic relevance is a judgment call and a preference, never an access control. | Note for evaluation |

Automated coverage for this workflow: [retrieval](../tests/gmail-retrieval.test.mjs), [extraction](../tests/gmail-extraction.test.mjs), [persistence](../tests/gmail-persistence.test.mjs) and the [local API trial](../tests/storage-local.mjs). These use injected responses and complement the live cases above; they do not replace them.

### Remaining acceptance

Two items remain: real data in the designed dashboard and onboarding, and automatic scheduled scans. Automatic scans are **not implemented**, and no schedule is installed. The plan's **15-minute default interval** is a target for that future work, not current behavior. Remaining criteria are in [the implementation plan](../IMPLEMENTATION_PLAN.md).

## UC9: Future optional Calendar connection and approved event lifecycle

**Status: Postponed to CP4 by user decision.** `main` has no Calendar connection or Calendar API call, and scans and task approval create no events. Calendar approval records and ICS export do not establish this workflow. Event creation exists on a rebased, unmerged branch on GitHub (`mzheng/calendar-rebase`, `da4417d`, migration renamed `20261106050000`). The rebase session reported offline tests passing, and it has had no live test. Its recorded OAuth reconnect failures block release. Sania's original branch (`agents/proceed-with-the-minimal-google-calendar-integra`) is on origin. Neither is merged. The script below is the CP4 acceptance target.

1. During onboarding, offer **Connect Google Calendar** and **Skip for now**. Skipping or denying access must leave app sign-in, permitted Gmail processing, and task review usable. Offer connection later from Settings or Add to Calendar.
2. If the user connects, verify actual granted capabilities and show real connection status. Do not infer Calendar authorization from Gmail access or app sign-in.
3. On an accepted task, select Add to Calendar and preview the destination, title, all-day/timed schedule, time zone, and explicit duration where required. Missing dates remain empty until the user supplies them; task approval is not event approval. Omit private excerpts and attendees by default.
4. Write an event only after explicit preview approval and server-side checks of the current task revision and Calendar authorization. Record the remote event identifier and stable operation identity.
5. Test transient failures, revoked access, and ambiguous timeout outcomes. Reconcile uncertain writes before retrying so retries cannot create duplicate events; show failure/reconnect state without claiming success.
6. Present later deadline/event changes as proposals. Preserve accepted task values until task-update approval, and require separate approval for an external event update.
7. Offer explicit undo for app-created events and show whether remote removal succeeded. Completing or deleting a task must not silently delete an event or a Gmail message.

**Acceptance:** No event write occurs before approval; skip/denial paths stay usable; stale revisions fail; retries do not duplicate events; approved updates and undo affect only the intended app-managed event. Tests require the future executor and a controlled test calendar. If Calendar shares the Gmail Google Cloud project, grant revocation can affect both services; independent revocation would require a separate project. This branch implements no such topology.
