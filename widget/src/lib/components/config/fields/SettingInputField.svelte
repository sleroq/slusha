<script lang="ts">
    import SourceStateIcon from '$lib/components/config/SourceStateIcon.svelte';
    import { Input } from '$lib/components/ui/input';
    import { Label } from '$lib/components/ui/label';

    interface SourceState {
        overridden: boolean;
        label: string;
    }

    interface Props {
        id: string;
        label: string;
        description: string;
        type?: 'text' | 'number' | 'search';
        value: string | number | undefined;
        hidden?: boolean;
        containerClass?: string;
        sourceState?: SourceState;
    }

    let {
        id,
        label,
        description,
        type = 'text',
        value = $bindable(),
        hidden = false,
        containerClass = '',
        sourceState,
    }: Props = $props();
</script>

<div class={`space-y-2 ${containerClass}`.trim()} {hidden}>
    <Label for={id}>
        <span class="inline-flex items-center gap-1.5">
            {label}
            {#if sourceState}
                <SourceStateIcon overridden={sourceState.overridden} label={sourceState.label} />
            {/if}
        </span>
    </Label>
    <p class="text-xs text-muted-foreground">{description}</p>
    <Input {id} {type} bind:value />
</div>
