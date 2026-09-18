import { render } from '@solidjs/web';
import type { TelegramAdapter } from '@slusha/mini-app/telegram';
import type { TelegramChrome } from '@slusha/mini-app/telegram';
import { App } from '../src/app/App.tsx';
import '../src/styles.css';

const initialSearch = globalThis.location.search;
globalThis.history.replaceState({}, '', `/${initialSearch}`);

declare global {
    var __settingsChrome: TelegramChrome | undefined;
    var __settingsSuccesses: number | undefined;
    var __settingsBack: (() => void) | undefined;
    var __settingsMain: (() => void) | undefined;
}

function createTestHost(callbacks: {
    onBack: () => void;
    onMain: () => void;
}): TelegramAdapter {
    const adapter: TelegramAdapter = {
        nativeBack: true,
        nativeMain: true,
        mount() {
            return 'test-auth';
        },
        sync(chrome) {
            globalThis.__settingsChrome = chrome;
        },
        notifySuccess() {
            globalThis.__settingsSuccesses =
                (globalThis.__settingsSuccesses ?? 0) + 1;
        },
        dispose() {},
    };
    globalThis.__settingsBack = callbacks.onBack;
    globalThis.__settingsMain = callbacks.onMain;
    return adapter;
}

render(
    () => <App createHost={createTestHost} />,
    document.getElementById('app')!,
);
