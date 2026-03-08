import { desc, eq, inArray } from 'drizzle-orm';
import type { Chat as TgChat } from 'grammy_types';
import {
    mergeWithChatOverride,
    serializeChatOverride,
    serializeUserConfig,
    UserConfig,
} from '../../config.ts';
import { type BotCharacter, ChatMemory } from '../../memory.ts';
import { chatMembers, chats } from '../../db/schema.ts';
import { ALLOWED_REACTIONS } from '../../telegram/reactions.ts';
import {
    getUsageSnapshot,
    renderProgressBar,
} from '../../telegram/usage-window.ts';
import {
    buildBootstrapCapabilities,
    getModelOptionsForRole,
    projectEffectiveConfigForRole,
    projectGlobalConfigForRole,
    sanitizeChatOverrideForRole,
} from '../config-policy.ts';
import { jsonResponse } from '../http.ts';
import { canEditChatConfig, canEditGlobalConfig } from '../permissions.ts';
import { RequestContext } from '../request-context.ts';
import {
    AvailableChat,
    ChatInternalsPayload,
    CurrentCharacterPayload,
    StartWebServerOptions,
    UsageWindowStatusPayload,
} from '../types.ts';

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
        const normalizedTitle =
            typeof title === 'string' && title.trim().length > 0
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

export async function handleBootstrapRequest(
    req: Request,
    url: URL,
    options: StartWebServerOptions,
    context: RequestContext,
): Promise<Response> {
    if (req.method !== 'GET') {
        return new Response('Not found', { status: 404 });
    }

    const chatIdRaw = url.searchParams.get('chatId');
    const chatId = chatIdRaw ? Number(chatIdRaw) : undefined;
    const { globalConfig, role, userId } = context;

    const canEditGlobal = canEditGlobalConfig(globalConfig, userId);
    const canViewGlobal = canEditGlobal;
    const availableChats = userId
        ? await resolveAvailableChats(options, userId, canEditGlobal)
        : [];
    const serializedGlobalConfig = JSON.parse(
        serializeUserConfig(globalConfig),
    ) as UserConfig;
    const globalPayload = projectGlobalConfigForRole(
        serializedGlobalConfig,
        role,
    );
    let chatBasePayload = projectEffectiveConfigForRole(
        serializedGlobalConfig,
        role,
    );
    if (role === 'admin') {
        chatBasePayload = {
            ...chatBasePayload,
            requestWindow: serializedGlobalConfig.requestWindow,
        };
    }

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
            currentCharacter = projectCurrentCharacter(currentChat.character);
            if (canEditChatInternals) {
                chatInternalsPayload = {
                    summary: notesToSummary(currentChat.notes),
                    personalNotes: currentChat.memory ?? '',
                };
            }
            const chatOverride = await chatMemory.getChatConfigOverride();
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
                    userWindowMinutes: usageSnapshot.user.windowMinutes,
                    userBar: renderProgressBar(
                        usageSnapshot.user.used,
                        usageSnapshot.user.maxRequests,
                        16,
                    ),
                    chatUsed: usageSnapshot.chat.used,
                    chatMax: usageSnapshot.chat.maxRequests,
                    chatWindowMinutes: usageSnapshot.chat.windowMinutes,
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
        chatBasePayload,
        chatOverridePayload,
        effectiveConfigPayload,
        currentCharacter,
        chatInternalsPayload,
        usageWindowStatus,
    });
}
