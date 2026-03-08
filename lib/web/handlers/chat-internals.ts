import { ChatMemory } from '../../memory.ts';
import { jsonResponse } from '../http.ts';
import { canEditChatConfig } from '../permissions.ts';
import { RequestContext } from '../request-context.ts';
import { StartWebServerOptions } from '../types.ts';

function summaryToNotes(summary: string): string[] {
    return summary
        .split(/\n{2,}/)
        .map((item) => item.trim())
        .filter((item) => item.length > 0);
}

export async function handlePutChatInternalsRequest(
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

    if (role !== 'admin') {
        return jsonResponse({ error: 'Forbidden' }, 403);
    }

    const body = await req.json() as {
        payload?: {
            summary?: unknown;
            personalNotes?: unknown;
        };
    };
    if (!body.payload || typeof body.payload !== 'object') {
        return jsonResponse({ error: 'Missing payload' }, 400);
    }

    const summary = typeof body.payload.summary === 'string'
        ? body.payload.summary
        : '';
    const personalNotes = typeof body.payload.personalNotes === 'string'
        ? body.payload.personalNotes
        : '';

    const chatMemory = new ChatMemory(
        options.memory,
        await options.bot.api.getChat(chatId),
    );
    await chatMemory.setNotes(summaryToNotes(summary));
    await chatMemory.setMemory(
        personalNotes.trim().length > 0 ? personalNotes : undefined,
    );

    return jsonResponse({ ok: true });
}
