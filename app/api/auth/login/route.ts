import { type NextRequest } from "next/server";

import { isAuthEnabled, tryLogin } from "@/lib/session";
import { handleError, json, parseBody } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET：前端探测是否需要登录 */
export async function GET() {
  return json({ authRequired: isAuthEnabled() });
}

/** POST：提交密码登录 */
export async function POST(request: NextRequest) {
  try {
    const { password } = await parseBody<{ password?: string }>(request);
    const ok = await tryLogin(password ?? "");
    if (!ok) return json({ error: "密码错误" }, 401);
    return json({ ok: true });
  } catch (e) {
    return handleError(e);
  }
}
