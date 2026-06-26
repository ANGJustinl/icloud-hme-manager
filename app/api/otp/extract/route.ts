import { type NextRequest } from "next/server";

import { buildImapDeps, handleError, json } from "@/lib/http";
import { extractLatestOtp } from "@/lib/mail/client";
import { requireSession } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

/** 从最新邮件中提取验证码
 *  GET /api/otp/extract?accountId=1&alias=xxx@icloud.com&limit=10
 *  返回 { otp: OtpExtract | null, latest: MailSummary[] }
 */
export async function GET(request: NextRequest) {
  const guard = await requireSession(request);
  if (guard) return guard;
  try {
    const sp = request.nextUrl.searchParams;
    const accountId = Number(sp.get("accountId"));
    if (!Number.isInteger(accountId) || accountId <= 0) {
      return json({ error: "缺少有效的 accountId" }, 400);
    }

    const limit = sp.get("limit") ? Number(sp.get("limit")) : 30;
    const alias = sp.get("alias")?.trim() || undefined;

    const deps = buildImapDeps(accountId);
    const result = await extractLatestOtp(deps, { alias, limit });
    return json(result);
  } catch (e) {
    return handleError(e);
  }
}
