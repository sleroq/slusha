<script lang="ts">
    import { Input } from '$lib/components/ui/input';
    import { Label } from '$lib/components/ui/label';
    import { Switch } from '$lib/components/ui/switch';
    import { Textarea } from '$lib/components/ui/textarea';
    import type { AiPayload } from '$lib/config/model';

    interface Props {
        prefix: string;
        title: string;
        ai: AiPayload;
    }

    let { prefix, title, ai = $bindable() }: Props = $props();
</script>

<div class="space-y-4">
    <h3 class="text-lg font-semibold">{title}</h3>

    <div class="grid gap-3 md:grid-cols-2">
        <div class="space-y-2"><Label for={`${prefix}-ai-model`}>ai.model</Label><Input id={`${prefix}-ai-model`} bind:value={ai.model} /></div>
        <div class="space-y-2"><Label for={`${prefix}-ai-notes-model`}>ai.notesModel</Label><Input id={`${prefix}-ai-notes-model`} bind:value={ai.notesModel} /></div>
        <div class="space-y-2"><Label for={`${prefix}-ai-memory-model`}>ai.memoryModel</Label><Input id={`${prefix}-ai-memory-model`} bind:value={ai.memoryModel} /></div>
        <div class="space-y-2"><Label for={`${prefix}-ai-temp`}>ai.temperature</Label><Input id={`${prefix}-ai-temp`} type="number" bind:value={ai.temperature} /></div>
        <div class="space-y-2"><Label for={`${prefix}-ai-topk`}>ai.topK</Label><Input id={`${prefix}-ai-topk`} type="number" bind:value={ai.topK} /></div>
        <div class="space-y-2"><Label for={`${prefix}-ai-topp`}>ai.topP</Label><Input id={`${prefix}-ai-topp`} type="number" bind:value={ai.topP} /></div>
        <div class="space-y-2"><Label for={`${prefix}-ai-msgs`}>ai.messagesToPass</Label><Input id={`${prefix}-ai-msgs`} type="number" bind:value={ai.messagesToPass} /></div>
        <div class="space-y-2"><Label for={`${prefix}-ai-notes-freq`}>ai.notesFrequency</Label><Input id={`${prefix}-ai-notes-freq`} type="number" bind:value={ai.notesFrequency} /></div>
        <div class="space-y-2"><Label for={`${prefix}-ai-memory-freq`}>ai.memoryFrequency</Label><Input id={`${prefix}-ai-memory-freq`} type="number" bind:value={ai.memoryFrequency} /></div>
        <div class="space-y-2"><Label for={`${prefix}-ai-max-len`}>ai.messageMaxLength</Label><Input id={`${prefix}-ai-max-len`} type="number" bind:value={ai.messageMaxLength} /></div>
        <div class="space-y-2"><Label for={`${prefix}-ai-bytes`}>ai.bytesLimit</Label><Input id={`${prefix}-ai-bytes`} type="number" bind:value={ai.bytesLimit} /></div>
        <div class="flex items-center justify-between rounded-md border p-3"><Label for={`${prefix}-ai-json`}>ai.useJsonResponses</Label><Switch id={`${prefix}-ai-json`} bind:checked={ai.useJsonResponses} /></div>
        <div class="flex items-center justify-between rounded-md border p-3"><Label for={`${prefix}-ai-attachments`}>ai.includeAttachmentsInHistory</Label><Switch id={`${prefix}-ai-attachments`} bind:checked={ai.includeAttachmentsInHistory} /></div>
    </div>

    <div class="grid gap-3 md:grid-cols-2">
        <div class="space-y-2 md:col-span-2"><Label for={`${prefix}-ai-preprompt`}>ai.prePrompt</Label><Textarea id={`${prefix}-ai-preprompt`} rows={4} bind:value={ai.prePrompt} /></div>
        <div class="space-y-2 md:col-span-2"><Label for={`${prefix}-ai-prompt`}>ai.prompt</Label><Textarea id={`${prefix}-ai-prompt`} rows={4} bind:value={ai.prompt} /></div>
        <div class="space-y-2 md:col-span-2"><Label for={`${prefix}-ai-dumb-prompt`}>ai.dumbPrompt</Label><Textarea id={`${prefix}-ai-dumb-prompt`} rows={3} bind:value={ai.dumbPrompt} /></div>
        <div class="space-y-2 md:col-span-2"><Label for={`${prefix}-ai-dumb-preprompt`}>ai.dumbPrePrompt</Label><Textarea id={`${prefix}-ai-dumb-preprompt`} rows={3} bind:value={ai.dumbPrePrompt} /></div>
        <div class="space-y-2 md:col-span-2"><Label for={`${prefix}-ai-private-addition`}>ai.privateChatPromptAddition</Label><Textarea id={`${prefix}-ai-private-addition`} rows={3} bind:value={ai.privateChatPromptAddition} /></div>
        <div class="space-y-2 md:col-span-2"><Label for={`${prefix}-ai-group-addition`}>ai.groupChatPromptAddition</Label><Textarea id={`${prefix}-ai-group-addition`} rows={3} bind:value={ai.groupChatPromptAddition} /></div>
        <div class="space-y-2 md:col-span-2"><Label for={`${prefix}-ai-comments-addition`}>ai.commentsPromptAddition</Label><Textarea id={`${prefix}-ai-comments-addition`} rows={3} bind:value={ai.commentsPromptAddition} /></div>
        <div class="space-y-2 md:col-span-2"><Label for={`${prefix}-ai-hate-prompt`}>ai.hateModePrompt</Label><Textarea id={`${prefix}-ai-hate-prompt`} rows={3} bind:value={ai.hateModePrompt} /></div>
        <div class="space-y-2 md:col-span-2"><Label for={`${prefix}-ai-final-prompt`}>ai.finalPrompt</Label><Textarea id={`${prefix}-ai-final-prompt`} rows={4} bind:value={ai.finalPrompt} /></div>
        <div class="space-y-2 md:col-span-2"><Label for={`${prefix}-ai-dumb-final`}>ai.dumbFinalPrompt</Label><Textarea id={`${prefix}-ai-dumb-final`} rows={3} bind:value={ai.dumbFinalPrompt} /></div>
        <div class="space-y-2 md:col-span-2"><Label for={`${prefix}-ai-notes-prompt`}>ai.notesPrompt</Label><Textarea id={`${prefix}-ai-notes-prompt`} rows={4} bind:value={ai.notesPrompt} /></div>
        <div class="space-y-2 md:col-span-2"><Label for={`${prefix}-ai-memory-prompt`}>ai.memoryPrompt</Label><Textarea id={`${prefix}-ai-memory-prompt`} rows={4} bind:value={ai.memoryPrompt} /></div>
        <div class="space-y-2 md:col-span-2"><Label for={`${prefix}-ai-memory-repeat`}>ai.memoryPromptRepeat</Label><Textarea id={`${prefix}-ai-memory-repeat`} rows={4} bind:value={ai.memoryPromptRepeat} /></div>
    </div>
</div>
