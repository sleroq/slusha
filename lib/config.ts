import { z } from 'zod';

function isValidRegex(val: unknown): val is RegExp {
    if (val instanceof RegExp) return true;

    return false;
}

function envHas(key: string): boolean {
    return Deno.env.get(key) !== undefined;
}

function parseNumber(val: string | undefined): number | undefined {
    if (val === undefined) return undefined;
    const num = Number(val);
    return Number.isNaN(num) ? undefined : num;
}

function parseCsv(val: string): string[] {
    return val.split(',').map((s) => s.trim());
}

function parseRegexFromString(input: string): RegExp | null {
    const regexMatch = input.match(/^\/(.*)\/(.*)$/);
    if (regexMatch) {
        try {
            return new RegExp(regexMatch[1], regexMatch[2]);
        } catch {
            return null;
        }
    }
    return null;
}

function parseStringOrRegexItems(val: string): Array<string | RegExp> {
    return parseCsv(val).filter((s) => s.length > 0).map((item) => {
        const maybeRegex = parseRegexFromString(item);
        return maybeRegex ?? item;
    });
}

function parseNumberArray(val: string): number[] {
    return parseCsv(val)
        .filter((s) => s.length > 0)
        .map((s) => Number(s))
        .filter((n) => !Number.isNaN(n));
}

function deepMerge<T extends Record<string, unknown>>(base: Partial<T>, override: Partial<T>): T {
    const result: Record<string, unknown> = { ...(base as Record<string, unknown>) };
    for (const [key, value] of Object.entries(override)) {
        if (
            value !== null &&
            typeof value === 'object' &&
            !Array.isArray(value) &&
            typeof result[key] === 'object' &&
            result[key] !== null &&
            !Array.isArray(result[key])
        ) {
            result[key] = deepMerge(result[key] as Record<string, unknown>, value as Record<string, unknown>);
        } else {
            result[key] = value as unknown;
        }
    }
    return result as T;
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
        privateChatPromptAddition: z.string().optional(),
        groupChatPromptAddition: z.string().optional(),
        commentsPromptAddition: z.string().optional(),
        hateModePrompt: z.string().optional(),
        finalPrompt: z.string(),
        notesPrompt: z.string(),
        memoryPrompt: z.string(),
        memoryPromptRepeat: z.string(),
        messagesToPass: z.number().default(5),
        notesFrequency: z.number().default(150),
        memoryFrequency: z.number().default(50),
        messageMaxLength: z.number().default(4096),
        bytesLimit: z.number().default(20 * 1024 * 1024),
    }),
    startMessage: z.string(),
    names: z.array(z.union([z.string(), z.custom<RegExp>(isValidRegex)])),
    tendToReply: z.array(z.union([z.string(), z.custom<RegExp>(isValidRegex)])),
    tendToReplyProbability: z.number().default(50),
    tendToIgnore: z.array(z.union([z.string(), z.custom<RegExp>(isValidRegex)])),
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

const config = configSchema.extend({
    botToken: z.string(),
    aiToken: z.string(),
});

export type Config = z.infer<typeof config>;

function resolveEnv() {
    const botToken = Deno.env.get('BOT_TOKEN');
    if (!botToken) throw new Error('BOT_TOKEN is required');

    const aiToken = Deno.env.get('AI_TOKEN');
    if (!aiToken) throw new Error('AI_TOKEN is required');

    Deno.env.set('GOOGLE_GENERATIVE_AI_API_KEY', aiToken);

    return { botToken, aiToken };
}

function resolveEnvOverrides(): Partial<UserConfig> {
    const overrides: Partial<UserConfig> = {};

    const ai: Partial<UserConfig['ai']> = {};
    if (envHas('AI_MODEL')) ai.model = Deno.env.get('AI_MODEL') as string;
    if (envHas('AI_NOTES_MODEL')) ai.notesModel = Deno.env.get('AI_NOTES_MODEL') as string;
    if (envHas('AI_MEMORY_MODEL')) ai.memoryModel = Deno.env.get('AI_MEMORY_MODEL') as string;
    if (envHas('AI_TEMPERATURE')) ai.temperature = parseNumber(Deno.env.get('AI_TEMPERATURE')!) as number;
    if (envHas('AI_TOP_K')) ai.topK = parseNumber(Deno.env.get('AI_TOP_K')!) as number;
    if (envHas('AI_TOP_P')) ai.topP = parseNumber(Deno.env.get('AI_TOP_P')!) as number;
    if (envHas('AI_PRE_PROMPT')) ai.prePrompt = Deno.env.get('AI_PRE_PROMPT') as string;
    if (envHas('AI_PROMPT')) ai.prompt = Deno.env.get('AI_PROMPT') as string;
    if (envHas('AI_PRIVATE_CHAT_PROMPT_ADDITION')) ai.privateChatPromptAddition = Deno.env.get('AI_PRIVATE_CHAT_PROMPT_ADDITION') as string;
    if (envHas('AI_GROUP_CHAT_PROMPT_ADDITION')) ai.groupChatPromptAddition = Deno.env.get('AI_GROUP_CHAT_PROMPT_ADDITION') as string;
    if (envHas('AI_COMMENTS_PROMPT_ADDITION')) ai.commentsPromptAddition = Deno.env.get('AI_COMMENTS_PROMPT_ADDITION') as string;
    if (envHas('AI_HATE_MODE_PROMPT')) ai.hateModePrompt = Deno.env.get('AI_HATE_MODE_PROMPT') as string;
    if (envHas('AI_FINAL_PROMPT')) ai.finalPrompt = Deno.env.get('AI_FINAL_PROMPT') as string;
    if (envHas('AI_NOTES_PROMPT')) ai.notesPrompt = Deno.env.get('AI_NOTES_PROMPT') as string;
    if (envHas('AI_MEMORY_PROMPT')) ai.memoryPrompt = Deno.env.get('AI_MEMORY_PROMPT') as string;
    if (envHas('AI_MEMORY_PROMPT_REPEAT')) ai.memoryPromptRepeat = Deno.env.get('AI_MEMORY_PROMPT_REPEAT') as string;
    if (envHas('AI_MESSAGES_TO_PASS')) ai.messagesToPass = parseNumber(Deno.env.get('AI_MESSAGES_TO_PASS')!) as number;
    if (envHas('AI_NOTES_FREQUENCY')) ai.notesFrequency = parseNumber(Deno.env.get('AI_NOTES_FREQUENCY')!) as number;
    if (envHas('AI_MEMORY_FREQUENCY')) ai.memoryFrequency = parseNumber(Deno.env.get('AI_MEMORY_FREQUENCY')!) as number;
    if (envHas('AI_MESSAGE_MAX_LENGTH')) ai.messageMaxLength = parseNumber(Deno.env.get('AI_MESSAGE_MAX_LENGTH')!) as number;
    if (envHas('AI_BYTES_LIMIT')) ai.bytesLimit = parseNumber(Deno.env.get('AI_BYTES_LIMIT')!) as number;
    if (Object.keys(ai).length > 0) overrides.ai = ai as UserConfig['ai'];

    if (envHas('START_MESSAGE')) overrides.startMessage = Deno.env.get('START_MESSAGE') as string;
    if (envHas('NAMES')) overrides.names = parseStringOrRegexItems(Deno.env.get('NAMES') as string);
    if (envHas('TEND_TO_REPLY')) overrides.tendToReply = parseStringOrRegexItems(Deno.env.get('TEND_TO_REPLY') as string);
    if (envHas('TEND_TO_REPLY_PROBABILITY')) overrides.tendToReplyProbability = parseNumber(Deno.env.get('TEND_TO_REPLY_PROBABILITY')!) as number;
    if (envHas('TEND_TO_IGNORE')) overrides.tendToIgnore = parseStringOrRegexItems(Deno.env.get('TEND_TO_IGNORE') as string);
    if (envHas('TEND_TO_IGNORE_PROBABILITY')) overrides.tendToIgnoreProbability = parseNumber(Deno.env.get('TEND_TO_IGNORE_PROBABILITY')!) as number;
    if (envHas('RANDOM_REPLY_PROBABILITY')) overrides.randomReplyProbability = parseNumber(Deno.env.get('RANDOM_REPLY_PROBABILITY')!) as number;
    if (envHas('NEPONS')) overrides.nepons = parseCsv(Deno.env.get('NEPONS') as string).filter((s) => s.length > 0);
    if (envHas('FILES_MAX_AGE')) overrides.filesMaxAge = parseNumber(Deno.env.get('FILES_MAX_AGE')!) as number;
    if (envHas('ADMIN_IDS')) overrides.adminIds = parseNumberArray(Deno.env.get('ADMIN_IDS') as string);
    if (envHas('MAX_NOTES_TO_STORE')) overrides.maxNotesToStore = parseNumber(Deno.env.get('MAX_NOTES_TO_STORE')!) as number;
    if (envHas('MAX_MESSAGES_TO_STORE')) overrides.maxMessagesToStore = parseNumber(Deno.env.get('MAX_MESSAGES_TO_STORE')!) as number;
    if (envHas('CHAT_LAST_USE_NOTES')) overrides.chatLastUseNotes = parseNumber(Deno.env.get('CHAT_LAST_USE_NOTES')!) as number;
    if (envHas('CHAT_LAST_USE_MEMORY')) overrides.chatLastUseMemory = parseNumber(Deno.env.get('CHAT_LAST_USE_MEMORY')!) as number;
    if (envHas('RESPONSE_DELAY')) overrides.responseDelay = parseNumber(Deno.env.get('RESPONSE_DELAY')!) as number;

    return overrides;
}

/**
 * Resolves API keys from environment variables
 * and configration from slusha.config.js
 * @returns Config
 * @throws Error if required environment variables are not set
 */
export default async function resolveConfig(): Promise<Config> {
    const env = resolveEnv();

    let fileConfig: Partial<UserConfig> = {};
    try {
        const imported = await import('../slusha.config.js');
        fileConfig = (imported?.default ?? {}) as Partial<UserConfig>;
    } catch {
        fileConfig = {};
    }

    const envOverrides = resolveEnvOverrides();
    const merged = deepMerge<UserConfig>(fileConfig as Partial<UserConfig>, envOverrides as Partial<UserConfig>);

    const validated = configSchema.parse(merged);

    return {
        ...validated,
        botToken: env.botToken,
        aiToken: env.aiToken,
    };
}
