import { type NextRequest } from "next/server";

import { handleError, json } from "@/lib/http";
import { requireSession } from "@/lib/session";
import { clearLogs, queryLogs } from "@/lib/db/logs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 查询应用日志 GET /api/logs?level=error&scope=accounts&limit=200 */
export async function GET(request: NextRequest) {
  const guard = await requireSession(request);
  if (guard) return guard;
  try {
    const sp = request.nextUrl.searchParams;
    const level = sp.get("level")?.trim() || undefined;
    const scope = sp.get("scope")?.trim() || undefined;
    const limit = sp.get("limit") ? Number(sp.get("limit")) : undefined;
    return json({ logs: queryLogs({ level, scope, limit }) });
  } catch (e) {
    return handleError(e);
  }
}

/** 清空日志 */
export async function DELETE(request: NextRequest) {
  const guard = await requireSession(request);
  if (guard) return guard;
  try {
    clearLogs();
    return json({ ok: true });
  } catch (e) {
    return handleError(e);
  }
}
