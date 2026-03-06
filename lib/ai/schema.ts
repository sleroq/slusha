import z from 'zod';

export const chatEntrySchema = z.object({
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

export const chatResponseSchema = z.array(chatEntrySchema);

export type ChatEntry = z.infer<typeof chatEntrySchema>;
export type TextEntry = ChatEntry & { text: string };
export type ReactEntry = ChatEntry & { react: string };

export const isReactEntry = (e: ChatEntry): e is ReactEntry =>
    typeof e.react === 'string';
export const isTextEntry = (e: ChatEntry): e is TextEntry =>
    typeof e.text === 'string';
