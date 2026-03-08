import type {
  BootstrapResponse,
  ChatInternalsPayload,
  ChatOverridePayload,
  UserConfigPayload,
} from "./model";
import { translate, type WidgetLocale } from "$lib/i18n";

interface ApiResult<T> {
  ok: boolean;
  data?: T;
  error?: string;
}

interface SafeFetchResult {
  ok: boolean;
  response?: Response;
  error?: string;
}

function buildHeaders(initDataRaw: string): HeadersInit {
  return {
    "content-type": "application/json",
    "x-telegram-init-data": initDataRaw,
  };
}

async function parseJsonResponse(
  response: Response,
): Promise<Record<string, unknown>> {
  try {
    return (await response.json()) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function errorFromResponse(
  payload: Record<string, unknown>,
  fallback: string,
): string {
  const error = payload.error;
  return typeof error === "string" && error.length > 0 ? error : fallback;
}

async function safeFetch(
  input: string,
  locale: WidgetLocale,
  init?: RequestInit,
): Promise<SafeFetchResult> {
  try {
    const response = await fetch(input, init);
    return { ok: true, response };
  } catch {
    return {
      ok: false,
      error: translate(locale, "api.networkFailed"),
    };
  }
}

export async function fetchBootstrap(
  chatId: string,
  initDataRaw: string,
  locale: WidgetLocale,
  signal?: AbortSignal,
): Promise<ApiResult<BootstrapResponse>> {
  const query = new URLSearchParams();
  if (chatId.trim()) {
    query.set("chatId", chatId.trim());
  }

  const request = await safeFetch(
    `/api/config/bootstrap?${query.toString()}`,
    locale,
    {
      headers: buildHeaders(initDataRaw),
      signal,
    },
  );
  if (!request.ok || !request.response) {
    return {
      ok: false,
      error: request.error ?? translate(locale, "api.failedLoad"),
    };
  }

  const response = request.response;
  const payload = await parseJsonResponse(response);

  if (!response.ok) {
    return {
      ok: false,
      error: errorFromResponse(payload, translate(locale, "api.failedLoad")),
    };
  }

  return {
    ok: true,
    data: payload as unknown as BootstrapResponse,
  };
}

export async function saveGlobalConfig(
  payload: UserConfigPayload,
  initDataRaw: string,
  locale: WidgetLocale,
): Promise<ApiResult<undefined>> {
  const request = await safeFetch("/api/config/global", locale, {
    method: "PUT",
    headers: buildHeaders(initDataRaw),
    body: JSON.stringify({ payload }),
  });
  if (!request.ok || !request.response) {
    return {
      ok: false,
      error: request.error ?? translate(locale, "api.failedSaveGlobal"),
    };
  }

  const response = request.response;
  const body = await parseJsonResponse(response);

  if (!response.ok) {
    return {
      ok: false,
      error: errorFromResponse(
        body,
        translate(locale, "api.failedSaveGlobal"),
      ),
    };
  }

  return { ok: true };
}

export async function saveChatConfig(
  chatId: string,
  payload: ChatOverridePayload,
  initDataRaw: string,
  locale: WidgetLocale,
): Promise<ApiResult<undefined>> {
  const request = await safeFetch(`/api/config/chat/${chatId}`, locale, {
    method: "PUT",
    headers: buildHeaders(initDataRaw),
    body: JSON.stringify({ payload }),
  });
  if (!request.ok || !request.response) {
    return {
      ok: false,
      error: request.error ?? translate(locale, "api.failedSaveChat"),
    };
  }

  const response = request.response;
  const body = await parseJsonResponse(response);

  if (!response.ok) {
    return {
      ok: false,
      error: errorFromResponse(body, translate(locale, "api.failedSaveChat")),
    };
  }

  return { ok: true };
}

export async function saveChatInternals(
  chatId: string,
  payload: ChatInternalsPayload,
  initDataRaw: string,
  locale: WidgetLocale,
): Promise<ApiResult<undefined>> {
  const request = await safeFetch(
    `/api/config/chat/${chatId}/internals`,
    locale,
    {
      method: "PUT",
      headers: buildHeaders(initDataRaw),
      body: JSON.stringify({ payload }),
    },
  );
  if (!request.ok || !request.response) {
    return {
      ok: false,
      error: request.error ?? translate(locale, "api.failedSaveInternals"),
    };
  }

  const response = request.response;
  const body = await parseJsonResponse(response);

  if (!response.ok) {
    return {
      ok: false,
      error: errorFromResponse(
        body,
        translate(locale, "api.failedSaveInternals"),
      ),
    };
  }

  return { ok: true };
}
