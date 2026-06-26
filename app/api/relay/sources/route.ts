import { type NextRequest } from "next/server";

import {
  createRelaySource,
  listRelaySources,
} from "@/lib/db/relaySources";
import { handleError, json, parseBody } from "@/lib/http";
import { assertFetchableMailboxUrl, normalizeRelayPayload, fetchRelayPayload, RelayError } from "@/lib/mail/relay";
import { requireSession } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const guard = await requireSession(request);
  if (guard) return guard;

  try {
    return json({ sources: listRelaySources() });
  } catch (e) {
    return handleError(e);
  }
}

export async function POST(request: NextRequest) {
  const guard = await requireSession(request);
  if (guard) return guard;

  try {
    const body = await parseBody<{ name?: string; url?: string }>(request);
    const name = body.name?.trim();
    const inputUrl = body.url?.trim();
    if (!name) return json({ error: "名称不能为空" }, 400);
    if (!inputUrl) return json({ error: "邮箱 API 地址不能为空" }, 400);

    const url = await assertFetchableMailboxUrl(inputUrl);
    let inboxHint: string | null = null;
    let lastCode: string | null = null;
    let lastSubject: string | null = null;
    let lastSender: string | null = null;
    let lastCheckedAt: number | null = null;
    let lastMessageDate: number | null = null;
    try {
      const payload = await fetchRelayPayload(url);
      const normalized = normalizeRelayPayload(payload, url);
      inboxHint = normalized.inbox;
      lastCode = normalized.code;
      lastSubject = normalized.latest?.subject ?? null;
      lastSender = normalized.latest?.from ?? null;
      lastCheckedAt = normalized.checkedAt;
      lastMessageDate = normalized.latest?.date ?? null;
    } catch {
      // 新增时只要求 URL 安全且格式有效；接口暂时失败不阻止保存。
    }

    return json({
      source: createRelaySource({
        name,
        url: inputUrl,
        inboxHint,
        lastCode,
        lastSubject,
        lastSender,
        lastCheckedAt,
        lastMessageDate,
      }),
    }, 201);
  } catch (e) {
    if (e instanceof RelayError) return json({ error: e.message }, e.status);
    return handleError(e);
  }
}
