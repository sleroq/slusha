<script lang="ts">
    import type { ConfigField } from './config.ts';
    import FieldEditor from './FieldEditor.svelte';
    import SettingsPaper from './SettingsPaper.svelte';
    import { settingsFieldLabelId, settingsFieldTitle } from './settings-view.ts';

    let {
        fields,
        saving,
        isdirty,
        isresetpending,
        onchange,
        onreset,
        oncancelreset,
        onopen,
    }: {
        fields: ConfigField[];
        saving: boolean;
        isdirty: (field: ConfigField) => boolean;
        isresetpending: (key: string) => boolean;
        onchange: (field: ConfigField) => void;
        onreset: (key: string) => void;
        oncancelreset: (key: string) => void;
        onopen: (key: string) => void;
    } = $props();

    const sections = [
        ['Reply behavior', ['names', 'tendToReply', 'tendToReplyProbability', 'tendToIgnore', 'tendToIgnoreProbability', 'randomReplyProbability', 'responseDelay']],
        ['Model', ['ai.model']],
        ['Context and media', ['ai.messagesToPass', 'ai.messageMaxLength', 'ai.includeAttachmentsInHistory', 'ai.bytesLimit', 'filesMaxAge', 'maxMessagesToStore']],
        ['Generation', ['ai.temperature', 'ai.topK', 'ai.topP', 'ai.google.structuredOutputs', 'ai.openrouter.usageInclude']],
        ['Prompts', ['ai.prompt', 'ai.prePrompt', 'ai.privateChatPromptAddition', 'ai.groupChatPromptAddition', 'ai.commentsPromptAddition', 'ai.hateModePrompt', 'ai.finalPrompt', 'ai.chatActionsToolDescription', 'startMessage']],
        ['Language and reactions', ['locale', 'blacklistedReactions', 'nepons']],
        ['Advanced', ['ai.google.safetySettings', 'ai.generation.chat.thinking.thinkingLevel', 'ai.generation.chat.thinking.includeThoughts', 'ai.generation.chat.maxOutputTokens', 'ai.generation.character.thinking.thinkingLevel', 'ai.generation.character.thinking.includeThoughts', 'ai.generation.character.maxOutputTokens']],
    ] as const;

    function fieldFor(key: string) {
        return fields.find((field) => field.key === key);
    }
</script>

{#if fields.length === 0}
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
                        <div class="app-separator border-t p-4" class:dirty={isdirty(field)}>
                            <div class="mb-2 flex items-center justify-between gap-3">
                                <span id={settingsFieldLabelId(field.key)} class="text-[17px] font-medium">{settingsFieldTitle(key)}</span>
                                {#if field.overridden && field.writable && !isresetpending(field.key)}
                                    <button class="min-h-11 rounded-lg px-2 text-sm text-(--tg-theme-link-color) disabled:opacity-40" disabled={saving} onclick={() => onreset(field.key)}>Reset</button>
                                {/if}
                            </div>
                            {#if isresetpending(field.key)}
                                <div class="rounded-xl bg-(--tg-theme-secondary-bg-color) p-3">
                                    <p class="text-(--tg-theme-hint-color)">This setting will be reset when you save.</p>
                                    <button class="mt-2 text-sm text-(--tg-theme-link-color)" disabled={saving} onclick={() => oncancelreset(field.key)}>Keep override</button>
                                </div>
                            {:else}
                                <fieldset disabled={saving || !field.writable}>
                                    <FieldEditor {field} labelledby={settingsFieldLabelId(field.key)} onopen={() => onopen(field.key)} onreset={() => onreset(field.key)} {onchange} />
                                </fieldset>
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
