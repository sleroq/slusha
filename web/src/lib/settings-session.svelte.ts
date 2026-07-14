import { SvelteSet } from 'svelte/reactivity';
import {
    type ConfigField,
    type ConfigResponse,
    type ConfigSelection,
    loadConfig,
    saveConfig,
} from './config.ts';

type TextField = Extract<ConfigField, { kind: 'text' }>;

type SettingsSessionDependencies = {
    load?: typeof loadConfig;
    save?: typeof saveConfig;
    onsaved?: () => void;
};

export function createSettingsSession(dependencies: SettingsSessionDependencies = {}) {
    const load = dependencies.load ?? loadConfig;
    const persist = dependencies.save ?? saveConfig;
    const pendingResets = new SvelteSet<string>();

    let auth = '';
    let fields = $state<ConfigField[]>([]);
    let original = $state<Record<string, ConfigField['value']>>({});
    let chats = $state<ConfigResponse['chats']>([]);
    let scopes = $state<ConfigResponse['scopes']>([]);
    let selection = $state<ConfigSelection>({ scope: 'personal' });
    let isAdmin = $state(false);
    let loading = $state(true);
    let saving = $state(false);
    let error = $state('');
    let pendingSelection = $state<ConfigSelection>();

    function isResetPending(key: string) {
        return pendingResets.has(key);
    }

    function isDirty(field: ConfigField) {
        if (isResetPending(field.key)) return true;
        return JSON.stringify(field.value) !== JSON.stringify(original[field.key]);
    }

    const currentChat = $derived(chats.find((chat) => chat.id === selection.chatId));
    const privateChats = $derived(chats.filter((chat) => chat.type === 'private'));
    const groupChats = $derived(chats.filter((chat) => chat.type === 'group'));
    const about = $derived(
        fields.find((field): field is TextField =>
            field.key === 'profile.about' && field.kind === 'text'
        ),
    );
    const dirtyFields = $derived(fields.filter(isDirty));
    const changeCount = $derived(dirtyFields.length);
    const saveLabel = $derived.by(() => {
        if (saving) return 'Saving…';
        if (changeCount === 0) return 'Saved';
        let suffix = 's';
        if (changeCount === 1) suffix = '';
        return `Save ${changeCount} change${suffix}`;
    });

    function install(data: ConfigResponse) {
        const nextOriginal = Object.fromEntries(
            data.fields.map((field) => [field.key, $state.snapshot(field.value)]),
        );
        pendingResets.clear();
        fields = data.fields;
        original = nextOriginal;
        chats = data.chats;
        scopes = data.scopes;
        selection = { scope: data.scope, chatId: data.chatId };
        isAdmin = data.isAdmin;
    }

    function setError(cause: unknown, fallback: string) {
        if (cause instanceof Error) error = cause.message;
        else error = fallback;
    }

    async function initialize(initData: string) {
        auth = initData;
        loading = true;
        error = '';
        try {
            install(await load(auth));
        } catch (cause) {
            setError(cause, 'Could not load settings');
        }
        loading = false;
    }

    function failInitialization(cause: unknown) {
        setError(cause, 'Could not load settings');
        loading = false;
    }

    function isCurrentSelection(next: ConfigSelection) {
        return next.scope === selection.scope && next.chatId === selection.chatId;
    }

    async function loadSelection(next: ConfigSelection) {
        error = '';
        loading = true;
        try {
            const response = await load(auth, next);
            install(response);
            loading = false;
            return true;
        } catch (cause) {
            setError(cause, 'Could not load settings');
            loading = false;
            return false;
        }
    }

    function requestSelection(next: ConfigSelection) {
        if (isCurrentSelection(next)) return Promise.resolve(true);
        if (changeCount > 0) {
            pendingSelection = next;
            return Promise.resolve(false);
        }
        return loadSelection(next);
    }

    function operationFor(
        field: ConfigField,
    ): { key: string; value: ConfigField['value'] } | { key: string; reset: true } {
        if (isResetPending(field.key)) return { key: field.key, reset: true };
        return { key: field.key, value: field.value };
    }

    async function save() {
        if (saving) return false;
        if (dirtyFields.length === 0) return true;
        saving = true;
        error = '';
        try {
            const committed = $state.snapshot(selection);
            await persist(auth, committed, dirtyFields.map(operationFor));
            install(await load(auth, committed));
            dependencies.onsaved?.();
            saving = false;
            return true;
        } catch (cause) {
            setError(cause, 'Could not save');
            saving = false;
            return false;
        }
    }

    async function saveAndSwitch() {
        const next = pendingSelection;
        if (!next) return false;
        if (!await save()) return false;
        pendingSelection = undefined;
        return loadSelection(next);
    }

    function discardAndSwitch() {
        const next = pendingSelection;
        if (!next) return false;
        pendingSelection = undefined;
        return loadSelection(next);
    }

    function cancelPendingSelection() {
        if (saving) return;
        pendingSelection = undefined;
    }

    function updateField(next: ConfigField) {
        if (saving) return;
        pendingResets.delete(next.key);
        fields = fields.map((field) => {
            if (field.key === next.key) return next;
            return field;
        });
    }

    function resetField(key: string) {
        if (saving) return;
        pendingResets.add(key);
    }

    function cancelReset(key: string) {
        if (saving) return;
        pendingResets.delete(key);
    }

    return {
        get fields() { return fields; },
        get chats() { return chats; },
        get scopes() { return scopes; },
        get selection() { return selection; },
        get isAdmin() { return isAdmin; },
        get loading() { return loading; },
        get saving() { return saving; },
        get error() { return error; },
        get pendingSelection() { return pendingSelection; },
        get currentChat() { return currentChat; },
        get privateChats() { return privateChats; },
        get groupChats() { return groupChats; },
        get about() { return about; },
        get dirtyFields() { return dirtyFields; },
        get changeCount() { return changeCount; },
        get saveLabel() { return saveLabel; },
        initialize,
        failInitialization,
        requestSelection,
        save,
        saveAndSwitch,
        discardAndSwitch,
        cancelPendingSelection,
        updateField,
        resetField,
        cancelReset,
        isDirty,
        isResetPending,
    };
}

export type SettingsSession = ReturnType<typeof createSettingsSession>;
