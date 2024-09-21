import { z } from 'https://deno.land/x/zod@v3.23.8/mod.ts';

const configSchema = z.object({
    ai: z.object({
        model: z.string().default('gemini-1.5-flash'),
        prompt: z.string().optional(),
        finalPrompt: z.string().optional(),
        notesPrompt: z.string().optional(),
    }),
    startMessage: z.string().default('Привет! Я Слюша, бот-гений.'),
    names: z.array(z.string()),
    tendToReply: z.array(z.string()),
    nepons: z.array(z.string()),
    tendToIgnore: z.array(z.string()),
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

