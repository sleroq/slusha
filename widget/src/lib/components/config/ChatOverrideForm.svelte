<script lang="ts">
    import SettingInputField from '$lib/components/config/fields/SettingInputField.svelte';
    import SettingMatcherListField from '$lib/components/config/fields/SettingMatcherListField.svelte';
    import SettingReadonlyField from '$lib/components/config/fields/SettingReadonlyField.svelte';
    import SettingReactionBlacklistField from '$lib/components/config/fields/SettingReactionBlacklistField.svelte';
    import SettingSelectField from '$lib/components/config/fields/SettingSelectField.svelte';
    import SettingStringListField from '$lib/components/config/fields/SettingStringListField.svelte';
    import SettingTextareaField from '$lib/components/config/fields/SettingTextareaField.svelte';
    import SettingToggleField from '$lib/components/config/fields/SettingToggleField.svelte';
    import { createSectionMatcher } from '$lib/components/config/search';
    import { useI18n } from '$lib/i18n/context.svelte';
    import {
        matcherListToTextarea,
        stringListToTextarea,
    } from '$lib/config/model';
    import type {
        ChatInternalsPayload,
        ChatFormText,
        CurrentCharacterPayload,
        ResolvedChatOverridePayload,
    } from '$lib/config/model';

    interface Props {
        config: ResolvedChatOverridePayload;
        text: ChatFormText;
        baseConfig: ResolvedChatOverridePayload;
        availableModels: string[];
        availableReactions: string[];
        chatInternals: ChatInternalsPayload;
        currentCharacter?: CurrentCharacterPayload;
        canEditChatInternals: boolean;
        canConfigureTrustedSettings: boolean;
        canEditWindowOverrides: boolean;
        overriddenFieldPaths: string[];
        searchQuery: string;
    }

    let {
        config = $bindable(),
        text = $bindable(),
        baseConfig,
        availableModels = [],
        availableReactions = [],
        chatInternals = $bindable(),
        currentCharacter,
        canEditChatInternals,
        canConfigureTrustedSettings,
        canEditWindowOverrides,
        overriddenFieldPaths = [],
        searchQuery = '',
    }: Props = $props();

    const t = useI18n();

    let sectionMatcher = $derived(createSectionMatcher(searchQuery));
    let hasSearch = $derived(sectionMatcher.hasSearch);

    const matchesSection = (...terms: string[]): boolean => sectionMatcher.matchesSection(...terms);

    const matchesBlockItem = (section: string, ...terms: string[]): boolean =>
        sectionMatcher.matchesBlockItem(section, ...terms);

    let showCurrentCharacter = $derived(
        matchesSection(
            'current character',
            'name',
            'description',
            'scenario',
            'system prompt',
            'post-history instructions',
            'first message',
            'message example',
        ),
    );
    let showGeneral = $derived(
        matchesSection(
            'general',
            'reply tendency',
            'ignore tendency',
            'random reply chance',
            'response delay',
            'history version',
            'bot names',
            'reply trigger patterns',
            'ignore trigger patterns',
            'blacklisted reactions',
            'nepon replies',
        ),
    );
    let showModel = $derived(
        matchesSection(
            'model',
            'temperature',
            'top-k',
            'top-p',
        ),
    );
    let showPrompts = $derived(
        matchesSection(
            'prompts',
            'json-actions chat prompt',
            'plain-text chat prompt',
            'primary chat prompt',
            'low-context chat prompt',
            'private chat prompt addition',
            'group chat prompt addition',
            'comment prompt addition',
            'hate mode prompt',
        ),
    );
    let showAdvanced = $derived(
        matchesSection(
            'advanced',
            'messages passed to ai',
            'reply method',
            'max reply length',
            'attachment byte limit',
            'include attachments in history',
        ),
    );
    let showUsageLimits = $derived(
        matchesSection(
            'usage limits',
            'request windows',
            'free tier per-chat max requests',
            'free tier per-chat window minutes',
            'trusted tier per-chat max requests',
            'trusted tier per-chat window minutes',
        ),
    );
    let showInternals = $derived(
        matchesSection(
            'internals',
            'internal',
            'summary',
            'personal notes',
            'memory',
        ),
    );
    let hasMatches = $derived(
        showCurrentCharacter ||
            showGeneral ||
            (canEditChatInternals && showInternals) ||
            (canConfigureTrustedSettings &&
                (showModel || showPrompts || showAdvanced || showUsageLimits)),
    );
    let overriddenPathSet = $derived(new Set(overriddenFieldPaths));

    const isOverridden = (path: string): boolean => overriddenPathSet.has(path);

    const unsetIfOverridden = (path: string, onUnset: () => void): void => {
        if (!isOverridden(path)) {
            return;
        }

        onUnset();
    };

    const sourceStateFor = (path: string, onUnset: () => void) => ({
        overridden: isOverridden(path),
        label: 'Unset chat override (inherit global value)',
        onUnset: () => unsetIfOverridden(path, onUnset),
    });

</script>

<section class="config-form space-y-6">
    <div class="space-y-5">
        {#if hasSearch && !hasMatches}
            <p class="text-sm text-muted-foreground">{t('form.chat.noMatches', { query: searchQuery.trim() })}</p>
        {/if}

        {#if showCurrentCharacter}
            <details class="quick-details border-t pt-4" open={hasSearch || Boolean(currentCharacter)}>
                <summary class="cursor-pointer select-none font-medium">Current Character</summary>
                <div class="mt-4 space-y-4">
                {#if currentCharacter}
                    <p class="text-xs text-muted-foreground">Character prompts shown here are chat character prompts. Native Slusha prompts are intentionally excluded.</p>
                    <div class="grid gap-3 md:grid-cols-2">
                        <SettingReadonlyField
                            label="Name"
                            value={currentCharacter.name}
                            hidden={!matchesBlockItem('current character', 'name')}
                        />
                        <SettingReadonlyField
                            label="Names"
                            value={currentCharacter.names.length > 0 ? currentCharacter.names.join(', ') : 'No aliases generated'}
                            hidden={!matchesBlockItem('current character', 'names', 'aliases')}
                        />
                    </div>

                    {#if currentCharacter.description.trim().length > 0 && matchesBlockItem('current character', 'description')}
                        <SettingReadonlyField
                            label="Description"
                            value={currentCharacter.description}
                            valueClass="max-h-60 overflow-auto whitespace-pre-wrap rounded-md border px-3 py-2 text-sm"
                        />
                    {/if}

                    {#if currentCharacter.scenario.trim().length > 0 && matchesBlockItem('current character', 'scenario')}
                        <SettingReadonlyField
                            label="Scenario"
                            value={currentCharacter.scenario}
                            valueClass="max-h-48 overflow-auto whitespace-pre-wrap rounded-md border px-3 py-2 text-sm"
                        />
                    {/if}

                    {#if currentCharacter.systemPrompt.trim().length > 0 && matchesBlockItem('current character', 'system prompt')}
                        <SettingReadonlyField
                            label="System prompt"
                            value={currentCharacter.systemPrompt}
                            valueClass="max-h-60 overflow-auto whitespace-pre-wrap rounded-md border px-3 py-2 text-sm"
                        />
                    {/if}

                    {#if currentCharacter.postHistoryInstructions.trim().length > 0 && matchesBlockItem('current character', 'post-history instructions')}
                        <SettingReadonlyField
                            label="Post-history instructions"
                            value={currentCharacter.postHistoryInstructions}
                            valueClass="max-h-48 overflow-auto whitespace-pre-wrap rounded-md border px-3 py-2 text-sm"
                        />
                    {/if}

                    {#if currentCharacter.firstMessage.trim().length > 0 && matchesBlockItem('current character', 'first message')}
                        <SettingReadonlyField
                            label="First message"
                            value={currentCharacter.firstMessage}
                            valueClass="max-h-48 overflow-auto whitespace-pre-wrap rounded-md border px-3 py-2 text-sm"
                        />
                    {/if}

                    {#if currentCharacter.messageExample.trim().length > 0 && matchesBlockItem('current character', 'message example')}
                        <SettingReadonlyField
                            label="Message example"
                            value={currentCharacter.messageExample}
                            valueClass="max-h-48 overflow-auto whitespace-pre-wrap rounded-md border px-3 py-2 text-sm"
                        />
                    {/if}
                {:else}
                    <p class="text-sm text-muted-foreground">No character is currently set for this chat.</p>
                {/if}
                </div>
            </details>
        {/if}

        {#if showGeneral}
            <details open class="quick-details border-t pt-4">
                <summary class="cursor-pointer select-none font-medium">General</summary>
                <div class="mt-4 space-y-6">
                    <div class="grid gap-3 md:grid-cols-2">
                        <SettingInputField
                            id="c-tend-reply-prob"
                            type="number"
                            label="Reply tendency (%)"
                            description="Chance to answer when tend-to-reply patterns match."
                            sourceState={sourceStateFor('tendToReplyProbability', () => {
                                config.tendToReplyProbability = baseConfig.tendToReplyProbability;
                            })}
                            hidden={!matchesBlockItem('general', 'reply tendency', 'tend to reply probability')}
                            bind:value={config.tendToReplyProbability}
                        />
                        <SettingInputField
                            id="c-tend-ignore-prob"
                            type="number"
                            label="Ignore tendency (%)"
                            description="Chance to ignore when tend-to-ignore patterns match."
                            sourceState={sourceStateFor('tendToIgnoreProbability', () => {
                                config.tendToIgnoreProbability = baseConfig.tendToIgnoreProbability;
                            })}
                            hidden={!matchesBlockItem('general', 'ignore tendency', 'tend to ignore probability')}
                            bind:value={config.tendToIgnoreProbability}
                        />
                        <SettingInputField
                            id="c-random-reply-prob"
                            type="number"
                            label="Random reply chance (%)"
                            description="Fallback probability to respond without a match."
                            sourceState={sourceStateFor('randomReplyProbability', () => {
                                config.randomReplyProbability = baseConfig.randomReplyProbability;
                            })}
                            hidden={!matchesBlockItem('general', 'random reply chance', 'random reply probability')}
                            bind:value={config.randomReplyProbability}
                        />
                        <SettingInputField
                            id="c-response-delay"
                            type="number"
                            label="Response delay (seconds)"
                            description="Wait time before sending the reply."
                            sourceState={sourceStateFor('responseDelay', () => {
                                config.responseDelay = baseConfig.responseDelay;
                            })}
                            hidden={!matchesBlockItem('general', 'response delay')}
                            bind:value={config.responseDelay}
                        />
                        <SettingSelectField
                            id="c-ai-history-version"
                            label="History version"
                            description="Selects conversation history builder for this chat."
                            options={['v2', 'v3']}
                            sourceState={sourceStateFor('ai.historyVersion', () => {
                                config.ai.historyVersion = baseConfig.ai.historyVersion;
                            })}
                            hidden={!matchesBlockItem('general', 'history version', 'ai.historyVersion')}
                            bind:value={config.ai.historyVersion}
                        />
                    </div>

                    <div class="grid gap-3 md:grid-cols-2">
                        <SettingMatcherListField
                            id="c-names"
                            label="Bot names"
                            description="One name or regex per line; used for mentions."
                            sourceState={sourceStateFor('names', () => {
                                config.names = [...baseConfig.names];
                                text.names = matcherListToTextarea(baseConfig.names);
                            })}
                            hidden={!matchesBlockItem('general', 'bot names', 'names')}
                            bind:value={text.names}
                        />
                        <SettingMatcherListField
                            id="c-tend-reply"
                            label="Reply trigger patterns"
                            description="One pattern per line; supports /regex/flags."
                            sourceState={sourceStateFor('tendToReply', () => {
                                config.tendToReply = [...baseConfig.tendToReply];
                                text.tendToReply = matcherListToTextarea(baseConfig.tendToReply);
                            })}
                            hidden={!matchesBlockItem('general', 'reply trigger patterns', 'tend to reply')}
                            bind:value={text.tendToReply}
                        />
                        <SettingMatcherListField
                            id="c-tend-ignore"
                            label="Ignore trigger patterns"
                            description="One pattern per line; supports /regex/flags."
                            sourceState={sourceStateFor('tendToIgnore', () => {
                                config.tendToIgnore = [...baseConfig.tendToIgnore];
                                text.tendToIgnore = matcherListToTextarea(baseConfig.tendToIgnore);
                            })}
                            hidden={!matchesBlockItem('general', 'ignore trigger patterns', 'tend to ignore')}
                            bind:value={text.tendToIgnore}
                        />
                        <SettingReactionBlacklistField
                            id="c-blacklisted-reactions"
                            label="Blacklisted reactions"
                            description="Select reactions to block in this chat. Unselected reactions stay allowed."
                            reactions={availableReactions}
                            sourceState={sourceStateFor('blacklistedReactions', () => {
                                config.blacklistedReactions = [...baseConfig.blacklistedReactions];
                                text.blacklistedReactions = stringListToTextarea(baseConfig.blacklistedReactions);
                            })}
                            hidden={!matchesBlockItem('general', 'blacklisted reactions', 'reactions')}
                            bind:value={text.blacklistedReactions}
                        />
                        <SettingStringListField
                            id="c-nepons"
                            label="Nepon replies"
                            description="Add, reorder, and remove canned fallback replies."
                            itemPlaceholder="Fallback reply"
                            addLabel="Add reply"
                            sourceState={sourceStateFor('nepons', () => {
                                config.nepons = [...baseConfig.nepons];
                                text.nepons = stringListToTextarea(baseConfig.nepons);
                            })}
                            hidden={!matchesBlockItem('general', 'nepon replies', 'nepons')}
                            bind:value={text.nepons}
                        />
                    </div>
                </div>
            </details>
        {/if}

        {#if canEditChatInternals && showInternals}
            <details class="quick-details border-t pt-4" open={hasSearch}>
                <summary class="cursor-pointer select-none font-medium">Internal</summary>
                <div class="mt-4 grid gap-3 md:grid-cols-2">
                    <SettingTextareaField
                        id="c-internal-summary"
                        rows={7}
                        containerClass="md:col-span-2"
                        label="Summary"
                        description="Internal chat summary used for long-term context."
                        hidden={!matchesBlockItem('internals', 'summary')}
                        bind:value={chatInternals.summary}
                    />
                    <SettingTextareaField
                        id="c-internal-personal-notes"
                        rows={7}
                        containerClass="md:col-span-2"
                        label="Personal notes"
                        description="Private memory notes used by the bot."
                        hidden={!matchesBlockItem('internals', 'personal notes', 'memory')}
                        bind:value={chatInternals.personalNotes}
                    />
                </div>
            </details>
        {/if}

        {#if canConfigureTrustedSettings}
            {#if showModel}
                <details class="quick-details border-t pt-4" open={hasSearch}>
                    <summary class="cursor-pointer select-none font-medium">Model</summary>
                    <div class="mt-4 grid gap-3 md:grid-cols-2">
                        <SettingSelectField
                            id="c-ai-model"
                            label="Model"
                            description="Model used for this chat override."
                            options={availableModels}
                            sourceState={sourceStateFor('ai.model', () => {
                                config.ai.model = baseConfig.ai.model;
                            })}
                            hidden={!matchesBlockItem('model', 'model', 'ai model')}
                            bind:value={config.ai.model}
                        />
                        <SettingInputField
                            id="c-ai-temp"
                            type="number"
                            label="Temperature"
                            description="Higher values increase randomness."
                            sourceState={sourceStateFor('ai.temperature', () => {
                                config.ai.temperature = baseConfig.ai.temperature;
                            })}
                            hidden={!matchesBlockItem('model', 'temperature')}
                            bind:value={config.ai.temperature}
                        />
                        <SettingInputField
                            id="c-ai-topk"
                            type="number"
                            label="Top-K"
                            description="Limits token choices to the top K candidates."
                            sourceState={sourceStateFor('ai.topK', () => {
                                config.ai.topK = baseConfig.ai.topK;
                            })}
                            hidden={!matchesBlockItem('model', 'top-k', 'topk')}
                            bind:value={config.ai.topK}
                        />
                        <SettingInputField
                            id="c-ai-topp"
                            type="number"
                            label="Top-P"
                            description="Uses nucleus sampling with cumulative probability P."
                            sourceState={sourceStateFor('ai.topP', () => {
                                config.ai.topP = baseConfig.ai.topP;
                            })}
                            hidden={!matchesBlockItem('model', 'top-p', 'topp')}
                            bind:value={config.ai.topP}
                        />
                    </div>
                </details>
            {/if}

            {#if showPrompts}
                <details class="quick-details border-t pt-4" open={hasSearch}>
                    <summary class="cursor-pointer select-none font-medium">Prompts</summary>
                    <div class="mt-4 grid gap-3 md:grid-cols-2">
                        <SettingTextareaField
                            id="c-ai-prompt"
                            rows={4}
                            containerClass="md:col-span-2"
                            label="JSON-actions chat prompt"
                            description="Core behavior/persona prompt used only when reply method is json_actions."
                            sourceState={sourceStateFor('ai.prompt', () => {
                                config.ai.prompt = baseConfig.ai.prompt;
                            })}
                            hidden={!matchesBlockItem('prompts', 'json-actions chat prompt', 'primary chat prompt')}
                            bind:value={config.ai.prompt}
                        />
                        <SettingTextareaField
                            id="c-ai-dumb-prompt"
                            rows={3}
                            containerClass="md:col-span-2"
                            label="Plain-text chat prompt"
                            description="Core behavior/persona prompt used only when reply method is plain_text_reactions."
                            sourceState={sourceStateFor('ai.dumbPrompt', () => {
                                config.ai.dumbPrompt = baseConfig.ai.dumbPrompt;
                            })}
                            hidden={!matchesBlockItem('prompts', 'plain-text chat prompt', 'low-context chat prompt', 'dumb prompt')}
                            bind:value={config.ai.dumbPrompt}
                        />
                        <SettingTextareaField
                            id="c-ai-private-addition"
                            rows={3}
                            containerClass="md:col-span-2"
                            label="Private chat prompt addition"
                            description="Extra instructions for private chats in this chat."
                            sourceState={sourceStateFor('ai.privateChatPromptAddition', () => {
                                config.ai.privateChatPromptAddition = baseConfig.ai.privateChatPromptAddition;
                            })}
                            hidden={!matchesBlockItem('prompts', 'private chat prompt addition')}
                            bind:value={config.ai.privateChatPromptAddition}
                        />
                        <SettingTextareaField
                            id="c-ai-group-addition"
                            rows={3}
                            containerClass="md:col-span-2"
                            label="Group chat prompt addition"
                            description="Extra instructions for group chats in this chat."
                            sourceState={sourceStateFor('ai.groupChatPromptAddition', () => {
                                config.ai.groupChatPromptAddition = baseConfig.ai.groupChatPromptAddition;
                            })}
                            hidden={!matchesBlockItem('prompts', 'group chat prompt addition')}
                            bind:value={config.ai.groupChatPromptAddition}
                        />
                        <SettingTextareaField
                            id="c-ai-comments-addition"
                            rows={3}
                            containerClass="md:col-span-2"
                            label="Comment prompt addition"
                            description="Extra guidance for comment-style messages."
                            sourceState={sourceStateFor('ai.commentsPromptAddition', () => {
                                config.ai.commentsPromptAddition = baseConfig.ai.commentsPromptAddition;
                            })}
                            hidden={!matchesBlockItem('prompts', 'comment prompt addition', 'comments prompt addition')}
                            bind:value={config.ai.commentsPromptAddition}
                        />
                        <SettingTextareaField
                            id="c-ai-hate-prompt"
                            rows={3}
                            containerClass="md:col-span-2"
                            label="Hate mode prompt"
                            description="Special prompt used when hate mode is enabled."
                            sourceState={sourceStateFor('ai.hateModePrompt', () => {
                                config.ai.hateModePrompt = baseConfig.ai.hateModePrompt;
                            })}
                            hidden={!matchesBlockItem('prompts', 'hate mode prompt')}
                            bind:value={config.ai.hateModePrompt}
                        />
                    </div>
                </details>
            {/if}

            {#if showAdvanced}
                <details class="quick-details border-t pt-4" open={hasSearch}>
                    <summary class="cursor-pointer select-none font-medium">Advanced</summary>
                    <div class="mt-4 grid gap-3 md:grid-cols-2">
                        <SettingInputField
                            id="c-ai-msgs"
                            type="number"
                            label="Messages passed to AI"
                            description="Number of recent messages sent to the model."
                            sourceState={sourceStateFor('ai.messagesToPass', () => {
                                config.ai.messagesToPass = baseConfig.ai.messagesToPass;
                            })}
                            hidden={!matchesBlockItem('advanced', 'messages passed to ai')}
                            bind:value={config.ai.messagesToPass}
                        />
                        <SettingInputField
                            id="c-ai-max-len"
                            type="number"
                            label="Max reply length (chars)"
                            description="Soft limit for generated response length."
                            sourceState={sourceStateFor('ai.messageMaxLength', () => {
                                config.ai.messageMaxLength = baseConfig.ai.messageMaxLength;
                            })}
                            hidden={!matchesBlockItem('advanced', 'max reply length', 'message max length')}
                            bind:value={config.ai.messageMaxLength}
                        />
                        <SettingInputField
                            id="c-ai-bytes"
                            type="number"
                            label="Attachment byte limit"
                            description="Maximum attachment size included in processing."
                            sourceState={sourceStateFor('ai.bytesLimit', () => {
                                config.ai.bytesLimit = baseConfig.ai.bytesLimit;
                            })}
                            hidden={!matchesBlockItem('advanced', 'attachment byte limit', 'bytes limit')}
                            bind:value={config.ai.bytesLimit}
                        />
                        <SettingSelectField
                            id="c-ai-reply-method"
                            label="Reply method"
                            description="Chooses how replies and reactions are generated in this chat."
                            options={['json_actions', 'plain_text_reactions']}
                            sourceState={sourceStateFor('ai.replyMethod', () => {
                                config.ai.replyMethod = baseConfig.ai.replyMethod;
                            })}
                            hidden={!matchesBlockItem('advanced', 'reply method', 'ai.replyMethod')}
                            bind:value={config.ai.replyMethod}
                        />
                        <SettingToggleField
                            id="c-ai-attachments"
                            label="Include attachments in history"
                            description="Adds attachment text to model context when possible."
                            sourceState={sourceStateFor('ai.includeAttachmentsInHistory', () => {
                                config.ai.includeAttachmentsInHistory = baseConfig.ai.includeAttachmentsInHistory;
                            })}
                            hidden={!matchesBlockItem('advanced', 'include attachments in history')}
                            bind:checked={config.ai.includeAttachmentsInHistory}
                        />
                    </div>
                </details>
            {/if}

            {#if showUsageLimits && canEditWindowOverrides}
                <details class="quick-details border-t pt-4" open={hasSearch}>
                    <summary class="cursor-pointer select-none font-medium">Usage Limits</summary>
                    <div class="mt-4 grid gap-3 md:grid-cols-2">
                        <SettingInputField
                            id="c-req-free-chat-max"
                            type="number"
                            label="Free tier per-chat max requests"
                            description="Chat-wide free-tier limit before cost mode."
                            sourceState={sourceStateFor('requestWindowPerChat.free.maxRequests', () => {
                                config.requestWindowPerChat.free.maxRequests =
                                    baseConfig.requestWindowPerChat.free.maxRequests;
                            })}
                            hidden={!matchesBlockItem('usage limits', 'free tier per-chat max requests')}
                            bind:value={config.requestWindowPerChat.free.maxRequests}
                        />
                        <SettingInputField
                            id="c-req-free-chat-window"
                            type="number"
                            label="Free tier per-chat window (minutes)"
                            description="Rolling window for free-tier chat usage."
                            sourceState={sourceStateFor('requestWindowPerChat.free.windowMinutes', () => {
                                config.requestWindowPerChat.free.windowMinutes =
                                    baseConfig.requestWindowPerChat.free.windowMinutes;
                            })}
                            hidden={!matchesBlockItem('usage limits', 'free tier per-chat window minutes')}
                            bind:value={config.requestWindowPerChat.free.windowMinutes}
                        />
                        <SettingInputField
                            id="c-req-trusted-chat-max"
                            type="number"
                            label="Trusted tier per-chat max requests"
                            description="Chat-wide trusted-tier limit before cost mode."
                            sourceState={sourceStateFor('requestWindowPerChat.trusted.maxRequests', () => {
                                config.requestWindowPerChat.trusted.maxRequests =
                                    baseConfig.requestWindowPerChat.trusted.maxRequests;
                            })}
                            hidden={!matchesBlockItem('usage limits', 'trusted tier per-chat max requests')}
                            bind:value={config.requestWindowPerChat.trusted.maxRequests}
                        />
                        <SettingInputField
                            id="c-req-trusted-chat-window"
                            type="number"
                            label="Trusted tier per-chat window (minutes)"
                            description="Rolling window for trusted-tier chat usage."
                            sourceState={sourceStateFor('requestWindowPerChat.trusted.windowMinutes', () => {
                                config.requestWindowPerChat.trusted.windowMinutes =
                                    baseConfig.requestWindowPerChat.trusted.windowMinutes;
                            })}
                            hidden={!matchesBlockItem('usage limits', 'trusted tier per-chat window minutes')}
                            bind:value={config.requestWindowPerChat.trusted.windowMinutes}
                        />
                    </div>
                </details>
            {/if}
        {/if}

    </div>
</section>

<style>
    :global(.config-form details.quick-details[open] > div) {
        max-height: none;
        overflow: visible;
    }
</style>
