import {
  chatOverrideContract,
  type ChatOverridePath,
} from "../../../../lib/config-contract";
import {
  type ChatFormText,
  type ChatOverridePayload,
  type Matcher,
  matcherListToTextarea,
  matcherTextareaToList,
  matcherToLine,
  type ResolvedChatOverridePayload,
  stringListToTextarea,
  textareaToStringList,
} from "./model";

export type { ChatOverridePath };

type TextKey = keyof ChatFormText;

interface ChatOverrideField {
  path: ChatOverridePath;
  textKey?: TextKey;
  textKind?: "matcherList" | "stringList";
  fallback?: unknown;
}

const widgetFieldMeta: Partial<
  Record<ChatOverridePath, Omit<ChatOverrideField, "path">>
> = {
  names: { textKey: "names", textKind: "matcherList" },
  tendToReply: { textKey: "tendToReply", textKind: "matcherList" },
  tendToIgnore: { textKey: "tendToIgnore", textKind: "matcherList" },
  blacklistedReactions: {
    textKey: "blacklistedReactions",
    textKind: "stringList",
  },
  nepons: { textKey: "nepons", textKind: "stringList" },
  "ai.historyVersion": { fallback: "v2" },
  "ai.prompt": { fallback: "" },
  "ai.dumbPrompt": { fallback: "" },
  "ai.privateChatPromptAddition": { fallback: "" },
  "ai.groupChatPromptAddition": { fallback: "" },
  "ai.commentsPromptAddition": { fallback: "" },
  "ai.hateModePrompt": { fallback: "" },
  "ai.replyMethod": { fallback: "" },
};

function buildField(path: ChatOverridePath): ChatOverrideField {
  return { path, ...widgetFieldMeta[path] };
}

export const CHAT_OVERRIDE_FIELDS: readonly ChatOverrideField[] = [
  ...chatOverrideContract.regularDelta.map(buildField),
  ...chatOverrideContract.regularDirect.map(buildField),
  ...chatOverrideContract.trustedAi
    .map((key) => buildField(`ai.${key}` as ChatOverridePath)),
  ...chatOverrideContract.adminWindow.map(buildField),
] as const;

function getPath(source: unknown, path: ChatOverridePath): unknown {
  let current = source;
  for (const part of path.split(".")) {
    if (!current || typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

function setPath(
  target: Record<string, unknown>,
  path: ChatOverridePath,
  value: unknown,
): void {
  const parts = path.split(".");
  let current = target;
  for (const part of parts.slice(0, -1)) {
    const existing = current[part];
    if (
      !existing || typeof existing !== "object" || Array.isArray(existing)
    ) {
      current[part] = {};
    }
    current = current[part] as Record<string, unknown>;
  }
  current[parts[parts.length - 1]] = value;
}

function valuesEqual(a: unknown, b: unknown): boolean {
  if (isMatcherList(a) && isMatcherList(b)) {
    if (a.length !== b.length) return false;
    return a.every((item, index) =>
      matcherToLine(item) === matcherToLine(b[index])
    );
  }

  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    return a.every((item, index) => valuesEqual(item, b[index]));
  }

  return a === b;
}

function isMatcherList(value: unknown): value is Matcher[] {
  return Array.isArray(value) &&
    value.every((item) =>
      typeof item === "string" ||
      Boolean(item && typeof item === "object" && "__regex" in item)
    );
}

function valueForComparison(value: unknown, fallback: unknown): unknown {
  return value ?? fallback;
}

function readEditedValue(
  field: ChatOverrideField,
  config: ResolvedChatOverridePayload,
  text: ChatFormText,
): unknown {
  if (!field.textKey) return getPath(config, field.path);

  if (field.textKind === "matcherList") {
    return matcherTextareaToList(text[field.textKey]);
  }

  return textareaToStringList(text[field.textKey]);
}

function readBaseValue(
  field: ChatOverrideField,
  base: ResolvedChatOverridePayload,
): unknown {
  return getPath(base, field.path);
}

export function buildChatPayload(
  config: ResolvedChatOverridePayload,
  text: ChatFormText,
  base: ResolvedChatOverridePayload,
): ChatOverridePayload {
  const payload: Record<string, unknown> = {};

  for (const field of CHAT_OVERRIDE_FIELDS) {
    const edited = readEditedValue(field, config, text);
    const inherited = readBaseValue(field, base);
    if (
      !valuesEqual(
        valueForComparison(edited, field.fallback),
        valueForComparison(inherited, field.fallback),
      )
    ) {
      setPath(payload, field.path, edited);
    }
  }

  // Path metadata builds only ChatOverridePayload keys, but TS cannot infer it.
  return payload as ChatOverridePayload;
}

export function collectChatOverridePaths(
  payload: ChatOverridePayload,
): ChatOverridePath[] {
  return CHAT_OVERRIDE_FIELDS
    .map((field) => field.path)
    .filter((path) => getPath(payload, path) !== undefined);
}

export function resetChatOverridePath(
  path: ChatOverridePath,
  config: ResolvedChatOverridePayload,
  text: ChatFormText,
  base: ResolvedChatOverridePayload,
): void {
  const field = CHAT_OVERRIDE_FIELDS.find((item) => item.path === path);
  if (!field) return;

  const inherited = readBaseValue(field, base);
  // ResolvedChatOverridePayload is mutable form state; setPath needs an indexable view.
  setPath(config as unknown as Record<string, unknown>, path, inherited);

  if (!field.textKey) return;

  if (field.textKind === "matcherList") {
    text[field.textKey] = matcherListToTextarea(inherited as Matcher[]);
    return;
  }

  text[field.textKey] = stringListToTextarea(inherited as string[]);
}
