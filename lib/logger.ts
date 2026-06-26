import "server-only";

/**
 * 轻量结构化日志。
 *
 * 目标：给这个处理加密凭证 / Cookie 注入 / IMAP 的应用补上可观测性，
 * 同时保证敏感值绝不落日志。
 *
 * - 级别：debug < info < warn < error，受 LOG_LEVEL 环境变量控制（默认 info）。
 * - 输出：单行 `时间 级别 [scope] 消息 key=value ...`，便于 docker logs / grep。
 * - 脱敏：cookie / password / token / secret / authorization 等键的值一律打码；
 *   值里出现的疑似 cookie/邮箱也做轻度遮蔽。
 */

type Level = "debug" | "info" | "warn" | "error";

const LEVEL_ORDER: Record<Level, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

function currentLevel(): Level {
  const raw = process.env.LOG_LEVEL?.trim().toLowerCase();
  if (raw === "debug" || raw === "info" || raw === "warn" || raw === "error") {
    return raw;
  }
  return "info";
}

/** 敏感字段名（大小写不敏感）——这些键的值整体打码 */
const SENSITIVE_KEY = /(cookie|password|passwd|secret|token|authorization|auth|apppassword|encryption)/i;

/** 把一个值脱敏成可记录的字符串 */
function redactValue(key: string, value: unknown): string {
  if (SENSITIVE_KEY.test(key)) return "***";
  if (value == null) return String(value);
  if (typeof value === "object") {
    try {
      return JSON.stringify(value);
    } catch {
      return "[object]";
    }
  }
  let s = String(value);
  // 值里疑似超长 cookie 串（含 X-APPLE 或大量 k=v;）做截断遮蔽
  if (/X-APPLE-|=[^;]{20,};/.test(s) && s.length > 40) {
    s = `${s.slice(0, 12)}…[redacted ${s.length} chars]`;
  }
  // 邮箱保留域名，遮蔽本地部分：a***@icloud.com
  s = s.replace(/([A-Za-z0-9._%+-])[A-Za-z0-9._%+-]*(@[A-Za-z0-9.-]+)/g, "$1***$2");
  return s;
}

function formatFields(redacted: Record<string, string>): string {
  const parts = Object.entries(redacted).map(([k, v]) => `${k}=${v}`);
  return parts.length ? " " + parts.join(" ") : "";
}

/** 把 fields 整体脱敏成 { key: redactedString }，供 console 和 DB 共用 */
function redactFields(fields?: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {};
  if (!fields) return out;
  for (const [k, v] of Object.entries(fields)) {
    if (v === undefined) continue;
    out[k] = redactValue(k, v);
  }
  return out;
}

function emit(level: Level, scope: string, message: string, fields?: Record<string, unknown>) {
  if (LEVEL_ORDER[level] < LEVEL_ORDER[currentLevel()]) return;
  const ts = Date.now();
  const redacted = redactFields(fields);
  const line = `${new Date(ts).toISOString()} ${level.toUpperCase().padEnd(5)} [${scope}] ${message}${formatFields(redacted)}`;
  // warn/error 走 stderr，其余 stdout
  if (level === "warn" || level === "error") {
    console.error(line);
  } else {
    console.log(line);
  }
  // 落库（脱敏后的字段）。动态 import 避免在边缘运行时/构建期硬依赖 DB。
  void persist(ts, level, scope, message, redacted);
}

/** 异步落库，永不抛错 */
async function persist(
  ts: number,
  level: Level,
  scope: string,
  message: string,
  redacted: Record<string, string>,
): Promise<void> {
  try {
    const { insertLog } = await import("@/lib/db/logs");
    const fields = Object.keys(redacted).length ? JSON.stringify(redacted) : null;
    insertLog({ ts, level, scope, message, fields });
  } catch {
    // DB 不可用时静默
  }
}

export interface Logger {
  debug(message: string, fields?: Record<string, unknown>): void;
  info(message: string, fields?: Record<string, unknown>): void;
  warn(message: string, fields?: Record<string, unknown>): void;
  error(message: string, fields?: Record<string, unknown>): void;
}

/** 创建带 scope 的 logger，例如 createLogger("accounts") */
export function createLogger(scope: string): Logger {
  return {
    debug: (m, f) => emit("debug", scope, m, f),
    info: (m, f) => emit("info", scope, m, f),
    warn: (m, f) => emit("warn", scope, m, f),
    error: (m, f) => emit("error", scope, m, f),
  };
}
