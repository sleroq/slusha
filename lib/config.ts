import { z } from 'zod';
import defaultConfig from './default-config.ts';
import { DbClient, ensureSqlitePragmas, getDb } from './db/client.ts';
import { globalConfig } from './db/schema.ts';
import { eq } from 'drizzle-orm';
import {
    ALLOWED_REACTIONS,
    normalizeReactionBlacklist,
} from './telegram/reactions.ts';

function isValidRegex(val: unknown): val is RegExp {
    if (val instanceof RegExp) return true;

    return false;
}

const boundedProbability = z.number().min(0).max(100);
const boundedPositiveInt = (min: number, max: number) =>
    z.number().int().min(min).max(max);
const allowedReactionSchema = z.enum(ALLOWED_REACTIONS);
const matcherSchema = z.union([
    z.string().max(256),
    z.custom<RegExp>(isValidRegex),
]);

const thinkingLevelSchema = z.enum(['minimal', 'low', 'medium', 'high']);
const replyMethodSchema = z.enum([
    'json_actions',
    'plain_text_reactions',
]);
const historyVersionSchema = z.enum(['v2', 'v3']);
const googleThinkingConfigSchema = z.object({
    thinkingLevel: thinkingLevelSchema.optional(),
    thinkingBudget: z.number().int().min(0).max(65536).optional(),
    includeThoughts: z.boolean().optional(),
});
const openrouterReasoningSchema = z.object({
    maxTokens: z.number().int().min(0).max(65536).optional(),
});
const generationTaskSchema = z.object({
    thinking: googleThinkingConfigSchema.optional(),
    openrouterReasoning: openrouterReasoningSchema.optional(),
    maxOutputTokens: z.number().int().min(1).max(65536).optional(),
});

const defaultGoogleSafetySettings: Array<
    { category: string; threshold: string }
> = [
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

export const configSchema = z.object({
    ai: z.object({
        model: z.string().min(1).max(200),
        notesModel: z.string().min(1).max(200).optional(),
        memoryModel: z.string().min(1).max(200).optional(),
        temperature: z.number().min(0).max(2),
        topK: z.number().min(1).max(200),
        topP: z.number().min(0).max(1),
        prePrompt: z.string().max(20000),
        prompt: z.string().max(20000),
        dumbPrompt: z.string().max(10000).optional(),
        /**
         * Selects chat reply strategy for message generation and tool usage.
         */
        replyMethod: replyMethodSchema.optional(),
        historyVersion: historyVersionSchema.default('v2'),
        /**
         * Optional alternative pre-prompt for dumb models that don't output JSON
         */
        dumbPrePrompt: z.string().max(10000).optional(),
        privateChatPromptAddition: z.string().max(10000).optional(),
        groupChatPromptAddition: z.string().max(10000).optional(),
        commentsPromptAddition: z.string().max(10000).optional(),
        hateModePrompt: z.string().max(10000).optional(),
        /**
         * Smart-mode final prompt (expects JSON array response)
         */
        finalPrompt: z.string().max(20000),
        /**
         * Optional override for send_chat_actions tool description.
         */
        chatActionsToolDescription: z.string().max(20000).optional(),
        /**
         * Optional override for send_chat_reactions tool description in plain_text_reactions mode.
         */
        chatReactionsToolDescription: z.string().max(20000).optional(),
        /**
         * Optional alternative final prompt for dumb models (plain text)
         */
        dumbFinalPrompt: z.string().max(10000).optional(),
        notesPrompt: z.string().max(20000),
        memoryPrompt: z.string().max(20000),
        memoryPromptRepeat: z.string().max(20000),
        messagesToPass: boundedPositiveInt(1, 100).default(5),
        notesFrequency: boundedPositiveInt(1, 5000).default(150),
        memoryFrequency: boundedPositiveInt(1, 5000).default(50),
        messageMaxLength: boundedPositiveInt(200, 20000).default(4096),
        /**
         * Whether to include attachments (images, videos, voice, etc.)
         * from user messages when constructing model history
         */
        includeAttachmentsInHistory: z.boolean().default(true),
        bytesLimit: boundedPositiveInt(1024, 100 * 1024 * 1024).default(
            20 * 1024 * 1024,
        ),
        google: z.object({
            safetySettings: z.array(
                z.object({
                    category: z.string().min(1).max(120),
                    threshold: z.string().min(1).max(120),
                }),
            ).max(32).default(defaultGoogleSafetySettings),
            structuredOutputs: z.boolean().default(true),
        }).default({
            safetySettings: defaultGoogleSafetySettings,
            structuredOutputs: true,
        }),
        openrouter: z.object({
            usageInclude: z.boolean().default(false),
        }).default({
            usageInclude: false,
        }),
        generation: z.object({
            chat: generationTaskSchema.default({}),
            notes: generationTaskSchema.default({}),
            memory: generationTaskSchema.default({}),
            character: generationTaskSchema.default({}),
        }).default({
            chat: {},
            notes: {},
            memory: {},
            character: {},
        }),
    }),
    startMessage: z.string().max(2000),
    names: z.array(matcherSchema).max(256),
    tendToReply: z.array(matcherSchema).max(256),
    tendToReplyProbability: boundedProbability.default(50),
    tendToIgnore: z.array(matcherSchema).max(256),
    tendToIgnoreProbability: boundedProbability.default(90),
    randomReplyProbability: boundedProbability.default(1),
    blacklistedReactions: z.array(allowedReactionSchema).max(
        ALLOWED_REACTIONS.length,
    ).default([]),
    nepons: z.array(z.string().max(500)).max(256),
    filesMaxAge: boundedPositiveInt(1, 720).default(72),
    adminIds: z.array(z.number().int()).max(256).optional(),
    trustedIds: z.array(z.number().int()).max(10000).default([]),
    availableModels: z.array(z.string().min(1).max(200)).min(1).max(256)
        .default([
            'gemini-3.1-flash-lite-preview',
        ]),
    maxNotesToStore: boundedPositiveInt(1, 200).default(5),
    maxMessagesToStore: boundedPositiveInt(1, 10000).default(100),
    chatLastUseNotes: boundedPositiveInt(1, 100).default(3),
    chatLastUseMemory: boundedPositiveInt(1, 100).default(2),
    responseDelay: z.number().min(0).max(120).default(1),
});

const chatOverrideAiSchema = z.object({
    model: configSchema.shape.ai.shape.model.optional(),
    temperature: configSchema.shape.ai.shape.temperature.optional(),
    topK: configSchema.shape.ai.shape.topK.optional(),
    topP: configSchema.shape.ai.shape.topP.optional(),
    prompt: configSchema.shape.ai.shape.prompt.optional(),
    dumbPrompt: configSchema.shape.ai.shape.dumbPrompt.optional(),
    privateChatPromptAddition: configSchema.shape.ai.shape
        .privateChatPromptAddition.optional(),
    groupChatPromptAddition: configSchema.shape.ai.shape.groupChatPromptAddition
        .optional(),
    commentsPromptAddition: configSchema.shape.ai.shape.commentsPromptAddition
        .optional(),
    hateModePrompt: configSchema.shape.ai.shape.hateModePrompt.optional(),
    replyMethod: configSchema.shape.ai.shape.replyMethod.optional(),
    historyVersion: configSchema.shape.ai.shape.historyVersion.optional(),
    messagesToPass: configSchema.shape.ai.shape.messagesToPass.optional(),
    messageMaxLength: configSchema.shape.ai.shape.messageMaxLength.optional(),
    includeAttachmentsInHistory: configSchema.shape.ai.shape
        .includeAttachmentsInHistory.optional(),
    bytesLimit: configSchema.shape.ai.shape.bytesLimit.optional(),
});

export const chatConfigOverrideSchema = z.object({
    ai: chatOverrideAiSchema.optional(),
    names: configSchema.shape.names.optional(),
    tendToReply: configSchema.shape.tendToReply.optional(),
    tendToReplyProbability: configSchema.shape.tendToReplyProbability
        .optional(),
    tendToIgnore: configSchema.shape.tendToIgnore.optional(),
    tendToIgnoreProbability: configSchema.shape.tendToIgnoreProbability
        .optional(),
    randomReplyProbability: configSchema.shape.randomReplyProbability
        .optional(),
    blacklistedReactions: configSchema.shape.blacklistedReactions.optional(),
    nepons: configSchema.shape.nepons.optional(),
    responseDelay: configSchema.shape.responseDelay.optional(),
    disableRepliesDueToRights: z.boolean().optional(),
    disabledReplyRightsLastProbeAt: z.number().int().min(0).optional(),
});

export const safetySettings: Array<{ category: string; threshold: string }> = [
    ...defaultGoogleSafetySettings,
];

export type UserConfig = z.infer<typeof configSchema>;
export type ChatConfigOverride = z.infer<typeof chatConfigOverrideSchema>;

const config = configSchema.extend({
    botToken: z.string(),
    aiToken: z.string().optional(),
    openrouterApiKey: z.string().optional(),
});

export type Config = z.infer<typeof config>;

type SerializedRegex = {
    __regex: string;
    flags?: string;
};

type SerializedMatcher = string | SerializedRegex;

interface StoredUserConfig
    extends Omit<UserConfig, 'names' | 'tendToReply' | 'tendToIgnore'> {
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

function toStoredChatOverride(
    input: ChatConfigOverride,
): StoredChatConfigOverride {
    return {
        ...input,
        names: input.names?.map(serializeMatcher),
        tendToReply: input.tendToReply?.map(serializeMatcher),
        tendToIgnore: input.tendToIgnore?.map(serializeMatcher),
    };
}

function fromStoredChatOverride(
    input: StoredChatConfigOverride,
): ChatConfigOverride {
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
    const parsed = chatConfigOverrideSchema.safeParse(
        fromStoredChatOverride(raw),
    );
    if (!parsed.success) {
        throw new Error(
            'Invalid chat config override in DB: ' + parsed.error.message,
        );
    }
    return parsed.data;
}

export async function getGlobalUserConfig(
    db: DbClient = getDb(),
): Promise<UserConfig> {
    await ensureSqlitePragmas();

    let row = await db.query.globalConfig.findFirst({
        where: eq(globalConfig.id, 1),
    });

    if (!row) {
        const parsedDefaults = configSchema.safeParse(defaultConfig);
        if (!parsedDefaults.success) {
            throw new Error(
                'Invalid built-in default config: ' +
                    parsedDefaults.error.message,
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

    return parseUserConfigPayload(row.payload);
}

export async function setGlobalUserConfig(
    value: UserConfig,
    updatedBy?: number,
    db: DbClient = getDb(),
): Promise<UserConfig> {
    await ensureSqlitePragmas();

    const parsed = configSchema.safeParse(value);
    if (!parsed.success) {
        throw new Error(
            'Invalid global config payload: ' + parsed.error.message,
        );
    }

    const normalizedModels = Array.from(
        new Set(parsed.data.availableModels.map((m) => m.trim())),
    )
        .filter((m) => m.length > 0);
    if (normalizedModels.length === 0) {
        throw new Error('availableModels must contain at least one model');
    }

    const modelsToCheck = [
        parsed.data.ai.model,
        parsed.data.ai.notesModel,
        parsed.data.ai.memoryModel,
    ].filter((item): item is string =>
        typeof item === 'string' && item.length > 0
    );

    for (const model of modelsToCheck) {
        if (!normalizedModels.includes(model)) {
            throw new Error(
                `Model "${model}" is not listed in availableModels`,
            );
        }
    }

    const nextValue: UserConfig = {
        ...parsed.data,
        availableModels: normalizedModels,
        blacklistedReactions: normalizeReactionBlacklist(
            parsed.data.blacklistedReactions,
        ),
    };

    const now = Date.now();

    await db
        .insert(globalConfig)
        .values({
            id: 1,
            payload: serializeUserConfig(nextValue),
            updatedBy,
            updatedAt: now,
        })
        .onConflictDoUpdate({
            target: [globalConfig.id],
            set: {
                payload: serializeUserConfig(nextValue),
                updatedBy,
                updatedAt: now,
            },
        });

    return nextValue;
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

    const entries = Object.entries(override).filter(([k]) =>
        k !== 'ai'
    ) as Array<[
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
    const openrouterApiKey = Deno.env.get('OPENROUTER_API_KEY');

    if (!aiToken && !openrouterApiKey) {
        throw new Error(
            'At least one provider token is required: AI_TOKEN or OPENROUTER_API_KEY',
        );
    }

    if (aiToken) {
        Deno.env.set('GOOGLE_GENERATIVE_AI_API_KEY', aiToken);
    }

    if (openrouterApiKey) {
        Deno.env.set('OPENROUTER_API_KEY', openrouterApiKey);
    }

    return { botToken, aiToken, openrouterApiKey };
}

/**
 * Resolves API keys from environment variables
 * and configuration from database
 * @returns Config
 * @throws Error if required environment variables are not set
 */
export default async function resolveConfig(db?: DbClient): Promise<Config> {
    const env = resolveEnv();
    const userConfig = await getGlobalUserConfig(db);

    return {
        ...userConfig,
        botToken: env.botToken,
        aiToken: env.aiToken,
        openrouterApiKey: env.openrouterApiKey,
    };
}
