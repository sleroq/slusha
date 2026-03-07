import { assertStringIncludes } from '@std/assert';
import { buildLanguageProtocol } from './language-protocol.ts';

Deno.test('buildLanguageProtocol uses mapped language name', () => {
    const protocol = buildLanguageProtocol('ru');
    assertStringIncludes(protocol, 'Default to Russian language');
});

Deno.test('buildLanguageProtocol falls back to generic language', () => {
    const protocol = buildLanguageProtocol('zz');
    assertStringIncludes(protocol, 'Default to the chat language language');
});
