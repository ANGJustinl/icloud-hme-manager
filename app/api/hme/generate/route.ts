import { type NextRequest } from "next/server";

import { buildClientForAccount, handleError, json, parseBody } from "@/lib/http";
import { requireSession } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 生成新别名：组合 generate + reserve（对齐脚本 handleGenerate 行为）。
 * 可选 body: { label?, note?, count? }，不传则自动生成默认标签。
 */
export async function POST(request: NextRequest) {
  const guard = await requireSession(request);
  if (guard) return guard;
  try {
    const body = await parseBody<{
      accountId?: number;
      label?: string;
      note?: string;
      count?: number;
    }>(request);

    const accountId = Number(body.accountId);
    if (!Number.isInteger(accountId) || accountId <= 0) {
      return json({ error: "缺少有效的 accountId" }, 400);
    }
    const requestedCount = body.count === undefined ? 1 : Number(body.count);
    if (!Number.isInteger(requestedCount) || requestedCount < 1 || requestedCount > 5) {
      return json({ error: "count 必须是 1 到 5 之间的整数" }, 400);
    }

    const client = await buildClientForAccount(accountId);

    const labelBase = body.label?.trim() || "Alias_" + randomSuffix();
    const note =
      typeof body.note === "string" ? body.note.trim() : "由 iCloud HME 管理器生成";
    const emails: Array<{ hme: string; label: string; note: string }> = [];
    let lastError: unknown = null;

    for (let i = 0; i < requestedCount; i++) {
      try {
        const hme = await client.generate();
        const label = formatLabel(labelBase, requestedCount, i);
        await client.reserve(hme, label, note);
        emails.push({ hme, label, note });
      } catch (e) {
        lastError = e;
        break;
      }
    }

    if (emails.length === 0) {
      throw lastError ?? new Error("生成别名失败");
    }

    const first = emails[0];
    return json(
      {
        emails,
        requestedCount,
        failed: lastError ? errorMessage(lastError) : undefined,
        // 兼容旧响应字段
        hme: first.hme,
        label: first.label,
        note: first.note,
      },
      lastError ? 207 : 201,
    );
  } catch (e) {
    return handleError(e);
  }
}

function randomSuffix(): string {
  return Math.random().toString(36).substring(2, 6).toUpperCase();
}

function formatLabel(labelBase: string, count: number, index: number): string {
  if (count === 1) return labelBase;
  return `${labelBase}-${String(index + 1).padStart(3, "0")}`;
}

function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
