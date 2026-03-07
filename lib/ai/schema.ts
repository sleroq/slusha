import z from 'zod';

export const chatEntrySchema = z.object({
    type: z.literal('reply'),
    text: z.string().optional(),
    target_ref: z.string().regex(/^t\d+$/).optional(),
}).refine((entry) => {
    return typeof entry.text === 'string';
}, {
    message: 'Reply action must include text',
});

const reactionEntrySchema = z.object({
    type: z.literal('react'),
    react: z.string(),
    target_ref: z.string().regex(/^t\d+$/).optional(),
});

export const chatActionSchema = z.union([
    chatEntrySchema,
    reactionEntrySchema,
]);

export const chatResponseSchema = z.array(chatActionSchema);
export const chatActionsToolInputSchema = z.object({
    entries: chatResponseSchema,
});

const legacyChatEntrySchema = z.object({
    text: z.string().optional(),
    react: z.string().optional(),
    reply_to: z.string().optional(),
    offset: z.number().int().min(0).optional(),
}).refine((entry) => {
    const hasText = typeof entry.text === 'string';
    const hasReaction = typeof entry.react === 'string';
    return hasText || hasReaction;
}, {
    message: 'At least one of text or react must be provided',
});

export type ChatEntry = z.infer<typeof chatActionSchema>;
export type TextEntry = z.infer<typeof chatEntrySchema>;
export type ReactEntry = z.infer<typeof reactionEntrySchema>;

export function parseChatEntriesFromUnknown(
    input: unknown,
): ChatEntry[] | null {
    const parsed = chatResponseSchema.safeParse(input);
    if (parsed.success) {
        return parsed.data;
    }

    const normalized = Array.isArray(input) ? input : [input];
    const legacyParsed = z.array(legacyChatEntrySchema).safeParse(normalized);
    if (!legacyParsed.success) {
        return null;
    }

    return legacyParsed.data.map((entry) => {
        if (typeof entry.react === 'string') {
            return {
                type: 'react' as const,
                react: entry.react,
            };
        }

        return {
            type: 'reply' as const,
            text: entry.text ?? '',
        };
    });
}

export const isReactEntry = (e: ChatEntry): e is ReactEntry =>
    e.type === 'react';
export const isTextEntry = (e: ChatEntry): e is TextEntry => e.type === 'reply';
