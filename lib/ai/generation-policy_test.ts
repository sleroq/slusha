import { assertEquals } from '@std/assert';
import { getDefaultUserConfig } from '../config.ts';
import {
    resolveGenerationPolicy,
    resolveModelCapabilities,
} from './generation-policy.ts';

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
        binaryHistoryAttachments: true,
        structuredOutputMode: 'tool',
        reasoningLevel: 'low',
        googleSafetySettings,
    });
    assertEquals(
        resolveModelCapabilities('openrouter', 'google/gemini-2.5-flash'),
        {
            binaryHistoryAttachments: false,
            structuredOutputMode: 'tool',
            reasoningLevel: 'low',
        },
    );
});

Deno.test('resolveModelCapabilities applies opencode model rules', () => {
    assertEquals(resolveModelCapabilities('opencode', 'deepseek-v4-flash'), {
        binaryHistoryAttachments: false,
        structuredOutputMode: 'json-text',
        reasoningLevel: 'low',
    });
    assertEquals(resolveModelCapabilities('opencode', 'kimi-k2.5'), {
        binaryHistoryAttachments: false,
        structuredOutputMode: 'tool',
        reasoningLevel: 'low',
    });
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
});
