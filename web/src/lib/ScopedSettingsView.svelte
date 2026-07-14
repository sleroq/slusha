<script lang="ts">
    import type { ConfigField } from './config.ts';
    import type { ScopedSettingsSectionId } from './scoped-settings.ts';
    import { scopedSettingsSections } from './scoped-settings.ts';
    import SettingsPaper from './SettingsPaper.svelte';
    import SettingsRowButton from './SettingsRowButton.svelte';

    let {
        fields,
        saving,
        onopen,
    }: {
        fields: ConfigField[];
        saving: boolean;
        onopen: (sectionId: ScopedSettingsSectionId) => void;
    } = $props();

    function hasFields(keys: readonly string[]) {
        return keys.some((key) => fields.some((field) => field.key === key));
    }

    const availableSections = $derived(scopedSettingsSections.filter((section) => hasFields(section.keys)));
</script>

{#if fields.length === 0}
    <SettingsPaper class="mt-4">
        <p class="p-8 text-center text-(--tg-theme-hint-color)">No settings are available for this chat.</p>
    </SettingsPaper>
{:else}
    <p class="mb-2 mt-4 px-4 text-[13px] uppercase text-(--app-section-header-color)">Options</p>
    <SettingsPaper>
        {#each availableSections as section, index (section.id)}
            <div class:app-separator={index > 0} class:border-t={index > 0}>
                <SettingsRowButton label={section.title} disabled={saving} onclick={() => onopen(section.id)} />
            </div>
        {/each}
    </SettingsPaper>
{/if}
