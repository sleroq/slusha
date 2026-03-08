import { parseChatOverridePayload } from '../../config.ts';
import { ChatMemory } from '../../memory.ts';
import { sanitizeChatOverrideForRole } from '../config-policy.ts';
import { jsonResponse } from '../http.ts';
import { canEditChatConfig } from '../permissions.ts';
import { RequestContext } from '../request-context.ts';
import { StartWebServerOptions } from '../types.ts';

export async function handlePutChatConfigRequest(
    req: Request,
    options: StartWebServerOptions,
    context: RequestContext,
    chatId: number,
): Promise<Response> {
    const { globalConfig, role, userId } = context;
    const allowed = await canEditChatConfig(
        options.bot,
        globalConfig,
        chatId,
        userId,
    );
    if (!allowed) {
        return jsonResponse({ error: 'Forbidden' }, 403);
    }

    const body = await req.json() as { payload?: unknown };
    if (!body.payload) {
        return jsonResponse({ error: 'Missing payload' }, 400);
    }

    const parsedOverride = parseChatOverridePayload(JSON.stringify(body.payload));
    const sanitizedOverride = sanitizeChatOverrideForRole(
        parsedOverride,
        role,
        globalConfig,
    );
    const chatMemory = new ChatMemory(
        options.memory,
        await options.bot.api.getChat(chatId),
    );
    await chatMemory.setChatConfigOverride(sanitizedOverride, userId);

    return jsonResponse({ ok: true });
}
