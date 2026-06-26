import { type NextRequest } from "next/server";

import { buildClientForAccount, handleError, json, parseBody } from "@/lib/http";
import { requireSession } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 停用别名转发 */
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
    await client.deactivate(anonymousId);
    return json({ ok: true });
  } catch (e) {
    return handleError(e);
  }
}
