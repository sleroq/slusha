# AGENTS.md

Deno-first monorepo: the Telegram bot/backend lives at the root (`main.ts`,
`lib/`, `scripts/`); the Telegram Mini App widget lives in `widget/` (Svelte 5
+ Vite). There is no npm `package.json`; dependency maps and tasks are in
`deno.json` files.

## Navigation

- Startup flow: `main.ts` wires migrations, memory, bot setup, web server,
  middleware, schedulers, and shutdown.
- Telegram handlers/commands: `lib/telegram/`.
- AI prompt/context/model code: `lib/ai/`.
- Web API and widget serving: `lib/web/`; route matching is centralized in
  `lib/web/routes.ts`.
- Persistence: Drizzle schema in `lib/db/schema.ts`, migrations in `drizzle/`,
  applied on boot by `lib/db/migrate.ts`.
- Widget config UI: `widget/src/lib/components/config/`; shared UI wrappers in
  `widget/src/lib/components/ui/`.

## Commands

Root checks: `deno check --allow-import main.ts`, `deno lint`,
`AI_TOKEN="test" deno test -A`. Use `deno fmt` for formatting and
`scripts/run.bash` for a long-running local bot.

Widget checks, from `widget/`: `deno task check`, `deno task lint`,
`deno task build`. Use `deno task dev` for the long-running Vite dev server.

## Conventions / non-obvious notes

- Verify in this order when relevant: typecheck, lint, tests, build.
- Add root dependencies to the root `deno.json`; add widget dependencies/tasks to
  `widget/deno.json`.
- For DB changes, update `lib/db/schema.ts` and add a matching migration under
  `drizzle/`; migrations are runtime startup behavior, not a separate app step.
- For metrics, keep labels low-cardinality; use route templates, never user/chat
  IDs.
- Widget code uses Svelte 5 runes. ESLint enforces
  `svelte/prefer-svelte-reactivity`, so avoid mutable `Set`/`Map` component
  state unless using Svelte-reactive alternatives.
- Prefer the Bits UI wrappers in `widget/src/lib/components/ui/` over raw form
  controls when a wrapper exists; selects in particular live under
  `widget/src/lib/components/ui/select`.
- Keep this file for orientation and durable conventions only. If you learn a
  non-obvious convention that would speed up future work, add it here; keep
  runtime feature lists and one-off facts in README or code comments instead.
