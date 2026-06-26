import { type NextRequest } from "next/server";

import { buildImapDeps, json } from "@/lib/http";
import { fetchMail, MailError } from "@/lib/mail/client";
import { RelayJwtError, verifyRelayAccessToken } from "@/lib/relayJwt";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

type Ctx = { params: Promise<{ inbox: string; uid: string }> };

export async function GET(request: NextRequest, ctx: Ctx) {
  try {
    const { inbox, uid } = await ctx.params;
    const requestedInbox = decodeURIComponent(inbox).trim().toLowerCase();
    const token = request.nextUrl.searchParams.get("token")?.trim() || "";
    const parsedUid = Number(uid);

    if (!token) return json({ ok: false, error: "缺少 token" }, 401);
    if (!Number.isInteger(parsedUid) || parsedUid <= 0) {
      return json({ ok: false, error: "uid 非法" }, 400);
    }

    const claims = verifyRelayAccessToken(token);
    if (claims.kind !== "imap_alias") {
      return json({ ok: false, error: "该 token 不支持 IMAP 邮件详情" }, 400);
    }
    if (claims.inbox !== requestedInbox) {
      return json({ ok: false, error: "token 与邮箱不匹配" }, 403);
    }

    const accountId = Number(claims.sub);
    if (!Number.isInteger(accountId) || accountId <= 0) {
      return json({ ok: false, error: "token 非法" }, 401);
    }

    const deps = buildImapDeps(accountId);
    const mail = await fetchMail(deps, parsedUid, requestedInbox);
    return json({ ok: true, mail });
  } catch (e) {
    if (e instanceof RelayJwtError) {
      return json({ ok: false, error: e.message }, 401);
    }
    if (e instanceof MailError) {
      return json({ ok: false, error: e.message }, 400);
    }
    const message = e instanceof Error ? e.message : String(e);
    return json({ ok: false, error: message }, 500);
  }
}
