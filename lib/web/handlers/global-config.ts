import { parseUserConfigPayload, setGlobalUserConfig } from '../../config.ts';
import { jsonResponse } from '../http.ts';
import { canEditGlobalConfig } from '../permissions.ts';
import { RequestContext } from '../request-context.ts';
import { StartWebServerOptions } from '../types.ts';

export async function handlePutGlobalConfigRequest(
    req: Request,
    options: StartWebServerOptions,
    context: RequestContext,
): Promise<Response> {
    const { globalConfig, userId } = context;
    if (!canEditGlobalConfig(globalConfig, userId)) {
        return jsonResponse({ error: 'Forbidden' }, 403);
    }

    const body = await req.json() as { payload?: unknown };
    if (!body.payload) {
        return jsonResponse({ error: 'Missing payload' }, 400);
    }

    const parsed = parseUserConfigPayload(JSON.stringify(body.payload));
    await setGlobalUserConfig(parsed, userId, options.memory.db);

    return jsonResponse({ ok: true });
}
