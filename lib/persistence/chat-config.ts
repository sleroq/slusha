import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import type { DbClient } from '../db/client.ts';
import { configEntries, configEntryHistory } from '../db/schema.ts';
import {
    chatScopeKey,
    getEffectiveUserConfig,
    validateConfigEntryValue,
} from '../config.ts';

const chatStateSchema = z.object({
    disableRepliesDueToRights: z.boolean().optional(),
    disabledReplyRightsLastProbeAt: z.number().int().min(0).optional(),
});

type ChatState = z.infer<typeof chatStateSchema>;
type Tx = Parameters<Parameters<DbClient['transaction']>[0]>[0];

export class ChatConfigRepository {
    private scopeKey: string;

    constructor(private db: DbClient, private chatId: number) {
        this.scopeKey = chatScopeKey(chatId);
    }

    async getChatState(): Promise<ChatState | undefined> {
        const rows = await this.db.query.configEntries.findMany({
            where: eq(configEntries.scopeKey, this.scopeKey),
        });
        const state: Record<string, unknown> = {};
        for (const row of rows) {
            if (!row.key.startsWith('state.')) continue;
            state[row.key.slice('state.'.length)] = JSON.parse(row.value);
        }
        const parsed = chatStateSchema.safeParse(state);
        if (!parsed.success) {
            throw new Error(
                'Invalid chat state entries',
                { cause: parsed.error },
            );
        }
        return parsed.data;
    }

    getEffectiveConfig() {
        return getEffectiveUserConfig({ chatId: this.chatId }, this.db);
    }

    setValue(key: string, value: unknown, updatedBy?: number) {
        validateConfigEntryValue(key, value);
        return this.setRow(key, value, updatedBy);
    }

    resetValue(key: string, updatedBy?: number) {
        return this.deleteRow(key, updatedBy);
    }

    disableRepliesDueToRights() {
        return this.updateState((state) => {
            state.disableRepliesDueToRights = true;
        });
    }

    clearDisableRepliesDueToRights() {
        return this.updateState((state) => {
            delete state.disableRepliesDueToRights;
        });
    }

    setDisabledReplyRightsLastProbeAt(value: number) {
        return this.updateState((state) => {
            state.disabledReplyRightsLastProbeAt = value;
        });
    }

    clearDisabledReplyRightsLastProbeAt() {
        return this.updateState((state) => {
            delete state.disabledReplyRightsLastProbeAt;
        });
    }

    private async updateState(
        mutate: (state: ChatState) => void,
    ) {
        const next = { ...((await this.getChatState()) ?? {}) };
        mutate(next);
        await this.setStateRaw(next);
    }

    private async setStateRaw(
        value: ChatState,
        updatedBy?: number,
    ) {
        const entries = Object.entries(value) as Array<[
            keyof ChatState,
            unknown,
        ]>;
        const expectedKeys = new Set(entries.map(([key]) => `state.${key}`));
        await this.db.transaction(async (tx: Tx) => {
            for (
                const key of [
                    'state.disableRepliesDueToRights',
                    'state.disabledReplyRightsLastProbeAt',
                ]
            ) {
                if (!expectedKeys.has(key)) {
                    await this.deleteRowInTx(tx, key, updatedBy);
                }
            }
            for (const [key, entryValue] of entries) {
                await this.setRowInTx(
                    tx,
                    `state.${key}`,
                    entryValue,
                    updatedBy,
                );
            }
        });
    }

    private async setRow(key: string, value: unknown, updatedBy?: number) {
        await this.db.transaction(async (tx: Tx) => {
            await this.setRowInTx(tx, key, value, updatedBy);
        });
    }

    private async setRowInTx(
        tx: Tx,
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

    private async deleteRow(key: string, updatedBy?: number) {
        await this.db.transaction(async (tx: Tx) => {
            await this.deleteRowInTx(tx, key, updatedBy);
        });
    }

    private async deleteRowInTx(tx: Tx, key: string, updatedBy?: number) {
        const old = await tx.query.configEntries.findFirst({
            where: and(
                eq(configEntries.scopeKey, this.scopeKey),
                eq(configEntries.key, key),
            ),
        });
        const oldValue = old?.value ?? null;
        if (oldValue === null) return;
        const now = Date.now();
        await tx.delete(configEntries).where(
            and(
                eq(configEntries.scopeKey, this.scopeKey),
                eq(configEntries.key, key),
            ),
        );
        await tx.insert(configEntryHistory).values({
            scopeKey: this.scopeKey,
            key,
            oldValue,
            action: 'reset',
            updatedBy,
            updatedAt: now,
        });
    }
}
