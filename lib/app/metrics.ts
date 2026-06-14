import { Gauge, Registry } from 'prom-client';

const registry = new Registry();
const processStartedAt = Date.now();

const processUptimeSeconds = new Gauge({
    name: 'slusha_process_uptime_seconds',
    help: 'Process uptime in seconds',
    registers: [registry],
});

const processResidentMemoryBytes = new Gauge({
    name: 'slusha_deno_memory_rss_bytes',
    help: 'Deno resident set size memory in bytes',
    registers: [registry],
});

const processHeapTotalBytes = new Gauge({
    name: 'slusha_deno_memory_heap_total_bytes',
    help: 'Deno V8 heap total memory in bytes',
    registers: [registry],
});

const processHeapUsedBytes = new Gauge({
    name: 'slusha_deno_memory_heap_used_bytes',
    help: 'Deno V8 heap used memory in bytes',
    registers: [registry],
});

const processExternalMemoryBytes = new Gauge({
    name: 'slusha_deno_memory_external_bytes',
    help: 'Deno external memory in bytes',
    registers: [registry],
});

function updateProcessMetrics(): void {
    const memory = Deno.memoryUsage();
    processUptimeSeconds.set((Date.now() - processStartedAt) / 1000);
    processResidentMemoryBytes.set(memory.rss);
    processHeapTotalBytes.set(memory.heapTotal);
    processHeapUsedBytes.set(memory.heapUsed);
    processExternalMemoryBytes.set(memory.external ?? 0);
}

updateProcessMetrics();
setInterval(updateProcessMetrics, 5000);

export async function renderPrometheusMetrics(): Promise<string> {
    updateProcessMetrics();
    return await registry.metrics();
}

export const prometheusContentType = registry.contentType;
