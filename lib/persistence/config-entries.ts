import { and, eq } from 'drizzle-orm';
import type { ConfigScope } from '../config-access.ts';
import { validateConfigEntryValue } from '../config.ts';
import type { DbClient } from '../db/client.ts';
import { configEntries, configEntryHistory } from '../db/schema.ts';

export type ConfigTx = Parameters<Parameters<DbClient['transaction']>[0]>[0];

export class ConfigEntryRepository {
    constructor(
        private db: DbClient,
        private scopeKey: string,
        private scope: ConfigScope,
    ) {}

    setValue(key: string, value: unknown, updatedBy?: number) {
        validateConfigEntryValue(key, value, this.scope);
        return this.db.transaction((tx: ConfigTx) =>
            this.setRawValueInTx(tx, key, value, updatedBy)
        );
    }

    resetValue(key: string, updatedBy?: number) {
        return this.db.transaction((tx: ConfigTx) =>
            this.resetRawValueInTx(tx, key, updatedBy)
        );
    }

    async setRawValueInTx(
        tx: ConfigTx,
        key: string,
        value: unknown,
        updatedBy?: number,
    ) {
        const old = await tx.query.configEntries.findFirst({
            where: and(
                eq(configEntries.scopeKey, this.scopeKey),
                eq(configEntries.key, key),
            ),
        });
        const oldValue = old?.value ?? null;
        const newValue = JSON.stringify(value);
        const now = Date.now();
        await tx.insert(configEntries).values({
            scopeKey: this.scopeKey,
            key,
            value: newValue,
            updatedBy,
            updatedAt: now,
        }).onConflictDoUpdate({
            target: [configEntries.scopeKey, configEntries.key],
            set: { value: newValue, updatedBy, updatedAt: now },
        });
        await tx.insert(configEntryHistory).values({
            scopeKey: this.scopeKey,
            key,
            oldValue,
            newValue,
            action: 'set',
            updatedBy,
            updatedAt: now,
        });
    }

    async resetRawValueInTx(
        tx: ConfigTx,
        key: string,
        updatedBy?: number,
    ) {
        const old = await tx.query.configEntries.findFirst({
            where: and(
                eq(configEntries.scopeKey, this.scopeKey),
                eq(configEntries.key, key),
            ),
        });
        if (!old) return;
        const now = Date.now();
        await tx.delete(configEntries).where(and(
            eq(configEntries.scopeKey, this.scopeKey),
            eq(configEntries.key, key),
        ));
        await tx.insert(configEntryHistory).values({
            scopeKey: this.scopeKey,
            key,
            oldValue: old.value,
            action: 'reset',
            updatedBy,
            updatedAt: now,
        });
    }
}
