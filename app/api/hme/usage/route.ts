import { type NextRequest } from "next/server";

import { handleError, json, parseBody } from "@/lib/http";
import { requireSession } from "@/lib/session";
import { setUsage } from "@/lib/db/aliasUsage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 设置/更新别名用法（本地数据，不调用 iCloud）。
 * body: { accountId, anonymousId, site?, tags? }
 *  - site：传字符串=设置，传 null/"" =清空，不传=保持
 *  - tags：传数组=覆盖，不传=保持
 */
export async function POST(request: NextRequest) {
  const guard = await requireSession(request);
  if (guard) return guard;
  try {
    const body = await parseBody<{
      accountId?: number;
      anonymousId?: string;
      site?: string | null;
      tags?: string[];
    }>(request);

    const accountId = Number(body.accountId);
    const anonymousId = body.anonymousId?.trim();
    if (!Number.isInteger(accountId) || accountId <= 0) {
      return json({ error: "缺少有效的 accountId" }, 400);
    }
    if (!anonymousId) return json({ error: "缺少 anonymousId" }, 400);
    if (body.tags !== undefined && !Array.isArray(body.tags)) {
      return json({ error: "tags 必须是数组" }, 400);
    }

    setUsage(accountId, anonymousId, { site: body.site, tags: body.tags });
    return json({ ok: true });
  } catch (e) {
    return handleError(e);
  }
}
