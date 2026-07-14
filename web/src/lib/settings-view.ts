export function settingsFieldTitle(key: string) {
    const labels: Record<string, string> = {
        'ai.prompt': 'Character',
        'ai.prePrompt': 'System prompt',
        'ai.model': 'Model',
        availableModels: 'Available models',
        names: 'Names',
        tendToReply: 'Reply when matched',
        tendToIgnore: 'Ignore when matched',
        nepons: 'Fallback replies',
        blacklistedReactions: 'Blocked reactions',
        locale: 'Language',
    };
    return labels[key] ?? key.split('.').at(-1)!.replace(/([A-Z])/g, ' $1')
        .replace(/^./, (character) => character.toUpperCase());
}

export function settingsFieldLabelId(key: string) {
    return `field-${key.replace(/[^a-zA-Z0-9_-]/g, '-')}-label`;
}
