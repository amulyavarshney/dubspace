export class ApiClientError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public requestId?: string,
    public details?: unknown,
  ) {
    super(message);
    this.name = "ApiClientError";
  }
}

export async function apiFetch<T>(path: string, init: RequestInit & { json?: unknown } = {}): Promise<T> {
  const { json, headers, ...rest } = init;
  const res = await fetch(path.startsWith("/") ? path : `/api/v1/${path}`, {
    ...rest,
    credentials: "same-origin",
    headers: { Accept: "application/json", ...(json !== undefined ? { "Content-Type": "application/json" } : {}), ...(headers ?? {}) },
    body: json !== undefined ? JSON.stringify(json) : rest.body,
  });
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }
  if (!res.ok) {
    const err = (data ?? {}) as { code?: string; message?: string; requestId?: string; details?: unknown };
    throw new ApiClientError(res.status, err.code ?? "HTTP_ERROR", err.message ?? `Request failed (${res.status})`, err.requestId, err.details);
  }
  return data as T;
}

export const api = {
  get: <T>(path: string) => apiFetch<T>(path),
  post: <T>(path: string, json?: unknown) => apiFetch<T>(path, { method: "POST", json }),
  put: <T>(path: string, json?: unknown) => apiFetch<T>(path, { method: "PUT", json }),
  patch: <T>(path: string, json?: unknown) => apiFetch<T>(path, { method: "PATCH", json }),
  delete: <T>(path: string) => apiFetch<T>(path, { method: "DELETE" }),
};

export function errorMessage(err: unknown, fallback = "Something went wrong"): string {
  if (err instanceof ApiClientError) return err.message;
  if (err instanceof Error) return err.message;
  return fallback;
}
