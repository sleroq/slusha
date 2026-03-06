<script lang="ts">
    import { init } from '@tma.js/sdk-svelte';
    import { onDestroy, onMount } from 'svelte';
    import ChatOverrideForm from '$lib/components/config/ChatOverrideForm.svelte';
    import ConfigToolbar from '$lib/components/config/ConfigToolbar.svelte';
    import GlobalConfigForm from '$lib/components/config/GlobalConfigForm.svelte';
    import { createConfigController } from '$lib/config/controller.svelte';

    const controller = createConfigController();

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
        onReload={() => controller.loadBootstrap()}
    />

    {#if controller.scope === 'global' && controller.canViewGlobal}
        <GlobalConfigForm
            bind:config={controller.globalConfig}
            bind:text={controller.globalText}
            availableModels={controller.availableModels}
            canSave={controller.canSaveGlobal}
            onSave={() => controller.saveGlobal()}
        />
    {:else}
        <ChatOverrideForm
            bind:config={controller.chatOverrideConfig}
            bind:text={controller.chatText}
            availableModels={controller.availableModels}
            canConfigureTrustedSettings={controller.canConfigureTrustedSettings}
            canSave={controller.canSaveChat}
            onSave={() => controller.saveChat()}
        />
    {/if}
</main>
