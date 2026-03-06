<script lang="ts">
    import SourceStateIcon from '$lib/components/config/SourceStateIcon.svelte';
    import { Label } from '$lib/components/ui/label';
    import * as Select from '$lib/components/ui/select';

    interface SourceState {
        overridden: boolean;
        label: string;
    }

    interface Props {
        id: string;
        label: string;
        description: string;
        value: string | undefined;
        options: string[];
        hidden?: boolean;
        containerClass?: string;
        sourceState?: SourceState;
    }

    let {
        id,
        label,
        description,
        value = $bindable(),
        options = [],
        hidden = false,
        containerClass = '',
        sourceState,
    }: Props = $props();

    let selectedLabel = $derived.by(() => {
        if (!value || value.length === 0) {
            return options.length > 0 ? 'Select an option' : 'No options available';
        }

        return options.includes(value) ? value : `Current: ${value}`;
    });

    const handleValueChange = (nextValue: string): void => {
        value = nextValue;
    };
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
    {#if options.length === 0}
        <div
            {id}
            class="flex h-10 w-full items-center rounded-md border border-input bg-muted/30 px-3 text-sm text-muted-foreground"
        >
            No options available
        </div>
    {:else}
        <Select.Root type="single" value={value ?? ''} onValueChange={handleValueChange}>
            <Select.Trigger {id} class="h-10 w-full" aria-label={label}>
                <span class="line-clamp-1 text-left">{selectedLabel}</span>
            </Select.Trigger>
            <Select.Content>
                {#each options as option (option)}
                    <Select.Item value={option} label={option}>{option}</Select.Item>
                {/each}
            </Select.Content>
        </Select.Root>
    {/if}
</div>
