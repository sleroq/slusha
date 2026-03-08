import { assertEquals } from '@std/assert';
import {
    getGenerationFallbackPlans,
    resolveCustomPrompt,
    resolveReplyMethod,
    splitTextByTwoLines,
} from './chat-generation.ts';

Deno.test('resolveReplyMethod falls back to useJsonResponses', () => {
    assertEquals(resolveReplyMethod(undefined, true), 'json_actions');
    assertEquals(resolveReplyMethod(undefined, false), 'plain_text_reactions');
});

Deno.test('splitTextByTwoLines chunks into two-line messages', () => {
    assertEquals(splitTextByTwoLines('a\nb\nc\n\n'), ['a\nb', 'c']);
});

Deno.test('getGenerationFallbackPlans uses short history second stage', () => {
    const plans = getGenerationFallbackPlans(9);
    assertEquals(plans.map((p) => p.level), [
        'full',
        'short_history',
        'short_history_no_notes',
    ]);
    assertEquals(plans[1].historyLimit, 4);
});

Deno.test('resolveCustomPrompt trims configured value', () => {
    assertEquals(resolveCustomPrompt('  custom  ', 'fallback'), 'custom');
    assertEquals(resolveCustomPrompt('   ', 'fallback'), 'fallback');
});
