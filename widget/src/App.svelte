<script lang="ts">
    import { hapticFeedback } from '@tma.js/sdk';
    import { init } from '@tma.js/sdk-svelte';
    import { onDestroy, onMount } from 'svelte';
    import ChatOverrideForm from '$lib/components/config/ChatOverrideForm.svelte';
    import ConfigToolbar from '$lib/components/config/ConfigToolbar.svelte';
    import GlobalConfigForm from '$lib/components/config/GlobalConfigForm.svelte';
    import { createConfigController } from '$lib/config/controller.svelte';

    const controller = createConfigController();

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

    const saveGlobalWithFeedback = async () => {
        const ok = await controller.saveGlobal();
        notifyFromResult(ok);
    };

    const saveChatWithFeedback = async () => {
        const ok = await controller.saveChat();
        notifyFromResult(ok);
    };

    const reloadWithFeedback = async () => {
        minorImpact();

        const ok = await controller.loadBootstrap();
        notifyFromResult(ok);
    };

    onMount(() => {
        init();
        controller.initialize();
    });

    onDestroy(() => {
        controller.dispose();
    });
</script>

<main class="mx-auto max-w-6xl space-y-4 p-4">
    <ConfigToolbar
        bind:scope={controller.scope}
        bind:chatId={controller.chatId}
        status={controller.status}
        canViewGlobal={controller.canViewGlobal}
        role={controller.role}
        categories={controller.categories}
        availableChats={controller.availableChats}
        onReload={reloadWithFeedback}
    />

    {#if controller.scope === 'global' && controller.canViewGlobal}
        <GlobalConfigForm
            bind:config={controller.globalConfig}
            bind:text={controller.globalText}
            availableModels={controller.availableModels}
            canSave={controller.canSaveGlobal}
            onSave={saveGlobalWithFeedback}
        />
    {:else}
        <ChatOverrideForm
            bind:config={controller.chatOverrideConfig}
            bind:text={controller.chatText}
            availableModels={controller.availableModels}
            currentCharacter={controller.currentCharacter}
            canConfigureTrustedSettings={controller.canConfigureTrustedSettings}
            canSave={controller.canSaveChat}
            onSave={saveChatWithFeedback}
        />
    {/if}
</main>
