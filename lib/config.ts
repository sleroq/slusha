import { z } from 'zod';
import defaultConfig from './default-config.ts';
import { DbClient, getDb } from './db/client.ts';
import { configEntries } from './db/schema.ts';
import { eq } from 'drizzle-orm';
import { ALLOWED_REACTIONS } from './telegram/reactions.ts';
import { getConfigOptionPolicy } from './config-access.ts';

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
const googleThinkingConfigSchema = z.object({
    thinkingLevel: thinkingLevelSchema.optional(),
    includeThoughts: z.boolean().optional(),
});
const generationTaskSchema = z.object({
    thinking: googleThinkingConfigSchema.optional(),
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
        temperature: z.number().min(0).max(2),
        topK: z.number().min(1).max(200),
        topP: z.number().min(0).max(1),
        prePrompt: z.string().max(20000),
        prompt: z.string().max(20000),
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
        messagesToPass: boundedPositiveInt(1, 100).default(5),
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
            character: generationTaskSchema.default({}),
        }).default({
            chat: {},
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
    locale: z.string().min(2).max(32).default('ru'),
    blacklistedReactions: z.array(allowedReactionSchema).max(
        ALLOWED_REACTIONS.length,
    ).default([]),
    nepons: z.array(z.string().max(500)).max(256),
    filesMaxAge: boundedPositiveInt(1, 720).default(72),
    availableModels: z.array(z.string().min(1).max(200)).min(1).max(256)
        .default([
            'gemini-3.1-flash-lite-preview',
        ]),
    maxMessagesToStore: boundedPositiveInt(1, 10000).default(100),
    responseDelay: z.number().min(0).max(120).default(0),
});

export type UserConfig = z.infer<typeof configSchema>;

export class ConfigValidationError extends Error {
    constructor(message: string, options?: ErrorOptions) {
        super(message, options);
        this.name = 'ConfigValidationError';
    }
}
const config = configSchema.extend({
    botToken: z.string(),
    aiToken: z.string().optional(),
    openrouterApiKey: z.string().optional(),
    opencodeToken: z.string().optional(),
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

function serializeMatcher(item: string | RegExp): SerializedMatcher {
    if (typeof item === 'string') return item;
    return { __regex: item.source, flags: item.flags };
}

export function serializeConfigEntryValue(
    key: string,
    value: unknown,
): unknown {
    if (
        key === 'names' || key === 'tendToReply' || key === 'tendToIgnore'
    ) {
        if (!Array.isArray(value)) {
            throw new Error(`Invalid matcher config value for ${key}`);
        }
        return value.map((item: unknown) => {
            if (typeof item === 'string' || item instanceof RegExp) {
                return serializeMatcher(item);
            }
            throw new Error(`Invalid matcher config value for ${key}`);
        });
    }
    if (value === undefined) return null;
    return value;
}

function deserializeMatcher(item: SerializedMatcher): string | RegExp {
    if (typeof item === 'string') return item;
    return new RegExp(item.__regex, item.flags ?? '');
}

export function deserializeConfigEntryValue(
    key: string,
    value: unknown,
): unknown {
    if (
        key !== 'names' && key !== 'tendToReply' && key !== 'tendToIgnore'
    ) {
        return value;
    }
    if (!Array.isArray(value)) {
        throw new ConfigValidationError(`Invalid config value for ${key}`);
    }

    try {
        return value.map((item: unknown) => {
            if (typeof item === 'string' || item instanceof RegExp) {
                return item;
            }
            if (
                isPlainObject(item) && typeof item.__regex === 'string' &&
                (item.flags === undefined || typeof item.flags === 'string')
            ) {
                return deserializeMatcher({
                    __regex: item.__regex,
                    flags: item.flags,
                });
            }
            throw new ConfigValidationError(`Invalid config value for ${key}`);
        });
    } catch (error) {
        if (error instanceof ConfigValidationError) throw error;
        throw new ConfigValidationError(
            `Invalid config value for ${key}`,
            { cause: error },
        );
    }
}

export function toStoredUserConfig(input: UserConfig): StoredUserConfig {
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

type PlainObject = Record<string, unknown>;

function isPlainObject(value: unknown): value is PlainObject {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function setPath(target: PlainObject, path: string, value: unknown) {
    const parts = path.split('.');
    let node = target;
    for (const part of parts.slice(0, -1)) {
        const next = node[part];
        if (!isPlainObject(next)) {
            node[part] = {};
        }
        node = node[part] as PlainObject;
    }
    node[parts[parts.length - 1]] = value;
}

function cloneStoredConfig(input: StoredUserConfig): StoredUserConfig {
    return JSON.parse(JSON.stringify(input)) as StoredUserConfig;
}

function mergeStoredRows(
    base: StoredUserConfig,
    rows: Array<{ key: string; value: string }>,
    scope: 'global' | 'chat',
): StoredUserConfig {
    const next = cloneStoredConfig(base);

    for (const row of rows) {
        if (!getConfigOptionPolicy(row.key)?.[scope]) {
            continue;
        }
        setPath(next as unknown as PlainObject, row.key, JSON.parse(row.value));
    }

    return next;
}

export function chatScopeKey(chatId: number) {
    return `chat:${chatId}`;
}

function getStoredDefaults(): StoredUserConfig {
    const parsedDefaults = configSchema.safeParse(defaultConfig);
    if (!parsedDefaults.success) {
        throw new Error(
            'Invalid built-in default config',
            { cause: parsedDefaults.error },
        );
    }
    return toStoredUserConfig(parsedDefaults.data);
}

export function getDefaultUserConfig(): UserConfig {
    return fromStoredUserConfig(getStoredDefaults());
}

export function validateConfigEntryValue(
    key: string,
    value: unknown,
    scope?: 'global' | 'chat',
): void {
    const defaults = getStoredDefaults();
    const policy = getConfigOptionPolicy(key);
    if (!policy || (scope !== undefined && !policy[scope])) {
        throw new ConfigValidationError(`Unsupported config key: ${key}`);
    }

    const next = fromStoredUserConfig(defaults);
    setPath(next as unknown as PlainObject, key, value);
    const parsed = configSchema.safeParse(next);
    if (!parsed.success) {
        throw new ConfigValidationError(
            `Invalid config value for ${key}`,
            { cause: parsed.error },
        );
    }
}

export async function getGlobalUserConfig(
    db: DbClient = getDb(),
): Promise<UserConfig> {
    const defaults = getStoredDefaults();

    const rows = await db.query.configEntries.findMany({
        where: eq(configEntries.scopeKey, 'global'),
    });
    const stored = mergeStoredRows(defaults, rows, 'global');
    const parsed = configSchema.safeParse(fromStoredUserConfig(stored));
    if (!parsed.success) {
        throw new Error(
            'Invalid global config entries in DB',
            { cause: parsed.error },
        );
    }

    return parsed.data;
}

export async function getEffectiveUserConfig(
    options: { chatId?: number } = {},
    db: DbClient = getDb(),
): Promise<UserConfig> {
    const global = await getGlobalUserConfig(db);
    if (options.chatId === undefined) return global;

    const rows = await db.query.configEntries.findMany({
        where: eq(configEntries.scopeKey, chatScopeKey(options.chatId)),
    });
    const stored = mergeStoredRows(toStoredUserConfig(global), rows, 'chat');
    const parsed = configSchema.safeParse(fromStoredUserConfig(stored));
    if (!parsed.success) {
        throw new Error(
            'Invalid effective chat config entries in DB',
            { cause: parsed.error },
        );
    }
    return parsed.data;
}

function resolveEnv() {
    const botToken = Deno.env.get('BOT_TOKEN');
    if (!botToken) throw new Error('BOT_TOKEN is required');

    const aiToken = Deno.env.get('AI_TOKEN');
    const openrouterApiKey = Deno.env.get('OPENROUTER_API_KEY');
    const opencodeToken = Deno.env.get('OPENCODE_TOKEN');

    if (!aiToken && !openrouterApiKey && !opencodeToken) {
        throw new Error(
            'At least one provider token is required: AI_TOKEN, OPENROUTER_API_KEY, or OPENCODE_TOKEN',
        );
    }

    if (aiToken) {
        Deno.env.set('GOOGLE_GENERATIVE_AI_API_KEY', aiToken);
    }

    if (openrouterApiKey) {
        Deno.env.set('OPENROUTER_API_KEY', openrouterApiKey);
    }

    return {
        botToken,
        aiToken,
        openrouterApiKey,
        opencodeToken,
    };
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
        opencodeToken: env.opencodeToken,
    };
}
