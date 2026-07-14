import { eq } from 'drizzle-orm';
import { Api, GrammyError } from 'grammy';
import { z } from 'zod';
import {
    canAccessConfig,
    type ConfigAccessContext,
    configOptionPolicies,
    isConfigKey,
} from '../config-access.ts';
import { chatScopeKey, ConfigValidationError } from '../config.ts';
import {
    type ConfigOperation,
    ConfigPermissionError,
    type ConfigTarget,
    ConfigurationService,
} from '../configuration-service.ts';
import { getDb } from '../db/client.ts';
import { configEntries } from '../db/schema.ts';
import { ChatRepository } from '../persistence/chats.ts';
import { ConfigEntryRepository } from '../persistence/config-entries.ts';
import { UserRoleRepository } from '../persistence/user-roles.ts';
import {
    personalAboutKey,
    personalScopeKey,
} from '../persistence/user-profile.ts';
import { withTelegramAuth } from './telegram-auth.ts';

type UiScope = 'personal' | 'private' | 'group' | 'global';
type ChatOption = {
    id: number;
    title: string;
    type: 'private' | 'group';
};

const operationSchema = z.object({
    key: z.string().min(1).max(200),
    value: z.unknown().optional(),
    reset: z.boolean().optional(),
}).strict().superRefine((operation, context) => {
    const hasValue = Object.hasOwn(operation, 'value');
    if (operation.reset === true && hasValue) {
        context.addIssue({
            code: 'custom',
            message: 'Reset operations cannot include a value',
        });
    }
    if (operation.reset !== true && !hasValue) {
        context.addIssue({
            code: 'custom',
            message: 'Set operations require a value',
        });
    }
});

const updateConfigSchema = z.object({
    scope: z.enum(['personal', 'private', 'group', 'global']),
    chatId: z.number().int().safe().optional(),
    operations: z.array(operationSchema).min(1).max(100),
}).strict();

const chatInfoSchema = z.object({
    type: z.string(),
    title: z.string().optional(),
    first_name: z.string().optional(),
    last_name: z.string().optional(),
    username: z.string().optional(),
});

function isUiScope(value: string | null): value is UiScope {
    return value === 'personal' || value === 'private' || value === 'group' ||
        value === 'global';
}

function json(body: unknown) {
    return new Response(JSON.stringify(body), {
        headers: { 'content-type': 'application/json' },
    });
}

function chatOption(row: { id: number; info: string }): ChatOption {
    const info = chatInfoSchema.parse(JSON.parse(row.info));
    let title = info.title;
    if (!title) {
        title = [info.first_name, info.last_name].filter(Boolean).join(' ');
    }
    if (!title) title = info.username;
    if (!title) title = String(row.id);

    let type: ChatOption['type'] = 'group';
    if (info.type === 'private') type = 'private';
    return { id: row.id, title, type };
}

function scopeKey(target: ConfigTarget) {
    if (target.scope === 'global') return 'global';
    return chatScopeKey(target.chatId);
}

function hasReadableGlobalConfig(access: ConfigAccessContext) {
    return Object.keys(configOptionPolicies).filter(isConfigKey).some((key) =>
        canAccessConfig(key, 'global', 'read', access)
    );
}

export function createConfigHandler(botToken: string) {
    const api = new Api(botToken);

    return withTelegramAuth(botToken, async (request, initData) => {
        if (!initData.user) {
            return new Response('Unauthorized', { status: 401 });
        }

        const db = getDb();
        const userId = initData.user.id;
        const roles = await new UserRoleRepository(db).getActiveRoles(userId);
        const isBotAdmin = roles.has('bot_admin');
        const chatRepository = new ChatRepository(db);
        let chatRows;
        if (isBotAdmin) {
            chatRows = await chatRepository.listAvailableChats();
        } else {
            chatRows = await chatRepository.listChatsForMember(userId);
        }
        const chats = chatRows.map(chatOption).filter((chat) =>
            isBotAdmin || chat.type === 'group' || chat.id === userId
        );

        const url = new URL(request.url);
        const requestedScope = url.searchParams.get('scope');
        let scope: UiScope | null = null;
        if (isUiScope(requestedScope)) scope = requestedScope;
        let chatId = Number(url.searchParams.get('chatId'));

        if (request.method === 'PUT') {
            let input: unknown;
            try {
                input = await request.json();
            } catch {
                return new Response('Invalid JSON body', { status: 400 });
            }
            const parsed = updateConfigSchema.safeParse(input);
            if (!parsed.success) {
                return new Response('Invalid settings request', {
                    status: 400,
                });
            }
            const body = parsed.data;
            const operations: ConfigOperation[] = body.operations.map(
                (operation) => {
                    if (operation.reset === true) {
                        return { key: operation.key, reset: true };
                    }
                    return { key: operation.key, value: operation.value };
                },
            );
            scope = body.scope;
            chatId = body.chatId ?? 0;

            if (scope === 'personal') {
                if (
                    operations.some((operation) =>
                        operation.key !== personalAboutKey ||
                        (!operation.reset &&
                            (typeof operation.value !== 'string' ||
                                operation.value.length > 4000))
                    )
                ) {
                    return new Response('Invalid personal settings', {
                        status: 400,
                    });
                }
                const entries = new ConfigEntryRepository(
                    db,
                    personalScopeKey(userId),
                    'chat',
                );
                await db.transaction(async (tx) => {
                    for (const operation of operations) {
                        if (operation.reset) {
                            await entries.resetRawValueInTx(
                                tx,
                                operation.key,
                                userId,
                            );
                        } else {
                            await entries.setRawValueInTx(
                                tx,
                                operation.key,
                                operation.value,
                                userId,
                            );
                        }
                    }
                });
                return json({ ok: true });
            }

            const selection = await selectTarget(
                scope,
                chatId,
                chats,
                isBotAdmin,
                userId,
                roles,
                api,
            );
            if (selection.unavailable) {
                return new Response(
                    'The bot no longer has access to this chat. Add it back to manage this chat’s settings.',
                    { status: 409 },
                );
            }
            if (!selection.target) {
                return new Response('This scope has no settings', {
                    status: 400,
                });
            }

            const service = new ConfigurationService(
                db,
                userId,
                selection.access,
            );
            try {
                await service.applyOperations(
                    selection.target,
                    operations,
                );
                return json({ ok: true });
            } catch (error) {
                if (error instanceof ConfigPermissionError) {
                    return new Response(error.message, { status: 403 });
                }
                if (error instanceof ConfigValidationError) {
                    return new Response(error.message, { status: 400 });
                }
                throw error;
            }
        }

        if (!scope) {
            const launchChat = initData.chat &&
                chats.find((chat) => chat.id === initData.chat?.id);
            if (launchChat) {
                scope = launchChat.type;
                chatId = launchChat.id;
            } else {
                scope = 'personal';
            }
        }
        if (!chatId && scope !== 'global' && scope !== 'personal') {
            chatId = chats.find((chat) => chat.type === scope)?.id ?? 0;
        }

        const selection = await selectTarget(
            scope,
            chatId,
            chats,
            isBotAdmin,
            userId,
            roles,
            api,
        );
        const scopes: UiScope[] = ['personal', 'private', 'group'];
        if (hasReadableGlobalConfig({ globalRoles: roles })) {
            scopes.push('global');
        }

        if (scope === 'personal') {
            const entry = await db.query.configEntries.findFirst({
                where: eq(
                    configEntries.scopeKey,
                    personalScopeKey(userId),
                ),
            });
            return json({
                fields: [{
                    key: personalAboutKey,
                    kind: 'text',
                    multiline: true,
                    value: entry ? JSON.parse(entry.value) : '',
                    overridden: Boolean(entry),
                    writable: true,
                }],
                scopes,
                chats,
                scope,
                isAdmin: isBotAdmin,
            });
        }

        if (selection.unavailable) {
            return new Response(
                'The bot no longer has access to this chat. Add it back to manage this chat’s settings.',
                { status: 409 },
            );
        }
        if (!selection.target) {
            return json({
                fields: [],
                scopes,
                chats,
                scope,
                isAdmin: isBotAdmin,
            });
        }

        const target = selection.target;
        const service = new ConfigurationService(db, userId, selection.access);
        const [readable, overrides] = await Promise.all([
            service.listReadable(target),
            db.query.configEntries.findMany({
                where: eq(configEntries.scopeKey, scopeKey(target)),
            }),
        ]);
        const overridden = new Set(overrides.map((row) => row.key));
        let targetChatId: number | undefined;
        if (target.scope === 'chat') targetChatId = target.chatId;

        return json({
            fields: readable.filter((field) => field.key !== 'availableModels')
                .map((field) => ({
                    ...field,
                    overridden: overridden.has(field.key),
                    writable: canAccessConfig(
                        field.key,
                        target.scope,
                        'write',
                        selection.access,
                        targetChatId,
                    ),
                })),
            scopes,
            chats,
            scope,
            chatId: targetChatId,
            isAdmin: isBotAdmin,
        });
    });
}

async function selectTarget(
    scope: UiScope,
    chatId: number,
    chats: ChatOption[],
    isBotAdmin: boolean,
    userId: number,
    roles: Awaited<ReturnType<UserRoleRepository['getActiveRoles']>>,
    api: Api,
): Promise<{
    target?: ConfigTarget;
    access: ConfigAccessContext;
    unavailable?: boolean;
}> {
    if (scope === 'personal') return { access: { globalRoles: roles } };
    if (scope === 'global') {
        const access = { globalRoles: roles };
        if (!hasReadableGlobalConfig(access)) return { access };
        return {
            target: { scope: 'global' },
            access,
        };
    }

    const chat = chats.find((item) =>
        item.id === chatId && item.type === scope
    );
    if (!chat) return { access: { globalRoles: roles } };

    let isChatAdmin = isBotAdmin || chat.type === 'private';
    if (!isChatAdmin) {
        let member;
        try {
            member = await api.getChatMember(chat.id, userId);
        } catch (error) {
            if (
                error instanceof GrammyError &&
                (error.error_code === 400 || error.error_code === 403)
            ) {
                return {
                    access: { globalRoles: roles },
                    unavailable: true,
                };
            }
            throw error;
        }
        isChatAdmin = member.status === 'administrator' ||
            member.status === 'creator';
    }

    return {
        target: { scope: 'chat', chatId: chat.id },
        access: {
            globalRoles: roles,
            chatId: chat.id,
            isChatMember: true,
            isChatAdmin,
        },
    };
}
