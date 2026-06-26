import { type NextRequest } from "next/server";

import { buildClientForAccount, handleError, json, parseBody } from "@/lib/http";
import { requireSession } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 保留一个已生成但未保留的邮箱地址 */
export async function POST(request: NextRequest) {
  const guard = await requireSession(request);
  if (guard) return guard;
  try {
    const body = await parseBody<{
      accountId?: number;
      hme?: string;
      label?: string;
      note?: string;
    }>(request);

    const accountId = Number(body.accountId);
    const hme = body.hme?.trim();
    if (!Number.isInteger(accountId) || accountId <= 0) {
      return json({ error: "缺少有效的 accountId" }, 400);
    }
    if (!hme) return json({ error: "缺少 hme 邮箱地址" }, 400);

    const label = body.label?.trim() || "Alias_" + Math.random().toString(36).substring(2, 6).toUpperCase();
    const note = body.note?.trim() || "";

    const client = await buildClientForAccount(accountId);
    await client.reserve(hme, label, note);
    return json({ ok: true });
  } catch (e) {
    return handleError(e);
  }
}
