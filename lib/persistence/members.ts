import { and, desc, eq, gt } from 'drizzle-orm';
import type { User } from 'grammy_types';
import type { DbClient } from '../db/client.ts';
import { chatMembers } from '../db/schema.ts';
import type { Member } from './types.ts';

export class MemberRepository {
    constructor(private db: DbClient, private chatId: number) {}

    async list() {
        const rows = await this.db.select().from(chatMembers)
            .where(eq(chatMembers.chatId, this.chatId))
            .orderBy(desc(chatMembers.lastUse));
        return rows.map((m): Member => ({
            id: m.userId,
            username: m.username ?? undefined,
            first_name: m.firstName,
            description: m.description,
            info: JSON.parse(m.info) as User,
            lastUse: m.lastUse,
        }));
    }

    async updateUser(user: User) {
        const values = {
            chatId: this.chatId,
            userId: user.id,
            username: user.username,
            firstName: user.first_name,
            description: '',
            info: JSON.stringify(user),
            lastUse: Date.now(),
        };
        await this.db.insert(chatMembers).values(values).onConflictDoUpdate({
            target: [chatMembers.chatId, chatMembers.userId],
            set: values,
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
        const rows = await this.db.select().from(chatMembers)
            .where(
                and(
                    eq(chatMembers.chatId, this.chatId),
                    gt(chatMembers.lastUse, cutoff),
                ),
            )
            .orderBy(desc(chatMembers.lastUse))
            .limit(limit);
        return rows.map((m): Member => ({
            id: m.userId,
            username: m.username ?? undefined,
            first_name: m.firstName,
            description: m.description,
            info: JSON.parse(m.info) as User,
            lastUse: m.lastUse,
        }));
    }
}
