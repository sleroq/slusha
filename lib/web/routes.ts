export function resolveRouteTemplate(pathname: string): string {
    if (pathname.startsWith('/widget')) return '/widget/*';
    if (pathname === '/healthz') return '/healthz';
    if (pathname === '/metrics') return '/metrics';
    if (pathname === '/api/config/bootstrap') return '/api/config/bootstrap';
    if (pathname.startsWith('/api/config/')) return '/api/config/*';
    return 'not_found';
}
