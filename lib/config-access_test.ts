import { assert, assertEquals, assertThrows } from '@std/assert';
import {
    canAccessConfig,
    canReadChatData,
    type ConfigAccessContext,
} from './config-access.ts';
import { ConfigValidationError, validateConfigEntryValue } from './config.ts';
import type { GlobalRole } from './persistence/user-roles.ts';

function access(
    roles: GlobalRole[] = [],
    chat: { member?: boolean; admin?: boolean } = {},
): ConfigAccessContext {
    return {
        globalRoles: new Set(roles),
        chatId: chat.member || chat.admin ? 100 : undefined,
        isChatMember: chat.member,
        isChatAdmin: chat.admin,
    };
}

Deno.test('trusted users cannot read chat config or data without membership', () => {
    const context = access(['trusted_user']);
    assertEquals(
        canAccessConfig('ai.model', 'chat', 'read', context, 100),
        false,
    );
    assertEquals(canReadChatData(context, 100), false);
});

Deno.test('paid users cannot write global or shared chat config', () => {
    const context = access(['paid_user'], { member: true });
    assertEquals(
        canAccessConfig('responseDelay', 'global', 'write', context),
        false,
    );
    assertEquals(
        canAccessConfig('responseDelay', 'chat', 'write', context, 100),
        false,
    );
});

Deno.test('chat admins can manage chat keys but not global keys', () => {
    const context = access([], { member: true, admin: true });
    assert(canAccessConfig('ai.model', 'chat', 'write', context, 100));
    assertEquals(
        canAccessConfig('ai.model', 'global', 'write', context),
        false,
    );
});

Deno.test('bot admins bypass chat membership without implied role hierarchy', () => {
    const context = access(['bot_admin']);
    assert(canAccessConfig('ai.model', 'chat', 'write', context, 100));
    assert(canReadChatData(context, 100));
    assertEquals(context.globalRoles.has('trusted_user'), false);
});

Deno.test('chat authorization evidence is bound to one chat', () => {
    const context = access([], { member: true, admin: true });
    assertEquals(
        canAccessConfig('ai.model', 'chat', 'write', context, 200),
        false,
    );
    assertEquals(canReadChatData(context, 200), false);
});

Deno.test('optional schema leaves are supported config entries', () => {
    validateConfigEntryValue(
        'ai.generation.chat.thinking.thinkingLevel',
        'medium',
    );
});

Deno.test('max output tokens is not a supported config entry', () => {
    for (
        const key of [
            'ai.generation.chat.maxOutputTokens',
            'ai.generation.character.maxOutputTokens',
        ]
    ) {
        assertThrows(
            () => validateConfigEntryValue(key, 1000),
            ConfigValidationError,
        );
    }
});
