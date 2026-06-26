import { type NextRequest } from "next/server";

import {
  getRelaySourcePublic,
  getRelaySourceUrl,
  updateRelaySourceLookupState,
} from "@/lib/db/relaySources";
import { buildImapDeps, json } from "@/lib/http";
import {
  fetchInbox,
  fetchMail,
  MailError,
} from "@/lib/mail/client";
import {
  assertFetchableMailboxUrl,
  RelayMessage,
  fetchRelayPayload,
  normalizeRelayPayload,
  RelayError,
} from "@/lib/mail/relay";
import { RelayJwtError, verifyRelayAccessToken } from "@/lib/relayJwt";
import { extractOtp } from "@/lib/otp";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

type Ctx = { params: Promise<{ inbox: string }> };
type PublicRelayMessage = RelayMessage & {
  uid?: number;
  source?: "imap_alias" | "relay_source";
};

export async function GET(request: NextRequest, ctx: Ctx) {
  try {
    const { inbox } = await ctx.params;
    const requestedInbox = decodeURIComponent(inbox).trim().toLowerCase();
    const token = request.nextUrl.searchParams.get("token")?.trim() || "";
    const view = request.nextUrl.searchParams.get("view") === "latest" ? "latest" : "all";
    const limit = clampLimit(request.nextUrl.searchParams.get("limit"));

    if (!token) return json({ ok: false, error: "缺少 token" }, 401);

    const claims = verifyRelayAccessToken(token);
    if (claims.inbox !== requestedInbox) {
      return json({ ok: false, error: "token 与邮箱不匹配" }, 403);
    }

    if (claims.kind === "imap_alias") {
      const accountId = Number(claims.sub);
      if (!Number.isInteger(accountId) || accountId <= 0) {
        return json({ ok: false, error: "token 非法" }, 401);
      }
      const deps = buildImapDeps(accountId);
      const fetchLimit = view === "latest" ? 1 : limit;
      const summaries = await fetchInbox(deps, {
        alias: requestedInbox,
        limit: fetchLimit,
      });
      const messages: PublicRelayMessage[] = summaries.slice(0, fetchLimit).map((mail) => ({
        id: String(mail.uid),
        uid: mail.uid,
        from: mail.from,
        fromAddress: mail.fromAddress,
        to: mail.to,
        subject: mail.subject,
        date: mail.date,
        snippet: mail.snippet,
        text: "",
        html: null,
        code: null,
        codeRule: null,
        source: "imap_alias" as const,
      }));
      if (messages[0]) {
        messages[0] = await enrichLatestImapMessage(deps, requestedInbox, messages[0]);
      }
      const latest = messages[0] ?? null;
      const finalMessages = view === "latest" ? (latest ? [latest] : []) : messages;

      return json({
        ok: true,
        inbox: {
          email: requestedInbox,
          name: requestedInbox,
        },
        count: messages.length,
        latestCode: latest?.code ?? null,
        latest,
        messages: finalMessages,
        checkedAt: Date.now(),
      });
    }

    const sourceId = Number(claims.sub);
    if (!Number.isInteger(sourceId) || sourceId <= 0) {
      return json({ ok: false, error: "token 非法" }, 401);
    }

    const source = getRelaySourcePublic(sourceId);
    if (!source) return json({ ok: false, error: "邮箱不存在" }, 404);
    if (source.inboxHint && source.inboxHint.trim().toLowerCase() !== requestedInbox) {
      return json({ ok: false, error: "邮箱与 token 不匹配" }, 403);
    }

    const sourceUrl = getRelaySourceUrl(sourceId);
    if (!sourceUrl) return json({ ok: false, error: "邮箱地址不存在" }, 404);

    const url = await assertFetchableMailboxUrl(sourceUrl);
    const payload = await fetchRelayPayload(url);
    const result = normalizeRelayPayload(payload, url);
    const resolvedInbox = result.inbox?.trim().toLowerCase() || requestedInbox;
    if (resolvedInbox !== requestedInbox) {
      return json({ ok: false, error: "邮箱与 token 不匹配" }, 403);
    }

    updateRelaySourceLookupState(sourceId, {
      inboxHint: result.inbox,
      lastCode: result.code,
      lastSubject: result.latest?.subject ?? null,
      lastSender: result.latest?.from ?? null,
      lastCheckedAt: result.checkedAt,
      lastMessageDate: result.messageDate,
    });

    const messages = result.messages.slice(0, limit).map((mail) => ({
      ...mail,
      source: "relay_source" as const,
    }));
    const latest = messages[0] ?? null;
    const finalMessages = view === "latest" ? (latest ? [latest] : []) : messages;

    return json({
      ok: true,
      inbox: {
        email: result.inbox ?? requestedInbox,
        name: source.name,
      },
      count: finalMessages.length,
      latestCode: latest?.code ?? null,
      latest,
      messages: finalMessages,
      checkedAt: result.checkedAt,
    });
  } catch (e) {
    if (e instanceof RelayJwtError) {
      return json({ ok: false, error: e.message }, 401);
    }
    if (e instanceof RelayError) {
      return json({ ok: false, error: e.message }, e.status);
    }
    if (e instanceof MailError) {
      return json({ ok: false, error: e.message }, 400);
    }
    const message = e instanceof Error ? e.message : String(e);
    return json({ ok: false, error: message }, 500);
  }
}

function clampLimit(value: string | null): number {
  const n = value ? Number(value) : 100;
  if (!Number.isFinite(n)) return 100;
  return Math.min(100, Math.max(1, Math.trunc(n)));
}

async function enrichLatestImapMessage(
  deps: { username: string; password: string },
  alias: string,
  message: PublicRelayMessage,
) {
  const looksLikeCode = /验证码|code|otp|verify|passcode/i.test(`${message.subject} ${message.snippet}`);
  if (!message.uid || !looksLikeCode) return message;

  const mail = await fetchMail(deps, message.uid, alias);
  const hit = extractOtp(mail.subject, `${mail.text}\n${mail.snippet}`);
  if (!hit) {
    return {
      ...message,
      text: mail.text,
      html: mail.html,
    };
  }

  return {
    ...message,
    text: mail.text,
    html: mail.html,
    code: hit.code,
    codeRule: hit.rule,
  };
}
