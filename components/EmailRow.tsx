"use client";

import { useState } from "react";
import { Copy, ExternalLink, Globe, Pencil, Trash2 } from "lucide-react";
import { Toggle } from "@/components/ui/Toggle";
import { apiFetch, type HmeEmail, type RelayShareResponse } from "@/lib/client/types";
import { useToast, useCopyToClipboard } from "@/components/ui/Toast";

interface EmailRowProps {
  email: HmeEmail;
  accountId: number;
  domain: "icloud.com" | "icloud.com.cn";
  onToggleChanged: () => void;
  onEdit: (email: HmeEmail) => void;
  /** 多选：是否选中 */
  selected: boolean;
  /** 多选：切换选中 */
  onSelectChange: (anonymousId: string, checked: boolean) => void;
}

export function EmailRow({
  email,
  accountId,
  onToggleChanged,
  onEdit,
  selected,
  onSelectChange,
}: EmailRowProps) {
  const [busy, setBusy] = useState(false);
  const [viewing, setViewing] = useState(false);
  const { toast } = useToast();
  const copy = useCopyToClipboard();

  async function handleToggle(target: boolean) {
    if (busy) return;
    setBusy(true);
    try {
      const action = target ? "reactivate" : "deactivate";
      await apiFetch(`/api/hme/${action}`, {
        method: "POST",
        body: JSON.stringify({ accountId, anonymousId: email.anonymousId }),
      });
      toast(`已${target ? "恢复" : "停用"}转发`);
      onToggleChanged();
    } catch (e) {
      toast(e instanceof Error ? e.message : "操作失败", "error");
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete() {
    if (
      !confirm(
        `确定永久删除别名 ${email.hme}？\n\n该操作不可恢复，且会从所有注册过它的网站失效。`,
      )
    )
      return;
    setBusy(true);
    try {
      await apiFetch("/api/hme/delete", {
        method: "POST",
        body: JSON.stringify({ accountId, anonymousId: email.anonymousId }),
      });
      toast("别名已删除");
      onToggleChanged();
    } catch (e) {
      toast(e instanceof Error ? e.message : "删除失败", "error");
    } finally {
      setBusy(false);
    }
  }

  async function handleViewInbox() {
    setViewing(true);
    try {
      const r = await apiFetch<RelayShareResponse>(
        `/api/relay/share-by-inbox?inbox=${encodeURIComponent(email.hme)}&accountId=${accountId}`,
      );
      window.open(r.share.pageUrl, "_blank", "noopener,noreferrer");
    } catch (e) {
      toast(
        e instanceof Error ? e.message : "未找到对应用户页",
        "error",
      );
    } finally {
      setViewing(false);
    }
  }

  const timestamp = email.createTimestamp ?? email.createdAt;
  const timeStr = timestamp ? new Date(timestamp).toLocaleString() : "";

  return (
    <tr className="hover:bg-black/[0.01]">
      {/* 列 0：多选 */}
      <td className="border-b border-hme-border px-4 py-3 align-middle">
        <input
          type="checkbox"
          checked={selected}
          onChange={(e) => onSelectChange(email.anonymousId, e.target.checked)}
          className="h-4 w-4 cursor-pointer accent-hme-primary"
          aria-label={`选择 ${email.hme}`}
        />
      </td>
      {/* 列 1：标签 + 邮箱 + 时间 + 备注 */}
      <td className="border-b border-hme-border px-4 py-3 align-middle">
        <div className="flex items-center gap-1.5 text-sm font-semibold">
          <span>{escapeHtml(email.label)}</span>
          {!email.isActive && (
            <span className="rounded bg-hme-danger-bg px-1.5 py-0.5 text-[10px] font-medium text-hme-danger">
              已停用
            </span>
          )}
          {email.site && (
            <span className="inline-flex items-center gap-0.5 rounded bg-hme-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-hme-primary">
              <Globe size={9} />
              {escapeHtml(email.site)}
            </span>
          )}
        </div>
        <div className="mt-1 flex items-center gap-1">
          <span className="font-mono text-xs text-hme-muted">{email.hme}</span>
          <IconButton title="复制邮箱" onClick={() => copy(email.hme)}>
            <Copy size={14} />
          </IconButton>
          <IconButton title="跳转到用户页" onClick={handleViewInbox} disabled={viewing}>
            <ExternalLink size={14} />
          </IconButton>
        </div>
        {email.usageTags && email.usageTags.length > 0 && (
          <div className="mt-1 flex flex-wrap gap-1">
            {email.usageTags.map((t) => (
              <span
                key={t}
                className="rounded bg-hme-bg px-1.5 py-0.5 text-[10px] text-hme-muted"
              >
                {escapeHtml(t)}
              </span>
            ))}
          </div>
        )}
        {email.note && (
          <div className="mt-0.5 max-w-md truncate text-xs text-hme-muted/80">
            备注：{escapeHtml(email.note)}
          </div>
        )}
        {timeStr && (
          <div className="mt-0.5 text-[10px] text-hme-muted/70">
            生成时间: {timeStr}
          </div>
        )}
      </td>

      {/* 列 2：开关 + 操作 */}
      <td className="border-b border-hme-border px-4 py-3 align-middle">
        <div className="flex items-center gap-2">
          <Toggle
            checked={email.isActive}
            disabled={busy}
            onChange={handleToggle}
            ariaLabel="切换转发状态"
          />
          <IconButton title="编辑标签/备注" onClick={() => onEdit(email)}>
            <Pencil size={14} />
          </IconButton>
          <IconButton title="永久删除" onClick={handleDelete} danger>
            <Trash2 size={14} />
          </IconButton>
        </div>
      </td>
    </tr>
  );
}

function IconButton({
  children,
  title,
  onClick,
  danger,
  disabled,
}: {
  children: React.ReactNode;
  title: string;
  onClick: () => void;
  danger?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      title={title}
      onClick={onClick}
      disabled={disabled}
      className={`rounded p-1 text-hme-muted hover:bg-black/[0.05] ${
        danger ? "hover:text-hme-danger" : "hover:text-hme-text"
      } disabled:cursor-not-allowed disabled:opacity-50`}
    >
      {children}
    </button>
  );
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    c === "&"
      ? "&amp;"
      : c === "<"
        ? "&lt;"
        : c === ">"
          ? "&gt;"
          : c === '"'
            ? "&quot;"
            : "&#39;",
  );
}
