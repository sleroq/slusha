---
name: telegram-mini-apps
description: Build and maintain lightweight Solid 2 Telegram mini-apps with shared UI and app-owned navigation and data policy.
---

# Telegram mini-apps

## Start with the application, not a framework

Keep the route tree, authorization presentation, business operations, and cache
policy in the application. Reuse visual primitives and Telegram integration from
`packages/mini-app`. A second bot should not need Slusha's settings types to use a
button, sheet, theme, or native Back button.

Use the existing app as a working example, not a template to copy wholesale.
Extract domain-independent interactions when they have a concrete consumer;
do not build a generic form engine or a cross-bot application runtime.

## Toolchain

- Use a coordinated, exactly pinned Solid 2 RC runtime, `@solidjs/web`, router,
  and `@solidjs/vite-plugin`. Stable Solid 1 adapters are not interchangeable.
- Use `@solidjs/web` for DOM rendering and `jsxImportSource`. Import reactive
  primitives from `solid-js`.
- Verify a real production render after updating the compiler or runtime.
  Type-checking alone does not verify a prerelease compiler integration.
- Inherit Oxlint and the applicable configuration from the official Solid 2
  template. Keep linting separate from TypeScript checking; do not carry over a
  previous framework's ESLint plugins or introduce competing formatter stacks.
  Use `eslint-plugin-solid/configs/v2` through Oxlint's JavaScript plugin support,
  not the Solid 1 lint preset. The reference is
  [Solid's `solid-v2/basic` template](https://github.com/solidjs/templates/tree/main/solid-v2/basic).
- Keep CSS generation at build time. Shared CSS tokens map to Telegram colors
  with readable browser defaults; use system fonts and lightweight inline icons.
- Keep the Deno workspace and production output contract intact: the server
  serves `web/build`, including direct navigation to application routes.
  Reserve `/assets/` for Vite's content-hashed output: it is cached immutably,
  while the HTML document is revalidated so deployments load current entry URLs.

## Responsibility boundaries

| Owner             | Responsibilities                                                                    |
| ----------------- | ----------------------------------------------------------------------------------- |
| Shared UI         | Surfaces, controls, labels, focus behavior, dialogs, loading and error presentation |
| Telegram adapter  | SDK lifecycle, theme and viewport bindings, native capabilities, haptics            |
| Application shell | Routes, history, titles, scroll restoration, modal priority, native button policy   |
| Feature           | Reads, drafts, mutations, validation feedback, domain-specific editors              |
| Wire contract     | Browser-safe request/response schemas and types, without server imports             |
| Server            | Authentication, authorization, authoritative validation, persistence                |

Do not wrap a router or query library merely to rename it. Share a recipe before
sharing an abstraction. The Telegram adapter reports capabilities and accepts
callbacks; it must not decide what saving or navigating Back means.

## Solid 2 reactivity

- Keep reactive props intact rather than destructuring them into stale values.
- Use signals for replaced scalar values and stores for fine-grained mutable
  state. Store setters receive a draft; reconcile server collections by stable ID.
- Effects have tracked computation and untracked application callbacks. Return
  cleanup from the application phase for imperative subscriptions.
- Capture async dependencies before the first `await`.
- Use Solid 2 `Loading` and `Errored` boundaries where async reactivity requires
  them. Do not copy Solid 1 `createResource`, `Suspense`, `onMount`, or store APIs.
- Prefer `if` / `else` to ternary operators, following this repository's style.

## Reads and drafts

Use the query library for caching, deduplication, cancellation, and invalidation;
do not implement those mechanisms again inside a form component. Query keys
describe the data identity, including scope and chat ID where applicable. Query
clients belong to an authenticated application session, not a module-global
singleton shared between users.

Separate the last server snapshot from the editable draft. A refresh may update
the cache, but must not erase unsaved edits. Model resets explicitly rather than
pretending that an inherited value is a new override. Dirty state compares the
draft with its baseline, not with whatever background response arrived last.

Render cached data immediately. Use a scoped skeleton for the first load and a
small, non-blocking indicator for a background refresh. Section/editor navigation
over already-loaded data must not trigger a request. Preserve the draft on errors
and offer an explicit retry. Avoid automatic retries for mutations and permission
failures.

After a successful mutation, use the canonical response to update the snapshot
and cache. Invalidate genuinely dependent data, such as inherited chat settings
after a global edit. Never overwrite a dirty draft as a side effect of invalidation.
Do not describe a failed post-save refresh as a failed write.

## Validation and security

Validate unknown network JSON once at the API boundary using the shared wire
schema. Infer transport types from that schema rather than maintaining a second
handwritten interface. Keep server libraries and secrets out of browser imports.

Keep temporary input text when a user is entering a number; an incomplete or
invalid value should produce an inline message, not silently become zero, null,
or a reset. Validate known text limits and regex syntax close to the input. Keep
reset, empty string, and absent value semantics distinct.

Display structured server field errors beside their fields, and unassigned
errors in an announced, retryable message. Authentication may fail before a JSON
handler runs, so the transport must also handle non-JSON error responses.

The server always rechecks permissions and validates values before writing.
Disabling a control in the UI is not authorization. Do not persist credentials,
configuration drafts, or query caches in browser storage. Development fixtures
must be injected through a test-only entry point, never an auth bypass in the
production entry point.

## Navigation and overlays

Each app owns its route definitions and dirty-navigation policy. Use the router
for browser history; do not replace Telegram's launch-data hash with a hash
router. Direct route loads must reach the SPA document without turning missing
API or asset responses into HTML.

Make browser Back, in-app Back, and Telegram Back coherent. Dismiss the top modal
before leaving its screen. Prompt only when navigation would abandon unsaved
work; navigating between editors in the same draft should remain immediate.
Block abandoning a draft while its save is in progress.

Restore scroll on return, focus a sensible heading on new screens, and restore
the opener after a dialog closes. Use native dialog behavior where supported by
the target WebViews rather than maintaining several independent focus traps.
Every dialog needs an accessible name, a dismissal policy, and scroll ownership.

## Telegram and performance

Mount the SDK once per application and clean up subscriptions, CSS bindings, and
native controls when disposed. Read launch data at the integration boundary;
avoid making unrelated viewport work a prerequisite for starting API reads.
Respect safe areas, keyboard/viewport changes, Telegram themes, and native
button availability. Keep browser fallback controls functional for testing.

Use short opacity/transform transitions without blocking interaction. Respect
reduced motion. Preserve vertical scrolling when a touch starts on a slider.
Do not add animation packages, virtualization, prefetch-all behavior, or code
splitting without a measured need. Small apps can be faster with one small entry
bundle than many sequential chunk requests.

Measure production JS/CSS transfer size and navigation under CPU/network
throttling. Desktop emulation is not proof of Telegram WebView behavior: smoke
test actual Telegram iOS and Android for keyboard, safe areas, slider gestures,
native Back/Save, and light/dark themes.

## Verification

Prefer a few whole-application render/flow tests with controlled API responses
over unit tests for visual components. Exercise the real router, providers,
editors, and transport together. High-value flows include:

- Cold load, cached revisit, delayed response, error, and retry.
- Edit, save the canonical result, reset, and read-only presentation.
- Dirty navigation: stay, discard, and save; include browser Back.
- Invalid user input and server validation feedback without losing the draft.
- Dialog dismissal/focus and reduced-motion behavior.

Run type checks, lint, the production build, and focused backend checks when the
wire contract changes. From the repository root, also run:

```sh
ast-grep scan --config "$HOME/sgconfig.yml" --no-ignore hidden .
```

Report failed or unavailable checks plainly. Keep actual device verification
separate from automated browser results.
