import { type NextRequest } from "next/server";

import { getRelaySourcePublic } from "@/lib/db/relaySources";
import { handleError, json } from "@/lib/http";
import { RelayError } from "@/lib/mail/relay";
import { buildRelayShare } from "@/lib/relayShare";
import { requireSession } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

type Ctx = { params: Promise<{ id: string }> };

async function parseId(ctx: Ctx): Promise<number | null> {
  const { id } = await ctx.params;
  const n = Number(id);
  return Number.isInteger(n) && n > 0 ? n : null;
}

export async function GET(request: NextRequest, ctx: Ctx) {
  const guard = await requireSession(request);
  if (guard) return guard;

  try {
    const id = await parseId(ctx);
    if (id == null) return json({ error: "非法的 source ID" }, 400);
    if (!getRelaySourcePublic(id)) return json({ error: "API 邮箱不存在" }, 404);
    const share = await buildRelayShare(request, id);

    return json({ share });
  } catch (e) {
    if (e instanceof RelayError) return json({ error: e.message }, e.status);
    return handleError(e);
  }
}
