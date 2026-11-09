# React frontend guidance

This is a local React + TypeScript + Vite application imported from Figma. It does not require Figma Make to run. Check running processes/ports before starting a server; do not assume one exists or that `$PORT` is configured.

See [current implementation state](../../CURRENT_STATE.md) before interpreting dated UI reports.

## Entry points and integration boundaries

- [src/main.tsx](src/main.tsx) mounts React and chooses the route. `/` presents sign-in/fictional preview. Signed-in users with no saved scan settings (revision 0) see the designed onboarding, which saves through `scan_settings_save`; everyone else gets the designed dashboard ([src/RealDashboard.tsx](src/RealDashboard.tsx), mapping in [src/dashboardModel.ts](src/dashboardModel.ts)) on saved records, whose Settings opens the designed settings screen on the same saved settings. Accounts with previous phrase rules see a review form first. The older `ManualWorkspace` is reachable only in development builds, from the account menu ([src/scanSetup.ts](src/scanSetup.ts), [src/useSavedScanSettings.ts](src/useSavedScanSettings.ts)). `/storage` and its Auth callback require a local-host Vite development server plus `VITE_STORAGE_ENABLED=true`. Production builds omit the development StorageDashboard and show Page not found for `/storage` paths, regardless of flags. Product sign-in preserves the root-origin return; the backend Google return destination must match it (local template: the root path).
- [src/App.tsx](src/App.tsx) owns shared Auth and selects real versus preview UI. [src/ManualWorkspace.tsx](src/ManualWorkspace.tsx) and [src/manualScanAdapter.ts](src/manualScanAdapter.ts) implement persistent product scan/review wiring, which the designed dashboard reuses; live local results are in [UC8](../../docs/use-cases.md#uc8-real-gmail-to-review-workflow). The designed dashboard was browser-checked only with seeded fictional records. [src/previewAdapter.ts](src/previewAdapter.ts) and [src/demoData.ts](src/demoData.ts) remain fictional preview only.
- [src/StorageDashboard.tsx](src/StorageDashboard.tsx) implements authenticated storage review; [src/storageAdapter.ts](src/storageAdapter.ts) provides reads/RPCs and fixed errors using the singleton client in [src/supabase.ts](src/supabase.ts). Reuse the shared client/session when integrating OAuth; avoid adding another Auth client per component.
- [src/index.css](src/index.css) supplies global Tailwind v4 styling; [src/storage.css](src/storage.css) scopes storage UI styles. Follow the surrounding component's conventions and avoid broad restyling during integration work.
- [vite.config.ts](vite.config.ts) configures React, Tailwind, and the `@` alias. Runtime/tool versions and scripts come from [package.json](package.json).

Preserve real, preview and development routes unless the task explicitly changes them. Do not silently wire simulated connection/calendar controls to real services. The storage route currently supports fixture trials, not Gmail retrieval or Calendar execution.

Product onboarding must use Google sign-in without a separate password account,
saved scanning consent/source rules, and optional Calendar connection with Skip
for now. Add production callback/return routes before enabling hosted OAuth.
Preserve the [custom sender/domain/subject filter plan](../../IMPLEMENTATION_PLAN.md#custom-sender-domain-and-subject-filters-implementation-plan),
using exact sender/domain access rules, optional literal subject exclusions, and separate semantic topics. Topics never grant access and are evaluated only after permitted content reaches Gemini. Preserve custom inputs and accessible help. Previous phrase rules require explicit review; never infer categories from expanded terms.

## Commands

Run from this directory with the pinned package manager:

```powershell
corepack pnpm install --frozen-lockfile
corepack pnpm dev --host 127.0.0.1
corepack pnpm exec tsc --noEmit
corepack pnpm build
```

Do not run npm install here or create a second lockfile. There is no frontend test/lint script at present; do not invent a passing check. Use a browser check for changed interactions and describe the real coverage.

## Auth and UI behavior

- Use [the public environment template](.env.example) and [local backend setup](../supabase/README.md). Never put service-role, secret, refresh-token, or model credentials in `VITE_*` variables. Restart Vite when changing startup environment values.
- Let RLS and authenticated RPCs authorize storage access; browser-supplied owner IDs are not authorization. Clear user-specific records when sessions change and fence late fetches from the previous session.
- Keep loading, empty, failure, missing-context, and expired-evidence states explicit. Clear busy state in `finally`; do not expose SDK/provider exception text or claim a successful save before persistence confirms it.
- Maintain accessible labels, keyboard operation, visible focus, and status/error announcements. Preserve the plan's accessibility requirements; do not claim IBM Carbon compliance without verifying it.
- Show date-only deadlines without inventing a time. Approval and Calendar consent remain separate. Dashboard reminder dates do not send messages.
- Await saved-state refresh before browser assertions. Use temporary fictional accounts, remove test data afterward, and distinguish seeded results from actual model inference.
