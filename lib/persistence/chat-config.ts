import { eq } from 'drizzle-orm';
import { z } from 'zod';
import type { DbClient } from '../db/client.ts';
import { configEntries } from '../db/schema.ts';
import { chatScopeKey, getEffectiveUserConfig } from '../config.ts';
import { ConfigEntryRepository, type ConfigTx } from './config-entries.ts';

const chatStateSchema = z.object({
    disableRepliesDueToRights: z.boolean().optional(),
    disabledReplyRightsLastProbeAt: z.number().int().min(0).optional(),
});

type ChatState = z.infer<typeof chatStateSchema>;
export class ChatConfigRepository {
    private scopeKey: string;
    private entries: ConfigEntryRepository;

    constructor(private db: DbClient, private chatId: number) {
        this.scopeKey = chatScopeKey(chatId);
        this.entries = new ConfigEntryRepository(db, this.scopeKey, 'chat');
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
        return this.entries.setValue(key, value, updatedBy);
    }

    resetValue(key: string, updatedBy?: number) {
        return this.entries.resetValue(key, updatedBy);
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
        await this.db.transaction(async (tx: ConfigTx) => {
            for (
                const key of [
                    'state.disableRepliesDueToRights',
                    'state.disabledReplyRightsLastProbeAt',
                ]
            ) {
                if (!expectedKeys.has(key)) {
                    await this.entries.resetRawValueInTx(tx, key, updatedBy);
                }
            }
            for (const [key, entryValue] of entries) {
                await this.entries.setRawValueInTx(
                    tx,
                    `state.${key}`,
                    entryValue,
                    updatedBy,
                );
            }
        });
    }
}
