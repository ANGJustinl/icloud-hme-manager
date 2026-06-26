import "server-only";

import { NextResponse } from "next/server";

import { IcloudError } from "@/lib/icloud/client";
import { MailError } from "@/lib/mail/client";
import {
  clearCachedApiBase,
  getAccountCookie,
  getAccountImapPassword,
  getAccountRow,
  markCookieStatus,
  setCachedApiBase,
} from "@/lib/db/accounts";
import { createHmeClient } from "@/lib/icloud/client";
import type { IcloudDomain } from "@/lib/icloud/constants";
import { ICLOUD_DOMAINS } from "@/lib/icloud/constants";

/** 统一的 JSON 响应 */
export function json<T>(data: T, status = 200): NextResponse<T> {
  return NextResponse.json(data, { status });
}

/** 把任意错误转成统一的 { error } 响应 */
export function handleError(e: unknown): NextResponse {
  if (e instanceof IcloudError) {
    // 401/403/421 → 让前端引导更新 Cookie
    const status =
      e.status === 401 || e.status === 403 || e.status === 421
        ? 401
        : 502;
    return json({ error: e.message }, status);
  }
  if (e instanceof MailError) {
    // IMAP 认证/未配置类错误映射为 4xx，其余为 502
    const clientErrors = ["AUTH", "CONN", "NO_IMAP", "NOTFOUND"];
    const status = e.code && clientErrors.includes(e.code) ? 400 : 502;
    return json({ error: e.message, code: e.code }, status);
  }
  const msg = e instanceof Error ? e.message : String(e);
  return json({ error: msg }, 500);
}

/** 解析 body JSON，宽松处理空 body */
export async function parseBody<T = unknown>(request: Request): Promise<T> {
  const text = await request.text();
  if (!text) return {} as T;
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error("请求体不是合法 JSON");
  }
}

export function isIcloudDomain(v: unknown): v is IcloudDomain {
  return typeof v === "string" && (ICLOUD_DOMAINS as readonly string[]).includes(v);
}

/**
 * 根据账号 ID 构造一个 HME 客户端。
 * 把 DB 缓存读写接入 client 的缓存回调。
 */
export async function buildClientForAccount(accountId: number) {
  const row = getAccountRow(accountId);
  if (!row) throw new IcloudError("账号不存在", 404);

  const cookie = getAccountCookie(accountId);
  if (!cookie) throw new IcloudError("账号 Cookie 缺失", 404);

  if (!isIcloudDomain(row.domain)) {
    throw new IcloudError(`账号域名非法: ${row.domain}`);
  }

  const client = await createHmeClient({
    cookie,
    domain: row.domain,
    getCachedApiBase: () => row.cached_api_base,
    setCachedApiBase: (url) => setCachedApiBase(accountId, url),
    clearCachedApiBase: () => clearCachedApiBase(accountId),
    onAuthSuccess: () => markCookieStatus(accountId, "ok"),
    onAuthInvalid: (message) => markCookieStatus(accountId, "invalid", message),
  });

  return client;
}

/**
 * 构造 IMAP 凭证（主邮箱 + 应用专用密码）。
 * 主邮箱地址必须用户显式配置（隐藏别名不能用于 IMAP 登录）。
 */
export function buildImapDeps(accountId: number): {
  username: string;
  password: string;
} {
  const row = getAccountRow(accountId);
  if (!row) throw new MailError("账号不存在", "NOTFOUND");

  const username = row.imap_username?.trim();
  const password = getAccountImapPassword(accountId);
  if (!username || !password) {
    throw new MailError(
      "该账号未配置 IMAP 登录信息。请在账号设置中填写主邮箱地址和应用专用密码。",
      "NO_IMAP",
    );
  }
  return { username, password };
}
