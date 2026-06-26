"use client";

import { useCallback, useEffect, useState } from "react";
import { Inbox, KeyRound, Loader2, Mail, MailOpen, RefreshCw, Search } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { Modal } from "@/components/ui/Modal";
import { useCopyToClipboard, useToast } from "@/components/ui/Toast";
import { apiFetch, type HmeEmail, type MailDetail, type MailSummary } from "@/lib/client/types";

interface InboxPanelProps {
  accountId: number;
  emails: HmeEmail[];
  /** IMAP 是否已配置（未配置时显示引导） */
  imapReady: boolean;
  active: boolean;
}

/**
 * 收件箱面板（图1 功能）。
 * 左侧邮件列表 + 右侧邮件正文预览。
 * 支持按别名过滤、定时刷新、查看完整正文。
 */
export function InboxPanel({ accountId, emails, imapReady, active }: InboxPanelProps) {
  const { toast } = useToast();
  const copy = useCopyToClipboard();

  const [list, setList] = useState<MailSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [aliasFilter, setAliasFilter] = useState<string>("");
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [selected, setSelected] = useState<MailSummary | null>(null);
  const [detail, setDetail] = useState<MailDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(false);

  const refresh = useCallback(
    async (silent = false) => {
      if (!imapReady) return;
      if (!silent) setLoading(true);
      try {
        const params = new URLSearchParams({
          accountId: String(accountId),
          limit: "30",
        });
        if (aliasFilter) params.set("alias", aliasFilter);
        if (unreadOnly) params.set("unreadOnly", "true");
        const r = await apiFetch<{ emails: MailSummary[] }>(`/api/mail/inbox?${params}`);
        setList(r.emails);
      } catch (e) {
        if (!silent) toast(e instanceof Error ? e.message : "加载失败", "error");
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [accountId, aliasFilter, unreadOnly, imapReady, toast],
  );

  // 初次加载 + 过滤变化时刷新
  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountId, aliasFilter, unreadOnly, imapReady]);

  // 自动刷新
  useEffect(() => {
    if (!autoRefresh || !active || !imapReady) return;
    const timer = setInterval(() => refresh(true), 15000); // 15 秒
    return () => clearInterval(timer);
  }, [autoRefresh, active, imapReady, refresh]);

  async function openMail(m: MailSummary) {
    setSelected(m);
    setDetail(null);
    setDetailLoading(true);
    try {
      const r = await apiFetch<{ mail: MailDetail }>(
        `/api/mail/read?accountId=${accountId}&uid=${m.uid}`,
      );
      setDetail(r.mail);
    } catch (e) {
      toast(e instanceof Error ? e.message : "读取失败", "error");
    } finally {
      setDetailLoading(false);
    }
  }

  if (!imapReady) {
    return (
      <div className="rounded-xl border border-hme-border bg-hme-card">
        <EmptyState
          icon={<Mail size={32} />}
          title="未配置 IMAP"
          description="收件箱和验证码提取需要 IMAP。请点击右上角「账号设置」→ 填写 IMAP 主邮箱地址和应用专用密码。"
        />
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-hme-border bg-hme-card">
      {/* 工具栏 */}
      <div className="flex flex-wrap items-center gap-2 border-b border-hme-border px-4 py-3">
        <div className="flex min-w-[180px] flex-1 items-center gap-2">
          <Search size={14} className="text-hme-muted" />
          <select
            value={aliasFilter}
            onChange={(e) => setAliasFilter(e.target.value)}
            className="appearance-none bg-transparent py-1 text-sm outline-none"
          >
            <option value="">全部别名</option>
            {emails.map((e) => (
              <option key={e.anonymousId} value={e.hme}>
                {e.label} — {e.hme}
              </option>
            ))}
          </select>
        </div>

        <label className="flex cursor-pointer items-center gap-1.5 text-xs text-hme-text">
          <input
            type="checkbox"
            checked={unreadOnly}
            onChange={(e) => setUnreadOnly(e.target.checked)}
            className="accent-hme-primary"
          />
          仅未读
        </label>

        <label className="flex cursor-pointer items-center gap-1.5 text-xs text-hme-text">
          <input
            type="checkbox"
            checked={autoRefresh}
            onChange={(e) => setAutoRefresh(e.target.checked)}
            className="accent-hme-primary"
          />
          自动刷新
        </label>

        <Button variant="ghost" size="sm" onClick={() => refresh()} loading={loading}>
          <RefreshCw size={14} /> 刷新
        </Button>
      </div>

      {/* 列表 */}
      <div className="max-h-[calc(100vh-340px)] overflow-auto">
        {loading && list.length === 0 ? (
          <EmptyState
            icon={<Loader2 size={28} className="hme-spin" />}
            title="正在拉取收件箱..."
          />
        ) : list.length === 0 ? (
          <EmptyState
            icon={<Inbox size={32} />}
            title="没有邮件"
            description={aliasFilter ? "该别名暂无邮件，或过滤条件太严" : "收件箱为空"}
          />
        ) : (
          <ul className="divide-y divide-hme-border">
            {list.map((m) => (
              <li key={m.uid}>
                <button
                  onClick={() => openMail(m)}
                  className={`flex w-full gap-3 px-4 py-3 text-left hover:bg-black/[0.02] ${
                    selected?.uid === m.uid ? "bg-hme-primary/5" : ""
                  }`}
                >
                  <span className="mt-0.5 shrink-0 text-hme-muted">
                    {m.seen ? <MailOpen size={16} /> : <Mail size={16} className="text-hme-primary" />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span
                        className={`truncate text-sm ${
                          m.seen ? "font-normal text-hme-text" : "font-semibold text-hme-text"
                        }`}
                      >
                        {m.from}
                      </span>
                      {m.hasOtp && (
                        <span className="inline-flex shrink-0 items-center gap-0.5 rounded bg-hme-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-hme-primary">
                          <KeyRound size={10} /> 验证码
                        </span>
                      )}
                      <span className="ml-auto shrink-0 text-[11px] text-hme-muted">
                        {formatTime(m.date)}
                      </span>
                    </div>
                    <div className="truncate text-sm text-hme-text">{m.subject}</div>
                    <div className="truncate text-xs text-hme-muted">{m.snippet}</div>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* 邮件详情 Modal */}
      <Modal
        open={selected !== null}
        onClose={() => {
          setSelected(null);
          setDetail(null);
        }}
        title={selected?.subject ?? ""}
        width="max-w-2xl"
        footer={
          <>
            {detail?.hasOtp && (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  // 尝试从详情里再提取一次验证码复制
                  const code = detail.text.match(/\b(\d{4,8})\b/);
                  if (code) copy(code[1], `已复制: ${code[1]}`);
                  else copy(detail.text.slice(0, 50), "已复制片段");
                }}
              >
                <KeyRound size={14} /> 复制验证码
              </Button>
            )}
            <div className="flex-1" />
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setSelected(null);
                setDetail(null);
              }}
            >
              关闭
            </Button>
          </>
        }
      >
        {detailLoading ? (
          <EmptyState icon={<Loader2 size={24} className="hme-spin" />} title="加载邮件内容..." />
        ) : detail ? (
          <div className="space-y-3">
            <div className="space-y-1 border-b border-hme-border pb-3 text-xs text-hme-muted">
              <div>
                <span className="font-medium text-hme-text">发件人：</span>
                {detail.from} &lt;{detail.fromAddress}&gt;
              </div>
              <div>
                <span className="font-medium text-hme-text">收件人：</span>
                {detail.to}
              </div>
              <div>
                <span className="font-medium text-hme-text">时间：</span>
                {new Date(detail.date).toLocaleString()}
              </div>
            </div>
            {detail.html ? (
              <iframe
                title="邮件正文"
                srcDoc={detail.html}
                sandbox=""
                className="h-[400px] w-full rounded border border-hme-border"
              />
            ) : (
              <pre className="max-h-[400px] overflow-auto whitespace-pre-wrap break-words rounded-lg bg-hme-bg p-3 text-sm text-hme-text">
                {detail.text || "(空邮件)"}
              </pre>
            )}
          </div>
        ) : (
          <EmptyState title="无法加载邮件" />
        )}
      </Modal>
    </div>
  );
}

function formatTime(ts: number): string {
  const d = new Date(ts);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  if (sameDay) {
    return d.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" });
  }
  return d.toLocaleDateString("zh-CN", { month: "2-digit", day: "2-digit" });
}
