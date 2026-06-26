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

export type SessionRole = "admin";

export interface AppSession {
  authed?: boolean;
  /** 角色。目前仅 admin（访客走无 session 的 JWT 只读路径，不在此体系内）。 */
  role?: SessionRole;
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

/** 配置的管理员用户名（可选）。设置后登录需用户名 + 密码双校验。 */
export function getAdminUsername(): string | null {
  return process.env.ADMIN_USERNAME?.trim() || null;
}

/** 是否要求用户名（设置了 ADMIN_USERNAME 时） */
export function isUsernameRequired(): boolean {
  return Boolean(getAdminUsername());
}

/** 未设密码时是否显式允许开放访问（信任内网逃生口） */
export function isOpenAccessAllowed(): boolean {
  const v = process.env.ALLOW_NO_AUTH?.trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

/** 常量时间比较，防计时攻击 */
function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}

/**
 * 校验管理员凭证，成功则写入会话（role=admin）。
 * - 未设 ACCESS_PASSWORD：视为本地自用，直接通过并标记 admin。
 * - 设了 ADMIN_USERNAME：用户名 + 密码都要匹配。
 */
export async function tryLogin(
  password: string,
  username?: string,
): Promise<boolean> {
  const expected = process.env.ACCESS_PASSWORD?.trim();
  if (!expected) {
    // 未启用守卫：视为已登录
    const s = await getSession();
    s.authed = true;
    s.role = "admin";
    await s.save();
    return true;
  }

  // 用户名校验（若配置了）。先比对用户名再比对密码，两者都用常量时间比较。
  const expectedUser = getAdminUsername();
  const userOk = expectedUser ? safeEqual(username?.trim() ?? "", expectedUser) : true;
  const passOk = safeEqual(password, expected);
  if (!userOk || !passOk) return false;

  const s = await getSession();
  s.authed = true;
  s.role = "admin";
  await s.save();
  return true;
}

export async function logout(): Promise<void> {
  const s = await getSession();
  s.destroy();
}

/**
 * 路由守卫。返回 null 表示放行，否则返回 401 响应。
 *
 * 安全策略（未设 ACCESS_PASSWORD 时）：
 *  - 开发环境（NODE_ENV !== production）：放行，方便本地自用。
 *  - 生产环境：默认禁用管理接口（避免公网裸奔），除非显式设 ALLOW_NO_AUTH=true。
 *
 * 用法：
 *   const guard = await requireSession(request);
 *   if (guard) return guard;
 */
export async function requireSession(request: Request) {
  if (!isAuthEnabled()) {
    // 未设密码：开发放行；生产需显式 ALLOW_NO_AUTH 才放行
    if (process.env.NODE_ENV !== "production" || isOpenAccessAllowed()) {
      return null;
    }
    warnNoAuthOnce();
    return unauthorized(
      "服务端未配置 ACCESS_PASSWORD，管理接口已禁用。请设置访问密码，或显式设置 ALLOW_NO_AUTH=true 开放访问。",
    );
  }

  // 简单优化：未带 cookie 直接 401，避免无谓的 iron-session 解析
  const cookieHeader = request.headers.get("cookie") ?? "";
  if (!cookieHeader.includes(SESSION_COOKIE_NAME)) {
    return unauthorized();
  }

  const s = await getSession();
  if (!s.authed || s.role !== "admin") return unauthorized();
  return null;
}

let warnedNoAuth = false;
function warnNoAuthOnce() {
  if (warnedNoAuth) return;
  warnedNoAuth = true;
  // 延迟 import 避免 logger → db 在边缘运行时的硬依赖
  void import("@/lib/logger")
    .then(({ createLogger }) =>
      createLogger("session").warn(
        "生产环境未配置 ACCESS_PASSWORD，管理接口已禁用（设 ALLOW_NO_AUTH=true 可开放）",
      ),
    )
    .catch(() => {});
}

function unauthorized(message = "未登录或会话已过期"): Response {
  return new Response(JSON.stringify({ error: message }), {
    status: 401,
    headers: { "content-type": "application/json" },
  });
}
