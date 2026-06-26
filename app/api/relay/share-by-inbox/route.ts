import { type NextRequest } from "next/server";

import { findRelaySourcePublicByInboxHint } from "@/lib/db/relaySources";
import { buildImapDeps, handleError, json } from "@/lib/http";
import { RelayError } from "@/lib/mail/relay";
import { createImapAliasAccessToken } from "@/lib/relayJwt";
import { buildRelayShare } from "@/lib/relayShare";
import { requireSession } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET(request: NextRequest) {
  const guard = await requireSession(request);
  if (guard) return guard;

  try {
    const inbox = request.nextUrl.searchParams.get("inbox")?.trim() || "";
    const accountIdRaw = request.nextUrl.searchParams.get("accountId");
    if (!inbox) return json({ error: "缺少 inbox" }, 400);

    const source = findRelaySourcePublicByInboxHint(inbox);
    if (source) {
      const share = await buildRelayShare(request, source.id);
      return json({ share, source });
    }

    const accountId = accountIdRaw ? Number(accountIdRaw) : NaN;
    if (!Number.isInteger(accountId) || accountId <= 0) {
      return json({ error: "未找到该别名对应的 API 邮箱，且缺少有效的 accountId" }, 404);
    }

    // 确认该账号已配置 IMAP，才能签发按别名访问的用户页 token
    buildImapDeps(accountId);
    const share = buildImapAliasShare(request, accountId, inbox);
    return json({ share, source: null });
  } catch (e) {
    if (e instanceof RelayError) return json({ error: e.message }, e.status);
    return handleError(e);
  }
}

function buildImapAliasShare(request: Request, accountId: number, inbox: string) {
  const share = createImapAliasAccessToken({ accountId, inbox });
  const baseUrl = getBaseUrl(request);
  const encodedInbox = encodeURIComponent(inbox.trim().toLowerCase());
  return {
    inbox: inbox.trim().toLowerCase(),
    token: share.token,
    expiresAt: share.expiresAt,
    pageUrl: `${baseUrl}/inboxes/${encodedInbox}?token=${share.token}`,
    apiUrl: `${baseUrl}/api/public/inboxes/${encodedInbox}/messages?token=${share.token}&view=all&limit=100`,
  };
}

function getBaseUrl(request: Request): string {
  const url = new URL(request.url);
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? url.host;
  const proto = request.headers.get("x-forwarded-proto") ?? url.protocol.replace(":", "");
  return `${proto}://${host}`;
}
