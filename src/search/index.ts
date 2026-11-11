import { z } from 'zod';

const responseSchema = z.object({
    results: z.array(z.object({ title: z.string(), url: z.string(), text: z.string() })),
    provider: z.object({ attribution: z.string().optional() }).optional(),
});

export function createSearch(token: string, url = 'https://radius.pi.dev/v1/search') {
    return async (input: { query: string }) => {
        let response: Response;
        try {
            response = await fetch(url, {
                method: 'POST',
                headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
                body: JSON.stringify(input),
            });
        } catch {
            throw new Error('Radius search request failed');
        }
        if (!response.ok) throw new Error(`Radius search failed (HTTP ${response.status})`);
        const body = await response.json().catch(() => undefined);
        const parsed = responseSchema.safeParse(body);
        if (!parsed.success) throw new Error('Invalid Radius search response');
        const { results, provider } = parsed.data;
        return [
            ...results.map((result) => `${result.title}\n${result.url}\n${result.text}`),
            ...(provider?.attribution ? [provider.attribution] : []),
        ]
            .join('\n\n')
            .replaceAll(token, '[redacted]');
    };
}
