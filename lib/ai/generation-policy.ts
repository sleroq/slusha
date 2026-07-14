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
    googleThinkingLevel?: 'minimal' | 'low' | 'medium' | 'high';
    openrouterUsageInclude?: boolean;
    openrouterReasoningEffort?: 'minimal' | 'low' | 'medium' | 'high';
}

export interface ResolvedGenerationPolicy {
    model: LanguageModel;
    provider: ModelProvider;
    providerOptions?: ProviderOptions;
    capabilities: ModelCapabilities;
    telemetry: GenerationPolicyTelemetry;
}

/**
 * Model behavior and generation policy that callers need to adapt to.
 * Telegram and prompt policy stay in their respective layers.
 */
export interface ModelCapabilities {
    binaryHistoryAttachments: boolean;
    structuredOutputMode: StructuredOutputMode;
    reasoningLevel: 'minimal' | 'low' | 'medium' | 'high';
    googleSafetySettings?: Array<{ category: string; threshold: string }>;
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
        reasoningLevel: 'low',
        googleSafetySettings: [
            {
                category: 'HARM_CATEGORY_HARASSMENT',
                threshold: 'BLOCK_NONE',
            },
            {
                category: 'HARM_CATEGORY_HATE_SPEECH',
                threshold: 'BLOCK_NONE',
            },
            {
                category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT',
                threshold: 'BLOCK_NONE',
            },
            {
                category: 'HARM_CATEGORY_DANGEROUS_CONTENT',
                threshold: 'BLOCK_NONE',
            },
        ],
    },
    openrouter: {
        binaryHistoryAttachments: false,
        structuredOutputMode: 'tool',
        reasoningLevel: 'low',
    },
    opencode: {
        binaryHistoryAttachments: false,
        structuredOutputMode: 'tool',
        reasoningLevel: 'low',
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
    expectsStructuredOutput: boolean,
    capabilities: ModelCapabilities,
): ProviderOptions {
    const googleOptions: {
        safetySettings?: Array<{ category: string; threshold: string }>;
        structuredOutputs?: boolean;
        thinkingConfig?: {
            thinkingLevel?: 'minimal' | 'low' | 'medium' | 'high';
        };
    } = {};

    if (capabilities.googleSafetySettings) {
        googleOptions.safetySettings = capabilities.googleSafetySettings;
    }

    if (expectsStructuredOutput && config.google.structuredOutputs === false) {
        googleOptions.structuredOutputs = false;
    }

    googleOptions.thinkingConfig = {
        thinkingLevel: capabilities.reasoningLevel,
    };

    if (Object.keys(googleOptions).length === 0) {
        return {};
    }

    return { google: googleOptions };
}

function buildOpenRouterOptions(
    config: UserConfig['ai'],
    capabilities: ModelCapabilities,
): ProviderOptions {
    const openrouterOptions: {
        usage?: { include: boolean };
        reasoning?: { effort: 'minimal' | 'low' | 'medium' | 'high' };
    } = {};

    if (config.openrouter.usageInclude) {
        openrouterOptions.usage = { include: true };
    }

    openrouterOptions.reasoning = { effort: capabilities.reasoningLevel };

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
    const capabilities = resolveModelCapabilities(
        parsed.provider,
        parsed.modelId,
    );

    if (parsed.provider === 'google') {
        const providerOptions = buildGoogleOptions(
            input.config,
            input.expectsStructuredOutput,
            capabilities,
        );

        const telemetry: GenerationPolicyTelemetry = {
            provider: parsed.provider,
            modelRef: parsed.raw,
            modelId: parsed.modelId,
            task: input.task,
            googleThinkingLevel: capabilities.reasoningLevel,
        };

        return {
            model: google(parsed.modelId),
            provider: parsed.provider,
            providerOptions: Object.keys(providerOptions).length > 0
                ? providerOptions
                : undefined,
            capabilities,
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
            providerOptions: {
                opencode: {
                    reasoningEffort: capabilities.reasoningLevel,
                },
            },
            capabilities,
            telemetry: {
                provider: parsed.provider,
                modelRef: parsed.raw,
                modelId: parsed.modelId,
                task: input.task,
            },
        };
    }

    if (!input.openrouterApiKey) {
        throw new Error('OPENROUTER_API_KEY is required for openrouter models');
    }

    const providerOptions = buildOpenRouterOptions(input.config, capabilities);

    const telemetry: GenerationPolicyTelemetry = {
        provider: parsed.provider,
        modelRef: parsed.raw,
        modelId: parsed.modelId,
        task: input.task,
        openrouterUsageInclude: input.config.openrouter.usageInclude,
        openrouterReasoningEffort: capabilities.reasoningLevel,
    };

    return {
        model: createOpenRouterModel(parsed.modelId, input.openrouterApiKey),
        provider: parsed.provider,
        providerOptions: Object.keys(providerOptions).length > 0
            ? providerOptions
            : undefined,
        capabilities,
        telemetry,
    };
}
