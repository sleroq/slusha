import { createSignal, For, Show } from 'solid-js';
import type {
    ConfigChat,
    ConfigField,
    ConfigResponse,
    Matcher,
} from '../../../../shared/config-contract.ts';
import {
    Button,
    Field,
    Row,
    RowButton,
    Selection,
    Slider,
    Surface,
    Switch,
} from '@slusha/mini-app/ui';
import { labelId, type SectionId, titleFor } from './sections.ts';

type Validation = Record<string, string>;

export function PersonalView(props: {
    data: ConfigResponse | undefined;
    fields: ConfigField[];
    saving: boolean;
    validation: Validation;
    resetKeys: ReadonlySet<string>;
    onChange: (field: ConfigField) => void;
    onReset: (field: ConfigField) => void;
    onCancelReset: (key: string) => void;
    onScope: (type: 'private' | 'group') => void;
    onGlobal: () => void;
    onPrompts: () => void;
}) {
    const about = () =>
        props.fields.find(
            (field): field is Extract<ConfigField, { kind: 'text' }> =>
                field.key === 'profile.about' && field.kind === 'text',
        );
    const model = () =>
        props.fields.find(
            (field): field is Extract<ConfigField, { kind: 'select' }> =>
                field.key === 'ai.model' && field.kind === 'select',
        );
    const chats = (type: ConfigChat['type']) =>
        props.data?.chats.filter((chat) => chat.type === type) ?? [];
    const error = () => props.validation['profile.about'];
    const errorId = 'field-profile-about-error';

    return (
        <>
            <p class="section-heading">Personal settings</p>
            <Show when={model()}>
                <Surface>
                    <Row class="editor-row">
                        <div class="editor-label">
                            <span id={labelId('ai.model')}>Model</span>
                            <Show when={model()!.overridden && !props.resetKeys.has('ai.model')}>
                                <Button
                                    class="reset-button"
                                    disabled={props.saving}
                                    aria-label="Revert model to default"
                                    onClick={() => props.onReset(model()!)}
                                >
                                    ↶
                                </Button>
                            </Show>
                            <Show when={props.resetKeys.has('ai.model')}>
                                <Button
                                    class="reset-button reset-cancel"
                                    disabled={props.saving}
                                    onClick={() => props.onCancelReset('ai.model')}
                                >
                                    Keep override
                                </Button>
                            </Show>
                        </div>
                        <Show when={props.resetKeys.has('ai.model')}>
                            <p class="reset-pending">This setting will be reset when you save.</p>
                        </Show>
                        <Selection
                            value={model()!.value ?? ''}
                            options={model()!.options}
                            disabled={props.saving || !model()!.writable}
                            labelledBy={labelId('ai.model')}
                            onChange={(value) => {
                                const field = model();
                                if (field) props.onChange({ ...field, value });
                            }}
                        />
                    </Row>
                </Surface>
            </Show>
            <For each={props.fields.filter((field) => field.key === 'ai.characterNamesModel')}>
                {(field) => (
                    <Surface>
                        <SettingField
                            field={field}
                            saving={props.saving}
                            error={props.validation[field.key]}
                            reset={props.resetKeys.has(field.key)}
                            onChange={props.onChange}
                            onRaw={() => {}}
                            inputValue={() => ''}
                            onReset={props.onReset}
                            onCancelReset={props.onCancelReset}
                            isDirty={() => false}
                            onOpen={() => {}}
                        />
                    </Surface>
                )}
            </For>
            <Show when={about()}>
                <Surface>
                    <Row>
                        <Field
                            label="What should Slusha know about you?"
                            error={error()}
                            errorId={errorId}
                        >
                            <textarea
                                aria-label="What should Slusha know about you?"
                                aria-describedby={error() ? errorId : undefined}
                                aria-invalid={error() ? 'true' : undefined}
                                maxlength={about()?.maxLength}
                                value={about()?.value ?? ''}
                                disabled={props.saving || !about()?.writable}
                                onInput={(event) => {
                                    const field = about();
                                    if (field) {
                                        props.onChange({
                                            ...field,
                                            value: event.currentTarget.value,
                                        });
                                    }
                                }}
                            />
                        </Field>
                        <Show when={about() && !about()!.writable}>
                            <small class="hint">This setting is read-only.</small>
                        </Show>
                    </Row>
                </Surface>
            </Show>
            <Show when={props.fields.some((field) => field.key === 'ai.prompt')}>
                <Surface>
                    <RowButton label="Prompts" disabled={props.saving} onClick={props.onPrompts} />
                </Surface>
            </Show>
            <p class="section-heading">Chat settings</p>
            <Surface>
                <RowButton
                    label="Private Chats Options"
                    detail={chats('private').length === 1 ? chats('private')[0].title : undefined}
                    disabled={props.saving || chats('private').length === 0}
                    onClick={() => props.onScope('private')}
                />
                <RowButton
                    label="Group Chats Options"
                    disabled={props.saving || chats('group').length === 0}
                    onClick={() => props.onScope('group')}
                />
                <Show when={props.data?.scopes.includes('global')}>
                    <RowButton
                        label="Global Settings"
                        disabled={props.saving}
                        onClick={props.onGlobal}
                    />
                </Show>
            </Surface>
        </>
    );
}

export function ScopeView(props: {
    fields: ConfigField[];
    sections: readonly {
        id: SectionId;
        title: string;
        keys: readonly string[];
    }[];
    saving: boolean;
    onOpen: (id: SectionId) => void;
}) {
    return (
        <Show
            when={props.fields.length > 0}
            fallback={
                <Surface>
                    <p class="empty">No settings are available for this chat.</p>
                </Surface>
            }
        >
            <p class="section-heading">Options</p>
            <Surface>
                <For each={props.sections}>
                    {(section) => (
                        <RowButton
                            label={section.title}
                            disabled={props.saving}
                            onClick={() => props.onOpen(section.id)}
                        />
                    )}
                </For>
            </Surface>
        </Show>
    );
}

export function SettingsLoading(props: { personal: boolean }) {
    return (
        <div class="settings-loading" role="status" aria-label="Loading settings">
            <Show
                when={props.personal}
                fallback={
                    <Surface>
                        <Row class="skeleton-row">
                            <span class="skeleton skeleton-wide" />
                        </Row>
                        <Row class="skeleton-row">
                            <span class="skeleton skeleton-medium" />
                        </Row>
                        <Row class="skeleton-row">
                            <span class="skeleton skeleton-wide" />
                        </Row>
                    </Surface>
                }
            >
                <Surface>
                    <Row class="skeleton-row skeleton-about">
                        <span class="skeleton skeleton-label" />
                        <span class="skeleton skeleton-area" />
                    </Row>
                </Surface>
                <Surface>
                    <Row class="skeleton-row">
                        <span class="skeleton skeleton-wide" />
                    </Row>
                    <Row class="skeleton-row">
                        <span class="skeleton skeleton-medium" />
                    </Row>
                    <Row class="skeleton-row">
                        <span class="skeleton skeleton-wide" />
                    </Row>
                </Surface>
            </Show>
        </div>
    );
}

export function SectionView(props: {
    section: { title: string; keys: readonly string[] };
    fields: ConfigField[];
    saving: boolean;
    validation: Validation;
    resetKeys: Set<string>;
    onChange: (field: ConfigField) => void;
    onRaw: (field: ConfigField, value: string) => void;
    inputValue: (field: ConfigField) => string;
    onReset: (field: ConfigField) => void;
    onCancelReset: (key: string) => void;
    isDirty: (field: ConfigField) => boolean;
    onOpen: (key: string) => void;
}) {
    return (
        <>
            <p class="section-heading">Options</p>
            <Surface>
                <For each={props.section.keys}>
                    {(key) => {
                        const field = () => props.fields.find((item) => item.key === key);
                        return (
                            <Show when={field()}>
                                <SettingField
                                    field={field()!}
                                    saving={props.saving}
                                    error={props.validation[key]}
                                    reset={props.resetKeys.has(key)}
                                    onChange={props.onChange}
                                    onRaw={props.onRaw}
                                    inputValue={props.inputValue}
                                    onReset={props.onReset}
                                    onCancelReset={props.onCancelReset}
                                    isDirty={props.isDirty}
                                    onOpen={props.onOpen}
                                />
                            </Show>
                        );
                    }}
                </For>
            </Surface>
        </>
    );
}

export function EditorView(props: {
    field: ConfigField | undefined;
    saving: boolean;
    reset: boolean;
    validation: Validation;
    onChange: (field: ConfigField) => void;
    onRaw: (field: ConfigField, value: string) => void;
    inputValue: (field: ConfigField) => string;
    onReset: (field: ConfigField) => void;
    onCancelReset: (key: string) => void;
}) {
    return (
        <Show when={props.field}>
            <p class="section-heading">Items</p>
            <Surface>
                <Row class="editor-row">
                    <div class="editor-label">
                        <span id={labelId(props.field!.key)}>{titleFor(props.field!.key)}</span>
                        <Show when={props.field!.overridden && !props.reset}>
                            <Button
                                class="reset-button"
                                disabled={props.saving || !props.field!.writable}
                                aria-label={`Revert ${titleFor(props.field!.key)} to default`}
                                onClick={() => props.onReset(props.field!)}
                            >
                                ↶
                            </Button>
                        </Show>
                        <Show when={props.reset}>
                            <Button
                                class="reset-button reset-cancel"
                                disabled={props.saving}
                                onClick={() => props.onCancelReset(props.field!.key)}
                            >
                                Keep override
                            </Button>
                        </Show>
                    </div>
                    <Show when={props.reset}>
                        <p class="reset-pending">This setting will be reset when you save.</p>
                    </Show>
                    <fieldset disabled={props.saving || !props.field!.writable}>
                        <FieldEditor
                            field={props.field!}
                            saving={props.saving}
                            error={props.validation[props.field!.key]}
                            onChange={props.onChange}
                            onRaw={props.onRaw}
                            inputValue={props.inputValue}
                            expanded
                            onReset={props.onReset}
                        />
                    </fieldset>
                    <Show when={!props.field!.writable}>
                        <small class="hint">This setting is read-only.</small>
                    </Show>
                </Row>
            </Surface>
        </Show>
    );
}

type FieldEditorProps = {
    field: ConfigField;
    saving: boolean;
    error?: string;
    expanded?: boolean;
    onChange: (field: ConfigField) => void;
    onRaw: (field: ConfigField, value: string) => void;
    inputValue: (field: ConfigField) => string;
    onReset?: (field: ConfigField) => void;
    onOpen?: (key: string) => void;
};

function SettingField(props: {
    field: ConfigField;
    saving: boolean;
    error?: string;
    reset: boolean;
    onChange: (field: ConfigField) => void;
    onRaw: (field: ConfigField, value: string) => void;
    inputValue: (field: ConfigField) => string;
    onReset: (field: ConfigField) => void;
    onCancelReset: (key: string) => void;
    isDirty: (field: ConfigField) => boolean;
    onOpen: (key: string) => void;
}) {
    function changeLabel() {
        if (props.isDirty(props.field)) return 'Changed';
        return 'Overridden';
    }

    return (
        <div
            class={[
                'setting-row',
                {
                    'has-error': Boolean(props.error),
                    dirty: props.isDirty(props.field),
                },
            ]}
        >
            <div class="setting-label">
                <span id={labelId(props.field.key)}>{titleFor(props.field.key)}</span>
                <Show when={!props.reset && (props.field.overridden || props.isDirty(props.field))}>
                    <i role="img" aria-label={changeLabel()} title={changeLabel()} />
                </Show>
                <Show when={props.field.overridden && props.field.writable && !props.reset}>
                    <Button
                        class="reset-button"
                        disabled={props.saving}
                        aria-label={`Revert ${titleFor(props.field.key)} to default`}
                        onClick={() => props.onReset(props.field)}
                    >
                        ↶
                    </Button>
                </Show>
                <Show when={props.reset}>
                    <Button
                        class="reset-button reset-cancel"
                        disabled={props.saving}
                        onClick={() => props.onCancelReset(props.field.key)}
                    >
                        Keep override
                    </Button>
                </Show>
            </div>
            <Show when={props.reset}>
                <p class="reset-pending">This setting will be reset when you save.</p>
            </Show>
            <fieldset disabled={props.saving || !props.field.writable}>
                <FieldEditor
                    field={props.field}
                    saving={props.saving}
                    error={props.error}
                    onChange={props.onChange}
                    onRaw={props.onRaw}
                    inputValue={props.inputValue}
                    onReset={props.onReset}
                    onOpen={props.onOpen}
                />
            </fieldset>
            <Show when={!props.field.writable}>
                <small class="hint">This setting is read-only.</small>
            </Show>
        </div>
    );
}

function FieldEditor(props: FieldEditorProps) {
    const kind = () => props.field.kind;
    return (
        <>
            <Show when={kind() === 'boolean'}>
                <BooleanField {...props} />
            </Show>
            <Show when={kind() === 'number'}>
                <NumberField {...props} />
            </Show>
            <Show when={kind() === 'range'}>
                <RangeField {...props} />
            </Show>
            <Show when={kind() === 'select'}>
                <SelectField {...props} />
            </Show>
            <Show when={kind() === 'matcher-list' || kind() === 'string-list'}>
                <ListField {...props} />
            </Show>
            <Show when={kind() === 'object-list'}>
                <ObjectField {...props} />
            </Show>
            <Show when={kind() === 'text'}>
                <TextField {...props} />
            </Show>
        </>
    );
}

function BooleanField(props: FieldEditorProps) {
    const field = () => {
        const value = props.field;
        if (value.kind === 'boolean') return value;
        return undefined;
    };

    const value = () => {
        const current = field();
        if (!current) return '';
        if (current.value === true) return 'Enabled';
        if (current.value === false) return 'Disabled';
        return '';
    };

    function change(next: string) {
        const current = field();
        if (!current) return;
        if (next === '') {
            props.onReset?.(current);
            return;
        }
        props.onChange({ ...current, value: next === 'Enabled' });
    }

    return (
        <Show when={field()}>
            <Show
                when={field()!.optional}
                fallback={
                    <Switch
                        checked={field()!.value === true}
                        disabled={props.saving}
                        labelledBy={labelId(field()!.key)}
                        describedBy={errorId(field()!.key, props.error)}
                        invalid={Boolean(props.error)}
                        onChange={(next) => {
                            const current = field();
                            if (current) {
                                props.onChange({
                                    ...current,
                                    value: next,
                                });
                            }
                        }}
                    />
                }
            >
                <Selection
                    value={value()}
                    options={['Enabled', 'Disabled']}
                    optional
                    disabled={props.saving}
                    labelledBy={labelId(field()!.key)}
                    describedBy={errorId(field()!.key, props.error)}
                    invalid={Boolean(props.error)}
                    onChange={change}
                />
            </Show>
            <ValidationMessage field={field()!.key} error={props.error} />
        </Show>
    );
}

function NumberField(props: FieldEditorProps) {
    const field = () => {
        const value = props.field;
        if (value.kind === 'number') return value;
        return undefined;
    };

    return (
        <Show when={field()}>
            <Field error={props.error} errorId={errorId(field()!.key, props.error)}>
                <input
                    type="text"
                    inputmode="decimal"
                    min={field()!.min}
                    max={field()!.max}
                    step={field()!.step}
                    aria-labelledby={labelId(field()!.key)}
                    aria-describedby={errorId(field()!.key, props.error)}
                    aria-invalid={props.error ? 'true' : undefined}
                    value={props.inputValue(field()!)}
                    onInput={(event) => props.onRaw(field()!, event.currentTarget.value)}
                />
            </Field>
        </Show>
    );
}

function RangeField(props: FieldEditorProps) {
    const field = () => {
        const value = props.field;
        if (value.kind === 'range') return value;
        return undefined;
    };
    return (
        <Show when={field()}>
            <div class="range-field">
                <output>
                    {field()!.value}
                    {field()!.unit ?? ''}
                </output>
                <Slider
                    value={field()!.value}
                    min={field()!.min}
                    max={field()!.max}
                    step={field()!.step}
                    disabled={props.saving}
                    labelledBy={labelId(field()!.key)}
                    describedBy={errorId(field()!.key, props.error)}
                    invalid={Boolean(props.error)}
                    onChange={(value) => {
                        const current = field();
                        if (current) props.onChange({ ...current, value });
                    }}
                />
                <ValidationMessage field={field()!.key} error={props.error} />
            </div>
        </Show>
    );
}

function SelectField(props: FieldEditorProps) {
    const field = () => {
        const value = props.field;
        if (value.kind === 'select') return value;
        return undefined;
    };
    function change(value: string) {
        const current = field();
        if (!current) return;
        if (value === '') {
            if (current.optional) props.onReset?.(current);
            return;
        }
        props.onChange({ ...current, value });
    }
    return (
        <Show when={field()}>
            <Selection
                value={field()!.value ?? ''}
                options={field()!.options}
                optional={field()!.optional}
                disabled={props.saving}
                labelledBy={labelId(field()!.key)}
                describedBy={errorId(field()!.key, props.error)}
                invalid={Boolean(props.error)}
                onChange={change}
            />
            <ValidationMessage field={field()!.key} error={props.error} />
        </Show>
    );
}

function TextField(props: FieldEditorProps) {
    const field = () => {
        const value = props.field;
        if (value.kind === 'text') return value;
        return undefined;
    };
    return (
        <Show when={field()}>
            <Field error={props.error} errorId={errorId(field()!.key, props.error)}>
                <Show
                    when={field()!.multiline}
                    fallback={
                        <input
                            type="text"
                            aria-labelledby={labelId(field()!.key)}
                            aria-describedby={errorId(field()!.key, props.error)}
                            aria-invalid={props.error ? 'true' : undefined}
                            maxlength={field()!.maxLength}
                            value={props.inputValue(field()!)}
                            onInput={(event) => props.onRaw(field()!, event.currentTarget.value)}
                        />
                    }
                >
                    <textarea
                        aria-labelledby={labelId(field()!.key)}
                        aria-describedby={errorId(field()!.key, props.error)}
                        aria-invalid={props.error ? 'true' : undefined}
                        maxlength={field()!.maxLength}
                        value={props.inputValue(field()!)}
                        onInput={(event) => props.onRaw(field()!, event.currentTarget.value)}
                    />
                </Show>
            </Field>
        </Show>
    );
}

function ListField(props: FieldEditorProps) {
    const [text, setText] = createSignal('');
    const [regex, setRegex] = createSignal(false);
    const [regexError, setRegexError] = createSignal('');
    const field = () => {
        const value = props.field;
        if (value.kind === 'matcher-list' || value.kind === 'string-list') {
            return value;
        }
        return undefined;
    };

    const display = (item: Matcher) => {
        if (!(item instanceof Object)) return item;
        return `/${item.__regex}/${item.flags ?? ''}`;
    };
    const error = () => regexError() || props.error;

    function add() {
        const current = field();
        const value = text().trim();
        if (!current || !value) return;
        if (current.kind === 'matcher-list' && regex()) {
            try {
                new RegExp(value);
            } catch {
                setRegexError('Enter a valid regular expression.');
                return;
            }
            props.onChange({
                ...current,
                value: [...current.value, { __regex: value }],
            });
        } else if (current.kind === 'matcher-list') {
            props.onChange({ ...current, value: [...current.value, value] });
        } else {
            props.onChange({ ...current, value: [...current.value, value] });
        }
        setText('');
        setRegexError('');
    }

    function remove(index: number) {
        const current = field();
        if (!current) return;
        if (current.kind === 'matcher-list') {
            props.onChange({
                ...current,
                value: current.value.filter((_, itemIndex) => itemIndex !== index),
            });
            return;
        }
        props.onChange({
            ...current,
            value: current.value.filter((_, itemIndex) => itemIndex !== index),
        });
    }

    return (
        <Show when={field()}>
            <Show
                when={props.expanded}
                fallback={
                    <>
                        <Button
                            class="list-preview"
                            disabled={props.saving}
                            onClick={() => props.onOpen?.(field()!.key)}
                        >
                            {field()!.value.slice(0, 2).map(display).join(', ') || 'None'}{' '}
                            <span>›</span>
                        </Button>
                        <ValidationMessage field={field()!.key} error={error()} />
                    </>
                }
            >
                <div class="list-editor">
                    <div class="chips">
                        <For each={field()!.value}>
                            {(item, index) => (
                                <span>
                                    {display(item)}
                                    <button
                                        type="button"
                                        disabled={props.saving}
                                        aria-label={`Remove ${display(item)}`}
                                        onClick={() => remove(index())}
                                    >
                                        ×
                                    </button>
                                </span>
                            )}
                        </For>
                    </div>
                    <div class="add-row">
                        <input
                            value={text()}
                            placeholder="Add item"
                            aria-label={`Add item to ${titleFor(field()!.key)}`}
                            aria-describedby={error() ? errorId(field()!.key, error()) : undefined}
                            aria-invalid={error() ? 'true' : undefined}
                            disabled={props.saving}
                            onInput={(event) => {
                                setText(event.currentTarget.value);
                                setRegexError('');
                            }}
                            onKeyDown={(event) => {
                                if (event.key === 'Enter') {
                                    event.preventDefault();
                                    add();
                                }
                            }}
                        />
                        <Show when={field()!.kind === 'matcher-list'}>
                            <Button
                                class={regex() ? 'button-primary' : ''}
                                disabled={props.saving}
                                aria-label={regex() ? 'Add regular expression' : 'Add plain text'}
                                aria-pressed={regex() ? 'true' : 'false'}
                                onClick={() => setRegex(!regex())}
                            >
                                .*
                            </Button>
                        </Show>
                        <Button class="button-primary" disabled={props.saving} onClick={add}>
                            Add
                        </Button>
                    </div>
                    <ValidationMessage field={field()!.key} error={error()} />
                </div>
            </Show>
        </Show>
    );
}

function ObjectField(props: FieldEditorProps) {
    const field = () => {
        const value = props.field;
        if (value.kind === 'object-list') return value;
        return undefined;
    };

    function add() {
        const current = field();
        if (!current) return;
        const value: Record<string, string> = {};
        for (const key of current.keys) value[key] = '';
        props.onChange({ ...current, value: [...current.value, value] });
    }

    return (
        <Show when={field()}>
            <div class="object-editor">
                <For each={field()!.value} keyed={false}>
                    {(item, index) => (
                        <div class="object-row">
                            <div>
                                <For each={field()!.keys}>
                                    {(key) => (
                                        <input
                                            aria-label={`${titleFor(
                                                field()!.key,
                                            )} item ${index + 1} ${key}`}
                                            placeholder={key}
                                            value={item()[key] ?? ''}
                                            disabled={props.saving}
                                            aria-describedby={errorId(field()!.key, props.error)}
                                            aria-invalid={props.error ? 'true' : undefined}
                                            onInput={(event) => {
                                                const current = field();
                                                if (!current) return;
                                                props.onChange({
                                                    ...current,
                                                    value: current.value.map((entry, itemIndex) => {
                                                        if (itemIndex === index) {
                                                            return {
                                                                ...entry,
                                                                [key]: event.currentTarget.value,
                                                            };
                                                        }
                                                        return entry;
                                                    }),
                                                });
                                            }}
                                        />
                                    )}
                                </For>
                            </div>
                            <Button
                                aria-label={`Remove ${titleFor(field()!.key)} item ${index + 1}`}
                                disabled={props.saving}
                                onClick={() => {
                                    const current = field();
                                    if (current) {
                                        props.onChange({
                                            ...current,
                                            value: current.value.filter(
                                                (_, itemIndex) => itemIndex !== index,
                                            ),
                                        });
                                    }
                                }}
                            >
                                ×
                            </Button>
                        </div>
                    )}
                </For>
                <Button class="button-plain" disabled={props.saving} onClick={add}>
                    + Add item
                </Button>
                <ValidationMessage field={field()!.key} error={props.error} />
            </div>
        </Show>
    );
}

function errorId(key: string, error?: string) {
    if (!error) return undefined;
    return `field-${key.replace(/[^a-zA-Z0-9_-]/g, '-')}-error`;
}

function ValidationMessage(props: { field: string; error?: string }) {
    return (
        <Show when={props.error}>
            <span id={errorId(props.field, props.error)} class="field-error" role="alert">
                {props.error}
            </span>
        </Show>
    );
}
