import { UserConfig } from '../config.ts';

export type ConfigRole = 'regular' | 'trusted' | 'admin';

export function resolveConfigRole(
    config: UserConfig,
    userId?: number,
): ConfigRole {
    if (!userId) return 'regular';
    if (config.adminIds?.includes(userId)) return 'admin';
    if (config.trustedIds?.includes(userId)) return 'trusted';
    return 'regular';
}
