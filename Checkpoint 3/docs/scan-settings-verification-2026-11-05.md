# Saved scanning settings: local verification

November 5, 2026. This is a partial milestone 3 implementation, not a Gmail scan or live Google OAuth verification.

## Implemented

- The additive [migration](../app/supabase/migrations/20261105070000_scan_settings.sql) was applied to the existing **local** database with `npx.cmd supabase --agent no migration up`. No reset or hosted operation occurred.
- Owner-scoped settings default to no consent, paused, empty inclusions, and zero earlier context messages. Context caps reuse canonical bounds: 0–10 earlier messages, 1–90 days, 100–30,000 characters per message, 100–60,000 total characters, with total at least per-message size. Starting character limits are 12,000/24,000; starting age is 30 days. Zero earlier messages is a conservative starting setting, not confirmation of the plan's proposed five-message default.
- Controlled Auth RPCs validate and canonicalize sender/domain/label/subject arrays, bound lists to 200 entries and entries to 254 characters (labels to 100), reject malformed/unknown fields, and deduplicate case-insensitive sender/domain/keyword values. Labels preserve case. Subject arrays can be stored; this does not implement new matching semantics.
- Consent requires the explicit `gmail-scan-v1` disclosure acknowledgement; saving source rules does not infer consent. Stale revisions return `PT409`/HTTP 409.
- Saves lock storage preferences before settings/child work, increment the existing generation, cancel processing jobs, and mark unfinished attempts unknown. Existing accepted tasks remain intact. This fences existing storage work; a future Gmail dispatcher must also check current settings and connection generations before each external request and persistence.
- [The shared form](../app/web/src/ScanSettingsPanel.tsx) is available in the designed product's Sources/Processing settings and the localhost development dashboard. It provides custom sender/domain lists, subject exclusions, exact label-ID inputs, context controls, explicit consent/pause, effective form scope, save/reload/error states, and an info tooltip with hover/focus/click and Escape/blur dismissal. Product dashboard instances are keyed by verified account ID to discard account-local component state on changes.
- Legacy onboarding preferences remain separate and are not automatically converted to scanning consent or active scope. Subject inclusion controls and canonical subject inclusion matching remain pending the requested OR/AND decision. Labels currently require exact IDs; fetching a live label picker remains future work.

## Checks performed

| Check | Evidence |
| --- | --- |
| Offline application suite | `npm.cmd test`: **107 passed**, including the new PGlite settings suite; no Google or model calls |
| Actual local PostgreSQL | `npx.cmd supabase --agent no test db`: **67 passed across four files**, including 13 settings assertions; transactions rolled back |
| Frontend types/build | Pinned `corepack pnpm exec tsc --noEmit` and `corepack pnpm build` passed |
| Real browser + local Auth/PostgREST | Temporary fictional password-authenticated account; saved sender normalization/deduplication and subject exclusion; reload restored fields, consent stayed false and pause true until explicitly changed |
| Consent and revision UI | Explicit consent/unpause persisted across reload. A separate real RPC save made the displayed revision stale; form displayed the real HTTP 409 and recovered with Reload saved settings |
| Tooltip | Hover, focus, click, Escape and blur behavior checked in the browser |
| Product integration | Existing onboarding completed with fictional sender settings; designed dashboard Settings displayed the same persisted scanning settings as the development route |
| Local sign-out | Product sign-out received HTTP 204; protected settings disappeared. This verifies fictional local Auth behavior, not a Google-authenticated refresh/revocation lifecycle |
| Cleanup | Temporary fictional browser account and cascading test data removed; browser signed out |

`git diff --check` also passed. These are this change's results; do not add dated historical test counts to them. Browser account switching, simulated network-failure UI, mobile touch interaction, complete keyboard traversal, and Carbon compliance have not been verified.

## Remaining work and runtime

Local Auth health returned HTTP 200 and the Google Edge endpoint responded to a method gate. Vite was stopped and was restarted at `http://127.0.0.1:5173/storage`. Listener enumeration was denied in the sandbox; HTTP probes established availability instead.

The shared browser was signed out of the user's Google account. Initial Google connection remains user-reported; live Google reload, actual token refresh, denied/partial consent, wrong account, provider revocation, and disconnect/reconnect remain pending. The fictional local Auth check above does not close those requirements.

The OR/AND subject-inclusion question has been presented to the user. Do not silently choose its answer. Complete canonical matching and acceptance tests after that answer, then wire trusted saved rules to pre-body/context and pre-inference checks. Real product Google status/actions, unified persistent review, manual Gmail extraction, incremental scans/scheduling, and provider data-handling verification remain unfinished. No Gmail bodies were fetched, no Gemini calls were made, and fixture extraction/cleanup flags were not changed. Credentials, encryption key, root-origin sign-in callback, and hosted configuration were preserved.
