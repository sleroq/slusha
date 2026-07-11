import { assertEquals } from '@std/assert';
import { resolveModelCapabilities } from './generation-policy.ts';

Deno.test('resolveModelCapabilities applies provider defaults', () => {
    assertEquals(resolveModelCapabilities('google', 'gemini-2.5-flash'), {
        binaryHistoryAttachments: true,
        structuredOutputMode: 'tool',
    });
    assertEquals(
        resolveModelCapabilities('openrouter', 'google/gemini-2.5-flash'),
        {
            binaryHistoryAttachments: false,
            structuredOutputMode: 'tool',
        },
    );
});

Deno.test('resolveModelCapabilities applies opencode model rules', () => {
    assertEquals(resolveModelCapabilities('opencode', 'deepseek-v4-flash'), {
        binaryHistoryAttachments: false,
        structuredOutputMode: 'json-text',
    });
    assertEquals(resolveModelCapabilities('opencode', 'kimi-k2.5'), {
        binaryHistoryAttachments: false,
        structuredOutputMode: 'tool',
    });
});
