<script lang="ts">
    import SettingInputField from '$lib/components/config/fields/SettingInputField.svelte';
    import SettingMatcherListField from '$lib/components/config/fields/SettingMatcherListField.svelte';
    import SettingReactionBlacklistField from '$lib/components/config/fields/SettingReactionBlacklistField.svelte';
    import SettingSelectField from '$lib/components/config/fields/SettingSelectField.svelte';
    import SettingStringListField from '$lib/components/config/fields/SettingStringListField.svelte';
    import SettingTextareaField from '$lib/components/config/fields/SettingTextareaField.svelte';
    import SettingToggleField from '$lib/components/config/fields/SettingToggleField.svelte';
    import { createSectionMatcher } from '$lib/components/config/search';
    import type { GlobalFormText, UserConfigPayload } from '$lib/config/model';

    interface Props {
        config: UserConfigPayload;
        text: GlobalFormText;
        availableModels: string[];
        availableReactions: string[];
        isAdmin: boolean;
        searchQuery: string;
    }

    let {
        config = $bindable(),
        text = $bindable(),
        availableModels = [],
        availableReactions = [],
        isAdmin = false,
        searchQuery = '',
    }: Props = $props();

    let sectionMatcher = $derived(createSectionMatcher(searchQuery));
    let hasSearch = $derived(sectionMatcher.hasSearch);

    const matchesSection = (...terms: string[]): boolean => sectionMatcher.matchesSection(...terms);

    const matchesBlockItem = (section: string, ...terms: string[]): boolean =>
        sectionMatcher.matchesBlockItem(section, ...terms);

    let showGeneral = $derived(
        matchesSection(
            'general',
            'start message',
            'file retention',
            'reply tendency',
            'ignore tendency',
            'random reply chance',
            'response delay',
            'bot names',
            'reply trigger patterns',
            'ignore trigger patterns',
            'nepon replies',
        ),
    );
    let showModel = $derived(
        matchesSection(
            'model',
            'primary model',
            'notes model',
            'memory model',
            'temperature',
            'top-k',
            'top-p',
        ),
    );
    let showPrompts = $derived(
        matchesSection(
            'prompts',
            'json-actions preface prompt',
            'plain-text preface prompt',
            'json-actions chat prompt',
            'plain-text chat prompt',
            'system preface prompt',
            'primary chat prompt',
            'low-context chat prompt',
            'low-context preface prompt',
            'private chat prompt addition',
            'group chat prompt addition',
            'comment prompt addition',
            'hate mode prompt',
            'json-actions final prompt wrapper',
            'plain-text final prompt wrapper',
            'final prompt wrapper',
            'chat actions tool description',
            'chat reactions tool description',
            'low-context final wrapper',
            'notes extraction prompt',
            'memory prompt',
            'memory repeat prompt',
        ),
    );
    let showAdvanced = $derived(
        matchesSection(
            'advanced',
            'history version',
            'max notes to store',
            'max messages to store',
            'recent messages for notes',
            'recent messages for memory',
            'messages passed to ai',
            'reply method',
            'max output tokens',
            'notes max output tokens',
            'thinking budget',
            'reasoning max tokens',
            'notes update frequency',
            'memory update frequency',
            'max reply length',
            'attachment byte limit',
            'include attachments in history',
        ),
    );
    let showAdmin = $derived(
        matchesSection(
            'admin',
            'admin user ids',
            'trusted user ids',
            'allowed model names',
            'model selector',
            'blacklisted reactions',
        ),
    );
    let hasMatches = $derived(
        showGeneral || showModel || showPrompts || showAdvanced || showAdmin,
    );
</script>

<section class="config-form space-y-6">
    <header class="space-y-1 pb-4">
        <h2 class="text-lg font-semibold">Global Config</h2>
        <p class="text-sm text-muted-foreground">Admin-only settings and internal prompts.</p>
    </header>

    <div class="space-y-5">
        {#if hasSearch && !hasMatches}
            <p class="text-sm text-muted-foreground">No global settings match "{searchQuery.trim()}".</p>
        {/if}

        {#if showGeneral}
            <details open class="quick-details border-t pt-4">
                <summary class="cursor-pointer font-medium">General</summary>
                <div class="mt-4 space-y-6">
                    <div class="grid gap-3 md:grid-cols-2">
                        <SettingInputField
                            id="g-start-message"
                            label="Start message"
                            description="Shown when someone starts the bot."
                            hidden={!matchesBlockItem('general', 'start message')}
                            bind:value={config.startMessage}
                        />
                        <SettingInputField
                            id="g-files-max-age"
                            type="number"
                            label="File retention (hours)"
                            description="How long uploaded files remain available."
                            hidden={!matchesBlockItem('general', 'file retention', 'files max age')}
                            bind:value={config.filesMaxAge}
                        />
                        <SettingInputField
                            id="g-tend-reply-prob"
                            type="number"
                            label="Reply tendency (%)"
                            description="Chance to answer when a match is in tend-to-reply."
                            hidden={!matchesBlockItem('general', 'reply tendency', 'tend to reply probability')}
                            bind:value={config.tendToReplyProbability}
                        />
                        <SettingInputField
                            id="g-tend-ignore-prob"
                            type="number"
                            label="Ignore tendency (%)"
                            description="Chance to stay silent when a match is in tend-to-ignore."
                            hidden={!matchesBlockItem('general', 'ignore tendency', 'tend to ignore probability')}
                            bind:value={config.tendToIgnoreProbability}
                        />
                        <SettingInputField
                            id="g-random-reply-prob"
                            type="number"
                            label="Random reply chance (%)"
                            description="Fallback probability to reply with no explicit match."
                            hidden={!matchesBlockItem('general', 'random reply chance', 'random reply probability')}
                            bind:value={config.randomReplyProbability}
                        />
                        <SettingInputField
                            id="g-response-delay"
                            type="number"
                            label="Response delay (seconds)"
                            description="Wait time before sending a reply."
                            hidden={!matchesBlockItem('general', 'response delay')}
                            bind:value={config.responseDelay}
                        />
                    </div>

                    <div class="grid gap-3 md:grid-cols-2">
                        <SettingMatcherListField
                            id="g-names"
                            label="Bot names"
                            description="One name or regex per line; used for mention matching."
                            hidden={!matchesBlockItem('general', 'bot names', 'names')}
                            bind:value={text.names}
                        />
                        <SettingMatcherListField
                            id="g-tend-reply"
                            label="Reply trigger patterns"
                            description="One pattern per line; supports /regex/flags."
                            hidden={!matchesBlockItem('general', 'reply trigger patterns', 'tend to reply')}
                            bind:value={text.tendToReply}
                        />
                        <SettingMatcherListField
                            id="g-tend-ignore"
                            label="Ignore trigger patterns"
                            description="One pattern per line; supports /regex/flags."
                            hidden={!matchesBlockItem('general', 'ignore trigger patterns', 'tend to ignore')}
                            bind:value={text.tendToIgnore}
                        />
                        <SettingStringListField
                            id="g-nepons"
                            label="Nepon replies"
                            description="Add, reorder, and remove canned fallback messages."
                            itemPlaceholder="Fallback reply"
                            addLabel="Add reply"
                            hidden={!matchesBlockItem('general', 'nepon replies', 'nepons')}
                            bind:value={text.nepons}
                        />
                    </div>
                </div>
            </details>
        {/if}

        {#if showModel}
            <details class="quick-details border-t pt-4" open={hasSearch}>
                <summary class="cursor-pointer font-medium">Model</summary>
                <div class="mt-4 grid gap-3 md:grid-cols-2">
                    <SettingSelectField
                        id="g-ai-model"
                        label="Primary model"
                        description="Main model used for chat responses."
                        options={availableModels}
                        hidden={!matchesBlockItem('model', 'primary model', 'ai model')}
                        bind:value={config.ai.model}
                    />
                    <SettingSelectField
                        id="g-ai-notes-model"
                        label="Notes model"
                        description="Model used for note extraction and updates."
                        options={availableModels}
                        hidden={!matchesBlockItem('model', 'notes model')}
                        bind:value={config.ai.notesModel}
                    />
                    <SettingSelectField
                        id="g-ai-memory-model"
                        label="Memory model"
                        description="Model used for memory summarization tasks."
                        options={availableModels}
                        hidden={!matchesBlockItem('model', 'memory model')}
                        bind:value={config.ai.memoryModel}
                    />
                    <SettingInputField
                        id="g-ai-temp"
                        type="number"
                        label="Temperature"
                        description="Higher values increase randomness."
                        hidden={!matchesBlockItem('model', 'temperature')}
                        bind:value={config.ai.temperature}
                    />
                    <SettingInputField
                        id="g-ai-topk"
                        type="number"
                        label="Top-K"
                        description="Limits token choices to the top K candidates."
                        hidden={!matchesBlockItem('model', 'top-k', 'topk')}
                        bind:value={config.ai.topK}
                    />
                    <SettingInputField
                        id="g-ai-topp"
                        type="number"
                        label="Top-P"
                        description="Uses nucleus sampling with cumulative probability P."
                        hidden={!matchesBlockItem('model', 'top-p', 'topp')}
                        bind:value={config.ai.topP}
                    />
                </div>
            </details>
        {/if}

        {#if showPrompts}
            <details class="quick-details border-t pt-4" open={hasSearch}>
                <summary class="cursor-pointer font-medium">Prompts</summary>
                <div class="mt-4 grid gap-3 md:grid-cols-2">
                    <SettingTextareaField
                        id="g-ai-preprompt"
                        rows={4}
                        containerClass="md:col-span-2"
                        label="JSON-actions preface prompt"
                        description="Prepended context used only when reply method is json_actions."
                        hidden={!matchesBlockItem('prompts', 'json-actions preface prompt', 'system preface prompt', 'preprompt')}
                        bind:value={config.ai.prePrompt}
                    />
                    <SettingTextareaField
                        id="g-ai-dumb-preprompt"
                        rows={3}
                        containerClass="md:col-span-2"
                        label="Plain-text preface prompt"
                        description="Prepended context used only when reply method is plain_text_reactions."
                        hidden={!matchesBlockItem('prompts', 'plain-text preface prompt', 'low-context preface prompt', 'dumb preprompt')}
                        bind:value={config.ai.dumbPrePrompt}
                    />
                    <SettingTextareaField
                        id="g-ai-prompt"
                        rows={4}
                        containerClass="md:col-span-2"
                        label="JSON-actions chat prompt"
                        description="Core behavior/persona prompt used only in json_actions mode."
                        hidden={!matchesBlockItem('prompts', 'json-actions chat prompt', 'primary chat prompt')}
                        bind:value={config.ai.prompt}
                    />
                    <SettingTextareaField
                        id="g-ai-dumb-prompt"
                        rows={3}
                        containerClass="md:col-span-2"
                        label="Plain-text chat prompt"
                        description="Core behavior/persona prompt used only in plain_text_reactions mode."
                        hidden={!matchesBlockItem('prompts', 'plain-text chat prompt', 'low-context chat prompt', 'dumb prompt')}
                        bind:value={config.ai.dumbPrompt}
                    />
                    <SettingTextareaField
                        id="g-ai-private-addition"
                        rows={3}
                        containerClass="md:col-span-2"
                        label="Private chat prompt addition"
                        description="Extra instructions for private chats only."
                        hidden={!matchesBlockItem('prompts', 'private chat prompt addition')}
                        bind:value={config.ai.privateChatPromptAddition}
                    />
                    <SettingTextareaField
                        id="g-ai-group-addition"
                        rows={3}
                        containerClass="md:col-span-2"
                        label="Group chat prompt addition"
                        description="Extra instructions for group chats only."
                        hidden={!matchesBlockItem('prompts', 'group chat prompt addition')}
                        bind:value={config.ai.groupChatPromptAddition}
                    />
                    <SettingTextareaField
                        id="g-ai-comments-addition"
                        rows={3}
                        containerClass="md:col-span-2"
                        label="Comment prompt addition"
                        description="Extra guidance when replying to comment-style messages."
                        hidden={!matchesBlockItem('prompts', 'comment prompt addition', 'comments prompt addition')}
                        bind:value={config.ai.commentsPromptAddition}
                    />
                    <SettingTextareaField
                        id="g-ai-hate-prompt"
                        rows={3}
                        containerClass="md:col-span-2"
                        label="Hate mode prompt"
                        description="Special prompt used when hate mode is enabled."
                        hidden={!matchesBlockItem('prompts', 'hate mode prompt')}
                        bind:value={config.ai.hateModePrompt}
                    />
                    <SettingTextareaField
                        id="g-ai-final-prompt"
                        rows={4}
                        containerClass="md:col-span-2"
                        label="JSON-actions final prompt wrapper"
                        description="Last instruction template used only in json_actions mode."
                        hidden={!matchesBlockItem('prompts', 'json-actions final prompt wrapper', 'final prompt wrapper', 'final prompt')}
                        bind:value={config.ai.finalPrompt}
                    />
                    <SettingTextareaField
                        id="g-ai-dumb-final"
                        rows={3}
                        containerClass="md:col-span-2"
                        label="Plain-text final prompt wrapper"
                        description="Last instruction template used only in plain_text_reactions mode."
                        hidden={!matchesBlockItem('prompts', 'plain-text final prompt wrapper', 'low-context final wrapper', 'dumb final prompt')}
                        bind:value={config.ai.dumbFinalPrompt}
                    />
                    <SettingTextareaField
                        id="g-ai-tool-description"
                        rows={4}
                        containerClass="md:col-span-2"
                        label="Chat actions tool description"
                        description="Schema and guidance injected into send_chat_actions tool description."
                        hidden={!matchesBlockItem('prompts', 'chat actions tool description', 'tool description', 'chatActionsToolDescription')}
                        bind:value={config.ai.chatActionsToolDescription}
                    />
                    <SettingTextareaField
                        id="g-ai-chat-reactions"
                        rows={3}
                        containerClass="md:col-span-2"
                        label="Chat reactions tool description"
                        description="Tool description for send_chat_reactions used in plain_text_reactions mode to add reactions after text replies."
                        hidden={!matchesBlockItem('prompts', 'chat reactions tool description', 'reactions tool', 'chatReactionsToolDescription')}
                        bind:value={config.ai.chatReactionsToolDescription}
                    />
                    <SettingTextareaField
                        id="g-ai-notes-prompt"
                        rows={4}
                        containerClass="md:col-span-2"
                        label="Notes extraction prompt"
                        description="Template for generating structured notes."
                        hidden={!matchesBlockItem('prompts', 'notes extraction prompt', 'notes prompt')}
                        bind:value={config.ai.notesPrompt}
                    />
                    <SettingTextareaField
                        id="g-ai-memory-prompt"
                        rows={4}
                        containerClass="md:col-span-2"
                        label="Memory prompt"
                        description="Template for creating memory summaries."
                        hidden={!matchesBlockItem('prompts', 'memory prompt')}
                        bind:value={config.ai.memoryPrompt}
                    />
                    <SettingTextareaField
                        id="g-ai-memory-repeat"
                        rows={4}
                        containerClass="md:col-span-2"
                        label="Memory repeat prompt"
                        description="Template used when refreshing existing memory."
                        hidden={!matchesBlockItem('prompts', 'memory repeat prompt')}
                        bind:value={config.ai.memoryPromptRepeat}
                    />
                </div>
            </details>
        {/if}

        {#if showAdvanced}
            <details class="quick-details border-t pt-4" open={hasSearch}>
                <summary class="cursor-pointer font-medium">Advanced</summary>
                <div class="mt-4 grid gap-3 md:grid-cols-2">
                    <SettingInputField
                        id="g-max-notes"
                        type="number"
                        label="Max notes to store"
                        description="Upper limit for saved notes per chat."
                        hidden={!matchesBlockItem('advanced', 'max notes to store')}
                        bind:value={config.maxNotesToStore}
                    />
                    <SettingInputField
                        id="g-max-messages"
                        type="number"
                        label="Max messages to store"
                        description="Conversation history cap kept in storage (up to 10000)."
                        hidden={!matchesBlockItem('advanced', 'max messages to store')}
                        bind:value={config.maxMessagesToStore}
                    />
                    <SettingInputField
                        id="g-chat-last-notes"
                        type="number"
                        label="Recent messages for notes"
                        description="How many latest messages feed note updates."
                        hidden={!matchesBlockItem('advanced', 'recent messages for notes', 'chat last use notes')}
                        bind:value={config.chatLastUseNotes}
                    />
                    <SettingInputField
                        id="g-chat-last-memory"
                        type="number"
                        label="Recent messages for memory"
                        description="How many latest messages feed memory updates."
                        hidden={!matchesBlockItem('advanced', 'recent messages for memory', 'chat last use memory')}
                        bind:value={config.chatLastUseMemory}
                    />
                    <SettingInputField
                        id="g-ai-msgs"
                        type="number"
                        label="Messages passed to AI"
                        description="Number of recent messages sent to the model."
                        hidden={!matchesBlockItem('advanced', 'messages passed to ai')}
                        bind:value={config.ai.messagesToPass}
                    />
                    <SettingInputField
                        id="g-ai-max-output-tokens"
                        type="number"
                        label="Max output tokens"
                        description="Hard cap for generated tokens in chat responses."
                        hidden={!matchesBlockItem('advanced', 'max output tokens')}
                        bind:value={config.ai.generation.chat.maxOutputTokens}
                    />
                    <SettingInputField
                        id="g-ai-notes-max-output-tokens"
                        type="number"
                        label="Notes max output tokens"
                        description="Hard cap for generated tokens in notes updates."
                        hidden={!matchesBlockItem('advanced', 'notes max output tokens')}
                        bind:value={config.ai.generation.notes.maxOutputTokens}
                    />
                    <SettingInputField
                        id="g-ai-thinking-budget"
                        type="number"
                        label="Thinking budget"
                        description="Google thinking token budget for chat generation."
                        hidden={!matchesBlockItem('advanced', 'thinking budget')}
                        bind:value={config.ai.generation.chat.thinking.thinkingBudget}
                    />
                    <SettingInputField
                        id="g-ai-reasoning-max-tokens"
                        type="number"
                        label="Reasoning max tokens"
                        description="OpenRouter reasoning token budget for chat generation."
                        hidden={!matchesBlockItem('advanced', 'reasoning max tokens', 'openrouter reasoning max tokens')}
                        bind:value={config.ai.generation.chat.openrouterReasoning.maxTokens}
                    />
                    <SettingInputField
                        id="g-ai-notes-freq"
                        type="number"
                        label="Notes update frequency"
                        description="Message interval between notes updates."
                        hidden={!matchesBlockItem('advanced', 'notes update frequency')}
                        bind:value={config.ai.notesFrequency}
                    />
                    <SettingInputField
                        id="g-ai-memory-freq"
                        type="number"
                        label="Memory update frequency"
                        description="Message interval between memory updates."
                        hidden={!matchesBlockItem('advanced', 'memory update frequency')}
                        bind:value={config.ai.memoryFrequency}
                    />
                    <SettingInputField
                        id="g-ai-max-len"
                        type="number"
                        label="Max reply length (chars)"
                        description="Soft limit for generated response length."
                        hidden={!matchesBlockItem('advanced', 'max reply length', 'message max length')}
                        bind:value={config.ai.messageMaxLength}
                    />
                    <SettingInputField
                        id="g-ai-bytes"
                        type="number"
                        label="Attachment byte limit"
                        description="Maximum attachment size included in processing."
                        hidden={!matchesBlockItem('advanced', 'attachment byte limit', 'bytes limit')}
                        bind:value={config.ai.bytesLimit}
                    />
                    <SettingSelectField
                        id="g-ai-history-version"
                        label="History version"
                        description="Selects history builder strategy used in chat generation."
                        options={['v2', 'v3']}
                        hidden={!matchesBlockItem('advanced', 'history version', 'ai.historyVersion')}
                        bind:value={config.ai.historyVersion}
                    />
                    <SettingSelectField
                        id="g-ai-reply-method"
                        label="Reply method"
                        description="Chooses how replies and reactions are generated."
                        options={['json_actions', 'plain_text_reactions']}
                        hidden={!matchesBlockItem('advanced', 'reply method', 'ai.replyMethod')}
                        bind:value={config.ai.replyMethod}
                    />
                    <SettingToggleField
                        id="g-ai-attachments"
                        label="Include attachments in history"
                        description="Adds attachment text to model context when possible."
                        hidden={!matchesBlockItem('advanced', 'include attachments in history')}
                        bind:checked={config.ai.includeAttachmentsInHistory}
                    />
                </div>
            </details>
        {/if}

        {#if showAdmin}
            <details class="quick-details border-t pt-4" open={hasSearch}>
                <summary class="cursor-pointer font-medium">Admin</summary>
                <div class="mt-4 space-y-3">
                    {#if isAdmin}
                        <SettingReactionBlacklistField
                            id="g-blacklisted-reactions"
                            label="Blacklisted reactions"
                            description="Select reactions to block globally."
                            reactions={availableReactions}
                            hidden={!matchesBlockItem('admin', 'blacklisted reactions', 'reactions')}
                            bind:value={text.blacklistedReactions}
                        />
                    {/if}
                    <SettingStringListField
                        id="g-admin-ids"
                        label="Admin user IDs"
                        description="Telegram numeric IDs with admin access."
                        itemPlaceholder="123456789"
                        addLabel="Add admin"
                        numericOnly
                        allowDuplicates={false}
                        hidden={!matchesBlockItem('admin', 'admin user ids', 'admin ids')}
                        bind:value={text.adminIds}
                    />
                    <SettingStringListField
                        id="g-trusted-ids"
                        label="Trusted user IDs"
                        description="Telegram numeric IDs with trusted access."
                        itemPlaceholder="123456789"
                        addLabel="Add trusted"
                        numericOnly
                        allowDuplicates={false}
                        hidden={!matchesBlockItem('admin', 'trusted user ids', 'trusted ids')}
                        bind:value={text.trustedIds}
                    />
                    <SettingStringListField
                        id="g-available-models"
                        label="Allowed model names"
                        description="Allow-list used by model selectors."
                        itemPlaceholder="provider/model-id"
                        addLabel="Add model"
                        suggestions={availableModels}
                        allowDuplicates={false}
                        hidden={!matchesBlockItem('admin', 'allowed model names', 'available models')}
                        bind:value={text.availableModels}
                    />
                    <p class="text-xs text-muted-foreground" hidden={!matchesBlockItem('admin', 'model selector')}>Trusted model selector currently has {availableModels.length} options.</p>
                </div>
            </details>
        {/if}

    </div>
</section>

<style>
    :global(.config-form details.quick-details[open] > div) {
        max-height: none;
        overflow: visible;
    }
</style>
