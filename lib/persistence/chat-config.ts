import { eq } from 'drizzle-orm';
import { z } from 'zod';
import type { DbClient } from '../db/client.ts';
import { chatConfigOverrides } from '../db/schema.ts';
import { getGlobalUserConfig } from '../config.ts';

const chatStateSchema = z.object({
    disableRepliesDueToRights: z.boolean().optional(),
    disabledReplyRightsLastProbeAt: z.number().int().min(0).optional(),
});

type ChatState = z.infer<typeof chatStateSchema>;

export class ChatConfigRepository {
    constructor(private db: DbClient, private chatId: number) {}

    async getChatState(): Promise<ChatState | undefined> {
        const row = await this.db.query.chatConfigOverrides.findFirst({
            where: eq(chatConfigOverrides.chatId, this.chatId),
        });
        if (!row) return undefined;
        const parsed = chatStateSchema.safeParse(JSON.parse(row.payload));
        if (!parsed.success) {
            throw new Error(
                'Invalid chat state payload: ' + parsed.error.message,
            );
        }
        return parsed.data;
    }

    async getEffectiveConfig() {
        return await getGlobalUserConfig(this.db);
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
        await this.setRaw(next);
    }

    private async setRaw(
        value: ChatState,
        updatedBy?: number,
    ) {
        if (this.isEmpty(value)) {
            await this.db.delete(chatConfigOverrides).where(
                eq(chatConfigOverrides.chatId, this.chatId),
            );
            return;
        }
        const payload = JSON.stringify(value);
        await this.db.insert(chatConfigOverrides).values({
            chatId: this.chatId,
            payload,
            updatedBy,
            updatedAt: Date.now(),
        }).onConflictDoUpdate({
            target: [chatConfigOverrides.chatId],
            set: { payload, updatedBy, updatedAt: Date.now() },
        });
    }

    private isEmpty(value: ChatState) {
        return JSON.stringify(value) === '{}';
    }
}
