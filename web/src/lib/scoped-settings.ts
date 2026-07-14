export const scopedSettingsSections = [
    {
        id: 'reply-behavior',
        title: 'Reply behavior',
        keys: ['names', 'tendToReply', 'tendToReplyProbability', 'tendToIgnore', 'tendToIgnoreProbability', 'randomReplyProbability', 'responseDelay'],
    },
    {
        id: 'model-and-generation',
        title: 'Model and generation',
        keys: ['ai.model', 'ai.temperature', 'ai.topK', 'ai.topP', 'ai.google.structuredOutputs', 'ai.openrouter.usageInclude'],
    },
    {
        id: 'context-and-media',
        title: 'Context and media',
        keys: ['ai.messagesToPass', 'ai.messageMaxLength', 'ai.includeAttachmentsInHistory', 'ai.bytesLimit', 'filesMaxAge', 'maxMessagesToStore'],
    },
    {
        id: 'prompts',
        title: 'Prompts',
        keys: ['ai.prompt', 'ai.prePrompt', 'ai.privateChatPromptAddition', 'ai.groupChatPromptAddition', 'ai.commentsPromptAddition', 'ai.hateModePrompt', 'ai.finalPrompt', 'ai.chatActionsToolDescription', 'startMessage'],
    },
    {
        id: 'language-and-reactions',
        title: 'Language and reactions',
        keys: ['locale', 'blacklistedReactions', 'nepons'],
    },
    {
        id: 'advanced',
        title: 'Advanced',
        keys: ['ai.google.safetySettings', 'ai.generation.chat.thinking.thinkingLevel', 'ai.generation.character.thinking.thinkingLevel'],
    },
] as const;

export type ScopedSettingsSectionId = typeof scopedSettingsSections[number]['id'];

export function scopedSettingsSection(sectionId: ScopedSettingsSectionId) {
    return scopedSettingsSections.find((section) => section.id === sectionId)!;
}
