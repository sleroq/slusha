export type ConfigScope = "global" | "chat";
export type ConfigRole = "regular" | "trusted" | "admin";

export interface AvailableChat {
  id: number;
  title: string;
  username?: string;
  type: "private" | "group" | "supergroup" | "channel";
}

export interface BootstrapResponse {
  role: ConfigRole;
  categories: string[];
  availableModels: string[];
  availableReactions: string[];
  availableChats: AvailableChat[];
  canViewGlobal: boolean;
  canEditGlobal: boolean;
  globalPayload?: unknown;
  currentCharacter?: unknown;
}

export interface CurrentCharacterPayload {
  name: string;
  names: string[];
  description: string;
  scenario: string;
  systemPrompt: string;
  postHistoryInstructions: string;
  firstMessage: string;
  messageExample: string;
}

export interface SerializedRegex {
  __regex: string;
  flags?: string;
}

export type Matcher = string | SerializedRegex;

export interface GoogleSafetySetting {
  category: string;
  threshold: string;
}

export interface GoogleThinkingConfig {
  thinkingLevel?: "minimal" | "low" | "medium" | "high";
  includeThoughts?: boolean;
}

export interface OpenRouterReasoningConfig {
  maxTokens?: number;
}

export interface GenerationTaskConfig {
  thinking: GoogleThinkingConfig;
  openrouterReasoning: OpenRouterReasoningConfig;
  maxOutputTokens?: number;
}

export interface AiPayload {
  model: string;
  temperature: number;
  topK: number;
  topP: number;
  prePrompt: string;
  prompt: string;
  privateChatPromptAddition?: string;
  groupChatPromptAddition?: string;
  commentsPromptAddition?: string;
  hateModePrompt?: string;
  finalPrompt: string;
  chatActionsToolDescription?: string;
  messagesToPass: number;
  messageMaxLength: number;
  includeAttachmentsInHistory: boolean;
  bytesLimit: number;
  google: {
    safetySettings: GoogleSafetySetting[];
    structuredOutputs: boolean;
  };
  openrouter: {
    usageInclude: boolean;
  };
  generation: {
    chat: GenerationTaskConfig;
    character: GenerationTaskConfig;
  };
}

export interface ChatEditableAiPayload {
  model: string;
  temperature: number;
  topK: number;
  topP: number;
  prompt?: string;
  privateChatPromptAddition?: string;
  groupChatPromptAddition?: string;
  commentsPromptAddition?: string;
  hateModePrompt?: string;
  messagesToPass: number;
  messageMaxLength: number;
  includeAttachmentsInHistory: boolean;
  bytesLimit: number;
}

export interface UserConfigPayload {
  ai: AiPayload;
  startMessage: string;
  names: Matcher[];
  tendToReply: Matcher[];
  tendToReplyProbability: number;
  tendToIgnore: Matcher[];
  tendToIgnoreProbability: number;
  randomReplyProbability: number;
  blacklistedReactions: string[];
  nepons: string[];
  filesMaxAge: number;
  adminIds?: number[];
  trustedIds?: number[];
  availableModels: string[];
  maxMessagesToStore: number;
  responseDelay: number;
}

export interface ChatOverridePayload {
  ai?: Partial<ChatEditableAiPayload>;
  names?: Matcher[];
  tendToReply?: Matcher[];
  tendToReplyProbability?: number;
  tendToIgnore?: Matcher[];
  tendToIgnoreProbability?: number;
  randomReplyProbability?: number;
  blacklistedReactions?: string[];
  nepons?: string[];
  responseDelay?: number;
}

function normalizeThinkingConfig(value: unknown): GoogleThinkingConfig {
  if (!value || typeof value !== "object") {
    return {};
  }

  const obj = value as Partial<GoogleThinkingConfig>;
  return {
    thinkingLevel: obj.thinkingLevel,
    includeThoughts: obj.includeThoughts,
  };
}

function normalizeOpenRouterReasoningConfig(
  value: unknown,
): OpenRouterReasoningConfig {
  if (!value || typeof value !== "object") {
    return {};
  }

  const obj = value as Partial<OpenRouterReasoningConfig>;
  return {
    maxTokens: obj.maxTokens,
  };
}

function normalizeGenerationTaskConfig(
  value: unknown,
  base: GenerationTaskConfig,
): GenerationTaskConfig {
  if (!value || typeof value !== "object") {
    return {
      ...base,
      thinking: {},
      openrouterReasoning: {},
    };
  }

  const obj = value as Partial<GenerationTaskConfig>;
  return {
    ...base,
    ...obj,
    thinking: normalizeThinkingConfig(obj.thinking),
    openrouterReasoning: normalizeOpenRouterReasoningConfig(
      obj.openrouterReasoning,
    ),
  };
}

function normalizeGenerationConfig(
  value: unknown,
  base: AiPayload["generation"],
): AiPayload["generation"] {
  const obj = value && typeof value === "object"
    ? (value as Partial<AiPayload["generation"]>)
    : {};

  return {
    chat: normalizeGenerationTaskConfig(obj.chat, base.chat),
    character: normalizeGenerationTaskConfig(obj.character, base.character),
  };
}

export interface ResolvedChatOverridePayload {
  ai: ChatEditableAiPayload;
  names: Matcher[];
  tendToReply: Matcher[];
  tendToReplyProbability: number;
  tendToIgnore: Matcher[];
  tendToIgnoreProbability: number;
  randomReplyProbability: number;
  blacklistedReactions: string[];
  nepons: string[];
  responseDelay: number;
}

export interface GlobalFormText {
  names: string;
  tendToReply: string;
  tendToIgnore: string;
  blacklistedReactions: string;
  nepons: string;
  adminIds: string;
  trustedIds: string;
  availableModels: string;
}

export interface ChatFormText {
  names: string;
  tendToReply: string;
  tendToIgnore: string;
  blacklistedReactions: string;
  nepons: string;
}

export function defaultAiConfig(): AiPayload {
  return {
    model: "",
    temperature: 0.8,
    topK: 40,
    topP: 0.95,
    prePrompt: "",
    prompt: "",
    privateChatPromptAddition: "",
    groupChatPromptAddition: "",
    commentsPromptAddition: "",
    hateModePrompt: "",
    finalPrompt: "",
    chatActionsToolDescription: "",
    messagesToPass: 5,
    messageMaxLength: 4096,
    includeAttachmentsInHistory: true,
    bytesLimit: 20 * 1024 * 1024,
    google: {
      safetySettings: [
        {
          category: "HARM_CATEGORY_HARASSMENT",
          threshold: "BLOCK_NONE",
        },
        {
          category: "HARM_CATEGORY_HATE_SPEECH",
          threshold: "BLOCK_NONE",
        },
        {
          category: "HARM_CATEGORY_SEXUALLY_EXPLICIT",
          threshold: "BLOCK_NONE",
        },
        {
          category: "HARM_CATEGORY_DANGEROUS_CONTENT",
          threshold: "BLOCK_NONE",
        },
      ],
      structuredOutputs: true,
    },
    openrouter: {
      usageInclude: false,
    },
    generation: {
      chat: {
        maxOutputTokens: 512,
        thinking: {},
        openrouterReasoning: {},
      },
      character: {
        thinking: {},
        openrouterReasoning: {},
      },
    },
  };
}

export function defaultChatEditableAiConfig(
  source?: Partial<AiPayload>,
): ChatEditableAiPayload {
  const base = source ?? {};
  return {
    model: typeof base.model === "string" ? base.model : "",
    temperature: typeof base.temperature === "number" ? base.temperature : 0.8,
    topK: typeof base.topK === "number" ? base.topK : 40,
    topP: typeof base.topP === "number" ? base.topP : 0.95,
    prompt: typeof base.prompt === "string" ? base.prompt : "",
    privateChatPromptAddition:
      typeof base.privateChatPromptAddition === "string"
        ? base.privateChatPromptAddition
        : "",
    groupChatPromptAddition: typeof base.groupChatPromptAddition === "string"
      ? base.groupChatPromptAddition
      : "",
    commentsPromptAddition: typeof base.commentsPromptAddition === "string"
      ? base.commentsPromptAddition
      : "",
    hateModePrompt: typeof base.hateModePrompt === "string"
      ? base.hateModePrompt
      : "",
    messagesToPass: typeof base.messagesToPass === "number"
      ? base.messagesToPass
      : 5,
    messageMaxLength: typeof base.messageMaxLength === "number"
      ? base.messageMaxLength
      : 4096,
    includeAttachmentsInHistory:
      typeof base.includeAttachmentsInHistory === "boolean"
        ? base.includeAttachmentsInHistory
        : true,
    bytesLimit: typeof base.bytesLimit === "number"
      ? base.bytesLimit
      : 20 * 1024 * 1024,
  };
}

export function defaultGlobalConfig(): UserConfigPayload {
  return {
    ai: defaultAiConfig(),
    startMessage: "",
    names: [],
    tendToReply: [],
    tendToReplyProbability: 50,
    tendToIgnore: [],
    tendToIgnoreProbability: 90,
    randomReplyProbability: 1,
    blacklistedReactions: [],
    nepons: [],
    filesMaxAge: 72,
    adminIds: [],
    trustedIds: [],
    availableModels: [],
    maxMessagesToStore: 100,
    responseDelay: 1,
  };
}

export function parseChatIdFromStartParam(value: string | null): string {
  if (!value) return "";
  const match = /^config_(-?\d+)$/.exec(value.trim());
  return match?.[1] ?? "";
}

export function matcherToLine(value: Matcher): string {
  if (typeof value === "string") return value;
  if (typeof value.__regex !== "string" || value.__regex.length === 0) {
    return "";
  }

  return `/${value.__regex}/${value.flags ?? ""}`;
}

export function lineToMatcher(value: string): Matcher {
  const trimmed = value.trim();
  if (!trimmed.startsWith("/")) return trimmed;
  const lastSlash = trimmed.lastIndexOf("/");
  if (lastSlash <= 0) return trimmed;
  return {
    __regex: trimmed.slice(1, lastSlash),
    flags: trimmed.slice(lastSlash + 1),
  };
}

export function matcherListToTextarea(values: Matcher[]): string {
  return values
    .map(matcherToLine)
    .filter((line) => line.length > 0)
    .join("\n");
}

export function matcherTextareaToList(value: string): Matcher[] {
  return value
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map(lineToMatcher);
}

export function stringListToTextarea(values: string[]): string {
  return values.join("\n");
}

export function textareaToStringList(value: string): string[] {
  return value
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

export function textareaToNumberList(value: string): number[] {
  return value
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => Number(line))
    .filter((num) => Number.isFinite(num));
}

function normalizeModels(value: unknown): string[] {
  if (!Array.isArray(value)) return [];

  const unique = new Set<string>();
  for (const item of value) {
    if (typeof item !== "string") continue;
    const trimmed = item.trim();
    if (trimmed.length > 0) unique.add(trimmed);
  }

  return Array.from(unique);
}

export function fromUnknownGlobal(payload: unknown): UserConfigPayload {
  const base = defaultGlobalConfig();
  const obj = payload && typeof payload === "object"
    ? (payload as Partial<UserConfigPayload>)
    : {};
  const ai = obj.ai && typeof obj.ai === "object"
    ? (obj.ai as Partial<AiPayload>)
    : {};
  const generation = normalizeGenerationConfig(
    ai.generation,
    base.ai.generation,
  );

  return {
    ...base,
    ...obj,
    ai: {
      ...base.ai,
      ...ai,
      generation,
    },
    names: Array.isArray(obj.names) ? obj.names : [],
    tendToReply: Array.isArray(obj.tendToReply) ? obj.tendToReply : [],
    tendToIgnore: Array.isArray(obj.tendToIgnore) ? obj.tendToIgnore : [],
    blacklistedReactions: Array.isArray(obj.blacklistedReactions)
      ? obj.blacklistedReactions.filter((item): item is string =>
        typeof item === "string"
      )
      : [],
    nepons: Array.isArray(obj.nepons)
      ? obj.nepons.filter((item): item is string => typeof item === "string")
      : [],
    adminIds: Array.isArray(obj.adminIds)
      ? obj.adminIds.filter((item): item is number => typeof item === "number")
      : [],
    trustedIds: Array.isArray(obj.trustedIds)
      ? obj.trustedIds.filter((item): item is number =>
        typeof item === "number"
      )
      : [],
    availableModels: normalizeModels(obj.availableModels),
  };
}

export function resolveChatOverridePayload(
  payload: unknown,
  global: UserConfigPayload,
): ResolvedChatOverridePayload {
  const obj = payload && typeof payload === "object"
    ? (payload as ChatOverridePayload)
    : {};
  const baseAi = defaultChatEditableAiConfig(global.ai);
  const overrideAi = obj.ai ?? {};
  return {
    ai: {
      ...baseAi,
      ...overrideAi,
    },
    names: obj.names ?? global.names,
    tendToReply: obj.tendToReply ?? global.tendToReply,
    tendToReplyProbability: obj.tendToReplyProbability ??
      global.tendToReplyProbability,
    tendToIgnore: obj.tendToIgnore ?? global.tendToIgnore,
    tendToIgnoreProbability: obj.tendToIgnoreProbability ??
      global.tendToIgnoreProbability,
    randomReplyProbability: obj.randomReplyProbability ??
      global.randomReplyProbability,
    blacklistedReactions: obj.blacklistedReactions ??
      global.blacklistedReactions,
    nepons: obj.nepons ?? global.nepons,
    responseDelay: obj.responseDelay ?? global.responseDelay,
  };
}

export const fromUnknownChatOverride = resolveChatOverridePayload;

export function fromUnknownCurrentCharacter(
  payload: unknown,
): CurrentCharacterPayload | undefined {
  if (!payload || typeof payload !== "object") {
    return undefined;
  }

  const obj = payload as Record<string, unknown>;
  if (typeof obj.name !== "string") {
    return undefined;
  }

  const names = Array.isArray(obj.names)
    ? obj.names.filter((item): item is string => typeof item === "string")
    : [];

  return {
    name: obj.name,
    names,
    description: typeof obj.description === "string" ? obj.description : "",
    scenario: typeof obj.scenario === "string" ? obj.scenario : "",
    systemPrompt: typeof obj.systemPrompt === "string" ? obj.systemPrompt : "",
    postHistoryInstructions: typeof obj.postHistoryInstructions === "string"
      ? obj.postHistoryInstructions
      : "",
    firstMessage: typeof obj.firstMessage === "string" ? obj.firstMessage : "",
    messageExample: typeof obj.messageExample === "string"
      ? obj.messageExample
      : "",
  };
}
export function globalTextFromConfig(
  config: UserConfigPayload,
): GlobalFormText {
  return {
    names: matcherListToTextarea(config.names),
    tendToReply: matcherListToTextarea(config.tendToReply),
    tendToIgnore: matcherListToTextarea(config.tendToIgnore),
    blacklistedReactions: stringListToTextarea(
      config.blacklistedReactions ?? [],
    ),
    nepons: stringListToTextarea(config.nepons),
    adminIds: stringListToTextarea((config.adminIds ?? []).map(String)),
    trustedIds: stringListToTextarea((config.trustedIds ?? []).map(String)),
    availableModels: stringListToTextarea(config.availableModels ?? []),
  };
}

export function chatTextFromConfig(
  config: ResolvedChatOverridePayload,
): ChatFormText {
  return {
    names: matcherListToTextarea(config.names ?? []),
    tendToReply: matcherListToTextarea(config.tendToReply ?? []),
    tendToIgnore: matcherListToTextarea(config.tendToIgnore ?? []),
    blacklistedReactions: stringListToTextarea(
      config.blacklistedReactions ?? [],
    ),
    nepons: stringListToTextarea(config.nepons ?? []),
  };
}

export function buildGlobalPayload(
  config: UserConfigPayload,
  text: GlobalFormText,
): UserConfigPayload {
  return {
    ...config,
    names: matcherTextareaToList(text.names),
    tendToReply: matcherTextareaToList(text.tendToReply),
    tendToIgnore: matcherTextareaToList(text.tendToIgnore),
    blacklistedReactions: textareaToStringList(text.blacklistedReactions),
    nepons: textareaToStringList(text.nepons),
    adminIds: textareaToNumberList(text.adminIds),
    trustedIds: textareaToNumberList(text.trustedIds),
    availableModels: textareaToStringList(text.availableModels),
  };
}
