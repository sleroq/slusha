<script lang="ts">
    import type { ConfigField } from './config.ts';
    import FieldEditor from './FieldEditor.svelte';
    import SettingsPaper from './SettingsPaper.svelte';
    import { settingsFieldLabelId, settingsFieldTitle } from './settings-view.ts';

    let {
        field,
        saving,
        onchange,
    }: {
        field: Extract<ConfigField, { kind: 'matcher-list' | 'string-list' }>;
        saving: boolean;
        onchange: (field: ConfigField) => void;
    } = $props();
</script>

<p class="mb-2 mt-4 px-4 text-[13px] uppercase text-(--app-section-header-color)">Items</p>
<SettingsPaper>
    <fieldset class="p-4" disabled={saving || !field.writable}>
        <legend id={settingsFieldLabelId(field.key)} class="sr-only">{settingsFieldTitle(field.key)}</legend>
        <FieldEditor {field} labelledby={settingsFieldLabelId(field.key)} expanded={true} {onchange} />
    </fieldset>
</SettingsPaper>
{#if !field.writable}
    <p class="mt-2 px-4 text-xs text-(--tg-theme-hint-color)">Only chat administrators can change this setting.</p>
{/if}
