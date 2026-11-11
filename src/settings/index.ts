import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import type { Db } from '../db/client';
import * as schema from '../db/schema';

export type SettingsScope =
    | { scope: 'global' }
    | { scope: 'chat'; chatId: number }
    | { scope: 'user'; userId: number };
export type SettingsOptions = { models: readonly string[]; defaultModel: string; defaultShellEnabled?: boolean };
export type ModelKey = 'ai.model' | 'ai.characterNamesModel';
export type ModelOperation = { key: ModelKey; value: string } | { key: ModelKey; reset: true };
export type ModelValues = { value: string; inheritedValue: string; overridden: boolean };

const names = [
    'слюша', 'шлюша', 'слюща', 'союша', 'слюш', 'slusha', 'слбша',
    'слюшенция', 'слюшка', 'шлюшка', 'слюшенька', 'слюшечка',
    'слюшунчик', 'слюшаня',
];

export function createSettings(db: Db, options: SettingsOptions) {
    const models = [...options.models];
    if (!models.includes(options.defaultModel)) throw new Error('Default model is not available');
    const settingSchema = z.object({
        'ai.model': z.string().refine((model) => models.includes(model), 'Invalid model'),
        'ai.characterNamesModel': z.string().refine((model) => models.includes(model), 'Invalid model'),
        locale: z.string().min(2).max(32),
        hateMode: z.boolean(),
        shellEnabled: z.boolean(),
        randomReplyProbability: z.number().min(0).max(100),
        tendToReplyProbability: z.number().min(0).max(100),
        tendToIgnoreProbability: z.number().min(0).max(100),
        names: z.array(z.string().min(1).max(256)).max(256),
        tendToReply: z.array(z.string().min(1).max(256)).max(256),
    });
    type Values = z.infer<typeof settingSchema>;
    const defaults: Values = {
        'ai.model': options.defaultModel,
        'ai.characterNamesModel': options.defaultModel,
        locale: 'ru',
        hateMode: false,
        shellEnabled: options.defaultShellEnabled ?? true,
        randomReplyProbability: 1,
        tendToReplyProbability: 50,
        tendToIgnoreProbability: 90,
        names,
        tendToReply: ['лучшая девочка', 'лучший бот'],
    };

    function identity(target: SettingsScope) {
        if (target.scope === 'global') return { scope: 'global', scopeId: 'global' };
        if (target.scope === 'chat') return { scope: 'chat', scopeId: String(target.chatId) };
        return { scope: 'user', scopeId: String(target.userId) };
    }

    async function overrides(target: SettingsScope) {
        const id = identity(target);
        const rows = await db.select().from(schema.settings).where(and(
            eq(schema.settings.scope, id.scope), eq(schema.settings.scopeId, id.scopeId),
        ));
        return settingSchema.partial().parse(Object.fromEntries(rows.map((row) => [row.key, row.value])));
    }

    async function read(target: SettingsScope, key: ModelKey = 'ai.model'): Promise<ModelValues> {
        let inheritedValue = options.defaultModel;
        if (target.scope !== 'global') inheritedValue = (await overrides({ scope: 'global' }))[key] ?? inheritedValue;
        const value = (await overrides(target))[key];
        return { value: value ?? inheritedValue, inheritedValue, overridden: value !== undefined };
    }

    async function resolve(chatId: number, userId: number) {
        const [global, chat, user] = await Promise.all([
            overrides({ scope: 'global' }), overrides({ scope: 'chat', chatId }), overrides({ scope: 'user', userId }),
        ]);
        const values = { ...defaults, ...global, ...chat, ...user };
        const chatShell = chat.shellEnabled ?? global.shellEnabled ?? defaults.shellEnabled;
        values.shellEnabled = chatShell && (user.shellEnabled ?? true);
        return { ...values, model: values['ai.model'] };
    }

    async function setOption<K extends keyof Values>(target: SettingsScope, key: K, value: Values[K]) {
        const validated = settingSchema.shape[key].parse(value);
        const id = identity(target);
        await db.insert(schema.settings).values({ ...id, key, value: validated }).onConflictDoUpdate({
            target: [schema.settings.scope, schema.settings.scopeId, schema.settings.key],
            set: { value: validated },
        });
    }

    async function resetOption(target: SettingsScope, key: keyof Values) {
        const id = identity(target);
        await db.delete(schema.settings).where(and(eq(schema.settings.scope, id.scope), eq(schema.settings.scopeId, id.scopeId), eq(schema.settings.key, key)));
    }

    async function apply(target: SettingsScope, operations: readonly ModelOperation[]) {
        const id = identity(target);
        for (const operation of operations) {
            if (operation.key !== 'ai.model' && operation.key !== 'ai.characterNamesModel') throw new Error('Unknown setting');
            if (!('reset' in operation)) settingSchema.shape[operation.key].parse(operation.value);
        }
        await db.transaction(async (tx) => {
            for (const operation of operations) {
                if ('reset' in operation) {
                    await tx.delete(schema.settings).where(and(eq(schema.settings.scope, id.scope), eq(schema.settings.scopeId, id.scopeId), eq(schema.settings.key, operation.key)));
                } else {
                    await tx.insert(schema.settings).values({ ...id, key: operation.key, value: operation.value }).onConflictDoUpdate({
                        target: [schema.settings.scope, schema.settings.scopeId, schema.settings.key],
                        set: { value: operation.value },
                    });
                }
            }
        });
    }

    return {
        models, resolve, read, apply, setOption, resetOption,
        set: (target: SettingsScope, model: string) => apply(target, [{ key: 'ai.model', value: model }]),
        reset: (target: SettingsScope) => apply(target, [{ key: 'ai.model', reset: true }]),
    };
}

export type Settings = ReturnType<typeof createSettings>;
export { createConfigHandler } from './config-handler';
export type { ConfigHandlerOptions, TelegramApi } from './config-handler';
