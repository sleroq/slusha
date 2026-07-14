<script lang="ts">
    import { onMount } from 'svelte';
    import ChatSelector from '$lib/ChatSelector.svelte';
    import ExpandedListEditorView from '$lib/ExpandedListEditorView.svelte';
    import LoadingSkeleton from '$lib/LoadingSkeleton.svelte';
    import PersonalSettingsView from '$lib/PersonalSettingsView.svelte';
    import ScopedSettingsSectionView from '$lib/ScopedSettingsSectionView.svelte';
    import ScopedSettingsView from '$lib/ScopedSettingsView.svelte';
    import UnsavedChangesDialog from '$lib/UnsavedChangesDialog.svelte';
    import type { ConfigSelection } from '$lib/config';
    import { createSettingsNavigation } from '$lib/settings-navigation.svelte';
    import { scopedSettingsSection } from '$lib/scoped-settings';
    import { createSettingsSession } from '$lib/settings-session.svelte';
    import { settingsFieldTitle } from '$lib/settings-view';
    import { createTelegramSettingsChrome } from '$lib/telegram-settings-chrome.svelte';

    const chrome = createTelegramSettingsChrome({
        onback: navigateBack,
        onmain: saveFromChrome,
    });
    const session = createSettingsSession({ onsaved: chrome.notifySaveSuccess });
    const navigation = createSettingsNavigation({
        hasPendingSelection: () => session.pendingSelection !== undefined,
        selection: () => session.selection,
        cancelPendingSelection: session.cancelPendingSelection,
        requestSelection: (selection) => { void session.requestSelection(selection); },
    });

    const editorField = $derived.by(() => {
        const view = navigation.view;
        if (view.kind !== 'expanded-editor') return undefined;
        return session.fields.find((field) => field.key === view.fieldKey);
    });
    const expandedEditorField = $derived.by(() => {
        if (editorField?.kind === 'matcher-list' || editorField?.kind === 'string-list') {
            return editorField;
        }
        return undefined;
    });
    const canNavigateBack = $derived(
        session.pendingSelection !== undefined ||
        navigation.view.kind !== 'settings' ||
        session.selection.scope !== 'personal',
    );
    const pageTitle = $derived.by(() => {
        if (editorField) return settingsFieldTitle(editorField.key);
        if (navigation.view.kind === 'section') return scopedSettingsSection(navigation.view.sectionId).title;
        if (session.selection.scope === 'personal') return 'Slusha Settings';
        if (session.selection.scope === 'global') return 'Global Settings';
        return session.currentChat?.title ?? 'Chat Settings';
    });

    function navigateBack() {
        navigation.back();
    }

    function saveFromChrome() {
        if (session.pendingSelection) void session.saveAndSwitch();
        else void session.save();
    }

    function openSelection(selection: ConfigSelection) {
        navigation.view = { kind: 'settings' };
        void session.requestSelection(selection);
    }

    function openScope(chatType: 'private' | 'group') {
        let available = session.privateChats;
        if (chatType === 'group') available = session.groupChats;
        if (chatType === 'private' && !session.isAdmin && available.length === 1) {
            openSelection({ scope: chatType, chatId: available[0].id });
            return;
        }
        navigation.view = { kind: 'chat-selector', chatType };
    }

    function openExpandedEditor(fieldKey: string) {
        const view = navigation.view;
        if (view.kind !== 'section') return;
        navigation.view = { kind: 'expanded-editor', fieldKey, sectionId: view.sectionId };
    }

    onMount(() => {
        let disposed = false;
        async function setup() {
            try {
                const auth = await chrome.initialize();
                if (!disposed) await session.initialize(auth);
            } catch (cause) {
                if (!disposed) session.failInitialization(cause);
            }
        }
        void setup();
        return () => {
            disposed = true;
            chrome.dispose();
        };
    });

    $effect(() => {
        chrome.syncClosingConfirmation(session.changeCount > 0);
    });

    $effect(() => {
        chrome.syncBackButton(canNavigateBack);
    });

    $effect(() => {
        chrome.syncMainButton(session.saveLabel, session.changeCount, session.saving);
    });
</script>

<svelte:head><title>Slusha settings</title></svelte:head>

<main
    class="mx-auto min-h-screen max-w-2xl pb-28 pt-(--app-safe-top)"
    style="padding-left: max(0.75rem, var(--app-safe-left)); padding-right: max(0.75rem, var(--app-safe-right));"
>
    <header class="relative flex min-h-14 items-center justify-center">
        {#if canNavigateBack && !chrome.nativeBack}
            <button
                class="absolute left-0 flex min-h-11 items-center gap-1 py-3 pr-4 text-[17px] text-(--tg-theme-link-color)"
                onclick={navigateBack}
            >
                <svg class="size-5" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                    <path d="m12.5 4.5-5 5.5 5 5.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />
                </svg>
                Back
            </button>
        {/if}
        <h1 class="text-[17px] font-semibold">{pageTitle}</h1>
    </header>

    {#if session.loading}
        <LoadingSkeleton personal={session.selection.scope === 'personal'} />
    {:else if session.error && session.fields.length === 0}
        <p class="app-error rounded-[22px] p-4">{session.error}</p>
    {:else if expandedEditorField}
        <ExpandedListEditorView
            field={expandedEditorField}
            saving={session.saving}
            onchange={session.updateField}
        />
    {:else if navigation.view.kind === 'section'}
        <ScopedSettingsSectionView
            sectionId={navigation.view.sectionId}
            fields={session.fields}
            saving={session.saving}
            isdirty={session.isDirty}
            isresetpending={session.isResetPending}
            onchange={session.updateField}
            onreset={session.resetField}
            oncancelreset={session.cancelReset}
            onopen={openExpandedEditor}
        />
    {:else if session.selection.scope === 'personal'}
        <PersonalSettingsView
            about={session.about}
            privateChats={session.privateChats}
            groupChats={session.groupChats}
            scopes={session.scopes}
            isAdmin={session.isAdmin}
            disabled={session.saving}
            onchange={session.updateField}
            onopenscope={openScope}
            onopenglobal={() => openSelection({ scope: 'global' })}
        />
    {:else}
        <ScopedSettingsView
            fields={session.fields}
            saving={session.saving}
            onopen={(sectionId) => navigation.view = { kind: 'section', sectionId }}
        />
    {/if}
</main>

<div
    class="pointer-events-none fixed bottom-0 z-40 pb-(--app-safe-bottom)"
    style="left: max(1rem, var(--app-safe-left)); right: max(1rem, var(--app-safe-right));"
>
    {#if session.error}<p class="app-error pointer-events-auto mx-auto mb-2 max-w-2xl rounded-xl px-3 py-2 text-center text-sm shadow-lg">{session.error}</p>{/if}
    {#if !chrome.nativeMain && !session.loading}
        <button
            class="telegram-action-button pointer-events-auto mx-auto block min-h-14 w-full max-w-2xl rounded-full px-5 py-3 text-[17px] font-semibold shadow-lg active:opacity-80 disabled:opacity-40 disabled:shadow-none"
            disabled={session.changeCount === 0 || session.saving}
            onclick={session.save}
        >{session.saveLabel}</button>
    {/if}
</div>

{#if navigation.view.kind === 'chat-selector'}
    {@const chatType = navigation.view.chatType}
    <ChatSelector
        title={chatType === 'private' ? 'Choose a private chat' : 'Choose a group chat'}
        chats={chatType === 'private' ? session.privateChats : session.groupChats}
        oncancel={() => navigation.view = { kind: 'settings' }}
        onselect={(chat) => openSelection({ scope: chatType, chatId: chat.id })}
    />
{/if}

{#if session.pendingSelection}
    <UnsavedChangesDialog
        saving={session.saving}
        oncancel={session.cancelPendingSelection}
        ondiscard={() => void session.discardAndSwitch()}
        onsave={() => void session.saveAndSwitch()}
    />
{/if}
