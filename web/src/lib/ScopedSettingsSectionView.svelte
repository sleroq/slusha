<script lang="ts">
    import type { ConfigField } from './config.ts';
    import FieldEditor from './FieldEditor.svelte';
    import type { ScopedSettingsSectionId } from './scoped-settings.ts';
    import { scopedSettingsSection } from './scoped-settings.ts';
    import SettingsPaper from './SettingsPaper.svelte';
    import { settingsFieldLabelId, settingsFieldTitle } from './settings-view.ts';

    let {
        sectionId,
        fields,
        saving,
        isdirty,
        isresetpending,
        onchange,
        onreset,
        oncancelreset,
        onopen,
    }: {
        sectionId: ScopedSettingsSectionId;
        fields: ConfigField[];
        saving: boolean;
        isdirty: (field: ConfigField) => boolean;
        isresetpending: (key: string) => boolean;
        onchange: (field: ConfigField) => void;
        onreset: (key: string) => void;
        oncancelreset: (key: string) => void;
        onopen: (key: string) => void;
    } = $props();

    const section = $derived(scopedSettingsSection(sectionId));

    function fieldFor(key: string) {
        return fields.find((field) => field.key === key);
    }

    let resetPreview = $state<ConfigField>();
    let resetDialog: HTMLDialogElement;

    function showResetPreview(field: ConfigField) {
        resetPreview = field;
        resetDialog.showModal();
    }

    function previewValue(field: ConfigField) {
        const value = field.inheritedValue;
        if (value === null || value === undefined) return 'Not set';
        if (typeof value === 'boolean') {
            if (value) return 'Enabled';
            return 'Disabled';
        }
        if (Array.isArray(value)) {
            return value.map((item) => {
                if (typeof item === 'string') return item;
                if ('__regex' in item) return `/${item.__regex}/${item.flags ?? ''}`;
                return Object.entries(item).map(([key, entry]) => `${key}: ${entry}`).join(' · ');
            }).join('\n');
        }
        return `${value}${field.kind === 'range' ? field.unit ?? '' : ''}`;
    }

    function confirmReset() {
        if (!resetPreview) return;
        onreset(resetPreview.key);
        resetDialog.close();
    }
</script>

<p class="mb-2 mt-4 px-4 text-[13px] uppercase text-(--app-section-header-color)">Options</p>
<SettingsPaper class="mb-5">
    {#each section.keys as key (key)}
        {@const field = fieldFor(key)}
        {#if field}
            <div class="app-separator border-t p-4" class:dirty={isdirty(field)}>
                <div class="mb-2 flex items-center justify-between gap-3">
                    <span id={settingsFieldLabelId(field.key)} class="flex min-w-0 items-center gap-2 text-[17px] font-medium">
                        {settingsFieldTitle(key)}
                        {#if (field.overridden || isdirty(field)) && !isresetpending(field.key)}
                            <span
                                class="size-2 shrink-0 rounded-full bg-(--tg-theme-link-color)"
                                role="img"
                                aria-label="Overridden"
                                title="Overridden"
                            ></span>
                        {/if}
                    </span>
                    {#if field.overridden && field.writable && !isresetpending(field.key)}
                        <button
                            class="flex size-11 shrink-0 items-center justify-center rounded-lg text-(--tg-theme-link-color) disabled:opacity-40"
                            type="button"
                            aria-label={`Revert ${settingsFieldTitle(key)} to default`}
                            title="Revert to default"
                            disabled={saving}
                            onclick={() => showResetPreview(field)}
                        >
                            <svg class="size-5" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                                <path d="M5.2 6.1H2.7V3.6M3.1 6a7 7 0 1 1-.1 7.8" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" />
                            </svg>
                        </button>
                    {/if}
                </div>
                {#if isresetpending(field.key)}
                    <div class="rounded-xl bg-(--tg-theme-secondary-bg-color) p-3">
                        <p class="text-(--tg-theme-hint-color)">This setting will be reset when you save.</p>
                        <button class="mt-2 text-sm text-(--tg-theme-link-color)" disabled={saving} onclick={() => oncancelreset(field.key)}>Keep override</button>
                    </div>
                {:else}
                    <fieldset disabled={saving || !field.writable}>
                        <FieldEditor {field} labelledby={settingsFieldLabelId(field.key)} onopen={() => onopen(field.key)} onreset={() => onreset(field.key)} {onchange} />
                    </fieldset>
                {/if}
                {#if !field.writable}
                    <p class="mt-2 text-xs text-(--tg-theme-hint-color)">Only chat administrators can change this setting.</p>
                {/if}
            </div>
        {/if}
    {/each}
</SettingsPaper>

<dialog
    bind:this={resetDialog}
    class="m-auto w-[calc(100%-1.5rem)] max-w-[35rem] rounded-[22px] border-0 bg-(--tg-theme-bg-color) p-0 text-(--tg-theme-text-color) backdrop:bg-black/40"
    onclose={() => resetPreview = undefined}
>
    {#if resetPreview}
        <div class="p-5 pb-3">
            <h2 class="text-lg font-semibold">Revert {settingsFieldTitle(resetPreview.key)}?</h2>
            <p class="mt-1 text-sm text-(--tg-theme-hint-color)">This override will be removed when you save.</p>
        </div>
        <p class="bg-(--tg-theme-secondary-bg-color) px-5 py-2 text-xs uppercase text-(--tg-theme-hint-color)">Default value</p>
        <div class="max-h-[48vh] overflow-auto whitespace-pre-wrap break-words px-5 py-4 leading-relaxed">{previewValue(resetPreview)}</div>
        <div class="app-separator grid grid-cols-2 border-t">
            <button class="min-h-13 text-(--tg-theme-link-color)" type="button" onclick={() => resetDialog.close()}>Cancel</button>
            <button class="app-separator min-h-13 border-l font-semibold text-(--tg-theme-link-color)" type="button" onclick={confirmReset}>Revert</button>
        </div>
    {/if}
</dialog>
