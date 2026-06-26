import "server-only";

import { db } from "./index";
import type { RelaySourcePublic, RelaySourceRow } from "./schema";
import { relaySourceToPublic } from "./schema";
import { decrypt, encrypt } from "@/lib/crypto";

export function listRelaySources(): RelaySourcePublic[] {
  const rows = db
    .prepare(
      `SELECT * FROM relay_sources
       ORDER BY COALESCE(last_message_date, last_checked_at, created_at) DESC, created_at DESC`,
    )
    .all() as RelaySourceRow[];
  return rows.map(relaySourceToPublic);
}

export function getRelaySourcePublic(id: number): RelaySourcePublic | null {
  const row = getRelaySourceRow(id);
  return row ? relaySourceToPublic(row) : null;
}

export function findRelaySourcePublicByInboxHint(inbox: string): RelaySourcePublic | null {
  const row = db
    .prepare(`SELECT * FROM relay_sources WHERE lower(inbox_hint) = lower(?) LIMIT 1`)
    .get(inbox.trim()) as RelaySourceRow | undefined;
  return row ? relaySourceToPublic(row) : null;
}

export function getRelaySourceRow(id: number): RelaySourceRow | null {
  const row = db
    .prepare(`SELECT * FROM relay_sources WHERE id = ?`)
    .get(id) as RelaySourceRow | undefined;
  return row ?? null;
}

export function getRelaySourceUrl(id: number): string | null {
  const row = getRelaySourceRow(id);
  if (!row) return null;
  return decrypt(row.url_encrypted);
}

export function createRelaySource(input: {
  name: string;
  url: string;
  inboxHint?: string | null;
  lastCode?: string | null;
  lastSubject?: string | null;
  lastSender?: string | null;
  lastCheckedAt?: number | null;
  lastMessageDate?: number | null;
}): RelaySourcePublic {
  const now = Date.now();
  const r = db
    .prepare(
      `INSERT INTO relay_sources (
         name, url_encrypted, inbox_hint, last_code, last_subject, last_sender, last_checked_at, last_message_date, created_at, updated_at
       )
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      input.name.trim(),
      encrypt(input.url),
      input.inboxHint?.trim() || null,
      input.lastCode ?? null,
      input.lastSubject?.trim() || null,
      input.lastSender?.trim() || null,
      input.lastCheckedAt ?? null,
      input.lastMessageDate ?? null,
      now,
      now,
    );
  return getRelaySourcePublic(Number(r.lastInsertRowid))!;
}

export function updateRelaySource(
  id: number,
  input: { name?: string; url?: string; inboxHint?: string | null },
): RelaySourcePublic | null {
  const row = getRelaySourceRow(id);
  if (!row) return null;

  const next = {
    name: input.name !== undefined ? input.name.trim() : row.name,
    urlEncrypted: input.url !== undefined ? encrypt(input.url) : row.url_encrypted,
    inboxHint:
      input.inboxHint !== undefined ? input.inboxHint?.trim() || null : row.inbox_hint,
    updatedAt: Date.now(),
  };

  db.prepare(
    `UPDATE relay_sources
     SET name = ?, url_encrypted = ?, inbox_hint = ?, updated_at = ?
     WHERE id = ?`,
  ).run(next.name, next.urlEncrypted, next.inboxHint, next.updatedAt, id);

  return getRelaySourcePublic(id);
}

export function deleteRelaySource(id: number): boolean {
  const r = db.prepare(`DELETE FROM relay_sources WHERE id = ?`).run(id);
  return r.changes > 0;
}

export function updateRelaySourceLookupState(
  id: number,
  input: {
    inboxHint?: string | null;
    lastCode: string | null;
    lastSubject?: string | null;
    lastSender?: string | null;
    lastCheckedAt: number;
    lastMessageDate: number | null;
  },
): void {
  db.prepare(
    `UPDATE relay_sources
     SET inbox_hint = COALESCE(?, inbox_hint),
         last_code = ?,
         last_subject = ?,
         last_sender = ?,
         last_checked_at = ?,
         last_message_date = ?,
         updated_at = ?
     WHERE id = ?`,
  ).run(
    input.inboxHint?.trim() || null,
    input.lastCode,
    input.lastSubject?.trim() || null,
    input.lastSender?.trim() || null,
    input.lastCheckedAt,
    input.lastMessageDate,
    Date.now(),
    id,
  );
}
