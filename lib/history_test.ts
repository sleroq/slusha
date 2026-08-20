import { assertEquals } from '@std/assert';
import { Message } from 'grammy_types';
import { ReplyMessage } from './telegram/helpers.ts';
import type { ChatMessage, ReplyTo } from './persistence/types.ts';
import {
    resolveReplyHistory,
    selectHistoryCandidates,
} from './history.ts';

function createReplyTo(id: number): ReplyTo {
    return {
        id,
        text: '',
        isMyself: false,
        info: {} as unknown as ReplyMessage,
    };
}

function createMessage(
    id: number,
    replyToId?: number,
    options?: {
        threadId?: string;
        threadRootMessageId?: number;
        messageThreadId?: number;
        isTopicMessage?: true;
        fromId?: number;
        date?: number;
    },
): ChatMessage {
    return {
        id,
        text: `m${id}`,
        isMyself: false,
        replyTo: typeof replyToId === 'number'
            ? createReplyTo(replyToId)
            : undefined,
        threadId: options?.threadId,
        threadRootMessageId: options?.threadRootMessageId,
        info: {
            from: {
                id: options?.fromId ?? 1,
                is_bot: false,
                first_name: 'User',
            },
            date: options?.date ?? id,
            message_thread_id: options?.messageThreadId,
            is_topic_message: options?.isTopicMessage,
        } as unknown as Message,
    };
}

Deno.test('selectHistoryCandidates prioritizes active thread', () => {
    const history: ChatMessage[] = [
        createMessage(1, undefined, {
            threadId: 'thread:1',
            threadRootMessageId: 1,
            fromId: 11,
        }),
        createMessage(2, undefined, {
            threadId: 'thread:2',
            threadRootMessageId: 2,
            fromId: 22,
        }),
        createMessage(3, 1, {
            threadId: 'thread:1',
            threadRootMessageId: 1,
            fromId: 33,
        }),
        createMessage(4, undefined, {
            threadId: 'thread:2',
            threadRootMessageId: 2,
            fromId: 22,
        }),
        createMessage(5, 3, {
            threadId: 'thread:1',
            threadRootMessageId: 1,
            fromId: 44,
        }),
    ];

    const selected = selectHistoryCandidates(history, {});

    assertEquals(selected.map((m) => m.msg.id), [5, 3, 1, 4, 2]);
});

Deno.test(
    'selectHistoryCandidates keeps continuation thread with interleaving chatter',
    () => {
        const history: ChatMessage[] = [
            createMessage(10, undefined, {
                threadId: 'thread:10',
                threadRootMessageId: 10,
                fromId: 100,
            }),
            createMessage(11, undefined, {
                threadId: 'thread:99',
                threadRootMessageId: 99,
                fromId: 200,
            }),
            createMessage(12, 10, {
                threadId: 'thread:10',
                threadRootMessageId: 10,
                fromId: 300,
            }),
            createMessage(13, undefined, {
                threadId: 'thread:10',
                threadRootMessageId: 10,
                fromId: 300,
            }),
            createMessage(14, undefined, {
                threadId: 'thread:99',
                threadRootMessageId: 99,
                fromId: 200,
            }),
            createMessage(15, 13, {
                threadId: 'thread:10',
                threadRootMessageId: 10,
                fromId: 400,
            }),
        ];

        const selected = selectHistoryCandidates(history, {
            maxRootMessages: 5,
        });

        assertEquals(selected.slice(0, 3).map((m) => m.msg.id), [15, 13, 12]);
    },
);

Deno.test(
    'selectHistoryCandidates groups difficult group reply thread over meme noise',
    () => {
        const history: ChatMessage[] = [
            // userA root thread
            createMessage(101, undefined, {
                threadId: 'thread:101',
                threadRootMessageId: 101,
                fromId: 10,
            }),
            // userB disconnected meme thread
            createMessage(102, undefined, {
                threadId: 'thread:102',
                threadRootMessageId: 102,
                fromId: 20,
            }),
            createMessage(103, undefined, {
                threadId: 'thread:102',
                threadRootMessageId: 102,
                fromId: 20,
            }),
            // userC replies to userA
            createMessage(104, 101, {
                threadId: 'thread:101',
                threadRootMessageId: 101,
                fromId: 30,
            }),
            // userC follow-up without explicit telegram reply but same internal thread
            createMessage(105, undefined, {
                threadId: 'thread:101',
                threadRootMessageId: 101,
                fromId: 30,
            }),
            // more meme noise
            createMessage(106, undefined, {
                threadId: 'thread:102',
                threadRootMessageId: 102,
                fromId: 20,
            }),
            // userD and userF reply into userC branch
            createMessage(107, 105, {
                threadId: 'thread:101',
                threadRootMessageId: 101,
                fromId: 40,
            }),
            createMessage(108, 105, {
                threadId: 'thread:101',
                threadRootMessageId: 101,
                fromId: 50,
            }),
        ];

        const selected = selectHistoryCandidates(history, {});

        assertEquals(selected.map((m) => m.msg.id), [
            108,
            107,
            105,
            104,
            101,
            106,
            103,
            102,
        ]);
    },
);

Deno.test(
    'selectHistoryCandidates keeps most recent hard thread context under budget',
    () => {
        const history: ChatMessage[] = [
            createMessage(201, undefined, {
                threadId: 'thread:201',
                threadRootMessageId: 201,
                fromId: 10,
            }),
            createMessage(202, undefined, {
                threadId: 'thread:202',
                threadRootMessageId: 202,
                fromId: 20,
            }),
            createMessage(203, undefined, {
                threadId: 'thread:202',
                threadRootMessageId: 202,
                fromId: 20,
            }),
            createMessage(204, 201, {
                threadId: 'thread:201',
                threadRootMessageId: 201,
                fromId: 30,
            }),
            createMessage(205, undefined, {
                threadId: 'thread:201',
                threadRootMessageId: 201,
                fromId: 30,
            }),
            createMessage(206, undefined, {
                threadId: 'thread:202',
                threadRootMessageId: 202,
                fromId: 20,
            }),
            createMessage(207, 205, {
                threadId: 'thread:201',
                threadRootMessageId: 201,
                fromId: 40,
            }),
            createMessage(208, 205, {
                threadId: 'thread:201',
                threadRootMessageId: 201,
                fromId: 50,
            }),
        ];

        const selected = selectHistoryCandidates(history, {
            maxRootMessages: 6,
        });

        assertEquals(selected.map((m) => m.msg.id), [
            208,
            207,
            205,
            204,
            206,
            203,
        ]);
    },
);

Deno.test(
    'selectHistoryCandidates scopes to active telegram topic when anchor provided',
    () => {
        const history: ChatMessage[] = [
            createMessage(300, undefined, {
                threadId: 'thread:300',
                threadRootMessageId: 300,
                messageThreadId: 77,
                isTopicMessage: true,
                fromId: 10,
            }),
            createMessage(301, undefined, {
                threadId: 'thread:301',
                threadRootMessageId: 301,
                messageThreadId: 88,
                isTopicMessage: true,
                fromId: 20,
            }),
            createMessage(302, 300, {
                threadId: 'thread:300',
                threadRootMessageId: 300,
                messageThreadId: 77,
                isTopicMessage: true,
                fromId: 30,
            }),
            createMessage(303, undefined, {
                threadId: 'thread:301',
                threadRootMessageId: 301,
                messageThreadId: 88,
                isTopicMessage: true,
                fromId: 20,
            }),
            createMessage(304, undefined, {
                threadId: 'thread:300',
                threadRootMessageId: 300,
                messageThreadId: 77,
                isTopicMessage: true,
                fromId: 40,
            }),
        ];

        const selected = selectHistoryCandidates(history, {
            activeMessageId: 304,
        });

        assertEquals(selected.map((m) => m.msg.id), [304, 302, 300]);
    },
);

Deno.test(
    'selectHistoryCandidates keeps root of non-topic supergroup reply thread',
    () => {
        const history: ChatMessage[] = [
            createMessage(571245, undefined, {
                threadId: 'thread:571245',
                threadRootMessageId: 571245,
                fromId: 10,
            }),
            createMessage(571274, 571245, {
                threadId: 'thread:571245',
                threadRootMessageId: 571245,
                messageThreadId: 571245,
                fromId: 20,
            }),
            createMessage(571275, 571245, {
                threadId: 'thread:571245',
                threadRootMessageId: 571245,
                messageThreadId: 571245,
                fromId: 20,
            }),
        ];

        const selected = selectHistoryCandidates(history, {
            activeMessageId: 571275,
        });

        assertEquals(
            selected.map((candidate) => candidate.msg.id),
            [571275, 571274, 571245],
        );
    },
);

Deno.test('resolveReplyHistory hydrates the complete persisted reply chain', async () => {
    const root = createMessage(500, undefined, {
        threadId: 'thread:500',
        threadRootMessageId: 500,
        date: 1,
    });
    const parent = createMessage(520, 500, {
        threadId: 'thread:500',
        threadRootMessageId: 500,
        date: 3,
    });
    parent.threadParentMessageId = 500;
    const active = createMessage(540, 520, {
        threadId: 'thread:500',
        threadRootMessageId: 500,
        date: 5,
    });
    active.threadParentMessageId = 520;
    const unrelated = createMessage(530, undefined, {
        threadId: 'thread:530',
        threadRootMessageId: 530,
        date: 4,
    });
    const stored = new Map([
        [root.id, root],
        [parent.id, parent],
    ]);

    const resolved = await resolveReplyHistory(
        [unrelated, active],
        active.id,
        (messageId) => Promise.resolve(stored.get(messageId)),
    );
    const selected = selectHistoryCandidates(resolved, {
        activeMessageId: active.id,
    });

    assertEquals(resolved.map((message) => message.id), [530, 500, 520, 540]);
    assertEquals(
        selected.map((candidate) => candidate.msg.id),
        [540, 520, 500, 530],
    );
});

Deno.test('resolveReplyHistory uses Telegram reply snapshot for an unstored parent', async () => {
    const active = createMessage(610, 600, {
        threadId: 'thread:600',
        threadRootMessageId: 600,
        date: 2,
    });
    active.threadParentMessageId = 600;
    active.replyTo = {
        id: 600,
        text: 'forwarded source',
        isMyself: false,
        info: {
            message_id: 600,
            date: 1,
            text: 'forwarded source',
        } as ReplyMessage,
    };

    const resolved = await resolveReplyHistory(
        [active],
        active.id,
        () => Promise.resolve(undefined),
    );

    assertEquals(resolved.map((message) => message.id), [600, 610]);
    assertEquals(resolved[0].text, 'forwarded source');
    assertEquals(resolved[0].threadSource, 'reply_snapshot');
});

Deno.test('resolveReplyHistory inlines replies from every recent message', async () => {
    const repliedMessage = createMessage(701, 600, {
        threadId: 'thread:600',
        threadRootMessageId: 600,
        date: 2,
    });
    repliedMessage.threadParentMessageId = 600;
    repliedMessage.replyTo = {
        id: 600,
        text: 'older replied message',
        isMyself: false,
        info: {
            message_id: 600,
            date: 1,
            text: 'older replied message',
        } as ReplyMessage,
    };
    const active = createMessage(702, undefined, {
        threadId: 'thread:702',
        threadRootMessageId: 702,
        date: 3,
    });

    const resolved = await resolveReplyHistory(
        [repliedMessage, active],
        active.id,
        () => Promise.resolve(undefined),
    );

    assertEquals(resolved.map((message) => message.id), [600, 701, 702]);
});

Deno.test(
    'selectHistoryCandidates falls back to latest non-bot anchor when active message is missing',
    () => {
        const history: ChatMessage[] = [
            createMessage(401, undefined, {
                threadId: 'thread:401',
                threadRootMessageId: 401,
                fromId: 10,
            }),
            createMessage(402, undefined, {
                threadId: 'thread:402',
                threadRootMessageId: 402,
                fromId: 20,
            }),
            createMessage(403, 401, {
                threadId: 'thread:401',
                threadRootMessageId: 401,
                fromId: 30,
            }),
        ];

        const selected = selectHistoryCandidates(history, {
            activeMessageId: 999999,
        });

        assertEquals(selected.map((m) => m.msg.id), [403, 401, 402]);
    },
);
