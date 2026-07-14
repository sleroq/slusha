<script lang="ts">
    import SettingsPaper from './SettingsPaper.svelte';
    import { scopedSettingsSections } from './scoped-settings.ts';

    let { personal }: { personal: boolean } = $props();
</script>

<div role="status" aria-label="Loading settings" class="skeleton-page">
    <span class="sr-only">Loading settings</span>
    <div aria-hidden="true">
        {#if personal}
            <div class="skeleton-heading mb-2 mt-4 ml-4 h-5 w-28 rounded"></div>
            <SettingsPaper>
                <div class="p-4">
                    <div class="skeleton-line h-5 w-64 max-w-4/5 rounded"></div>
                    <div class="skeleton-block mt-3 h-32 rounded-xl"></div>
                </div>
            </SettingsPaper>

            <div class="skeleton-heading mb-2 mt-6 ml-4 h-5 w-24 rounded"></div>
            <SettingsPaper>
                <div class="flex min-h-14 items-center justify-between p-4">
                    <div class="skeleton-line h-5 w-40 rounded"></div>
                    <div class="skeleton-line size-5 rounded"></div>
                </div>
                <div class="app-separator border-t">
                    <div class="flex min-h-14 items-center justify-between p-4">
                        <div class="skeleton-line h-5 w-44 rounded"></div>
                        <div class="skeleton-line size-5 rounded"></div>
                    </div>
                </div>
            </SettingsPaper>
        {:else}
            <div class="skeleton-heading mb-2 mt-4 ml-4 h-5 rounded"></div>
            <SettingsPaper>
                {#each scopedSettingsSections as section, index (section.id)}
                    <div class:app-separator={index > 0} class:border-t={index > 0}>
                        <div class="flex min-h-14 items-center justify-between px-4">
                            <div class="skeleton-line h-5 w-40 rounded"></div>
                            <div class="skeleton-line size-5 rounded"></div>
                        </div>
                    </div>
                {/each}
            </SettingsPaper>
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
