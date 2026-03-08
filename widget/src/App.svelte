<script lang="ts">
    import { hapticFeedback, themeParams } from '@tma.js/sdk';
    import { init } from '@tma.js/sdk-svelte';
    import { fade, fly } from 'svelte/transition';
    import { onDestroy, onMount, untrack } from 'svelte';
    import ChatOverrideForm from '$lib/components/config/ChatOverrideForm.svelte';
    import ConfigToolbar from '$lib/components/config/ConfigToolbar.svelte';
    import { buildChatPayload, buildGlobalPayload, collectChatOverridePaths } from '$lib/config/model';
    import GlobalConfigForm from '$lib/components/config/GlobalConfigForm.svelte';
    import { createConfigController } from '$lib/config/controller.svelte';
    import { Button } from '$lib/components/ui/button';
    import { Input } from '$lib/components/ui/input';
    import { setI18nContext } from '$lib/i18n/context.svelte';

    const controller = createConfigController();
    const t = setI18nContext(() => controller.locale);

    type SaveFeedback = {
        kind: 'success' | 'error';
        message: string;
    };

    let saveFeedback = $state<SaveFeedback | null>(null);
    let saveFeedbackTimer: ReturnType<typeof setTimeout> | undefined;
    let settingsSearch = $state('');
    let launchError = $state<string | null>(null);
    let savedGlobalSignature = $state<string | null>(null);
    let savedChatSignature = $state<string | null>(null);
    let savedChatInternalsSignature = $state<string | null>(null);
    let isSavingGlobal = $state(false);
    let isSavingChat = $state(false);
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

    const clearSaveFeedbackTimer = () => {
        if (!saveFeedbackTimer) {
            return;
        }

        clearTimeout(saveFeedbackTimer);
        saveFeedbackTimer = undefined;
    };

    const showSaveFeedback = (ok: boolean) => {
        saveFeedback = {
            kind: ok ? 'success' : 'error',
            message: controller.status,
        };

        clearSaveFeedbackTimer();
        saveFeedbackTimer = setTimeout(() => {
            saveFeedback = null;
            saveFeedbackTimer = undefined;
        }, 2400);
    };

    const saveScopeWithFeedback = async () => {
        if (controller.scope === 'global') {
            isSavingGlobal = true;
            let ok: boolean;
            try {
                ok = await controller.saveGlobal();
            } finally {
                isSavingGlobal = false;
            }
            notifyFromResult(ok);
            showSaveFeedback(ok);

            if (ok) {
                savedGlobalSignature = globalPayloadSignature;
            }

            return;
        }

        isSavingChat = true;
        let ok: boolean;
        try {
            ok = await controller.saveChat();
            if (ok && controller.canEditChatInternals) {
                ok = await controller.saveInternals();
            }
        } finally {
            isSavingChat = false;
        }
        notifyFromResult(ok);
        showSaveFeedback(ok);

        if (ok) {
            savedChatSignature = chatPayloadSignature;
            savedChatInternalsSignature = chatInternalsSignature;
        }
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

    let chatPayloadPreview = $derived(
        buildChatPayload(
            controller.chatOverrideConfig,
            controller.chatText,
            controller.chatBaseConfig,
        ),
    );
    let chatPayloadSignature = $derived(JSON.stringify(chatPayloadPreview));
    let chatInternalsSignature = $derived(JSON.stringify(controller.chatInternals));
    let globalPayloadSignature = $derived(
        JSON.stringify(buildGlobalPayload(controller.globalConfig, controller.globalText)),
    );
    let overriddenFieldPaths = $derived(collectChatOverridePaths(chatPayloadPreview));
    let hasUnsavedGlobal = $derived(
        savedGlobalSignature !== null && globalPayloadSignature !== savedGlobalSignature,
    );
    let hasUnsavedChat = $derived(
        savedChatSignature !== null &&
            (chatPayloadSignature !== savedChatSignature ||
                (controller.canEditChatInternals &&
                    savedChatInternalsSignature !== null &&
                    chatInternalsSignature !== savedChatInternalsSignature)),
    );
    let activeHasUnsavedChanges = $derived(
        controller.scope === 'global' ? hasUnsavedGlobal : hasUnsavedChat,
    );
    let activeCanSave = $derived(
        controller.scope === 'global' ? controller.canSaveGlobal : controller.canSaveChat,
    );
    let activeIsSaving = $derived(controller.scope === 'global' ? isSavingGlobal : isSavingChat);
    let isBusy = $derived(activeIsSaving || isReloading || controller.isLoading);

    $effect(() => {
        const bootstrap = controller.bootstrap;
        if (!bootstrap) {
            return;
        }

        untrack(() => {
            savedGlobalSignature = globalPayloadSignature;
            savedChatSignature = chatPayloadSignature;
            savedChatInternalsSignature = chatInternalsSignature;
        });
    });

    onMount(() => {
        try {
            init();
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
        clearSaveFeedbackTimer();
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
            bind:scope={controller.scope}
            bind:chatId={controller.chatId}
            status={controller.status}
            canViewGlobal={controller.canViewGlobal}
            role={controller.role}
            availableChats={controller.availableChats}
            usageWindowStatus={controller.usageWindowStatus}
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

        <section class="pt-6" aria-busy={isBusy}>
            {#if controller.isLoading && !controller.bootstrap}
                <div class="space-y-4 rounded-lg border bg-muted/20 p-4" role="status" aria-live="polite">
                    <div class="h-5 w-44 animate-pulse rounded bg-muted"></div>
                    <div class="h-9 w-full animate-pulse rounded bg-muted/80"></div>
                    <div class="h-9 w-full animate-pulse rounded bg-muted/80"></div>
                    <div class="h-9 w-full animate-pulse rounded bg-muted/80"></div>
                    <p class="text-sm text-muted-foreground">{t('app.loadingConfiguration')}</p>
                </div>
            {:else}
                {#key controller.scope}
                    <div in:fly={{ y: 8, duration: 160 }} out:fade={{ duration: 120 }}>
                        {#if controller.scope === 'global' && controller.canViewGlobal}
                            <GlobalConfigForm
                                bind:config={controller.globalConfig}
                                bind:text={controller.globalText}
                                availableModels={controller.availableModels}
                                availableReactions={controller.availableReactions}
                                isAdmin={controller.role === 'admin'}
                                searchQuery={settingsSearch}
                            />
                        {:else}
                            <ChatOverrideForm
                                bind:config={controller.chatOverrideConfig}
                                bind:text={controller.chatText}
                                baseConfig={controller.chatBaseConfig}
                                availableModels={controller.availableModels}
                                availableReactions={controller.availableReactions}
                                chatInternals={controller.chatInternals}
                                currentCharacter={controller.currentCharacter}
                                canEditChatInternals={controller.canEditChatInternals}
                                canConfigureTrustedSettings={controller.canConfigureTrustedSettings}
                                canEditWindowOverrides={controller.role === 'admin'}
                                overriddenFieldPaths={overriddenFieldPaths}
                                searchQuery={settingsSearch}
                            />
                        {/if}
                    </div>
                {/key}
            {/if}
        </section>
    </main>

    <div class="pointer-events-none fixed bottom-4 right-4 z-40">
        <div class="pointer-events-auto flex flex-col items-end gap-2">
            <Button
                class="min-w-40 shadow-lg"
                variant={activeHasUnsavedChanges ? 'default' : 'outline'}
                onclick={saveScopeWithFeedback}
                disabled={isBusy || !activeCanSave || !activeHasUnsavedChanges}
                aria-busy={activeIsSaving}
            >
                {#if activeIsSaving}
                    {controller.scope === 'global' ? t('app.savingGlobal') : t('app.savingChat')}
                {:else}
                    {controller.scope === 'global' ? t('app.saveGlobal') : t('app.saveChat')}
                {/if}
            </Button>
        </div>
    </div>
{/if}

{#if saveFeedback}
    <div class="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex justify-center px-4" transition:fade={{ duration: 180 }}>
        <div
            class={`pointer-events-auto w-full max-w-md rounded-md border px-4 py-3 text-sm shadow-lg ${saveFeedback.kind === 'success' ? 'border-[var(--success-border)] bg-[var(--success-bg)] text-foreground' : 'border-[var(--danger-border)] bg-[var(--danger-bg)] text-foreground'}`}
            role="status"
            aria-live="polite"
        >
            {saveFeedback.message}
        </div>
    </div>
{/if}
