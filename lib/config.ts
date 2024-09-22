import { z } from 'https://deno.land/x/zod@v3.23.8/mod.ts';

function isValidRegex(val: unknown): val is RegExp {
    if (typeof val !== 'string') return false;

    try {
        new RegExp(val);
        return true;
    } catch (e) {
        return false;
    }
}

const configSchema = z.object({
    ai: z.object({
        model: z.string(),
        temperature: z.number(),
        topK: z.number(),
        topP: z.number(),
        prompt: z.string(),
        finalPrompt: z.string(),
        notesPrompt: z.string().optional(),
        messagesToPass: z.number().default(5),
        messageMaxLength: z.number().default(2000),
    }),
    startMessage: z.string(),
    names: z.array(z.string(), z.custom(isValidRegex)),
    tendToReply: z.array(z.string(), z.custom(isValidRegex)),
    tendToReplyProbability: z.number().default(50),
    tendToIgnore: z.array(z.string(), z.custom(isValidRegex)),
    tendToIgnoreProbability: z.number().default(90),
    randomReplyProbability: z.number().default(1),
    nepons: z.array(z.string()),
    filesMaxAge: z.number().default(72),
    adminIds: z.array(z.number()).optional(),
});

export type UserConfig = z.infer<typeof configSchema>;

const config = configSchema.merge(z.object({
    botToken: z.string(),
    aiToken: z.string(),
}));

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
