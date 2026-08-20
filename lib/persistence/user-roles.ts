import { and, eq, gt, isNull, or } from 'drizzle-orm';
import type { DbClient } from '../db/client.ts';
import { userRoleHistory, userRoles } from '../db/schema.ts';

export const GLOBAL_ROLES = [
    'bot_admin',
    'trusted_user',
    'paid_user',
] as const;

export type GlobalRole = typeof GLOBAL_ROLES[number];
type Tx = Parameters<Parameters<DbClient['transaction']>[0]>[0];

export class UserRoleRepository {
    constructor(private db: DbClient) {}

    async getActiveRoles(userId: number): Promise<Set<GlobalRole>> {
        const rows = await this.db.select({ role: userRoles.role })
            .from(userRoles)
            .where(and(
                eq(userRoles.userId, userId),
                or(
                    isNull(userRoles.expiresAt),
                    gt(userRoles.expiresAt, Date.now()),
                ),
            ));
        return new Set(rows.map((row) => row.role));
    }

    async grant(
        userId: number,
        role: GlobalRole,
        changedBy: number,
        expiresAt?: number,
    ) {
        const now = Date.now();
        await this.db.transaction(async (tx: Tx) => {
            await tx.insert(userRoles).values({
                userId,
                role,
                expiresAt,
                grantedBy: changedBy,
                grantedAt: now,
            }).onConflictDoUpdate({
                target: [userRoles.userId, userRoles.role],
                set: { expiresAt, grantedBy: changedBy, grantedAt: now },
            });
            await tx.insert(userRoleHistory).values({
                userId,
                role,
                action: 'grant',
                changedBy,
                changedAt: now,
                expiresAt,
            });
        });
    }

    async revoke(userId: number, role: GlobalRole, changedBy: number) {
        const now = Date.now();
        await this.db.transaction(async (tx: Tx) => {
            const deleted = await tx.delete(userRoles).where(and(
                eq(userRoles.userId, userId),
                eq(userRoles.role, role),
            )).returning({ userId: userRoles.userId });
            if (deleted.length === 0) return;
            await tx.insert(userRoleHistory).values({
                userId,
                role,
                action: 'revoke',
                changedBy,
                changedAt: now,
            });
        });
    }
}
