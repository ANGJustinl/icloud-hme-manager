import type { HmeEmail } from "./types";

/** 把别名列表导出为 CSV 并触发下载 */
export function exportEmailsCsv(emails: HmeEmail[], filename = "icloud-hme.csv"): void {
  const headers = ["标签", "邮箱地址", "转发状态", "备注", "生成时间", "anonymousId"];
  const rows = emails.map((e) => [
    e.label,
    e.hme,
    e.isActive ? "激活" : "已停用",
    e.note ?? "",
    e.createTimestamp ?? e.createdAt
      ? new Date((e.createTimestamp ?? e.createdAt!) as number).toISOString()
      : "",
    e.anonymousId,
  ]);

  const escape = (v: string) => `"${v.replace(/"/g, '""')}"`;
  const csv = [headers, ...rows]
    .map((r) => r.map((c) => escape(String(c))).join(","))
    .join("\r\n");

  // BOM 让 Excel 正确识别 UTF-8
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
