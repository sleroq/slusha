import type {
    ApiErrorResponse,
    ConfigOperation,
    ConfigResponse,
    ConfigSelection,
} from '../../../../shared/config-contract.ts';
import { CONFIG_CONTRACT_VERSION } from '../../../../shared/config-contract-version.ts';

export class ConfigApiError extends Error {
    fieldErrors: Record<string, string>;
    retryable: boolean;

    constructor(
        message: string,
        options: { fieldErrors?: Record<string, string>; retryable?: boolean } =
            {},
    ) {
        super(message);
        this.name = 'ConfigApiError';
        this.fieldErrors = options.fieldErrors ?? {};
        this.retryable = options.retryable ?? false;
    }
}

type ReadError = Pick<ApiErrorResponse, 'message' | 'fieldErrors'>;

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null &&
        !Array.isArray(value);
}

function readFieldErrors(value: unknown) {
    if (!isRecord(value)) return undefined;
    const result: Record<string, string> = {};
    for (const [key, message] of Object.entries(value)) {
        if (typeof message !== 'string') {
            return undefined;
        }
        result[key] = message;
    }
    return result;
}

async function readError(response: Response): Promise<ReadError> {
    const text = await response.text();
    let payload: unknown;
    try {
        payload = JSON.parse(text);
    } catch {
        return { message: text || `Request failed (${response.status})` };
    }
    if (typeof payload === 'string' && payload) return { message: payload };
    if (
        isRecord(payload) && typeof payload.message === 'string' &&
        payload.message
    ) {
        const error: ReadError = { message: payload.message };
        if (payload.contractVersion === CONFIG_CONTRACT_VERSION) {
            const fieldErrors = readFieldErrors(payload.fieldErrors);
            if (fieldErrors) error.fieldErrors = fieldErrors;
        }
        return error;
    }
    return { message: `Request failed (${response.status})` };
}

function hasCurrentContractVersion(value: unknown) {
    return isRecord(value) &&
        value.contractVersion === CONFIG_CONTRACT_VERSION;
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
    if (!hasCurrentContractVersion(payload)) {
        throw new ConfigApiError(
            'The settings response does not match this app. Please reload or retry.',
        );
    }
    // SAFETY: same-version backends own the payload shape behind this contract.
    return payload as ConfigResponse;
}

function headers(auth: string, json = false) {
    const result: Record<string, string> = { authorization: `tma ${auth}` };
    if (json) result['content-type'] = 'application/json';
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
