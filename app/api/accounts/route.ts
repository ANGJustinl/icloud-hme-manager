import { type NextRequest } from "next/server";

import { createAccount, listAccounts } from "@/lib/db/accounts";
import { handleError, isIcloudDomain, json, parseBody } from "@/lib/http";
import { requireSession } from "@/lib/session";
import { CookieParseError, parseCookieInput } from "@/lib/icloud/cookie";
import { createLogger } from "@/lib/logger";

const log = createLogger("accounts");

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 列出所有账号（不含 cookie） */
export async function GET(request: NextRequest) {
  const guard = await requireSession(request);
  if (guard) return guard;
  try {
    return json({ accounts: listAccounts() });
  } catch (e) {
    return handleError(e);
  }
}

/** 创建账号 */
export async function POST(request: NextRequest) {
  const guard = await requireSession(request);
  if (guard) return guard;
  try {
    const body = await parseBody<{
      name?: string;
      domain?: string;
      cookie?: string;
      imapUsername?: string;
      imapAppPassword?: string;
    }>(request);

    const name = body.name?.trim();
    const rawCookie = body.cookie?.trim();
    if (!name) return json({ error: "账号名称不能为空" }, 400);
    if (!rawCookie) return json({ error: "Cookie 不能为空" }, 400);
    if (!isIcloudDomain(body.domain)) {
      return json({ error: "domain 必须是 icloud.com 或 icloud.com.cn" }, 400);
    }

    // 归一化多格式 Cookie（Netscape / JSON / Header String）
    let cookie: string;
    let cookieFormat: string;
    try {
      const parsed = parseCookieInput(rawCookie);
      cookie = parsed.cookie;
      cookieFormat = parsed.format;
    } catch (e) {
      if (e instanceof CookieParseError) return json({ error: e.message }, 400);
      throw e;
    }

    // IMAP 配置可选，但要么都填要么都不填
    const hasUser = Boolean(body.imapUsername?.trim());
    const hasPass = Boolean(body.imapAppPassword?.trim());
    if (hasUser !== hasPass) {
      return json({ error: "IMAP 主邮箱地址和应用专用密码需同时填写或同时留空" }, 400);
    }

    const account = createAccount({
      name,
      domain: body.domain,
      cookie,
      imapUsername: hasUser ? body.imapUsername!.trim() : undefined,
      imapAppPassword: hasPass ? body.imapAppPassword!.trim() : undefined,
    });
    log.info("账号已创建", {
      accountId: account.id,
      name: account.name,
      domain: account.domain,
      cookieFormat,
      hasImap: hasUser,
    });
    return json({ account }, 201);
  } catch (e) {
    return handleError(e);
  }
}
