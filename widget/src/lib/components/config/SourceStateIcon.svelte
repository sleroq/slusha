<script lang="ts">
    import CircleCheckIcon from '@lucide/svelte/icons/circle-check';
    import CircleIcon from '@lucide/svelte/icons/circle';

    interface Props {
        overridden: boolean;
        label: string;
    }

    let { overridden, label }: Props = $props();
</script>

<span class="inline-flex" title={label} aria-label={label}>
    {#if overridden}
        <CircleCheckIcon class="h-3.5 w-3.5 text-emerald-700" />
    {:else}
        <CircleIcon class="h-3.5 w-3.5 text-slate-500" />
    {/if}
</span>
