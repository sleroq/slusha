import type { GlobalRole } from './persistence/user-roles.ts';

export type ConfigScope = 'global' | 'chat';
export type ConfigAction = 'read' | 'write';
export type PermissionGroup = GlobalRole | 'chat_member' | 'chat_admin';

type ScopePolicy = {
    read: readonly PermissionGroup[];
    write: readonly PermissionGroup[];
};

export type ConfigOptionPolicy = {
    global?: ScopePolicy;
    chat?: ScopePolicy;
};

const botAdminOnly: ScopePolicy = {
    read: ['bot_admin'],
    write: ['bot_admin'],
};
const managedGlobal: ScopePolicy = {
    read: ['bot_admin', 'trusted_user'],
    write: ['bot_admin', 'trusted_user'],
};
const managedChat: ScopePolicy = {
    read: ['bot_admin', 'chat_member'],
    write: ['bot_admin', 'chat_admin'],
};

const configOptionPolicyDefinitions = {
    'ai.prePrompt': { global: botAdminOnly, chat: managedChat },
    'ai.prompt': { global: botAdminOnly, chat: managedChat },
    'ai.privateChatPromptAddition': {
        global: botAdminOnly,
        chat: managedChat,
    },
    'ai.groupChatPromptAddition': {
        global: botAdminOnly,
        chat: managedChat,
    },
    'ai.commentsPromptAddition': {
        global: botAdminOnly,
        chat: managedChat,
    },
    'ai.hateModePrompt': { global: botAdminOnly, chat: managedChat },
    'ai.finalPrompt': { global: botAdminOnly, chat: managedChat },
    'ai.chatActionsToolDescription': {
        global: botAdminOnly,
        chat: managedChat,
    },
    'ai.google.safetySettings': { global: botAdminOnly },
    'availableModels': { global: botAdminOnly },
    'ai.model': { global: managedGlobal, chat: managedChat },
    'ai.temperature': { global: managedGlobal, chat: managedChat },
    'ai.topK': { global: managedGlobal, chat: managedChat },
    'ai.topP': { global: managedGlobal, chat: managedChat },
    'ai.messagesToPass': { global: managedGlobal, chat: managedChat },
    'ai.messageMaxLength': { global: managedGlobal, chat: managedChat },
    'ai.includeAttachmentsInHistory': {
        global: managedGlobal,
        chat: managedChat,
    },
    'ai.bytesLimit': { global: managedGlobal, chat: managedChat },
    'ai.google.structuredOutputs': {
        global: managedGlobal,
        chat: managedChat,
    },
    'ai.openrouter.usageInclude': {
        global: managedGlobal,
        chat: managedChat,
    },
    'ai.generation.chat.thinking.thinkingLevel': {
        global: managedGlobal,
        chat: managedChat,
    },
    'ai.generation.chat.thinking.includeThoughts': {
        global: managedGlobal,
        chat: managedChat,
    },
    'ai.generation.chat.maxOutputTokens': {
        global: managedGlobal,
        chat: managedChat,
    },
    'ai.generation.character.thinking.thinkingLevel': {
        global: managedGlobal,
        chat: managedChat,
    },
    'ai.generation.character.thinking.includeThoughts': {
        global: managedGlobal,
        chat: managedChat,
    },
    'ai.generation.character.maxOutputTokens': {
        global: managedGlobal,
        chat: managedChat,
    },
    'startMessage': { global: managedGlobal, chat: managedChat },
    'names': { global: managedGlobal, chat: managedChat },
    'tendToReply': { global: managedGlobal, chat: managedChat },
    'tendToReplyProbability': { global: managedGlobal, chat: managedChat },
    'tendToIgnore': { global: managedGlobal, chat: managedChat },
    'tendToIgnoreProbability': { global: managedGlobal, chat: managedChat },
    'randomReplyProbability': { global: managedGlobal, chat: managedChat },
    'locale': { global: managedGlobal, chat: managedChat },
    'blacklistedReactions': { global: managedGlobal, chat: managedChat },
    'nepons': { global: managedGlobal, chat: managedChat },
    'filesMaxAge': { global: managedGlobal, chat: managedChat },
    'maxMessagesToStore': { global: managedGlobal, chat: managedChat },
    'responseDelay': { global: managedGlobal, chat: managedChat },
} satisfies Readonly<Record<string, ConfigOptionPolicy>>;

export type ConfigKey = keyof typeof configOptionPolicyDefinitions;

export const configOptionPolicies: Readonly<
    Record<ConfigKey, ConfigOptionPolicy>
> = Object.freeze(configOptionPolicyDefinitions);

export function isConfigKey(key: string): key is ConfigKey {
    return key in configOptionPolicies;
}

export function getConfigOptionPolicy(
    key: string,
): ConfigOptionPolicy | undefined {
    if (!isConfigKey(key)) return undefined;
    return (configOptionPolicies as Readonly<
        Record<string, ConfigOptionPolicy>
    >)[key];
}

export type ConfigAccessContext = {
    globalRoles: ReadonlySet<GlobalRole>;
    chatId?: number;
    isChatMember?: boolean;
    isChatAdmin?: boolean;
};

export function hasGlobalRole(
    context: ConfigAccessContext,
    role: GlobalRole,
): boolean {
    return context.globalRoles.has(role);
}

export function canAccessConfig(
    key: string,
    scope: ConfigScope,
    action: ConfigAction,
    context: ConfigAccessContext,
    chatId?: number,
): boolean {
    const policy = getConfigOptionPolicy(key)?.[scope];
    if (!policy) return false;

    const allowed = policy[action];
    if (allowed.includes('bot_admin') && hasGlobalRole(context, 'bot_admin')) {
        return true;
    }
    if (scope === 'chat') {
        if (chatId === undefined || context.chatId !== chatId) return false;
        if (!context.isChatMember) return false;
    }

    for (const role of context.globalRoles) {
        if (allowed.includes(role)) return true;
    }
    if (context.isChatAdmin && allowed.includes('chat_admin')) return true;
    return allowed.includes('chat_member');
}

export function canReadChatData(
    context: ConfigAccessContext,
    chatId: number,
): boolean {
    if (hasGlobalRole(context, 'bot_admin')) return true;
    return context.chatId === chatId && context.isChatMember === true;
}

export function canManageChat(
    context: ConfigAccessContext,
    chatId: number,
): boolean {
    if (hasGlobalRole(context, 'bot_admin')) return true;
    return context.chatId === chatId && context.isChatMember === true &&
        context.isChatAdmin === true;
}
