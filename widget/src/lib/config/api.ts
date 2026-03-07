import type {
  BootstrapResponse,
  ChatInternalsPayload,
  ChatOverridePayload,
  UserConfigPayload,
} from "./model";

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
  init?: RequestInit,
): Promise<SafeFetchResult> {
  try {
    const response = await fetch(input, init);
    return { ok: true, response };
  } catch {
    return {
      ok: false,
      error: "Network request failed",
    };
  }
}

export async function fetchBootstrap(
  chatId: string,
  initDataRaw: string,
  signal?: AbortSignal,
): Promise<ApiResult<BootstrapResponse>> {
  const query = new URLSearchParams();
  if (chatId.trim()) {
    query.set("chatId", chatId.trim());
  }

  const request = await safeFetch(`/api/config/bootstrap?${query.toString()}`, {
    headers: buildHeaders(initDataRaw),
    signal,
  });
  if (!request.ok || !request.response) {
    return {
      ok: false,
      error: request.error ?? "Failed to load",
    };
  }

  const response = request.response;
  const payload = await parseJsonResponse(response);

  if (!response.ok) {
    return {
      ok: false,
      error: errorFromResponse(payload, "Failed to load"),
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
): Promise<ApiResult<undefined>> {
  const request = await safeFetch("/api/config/global", {
    method: "PUT",
    headers: buildHeaders(initDataRaw),
    body: JSON.stringify({ payload }),
  });
  if (!request.ok || !request.response) {
    return {
      ok: false,
      error: request.error ?? "Failed to save global config",
    };
  }

  const response = request.response;
  const body = await parseJsonResponse(response);

  if (!response.ok) {
    return {
      ok: false,
      error: errorFromResponse(body, "Failed to save global config"),
    };
  }

  return { ok: true };
}

export async function saveChatConfig(
  chatId: string,
  payload: ChatOverridePayload,
  initDataRaw: string,
): Promise<ApiResult<undefined>> {
  const request = await safeFetch(`/api/config/chat/${chatId}`, {
    method: "PUT",
    headers: buildHeaders(initDataRaw),
    body: JSON.stringify({ payload }),
  });
  if (!request.ok || !request.response) {
    return {
      ok: false,
      error: request.error ?? "Failed to save chat override",
    };
  }

  const response = request.response;
  const body = await parseJsonResponse(response);

  if (!response.ok) {
    return {
      ok: false,
      error: errorFromResponse(body, "Failed to save chat override"),
    };
  }

  return { ok: true };
}

export async function saveChatInternals(
  chatId: string,
  payload: ChatInternalsPayload,
  initDataRaw: string,
): Promise<ApiResult<undefined>> {
  const request = await safeFetch(`/api/config/chat/${chatId}/internals`, {
    method: "PUT",
    headers: buildHeaders(initDataRaw),
    body: JSON.stringify({ payload }),
  });
  if (!request.ok || !request.response) {
    return {
      ok: false,
      error: request.error ?? "Failed to save chat internals",
    };
  }

  const response = request.response;
  const body = await parseJsonResponse(response);

  if (!response.ok) {
    return {
      ok: false,
      error: errorFromResponse(body, "Failed to save chat internals"),
    };
  }

  return { ok: true };
}
