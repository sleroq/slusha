import { Api, RawApi } from 'grammy';
import { ModelMessage, UserContent } from 'ai';
import {
    chooseSize,
    downloadFile,
    getImageContent,
    removeFieldsWithSuffixes,
    sliceMessage,
} from './helpers.ts';
import { ChatMessage, ReplyTo } from './memory.ts';
import { Message } from 'grammy_types';
import { Logger } from '@deno-library/logger';
import logger from './logger.ts';

interface HistoryOptions {
    symbolLimit: number;
    messagesLimit: number;
    bytesLimit: number;
    attachments?: boolean;
    resolveReplyThread?: boolean;
    includeReactions?: boolean;
    historyVersion?: 'v2' | 'v3';
    activeMessageId?: number;
}

interface HistoryCandidate {
    msg: ChatMessage;
    rootIndex: number;
}

const HISTORY_META_OPEN = '<slusha_meta>';
const HISTORY_META_CLOSE = '</slusha_meta>';

function buildHistoryMetadataBlock(metadata: Record<string, unknown>): string {
    return `${HISTORY_META_OPEN}\n${
        JSON.stringify(metadata)
    }\n${HISTORY_META_CLOSE}`;
}

function collectReplyThread(
    history: ChatMessage[],
    msg: ChatMessage,
    thread: ChatMessage[] = [],
): ChatMessage[] {
    thread.push(msg);

    const replyTo = msg.replyTo;
    if (!replyTo) {
        return thread;
    }

    const replyToMsg = history.find((m) => m.id === replyTo.id);
    if (replyToMsg) {
        return collectReplyThread(history, replyToMsg, thread);
    } else {
        // For bot relies and stuff not saved in history
        thread.push({
            id: replyTo.id,
            text: replyTo.text ?? replyTo.info.caption ?? '',
            replyTo: replyTo,
            isMyself: false,
            info: replyTo.info,
        });
    }

    return thread;
}

export function selectHistoryCandidates(
    history: ChatMessage[],
    options: {
        resolveReplyThread: boolean;
        maxRootMessages?: number;
    },
): HistoryCandidate[] {
    const selected: HistoryCandidate[] = [];
    const seen = new Set<number>();
    let rootMessagesProcessed = 0;

    for (let i = history.length - 1; i >= 0; i--) {
        if (
            typeof options.maxRootMessages === 'number' &&
            rootMessagesProcessed >= options.maxRootMessages
        ) {
            break;
        }
        rootMessagesProcessed += 1;

        const rootMsg = history[i];
        if (seen.has(rootMsg.id)) {
            continue;
        }

        const thread = options.resolveReplyThread
            ? collectReplyThread(history, rootMsg)
            : [rootMsg];

        for (const threadMsg of thread) {
            if (seen.has(threadMsg.id)) {
                continue;
            }

            selected.push({
                msg: threadMsg,
                rootIndex: i,
            });
            seen.add(threadMsg.id);
        }
    }

    return selected;
}

function sameThread(left: ChatMessage, right: ChatMessage): boolean {
    if (left.threadId && right.threadId) {
        return left.threadId === right.threadId;
    }

    if (left.threadRootMessageId && right.threadRootMessageId) {
        return left.threadRootMessageId === right.threadRootMessageId;
    }

    return false;
}

function hasThreadMetadata(history: ChatMessage[]): boolean {
    return history.some((msg) =>
        Boolean(msg.threadId) || typeof msg.threadRootMessageId === 'number'
    );
}

export function selectHistoryCandidatesV3(
    history: ChatMessage[],
    options: {
        maxRootMessages?: number;
        activeMessageId?: number;
    },
): HistoryCandidate[] {
    if (!hasThreadMetadata(history)) {
        return selectHistoryCandidates(history, {
            resolveReplyThread: true,
            maxRootMessages: options.maxRootMessages,
        });
    }

    const selected: HistoryCandidate[] = [];
    const seen = new Set<number>();

    const activeThreadAnchor = typeof options.activeMessageId === 'number'
        ? history.find((msg) => msg.id === options.activeMessageId)
        : undefined;

    let fallbackAnchor: ChatMessage | undefined;
    if (!activeThreadAnchor) {
        for (let i = history.length - 1; i >= 0; i--) {
            const candidate = history[i];
            if (!candidate.isMyself) {
                fallbackAnchor = candidate;
                break;
            }
        }
    }

    const effectiveAnchor = activeThreadAnchor ?? fallbackAnchor;
    const anchorTopicId = typeof effectiveAnchor?.info.message_thread_id ===
            'number'
        ? effectiveAnchor.info.message_thread_id
        : undefined;
    const scopedToTelegramTopic = typeof anchorTopicId === 'number';

    function isInScopedTopic(msg: ChatMessage): boolean {
        if (!scopedToTelegramTopic) {
            return true;
        }

        return msg.info.message_thread_id === anchorTopicId;
    }

    const maxRootMessages = options.maxRootMessages;
    const activeThreadBudget = typeof maxRootMessages === 'number'
        ? Math.max(1, Math.floor(maxRootMessages * 0.7))
        : undefined;

    let activeThreadTaken = 0;
    if (effectiveAnchor) {
        for (let i = history.length - 1; i >= 0; i--) {
            const msg = history[i];
            if (seen.has(msg.id)) {
                continue;
            }
            if (!isInScopedTopic(msg)) {
                continue;
            }
            if (!scopedToTelegramTopic && !sameThread(msg, effectiveAnchor)) {
                continue;
            }
            if (
                typeof activeThreadBudget === 'number' &&
                activeThreadTaken >= activeThreadBudget
            ) {
                break;
            }

            selected.push({
                msg,
                rootIndex: i,
            });
            seen.add(msg.id);
            activeThreadTaken += 1;
        }
    }

    let rootMessagesProcessed = 0;
    for (let i = history.length - 1; i >= 0; i--) {
        const msg = history[i];
        if (!isInScopedTopic(msg)) {
            continue;
        }

        if (
            typeof maxRootMessages === 'number' &&
            rootMessagesProcessed >= maxRootMessages
        ) {
            break;
        }
        rootMessagesProcessed += 1;

        if (seen.has(msg.id)) {
            continue;
        }
        selected.push({
            msg,
            rootIndex: i,
        });
        seen.add(msg.id);
    }

    return selected;
}

type PrintType = (name: keyof Message, msg: Message) => string;

function getAttachmentDefault(name: keyof Message) {
    return `"${String(name)}": true`;
}

function getStickerAttachment(name: keyof Message, msg: Message) {
    return `"${String(name)}": { "emoji": "${msg.sticker?.emoji}" }`;
}

export const supportedTypesMap = new Map<keyof Message, PrintType>([
    ['animation', getAttachmentDefault],
    ['video', getAttachmentDefault],
    // ['audio', getAttachmentDefault],
    // ['document', getAttachmentDefault],
    ['photo', getAttachmentDefault],
    ['sticker', getStickerAttachment],
    ['video_note', getAttachmentDefault],
    ['voice', getAttachmentDefault],
]);

export const jsonTypes: Array<keyof Message> = [
    'audio',
    'document',
    'story',
    'contact',
    'dice',
    'game',
    'poll',
    'venue',
    'location',
    'new_chat_members',
    'left_chat_member',
    'new_chat_title',
    'new_chat_photo',
    'delete_chat_photo',
    'group_chat_created',
    'supergroup_chat_created',
    'channel_chat_created',
    'message_auto_delete_timer_changed',
    'migrate_to_chat_id',
    'migrate_from_chat_id',
    'pinned_message',
    'invoice',
    'successful_payment',
    'refunded_payment',
    'users_shared',
    'chat_shared',
    'connected_website',
    'write_access_allowed',
    'passport_data',
    'proximity_alert_triggered',
    'boost_added',
    'chat_background_set',
    'forum_topic_created',
    'forum_topic_edited',
    'forum_topic_closed',
    'forum_topic_reopened',
    'general_forum_topic_hidden',
    'general_forum_topic_unhidden',
    'giveaway_created',
    'giveaway',
    'giveaway_winners',
    'giveaway_completed',
    'video_chat_scheduled',
    'video_chat_started',
    'video_chat_ended',
    'video_chat_participants_invited',
    'web_app_data',
];

interface JSONInputMessage {
    user?: { name: string; username?: string };
    reply_to?: string; // username
    forward_origin?: unknown;
    text: string;
}

interface ConstructMsgOptions {
    symbolLimit: number;
    attachments: boolean;
    characterName?: string;
    includeReactions?: boolean;
}

const messageMetadataFields = new Set<string>([
    'message_id',
    'message_thread_id',
    'from',
    'sender_chat',
    'date',
    'chat',
    'is_topic_message',
    'has_protected_content',
    'reply_to_message',
    'external_reply',
    'quote',
    'reply_to_story',
    'via_bot',
    'edit_date',
    'has_media_spoiler',
    'media_group_id',
    'author_signature',
    'text',
    'entities',
    'caption',
    'caption_entities',
    'link_preview_options',
    'effect_id',
    'show_caption_above_media',
    'forward_origin',
    'reply_markup',
]);

const supportedTextContentTypes = new Set<string>([
    ...Array.from(supportedTypesMap.keys()).map(String),
    ...jsonTypes.map(String),
]);

function getPresentMessageFields(msgInfo: Message): string[] {
    const rawMsg = msgInfo as unknown as Record<string, unknown>;

    return Object.keys(rawMsg).filter((key) => rawMsg[key] !== undefined);
}

function getPresentContentFields(msgInfo: Message): string[] {
    return getPresentMessageFields(msgInfo).filter((field) =>
        !messageMetadataFields.has(field)
    );
}

function getSupportedContentFields(msgInfo: Message): string[] {
    return getPresentContentFields(msgInfo).filter((field) =>
        supportedTextContentTypes.has(field)
    );
}

function getUnsupportedContentFields(msgInfo: Message): string[] {
    return getPresentContentFields(msgInfo).filter((field) =>
        !supportedTextContentTypes.has(field)
    );
}

function getDateString(date: Date): string {
    const year = String(date.getFullYear());
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const seconds = String(date.getSeconds()).padStart(2, '0');

    const offsetMinutes = -date.getTimezoneOffset();
    const offsetSign = offsetMinutes >= 0 ? '+' : '-';
    const absOffsetMinutes = Math.abs(offsetMinutes);
    const offsetHours = String(Math.floor(absOffsetMinutes / 60)).padStart(2, '0');
    const offsetMins = String(absOffsetMinutes % 60).padStart(2, '0');

    return `${year}-${month}-${day} ${hours}:${minutes}:${seconds} ${offsetSign}${offsetHours}:${offsetMins}`;
}

async function constructMsg(
    api: Api<RawApi>,
    botInfo: { token: string; id: number },
    msg: ChatMessage,
    options: ConstructMsgOptions,
): Promise<ModelMessage> {
    const { symbolLimit, characterName } = options;
    const attachAttachments = options.attachments;
    const includeReactions = options.includeReactions ?? false;

    const role = msg.isMyself ? 'assistant' : 'user';
    const firstName = msg.info.from?.first_name ?? 'User';
    let text = msg.text ? sliceMessage(msg.text, symbolLimit) : '';

    // Label message types if it's not just text
    let isSupported = false;

    for (const [type, printType] of supportedTypesMap) {
        if (msg.info[type] !== undefined) {
            text += `\n${printType(type, msg.info)}`;
            isSupported = true;
        }
    }

    // Pass unsupported messages as json
    // TODO: Remove unnecessary fields to reduce size and improve prompt
    if (!isSupported) {
        for (const type of jsonTypes) {
            if (msg.info[type] !== undefined) {
                const prettyJsonObject = removeFieldsWithSuffixes(
                    msg.info[type],
                );
                text += `\n"${String(type)}": ${
                    JSON.stringify(prettyJsonObject)
                }`;
            }
        }
    }

    if (!text) {
        const supportedFields = getSupportedContentFields(msg.info);
        const unsupportedFields = getUnsupportedContentFields(msg.info);
        throw new Error(
            [
                'Message is not supported',
                `(message_id=${msg.id})`,
                `(has_text=${Boolean(msg.text)})`,
                `(supported_fields=${supportedFields.join(',') || 'none'})`,
                `(unsupported_fields=${unsupportedFields.join(',') || 'none'})`,
            ].join(' '),
        );
    }

    const parts: UserContent = [];

    let username = msg.info.from?.username;
    if (username) {
        username = '@' + msg.info.from?.username;
    }

    const user: JSONInputMessage['user'] = {
        name: firstName,
        username,
    };

    let replyTo = msg.replyTo?.info.from?.username;
    if (replyTo) {
        replyTo = '@' + replyTo;
    }

    // JSON message format example. More extensible but less human-readable and seems to be performing worse
    // const inputMessage: JSONInputMessage[] = [{
    //     user: msg.isMyself ? undefined : user,
    //     reply_to: replyTo,
    //     forward_origin: msg.info.forward_origin, // TODO: Maybe make it prettier
    //     text: text.trim(),
    // }];

    // const prettyInputMessage = JSON.stringify(inputMessage, null, 2);
    // const prettyInputMessage = JSON.stringify(inputMessage);

    const authorId = typeof msg.info.from?.id === 'number'
        ? msg.info.from.id.toString()
        : 'unknown';
    const authorTag = user.username ?? firstName;
    const messageDate = typeof msg.info.date === 'number'
        ? getDateString(new Date(msg.info.date * 1000))
        : undefined;
    const replyTargetId = msg.replyTo?.id;
    const messageMeta: Record<string, unknown> = {
        message_id: msg.id,
        author: {
            id: authorId,
            tag: authorTag,
            name: firstName,
        },
    };
    if (messageDate) {
        messageMeta.date = messageDate;
    }
    if (typeof replyTargetId === 'number') {
        messageMeta.reply_to_message_id = replyTargetId;
    }
    if (msg.threadId) {
        messageMeta.thread_id = msg.threadId;
    }
    if (typeof msg.threadRootMessageId === 'number') {
        messageMeta.thread_root_message_id = msg.threadRootMessageId;
    }
    if (typeof msg.threadParentMessageId === 'number') {
        messageMeta.thread_parent_message_id = msg.threadParentMessageId;
    }
    if (msg.threadSource) {
        messageMeta.thread_source = msg.threadSource;
    }
    if (replyTo) {
        messageMeta.reply_to_author_tag = replyTo;
    }
    if (msg.info.forward_origin) {
        messageMeta.forward_origin = removeFieldsWithSuffixes(
            msg.info.forward_origin,
        );
    }
    if (msg.info.via_bot?.username) {
        messageMeta.via_bot = `@${msg.info.via_bot.username}`;
    }
    if (msg.info.quote?.text) {
        messageMeta.quote_text = msg.info.quote.text;
    }

    let prettyInputMessage = '';
    if (characterName && msg.isMyself) {
        messageMeta.character = characterName;
    }
    prettyInputMessage += `${text.trim()}`;

    if (
        includeReactions && msg.reactions &&
        Object.keys(msg.reactions).length > 0
    ) {
        const reactions: Array<Record<string, unknown>> = [];
        for (const rec of Object.values(msg.reactions)) {
            if (rec.type === 'emoji' && rec.emoji) {
                reactions.push({
                    type: 'emoji',
                    emoji: rec.emoji,
                    count: rec.count,
                    by: rec.by.map((user) =>
                        user.username ? `@${user.username}` : user.name
                    ),
                });
                continue;
            }

            if (rec.type === 'custom' && rec.customEmojiId) {
                reactions.push({
                    type: 'custom',
                    custom_emoji_id: rec.customEmojiId,
                    count: rec.count,
                    by: rec.by.map((user) =>
                        user.username ? `@${user.username}` : user.name
                    ),
                });
            }
        }

        if (reactions.length > 0) {
            messageMeta.reactions = reactions;
        }
    }

    const messageBody = prettyInputMessage.trim();
    prettyInputMessage = buildHistoryMetadataBlock(messageMeta);
    if (messageBody.length > 0) {
        prettyInputMessage += `\n${messageBody}`;
    }

    parts.push({
        type: 'text',
        text: prettyInputMessage,
    });

    if (attachAttachments && role === 'user') {
        let attachments: Exclude<UserContent, string> = [];
        try {
            attachments = await getAttachments(api, botInfo.token, msg);
        } catch (error) {
            logger.error('Could not download message attachments', {
                error,
                messageId: msg.id,
                isMyself: msg.isMyself,
                hasText: Boolean(msg.text),
                textLength: msg.text?.length ?? 0,
                supportedFields: getSupportedContentFields(msg.info),
                unsupportedFields: getUnsupportedContentFields(msg.info),
            });
        }

        if (attachments.length > 0) {
            parts.push(...attachments);
        }
    }

    // FIXME: Types are broken
    return {
        role,
        content: parts,
    } as ModelMessage;
}

interface BuildHistoryContextOptions {
    mode: 'chat' | 'notes';
    symbolLimit: number;
    messagesLimit: number;
    bytesLimit: number;
    attachments?: boolean;
    resolveReplyThread?: boolean;
    includeReactions?: boolean;
    characterName?: string;
    historyVersion?: 'v2' | 'v3';
    activeMessageId?: number;
}

export async function buildHistoryContext(
    botInfo: { token: string; id: number },
    api: Api<RawApi>,
    logger: Logger,
    history: ChatMessage[],
    options: BuildHistoryContextOptions,
): Promise<ModelMessage[]> {
    const { mode, messagesLimit, bytesLimit, symbolLimit } = options;
    const resolveReplies = mode === 'chat'
        ? (options.resolveReplyThread ?? true)
        : false;

    let totalBytes = 0;
    let totalAttachments = 0;
    const prompt: ModelMessage[] = [];
    let textPart = '';

    const candidates = mode === 'chat' && options.historyVersion === 'v3'
        ? selectHistoryCandidatesV3(history, {
            maxRootMessages: undefined,
            activeMessageId: options.activeMessageId,
        })
        : selectHistoryCandidates(history, {
            resolveReplyThread: resolveReplies,
            maxRootMessages: mode === 'notes' ? messagesLimit : undefined,
        });

    for (const candidate of candidates) {
        const msg = candidate.msg;

        let attachAttachments = false;
        if (mode === 'chat') {
            attachAttachments = options.attachments ?? true;
            if (
                candidate.rootIndex < history.length - 10 ||
                totalAttachments > 2
            ) {
                attachAttachments = false;
            }
        }

        let msgRes;
        try {
            msgRes = await constructMsg(
                api,
                botInfo,
                msg,
                {
                    symbolLimit,
                    attachments: attachAttachments,
                    includeReactions: options.includeReactions,
                    characterName: options.characterName,
                },
            );
        } catch (error) {
            logger.error(
                mode === 'chat'
                    ? 'Could not construct replied message'
                    : 'Could not construct message',
                {
                    error,
                    messageId: msg.id,
                    isMyself: msg.isMyself,
                    hasText: Boolean(msg.text),
                    textLength: msg.text?.length ?? 0,
                    supportedFields: getSupportedContentFields(msg.info),
                    unsupportedFields: getUnsupportedContentFields(msg.info),
                },
            );
            continue;
        }

        if (mode === 'chat') {
            if (Array.isArray(msgRes.content)) {
                const attachmentsPart = msgRes.content.find((m) =>
                    m.type === 'file' || m.type === 'image'
                );
                totalAttachments += attachmentsPart ? 1 : 0;
            }

            const size = JSON.stringify(msgRes).length;
            if (totalBytes + size >= bytesLimit) {
                break;
            }

            prompt.push(msgRes);
            totalBytes += size;
            continue;
        }

        let content = msgRes.content;
        if (Array.isArray(content) && 'text' in content[0]) {
            content = content[0].text;
        }

        if (!content) {
            logger.warn('Message content is empty: ', msgRes);
            continue;
        }

        const size = JSON.stringify(content).length;
        if (totalBytes + size >= bytesLimit) {
            logger.info(
                `Skipping old messages because prompt is too big ${size} (${
                    totalBytes + size
                } > ${bytesLimit})`,
            );
            break;
        }

        textPart += content;
        textPart += '\n--- ---\n';
        totalBytes += size;
    }

    if (mode === 'notes') {
        return [{
            role: 'user',
            content: textPart,
        }];
    }

    prompt.reverse();
    prompt.splice(0, prompt.length - messagesLimit);
    return prompt;
}

export function makeHistoryV2(
    botInfo: { token: string; id: number },
    api: Api<RawApi>,
    logger: Logger,
    history: ChatMessage[],
    options: HistoryOptions,
): Promise<ModelMessage[]> {
    return buildHistoryContext(
        botInfo,
        api,
        logger,
        history,
        {
            mode: 'chat',
            symbolLimit: options.symbolLimit,
            messagesLimit: options.messagesLimit,
            bytesLimit: options.bytesLimit,
            attachments: options.attachments,
            resolveReplyThread: options.resolveReplyThread,
            includeReactions: options.includeReactions,
            historyVersion: 'v2',
            activeMessageId: options.activeMessageId,
        },
    );
}

export function makeHistoryV3(
    botInfo: { token: string; id: number },
    api: Api<RawApi>,
    logger: Logger,
    history: ChatMessage[],
    options: HistoryOptions,
): Promise<ModelMessage[]> {
    return buildHistoryContext(
        botInfo,
        api,
        logger,
        history,
        {
            mode: 'chat',
            symbolLimit: options.symbolLimit,
            messagesLimit: options.messagesLimit,
            bytesLimit: options.bytesLimit,
            attachments: options.attachments,
            resolveReplyThread: options.resolveReplyThread,
            includeReactions: options.includeReactions,
            historyVersion: 'v3',
            activeMessageId: options.activeMessageId,
        },
    );
}

interface NotesHistoryOptions {
    symbolLimit: number;
    messagesLimit: number;
    bytesLimit: number;
    characterName?: string;
}

export function makeNotesHistory(
    botInfo: { token: string; id: number },
    api: Api<RawApi>,
    logger: Logger,
    history: ChatMessage[],
    options: NotesHistoryOptions,
): Promise<ModelMessage[]> {
    return buildHistoryContext(
        botInfo,
        api,
        logger,
        history,
        {
            mode: 'notes',
            symbolLimit: options.symbolLimit,
            messagesLimit: options.messagesLimit,
            bytesLimit: options.bytesLimit,
            characterName: options.characterName,
        },
    );
}

async function getAttachments(
    api: Api<RawApi>,
    token: string,
    msg: ChatMessage | ReplyTo,
): Promise<Exclude<UserContent, string>> {
    const parts: UserContent = [];

    if (msg.info.photo) {
        const size = chooseSize(msg.info.photo);
        try {
            parts.push(
                await getImageContent(api, token, size.file_id, 'image/jpeg'),
            );
        } catch (error) {
            logger.error(
                'Could not download photo: ',
                error,
            );
        }
    }

    if (msg.info.sticker) {
        const { sticker } = msg.info;

        if (sticker.is_video) {
            try {
                const file = await downloadFile(
                    api,
                    token,
                    sticker.file_id,
                    'video/webm',
                );

                parts.push({
                    type: 'file',
                    data: file,
                    mediaType: 'video/webm',
                });
            } catch (error) {
                const thumbnailId = sticker.thumbnail?.file_id;
                if (!thumbnailId) {
                    logger.error(
                        'Could not process video sticker and it has no thumbnail: ',
                        error,
                    );
                    return parts;
                }

                logger.warn(
                    'Could not process video sticker, falling back to thumbnail: ',
                    error,
                );

                try {
                    parts.push(
                        await getImageContent(
                            api,
                            token,
                            thumbnailId,
                            'image/webp',
                        ),
                    );
                } catch (thumbnailError) {
                    logger.error(
                        'Could not download video sticker thumbnail: ',
                        thumbnailError,
                    );
                }
            }

            return parts;
        }

        let stickerImageId = undefined;
        if (sticker.is_animated) {
            stickerImageId = sticker.thumbnail?.file_id;
        } else {
            stickerImageId = sticker.file_id;
        }

        if (!stickerImageId) {
            logger.warn('Sticker has no file_id: ', sticker);
            return parts;
        }

        try {
            parts.push(
                await getImageContent(api, token, stickerImageId, 'image/webp'),
            );
        } catch (error) {
            logger.error(
                'Could not download sticker: ',
                error,
            );
            return parts;
        }
    }

    // If video < 20mb (non-selfhosted bot api limit)
    // then add whole video to the promt
    // otherwise - just thumbnail
    if (msg.info.video) {
        const video = msg.info.video;
        if (
            video.file_size && video.mime_type &&
            video.file_size <= 1024 * 1024 * 20
        ) {
            const mimeType = video.mime_type;
            const file = await downloadFile(
                api,
                token,
                video.file_id,
                mimeType,
            );

            parts.push({
                type: 'file',
                data: file,
                mediaType: mimeType,
            });
        } else {
            const thumbnailId = msg.info.video.thumbnail?.file_id;
            if (!thumbnailId) {
                logger.warn('Video has no thumbnail: ', msg.info.video);
                return parts;
            }

            try {
                parts.push(
                    await getImageContent(
                        api,
                        token,
                        thumbnailId,
                        'image/jpeg',
                    ),
                );
            } catch (error) {
                logger.error(
                    'Could not download video thumbnail: ',
                    error,
                );
                return parts;
            }
        }
    }

    if (msg.info.animation) {
        const { animation } = msg.info;

        if (!animation.mime_type) {
            logger.warn('Animation has no mime_type: ', animation);
            return parts;
        }

        const mediaType = animation.mime_type;
        const file = await downloadFile(
            api,
            token,
            animation.file_id,
            mediaType,
        );

        parts.push({
            type: 'file',
            data: file,
            mediaType,
        });
    }

    if (msg.info.video_note) {
        const { video_note: viNote } = msg.info;

        const file = await downloadFile(
            api,
            token,
            viNote.file_id,
            'video/mp4',
        );

        parts.push({
            type: 'file',
            data: file,
            mediaType: 'video/mp4',
        });
    }

    if (msg.info.voice) {
        const { voice } = msg.info;

        if (!voice.mime_type) {
            logger.warn('Audio has no mime_type: ', voice);
            return parts;
        }

        const mediaType = voice.mime_type;
        const file = await downloadFile(api, token, voice.file_id, mediaType);

        parts.push({
            type: 'file',
            data: file,
            mediaType,
        });
    }

    return parts;
}
