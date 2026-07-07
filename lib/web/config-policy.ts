import { UserConfig } from '../config.ts';
import { categoriesEditableByRole } from '../config-contract.ts';
import { ConfigRole } from './permissions.ts';

function uniqueModels(models: string[]): string[] {
    return Array.from(new Set(models.map((item) => item.trim()))).filter((
        item,
    ) => item.length > 0);
}

function resolveAvailableModels(config: UserConfig): string[] {
    const models = uniqueModels(config.availableModels ?? []);
    if (models.length > 0) return models;
    return uniqueModels([config.ai.model]);
}

export function buildBootstrapCapabilities(role: ConfigRole): {
    role: ConfigRole;
    categories: string[];
} {
    return {
        role,
        categories: categoriesEditableByRole(role),
    };
}

export function projectGlobalConfigForRole(
    config: UserConfig,
    role: ConfigRole,
): unknown {
    if (role === 'admin') {
        return config;
    }

    return undefined;
}

export function getModelOptionsForRole(
    config: UserConfig,
    role: ConfigRole,
): string[] {
    if (role === 'trusted' || role === 'admin') {
        return resolveAvailableModels(config);
    }

    return [];
}
