export type ModelProvider = 'google' | 'openrouter' | 'opencode';

export interface ParsedModelRef {
    provider: ModelProvider;
    modelId: string;
    raw: string;
}

const providerPrefixes: Record<ModelProvider, string> = {
    google: 'google:',
    openrouter: 'openrouter:',
    opencode: 'opencode:',
};

const opencodeGoPrefix = 'opencode-go/';

export function parseModelRef(modelRef: string): ParsedModelRef {
    const raw = modelRef.trim();

    if (raw.startsWith(providerPrefixes.google)) {
        return {
            provider: 'google',
            modelId: raw.slice(providerPrefixes.google.length),
            raw,
        };
    }

    if (raw.startsWith(providerPrefixes.openrouter)) {
        return {
            provider: 'openrouter',
            modelId: raw.slice(providerPrefixes.openrouter.length),
            raw,
        };
    }

    if (raw.startsWith(providerPrefixes.opencode)) {
        return {
            provider: 'opencode',
            modelId: raw.slice(providerPrefixes.opencode.length),
            raw,
        };
    }

    if (raw.startsWith(opencodeGoPrefix)) {
        return {
            provider: 'opencode',
            modelId: raw.slice(opencodeGoPrefix.length),
            raw,
        };
    }

    return {
        provider: 'google',
        modelId: raw,
        raw,
    };
}
