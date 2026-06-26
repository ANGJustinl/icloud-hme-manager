import { type NextRequest } from "next/server";

import {
  deleteRelaySource,
  getRelaySourcePublic,
  updateRelaySource,
} from "@/lib/db/relaySources";
import { handleError, json, parseBody } from "@/lib/http";
import { assertFetchableMailboxUrl, RelayError } from "@/lib/mail/relay";
import { requireSession } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

async function parseId(ctx: Ctx): Promise<number | null> {
  const { id } = await ctx.params;
  const n = Number(id);
  return Number.isInteger(n) && n > 0 ? n : null;
}

export async function PATCH(request: NextRequest, ctx: Ctx) {
  const guard = await requireSession(request);
  if (guard) return guard;

  try {
    const id = await parseId(ctx);
    if (id == null) return json({ error: "非法的 source ID" }, 400);
    if (!getRelaySourcePublic(id)) return json({ error: "API 邮箱不存在" }, 404);

    const body = await parseBody<{
      name?: string;
      url?: string;
      inboxHint?: string | null;
    }>(request);

    const input: { name?: string; url?: string; inboxHint?: string | null } = {};
    if (typeof body.name === "string") {
      const name = body.name.trim();
      if (!name) return json({ error: "名称不能为空" }, 400);
      input.name = name;
    }
    if (typeof body.url === "string") {
      const url = body.url.trim();
      if (!url) return json({ error: "邮箱 API 地址不能为空" }, 400);
      await assertFetchableMailboxUrl(url);
      input.url = url;
    }
    if (body.inboxHint !== undefined) input.inboxHint = body.inboxHint;

    const source = updateRelaySource(id, input);
    return json({ source });
  } catch (e) {
    if (e instanceof RelayError) return json({ error: e.message }, e.status);
    return handleError(e);
  }
}

export async function DELETE(request: NextRequest, ctx: Ctx) {
  const guard = await requireSession(request);
  if (guard) return guard;

  try {
    const id = await parseId(ctx);
    if (id == null) return json({ error: "非法的 source ID" }, 400);
    const ok = deleteRelaySource(id);
    if (!ok) return json({ error: "API 邮箱不存在" }, 404);
    return json({ ok: true });
  } catch (e) {
    return handleError(e);
  }
}
