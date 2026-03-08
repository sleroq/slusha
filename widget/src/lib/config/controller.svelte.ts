import { initData } from "@tma.js/sdk-svelte";
import {
  fetchBootstrap,
  saveChatConfig,
  saveChatInternals,
  saveGlobalConfig,
} from "./api";
import {
  DEFAULT_LOCALE,
  normalizeLocale,
  translate,
  type WidgetLocale,
} from "$lib/i18n";
import {
  type AvailableChat,
  type BootstrapResponse,
  buildChatPayload,
  buildGlobalPayload,
  type ChatFormText,
  type ChatInternalsPayload,
  chatTextFromConfig,
  type ConfigRole,
  type ConfigScope,
  type CurrentCharacterPayload,
  defaultGlobalConfig,
  fromUnknownChatInternals,
  fromUnknownChatOverride,
  fromUnknownCurrentCharacter,
  fromUnknownGlobal,
  fromUnknownUsageWindowStatus,
  type GlobalFormText,
  globalTextFromConfig,
  parseChatIdFromStartParam,
  type ResolvedChatOverridePayload,
  type UsageWindowStatus,
} from "./model";

function initialSearchParams(): URLSearchParams {
  if (typeof window === "undefined") {
    return new URLSearchParams();
  }

  return new URLSearchParams(window.location.search);
}

interface ParsedInitUser {
  id?: number;
  languageCode?: string;
}

function parseUserFromInitData(rawInitData: string): ParsedInitUser {
  const userValue = new URLSearchParams(rawInitData).get("user");
  if (!userValue) {
    return {};
  }

  try {
    const parsed = JSON.parse(userValue) as {
      id?: unknown;
      language_code?: unknown;
    };
    return {
      id: typeof parsed.id === "number" ? parsed.id : undefined,
      languageCode: typeof parsed.language_code === "string"
        ? parsed.language_code
        : undefined,
    };
  } catch {
    return {};
  }
}

export class ConfigController {
  locale = $state<WidgetLocale>(DEFAULT_LOCALE);
  scope = $state<ConfigScope>("chat");
  chatId = $state("");
  bootstrap = $state<BootstrapResponse | undefined>(undefined);
  status = $state("");
  userId = $state<number | undefined>(undefined);
  role = $state<ConfigRole>("viewer");
  categories = $state<string[]>([]);
  availableModels = $state<string[]>([]);
  availableReactions = $state<string[]>([]);
  availableChats = $state<AvailableChat[]>([]);
  currentCharacter = $state<CurrentCharacterPayload | undefined>(undefined);
  chatInternals = $state<ChatInternalsPayload>(
    fromUnknownChatInternals(undefined),
  );
  usageWindowStatus = $state<UsageWindowStatus | undefined>(undefined);

  globalConfig = $state(defaultGlobalConfig());
  globalText = $state<GlobalFormText>({
    names: "",
    tendToReply: "",
    tendToIgnore: "",
    blacklistedReactions: "",
    reservedMessageTokens: "",
    nepons: "",
    adminIds: "",
    trustedIds: "",
    availableModels: "",
  });

  chatOverrideConfig = $state(
    fromUnknownChatOverride({}, defaultGlobalConfig()),
  );
  chatBaseConfig = $state<ResolvedChatOverridePayload>(
    fromUnknownChatOverride({}, defaultGlobalConfig()),
  );
  chatText = $state<ChatFormText>({
    names: "",
    tendToReply: "",
    tendToIgnore: "",
    blacklistedReactions: "",
    nepons: "",
  });

  #retryTimer: ReturnType<typeof setTimeout> | undefined;
  #loadRequestVersion = 0;
  #bootstrapAbortController: AbortController | undefined;

  constructor() {
    const params = initialSearchParams();
    this.scope = params.get("scope") === "global" ? "global" : "chat";

    const chatIdFromStartParam = parseChatIdFromStartParam(
      params.get("tgWebAppStartParam"),
    );
    this.chatId = params.get("chatId") ?? chatIdFromStartParam;
  }

  get canSaveGlobal(): boolean {
    return Boolean(this.bootstrap?.canEditGlobal);
  }

  get canViewGlobal(): boolean {
    return Boolean(this.bootstrap?.canViewGlobal);
  }

  get canConfigureTrustedSettings(): boolean {
    return this.role === "trusted" || this.role === "admin";
  }

  get canSaveChat(): boolean {
    return Boolean(this.bootstrap?.canEditChat) &&
      this.chatId.trim().length > 0;
  }

  get canEditChatInternals(): boolean {
    return Boolean(this.bootstrap?.canEditChatInternals) &&
      this.chatId.trim().length > 0;
  }

  get isLoading(): boolean {
    return this.status === translate(this.locale, "status.loading");
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
        : "";
    }

    this.globalConfig = fromUnknownGlobal(data.globalPayload);
    this.globalText = globalTextFromConfig(this.globalConfig);

    const baseConfig = fromUnknownGlobal(
      data.chatBasePayload ?? data.globalPayload ?? data.effectiveConfigPayload,
    );
    this.chatBaseConfig = fromUnknownChatOverride({}, baseConfig);
    this.chatOverrideConfig = fromUnknownChatOverride(
      data.chatOverridePayload,
      baseConfig,
    );
    this.chatText = chatTextFromConfig(this.chatOverrideConfig);
    this.currentCharacter = fromUnknownCurrentCharacter(
      data.currentCharacter,
    );
    this.chatInternals = fromUnknownChatInternals(
      data.chatInternalsPayload,
    );
    this.usageWindowStatus = fromUnknownUsageWindowStatus(
      data.usageWindowStatus,
    );

    if (!this.canViewGlobal && this.scope === "global") {
      this.scope = "chat";
    }
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

      this.status = translate(this.locale, "status.waitingInitData");
      this.#scheduleRetry();
      return false;
    }

    const parsedUser = parseUserFromInitData(rawInitData);
    this.userId = parsedUser.id;
    this.locale = normalizeLocale(parsedUser.languageCode);

    this.#clearRetryTimer();
    this.status = translate(this.locale, "status.loading");

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
      this.status = result.error ?? translate(this.locale, "status.failedLoad");
      return false;
    }

    this.bootstrap = result.data;
    this.#hydrateForms(result.data);

    const selectedChatId = this.chatId.trim();
    if (selectedChatId && selectedChatId !== requestedChatId) {
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
          translate(this.locale, "status.failedLoad");
        return false;
      }

      this.bootstrap = selectedResult.data;
      this.#hydrateForms(selectedResult.data);
    }

    if (this.scope === "chat" && this.availableChats.length === 0) {
      this.status = translate(this.locale, "status.noChats");
      return false;
    }

    this.status = "";
    return true;
  }

  async saveGlobal(): Promise<boolean> {
    if (!this.canSaveGlobal) {
      this.status = translate(this.locale, "status.readOnlyGlobal");
      return false;
    }

    const rawInitData = this.ensureInitDataRaw();
    if (!rawInitData) {
      this.status = translate(this.locale, "status.missingInitData");
      return false;
    }

    this.status = translate(this.locale, "status.savingGlobal");
    const payload = buildGlobalPayload(this.globalConfig, this.globalText);
    const result = await saveGlobalConfig(payload, rawInitData, this.locale);
    this.status = result.ok
      ? translate(this.locale, "status.savedGlobal")
      : (result.error ?? translate(this.locale, "status.failedSaveGlobal"));
    return result.ok;
  }

  async saveChat(): Promise<boolean> {
    const chatId = this.chatId.trim();
    if (!chatId) {
      this.status = translate(this.locale, "status.chatIdRequired");
      return false;
    }

    const rawInitData = this.ensureInitDataRaw();
    if (!rawInitData) {
      this.status = translate(this.locale, "status.missingInitData");
      return false;
    }

    this.status = translate(this.locale, "status.savingChat");
    const payload = buildChatPayload(
      this.chatOverrideConfig,
      this.chatText,
      this.chatBaseConfig,
    );
    const result = await saveChatConfig(
      chatId,
      payload,
      rawInitData,
      this.locale,
    );
    this.status = result.ok
      ? translate(this.locale, "status.savedChat")
      : (result.error ?? translate(this.locale, "status.failedSaveChat"));
    return result.ok;
  }

  async saveInternals(): Promise<boolean> {
    const chatId = this.chatId.trim();
    if (!chatId) {
      this.status = translate(this.locale, "status.chatIdRequired");
      return false;
    }

    if (!this.canEditChatInternals) {
      this.status = translate(this.locale, "status.readOnlyInternals");
      return false;
    }

    const rawInitData = this.ensureInitDataRaw();
    if (!rawInitData) {
      this.status = translate(this.locale, "status.missingInitData");
      return false;
    }

    this.status = translate(this.locale, "status.savingInternals");
    const result = await saveChatInternals(
      chatId,
      this.chatInternals,
      rawInitData,
      this.locale,
    );
    this.status = result.ok
      ? translate(this.locale, "status.savedInternals")
      : (result.error ?? translate(this.locale, "status.failedSaveInternals"));
    return result.ok;
  }
}

export function createConfigController(): ConfigController {
  return new ConfigController();
}
