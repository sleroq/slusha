import { createStore, reconcile, snapshot, untrack } from 'solid-js';
import type {
    ConfigField,
    ConfigOperation,
    ConfigValue,
} from '../../../../shared/config-contract.ts';

type DraftState = {
    fields: ConfigField[];
    baseline: Record<string, ConfigValue>;
    rawInputs: Record<string, string>;
    validation: Record<string, string>;
    resetKeys: Record<string, boolean>;
};

function copy<T>(value: T): T {
    return structuredClone(snapshot(value as object)) as T;
}

function valuesEqual(left: unknown, right: unknown) {
    return JSON.stringify(left) === JSON.stringify(right);
}

export function createSettingsDraft() {
    const [state, setState] = createStore<DraftState>({
        fields: [],
        baseline: {},
        rawInputs: {},
        validation: {},
        resetKeys: {},
    });

    function fieldFor(key: string) {
        return state.fields.find((field) => field.key === key);
    }

    function errorFor(field: ConfigField): string | undefined {
        if (field.kind === 'number') {
            const raw = state.rawInputs[field.key];
            if (raw !== undefined) {
                if (raw === '') {
                    if (!field.optional) return 'Enter a number.';
                } else if (!Number.isFinite(Number(raw))) {
                    return 'Enter a valid number.';
                }
            }
            if (field.value !== null) {
                if (field.min !== undefined && field.value < field.min) {
                    return `Use ${field.min} or greater.`;
                }
                if (field.max !== undefined && field.value > field.max) {
                    return `Use ${field.max} or less.`;
                }
            } else if (!field.optional) {
                return 'Enter a number.';
            }
        }
        if (field.kind === 'text') {
            if (!field.optional && field.value === '') {
                return 'This field is required.';
            }
            if (
                field.maxLength !== undefined &&
                (field.value?.length ?? 0) > field.maxLength
            ) {
                return `Use ${field.maxLength} characters or fewer.`;
            }
        }
        if (
            field.kind === 'select' && !field.optional && field.value === null
        ) {
            return 'Choose a value.';
        }
        if (
            field.kind === 'boolean' && !field.optional && field.value === null
        ) {
            return 'Choose a value.';
        }
        if (field.kind === 'matcher-list') {
            for (const item of field.value) {
                if (typeof item !== 'string') {
                    try {
                        new RegExp(item.__regex, item.flags);
                    } catch {
                        return 'Enter a valid regular expression.';
                    }
                }
            }
        }
        return undefined;
    }

    function validate(key: string) {
        const field = fieldFor(key);
        if (!field) return;
        const error = errorFor(field);
        setState((current) => {
            if (error === undefined) delete current.validation[key];
            else current.validation[key] = error;
        });
    }

    function install(data: { fields: ConfigField[] }) {
        const fields = copy(data.fields);
        const baseline = Object.fromEntries(
            fields.map((field) => [field.key, copy(field.value)]),
        );
        setState((current) => {
            reconcile(fields, 'key')(current.fields);
            current.baseline = baseline;
            current.rawInputs = {};
            current.validation = {};
            current.resetKeys = {};
        });
    }

    function isDirty(field: ConfigField) {
        const raw = state.rawInputs[field.key];
        if (field.kind === 'number' && raw !== undefined) {
            if (raw === '') return true;
            if (!Number.isFinite(Number(raw))) return true;
        }
        return Boolean(state.resetKeys[field.key]) ||
            !valuesEqual(field.value, state.baseline[field.key]);
    }

    function dirtyFields() {
        return state.fields.filter(isDirty);
    }

    function updateField(field: ConfigField) {
        const next = copy(field);
        const clearingOptional = (
            next.kind === 'boolean' || next.kind === 'number' ||
            next.kind === 'text' || next.kind === 'select'
        ) && next.optional === true && next.value === null;
        setState((current) => {
            const index = current.fields.findIndex((item) =>
                item.key === next.key
            );
            if (index >= 0) reconcile(next)(current.fields[index]);
            current.resetKeys[next.key] = clearingOptional;
            if (next.kind !== 'number') delete current.rawInputs[next.key];
            if (clearingOptional) delete current.validation[next.key];
        });
        if (clearingOptional) return;
        validate(next.key);
    }

    function updateRaw(field: ConfigField, value: string) {
        if (field.kind === 'text') {
            if (field.optional && value === '') {
                updateField({ ...field, value: null });
                return;
            }
            setState((current) => {
                current.rawInputs[field.key] = value;
            });
            updateField({ ...field, value });
            return;
        }
        if (field.kind !== 'number') return;
        let parsed: number | null;
        if (value === '') parsed = null;
        else parsed = Number(value);
        setState((current) => {
            current.rawInputs[field.key] = value;
        });
        if (value === '' && field.optional) {
            updateField({ ...field, value: null });
            return;
        }
        if (value !== '' && !Number.isFinite(parsed)) {
            setState((current) => {
                current.validation[field.key] = 'Enter a valid number.';
            });
            return;
        }
        if (value === '' && !field.optional) {
            setState((current) => {
                current.validation[field.key] = 'Enter a number.';
            });
            return;
        }
        if (parsed === null) return;
        updateField({ ...field, value: parsed });
        setState((current) => {
            if (field.min !== undefined && parsed < field.min) {
                current.validation[field.key] = `Use ${field.min} or greater.`;
            } else if (field.max !== undefined && parsed > field.max) {
                current.validation[field.key] = `Use ${field.max} or less.`;
            } else {
                delete current.validation[field.key];
            }
        });
        queueMicrotask(() => {
            if (untrack(() => state.rawInputs[field.key]) !== value) return;
            setState((current) => {
                delete current.validation[field.key];
            });
        });
    }

    function inputValue(field: ConfigField) {
        const raw = state.rawInputs[field.key];
        if (raw !== undefined) return raw;
        if (field.kind === 'number') {
            if (field.value === null) return '';
            return String(field.value);
        }
        if (field.kind === 'text') return field.value ?? '';
        return '';
    }

    function setReset(field: ConfigField) {
        setState((current) => {
            current.resetKeys[field.key] = true;
            delete current.rawInputs[field.key];
            delete current.validation[field.key];
        });
    }

    function cancelReset(key: string) {
        setState((current) => {
            delete current.resetKeys[key];
        });
        validate(key);
    }

    function setErrors(errors: Record<string, string>) {
        setState((current) => {
            for (const [key, error] of Object.entries(errors)) {
                current.validation[key] = error;
            }
        });
    }

    function operationFor(field: ConfigField): ConfigOperation {
        if (state.resetKeys[field.key]) return { key: field.key, reset: true };
        return { key: field.key, value: copy(field.value) };
    }

    return {
        // Kept as a source-compatible escape hatch. Reactivity is provided by
        // the store itself; callers should read fields/validation directly.
        subscribe: (_listener: () => void) => () => undefined,
        install,
        isDirty,
        dirtyFields,
        updateField,
        updateRaw,
        inputValue,
        setReset,
        cancelReset,
        setErrors,
        operationFor,
        get fields() {
            return state.fields;
        },
        get validation() {
            return state.validation;
        },
        get resetKeys() {
            return new Set(
                Object.keys(state.resetKeys).filter((key) =>
                    state.resetKeys[key]
                ),
            );
        },
    };
}

export type SettingsDraft = ReturnType<typeof createSettingsDraft>;
