interface TelegramMiniAppUser {
    id: number;
    username?: string;
    first_name?: string;
    last_name?: string;
}

export interface TelegramInitData {
    authDate: number;
    queryId?: string;
    user?: TelegramMiniAppUser;
    chatType?: string;
    chatInstance?: string;
}

function toHex(buffer: ArrayBuffer): string {
    const bytes = new Uint8Array(buffer);
    return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function hmacSha256(
    key: BufferSource,
    data: string,
): Promise<ArrayBuffer> {
    const cryptoKey = await crypto.subtle.importKey(
        'raw',
        key,
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['sign'],
    );
    const encoded = new TextEncoder().encode(data);
    return await crypto.subtle.sign('HMAC', cryptoKey, encoded);
}

function isHexEqual(a: string, b: string): boolean {
    if (a.length !== b.length) return false;
    let out = 0;
    for (let i = 0; i < a.length; i++) {
        out |= a.charCodeAt(i) ^ b.charCodeAt(i);
    }
    return out === 0;
}

function parseUser(value: string | null): TelegramMiniAppUser | undefined {
    if (!value) return undefined;
    const parsed = JSON.parse(value) as TelegramMiniAppUser;
    if (!parsed || typeof parsed.id !== 'number') return undefined;
    return parsed;
}

export async function verifyTelegramInitData(
    rawInitData: string,
    botToken: string,
    maxAgeSec = 60 * 60 * 24,
): Promise<TelegramInitData> {
    if (!rawInitData.trim()) {
        throw new Error('Missing Telegram initData');
    }

    const params = new URLSearchParams(rawInitData);
    const hash = params.get('hash');
    if (!hash) throw new Error('Missing hash in initData');

    const authDateRaw = params.get('auth_date');
    if (!authDateRaw) throw new Error('Missing auth_date in initData');
    const authDate = Number(authDateRaw);
    if (!Number.isFinite(authDate)) {
        throw new Error('Invalid auth_date in initData');
    }

    const nowSec = Math.floor(Date.now() / 1000);
    if (nowSec - authDate > maxAgeSec) {
        throw new Error('initData is expired');
    }

    const lines = [...params.entries()]
        .filter(([key]) => key !== 'hash')
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, value]) => `${key}=${value}`);
    const dataCheckString = lines.join('\n');

    const seedKey = new TextEncoder().encode('WebAppData');
    const secretKey = await hmacSha256(seedKey.buffer, botToken);
    const expectedHash = toHex(await hmacSha256(secretKey, dataCheckString));

    if (!isHexEqual(expectedHash, hash.toLowerCase())) {
        throw new Error('Invalid Telegram initData hash');
    }

    return {
        authDate,
        queryId: params.get('query_id') ?? undefined,
        user: parseUser(params.get('user')),
        chatType: params.get('chat_type') ?? undefined,
        chatInstance: params.get('chat_instance') ?? undefined,
    };
}
