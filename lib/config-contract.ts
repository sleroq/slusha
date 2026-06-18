export const chatOverrideContract = {
    regularDirect: [
        'names',
        'tendToReply',
        'tendToIgnore',
        'blacklistedReactions',
        'nepons',
    ],
    regularDelta: [
        'tendToReplyProbability',
        'tendToIgnoreProbability',
        'randomReplyProbability',
        'responseDelay',
    ],
    trustedAi: [
        'model',
        'temperature',
        'topK',
        'topP',
        'historyVersion',
        'prompt',
        'dumbPrompt',
        'privateChatPromptAddition',
        'groupChatPromptAddition',
        'commentsPromptAddition',
        'hateModePrompt',
        'replyMethod',
        'messagesToPass',
        'messageMaxLength',
        'includeAttachmentsInHistory',
        'bytesLimit',
    ],
    adminWindow: [
        'requestWindowPerChat.free.maxRequests',
        'requestWindowPerChat.free.windowMinutes',
        'requestWindowPerChat.trusted.maxRequests',
        'requestWindowPerChat.trusted.windowMinutes',
    ],
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
