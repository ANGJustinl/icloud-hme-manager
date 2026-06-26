import "server-only";

import type { IcloudDomain } from "@/lib/icloud/constants";

/** Cookie 凭证健康状态。ok=最近一次调用成功；invalid=最近一次因鉴权失败被标记；unknown=尚未校验过 */
export type CookieStatus = "ok" | "invalid" | "unknown";

/**
 * accounts 表结构（DB 层，敏感字段为密文）。
 *
 * 注意：imap_app_password 是后加的字段。schema.ts 的 CREATE TABLE 包含它，
 * 但已存在的数据库没有该列——靠 lib/db/index.ts 里的幂等 ALTER TABLE 迁移补齐。
 */
export interface AccountRow {
  id: number;
  name: string;
  domain: IcloudDomain;
  /** AES-256-GCM 加密后的 HME Cookie 字符串（base64） */
  cookie_encrypted: string;
  /** 缓存的 HME API base URL（凭证失效时清空） */
  cached_api_base: string | null;
  /** API base 缓存时间（毫秒） */
  api_base_cached_at: number | null;
  /**
   * IMAP 登录用的应用专用密码（AES-256-GCM 密文）。
   * 登录一律用主账号邮箱（@icloud.com），不能用隐藏别名登录。
   * nullable：用户可能只配了 HME Cookie、未配 IMAP。
   */
  imap_app_password_encrypted: string | null;
  /** IMAP 登录主邮箱地址（明文存储，非敏感） */
  imap_username: string | null;
  /** Cookie 凭证健康状态，由代理调用结果回写 */
  cookie_status: CookieStatus;
  /** 最近一次成功校验时间（毫秒），null=从未成功 */
  last_validated_at: number | null;
  /** 最近一次失效原因（人类可读），null=无错误 */
  last_error: string | null;
  created_at: number;
  updated_at: number;
}

/** 下发到前端的账号信息（绝不包含 cookie / 密码） */
export interface AccountPublic {
  id: number;
  name: string;
  domain: IcloudDomain;
  hasCookie: boolean;
  /** 是否已配置 IMAP 应用专用密码 */
  hasImapPassword: boolean;
  /** IMAP 登录主邮箱地址（明文，用于前端显示） */
  imapUsername: string | null;
  /** Cookie 凭证健康状态 */
  cookieStatus: CookieStatus;
  /** 最近一次成功校验时间（毫秒） */
  lastValidatedAt: number | null;
  /** 最近一次失效原因（人类可读） */
  lastError: string | null;
  cachedApiBase: string | null;
  apiBaseCachedAt: number | null;
  createdAt: number;
  updatedAt: number;
}

/** 外部邮箱 API 配置（DB 层，url 为密文） */
export interface RelaySourceRow {
  id: number;
  name: string;
  url_encrypted: string;
  inbox_hint: string | null;
  last_code: string | null;
  last_subject: string | null;
  last_sender: string | null;
  last_checked_at: number | null;
  last_message_date: number | null;
  created_at: number;
  updated_at: number;
}

/** 下发到前端的外部邮箱 API 配置，不包含 token URL */
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

export function toPublic(row: AccountRow): AccountPublic {
  return {
    id: row.id,
    name: row.name,
    domain: row.domain,
    hasCookie: Boolean(row.cookie_encrypted),
    hasImapPassword: Boolean(row.imap_app_password_encrypted),
    imapUsername: row.imap_username ?? null,
    cookieStatus: row.cookie_status ?? "unknown",
    lastValidatedAt: row.last_validated_at ?? null,
    lastError: row.last_error ?? null,
    cachedApiBase: row.cached_api_base,
    apiBaseCachedAt: row.api_base_cached_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function relaySourceToPublic(row: RelaySourceRow): RelaySourcePublic {
  return {
    id: row.id,
    name: row.name,
    inboxHint: row.inbox_hint,
    hasUrl: Boolean(row.url_encrypted),
    lastCode: row.last_code,
    lastSubject: row.last_subject,
    lastSender: row.last_sender,
    lastCheckedAt: row.last_checked_at,
    lastMessageDate: row.last_message_date,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** 建表（首次创建 / 新数据库） */
export const CREATE_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS accounts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  domain TEXT NOT NULL DEFAULT 'icloud.com',
  cookie_encrypted TEXT NOT NULL,
  cached_api_base TEXT,
  api_base_cached_at INTEGER,
  imap_app_password_encrypted TEXT,
  imap_username TEXT,
  cookie_status TEXT NOT NULL DEFAULT 'unknown',
  last_validated_at INTEGER,
  last_error TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_accounts_name ON accounts(name);

CREATE TABLE IF NOT EXISTS relay_sources (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  url_encrypted TEXT NOT NULL,
  inbox_hint TEXT,
  last_code TEXT,
  last_subject TEXT,
  last_sender TEXT,
  last_checked_at INTEGER,
  last_message_date INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_relay_sources_created_at ON relay_sources(created_at);
`;
