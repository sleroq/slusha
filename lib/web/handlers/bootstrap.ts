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

function resolveAvailableChats(): AvailableChat[] {
    // TODO: Add the new available chats implementation soon.
    return [];
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
    const availableChats = userId ? resolveAvailableChats() : [];
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
