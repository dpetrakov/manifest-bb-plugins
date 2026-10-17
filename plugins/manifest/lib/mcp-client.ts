// Minimal MCP client for the Manifest server (EP-069, ADR-046).
//
// Manifest serves MCP over Streamable HTTP in stateless JSON mode, so one tool
// call is one POST of a JSON-RPC request: no session, no SSE. A tiny client is
// enough and keeps the plugin free of extra runtime dependencies.

export const PROTOCOL_VERSION = "2025-06-18";
/** The tool contract this plugin speaks (manifest_whoami.contract). */
export const CONTRACT_VERSION = 1;

export type ActorKind = "panel" | "agent";

export type ManifestErrorCode = "unauthorized" | "unavailable" | "tool" | "protocol";

export class ManifestError extends Error {
  /** unauthorized — token missing/revoked; unavailable — network/5xx; tool — the tool refused. */
  readonly code: ManifestErrorCode;
  constructor(message: string, code: ManifestErrorCode) {
    super(message);
    this.name = "ManifestError";
    this.code = code;
  }
}

export interface ToolCallResult {
  structured: unknown;
  text: string;
}

type Fetch = typeof fetch;

/**
 * Normalises the Manifest address entered by a person: scheme (https by
 * default), no trailing slash. Plain http is refused except for a local
 * Manifest: the password and the token must not travel in clear text.
 */
export function normalizeBaseUrl(raw: string): string {
  let url = raw.trim();
  if (url === "") return "";
  if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
  url = url.replace(/\/+$/, "");
  if (/^http:\/\//i.test(url) && !/^http:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/i.test(url)) {
    throw new ManifestError("Нужен адрес https://… — пароль и токен нельзя передавать без шифрования", "protocol");
  }
  return url;
}

let nextId = 1;

/** Calls one MCP tool; throws ManifestError on transport or tool failure. */
export async function callTool(
  baseUrl: string,
  token: string,
  name: string,
  args: Record<string, unknown>,
  actor: ActorKind,
  fetchImpl: Fetch = fetch,
  signal?: AbortSignal,
): Promise<ToolCallResult> {
  if (!baseUrl || !token) throw new ManifestError("Плагин не подключён к Manifest", "unauthorized");
  let resp: Response;
  try {
    resp = await fetchImpl(`${baseUrl}/api/mcp`, {
      method: "POST",
      signal,
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
        Authorization: `Bearer ${token}`,
        "MCP-Protocol-Version": PROTOCOL_VERSION,
        "X-Manifest-Actor-Kind": actor,
      },
      body: JSON.stringify({ jsonrpc: "2.0", id: nextId++, method: "tools/call", params: { name, arguments: args } }),
    });
  } catch (error) {
    throw new ManifestError(`Manifest недоступен: ${error instanceof Error ? error.message : String(error)}`, "unavailable");
  }
  if (resp.status === 401) throw new ManifestError("Токен недействителен или отозван — войдите снова", "unauthorized");
  if (!resp.ok) throw new ManifestError(`Manifest ответил ${resp.status}`, "unavailable");
  let body: {
    error?: { message?: string };
    result?: { isError?: boolean; structuredContent?: unknown; content?: { type: string; text?: string }[] };
  };
  try {
    body = await resp.json();
  } catch {
    throw new ManifestError("Некорректный ответ Manifest", "protocol");
  }
  if (body.error) throw new ManifestError(body.error.message ?? "Ошибка протокола MCP", "protocol");
  const result = body.result ?? {};
  const text = (result.content ?? [])
    .filter((c) => c.type === "text" && typeof c.text === "string")
    .map((c) => c.text as string)
    .join("\n");
  if (result.isError) throw new ManifestError(text || "Manifest отклонил действие", "tool");
  return { structured: result.structuredContent ?? null, text };
}

/** Exchanges email + password for a token (POST /api/plugin/auth/login). */
export async function login(
  baseUrl: string,
  email: string,
  password: string,
  device: string,
  fetchImpl: Fetch = fetch,
): Promise<{ token: string; email: string; expiresAt: string }> {
  let resp: Response;
  try {
    resp = await fetchImpl(`${baseUrl}/api/plugin/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, device }),
    });
  } catch (error) {
    throw new ManifestError(`Manifest недоступен: ${error instanceof Error ? error.message : String(error)}`, "unavailable");
  }
  const body = (await resp.json().catch(() => ({}))) as { token?: string; email?: string; expires_at?: string; detail?: string };
  if (!resp.ok || !body.token) {
    throw new ManifestError(body.detail ?? `Вход не выполнен (${resp.status})`, resp.status === 401 ? "unauthorized" : "unavailable");
  }
  return { token: body.token, email: body.email ?? email, expiresAt: body.expires_at ?? "" };
}

/** Revokes the token (POST /api/plugin/auth/logout); failures are not fatal. */
export async function logout(baseUrl: string, token: string, fetchImpl: Fetch = fetch): Promise<void> {
  if (!baseUrl || !token) return;
  try {
    await fetchImpl(`${baseUrl}/api/plugin/auth/logout`, { method: "POST", headers: { Authorization: `Bearer ${token}` } });
  } catch {
    /* the token is forgotten locally anyway */
  }
}
