import logger from '../logger.ts';

function shouldLogMemory(): boolean {
    const value = Deno.env.get('MEMORY_DEBUG');
    if (!value) {
        return false;
    }

    const normalized = value.trim().toLowerCase();
    return normalized !== '' && normalized !== '0' && normalized !== 'false';
}

export function logMemoryUsage(label: string): void {
    if (!shouldLogMemory()) {
        return;
    }

    const usage = Deno.memoryUsage();
    logger.info('Memory snapshot', {
        label,
        rssMb: Math.round((usage.rss / 1024 / 1024) * 10) / 10,
        heapUsedMb: Math.round((usage.heapUsed / 1024 / 1024) * 10) / 10,
        heapTotalMb: Math.round((usage.heapTotal / 1024 / 1024) * 10) / 10,
        externalMb: Math.round((usage.external / 1024 / 1024) * 10) / 10,
    });
}
