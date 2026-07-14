import { and, eq } from 'drizzle-orm';
import type { DbClient } from '../db/client.ts';
import { chatOptOutUsers } from '../db/schema.ts';
import type { OptOutUser } from './types.ts';

export class OptOutRepository {
    constructor(private db: DbClient, private chatId: number) {}

    async list() {
        const rows = await this.db.select().from(chatOptOutUsers)
            .where(eq(chatOptOutUsers.chatId, this.chatId));

        return rows.map((u): OptOutUser => ({
            id: u.userId,
            username: u.username ?? undefined,
            first_name: u.firstName,
        }));
    }

    async addOptOutUser(user: OptOutUser) {
        await this.db.insert(chatOptOutUsers).values({
            chatId: this.chatId,
            userId: user.id,
            username: user.username,
            firstName: user.first_name,
        }).onConflictDoUpdate({
            target: [chatOptOutUsers.chatId, chatOptOutUsers.userId],
            set: { username: user.username, firstName: user.first_name },
        });
    }

    async removeOptOutUser(userId: number) {
        await this.db.delete(chatOptOutUsers).where(and(
            eq(chatOptOutUsers.chatId, this.chatId),
            eq(chatOptOutUsers.userId, userId),
        ));
    }
}
