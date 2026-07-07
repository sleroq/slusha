<script lang="ts">
    import { hapticFeedback, themeParams } from '@tma.js/sdk';
    import { init } from '@tma.js/sdk-svelte';
    import { onDestroy, onMount } from 'svelte';
    import ConfigToolbar from '$lib/components/config/ConfigToolbar.svelte';
    import GlobalConfigForm from '$lib/components/config/GlobalConfigForm.svelte';
    import { createConfigController } from '$lib/config/controller.svelte';
    import { Input } from '$lib/components/ui/input';
    import { setI18nContext } from '$lib/i18n/context.svelte';

    const controller = createConfigController();
    const t = setI18nContext(() => controller.locale);

    let settingsSearch = $state('');
    let launchError = $state<string | null>(null);
    let isReloading = $state(false);
    let detachThemeListener: (() => void) | undefined;

    type TelegramWebApp = {
        colorScheme?: 'light' | 'dark';
        onEvent?: (eventType: 'themeChanged', callback: () => void) => void;
        offEvent?: (eventType: 'themeChanged', callback: () => void) => void;
    };

    const getTelegramWebApp = (): TelegramWebApp | undefined => {
        if (typeof window === 'undefined') {
            return undefined;
        }

        return (window as Window & { Telegram?: { WebApp?: TelegramWebApp } }).Telegram?.WebApp;
    };

    const isDarkFromHexColor = (color: string): boolean => {
        const normalized = color.trim();
        if (!/^#([A-Fa-f\d]{6})$/.test(normalized)) {
            return false;
        }

        const red = Number.parseInt(normalized.slice(1, 3), 16);
        const green = Number.parseInt(normalized.slice(3, 5), 16);
        const blue = Number.parseInt(normalized.slice(5, 7), 16);
        const luminance = (0.299 * red + 0.587 * green + 0.114 * blue) / 255;
        return luminance < 0.5;
    };

    const syncDarkClass = (): void => {
        const telegramWebApp = getTelegramWebApp();
        if (telegramWebApp?.colorScheme) {
            document.documentElement.classList.toggle('dark', telegramWebApp.colorScheme === 'dark');
            return;
        }

        const backgroundColor = getComputedStyle(document.documentElement)
            .getPropertyValue('--tg-theme-bg-color')
            .trim();
        document.documentElement.classList.toggle('dark', isDarkFromHexColor(backgroundColor));
    };

    const setupTelegramTheme = (): void => {
        try {
            themeParams.mount();
            themeParams.bindCssVars();
        } catch {
            // Keep defaults when theme API is unavailable.
        }

        syncDarkClass();

        const telegramWebApp = getTelegramWebApp();
        if (!telegramWebApp?.onEvent || !telegramWebApp.offEvent) {
            return;
        }

        const handleThemeChanged = (): void => {
            syncDarkClass();
        };

        telegramWebApp.onEvent('themeChanged', handleThemeChanged);
        detachThemeListener = () => {
            telegramWebApp.offEvent?.('themeChanged', handleThemeChanged);
        };
    };

    const hapticsSupported = () => hapticFeedback.isSupported();

    const notifySuccess = () => {
        if (!hapticsSupported()) {
            return;
        }

        hapticFeedback.notificationOccurred('success');
    };

    const notifyError = () => {
        if (!hapticsSupported()) {
            return;
        }

        hapticFeedback.notificationOccurred('error');
    };

    const minorImpact = () => {
        if (!hapticsSupported()) {
            return;
        }

        hapticFeedback.impactOccurred('light');
    };

    const notifyFromResult = (ok: boolean) => {
        if (ok) {
            notifySuccess();
            return;
        }

        notifyError();
    };

    const reloadWithFeedback = async () => {
        minorImpact();

        isReloading = true;
        let ok: boolean;
        try {
            ok = await controller.loadBootstrap();
        } finally {
            isReloading = false;
        }
        notifyFromResult(ok);
    };

    let isBusy = $derived(isReloading || controller.isLoading);

    onMount(() => {
        try {
            init();
            if (!controller.ensureInitDataRaw()) {
                launchError = t('app.launchContextMissing');
                return;
            }

            controller.initialize();
            setupTelegramTheme();
        } catch (error) {
            launchError = error instanceof Error
                ? error.message
                : 'Unable to initialize Telegram Mini App context.';
        }
    });

    onDestroy(() => {
        detachThemeListener?.();
        detachThemeListener = undefined;
        controller.dispose();
    });
</script>

{#if launchError}
    <main class="min-h-screen bg-background px-4 py-10 text-foreground">
        <section class="mx-auto flex max-w-xl flex-col gap-6 rounded-xl border bg-card p-6 shadow-xs">
            <p class="text-xs uppercase tracking-[0.16em] text-muted-foreground">{t('app.launchBadge')}</p>
            <h1 class="text-3xl font-semibold leading-tight text-foreground">{t('app.launchTitle')}</h1>
            <p class="text-sm leading-6 text-muted-foreground">
                {t('app.launchDescription')}
            </p>

            <div class="rounded-md border border-destructive/35 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                <p class="font-medium text-foreground">{t('app.launchContextMissing')}</p>
                <p class="mt-1">{launchError}</p>
            </div>

            <div class="grid gap-2 pt-4 text-sm text-foreground">
                <p>
                    {t('app.launchStartBot')} <a class="text-primary underline decoration-primary/60 underline-offset-3 hover:text-primary/85" href="https://t.me/sl_chatbot" target="_blank" rel="noreferrer">@sl_chatbot</a>
                </p>
                <p>
                    {t('app.launchQuotes')} <a class="text-primary underline decoration-primary/60 underline-offset-3 hover:text-primary/85" href="https://t.me/s/slushaquotes" target="_blank" rel="noreferrer">@slushaquotes</a>
                </p>
                <p class="text-muted-foreground">{t('app.launchRunConfig')}</p>
            </div>
        </section>
    </main>
{:else}
    <main class="mx-auto max-w-3xl space-y-8 p-4 pb-28 md:p-6 md:pb-32">
        <ConfigToolbar
            status={controller.status}
            role={controller.role}
            onReload={reloadWithFeedback}
            isReloading={isReloading}
            isLoading={controller.isLoading}
        />

        <section class="space-y-3 pt-6">
            <label class="text-sm font-medium text-muted-foreground" for="settings-search">{t('app.searchSettings')}</label>
            <Input
                id="settings-search"
                type="search"
                bind:value={settingsSearch}
                placeholder={t('app.searchSettingsPlaceholder')}
                autocomplete="off"
            />
        </section>

        <section class="relative min-h-96 pt-6" aria-busy={isBusy}>
            {#if controller.isLoading && !controller.bootstrap}
                <div class="space-y-4 rounded-lg border bg-muted/20 p-4" role="status" aria-live="polite">
                    <div class="h-5 w-44 animate-pulse rounded bg-muted"></div>
                    <div class="h-9 w-full animate-pulse rounded bg-muted/80"></div>
                    <div class="h-9 w-full animate-pulse rounded bg-muted/80"></div>
                    <div class="h-9 w-full animate-pulse rounded bg-muted/80"></div>
                    <p class="text-sm text-muted-foreground">{t('app.loadingConfiguration')}</p>
                </div>
            {:else}
                <div class="relative">
                    {#if controller.isLoading && controller.bootstrap}
                        <div class="pointer-events-none absolute inset-0 z-20 rounded-lg bg-background/60 backdrop-blur-[1px]"></div>
                    {/if}

                    {#if controller.canViewGlobal}
                        <div hidden={controller.scope !== 'global'} aria-hidden={controller.scope !== 'global'}>
                            <GlobalConfigForm
                                bind:config={controller.globalConfig}
                                bind:text={controller.globalText}
                                availableModels={controller.availableModels}
                                availableReactions={controller.availableReactions}
                                isAdmin={controller.role === 'admin'}
                                searchQuery={settingsSearch}
                            />
                        </div>
                    {:else}
                        <p class="rounded-lg border bg-card p-4 text-sm text-muted-foreground">
                            {t('status.readOnlyGlobal')}
                        </p>
                    {/if}
                </div>
            {/if}
        </section>
    </main>

{/if}
