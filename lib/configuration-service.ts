import {
    canAccessConfig,
    type ConfigAccessContext,
    type ConfigKey,
    configOptionPolicies,
    isConfigKey,
} from './config-access.ts';
import {
    chatScopeKey,
    deserializeConfigEntryValue,
    getDefaultUserConfig,
    getEffectiveUserConfig,
    getGlobalUserConfig,
    serializeConfigEntryValue,
    type UserConfig,
    validateConfigEntryValue,
} from './config.ts';
import type { DbClient } from './db/client.ts';
import { ConfigEntryRepository } from './persistence/config-entries.ts';

export class ConfigPermissionError extends Error {
    constructor() {
        super('Configuration access denied');
        this.name = 'ConfigPermissionError';
    }
}

export type ConfigTarget =
    | { scope: 'global' }
    | { scope: 'chat'; chatId: number };

export type ConfigOperation =
    | { key: string; value: unknown; reset?: false }
    | { key: string; reset: true };

export type ConfigEditor =
    | { kind: 'boolean'; optional?: boolean }
    | { kind: 'number'; optional?: boolean }
    | { kind: 'range'; min: number; max: number; step: number; unit?: string }
    | { kind: 'text'; multiline?: boolean; optional?: boolean }
    | { kind: 'select'; options: string[]; optional?: boolean }
    | { kind: 'matcher-list' }
    | { kind: 'string-list' }
    | { kind: 'object-list'; keys: string[] };

const text = { kind: 'text' } as const;
const multiline = { kind: 'text', multiline: true } as const;
const boolean = { kind: 'boolean' } as const;
const probability = {
    kind: 'range',
    min: 0,
    max: 100,
    step: 1,
    unit: '%',
} as const;

const configEditors = {
    'ai.prePrompt': multiline,
    'ai.prompt': multiline,
    'ai.privateChatPromptAddition': { ...multiline, optional: true },
    'ai.groupChatPromptAddition': { ...multiline, optional: true },
    'ai.commentsPromptAddition': { ...multiline, optional: true },
    'ai.hateModePrompt': { ...multiline, optional: true },
    'ai.finalPrompt': multiline,
    'ai.chatActionsToolDescription': { ...multiline, optional: true },
    'ai.google.safetySettings': {
        kind: 'object-list',
        keys: ['category', 'threshold'],
    },
    'availableModels': { kind: 'string-list' },
    'ai.model': text,
    'ai.temperature': { kind: 'range', min: 0, max: 2, step: 0.01 },
    'ai.topK': { kind: 'range', min: 1, max: 200, step: 1 },
    'ai.topP': { kind: 'range', min: 0, max: 1, step: 0.01 },
    'ai.messagesToPass': { kind: 'range', min: 1, max: 100, step: 1 },
    'ai.messageMaxLength': {
        kind: 'range',
        min: 200,
        max: 20000,
        step: 1,
    },
    'ai.includeAttachmentsInHistory': boolean,
    'ai.bytesLimit': {
        kind: 'range',
        min: 1024,
        max: 100 * 1024 * 1024,
        step: 1024,
    },
    'ai.google.structuredOutputs': boolean,
    'ai.openrouter.usageInclude': boolean,
    'ai.generation.chat.thinking.thinkingLevel': {
        kind: 'select',
        options: ['minimal', 'low', 'medium', 'high'],
        optional: true,
    },
    'ai.generation.character.thinking.thinkingLevel': {
        kind: 'select',
        options: ['minimal', 'low', 'medium', 'high'],
        optional: true,
    },
    'startMessage': multiline,
    'names': { kind: 'matcher-list' },
    'tendToReply': { kind: 'matcher-list' },
    'tendToReplyProbability': probability,
    'tendToIgnore': { kind: 'matcher-list' },
    'tendToIgnoreProbability': probability,
    'randomReplyProbability': probability,
    'locale': text,
    'blacklistedReactions': { kind: 'string-list' },
    'nepons': { kind: 'string-list' },
    'filesMaxAge': { kind: 'range', min: 1, max: 720, step: 1, unit: 'h' },
    'maxMessagesToStore': { kind: 'range', min: 1, max: 10000, step: 1 },
    'responseDelay': { kind: 'range', min: 0, max: 120, step: 0.1, unit: 's' },
} satisfies Record<ConfigKey, ConfigEditor>;

function getPath(value: UserConfig, path: string): unknown {
    let current: unknown = value;
    for (const part of path.split('.')) {
        if (typeof current !== 'object' || current === null) return undefined;
        current = (current as Record<string, unknown>)[part];
    }
    return current;
}

export class ConfigurationService {
    constructor(
        private db: DbClient,
        private actorId: number,
        private access: ConfigAccessContext,
    ) {}

    async listReadable(target: ConfigTarget) {
        const [config, inheritedConfig] = await Promise.all([
            target.scope === 'global'
                ? getGlobalUserConfig(this.db)
                : getEffectiveUserConfig({ chatId: target.chatId }, this.db),
            target.scope === 'global'
                ? Promise.resolve(getDefaultUserConfig())
                : getGlobalUserConfig(this.db),
        ]);
        const canReadModels = canAccessConfig(
            'availableModels',
            'global',
            'read',
            this.access,
        );
        return Object.keys(configOptionPolicies)
            .filter(isConfigKey)
            .filter((key) =>
                canAccessConfig(
                    key,
                    target.scope,
                    'read',
                    this.access,
                    target.scope === 'chat' ? target.chatId : undefined,
                )
            )
            .map((key) => {
                let editor: ConfigEditor = configEditors[key];
                if (key === 'ai.model' && canReadModels) {
                    editor = {
                        kind: 'select',
                        options: config.availableModels,
                    };
                }
                return {
                    key,
                    value: serializeConfigEntryValue(key, getPath(config, key)),
                    inheritedValue: serializeConfigEntryValue(
                        key,
                        getPath(inheritedConfig, key),
                    ),
                    ...editor,
                };
            });
    }

    async setValue(target: ConfigTarget, key: string, value: unknown) {
        this.assertAllowed(key, target, 'write');
        const runtimeValue = deserializeConfigEntryValue(key, value);
        if (target.scope === 'global') {
            await new ConfigEntryRepository(this.db, 'global', 'global')
                .setValue(
                    key,
                    runtimeValue,
                    this.actorId,
                );
        } else {
            await new ConfigEntryRepository(
                this.db,
                chatScopeKey(target.chatId),
                'chat',
            ).setValue(
                key,
                runtimeValue,
                this.actorId,
            );
        }
    }

    async resetValue(target: ConfigTarget, key: string) {
        this.assertAllowed(key, target, 'write');
        if (target.scope === 'global') {
            await new ConfigEntryRepository(this.db, 'global', 'global')
                .resetValue(
                    key,
                    this.actorId,
                );
        } else {
            await new ConfigEntryRepository(
                this.db,
                chatScopeKey(target.chatId),
                'chat',
            ).resetValue(
                key,
                this.actorId,
            );
        }
    }

    async applyOperations(
        target: ConfigTarget,
        operations: ConfigOperation[],
    ) {
        const runtimeOperations = operations.map((operation) => {
            this.assertAllowed(operation.key, target, 'write');
            if (operation.reset) {
                return operation;
            }
            const value = deserializeConfigEntryValue(
                operation.key,
                operation.value,
            );
            validateConfigEntryValue(operation.key, value, target.scope);
            return { ...operation, value };
        });

        let scopeKey = 'global';
        if (target.scope === 'chat') {
            scopeKey = chatScopeKey(target.chatId);
        }
        const entries = new ConfigEntryRepository(
            this.db,
            scopeKey,
            target.scope,
        );
        await this.db.transaction(async (tx) => {
            for (const operation of runtimeOperations) {
                if (operation.reset) {
                    await entries.resetRawValueInTx(
                        tx,
                        operation.key,
                        this.actorId,
                    );
                } else {
                    await entries.setRawValueInTx(
                        tx,
                        operation.key,
                        serializeConfigEntryValue(
                            operation.key,
                            operation.value,
                        ),
                        this.actorId,
                    );
                }
            }
        });
    }

    private assertAllowed(
        key: string,
        target: ConfigTarget,
        action: 'read' | 'write',
    ) {
        const chatId = target.scope === 'chat' ? target.chatId : undefined;
        if (!canAccessConfig(key, target.scope, action, this.access, chatId)) {
            throw new ConfigPermissionError();
        }
    }
}
