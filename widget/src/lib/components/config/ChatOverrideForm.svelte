<script lang="ts">
    import { Button } from '$lib/components/ui/button';
    import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '$lib/components/ui/card';
    import { Input } from '$lib/components/ui/input';
    import { Label } from '$lib/components/ui/label';
    import { Switch } from '$lib/components/ui/switch';
    import { Textarea } from '$lib/components/ui/textarea';
    import type { ChatFormText, ResolvedChatOverridePayload } from '$lib/config/model';

    interface Props {
        config: ResolvedChatOverridePayload;
        text: ChatFormText;
        availableModels: string[];
        canConfigureTrustedSettings: boolean;
        canSave: boolean;
        onSave: () => void;
    }

    let {
        config = $bindable(),
        text = $bindable(),
        availableModels = [],
        canConfigureTrustedSettings,
        canSave,
        onSave,
    }: Props = $props();
</script>

<Card>
    <CardHeader>
        <CardTitle>Chat Override</CardTitle>
        <CardDescription>Role-based chat settings with safe defaults.</CardDescription>
    </CardHeader>
    <CardContent class="space-y-4">
        <details open class="rounded-md border p-3">
            <summary class="cursor-pointer font-medium">General</summary>
            <div class="mt-4 space-y-6">
                <div class="grid gap-3 md:grid-cols-2">
                    <div class="space-y-2"><Label for="c-tend-reply-prob">tendToReplyProbability</Label><Input id="c-tend-reply-prob" type="number" bind:value={config.tendToReplyProbability} /></div>
                    <div class="space-y-2"><Label for="c-tend-ignore-prob">tendToIgnoreProbability</Label><Input id="c-tend-ignore-prob" type="number" bind:value={config.tendToIgnoreProbability} /></div>
                    <div class="space-y-2"><Label for="c-random-reply-prob">randomReplyProbability</Label><Input id="c-random-reply-prob" type="number" bind:value={config.randomReplyProbability} /></div>
                    <div class="space-y-2"><Label for="c-response-delay">responseDelay</Label><Input id="c-response-delay" type="number" bind:value={config.responseDelay} /></div>
                </div>

                <div class="grid gap-3 md:grid-cols-2">
                    <div class="space-y-2"><Label for="c-names">names (one per line, /regex/flags)</Label><Textarea id="c-names" rows={5} bind:value={text.names} /></div>
                    <div class="space-y-2"><Label for="c-tend-reply">tendToReply (one per line, /regex/flags)</Label><Textarea id="c-tend-reply" rows={5} bind:value={text.tendToReply} /></div>
                    <div class="space-y-2"><Label for="c-tend-ignore">tendToIgnore (one per line, /regex/flags)</Label><Textarea id="c-tend-ignore" rows={5} bind:value={text.tendToIgnore} /></div>
                    <div class="space-y-2"><Label for="c-nepons">nepons (one per line)</Label><Textarea id="c-nepons" rows={5} bind:value={text.nepons} /></div>
                </div>
            </div>
        </details>

        {#if canConfigureTrustedSettings}
            <details class="rounded-md border p-3">
                <summary class="cursor-pointer font-medium">Model</summary>
                <div class="mt-4 grid gap-3 md:grid-cols-2">
                    <div class="space-y-2">
                        <Label for="c-ai-model">ai.model</Label>
                        <select
                            id="c-ai-model"
                            class="h-10 w-full rounded-md border bg-transparent px-3 text-sm"
                            bind:value={config.ai.model}
                        >
                            {#each availableModels as model (model)}
                                <option value={model}>{model}</option>
                            {/each}
                        </select>
                    </div>
                    <div class="space-y-2"><Label for="c-ai-temp">ai.temperature</Label><Input id="c-ai-temp" type="number" bind:value={config.ai.temperature} /></div>
                    <div class="space-y-2"><Label for="c-ai-topk">ai.topK</Label><Input id="c-ai-topk" type="number" bind:value={config.ai.topK} /></div>
                    <div class="space-y-2"><Label for="c-ai-topp">ai.topP</Label><Input id="c-ai-topp" type="number" bind:value={config.ai.topP} /></div>
                </div>
            </details>

            <details class="rounded-md border p-3">
                <summary class="cursor-pointer font-medium">Prompts</summary>
                <div class="mt-4 grid gap-3 md:grid-cols-2">
                    <div class="space-y-2 md:col-span-2"><Label for="c-ai-prompt">ai.prompt</Label><Textarea id="c-ai-prompt" rows={4} bind:value={config.ai.prompt} /></div>
                    <div class="space-y-2 md:col-span-2"><Label for="c-ai-dumb-prompt">ai.dumbPrompt</Label><Textarea id="c-ai-dumb-prompt" rows={3} bind:value={config.ai.dumbPrompt} /></div>
                    <div class="space-y-2 md:col-span-2"><Label for="c-ai-private-addition">ai.privateChatPromptAddition</Label><Textarea id="c-ai-private-addition" rows={3} bind:value={config.ai.privateChatPromptAddition} /></div>
                    <div class="space-y-2 md:col-span-2"><Label for="c-ai-group-addition">ai.groupChatPromptAddition</Label><Textarea id="c-ai-group-addition" rows={3} bind:value={config.ai.groupChatPromptAddition} /></div>
                    <div class="space-y-2 md:col-span-2"><Label for="c-ai-comments-addition">ai.commentsPromptAddition</Label><Textarea id="c-ai-comments-addition" rows={3} bind:value={config.ai.commentsPromptAddition} /></div>
                    <div class="space-y-2 md:col-span-2"><Label for="c-ai-hate-prompt">ai.hateModePrompt</Label><Textarea id="c-ai-hate-prompt" rows={3} bind:value={config.ai.hateModePrompt} /></div>
                </div>
            </details>

            <details class="rounded-md border p-3">
                <summary class="cursor-pointer font-medium">Advanced</summary>
                <div class="mt-4 grid gap-3 md:grid-cols-2">
                    <div class="space-y-2"><Label for="c-ai-msgs">ai.messagesToPass</Label><Input id="c-ai-msgs" type="number" bind:value={config.ai.messagesToPass} /></div>
                    <div class="space-y-2"><Label for="c-ai-max-len">ai.messageMaxLength</Label><Input id="c-ai-max-len" type="number" bind:value={config.ai.messageMaxLength} /></div>
                    <div class="space-y-2"><Label for="c-ai-bytes">ai.bytesLimit</Label><Input id="c-ai-bytes" type="number" bind:value={config.ai.bytesLimit} /></div>
                    <div class="flex items-center justify-between rounded-md border p-3"><Label for="c-ai-json">ai.useJsonResponses</Label><Switch id="c-ai-json" bind:checked={config.ai.useJsonResponses} /></div>
                    <div class="flex items-center justify-between rounded-md border p-3"><Label for="c-ai-attachments">ai.includeAttachmentsInHistory</Label><Switch id="c-ai-attachments" bind:checked={config.ai.includeAttachmentsInHistory} /></div>
                </div>
            </details>
        {/if}

        <Button onclick={onSave} disabled={!canSave}>Save chat override</Button>
    </CardContent>
</Card>
