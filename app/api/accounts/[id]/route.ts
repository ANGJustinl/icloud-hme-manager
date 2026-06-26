import { type NextRequest } from "next/server";

import {
  deleteAccount,
  getAccountPublic,
  updateAccountCookie,
  updateAccountImap,
  updateAccountName,
} from "@/lib/db/accounts";
import { handleError, json, parseBody } from "@/lib/http";
import { requireSession } from "@/lib/session";
import { deleteAllUsageForAccount } from "@/lib/db/aliasUsage";
import { CookieParseError, parseCookieInput } from "@/lib/icloud/cookie";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

async function parseId(ctx: Ctx): Promise<number | null> {
  const { id } = await ctx.params;
  const n = Number(id);
  return Number.isInteger(n) && n > 0 ? n : null;
}

/** 更新账号（名称和/或 cookie） */
export async function PATCH(request: NextRequest, ctx: Ctx) {
  const guard = await requireSession(request);
  if (guard) return guard;
  try {
    const id = await parseId(ctx);
    if (id == null) return json({ error: "非法的账号 ID" }, 400);
    if (!getAccountPublic(id)) return json({ error: "账号不存在" }, 404);

    const body = await parseBody<{
      name?: string;
      cookie?: string;
      imapUsername?: string | null;
      imapAppPassword?: string | null;
    }>(request);

    if (typeof body.name === "string") {
      const name = body.name.trim();
      if (!name) return json({ error: "账号名称不能为空" }, 400);
      updateAccountName(id, name);
    }
    if (typeof body.cookie === "string") {
      const rawCookie = body.cookie.trim();
      if (!rawCookie) return json({ error: "Cookie 不能为空" }, 400);
      let cookie: string;
      try {
        cookie = parseCookieInput(rawCookie).cookie;
      } catch (e) {
        if (e instanceof CookieParseError) return json({ error: e.message }, 400);
        throw e;
      }
      updateAccountCookie(id, cookie);
    }
    // IMAP 配置：imapUsername 字段存在即触发更新（null = 清除）
    if (body.imapUsername !== undefined) {
      // 清除：显式传 null
      if (body.imapUsername === null) {
        updateAccountImap(id, null, null);
      } else {
        const username = body.imapUsername.trim();
        const password = typeof body.imapAppPassword === "string" ? body.imapAppPassword.trim() : "";
        if (!username || !password) {
          return json({ error: "IMAP 主邮箱地址和应用专用密码需同时填写" }, 400);
        }
        updateAccountImap(id, username, password);
      }
    }

    return json({ account: getAccountPublic(id) });
  } catch (e) {
    return handleError(e);
  }
}

/** 删除账号 */
export async function DELETE(request: NextRequest, ctx: Ctx) {
  const guard = await requireSession(request);
  if (guard) return guard;
  try {
    const id = await parseId(ctx);
    if (id == null) return json({ error: "非法的账号 ID" }, 400);
    const ok = deleteAccount(id);
    if (!ok) return json({ error: "账号不存在" }, 404);
    // 级联清理本地别名用法记录
    deleteAllUsageForAccount(id);
    return json({ ok: true });
  } catch (e) {
    return handleError(e);
  }
}
