import type { AssistantMessage } from '@earendil-works/pi-ai';
import type { Models } from '@earendil-works/pi-ai/models';
import { z } from 'zod';
import type { Budgets } from '../bot/budget';
import type { Settings } from '../settings';
import type { Character } from './index';

const usageSchema = z.object({ input: z.number().int().nonnegative(), output: z.number().int().nonnegative(), cacheRead: z.number().int().nonnegative() });
const responseSchema = z.object({ names: z.array(z.string().trim().min(1).max(256)).min(1).max(40) });

export function createNameGenerator({ models, settings, budgets }: { models: Models; settings: Settings; budgets: Budgets }) {
    return async (character: Character, chatId: number, userId: number) => {
        if (!await budgets.permits(chatId, userId)) throw new Error('Budget exhausted');
        const modelId = (await settings.resolve(chatId, userId))['ai.characterNamesModel'];
        const model = models.getModel('opencode-go', modelId);
        if (!model) throw new Error('Character name model unavailable');
        let result: AssistantMessage;
        try {
            result = await models.stream(model, {
                systemPrompt: 'Generate names used to address this character in Russian and English, including transliterations, diminutives and similar forms. Return only JSON: {"names":["name", ...]}. Return at most 40 names, each at most 256 characters.',
                messages: [{ role: 'user', content: JSON.stringify({ name: character.name, description: character.description }), timestamp: Date.now() }],
            }, { maxTokens: 1000, cacheRetention: 'none' }).result();
        } catch (error) {
            const failure = z.object({ usage: usageSchema }).safeParse(error);
            if (failure.success) await budgets.recordStandalone(chatId, userId, failure.data.usage);
            throw error;
        }
        await budgets.recordStandalone(chatId, userId, usageSchema.parse(result.usage));
        if (result.stopReason !== 'stop') throw new Error(`Character name generation failed: ${result.stopReason}`);
        const text = result.content.filter((block) => block.type === 'text').map((block) => block.text).join('');
        return responseSchema.parse(JSON.parse(text)).names;
    };
}
