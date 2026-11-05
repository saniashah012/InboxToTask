# InboxToTask use cases and acceptance scenarios

Updated November 5, 2026. This document describes current local behavior and the remaining end-to-end acceptance work for [Checkpoint 3](../CP3_INSTRUCTIONS.md). Expected outcomes below are test criteria, not claims that every walkthrough has been executed.

## Test surfaces and evidence

- **Main product (`/`):** Google sign-in, basic onboarding preference persistence, and saved scanning settings are implemented. Gmail status/actions and persistent task review still need integration. Preview mode uses fictional data and simulated actions.
- **Development tester (`/storage`):** localhost-only Vite development route for Google connection controls and persistent suggestions, tasks, digest, waiting-for records, and manual calendar export. It is excluded from production builds. Its password sign-in option is development tooling, not the intended product onboarding.
- **Canonical pipeline:** offline tests and the CLI use fictional messages. Separate live Gemini evaluations exist; they do not establish live Gmail extraction or the full Google-to-database-to-product workflow.

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

**Status:** Implemented and locally tested in product Settings and the development tester; saved rules are not yet wired to Gmail retrieval.

1. Open **Settings > Sources & exclusions** in the product, or **Scanning permission and sources** in the development tester.
2. Enter sender/domain inclusions and exclusions, optional exact Gmail label IDs, and subject exclusions. Subject inclusion controls are not available yet.
3. Review the scope summary and context limits. Leave consent unchecked and scanning paused, then save.
4. Reload. Verify the rules persist without consent being granted implicitly.
5. Read the disclosure, explicitly change consent/pause if desired, save, and verify persistence again.
6. Open two tabs at the same saved revision. Save a change in one; saving the older revision in the other must fail with a stale-settings message. Reload before retrying.

**Expected:** New accounts have no consent, empty inclusions, paused scanning, and zero earlier context messages. Invalid entries fail validation. Saving rules alone never starts scanning. Settings changes increment a revision and invalidate older storage work while preserving accepted tasks. Legacy onboarding choices do not automatically become scanning permission.

**Evidence:** [Settings tests](../tests/scan-settings.test.mjs), [local pgTAP checks](../app/supabase/tests/scan_settings.test.sql), and [browser verification](scan-settings-verification-2026-11-05.md). Browser account switching, network-failure recovery, and full accessibility review remain to verify.

### Context defaults: current configuration versus proposal

| Configuration | Earlier-message default | Meaning |
| --- | --- | --- |
| Saved scanning settings | **0** | Conservative starting value for future Gmail scans; users can save a different bounded limit. These settings are not yet wired to retrieval |
| Canonical extraction settings | **5**, within 30 days | Current fixture/CLI pipeline ceiling, subject to per-input overrides and size limits; it does not require attaching five messages |
| Proposed real-scan default in the plan | Up to **5**, within 30 days | Still requires confirmation; do not describe it as the selected saved-settings default |

The backend permits 0–10 earlier messages, 1–90 days, 100–30,000 characters per message, and 100–60,000 total characters, with total at least per-message size. Saved settings currently start at 30 days and 12,000/24,000 characters. A valid saved value is not evidence that a live Gmail scan enforced it.

## UC3: Resolve conflicting inclusion and exclusion rules

**Status:** Canonical filtering implemented and covered by offline tests. The examples below specify acceptance expectations; real Gmail enforcement is pending.

Configure **included domain `illinois.edu`** and **excluded sender `email@illinois.edu`**, with no other inclusions:

| Message sender | Expected decision | Reason |
| --- | --- | --- |
| `email@illinois.edu` | Excluded | Sender exclusion overrides domain inclusion |
| `EMAIL@ILLINOIS.EDU` | Excluded | Sender/domain comparison ignores case |
| `professor@illinois.edu` | Permitted by metadata rules | Exact included domain, unless another exclusion matches |
| `email@cs.illinois.edu` | Not allowed | Subdomains are not implicitly included |
| `email@notillinois.edu` | Not allowed | Domain suffix/substring resemblance is not a match |

Additional acceptance cases:

- Allowed labels, senders, and domains combine with **OR**. Any matching label, sender, domain, or subject exclusion wins over every inclusion.
- No inclusions means no permitted processing, even when Gmail is connected.
- Sender rules match the parsed address, not the display name. Labels use exact matching. Subject exclusions use case-insensitive literal substrings, including phrases, without body search or regular expressions.
- Each context message must independently pass the same rules. A permitted current message does not permit excluded earlier messages.
- Filtering metadata does not classify sensitive topics or guarantee that inline quoted private content is removed.

See [canonical filtering](../app/pipeline/core.mjs) and [pipeline regression tests](../tests/pipeline.test.mjs). Whether future subject inclusions independently permit mail through OR or narrow other matches through AND is still an open decision in [the plan](../IMPLEMENTATION_PLAN.md#custom-sender-domain-and-subject-filters-implementation-plan).

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

Waiting-for entries support user-confirmed resolution and dashboard reminders. These reminders send no email or notification. Automatic semantic matching of incoming task changes remains unfinished; existing update proposals require an explicit target and revision.

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

## UC8: Future real Gmail-to-review workflow

**Status: Planned; not currently executable end to end.**

1. Connect Gmail, explicitly consent, configure a nonempty inclusion list, and unpause.
2. Start a bounded manual scan: planned initial scope is the past seven days, up to 100 permitted messages, with separate approval for more backlog.
3. Filter metadata before fetching each current/context body; recheck saved permissions before inference and persistence.
4. Present progressive counts and saved reviewable results. Empty/unchanged scans should make zero model calls.
5. After manual acceptance, verify incremental scheduled scans with the dashboard closed using the plan's selected **15-minute default interval**. This is a scheduled check, not an exact arrival-to-processing guarantee; a check with no eligible changes should make zero model calls.
6. Verify manual-refresh coordination, retries, budgets, and permission changes during queued/in-flight work. The proposed **60-second manual-refresh cooldown still requires confirmation**; it is not implemented or a selected production setting. An existing running scan should be shown rather than launching an overlapping one.

This is the intended primary CP3 workflow. Demonstrating fixtures, a simulated preview, or Google connection alone does not satisfy it. Remaining implementation and acceptance criteria are maintained in [the implementation plan](../IMPLEMENTATION_PLAN.md).

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
