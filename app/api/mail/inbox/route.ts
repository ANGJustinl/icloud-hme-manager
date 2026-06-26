import { type NextRequest } from "next/server";

import { buildImapDeps, handleError, json } from "@/lib/http";
import { fetchInbox } from "@/lib/mail/client";
import { requireSession } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// IMAP 是网络阻塞操作，给足时间
export const maxDuration = 30;

/** 拉取收件箱列表
 *  GET /api/mail/inbox?accountId=1&alias=xxx@icloud.com&limit=30&unreadOnly=false
 */
export async function GET(request: NextRequest) {
  const guard = await requireSession(request);
  if (guard) return guard;
  try {
    const sp = request.nextUrl.searchParams;
    const accountId = Number(sp.get("accountId"));
    if (!Number.isInteger(accountId) || accountId <= 0) {
      return json({ error: "缺少有效的 accountId" }, 400);
    }

    const limit = sp.get("limit") ? Number(sp.get("limit")) : 30;
    const unreadOnly = sp.get("unreadOnly") === "true";
    const alias = sp.get("alias")?.trim() || undefined;

    const deps = buildImapDeps(accountId);
    const emails = await fetchInbox(deps, { alias, limit, unreadOnly });
    return json({ emails });
  } catch (e) {
    return handleError(e);
  }
}
