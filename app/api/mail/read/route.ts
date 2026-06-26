import { type NextRequest } from "next/server";

import { buildImapDeps, handleError, json } from "@/lib/http";
import { fetchMail } from "@/lib/mail/client";
import { requireSession } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

/** 读取单封邮件完整内容
 *  GET /api/mail/read?accountId=1&uid=12345
 */
export async function GET(request: NextRequest) {
  const guard = await requireSession(request);
  if (guard) return guard;
  try {
    const sp = request.nextUrl.searchParams;
    const accountId = Number(sp.get("accountId"));
    const uid = Number(sp.get("uid"));
    if (!Number.isInteger(accountId) || accountId <= 0) {
      return json({ error: "缺少有效的 accountId" }, 400);
    }
    if (!Number.isInteger(uid) || uid <= 0) {
      return json({ error: "缺少有效的 uid" }, 400);
    }

    const deps = buildImapDeps(accountId);
    const mail = await fetchMail(deps, uid);
    return json({ mail });
  } catch (e) {
    return handleError(e);
  }
}
