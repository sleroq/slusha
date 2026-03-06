import { initData } from "@tma.js/sdk-svelte";
import { fetchBootstrap, saveChatConfig, saveGlobalConfig } from "./api";
import {
  type BootstrapResponse,
  buildChatPayload,
  buildGlobalPayload,
  type ChatFormText,
  chatTextFromConfig,
  type ConfigRole,
  type ConfigScope,
  defaultGlobalConfig,
  fromUnknownChatOverride,
  fromUnknownGlobal,
  type GlobalFormText,
  globalTextFromConfig,
  parseChatIdFromStartParam,
  type ResolvedChatOverridePayload,
} from "./model";

function initialSearchParams(): URLSearchParams {
  if (typeof window === "undefined") {
    return new URLSearchParams();
  }

  return new URLSearchParams(window.location.search);
}

function parseUserIdFromInitData(rawInitData: string): number | undefined {
  const userValue = new URLSearchParams(rawInitData).get("user");
  if (!userValue) {
    return undefined;
  }

  try {
    const parsed = JSON.parse(userValue) as { id?: unknown };
    return typeof parsed.id === "number" ? parsed.id : undefined;
  } catch {
    return undefined;
  }
}

export class ConfigController {
  scope = $state<ConfigScope>("chat");
  chatId = $state("");
  bootstrap = $state<BootstrapResponse | undefined>(undefined);
  status = $state("");
  userId = $state<number | undefined>(undefined);
  role = $state<ConfigRole>("viewer");
  categories = $state<string[]>([]);
  availableModels = $state<string[]>([]);

  globalConfig = $state(defaultGlobalConfig());
  globalText = $state<GlobalFormText>({
    names: "",
    tendToReply: "",
    tendToIgnore: "",
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
    nepons: "",
  });

  #retryTimer: ReturnType<typeof setTimeout> | undefined;

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

  get isLoading(): boolean {
    return this.status.startsWith("Loading");
  }

  initialize(): void {
    this.ensureInitDataRaw();
    void this.loadBootstrap();
  }

  dispose(): void {
    this.#clearRetryTimer();
  }

  #hydrateForms(data: BootstrapResponse): void {
    this.role = data.role;
    this.categories = data.categories ?? [];
    this.availableModels = data.availableModels ?? [];

    this.globalConfig = fromUnknownGlobal(data.globalPayload);
    this.globalText = globalTextFromConfig(this.globalConfig);

    const baseConfig = fromUnknownGlobal(data.effectiveConfigPayload);
    this.chatBaseConfig = fromUnknownChatOverride({}, baseConfig);
    this.chatOverrideConfig = fromUnknownChatOverride(
      data.chatOverridePayload,
      baseConfig,
    );
    this.chatText = chatTextFromConfig(this.chatOverrideConfig);

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
    const rawInitData = this.ensureInitDataRaw();
    if (!rawInitData) {
      this.status = "Waiting for Telegram init data...";
      this.#scheduleRetry();
      return false;
    }

    this.userId = parseUserIdFromInitData(rawInitData);

    this.#clearRetryTimer();
    this.status = "Loading...";

    const result = await fetchBootstrap(this.chatId, rawInitData);
    if (!result.ok || !result.data) {
      this.status = result.error ?? "Failed to load";
      return false;
    }

    this.bootstrap = result.data;
    this.#hydrateForms(result.data);
    this.status = "Loaded";
    return true;
  }

  async saveGlobal(): Promise<boolean> {
    if (!this.canViewGlobal) {
      this.status = "Global config is available only for admins";
      return false;
    }

    const rawInitData = this.ensureInitDataRaw();
    if (!rawInitData) {
      this.status = "Missing Telegram init data";
      return false;
    }

    this.status = "Saving global config...";
    const payload = buildGlobalPayload(this.globalConfig, this.globalText);
    const result = await saveGlobalConfig(payload, rawInitData);
    this.status = result.ok
      ? "Global config saved"
      : (result.error ?? "Failed to save global config");
    return result.ok;
  }

  async saveChat(): Promise<boolean> {
    const chatId = this.chatId.trim();
    if (!chatId) {
      this.status = "Chat ID is required";
      return false;
    }

    const rawInitData = this.ensureInitDataRaw();
    if (!rawInitData) {
      this.status = "Missing Telegram init data";
      return false;
    }

    this.status = "Saving chat override...";
    const payload = buildChatPayload(
      this.chatOverrideConfig,
      this.chatText,
      this.chatBaseConfig,
    );
    const result = await saveChatConfig(chatId, payload, rawInitData);
    this.status = result.ok
      ? "Chat override saved"
      : (result.error ?? "Failed to save chat override");
    return result.ok;
  }
}

export function createConfigController(): ConfigController {
  return new ConfigController();
}
