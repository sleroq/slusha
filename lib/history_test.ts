import { assertEquals } from '@std/assert';
import { Message } from 'grammy_types';
import { ReplyMessage } from './telegram/helpers.ts';
import { ChatMessage, ReplyTo } from './memory.ts';
import { selectHistoryCandidates } from './history.ts';

function createReplyTo(id: number): ReplyTo {
    return {
        id,
        text: '',
        isMyself: false,
        info: {} as unknown as ReplyMessage,
    };
}

function createMessage(id: number, replyToId?: number): ChatMessage {
    return {
        id,
        text: `m${id}`,
        isMyself: false,
        replyTo: typeof replyToId === 'number'
            ? createReplyTo(replyToId)
            : undefined,
        info: {} as unknown as Message,
    };
}

Deno.test('selectHistoryCandidates includes reply threads and deduplicates', () => {
    const history: ChatMessage[] = [
        createMessage(1),
        createMessage(2, 1),
        createMessage(3),
        createMessage(4, 2),
    ];

    const selected = selectHistoryCandidates(history, {
        resolveReplyThread: true,
    });

    assertEquals(selected.map((m) => m.msg.id), [4, 2, 1, 3]);
});

Deno.test('selectHistoryCandidates respects maxRootMessages', () => {
    const history: ChatMessage[] = [
        createMessage(1),
        createMessage(2),
        createMessage(3),
    ];

    const selected = selectHistoryCandidates(history, {
        resolveReplyThread: false,
        maxRootMessages: 2,
    });

    assertEquals(selected.map((m) => m.msg.id), [3, 2]);
});
