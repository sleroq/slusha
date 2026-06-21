import { eq } from 'drizzle-orm';
import type { DbClient } from '../db/client.ts';
import { chatConfigOverrides } from '../db/schema.ts';
import {
    type ChatConfigOverride,
    chatConfigOverrideSchema,
    getGlobalUserConfig,
    mergeWithChatOverride,
    parseChatOverridePayload,
    serializeChatOverride,
} from '../config.ts';

export class ChatConfigRepository {
    constructor(private db: DbClient, private chatId: number) {}

    async getChatConfigOverride(): Promise<ChatConfigOverride | undefined> {
        const row = await this.db.query.chatConfigOverrides.findFirst({
            where: eq(chatConfigOverrides.chatId, this.chatId),
        });
        return row ? parseChatOverridePayload(row.payload) : undefined;
    }

    async setChatConfigOverride(
        value: ChatConfigOverride,
        updatedBy?: number,
    ) {
        const parsed = chatConfigOverrideSchema.safeParse(value);
        if (!parsed.success) {
            throw new Error(
                'Invalid chat config override payload: ' + parsed.error.message,
            );
        }
        await this.setRaw(parsed.data, updatedBy);
    }

    async clearChatConfigOverride() {
        await this.db.delete(chatConfigOverrides).where(
            eq(chatConfigOverrides.chatId, this.chatId),
        );
    }

    async getEffectiveConfig() {
        const base = await getGlobalUserConfig(this.db);
        return mergeWithChatOverride(base, await this.getChatConfigOverride());
    }

    setChatModel(value: string) {
        return this.updateOverride((override) => {
            const ai = { ...(override.ai ?? {}) };
            ai.model = value;
            override.ai = ai;
        });
    }

    clearChatModel() {
        return this.updateOverride((override) => {
            if (!override.ai) return;
            delete override.ai.model;
            if (Object.keys(override.ai).length === 0) delete override.ai;
        });
    }

    setMessagesToPass(value: number) {
        return this.updateOverride((override) => {
            const ai = { ...(override.ai ?? {}) };
            ai.messagesToPass = value;
            override.ai = ai;
        });
    }

    clearMessagesToPass() {
        return this.updateOverride((override) => {
            if (!override.ai) return;
            delete override.ai.messagesToPass;
            if (Object.keys(override.ai).length === 0) delete override.ai;
        });
    }

    setRandomReplyProbability(value: number) {
        return this.updateOverride((override) => {
            override.randomReplyProbability = value;
        });
    }

    clearRandomReplyProbability() {
        return this.updateOverride((override) => {
            delete override.randomReplyProbability;
        });
    }

    disableRepliesDueToRights() {
        return this.updateOverride((override) => {
            override.disableRepliesDueToRights = true;
        });
    }

    clearDisableRepliesDueToRights() {
        return this.updateOverride((override) => {
            delete override.disableRepliesDueToRights;
        });
    }

    setDisabledReplyRightsLastProbeAt(value: number) {
        return this.updateOverride((override) => {
            override.disabledReplyRightsLastProbeAt = value;
        });
    }

    clearDisabledReplyRightsLastProbeAt() {
        return this.updateOverride((override) => {
            delete override.disabledReplyRightsLastProbeAt;
        });
    }

    private async updateOverride(
        mutate: (override: ChatConfigOverride) => void,
    ) {
        const next = { ...((await this.getChatConfigOverride()) ?? {}) };
        mutate(next);
        await this.setRaw(next);
    }

    private async setRaw(
        value: ChatConfigOverride,
        updatedBy?: number,
    ) {
        if (this.isEmpty(value)) {
            await this.db.delete(chatConfigOverrides).where(
                eq(chatConfigOverrides.chatId, this.chatId),
            );
            return;
        }
        const payload = serializeChatOverride(value);
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

    private isEmpty(value: ChatConfigOverride) {
        // Matches serializeChatOverride: undefined values and empty nested
        // objects collapse, so an "all undefined" override serializes to "{}".
        return JSON.stringify(value) === '{}';
    }
}
