import { type NextRequest } from "next/server";

import { buildClientForAccount, handleError, json, parseBody } from "@/lib/http";
import { requireSession } from "@/lib/session";
import { deleteUsage } from "@/lib/db/aliasUsage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 永久删除别名（增强功能，不可恢复） */
export async function POST(request: NextRequest) {
  const guard = await requireSession(request);
  if (guard) return guard;
  try {
    const body = await parseBody<{ accountId?: number; anonymousId?: string }>(request);

    const accountId = Number(body.accountId);
    const anonymousId = body.anonymousId?.trim();
    if (!Number.isInteger(accountId) || accountId <= 0) {
      return json({ error: "缺少有效的 accountId" }, 400);
    }
    if (!anonymousId) return json({ error: "缺少 anonymousId" }, 400);

    const client = await buildClientForAccount(accountId);
    await client.remove(anonymousId);
    // 别名已从 iCloud 删除，清理本地用法记录避免孤儿数据
    deleteUsage(accountId, anonymousId);
    return json({ ok: true });
  } catch (e) {
    return handleError(e);
  }
}
