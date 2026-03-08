<script lang="ts">
    import RotateCcwIcon from '@lucide/svelte/icons/rotate-ccw';

    interface Props {
        overridden: boolean;
        label: string;
        onUnset?: () => void;
    }

    let { overridden, label, onUnset }: Props = $props();
</script>

{#if overridden && onUnset}
    <button
        type="button"
        class="inline-flex h-4 w-4 items-center justify-center rounded-sm text-muted-foreground transition-colors hover:text-foreground"
        title={label}
        aria-label={label}
        onclick={onUnset}
    >
        <RotateCcwIcon class="h-3 w-3" />
    </button>
{/if}
