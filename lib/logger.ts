import { Logger } from '@deno-library/logger';

const logger = new Logger();
await logger.initFileLogger('log', { rotate: true });

export default logger;
