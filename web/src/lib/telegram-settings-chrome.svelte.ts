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
} from '@tma.js/sdk-svelte';

export function createTelegramSettingsChrome(callbacks: {
    onback: () => void;
    onmain: () => void;
}) {
    const cleanups: VoidFunction[] = [];
    let disposed = false;
    let nativeBack = $state(false);
    let nativeMain = $state(false);

    async function initialize() {
        cleanups.push(init());
        initData.restore();
        const auth = initData.raw() ?? '';

        themeParams.mount.ifAvailable();
        const themeBinding = themeParams.bindCssVars.ifAvailable();
        if (themeBinding.ok) cleanups.push(themeBinding.data);
        cleanups.push(themeParams.isDark.sub((isDark) => {
            document.documentElement.style.colorScheme = isDark ? 'dark' : 'light';
        }));

        miniApp.mount.ifAvailable();
        miniApp.setBgColor.ifAvailable('secondary_bg_color');
        miniApp.setHeaderColor.ifAvailable('secondary_bg_color');
        miniApp.setBottomBarColor.ifAvailable('bottom_bar_bg_color');

        const viewportMount = viewport.mount.ifAvailable();
        if (viewportMount.ok) await viewportMount.data;
        if (disposed) return auth;
        const viewportBinding = viewport.bindCssVars.ifAvailable();
        if (viewportBinding.ok) cleanups.push(viewportBinding.data);
        viewport.expand.ifAvailable();

        closingBehavior.mount.ifAvailable();
        closingBehavior.disableConfirmation.ifAvailable();

        if (backButton.mount.isAvailable()) {
            backButton.mount();
            nativeBack = true;
            const listener = backButton.onClick.ifAvailable(callbacks.onback);
            if (listener.ok) cleanups.push(listener.data);
        }
        if (mainButton.mount.isAvailable()) {
            mainButton.mount();
            nativeMain = true;
            const listener = mainButton.onClick.ifAvailable(callbacks.onmain);
            if (listener.ok) cleanups.push(listener.data);
        }

        miniApp.ready.ifAvailable();
        return auth;
    }

    function syncClosingConfirmation(hasChanges: boolean) {
        if (hasChanges) closingBehavior.enableConfirmation.ifAvailable();
        else closingBehavior.disableConfirmation.ifAvailable();
    }

    function syncBackButton(available: boolean) {
        if (!nativeBack) return;
        if (available) backButton.show.ifAvailable();
        else backButton.hide.ifAvailable();
    }

    function syncMainButton(label: string, changeCount: number, saving: boolean) {
        if (!nativeMain) return;
        mainButton.setParams.ifAvailable({
            text: label,
            isVisible: changeCount > 0,
            isEnabled: changeCount > 0 && !saving,
            isLoaderVisible: saving,
        });
    }

    function notifySaveSuccess() {
        hapticFeedback.notificationOccurred.ifAvailable('success');
    }

    function dispose() {
        if (disposed) return;
        disposed = true;
        closingBehavior.disableConfirmation.ifAvailable();
        mainButton.hide.ifAvailable();
        backButton.hide.ifAvailable();
        for (const cleanup of cleanups.reverse()) cleanup();
        if (mainButton.isMounted()) mainButton.unmount();
        if (backButton.isMounted()) backButton.unmount();
        if (closingBehavior.isMounted()) closingBehavior.unmount();
        if (miniApp.isMounted()) miniApp.unmount();
        if (themeParams.isMounted()) themeParams.unmount();
        document.documentElement.style.colorScheme = '';
    }

    return {
        get nativeBack() { return nativeBack; },
        get nativeMain() { return nativeMain; },
        initialize,
        syncClosingConfirmation,
        syncBackButton,
        syncMainButton,
        notifySaveSuccess,
        dispose,
    };
}
