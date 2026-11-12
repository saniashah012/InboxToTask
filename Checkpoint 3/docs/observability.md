# InboxToTask observability and debugging

Updated November 5, 2026. The system records latency boundaries, token accounting and errors in private database tables and in scan results. There is no log pipeline, tracing, alerting, dollar-cost reporting or admin dashboard. This covers local behavior; hosted logging is not verified.

**Evidence labels:** *Automated* (offline tests, PGlite, injected responses), *Local API* (real local Auth, PostgREST, Edge, pgTAP), *Live local* (real Gmail and Gemini on fictional mail), *Code* (read from source, not separately exercised), *Planned*.

## What exists

| Signal | Where | Who can read it | Evidence |
| --- | --- | --- | --- |
| Batch counts: candidates, permitted, blocked, skipped, prepared, reused, failed, context bodies, model calls | `private.gmail_scan_work.last_result`, returned by the `gmail_scan` endpoint and `gmail_scan_status` | Owner, shown in the workspace | Live local (L07, L14, L21, L22) |
| Batch stop reason, per-code failure counts, unresolved count, backlog flag | Same | Owner | Automated; some stop reasons live local |
| Last started, finished and successful times; cooldown end | `gmail_scan_status` | Owner; the workspace shows the last successful time and a cooldown countdown | Local API. A batch that stops at a planned per-batch limit counts as successful (F6, fixed in `20261112001000_scan_cooldown_and_batch_stops`) |
| One row per model attempt: state, `safe_error`, `reserved_tokens`, `reported_tokens`, `started_at`, `finished_at` | [`private.storage_attempts`](../app/supabase/migrations/20261104060000_storage_schema.sql) | Database operator only | Automated |
| Daily requests and tokens per user | `private.storage_usage` | Owner totals through `storage_activity`, shown only in the `/storage` tester | Automated |
| Shared requests per model per minute | `private.storage_provider_usage` | Database operator only | Automated |
| Job state, attempts, retry time, `safe_error` | `private.storage_jobs` | Database operator only | Automated |
| Model, returned model version, configuration hash, warnings | `storage_extractions` | Owner | Automated |
| Connection state | `google_connection_status` | Owner | Live local (L17, L18, L20) |

## Latency

- **Per-call time:** the [Gemini adapter](../app/pipeline/gemini.mjs) measures `latencyMs`. The pipeline CLI prints it. The Gmail processor does **not** save it.
- **Saved instead:** `storage_attempts.started_at` and `finished_at` bracket claim through save, so they include validation and writing as well as the model call. `gmail_scan_work` holds batch start and finish times.
- **Not displayed:** the workspace shows no durations, and no live Gmail latency figures have been recorded. A fictional CLI run on `gemini-3.6-flash` took 3,186 ms ([pipeline guide](../app/pipeline/README.md)). That is one case on a different model.
- **Hard limits:** 90 seconds per batch, 60 seconds per model call, 10 seconds per Gmail request, and a model call is not started with under 10 seconds left.

## Token usage and cost

Before each model call, the backend reserves an estimate: the UTF-8 bytes of the input, prompt and schema, plus `maxOutputTokens`, currently 8,192 ([processor](../app/pipeline/gmail-processor.mjs)). The estimate differs per message. It is deliberately high and is not a tokenizer count.

| Outcome | Charged to the daily budget | Evidence |
| --- | --- | --- |
| Success with reported usage | Reservation replaced by the provider's `totalTokenCount` | Automated; live local |
| Failed or unknown attempt | Reservation kept, because the true cost is unknown | Automated; live local |
| Reused result, blocked mail, review actions | Nothing | Automated; live local (L14) |

**Measured from local usage records on fictional mail (small sample):**

- **14 successful live calls used 2,259-3,075 tokens each,** with a median of about **2,500**. This is one small fictional sample, not a general estimate.
- **Reservations are not fixed.** They ranged from **24,384 to 26,058** tokens, computed per message. The 2 failed attempts each kept their 26,058-token reservation.

**What that means against the trial limits (arithmetic, not measured):** at about 2,500 tokens each, 20 successful calls use about 50,000 of the 200,000-token daily budget, so the 20-request limit is reached first. At the observed reservation sizes, about eight failed attempts use the whole token budget.

**Limits of this accounting:**

- Only the total is saved. The adapter also reads input, cached, output and thinking counts, but they are not stored per attempt.
- A failed call's real usage is not recorded, even when the provider returned it.
- Dollar cost is not calculated. These are token counts, not a spending guarantee.

Budgets, cooldowns and other limits are listed in [safety and privacy](safety_privacy.md#budgets-rate-limits-and-cooldowns).

## Errors

Backend responses use fixed codes. Raw provider text never reaches the response, the database or a log.

| Layer | Codes | User sees or does |
| --- | --- | --- |
| [Scan endpoint](../app/supabase/functions/_shared/gmail-scan-handler.mjs) | `AUTH_REQUIRED`, `AUTH_UNAVAILABLE`, `ORIGIN_NOT_ALLOWED`, `METHOD_NOT_ALLOWED`, `JSON_REQUIRED`, `INVALID_SCAN_REQUEST`, `GMAIL_SCAN_DISABLED`, `SCAN_BUSY` (429), `SCAN_PERMISSION_OR_REVISION_CHANGED` (409), `GMAIL_SCAN_UNAVAILABLE` | Fixed message; saved results stay |
| Batch stop, in a successful response | `SCAN_INFERENCE_LIMIT`, `SCAN_TIME_LIMIT`, `SCAN_RETRIEVAL_LIMIT`, `SCAN_FAILURE_LIMIT`, `GMAIL_RATE_LIMITED`, `GMAIL_RECONNECT_REQUIRED`, `GMAIL_UNAVAILABLE`, `GMAIL_TIMEOUT`, `GMAIL_SERVER_ERROR`, `GMAIL_REQUEST_REJECTED`, `SCAN_UNEXPECTED_ERROR`, `PROVIDER_HTTP_429`, `STORAGE_BUDGET`, `STORAGE_PROVIDER_LIMIT`, `STORAGE_BUSY`, `STORAGE_PAUSED`, `STORAGE_STALE` | Mapped to plain text in the [adapter](../app/web/src/manualScanAdapter.ts); progress is kept for **Scan more** |
| One message gone since listing | `GMAIL_MESSAGE_GONE` (Gmail 404 for a message or thread) | Skipped and counted as skipped; the batch continues. Context messages that are gone are left out. |
| One message, batch continues | `GMAIL_BODY_EMPTY`, `GMAIL_BODY_LIMIT`, `GMAIL_BODY_ENCODING`, `GMAIL_EXTRACTION_FAILED`, `MODEL_INPUT_TOO_LARGE`, `STORAGE_RETRY_LATER`, `STORAGE_ATTEMPT_LIMIT` and similar | Counted as failed, retried up to three times |
| Attempt row | `safe_error`: `rate_limited`, `unavailable`, `invalid_output` or `failed` | Operator only |

**Gmail codes** ([retrieval](../app/pipeline/gmail-retrieval.mjs)): `GMAIL_TIMEOUT`, no answer within 10 seconds; `GMAIL_UNAVAILABLE`, a network error before any answer; `GMAIL_SERVER_ERROR`, a 5xx response; `GMAIL_RATE_LIMITED`, 429; `GMAIL_RECONNECT_REQUIRED`, 401 or 403; `GMAIL_MESSAGE_GONE`, 404 for a message or thread; `GMAIL_REQUEST_REJECTED`, any other refusal. `SCAN_UNEXPECTED_ERROR` is an error without a code of its own, such as a bug, and is not a Gmail problem.

**Automatic checks** retry `GMAIL_UNAVAILABLE`, `GMAIL_TIMEOUT`, `GMAIL_SERVER_ERROR`, `GMAIL_RATE_LIMITED` and `PROVIDER_HTTP_429` quietly, 30 seconds later, up to three times in a row (`TRANSIENT_STOPS` in [the dashboard model](../app/web/src/dashboardModel.ts)); the status panel shows the stop only after that. Every other stop shows at once and ends automatic checks until **Scan now**. A stop is shown once, in the status panel, not repeated in a banner.

**Trade-off:** the Gmail processor records every non-rate-limit failure as `unavailable` and `GMAIL_EXTRACTION_FAILED`, so the records do not distinguish a schema or evidence rejection from an outage. Finding F1 in [UC8](use-cases.md#findings-from-the-live-run) was diagnosed by replaying the fictional message against the model in a throwaway script without touching the database.

## No content in logs

- A source search found **no `console.*` calls** in the Edge functions, the Gmail, Gemini and core pipeline modules, or `app/web/src` (Code). The CLI tools print to the terminal and are for fictional input.
- Bodies are not written to any table. Attempt, job and scan-result rows contain IDs, counts and codes. `gmail_scan_work.continuation` holds Gmail message IDs and a page cursor.
- The request sent to Gemini is **not logged**, so it cannot be inspected afterward. L15 therefore proves a marker's absence from **saved results only**.
- The platform's own logs (Supabase Edge runtime, Docker, gateways) are outside this control, and their contents and retention have not been audited. Do not export callback URLs or browser HAR files.

Sender, subject, summaries, evidence and `storage_jobs.owner_email` are application data, not technical logs. Do not dump those rows to debug.

## Debugging a local scan

1. Read the workspace's last-batch tiles and stop message. Most issues end here. Common cases: Gmail filed the test mail as spam; the account's Google notices inflate blocked counts (F11); new mail arrived after the saved window, so use **Scan past seven days**.
2. Check the mode. `GMAIL_SCAN_DISABLED` means the flag, key or Google connection setting is off ([setup](../app/INSTALL.md)).
3. As the local database owner, for example in local Studio, read only safe columns:

   ```sql
   select usage_day, requests, charged_or_reserved_tokens from private.storage_usage;
   select attempt, state, safe_error, reserved_tokens, reported_tokens, started_at, finished_at
     from private.storage_attempts order by started_at desc limit 20;
   ```

4. For a suspected validation failure, replay that fictional message in a throwaway script. Do not add content logging to the backend.
5. Run the smallest relevant checks from [the install guide](../app/INSTALL.md#run-the-checks). Record the commit, date, fictional case ID and evidence type. Never record secrets or personal mail.

Automated coverage: [storage database tests](../tests/storage-database.test.mjs) (budgets, provider limits, attempts), [retrieval tests](../tests/gmail-retrieval.test.mjs) (counts, stop reasons, sanitized failures), [persistence tests](../tests/gmail-persistence.test.mjs) (reuse), and the [local API trial](../tests/storage-local.mjs).

## Planned, not implemented

- Save per-call latency and token categories for each attempt.
- Add a correlation ID across dispatch, retrieval, inference and saving.
- Add distinct safe codes for validation failures.
- Estimate dollar cost from token categories, with the pricing date recorded.
- Show remaining allowance in the workspace.
- Add operator alerts for stuck leases, repeated failures and budget deferrals.
- Add schedule timing once scheduled scans exist.
- Audit platform log contents and retention before any hosted use.
