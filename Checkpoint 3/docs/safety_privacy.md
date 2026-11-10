# InboxToTask safety and privacy

Updated November 5, 2026. This covers local behavior on `main`. **Hosted Gmail enforcement is not verified:** the hosted session reports that Gmail functions are not deployed there, so connecting and scanning work only locally. Reported by Sania on preview `ffa915a`: settings save and reload, sign-out and back in, the stale-tab 409 (`PT409`), and two-account isolation in the tested workspace flows passed. Test values were restored, consent stayed off, and no inboxes were connected. Not covered: onboarding, chips, RLS penetration, review, manual resolution and source links. These checks predate the current `main`. After the PR #22 merge, Sania reports production sign-in passed and accounts A and B went straight to the workspace without saving. Workspace tabs, settings and stale-save behavior on the newest code remain unconfirmed. All live results used a dedicated test mailbox with fictional mail, one tester and about 15 messages. This shows the safeguards ran in those cases; it does not measure how reliable they are.

**Evidence labels:** *Automated* (offline tests, PGlite, injected responses), *Local API* (real local Auth, PostgREST, Edge, pgTAP), *Seeded browser*, *Live local* (case IDs refer to [UC8](use-cases.md#live-test-cases)), *Code* (read from source only), *Planned*.

## Risks

| Risk | Example |
| --- | --- |
| Private mail reaches the model or storage | An excluded sender appears in a permitted thread |
| Sender spoofing or rule bypass | A display name that looks like an allowed address |
| Prompt injection | An email tells the assistant to create a password task |
| Inaccurate extraction | A wrong date or wrong owner becomes a task |
| Cross-user disclosure | One user reads another's tasks |
| Credential theft | Google tokens exposed to the browser or logs |
| Runaway cost | Retries or repeated scans use up the model budget |
| Stale or deleted data returning | A late result recreates something the user deleted |

## Implemented guardrails

| Guardrail | How it works | How it is tested |
| --- | --- | --- |
| **Source permission before body fetch** | Only `From` and `Subject` are read first. Exact sender or domain inclusions combine with OR; sender, domain and literal subject exclusions win. Without a matching inclusion, no body is requested. | Automated ([retrieval](../tests/gmail-retrieval.test.mjs)). Live local: L07, L09, L13b, L21 |
| **Each thread message checked separately** | An earlier message must pass the same rules before its body is fetched. Later replies are never context. | Automated. Live local: L13a, L13c |
| **From-header parsing** | Quoted names and comments are removed first. A header naming more than one address, or no valid address, permits nothing. | Automated, including `"<allowed>" <other>`. Not exercised live |
| **Exact domains** | A domain rule matches only that domain, not subdomains or lookalike suffixes. | Automated only. **Not run live**, which needs a second sender |
| **Spam and Trash exclusion** | The list call excludes them. Thread and continuation reads check labels and skip those messages before any body fetch. | List exclusion: live local (L07, L22). Context fix (F10): automated only |
| **Transient bodies** | Bodies stay in memory during processing. Only structured results, metadata and short excerpts are saved. | Code and schema: no body column. Automated |
| **Consent gates** | A scan needs consent, the current disclosure version, not paused, at least one inclusion, a connected account with the Gmail scope, and a matching mailbox address. | Automated and pgTAP ([settings](../app/supabase/tests/scan_settings.test.sql)). Live local: L18, L23 |
| **Prompt-injection design** | The prompt marks all email text as untrusted data. The model has no tools and returns only schema-checked JSON. Backend code owns budgets, rules and actions. | Automated ([fixture](../tests/fixtures/prompt-injection.json)). Live local: L06 |
| **Output validation** | Quotes must appear in permitted text; task owner must be the user; change targets must be offered tasks at the expected revision; truncated or blocked output is rejected. | Automated ([pipeline](../tests/pipeline.test.mjs), [extraction](../tests/gmail-extraction.test.mjs)) |
| **Human review** | Suggestions and changes do nothing until approved. Stale proposals must be refreshed first. Ambiguous updates apply nothing, and the user chooses the task and enters the values. | Automated, seeded browser. Live local: L10, L11, L12 |
| **Owner isolation** | RLS, scoped grants and service-only functions; the owner comes from the verified session. | pgTAP, [storage database tests](../tests/storage-database.test.mjs), local API, seeded browser (account switching) |
| **Google credentials** | Single-use hashed OAuth state, PKCE, same-account checks, AES-256-GCM encryption, and backend-only tokens. | Automated ([connection](../tests/google-connection.test.mjs)). Live local: L16, L19. **Wrong-account connection and replayed state were not run live** |
| **Revocation** | A rejected Gmail request stops the scan. The stored token is then expired and refreshed, and only Google refusing that refresh changes the status to reconnect required. | Live local: L17 (scan stops), L20 (refused refresh), L18 (in-app disconnect). The automatic status recheck (F9) is automated only |
| **Budgets and cooldowns** | See below. | Automated. Reuse is live local (L14). **Rate limits were not run live** |
| **Deletion purges** | Triggers clear a deleted source's retained metadata, job guards and cached results, remove it from other sources' metadata, and suppress it so scans cannot fetch it again. | Automated ([persistence](../tests/gmail-persistence.test.mjs)) |
| **Safe errors and logs** | Fixed codes only; no content logging. See [observability](observability.md#no-content-in-logs). | Automated; source search |

### PII handling and content filtering

- **No PII is removed or masked.** Permitted bodies are sent to Gemini with their text intact, apart from quote cleanup, along with sender, subject and the user's address. The protection is sending less mail, not redacting it.
- **No sensitive-content classifier exists.** "Content filtering" here means source rules, subject exclusions, skipped-topic words and topics of interest.
- **Skipped topics are word lists checked before Gemini.** Each skipped topic (for example Health) is a list of literal words and phrases. Backend code checks the subject before fetching the body, then the body, and the same for earlier thread messages and existing-task context. An email containing one of the words is never sent to Gemini and nothing is stored about it beyond a scan count. Email about the topic that uses none of the words can still be sent; excluding the sender or domain is the complete protection. The word lists themselves are never sent to Gemini.
- **Topics of interest are preferences, never access controls.** Gemini judges relevance after it has received the text. A campus bakery email was marked relevant to `School` (F7).
- **Provider terms are not verified.** The Gemini service tier's data use and retention have not been reviewed, so this document makes no retention promise. Do not use a real mailbox.

### Prompt injection: live case L06

A fictional newsletter contained an instruction aimed at the AI. The result was Passive, with no task, nothing approved, and a summary mentioning only the newsletter. That is one case. The stronger protection is structural: even a fooled model can only propose an item, must quote the email, and cannot send mail, change settings or approve anything. A fooled model could still produce a misleading suggestion, which is why review is required.

## Budgets, rate limits and cooldowns

These are project-set trial values, not tuned or validated capacity. A handoff finding notes that two calls per batch and 20 requests per day are too low for real use.

| Control | Value | Enforced in |
| --- | --- | --- |
| Model requests per user per UTC day | 20 by default. The test account's local limit is 50 for the demo (reported) | Database claim |
| Tokens per user per UTC day | 200,000 reported or reserved | Database claim |
| Model calls per batch | 2 | Processor |
| Shared requests per model per minute | 3 | Database claim |
| Scan request cooldown | 60 seconds | `gmail_scan_service` |
| Scan lease, one per user | 4 minutes | `gmail_scan_service` |
| Live extraction job, one per user | 90-second lease | Database claim |
| Attempts per extraction | 3, with a 60-second retry delay | Database claim |
| Batch limits | 90 seconds, 300 Gmail requests, 500 metadata records, 200 candidates, 100 permitted messages | Retriever |
| Context defaults | 5 earlier messages, 90 days, 12,000 characters per message, 24,000 in total | Saved settings, with backend bounds |
| Model input | 60,000 characters | Pipeline and processor |
| Connection start cooldown | 30 seconds | Database (L19) |
| Failed token refresh | 60-second cooldown | Database |

Each call reserves tokens computed from the message, prompt and schema bytes plus `maxOutputTokens`; observed reservations ranged from 24,384 to 26,058. A failed attempt keeps its reservation, so repeated failures stop further calls quickly instead of spending more. In local usage records on fictional mail, 14 successful live calls had a median of about 2,500 tokens ([details](observability.md#token-usage-and-cost)). Reused results and review actions make no model call.

The whole feature is off unless `ENABLE_GMAIL_SCAN=true`, `GEMINI_API_KEY` and `ENABLE_GOOGLE_CONNECTION=true` are all set, and the Edge functions are restarted to change them. There is no database kill switch.

## Failure fallbacks

| Failure | What happens | Evidence |
| --- | --- | --- |
| Feature off or no model key | `GMAIL_SCAN_DISABLED` before any lease or mail read | Automated, local API |
| Paused, disconnected or no consent | Refused with a 409; nothing read | Live local: L18, L23 |
| Gmail access removed | Scan stops, saved results stay, user is asked to reconnect | Live local: L17, L20 |
| Access token expired | Refreshed without reconnecting | Live local: L16 |
| Gmail or Gemini rate limit | Batch stops, progress kept, **Scan more** continues | Automated only |
| Budget exhausted | Work deferred with a visible message until the UTC reset | Automated only |
| Invalid, ungrounded or truncated output | Not saved; counted as failed; retried up to three times | Automated; live local through F1 before its fix |
| One unreadable message | Recorded; later mail continues | Automated |
| Earlier message unusable | Current message continues with a visible warning | Automated |
| Settings changed during a scan | Lease fails; the late result is not saved | Automated only. **Not run live** |
| Missing or ambiguous date | Deadline left empty and flagged | Live local: L05 |
| Ambiguous task reference | Nothing applied; user resolves it | Live local: L12 |

## Retention and deletion

- Evidence, summaries, unapproved suggestions and waiting items default to 30 days, and completed tasks to 30 days after completion. Attempt diagnostics have a 14-day rule.
- **These are eligibility rules.** [Cleanup](../app/supabase/functions/storage_cleanup/index.ts) is off and unscheduled, so expired rows stay in the database until it is run. Scheduled cleanup has not been tested.
- Task deletion has a button only in the `/storage` tester. Source deletion exists as a review RPC with automated tests, and neither page offers a button for it.
- Minimal identifiers and suppressions stay until account deletion. A complete account-deletion flow is **not implemented**.
- Sign-out keeps the Gmail connection (L25). Deleting anything here does not affect Gmail.
- **Information tab read state** stays in that browser's `localStorage`, keyed by user ID, as source IDs with no email content. It does not sync to the database or other browsers ([code](../app/web/src/InformationTab.tsx)).
- **An ICS file** holds only the task title and schedule, plus the event identifier and timestamp the format requires ([code](../app/web/src/calendarExport.ts)). Once imported it has no sync or undo: later task changes do not reach the calendar, and removing the event is up to the user.

## Honest limits

- **Quoted content can carry excluded text.** Excluding a message does not remove its text from a permitted reply that quotes it. Cleanup uses simple line patterns and is not a privacy control. L13c passed with the quoted text deleted from the reply.
- **The Gmail link opens the whole conversation,** including excluded messages and later replies. The URL format is not a documented Google contract, and a deleted or moved email gives a Gmail error. The correct-conversation result was tester-reported.
- **Marker absence covers saved results only.** The request sent to Gemini is not logged, so L15 cannot show what was transmitted. Rules and automated tests support that claim, not a transmission record.
- **Saved data is still sensitive.** Sender, subject, excerpts and summaries are stored in plain text in the database.
- **Two open defects, reported in the [second rollout record](hosted-rollout-2-manifest-2026-11-06.md#open-defects-not-blocking-this-rollout):** deleting an earlier email can leave its quote visible through a later source's evidence, and `valid_task_fields` accepts a null deadline boundary. Both were reproduced offline there. Migration `20261109220000_source_delete_quotes_and_boundary` fixes both, with PGlite tests, and is to be applied before hosted scanning.
- **Sign-in account reuse.** Product sign-in silently reuses the current Google account, so unassisted account switching is unverified.
- **Validation is not accuracy.** A quote can be real while the interpretation is wrong. One tester and about 15 fictional emails do not measure accuracy.
- **A Gmail 403 from quota would show as "reconnect."** Found by reading code and not observed. The status changes only if Google refuses a refresh, but the message would still be misleading.
- **Normal replies are marked for review** because quote removal adds a warning (F5). It is noisy but safe.
- **A request already sent cannot be recalled.** Pausing stops new work only.
- **One past exposure:** a local token-encryption key was printed in a development session, then rotated, and local connections were cleared. Whether hosted used the same value is an open check.
- **Not run live:** settings changed during a scan, rate limits, wrong-account connection, replayed OAuth state, and domain and subdomain rules.

## Proposed class-project implementation

**None of this is implemented.** Details are in [the plan](../IMPLEMENTATION_PLAN.md#class-project-api-abuse-controls-proposed-implementation).

- Private approved-tester records. Google's test-user list is not an application control.
- Global daily request and token limits reserved in the same transaction as user limits.
- An operator switch that stops new inference without code or configuration changes.
- Remaining allowance and deferral reasons visible to the owner.

Token limits would still not be a guaranteed dollar cap, so provider quotas and spending controls should be configured as well. Scheduled scans must use the same boundary and do not exist yet.

## How to check

From `Checkpoint 3/app`, see [run the checks](../app/INSTALL.md#run-the-checks). The 168 offline and 5 ICS tests passed when rerun at `92b882a`. GitHub CI is reported passing at that tip and passed on merge commit `59461b6`. The 71 pgTAP checks and 15 local API groups with scanning off are from an earlier local run at `cef7f06` and were not repeated ([current state](../CURRENT_STATE.md)). None of these make Gmail or model calls.
