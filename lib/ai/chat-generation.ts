export type GenerationFallbackLevel =
    | 'full'
    | 'short_history'
    | 'short_history_final';

export type GenerationAttemptPlan = {
    level: GenerationFallbackLevel;
    historyLimit: number;
};

export function getGenerationFallbackPlans(
    messagesToPass: number,
): GenerationAttemptPlan[] {
    const shortHistoryLimit = Math.max(2, Math.floor(messagesToPass / 2));

    return [
        {
            level: 'full',
            historyLimit: messagesToPass,
        },
        {
            level: 'short_history',
            historyLimit: shortHistoryLimit,
        },
        {
            level: 'short_history_final',
            historyLimit: shortHistoryLimit,
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
