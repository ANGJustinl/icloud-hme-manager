import "server-only";

import { db } from "./index";
import type { AliasUsagePublic, AliasUsageRow } from "./schema";
import { aliasUsageToPublic } from "./schema";

/** 规范化 tags：数组 → 去重去空的逗号分隔字符串（null 表示清空） */
function normalizeTags(tags: string[] | undefined): string | null {
  if (!tags || tags.length === 0) return null;
  const cleaned = [...new Set(tags.map((t) => t.trim()).filter(Boolean))];
  return cleaned.length ? cleaned.join(",") : null;
}

/** 取某账号下所有别名用法，按 anonymousId 映射，便于与实时列表 merge */
export function getUsageMap(accountId: number): Record<string, AliasUsagePublic> {
  const rows = db
    .prepare(`SELECT * FROM alias_usage WHERE account_id = ?`)
    .all(accountId) as AliasUsageRow[];
  const map: Record<string, AliasUsagePublic> = {};
  for (const row of rows) {
    map[row.anonymous_id] = aliasUsageToPublic(row);
  }
  return map;
}

/**
 * upsert 单个别名用法。
 * site / tags 传 undefined 表示不改动该字段；传 null/"" 表示清空。
 */
export function setUsage(
  accountId: number,
  anonymousId: string,
  input: { site?: string | null; tags?: string[] },
): void {
  const now = Date.now();
  const existing = db
    .prepare(
      `SELECT * FROM alias_usage WHERE account_id = ? AND anonymous_id = ?`,
    )
    .get(accountId, anonymousId) as AliasUsageRow | undefined;

  const site =
    input.site === undefined
      ? (existing?.site ?? null)
      : input.site?.trim() || null;
  const tags =
    input.tags === undefined
      ? (existing?.tags ?? null)
      : normalizeTags(input.tags);

  if (existing) {
    db.prepare(
      `UPDATE alias_usage SET site = ?, tags = ?, used_at = ?, updated_at = ?
       WHERE account_id = ? AND anonymous_id = ?`,
    ).run(site, tags, now, now, accountId, anonymousId);
  } else {
    db.prepare(
      `INSERT INTO alias_usage (account_id, anonymous_id, site, tags, used_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run(accountId, anonymousId, site, tags, now, now, now);
  }
}

/** 删除单个别名用法（别名从 iCloud 删除时清理本地记录） */
export function deleteUsage(accountId: number, anonymousId: string): void {
  db.prepare(
    `DELETE FROM alias_usage WHERE account_id = ? AND anonymous_id = ?`,
  ).run(accountId, anonymousId);
}

/** 删除账号下全部别名用法（账号删除时级联清理） */
export function deleteAllUsageForAccount(accountId: number): void {
  db.prepare(`DELETE FROM alias_usage WHERE account_id = ?`).run(accountId);
}
