import { Message } from 'grammy_types/message.ts';
import { MessageRepository } from '../persistence/messages.ts';

interface ThreadResolution {
    threadId: string;
    threadRootMessageId: number;
    threadParentMessageId?: number;
    threadSource: string;
}

function isSameTopic(left: Message, right: Message): boolean {
    const leftTopic = left.is_topic_message === true
        ? left.message_thread_id
        : undefined;
    const rightTopic = right.is_topic_message === true
        ? right.message_thread_id
        : undefined;
    return leftTopic === rightTopic;
}

export async function resolveThreadForIncomingMessage(
    messages: Pick<
        MessageRepository,
        'getMessageById' | 'getLastMessageByAuthorInTopic'
    >,
    incoming: Message,
    replyToId?: number,
): Promise<ThreadResolution> {
    if (typeof replyToId === 'number') {
        const parent = await messages.getMessageById(replyToId);
        const inheritedRoot = parent?.threadRootMessageId ?? replyToId;
        const inheritedThread = parent?.threadId ?? `thread:${inheritedRoot}`;

        return {
            threadId: inheritedThread,
            threadRootMessageId: inheritedRoot,
            threadParentMessageId: replyToId,
            threadSource: parent ? 'explicit_reply' : 'explicit_reply_external',
        };
    }

    const incomingAuthorId = incoming.from?.id;
    const incomingDate = incoming.date;
    const maxGapSeconds = 180;
    const maxInterveningMessages = 6;

    if (typeof incomingAuthorId === 'number') {
        const incomingTopicId = incoming.is_topic_message === true
            ? incoming.message_thread_id
            : undefined;
        const candidate = await messages.getLastMessageByAuthorInTopic(
            incomingAuthorId,
            incomingTopicId,
            maxInterveningMessages + 1,
        );

        if (candidate && isSameTopic(candidate.info, incoming)) {
            const candidateDate = candidate.info.date;
            const secondsSince = incomingDate - candidateDate;
            if (secondsSince <= maxGapSeconds) {
                const inheritedRoot = candidate.threadRootMessageId ??
                    candidate.id;
                const inheritedThread = candidate.threadId ??
                    `thread:${inheritedRoot}`;
                return {
                    threadId: inheritedThread,
                    threadRootMessageId: inheritedRoot,
                    threadParentMessageId: candidate.id,
                    threadSource: 'implicit_same_author',
                };
            }
        }
    }

    return {
        threadId: `thread:${incoming.message_id}`,
        threadRootMessageId: incoming.message_id,
        threadSource: 'new_thread',
    };
}
