<script lang="ts">
    import { onMount } from 'svelte';
    import { SvelteSet } from 'svelte/reactivity';
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
    import ChatSelector from '$lib/ChatSelector.svelte';
    import FieldEditor from '$lib/FieldEditor.svelte';
    import LoadingSkeleton from '$lib/LoadingSkeleton.svelte';
    import SettingsPaper from '$lib/SettingsPaper.svelte';
    import SettingsRowButton from '$lib/SettingsRowButton.svelte';
    import UnsavedChangesDialog from '$lib/UnsavedChangesDialog.svelte';
    import {
        type ConfigChat,
        type ConfigField,
        type ConfigScope,
        loadConfig,
        saveConfig,
    } from '$lib/config';

    type Selection = { scope: ConfigScope; chatId?: number };
    type TextField = Extract<ConfigField, { kind: 'text' }>;

    const labels: Record<string, string> = {
        'ai.prompt': 'Character',
        'ai.prePrompt': 'System prompt',
        'ai.model': 'Model',
        names: 'Names',
        tendToReply: 'Reply when matched',
        tendToIgnore: 'Ignore when matched',
        nepons: 'Fallback replies',
        blacklistedReactions: 'Blocked reactions',
        locale: 'Language',
    };
    const sections = [
        ['Reply behavior', ['names', 'tendToReply', 'tendToReplyProbability', 'tendToIgnore', 'tendToIgnoreProbability', 'randomReplyProbability', 'responseDelay']],
        ['Model', ['ai.model']],
        ['Context and media', ['ai.messagesToPass', 'ai.messageMaxLength', 'ai.includeAttachmentsInHistory', 'ai.bytesLimit', 'filesMaxAge', 'maxMessagesToStore']],
        ['Generation', ['ai.temperature', 'ai.topK', 'ai.topP', 'ai.google.structuredOutputs', 'ai.openrouter.usageInclude']],
        ['Prompts', ['ai.prompt', 'ai.prePrompt', 'ai.privateChatPromptAddition', 'ai.groupChatPromptAddition', 'ai.commentsPromptAddition', 'ai.hateModePrompt', 'ai.finalPrompt', 'ai.chatActionsToolDescription', 'startMessage']],
        ['Language and reactions', ['locale', 'blacklistedReactions', 'nepons']],
        ['Advanced', ['ai.google.safetySettings', 'ai.generation.chat.thinking.thinkingLevel', 'ai.generation.chat.thinking.includeThoughts', 'ai.generation.chat.maxOutputTokens', 'ai.generation.character.thinking.thinkingLevel', 'ai.generation.character.thinking.includeThoughts', 'ai.generation.character.maxOutputTokens']],
    ] as const;

    let fields = $state<ConfigField[]>([]);
    let original = $state<Record<string, ConfigField['value']>>({});
    const pendingResets = new SvelteSet<string>();
    let chats = $state<ConfigChat[]>([]);
    let scopes = $state<ConfigScope[]>([]);
    let scope = $state<ConfigScope>('personal');
    let chatId = $state<number>();
    let isAdmin = $state(false);
    let loading = $state(true);
    let saving = $state(false);
    let error = $state('');
    let selectorScope = $state<'private' | 'group'>();
    let editorFieldKey = $state<string>();
    let pendingSelection = $state<Selection>();
    let nativeBack = $state(false);
    let nativeMain = $state(false);
    let auth = '';

    const currentChat = $derived(chats.find((chat) => chat.id === chatId));
    const editorField = $derived(fields.find((field) => field.key === editorFieldKey));
    const about = $derived(
        fields.find((field): field is TextField =>
            field.key === 'profile.about' && field.kind === 'text'
        ),
    );
    const privateChats = $derived(chats.filter((chat) => chat.type === 'private'));
    const groupChats = $derived(chats.filter((chat) => chat.type === 'group'));
    const dirtyFields = $derived(fields.filter(isDirty));
    const changeCount = $derived(dirtyFields.length);

    function title(key: string) {
        return labels[key] ?? key.split('.').at(-1)!.replace(/([A-Z])/g, ' $1').replace(/^./, (character) => character.toUpperCase());
    }

    function fieldFor(key: string) {
        return fields.find((field) => field.key === key);
    }

    function fieldLabelId(key: string) {
        return `field-${key.replace(/[^a-zA-Z0-9_-]/g, '-')}-label`;
    }

    function selection(): Selection {
        return { scope, chatId };
    }

    function isCurrentSelection(next: Selection) {
        return next.scope === scope && next.chatId === chatId;
    }

    function useResponse(data: Awaited<ReturnType<typeof loadConfig>>) {
        pendingResets.clear();
        fields = data.fields;
        scopes = data.scopes;
        chats = data.chats;
        scope = data.scope;
        chatId = data.chatId;
        isAdmin = data.isAdmin;
        original = Object.fromEntries(fields.map((field) => [field.key, $state.snapshot(field.value)]));
    }

    async function switchSelection(next: Selection) {
        scope = next.scope;
        chatId = next.chatId;
        selectorScope = undefined;
        editorFieldKey = undefined;
        error = '';
        loading = true;
        try {
            useResponse(await loadConfig(auth, next));
        } catch (cause) {
            if (cause instanceof Error) error = cause.message;
        }
        loading = false;
    }

    function openSelection(next: Selection) {
        selectorScope = undefined;
        if (isCurrentSelection(next)) return;
        if (changeCount > 0) {
            pendingSelection = next;
            return;
        }
        void switchSelection(next);
    }

    function openScope(nextScope: 'private' | 'group') {
        const available = nextScope === 'private' ? privateChats : groupChats;
        if (nextScope === 'private' && !isAdmin && available.length === 1) {
            openSelection({ scope: nextScope, chatId: available[0].id });
            return;
        }
        selectorScope = nextScope;
    }

    function updateField(next: ConfigField) {
        cancelReset(next.key);
        fields = fields.map((field) => {
            if (field.key === next.key) return next;
            return field;
        });
    }

    function isResetPending(key: string) {
        return pendingResets.has(key);
    }

    function isDirty(field: ConfigField) {
        if (isResetPending(field.key)) return true;
        return JSON.stringify(field.value) !== JSON.stringify(original[field.key]);
    }

    function operationFor(
        field: ConfigField,
    ): { key: string; value: ConfigField['value'] } | { key: string; reset: true } {
        if (isResetPending(field.key)) return { key: field.key, reset: true };
        return { key: field.key, value: field.value };
    }

    async function save() {
        if (dirtyFields.length === 0) return true;
        saving = true;
        error = '';
        try {
            const currentSelection = selection();
            await saveConfig(auth, currentSelection, dirtyFields.map(operationFor));
            useResponse(await loadConfig(auth, currentSelection));
            hapticFeedback.notificationOccurred.ifAvailable('success');
            saving = false;
            return true;
        } catch (cause) {
            if (cause instanceof Error) error = cause.message;
            else error = 'Could not save';
        }
        saving = false;
        return false;
    }

    async function saveAndSwitch() {
        const next = pendingSelection;
        if (!next) return;
        if (!await save()) return;
        pendingSelection = undefined;
        await switchSelection(next);
    }

    function discardAndSwitch() {
        const next = pendingSelection;
        if (!next) return;
        pendingSelection = undefined;
        void switchSelection(next);
    }

    function reset(key: string) {
        pendingResets.add(key);
    }

    function cancelReset(key: string) {
        if (!isResetPending(key)) return;
        pendingResets.delete(key);
    }

    function saveText() {
        if (saving) return 'Saving…';
        if (changeCount === 0) return 'Saved';
        let suffix = 's';
        if (changeCount === 1) suffix = '';
        return `Save ${changeCount} change${suffix}`;
    }

    function navigateBack() {
        if (pendingSelection) {
            pendingSelection = undefined;
        } else if (editorFieldKey) {
            editorFieldKey = undefined;
        } else if (selectorScope) {
            selectorScope = undefined;
        } else if (scope !== 'personal') {
            openSelection({ scope: 'personal' });
        }
    }

    onMount(() => {
        const cleanups: VoidFunction[] = [];
        let disposed = false;

        async function setup() {
            try {
                init();
                initData.restore();
                auth = initData.raw() ?? '';

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
                if (disposed) return;
                const viewportBinding = viewport.bindCssVars.ifAvailable();
                if (viewportBinding.ok) cleanups.push(viewportBinding.data);
                viewport.expand.ifAvailable();

                closingBehavior.mount.ifAvailable();
                closingBehavior.disableConfirmation.ifAvailable();

                if (backButton.mount.isAvailable()) {
                    backButton.mount();
                    nativeBack = true;
                    const listener = backButton.onClick.ifAvailable(navigateBack);
                    if (listener.ok) cleanups.push(listener.data);
                }
                if (mainButton.mount.isAvailable()) {
                    mainButton.mount();
                    nativeMain = true;
                    const listener = mainButton.onClick.ifAvailable(() => {
                        if (pendingSelection) void saveAndSwitch();
                        else void save();
                    });
                    if (listener.ok) cleanups.push(listener.data);
                }

                miniApp.ready.ifAvailable();
                const response = await loadConfig(auth);
                if (!disposed) useResponse(response);
            } catch (cause) {
                if (!disposed) {
                    if (cause instanceof Error) error = cause.message;
                    else error = 'Could not load settings';
                }
            }
            if (!disposed) loading = false;
        }

        void setup();
        return () => {
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
        };
    });

    $effect(() => {
        if (changeCount) closingBehavior.enableConfirmation.ifAvailable();
        else closingBehavior.disableConfirmation.ifAvailable();
    });

    $effect(() => {
        if (!nativeBack) return;
        if (editorFieldKey || selectorScope || scope !== 'personal') backButton.show.ifAvailable();
        else backButton.hide.ifAvailable();
    });

    $effect(() => {
        if (!nativeMain) return;
        mainButton.setParams.ifAvailable({
            text: saveText(),
            isVisible: changeCount > 0,
            isEnabled: changeCount > 0 && !saving,
            isLoaderVisible: saving,
        });
    });
</script>

<svelte:head><title>Slusha settings</title></svelte:head>

<main
    class="mx-auto min-h-screen max-w-2xl pb-28 pt-(--app-safe-top)"
    style="padding-left: max(0.75rem, var(--app-safe-left)); padding-right: max(0.75rem, var(--app-safe-right));"
>
    <header class="relative flex min-h-14 items-center justify-center">
        {#if (editorFieldKey || scope !== 'personal') && !nativeBack}
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
        <h1 class="text-[17px] font-semibold">
            {editorField ? title(editorField.key) : scope === 'personal' ? 'Slusha Settings' : scope === 'global' ? 'Global Settings' : currentChat?.title ?? 'Chat Settings'}
        </h1>
    </header>

    {#if loading}
        <LoadingSkeleton personal={scope === 'personal'} />
    {:else if error && fields.length === 0}
        <p class="app-error rounded-[22px] p-4">{error}</p>
    {:else if editorField && (editorField.kind === 'matcher-list' || editorField.kind === 'string-list')}
        <p class="mb-2 mt-4 px-4 text-[13px] uppercase text-(--app-section-header-color)">Items</p>
        <SettingsPaper>
            <fieldset class="p-4" disabled={!editorField.writable}>
                <legend id={fieldLabelId(editorField.key)} class="sr-only">{title(editorField.key)}</legend>
                <FieldEditor
                    field={editorField}
                    labelledby={fieldLabelId(editorField.key)}
                    expanded={true}
                    onchange={updateField}
                />
            </fieldset>
        </SettingsPaper>
        {#if !editorField.writable}
            <p class="mt-2 px-4 text-xs text-(--tg-theme-hint-color)">Only chat administrators can change this setting.</p>
        {/if}
    {:else if scope === 'personal'}
        <p class="mb-2 mt-4 px-4 text-[13px] uppercase text-(--app-section-header-color)">Personal settings</p>
        <SettingsPaper>
            <label class="block p-4">
                <span class="mb-2 block text-[17px] font-medium">What should Slusha know about you?</span>
                {#if about}
                    <textarea
                        class="min-h-32 w-full resize-none rounded-xl border-0 bg-(--tg-theme-secondary-bg-color) p-3 text-[16px] leading-snug placeholder:text-(--tg-theme-hint-color) focus:ring-2 focus:ring-(--tg-theme-button-color)"
                        maxlength="4000"
                        placeholder="Tell Slusha about your interests, preferences, or anything that could make replies more useful."
                        value={about.value ?? ''}
                        oninput={(event) => updateField({ ...about, value: event.currentTarget.value })}
                    ></textarea>
                {/if}
            </label>
        </SettingsPaper>
        <p class="mb-2 mt-6 px-4 text-[13px] uppercase text-(--app-section-header-color)">Chat settings</p>
        <SettingsPaper>
            <SettingsRowButton
                label="Private Chats Options"
                detail={!isAdmin && privateChats.length === 1 ? privateChats[0].title : undefined}
                disabled={!scopes.includes('private') || privateChats.length === 0}
                onclick={() => openScope('private')}
            />
            <div class="app-separator border-t">
                <SettingsRowButton
                    label="Group Chats Options"
                    disabled={!scopes.includes('group') || groupChats.length === 0}
                    onclick={() => openScope('group')}
                />
            </div>
            {#if scopes.includes('global')}
                <div class="app-separator border-t">
                    <SettingsRowButton
                        label="Global Settings"
                        onclick={() => openSelection({ scope: 'global' })}
                    />
                </div>
            {/if}
        </SettingsPaper>
    {:else if fields.length === 0}
        <SettingsPaper class="mt-4">
            <p class="p-8 text-center text-(--tg-theme-hint-color)">No settings are available for this chat.</p>
        </SettingsPaper>
    {:else}
        {#each sections as [section, keys] (section)}
            {#if keys.some(fieldFor)}
                <p class="mb-2 mt-4 px-4 text-[13px] uppercase text-(--app-section-header-color)">{section}</p>
                <SettingsPaper class="mb-5">
                    {#each keys as key (key)}
                        {@const field = fieldFor(key)}
                        {#if field}
                            <div
                                class="app-separator border-t p-4"
                                class:dirty={isDirty(field)}
                            >
                                <div class="mb-2 flex items-center justify-between gap-3">
                                    <span id={fieldLabelId(field.key)} class="text-[17px] font-medium">{title(key)}</span>
                                    {#if field.overridden && field.writable && !isResetPending(field.key)}
                                        <button class="min-h-11 rounded-lg px-2 text-sm text-(--tg-theme-link-color) disabled:opacity-40" disabled={saving} onclick={() => reset(field.key)}>Reset</button>
                                    {/if}
                                </div>
                                {#if isResetPending(field.key)}
                                    <div class="rounded-xl bg-(--tg-theme-secondary-bg-color) p-3">
                                        <p class="text-(--tg-theme-hint-color)">This setting will be reset when you save.</p>
                                        <button class="mt-2 text-sm text-(--tg-theme-link-color)" disabled={saving} onclick={() => cancelReset(field.key)}>Keep override</button>
                                    </div>
                                {:else}
                                    <fieldset disabled={!field.writable}><FieldEditor {field} labelledby={fieldLabelId(field.key)} onopen={() => editorFieldKey = field.key} onreset={() => reset(field.key)} onchange={updateField} /></fieldset>
                                {/if}
                                {#if !field.writable}
                                    <p class="mt-2 text-xs text-(--tg-theme-hint-color)">Only chat administrators can change this setting.</p>
                                {/if}
                            </div>
                        {/if}
                    {/each}
                </SettingsPaper>
            {/if}
        {/each}
    {/if}
</main>

<div
    class="pointer-events-none fixed bottom-0 z-40 pb-(--app-safe-bottom)"
    style="left: max(1rem, var(--app-safe-left)); right: max(1rem, var(--app-safe-right));"
>
    {#if error}<p class="app-error pointer-events-auto mx-auto mb-2 max-w-2xl rounded-xl px-3 py-2 text-center text-sm shadow-lg">{error}</p>{/if}
    {#if !nativeMain && !loading}
        <button
            class="telegram-action-button pointer-events-auto mx-auto block min-h-14 w-full max-w-2xl rounded-full px-5 py-3 text-[17px] font-semibold shadow-lg active:opacity-80 disabled:opacity-40 disabled:shadow-none"
            disabled={changeCount === 0 || saving}
            onclick={save}
        >{saveText()}</button>
    {/if}
</div>

{#if selectorScope}
    <ChatSelector
        title={selectorScope === 'private' ? 'Choose a private chat' : 'Choose a group chat'}
        chats={selectorScope === 'private' ? privateChats : groupChats}
        oncancel={() => selectorScope = undefined}
        onselect={(chat) => openSelection({ scope: selectorScope!, chatId: chat.id })}
    />
{/if}

{#if pendingSelection}
    <UnsavedChangesDialog
        {saving}
        oncancel={() => pendingSelection = undefined}
        ondiscard={discardAndSwitch}
        onsave={() => void saveAndSwitch()}
    />
{/if}
