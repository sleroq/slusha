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

    const next: ChatConfigOverride = {
        names: override.names,
        tendToReply: override.tendToReply,
        tendToReplyProbability: override.tendToReplyProbability,
        tendToIgnore: override.tendToIgnore,
        tendToIgnoreProbability: override.tendToIgnoreProbability,
        randomReplyProbability: override.randomReplyProbability,
        blacklistedReactions: override.blacklistedReactions,
        nepons: override.nepons,
        responseDelay: override.responseDelay,
    };

    if (next.blacklistedReactions) {
        next.blacklistedReactions = normalizeReactionBlacklist(
            next.blacklistedReactions,
        );
    }

    if (override.ai && role === 'regular') {
        if (override.ai.historyVersion !== undefined) {
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

        if (hasDefinedValues(ai as Record<string, unknown>)) {
            next.ai = ai;
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
