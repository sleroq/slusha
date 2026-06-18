export type GenerationFallbackLevel =
    | 'full'
    | 'short_history'
    | 'short_history_no_notes';

export type GenerationAttemptPlan = {
    level: GenerationFallbackLevel;
    historyLimit: number;
    includeBotNotes: boolean;
};

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
