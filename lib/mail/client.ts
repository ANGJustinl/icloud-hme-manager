import "server-only";

import { ImapFlow } from "imapflow";
import { simpleParser, type AddressObject, type ParsedMail } from "mailparser";
import type { MailDetail, MailSummary, OtpExtractResult, OtpExtractStats } from "./types";
import { extractOtp, looksLikeOtpMail } from "@/lib/otp";

/**
 * iCloud IMAP 客户端封装。
 *
 * 关键约束（基于调研）：
 *  1. 登录用「主邮箱地址」+「应用专用密码」，不能用隐藏别名登录。
 *  2. 隐藏别名收到的邮件会进入主收件箱（INBOX），需按 To/Delivered-To 过滤。
 *  3. 短连接模式：connect → 操作 → logout，避免长连接/IDLE（serverless 不友好，
 *     且会触发 per-IP 连接数限制）。定时监听由前端轮询实现。
 *  4. 所有调用都在 finally 里 logout，绝不泄漏连接。
 *
 * 取信策略（重要，关系到正确性与性能）：
 *  - 不使用 iCloud 服务端的「别名 SEARCH」。iCloud 对 to/cc + 转发类自定义头
 *    （delivered-to / x-original-to ...）的复杂 OR 搜索支持不稳定，经常返回空，
 *    这是「按别名过滤拉不到邮件」的根因。
 *  - 改为两阶段：
 *      ① 取最近 N 封的信封 + 收件人相关头部（不下载正文，轻量），本地按别名过滤；
 *      ② 仅对命中的邮件下载正文并用 mailparser 正确解码（charset / base64 / QP），
 *         避免下载整封 HTML/字体/附件，也修复了手写解析导致的中文/日文乱码。
 */

const ICLOUD_IMAP_HOST = "imap.mail.me.com";
const ICLOUD_IMAP_PORT = 993;

/** 第一阶段抓取的收件人相关头部（用于本地别名匹配，不含正文） */
const RECIPIENT_HEADER_FIELDS = [
  "to",
  "cc",
  "bcc",
  "delivered-to",
  "x-original-to",
  "x-forwarded-to",
  "x-envelope-to",
  "envelope-to",
  "apparently-to",
  "resent-to",
  "x-apple-original-to",
] as const;

/** 转发类头部（隐藏别名邮件常依赖这些 header 携带真实收件地址） */
const FORWARD_HEADER_KEYS = [
  "delivered-to",
  "x-original-to",
  "x-forwarded-to",
  "x-envelope-to",
  "envelope-to",
  "apparently-to",
  "resent-to",
  "x-apple-original-to",
] as const;

export class MailError extends Error {
  readonly code?: string;
  constructor(message: string, code?: string) {
    super(message);
    this.name = "MailError";
    this.code = code;
  }
}

interface ClientDeps {
  /** IMAP 登录主邮箱地址（如 user@icloud.com） */
  username: string;
  /** 应用专用密码 */
  password: string;
}

type EnvelopeAddress = {
  name?: string | null;
  address?: string | null;
};

type EnvelopeLike = {
  subject?: string | null;
  from?: EnvelopeAddress[];
  to?: EnvelopeAddress[];
  cc?: EnvelopeAddress[];
  bcc?: EnvelopeAddress[];
};

interface ParsedMessageSource {
  text: string;
  html: string | null;
  headerText: string;
  parsed: ParsedMail | null;
}

/** 第一阶段的轻量条目：只含信封 + 收件人头部，不含正文 */
interface HeaderEntry {
  uid: number;
  envelope: EnvelopeLike | undefined;
  date: number;
  seen: boolean;
  headerText: string;
}

function createClient(deps: ClientDeps): ImapFlow {
  return new ImapFlow({
    host: ICLOUD_IMAP_HOST,
    port: ICLOUD_IMAP_PORT,
    secure: true,
    auth: {
      user: deps.username,
      pass: deps.password,
    },
    logger: false, // 静默，避免日志泄漏凭据
    // iCloud 偶有慢响应，给足超时
    emitLogs: false,
  });
}

/** 打开连接并执行操作，无论成功失败都 logout */
async function withConnection<T>(
  deps: ClientDeps,
  fn: (client: ImapFlow) => Promise<T>,
): Promise<T> {
  const client = createClient(deps);
  try {
    await client.connect();
    return await fn(client);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    // 识别常见认证错误
    if (/authentication|auth|credentials|password/i.test(msg)) {
      throw new MailError(
        "IMAP 认证失败：请检查应用专用密码是否正确、是否已开启两步验证",
        "AUTH",
      );
    }
    if (/ECONNREFUSED|ETIMEDOUT|ENOTFOUND|connect/i.test(msg)) {
      throw new MailError(`无法连接 iCloud IMAP 服务器：${msg}`, "CONN");
    }
    throw new MailError(msg, "OTHER");
  } finally {
    // 必须关闭，否则泄漏连接触发 per-IP 限制
    try {
      await client.logout();
    } catch {
      // logout 失败忽略
    }
  }
}

function parseAddresses(value: string): { name: string; address: string } {
  // "Name <addr@x.com>" 或 "addr@x.com"
  const m = value.match(/^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/);
  if (m) return { name: m[1].trim(), address: m[2].trim() };
  return { name: value.trim(), address: value.trim() };
}

/** 从信封提取发件人 name/address */
function parseFrom(env: EnvelopeLike | undefined): { name: string; address: string } {
  const f = env?.from?.[0];
  if (!f) return { name: "(未知发件人)", address: "" };
  return { name: (f.name ?? "").trim(), address: (f.address ?? "").trim() };
}

function makeSnippet(text: string | null, len = 120): string {
  if (!text) return "";
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > len ? flat.slice(0, len) + "…" : flat;
}

/** imapflow 返回的头部 Buffer → 文本 */
function headersToText(headers: Buffer | string | undefined): string {
  if (!headers) return "";
  return typeof headers === "string" ? headers : headers.toString("utf8");
}

/**
 * 第一阶段：取最近 window 封邮件的信封 + 收件人头部（不下载正文）。
 *
 * 用序号区间 `start:*` 直接取最近 N 封，避免 iCloud 服务端别名 SEARCH 的不稳定。
 * 返回「最新在前」的轻量条目。
 */
async function fetchRecentHeaderEntries(
  client: ImapFlow,
  opts: { window: number; unreadOnly?: boolean },
): Promise<HeaderEntry[]> {
  const mailbox = client.mailbox;
  const exists = mailbox && typeof mailbox !== "boolean" ? mailbox.exists : 0;
  if (!exists) return [];

  const window = Math.min(Math.max(opts.window, 1), 400);
  const start = Math.max(1, exists - window + 1);
  const range = `${start}:*`;

  const entries: HeaderEntry[] = [];
  // 注意：range 为序号区间（非 UID），但请求里带 uid:true 以便后续按 UID 取正文。
  for await (const msg of client.fetch(range, {
    uid: true,
    envelope: true,
    flags: true,
    internalDate: true,
    headers: [...RECIPIENT_HEADER_FIELDS],
  })) {
    const seen = msg.flags?.has("\\Seen") ?? false;
    if (opts.unreadOnly && seen) continue;
    entries.push({
      uid: msg.uid,
      envelope: msg.envelope as EnvelopeLike | undefined,
      date: msg.internalDate ? new Date(msg.internalDate).getTime() : Date.now(),
      seen,
      headerText: headersToText(msg.headers),
    });
  }
  // 服务端按序号升序返回，反转为「最新在前」
  return entries.reverse();
}

/**
 * 拉取收件箱列表。
 *
 * @param alias 可选：只看发给某个隐藏别名的邮件（按信封 To/Cc + 转发头匹配）
 * @param limit 返回条数（默认 30）
 * @param unreadOnly 仅未读
 */
export async function fetchInbox(
  deps: ClientDeps,
  opts: { alias?: string; limit?: number; unreadOnly?: boolean } = {},
): Promise<MailSummary[]> {
  const limit = Math.min(Math.max(opts.limit ?? 30, 1), 100);
  const alias = opts.alias?.trim().toLowerCase() || undefined;

  return withConnection(deps, async (client) => {
    const lock = await client.getMailboxLock("INBOX");
    try {
      // ① 仅取信封 + 收件人头部，本地按别名过滤（不依赖服务端别名搜索）。
      //    有别名时扩大扫描窗口（很多邮件不属于该别名），无别名时只取最近 limit 封。
      const window = alias ? 200 : limit;
      const entries = await fetchRecentHeaderEntries(client, {
        window,
        unreadOnly: opts.unreadOnly,
      });

      const matched = alias
        ? entries.filter((e) => matchesAliasLite(e.envelope, e.headerText, alias))
        : entries;

      const pick = matched.slice(0, limit);
      if (pick.length === 0) return [];

      // ② 仅对命中的邮件下载正文，用 mailparser 正确解码（修复乱码）。
      return await buildSummaries(client, pick);
    } finally {
      lock.release();
    }
  });
}

/** 第二阶段：对命中的条目下载正文，构造邮件摘要（含正确解码的预览） */
async function buildSummaries(
  client: ImapFlow,
  picks: HeaderEntry[],
): Promise<MailSummary[]> {
  const uidList = picks.map((p) => p.uid);
  const byUid = new Map(picks.map((p) => [p.uid, p]));
  const orderIndex = new Map(uidList.map((uid, i) => [uid, i]));

  const summaries: MailSummary[] = [];
  for await (const msg of client.fetch(
    uidList.join(","),
    { uid: true, envelope: true, flags: true, internalDate: true, source: true },
    { uid: true },
  )) {
    const entry = byUid.get(msg.uid);
    const env = msg.envelope as EnvelopeLike | undefined;
    const subject = env?.subject ?? "(无主题)";
    const fromParsed = parseFrom(env);
    const toRaw = env?.to?.map((t) => t.address).join(", ") ?? "";
    const date = msg.internalDate
      ? new Date(msg.internalDate).getTime()
      : entry?.date ?? Date.now();
    const seen = msg.flags?.has("\\Seen") ?? entry?.seen ?? false;

    const parsedSource = await parseMessageSource(msg.source);
    const bodyText = [parsedSource.text, stripHtml(parsedSource.html)]
      .filter(Boolean)
      .join("\n");
    const snippet = makeSnippet(bodyText);

    summaries.push({
      uid: msg.uid,
      date,
      from: fromParsed.name || fromParsed.address,
      fromAddress: fromParsed.address,
      to: toRaw,
      subject,
      seen,
      snippet,
      hasOtp: looksLikeOtpMail(subject, bodyText || snippet),
    });
  }

  // fetch 按 UID 升序返回，恢复 picks 的「最新在前」顺序
  summaries.sort(
    (a, b) => (orderIndex.get(a.uid) ?? 0) - (orderIndex.get(b.uid) ?? 0),
  );
  return summaries;
}

/** 读取单封邮件完整内容 */
export async function fetchMail(
  deps: ClientDeps,
  uid: number,
  alias?: string,
): Promise<MailDetail> {
  return withConnection(deps, async (client) => {
    const lock = await client.getMailboxLock("INBOX");
    try {
      const msg = await client.fetchOne(
        uid,
        { envelope: true, flags: true, internalDate: true, source: true },
        { uid: true },
      );
      if (!msg) throw new MailError("邮件不存在", "NOTFOUND");

      const env = msg.envelope as EnvelopeLike | undefined;
      const subject = env?.subject ?? "(无主题)";
      const fromRaw = env?.from?.[0]
        ? `${env.from[0].name ?? ""} <${env.from[0].address ?? ""}>`
        : "(未知发件人)";
      const fromParsed = parseAddresses(fromRaw);
      const toRaw = env?.to?.map((t) => t.address).join(", ") ?? "";
      const date = msg.internalDate ? new Date(msg.internalDate).getTime() : Date.now();
      const seen = msg.flags?.has("\\Seen") ?? false;

      const parsedSource = await parseMessageSource(msg.source);
      if (alias && !messageMatchesAlias(env, parsedSource, alias)) {
        throw new MailError("邮件不属于该隐藏别名", "NOTFOUND");
      }
      const { text, html } = parsedSource;
      const snippet = makeSnippet(text);

      return {
        uid: msg.uid,
        date,
        from: fromParsed.name || fromParsed.address,
        fromAddress: fromParsed.address,
        to: toRaw,
        subject,
        seen,
        snippet,
        hasOtp: looksLikeOtpMail(subject, text || snippet),
        text,
        html,
      };
    } finally {
      lock.release();
    }
  });
}

/** 解析 source 为 text + html。mailparser 负责 MIME / 编码 / HTML 正文解析。 */
async function parseMessageSource(
  source: Buffer | string | undefined,
): Promise<ParsedMessageSource> {
  if (!source) return { text: "", html: null, headerText: "", parsed: null };
  const raw = sourceToRaw(source);
  const headerText = extractHeaderText(raw);

  try {
    const parsed = await simpleParser(source, {
      skipImageLinks: true,
      skipTextLinks: true,
    });
    const html = typeof parsed.html === "string" ? parsed.html : null;
    const text = (parsed.text || stripHtml(html ?? "") || "").trim();
    return { text, html, headerText, parsed };
  } catch {
    const fallbackText = stripHtml(raw).trim();
    return { text: fallbackText, html: null, headerText, parsed: null };
  }
}

function sourceToRaw(source: Buffer | string): string {
  return typeof source === "string" ? source : source.toString("utf8");
}

function extractHeaderText(raw: string): string {
  const crlf = raw.indexOf("\r\n\r\n");
  if (crlf >= 0) return raw.slice(0, crlf);
  const lf = raw.indexOf("\n\n");
  return lf >= 0 ? raw.slice(0, lf) : raw;
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

/** 收集所有收件人地址，小写。隐藏别名邮件常依赖转发类 header。 */
function collectRecipients(env: EnvelopeLike | undefined, parsedSource: ParsedMessageSource): string[] {
  const addrs = new Set<string>();
  env?.to?.forEach((t) => addAddress(addrs, t.address));
  env?.cc?.forEach((t) => addAddress(addrs, t.address));
  env?.bcc?.forEach((t) => addAddress(addrs, t.address));

  collectAddressObjectAddresses(parsedSource.parsed?.to).forEach((a) => addrs.add(a));
  collectAddressObjectAddresses(parsedSource.parsed?.cc).forEach((a) => addrs.add(a));
  collectAddressObjectAddresses(parsedSource.parsed?.bcc).forEach((a) => addrs.add(a));

  for (const key of FORWARD_HEADER_KEYS) {
    const re = new RegExp(`^${key}:\\s*(.+(?:\\r?\\n[ \\t].+)*)$`, "gim");
    let m: RegExpExecArray | null;
    while ((m = re.exec(parsedSource.headerText)) !== null) {
      extractEmailAddresses(m[1]).forEach((a) => addrs.add(a));
    }
  }

  return [...addrs];
}

/** 仅基于信封 + 头部文本收集收件人（第一阶段用，不需要正文解析） */
function collectRecipientsLite(env: EnvelopeLike | undefined, headerText: string): string[] {
  const addrs = new Set<string>();
  env?.to?.forEach((t) => addAddress(addrs, t.address));
  env?.cc?.forEach((t) => addAddress(addrs, t.address));
  env?.bcc?.forEach((t) => addAddress(addrs, t.address));

  for (const key of FORWARD_HEADER_KEYS) {
    const re = new RegExp(`^${key}:\\s*(.+(?:\\r?\\n[ \\t].+)*)$`, "gim");
    let m: RegExpExecArray | null;
    while ((m = re.exec(headerText)) !== null) {
      extractEmailAddresses(m[1]).forEach((a) => addrs.add(a));
    }
  }

  return [...addrs];
}

function messageMatchesAlias(
  env: EnvelopeLike | undefined,
  parsedSource: ParsedMessageSource,
  alias: string,
): boolean {
  const normalized = alias.trim().toLowerCase();
  if (!normalized) return false;
  if (collectRecipients(env, parsedSource).includes(normalized)) return true;

  // 严格兜底：只要邮件头里精确出现完整别名地址，也认为匹配。
  const aliasPattern = new RegExp(
    `(^|[^A-Za-z0-9._%+-])${escapeRegExp(normalized)}([^A-Za-z0-9._%+-]|$)`,
    "i",
  );
  return aliasPattern.test(parsedSource.headerText);
}

/** 第一阶段的别名匹配：仅基于信封 + 收件人头部文本 */
function matchesAliasLite(
  env: EnvelopeLike | undefined,
  headerText: string,
  alias: string,
): boolean {
  const normalized = alias.trim().toLowerCase();
  if (!normalized) return false;
  if (collectRecipientsLite(env, headerText).includes(normalized)) return true;

  const aliasPattern = new RegExp(
    `(^|[^A-Za-z0-9._%+-])${escapeRegExp(normalized)}([^A-Za-z0-9._%+-]|$)`,
    "i",
  );
  return aliasPattern.test(headerText);
}

function collectAddressObjectAddresses(
  value: AddressObject | AddressObject[] | undefined,
): string[] {
  const objects = Array.isArray(value) ? value : value ? [value] : [];
  const addresses: string[] = [];
  for (const obj of objects) {
    for (const item of obj.value) {
      if (item.address) addresses.push(item.address.trim().toLowerCase());
      item.group?.forEach((g) => g.address && addresses.push(g.address.trim().toLowerCase()));
    }
  }
  return addresses;
}

function extractEmailAddresses(value: string): string[] {
  return [...value.matchAll(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi)].map((m) =>
    m[0].toLowerCase(),
  );
}

function addAddress(addrs: Set<string>, address: string | null | undefined): void {
  if (address) addrs.add(address.trim().toLowerCase());
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * 验证码提取：拉取最新邮件，从中匹配验证码。
 *
 * 两阶段策略（关系到「拉不到最新验证码」+「特别慢」两个问题）：
 *  ① 取最近邮件的头部，本地按别名过滤（不下载正文、不依赖服务端别名搜索）。
 *  ② 仅对命中别名的邮件按「最新在前」逐封下载正文，命中验证码立即返回，
 *     不扫完所有邮件。命中别名的邮件通常很少，因此很快。
 *
 * @param deps IMAP 凭证
 * @param alias 限定别名（强烈建议：否则会匹配到无关邮件）
 */
export async function extractLatestOtp(
  deps: ClientDeps,
  opts: { alias?: string; limit?: number } = {},
): Promise<OtpExtractResult> {
  const limit = Math.min(Math.max(opts.limit ?? 30, 1), 50);
  const alias = opts.alias?.trim().toLowerCase() || undefined;

  return withConnection(deps, async (client) => {
    const lock = await client.getMailboxLock("INBOX");
    try {
      const stats: OtpExtractStats = {
        searched: 0,
        matchedAlias: 0,
        skippedByAlias: 0,
        parsed: 0,
      };

      // ① 取最近邮件头部，本地按别名过滤
      const window = alias ? Math.max(limit * 4, 120) : limit;
      const entries = await fetchRecentHeaderEntries(client, { window });
      stats.searched = entries.length;

      if (entries.length === 0) return { otp: null, latest: [], stats };

      const matched: HeaderEntry[] = [];
      for (const e of entries) {
        if (alias && !matchesAliasLite(e.envelope, e.headerText, alias)) {
          stats.skippedByAlias += 1;
          continue;
        }
        matched.push(e);
        stats.matchedAlias += 1;
      }

      if (matched.length === 0) return { otp: null, latest: [], stats };

      // ② 仅对命中的邮件「最新在前」逐封下载正文，命中即返回
      const scanCap = Math.min(matched.length, limit);
      const summaries: MailSummary[] = [];
      for (let i = 0; i < scanCap; i++) {
        const entry = matched[i];
        const msg = await client.fetchOne(
          entry.uid,
          { uid: true, envelope: true, flags: true, internalDate: true, source: true },
          { uid: true },
        );
        if (!msg) continue;
        stats.parsed += 1;

        const env = msg.envelope as EnvelopeLike | undefined;
        const subject = env?.subject ?? "(无主题)";
        const fromParsed = parseFrom(env);
        const toRaw = env?.to?.map((t) => t.address).join(", ") ?? "";
        const date = msg.internalDate ? new Date(msg.internalDate).getTime() : entry.date;
        const seen = msg.flags?.has("\\Seen") ?? entry.seen;

        const parsedSource = await parseMessageSource(msg.source);
        const fullText = [parsedSource.text, stripHtml(parsedSource.html)]
          .filter(Boolean)
          .join("\n");
        const preview = makeSnippet(fullText);

        const summary: MailSummary = {
          uid: msg.uid,
          date,
          from: fromParsed.name || fromParsed.address,
          fromAddress: fromParsed.address,
          to: toRaw,
          subject,
          seen,
          snippet: preview,
          hasOtp: looksLikeOtpMail(subject, fullText || preview),
        };
        summaries.push(summary);

        const hit = extractOtp(subject, fullText || preview);
        if (hit) {
          return {
            otp: { code: hit.code, uid: summary.uid, subject, rule: hit.rule },
            latest: summaries,
            stats,
          };
        }
      }

      return { otp: null, latest: summaries, stats };
    } finally {
      lock.release();
    }
  });
}
