export type HistoryAttachmentInput = 'none' | 'images' | 'all';
export type OpencodeRequestFormat =
    | 'openai-chat-completions'
    | 'anthropic-messages';
export type StructuredOutputMode = 'tool' | 'json-text';

interface OpencodeGoModelConfig {
    historyAttachmentInput: HistoryAttachmentInput;
    requestFormat: OpencodeRequestFormat;
    structuredOutputMode: StructuredOutputMode;
}

export const opencodeGoModels: Readonly<
    Record<string, OpencodeGoModelConfig>
> = {
    'mimo-v2.5': {
        historyAttachmentInput: 'images',
        requestFormat: 'openai-chat-completions',
        structuredOutputMode: 'tool',
    },
    'minimax-m3': {
        historyAttachmentInput: 'images',
        requestFormat: 'anthropic-messages',
        structuredOutputMode: 'tool',
    },
    'qwen3.7-plus': {
        historyAttachmentInput: 'images',
        requestFormat: 'anthropic-messages',
        structuredOutputMode: 'tool',
    },
    'qwen3.6-plus': {
        historyAttachmentInput: 'images',
        requestFormat: 'anthropic-messages',
        structuredOutputMode: 'tool',
    },
    'kimi-k2.6': {
        historyAttachmentInput: 'images',
        requestFormat: 'openai-chat-completions',
        structuredOutputMode: 'tool',
    },
    'kimi-k2.7-code': {
        historyAttachmentInput: 'images',
        requestFormat: 'openai-chat-completions',
        structuredOutputMode: 'tool',
    },
    'glm-5.2': {
        historyAttachmentInput: 'none',
        requestFormat: 'openai-chat-completions',
        structuredOutputMode: 'tool',
    },
    'glm-5.1': {
        historyAttachmentInput: 'none',
        requestFormat: 'openai-chat-completions',
        structuredOutputMode: 'tool',
    },
    'mimo-v2.5-pro': {
        historyAttachmentInput: 'none',
        requestFormat: 'openai-chat-completions',
        structuredOutputMode: 'tool',
    },
    'minimax-m2.7': {
        historyAttachmentInput: 'none',
        requestFormat: 'anthropic-messages',
        structuredOutputMode: 'tool',
    },
    'qwen3.7-max': {
        historyAttachmentInput: 'none',
        requestFormat: 'anthropic-messages',
        structuredOutputMode: 'tool',
    },
    'deepseek-v4-pro': {
        historyAttachmentInput: 'none',
        requestFormat: 'openai-chat-completions',
        structuredOutputMode: 'json-text',
    },
    'deepseek-v4-flash': {
        historyAttachmentInput: 'none',
        requestFormat: 'openai-chat-completions',
        structuredOutputMode: 'json-text',
    },
};

export const opencodeGoModelRefs = Object.keys(opencodeGoModels).map(
    (modelId) => `opencode-go/${modelId}`,
);
