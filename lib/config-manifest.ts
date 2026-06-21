export type ConfigRole = 'regular' | 'trusted' | 'admin';

export type ConfigScope = 'global' | 'chat';

export type ConfigCategory =
    | 'general'
    | 'model'
    | 'prompts'
    | 'advanced'
    | 'admin';

type BaseField = {
    category: ConfigCategory;
    label: string;
    description: string;
    globalRoles: readonly ConfigRole[];
    chatRoles: readonly ConfigRole[];
};

type GlobalOnlyField = BaseField & {
    scope: 'global';
    path: string;
};

type ChatOverrideField = BaseField & {
    scope: 'global-chat';
    path: string;
    overridePath: string;
    storage: 'direct' | 'delta';
};

export type ConfigField = GlobalOnlyField | ChatOverrideField;

const adminOnly: readonly ConfigRole[] = ['admin'];
const trustedAndAdmin: readonly ConfigRole[] = ['trusted', 'admin'];
const regularTrustedAndAdmin: readonly ConfigRole[] = [
    'regular',
    'trusted',
    'admin',
];

export const configFieldManifest = [
    {
        path: 'startMessage',
        scope: 'global',
        category: 'general',
        label: 'Start message',
        description: 'Shown when someone starts the bot.',
        globalRoles: adminOnly,
        chatRoles: [],
    },
    {
        path: 'filesMaxAge',
        scope: 'global',
        category: 'general',
        label: 'File retention',
        description: 'How long uploaded files remain available.',
        globalRoles: adminOnly,
        chatRoles: [],
    },
    {
        path: 'names',
        overridePath: 'names',
        scope: 'global-chat',
        storage: 'direct',
        category: 'general',
        label: 'Bot names',
        description: 'Names and patterns used for mention matching.',
        globalRoles: adminOnly,
        chatRoles: regularTrustedAndAdmin,
    },
    {
        path: 'tendToReply',
        overridePath: 'tendToReply',
        scope: 'global-chat',
        storage: 'direct',
        category: 'general',
        label: 'Reply trigger patterns',
        description: 'Patterns that make the bot more likely to reply.',
        globalRoles: adminOnly,
        chatRoles: regularTrustedAndAdmin,
    },
    {
        path: 'tendToIgnore',
        overridePath: 'tendToIgnore',
        scope: 'global-chat',
        storage: 'direct',
        category: 'general',
        label: 'Ignore trigger patterns',
        description: 'Patterns that make the bot more likely to stay silent.',
        globalRoles: adminOnly,
        chatRoles: regularTrustedAndAdmin,
    },
    {
        path: 'blacklistedReactions',
        overridePath: 'blacklistedReactions',
        scope: 'global-chat',
        storage: 'direct',
        category: 'general',
        label: 'Blacklisted reactions',
        description: 'Reactions blocked for the bot.',
        globalRoles: adminOnly,
        chatRoles: regularTrustedAndAdmin,
    },
    {
        path: 'nepons',
        overridePath: 'nepons',
        scope: 'global-chat',
        storage: 'direct',
        category: 'general',
        label: 'Nepon replies',
        description: 'Fallback replies used when the bot declines to answer.',
        globalRoles: adminOnly,
        chatRoles: regularTrustedAndAdmin,
    },
    {
        path: 'tendToReplyProbability',
        overridePath: 'tendToReplyProbability',
        scope: 'global-chat',
        storage: 'delta',
        category: 'general',
        label: 'Reply tendency',
        description: 'Chance to answer when a reply trigger matches.',
        globalRoles: adminOnly,
        chatRoles: regularTrustedAndAdmin,
    },
    {
        path: 'tendToIgnoreProbability',
        overridePath: 'tendToIgnoreProbability',
        scope: 'global-chat',
        storage: 'delta',
        category: 'general',
        label: 'Ignore tendency',
        description: 'Chance to stay silent when an ignore trigger matches.',
        globalRoles: adminOnly,
        chatRoles: regularTrustedAndAdmin,
    },
    {
        path: 'randomReplyProbability',
        overridePath: 'randomReplyProbability',
        scope: 'global-chat',
        storage: 'delta',
        category: 'general',
        label: 'Random reply chance',
        description: 'Fallback reply probability without explicit matches.',
        globalRoles: adminOnly,
        chatRoles: regularTrustedAndAdmin,
    },
    {
        path: 'responseDelay',
        overridePath: 'responseDelay',
        scope: 'global-chat',
        storage: 'delta',
        category: 'general',
        label: 'Response delay',
        description: 'Wait time before sending a reply.',
        globalRoles: adminOnly,
        chatRoles: regularTrustedAndAdmin,
    },
    {
        path: 'ai.model',
        overridePath: 'ai.model',
        scope: 'global-chat',
        storage: 'delta',
        category: 'model',
        label: 'Model',
        description: 'Model used for chat responses.',
        globalRoles: adminOnly,
        chatRoles: trustedAndAdmin,
    },
    {
        path: 'ai.temperature',
        overridePath: 'ai.temperature',
        scope: 'global-chat',
        storage: 'delta',
        category: 'model',
        label: 'Temperature',
        description: 'Higher values increase randomness.',
        globalRoles: adminOnly,
        chatRoles: trustedAndAdmin,
    },
    {
        path: 'ai.topK',
        overridePath: 'ai.topK',
        scope: 'global-chat',
        storage: 'delta',
        category: 'model',
        label: 'Top-K',
        description: 'Limits token choices to the top K candidates.',
        globalRoles: adminOnly,
        chatRoles: trustedAndAdmin,
    },
    {
        path: 'ai.topP',
        overridePath: 'ai.topP',
        scope: 'global-chat',
        storage: 'delta',
        category: 'model',
        label: 'Top-P',
        description: 'Uses nucleus sampling with cumulative probability P.',
        globalRoles: adminOnly,
        chatRoles: trustedAndAdmin,
    },
    {
        path: 'ai.prompt',
        overridePath: 'ai.prompt',
        scope: 'global-chat',
        storage: 'delta',
        category: 'prompts',
        label: 'Chat prompt',
        description: 'Core behavior/persona prompt.',
        globalRoles: adminOnly,
        chatRoles: trustedAndAdmin,
    },
    {
        path: 'ai.privateChatPromptAddition',
        overridePath: 'ai.privateChatPromptAddition',
        scope: 'global-chat',
        storage: 'delta',
        category: 'prompts',
        label: 'Private chat prompt addition',
        description: 'Extra instructions for private chats.',
        globalRoles: adminOnly,
        chatRoles: trustedAndAdmin,
    },
    {
        path: 'ai.groupChatPromptAddition',
        overridePath: 'ai.groupChatPromptAddition',
        scope: 'global-chat',
        storage: 'delta',
        category: 'prompts',
        label: 'Group chat prompt addition',
        description: 'Extra instructions for group chats.',
        globalRoles: adminOnly,
        chatRoles: trustedAndAdmin,
    },
    {
        path: 'ai.commentsPromptAddition',
        overridePath: 'ai.commentsPromptAddition',
        scope: 'global-chat',
        storage: 'delta',
        category: 'prompts',
        label: 'Comment prompt addition',
        description: 'Extra guidance for comment-style messages.',
        globalRoles: adminOnly,
        chatRoles: trustedAndAdmin,
    },
    {
        path: 'ai.hateModePrompt',
        overridePath: 'ai.hateModePrompt',
        scope: 'global-chat',
        storage: 'delta',
        category: 'prompts',
        label: 'Hate mode prompt',
        description: 'Special prompt used when hate mode is enabled.',
        globalRoles: adminOnly,
        chatRoles: trustedAndAdmin,
    },
    {
        path: 'ai.messagesToPass',
        overridePath: 'ai.messagesToPass',
        scope: 'global-chat',
        storage: 'delta',
        category: 'advanced',
        label: 'Messages passed to AI',
        description: 'Number of recent messages sent to the model.',
        globalRoles: adminOnly,
        chatRoles: trustedAndAdmin,
    },
    {
        path: 'ai.messageMaxLength',
        overridePath: 'ai.messageMaxLength',
        scope: 'global-chat',
        storage: 'delta',
        category: 'advanced',
        label: 'Max reply length',
        description: 'Soft limit for generated response length.',
        globalRoles: adminOnly,
        chatRoles: trustedAndAdmin,
    },
    {
        path: 'ai.includeAttachmentsInHistory',
        overridePath: 'ai.includeAttachmentsInHistory',
        scope: 'global-chat',
        storage: 'delta',
        category: 'advanced',
        label: 'Include attachments in history',
        description: 'Adds attachment text to model context when possible.',
        globalRoles: adminOnly,
        chatRoles: trustedAndAdmin,
    },
    {
        path: 'ai.bytesLimit',
        overridePath: 'ai.bytesLimit',
        scope: 'global-chat',
        storage: 'delta',
        category: 'advanced',
        label: 'Attachment byte limit',
        description: 'Maximum attachment size included in processing.',
        globalRoles: adminOnly,
        chatRoles: trustedAndAdmin,
    },
    {
        path: 'requestWindow.free.perChat.maxRequests',
        overridePath: 'requestWindowPerChat.free.maxRequests',
        scope: 'global-chat',
        storage: 'delta',
        category: 'admin',
        label: 'Free tier per-chat max requests',
        description: 'Chat-wide free-tier usage limit.',
        globalRoles: adminOnly,
        chatRoles: adminOnly,
    },
    {
        path: 'requestWindow.free.perChat.windowMinutes',
        overridePath: 'requestWindowPerChat.free.windowMinutes',
        scope: 'global-chat',
        storage: 'delta',
        category: 'admin',
        label: 'Free tier per-chat window',
        description: 'Rolling window for free-tier chat usage.',
        globalRoles: adminOnly,
        chatRoles: adminOnly,
    },
    {
        path: 'requestWindow.trusted.perChat.maxRequests',
        overridePath: 'requestWindowPerChat.trusted.maxRequests',
        scope: 'global-chat',
        storage: 'delta',
        category: 'admin',
        label: 'Trusted tier per-chat max requests',
        description: 'Chat-wide trusted-tier usage limit.',
        globalRoles: adminOnly,
        chatRoles: adminOnly,
    },
    {
        path: 'requestWindow.trusted.perChat.windowMinutes',
        overridePath: 'requestWindowPerChat.trusted.windowMinutes',
        scope: 'global-chat',
        storage: 'delta',
        category: 'admin',
        label: 'Trusted tier per-chat window',
        description: 'Rolling window for trusted-tier chat usage.',
        globalRoles: adminOnly,
        chatRoles: adminOnly,
    },
    {
        path: 'adminIds',
        scope: 'global',
        category: 'admin',
        label: 'Admin user ids',
        description: 'Telegram user ids with global config access.',
        globalRoles: adminOnly,
        chatRoles: [],
    },
    {
        path: 'trustedIds',
        scope: 'global',
        category: 'admin',
        label: 'Trusted user ids',
        description: 'Telegram user ids allowed to edit trusted chat settings.',
        globalRoles: adminOnly,
        chatRoles: [],
    },
    {
        path: 'availableModels',
        scope: 'global',
        category: 'admin',
        label: 'Allowed model names',
        description: 'Models available in config selectors.',
        globalRoles: adminOnly,
        chatRoles: [],
    },
] as const satisfies readonly ConfigField[];

export const chatOverrideFields = configFieldManifest.filter((field) =>
    field.scope === 'global-chat'
) as readonly Extract<ConfigField, { scope: 'global-chat' }>[];

export const chatOverrideContract = {
    regularDirect: chatOverrideFields
        .filter((field) =>
            field.storage === 'direct' && field.chatRoles.includes('regular')
        )
        .map((field) => field.overridePath),
    regularDelta: chatOverrideFields
        .filter((field) =>
            field.storage === 'delta' && field.chatRoles.includes('regular')
        )
        .map((field) => field.overridePath),
    trustedAi: chatOverrideFields
        .filter((field) =>
            field.overridePath.startsWith('ai.') &&
            field.chatRoles.includes('trusted')
        )
        .map((field) => field.overridePath.slice('ai.'.length)),
    adminWindow: chatOverrideFields
        .filter((field) =>
            field.overridePath.startsWith('requestWindowPerChat.')
        )
        .map((field) => field.overridePath),
} as const;

export type RegularDirectChatOverridePath =
    typeof chatOverrideContract.regularDirect[number];
export type RegularDeltaChatOverridePath =
    typeof chatOverrideContract.regularDelta[number];
export type TrustedAiChatOverrideKey =
    typeof chatOverrideContract.trustedAi[number];
export type AdminWindowChatOverridePath =
    typeof chatOverrideContract.adminWindow[number];

export type ChatOverridePath =
    | RegularDirectChatOverridePath
    | RegularDeltaChatOverridePath
    | `ai.${TrustedAiChatOverrideKey}`
    | AdminWindowChatOverridePath;

export function categoriesEditableByRole(role: ConfigRole): ConfigCategory[] {
    const categories = new Set<ConfigCategory>();
    for (const field of configFieldManifest) {
        if ((field.chatRoles as readonly ConfigRole[]).includes(role)) {
            categories.add(field.category);
        }
    }
    return [...categories];
}
