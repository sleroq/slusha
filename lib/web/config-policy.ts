import { ChatConfigOverride, UserConfig } from '../config.ts';
import { ConfigRole } from './permissions.ts';
import { normalizeReactionBlacklist } from '../telegram/reactions.ts';

type ChatEditableAi = NonNullable<ChatConfigOverride['ai']>;

function uniqueModels(models: string[]): string[] {
    return Array.from(new Set(models.map((item) => item.trim()))).filter((
        item,
    ) => item.length > 0);
}

function resolveAvailableModels(config: UserConfig): string[] {
    const models = uniqueModels(config.availableModels ?? []);
    if (models.length > 0) return models;
    return uniqueModels([
        config.ai.model,
        config.ai.notesModel ?? '',
        config.ai.memoryModel ?? '',
    ]);
}

function pickTrustedAi(config: UserConfig['ai']): ChatEditableAi {
    return {
        model: config.model,
        temperature: config.temperature,
        topK: config.topK,
        topP: config.topP,
        historyVersion: config.historyVersion,
        prompt: config.prompt,
        dumbPrompt: config.dumbPrompt,
        privateChatPromptAddition: config.privateChatPromptAddition,
        groupChatPromptAddition: config.groupChatPromptAddition,
        commentsPromptAddition: config.commentsPromptAddition,
        hateModePrompt: config.hateModePrompt,
        replyMethod: config.replyMethod,
        messagesToPass: config.messagesToPass,
        messageMaxLength: config.messageMaxLength,
        includeAttachmentsInHistory: config.includeAttachmentsInHistory,
        bytesLimit: config.bytesLimit,
    };
}

function pickTrustedAiOverride(config: ChatEditableAi): ChatEditableAi {
    return {
        model: config.model,
        temperature: config.temperature,
        topK: config.topK,
        topP: config.topP,
        historyVersion: config.historyVersion,
        prompt: config.prompt,
        dumbPrompt: config.dumbPrompt,
        privateChatPromptAddition: config.privateChatPromptAddition,
        groupChatPromptAddition: config.groupChatPromptAddition,
        commentsPromptAddition: config.commentsPromptAddition,
        hateModePrompt: config.hateModePrompt,
        replyMethod: config.replyMethod,
        messagesToPass: config.messagesToPass,
        messageMaxLength: config.messageMaxLength,
        includeAttachmentsInHistory: config.includeAttachmentsInHistory,
        bytesLimit: config.bytesLimit,
    };
}

function hasDefinedValues(value: Record<string, unknown>): boolean {
    return Object.values(value).some((item) => item !== undefined);
}

function hasDefinedPrimitiveDelta<T>(
    value: T | undefined,
    base: T,
): value is T {
    return value !== undefined && value !== base;
}

export function buildBootstrapCapabilities(role: ConfigRole): {
    role: ConfigRole;
    categories: string[];
} {
    if (role === 'admin') {
        return {
            role,
            categories: ['general', 'model', 'prompts', 'advanced', 'admin'],
        };
    }

    if (role === 'trusted') {
        return {
            role,
            categories: ['general', 'model', 'prompts', 'advanced'],
        };
    }

    if (role === 'regular') {
        return {
            role,
            categories: ['general'],
        };
    }

    return {
        role,
        categories: [],
    };
}

export function projectGlobalConfigForRole(
    config: UserConfig,
    role: ConfigRole,
): unknown {
    if (role === 'admin') {
        return config;
    }

    return undefined;
}

export function projectEffectiveConfigForRole(
    config: UserConfig,
    role: ConfigRole,
): Record<string, unknown> {
    const base: Record<string, unknown> = {
        names: config.names,
        tendToReply: config.tendToReply,
        tendToReplyProbability: config.tendToReplyProbability,
        tendToIgnore: config.tendToIgnore,
        tendToIgnoreProbability: config.tendToIgnoreProbability,
        randomReplyProbability: config.randomReplyProbability,
        blacklistedReactions: config.blacklistedReactions,
        nepons: config.nepons,
        responseDelay: config.responseDelay,
        ai: {
            historyVersion: config.ai.historyVersion,
        },
    };

    if (role === 'trusted' || role === 'admin') {
        base.ai = pickTrustedAi(config.ai);
    }

    return base;
}

export function sanitizeChatOverrideForRole(
    override: ChatConfigOverride,
    role: ConfigRole,
    globalConfig: UserConfig,
    strictModel = true,
): ChatConfigOverride {
    if (role !== 'regular' && role !== 'trusted' && role !== 'admin') {
        return {};
    }

    const next: ChatConfigOverride = {};

    if (override.names !== undefined) next.names = override.names;
    if (override.tendToReply !== undefined) {
        next.tendToReply = override.tendToReply;
    }
    if (
        hasDefinedPrimitiveDelta(
            override.tendToReplyProbability,
            globalConfig.tendToReplyProbability,
        )
    ) {
        next.tendToReplyProbability = override.tendToReplyProbability;
    }
    if (override.tendToIgnore !== undefined) {
        next.tendToIgnore = override.tendToIgnore;
    }
    if (
        hasDefinedPrimitiveDelta(
            override.tendToIgnoreProbability,
            globalConfig.tendToIgnoreProbability,
        )
    ) {
        next.tendToIgnoreProbability = override.tendToIgnoreProbability;
    }
    if (
        hasDefinedPrimitiveDelta(
            override.randomReplyProbability,
            globalConfig.randomReplyProbability,
        )
    ) {
        next.randomReplyProbability = override.randomReplyProbability;
    }
    if (override.blacklistedReactions !== undefined) {
        next.blacklistedReactions = override.blacklistedReactions;
    }
    if (override.nepons !== undefined) next.nepons = override.nepons;
    if (
        hasDefinedPrimitiveDelta(
            override.responseDelay,
            globalConfig.responseDelay,
        )
    ) {
        next.responseDelay = override.responseDelay;
    }
    if (role === 'admin' && override.requestWindowPerChat !== undefined) {
        next.requestWindowPerChat = override.requestWindowPerChat;
    }

    if (next.blacklistedReactions) {
        next.blacklistedReactions = normalizeReactionBlacklist(
            next.blacklistedReactions,
        );
    }

    if (override.ai && role === 'regular') {
        if (
            hasDefinedPrimitiveDelta(
                override.ai.historyVersion,
                globalConfig.ai.historyVersion,
            )
        ) {
            next.ai = {
                historyVersion: override.ai.historyVersion,
            };
        }
    }

    if ((role === 'trusted' || role === 'admin') && override.ai) {
        const ai = pickTrustedAiOverride(override.ai);
        const availableModels = resolveAvailableModels(globalConfig);

        if (ai.model && !availableModels.includes(ai.model)) {
            if (strictModel) {
                throw new Error('Selected model is not available');
            }

            delete ai.model;
        }

        const aiDelta: Partial<ChatEditableAi> = {};
        if (hasDefinedPrimitiveDelta(ai.model, globalConfig.ai.model)) {
            aiDelta.model = ai.model;
        }
        if (
            hasDefinedPrimitiveDelta(
                ai.temperature,
                globalConfig.ai.temperature,
            )
        ) {
            aiDelta.temperature = ai.temperature;
        }
        if (hasDefinedPrimitiveDelta(ai.topK, globalConfig.ai.topK)) {
            aiDelta.topK = ai.topK;
        }
        if (hasDefinedPrimitiveDelta(ai.topP, globalConfig.ai.topP)) {
            aiDelta.topP = ai.topP;
        }
        if (
            hasDefinedPrimitiveDelta(
                ai.historyVersion,
                globalConfig.ai.historyVersion,
            )
        ) {
            aiDelta.historyVersion = ai.historyVersion;
        }
        if (hasDefinedPrimitiveDelta(ai.prompt, globalConfig.ai.prompt)) {
            aiDelta.prompt = ai.prompt;
        }
        if (
            hasDefinedPrimitiveDelta(ai.dumbPrompt, globalConfig.ai.dumbPrompt)
        ) {
            aiDelta.dumbPrompt = ai.dumbPrompt;
        }
        if (
            hasDefinedPrimitiveDelta(
                ai.privateChatPromptAddition,
                globalConfig.ai.privateChatPromptAddition,
            )
        ) {
            aiDelta.privateChatPromptAddition = ai.privateChatPromptAddition;
        }
        if (
            hasDefinedPrimitiveDelta(
                ai.groupChatPromptAddition,
                globalConfig.ai.groupChatPromptAddition,
            )
        ) {
            aiDelta.groupChatPromptAddition = ai.groupChatPromptAddition;
        }
        if (
            hasDefinedPrimitiveDelta(
                ai.commentsPromptAddition,
                globalConfig.ai.commentsPromptAddition,
            )
        ) {
            aiDelta.commentsPromptAddition = ai.commentsPromptAddition;
        }
        if (
            hasDefinedPrimitiveDelta(
                ai.hateModePrompt,
                globalConfig.ai.hateModePrompt,
            )
        ) {
            aiDelta.hateModePrompt = ai.hateModePrompt;
        }
        if (
            hasDefinedPrimitiveDelta(
                ai.replyMethod,
                globalConfig.ai.replyMethod,
            )
        ) {
            aiDelta.replyMethod = ai.replyMethod;
        }
        if (
            hasDefinedPrimitiveDelta(
                ai.messagesToPass,
                globalConfig.ai.messagesToPass,
            )
        ) {
            aiDelta.messagesToPass = ai.messagesToPass;
        }
        if (
            hasDefinedPrimitiveDelta(
                ai.messageMaxLength,
                globalConfig.ai.messageMaxLength,
            )
        ) {
            aiDelta.messageMaxLength = ai.messageMaxLength;
        }
        if (
            hasDefinedPrimitiveDelta(
                ai.includeAttachmentsInHistory,
                globalConfig.ai.includeAttachmentsInHistory,
            )
        ) {
            aiDelta.includeAttachmentsInHistory =
                ai.includeAttachmentsInHistory;
        }
        if (
            hasDefinedPrimitiveDelta(ai.bytesLimit, globalConfig.ai.bytesLimit)
        ) {
            aiDelta.bytesLimit = ai.bytesLimit;
        }

        if (hasDefinedValues(aiDelta as Record<string, unknown>)) {
            next.ai = aiDelta;
        }
    }

    return next;
}

export function getModelOptionsForRole(
    config: UserConfig,
    role: ConfigRole,
): string[] {
    if (role === 'trusted' || role === 'admin') {
        return resolveAvailableModels(config);
    }

    return [];
}
