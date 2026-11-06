# Manual Gmail Scan Handoff for Team Review

## Status
Current status lives in [CURRENT_STATE.md](<Checkpoint 3/CURRENT_STATE.md>); sections below may lag it. The manual scan code is implemented and locally verified with fictional injected data. No real Gmail or Gemini call has been made, and live Gmail/Gemini processing stays disabled until the live acceptance gate passes.

## Database migrations for the Gmail scanner
Apply these in filename order, together, after any earlier repository migrations:

1. `20261105200000_source_semantic_contract.sql`
2. `20261105210000_manual_gmail_retrieval.sql`
3. `20261105212000_manual_gmail_pause_gate.sql`
4. `20261105220000_gmail_persistence.sql`
5. `20261105223000_gmail_scan_status.sql`
6. `20261106000000_gmail_scan_hardening.sql`

Do not stop after step 5: step 6 fixes defects in steps 4 and 5. Applying these enables no scanning; `gmail_scan` stays a separate function and is disabled by default. Please report which versions were applied and to which environment.

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
Live acceptance with a dedicated fictional mailbox remains: see the [Phase 6 runbook](<Checkpoint 3/docs/gmail-manual-scan-review-2026-11-05.md#phase-6-live-acceptance-runbook>).

## Validation status
- Offline, local database, local API and seeded browser checks pass. See the [review report](<Checkpoint 3/docs/gmail-manual-scan-review-2026-11-05.md>).
- No live Gmail or real-model execution has occurred.
- These results do not establish live Gmail accuracy or hosted integration correctness. This branch is not production-ready until the live acceptance gate passes.
