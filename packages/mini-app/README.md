# Shared mini-app UI

A local source package for Solid 2 Telegram mini-apps. Use explicit entry points
so apps can consume controls without importing the Telegram adapter:

```tsx
import { Button, Surface } from '@slusha/mini-app/ui';
import '@slusha/mini-app/styles';

export function Welcome() {
    return (
        <Surface>
            <Button onClick={() => console.log('Continue')}>Continue</Button>
        </Surface>
    );
}
```

## Build integration

- Add the package as a workspace dependency. Solid and `@solidjs/web` are peer
  dependencies and must match the application's Solid 2 RC cohort.
- Compile the exported TSX with `@solidjs/vite-plugin`.
- Process the stylesheet with Tailwind 4 and `@tailwindcss/forms`, using
  `@tailwindcss/vite`. There is no runtime styling dependency.
- Import the stylesheet once. It supplies theme tokens, safe-area variables,
  focus/pressed states, reduced-motion rules, and control styles.

## Telegram host

`@slusha/mini-app/telegram` exports `createTelegramAdapter`, `TelegramAdapter`,
and `TelegramChrome`. Create one adapter per application lifetime with Back/Main
callbacks, mount it, synchronize the application's desired chrome state, and
dispose it with the owning Solid scope. Use capability flags to decide whether
browser fallback buttons are needed.

The adapter owns SDK details, not navigation or saving. Its main-button state
contains text, visibility, enabled state, and progress; closing confirmation and
Back visibility are separate explicit decisions. Applications retain their own
routes, query clients, mutation policy, and dirty-navigation guards.

`DialogSheet` owns native dialog accessibility and focus restoration.
`dismissTopDialog`, `hasOpenDialog`, and `DIALOG_CHANGE_EVENT` allow an app shell
to coordinate Back with nested dialogs without putting a router in the library.

Slusha's schemas, settings metadata, regex editors, and permissions are not part
of this package. See the shared
[mini-app development guide](../../docs/mini-apps/SKILL.md) for the full recipe.
