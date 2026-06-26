import "server-only";

import {
  getRelaySourcePublic,
  getRelaySourceUrl,
  updateRelaySourceLookupState,
} from "@/lib/db/relaySources";
import {
  assertFetchableMailboxUrl,
  fetchRelayPayload,
  normalizeRelayPayload,
} from "@/lib/mail/relay";
import { createRelayAccessToken } from "@/lib/relayJwt";

export async function buildRelayShare(request: Request, sourceId: number) {
  const source = getRelaySourcePublic(sourceId);
  if (!source) throw new Error("API 邮箱不存在");

  let inbox = source.inboxHint?.trim() || "";
  if (!inbox) {
    const urlString = getRelaySourceUrl(sourceId);
    if (!urlString) throw new Error("API 邮箱地址不存在");
    const url = await assertFetchableMailboxUrl(urlString);
    const payload = await fetchRelayPayload(url);
    const result = normalizeRelayPayload(payload, url);
    inbox = result.inbox?.trim() || "";
    if (inbox) {
      updateRelaySourceLookupState(sourceId, {
        inboxHint: inbox,
        lastCode: result.code,
        lastSubject: result.latest?.subject ?? null,
        lastSender: result.latest?.from ?? null,
        lastCheckedAt: result.checkedAt,
        lastMessageDate: result.messageDate,
      });
    }
  }

  if (!inbox) {
    throw new Error("尚未识别该 API 邮箱地址，请先刷新一次");
  }

  const share = createRelayAccessToken({ sourceId, inbox });
  const baseUrl = getBaseUrl(request);
  const encodedInbox = encodeURIComponent(inbox);

  return {
    inbox,
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
