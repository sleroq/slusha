# Slusha Mini App

A client-rendered Solid 2 application for Telegram, served by the Bun
backend. The interface uses Telegram theme/safe-area tokens and shared controls
from `@slusha/mini-app`.

## Development

Use Bun and Node 24. Oxlint's TypeScript configuration and JavaScript plugin
host require a recent Node runtime.

From the repository root:

```sh
bun install --frozen-lockfile
cd web
bun run dev
```

Launch the app through Telegram for authenticated development using the built Mini App served by the backend. Opening Vite directly without Telegram launch data is not an authentication bypass.

```sh
bun run check
bun run lint
bun run test:install  # First time: install Chromium and WebKit
bun run test
bun run build
```

The build produces `web/build`, matching the Dockerfile and Bun static server.
The server supports direct SPA route loads and revalidates HTML. `bun run preview` is for local build inspection;
it does not supply a backend or Telegram authentication.

## Ownership

- `src/app`: application composition, routes, navigation guards, titles, scroll,
  and the policy for Telegram Back/Main buttons.
- `src/features/settings`: API transport, query and mutation policy, editable
  drafts, validation feedback, settings sections, and specialized editors.
- `../packages/mini-app`: shared UI primitives, styles, and the Telegram host
  adapter. It does not import Slusha settings, routes, or API contracts.
- `../shared/config-contract.ts`: browser-safe Zod Mini wire schemas and inferred
  types shared with the backend. Successful PUTs return the canonical snapshot.

TanStack Solid Query owns server caching; drafts are separate and never replace
the cache while typing. A background refresh cannot overwrite dirty work. Scope
navigation guards apply to browser history as well as in-app and native Back.
Routes and cache invalidation policy remain application-owned, not library APIs.

## Tooling and tests

The Solid runtime, DOM renderer, compiler, router, and query adapter are pinned
to compatible Solid 2 prereleases. Upgrade them as a cohort and verify an actual
production render, not just types.

Oxlint uses the official
[`solid-v2/basic` template](https://github.com/solidjs/templates/tree/main/solid-v2/basic)
configuration with `eslint-plugin-solid/configs/v2`. Strict TypeScript checking
is separate; Solid diagnostics are enabled only outside production. Tailwind and
its forms plugin run at build time.

Playwright exercises the whole rendered application with intercepted API
responses and a test-only Telegram host. There are no component unit tests or
production mock-auth paths. The browser harness lives under `tests/` and is not
a production build entry point.

The shared development guidance and device checklist are in
[`docs/mini-apps/SKILL.md`](../docs/mini-apps/SKILL.md). Automated WebKit/Chromium
checks do not replace a Telegram iOS/Android smoke test for native controls,
keyboard resizing, gestures, and safe areas.
