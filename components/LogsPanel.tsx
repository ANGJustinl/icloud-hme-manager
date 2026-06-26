"use client";

import { useCallback, useEffect, useState } from "react";
import { RefreshCw, Trash2 } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { apiFetch, type LogPublic } from "@/lib/client/types";
import { useToast } from "@/components/ui/Toast";

const LEVELS = ["all", "debug", "info", "warn", "error"] as const;
type LevelFilter = (typeof LEVELS)[number];

const LEVEL_STYLE: Record<string, string> = {
  debug: "text-hme-muted",
  info: "text-hme-primary",
  warn: "text-amber-600",
  error: "text-hme-danger",
};

interface LogsPanelProps {
  open: boolean;
  onClose: () => void;
}

/** 应用日志查看器：服务端落库的脱敏日志，支持级别过滤 / 刷新 / 清空。 */
export function LogsPanel({ open, onClose }: LogsPanelProps) {
  const { toast } = useToast();
  const [logs, setLogs] = useState<LogPublic[]>([]);
  const [level, setLevel] = useState<LevelFilter>("all");
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const qs = level === "all" ? "" : `?level=${level}`;
      const r = await apiFetch<{ logs: LogPublic[] }>(`/api/logs${qs}`);
      setLogs(r.logs);
    } catch (e) {
      toast(e instanceof Error ? e.message : "加载日志失败", "error");
    } finally {
      setLoading(false);
    }
  }, [level, toast]);

  useEffect(() => {
    if (open) refresh();
  }, [open, refresh]);

  async function handleClear() {
    if (!confirm("清空所有日志？该操作不可恢复。")) return;
    try {
      await apiFetch("/api/logs", { method: "DELETE" });
      toast("日志已清空");
      setLogs([]);
    } catch (e) {
      toast(e instanceof Error ? e.message : "清空失败", "error");
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="应用日志"
      width="max-w-3xl"
      footer={
        <>
          <Button
            variant="danger"
            size="sm"
            icon={<Trash2 size={14} />}
            onClick={handleClear}
            disabled={logs.length === 0}
          >
            清空
          </Button>
          <div className="flex-1" />
          <Button variant="ghost" size="sm" onClick={onClose}>
            关闭
          </Button>
        </>
      }
    >
      <div className="mb-3 flex items-center gap-2">
        <div className="flex gap-1">
          {LEVELS.map((l) => (
            <button
              key={l}
              onClick={() => setLevel(l)}
              className={`rounded px-2.5 py-1 text-xs font-medium transition-colors ${
                level === l
                  ? "bg-hme-primary text-white"
                  : "bg-hme-bg text-hme-muted hover:text-hme-text"
              }`}
            >
              {l === "all" ? "全部" : l.toUpperCase()}
            </button>
          ))}
        </div>
        <div className="flex-1" />
        <Button
          variant="ghost"
          size="sm"
          icon={<RefreshCw size={14} />}
          onClick={refresh}
          loading={loading}
        >
          刷新
        </Button>
      </div>

      <div className="max-h-[55vh] overflow-auto rounded-lg border border-hme-border bg-hme-bg/40">
        {logs.length === 0 ? (
          <EmptyState
            icon={<RefreshCw size={28} className={loading ? "hme-spin" : ""} />}
            title={loading ? "加载中..." : "暂无日志"}
            description={loading ? undefined : "应用运行时的关键事件会记录在这里"}
          />
        ) : (
          <table className="w-full text-left font-mono text-[11px]">
            <tbody>
              {logs.map((l) => (
                <tr key={l.id} className="border-b border-hme-border/50 align-top">
                  <td className="whitespace-nowrap px-2 py-1.5 text-hme-muted">
                    {new Date(l.ts).toLocaleString()}
                  </td>
                  <td className={`px-2 py-1.5 font-semibold ${LEVEL_STYLE[l.level] ?? ""}`}>
                    {l.level.toUpperCase()}
                  </td>
                  <td className="px-2 py-1.5 text-hme-muted">[{l.scope}]</td>
                  <td className="px-2 py-1.5 text-hme-text">
                    {l.message}
                    {l.fields && (
                      <span className="ml-1 text-hme-muted">
                        {Object.entries(l.fields)
                          .map(([k, v]) => `${k}=${String(v)}`)
                          .join(" ")}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </Modal>
  );
}
