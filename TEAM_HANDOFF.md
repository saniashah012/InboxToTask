# Manual Gmail Scan Handoff for Team Review

## Status
Current status lives in [CURRENT_STATE.md](<Checkpoint 3/CURRENT_STATE.md>); sections below may lag it. The manual scan has been tested locally with real Gmail and Gemini on fictional mail in a dedicated account. It stays disabled by default, and nothing here enables it on hosted. The hosted session reports 20 ledger versions through `20261106040000`, applied 03:50 UTC November 6, with Gmail functions not deployed, so connecting and scanning work only locally. Reported by Sania on preview `ffa915a`: settings save and reload, sign-out and back in, the stale-tab 409 (`PT409`), and two-account isolation in the tested workspace flows passed. Test values were restored, consent stayed off, and no inboxes were connected. Not covered: onboarding, chips, RLS penetration, review, manual resolution and source links. These checks predate the current tip.

## Database migrations for the Gmail scanner
Apply these in filename order, together, after any earlier repository migrations:

1. `20261105200000_source_semantic_contract.sql`
2. `20261105210000_manual_gmail_retrieval.sql`
3. `20261105212000_manual_gmail_pause_gate.sql`
4. `20261105220000_gmail_persistence.sql`
5. `20261105223000_gmail_scan_status.sql`
6. `20261106000000_gmail_scan_hardening.sql`
7. `20261106010000_gmail_manual_resolution.sql`, added after live testing, for manually resolving ambiguous updates.
8. `20261106030000_gmail_task_source_links.sql`, for showing each task's source emails.
9. `20261106040000_gmail_token_recheck.sql`, for correcting the connection status when Google rejects access.

Do not stop after step 5: step 6 fixes defects in steps 4 and 5. Steps 7 to 9 are additive, but the product page calls their functions. Applying these enables no scanning; `gmail_scan` stays a separate function and is disabled by default. Please report which versions were applied and to which environment.

## What is already implemented
- Source/semantic permission separation and filter handling are in place.
- Manual Gmail retrieval coordination and metadata-first bounds are implemented.
- Prompt/schema work for Gmail extraction and task-context handling is present.
- Local offline verification for targeted Gmail logic has passed.
- Local pause and retrieval gating were implemented in the migration set.

## Main work areas
Key files in the current implementation:
- `Checkpoint 3/app/pipeline/gmail-retrieval.mjs`
- `Checkpoint 3/app/pipeline/gmail-processor.mjs`
- `Checkpoint 3/app/pipeline/task-context.mjs`
- `Checkpoint 3/app/prompts/extraction.schema.mjs`
- `Checkpoint 3/app/prompts/extraction.system.txt`
- `Checkpoint 3/app/supabase/functions/gmail_scan/`
- `Checkpoint 3/app/supabase/functions/_shared/gmail-scan-handler.mjs`
- `Checkpoint 3/app/web/src/ManualWorkspace.tsx`
- `Checkpoint 3/app/web/src/manualScanAdapter.ts`

## Product constraints and guardrails
- Exact sender/domain inclusions and literal subject exclusions override inclusions.
- Semantic topics never grant access; they are evaluated only after permitted content reaches Gemini.
- Empty source allowlists process nothing.
- Connecting Google or saving filters does not imply consent.
- Calendar writes require separate authorization and are distinct from task approval.
- User isolation, revision checks, deletion/pause fencing, and retention behavior remain in scope.
- Gmail retrieval and scanning should remain disabled unless explicitly authorized and verified.

## Remaining verification work
Live local results, and the cases not run live, are in [UC8](<Checkpoint 3/docs/use-cases.md#uc8-real-gmail-to-review-workflow>). Still open: real data in the designed dashboard and onboarding, automatic scans, and the signed-in hosted checks not yet covered. Calendar events are postponed to CP4 by user decision.

## Validation status
- Offline, local database, local API and seeded browser checks pass. See the [review report](<Checkpoint 3/docs/gmail-manual-scan-review-2026-11-05.md>).
- Live local results on fictional mail are in `Checkpoint 3/docs/use-cases.md` under UC8.
- These results do not establish live Gmail accuracy or hosted integration correctness. This branch is not production-ready.
