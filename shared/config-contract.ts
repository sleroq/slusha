import { z } from 'zod/mini';
import { CONFIG_CONTRACT_VERSION } from './config-contract-version.ts';

const configScopeSchema = z.enum(['personal', 'private', 'group', 'global']);

const matcherSchema = z.union([
    z.string(),
    z.strictObject({
        __regex: z.string(),
        flags: z.optional(z.string()),
    }),
]);

const configValueSchema = z.union([
    z.boolean(),
    z.number(),
    z.string(),
    z.null(),
    z.array(matcherSchema),
    z.array(z.string()),
    z.array(z.record(z.string(), z.string())),
]);

const configFieldBase = {
    key: z.string(),
    overridden: z.boolean(),
    writable: z.boolean(),
    inheritedValue: z.optional(configValueSchema),
};

const configFieldSchema = z.discriminatedUnion('kind', [
    z.strictObject({
        ...configFieldBase,
        kind: z.literal('boolean'),
        optional: z.optional(z.boolean()),
        value: z.union([z.boolean(), z.null()]),
    }),
    z.strictObject({
        ...configFieldBase,
        kind: z.literal('number'),
        min: z.optional(z.number()),
        max: z.optional(z.number()),
        step: z.optional(z.number()),
        optional: z.optional(z.boolean()),
        value: z.union([z.number(), z.null()]),
    }),
    z.strictObject({
        ...configFieldBase,
        kind: z.literal('range'),
        min: z.number(),
        max: z.number(),
        step: z.number(),
        unit: z.optional(z.string()),
        value: z.number(),
    }),
    z.strictObject({
        ...configFieldBase,
        kind: z.literal('text'),
        maxLength: z.optional(z.number()),
        multiline: z.optional(z.boolean()),
        optional: z.optional(z.boolean()),
        value: z.union([z.string(), z.null()]),
    }),
    z.strictObject({
        ...configFieldBase,
        kind: z.literal('select'),
        options: z.array(z.string()),
        optional: z.optional(z.boolean()),
        value: z.union([z.string(), z.null()]),
    }),
    z.strictObject({
        ...configFieldBase,
        kind: z.literal('matcher-list'),
        value: z.array(matcherSchema),
    }),
    z.strictObject({
        ...configFieldBase,
        kind: z.literal('string-list'),
        value: z.array(z.string()),
    }),
    z.strictObject({
        ...configFieldBase,
        kind: z.literal('object-list'),
        keys: z.array(z.string()),
        value: z.array(z.record(z.string(), z.string())),
    }),
]);

export const configResponseSchema = z.strictObject({
    contractVersion: z.literal(CONFIG_CONTRACT_VERSION),
    scope: configScopeSchema,
    chatId: z.optional(z.number()),
    fields: z.array(configFieldSchema),
    scopes: z.array(configScopeSchema),
    chats: z.array(
        z.strictObject({
            id: z.number(),
            title: z.string(),
            type: z.enum(['private', 'group']),
        }),
    ),
    isAdmin: z.boolean(),
});

const setConfigOperationSchema = z.strictObject({
    key: z.string().check(z.minLength(1), z.maxLength(200)),
    value: z.unknown(),
});

const resetConfigOperationSchema = z.strictObject({
    key: z.string().check(z.minLength(1), z.maxLength(200)),
    reset: z.literal(true),
});

export const updateConfigSchema = z.strictObject({
    scope: configScopeSchema,
    chatId: z.optional(z.number().check(z.int())),
    operations: z
        .array(z.union([setConfigOperationSchema, resetConfigOperationSchema]))
        .check(z.minLength(1), z.maxLength(100)),
});

export const apiErrorSchema = z.strictObject({
    contractVersion: z.literal(CONFIG_CONTRACT_VERSION),
    message: z.string(),
    fieldErrors: z.optional(z.record(z.string(), z.string())),
});

export type Matcher = z.infer<typeof matcherSchema>;
export type ConfigScope = z.infer<typeof configScopeSchema>;
export type ConfigChat = z.infer<typeof configResponseSchema>['chats'][number];
export type ConfigValue = z.infer<typeof configValueSchema>;
export type ConfigField = z.infer<typeof configFieldSchema>;
export type ConfigEditor = {
    [Field in ConfigField as Field['kind']]: Omit<
        Field,
        'key' | 'value' | 'overridden' | 'writable' | 'inheritedValue'
    >;
}[ConfigField['kind']];
export type ConfigSelection = Pick<z.infer<typeof configResponseSchema>, 'scope' | 'chatId'>;
export type ConfigResponse = z.infer<typeof configResponseSchema>;
export type ConfigOperation = z.infer<typeof updateConfigSchema>['operations'][number];
export type ApiErrorResponse = z.infer<typeof apiErrorSchema>;
