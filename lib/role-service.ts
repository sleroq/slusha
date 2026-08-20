import type { DbClient } from './db/client.ts';
import {
    type GlobalRole,
    UserRoleRepository,
} from './persistence/user-roles.ts';

export class RolePermissionError extends Error {
    constructor() {
        super('Role assignment access denied');
        this.name = 'RolePermissionError';
    }
}

export class RoleService {
    constructor(
        private db: DbClient,
        private actorId: number,
        private actorRoles: ReadonlySet<GlobalRole>,
    ) {}

    async grant(userId: number, role: GlobalRole, expiresAt?: number) {
        this.assertBotAdmin();
        await new UserRoleRepository(this.db).grant(
            userId,
            role,
            this.actorId,
            expiresAt,
        );
    }

    async revoke(userId: number, role: GlobalRole) {
        this.assertBotAdmin();
        await new UserRoleRepository(this.db).revoke(
            userId,
            role,
            this.actorId,
        );
    }

    private assertBotAdmin() {
        if (!this.actorRoles.has('bot_admin')) {
            throw new RolePermissionError();
        }
    }
}
