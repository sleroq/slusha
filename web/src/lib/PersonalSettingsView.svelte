<script lang="ts">
    import type { ConfigChat, ConfigField, ConfigScope } from './config.ts';
    import SettingsPaper from './SettingsPaper.svelte';
    import SettingsRowButton from './SettingsRowButton.svelte';

    type TextField = Extract<ConfigField, { kind: 'text' }>;

    let {
        about,
        privateChats,
        groupChats,
        scopes,
        isAdmin,
        disabled,
        onchange,
        onopenscope,
        onopenglobal,
    }: {
        about?: TextField;
        privateChats: ConfigChat[];
        groupChats: ConfigChat[];
        scopes: ConfigScope[];
        isAdmin: boolean;
        disabled: boolean;
        onchange: (field: ConfigField) => void;
        onopenscope: (scope: 'private' | 'group') => void;
        onopenglobal: () => void;
    } = $props();
</script>

<p class="mb-2 mt-4 px-4 text-[13px] uppercase text-(--app-section-header-color)">Personal settings</p>
<SettingsPaper>
    <fieldset {disabled}>
        <label class="block p-4">
            <span class="mb-2 block text-[17px] font-medium">What should Slusha know about you?</span>
            {#if about}
                <textarea
                    class="min-h-32 w-full resize-none rounded-xl border-0 bg-(--tg-theme-secondary-bg-color) p-3 text-[16px] leading-snug placeholder:text-(--tg-theme-hint-color) focus:ring-2 focus:ring-(--tg-theme-button-color)"
                    maxlength="4000"
                    placeholder="Tell Slusha about your interests, preferences, or anything that could make replies more useful."
                    value={about.value ?? ''}
                    oninput={(event) => onchange({ ...about, value: event.currentTarget.value })}
                ></textarea>
            {/if}
        </label>
    </fieldset>
</SettingsPaper>
<p class="mb-2 mt-6 px-4 text-[13px] uppercase text-(--app-section-header-color)">Chat settings</p>
<SettingsPaper>
    <SettingsRowButton
        label="Private Chats Options"
        detail={!isAdmin && privateChats.length === 1 ? privateChats[0].title : undefined}
        disabled={disabled || !scopes.includes('private') || privateChats.length === 0}
        onclick={() => onopenscope('private')}
    />
    <div class="app-separator border-t">
        <SettingsRowButton
            label="Group Chats Options"
            disabled={disabled || !scopes.includes('group') || groupChats.length === 0}
            onclick={() => onopenscope('group')}
        />
    </div>
    {#if scopes.includes('global')}
        <div class="app-separator border-t">
            <SettingsRowButton label="Global Settings" {disabled} onclick={onopenglobal} />
        </div>
    {/if}
</SettingsPaper>
