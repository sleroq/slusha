import { type QueryClient, useQuery, useQueryClient } from '@tanstack/solid-query';
import { createEffect, createMemo, createSignal, untrack } from 'solid-js';
import type {
    ConfigField,
    ConfigResponse,
    ConfigSelection,
} from '../../../../shared/config-contract.ts';
import { ConfigApiError, loadConfig, saveConfig } from './api.ts';
import { createSettingsDraft } from './draft.ts';

export type ConfigQueryKey = readonly ['config', string, number?];

export function configQueryKey(selection: ConfigSelection | undefined) {
    if (!selection) return ['config', 'launch'] as const;
    return ['config', selection.scope, selection.chatId] as const;
}

function selectionFor(response: ConfigResponse): ConfigSelection {
    if (response.scope === 'private' || response.scope === 'group') {
        return { scope: response.scope, chatId: response.chatId };
    }
    return { scope: response.scope };
}

function sameSelection(left: ConfigSelection | undefined, right: ConfigSelection | undefined) {
    return left?.scope === right?.scope && left?.chatId === right?.chatId;
}

function authValue(auth: string | (() => string)) {
    if (auth instanceof Function) return auth();
    return auth;
}

export function createSettingsSession(props: {
    auth: string | (() => string);
    selection: () => ConfigSelection | undefined;
    onCanonicalSelection: (selection: ConfigSelection) => void;
    onSaved?: () => void;
    queryClient?: QueryClient;
    enabled?: () => boolean;
}) {
    // The client is an owner-lifetime dependency, not reactive session state.
    const injectedClient = untrack(() => props.queryClient);
    const client = injectedClient ?? useQueryClient();
    const draft = createSettingsDraft();
    const [saving, setSaving] = createSignal(false);
    const [saveError, setSaveError] = createSignal<ConfigApiError>();
    let installed: ConfigResponse | undefined;
    let installedKey = '';

    const query = useQuery<ConfigResponse, ConfigApiError>(() => ({
        queryKey: configQueryKey(props.selection()),
        queryFn: ({ signal }) => loadConfig(authValue(props.auth), props.selection(), signal),
        retry: false,
        refetchOnWindowFocus: false,
        enabled: props.enabled?.() ?? true,
    }));

    const fields = createMemo(() => draft.fields);
    const validation = createMemo(() => draft.validation);
    const resetKeys = createMemo(() => draft.resetKeys);
    const dirtyFields = createMemo(() => draft.dirtyFields());
    const dirty = createMemo(() => dirtyFields().length > 0);
    const selectionKey = createMemo(() => configQueryKey(props.selection()).join(':'));

    createEffect(
        () => selectionKey(),
        (key) => {
            installed = undefined;
            installedKey = key;
            setSaveError(undefined);
            const cached = client.getQueryData<ConfigResponse>(configQueryKey(props.selection()));
            if (cached) {
                installed = cached;
                draft.install(cached);
            } else {
                draft.install({ fields: [] });
            }
        },
    );

    createEffect(
        () => query.data,
        (data) => {
            if (!data) return;
            const key = configQueryKey(props.selection()).join(':');
            if (props.selection() === undefined) {
                client.setQueryData(configQueryKey(selectionFor(data)), data);
                props.onCanonicalSelection(selectionFor(data));
            }
            if (key !== installedKey || data !== installed) {
                installedKey = key;
                if (draft.dirtyFields().length === 0) {
                    installed = data;
                    draft.install(data);
                }
            }
        },
    );

    function updateField(field: ConfigField) {
        if (saving()) return;
        draft.updateField(field);
    }

    function updateRaw(field: ConfigField, value: string) {
        if (saving()) return;
        draft.updateRaw(field, value);
    }

    function setReset(field: ConfigField) {
        if (saving()) return;
        draft.setReset(field);
    }

    function cancelReset(key: string) {
        if (saving()) return;
        draft.cancelReset(key);
    }

    function installCached(selection: ConfigSelection) {
        const cached = client.getQueryData<ConfigResponse>(configQueryKey(selection));
        if (cached) draft.install(cached);
        else draft.install({ fields: [] });
    }

    async function save() {
        if (saving() || !dirty() || Object.keys(validation()).length > 0) {
            return false;
        }
        const selection = props.selection();
        if (!selection) return false;

        const operations = dirtyFields().map(draft.operationFor);
        setSaving(true);
        setSaveError(undefined);

        try {
            const response = await saveConfig(authValue(props.auth), selection, operations);
            client.setQueryData(configQueryKey(selection), response);

            const responseSelection = selectionFor(response);
            if (!sameSelection(selection, responseSelection)) {
                client.setQueryData(configQueryKey(responseSelection), response);
            }

            if (selection.scope === 'global') {
                await client.invalidateQueries({
                    queryKey: ['config', 'private'],
                    refetchType: 'none',
                });
                await client.invalidateQueries({
                    queryKey: ['config', 'group'],
                    refetchType: 'none',
                });
            }

            draft.install(response);
            installed = response;
            installedKey = configQueryKey(responseSelection).join(':');
            props.onSaved?.();
            return true;
        } catch (cause) {
            if (cause instanceof ConfigApiError) {
                setSaveError(cause);
                draft.setErrors(cause.fieldErrors);
            } else if (cause instanceof Error) {
                setSaveError(new ConfigApiError(cause.message, { retryable: true }));
            } else {
                setSaveError(new ConfigApiError('Could not save', { retryable: true }));
            }
            return false;
        } finally {
            setSaving(false);
        }
    }

    return {
        client,
        query,
        draft,
        fields,
        validation,
        resetKeys,
        dirtyFields,
        dirty,
        saving,
        saveError,
        save,
        installCached,
        updateField,
        updateRaw,
        setReset,
        cancelReset,
    };
}

export type SettingsSession = ReturnType<typeof createSettingsSession>;
