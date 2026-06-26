// 前端共享类型（与服务端 icloud/types.ts 对齐，但放在可被 client import 的位置）

export interface HmeEmail {
  hme: string;
  label: string;
  note?: string;
  isActive: boolean;
  anonymousId: string;
  createTimestamp?: number;
  createdAt?: number;
  numberOfForwardedEmails?: number;
}

export interface AccountPublic {
  id: number;
  name: string;
  domain: "icloud.com" | "icloud.com.cn";
  hasCookie: boolean;
  hasImapPassword: boolean;
  imapUsername: string | null;
  cachedApiBase: string | null;
  apiBaseCachedAt: number | null;
  createdAt: number;
  updatedAt: number;
}

// ---- 邮件相关类型（与 lib/mail/types 对齐） ----

export interface MailSummary {
  uid: number;
  date: number;
  from: string;
  fromAddress: string;
  to: string;
  subject: string;
  seen: boolean;
  snippet: string;
  hasOtp: boolean;
}

export interface MailDetail extends MailSummary {
  text: string;
  html: string | null;
}

export interface OtpExtract {
  code: string;
  uid: number;
  subject: string;
  rule: string;
}

export interface OtpExtractStats {
  searched: number;
  matchedAlias: number;
  skippedByAlias: number;
  parsed: number;
}

export interface OtpExtractResponse {
  otp: OtpExtract | null;
  latest: MailSummary[];
  stats: OtpExtractStats;
}

export interface GeneratedAlias {
  hme: string;
  label: string;
  note: string;
}

export interface GenerateAliasResponse {
  emails: GeneratedAlias[];
  requestedCount: number;
  failed?: string;
  hme?: string;
  label?: string;
  note?: string;
}

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

export interface RelayLookupResponse {
  sourceId?: number | null;
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

export interface RelaySourcePublic {
  id: number;
  name: string;
  inboxHint: string | null;
  hasUrl: boolean;
  lastCode: string | null;
  lastSubject: string | null;
  lastSender: string | null;
  lastCheckedAt: number | null;
  lastMessageDate: number | null;
  createdAt: number;
  updatedAt: number;
}

export interface RelaySourceCreateInput {
  name: string;
  url: string;
}

export interface RelaySourceUpdateInput {
  name?: string;
  url?: string;
  inboxHint?: string | null;
}

export interface RelayShareResponse {
  share: {
    inbox: string;
    token: string;
    expiresAt: number;
    pageUrl: string;
    apiUrl: string;
  };
}

export class ApiError extends Error {
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

/** 统一的 fetch 封装：解析 JSON，非 2xx 抛 ApiError */
export async function apiFetch<T>(
  input: string,
  init?: RequestInit,
): Promise<T> {
  const res = await fetch(input, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  let data: unknown = null;
  const text = await res.text();
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      // 非 JSON 响应
    }
  }
  if (!res.ok) {
    const message =
      data && typeof data === "object" && "error" in data
        ? String((data as { error: unknown }).error)
        : `HTTP ${res.status}`;
    throw new ApiError(message, res.status);
  }
  return data as T;
}
