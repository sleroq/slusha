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

const managedGlobal: ScopePolicy = {
    read: ['bot_admin', 'trusted_user'],
    write: ['bot_admin', 'trusted_user'],
};
const restrictedChat: ScopePolicy = {
    read: ['bot_admin', 'trusted_user'],
    write: ['bot_admin', 'trusted_user'],
};
const managedChat: ScopePolicy = {
    read: ['bot_admin', 'trusted_user', 'chat_member'],
    write: ['bot_admin', 'trusted_user', 'chat_admin'],
};

const configOptionPolicyDefinitions = {
    'ai.prePrompt': { global: managedGlobal, chat: restrictedChat },
    'ai.prompt': { global: managedGlobal, chat: restrictedChat },
    'ai.privateChatPromptAddition': {
        global: managedGlobal,
        chat: restrictedChat,
    },
    'ai.groupChatPromptAddition': {
        global: managedGlobal,
        chat: restrictedChat,
    },
    'ai.commentsPromptAddition': {
        global: managedGlobal,
        chat: restrictedChat,
    },
    'ai.hateModePrompt': { global: managedGlobal, chat: restrictedChat },
    'ai.finalPrompt': { global: managedGlobal, chat: restrictedChat },
    'ai.chatActionsToolDescription': {
        global: managedGlobal,
        chat: restrictedChat,
    },
    'availableModels': { global: managedGlobal },
    'ai.model': { global: managedGlobal, chat: restrictedChat },
    'ai.temperature': { global: managedGlobal, chat: restrictedChat },
    'ai.topK': { global: managedGlobal, chat: restrictedChat },
    'ai.topP': { global: managedGlobal, chat: restrictedChat },
    'ai.messagesToPass': { global: managedGlobal, chat: restrictedChat },
    'ai.messageMaxLength': { global: managedGlobal, chat: restrictedChat },
    'ai.includeAttachmentsInHistory': {
        global: managedGlobal,
        chat: managedChat,
    },
    'ai.autoRerouteImageAttachments': { global: managedGlobal },
    'ai.imageAttachmentFallbackModel': { global: managedGlobal },
    'ai.bytesLimit': { global: managedGlobal, chat: restrictedChat },
    'ai.google.structuredOutputs': {
        global: managedGlobal,
        chat: restrictedChat,
    },
    'startMessage': { global: managedGlobal, chat: restrictedChat },
    'names': { global: managedGlobal, chat: restrictedChat },
    'tendToReply': { global: managedGlobal, chat: restrictedChat },
    'tendToReplyProbability': { global: managedGlobal, chat: restrictedChat },
    'tendToIgnore': { global: managedGlobal, chat: restrictedChat },
    'tendToIgnoreProbability': { global: managedGlobal, chat: restrictedChat },
    'randomReplyProbability': { global: managedGlobal, chat: restrictedChat },
    'locale': { global: managedGlobal, chat: restrictedChat },
    'blacklistedReactions': { global: managedGlobal, chat: restrictedChat },
    'nepons': { global: managedGlobal, chat: restrictedChat },
    'filesMaxAge': { global: managedGlobal, chat: restrictedChat },
    'maxMessagesToStore': { global: managedGlobal, chat: managedChat },
    'responseDelay': { global: managedGlobal, chat: restrictedChat },
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
