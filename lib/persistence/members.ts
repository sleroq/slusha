import { and, desc, eq, gt } from 'drizzle-orm';
import type { User } from 'grammy_types';
import type { DbClient } from '../db/client.ts';
import { chatMembers, telegramUsers } from '../db/schema.ts';
import type { Member } from './types.ts';

export class MemberRepository {
    constructor(private db: DbClient, private chatId: number) {}

    async list() {
        const rows = await this.db.select({
            user: telegramUsers,
            lastUse: chatMembers.lastUse,
        }).from(chatMembers)
            .innerJoin(telegramUsers, eq(chatMembers.userId, telegramUsers.id))
            .where(eq(chatMembers.chatId, this.chatId))
            .orderBy(desc(chatMembers.lastUse));
        return rows.map((row): Member => ({
            id: row.user.id,
            username: row.user.username ?? undefined,
            first_name: row.user.firstName,
            info: JSON.parse(row.user.info) as User,
            lastUse: row.lastUse,
        }));
    }

    async updateUser(user: User) {
        const now = Date.now();
        await this.db.transaction(async (tx) => {
            const profile = {
                id: user.id,
                username: user.username,
                firstName: user.first_name,
                info: JSON.stringify(user),
                lastSeen: now,
            };
            await tx.insert(telegramUsers).values(profile).onConflictDoUpdate({
                target: telegramUsers.id,
                set: profile,
            });
            const membership = {
                chatId: this.chatId,
                userId: user.id,
                lastUse: now,
            };
            await tx.insert(chatMembers).values(membership).onConflictDoUpdate({
                target: [chatMembers.chatId, chatMembers.userId],
                set: { lastUse: now },
            });
        });
    }

    async removeMember(userId: number) {
        await this.db.delete(chatMembers).where(and(
            eq(chatMembers.chatId, this.chatId),
            eq(chatMembers.userId, userId),
        ));
    }

    async getActiveMembers(days = 7, limit = 10) {
        const cutoff = Date.now() - 1000 * 60 * 60 * 24 * days;
        const rows = await this.db.select({
            user: telegramUsers,
            lastUse: chatMembers.lastUse,
        }).from(chatMembers)
            .innerJoin(telegramUsers, eq(chatMembers.userId, telegramUsers.id))
            .where(
                and(
                    eq(chatMembers.chatId, this.chatId),
                    gt(chatMembers.lastUse, cutoff),
                ),
            )
            .orderBy(desc(chatMembers.lastUse))
            .limit(limit);
        return rows.map((row): Member => ({
            id: row.user.id,
            username: row.user.username ?? undefined,
            first_name: row.user.firstName,
            info: JSON.parse(row.user.info) as User,
            lastUse: row.lastUse,
        }));
    }
}
