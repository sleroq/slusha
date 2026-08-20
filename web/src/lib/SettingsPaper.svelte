<script lang="ts">
    import type { Snippet } from 'svelte';

    let {
        children,
        class: className = '',
    }: { children: Snippet; class?: string } = $props();
</script>

<section
    class={`settings-paper overflow-hidden rounded-[22px] ${className}`}
>
    {@render children()}
</section>
