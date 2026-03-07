// Reaction utilities extracted from main.ts

// Allowed free Telegram reactions (bots cannot use paid/custom unless present)
export const ALLOWED_REACTIONS = [
    '❤',
    '👍',
    '👎',
    '🔥',
    '🥰',
    '😁',
    '🤔',
    '🤯',
    '😢',
    '🎉',
    '🤮',
    '💩',
    '🤡',
    '🥱',
    '🐳',
    '❤‍🔥',
    '💯',
    '🏆',
    '💔',
    '🍓',
    '💋',
    '🖕',
    '😴',
    '😭',
    '🤓',
    '😨',
    '🫡',
    '💅',
    '💊',
    '😎',
    '😡',
] as const;

export type AllowedReaction = typeof ALLOWED_REACTIONS[number];

export function isAllowedReaction(emoji: string): emoji is AllowedReaction {
    // Using array includes retains the literal union for narrowing
    return (ALLOWED_REACTIONS as readonly string[]).includes(emoji);
}

// Decode strings like "U+2764 U+FE0F" to actual characters
export function decodeUnicodeTokens(input: string): string {
    return input.replace(/U\+([0-9a-fA-F]{4,6})/g, (_, hex) => {
        const codepoint = parseInt(hex, 16);
        try {
            return String.fromCodePoint(codepoint);
        } catch (_) {
            return '';
        }
    }).trim();
}

// Remove text/emoji presentation variation selectors, keep ZWJ sequences intact
export function stripVariationSelectors(input: string): string {
    return input.replace(/[\uFE0E\uFE0F]/g, '');
}

// Canonicalize any incoming emoji into an allowed reaction if possible
export function canonicalizeReaction(input: string): AllowedReaction | null {
    const candidate = decodeUnicodeTokens(input);

    // Exact match first
    if (isAllowedReaction(candidate)) {
        return candidate;
    }

    const base = stripVariationSelectors(candidate);

    for (const allowed of ALLOWED_REACTIONS) {
        if (stripVariationSelectors(allowed) === base) {
            return allowed as AllowedReaction;
        }
    }

    return null;
}

export function normalizeReactionBlacklist(
    reactions: readonly string[] | undefined,
): AllowedReaction[] {
    if (!reactions || reactions.length === 0) {
        return [];
    }

    const normalized: AllowedReaction[] = [];
    for (const reaction of reactions) {
        const canon = canonicalizeReaction(reaction);
        if (!canon || normalized.includes(canon)) {
            continue;
        }

        normalized.push(canon);
    }

    return normalized;
}

export function resolveEnabledReactions(
    blacklistedReactions: readonly string[] | undefined,
): AllowedReaction[] {
    const blacklist = normalizeReactionBlacklist(blacklistedReactions);
    if (blacklist.length === 0) {
        return [...ALLOWED_REACTIONS];
    }

    return ALLOWED_REACTIONS.filter((reaction) =>
        !blacklist.includes(reaction)
    );
}
