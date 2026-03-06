# AGENTS.md

Deno-first monorepo with:
- root app (`main.ts`, `lib/`, `scripts/`)
- widget app (`widget/`, Svelte 5 + Vite)

## Root Commands (run from repo root)
- Typecheck: `deno check --allow-import main.ts`
- Lint: `deno lint`
- Format check: `deno fmt --check`
- Format fix: `deno fmt`
- Tests (all): `AI_TOKEN="test" deno test -A`
- Tests (single file): `AI_TOKEN="test" deno test -A lib/helpers_test.ts`
- Tests (single test): `AI_TOKEN="test" deno test -A lib/helpers_test.ts --filter "splitMessage - handles newlines as natural break points"`
- Dev run: `scripts/run.bash` (long-running)
- Build binaries: `scripts/build.bash`
- Build widget assets: `scripts/build-widget.bash`

## Widget Commands (run from `widget/`)
- Dev server: `deno task dev` (long-running)
- Typecheck: `deno task check`
- Lint: `deno task lint`
- Lint (Deno only): `deno task lint:deno`
- Lint (ESLint only): `deno task lint:eslint`
- Build: `deno task build`
- Preview: `deno task preview` (long-running)

## Verification Order
1. Typecheck
2. Lint
3. Tests
4. Build (if relevant)

Minimum gates:
- Root-only: `deno check --allow-import main.ts` + `deno lint` + `AI_TOKEN="test" deno test -A`
- Widget-only: `deno task check` + `deno task lint` + `deno task build`

## A note to the agent

We are building this together. When you learn something non-obvious but actually important to know for future tasks, add it to the AGENTS.md file of the corresponding project so future changes can go faster.

## Learned notes

- Widget ESLint enables `svelte/prefer-svelte-reactivity`: avoid creating mutable `Set`/`Map` instances inside component scripts unless using Svelte reactive alternatives.
- Widget uses Bits UI select wrappers in `widget/src/lib/components/ui/select`: prefer those over native `<select>` for mobile UX; use `onValueChange` for side effects like reload-on-select.
