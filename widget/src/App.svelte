<script lang="ts">
    import { hapticFeedback } from '@tma.js/sdk';
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

    const controller = createConfigController();

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
    let isSavingGlobal = $state(false);
    let isSavingChat = $state(false);
    let isReloading = $state(false);

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
            let ok = false;
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
        let ok = false;
        try {
            ok = await controller.saveChat();
        } finally {
            isSavingChat = false;
        }
        notifyFromResult(ok);
        showSaveFeedback(ok);

        if (ok) {
            savedChatSignature = chatPayloadSignature;
        }
    };

    const reloadWithFeedback = async () => {
        minorImpact();

        isReloading = true;
        let ok = false;
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
    let globalPayloadSignature = $derived(
        JSON.stringify(buildGlobalPayload(controller.globalConfig, controller.globalText)),
    );
    let overriddenFieldPaths = $derived(collectChatOverridePaths(chatPayloadPreview));
    let hasUnsavedGlobal = $derived(
        savedGlobalSignature !== null && globalPayloadSignature !== savedGlobalSignature,
    );
    let hasUnsavedChat = $derived(
        savedChatSignature !== null && chatPayloadSignature !== savedChatSignature,
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
        });
    });

    onMount(() => {
        try {
            init();
            controller.initialize();
        } catch (error) {
            launchError = error instanceof Error
                ? error.message
                : 'Unable to initialize Telegram Mini App context.';
        }
    });

    onDestroy(() => {
        clearSaveFeedbackTimer();
        controller.dispose();
    });
</script>

{#if launchError}
    <main class="relative isolate min-h-screen overflow-hidden bg-slate-950 px-4 py-10 text-slate-100">
        <div class="pointer-events-none absolute -top-28 left-1/2 h-80 w-80 -translate-x-1/2 rounded-full bg-cyan-500/35 blur-3xl"></div>
        <div class="pointer-events-none absolute right-0 top-1/3 h-56 w-56 rounded-full bg-emerald-400/25 blur-3xl"></div>

        <section class="relative mx-auto flex max-w-xl flex-col gap-6 py-2">
            <p class="text-xs uppercase tracking-[0.2em] text-cyan-300/90">Slusha Telegram bot</p>
            <h1 class="text-3xl font-semibold leading-tight text-white">This page works inside Telegram Mini App</h1>
            <p class="text-sm leading-6 text-slate-300">
                Slusha is a Telegram AI bot with per-chat configuration, character support, and rich media handling.
                Open this widget through Telegram to load your chat-specific settings.
            </p>

            <div class="border-y border-amber-300/40 py-3 text-xs text-amber-100">
                <p class="font-medium">Telegram context was not detected.</p>
                <p class="mt-1 opacity-90">{launchError}</p>
            </div>

            <div class="grid gap-2 border-t border-white/10 pt-4 text-sm text-slate-200">
                <p>
                    Start bot: <a class="text-cyan-300 underline decoration-cyan-400/70 underline-offset-3 hover:text-cyan-200" href="https://t.me/sl_chatbot" target="_blank" rel="noreferrer">@sl_chatbot</a>
                </p>
                <p>
                    Quotes channel: <a class="text-cyan-300 underline decoration-cyan-400/70 underline-offset-3 hover:text-cyan-200" href="https://t.me/s/slushaquotes" target="_blank" rel="noreferrer">@slushaquotes</a>
                </p>
                <p class="text-slate-400">Then run <span class="rounded bg-white/10 px-1.5 py-0.5 font-mono text-[0.78rem]">/config</span> in your chat.</p>
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
            onReload={reloadWithFeedback}
            isReloading={isReloading}
            isLoading={controller.isLoading}
        />

        <section class="space-y-3 border-t pt-6">
            <label class="text-sm font-medium text-muted-foreground" for="settings-search">Search settings</label>
            <Input
                id="settings-search"
                type="search"
                bind:value={settingsSearch}
                placeholder="Search by section or setting name"
                autocomplete="off"
            />
        </section>

        <section class="border-t pt-6" aria-busy={isBusy}>
            {#if controller.isLoading && !controller.bootstrap}
                <div class="space-y-4 rounded-lg border bg-muted/20 p-4" role="status" aria-live="polite">
                    <div class="h-5 w-44 animate-pulse rounded bg-muted"></div>
                    <div class="h-9 w-full animate-pulse rounded bg-muted/80"></div>
                    <div class="h-9 w-full animate-pulse rounded bg-muted/80"></div>
                    <div class="h-9 w-full animate-pulse rounded bg-muted/80"></div>
                    <p class="text-sm text-muted-foreground">Loading configuration...</p>
                </div>
            {:else}
                {#key controller.scope}
                    <div in:fly={{ y: 8, duration: 160 }} out:fade={{ duration: 120 }}>
                        {#if controller.scope === 'global' && controller.canViewGlobal}
                            <GlobalConfigForm
                                bind:config={controller.globalConfig}
                                bind:text={controller.globalText}
                                availableModels={controller.availableModels}
                                searchQuery={settingsSearch}
                            />
                        {:else}
                            <ChatOverrideForm
                                bind:config={controller.chatOverrideConfig}
                                bind:text={controller.chatText}
                                availableModels={controller.availableModels}
                                currentCharacter={controller.currentCharacter}
                                canConfigureTrustedSettings={controller.canConfigureTrustedSettings}
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
                    {controller.scope === 'global' ? 'Saving global...' : 'Saving chat override...'}
                {:else}
                    {controller.scope === 'global' ? 'Save global' : 'Save chat override'}
                {/if}
            </Button>
        </div>
    </div>
{/if}

{#if saveFeedback}
    <div class="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex justify-center px-4" transition:fade={{ duration: 180 }}>
        <div
            class={`pointer-events-auto w-full max-w-md rounded-md border px-4 py-3 text-sm shadow-lg ${saveFeedback.kind === 'success' ? 'border-emerald-500/40 bg-emerald-50 text-emerald-900' : 'border-rose-500/40 bg-rose-50 text-rose-900'}`}
            role="status"
            aria-live="polite"
        >
            {saveFeedback.message}
        </div>
    </div>
{/if}
