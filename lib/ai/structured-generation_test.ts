import { assertEquals, assertRejects } from '@std/assert';
import { tool } from 'ai';
import { z } from 'zod';
import { getDefaultUserConfig } from '../config.ts';
import { resolveGenerationPolicy } from './generation-policy.ts';
import { parseStructuredJsonText } from './structured-json.ts';
import { generateStructuredOutput } from './structured-generation.ts';

function parseStrings(value: unknown): string[] | undefined {
    if (
        Array.isArray(value) &&
        value.every((entry) => typeof entry === 'string')
    ) {
        return value;
    }

    return undefined;
}

Deno.test('parseStructuredJsonText recovers plain, fenced, and embedded JSON', () => {
    assertEquals(parseStructuredJsonText('["one", "two"]', parseStrings), [
        'one',
        'two',
    ]);
    assertEquals(
        parseStructuredJsonText('```json\n["one", "two"]\n```', parseStrings),
        ['one', 'two'],
    );
    assertEquals(
        parseStructuredJsonText('Result: ["one", "two"] Done.', parseStrings),
        ['one', 'two'],
    );
});

Deno.test('generateStructuredOutput omits topK for kimi-k2.6', async () => {
    const originalFetch = globalThis.fetch;
    let requestBody: Record<string, unknown> | undefined;
    globalThis.fetch = async (input, init) => {
        const request = input instanceof Request
            ? input
            : new Request(input, init);
        requestBody = await request.json();
        return new Response('unavailable', { status: 500 });
    };

    try {
        const policy = resolveGenerationPolicy({
            modelRef: 'opencode:kimi-k2.6',
            config: getDefaultUserConfig().ai,
            opencodeToken: 'test',
            task: 'chat',
            expectsStructuredOutput: true,
        });

        await assertRejects(() =>
            generateStructuredOutput({
                policy,
                prompt: { kind: 'prompt', prompt: 'hello' },
                topK: 32,
                maxRetries: 0,
                tool: {
                    definition: tool({
                        inputSchema: z.object({ answer: z.string() }),
                    }),
                    name: 'answer',
                    parse: () => undefined,
                },
                json: {
                    instruction: 'Return JSON.',
                    parse: () => undefined,
                },
                telemetry: {
                    toolFunctionId: 'test-tool',
                    jsonFunctionId: 'test-json',
                },
            })
        );
    } finally {
        globalThis.fetch = originalFetch;
    }

    assertEquals('top_k' in (requestBody ?? {}), false);
});
