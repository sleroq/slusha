import { assertEquals } from '@std/assert';
import { generateText } from 'ai';
import { getDefaultUserConfig } from '../config.ts';
import {
    resolveGenerationPolicy,
    resolveModelCapabilities,
} from './generation-policy.ts';
import { opencodeGoModels } from './model-catalog.ts';

const googleSafetySettings = [
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
];

Deno.test('resolveModelCapabilities applies provider defaults', () => {
    assertEquals(resolveModelCapabilities('google', 'gemini-2.5-flash'), {
        historyAttachmentInput: 'all',
        structuredOutputMode: 'tool',
        reasoningLevel: 'low',
        googleSafetySettings,
    });
    assertEquals(
        resolveModelCapabilities('openrouter', 'google/gemini-2.5-flash'),
        {
            historyAttachmentInput: 'none',
            structuredOutputMode: 'tool',
            reasoningLevel: 'low',
        },
    );
});

Deno.test('resolveModelCapabilities applies opencode model rules', () => {
    assertEquals(resolveModelCapabilities('opencode', 'deepseek-v4-flash'), {
        historyAttachmentInput: 'none',
        structuredOutputMode: 'json-text',
        reasoningLevel: 'low',
        opencodeRequestFormat: 'openai-chat-completions',
    });
    assertEquals(resolveModelCapabilities('opencode', 'kimi-k2.5'), {
        historyAttachmentInput: 'none',
        structuredOutputMode: 'tool',
        reasoningLevel: 'low',
        opencodeRequestFormat: 'openai-chat-completions',
    });
    assertEquals(resolveModelCapabilities('opencode', 'mimo-v2.5'), {
        historyAttachmentInput: 'images',
        structuredOutputMode: 'tool',
        reasoningLevel: 'low',
        opencodeRequestFormat: 'openai-chat-completions',
    });
    assertEquals(resolveModelCapabilities('opencode', 'minimax-m3'), {
        historyAttachmentInput: 'images',
        structuredOutputMode: 'tool',
        reasoningLevel: 'low',
        opencodeRequestFormat: 'anthropic-messages',
    });
    assertEquals(resolveModelCapabilities('opencode', 'minimax-m2.7'), {
        historyAttachmentInput: 'none',
        structuredOutputMode: 'tool',
        reasoningLevel: 'low',
        opencodeRequestFormat: 'anthropic-messages',
    });
    assertEquals(resolveModelCapabilities('opencode', 'qwen3.7-max'), {
        historyAttachmentInput: 'none',
        structuredOutputMode: 'tool',
        reasoningLevel: 'low',
        opencodeRequestFormat: 'anthropic-messages',
    });
});

Deno.test('OpenCode Go catalog routes all messages models through Anthropic', () => {
    const anthropicModelIds = Object.entries(opencodeGoModels)
        .filter(([, config]) => config.requestFormat === 'anthropic-messages')
        .map(([modelId]) => modelId);

    assertEquals(anthropicModelIds, [
        'minimax-m3',
        'qwen3.7-plus',
        'qwen3.6-plus',
        'minimax-m2.7',
        'qwen3.7-max',
    ]);
});

Deno.test('resolveGenerationPolicy applies fixed model behavior', () => {
    const config = getDefaultUserConfig().ai;

    const googlePolicy = resolveGenerationPolicy({
        modelRef: 'gemini-2.5-flash',
        config,
        task: 'chat',
        expectsStructuredOutput: false,
    });
    assertEquals(googlePolicy.providerOptions, {
        google: {
            safetySettings: googleSafetySettings,
            thinkingConfig: { thinkingLevel: 'low' },
        },
    });

    const openrouterPolicy = resolveGenerationPolicy({
        modelRef: 'openrouter:anthropic/claude-sonnet-4',
        config,
        openrouterApiKey: 'test',
        task: 'chat',
        expectsStructuredOutput: false,
    });
    assertEquals(openrouterPolicy.providerOptions, {
        openrouter: { reasoning: { effort: 'low' } },
    });

    const opencodePolicy = resolveGenerationPolicy({
        modelRef: 'opencode:kimi-k2.5',
        config,
        opencodeToken: 'test',
        task: 'character',
        expectsStructuredOutput: false,
    });
    assertEquals(opencodePolicy.providerOptions, {
        opencode: { reasoningEffort: 'low' },
    });

    const opencodeAnthropicPolicy = resolveGenerationPolicy({
        modelRef: 'opencode:minimax-m3',
        config,
        opencodeToken: 'test',
        task: 'chat',
        expectsStructuredOutput: false,
    });
    assertEquals(opencodeAnthropicPolicy.providerOptions, undefined);
});

Deno.test('resolveGenerationPolicy routes Anthropic models to /messages', async () => {
    const originalFetch = globalThis.fetch;
    let requestUrl: string | undefined;
    globalThis.fetch = (input) => {
        requestUrl = input instanceof Request ? input.url : String(input);
        return Promise.resolve(
            new Response(
                JSON.stringify({
                    id: 'msg_test',
                    type: 'message',
                    role: 'assistant',
                    content: [{ type: 'text', text: 'ok' }],
                    model: 'qwen3.7-max',
                    stop_reason: 'end_turn',
                    stop_sequence: null,
                    usage: { input_tokens: 1, output_tokens: 1 },
                }),
                { headers: { 'content-type': 'application/json' } },
            ),
        );
    };

    try {
        const policy = resolveGenerationPolicy({
            modelRef: 'opencode:qwen3.7-max',
            config: getDefaultUserConfig().ai,
            opencodeToken: 'test',
            task: 'chat',
            expectsStructuredOutput: false,
        });

        await generateText({ model: policy.model, prompt: 'hello' });

        assertEquals(requestUrl, 'https://opencode.ai/zen/go/v1/messages');
    } finally {
        globalThis.fetch = originalFetch;
    }
});
