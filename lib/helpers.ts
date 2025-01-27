import {
    Sticker,
    Update,
} from 'https://deno.land/x/grammy@v1.30.0/types.deno.ts';
import { ChatMessage, ReplyTo } from './memory.ts';
import {
    Message,
    PhotoSize,
} from 'https://deno.land/x/grammy_types@v3.14.0/message.ts';
import { Config } from './config.ts';
import {
    CoreAssistantMessage,
    CoreSystemMessage,
    CoreToolMessage,
    CoreUserMessage,
    ImagePart,
    TextPart,
} from 'npm:ai';
import { exists } from 'https://deno.land/x/logger@v1.1.1/fs.ts';
import ky from 'https://esm.sh/ky@1.7.2';
import Logger from 'https://deno.land/x/logger@v1.1.1/logger.ts';
import { ReplyMessage } from './telegram/helpers.ts';
import { Api, RawApi } from 'https://deno.land/x/grammy@v1.30.0/mod.ts';

export function getRandomInt(min: number, max: number) {
    min = Math.ceil(min);
    max = Math.floor(max);
    return Math.floor(Math.random() * (max - min) + min); // The maximum is exclusive and the minimum is inclusive
}

export function stickerToText({ emoji }: Sticker): string {
    return emoji ? `[Sticker ${emoji}]` : '[Sticker]';
}

export function removeBotName(
    response: string,
    name: string,
    username: string,
) {
    const regexFull = new RegExp(`^${name}\\s*\\(@${username}\\):\\s*`, 'gmi');
    const regexName = new RegExp(`^${name}\\s*:\\s*`, 'gmi');
    response = response.replace(regexFull, '');
    return response.replace(regexName, '');
}

export function fixAIResponse(response: string) {
    // Delete first line if it ends with "):"
    const replyLines = response.split('\n');
    const firstLint = replyLines[0];
    if (firstLint.match(/^.*\)\s*:\s*$/)) {
        response = replyLines.slice(1).join('\n');
    }

    return response.trim();
}

export function sliceMessage(message: string, maxLength: number): string {
    return message.length > maxLength
        ? message.slice(0, maxLength) + '...'
        : message;
}

interface HistoryOptions {
    symbolLimit: number;
    messagesLimit: number;
    usernames?: boolean;
    images?: boolean;
}

export type Prompt = Array<
    CoreSystemMessage | CoreUserMessage | CoreAssistantMessage | CoreToolMessage
>;

async function downloadFile(api: Api<RawApi>, token: string, fileId: string) {
    const filePath = `./tmp/${fileId}`;
    if (await exists(filePath)) {
        return await Deno.readFile(filePath);
    }

    const file = await api.getFile(fileId);

    const downloadUrl =
        `https://api.telegram.org/file/bot${token}/${file.file_path}`;

    const arrayBuffer = await ky.get(downloadUrl).arrayBuffer();
    const buffer = new Uint8Array(arrayBuffer);

    await Deno.writeFile(filePath, buffer);

    return buffer;
}

async function getFileContent(
    api: Api<RawApi>,
    token: string,
    fileId: string,
): Promise<ImagePart> {
    const stickerFile = await downloadFile(api, token, fileId);

    return {
        type: 'image',
        image: stickerFile,
    };
}

function chooseSize(photos: PhotoSize[]): PhotoSize {
    return photos.sort((a, b) => {
        if (!a.file_size || !b.file_size) {
            return 0;
        }

        if (a.file_size > b.file_size) {
            return -1;
        }

        if (a.file_size < b.file_size) {
            return 1;
        }

        return 0;
    })[0];
}

async function getAttachments(
    api: Api<RawApi>,
    token: string,
    logger: Logger,
    msg: ChatMessage | ReplyTo,
): Promise<ImagePart[]> {
    const parts: ImagePart[] = [];

    if (msg.info.photo) {
        const size = chooseSize(msg.info.photo);
        try {
            parts.push(await getFileContent(api, token, size.file_id));
        } catch (error) {
            logger.error(
                'Could not download photo: ',
                error,
            );
        }
    }

    if (msg.info.sticker) {
        const { sticker } = msg.info;
        let stickerImageId = undefined;
        if (sticker.is_video || sticker.is_animated) {
            stickerImageId = sticker.thumbnail?.file_id;
        } else {
            stickerImageId = sticker.file_id;
        }

        if (!stickerImageId) {
            logger.warn('Sticker has no file_id: ', sticker);
            return parts;
        }

        try {
            parts.push(await getFileContent(api, token, stickerImageId));
        } catch (error) {
            logger.error(
                'Could not download sticker: ',
                error,
            );
            return parts;
        }
    }

    if (msg.info.video) {
        const thumbnailId = msg.info.video.thumbnail?.file_id;
        if (!thumbnailId) {
            logger.warn('Video has no thumbnail: ', msg.info.video);
            return parts;
        }

        try {
            parts.push(await getFileContent(api, token, thumbnailId));
        } catch (error) {
            logger.error(
                'Could not download video thumbnail: ',
                error,
            );
            return parts;
        }
    }

    if (msg.info.animation) {
        const thumbnailId = msg.info.animation.thumbnail?.file_id;
        if (!thumbnailId) {
            logger.warn('Animation has no file_id: ', msg.info.animation);
            return parts;
        }

        try {
            parts.push(await getFileContent(api, token, thumbnailId));
        } catch (error) {
            logger.error(
                'Could not download animation thumbnail: ',
                error,
            );
            return parts;
        }
    }

    if (msg.info.video_note) {
        const thumbnailId = msg.info.video_note.thumbnail?.file_id;
        if (!thumbnailId) {
            logger.warn('Video note has no file_id: ', msg.info.video_note);
            return parts;
        }

        try {
            parts.push(await getFileContent(api, token, thumbnailId));
        } catch (error) {
            logger.error(
                'Could not download video note thumbnail: ',
                error,
            );
            return parts;
        }
    }

    return parts;
}

export async function makeHistory(
    botInfo: { token: string; id: number },
    api: Api<RawApi>,
    logger: Logger,
    history: ChatMessage[],
    options: HistoryOptions,
): Promise<Prompt> {
    const { symbolLimit, messagesLimit } = options;
    const usernames = options?.usernames ?? true;
    const images = options?.images ?? true;

    if (history.length > messagesLimit) {
        history.splice(0, history.length - messagesLimit);
    }

    let prompt: Prompt = [];
    for (let i = 0; i < history.length; i++) {
        const msg = history[i];
        const sender = msg.info.from;

        const username = sender?.username ? ` (@${sender.username})` : '';
        const name = sender?.first_name ?? 'User';

        // This is a message passed to ai
        let context = `${name}`;

        if (usernames && username) {
            context += username;
        }

        // If message is a reply add info about it
        if (msg.replyTo) {
            if (msg.replyTo.info.from?.id !== botInfo.id) {
                const replyName = msg.replyTo.info.from?.first_name ?? 'User';
                context += ` (in reply to: ${replyName})`;
            }

            if (msg.replyTo.info.quote?.is_manual) {
                context += ` (quoted) > ${msg.replyTo.info.quote.text}`;
            }
        }

        // If message is reply but not from bot
        // and replied message is not in 5 messages before current one
        // add context about original message so ai can follow conversation
        if (msg.replyTo) {
            const reply = msg.replyTo;
            const prevIndex = i - 5 < 0 ? 0 : i - 5;
            if (
                !history.slice(prevIndex, i).some((msg) => msg.id === reply.id)
            ) {
                const replyName = reply.info.from?.first_name ?? 'User';
                let replyText = `(quoted message from ${replyName}):\n`;
                replyText += sliceMessage(reply.text, symbolLimit);

                const isItFromMe = reply.info.from?.id === botInfo.id;
                if (isItFromMe) {
                    prompt.push(
                        {
                            role: 'assistant',
                            content: replyText,
                        },
                    );
                    // Add attachments only if it's replied by last 3 messages
                } else if (
                    history.slice(-3).some((m) => m.id === msg.id) &&
                    !msg.isMyself &&
                    images
                ) {
                    let replyContent: Array<TextPart | ImagePart> = [
                        {
                            type: 'text',
                            text: replyText,
                        },
                    ];

                    let parts: ImagePart[] = [];
                    try {
                        parts = await getAttachments(
                            api,
                            botInfo.token,
                            logger,
                            reply,
                        );
                    } catch (error) {
                        logger.error(
                            'Could not download reply attachments: ',
                            error,
                        );
                    }

                    if (parts.length > 0) {
                        replyContent = replyContent.concat(parts);
                    }

                    prompt.push(
                        {
                            role: 'user',
                            content: replyContent,
                        },
                    );
                }
            }
        }

        context += ':\n' + sliceMessage(msg.text, symbolLimit);

        if (msg.isMyself) {
            prompt.push({
                role: 'assistant',
                content: [{
                    type: 'text',
                    text: context,
                }],
            });
            continue;
        }

        let content: Array<TextPart | ImagePart> = [
            {
                type: 'text',
                text: context,
            },
        ];

        // If message is in the last 5 messages in history
        // download image attachments
        if (images && history.slice(-5).some((m) => m.id === msg.id)) {
            const parts = await getAttachments(api, botInfo.token, logger, msg);
            if (parts.length > 0) {
                content = content.concat(parts);
            }
        }

        prompt.push({
            role: 'user',
            content,
        });
    }

    // Filter out messages with no parts
    // Idk why but sometimes it happens
    prompt = prompt.filter((message) => {
        if (typeof message.content === 'string') {
            return message.content.length > 0;
        }

        if (message.content.length === 0) {
            logger.warn('Empty part: ', message.content, prompt, history);
            return false;
        }

        return message.content.some((part) => {
            if ('text' in part) {
                return part.text.length > 0;
            }

            if ('image' in part && part.image.length > 0) {
                return true;
            }

            logger.warn('Empty part: ', part, prompt, history);
            return false;
        });
    });

    return prompt;
}

/**
 * Deletes old files from tmp folder
 * @param logger Logger
 * @param maxAge Max age in hours
 */
export async function deleteOldFiles(logger: Logger, maxAge: number) {
    const files = Deno.readDir('./tmp');

    for await (const file of files) {
        const filePath = `./tmp/${file.name}`;

        const stat = await Deno.stat(filePath);

        const mtime = stat.mtime?.getTime() ?? 0;
        const age = (Date.now() - mtime) / (1000 * 60 * 60);

        if (age > maxAge || stat.mtime === null) {
            logger.info(`Deleting old file: ${file.name}`);
            await Deno.remove(filePath);
        }
    }
}

export function getText(
    msg:
        | Message
        | ReplyMessage,
) {
    let text = msg.text || '';

    if (msg.sticker) {
        text += stickerToText(msg.sticker);
    }

    if (msg.caption) {
        text += msg.caption;
    }

    // Replace new lines with spaces
    text = text.replace(/[\n\r]/g, ' ');

    if (!text.trim()) return;

    let name = '';
    switch (msg.forward_origin?.type) {
        case 'user':
            name = msg.forward_origin.sender_user.first_name ?? '';
            break;
        case 'chat':
            name = msg.forward_origin.sender_chat.first_name ??
                msg.forward_origin.sender_chat.title ?? '';
            break;
        case 'channel':
            name = msg.forward_origin.chat.first_name ??
                msg.forward_origin.chat.title ?? '';
            break;
        case 'hidden_user':
            name = 'hidden';
            break;
    }

    const from = name !== '' ? `(forwarded from ${name.slice(0, 20)}): ` : '';
    text = from + text;

    const attachments: (keyof (Message & Update.NonChannel))[] = [
        'photo',
        'video',
        'animation',
        'audio',
        'voice',
        'document',
        'video_note',
        'contact',
        'location',
        'venue',
        'poll',
        'dice',
        'game',
    ];

    const attachmentsText = attachments.reduce((acc, key) => {
        if (msg[key]) {
            acc += ` [${key}]`;
        }

        return acc;
    }, '');

    text += attachmentsText;

    return text;
}

export function getRandomNepon(config: Config) {
    const nepons = config.nepons;
    const randomIndex = getRandomInt(0, nepons.length - 1);
    return nepons[randomIndex];
}

/**
 * Returns true with probability of `percentage`
 * @param percentage
 * @returns boolean
 * @throws Error if `percentage` is not between 0 and 100
 */
export function probability(percentage: number) {
    if (percentage < 0 || percentage > 100) {
        throw new Error('Percentage must be between 0 and 100');
    }

    return Math.random() < percentage / 100;
}

export function testMessage(regexs: Array<string | RegExp>, text: string) {
    return regexs.some((regex) => {
        if (typeof regex === 'string') {
            return text.includes(regex);
        }

        return regex.test(text);
    });
}

export function prettyPrintPrompt(prompt: Prompt, limit = 100) {
    return prompt.map((message) => {
        if (typeof message.content === 'string') {
            return message.role + ': ' + message.content;
        }

        return message.role + ': ' + message.content.map((content) => {
            if ('text' in content) {
                return content.text.replaceAll('\n', ' ');
            }

            if ('image' in content) {
                return '[image]';
            }
        }).join('\n');
    }).slice(-limit).join('\n');
}

export function escapeHtml(unsafe: string): string {
    return unsafe
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}
