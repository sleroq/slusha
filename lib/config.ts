import { z } from 'zod';
import defaultConfig from './default-config.ts';
import { createDb } from './db/client.ts';
import { globalConfig } from './db/schema.ts';
import { eq } from 'drizzle-orm';

function isValidRegex(val: unknown): val is RegExp {
    if (val instanceof RegExp) return true;

    return false;
}

const configSchema = z.object({
    ai: z.object({
        model: z.string(),
        notesModel: z.string().optional(),
        memoryModel: z.string().optional(),
        temperature: z.number(),
        topK: z.number(),
        topP: z.number(),
        prePrompt: z.string(),
        prompt: z.string(),
        dumbPrompt: z.string().optional(),
        /**
         * When false, bot will not expect JSON array output and will
         * generate a single plain text message instead. Reactions are disabled.
         */
        useJsonResponses: z.boolean().default(true),
        /**
         * Optional alternative pre-prompt for dumb models that don't output JSON
         */
        dumbPrePrompt: z.string().optional(),
        privateChatPromptAddition: z.string().optional(),
        groupChatPromptAddition: z.string().optional(),
        commentsPromptAddition: z.string().optional(),
        hateModePrompt: z.string().optional(),
        /**
         * Smart-mode final prompt (expects JSON array response)
         */
        finalPrompt: z.string(),
        /**
         * Optional alternative final prompt for dumb models (plain text)
         */
        dumbFinalPrompt: z.string().optional(),
        notesPrompt: z.string(),
        memoryPrompt: z.string(),
        memoryPromptRepeat: z.string(),
        messagesToPass: z.number().default(5),
        notesFrequency: z.number().default(150),
        memoryFrequency: z.number().default(50),
        messageMaxLength: z.number().default(4096),
        /**
         * Whether to include attachments (images, videos, voice, etc.)
         * from user messages when constructing model history
         */
        includeAttachmentsInHistory: z.boolean().default(true),
        bytesLimit: z.number().default(20 * 1024 * 1024),
    }),
    startMessage: z.string(),
    names: z.array(z.union([z.string(), z.custom<RegExp>(isValidRegex)])),
    tendToReply: z.array(z.union([z.string(), z.custom<RegExp>(isValidRegex)])),
    tendToReplyProbability: z.number().default(50),
    tendToIgnore: z.array(
        z.union([z.string(), z.custom<RegExp>(isValidRegex)]),
    ),
    tendToIgnoreProbability: z.number().default(90),
    randomReplyProbability: z.number().default(1),
    nepons: z.array(z.string()),
    filesMaxAge: z.number().default(72),
    adminIds: z.array(z.number()).optional(),
    maxNotesToStore: z.number().default(5),
    maxMessagesToStore: z.number().default(100),
    chatLastUseNotes: z.number().default(3),
    chatLastUseMemory: z.number().default(2),
    responseDelay: z.number().default(1),
});

const chatConfigOverrideSchema = z.object({
    ai: configSchema.shape.ai.partial().optional(),
    startMessage: configSchema.shape.startMessage.optional(),
    names: configSchema.shape.names.optional(),
    tendToReply: configSchema.shape.tendToReply.optional(),
    tendToReplyProbability: configSchema.shape.tendToReplyProbability.optional(),
    tendToIgnore: configSchema.shape.tendToIgnore.optional(),
    tendToIgnoreProbability: configSchema.shape.tendToIgnoreProbability.optional(),
    randomReplyProbability: configSchema.shape.randomReplyProbability.optional(),
    nepons: configSchema.shape.nepons.optional(),
    maxNotesToStore: configSchema.shape.maxNotesToStore.optional(),
    maxMessagesToStore: configSchema.shape.maxMessagesToStore.optional(),
    chatLastUseNotes: configSchema.shape.chatLastUseNotes.optional(),
    chatLastUseMemory: configSchema.shape.chatLastUseMemory.optional(),
    responseDelay: configSchema.shape.responseDelay.optional(),
});

export const safetySettings: Array<{ category: string; threshold: string }> = [
    {
        category: 'HARM_CATEGORY_HARASSMENT',
        threshold: 'BLOCK_NONE',
    },
    {
        category: 'HARM_CATEGORY_HATE_SPEECH',
        threshold: 'BLOCK_NONE',
    },
    {
        category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT',
        threshold: 'BLOCK_NONE',
    },
    {
        category: 'HARM_CATEGORY_DANGEROUS_CONTENT',
        threshold: 'BLOCK_NONE',
    },
];

export type UserConfig = z.infer<typeof configSchema>;
export type ChatConfigOverride = z.infer<typeof chatConfigOverrideSchema>;

const config = configSchema.extend({
    botToken: z.string(),
    aiToken: z.string(),
});

export type Config = z.infer<typeof config>;

type SerializedRegex = {
    __regex: string;
    flags?: string;
};

type SerializedMatcher = string | SerializedRegex;

interface StoredUserConfig extends Omit<UserConfig, 'names' | 'tendToReply' | 'tendToIgnore'> {
    names: SerializedMatcher[];
    tendToReply: SerializedMatcher[];
    tendToIgnore: SerializedMatcher[];
}

interface StoredChatConfigOverride
    extends Omit<ChatConfigOverride, 'names' | 'tendToReply' | 'tendToIgnore'> {
    names?: SerializedMatcher[];
    tendToReply?: SerializedMatcher[];
    tendToIgnore?: SerializedMatcher[];
}

function serializeMatcher(item: string | RegExp): SerializedMatcher {
    if (typeof item === 'string') return item;
    return { __regex: item.source, flags: item.flags };
}

function deserializeMatcher(item: SerializedMatcher): string | RegExp {
    if (typeof item === 'string') return item;
    return new RegExp(item.__regex, item.flags ?? '');
}

function toStoredUserConfig(input: UserConfig): StoredUserConfig {
    return {
        ...input,
        names: input.names.map(serializeMatcher),
        tendToReply: input.tendToReply.map(serializeMatcher),
        tendToIgnore: input.tendToIgnore.map(serializeMatcher),
    };
}

function fromStoredUserConfig(input: StoredUserConfig): UserConfig {
    return {
        ...input,
        names: input.names.map(deserializeMatcher),
        tendToReply: input.tendToReply.map(deserializeMatcher),
        tendToIgnore: input.tendToIgnore.map(deserializeMatcher),
    };
}

function toStoredChatOverride(input: ChatConfigOverride): StoredChatConfigOverride {
    return {
        ...input,
        names: input.names?.map(serializeMatcher),
        tendToReply: input.tendToReply?.map(serializeMatcher),
        tendToIgnore: input.tendToIgnore?.map(serializeMatcher),
    };
}

function fromStoredChatOverride(input: StoredChatConfigOverride): ChatConfigOverride {
    return {
        ...input,
        names: input.names?.map(deserializeMatcher),
        tendToReply: input.tendToReply?.map(deserializeMatcher),
        tendToIgnore: input.tendToIgnore?.map(deserializeMatcher),
    };
}

export function serializeUserConfig(config: UserConfig): string {
    return JSON.stringify(toStoredUserConfig(config));
}

export function parseUserConfigPayload(payload: string): UserConfig {
    const raw = JSON.parse(payload) as StoredUserConfig;
    const parsed = configSchema.safeParse(fromStoredUserConfig(raw));
    if (!parsed.success) {
        throw new Error('Invalid global config in DB: ' + parsed.error.message);
    }
    return parsed.data;
}

export function serializeChatOverride(override: ChatConfigOverride): string {
    return JSON.stringify(toStoredChatOverride(override));
}

export function parseChatOverridePayload(payload: string): ChatConfigOverride {
    const raw = JSON.parse(payload) as StoredChatConfigOverride;
    const parsed = chatConfigOverrideSchema.safeParse(fromStoredChatOverride(raw));
    if (!parsed.success) {
        throw new Error('Invalid chat config override in DB: ' + parsed.error.message);
    }
    return parsed.data;
}

export function mergeWithChatOverride(
    base: UserConfig,
    override?: ChatConfigOverride,
): UserConfig {
    if (!override) return base;

    const merged: UserConfig = {
        ...base,
        ai: {
            ...base.ai,
            ...(override.ai ?? {}),
        },
    };

    const entries = Object.entries(override).filter(([k]) => k !== 'ai') as Array<[
        keyof Omit<ChatConfigOverride, 'ai'>,
        ChatConfigOverride[keyof Omit<ChatConfigOverride, 'ai'>],
    ]>;

    for (const [key, value] of entries) {
        if (value !== undefined) {
            (merged as Record<string, unknown>)[key] = value;
        }
    }

    return merged;
}

function resolveEnv() {
    const botToken = Deno.env.get('BOT_TOKEN');
    if (!botToken) throw new Error('BOT_TOKEN is required');

    const aiToken = Deno.env.get('AI_TOKEN');
    if (!aiToken) throw new Error('AI_TOKEN is required');

    Deno.env.set('GOOGLE_GENERATIVE_AI_API_KEY', aiToken);

    return { botToken, aiToken };
}

/**
 * Resolves API keys from environment variables
 * and configuration from database
 * @returns Config
 * @throws Error if required environment variables are not set
 */
export default async function resolveConfig(): Promise<Config> {
    const env = resolveEnv();
    const { db } = createDb();

    let row = await db.query.globalConfig.findFirst({
        where: eq(globalConfig.id, 1),
    });

    if (!row) {
        const parsedDefaults = configSchema.safeParse(defaultConfig);
        if (!parsedDefaults.success) {
            throw new Error(
                'Invalid built-in default config: ' + parsedDefaults.error.message,
            );
        }

        const now = Date.now();
        await db.insert(globalConfig).values({
            id: 1,
            payload: serializeUserConfig(parsedDefaults.data),
            updatedAt: now,
        });

        row = await db.query.globalConfig.findFirst({
            where: eq(globalConfig.id, 1),
        });
    }

    if (!row) {
        throw new Error('Could not initialize global config');
    }

    const userConfig = parseUserConfigPayload(row.payload);

    return {
        ...userConfig,
        botToken: env.botToken,
        aiToken: env.aiToken,
    };
}
