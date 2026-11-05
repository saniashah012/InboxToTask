# React frontend guidance

This is a local React + TypeScript + Vite application imported from Figma. It does not require Figma Make to run. Check running processes/ports before starting a server; do not assume one exists or that `$PORT` is configured.

## Entry points and integration boundaries

- [src/main.tsx](src/main.tsx) mounts React and chooses the route. `/` uses the prototype. `/storage` uses the lazy-loaded storage dashboard only when `VITE_STORAGE_ENABLED=true`.
- [src/App.tsx](src/App.tsx), [src/previewAdapter.ts](src/previewAdapter.ts), and [src/demoData.ts](src/demoData.ts) implement the simulated prototype/onboarding. Preview actions do not establish real backend behavior.
- [src/StorageDashboard.tsx](src/StorageDashboard.tsx) implements authenticated storage review; [src/storageAdapter.ts](src/storageAdapter.ts) owns the shared Supabase client, reads, RPC calls, and fixed user-facing errors. Reuse the shared client/session when integrating OAuth; avoid adding another Auth client per component.
- [src/index.css](src/index.css) supplies global Tailwind v4 styling; [src/storage.css](src/storage.css) scopes storage UI styles. Follow the surrounding component's conventions and avoid broad restyling during integration work.
- [vite.config.ts](vite.config.ts) configures React, Tailwind, and the `@` alias. Runtime/tool versions and scripts come from [package.json](package.json).

Preserve both routes unless the task explicitly replaces the prototype. Do not silently wire simulated connection/calendar controls to real services. The storage route currently supports fixture trials, not Gmail retrieval or Calendar execution.

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
