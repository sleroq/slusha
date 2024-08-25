import Logger from 'https://deno.land/x/logger@v1.1.1/logger.ts';

const logger = new Logger();
await logger.initFileLogger('log', { rotate: true });

export default logger;
