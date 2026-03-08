function normalizeLocaleCode(localeCode: string): string {
    const cleaned = localeCode.trim().toLowerCase().replaceAll('_', '-');
    return cleaned.split('-')[0] ?? cleaned;
}

function getLanguageName(localeCode: string): string {
    const normalizedLocale = normalizeLocaleCode(localeCode);
    const map: Record<string, string> = {
        ru: 'Russian',
        uk: 'Ukrainian',
        en: 'English',
        pt: 'Portuguese',
        hi: 'Hindi',
        id: 'Indonesian',
    };
    return map[normalizedLocale] ?? 'the chat language';
}

export function buildLanguageProtocol(defaultLocale: string): string {
    const lang = getLanguageName(defaultLocale);
    return [
        '### Language Protocol ###',
        `- Default to ${lang} language in all interactions`,
        "- Switch to other languages only when: 1) User explicitly writes in other language 2) User directly requests other language 3) User clearly doesn't understand the default language",
        `- Always return to ${lang} at first opportunity`,
        '- Maintain authentic speech patterns regardless of language used',
        '- Answer in short messages like a human would. Do not write long text in one message',
        '- Each reply must be unique',
        '- DO NOT REPEAT YOUR OWN MESSAGES OR YOU RISK BEING BANNED IN CHAT',
    ].join('\n');
}
