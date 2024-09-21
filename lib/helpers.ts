import {
    Sticker,
    Update,
} from 'https://deno.land/x/grammy@v1.30.0/types.deno.ts';
import { ChatMessage } from './memory.ts';
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
import { Bot } from 'https://deno.land/x/grammy@v1.30.0/bot.ts';
import { SlushaContext } from './telegram/setup-bot.ts';
import { exists } from 'https://deno.land/x/logger@v1.1.1/fs.ts';
import ky from 'https://esm.sh/ky@1.7.2';
import Logger from 'https://deno.land/x/logger@v1.1.1/logger.ts';

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

export function sliceMessage(message: string, maxLength: number): string {
    return message.length > maxLength
        ? message.slice(0, maxLength) + '...'
        : message;
}

interface HistoryOptions {
    symbolLimit: number;
    messagesLimit: number;
    usernames?: boolean;
}

type Prompt = Array<
    CoreSystemMessage | CoreUserMessage | CoreAssistantMessage | CoreToolMessage
>;

async function getPhotoContent(
    bot: Bot<SlushaContext>,
    logger: Logger,
    photos: PhotoSize[],
): Promise<Array<ImagePart>> {
    const files = [];

    const photo = photos.sort((a, b) => {
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

    let file: Uint8Array;
    try {
        file = await downloadFile(bot, photo.file_id);
    } catch (error) {
        logger.error(
            'Could not download file: ',
            error,
        );
        return [];
    }

    files.push(file);

    return files.map((file) => ({
        type: 'image',
        image: file,
    }));
}

export async function makeHistory(
    bot: Bot<SlushaContext>,
    logger: Logger,
    history: ChatMessage[],
    options: HistoryOptions,
): Promise<Prompt> {
    const { symbolLimit, messagesLimit } = options;
    const usernames = options?.usernames ?? true;

    if (history.length > messagesLimit) {
        history.splice(0, history.length - messagesLimit);
    }

    const prompt: Prompt = [];
    for (let i = 0; i < history.length; i++) {
        const message = history[i];
        let context = `${message.sender.name} (@${message.sender.username})`;
        if (!usernames) {
            context = `${message.sender.name}`;
        }

        if (message.replyTo && !message.sender.myself) {
            // Add original message if this is last message in history
            if (i == history.length - 1) {
                // If replied is before last message, there is nothing to add
                if (message.replyTo.id !== history[i - 1].id) {
                    const replyText = sliceMessage(
                        message.replyTo.text,
                        symbolLimit,
                    );

                    // Add message user replied to before the last one
                    // for ai to understand context

                    let content: Array<TextPart | ImagePart> = [
                        {
                            type: 'text',
                            text: replyText,
                        },
                    ];

                    if ('photo' in message.replyTo) {
                        let photoContent: ImagePart[] = [];
                        try {
                            photoContent = await getPhotoContent(
                                bot,
                                logger,
                                message.replyTo.photo,
                            );
                        } catch (error) {
                            logger.error(
                                'Could not download file: ',
                                error,
                            );
                        }

                        content = content.concat(photoContent);
                    }

                    prompt.push({
                        role: 'user',
                        content,
                    });
                }
            }

            context += ` (in reply to: ${message.replyTo.sender.name})`;
        }

        context += ':\n' + sliceMessage(message.text, symbolLimit);

        if (message.sender.myself) {
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

        // Download files attached to messages
        if (message.info.photo && (i === history.length - 1 || i === history.length - 2)) {
            let photoContent: ImagePart[] = [];
            try {
                photoContent = await getPhotoContent(
                    bot,
                    logger,
                    message.info.photo,
                );
            } catch (error) {
                logger.error(
                    'Could not download file: ',
                    error,
                );
            }

            content = content.concat(photoContent);
        }

        prompt.push({
            role: 'user',
            content,
        });
    }

    return prompt;
}

async function downloadFile(bot: Bot<SlushaContext>, fileId: string) {
    const filePath = `./tmp/${fileId}`;
    if (await exists(filePath)) {
        return await Deno.readFile(filePath);
    }

    const file = await bot.api.getFile(fileId);

    const downloadUrl =
        `https://api.telegram.org/file/bot${bot.token}/${file.file_path}`;

    const arrayBuffer = await ky.get(downloadUrl).arrayBuffer();
    const buffer = new Uint8Array(arrayBuffer);

    await Deno.writeFile(filePath, buffer);

    return buffer;
}

type ReplyMessage = Exclude<
    Message.CommonMessage['reply_to_message'],
    undefined
>;

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
