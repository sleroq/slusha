import { assertEquals } from '@std/assert';
import { parseStructuredJsonText } from './structured-json.ts';

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
