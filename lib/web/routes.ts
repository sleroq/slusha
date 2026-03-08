const CHAT_INTERNALS_PATH = /^\/api\/config\/chat\/(-?\d+)\/internals$/;
const CHAT_CONFIG_PATH = /^\/api\/config\/chat\/(-?\d+)$/;

export function parseChatInternalsChatId(pathname: string): number | undefined {
    const match = CHAT_INTERNALS_PATH.exec(pathname);
    const chatId = Number(match?.[1]);
    return Number.isFinite(chatId) ? chatId : undefined;
}

export function parseChatConfigChatId(pathname: string): number | undefined {
    const match = CHAT_CONFIG_PATH.exec(pathname);
    const chatId = Number(match?.[1]);
    return Number.isFinite(chatId) ? chatId : undefined;
}

export function resolveRouteTemplate(pathname: string): string {
    if (pathname.startsWith('/widget')) return '/widget/*';
    if (pathname === '/healthz') return '/healthz';
    if (pathname === '/metrics') return '/metrics';
    if (pathname === '/api/config/bootstrap') return '/api/config/bootstrap';
    if (pathname === '/api/config/global') return '/api/config/global';
    if (parseChatInternalsChatId(pathname) !== undefined) {
        return '/api/config/chat/:chatId/internals';
    }
    if (parseChatConfigChatId(pathname) !== undefined) {
        return '/api/config/chat/:chatId';
    }
    if (pathname.startsWith('/api/config/')) return '/api/config/*';
    return 'not_found';
}
