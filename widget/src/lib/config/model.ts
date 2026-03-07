export type ConfigScope = "global" | "chat";
export type ConfigRole = "viewer" | "regular" | "trusted" | "admin";

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
  canEditChat: boolean;
  canEditChatInternals?: boolean;
  globalPayload?: unknown;
  chatOverridePayload?: unknown;
  effectiveConfigPayload?: unknown;
  currentCharacter?: unknown;
  chatInternalsPayload?: unknown;
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

export interface ChatInternalsPayload {
  summary: string;
  personalNotes: string;
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
  thinkingBudget?: number;
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
  notesModel?: string;
  memoryModel?: string;
  temperature: number;
  topK: number;
  topP: number;
  prePrompt: string;
  prompt: string;
  dumbPrompt?: string;
  useJsonResponses: boolean;
  dumbPrePrompt?: string;
  privateChatPromptAddition?: string;
  groupChatPromptAddition?: string;
  commentsPromptAddition?: string;
  hateModePrompt?: string;
  finalPrompt: string;
  dumbFinalPrompt?: string;
  notesPrompt: string;
  memoryPrompt: string;
  memoryPromptRepeat: string;
  messagesToPass: number;
  notesFrequency: number;
  memoryFrequency: number;
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
    notes: GenerationTaskConfig;
    memory: GenerationTaskConfig;
    character: GenerationTaskConfig;
  };
}

export interface ChatEditableAiPayload {
  model: string;
  temperature: number;
  topK: number;
  topP: number;
  prompt?: string;
  dumbPrompt?: string;
  privateChatPromptAddition?: string;
  groupChatPromptAddition?: string;
  commentsPromptAddition?: string;
  hateModePrompt?: string;
  useJsonResponses: boolean;
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
  maxNotesToStore: number;
  maxMessagesToStore: number;
  chatLastUseNotes: number;
  chatLastUseMemory: number;
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
    thinkingBudget: obj.thinkingBudget,
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
    notes: normalizeGenerationTaskConfig(obj.notes, base.notes),
    memory: normalizeGenerationTaskConfig(obj.memory, base.memory),
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
    notesModel: "",
    memoryModel: "",
    temperature: 0.8,
    topK: 40,
    topP: 0.95,
    prePrompt: "",
    prompt: "",
    dumbPrompt: "",
    useJsonResponses: true,
    dumbPrePrompt: "",
    privateChatPromptAddition: "",
    groupChatPromptAddition: "",
    commentsPromptAddition: "",
    hateModePrompt: "",
    finalPrompt: "",
    dumbFinalPrompt: "",
    notesPrompt: "",
    memoryPrompt: "",
    memoryPromptRepeat: "",
    messagesToPass: 5,
    notesFrequency: 150,
    memoryFrequency: 50,
    messageMaxLength: 4096,
    includeAttachmentsInHistory: true,
    bytesLimit: 20 * 1024 * 1024,
    google: {
      safetySettings: [
        { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
        { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
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
      notes: {
        thinking: {},
        openrouterReasoning: {},
      },
      memory: {
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
    dumbPrompt: typeof base.dumbPrompt === "string" ? base.dumbPrompt : "",
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
    useJsonResponses: typeof base.useJsonResponses === "boolean"
      ? base.useJsonResponses
      : true,
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
    maxNotesToStore: 5,
    maxMessagesToStore: 100,
    chatLastUseNotes: 3,
    chatLastUseMemory: 2,
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

export function fromUnknownChatOverride(
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

export function defaultChatInternals(): ChatInternalsPayload {
  return {
    summary: "",
    personalNotes: "",
  };
}

export function fromUnknownChatInternals(
  payload: unknown,
): ChatInternalsPayload {
  const base = defaultChatInternals();
  if (!payload || typeof payload !== "object") {
    return base;
  }

  const obj = payload as Record<string, unknown>;
  return {
    summary: typeof obj.summary === "string" ? obj.summary : base.summary,
    personalNotes: typeof obj.personalNotes === "string"
      ? obj.personalNotes
      : base.personalNotes,
  };
}

export function globalTextFromConfig(
  config: UserConfigPayload,
): GlobalFormText {
  return {
    names: matcherListToTextarea(config.names),
    tendToReply: matcherListToTextarea(config.tendToReply),
    tendToIgnore: matcherListToTextarea(config.tendToIgnore),
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
    nepons: textareaToStringList(text.nepons),
    adminIds: textareaToNumberList(text.adminIds),
    trustedIds: textareaToNumberList(text.trustedIds),
    availableModels: textareaToStringList(text.availableModels),
  };
}

function equalMatcherList(a: Matcher[], b: Matcher[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((item, index) =>
    matcherToLine(item) === matcherToLine(b[index])
  );
}

function equalStringList(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((item, index) => item === b[index]);
}

export function buildChatPayload(
  config: ResolvedChatOverridePayload,
  text: ChatFormText,
  base: ResolvedChatOverridePayload,
): ChatOverridePayload {
  const names = matcherTextareaToList(text.names);
  const tendToReply = matcherTextareaToList(text.tendToReply);
  const tendToIgnore = matcherTextareaToList(text.tendToIgnore);
  const blacklistedReactions = textareaToStringList(text.blacklistedReactions);
  const nepons = textareaToStringList(text.nepons);

  const payload: ChatOverridePayload = {};
  if (!equalMatcherList(names, base.names)) payload.names = names;
  if (!equalMatcherList(tendToReply, base.tendToReply)) {
    payload.tendToReply = tendToReply;
  }
  if (!equalMatcherList(tendToIgnore, base.tendToIgnore)) {
    payload.tendToIgnore = tendToIgnore;
  }
  if (!equalStringList(blacklistedReactions, base.blacklistedReactions)) {
    payload.blacklistedReactions = blacklistedReactions;
  }
  if (!equalStringList(nepons, base.nepons)) payload.nepons = nepons;
  if (config.tendToReplyProbability !== base.tendToReplyProbability) {
    payload.tendToReplyProbability = config.tendToReplyProbability;
  }
  if (config.tendToIgnoreProbability !== base.tendToIgnoreProbability) {
    payload.tendToIgnoreProbability = config.tendToIgnoreProbability;
  }
  if (config.randomReplyProbability !== base.randomReplyProbability) {
    payload.randomReplyProbability = config.randomReplyProbability;
  }
  if (config.responseDelay !== base.responseDelay) {
    payload.responseDelay = config.responseDelay;
  }

  const aiPayload: Partial<ChatEditableAiPayload> = {};
  if (config.ai.model !== base.ai.model) aiPayload.model = config.ai.model;
  if (config.ai.temperature !== base.ai.temperature) {
    aiPayload.temperature = config.ai.temperature;
  }
  if (config.ai.topK !== base.ai.topK) aiPayload.topK = config.ai.topK;
  if (config.ai.topP !== base.ai.topP) aiPayload.topP = config.ai.topP;
  if ((config.ai.prompt ?? "") !== (base.ai.prompt ?? "")) {
    aiPayload.prompt = config.ai.prompt;
  }
  if ((config.ai.dumbPrompt ?? "") !== (base.ai.dumbPrompt ?? "")) {
    aiPayload.dumbPrompt = config.ai.dumbPrompt;
  }
  if (
    (config.ai.privateChatPromptAddition ?? "") !==
      (base.ai.privateChatPromptAddition ?? "")
  ) {
    aiPayload.privateChatPromptAddition = config.ai.privateChatPromptAddition;
  }
  if (
    (config.ai.groupChatPromptAddition ?? "") !==
      (base.ai.groupChatPromptAddition ?? "")
  ) {
    aiPayload.groupChatPromptAddition = config.ai.groupChatPromptAddition;
  }
  if (
    (config.ai.commentsPromptAddition ?? "") !==
      (base.ai.commentsPromptAddition ?? "")
  ) {
    aiPayload.commentsPromptAddition = config.ai.commentsPromptAddition;
  }
  if ((config.ai.hateModePrompt ?? "") !== (base.ai.hateModePrompt ?? "")) {
    aiPayload.hateModePrompt = config.ai.hateModePrompt;
  }
  if (config.ai.useJsonResponses !== base.ai.useJsonResponses) {
    aiPayload.useJsonResponses = config.ai.useJsonResponses;
  }
  if (config.ai.messagesToPass !== base.ai.messagesToPass) {
    aiPayload.messagesToPass = config.ai.messagesToPass;
  }
  if (config.ai.messageMaxLength !== base.ai.messageMaxLength) {
    aiPayload.messageMaxLength = config.ai.messageMaxLength;
  }
  if (
    config.ai.includeAttachmentsInHistory !==
      base.ai.includeAttachmentsInHistory
  ) {
    aiPayload.includeAttachmentsInHistory =
      config.ai.includeAttachmentsInHistory;
  }
  if (config.ai.bytesLimit !== base.ai.bytesLimit) {
    aiPayload.bytesLimit = config.ai.bytesLimit;
  }

  if (Object.keys(aiPayload).length > 0) {
    payload.ai = aiPayload;
  }

  return payload;
}

export function collectChatOverridePaths(
  payload: ChatOverridePayload,
): string[] {
  const paths: string[] = [];

  if (payload.names) paths.push("names");
  if (payload.tendToReply) paths.push("tendToReply");
  if (payload.tendToReplyProbability !== undefined) {
    paths.push("tendToReplyProbability");
  }
  if (payload.tendToIgnore) paths.push("tendToIgnore");
  if (payload.tendToIgnoreProbability !== undefined) {
    paths.push("tendToIgnoreProbability");
  }
  if (payload.randomReplyProbability !== undefined) {
    paths.push("randomReplyProbability");
  }
  if (payload.blacklistedReactions) paths.push("blacklistedReactions");
  if (payload.nepons) paths.push("nepons");
  if (payload.responseDelay !== undefined) paths.push("responseDelay");

  if (!payload.ai) {
    return paths;
  }

  if (payload.ai.model !== undefined) paths.push("ai.model");
  if (payload.ai.temperature !== undefined) paths.push("ai.temperature");
  if (payload.ai.topK !== undefined) paths.push("ai.topK");
  if (payload.ai.topP !== undefined) paths.push("ai.topP");
  if (payload.ai.prompt !== undefined) paths.push("ai.prompt");
  if (payload.ai.dumbPrompt !== undefined) paths.push("ai.dumbPrompt");
  if (payload.ai.privateChatPromptAddition !== undefined) {
    paths.push("ai.privateChatPromptAddition");
  }
  if (payload.ai.groupChatPromptAddition !== undefined) {
    paths.push("ai.groupChatPromptAddition");
  }
  if (payload.ai.commentsPromptAddition !== undefined) {
    paths.push("ai.commentsPromptAddition");
  }
  if (payload.ai.hateModePrompt !== undefined) {
    paths.push("ai.hateModePrompt");
  }
  if (payload.ai.useJsonResponses !== undefined) {
    paths.push("ai.useJsonResponses");
  }
  if (payload.ai.messagesToPass !== undefined) {
    paths.push("ai.messagesToPass");
  }
  if (payload.ai.messageMaxLength !== undefined) {
    paths.push("ai.messageMaxLength");
  }
  if (payload.ai.includeAttachmentsInHistory !== undefined) {
    paths.push("ai.includeAttachmentsInHistory");
  }
  if (payload.ai.bytesLimit !== undefined) paths.push("ai.bytesLimit");

  return paths;
}
