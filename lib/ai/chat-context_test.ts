import { assertEquals } from '@std/assert';
import {
    buildChatInfoBlock,
    buildChatPromptAddition,
    isTelegramCommentsHistory,
} from './chat-context.ts';
import { ChatMessage, Member } from '../memory.ts';
import { Message, User } from 'grammy_types';

function createMessageWithForwardFromTelegram(): ChatMessage {
    return {
        id: 1,
        text: '',
        isMyself: false,
        info: {
            forward_origin: { type: 'channel' },
            from: { first_name: 'Telegram' },
        } as unknown as Message,
    };
}

function createMember(first_name: string, username?: string): Member {
    return {
        id: 1,
        first_name,
        username,
        description: '',
        info: {} as unknown as User,
        lastUse: Date.now(),
    };
}

Deno.test('isTelegramCommentsHistory detects telegram comments', () => {
    const history: ChatMessage[] = [createMessageWithForwardFromTelegram()];
    assertEquals(isTelegramCommentsHistory(history), true);
});

Deno.test('buildChatPromptAddition resolves by chat mode', () => {
    assertEquals(
        buildChatPromptAddition({
            chatType: 'private',
            isComments: false,
            privateChatPromptAddition: 'private',
            commentsPromptAddition: 'comments',
            groupChatPromptAddition: 'group',
        }),
        'private',
    );
    assertEquals(
        buildChatPromptAddition({
            chatType: 'group',
            isComments: true,
            privateChatPromptAddition: 'private',
            commentsPromptAddition: 'comments',
            groupChatPromptAddition: 'group',
        }),
        'comments',
    );
});

Deno.test('buildChatInfoBlock renders active members and notes', () => {
    const members: Member[] = [
        createMember('Ann', 'ann'),
        createMember('Bob'),
    ];

    const text = buildChatInfoBlock({
        nowText: 'now',
        chatType: 'group',
        chatTitle: 'Test chat',
        activeMembers: members,
        notes: ['n1'],
        memory: 'm1',
        includeNotes: true,
        includeMemory: true,
    });

    assertEquals(text.includes('Date and time right now: now'), true);
    assertEquals(text.includes('Chat: Test chat, Active members:'), true);
    assertEquals(text.includes('- Ann (@ann)'), true);
    assertEquals(text.includes('Chat notes:\nn1'), true);
    assertEquals(text.includes('MY OWN PERSONAL NOTES AND MEMORY:\nm1'), true);
});
