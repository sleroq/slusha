import { parse, validate } from '@tma.js/init-data-node/web';
import { eq } from 'drizzle-orm';
import { z } from 'zod/mini';
import { updateConfigSchema, type ConfigChat, type ConfigScope, type ConfigResponse, type ApiErrorResponse } from '../../shared/config-contract';
import { CONFIG_CONTRACT_VERSION } from '../../shared/config-contract-version';
import type { Db } from '../db/client';
import { chatMembers, chats } from '../db/schema';
import type { ModelOperation, Settings, SettingsScope } from './index';

export type TelegramApi = {
    getChatMember(chatId: number, userId: number): Promise<{ status: string; is_member?: boolean }>;
};
export type ConfigHandlerOptions = {
    db: Db;
    botToken: string;
    adminIds: readonly number[];
    settings: Settings;
    api: TelegramApi;
};

function json(body: ConfigResponse | ApiErrorResponse, status = 200) {
    return Response.json(body, { status, headers: { 'cache-control': 'no-store' } });
}
function error(message: string, status: number) {
    return json({ contractVersion: CONFIG_CONTRACT_VERSION, message }, status);
}
function isScope(value: string | null): value is ConfigScope {
    return value === 'personal' || value === 'private' || value === 'group' || value === 'global';
}
const chatInfoSchema = z.object({
    title: z.optional(z.string()),
    first_name: z.optional(z.string()),
    last_name: z.optional(z.string()),
    username: z.optional(z.string()),
});
function title(info: ConfigChatInfo, id: number) {
    if (info.title) return info.title;
    const name = [info.first_name, info.last_name].filter(Boolean).join(' ');
    return name || info.username || String(id);
}
type ConfigChatInfo = z.infer<typeof chatInfoSchema>;
function isMember(member: { status: string; is_member?: boolean }) {
    return member.status === 'creator' || member.status === 'administrator' || member.status === 'member' ||
        (member.status === 'restricted' && member.is_member === true);
}

export function createConfigHandler({ db, botToken, adminIds, settings, api }: ConfigHandlerOptions) {
    async function handle(request: Request): Promise<Response> {
        const [scheme, initData] = request.headers.get('authorization')?.split(' ', 2) ?? [];
        if (scheme !== 'tma' || !initData) return error('Unauthorized', 401);
        let userId: number;
        try {
            await validate(initData, botToken, { expiresIn: 86400 });
            const data = parse(initData);
            if (!data.user || data.auth_date.getTime() > Date.now()) return error('Unauthorized', 401);
            userId = data.user.id;
        } catch {
            return error('Unauthorized', 401);
        }
        if (request.method !== 'GET' && request.method !== 'PUT') return error('Method not allowed', 405);

        const isAdmin = adminIds.includes(userId);
        const scopes: ConfigScope[] = ['personal', 'private', 'group'];
        if (isAdmin) scopes.push('global');
        const rows = await db.select({ id: chats.id, type: chats.type, info: chats.info })
            .from(chatMembers).innerJoin(chats, eq(chatMembers.chatId, chats.id))
            .where(eq(chatMembers.userId, userId));
        const available: ConfigChat[] = [];
        const members = new Map<number, Awaited<ReturnType<TelegramApi['getChatMember']>>>();
        for (const row of rows) {
            if (row.type === 'private') {
                if (row.id === userId) available.push({ id: row.id, title: title(z.catch(chatInfoSchema, {}).parse(row.info), row.id), type: 'private' });
                continue;
            }
            if (row.type !== 'group' && row.type !== 'supergroup') continue;
            try {
                const member = await api.getChatMember(row.id, userId);
                if (!isMember(member)) continue;
                members.set(row.id, member);
                available.push({ id: row.id, title: title(z.catch(chatInfoSchema, {}).parse(row.info), row.id), type: 'group' });
            } catch {
                // A chat whose current membership cannot be verified is not exposed.
            }
        }
        if (!available.some((chat) => chat.type === 'private')) {
            available.push({ id: userId, title: 'Private chat', type: 'private' });
        }

        let scope: ConfigScope = 'personal';
        let chatId: number | undefined;
        let operations: ReturnType<typeof updateConfigSchema.parse>['operations'] | undefined;
        if (request.method === 'PUT') {
            let body: unknown;
            try { body = await request.json(); } catch { return error('Invalid JSON body', 400); }
            const result = updateConfigSchema.safeParse(body);
            if (!result.success) return error('Invalid settings request', 400);
            scope = result.data.scope;
            chatId = result.data.chatId;
            operations = result.data.operations;
        } else {
            const query = new URL(request.url).searchParams;
            const requested = query.get('scope');
            if (requested !== null && !isScope(requested)) return error('Invalid scope', 400);
            if (isScope(requested)) scope = requested;
            const rawId = query.get('chatId');
            if (rawId !== null) {
                chatId = Number(rawId);
                if (!Number.isSafeInteger(chatId) || !/^-?\d+$/.test(rawId)) return error('Invalid chat', 400);
            }
        }

        let target: SettingsScope;
        let writable = true;
        if (scope === 'global') {
            if (!isAdmin) return error('Forbidden', 403);
            target = { scope: 'global' };
        } else if (scope === 'personal') {
            target = { scope: 'user', userId };
        } else if (scope === 'private') {
            if (chatId !== undefined && chatId !== userId) return error('Forbidden', 403);
            chatId = userId;
            target = { scope: 'chat', chatId };
        } else {
            if (chatId === undefined) chatId = available.find((chat) => chat.type === 'group')?.id;
            if (chatId === undefined) {
                if (operations) return error('Chat not available', 403);
                return json({ contractVersion: CONFIG_CONTRACT_VERSION, scope, fields: [], scopes, chats: available, isAdmin });
            }
            const member = members.get(chatId);
            if (!member) return error('Forbidden', 403);
            writable = member.status === 'creator' || member.status === 'administrator';
            target = { scope: 'chat', chatId };
        }
        if (operations) {
            if (!writable) return error('Forbidden', 403);
            const validated: ModelOperation[] = [];
            for (const operation of operations) {
                if (operation.key !== 'ai.model' && operation.key !== 'ai.characterNamesModel') return error('Unknown setting', 400);
                if ('reset' in operation) {
                    validated.push({ key: operation.key, reset: true });
                } else {
                    const value = z.string().safeParse(operation.value);
                    if (!value.success || !settings.models.includes(value.data)) return error('Invalid model', 400);
                    validated.push({ key: operation.key, value: value.data });
                }
            }
            await settings.apply(target, validated);
        }
        const model = await settings.read(target);
        const characterNamesModel = await settings.read(target, 'ai.characterNamesModel');
        const response: ConfigResponse = {
            contractVersion: CONFIG_CONTRACT_VERSION, scope, scopes, chats: available, isAdmin,
            fields: [
                { key: 'ai.model', kind: 'select', options: settings.models, ...model, writable },
                { key: 'ai.characterNamesModel', kind: 'select', options: settings.models, ...characterNamesModel, writable },
            ],
        };
        if (scope === 'private' || scope === 'group') response.chatId = chatId;
        return json(response);
    }
    return async (request: Request): Promise<Response> => {
        try {
            return await handle(request);
        } catch {
            return error('Settings unavailable', 500);
        }
    };
}
