import {
    backButton,
    closingBehavior,
    hapticFeedback,
    init,
    initData,
    mainButton,
    miniApp,
    themeParams,
    viewport,
} from '@tma.js/sdk';

export type TelegramChrome = {
    confirmClosing: boolean;
    backVisible: boolean;
    main: {
        text: string;
        visible: boolean;
        enabled: boolean;
        loading: boolean;
    };
};

export interface TelegramAdapter {
    mount(): string | Promise<string>;
    sync(chrome: TelegramChrome): void;
    notifySuccess(): void;
    dispose(): void;
    readonly nativeBack: boolean;
    readonly nativeMain: boolean;
}

export function createTelegramAdapter(
    callbacks: { onBack: () => void; onMain: () => void },
): TelegramAdapter {
    const cleanups: VoidFunction[] = [];
    let disposed = false;
    let mounted = false;
    let nativeBack = false;
    let nativeMain = false;
    let previousColorScheme: string | undefined;

    function bindTheme() {
        previousColorScheme = document.documentElement.style.colorScheme;
        const applyColorScheme = (isDark: boolean) => {
            if (isDark) {
                document.documentElement.style.colorScheme = 'dark';
            } else {
                document.documentElement.style.colorScheme = 'light';
            }
        };
        applyColorScheme(themeParams.isDark());
        cleanups.push(themeParams.isDark.sub(applyColorScheme));
    }

    function mount() {
        if (mounted) return initData.raw() ?? '';
        mounted = true;

        let cleanupInit: VoidFunction;
        try {
            cleanupInit = init();
        } catch {
            mounted = false;
            throw new Error('Open this app in Telegram to continue.');
        }
        cleanups.push(cleanupInit);

        try {
            initData.restore();
        } catch {
            mounted = false;
            dispose();
            throw new Error('Open this app in Telegram to continue.');
        }
        const auth = initData.raw() ?? '';
        if (!auth) {
            mounted = false;
            dispose();
            throw new Error('Open this app in Telegram to continue.');
        }
        themeParams.mount.ifAvailable();
        bindTheme();
        const themeBinding = themeParams.bindCssVars.ifAvailable();
        if (themeBinding.ok) cleanups.push(themeBinding.data);

        miniApp.mount.ifAvailable();
        const miniAppBinding = miniApp.bindCssVars.ifAvailable();
        if (miniAppBinding.ok) cleanups.push(miniAppBinding.data);
        miniApp.setHeaderColor.ifAvailable('secondary_bg_color');
        miniApp.setBgColor.ifAvailable('secondary_bg_color');
        miniApp.setBottomBarColor.ifAvailable('bottom_bar_bg_color');
        miniApp.ready.ifAvailable();
        closingBehavior.mount.ifAvailable();

        if (backButton.mount.isAvailable()) {
            backButton.mount();
            nativeBack = true;
            const listener = backButton.onClick.ifAvailable(callbacks.onBack);
            if (listener.ok) cleanups.push(listener.data);
        }
        if (mainButton.mount.isAvailable()) {
            mainButton.mount();
            nativeMain = true;
            const listener = mainButton.onClick.ifAvailable(callbacks.onMain);
            if (listener.ok) cleanups.push(listener.data);
        }

        const viewportMount = viewport.mount.ifAvailable();
        if (viewportMount.ok) {
            void Promise.resolve(viewportMount.data).then(() => {
                if (disposed) return;
                const binding = viewport.bindCssVars.ifAvailable();
                if (binding.ok) cleanups.push(binding.data);
                viewport.expand.ifAvailable();
            }).catch(() => {
                // Viewport support is optional and must not prevent config loading.
            });
        }
        return auth;
    }

    function sync(chrome: TelegramChrome) {
        if (chrome.confirmClosing) {
            closingBehavior.enableConfirmation.ifAvailable();
        } else closingBehavior.disableConfirmation.ifAvailable();

        if (nativeBack) {
            if (chrome.backVisible) backButton.show.ifAvailable();
            else backButton.hide.ifAvailable();
        }
        if (nativeMain) {
            mainButton.setParams.ifAvailable({
                text: chrome.main.text,
                isVisible: chrome.main.visible,
                isEnabled: chrome.main.enabled,
                isLoaderVisible: chrome.main.loading,
            });
        }
    }

    function notifySuccess() {
        hapticFeedback.notificationOccurred.ifAvailable('success');
    }

    function dispose() {
        if (disposed) return;
        disposed = true;
        closingBehavior.disableConfirmation.ifAvailable();
        if (nativeBack) backButton.hide.ifAvailable();
        if (nativeMain) {
            mainButton.disable.ifAvailable();
            mainButton.hide.ifAvailable();
        }
        for (const cleanup of cleanups.reverse()) cleanup();
        if (mainButton.isMounted()) mainButton.unmount();
        if (backButton.isMounted()) backButton.unmount();
        if (closingBehavior.isMounted()) closingBehavior.unmount();
        if (miniApp.isMounted()) miniApp.unmount();
        if (themeParams.isMounted()) themeParams.unmount();
        if (previousColorScheme !== undefined) {
            document.documentElement.style.colorScheme = previousColorScheme;
        }
        nativeBack = false;
        nativeMain = false;
    }

    return {
        mount,
        sync,
        notifySuccess,
        dispose,
        get nativeBack() {
            return nativeBack;
        },
        get nativeMain() {
            return nativeMain;
        },
    };
}
