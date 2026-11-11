import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import type { Db } from '../db/client';
import { settings } from '../db/schema';

const promptLimit = 32_000;
export const pageSize = 20;
const characterSchema = z
    .object({
        id: z.number().int().positive(),
        name: z.string().min(1).max(promptLimit),
        description: z.string(),
        personality: z.string(),
        scenario: z.string(),
        systemPrompt: z.string(),
        exampleDialogue: z.string(),
        names: z.array(z.string().trim().min(1).max(256)).min(1).max(40).optional(),
    })
    .refine(
        (character) =>
            [
                character.name,
                character.description,
                character.personality,
                character.scenario,
                character.systemPrompt,
                character.exampleDialogue,
            ].reduce((length, field) => length + field.length, 0) <= promptLimit,
        'Character exceeds prompt length limit',
    );

const searchSchema = z.object({
    data: z.object({
        nodes: z.array(
            z.object({
                id: z.number().int().positive(),
                name: z.string().min(1),
                fullPath: z.string().min(1),
                description: z.string().nullish(),
                avatar_url: z.string().nullish(),
                topics: z.array(z.string()).nullish(),
                starCount: z.number().nullish(),
            }),
        ),
    }),
});
const cardSchema = z.object({
    data: z.object({
        name: z.string().min(1),
        description: z.string().nullish(),
        personality: z.union([z.string(), z.array(z.string())]).nullish(),
        scenario: z.string().nullish(),
        system_prompt: z.string().nullish(),
        mes_example: z.string().nullish(),
    }),
});

export type Character = z.infer<typeof characterSchema>;

export function characterInstructions(character: Character) {
    return [
        `Your character is ${character.name}. In the card, {{char}} refers to you and {{user}} refers to the person talking to you.`,
        character.description,
        character.personality,
        character.scenario,
        character.systemPrompt,
        character.exampleDialogue,
    ]
        .filter(Boolean)
        .join('\n\n');
}

export function createCharacters({
    db,
    generateNames,
    fetch: request = globalThis.fetch,
}: {
    db: Db;
    generateNames: (character: Character, chatId: number, userId: number) => Promise<unknown>;
    fetch?: (url: URL) => Promise<Response>;
}) {
    async function json(url: URL) {
        const response = await request(url);
        if (!response.ok) throw new Error(`Chub request failed: ${response.status}`);
        return response.json();
    }

    function scope(chatId: number) {
        return and(
            eq(settings.scope, 'chat'),
            eq(settings.scopeId, String(chatId)),
            eq(settings.key, 'character'),
        );
    }

    return {
        async search(query: string, page = 1, excludeNsfw = true) {
            const url = new URL('https://gateway.chub.ai/search');
            let excludedTopics = '';
            if (excludeNsfw) excludedTopics = 'nsfw';
            const params = {
                excludetopics: excludedTopics,
                first: String(pageSize),
                page: String(page),
                namespace: 'characters',
                search: query,
                include_forks: 'true',
                nsfw: 'false',
                nsfw_only: 'false',
                require_custom_prompt: 'false',
                require_example_dialogues: 'false',
                require_images: 'false',
                require_expressions: 'false',
                nsfl: 'false',
                asc: 'false',
                min_ai_rating: '0',
                min_tokens: '50',
                max_tokens: '100000',
                chub: 'true',
                require_lore: 'false',
                exclude_mine: 'true',
                require_lore_embedded: 'false',
                require_lore_linked: 'false',
                language: '',
                sort: 'default',
                min_tags: '2',
                topics: '',
                inclusive_or: 'false',
                recommended_verified: 'false',
                require_alternate_greetings: 'false',
                count: 'false',
            };
            url.search = new URLSearchParams(params).toString();

            const result = searchSchema.parse(await json(url));
            return result.data.nodes.map(
                ({ id, name, fullPath, description, avatar_url, topics, starCount }) => ({
                    id,
                    name,
                    path: fullPath,
                    description: description ?? '',
                    avatar: avatar_url ?? '',
                    topics: topics ?? [],
                    stars: starCount ?? 0,
                }),
            );
        },
        async select(chatId: number, id: number, userId: number) {
            z.number().int().positive().parse(id);
            const url = new URL(
                `https://api.chub.ai/api/v4/projects/${id}/repository/files/raw%252Ftavern_raw.json/raw?ref=main&response_type=blob`,
            );
            const { data } = cardSchema.parse(await json(url));
            let personality = data.personality ?? '';
            if (Array.isArray(personality)) personality = personality.join('\n');
            const character = characterSchema.parse({
                id,
                name: data.name,
                description: data.description ?? '',
                personality,
                scenario: data.scenario ?? '',
                systemPrompt: data.system_prompt ?? '',
                exampleDialogue: data.mes_example ?? '',
            });
            character.names = z
                .array(z.string().trim().min(1).max(256))
                .min(1)
                .max(40)
                .parse(await generateNames(character, chatId, userId));
            await db
                .insert(settings)
                .values({
                    scope: 'chat',
                    scopeId: String(chatId),
                    key: 'character',
                    value: character,
                })
                .onConflictDoUpdate({
                    target: [settings.scope, settings.scopeId, settings.key],
                    set: { value: character },
                });
            return character;
        },
        async clear(chatId: number) {
            await db.delete(settings).where(scope(chatId));
        },
        async get(chatId: number) {
            const rows = await db
                .select({ value: settings.value })
                .from(settings)
                .where(scope(chatId));
            if (!rows[0]) return undefined;
            return characterSchema.parse(rows[0].value);
        },
    };
}

export type Characters = ReturnType<typeof createCharacters>;
