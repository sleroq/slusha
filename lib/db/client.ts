import logger from '../logger.ts';
import { PrismaClient } from '../../generated/prisma/client.ts';

export type { PrismaClient };

let prismaSingleton: PrismaClient | undefined;

export function getPrismaClient(): PrismaClient {
    if (!prismaSingleton) {
        prismaSingleton = new PrismaClient({});
    }

    return prismaSingleton;
}

export async function disconnectPrisma(): Promise<void> {
    if (!prismaSingleton) {
        return;
    }

    try {
        await prismaSingleton.$disconnect();
    } catch (error) {
        logger.error('Could not disconnect Prisma: ', error);
    } finally {
        prismaSingleton = undefined;
    }
}
