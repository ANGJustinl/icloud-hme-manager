import { type NextRequest } from "next/server";

import { isAuthEnabled, isUsernameRequired, tryLogin } from "@/lib/session";
import { handleError, json, parseBody } from "@/lib/http";
import { createLogger } from "@/lib/logger";

const log = createLogger("auth");

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET：前端探测是否需要登录、是否需要用户名 */
export async function GET() {
  return json({
    authRequired: isAuthEnabled(),
    usernameRequired: isUsernameRequired(),
  });
}

/** POST：提交凭证登录 */
export async function POST(request: NextRequest) {
  try {
    const { username, password } = await parseBody<{
      username?: string;
      password?: string;
    }>(request);
    const ok = await tryLogin(password ?? "", username);
    if (!ok) {
      log.warn("管理员登录失败");
      return json({ error: "用户名或密码错误" }, 401);
    }
    log.info("管理员登录成功");
    return json({ ok: true });
  } catch (e) {
    return handleError(e);
  }
}
