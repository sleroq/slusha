import { generateText } from 'ai';
import type { UserConfig } from '../config.ts';
import {
    GenerationTask,
    ResolvedGenerationPolicy,
    resolveGenerationPolicy,
} from './generation-policy.ts';

type GenerateTextOptions = Parameters<typeof generateText>[0];
type GenerateTextResult = Awaited<ReturnType<typeof generateText>>;

interface GenerateLlmTextInput
    extends Omit<GenerateTextOptions, 'model' | 'providerOptions'> {
    modelRef: string;
    config: UserConfig['ai'];
    task: GenerationTask;
    expectsStructuredOutput: boolean;
    buildTelemetryMetadata: (
        policy: ResolvedGenerationPolicy,
    ) => Record<
        string,
        string | number | boolean | Array<string | null | undefined>
    >;
}

export async function generateLlmText(
    input: GenerateLlmTextInput,
): Promise<GenerateTextResult> {
    const {
        modelRef,
        config,
        task,
        expectsStructuredOutput,
        buildTelemetryMetadata,
        ...options
    } = input;
    const generationPolicy = resolveGenerationPolicy({
        modelRef,
        config,
        task,
        expectsStructuredOutput,
    });
    const providerOptions = generationPolicy.providerOptions as
        | GenerateTextOptions['providerOptions']
        | undefined;

    const generationOptions = {
        ...options,
        model: generationPolicy.model,
        providerOptions,
        temperature: config.temperature,
        topK: config.topK,
        topP: config.topP,
        maxOutputTokens: generationPolicy.maxOutputTokens,
        experimental_telemetry: {
            isEnabled: true,
            functionId: options.experimental_telemetry?.functionId,
            metadata: buildTelemetryMetadata(generationPolicy),
        },
    } as GenerateTextOptions;

    return await generateText(generationOptions);
}
