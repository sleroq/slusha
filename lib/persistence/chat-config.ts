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
        value: ChatConfigOverride | undefined,
        updatedBy?: number,
    ) {
        if (value === undefined) return await this.setRaw(undefined, updatedBy);
        const parsed = chatConfigOverrideSchema.safeParse(value);
        if (!parsed.success) {
            throw new Error(
                'Invalid chat config override payload: ' + parsed.error.message,
            );
        }
        await this.setRaw(parsed.data, updatedBy);
    }

    async getEffectiveConfig() {
        const base = await getGlobalUserConfig(this.db);
        return mergeWithChatOverride(base, await this.getChatConfigOverride());
    }

    setChatModel(value?: string) {
        return this.updateAi((ai) => {
            if (value === undefined) delete ai.model;
            else ai.model = value;
        });
    }

    setMessagesToPass(value?: number) {
        return this.updateAi((ai) => {
            if (value === undefined) delete ai.messagesToPass;
            else ai.messagesToPass = value;
        });
    }

    async setRandomReplyProbability(value?: number) {
        const next = { ...((await this.getChatConfigOverride()) ?? {}) };
        if (value === undefined) delete next.randomReplyProbability;
        else next.randomReplyProbability = value;
        await this.setRaw(next);
    }

    async setDisableRepliesDueToRights(value: boolean) {
        const next = { ...((await this.getChatConfigOverride()) ?? {}) };
        if (value) next.disableRepliesDueToRights = true;
        else delete next.disableRepliesDueToRights;
        await this.setRaw(next);
    }

    async setDisabledReplyRightsLastProbeAt(value?: number) {
        const next = { ...((await this.getChatConfigOverride()) ?? {}) };
        if (value === undefined) delete next.disabledReplyRightsLastProbeAt;
        else next.disabledReplyRightsLastProbeAt = value;
        await this.setRaw(next);
    }

    private async updateAi(
        mutate: (ai: NonNullable<ChatConfigOverride['ai']>) => void,
    ) {
        const current = (await this.getChatConfigOverride()) ?? {};
        const ai = { ...(current.ai ?? {}) };
        mutate(ai);
        const next: ChatConfigOverride = { ...current };
        if (Object.keys(ai).length === 0) delete next.ai;
        else next.ai = ai;
        await this.setRaw(next);
    }

    private async setRaw(
        value: ChatConfigOverride | undefined,
        updatedBy?: number,
    ) {
        if (!value || this.isEmpty(value)) {
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
        const noAi = !value.ai ||
            Object.values(value.ai).every((item) => item === undefined);
        const rest = Object.entries(value).filter(([key]) => key !== 'ai').map((
            [, item],
        ) => item).every((item) => {
            if (item === undefined) return true;
            if (item && typeof item === 'object' && !Array.isArray(item)) {
                return Object.values(item as Record<string, unknown>).every(
                    (nested) => {
                        if (nested === undefined) return true;
                        if (
                            nested && typeof nested === 'object' &&
                            !Array.isArray(nested)
                        ) {
                            return Object.values(
                                nested as Record<string, unknown>,
                            ).every((deep) => deep === undefined);
                        }
                        return false;
                    },
                );
            }
            return false;
        });
        return noAi && rest;
    }
}
