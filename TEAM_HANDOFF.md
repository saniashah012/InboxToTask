# Manual Gmail Scan Handoff for Team Review

## Status
This branch contains the in-progress local implementation for the manual Gmail scanning milestone. The work remains uncommitted and was intentionally preserved as-is. The current direction is to continue the work carefully without opening broad email access or enabling live Gmail/Gemini processing before the remaining guardrails and verification steps are complete.

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

## Local migration status
Applied locally:
- `20261105200000_source_semantic_contract.sql`
- `20261105210000_manual_gmail_retrieval.sql`
- `20261105212000_manual_gmail_pause_gate.sql`

Not yet applied to the actual local database:
- `20261105220000_gmail_persistence.sql`
- `20261105223000_gmail_scan_status.sql`

These two pending migrations were exercised in PGlite, but they should be reviewed before applying to the actual local database. Do not reset local data while attempting to apply them.

## Remaining verification work
Before live use, the following items still need to be finished:
1. Review and apply the two pending persistence/status migrations locally.
2. Resolve the Google OAuth return destination mismatch between the template and the current runtime config.
3. Verify the authenticated browser flow and manual workspace behavior end-to-end using a dedicated fictional mailbox.
4. Confirm the live Gmail → Gemini → storage workflow under the real permission rules.
5. Re-check stale-target review/rebase safeguards and persistence behavior before broader release.

## Validation status
Current evidence is:
- Offline pipeline and targeted Gmail tests pass in the local test harness.
- Frontend build/type checks pass for the current UI work.
- No live Gmail or real-model execution is confirmed as part of this branch.
- Offline and local test results do not establish live Gmail accuracy or hosted integration correctness.

## Recommended next action
A teammate should continue with the pending verification work while preserving the current local branch state. The feature should stay disabled until the remaining auth and persistence checks are complete. This branch should not be treated as production-ready until the live acceptance gate is passed.

## Handoff note for reviewers
This work is intentionally scoped to the local manual Gmail scanning milestone. The implementation is not yet complete, but the groundwork is in place and the current state was preserved to avoid losing uncommitted work. Please continue carefully, maintain the guardrails above, and do not enable broad scanning or production OAuth flows without explicit verification.
