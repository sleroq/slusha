<script lang="ts">
    import SourceStateIcon from '$lib/components/config/SourceStateIcon.svelte';
    import { Label } from '$lib/components/ui/label';
    import { Textarea } from '$lib/components/ui/textarea';

    interface SourceState {
        overridden: boolean;
        label: string;
        onUnset?: () => void;
    }

    interface Props {
        id: string;
        label: string;
        description: string;
        rows?: number;
        value: string | undefined;
        hidden?: boolean;
        containerClass?: string;
        sourceState?: SourceState;
    }

    let {
        id,
        label,
        description,
        rows = 4,
        value = $bindable(),
        hidden = false,
        containerClass = '',
        sourceState,
    }: Props = $props();

    let textareaRef = $state<HTMLTextAreaElement | null>(null);

    const syncHeight = (nextValue: string | undefined = value): void => {
        if (!textareaRef) {
            return;
        }

        const normalizedValue = nextValue ?? '';
        if (textareaRef.value !== normalizedValue) {
            textareaRef.value = normalizedValue;
        }

        textareaRef.style.height = 'auto';

        textareaRef.style.height = `${textareaRef.scrollHeight}px`;
        textareaRef.style.overflowY = 'hidden';
    };

    $effect(() => {
        syncHeight(value);
    });
</script>

<div class={`space-y-2 ${containerClass}`.trim()} {hidden}>
    <Label for={id}>
        <span class="inline-flex items-center gap-1.5">
            {label}
            {#if sourceState}
                <SourceStateIcon
                    overridden={sourceState.overridden}
                    label={sourceState.label}
                    onUnset={sourceState.onUnset}
                />
            {/if}
        </span>
    </Label>
    <p class="text-xs text-muted-foreground">{description}</p>
    <Textarea
        {id}
        {rows}
        class="resize overflow-hidden"
        bind:ref={textareaRef}
        bind:value
        oninput={() => syncHeight(value)}
    />
</div>
