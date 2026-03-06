import type { BootstrapResponse, ChatOverridePayload, UserConfigPayload } from './model';

interface ApiResult<T> {
    ok: boolean;
    data?: T;
    error?: string;
}

function buildHeaders(initDataRaw: string): HeadersInit {
    return {
        'content-type': 'application/json',
        'x-telegram-init-data': initDataRaw,
    };
}

async function parseJsonResponse(response: Response): Promise<Record<string, unknown>> {
    try {
        return (await response.json()) as Record<string, unknown>;
    } catch {
        return {};
    }
}

function errorFromResponse(payload: Record<string, unknown>, fallback: string): string {
    const error = payload.error;
    return typeof error === 'string' && error.length > 0 ? error : fallback;
}

export async function fetchBootstrap(chatId: string, initDataRaw: string): Promise<ApiResult<BootstrapResponse>> {
    const query = new URLSearchParams();
    if (chatId.trim()) {
        query.set('chatId', chatId.trim());
    }

    const response = await fetch(`/api/config/bootstrap?${query.toString()}`, {
        headers: buildHeaders(initDataRaw),
    });
    const payload = await parseJsonResponse(response);

    if (!response.ok) {
        return {
            ok: false,
            error: errorFromResponse(payload, 'Failed to load'),
        };
    }

    return {
        ok: true,
        data: payload as unknown as BootstrapResponse,
    };
}

export async function saveGlobalConfig(payload: UserConfigPayload, initDataRaw: string): Promise<ApiResult<undefined>> {
    const response = await fetch('/api/config/global', {
        method: 'PUT',
        headers: buildHeaders(initDataRaw),
        body: JSON.stringify({ payload }),
    });
    const body = await parseJsonResponse(response);

    if (!response.ok) {
        return {
            ok: false,
            error: errorFromResponse(body, 'Failed to save global config'),
        };
    }

    return { ok: true };
}

export async function saveChatConfig(
    chatId: string,
    payload: ChatOverridePayload,
    initDataRaw: string,
): Promise<ApiResult<undefined>> {
    const response = await fetch(`/api/config/chat/${chatId}`, {
        method: 'PUT',
        headers: buildHeaders(initDataRaw),
        body: JSON.stringify({ payload }),
    });
    const body = await parseJsonResponse(response);

    if (!response.ok) {
        return {
            ok: false,
            error: errorFromResponse(body, 'Failed to save chat override'),
        };
    }

    return { ok: true };
}
