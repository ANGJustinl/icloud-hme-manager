import { type NextRequest } from "next/server";

import { buildClientForAccount, handleError, json, parseBody } from "@/lib/http";
import { requireSession } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 更新别名的标签和备注（增强功能） */
export async function POST(request: NextRequest) {
  const guard = await requireSession(request);
  if (guard) return guard;
  try {
    const body = await parseBody<{
      accountId?: number;
      anonymousId?: string;
      label?: string;
      note?: string;
    }>(request);

    const accountId = Number(body.accountId);
    const anonymousId = body.anonymousId?.trim();
    if (!Number.isInteger(accountId) || accountId <= 0) {
      return json({ error: "缺少有效的 accountId" }, 400);
    }
    if (!anonymousId) return json({ error: "缺少 anonymousId" }, 400);
    if (typeof body.label !== "string" || typeof body.note !== "string") {
      return json({ error: "label 和 note 必填" }, 400);
    }

    const client = await buildClientForAccount(accountId);
    await client.update(anonymousId, body.label.trim(), body.note.trim());
    return json({ ok: true });
  } catch (e) {
    return handleError(e);
  }
}
