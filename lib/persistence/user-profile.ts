import { and, eq } from 'drizzle-orm';
import type { DbClient } from '../db/client.ts';
import { configEntries } from '../db/schema.ts';

export const personalAboutKey = 'profile.about';

export function personalScopeKey(userId: number): string {
    return `user:${userId}`;
}

export type UserProfile = {
    about?: string;
};

export class UserProfileRepository {
    constructor(private db: DbClient, private userId: number) {}

    async getProfile(): Promise<UserProfile> {
        const entry = await this.db.query.configEntries.findFirst({
            where: and(
                eq(configEntries.scopeKey, personalScopeKey(this.userId)),
                eq(configEntries.key, personalAboutKey),
            ),
        });
        if (!entry) return {};

        const about: unknown = JSON.parse(entry.value);
        if (typeof about !== 'string') return {};
        return { about };
    }
}
