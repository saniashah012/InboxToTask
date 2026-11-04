# Installation

## Local production build

Requirements: Node.js 22 and pnpm 10.

From `Checkpoint 3/app/web`, install the locked dependencies and build:

```sh
corepack pnpm install --frozen-lockfile
corepack pnpm build
```

The production files are written to `Checkpoint 3/app/web/dist`. No environment
variables are required for this demo.

## Vercel deployment

1. Import the repository into Vercel.
2. Set the **Root Directory** to `Checkpoint 3/app/web`.
3. Use the Vite framework preset, install command `pnpm install --frozen-lockfile`,
   build command `pnpm build`, and output directory `dist`.
4. Do not add environment variables for the current prototype.

The app opens with an honest unavailable state because authentication, Gmail,
Google Calendar, and background processing are not configured. Select
**Explore demo** to enter the local preview and view sample tasks. Demo actions
only update in-memory preview state; they do not connect to external services
or process real messages.
