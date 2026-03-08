import { ModelMessage } from 'ai';
import { ChatMessage } from '../memory.ts';

const HISTORY_META_OPEN = '<slusha_meta>';
const HISTORY_META_CLOSE = '</slusha_meta>';
const historyMetaPrefixRegex =
    /^<slusha_meta>\s*\r?\n([\s\S]*?)\r?\n<\/slusha_meta>/;

export interface TargetRef {
    ref: string;
    messageId: number;
    userId?: number;
    username?: string;
    firstName?: string;
    preview: string;
}

function normalizeUsername(value?: string): string | undefined {
    if (!value) return undefined;
    return value.startsWith('@') ? value : `@${value}`;
}

function sanitizeInline(text: string, maxLength = 90): string {
    const normalized = text.replace(/\s+/g, ' ').trim();
    if (normalized.length <= maxLength) {
        return normalized;
    }

    return `${normalized.slice(0, maxLength)}...`;
}

export function buildTargetRefs(
    history: ChatMessage[],
    maxTargets: number,
): TargetRef[] {
    const candidates = history.filter((message) => !message.isMyself)
        .slice(-maxTargets)
        .reverse();

    return candidates.map((message, index) => {
        const text = message.text ?? '';
        const preview = text.trim().length > 0
            ? sanitizeInline(text)
            : '[non-text message]';

        return {
            ref: `t${index}`,
            messageId: message.id,
            userId: message.info.from?.id,
            username: normalizeUsername(message.info.from?.username),
            firstName: message.info.from?.first_name,
            preview,
        };
    });
}

export function buildTargetRefsPrompt(targets: TargetRef[]): string {
    if (targets.length === 0) {
        return [
            '### Reply Target Map ###',
            '- There are no explicit targets right now.',
            '- If you reply with text without target_ref, default reply goes to the triggering message.',
        ].join('\n');
    }

    const lines = targets.map((target) => {
        const userPart = target.username ?? target.firstName ?? 'unknown user';
        const userIdPart = typeof target.userId === 'number'
            ? `u${target.userId}`
            : 'u?';

        return `- ${target.ref} -> m${target.messageId}, ${userIdPart}, ${userPart}, text: "${target.preview}"`;
    });

    return [
        '### Reply Target Map ###',
        '- Use target_ref to choose who/what to reply or react to.',
        '- target_ref must be one of the refs below.',
        ...lines,
    ].join('\n');
}

export function annotateHistoryWithTargetRefs(
    history: ModelMessage[],
    targets: TargetRef[],
): ModelMessage[] {
    if (targets.length === 0) {
        return history;
    }

    const refByMessageId = new Map(
        targets.map((target) => [target.messageId, target.ref]),
    );

    const annotateText = (text: string): string => {
        const metaMatch = text.match(historyMetaPrefixRegex);
        if (!metaMatch) {
            return text;
        }

        let parsedMeta: Record<string, unknown>;
        try {
            const parsed = JSON.parse(metaMatch[1]);
            if (!parsed || typeof parsed !== 'object') {
                return text;
            }
            parsedMeta = parsed as Record<string, unknown>;
        } catch {
            return text;
        }

        if (parsedMeta.kind !== 'history_message_meta') {
            return text;
        }

        const messageId = parsedMeta.message_id;
        if (typeof messageId !== 'number') {
            return text;
        }

        const targetRef = refByMessageId.get(messageId);
        if (!targetRef || parsedMeta.target_ref === targetRef) {
            return text;
        }

        const nextMeta: Record<string, unknown> = {
            ...parsedMeta,
            target_ref: targetRef,
        };

        const nextMetaBlock = `${HISTORY_META_OPEN}\n${
            JSON.stringify(nextMeta)
        }\n${HISTORY_META_CLOSE}`;
        return `${nextMetaBlock}${text.slice(metaMatch[0].length)}`;
    };

    return history.map((entry) => {
        if (
            entry.role !== 'system' &&
            entry.role !== 'user' &&
            entry.role !== 'assistant'
        ) {
            return entry;
        }

        if (typeof entry.content === 'string') {
            const annotatedContent = annotateText(entry.content);

            if (annotatedContent === entry.content) {
                return entry;
            }

            return {
                ...entry,
                content: annotatedContent,
            };
        }

        if (entry.role === 'system') {
            return entry;
        }

        if (entry.role === 'user') {
            if (!Array.isArray(entry.content)) {
                return entry;
            }

            let hasChanges = false;
            const annotatedParts = entry.content.map((part) => {
                if (part.type !== 'text') {
                    return part;
                }

                const annotatedText = annotateText(part.text);
                if (annotatedText === part.text) {
                    return part;
                }

                hasChanges = true;
                return {
                    ...part,
                    text: annotatedText,
                };
            });

            if (!hasChanges) {
                return entry;
            }

            return {
                ...entry,
                content: annotatedParts,
            };
        }

        if (entry.role === 'assistant') {
            if (!Array.isArray(entry.content)) {
                return entry;
            }

            let hasChanges = false;
            const annotatedParts = entry.content.map((part) => {
                if (part.type !== 'text') {
                    return part;
                }

                const annotatedText = annotateText(part.text);
                if (annotatedText === part.text) {
                    return part;
                }

                hasChanges = true;
                return {
                    ...part,
                    text: annotatedText,
                };
            });

            if (!hasChanges) {
                return entry;
            }

            return {
                ...entry,
                content: annotatedParts,
            };
        }

        return entry;
    });
}
