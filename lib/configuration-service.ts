import {
    canAccessConfig,
    type ConfigAccessContext,
    configOptionPolicies,
} from './config-access.ts';
import {
    getEffectiveUserConfig,
    getGlobalUserConfig,
    type UserConfig,
} from './config.ts';
import type { DbClient } from './db/client.ts';
import { ChatConfigRepository } from './persistence/chat-config.ts';
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
        const config = target.scope === 'global'
            ? await getGlobalUserConfig(this.db)
            : await getEffectiveUserConfig({ chatId: target.chatId }, this.db);
        return Object.keys(configOptionPolicies)
            .filter((key) =>
                canAccessConfig(
                    key,
                    target.scope,
                    'read',
                    this.access,
                    target.scope === 'chat' ? target.chatId : undefined,
                )
            )
            .map((key) => ({ key, value: getPath(config, key) }));
    }

    async setValue(target: ConfigTarget, key: string, value: unknown) {
        this.assertAllowed(key, target, 'write');
        if (target.scope === 'global') {
            await new ConfigEntryRepository(this.db, 'global', 'global')
                .setValue(
                    key,
                    value,
                    this.actorId,
                );
        } else {
            await new ChatConfigRepository(this.db, target.chatId).setValue(
                key,
                value,
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
            await new ChatConfigRepository(this.db, target.chatId).resetValue(
                key,
                this.actorId,
            );
        }
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
