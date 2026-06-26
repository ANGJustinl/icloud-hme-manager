import "server-only";

/**
 * 多格式 Cookie 解析器。
 *
 * 用户从浏览器导出 Cookie 的方式五花八门，统一归一化成 iCloud 需要的
 * header string 形式（`name=value; name2=value2`），因为服务端代理是把
 * 这个字符串原样塞进 `Cookie:` 请求头的。
 *
 * 支持三种输入：
 *  1. Header String —— 直接从 DevTools 的 `cookie:` 请求头复制的整行，
 *     形如 `X-APPLE-WEBAUTH-USER=...; X-APPLE-WEBAUTH-TOKEN=...`。
 *  2. JSON —— EditThisCookie / Cookie-Editor 等扩展导出的数组，
 *     `[{ "name": "...", "value": "..." }, ...]`，或 `{ "cookies": [...] }`。
 *  3. Netscape —— curl / wget / 部分扩展用的 cookies.txt 格式，
 *     制表符分隔 7 字段：domain  flag  path  secure  expiry  name  value。
 */

export type CookieFormat = "header" | "json" | "netscape";

export interface ParsedCookie {
  /** 归一化后的 header string，可直接用于 Cookie 请求头 */
  cookie: string;
  /** 识别到的输入格式（用于日志/前端提示） */
  format: CookieFormat;
  /** 解析出的 cookie 条目数 */
  count: number;
}

export class CookieParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CookieParseError";
  }
}

interface Pair {
  name: string;
  value: string;
}

/** name 合法性：cookie 名不含控制字符、空格、分号、等号 */
function isValidName(name: string): boolean {
  return name.length > 0 && !/[\s;=,]/.test(name);
}

/** 拼接为 header string，按 name 去重（后出现的覆盖先出现的，保留顺序） */
function pairsToHeader(pairs: Pair[]): string {
  const map = new Map<string, string>();
  for (const p of pairs) {
    const name = p.name.trim();
    if (!isValidName(name)) continue;
    // value 去掉首尾引号和空白
    const value = p.value.trim().replace(/^"(.*)"$/, "$1");
    map.set(name, value);
  }
  return [...map.entries()].map(([n, v]) => `${n}=${v}`).join("; ");
}

/** 解析 JSON 格式（扩展导出的数组 / 对象） */
function parseJson(input: string): Pair[] | null {
  let data: unknown;
  try {
    data = JSON.parse(input);
  } catch {
    return null;
  }
  // 支持 [{...}] 或 { cookies: [{...}] }
  const arr = Array.isArray(data)
    ? data
    : data && typeof data === "object" && Array.isArray((data as Record<string, unknown>).cookies)
      ? ((data as Record<string, unknown>).cookies as unknown[])
      : null;
  if (!arr) return null;

  const pairs: Pair[] = [];
  for (const item of arr) {
    if (!item || typeof item !== "object") continue;
    const obj = item as Record<string, unknown>;
    const name = typeof obj.name === "string" ? obj.name : undefined;
    const value =
      typeof obj.value === "string"
        ? obj.value
        : obj.value != null
          ? String(obj.value)
          : undefined;
    if (name && value !== undefined) pairs.push({ name, value });
  }
  return pairs;
}

/** 解析 Netscape cookies.txt（制表符 7 字段，# 注释行跳过） */
function parseNetscape(input: string): Pair[] | null {
  const lines = input.split(/\r?\n/);
  const pairs: Pair[] = [];
  let sawTabRow = false;
  for (const raw of lines) {
    const line = raw.trimEnd();
    if (!line) continue;
    // #HttpOnly_ 前缀的行是有效 cookie，必须先剥前缀再判注释
    const cleaned = line.replace(/^#HttpOnly_/i, "");
    if (cleaned.startsWith("#")) continue; // 真正的注释行
    const fields = cleaned.split("\t");
    if (fields.length < 7) continue;
    sawTabRow = true;
    const name = fields[5];
    const value = fields[6];
    if (name) pairs.push({ name, value: value ?? "" });
  }
  return sawTabRow ? pairs : null;
}

/** 解析 header string（`k=v; k=v`，也兼容换行/逗号分隔） */
function parseHeader(input: string): Pair[] {
  const pairs: Pair[] = [];
  // 主分隔符是分号；个别导出用换行
  const segments = input.split(/;|\r?\n/);
  for (const seg of segments) {
    const s = seg.trim();
    if (!s) continue;
    const eq = s.indexOf("=");
    if (eq <= 0) continue;
    pairs.push({ name: s.slice(0, eq), value: s.slice(eq + 1) });
  }
  return pairs;
}

/**
 * 解析任意支持格式的 Cookie 输入，归一化成 header string。
 * 自动识别格式；识别不出或解析为空时抛 CookieParseError。
 */
export function parseCookieInput(input: string): ParsedCookie {
  const trimmed = input.trim();
  if (!trimmed) throw new CookieParseError("Cookie 内容为空");

  let format: CookieFormat;
  let pairs: Pair[] | null;

  // 1) JSON：以 [ 或 { 开头
  if (trimmed.startsWith("[") || trimmed.startsWith("{")) {
    pairs = parseJson(trimmed);
    if (pairs === null) {
      throw new CookieParseError("看起来是 JSON 但解析失败，请检查是否为合法的 Cookie 导出数组");
    }
    format = "json";
  }
  // 2) Netscape：含制表符且有 7 字段行
  else if (trimmed.includes("\t")) {
    pairs = parseNetscape(trimmed);
    if (pairs === null) {
      // 含制表符但不是合法 Netscape，退回 header 尝试
      pairs = parseHeader(trimmed);
      format = "header";
    } else {
      format = "netscape";
    }
  }
  // 3) Header string
  else {
    pairs = parseHeader(trimmed);
    format = "header";
  }

  const cookie = pairsToHeader(pairs);
  const count = cookie ? cookie.split("; ").length : 0;
  if (count === 0) {
    throw new CookieParseError("未能从输入中解析出任何有效 Cookie 条目");
  }

  return { cookie, format, count };
}
