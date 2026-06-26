import { type NextRequest } from "next/server";

import { getRelaySourcePublic, getRelaySourceUrl } from "@/lib/db/relaySources";
import { handleError, json, parseBody } from "@/lib/http";
import {
  assertFetchableMailboxUrl,
  fetchRelayPayload,
  normalizeRelayPayload,
  RelayError,
} from "@/lib/mail/relay";
import { requireSession } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function POST(request: NextRequest) {
  const guard = await requireSession(request);
  if (guard) return guard;

  try {
    const body = await parseBody<{ url?: string; sourceId?: number; messageId?: string }>(request);
    const sourceId =
      body.sourceId === undefined ? null : Number(body.sourceId);
    if (sourceId !== null && (!Number.isInteger(sourceId) || sourceId <= 0)) {
      return json({ error: "sourceId 非法" }, 400);
    }
    const messageId = body.messageId?.trim();
    if (!messageId) return json({ error: "缺少 messageId" }, 400);

    let input = body.url?.trim() || "";
    if (sourceId !== null) {
      if (!getRelaySourcePublic(sourceId)) return json({ error: "API 邮箱不存在" }, 404);
      input = getRelaySourceUrl(sourceId) ?? "";
    }
    if (!input) return json({ error: "邮箱 API 地址不能为空" }, 400);

    const url = await assertFetchableMailboxUrl(input);
    const payload = await fetchRelayPayload(url);
    const result = normalizeRelayPayload(payload, url, { includeBodies: true });
    const message = result.messages.find((item) => item.id === messageId) ?? null;
    if (!message) return json({ error: "邮件不存在" }, 404);
    return json({ message });
  } catch (e) {
    if (e instanceof RelayError) return json({ error: e.message }, e.status);
    return handleError(e);
  }
}
