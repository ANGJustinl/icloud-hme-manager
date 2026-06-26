import "server-only";

import { createHmac, timingSafeEqual } from "crypto";
import { ensureSessionSecret } from "@/lib/session";

const JWT_HEADER = { alg: "HS256", typ: "JWT" };
const DEFAULT_TTL_SECONDS = 60 * 60 * 24 * 30;

export interface RelayAccessClaims {
  sub: string;
  inbox: string;
  iat: number;
  exp: number;
  kind: "relay_source" | "imap_alias";
}

export class RelayJwtError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RelayJwtError";
  }
}

export function createRelayAccessToken(
  input: { sourceId: number; inbox: string; ttlSeconds?: number },
): { token: string; expiresAt: number } {
  const now = Math.floor(Date.now() / 1000);
  const exp = now + (input.ttlSeconds ?? DEFAULT_TTL_SECONDS);
  const payload: RelayAccessClaims = {
    sub: String(input.sourceId),
    inbox: input.inbox.trim().toLowerCase(),
    iat: now,
    exp,
    kind: "relay_source",
  };

  const header = base64UrlEncode(JSON.stringify(JWT_HEADER));
  const body = base64UrlEncode(JSON.stringify(payload));
  const signature = sign(`${header}.${body}`);
  return {
    token: `${header}.${body}.${signature}`,
    expiresAt: exp * 1000,
  };
}

export function createImapAliasAccessToken(
  input: { accountId: number; inbox: string; ttlSeconds?: number },
): { token: string; expiresAt: number } {
  const now = Math.floor(Date.now() / 1000);
  const exp = now + (input.ttlSeconds ?? DEFAULT_TTL_SECONDS);
  const payload: RelayAccessClaims = {
    sub: String(input.accountId),
    inbox: input.inbox.trim().toLowerCase(),
    iat: now,
    exp,
    kind: "imap_alias",
  };

  const header = base64UrlEncode(JSON.stringify(JWT_HEADER));
  const body = base64UrlEncode(JSON.stringify(payload));
  const signature = sign(`${header}.${body}`);
  return {
    token: `${header}.${body}.${signature}`,
    expiresAt: exp * 1000,
  };
}

export function verifyRelayAccessToken(token: string): RelayAccessClaims {
  const parts = token.split(".");
  if (parts.length !== 3) throw new RelayJwtError("token 格式非法");
  const [header, body, signature] = parts;
  const expected = sign(`${header}.${body}`);
  if (!safeEqual(signature, expected)) throw new RelayJwtError("token 签名无效");

  let payload: RelayAccessClaims;
  try {
    payload = JSON.parse(base64UrlDecode(body)) as RelayAccessClaims;
  } catch {
    throw new RelayJwtError("token payload 非法");
  }

  if (!payload.sub || !payload.inbox || !payload.exp || !payload.iat) {
    throw new RelayJwtError("token 缺少必要字段");
  }
  const kind = payload.kind ?? "relay_source";
  if (kind !== "relay_source" && kind !== "imap_alias") {
    throw new RelayJwtError("token 类型非法");
  }
  if (payload.exp <= Math.floor(Date.now() / 1000)) {
    throw new RelayJwtError("token 已过期");
  }
  return {
    ...payload,
    inbox: payload.inbox.trim().toLowerCase(),
    kind,
  };
}

function sign(input: string): string {
  return base64UrlEncode(
    createHmac("sha256", getRelayJwtSecret()).update(input).digest(),
  );
}

function getRelayJwtSecret(): Buffer {
  return createHmac("sha256", ensureSessionSecret())
    .update("relay-public-access")
    .digest();
}

function base64UrlEncode(input: string | Buffer): string {
  return Buffer.from(input)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function base64UrlDecode(input: string): string {
  const padded = input.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(input.length / 4) * 4, "=");
  return Buffer.from(padded, "base64").toString("utf8");
}

function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}
