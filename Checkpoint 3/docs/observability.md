# InboxToTask observability and debugging

Updated November 5, 2026. Observability currently consists of structured pipeline results, private database job/accounting state, safe activity reads, fixed backend errors, and dated verification reports. Centralized tracing, production alerting, and a complete scan/cost dashboard are not implemented.

## What is observable today

| Signal | Source | Scope and limitation |
| --- | --- | --- |
| Model duration and usage | [Gemini adapter](../app/pipeline/gemini.mjs) and [pipeline result](../app/pipeline/core.mjs) | Result envelope includes `latencyMs`, `modelCalls`, returned model version, and available usage fields. This is not end-to-end scan latency |
| Effective extraction configuration | [Storage coordinator](../app/supabase/functions/_shared/storage.mjs) and extraction rows | Configuration/extraction hashes, settings version, configured model, returned model, and analysis time support reproducibility and reuse. Hashes are identifiers, not anonymization guarantees |
| Jobs and attempts | Private storage job/attempt tables in [the schema](../app/supabase/migrations/20261104060000_storage_schema.sql) | Job IDs, attempt numbers, state, lease expiry, generation, timestamps, reservations, reported total tokens, and bounded safe-error values. Browser roles cannot read these tables |
| Owner activity | [`storage_activity` RPC](../app/supabase/migrations/20261104060300_storage_activity.sql) | Requests today, charged-or-reserved tokens, configured limits, live processing jobs, failed jobs, saved extraction count, and UTC reset time. These are not Gmail scanned/excluded/pending counts |
| Google connection state | [Safe status RPC](../app/supabase/migrations/20261105060000_google_connections.sql) | State, email, scopes, expiry, and disabled scanning indicator; no credential values. Saved status or unexpired token availability does not prove live provider authorization |
| Settings conflicts | [Saved settings RPCs](../app/supabase/migrations/20261105070000_scan_settings.sql) | Settings revision and fixed `PT409` stale-save errors; successful saves invalidate older storage generations |
| Verification evidence | [Settings report](scan-settings-verification-2026-11-05.md), [storage report](local-storage-verification-2026-11-04.md), [Google report](google-auth-verification-2026-11-05.md), and [live evaluation](extraction-review-verification-2026-11-04.md) | Dated local/synthetic/provider evidence, not current runtime health or proof of hosted behavior |

The storage endpoint normally returns a saved receipt and identifiers rather than the full pipeline envelope. In particular, model duration and detailed token categories are not currently persisted as complete production telemetry. Attempt start/finish timestamps can describe job elapsed time but should not be reported as provider-only latency.

## Token usage, budgets, and cost

The provider adapter reads input, cached-input, output, thinking, and total-token metadata when supplied. Missing input/output/thinking/total values remain null; absent thinking usage must not be interpreted as zero thinking. The current adapter defaults absent cached-input metadata to zero, so that value alone does not prove an explicitly reported cache measurement. Multi-attempt CLI success metadata does not establish the total cost of failed earlier attempts. The fixture Edge endpoint forces one provider attempt per dispatch.

Before inference, the coordinator reserves a conservative byte-based input/schema/prompt estimate plus the output allowance. This is not an exact tokenizer count or dollar estimate. Successful persistence reconciles the reservation to reported total tokens when available; unknown-cost failures retain the reservation. The activity UI deliberately calls this **reported or reserved tokens**.

Current fixture defaults are 20 requests and 200,000 tokens per user per UTC day, a shared three-requests-per-model-per-minute limiter, one live job per user, and 90-second leases. Storage permits at most three attempts per extraction identity with a 60-second failure retry delay; there is no automatic retry dispatcher. These defaults are controlled-trial limits, not validated production capacity or a provider quota guarantee. See [the storage contract](../app/supabase/STORAGE.md).

A valid cache hit and code-only review actions should invoke zero model calls; offline tests verify those paths. Real empty/unchanged Gmail scans are not yet available to measure. Dollar cost reporting remains planned: store applicable token categories, pricing date/model/tier, and retry uncertainty, calculate estimates without double-counting cached or thinking tokens, and reconcile against provider billing. This document makes no current-price or measured-cost claim.

## Error behavior and recovery

| Condition | Current surface | Recovery/check |
| --- | --- | --- |
| Missing or invalid session | `AUTH_REQUIRED` | Sign in again; verify that a public key alone cannot authorize processing |
| Auth service unavailable | `AUTH_UNAVAILABLE` | Check local Auth health without dumping CLI credentials |
| Fixture processing disabled | `FIXTURE_EXTRACTION_DISABLED` | Expected during ordinary OAuth/settings checks; do not enable inference merely to clear this message |
| Invalid fixture contract | `EXPECTED_CASE_ID_ONLY` | Send only a supported case ID; browser-selected bodies/rules/owners are rejected |
| Concurrent, paused, suppressed, or stale work | Fixed `STORAGE_*` codes, usually HTTP 409 | Reload current state; do not bypass pause/suppression or blindly repeat an uncertain operation |
| Budget/provider/retry deferral | Fixed storage limit codes or `PROVIDER_RATE_LIMITED`, HTTP 429 | Respect limits and retry timing; no unbounded retry loop |
| Provider/validation failure | Fixed endpoint error such as `EXTRACTION_FAILED` | Preserve failure accounting; do not save truncated/ungrounded output or display success |
| Stale review/settings revision | `PT409` / HTTP 409 | Reload the current revision and explicitly retry the intended edit |
| Google connection failure | Fixed backend connection errors or sanitized callback outcome | Reload saved status; reconnect when required; retry pending revocation without exposing provider prose |

Endpoint mappings are defined in [the fixture handler](../app/supabase/functions/_shared/fixture-handler.mjs), [Google connection handler](../app/supabase/functions/_shared/google-connection.mjs), and [frontend adapter](../app/web/src/storageAdapter.ts). The CLI can expose more specific bounded diagnostic codes on fictional inputs. Raw provider error text is not an application error message.

## Privacy-aware diagnostics

Backend handlers/transports intentionally return fixed errors and avoid logging email payloads, prompts, model text, authorization headers, tokens, or native provider diagnostics. Production diagnostic events should contain identifiers and bounded codes rather than content. Account/source identifiers still require access controls and retention; pseudonymous identifiers are not automatically anonymous.

Source subjects, senders, task fields, summaries, evidence, and private job owner-email fields are application data, not safe technical logs. Do not dump their rows to debug a request. Keep Google credentials/encryption keys and privileged Supabase/Gemini configuration server-side and out of screenshots, reports, Git, and `VITE_*` variables. Do not export callback query parameters or a browser HAR containing credentials.

Some main-product frontend error handlers currently send SDK error objects to the browser console. A consistent frontend logging/redaction audit remains work; there is no implemented universal redaction layer. Do not describe every SDK/platform log as sanitized merely because backend endpoint responses are fixed.

Storage cleanup code makes attempt diagnostics older than 14 days eligible for removal. Cleanup scheduling is disabled, and hosting-platform log retention is separate; neither establishes automatic deletion of all diagnostics after 14 days. Final log retention and access procedures must be confirmed before hosted rollout.

## Local verification and debugging procedure

1. Record the commit, date, route, test-account alias, input case ID if fictional, and whether the run is offline, synthetic integration, live provider, or hosted. Never record secrets or personal mail.
2. Probe the frontend and local Auth health. An HTTP method/auth gate from an Edge endpoint establishes reachability only, not successful provider exchange or inference.
3. Follow [local setup](../app/supabase/README.md) and [Google setup](../app/supabase/GOOGLE_AUTH.md). Preserve private configuration and encryption keys. Do not reset the database to diagnose pending migrations; apply ordered local migrations instead.
4. For extraction issues, check enabled mode, session verification, fixed fixture contract, claim outcome, validation outcome, and saved receipt in that order. Distinguish a cache hit, a deferred claim, and a successful new inference.
5. Inspect only safe job/attempt/accounting fields through an authorized backend workflow. Check generation, lease, suppression, and revision conflicts before considering retries. A timed-out provider/save request can have an unknown outcome; do not assume it was free or never executed.
6. Run the smallest relevant checks. Commands below run from `Checkpoint 3/app`; they are not instructions to enable live inference.

```powershell
npm.cmd test
npm.cmd run test:storage
npm.cmd run test:google
npm.cmd run test:calendar
npx.cmd supabase --agent no test db
```

Offline suites use fictional input/injected responses and PGlite semantics. The pgTAP suite requires the actual local database and rolls back its test data. Existing local HTTP scripts have configuration assumptions; read [the backend guide](../app/supabase/README.md) and the script before running them against a configured OAuth runtime. For example, the Google local script expects disabled provider endpoints and must not be reported as passing against an enabled runtime without adapting the trial.

For frontend changes, run the pinned package manager's type/build checks from `Checkpoint 3/app/web` and verify interactions in the browser. Documentation-only changes need path/link/command checks and `git diff --check`, not model calls or another full suite.

## Planned instrumentation before real scans

- Introduce a scan/request correlation ID spanning dispatch, permission checks, retrieval, inference, and persistence. Existing job/attempt IDs are not a complete distributed trace.
- Record permission/settings and connection generations, safe stage/outcome codes, processed/excluded/failed/deferred counts, and manual/scheduled/backlog scope. Keep rule text, subjects, bodies, and callback/token values out of technical events.
- For the selected **15-minute default scan interval**, record scheduled time, actual start/finish, and outcome so schedule delay is distinguishable from processing latency. Verify empty incremental checks make zero model calls. The **60-second manual-refresh cooldown remains an unconfirmed proposal**; after selection and implementation, expose its next-eligible time and distinguish cooldown from an already-running scan. Do not confuse it with the current storage failure-retry delay.
- Record effective context limits and configuration identity as bounded metadata. Saved scanning settings currently default to **zero** earlier messages; the canonical fixture/CLI pipeline defaults to **five**. The proposed real-scan five-message default is not confirmed. Future scan evidence must show which saved revision and limits were enforced rather than treating a pipeline default as proof of runtime behavior.
- Measure queue delay, metadata retrieval, permitted body/context retrieval, model duration, validation/persistence, and time to first saved review result separately.
- Persist provider usage categories, reported-versus-reserved status, model/prompt/schema configuration identity, retry counts, and cost-estimation provenance.
- Add owner-visible scan progress and safe operational alerts for stuck leases, repeated failures, revocation pending, provider throttling, budget deferrals, and cleanup failures. Alert thresholds need empirical tuning; no alert delivery currently exists.
- Verify telemetry itself cannot leak another user's data and that failures in telemetry do not bypass authorization or change review outcomes. Test the closed-dashboard schedule and permission changes during queued/in-flight work after those features exist.
- When connected Calendar execution exists, track safe authorization/approval state, task revision, operation identity, and create/update/undo outcomes. Distinguish confirmed remote success, failure, and an unknown outcome requiring reconciliation. Record no event descriptions, attendee addresses, tokens, or provider error prose in technical events; skipping or denying Calendar is a normal user choice, not an app failure.

These additions remain requirements in [the implementation plan](../IMPLEMENTATION_PLAN.md). They are not evidence of an already running scheduler or production monitoring service.
