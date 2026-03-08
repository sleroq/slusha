<script lang="ts">
    import SourceStateIcon from '$lib/components/config/SourceStateIcon.svelte';
    import { Label } from '$lib/components/ui/label';
    import { Switch } from '$lib/components/ui/switch';

    interface SourceState {
        overridden: boolean;
        label: string;
        onUnset?: () => void;
    }

    interface Props {
        id: string;
        label: string;
        description: string;
        checked: boolean | undefined;
        hidden?: boolean;
        sourceState?: SourceState;
    }

    let {
        id,
        label,
        description,
        checked = $bindable(),
        hidden = false,
        sourceState,
    }: Props = $props();

    let effectiveChecked = $derived(checked ?? false);

    function handleChange(next: boolean) {
        checked = next;
    }
</script>

<div class="space-y-2 rounded-md border p-3" {hidden}>
    <div class="flex items-center justify-between">
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
        <Switch {id} checked={effectiveChecked} onCheckedChange={handleChange} />
    </div>
    <p class="text-xs text-muted-foreground">{description}</p>
</div>
