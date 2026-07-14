import { generateText, hasToolCall, type ModelMessage, type Tool } from 'ai';
import type { ResolvedGenerationPolicy } from './generation-policy.ts';
import { parseStructuredJsonText } from './structured-json.ts';

export type StructuredGenerationPrompt =
    | {
        kind: 'messages';
        instructions: string;
        messages: ModelMessage[];
    }
    | {
        kind: 'prompt';
        prompt: string;
    };

interface StructuredGenerationTool<T> {
    definition: Tool;
    name: string;
    parse(input: unknown): T | undefined;
}

interface StructuredGenerationJson<T> {
    instruction: string;
    parse(value: unknown): T | undefined;
}

export interface StructuredGenerationInput<T> {
    policy: ResolvedGenerationPolicy;
    prompt: StructuredGenerationPrompt;
    temperature?: number;
    topK?: number;
    topP?: number;
    maxRetries?: number;
    tool: StructuredGenerationTool<T>;
    json: StructuredGenerationJson<T>;
    telemetry: {
        toolFunctionId: string;
        jsonFunctionId: string;
    };
}

export async function generateStructuredOutput<T>(
    input: StructuredGenerationInput<T>,
): Promise<T> {
    const settings = {
        model: input.policy.model,
        providerOptions: input.policy.providerOptions,
        temperature: input.temperature,
        topK: input.topK,
        topP: input.topP,
        maxRetries: input.maxRetries,
    };

    if (input.policy.capabilities.structuredOutputMode === 'json-text') {
        const result = input.prompt.kind === 'messages'
            ? await generateText({
                ...settings,
                instructions: input.prompt.instructions,
                messages: [
                    ...input.prompt.messages,
                    { role: 'user', content: input.json.instruction },
                ],
                telemetry: { functionId: input.telemetry.jsonFunctionId },
            })
            : await generateText({
                ...settings,
                prompt: `${input.prompt.prompt} ${input.json.instruction}`,
                telemetry: { functionId: input.telemetry.jsonFunctionId },
            });

        const output = parseStructuredJsonText(result.text, input.json.parse);
        if (output !== undefined) return output;

        throw new Error('Structured JSON output invalid');
    }

    const tools = { [input.tool.name]: input.tool.definition };
    const result = input.prompt.kind === 'messages'
        ? await generateText({
            ...settings,
            tools,
            toolChoice: { type: 'tool', toolName: input.tool.name },
            stopWhen: hasToolCall(input.tool.name),
            instructions: input.prompt.instructions,
            messages: input.prompt.messages,
            telemetry: { functionId: input.telemetry.toolFunctionId },
        })
        : await generateText({
            ...settings,
            tools,
            toolChoice: { type: 'tool', toolName: input.tool.name },
            stopWhen: hasToolCall(input.tool.name),
            prompt: input.prompt.prompt,
            telemetry: { functionId: input.telemetry.toolFunctionId },
        });

    const toolCall = result.toolCalls.find((call) =>
        call.toolName === input.tool.name
    );
    const output = toolCall ? input.tool.parse(toolCall.input) : undefined;
    if (output !== undefined) return output;

    throw new Error('Structured tool call missing or invalid after retries');
}
