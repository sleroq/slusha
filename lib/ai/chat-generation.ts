export type ReplyMethod = 'json_actions' | 'plain_text_reactions';

export type GenerationFallbackLevel =
    | 'full'
    | 'short_history'
    | 'short_history_no_notes';

export type GenerationAttemptPlan = {
    level: GenerationFallbackLevel;
    historyLimit: number;
    includeBotNotes: boolean;
};

export function resolveReplyMethod(
    configuredMethod: string | undefined,
    useJsonResponses: boolean,
): ReplyMethod {
    if (configuredMethod === 'json_actions') {
        return 'json_actions';
    }
    if (configuredMethod === 'plain_text_reactions') {
        return 'plain_text_reactions';
    }

    return useJsonResponses ? 'json_actions' : 'plain_text_reactions';
}

export function splitTextByTwoLines(text: string): string[] {
    const lines = text
        .split('\n')
        .map((line) => line.trimEnd());
    const chunks: string[] = [];

    for (let i = 0; i < lines.length; i += 2) {
        const chunk = lines.slice(i, i + 2)
            .join('\n')
            .trim();
        if (chunk.length > 0) {
            chunks.push(chunk);
        }
    }

    return chunks;
}

export function getGenerationFallbackPlans(
    messagesToPass: number,
): GenerationAttemptPlan[] {
    const shortHistoryLimit = Math.max(2, Math.floor(messagesToPass / 2));

    return [
        {
            level: 'full',
            historyLimit: messagesToPass,
            includeBotNotes: true,
        },
        {
            level: 'short_history',
            historyLimit: shortHistoryLimit,
            includeBotNotes: true,
        },
        {
            level: 'short_history_no_notes',
            historyLimit: shortHistoryLimit,
            includeBotNotes: false,
        },
    ];
}

export function resolveCustomPrompt(
    configured: string | undefined,
    fallback: string,
): string {
    const trimmed = configured?.trim();
    return trimmed && trimmed.length > 0 ? trimmed : fallback;
}
