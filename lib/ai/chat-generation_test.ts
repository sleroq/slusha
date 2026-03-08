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

Deno.test('splitTextByTwoLines splits by blank lines', () => {
    assertEquals(splitTextByTwoLines('a\nb\n\n c\n\n'), ['a\nb', 'c']);
});

Deno.test('splitTextByTwoLines keeps metadata block with text', () => {
    assertEquals(
        splitTextByTwoLines(
            '<slusha_meta>\n{"target_ref":"t0"}\n</slusha_meta>\nreply',
        ),
        ['<slusha_meta>\n{"target_ref":"t0"}\n</slusha_meta>\nreply'],
    );
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
