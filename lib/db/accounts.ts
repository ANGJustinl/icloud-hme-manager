import "server-only";

import { db } from "./index";
import type { AccountPublic, AccountRow } from "./schema";
import { toPublic } from "./schema";
import { decrypt, encrypt } from "@/lib/crypto";
import type { IcloudDomain } from "@/lib/icloud/constants";

/** 创建账号（IMAP 配置可选） */
export function createAccount(input: {
  name: string;
  domain: IcloudDomain;
  cookie: string;
  imapUsername?: string;
  imapAppPassword?: string;
}): AccountPublic {
  const now = Date.now();
  const stmt = db.prepare(`
    INSERT INTO accounts (name, domain, cookie_encrypted, imap_username, imap_app_password_encrypted, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  const hasImap = input.imapUsername && input.imapAppPassword;
  const imapUser = hasImap ? input.imapUsername!.trim() : null;
  const imapEnc = hasImap ? encrypt(input.imapAppPassword!) : null;
  const r = stmt.run(
    input.name,
    input.domain,
    encrypt(input.cookie),
    imapUser,
    imapEnc,
    now,
    now,
  );
  return getAccountPublic(Number(r.lastInsertRowid))!;
}

/** 列出所有账号（不含 cookie） */
export function listAccounts(): AccountPublic[] {
  const rows = db
    .prepare(`SELECT * FROM accounts ORDER BY created_at ASC`)
    .all() as AccountRow[];
  return rows.map(toPublic);
}

/** 取单个公开信息 */
export function getAccountPublic(id: number): AccountPublic | null {
  const row = db
    .prepare(`SELECT * FROM accounts WHERE id = ?`)
    .get(id) as AccountRow | undefined;
  return row ? toPublic(row) : null;
}

/** 取单个完整行（含密文 cookie）—— 仅服务端使用 */
export function getAccountRow(id: number): AccountRow | null {
  const row = db
    .prepare(`SELECT * FROM accounts WHERE id = ?`)
    .get(id) as AccountRow | undefined;
  return row ?? null;
}

/** 解密 Cookie（仅服务端代理请求时使用） */
export function getAccountCookie(id: number): string | null {
  const row = getAccountRow(id);
  if (!row) return null;
  return decrypt(row.cookie_encrypted);
}

/** 更新账号 Cookie（重新粘贴时） */
export function updateAccountCookie(id: number, cookie: string): boolean {
  const now = Date.now();
  // Cookie 变了，缓存的 api base 也作废
  const r = db
    .prepare(
      `UPDATE accounts SET cookie_encrypted = ?, cached_api_base = NULL, api_base_cached_at = NULL, updated_at = ? WHERE id = ?`,
    )
    .run(encrypt(cookie), now, id);
  return r.changes > 0;
}

/** 更新账号名称 */
export function updateAccountName(id: number, name: string): boolean {
  const now = Date.now();
  const r = db
    .prepare(`UPDATE accounts SET name = ?, updated_at = ? WHERE id = ?`)
    .run(name, now, id);
  return r.changes > 0;
}

/** 写入 / 更新缓存的 api base */
export function setCachedApiBase(id: number, url: string): void {
  const now = Date.now();
  db.prepare(
    `UPDATE accounts SET cached_api_base = ?, api_base_cached_at = ?, updated_at = ? WHERE id = ?`,
  ).run(url, now, now, id);
}

/** 清空缓存的 api base（凭证失效时） */
export function clearCachedApiBase(id: number): void {
  db.prepare(
    `UPDATE accounts SET cached_api_base = NULL, api_base_cached_at = NULL WHERE id = ?`,
  ).run(id);
}

/**
 * 更新账号 IMAP 配置。
 * @param username 主邮箱地址；传 null 清除 IMAP 配置
 * @param password 应用专用密码；username 为 null 时忽略
 */
export function updateAccountImap(
  id: number,
  username: string | null,
  password: string | null,
): boolean {
  const now = Date.now();
  if (username === null) {
    // 清除 IMAP 配置
    const r = db
      .prepare(
        `UPDATE accounts SET imap_username = NULL, imap_app_password_encrypted = NULL, updated_at = ? WHERE id = ?`,
      )
      .run(now, id);
    return r.changes > 0;
  }
  const enc = password ? encrypt(password) : null;
  const r = db
    .prepare(
      `UPDATE accounts SET imap_username = ?, imap_app_password_encrypted = ?, updated_at = ? WHERE id = ?`,
    )
    .run(username.trim(), enc, now, id);
  return r.changes > 0;
}

/** 解密 IMAP 应用专用密码（仅服务端代理使用） */
export function getAccountImapPassword(id: number): string | null {
  const row = getAccountRow(id);
  if (!row || !row.imap_app_password_encrypted) return null;
  return decrypt(row.imap_app_password_encrypted);
}

/** 删除账号 */
export function deleteAccount(id: number): boolean {
  const r = db.prepare(`DELETE FROM accounts WHERE id = ?`).run(id);
  return r.changes > 0;
}
