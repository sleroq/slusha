import { getGlobalUserConfig } from '../config.ts';
import { verifyTelegramInitData } from './auth.ts';
import { type ConfigRole, resolveConfigRole } from './permissions.ts';
import { StartWebServerOptions } from './types.ts';

export interface RequestContext {
    userId?: number;
    role: ConfigRole;
    globalConfig: Awaited<ReturnType<typeof getGlobalUserConfig>>;
}

function pickInitData(req: Request): string {
    const custom = req.headers.get('x-telegram-init-data');
    if (custom) return custom;

    const auth = req.headers.get('authorization');
    if (auth?.startsWith('tma ')) {
        return auth.slice(4).trim();
    }

    return '';
}

export async function resolveRequestContext(
    req: Request,
    options: StartWebServerOptions,
): Promise<RequestContext> {
    const initData = pickInitData(req);
    const verified = await verifyTelegramInitData(
        initData,
        options.runtimeConfig.getBotToken(),
    );
    const userId = verified.user?.id;
    const globalConfig = await getGlobalUserConfig(options.memory.db);
    const role = resolveConfigRole(globalConfig, userId);

    return {
        userId,
        role,
        globalConfig,
    };
}
