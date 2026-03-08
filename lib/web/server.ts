import { extname, join, normalize } from 'node:path';
import { desc, eq, inArray } from 'drizzle-orm';
import { Bot } from 'grammy';
import type { Chat as TgChat } from 'grammy_types';
import {
    getGlobalUserConfig,
    mergeWithChatOverride,
    parseChatOverridePayload,
    parseUserConfigPayload,
    serializeChatOverride,
    serializeUserConfig,
    setGlobalUserConfig,
    UserConfig,
} from '../config.ts';
import { SlushaContext } from '../telegram/setup-bot.ts';
import {
    canEditChatConfig,
    canEditGlobalConfig,
    resolveConfigRole,
} from './permissions.ts';
import {
    buildBootstrapCapabilities,
    getModelOptionsForRole,
    projectEffectiveConfigForRole,
    projectGlobalConfigForRole,
    sanitizeChatOverrideForRole,
} from './config-policy.ts';
import { verifyTelegramInitData } from './auth.ts';
import logger from '../logger.ts';
import { type BotCharacter, ChatMemory, Memory } from '../memory.ts';
import { chatMembers, chats } from '../db/schema.ts';
import { ALLOWED_REACTIONS } from '../telegram/reactions.ts';
import { getUsageSnapshot, renderProgressBar } from '../telegram/usage-window.ts';

interface RuntimeConfigAccess {
    getBotToken: () => string;
}

interface StartWebServerOptions {
    bot: Bot<SlushaContext>;
    memory: Memory;
    runtimeConfig: RuntimeConfigAccess;
}

interface AvailableChat {
    id: number;
    title: string;
    username?: string;
    type: TgChat['type'];
}

interface CurrentCharacterPayload {
    name: string;
    names: string[];
    description: string;
    scenario: string;
    systemPrompt: string;
    postHistoryInstructions: string;
    firstMessage: string;
    messageExample: string;
}

interface ChatInternalsPayload {
    summary: string;
    personalNotes: string;
}

interface UsageWindowStatusPayload {
    tier: 'free' | 'trusted';
    downgraded: boolean;
    userUsed: number;
    userMax: number;
    userWindowMinutes: number;
    userBar: string;
    chatUsed: number;
    chatMax: number;
    chatWindowMinutes: number;
    chatBar: string;
}

function projectCurrentCharacter(
    character?: BotCharacter,
): CurrentCharacterPayload | undefined {
    if (!character) {
        return undefined;
    }

    return {
        name: character.name,
        names: character.names,
        description: character.description,
        scenario: character.scenario,
        systemPrompt: character.system_prompt,
        postHistoryInstructions: character.post_history_instructions,
        firstMessage: character.first_mes,
        messageExample: character.mes_example,
    };
}

function readChatSummary(chatId: number, infoRaw: string): AvailableChat {
    try {
        const info = JSON.parse(infoRaw) as TgChat;
        const title = info.type === 'private'
            ? [info.first_name, info.last_name].filter(Boolean).join(' ').trim()
            : info.title;
        const normalizedTitle = typeof title === 'string' &&
                title.trim().length > 0
            ? title.trim()
            : String(chatId);

        return {
            id: chatId,
            title: normalizedTitle,
            username: info.username ?? undefined,
            type: info.type,
        };
    } catch {
        return {
            id: chatId,
            title: String(chatId),
            type: 'group',
        };
    }
}

function notesToSummary(notes: string[]): string {
    return notes.join('\n\n');
}

function summaryToNotes(summary: string): string[] {
    return summary
        .split(/\n{2,}/)
        .map((item) => item.trim())
        .filter((item) => item.length > 0);
}

async function resolveAvailableChats(
    options: StartWebServerOptions,
    userId: number,
    includeAllChats: boolean,
): Promise<AvailableChat[]> {
    if (includeAllChats) {
        const chatRows = await options.memory.db
            .select({
                id: chats.id,
                info: chats.info,
            })
            .from(chats)
            .orderBy(desc(chats.lastUse));

        return chatRows.map((chat) => readChatSummary(chat.id, chat.info));
    }

    const memberRows = await options.memory.db
        .select({
            chatId: chatMembers.chatId,
            lastUse: chatMembers.lastUse,
        })
        .from(chatMembers)
        .where(eq(chatMembers.userId, userId))
        .orderBy(desc(chatMembers.lastUse));

    if (memberRows.length === 0) {
        return [];
    }

    const candidateChatIds = memberRows.map((row) => row.chatId);
    const chatRows = await options.memory.db
        .select({
            id: chats.id,
            info: chats.info,
        })
        .from(chats)
        .where(inArray(chats.id, candidateChatIds));

    if (chatRows.length === 0) {
        return [];
    }

    const chatMap = new Map(chatRows.map((row) => [row.id, row]));
    const seen = new Set<number>();
    const filtered = await Promise.all(memberRows.map(async ({ chatId }) => {
        if (seen.has(chatId)) {
            return undefined;
        }
        seen.add(chatId);

        const chat = chatMap.get(chatId);
        if (!chat) {
            return undefined;
        }

        if (chatId === userId) {
            return readChatSummary(chatId, chat.info);
        }

        try {
            const member = await options.bot.api.getChatMember(chatId, userId);
            const isAdmin = member.status === 'creator' ||
                member.status === 'administrator';
            if (!isAdmin) {
                return undefined;
            }
        } catch {
            // Unknown membership/admin state: keep chat in list.
        }

        return readChatSummary(chatId, chat.info);
    }));

    return filtered.filter((chat): chat is AvailableChat => Boolean(chat));
}

function jsonResponse(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), {
        status,
        headers: {
            'content-type': 'application/json; charset=utf-8',
        },
    });
}

function pickInitData(req: Request): string {
    const custom = req.headers.get('x-telegram-init-data');
    if (custom) return custom;

    const auth = req.headers.get('authorization');
    if (auth?.startsWith('tma ')) {
        return auth.slice(4).trim();
    }

    return '';
}

function contentType(filePath: string): string {
    const ext = extname(filePath).toLowerCase();
    if (ext === '.html') return 'text/html; charset=utf-8';
    if (ext === '.js') return 'application/javascript; charset=utf-8';
    if (ext === '.css') return 'text/css; charset=utf-8';
    if (ext === '.json') return 'application/json; charset=utf-8';
    if (ext === '.svg') return 'image/svg+xml';
    if (ext === '.png') return 'image/png';
    if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
    if (ext === '.ico') return 'image/x-icon';
    return 'application/octet-stream';
}

async function serveWidgetAsset(
    pathname: string,
): Promise<Response | undefined> {
    if (!pathname.startsWith('/widget')) return undefined;

    const baseDir = normalize(join(Deno.cwd(), 'widget', 'dist'));
    const relPath = pathname.replace(/^\/widget\/?/, '');
    const requested = relPath.length > 0 ? relPath : 'index.html';
    const target = normalize(join(baseDir, requested));

    if (!target.startsWith(baseDir)) {
        return new Response('Forbidden', { status: 403 });
    }

    try {
        const data = await Deno.readFile(target);
        return new Response(data, {
            status: 200,
            headers: { 'content-type': contentType(target) },
        });
    } catch {
        if (pathname.startsWith('/widget/')) {
            try {
                const indexPath = join(baseDir, 'index.html');
                const html = await Deno.readFile(indexPath);
                return new Response(html, {
                    status: 200,
                    headers: { 'content-type': 'text/html; charset=utf-8' },
                });
            } catch {
                return new Response('Widget is not built', { status: 503 });
            }
        }

        return new Response('Not found', { status: 404 });
    }
}

export function startWebServer(options: StartWebServerOptions) {
    const port = Number(Deno.env.get('WEB_PORT') ?? '8080');
    const hostname = Deno.env.get('WEB_HOST') ?? '0.0.0.0';

    const server = Deno.serve({ port, hostname }, async (req) => {
        const url = new URL(req.url);

        if (req.method === 'GET') {
            const staticResponse = await serveWidgetAsset(url.pathname);
            if (staticResponse) return staticResponse;
        }

        if (url.pathname === '/healthz') {
            return new Response('ok');
        }

        if (!url.pathname.startsWith('/api/config/')) {
            return new Response('Not found', { status: 404 });
        }

        try {
            const initData = pickInitData(req);
            const verified = await verifyTelegramInitData(
                initData,
                options.runtimeConfig.getBotToken(),
            );
            const userId = verified.user?.id;
            const globalConfig = await getGlobalUserConfig(options.memory.db);
            const role = resolveConfigRole(globalConfig, userId);

            if (
                url.pathname === '/api/config/bootstrap' && req.method === 'GET'
            ) {
                const chatIdRaw = url.searchParams.get('chatId');
                const chatId = chatIdRaw ? Number(chatIdRaw) : undefined;

                const canEditGlobal = canEditGlobalConfig(
                    globalConfig,
                    userId,
                );
                const canViewGlobal = canEditGlobal;
                const availableChats = userId
                    ? await resolveAvailableChats(
                        options,
                        userId,
                        canEditGlobal,
                    )
                    : [];
                const serializedGlobalConfig = JSON.parse(
                    serializeUserConfig(globalConfig),
                ) as UserConfig;
                const globalPayload = projectGlobalConfigForRole(
                    serializedGlobalConfig,
                    role,
                );

                let chatOverridePayload: unknown = undefined;
                let effectiveConfigPayload: unknown = undefined;
                let currentCharacter: unknown = undefined;
                let canEditChat = false;
                let canEditChatInternals = false;
                let chatInternalsPayload: ChatInternalsPayload | undefined;
                let usageWindowStatus: UsageWindowStatusPayload | undefined;

                if (chatId !== undefined && Number.isFinite(chatId)) {
                    canEditChat = await canEditChatConfig(
                        options.bot,
                        globalConfig,
                        chatId,
                        userId,
                    );
                    if (canEditChat) {
                        const chat = await options.bot.api.getChat(chatId);
                        const chatMemory = new ChatMemory(options.memory, chat);
                        const currentChat = await chatMemory.getChat();
                        canEditChatInternals = role === 'admin';
                        currentCharacter = projectCurrentCharacter(
                            currentChat.character,
                        );
                        if (canEditChatInternals) {
                            chatInternalsPayload = {
                                summary: notesToSummary(currentChat.notes),
                                personalNotes: currentChat.memory ?? '',
                            };
                        }
                        const chatOverride = await chatMemory
                            .getChatConfigOverride();
                        chatOverridePayload = chatOverride
                            ? JSON.parse(
                                serializeChatOverride(
                                    sanitizeChatOverrideForRole(
                                        chatOverride,
                                        role,
                                        globalConfig,
                                        false,
                                    ),
                                ),
                            )
                            : {};

                        const effectiveConfig = mergeWithChatOverride(
                            globalConfig,
                            chatOverride,
                        );
                        const serializedEffectiveConfig = JSON.parse(
                            serializeUserConfig(effectiveConfig),
                        ) as UserConfig;
                        effectiveConfigPayload = projectEffectiveConfigForRole(
                            serializedEffectiveConfig,
                            role,
                        );

                        if (userId) {
                            const usageSnapshot = await getUsageSnapshot(
                                options.memory.db,
                                {
                                    config: globalConfig,
                                    chatId,
                                    userId,
                                    chatOverride,
                                },
                            );
                            usageWindowStatus = {
                                tier: usageSnapshot.tier,
                                downgraded: usageSnapshot.downgraded,
                                userUsed: usageSnapshot.user.used,
                                userMax: usageSnapshot.user.maxRequests,
                                userWindowMinutes:
                                    usageSnapshot.user.windowMinutes,
                                userBar: renderProgressBar(
                                    usageSnapshot.user.used,
                                    usageSnapshot.user.maxRequests,
                                    16,
                                ),
                                chatUsed: usageSnapshot.chat.used,
                                chatMax: usageSnapshot.chat.maxRequests,
                                chatWindowMinutes:
                                    usageSnapshot.chat.windowMinutes,
                                chatBar: renderProgressBar(
                                    usageSnapshot.chat.used,
                                    usageSnapshot.chat.maxRequests,
                                    16,
                                ),
                            };
                        }
                    }
                }

                const capabilities = buildBootstrapCapabilities(role);

                return jsonResponse({
                    role: capabilities.role,
                    categories: capabilities.categories,
                    availableModels: getModelOptionsForRole(globalConfig, role),
                    availableReactions: [...ALLOWED_REACTIONS],
                    canViewGlobal,
                    canEditGlobal,
                    canEditChat,
                    canEditChatInternals,
                    availableChats,
                    globalPayload,
                    chatOverridePayload,
                    effectiveConfigPayload,
                    currentCharacter,
                    chatInternalsPayload,
                    usageWindowStatus,
                });
            }

            if (
                /^\/api\/config\/chat\/-?\d+\/internals$/.test(url.pathname) &&
                req.method === 'PUT'
            ) {
                const match = /^\/api\/config\/chat\/(-?\d+)\/internals$/
                    .exec(url.pathname);
                const chatId = Number(match?.[1]);
                if (!Number.isFinite(chatId)) {
                    return jsonResponse({ error: 'Invalid chat id' }, 400);
                }

                const allowed = await canEditChatConfig(
                    options.bot,
                    globalConfig,
                    chatId,
                    userId,
                );
                if (!allowed) {
                    return jsonResponse({ error: 'Forbidden' }, 403);
                }

                if (role !== 'admin') {
                    return jsonResponse({ error: 'Forbidden' }, 403);
                }

                const body = await req.json() as {
                    payload?: { summary?: unknown; personalNotes?: unknown };
                };
                if (!body.payload || typeof body.payload !== 'object') {
                    return jsonResponse({ error: 'Missing payload' }, 400);
                }

                const summary = typeof body.payload.summary === 'string'
                    ? body.payload.summary
                    : '';
                const personalNotes =
                    typeof body.payload.personalNotes === 'string'
                        ? body.payload.personalNotes
                        : '';

                const chatMemory = new ChatMemory(
                    options.memory,
                    await options.bot.api.getChat(chatId),
                );
                await chatMemory.setNotes(summaryToNotes(summary));
                await chatMemory.setMemory(
                    personalNotes.trim().length > 0 ? personalNotes : undefined,
                );

                return jsonResponse({ ok: true });
            }

            if (url.pathname === '/api/config/global' && req.method === 'PUT') {
                if (!canEditGlobalConfig(globalConfig, userId)) {
                    return jsonResponse({ error: 'Forbidden' }, 403);
                }

                const body = await req.json() as { payload?: unknown };
                if (!body.payload) {
                    return jsonResponse({ error: 'Missing payload' }, 400);
                }

                const parsed = parseUserConfigPayload(
                    JSON.stringify(body.payload),
                );
                await setGlobalUserConfig(
                    parsed,
                    userId,
                    options.memory.db,
                );

                return jsonResponse({ ok: true });
            }

            if (
                url.pathname.startsWith('/api/config/chat/') &&
                req.method === 'PUT'
            ) {
                const chatIdRaw = url.pathname.replace('/api/config/chat/', '');
                const chatId = Number(chatIdRaw);
                if (!Number.isFinite(chatId)) {
                    return jsonResponse({ error: 'Invalid chat id' }, 400);
                }

                const allowed = await canEditChatConfig(
                    options.bot,
                    globalConfig,
                    chatId,
                    userId,
                );
                if (!allowed) {
                    return jsonResponse({ error: 'Forbidden' }, 403);
                }

                const body = await req.json() as { payload?: unknown };
                if (!body.payload) {
                    return jsonResponse({ error: 'Missing payload' }, 400);
                }

                const parsedOverride = parseChatOverridePayload(
                    JSON.stringify(body.payload),
                );
                const sanitizedOverride = sanitizeChatOverrideForRole(
                    parsedOverride,
                    role,
                    globalConfig,
                );
                const chatMemory = new ChatMemory(
                    options.memory,
                    await options.bot.api.getChat(chatId),
                );
                await chatMemory.setChatConfigOverride(
                    sanitizedOverride,
                    userId,
                );

                return jsonResponse({ ok: true });
            }

            return new Response('Not found', { status: 404 });
        } catch (error) {
            logger.error('Web API error: ', error);
            const message = error instanceof Error
                ? error.message
                : 'Unknown error';
            return jsonResponse({ error: message }, 400);
        }
    });

    logger.info(`Web server started on ${hostname}:${port}`);

    return server;
}
