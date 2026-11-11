import type {
    ApiErrorResponse,
    ConfigOperation,
    ConfigResponse,
    ConfigSelection,
} from '../../../../shared/config-contract.ts';
import { apiErrorSchema, configResponseSchema } from '../../../../shared/config-contract.ts';

export class ConfigApiError extends Error {
    fieldErrors: Record<string, string>;
    retryable: boolean;

    constructor(
        message: string,
        options: { fieldErrors?: Record<string, string>; retryable?: boolean } = {},
    ) {
        super(message);
        this.name = 'ConfigApiError';
        this.fieldErrors = options.fieldErrors ?? {};
        this.retryable = options.retryable ?? false;
    }
}

type ReadError = Pick<ApiErrorResponse, 'message' | 'fieldErrors'>;

async function readError(response: Response): Promise<ReadError> {
    const text = await response.text();
    let payload: unknown;
    try {
        payload = JSON.parse(text);
    } catch {
        return { message: text || `Request failed (${response.status})` };
    }
    const parsed = apiErrorSchema.safeParse(payload);
    if (parsed.success) return parsed.data;

    return { message: `Request failed (${response.status})` };
}

async function readConfig(response: Response): Promise<ConfigResponse> {
    if (!response.ok) {
        const error = await readError(response);
        throw new ConfigApiError(error.message, {
            fieldErrors: error.fieldErrors,
            retryable: response.status >= 500 || response.status === 429,
        });
    }

    let payload: unknown;
    try {
        payload = await response.json();
    } catch {
        throw new ConfigApiError(
            'The server returned an unreadable settings response. Please retry.',
        );
    }
    const parsed = configResponseSchema.safeParse(payload);
    if (!parsed.success) {
        throw new ConfigApiError(
            'The settings response does not match this app. Please reload or retry.',
        );
    }
    return parsed.data;
}

function headers(auth: string, json = false) {
    const result = new Headers({ authorization: `tma ${auth}` });
    if (json) result.set('content-type', 'application/json');
    return result;
}

export async function loadConfig(
    auth: string,
    selection?: ConfigSelection,
    signal?: AbortSignal,
): Promise<ConfigResponse> {
    let url = '/api/config';
    if (selection) {
        const query = new URLSearchParams({ scope: selection.scope });
        if (selection.chatId !== undefined) {
            query.set('chatId', String(selection.chatId));
        }
        url += `?${query}`;
    }
    const response = await fetch(url, {
        headers: headers(auth),
        signal,
    });
    return readConfig(response);
}

export async function saveConfig(
    auth: string,
    selection: ConfigSelection,
    operations: ConfigOperation[],
): Promise<ConfigResponse> {
    const response = await fetch('/api/config', {
        method: 'PUT',
        headers: headers(auth, true),
        body: JSON.stringify({ ...selection, operations }),
    });
    return readConfig(response);
}
