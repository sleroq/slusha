export const sections = [
    {
        id: 'reply-behavior',
        title: 'Reply behavior',
        keys: [
            'names',
            'tendToReply',
            'tendToReplyProbability',
            'tendToIgnore',
            'tendToIgnoreProbability',
            'randomReplyProbability',
            'responseDelay',
        ],
    },
    {
        id: 'model-and-generation',
        title: 'Model and generation',
        keys: [
            'ai.model',
            'ai.characterNamesModel',
            'availableModels',
            'ai.imageAttachmentFallbackModel',
            'ai.temperature',
            'ai.topK',
            'ai.topP',
            'ai.google.structuredOutputs',
        ],
    },
    {
        id: 'context-and-media',
        title: 'Context and media',
        keys: [
            'ai.messagesToPass',
            'ai.messageMaxLength',
            'ai.includeAttachmentsInHistory',
            'ai.autoRerouteImageAttachments',
            'ai.bytesLimit',
            'filesMaxAge',
            'maxMessagesToStore',
        ],
    },
    {
        id: 'prompts',
        title: 'Prompts',
        keys: [
            'ai.prompt',
            'ai.prePrompt',
            'ai.privateChatPromptAddition',
            'ai.groupChatPromptAddition',
            'ai.commentsPromptAddition',
            'ai.hateModePrompt',
            'ai.finalPrompt',
            'ai.chatActionsToolDescription',
            'startMessage',
        ],
    },
    {
        id: 'language-and-reactions',
        title: 'Language and reactions',
        keys: ['locale', 'blacklistedReactions', 'nepons'],
    },
] as const;

export type SectionId = (typeof sections)[number]['id'];

export function sectionFor(id: string) {
    return sections.find((section) => section.id === id);
}

export function titleFor(key: string) {
    const labels = new Map(
        Object.entries({
            'ai.prompt': 'Character',
            'ai.prePrompt': 'System prompt',
            'ai.chatActionsToolDescription': 'Chat action guidance (not tool schema)',
            'ai.model': 'Model',
            'ai.characterNamesModel': 'Character name model',
            'ai.imageAttachmentFallbackModel': 'Image fallback model',
            'ai.autoRerouteImageAttachments': 'Use image fallback automatically',
            availableModels: 'Available models',
            names: 'Names',
            tendToReply: 'Reply when matched',
            tendToIgnore: 'Ignore when matched',
            nepons: 'Fallback replies',
            blacklistedReactions: 'Blocked reactions',
            locale: 'Language',
        }),
    );
    const last = key.split('.').at(-1) ?? key;
    return (
        labels.get(key) ??
        last.replace(/([A-Z])/g, ' $1').replace(/^./, (value) => value.toUpperCase())
    );
}

export function labelId(key: string) {
    return `field-${key.replace(/[^a-zA-Z0-9_-]/g, '-')}-label`;
}
