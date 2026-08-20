export type Matcher = string | { __regex: string; flags?: string };

export type ConfigScope = 'personal' | 'private' | 'group' | 'global';

export type ConfigChat = {
    id: number;
    title: string;
    type: 'private' | 'group';
};

type ConfigFieldBase = {
    key: string;
    overridden: boolean;
    writable: boolean;
    inheritedValue?: ConfigValue;
};

export type ConfigValue =
    | boolean
    | number
    | string
    | null
    | Matcher[]
    | string[]
    | Array<Record<string, string>>;

export type ConfigField =
    & ConfigFieldBase
    & (
        | {
            kind: 'boolean';
            optional?: boolean;
            value: boolean | null;
        }
        | {
            kind: 'number';
            optional?: boolean;
            value: number | null;
        }
        | {
            kind: 'range';
            min: number;
            max: number;
            step: number;
            unit?: string;
            value: number;
        }
        | {
            kind: 'text';
            multiline?: boolean;
            optional?: boolean;
            value: string | null;
        }
        | {
            kind: 'select';
            options: string[];
            optional?: boolean;
            value: string | null;
        }
        | {
            kind: 'matcher-list';
            value: Matcher[];
        }
        | {
            kind: 'string-list';
            value: string[];
        }
        | {
            kind: 'object-list';
            keys: string[];
            value: Array<Record<string, string>>;
        }
    );

export type ConfigSelection = {
    scope: ConfigScope;
    chatId?: number;
};

export type ConfigResponse = ConfigSelection & {
    fields: ConfigField[];
    scopes: ConfigScope[];
    chats: ConfigChat[];
    isAdmin: boolean;
};

export async function loadConfig(
    initData: string,
    selection?: ConfigSelection,
): Promise<ConfigResponse> {
    const query = new URLSearchParams();
    if (selection) {
        query.set('scope', selection.scope);
        if (selection.chatId) query.set('chatId', String(selection.chatId));
    }
    const response = await fetch(`/api/config?${query}`, {
        headers: { authorization: `tma ${initData}` },
    });
    if (!response.ok) throw new Error(await response.text());
    return response.json();
}

export async function saveConfig(
    initData: string,
    selection: ConfigSelection,
    operations: Array<
        | { key: string; value: ConfigField['value'] }
        | { key: string; reset: true }
    >,
) {
    const response = await fetch('/api/config', {
        method: 'PUT',
        headers: {
            authorization: `tma ${initData}`,
            'content-type': 'application/json',
        },
        body: JSON.stringify({ ...selection, operations }),
    });
    if (!response.ok) throw new Error(await response.text());
}
