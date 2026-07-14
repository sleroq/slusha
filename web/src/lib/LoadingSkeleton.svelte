<script lang="ts">
    import SettingsPaper from './SettingsPaper.svelte';

    let { personal }: { personal: boolean } = $props();

    const chatSections = [
        { id: 'reply', fields: [0, 1] },
        { id: 'context', fields: [0, 1, 2] },
        { id: 'generation', fields: [0, 1] },
    ];
</script>

<div role="status" aria-label="Loading settings" class="skeleton-page">
    <span class="sr-only">Loading settings</span>
    <div aria-hidden="true">
        {#if personal}
            <div class="skeleton-heading mb-2 mt-4 ml-4 h-3 w-28 rounded"></div>
            <SettingsPaper>
                <div class="p-4">
                    <div class="skeleton-line h-5 w-64 max-w-4/5 rounded"></div>
                    <div class="skeleton-block mt-3 h-32 rounded-xl"></div>
                </div>
            </SettingsPaper>

            <div class="skeleton-heading mb-2 mt-6 ml-4 h-3 w-24 rounded"></div>
            <SettingsPaper>
                <div class="flex min-h-14 items-center justify-between p-4">
                    <div class="skeleton-line h-5 w-40 rounded"></div>
                    <div class="skeleton-line size-5 rounded"></div>
                </div>
                <div class="app-separator flex min-h-14 items-center justify-between border-t p-4">
                    <div class="skeleton-line h-5 w-44 rounded"></div>
                    <div class="skeleton-line size-5 rounded"></div>
                </div>
            </SettingsPaper>
        {:else}
            {#each chatSections as section, index (section.id)}
                <div class="skeleton-heading mb-2 ml-4 h-3 rounded" class:mt-4={index === 0} class:mt-6={index > 0}></div>
                <SettingsPaper>
                    {#each section.fields as fieldIndex (fieldIndex)}
                        <div class="p-4" class:app-separator={fieldIndex > 0} class:border-t={fieldIndex > 0}>
                            <div class="skeleton-line h-5 rounded" class:w-32={fieldIndex % 2 === 0} class:w-48={fieldIndex % 2 !== 0}></div>
                            <div class="skeleton-block mt-3 h-11 rounded-xl"></div>
                        </div>
                    {/each}
                </SettingsPaper>
            {/each}
        {/if}
    </div>
</div>

<style>
    .skeleton-page {
        animation: skeleton-pulse 1.4s ease-in-out infinite;
    }

    .skeleton-line,
    .skeleton-heading,
    .skeleton-block {
        background: color-mix(in srgb, var(--tg-theme-hint-color, #707579) 20%, transparent);
    }

    .skeleton-heading {
        width: 7rem;
    }

    .skeleton-block {
        background: color-mix(in srgb, var(--tg-theme-hint-color, #707579) 12%, transparent);
    }

    @keyframes skeleton-pulse {
        0%, 100% { opacity: 0.55; }
        50% { opacity: 1; }
    }
</style>
