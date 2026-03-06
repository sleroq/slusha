import { google } from '@ai-sdk/google';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import type { LanguageModel } from 'ai';
import { UserConfig } from '../config.ts';
import { ModelProvider, parseModelRef } from './model-ref.ts';

export type GenerationTask = 'chat' | 'notes' | 'memory' | 'character';

export interface GenerationPolicyTelemetry {
    provider: ModelProvider;
    modelRef: string;
    modelId: string;
    task: GenerationTask;
    maxOutputTokens?: number;
    googleThinkingLevel?: 'minimal' | 'low' | 'medium' | 'high';
    googleThinkingBudget?: number;
    googleIncludeThoughts?: boolean;
    openrouterUsageInclude?: boolean;
    openrouterReasoningMaxTokens?: number;
}

export interface ResolvedGenerationPolicy {
    model: LanguageModel;
    provider: ModelProvider;
    providerOptions?: ProviderOptions;
    maxOutputTokens?: number;
    telemetry: GenerationPolicyTelemetry;
}

interface GenerationPolicyInput {
    modelRef: string;
    config: UserConfig['ai'];
    task: GenerationTask;
    expectsStructuredOutput: boolean;
}

type ProviderOptions = Record<string, unknown>;

function isGemini3Model(modelId: string): boolean {
    return modelId.startsWith('gemini-3');
}

function isGemini25Model(modelId: string): boolean {
    return modelId.startsWith('gemini-2.5');
}

function buildGoogleOptions(
    modelId: string,
    config: UserConfig['ai'],
    task: GenerationTask,
    expectsStructuredOutput: boolean,
): ProviderOptions {
    const googleOptions: {
        safetySettings?: Array<{ category: string; threshold: string }>;
        structuredOutputs?: boolean;
        thinkingConfig?: {
            thinkingLevel?: 'minimal' | 'low' | 'medium' | 'high';
            thinkingBudget?: number;
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
        if (isGemini3Model(modelId)) {
            const thinkingConfig: NonNullable<
                typeof googleOptions.thinkingConfig
            > = {};
            if (thinking.thinkingLevel) {
                thinkingConfig.thinkingLevel = thinking.thinkingLevel;
            }
            if (thinking.includeThoughts !== undefined) {
                thinkingConfig.includeThoughts = thinking.includeThoughts;
            }
            if (Object.keys(thinkingConfig).length > 0) {
                googleOptions.thinkingConfig = thinkingConfig;
            }
        } else if (isGemini25Model(modelId)) {
            const thinkingConfig: NonNullable<
                typeof googleOptions.thinkingConfig
            > = {};
            if (thinking.thinkingBudget !== undefined) {
                thinkingConfig.thinkingBudget = thinking.thinkingBudget;
            }
            if (thinking.includeThoughts !== undefined) {
                thinkingConfig.includeThoughts = thinking.includeThoughts;
            }
            if (Object.keys(thinkingConfig).length > 0) {
                googleOptions.thinkingConfig = thinkingConfig;
            }
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
        reasoning?: { max_tokens: number };
    } = {};

    if (config.openrouter.usageInclude) {
        openrouterOptions.usage = { include: true };
    }

    const reasoning = config.generation[task].openrouterReasoning;
    if (reasoning?.maxTokens !== undefined) {
        openrouterOptions.reasoning = { max_tokens: reasoning.maxTokens };
    }

    if (Object.keys(openrouterOptions).length === 0) {
        return {};
    }

    return { openrouter: openrouterOptions };
}

function createOpenRouterModel(modelId: string): LanguageModel {
    const openrouterProvider = createOpenAICompatible({
        name: 'openrouter',
        apiKey: Deno.env.get('OPENROUTER_API_KEY'),
        baseURL: 'https://openrouter.ai/api/v1',
    });

    return openrouterProvider.chatModel(modelId);
}

export function resolveGenerationPolicy(input: GenerationPolicyInput): {
    model: LanguageModel;
    provider: ModelProvider;
    providerOptions?: ProviderOptions;
    maxOutputTokens?: number;
    telemetry: GenerationPolicyTelemetry;
} {
    const parsed = parseModelRef(input.modelRef);
    const taskConfig = input.config.generation[input.task];

    if (parsed.provider === 'google') {
        const providerOptions = buildGoogleOptions(
            parsed.modelId,
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
            if (isGemini3Model(parsed.modelId)) {
                telemetry.googleThinkingLevel = thinking.thinkingLevel;
                telemetry.googleIncludeThoughts = thinking.includeThoughts;
            } else if (isGemini25Model(parsed.modelId)) {
                telemetry.googleThinkingBudget = thinking.thinkingBudget;
                telemetry.googleIncludeThoughts = thinking.includeThoughts;
            }
        }

        return {
            model: google(parsed.modelId),
            provider: parsed.provider,
            providerOptions: Object.keys(providerOptions).length > 0
                ? providerOptions
                : undefined,
            maxOutputTokens: taskConfig.maxOutputTokens,
            telemetry,
        };
    }

    const providerOptions = buildOpenRouterOptions(input.config, input.task);

    const reasoning = input.config.generation[input.task].openrouterReasoning;
    const telemetry: GenerationPolicyTelemetry = {
        provider: parsed.provider,
        modelRef: parsed.raw,
        modelId: parsed.modelId,
        task: input.task,
        maxOutputTokens: taskConfig.maxOutputTokens,
        openrouterUsageInclude: input.config.openrouter.usageInclude,
        openrouterReasoningMaxTokens: reasoning?.maxTokens,
    };

    return {
        model: createOpenRouterModel(parsed.modelId),
        provider: parsed.provider,
        providerOptions: Object.keys(providerOptions).length > 0
            ? providerOptions
            : undefined,
        maxOutputTokens: taskConfig.maxOutputTokens,
        telemetry,
    };
}
