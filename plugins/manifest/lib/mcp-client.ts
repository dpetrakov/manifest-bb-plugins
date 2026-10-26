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
    throw new ManifestError(`Manifest недоступен: ${netReason(error)}`, "unavailable");
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

/** Canonical tool catalog, filtered by Manifest's current user rights. */
export interface ManifestTool {
  name: string;
  description?: string;
  inputSchema: Record<string, unknown>;
}

export async function listTools(baseUrl: string, token: string, fetchImpl: Fetch = fetch): Promise<ManifestTool[]> {
  if (!baseUrl || !token) throw new ManifestError("Плагин не подключён к Manifest", "unauthorized");
  const tools: ManifestTool[] = [];
  let cursor: string | undefined;
  const cursors = new Set<string>();
  do {
    let resp: Response;
    try {
      resp = await fetchImpl(`${baseUrl}/api/mcp`, {
        method: "POST",
        signal: AbortSignal.timeout(10_000),
        headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream",
          Authorization: `Bearer ${token}`, "MCP-Protocol-Version": PROTOCOL_VERSION, "X-Manifest-Actor-Kind": "agent" },
        body: JSON.stringify({ jsonrpc: "2.0", id: nextId++, method: "tools/list", params: cursor ? { cursor } : {} }),
      });
    } catch (error) { throw new ManifestError(`Manifest недоступен: ${netReason(error)}`, "unavailable"); }
    if (resp.status === 401) throw new ManifestError("Токен недействителен или отозван — войдите снова", "unauthorized");
    if (!resp.ok) throw new ManifestError(`Manifest ответил ${resp.status}`, "unavailable");
    const body = await resp.json() as { error?: { message?: string }; result?: { tools?: ManifestTool[]; nextCursor?: string } };
    if (body.error || !Array.isArray(body.result?.tools)) throw new ManifestError(body.error?.message ?? "Некорректный каталог инструментов Manifest", "protocol");
    for (const tool of body.result.tools) {
      if (!/^[a-z][a-z0-9_]{0,63}$/.test(tool.name) || tool.inputSchema?.type !== "object" || JSON.stringify(tool.inputSchema).length > 128 * 1024) {
        throw new ManifestError("Некорректная схема инструмента Manifest", "protocol");
      }
      tools.push(tool);
    }
    cursor = body.result.nextCursor;
    if (cursor && cursors.has(cursor)) throw new ManifestError("Повтор курсора каталога Manifest", "protocol");
    if (cursor) cursors.add(cursor);
    if (tools.length > 500) throw new ManifestError("Каталог Manifest слишком велик", "protocol");
  } while (cursor);
  if (new Set(tools.map(t => t.name)).size !== tools.length) throw new ManifestError("Повтор инструмента Manifest", "protocol");
  return tools;
}

/**
 * Why a request did not reach Manifest, in words: fetch says only «fetch failed», the cause
 * (undici) tells a timeout from DNS, a refused connection or a certificate — what the
 * person checks on the machine of the bb server differs.
 */
export function netReason(error: unknown): string {
  const msg = error instanceof Error ? error.message : String(error);
  const cause = (error as { cause?: { code?: string; message?: string } } | null)?.cause;
  const code = cause?.code ?? "";
  const hint: Record<string, string> = {
    UND_ERR_CONNECT_TIMEOUT: "соединение не установилось за 10 с — сеть машины сервера bb не доходит до Manifest (VPN, фильтр, маршрут)",
    ETIMEDOUT: "соединение не установилось вовремя — сеть машины сервера bb не доходит до Manifest",
    ENOTFOUND: "адрес Manifest не находится в DNS на машине сервера bb",
    EAI_AGAIN: "DNS на машине сервера bb не отвечает",
    ECONNREFUSED: "сервер отклонил соединение — Manifest не слушает этот порт",
    ECONNRESET: "соединение оборвано по пути",
    CERT_HAS_EXPIRED: "сертификат Manifest просрочен",
    UNABLE_TO_VERIFY_LEAF_SIGNATURE: "сертификат Manifest не проверяется",
  };
  if (hint[code]) return `${hint[code]} (${code})`;
  if (code || cause?.message) return `${msg}: ${[code, cause?.message].filter(Boolean).join(" ")}`;
  return msg;
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
    throw new ManifestError(`Manifest недоступен: ${netReason(error)}`, "unavailable");
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
