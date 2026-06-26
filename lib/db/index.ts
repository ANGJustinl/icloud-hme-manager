import "server-only";

import Database from "better-sqlite3";
import { mkdirSync } from "fs";
import { join } from "path";

import { CREATE_TABLE_SQL } from "./schema";

/**
 * better-sqlite3 单例。
 *
 * 为什么要单例：Next.js 开发模式热重载 + API 路由可能在不同模块实例间
 * 共享，若每次 import 都新建连接，会迅速耗尽 SQLite 文件锁并报
 * "SQLITE_BUSY"。用 globalThis 缓存连接，整个进程只开一个。
 */

const DB_FILENAME = "hme-manager.db";

declare global {
  // eslint-disable-next-line no-var
  var __hmeDb: Database.Database | undefined;
}

function resolveDataDir(): string {
  return process.env.DATA_DIR?.trim() || join(process.cwd(), "data");
}

function getDb(): Database.Database {
  if (globalThis.__hmeDb) return globalThis.__hmeDb;

  const dataDir = resolveDataDir();
  mkdirSync(dataDir, { recursive: true });
  const dbPath = join(dataDir, DB_FILENAME);

  const db = new Database(dbPath);
  // SQLite 性能与可靠性调优
  db.pragma("journal_mode = WAL");
  db.pragma("synchronous = NORMAL");
  db.pragma("foreign_keys = ON");

  // 建表（幂等）
  db.exec(CREATE_TABLE_SQL);

  // 向旧库追加列（imap_app_password_encrypted 是后加字段）。
  // 检测列是否存在，避免重复 ALTER 报错。
  migrateIfNeeded(db);

  globalThis.__hmeDb = db;
  return db;
}

/** 幂等迁移：对已存在的旧表追加缺失列 */
function migrateIfNeeded(db: Database.Database) {
  const cols = db.prepare(`PRAGMA table_info(accounts)`).all() as { name: string }[];
  const has = (col: string) => cols.some((c) => c.name === col);

  if (!has("imap_app_password_encrypted")) {
    db.exec(`ALTER TABLE accounts ADD COLUMN imap_app_password_encrypted TEXT;`);
  }
  if (!has("imap_username")) {
    db.exec(`ALTER TABLE accounts ADD COLUMN imap_username TEXT;`);
  }
  if (!has("cookie_status")) {
    db.exec(`ALTER TABLE accounts ADD COLUMN cookie_status TEXT NOT NULL DEFAULT 'unknown';`);
  }
  if (!has("last_validated_at")) {
    db.exec(`ALTER TABLE accounts ADD COLUMN last_validated_at INTEGER;`);
  }
  if (!has("last_error")) {
    db.exec(`ALTER TABLE accounts ADD COLUMN last_error TEXT;`);
  }

  const relayCols = db.prepare(`PRAGMA table_info(relay_sources)`).all() as { name: string }[];
  const relayHas = (col: string) => relayCols.some((c) => c.name === col);
  if (!relayHas("last_subject")) {
    db.exec(`ALTER TABLE relay_sources ADD COLUMN last_subject TEXT;`);
  }
  if (!relayHas("last_sender")) {
    db.exec(`ALTER TABLE relay_sources ADD COLUMN last_sender TEXT;`);
  }
}

export const db = new Proxy({} as Database.Database, {
  get(_t, prop) {
    const inst = getDb();
    // @ts-expect-error 透传到真实实例
    const value = inst[prop];
    return typeof value === "function" ? value.bind(inst) : value;
  },
});
