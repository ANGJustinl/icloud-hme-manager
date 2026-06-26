import { json } from "@/lib/http";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 健康检查端点（无需登录，供 Docker HEALTHCHECK / 反代探活）。
 * 探一次 SQLite 连通性；不泄漏任何账号/配置信息。
 */
export async function GET() {
  try {
    db.prepare("SELECT 1").get();
    return json({ status: "ok", time: Date.now() });
  } catch {
    return json({ status: "degraded", time: Date.now() }, 503);
  }
}
