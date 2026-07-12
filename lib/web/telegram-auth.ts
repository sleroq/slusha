import { parse, validate } from '@tma.js/init-data-node/web';

const initDataLifetimeSeconds = 24 * 60 * 60;

type TelegramAuthHandler = (
    request: Request,
    initData: ReturnType<typeof parse>,
) => Response | Promise<Response>;

export function withTelegramAuth(
    botToken: string,
    handler: TelegramAuthHandler,
) {
    return async (request: Request) => {
        const authorization = request.headers.get('authorization');
        const [scheme, initData] = authorization?.split(' ', 2) ?? [];

        if (scheme !== 'tma' || !initData) {
            return new Response('Unauthorized', { status: 401 });
        }

        try {
            await validate(initData, botToken, {
                expiresIn: initDataLifetimeSeconds,
            });
            return await handler(request, parse(initData));
        } catch {
            return new Response('Unauthorized', { status: 401 });
        }
    };
}
