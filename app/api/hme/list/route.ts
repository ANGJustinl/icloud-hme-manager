import { type NextRequest } from "next/server";

import { buildClientForAccount, handleError, json } from "@/lib/http";
import { requireSession } from "@/lib/session";
import { getUsageMap } from "@/lib/db/aliasUsage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 列出指定账号的所有别名（已按创建时间倒序），并 merge 本地用法追踪 */
export async function GET(request: NextRequest) {
  const guard = await requireSession(request);
  if (guard) return guard;
  try {
    const accountId = Number(request.nextUrl.searchParams.get("accountId"));
    if (!Number.isInteger(accountId) || accountId <= 0) {
      return json({ error: "缺少有效的 accountId 参数" }, 400);
    }

    const client = await buildClientForAccount(accountId);
    const emails = await client.list();
    // merge 本地用法追踪（site/tags），按 anonymousId 关联
    const usage = getUsageMap(accountId);
    const merged = emails.map((e) => {
      const u = usage[e.anonymousId];
      return u
        ? { ...e, site: u.site, usageTags: u.tags, usedAt: u.usedAt }
        : e;
    });
    return json({ emails: merged });
  } catch (e) {
    return handleError(e);
  }
}
