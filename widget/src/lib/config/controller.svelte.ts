import { initData } from '@tma.js/sdk-svelte';
import { fetchBootstrap } from './api';
import {
    DEFAULT_LOCALE,
    normalizeLocale,
    translate,
    type WidgetLocale,
} from '$lib/i18n';
import {
    type AvailableChat,
    type BootstrapResponse,
    type ConfigRole,
    type ConfigScope,
    type CurrentCharacterPayload,
    defaultGlobalConfig,
    fromUnknownCurrentCharacter,
    fromUnknownGlobal,
    type GlobalFormText,
    globalTextFromConfig,
    parseChatIdFromStartParam,
} from './model';

function initialSearchParams(): URLSearchParams {
    if (typeof window === 'undefined') {
        return new URLSearchParams();
    }

    return new URLSearchParams(window.location.search);
}

interface ParsedInitUser {
    id?: number;
    languageCode?: string;
}

function parseUserFromInitData(rawInitData: string): ParsedInitUser {
    const userValue = new URLSearchParams(rawInitData).get('user');
    if (!userValue) {
        return {};
    }

    try {
        const parsed = JSON.parse(userValue) as {
            id?: unknown;
            language_code?: unknown;
        };
        return {
            id: typeof parsed.id === 'number' ? parsed.id : undefined,
            languageCode: typeof parsed.language_code === 'string'
                ? parsed.language_code
                : undefined,
        };
    } catch {
        return {};
    }
}

export class ConfigController {
    locale = $state<WidgetLocale>(DEFAULT_LOCALE);
    scope = $state<ConfigScope>('global');
    chatId = $state('');
    bootstrap = $state<BootstrapResponse | undefined>(undefined);
    status = $state('');
    userId = $state<number | undefined>(undefined);
    role = $state<ConfigRole>('regular');
    categories = $state<string[]>([]);
    availableModels = $state<string[]>([]);
    availableReactions = $state<string[]>([]);
    availableChats = $state<AvailableChat[]>([]);
    currentCharacter = $state<CurrentCharacterPayload | undefined>(undefined);

    globalConfig = $state(defaultGlobalConfig());
    globalText = $state<GlobalFormText>({
        names: '',
        tendToReply: '',
        tendToIgnore: '',
        blacklistedReactions: '',
        nepons: '',
        adminIds: '',
        trustedIds: '',
        availableModels: '',
    });

    #retryTimer: ReturnType<typeof setTimeout> | undefined;
    #loadRequestVersion = 0;
    #bootstrapAbortController: AbortController | undefined;
    #bootstrapCache: Record<string, BootstrapResponse> = Object.create(null);

    constructor() {
        const params = initialSearchParams();
        this.scope = 'global';

        const chatIdFromStartParam = parseChatIdFromStartParam(
            params.get('tgWebAppStartParam'),
        );
        this.chatId = params.get('chatId') ?? chatIdFromStartParam;
    }

    get canViewGlobal(): boolean {
        return Boolean(this.bootstrap?.canViewGlobal);
    }

    get canConfigureTrustedSettings(): boolean {
        return this.role === 'trusted' || this.role === 'admin';
    }

    get isLoading(): boolean {
        return this.status === translate(this.locale, 'status.loading');
    }

    initialize(): void {
        const rawInitData = this.ensureInitDataRaw();
        if (rawInitData) {
            const parsedUser = parseUserFromInitData(rawInitData);
            this.userId = parsedUser.id;
            this.locale = normalizeLocale(parsedUser.languageCode);
        }
        void this.loadBootstrap();
    }

    dispose(): void {
        this.#clearRetryTimer();
        this.#bootstrapAbortController?.abort();
        this.#bootstrapAbortController = undefined;
    }

    #cacheKeyForChatId(chatId: string): string {
        return chatId.trim() || '__default__';
    }

    #setCachedBootstrap(chatId: string, data: BootstrapResponse): void {
        this.#bootstrapCache[this.#cacheKeyForChatId(chatId)] = data;
    }

    #getCachedBootstrap(chatId: string): BootstrapResponse | undefined {
        return this.#bootstrapCache[this.#cacheKeyForChatId(chatId)];
    }

    #hydrateForms(data: BootstrapResponse): void {
        this.role = data.role;
        this.categories = data.categories ?? [];
        this.availableModels = data.availableModels ?? [];
        this.availableReactions = data.availableReactions ?? [];
        this.availableChats = data.availableChats ?? [];

        const currentChatId = this.chatId.trim();
        const hasCurrentChat = this.availableChats.some((chat) =>
            String(chat.id) === currentChatId
        );
        if (!hasCurrentChat) {
            this.chatId = this.availableChats.length > 0
                ? String(this.availableChats[0].id)
                : '';
        }

        this.globalConfig = fromUnknownGlobal(data.globalPayload);
        this.globalText = globalTextFromConfig(this.globalConfig);

        this.currentCharacter = fromUnknownCurrentCharacter(
            data.currentCharacter,
        );
    }

    #clearRetryTimer(): void {
        if (this.#retryTimer) {
            clearTimeout(this.#retryTimer);
            this.#retryTimer = undefined;
        }
    }

    #scheduleRetry(): void {
        this.#clearRetryTimer();
        this.#retryTimer = setTimeout(() => {
            void this.loadBootstrap();
        }, 1000);
    }

    ensureInitDataRaw(): string | undefined {
        const current = initData.raw();
        if (current) return current;

        try {
            initData.restore();
        } catch {
            return undefined;
        }

        return initData.raw();
    }

    async loadBootstrap(): Promise<boolean> {
        const requestVersion = ++this.#loadRequestVersion;
        this.#bootstrapAbortController?.abort();
        this.#bootstrapAbortController = new AbortController();

        const rawInitData = this.ensureInitDataRaw();
        if (!rawInitData) {
            if (requestVersion !== this.#loadRequestVersion) {
                return false;
            }

            this.status = translate(this.locale, 'status.waitingInitData');
            this.#scheduleRetry();
            return false;
        }

        const parsedUser = parseUserFromInitData(rawInitData);
        this.userId = parsedUser.id;
        this.locale = normalizeLocale(parsedUser.languageCode);

        this.#clearRetryTimer();
        const cachedBootstrap = this.#getCachedBootstrap(this.chatId);
        if (cachedBootstrap) {
            this.bootstrap = cachedBootstrap;
            this.#hydrateForms(cachedBootstrap);
            this.status = '';
        } else {
            this.status = translate(this.locale, 'status.loading');
        }

        const requestedChatId = this.chatId.trim();
        const result = await fetchBootstrap(
            requestedChatId,
            rawInitData,
            this.locale,
            this.#bootstrapAbortController.signal,
        );
        if (requestVersion !== this.#loadRequestVersion) {
            return false;
        }

        if (!result.ok || !result.data) {
            this.status = result.error ??
                translate(this.locale, 'status.failedLoad');
            return false;
        }

        this.bootstrap = result.data;
        this.#setCachedBootstrap(requestedChatId, result.data);
        this.#hydrateForms(result.data);

        const selectedChatId = this.chatId.trim();
        if (selectedChatId && selectedChatId !== requestedChatId) {
            const cachedSelected = this.#getCachedBootstrap(selectedChatId);
            if (cachedSelected) {
                this.bootstrap = cachedSelected;
                this.#hydrateForms(cachedSelected);
            }

            const selectedResult = await fetchBootstrap(
                selectedChatId,
                rawInitData,
                this.locale,
                this.#bootstrapAbortController.signal,
            );
            if (requestVersion !== this.#loadRequestVersion) {
                return false;
            }

            if (!selectedResult.ok || !selectedResult.data) {
                this.status = selectedResult.error ??
                    translate(this.locale, 'status.failedLoad');
                return false;
            }

            this.bootstrap = selectedResult.data;
            this.#setCachedBootstrap(selectedChatId, selectedResult.data);
            this.#hydrateForms(selectedResult.data);
        }

        this.status = '';
        return true;
    }
}

export function createConfigController(): ConfigController {
    return new ConfigController();
}
