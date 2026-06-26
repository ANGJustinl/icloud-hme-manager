import { type NextRequest } from "next/server";

import { buildClientForAccount, handleError, json } from "@/lib/http";
import { requireSession } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 列出指定账号的所有别名（已按创建时间倒序） */
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
    return json({ emails });
  } catch (e) {
    return handleError(e);
  }
}
