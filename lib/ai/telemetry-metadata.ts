import type { ResolvedGenerationPolicy } from './generation-policy.ts';

type TelemetryAttribute =
    | string
    | number
    | boolean
    | Array<string | null | undefined>;

interface BuildGenerationTelemetryMetadataInput {
    sessionId: string;
    userId: string;
    chatName?: string;
    tags: string[];
    temperature: number;
    topK: number;
    topP: number;
    policy: ResolvedGenerationPolicy;
}

function assignIfDefined(
    target: Record<string, TelemetryAttribute>,
    key: string,
    value: TelemetryAttribute | undefined,
) {
    if (value !== undefined) {
        target[key] = value;
    }
}

export function buildGenerationTelemetryMetadata(
    input: BuildGenerationTelemetryMetadataInput,
): Record<string, TelemetryAttribute> {
    const metadata: Record<string, TelemetryAttribute> = {
        sessionId: input.sessionId,
        userId: input.userId,
        tags: input.tags,
        'llm.provider': input.policy.telemetry.provider,
        'llm.model_ref': input.policy.telemetry.modelRef,
        'llm.model_id': input.policy.telemetry.modelId,
        'llm.task': input.policy.telemetry.task,
        'llm.temperature': input.temperature,
        'llm.top_k': input.topK,
        'llm.top_p': input.topP,
    };

    assignIfDefined(metadata, 'chatName', input.chatName);

    assignIfDefined(
        metadata,
        'llm.max_output_tokens',
        input.policy.telemetry.maxOutputTokens,
    );
    assignIfDefined(
        metadata,
        'llm.google.thinking_level',
        input.policy.telemetry.googleThinkingLevel,
    );
    assignIfDefined(
        metadata,
        'llm.google.thinking_budget',
        input.policy.telemetry.googleThinkingBudget,
    );
    assignIfDefined(
        metadata,
        'llm.google.include_thoughts',
        input.policy.telemetry.googleIncludeThoughts,
    );
    assignIfDefined(
        metadata,
        'llm.openrouter.reasoning_max_tokens',
        input.policy.telemetry.openrouterReasoningMaxTokens,
    );
    assignIfDefined(
        metadata,
        'llm.openrouter.usage_include',
        input.policy.telemetry.openrouterUsageInclude,
    );

    return metadata;
}
