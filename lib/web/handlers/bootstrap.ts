import { toStoredUserConfig, UserConfig } from '../../config.ts';
import { ALLOWED_REACTIONS } from '../../telegram/reactions.ts';
import {
    buildBootstrapCapabilities,
    getModelOptionsForRole,
    projectGlobalConfigForRole,
} from '../config-policy.ts';
import { jsonResponse } from '../http.ts';
import { RequestContext } from '../request-context.ts';
import { StartWebServerOptions } from '../types.ts';

export function handleBootstrapRequest(
    req: Request,
    _url: URL,
    _options: StartWebServerOptions,
    context: RequestContext,
): Response {
    if (req.method !== 'GET') {
        return new Response('Not found', { status: 404 });
    }

    const { globalConfig, role } = context;

    const canEditGlobal = false;
    const canViewGlobal = role === 'admin';
    const serializedGlobalConfig = JSON.parse(
        JSON.stringify(toStoredUserConfig(globalConfig)),
    ) as UserConfig;
    const globalPayload = projectGlobalConfigForRole(
        serializedGlobalConfig,
        role,
    );
    const capabilities = buildBootstrapCapabilities(role);

    return jsonResponse({
        role: capabilities.role,
        categories: capabilities.categories,
        availableModels: getModelOptionsForRole(globalConfig, role),
        availableReactions: [...ALLOWED_REACTIONS],
        canViewGlobal,
        canEditGlobal,
        availableChats: [],
        globalPayload,
    });
}
