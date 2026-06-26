import "server-only";

import { lookup } from "dns/promises";
import net from "net";
import { extractOtp } from "@/lib/otp";

const MAX_MESSAGES = 50;
const MAX_RESPONSE_BYTES = 2_000_000;

export interface RelayMessage {
  id: string;
  from: string;
  fromAddress: string;
  to: string;
  subject: string;
  date: number | null;
  snippet: string;
  text: string;
  html: string | null;
  code: string | null;
  codeRule: string | null;
}

export interface RelayLookupResult {
  inbox: string | null;
  code: string | null;
  subject: string | null;
  messageDate: number | null;
  checkedAt: number;
  latest: RelayMessage | null;
  messages: RelayMessage[];
  count: number;
  raw?: unknown;
}

export class RelayError extends Error {
  readonly status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = "RelayError";
    this.status = status;
  }
}

export async function assertFetchableMailboxUrl(input: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    throw new RelayError("邮箱 API 地址不是有效 URL");
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new RelayError("邮箱 API 地址只支持 http 或 https");
  }

  const hostname = url.hostname.toLowerCase();
  if (
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname === "0.0.0.0" ||
    hostname === "::"
  ) {
    throw new RelayError("不允许访问本机地址");
  }

  const directIpVersion = net.isIP(hostname);
  const addresses = directIpVersion
    ? [{ address: hostname }]
    : await lookup(hostname, { all: true }).catch(() => {
        throw new RelayError("无法解析邮箱 API 域名");
      });

  for (const item of addresses) {
    if (isPrivateAddress(item.address)) {
      throw new RelayError("不允许访问内网或本机地址");
    }
  }

  return url;
}

export async function fetchRelayPayload(url: URL): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12_000);

  try {
    const res = await fetch(url, {
      method: "GET",
      headers: { accept: "application/json" },
      cache: "no-store",
      redirect: "follow",
      signal: controller.signal,
    });

    if (!res.ok) {
      throw new RelayError(`邮箱 API 返回 HTTP ${res.status}`, 502);
    }

    const length = Number(res.headers.get("content-length") ?? "0");
    if (length > MAX_RESPONSE_BYTES) {
      throw new RelayError("邮箱 API 响应过大", 413);
    }

    const text = await res.text();
    if (text.length > MAX_RESPONSE_BYTES) {
      throw new RelayError("邮箱 API 响应过大", 413);
    }

    try {
      return JSON.parse(text) as unknown;
    } catch {
      throw new RelayError("邮箱 API 响应不是合法 JSON", 502);
    }
  } catch (e) {
    if (e instanceof RelayError) throw e;
    const message = e instanceof Error && e.name === "AbortError" ? "邮箱 API 请求超时" : "邮箱 API 请求失败";
    throw new RelayError(message, 502);
  } finally {
    clearTimeout(timer);
  }
}

export function normalizeRelayPayload(
  payload: unknown,
  url?: URL,
  opts: { includeRaw?: boolean; includeBodies?: boolean } = {},
): RelayLookupResult {
  const rawMessages = findMessageArray(payload).slice(0, MAX_MESSAGES);
  const messages = rawMessages
    .map((item, index) => normalizeMessage(item, index, opts.includeBodies === true))
    .sort((a, b) => (b.date ?? 0) - (a.date ?? 0));
  const latest = messages[0] ?? null;
  const latestCodeMessage = messages.find((m) => m.code) ?? null;

  return {
    inbox: findInbox(payload) ?? firstNonEmpty(messages.map((m) => m.to)) ?? inferInboxFromUrl(url),
    code: latestCodeMessage?.code ?? null,
    subject: latestCodeMessage?.subject ?? latest?.subject ?? null,
    messageDate: latestCodeMessage?.date ?? latest?.date ?? null,
    checkedAt: Date.now(),
    latest,
    messages,
    count: rawMessages.length,
    ...(opts.includeRaw ? { raw: payload } : {}),
  };
}

function normalizeMessage(input: unknown, index: number, includeBodies: boolean): RelayMessage {
  const obj = isRecord(input) ? input : {};
  const subject = getFirstString(obj, ["subject", "title", "mailSubject", "mail_subject"]) || "(无主题)";
  const html = getFirstString(obj, ["html", "bodyHtml", "body_html", "htmlBody"]) || null;
  const text =
    getFirstString(obj, ["text", "body", "content", "plain", "plaintext", "textBody", "snippet"]) ||
    stripHtml(html) ||
    "";
  const from = normalizeAddressValue(getPath(obj, "from") ?? getPath(obj, "sender"));
  const to = normalizeAddressValue(getPath(obj, "to") ?? getPath(obj, "recipient") ?? getPath(obj, "mailbox"));
  const date = parseDateValue(
    getFirstValue(obj, ["date", "receivedAt", "received_at", "createdAt", "created_at", "time", "timestamp", "internalDate"]),
  );
  const hit = extractOtp(subject, `${text}\n${stripHtml(html)}`);

  return {
    id: getFirstString(obj, ["id", "uid", "messageId", "message_id"]) || String(index + 1),
    from: from.name || from.address || getFirstString(obj, ["fromName", "from_name"]) || "(未知发件人)",
    fromAddress: from.address || getFirstString(obj, ["fromAddress", "from_address"]) || "",
    to: to.address || to.name || getFirstString(obj, ["toAddress", "to_address", "email", "alias"]) || "",
    subject,
    date,
    snippet: makeSnippet(text || stripHtml(html)),
    text: includeBodies ? text : "",
    html: includeBodies ? html : null,
    code: hit?.code ?? null,
    codeRule: hit?.rule ?? null,
  };
}

function findMessageArray(payload: unknown): unknown[] {
  if (Array.isArray(payload)) return payload;
  if (!isRecord(payload)) return [];

  for (const key of ["messages", "emails", "items", "data", "results", "mails"]) {
    const value = payload[key];
    if (Array.isArray(value)) return value;
    if (isRecord(value)) {
      const nested = findMessageArray(value);
      if (nested.length > 0) return nested;
    }
  }

  return [];
}

function findInbox(payload: unknown): string | null {
  if (!isRecord(payload)) return null;
  const direct = getFirstString(payload, ["inbox", "mailbox", "alias", "email", "address"]);
  if (direct) return direct;

  for (const key of ["data", "result", "inbox"]) {
    const nested = payload[key];
    if (isRecord(nested)) {
      const found = findInbox(nested);
      if (found) return found;
    }
  }
  return null;
}

function inferInboxFromUrl(url: URL | undefined): string | null {
  if (!url) return null;
  const parts = url.pathname.split("/").filter(Boolean);
  return parts.at(-2) === "inboxes" ? parts.at(-1) ?? null : null;
}

function normalizeAddressValue(value: unknown): { name: string; address: string } {
  if (typeof value === "string") {
    const address = extractEmailAddresses(value)[0] ?? "";
    return { name: value.replace(/<[^>]+>/g, "").trim(), address };
  }
  if (Array.isArray(value)) return normalizeAddressValue(value[0]);
  if (isRecord(value)) {
    return {
      name: getFirstString(value, ["name", "label", "text"]) || "",
      address: getFirstString(value, ["address", "email", "mail"]) || "",
    };
  }
  return { name: "", address: "" };
}

function getFirstValue(obj: Record<string, unknown>, keys: string[]): unknown {
  for (const key of keys) {
    const value = getPath(obj, key);
    if (value !== undefined && value !== null && value !== "") return value;
  }
  return undefined;
}

function getFirstString(obj: Record<string, unknown>, keys: string[]): string {
  const value = getFirstValue(obj, keys);
  return typeof value === "string" ? value.trim() : "";
}

function getPath(obj: Record<string, unknown>, path: string): unknown {
  return path.split(".").reduce<unknown>((acc, part) => {
    if (!isRecord(acc)) return undefined;
    return acc[part];
  }, obj);
}

function parseDateValue(value: unknown): number | null {
  if (typeof value === "number") {
    return value < 10_000_000_000 ? value * 1000 : value;
  }
  if (typeof value === "string") {
    const numeric = Number(value);
    if (Number.isFinite(numeric) && value.trim() !== "") return parseDateValue(numeric);
    const ts = Date.parse(value);
    return Number.isFinite(ts) ? ts : null;
  }
  return null;
}

function stripHtml(html: string | null): string {
  if (!html) return "";
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

function makeSnippet(text: string, len = 180): string {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > len ? `${flat.slice(0, len)}...` : flat;
}

function extractEmailAddresses(value: string): string[] {
  return [...value.matchAll(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi)].map((m) => m[0].toLowerCase());
}

function firstNonEmpty(values: string[]): string | null {
  return values.find((v) => v.trim()) ?? null;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return Boolean(v) && typeof v === "object" && !Array.isArray(v);
}

function isPrivateAddress(address: string): boolean {
  const version = net.isIP(address);
  if (version === 4) return isPrivateIpv4(address);
  if (version === 6) return isPrivateIpv6(address);
  return true;
}

function isPrivateIpv4(address: string): boolean {
  const parts = address.split(".").map(Number);
  if (parts.length !== 4 || parts.some((p) => !Number.isInteger(p) || p < 0 || p > 255)) return true;
  const [a, b] = parts;
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168)
  );
}

function isPrivateIpv6(address: string): boolean {
  const normalized = address.toLowerCase();
  if (normalized === "::1" || normalized === "::") return true;
  if (normalized.startsWith("fe80:") || normalized.startsWith("fc") || normalized.startsWith("fd")) return true;
  if (normalized.startsWith("::ffff:")) {
    return isPrivateIpv4(normalized.replace("::ffff:", ""));
  }
  return false;
}
