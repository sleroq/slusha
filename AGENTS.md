# AGENTS.md
This file is for coding agents working in this repository.

## Project Overview
- Monorepo with two TypeScript apps:
  - Root: Deno Telegram bot + Deno web server + Drizzle/SQLite
  - `widget/`: Svelte 5 + Vite mini-app, run through Deno tasks
- Package/runtime manager is Deno-first for both parts.

## Repository Layout
- `main.ts` - bot entrypoint
- `lib/` - bot/web/db/application code
- `drizzle/` - SQL migrations
- `scripts/` - run/build helper scripts
- `widget/` - Telegram web widget (Svelte 5)

## Canonical Commands (Root App)
Run from repo root unless noted.
- Typecheck: `deno check main.ts`
- Lint: `deno lint`
- Format check/fix: `deno fmt`
- Tests (all): `deno test`
- Tests (single file): `AI_TOKEN="test"; deno test lib/helpers_test.ts`
- Tests (single test name): `AI_TOKEN="test"deno test lib/helpers_test.ts --filter "splitMessage - handles newlines as natural break points"`
- Run app (dev loop): `scripts/run.bash`
- Build binaries: `scripts/build.bash`
- Build widget assets from root: `scripts/build-widget.bash`

## Canonical Commands (Widget)
Run from `widget/`.
- Dev server: `deno task dev`
- Typecheck: `deno task check`
- Lint: `deno task lint`
- Lint (Deno only): `deno task lint:deno`
- Lint (ESLint only): `deno task lint:eslint`
- Build: `deno task build`
- Preview: `deno task preview`

## Verification Order
Use this order after changes:
1. Typecheck
2. Lint
3. Tests
4. Build (if relevant)

Minimum for root-only changes:
- `deno check main.ts`
- `deno lint`
- `AI_TOKEN="test"; deno test`

Minimum for widget-only changes:
- `cd widget && deno task check`
- `cd widget && deno task lint`
- `cd widget && deno task build`

## Formatting & Style (Root Deno App)
Source of truth is `deno.json`.
- 4-space indentation
- Semicolons required
- Single quotes preferred
- Max line width: 80
- Strict TypeScript enabled

Practical guidance:
- Run `deno fmt` instead of hand-formatting large edits.
- Keep imports explicit with `.ts` extensions for local files.
- Avoid unused imports and dead code.

## TypeScript & Types
- Keep `strict`-compatible code; do not weaken compiler settings.
- Avoid `any`; if unavoidable, constrain scope and document why.
- Prefer narrowing with guards (`instanceof`, `typeof`, custom predicates).
- Use schema validation (`zod`) for untrusted payloads and DB boundaries.
- Model data contracts with explicit interfaces/types near usage sites.

## Database & Config Patterns
- DB layer uses Drizzle + SQLite (`lib/db/*`).
- Reuse existing helpers (`createDb`, `getDb`, `ensureSqlitePragmas`).
- Keep schema changes in `lib/db/schema.ts`; migrations go under `drizzle/`.
- Config mutations should use parser/serializer helpers in `lib/config.ts`.

## Agent Workflow Expectations
- Reuse existing abstractions before creating new ones.
- Do not add new dependencies without explicit user request.
- Do not commit unless explicitly asked.
