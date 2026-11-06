# InboxToTask use cases and acceptance scenarios

Updated November 5, 2026. This document describes current local behavior and the remaining end-to-end acceptance work for [Checkpoint 3](../CP3_INSTRUCTIONS.md). Expected outcomes below are test criteria, not claims that every walkthrough has been executed.

## Test surfaces and evidence

- **Main product (`/`):** Google sign-in routes signed-in users to a plain persistent workspace with Gmail connection, saved scanning settings, manual scans and review. The designed onboarding and dashboard are not yet connected to real data; they appear only in preview mode, which uses fictional data and simulated actions.
- **Development tester (`/storage`):** localhost-only Vite development route for Google connection controls and persistent suggestions, tasks, digest, waiting-for records, and manual calendar export. It is excluded from production builds. Its password sign-in option is development tooling, not the intended product onboarding.
- **Canonical pipeline:** offline tests and the CLI use fictional messages. Live Gmail extraction is recorded in [UC8](#uc8-real-gmail-to-review-workflow). Hosted behavior is not established.

Use a dedicated Google account with fictional mail for provider tests. Never include credentials, callback codes, tokens, or personal mail in test reports. Local setup is described in [the backend guide](../app/supabase/README.md) and [Google setup](../app/supabase/GOOGLE_AUTH.md).

The latest [settings verification](scan-settings-verification-2026-11-05.md) records 107 offline tests, 67 local database assertions, frontend type/build checks, and authenticated local browser checks. Earlier [storage verification](local-storage-verification-2026-11-04.md), [Google verification](google-auth-verification-2026-11-05.md), and [extraction evaluation](extraction-review-verification-2026-11-04.md) have different scopes and dates. Do not add their counts or present provider simulations as live OAuth results.

## UC1: Sign in and authorize Gmail separately

**Status:** Implemented locally; initial live Google connection is user-reported. Full live lifecycle verification and product Gmail controls remain pending.

1. Open the main app and select Google sign-in. On the development tester, use **Sign in with Google**.
2. Complete sign-in with the test account. Confirm the app restores the same account after reload.
3. In the development tester's connection panel, select **Connect Google** and authorize Gmail using the same email address.
4. Reload the connection status and confirm the saved email and state.
5. Repeat cancellation, wrong-account, disconnect/reconnect, and expired-token tests as separate cases.

**Expected:** App identity and Gmail permission remain separate. Connection does not grant scanning consent, fetch messages, or call Gemini. Wrong-account or insufficient-scope responses cannot save a new successful connection. An existing connection must not be mistaken for proof that a failed new authorization succeeded.

**Evidence:** [Google connection tests](../tests/google-connection.test.mjs) inject provider responses; [Google database tests](../tests/google-database.test.mjs) cover protected state and credential lifecycle. Real reload, refresh, denial, wrong-account, and revocation checks still need sanitized live evidence. Token availability with an unexpired token does not prove refresh or continued provider authorization.

## UC2: Save source rules, consent, and context limits

**Status:** Implemented and locally tested in the signed-in workspace and the development tester. Saved rules control live Gmail retrieval; see [UC8](#uc8-real-gmail-to-review-workflow).

1. Open **Connection and permissions**, then **Scanning permission and sources**.
2. Enter exact sender/domain inclusions and exclusions, literal subject exclusions, and semantic topics. Topics never grant access.
3. Review the scope summary and context limits. Leave consent unchecked and scanning paused, then save.
4. Reload. Verify the rules persist without consent being granted implicitly.
5. Read the disclosure, explicitly change consent/pause if desired, save, and verify persistence again.
6. Open two tabs at the same saved revision. Save a change in one; saving the older revision in the other must fail with a stale-settings message. Reload before retrying.

**Expected:** New accounts have no consent, empty inclusions, paused scanning, and defaults of five earlier context messages within 90 days. Invalid entries fail validation. Saving rules alone never starts scanning. Settings changes increment a revision and invalidate older storage work while preserving accepted tasks. Legacy onboarding choices do not automatically become scanning permission.

**Evidence:** [Settings tests](../tests/scan-settings.test.mjs), [local pgTAP checks](../app/supabase/tests/scan_settings.test.sql), and [browser verification](scan-settings-verification-2026-11-05.md). Browser account switching, network-failure recovery, and full accessibility review remain to verify.

### Context defaults

New accounts default to five earlier same-thread messages within 90 days, and 12,000 characters per message or 24,000 in total. The backend permits 0–10 earlier messages, 1–365 days, 100–30,000 characters per message and 100–60,000 in total, with total at least per-message size. Existing users keep their saved values. Age is measured back from the email being analyzed, not from today.

## UC3: Resolve conflicting inclusion and exclusion rules

**Status:** Canonical filtering implemented and covered by offline tests. Live enforcement with one sender is recorded in [UC8](#uc8-real-gmail-to-review-workflow); subdomain and domain rules were not exercised live because that needs a second sending address.

Configure **included domain `illinois.edu`** and **excluded sender `email@illinois.edu`**, with no other inclusions:

| Message sender | Expected decision | Reason |
| --- | --- | --- |
| `email@illinois.edu` | Excluded | Sender exclusion overrides domain inclusion |
| `EMAIL@ILLINOIS.EDU` | Excluded | Sender/domain comparison ignores case |
| `professor@illinois.edu` | Permitted by metadata rules | Exact included domain, unless another exclusion matches |
| `email@cs.illinois.edu` | Not allowed | Subdomains are not implicitly included |
| `email@notillinois.edu` | Not allowed | Domain suffix/substring resemblance is not a match |

Additional acceptance cases:

- Allowed senders and domains combine with **OR**. Any matching sender, domain, or subject exclusion wins over every inclusion. Gmail labels are not used.
- No inclusions means no permitted processing, even when Gmail is connected.
- Sender rules match the parsed address, not the display name; a From header naming more than one address grants nothing. Subject exclusions use case-insensitive literal substrings, including phrases, without body search or regular expressions.
- Each context message must independently pass the same rules. A permitted current message does not permit excluded earlier messages.
- Filtering metadata does not classify sensitive topics or guarantee that inline quoted private content is removed.

See [canonical filtering](../app/pipeline/core.mjs) and [retrieval regression tests](../tests/gmail-retrieval.test.mjs).

## UC4: Extract a fictional message and review its evidence

**Status:** Pipeline and storage code implemented, with offline/synthetic integration evidence and separate live CLI evaluations. A complete live Edge-to-storage-to-product extraction remains unverified.

**Precondition:** A separately configured, explicitly enabled local fixture trial. Fixture extraction is disabled by default; ordinary connection/settings tests do not need it enabled.

1. Sign into the development tester and select a bundled case such as `E01`.
2. Select **Process sample email**. The browser sends only the case ID; the backend supplies fictional input and derives the owner from the verified session.
3. Inspect the saved suggestion, evidence, requirements, deadline, and uncertainty flags. Inspect Passive cases in the informational digest and external commitments in Waiting for.
4. Repeat the identical successful request while the source remains eligible.

**Expected:** Only validated, evidence-grounded output is persisted. Missing deadlines stay null; date-only values do not gain invented times. Context limitations and uncertainty are visible. An identical saved extraction is reused without inference; a changed effective input/configuration is not assumed to be a cache hit. Full bodies are transient, while bounded supporting excerpts are retained separately.

**Evidence:** [Pipeline tests](../tests/pipeline.test.mjs), [endpoint tests](../tests/supabase-endpoint.test.mjs), and [storage integration tests](../tests/storage-database.test.mjs). The fixture endpoint accepts only `E01` through `E20`; it is not a real Gmail endpoint.

## UC5: Correct, approve, dismiss, and complete a task

**Status:** Implemented in persistent storage and the development tester. Integration into the designed product dashboard remains pending.

1. Open a pending suggestion and compare it with the supporting excerpt.
2. Edit fields if needed, then approve. Alternatively dismiss and restore an eligible suggestion.
3. Reload and verify the decision persists. The original proposal remains separate from accepted/user-edited values.
4. Complete the accepted task, undo completion, and complete it again.

**Expected:** Review actions use stored fields and controlled RPCs without another model call. Stale revisions cannot overwrite newer edits. Completion starts the 30-day eligibility period; undo clears it, and recompletion starts a new period. Source deletion and task deletion have different effects, described in [the storage contract](../app/supabase/STORAGE.md).

Waiting-for entries support user-confirmed resolution and dashboard reminders. These reminders send no email or notification. Incoming task changes are proposed for review as described in [UC8](#uc8-real-gmail-to-review-workflow).

## UC6: Export a calendar file without authorizing Calendar writes

**Status:** ICS serializer and development preview implemented; actual file saving/import still requires verification. Connected Calendar authorization/execution is planned.

1. On an accepted task, open **Export calendar file**.
2. Review the title and choose an all-day or timed schedule. Supply a date if no task deadline exists; timed entries require a time zone and explicit duration.
3. Export and manually import the file into a test calendar, checking date/time behavior and duplicate-import behavior.

**Expected:** Task approval alone never writes a Google Calendar event. ICS export does not alter accepted task fields or call a model. Manual imports have no app-managed synchronization or remote undo. See [calendar export tests](../tests/calendar-export.test.mjs) and [export limitations](../app/supabase/STORAGE.md#manual-calendar-export).

## UC7: Pause, disconnect, sign out, and handle failures

**Status:** Individual local controls exist; live Google lifecycle and a unified account-deletion/disconnect-all flow remain incomplete.

| Action or failure | Expected behavior |
| --- | --- |
| Withdraw consent or save pause | Save permission state and fence older work; do not claim that Gmail access was revoked |
| Disconnect Gmail | Block backend connection use immediately; attempt provider revocation; retain a retryable disconnecting state on revocation failure |
| Sign out | Clear protected UI state and end the app session; keep Gmail connection and saved data separate |
| Processing busy/budget/provider limit | Show a fixed error or deferral; do not claim a saved extraction |
| Invalid/truncated model output | Reject the result; preserve failure accounting and do not create accepted tasks |
| Deleted source or stale lease | Prevent late results from recreating deleted content |

The **Disconnect Gmail** label is a local development UI wording change at this writing; earlier versions say **Disconnect Google**. It does not remove the separate Google sign-in grant or delete account data. A complete delete-account action is not implemented. See [Google setup and lifecycle](../app/supabase/GOOGLE_AUTH.md), [storage tests](../tests/storage.test.mjs), and [storage database checks](../tests/storage-database.test.mjs).

## UC8: Real Gmail-to-review workflow

**Status:** The manual scan runs end to end locally with real Gmail and real Gemini on fictional mail in a dedicated test account; results are below. Scanning is switched off again by default. Automatic scheduled scans and hosted operation are not implemented or verified. The workspace is a plain page, not yet the designed dashboard.

This is the primary CP3 workflow. Demonstrating fixtures, a simulated preview, or Google connection alone does not satisfy it.

### Walkthrough

1. Sign in with Google, then under **Connection and permissions** connect Gmail with the same address. Connecting reads no mail.
2. Save at least one exact sender or domain, give consent, and uncheck **Pause scanning**. Without all of these a scan is refused.
3. Under **Check Gmail**, click **Scan past seven days**. Sender and subject rules are checked on metadata before any body is fetched, and again for each earlier message in the thread.
4. Permitted email goes to Gemini with permitted thread history and existing same-thread tasks. Output is validated before it is saved.
5. Each batch makes at most two model calls. When work remains, wait for the 60-second cooldown and click **Scan more**.
6. Under **Review**, approve or dismiss suggestions. Approval makes no model call and no Calendar event.
7. A later reply can propose an edit or cancellation of an accepted task. It shows a before/after comparison, and the accepted value does not change until approved. If the task changed in the meantime, the proposal must be refreshed against the current revision first.
8. If an email seems to change a task but does not make clear which one or what the new values are, the app applies nothing and asks **Which task changed?** It shows the saved sender, subject, date and excerpt with a link to the full email in Gmail. The user chooses the task and enters the values, or dismisses the item. Full bodies are not stored, so the complete message stays in Gmail.

Budgets per account: 20 model requests and 200,000 tokens per UTC day, both project-set trial values. Failed attempts keep their conservative token reservation.

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
| L23 | Scan while paused | Refused | Refused with a 409; resumed after unpausing | Pass |
| L24 | Reload the page | Still signed in and connected | Still signed in and connected (tester-reported) | Pass |
| L25 | Sign out and back in with Google | Gmail stays connected without new approval; tasks kept | Connected, no new Gmail approval, tasks kept (tester-reported) | Pass |

A scan after unpausing was not repeated live. Not run live: settings changed during a scan, rate limits, and the rest of the OAuth lifecycle in [the setup guide](../app/supabase/GOOGLE_AUTH.md). Subdomain and domain rules need a second sender and are covered offline only for subdomains. One tester and 15 messages show the workflow runs; they do not measure extraction accuracy.

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

Automated coverage for this workflow: [retrieval](../tests/gmail-retrieval.test.mjs), [extraction](../tests/gmail-extraction.test.mjs), [persistence](../tests/gmail-persistence.test.mjs) and the [local API trial](../tests/storage-local.mjs). These use injected responses, so they complement the live cases above and do not replace them.

### Remaining acceptance

Verify incremental scheduled scans with the dashboard closed using the plan's selected **15-minute default interval**, after manual acceptance passes. This is a scheduled check, not an exact arrival-to-processing guarantee; a check with no eligible changes should make zero model calls. Remaining criteria are maintained in [the implementation plan](../IMPLEMENTATION_PLAN.md).

## UC9: Future optional Calendar connection and approved event lifecycle

**Status: Planned; connected authorization and Calendar API execution are not implemented.** Existing calendar approval records and ICS export do not establish this workflow. Destination model and least necessary scopes must be selected before implementation.

1. During onboarding, offer **Connect Google Calendar** and **Skip for now**. Skipping or denying access must leave app sign-in, permitted Gmail processing, and task review usable. Offer connection later from Settings or Add to Calendar.
2. If the user connects, verify actual granted capabilities and show real connection status. Do not infer Calendar authorization from Gmail access or app sign-in.
3. On an accepted task, select Add to Calendar and preview the destination, title, all-day/timed schedule, time zone, and explicit duration where required. Missing dates remain empty until the user supplies them; task approval is not event approval. Omit private excerpts and attendees by default.
4. Write an event only after explicit preview approval and server-side checks of the current task revision and Calendar authorization. Record the remote event identifier and stable operation identity.
5. Test transient failures, revoked access, and ambiguous timeout outcomes. Reconcile uncertain writes before retrying so retries cannot create duplicate events; show failure/reconnect state without claiming success.
6. Present later deadline/event changes as proposals. Preserve accepted task values until task-update approval, and require separate approval for an external event update.
7. Offer explicit undo for app-created events and show whether remote removal succeeded. Completing or deleting a task must not silently delete an event or a Gmail message.

**Acceptance:** No event write occurs before approval; skip/denial paths stay usable; stale revisions fail; retries do not duplicate events; approved updates and undo affect only the intended app-managed event. Tests require the future executor and a controlled test calendar. If Calendar shares the Gmail Google Cloud project, grant revocation can affect both services; independent revocation would require a separate project. That topology remains a design choice, not an implemented guarantee.
