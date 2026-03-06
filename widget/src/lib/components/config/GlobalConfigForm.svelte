<script lang="ts">
    import { Button } from '$lib/components/ui/button';
    import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '$lib/components/ui/card';
    import { Input } from '$lib/components/ui/input';
    import { Label } from '$lib/components/ui/label';
    import { Switch } from '$lib/components/ui/switch';
    import { Textarea } from '$lib/components/ui/textarea';
    import type { GlobalFormText, UserConfigPayload } from '$lib/config/model';

    interface Props {
        config: UserConfigPayload;
        text: GlobalFormText;
        availableModels: string[];
        canSave: boolean;
        onSave: () => void;
    }

    let { config = $bindable(), text = $bindable(), availableModels = [], canSave, onSave }: Props = $props();
</script>

<Card>
    <CardHeader>
        <CardTitle>Global Config</CardTitle>
        <CardDescription>Admin-only settings and internal prompts.</CardDescription>
    </CardHeader>
    <CardContent class="space-y-4">
        <details open class="quick-details rounded-md border p-3">
            <summary class="cursor-pointer font-medium">General</summary>
            <div class="mt-4 space-y-6">
                <div class="grid gap-3 md:grid-cols-2">
                    <div class="space-y-2"><Label for="g-start-message">startMessage</Label><Input id="g-start-message" bind:value={config.startMessage} /></div>
                    <div class="space-y-2"><Label for="g-files-max-age">filesMaxAge</Label><Input id="g-files-max-age" type="number" bind:value={config.filesMaxAge} /></div>
                    <div class="space-y-2"><Label for="g-tend-reply-prob">tendToReplyProbability</Label><Input id="g-tend-reply-prob" type="number" bind:value={config.tendToReplyProbability} /></div>
                    <div class="space-y-2"><Label for="g-tend-ignore-prob">tendToIgnoreProbability</Label><Input id="g-tend-ignore-prob" type="number" bind:value={config.tendToIgnoreProbability} /></div>
                    <div class="space-y-2"><Label for="g-random-reply-prob">randomReplyProbability</Label><Input id="g-random-reply-prob" type="number" bind:value={config.randomReplyProbability} /></div>
                    <div class="space-y-2"><Label for="g-response-delay">responseDelay</Label><Input id="g-response-delay" type="number" bind:value={config.responseDelay} /></div>
                </div>

                <div class="grid gap-3 md:grid-cols-2">
                    <div class="space-y-2"><Label for="g-names">names (one per line, /regex/flags)</Label><Textarea id="g-names" rows={5} bind:value={text.names} /></div>
                    <div class="space-y-2"><Label for="g-tend-reply">tendToReply (one per line, /regex/flags)</Label><Textarea id="g-tend-reply" rows={5} bind:value={text.tendToReply} /></div>
                    <div class="space-y-2"><Label for="g-tend-ignore">tendToIgnore (one per line, /regex/flags)</Label><Textarea id="g-tend-ignore" rows={5} bind:value={text.tendToIgnore} /></div>
                    <div class="space-y-2"><Label for="g-nepons">nepons (one per line)</Label><Textarea id="g-nepons" rows={5} bind:value={text.nepons} /></div>
                </div>
            </div>
        </details>

        <details class="quick-details rounded-md border p-3">
            <summary class="cursor-pointer font-medium">Model</summary>
            <div class="mt-4 grid gap-3 md:grid-cols-2">
                <div class="space-y-2">
                    <Label for="g-ai-model">ai.model</Label>
                    <select
                        id="g-ai-model"
                        class="h-10 w-full rounded-md border bg-transparent px-3 text-sm"
                        bind:value={config.ai.model}
                    >
                        {#each availableModels as model (model)}
                            <option value={model}>{model}</option>
                        {/each}
                    </select>
                </div>
                <div class="space-y-2">
                    <Label for="g-ai-notes-model">ai.notesModel</Label>
                    <select
                        id="g-ai-notes-model"
                        class="h-10 w-full rounded-md border bg-transparent px-3 text-sm"
                        bind:value={config.ai.notesModel}
                    >
                        {#each availableModels as model (model)}
                            <option value={model}>{model}</option>
                        {/each}
                    </select>
                </div>
                <div class="space-y-2">
                    <Label for="g-ai-memory-model">ai.memoryModel</Label>
                    <select
                        id="g-ai-memory-model"
                        class="h-10 w-full rounded-md border bg-transparent px-3 text-sm"
                        bind:value={config.ai.memoryModel}
                    >
                        {#each availableModels as model (model)}
                            <option value={model}>{model}</option>
                        {/each}
                    </select>
                </div>
                <div class="space-y-2"><Label for="g-ai-temp">ai.temperature</Label><Input id="g-ai-temp" type="number" bind:value={config.ai.temperature} /></div>
                <div class="space-y-2"><Label for="g-ai-topk">ai.topK</Label><Input id="g-ai-topk" type="number" bind:value={config.ai.topK} /></div>
                <div class="space-y-2"><Label for="g-ai-topp">ai.topP</Label><Input id="g-ai-topp" type="number" bind:value={config.ai.topP} /></div>
            </div>
        </details>

        <details class="quick-details rounded-md border p-3">
            <summary class="cursor-pointer font-medium">Prompts</summary>
            <div class="mt-4 grid gap-3 md:grid-cols-2">
                <div class="space-y-2 md:col-span-2"><Label for="g-ai-preprompt">ai.prePrompt</Label><Textarea id="g-ai-preprompt" rows={4} bind:value={config.ai.prePrompt} /></div>
                <div class="space-y-2 md:col-span-2"><Label for="g-ai-prompt">ai.prompt</Label><Textarea id="g-ai-prompt" rows={4} bind:value={config.ai.prompt} /></div>
                <div class="space-y-2 md:col-span-2"><Label for="g-ai-dumb-prompt">ai.dumbPrompt</Label><Textarea id="g-ai-dumb-prompt" rows={3} bind:value={config.ai.dumbPrompt} /></div>
                <div class="space-y-2 md:col-span-2"><Label for="g-ai-dumb-preprompt">ai.dumbPrePrompt</Label><Textarea id="g-ai-dumb-preprompt" rows={3} bind:value={config.ai.dumbPrePrompt} /></div>
                <div class="space-y-2 md:col-span-2"><Label for="g-ai-private-addition">ai.privateChatPromptAddition</Label><Textarea id="g-ai-private-addition" rows={3} bind:value={config.ai.privateChatPromptAddition} /></div>
                <div class="space-y-2 md:col-span-2"><Label for="g-ai-group-addition">ai.groupChatPromptAddition</Label><Textarea id="g-ai-group-addition" rows={3} bind:value={config.ai.groupChatPromptAddition} /></div>
                <div class="space-y-2 md:col-span-2"><Label for="g-ai-comments-addition">ai.commentsPromptAddition</Label><Textarea id="g-ai-comments-addition" rows={3} bind:value={config.ai.commentsPromptAddition} /></div>
                <div class="space-y-2 md:col-span-2"><Label for="g-ai-hate-prompt">ai.hateModePrompt</Label><Textarea id="g-ai-hate-prompt" rows={3} bind:value={config.ai.hateModePrompt} /></div>
                <div class="space-y-2 md:col-span-2"><Label for="g-ai-final-prompt">ai.finalPrompt</Label><Textarea id="g-ai-final-prompt" rows={4} bind:value={config.ai.finalPrompt} /></div>
                <div class="space-y-2 md:col-span-2"><Label for="g-ai-dumb-final">ai.dumbFinalPrompt</Label><Textarea id="g-ai-dumb-final" rows={3} bind:value={config.ai.dumbFinalPrompt} /></div>
                <div class="space-y-2 md:col-span-2"><Label for="g-ai-notes-prompt">ai.notesPrompt</Label><Textarea id="g-ai-notes-prompt" rows={4} bind:value={config.ai.notesPrompt} /></div>
                <div class="space-y-2 md:col-span-2"><Label for="g-ai-memory-prompt">ai.memoryPrompt</Label><Textarea id="g-ai-memory-prompt" rows={4} bind:value={config.ai.memoryPrompt} /></div>
                <div class="space-y-2 md:col-span-2"><Label for="g-ai-memory-repeat">ai.memoryPromptRepeat</Label><Textarea id="g-ai-memory-repeat" rows={4} bind:value={config.ai.memoryPromptRepeat} /></div>
            </div>
        </details>

        <details class="quick-details rounded-md border p-3">
            <summary class="cursor-pointer font-medium">Advanced</summary>
            <div class="mt-4 grid gap-3 md:grid-cols-2">
                <div class="space-y-2"><Label for="g-max-notes">maxNotesToStore</Label><Input id="g-max-notes" type="number" bind:value={config.maxNotesToStore} /></div>
                <div class="space-y-2"><Label for="g-max-messages">maxMessagesToStore</Label><Input id="g-max-messages" type="number" bind:value={config.maxMessagesToStore} /></div>
                <div class="space-y-2"><Label for="g-chat-last-notes">chatLastUseNotes</Label><Input id="g-chat-last-notes" type="number" bind:value={config.chatLastUseNotes} /></div>
                <div class="space-y-2"><Label for="g-chat-last-memory">chatLastUseMemory</Label><Input id="g-chat-last-memory" type="number" bind:value={config.chatLastUseMemory} /></div>
                <div class="space-y-2"><Label for="g-ai-msgs">ai.messagesToPass</Label><Input id="g-ai-msgs" type="number" bind:value={config.ai.messagesToPass} /></div>
                <div class="space-y-2"><Label for="g-ai-notes-freq">ai.notesFrequency</Label><Input id="g-ai-notes-freq" type="number" bind:value={config.ai.notesFrequency} /></div>
                <div class="space-y-2"><Label for="g-ai-memory-freq">ai.memoryFrequency</Label><Input id="g-ai-memory-freq" type="number" bind:value={config.ai.memoryFrequency} /></div>
                <div class="space-y-2"><Label for="g-ai-max-len">ai.messageMaxLength</Label><Input id="g-ai-max-len" type="number" bind:value={config.ai.messageMaxLength} /></div>
                <div class="space-y-2"><Label for="g-ai-bytes">ai.bytesLimit</Label><Input id="g-ai-bytes" type="number" bind:value={config.ai.bytesLimit} /></div>
                <div class="flex items-center justify-between rounded-md border p-3"><Label for="g-ai-json">ai.useJsonResponses</Label><Switch id="g-ai-json" bind:checked={config.ai.useJsonResponses} /></div>
                <div class="flex items-center justify-between rounded-md border p-3"><Label for="g-ai-attachments">ai.includeAttachmentsInHistory</Label><Switch id="g-ai-attachments" bind:checked={config.ai.includeAttachmentsInHistory} /></div>
            </div>
        </details>

        <details class="quick-details rounded-md border p-3">
            <summary class="cursor-pointer font-medium">Admin</summary>
            <div class="mt-4 space-y-3">
                <div class="space-y-2"><Label for="g-admin-ids">adminIds (one number per line)</Label><Textarea id="g-admin-ids" rows={4} bind:value={text.adminIds} /></div>
                <div class="space-y-2"><Label for="g-trusted-ids">trustedIds (one number per line)</Label><Textarea id="g-trusted-ids" rows={4} bind:value={text.trustedIds} /></div>
                <div class="space-y-2"><Label for="g-available-models">availableModels (one per line)</Label><Textarea id="g-available-models" rows={4} bind:value={text.availableModels} /></div>
                <p class="text-xs text-muted-foreground">Trusted model selector currently has {availableModels.length} options.</p>
            </div>
        </details>

        <Button onclick={onSave} disabled={!canSave}>Save global</Button>
    </CardContent>
</Card>
