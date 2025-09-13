import { z } from 'zod';

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

/**
 * Resolves API keys from environment variables
 * and configration from slusha.config.js
 * @returns Config
 * @throws Error if required environment variables are not set
 */
export default async function resolveConfig(): Promise<Config> {
    const env = resolveEnv();

    // Dinamically import config
    const config = await import('../slusha.config.js');

    // Check if config is valid with zed
    const parsedConfig = configSchema.safeParse(config.default);
    if (!parsedConfig.success) {
        throw new Error('Invalid config, error: ' + parsedConfig.error.message);
    }

    return {
        ...parsedConfig.data,
        botToken: env.botToken,
        aiToken: env.aiToken,
    };
}
