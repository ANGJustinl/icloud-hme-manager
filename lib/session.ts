import "server-only";

import { cookies } from "next/headers";
import { getIronSession, type IronSession, type SessionOptions } from "iron-session";
import { readFileSync, writeFileSync, existsSync } from "fs";
import { join } from "path";
import { timingSafeEqual } from "crypto";

/**
 * 会话管理 + WebUI 访问守卫。
 *
 * 设计：
 *  - 若设置了 ACCESS_PASSWORD，则必须登录才能访问所有 API（除 login 本身）。
 *  - 若未设置（纯本地自用），跳过守卫。
 *  - 会话用 iron-session 签名加密的 cookie 存储，服务端无状态。
 */

const SESSION_COOKIE_NAME = "hme_session";

export interface AppSession {
  authed?: boolean;
}

let cachedSecret: string | null = null;

export function ensureSessionSecret(): string {
  if (cachedSecret) return cachedSecret;

  let raw = process.env.SESSION_SECRET?.trim();
  if (!raw) {
    // 本地自动生成并写入 .env.local
    raw = bootstrapLocalSecret();
  }
  cachedSecret = raw;
  return raw;
}

function bootstrapLocalSecret(): string {
  const generated = require("crypto").randomBytes(32).toString("hex");
  const envPath = join(process.cwd(), ".env.local");
  const line = `SESSION_SECRET=${generated}\n`;
  try {
    let existing = "";
    if (existsSync(envPath)) existing = readFileSync(envPath, "utf8");
    if (!/SESSION_SECRET\s*=/.test(existing)) {
      writeFileSync(
        envPath,
        existing + (existing.endsWith("\n") || existing === "" ? "" : "\n") + line,
        "utf8",
      );
    }
  } catch {
    // 忽略
  }
  return generated;
}

function sessionOptions(): SessionOptions {
  return {
    password: ensureSessionSecret(),
    cookieName: SESSION_COOKIE_NAME,
    cookieOptions: {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 24 * 7, // 7 天
    },
  };
}

export async function getSession(): Promise<IronSession<AppSession>> {
  const c = await cookies();
  return getIronSession<AppSession>(c, sessionOptions());
}

/** 是否启用了访问密码守卫 */
export function isAuthEnabled(): boolean {
  return Boolean(process.env.ACCESS_PASSWORD?.trim());
}

/** 常量时间比较，防计时攻击 */
function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}

/** 校验访问密码，成功则写入会话 */
export async function tryLogin(password: string): Promise<boolean> {
  const expected = process.env.ACCESS_PASSWORD?.trim();
  if (!expected) {
    // 未启用守卫：视为已登录
    const s = await getSession();
    s.authed = true;
    await s.save();
    return true;
  }
  if (!safeEqual(password, expected)) return false;
  const s = await getSession();
  s.authed = true;
  await s.save();
  return true;
}

export async function logout(): Promise<void> {
  const s = await getSession();
  s.destroy();
}

/**
 * 路由守卫。返回 true 表示放行，否则返回 NextResponse（401）。
 *
 * 用法：
 *   const guard = await requireSession(request);
 *   if (guard) return guard;
 */
export async function requireSession(request: Request) {
  if (!isAuthEnabled()) return null; // 未启用守卫，直接放行

  // 简单优化：未带 cookie 直接 401，避免无谓的 iron-session 解析
  const cookieHeader = request.headers.get("cookie") ?? "";
  if (!cookieHeader.includes(SESSION_COOKIE_NAME)) {
    return unauthorized();
  }

  const s = await getSession();
  if (!s.authed) return unauthorized();
  return null;
}

function unauthorized(): Response {
  return new Response(
    JSON.stringify({ error: "未登录或会话已过期" }),
    { status: 401, headers: { "content-type": "application/json" } },
  );
}
