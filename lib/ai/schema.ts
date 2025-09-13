import z from 'zod';

export const chatEntrySchema = z.union([
    z.object({
        text: z.string(),
        reply_to: z.string().optional(),
        offset: z.number().int().min(0).optional(),
    }),
    z.object({
        react: z.string(),
        reply_to: z.string().optional(),
        offset: z.number().int().min(0).optional(),
    }),
]);

export const chatResponseSchema = z.array(chatEntrySchema);

export type ChatEntry = z.infer<typeof chatEntrySchema>;
export type TextEntry = Extract<ChatEntry, { text: string }>;
export type ReactEntry = Extract<ChatEntry, { react: string }>;

export const isReactEntry = (e: ChatEntry): e is ReactEntry => 'react' in e;
export const isTextEntry = (e: ChatEntry): e is TextEntry => 'text' in e;
