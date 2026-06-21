import type { Chat as TgChat } from 'grammy_types';
import {
    mergeWithChatOverride,
    toStoredChatOverride,
    toStoredUserConfig,
    UserConfig,
} from '../../config.ts';
import type { BotCharacter } from '../../persistence/types.ts';
import { ChatConfigRepository } from '../../persistence/chat-config.ts';
import { ChatRepository } from '../../persistence/chats.ts';
import { ALLOWED_REACTIONS } from '../../telegram/reactions.ts';
import {
    buildBootstrapCapabilities,
    getModelOptionsForRole,
    projectChatBaseConfigForRole,
    projectEffectiveConfigForRole,
    projectGlobalConfigForRole,
    sanitizeChatOverrideForRole,
} from '../config-policy.ts';
import { jsonResponse } from '../http.ts';
import { canEditChatConfig, canEditGlobalConfig } from '../permissions.ts';
import { RequestContext } from '../request-context.ts';
import {
    AvailableChat,
    CurrentCharacterPayload,
    StartWebServerOptions,
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

async function resolveAvailableChats(
    options: StartWebServerOptions,
    userId: number,
    includeAllChats: boolean,
): Promise<AvailableChat[]> {
    const chats = new ChatRepository(options.db);
    if (includeAllChats) {
        const chatRows = await chats.listAvailableChats();
        return chatRows.map((chat) => readChatSummary(chat.id, chat.info));
    }

    const chatRows = await chats.listChatsForMember(userId);

    if (chatRows.length === 0) {
        return [];
    }

    const seen = new Set<number>();
    const filtered = await Promise.all(chatRows.map(async (chat) => {
        const chatId = chat.id;
        if (seen.has(chatId)) {
            return undefined;
        }
        seen.add(chatId);

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
        JSON.stringify(toStoredUserConfig(globalConfig)),
    ) as UserConfig;
    const globalPayload = projectGlobalConfigForRole(
        serializedGlobalConfig,
        role,
    );
    const chatBasePayload = projectChatBaseConfigForRole(
        serializedGlobalConfig,
        role,
    );

    let chatOverridePayload: unknown = undefined;
    let effectiveConfigPayload: unknown = undefined;
    let currentCharacter: unknown = undefined;
    let canEditChat = false;

    if (chatId !== undefined && Number.isFinite(chatId)) {
        canEditChat = await canEditChatConfig(
            options.bot,
            globalConfig,
            chatId,
            userId,
        );
        if (canEditChat) {
            const chat = await options.bot.api.getChat(chatId);
            const chats = new ChatRepository(options.db);
            await chats.ensureChat(chat);
            const currentChat = await chats.getChat(chat);
            currentCharacter = projectCurrentCharacter(currentChat.character);
            const chatConfig = new ChatConfigRepository(options.db, chatId);
            const chatOverride = await chatConfig.getChatConfigOverride();
            chatOverridePayload = chatOverride
                ? JSON.parse(
                    JSON.stringify(toStoredChatOverride(
                        sanitizeChatOverrideForRole(
                            chatOverride,
                            role,
                            globalConfig,
                            false,
                        ),
                    )),
                )
                : {};

            const effectiveConfig = mergeWithChatOverride(
                globalConfig,
                chatOverride,
            );
            const serializedEffectiveConfig = JSON.parse(
                JSON.stringify(toStoredUserConfig(effectiveConfig)),
            ) as UserConfig;
            effectiveConfigPayload = projectEffectiveConfigForRole(
                serializedEffectiveConfig,
                role,
            );
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
        availableChats,
        globalPayload,
        chatBasePayload,
        chatOverridePayload,
        effectiveConfigPayload,
        currentCharacter,
    });
}
