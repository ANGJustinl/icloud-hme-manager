import "server-only";

import { db } from "./index";
import type { LogPublic, LogRow } from "./schema";
import { logToPublic } from "./schema";

/** 日志表上限：超过则删旧（环形缓冲，避免无限膨胀） */
const MAX_LOG_ROWS = 2000;
/** 每写入多少条触发一次裁剪 */
const PRUNE_EVERY = 100;

let writeCount = 0;

/** 写一条日志（已脱敏）。失败静默——日志不能反过来拖垮应用。 */
export function insertLog(entry: {
  ts: number;
  level: string;
  scope: string;
  message: string;
  fields: string | null;
}): void {
  try {
    db.prepare(
      `INSERT INTO logs (ts, level, scope, message, fields) VALUES (?, ?, ?, ?, ?)`,
    ).run(entry.ts, entry.level, entry.scope, entry.message, entry.fields);

    if (++writeCount % PRUNE_EVERY === 0) pruneLogs();
  } catch {
    // 落库失败不抛
  }
}

/** 裁剪到最近 MAX_LOG_ROWS 条 */
function pruneLogs(): void {
  try {
    db.prepare(
      `DELETE FROM logs WHERE id <= (
         SELECT id FROM logs ORDER BY id DESC LIMIT 1 OFFSET ?
       )`,
    ).run(MAX_LOG_ROWS);
  } catch {
    // 忽略
  }
}

/** 查询日志（最新在前），可按 level / scope 过滤 */
export function queryLogs(opts: {
  level?: string;
  scope?: string;
  limit?: number;
} = {}): LogPublic[] {
  const limit = Math.min(Math.max(opts.limit ?? 200, 1), 1000);
  const where: string[] = [];
  const params: unknown[] = [];
  if (opts.level) {
    where.push("level = ?");
    params.push(opts.level);
  }
  if (opts.scope) {
    where.push("scope = ?");
    params.push(opts.scope);
  }
  const sql = `SELECT * FROM logs ${where.length ? "WHERE " + where.join(" AND ") : ""} ORDER BY id DESC LIMIT ?`;
  params.push(limit);
  const rows = db.prepare(sql).all(...params) as LogRow[];
  return rows.map(logToPublic);
}

/** 清空全部日志 */
export function clearLogs(): void {
  db.prepare(`DELETE FROM logs`).run();
}
