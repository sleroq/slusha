import { ChatConfigOverride, UserConfig } from '../config.ts';
import { ConfigRole } from './permissions.ts';
import { normalizeReactionBlacklist } from '../telegram/reactions.ts';

type ChatEditableAi = NonNullable<ChatConfigOverride['ai']>;
type ChatOverrideKey = keyof Omit<
    ChatConfigOverride,
    'ai' | 'requestWindowPerChat'
>;
type ChatEditableAiKey = keyof ChatEditableAi;

const regularDirectOverrideKeys = [
    'names',
    'tendToReply',
    'tendToIgnore',
    'blacklistedReactions',
    'nepons',
] as const satisfies readonly ChatOverrideKey[];

const regularDeltaOverrideKeys = [
    'tendToReplyProbability',
    'tendToIgnoreProbability',
    'randomReplyProbability',
    'responseDelay',
] as const satisfies readonly ChatOverrideKey[];

const trustedAiKeys = [
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
] as const satisfies readonly ChatEditableAiKey[];

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

function pickTrustedAi(config: Partial<UserConfig['ai']>): ChatEditableAi {
    const picked: Record<string, unknown> = {};
    for (const key of trustedAiKeys) {
        picked[key] = config[key];
    }
    // Key iteration loses field correlation; trustedAiKeys constrains the shape.
    return picked as ChatEditableAi;
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

function copyDefinedOverrides(
    source: ChatConfigOverride,
    target: ChatConfigOverride,
    keys: readonly ChatOverrideKey[],
): void {
    // Key iteration loses field correlation; keys are constrained by ChatOverrideKey.
    const targetRecord = target as Record<string, unknown>;
    for (const key of keys) {
        const value = source[key];
        if (value !== undefined) {
            targetRecord[key] = value;
        }
    }
}

function copyPrimitiveDeltas(
    source: ChatConfigOverride,
    target: ChatConfigOverride,
    base: UserConfig,
    keys: readonly ChatOverrideKey[],
): void {
    // Key iteration loses field correlation; keys are constrained by ChatOverrideKey.
    const targetRecord = target as Record<string, unknown>;
    for (const key of keys) {
        const value = source[key];
        const baseValue = base[key as keyof UserConfig];
        if (value !== undefined && value !== baseValue) {
            targetRecord[key] = value;
        }
    }
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

export function projectChatBaseConfigForRole(
    config: UserConfig,
    role: ConfigRole,
): Record<string, unknown> {
    const payload = projectEffectiveConfigForRole(config, role);
    if (role === 'admin') {
        payload.requestWindow = config.requestWindow;
    }
    return payload;
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

    copyDefinedOverrides(override, next, regularDirectOverrideKeys);
    copyPrimitiveDeltas(
        override,
        next,
        globalConfig,
        regularDeltaOverrideKeys,
    );
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
        const ai = pickTrustedAi(override.ai);
        const availableModels = resolveAvailableModels(globalConfig);

        if (ai.model && !availableModels.includes(ai.model)) {
            if (strictModel) {
                throw new Error('Selected model is not available');
            }

            delete ai.model;
        }

        const aiDelta: Partial<ChatEditableAi> = {};
        const aiDeltaRecord = aiDelta as Record<string, unknown>;
        for (const key of trustedAiKeys) {
            if (hasDefinedPrimitiveDelta(ai[key], globalConfig.ai[key])) {
                aiDeltaRecord[key] = ai[key];
            }
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
