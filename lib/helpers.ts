import { Config } from './config.ts';
import ky from 'ky';
import { Api, RawApi } from 'grammy';
import { Logger } from '@deno-library/logger';
import { supportedTypesMap } from './history.ts';
import { exists } from '@std/fs';
import { Message, PhotoSize, Sticker } from 'grammy_types';
import { GoogleGenAI } from '@google/genai';
import { ImagePart, ModelMessage } from 'ai';
import { BotCharacter } from './memory.ts';
// import { encodeBase64 } from "@std/encoding/base64";

export function getRandomInt(min: number, max: number) {
    min = Math.ceil(min);
    max = Math.floor(max);
    return Math.floor(Math.random() * (max - min) + min); // The maximum is exclusive and the minimum is inclusive
}

export function stickerToText({ emoji }: Sticker): string {
    return emoji ? `[Sticker ${emoji}]` : '[Sticker]';
}

export function sliceMessage(message: string, maxLength: number): string {
    return message.length > maxLength
        ? message.slice(0, maxLength) + '...'
        : message;
}

export function splitMessage(message: string, maxLength = 3000) {
    if (maxLength <= 0) {
        throw new Error('Max length must be positive');
    }

    const parts: string[] = [];
    let currentIndex = 0;

    while (currentIndex < message.length) {
        let endIndex = Math.min(currentIndex + maxLength, message.length);

        // If we're not at the end of the message
        if (endIndex < message.length) {
            // First try to break at a newline for more natural splits
            const lastNewline = message.lastIndexOf('\n', endIndex);

            if (lastNewline > currentIndex) {
                endIndex = lastNewline;
            } else {
                // If no newline found, look for the last space
                const lastSpace = message.lastIndexOf(' ', endIndex);
                if (lastSpace > currentIndex) {
                    endIndex = lastSpace;
                }
                // If no space found, we'll force break at maxLength (default behavior)
            }
        }

        // Extract the part and trim whitespace
        const part = message.slice(currentIndex, endIndex).trim();

        // Only add non-empty parts
        if (part) {
            parts.push(part);
        }

        // Move to next chunk
        currentIndex = endIndex;
        if (
            currentIndex < message.length &&
            (message[currentIndex] === ' ' || message[currentIndex] === '\n')
        ) {
            currentIndex++;
        }
    }

    return parts;
}

const AI_TOKEN = Deno.env.get('AI_TOKEN');

if (!AI_TOKEN) {
    throw new Error('AI_TOKEN is required');
}

const ai = new GoogleGenAI({ apiKey: AI_TOKEN });

async function uploadToGoogle(path: string, _name: string, mimeType: string) {
    const fileData = await Deno.readFile(path);
    const blob = new Blob([fileData], { type: mimeType });

    const uploadResult = await ai.files.upload({
        file: blob,
    });

    let file = uploadResult;
    while (file.state === 'PROCESSING') {
        await new Promise((resolve) => setTimeout(resolve, 100));
        if (uploadResult.name) {
            file = await ai.files.get({ name: uploadResult.name });
        }
    }

    if (file.state === 'FAILED') {
        throw new Error('Audio processing failed.');
    }

    return file.uri || '';
}

export async function downloadFile(
    api: Api<RawApi>,
    token: string,
    fileId: string,
    mimeType: string,
) {
    const filePath = `./tmp/${fileId}`;
    if (await exists(filePath)) {
        // return encodeBase64(await Deno.readFile(filePath))
        return uploadToGoogle(filePath, fileId, mimeType);
    }

    const file = await api.getFile(fileId);

    const downloadUrl =
        `https://api.telegram.org/file/bot${token}/${file.file_path}`;

    const arrayBuffer = await ky.get(downloadUrl).arrayBuffer();
    const buffer = new Uint8Array(arrayBuffer);

    await Deno.writeFile(filePath, buffer);

    // return encodeBase64(buffer);
    return uploadToGoogle(filePath, fileId, mimeType);
}

export async function getImageContent(
    api: Api<RawApi>,
    token: string,
    fileId: string,
    mediaType: string,
): Promise<ImagePart> {
    const file = await downloadFile(api, token, fileId, mediaType);

    return {
        type: 'image',
        image: file,
        mediaType,
    };
}

export function chooseSize(photos: PhotoSize[]): PhotoSize {
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

/**
 * Deletes old files from tmp folder
 * @param logger Logger
 * @param maxAge Max age in hours
 */
export async function deleteOldFiles(logger: Logger, maxAge: number) {
    const files = Deno.readDir('./tmp');

    let deletedCount = 0;
    for await (const file of files) {
        const filePath = `./tmp/${file.name}`;

        const stat = await Deno.stat(filePath);

        const mtime = stat.mtime?.getTime() ?? 0;
        const age = (Date.now() - mtime) / (1000 * 60 * 60);

        if (age > maxAge || stat.mtime === null) {
            try {
                await Deno.remove(filePath);
            } catch (error) {
                logger.warn(`Failed to delete file: ${filePath}`, error);
            }

            deletedCount++;
        }
    }

    logger.info(`Deleted ${deletedCount} files`);
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

export function msgTypeSupported(msg: Message) {
    for (const [type] of supportedTypesMap) {
        if (msg[type] !== undefined) {
            return true;
        }
    }
}

/**
 * Recursively removes object fields with key names ending with specified suffixes
 * @param obj - The object to process
 * @param suffixes - Array of suffixes to match against key names
 * @returns A new object with matching fields removed
 */
export function removeFieldsWithSuffixes<T>(
    obj: T,
    suffixes: string[] = ['id', 'size', 'thumbnail', 'date'],
    // deno-lint-ignore no-explicit-any
): any {
    // Handle null or undefined
    if (obj === null || obj === undefined) {
        return obj;
    }

    // Handle primitive types
    if (typeof obj !== 'object') {
        return obj;
    }

    // Handle arrays
    if (Array.isArray(obj)) {
        return obj.map((item) => removeFieldsWithSuffixes(item, suffixes));
    }

    // Handle objects
    // deno-lint-ignore no-explicit-any
    const result: Record<string, any> = {};

    for (const [key, value] of Object.entries(obj)) {
        // Skip keys ending with any of the specified suffixes
        if (suffixes.some((suffix) => key.endsWith(suffix))) {
            continue;
        }

        // Recursively process nested objects
        result[key] = removeFieldsWithSuffixes(value, suffixes);
    }

    return result;
}

// Helper function to escape special regex characters
function escapeRegExp(s: string) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function prettyDate() {
    const options: Intl.DateTimeFormatOptions = {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        timeZone: 'Europe/Moscow',
    };

    const now = new Date();
    const formattedDate = now.toLocaleDateString('ru-RU', options);
    return formattedDate;
}

// Create a more robust name matching function
export function createNameMatcher(names: Array<string | RegExp>) {
    // Process each name or pattern, handling strings and regular expressions
    const patterns = names.map((nameOrPattern) => {
        if (typeof nameOrPattern === 'string') {
            const escapedName = escapeRegExp(nameOrPattern);
            // Match names that are surrounded by spaces, punctuation, or at start/end of text
            return `(?:^|[\\s.,!?;:'"\\[\\](){}])${escapedName}(?:[\\s.,!?;:'"\\[\\](){}]|$)`;
        }

        // Use the provided RegExp's source directly
        return nameOrPattern.source;
    });

    return new RegExp(patterns.join('|'), 'gmi');
}

export function formatReply(
    m:
        | ModelMessage
        | ({ text: string; reply_to?: string; offset?: number } | {
            react: string;
            reply_to?: string;
            offset?: number;
        })[],
    char?: BotCharacter,
) {
    const charName = char?.name ?? 'Slusha';
    let text = '';

    let content;
    if (!Array.isArray(m)) {
        content = m.content;
    } else {
        content = m;
    }

    if (!('content' in m) || m.role === 'assistant') {
        text += `${charName}:`;

        if (Array.isArray(content)) {
            content = content.map((c) => {
                if ('text' in c) {
                    return {
                        ...c,
                        text: '\n' + c.text,
                    };
                } else {
                    return c;
                }
            });
        }
    }

    if (!Array.isArray(content)) {
        return '\n    ' + content.trim().replace(/\n/g, '\n    ');
    }

    text += content.map((c) => {
        let res = '';

        if (!('type' in c)) {
            if ('text' in c) {
                res = `    ${c.text}`;
            } else if ('react' in c) {
                res = `    [react ${c.react}${
                    c.reply_to ? ' -> ' + c.reply_to : ''
                }${typeof c.offset === 'number' ? ' #' + c.offset : ''}]`;
            } else {
                res = '';
            }
        } else {
            switch (c.type) {
                case 'text':
                    res = c.text;
                    break;
                case 'image':
                    res = `    image: ${c.image}`;
                    break;
                case 'file':
                    res = `    file: ${c.data}`;
                    break;
                default:
                    res = '';
            }
        }

        return res.replace(/\n/g, '\n    ');
    }).join('\n');

    return text;
}
