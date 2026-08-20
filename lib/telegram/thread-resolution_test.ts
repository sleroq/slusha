import { assertEquals } from '@std/assert';
import type { Message } from 'grammy_types';
import type { MessageRepository } from '../persistence/messages.ts';
import type { ChatMessage } from '../persistence/types.ts';
import { resolveThreadForIncomingMessage } from './thread-resolution.ts';

Deno.test(
    'non-topic reply thread id does not split implicit continuation',
    async () => {
        const previous = {
            id: 571501,
            text: 'Слюша что думаешь',
            isMyself: false,
            threadId: 'thread:571245',
            threadRootMessageId: 571245,
            info: {
                message_id: 571501,
                date: 100,
                message_thread_id: 571245,
                from: {
                    id: 308552322,
                    is_bot: false,
                    first_name: 'sl',
                },
            } as Message,
        } satisfies ChatMessage;
        let requestedTopicId: number | undefined;
        const messages = {
            getMessageById: () => Promise.resolve(undefined),
            getLastMessageByAuthorInTopic: (
                _authorId: number,
                topicId: number | undefined,
            ) => {
                requestedTopicId = topicId;
                return Promise.resolve(previous);
            },
        } as Pick<
            MessageRepository,
            'getMessageById' | 'getLastMessageByAuthorInTopic'
        >;
        const incoming = {
            message_id: 571502,
            date: 135,
            text: 'слюша',
            from: {
                id: 308552322,
                is_bot: false,
                first_name: 'sl',
            },
        } as Message;

        const resolution = await resolveThreadForIncomingMessage(
            messages,
            incoming,
        );

        assertEquals(requestedTopicId, undefined);
        assertEquals(resolution, {
            threadId: 'thread:571245',
            threadRootMessageId: 571245,
            threadParentMessageId: 571501,
            threadSource: 'implicit_same_author',
        });
    },
);
