import { assertEquals } from '@std/assert';
import {
    getGenerationFallbackPlans,
    resolveCustomPrompt,
} from './chat-generation.ts';

Deno.test('getGenerationFallbackPlans uses short history second stage', () => {
    const plans = getGenerationFallbackPlans(9);
    assertEquals(plans.map((p) => p.level), [
        'full',
        'short_history',
        'short_history_final',
    ]);
    assertEquals(plans[1].historyLimit, 4);
});

Deno.test('resolveCustomPrompt trims configured value', () => {
    assertEquals(resolveCustomPrompt('  custom  ', 'fallback'), 'custom');
    assertEquals(resolveCustomPrompt('   ', 'fallback'), 'fallback');
});
