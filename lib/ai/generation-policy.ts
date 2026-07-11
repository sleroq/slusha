import { google } from '@ai-sdk/google';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import type { generateText, LanguageModel } from 'ai';
import { UserConfig } from '../config.ts';
import { ModelProvider, parseModelRef } from './model-ref.ts';

export type GenerationTask = 'chat' | 'character';
export type StructuredOutputMode = 'tool' | 'json-text';

const OPENCODE_BASE_URL = 'https://opencode.ai/zen/go/v1';

export interface GenerationPolicyTelemetry {
    provider: ModelProvider;
    modelRef: string;
    modelId: string;
    task: GenerationTask;
    maxOutputTokens?: number;
    googleThinkingLevel?: 'minimal' | 'low' | 'medium' | 'high';
    googleIncludeThoughts?: boolean;
    openrouterUsageInclude?: boolean;
    openrouterReasoningEffort?: 'minimal' | 'low' | 'medium' | 'high';
}

export interface ResolvedGenerationPolicy {
    model: LanguageModel;
    provider: ModelProvider;
    providerOptions?: ProviderOptions;
    maxOutputTokens?: number;
    capabilities: ModelCapabilities;
    telemetry: GenerationPolicyTelemetry;
}

/**
 * Model behavior that generation callers need to adapt to. Keep this limited
 * to actual compatibility differences; Telegram and prompt policy stay in
 * their respective layers.
 */
export interface ModelCapabilities {
    binaryHistoryAttachments: boolean;
    structuredOutputMode: StructuredOutputMode;
}

interface GenerationPolicyInput {
    modelRef: string;
    config: UserConfig['ai'];
    openrouterApiKey?: string;
    opencodeToken?: string;
    task: GenerationTask;
    expectsStructuredOutput: boolean;
}

type ProviderOptions = NonNullable<
    Parameters<typeof generateText>[0]['providerOptions']
>;

const providerCapabilities: Record<ModelProvider, ModelCapabilities> = {
    google: {
        binaryHistoryAttachments: true,
        structuredOutputMode: 'tool',
    },
    openrouter: {
        binaryHistoryAttachments: false,
        structuredOutputMode: 'tool',
    },
    opencode: {
        binaryHistoryAttachments: false,
        structuredOutputMode: 'tool',
    },
};

interface ModelCapabilityRule {
    matches(modelId: string): boolean;
    capabilities: Partial<ModelCapabilities>;
}

const providerModelCapabilityRules: Partial<
    Record<ModelProvider, ModelCapabilityRule[]>
> = {
    opencode: [
        {
            matches: (modelId) => modelId.startsWith('deepseek-v4'),
            capabilities: { structuredOutputMode: 'json-text' },
        },
    ],
};

export function resolveModelCapabilities(
    provider: ModelProvider,
    modelId: string,
): ModelCapabilities {
    const capabilities = { ...providerCapabilities[provider] };
    const rules = providerModelCapabilityRules[provider] ?? [];

    for (const rule of rules) {
        if (rule.matches(modelId)) {
            Object.assign(capabilities, rule.capabilities);
        }
    }

    return capabilities;
}

function buildGoogleOptions(
    config: UserConfig['ai'],
    task: GenerationTask,
    expectsStructuredOutput: boolean,
): ProviderOptions {
    const googleOptions: {
        safetySettings?: Array<{ category: string; threshold: string }>;
        structuredOutputs?: boolean;
        thinkingConfig?: {
            thinkingLevel?: 'minimal' | 'low' | 'medium' | 'high';
            includeThoughts?: boolean;
        };
    } = {};

    if (config.google.safetySettings.length > 0) {
        googleOptions.safetySettings = config.google.safetySettings;
    }

    if (expectsStructuredOutput && config.google.structuredOutputs === false) {
        googleOptions.structuredOutputs = false;
    }

    const thinking = config.generation[task].thinking;
    if (thinking) {
        const thinkingConfig: NonNullable<typeof googleOptions.thinkingConfig> =
            {};
        if (thinking.thinkingLevel) {
            thinkingConfig.thinkingLevel = thinking.thinkingLevel;
        }
        if (thinking.includeThoughts !== undefined) {
            thinkingConfig.includeThoughts = thinking.includeThoughts;
        }
        if (Object.keys(thinkingConfig).length > 0) {
            googleOptions.thinkingConfig = thinkingConfig;
        }
    }

    if (Object.keys(googleOptions).length === 0) {
        return {};
    }

    return { google: googleOptions };
}

function buildOpenRouterOptions(
    config: UserConfig['ai'],
    task: GenerationTask,
): ProviderOptions {
    const openrouterOptions: {
        usage?: { include: boolean };
        reasoning?: { effort: 'minimal' | 'low' | 'medium' | 'high' };
    } = {};

    if (config.openrouter.usageInclude) {
        openrouterOptions.usage = { include: true };
    }

    const reasoningEffort = config.generation[task].thinking?.thinkingLevel;
    if (reasoningEffort) {
        openrouterOptions.reasoning = { effort: reasoningEffort };
    }

    if (Object.keys(openrouterOptions).length === 0) {
        return {};
    }

    return { openrouter: openrouterOptions };
}

function createOpenRouterModel(
    modelId: string,
    apiKey: string | undefined,
): LanguageModel {
    const openrouterProvider = createOpenAICompatible({
        name: 'openrouter',
        apiKey,
        baseURL: 'https://openrouter.ai/api/v1',
    });

    return openrouterProvider.chatModel(modelId);
}

function createOpencodeModel(
    modelId: string,
    apiKey: string | undefined,
): LanguageModel {
    const opencodeProvider = createOpenAICompatible({
        name: 'opencode',
        apiKey,
        baseURL: OPENCODE_BASE_URL,
    });

    return opencodeProvider.chatModel(modelId);
}

export function resolveGenerationPolicy(
    input: GenerationPolicyInput,
): ResolvedGenerationPolicy {
    const parsed = parseModelRef(input.modelRef);
    const taskConfig = input.config.generation[input.task];

    if (parsed.provider === 'google') {
        const providerOptions = buildGoogleOptions(
            input.config,
            input.task,
            input.expectsStructuredOutput,
        );

        const thinking = input.config.generation[input.task].thinking;
        const telemetry: GenerationPolicyTelemetry = {
            provider: parsed.provider,
            modelRef: parsed.raw,
            modelId: parsed.modelId,
            task: input.task,
            maxOutputTokens: taskConfig.maxOutputTokens,
        };

        if (thinking) {
            telemetry.googleThinkingLevel = thinking.thinkingLevel;
            telemetry.googleIncludeThoughts = thinking.includeThoughts;
        }

        return {
            model: google(parsed.modelId),
            provider: parsed.provider,
            providerOptions: Object.keys(providerOptions).length > 0
                ? providerOptions
                : undefined,
            maxOutputTokens: taskConfig.maxOutputTokens,
            capabilities: resolveModelCapabilities(
                parsed.provider,
                parsed.modelId,
            ),
            telemetry,
        };
    }

    if (parsed.provider === 'opencode') {
        if (!input.opencodeToken) {
            throw new Error('OPENCODE_TOKEN is required for opencode models');
        }

        return {
            model: createOpencodeModel(parsed.modelId, input.opencodeToken),
            provider: parsed.provider,
            maxOutputTokens: taskConfig.maxOutputTokens,
            capabilities: resolveModelCapabilities(
                parsed.provider,
                parsed.modelId,
            ),
            telemetry: {
                provider: parsed.provider,
                modelRef: parsed.raw,
                modelId: parsed.modelId,
                task: input.task,
                maxOutputTokens: taskConfig.maxOutputTokens,
            },
        };
    }

    if (!input.openrouterApiKey) {
        throw new Error('OPENROUTER_API_KEY is required for openrouter models');
    }

    const providerOptions = buildOpenRouterOptions(input.config, input.task);

    const reasoningEffort = input.config.generation[input.task].thinking
        ?.thinkingLevel;
    const telemetry: GenerationPolicyTelemetry = {
        provider: parsed.provider,
        modelRef: parsed.raw,
        modelId: parsed.modelId,
        task: input.task,
        maxOutputTokens: taskConfig.maxOutputTokens,
        openrouterUsageInclude: input.config.openrouter.usageInclude,
        openrouterReasoningEffort: reasoningEffort,
    };

    return {
        model: createOpenRouterModel(parsed.modelId, input.openrouterApiKey),
        provider: parsed.provider,
        providerOptions: Object.keys(providerOptions).length > 0
            ? providerOptions
            : undefined,
        maxOutputTokens: taskConfig.maxOutputTokens,
        capabilities: resolveModelCapabilities(
            parsed.provider,
            parsed.modelId,
        ),
        telemetry,
    };
}
