"use client";

import { useEffect, useState } from "react";
import { Copy, ExternalLink, Loader2, Mail, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { Modal } from "@/components/ui/Modal";
import { type RelayMessage } from "@/lib/client/types";
import { useCopyToClipboard } from "@/components/ui/Toast";

type PublicMessage = RelayMessage & {
  uid?: number;
  source?: "relay_source" | "imap_alias";
};

interface PublicInboxResponse {
  ok: boolean;
  error?: string;
  inbox?: {
    email: string;
    name: string;
  };
  count?: number;
  latestCode?: string | null;
  latest?: PublicMessage | null;
  messages?: PublicMessage[];
  checkedAt?: number;
}

interface PublicMailDetailResponse {
  ok: boolean;
  error?: string;
  mail?: {
    uid: number;
    date: number;
    from: string;
    fromAddress: string;
    to: string;
    subject: string;
    seen: boolean;
    snippet: string;
    hasOtp: boolean;
    text: string;
    html: string | null;
  };
}

export function PublicInboxView({
  inbox,
  token,
}: {
  inbox: string;
  token: string;
}) {
  const copy = useCopyToClipboard();

  const [loading, setLoading] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [latestOnly, setLatestOnly] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<PublicInboxResponse | null>(null);
  const [messageOpen, setMessageOpen] = useState<PublicMessage | null>(null);
  const [loadedOnce, setLoadedOnce] = useState(false);

  async function refresh(viewOverride?: "latest" | "all") {
    if (!token) {
      setError("缺少访问 token");
      return;
    }
    const view = viewOverride ?? (latestOnly ? "latest" : "all");
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/public/inboxes/${encodeURIComponent(inbox)}/messages?token=${encodeURIComponent(token)}&view=${view}&limit=30`,
        { cache: "no-store" },
      );
      const data = (await res.json()) as PublicInboxResponse;
      if (!res.ok || !data.ok) {
        throw new Error(data.error || `HTTP ${res.status}`);
      }
      setResult(data);
      setMessageOpen(null);
      setLoadedOnce(true);
    } catch (e) {
      setResult(null);
      setError(e instanceof Error ? e.message : "加载失败");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    setResult(null);
    setError(token ? null : "缺少访问 token");
    setLoadedOnce(false);
    setMessageOpen(null);
  }, [inbox, token]);

  const messages = result?.messages ?? [];
  const visible = latestOnly && result?.latest ? [result.latest] : messages;

  function toggleLatestOnly() {
    const next = !latestOnly;
    setLatestOnly(next);
    if (loadedOnce) {
      void refresh(next ? "latest" : "all");
    }
  }

  async function openMessage(message: PublicMessage) {
    if (message.html || message.text || message.source !== "imap_alias" || !message.uid) {
      setMessageOpen(message);
      return;
    }

    setDetailLoading(true);
    try {
      const res = await fetch(
        `/api/public/inboxes/${encodeURIComponent(inbox)}/messages/${message.uid}?token=${encodeURIComponent(token)}`,
        { cache: "no-store" },
      );
      const data = (await res.json()) as PublicMailDetailResponse;
      if (!res.ok || !data.ok || !data.mail) {
        throw new Error(data.error || `HTTP ${res.status}`);
      }
      setMessageOpen({
        ...message,
        text: data.mail.text,
        html: data.mail.html,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "加载邮件详情失败");
    } finally {
      setDetailLoading(false);
    }
  }

  return (
    <div className="relay-page-shell">
      <main className="relative z-10 mx-auto max-w-7xl px-6 py-8 lg:px-10">
        <header className="mb-8 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-2xl border border-[rgba(176,118,56,0.24)] bg-white/45 text-[#cc712f] shadow-[0_8px_30px_rgba(126,84,33,0.08)]">
              <Mail size={16} />
            </span>
            <div>
              <div className="text-sm font-semibold tracking-[0.18em] text-[#3f2a14]">
                ICLOUD MAIL
              </div>
              <div className="text-[11px] uppercase tracking-[0.22em] text-[#9c7c57]">
                Verification Relay
              </div>
            </div>
          </div>
          <div className="rounded-full border border-[rgba(176,118,56,0.22)] bg-white/55 px-4 py-2 text-[11px] font-medium tracking-[0.16em] text-[#8b633a] shadow-[0_10px_30px_rgba(126,84,33,0.08)]">
            {loading ? "SYNCING" : "READY"}
          </div>
        </header>

        <div className="grid gap-8 lg:grid-cols-[1.1fr_0.9fr] lg:items-start">
          <section className="pt-4">
            <div className="mb-5 text-[11px] uppercase tracking-[0.24em] text-[#b16a32]">
              Signal 03 / Mail Access
            </div>
            <h1 className="max-w-[12ch] text-5xl font-semibold leading-[0.95] text-[#2f2115] sm:text-6xl lg:text-7xl">
              查看最新邮件与验证码。
            </h1>
            <p className="mt-6 max-w-xl text-base leading-8 text-[#6f5a42]">
              当前页面只暴露这个邮箱账号的访问结果。默认只看最新，用户手动刷新，
              避免后台持续轮询，也尽量贴近目标站点的轻量访问路径。
            </p>
            <div className="mt-8 flex flex-wrap gap-2">
              <HeroChip>Latest Only</HeroChip>
              <HeroChip>Manual Refresh</HeroChip>
              <HeroChip>On-demand Detail</HeroChip>
            </div>
          </section>

          <section className="rounded-[28px] border border-[rgba(166,116,60,0.14)] bg-[rgba(255,249,240,0.78)] p-5 shadow-[0_22px_60px_rgba(126,84,33,0.12)] backdrop-blur-sm">
            <div className="mb-4 flex items-center gap-2">
              <span className="rounded-full border border-[rgba(214,123,51,0.22)] bg-[rgba(255,245,234,0.92)] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-[#d36f2b]">
                Verification / Ready
              </span>
            </div>

            <div className="mb-4">
              <div className="text-3xl font-semibold text-[#2f2115]">
                {result?.inbox?.email ?? inbox}
              </div>
              <div className="mt-1 text-sm text-[#7f684d]">
                {result?.inbox?.name ?? "邮箱收件页"}
              </div>
            </div>

            <div className="rounded-2xl border border-[rgba(176,118,56,0.14)] bg-[rgba(250,241,228,0.7)] p-4">
              <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-[#cf6f2a]">
                Code
              </div>
              <div className="font-mono text-3xl font-semibold text-[#c86c2a]">
                {loading
                  ? "刷新中..."
                  : result?.latestCode ?? (loadedOnce ? "等待新邮件" : "等待获取")}
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button
                  size="sm"
                  icon={<RefreshCw size={14} />}
                  onClick={() => {
                    void refresh();
                  }}
                  loading={loading}
                >
                  刷新
                </Button>
          <Button
            size="sm"
            variant={latestOnly ? "primary" : "ghost"}
            onClick={toggleLatestOnly}
            disabled={!loadedOnce && !result?.latest}
          >
            只看最新
          </Button>
                {result?.latestCode && (
                  <Button
                    size="sm"
                    variant="ghost"
                    icon={<Copy size={14} />}
                    onClick={() => copy(result.latestCode!, `已复制验证码: ${result.latestCode}`)}
                  >
                    复制验证码
                  </Button>
                )}
              </div>
            </div>

            <div className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
              <StatusItem
                label="状态"
                value={
                  loading
                    ? "正在刷新..."
                    : !loadedOnce
                      ? "手动刷新加载最新邮件"
                      : latestOnly
                        ? result?.latest
                          ? "最新邮件"
                          : "暂无最新邮件"
                        : `${result?.count ?? visible.length} 封邮件`
                }
              />
              <StatusItem
                label="最近检查"
                value={result?.checkedAt ? formatTime(result.checkedAt) : "-"}
              />
            </div>

            <div className="mt-5">
              {error ? (
                <Notice tone="error">{error}</Notice>
              ) : loading && !result ? (
                <PanelState
                  icon={<Loader2 size={26} className="hme-spin" />}
                  title="正在加载邮件..."
                />
              ) : !loadedOnce ? (
                <PanelState
                  icon={<Mail size={28} />}
                  title="手动刷新加载最新邮件"
                  description="用户页不会自动刷新，点击上方“刷新”后再查看当前别名收到的最新邮件。"
                />
              ) : visible.length === 0 ? (
                <PanelState
                  icon={<Mail size={28} />}
                  title={latestOnly ? "暂无最新邮件" : "没有邮件"}
                  description={
                    latestOnly
                      ? "当前默认只看最新。发送新邮件后，手动点击上方“刷新”再查看。"
                      : undefined
                  }
                />
              ) : (
                <div className="space-y-3">
                  {visible.map((message) => (
                    <article
                      key={message.id}
                      className="overflow-hidden rounded-2xl border border-[rgba(166,116,60,0.14)] bg-white/78 shadow-[0_10px_26px_rgba(126,84,33,0.06)]"
                    >
                      <div className="flex items-center gap-3 border-b border-[rgba(166,116,60,0.12)] px-4 py-3">
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[rgba(16,163,127,0.12)] font-semibold text-hme-primary">
                          {(message.from || message.fromAddress || "?").slice(0, 1).toUpperCase()}
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-semibold text-[#2f2115]">
                            {message.from}
                          </div>
                          <div className="truncate text-xs text-[#8a7152]">
                            {message.fromAddress || result?.inbox?.email || inbox}
                          </div>
                        </div>
                        <span className="text-xs text-[#9a7d5b]">{formatTime(message.date)}</span>
                      </div>

                      <div className="flex items-center gap-3 border-b border-[rgba(166,116,60,0.12)] px-4 py-3">
                        <h2 className="min-w-0 flex-1 text-base font-semibold text-[#2f2115]">
                          {message.subject}
                        </h2>
                        <Button
                          size="sm"
                          variant="ghost"
                          icon={<ExternalLink size={14} />}
                          onClick={() => openMessage(message)}
                        >
                          查看正文
                        </Button>
                        {message.code && (
                          <Button
                            size="sm"
                            variant="ghost"
                            icon={<Copy size={14} />}
                            onClick={() => copy(message.code!, `已复制验证码: ${message.code}`)}
                          >
                            {message.code}
                          </Button>
                        )}
                      </div>

                      <div className="px-4 py-4 text-sm leading-7 text-[#5f4c38]">
                        {message.snippet || message.text || "(空邮件)"}
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </div>
          </section>
        </div>
      </main>

      <Modal
        open={messageOpen !== null}
        onClose={() => setMessageOpen(null)}
        title={messageOpen?.subject ?? ""}
        width="max-w-4xl"
        footer={
          <>
            {messageOpen?.code && (
              <Button
                size="sm"
                variant="ghost"
                icon={<Copy size={14} />}
                onClick={() => copy(messageOpen.code!, `已复制验证码: ${messageOpen.code}`)}
              >
                复制验证码
              </Button>
            )}
            <span className="flex-1" />
            <Button size="sm" variant="ghost" onClick={() => setMessageOpen(null)}>
              关闭
            </Button>
          </>
        }
      >
        {detailLoading ? (
          <EmptyState icon={<Loader2 size={24} className="hme-spin" />} title="加载邮件正文..." />
        ) : messageOpen?.html ? (
          <iframe
            title={messageOpen.subject}
            srcDoc={messageOpen.html}
            sandbox=""
            className="h-[70vh] w-full rounded-lg border border-hme-border bg-white"
          />
        ) : (
          <pre className="max-h-[70vh] overflow-auto whitespace-pre-wrap break-words rounded-lg bg-hme-bg p-3 text-sm text-hme-text">
            {messageOpen?.text || messageOpen?.snippet || "(空邮件)"}
          </pre>
        )}
      </Modal>
    </div>
  );
}

function formatTime(ts: number | null): string {
  if (!ts) return "-";
  return new Date(ts).toLocaleString();
}

function HeroChip({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-full border border-[rgba(166,116,60,0.18)] bg-[rgba(255,249,240,0.6)] px-3 py-1 text-[11px] font-medium uppercase tracking-[0.14em] text-[#8a6c47]">
      {children}
    </span>
  );
}

function StatusItem({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-2xl border border-[rgba(166,116,60,0.12)] bg-white/52 px-4 py-3">
      <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#b0743d]">
        {label}
      </div>
      <div className="mt-1 text-sm text-[#4f3f2d]">{value}</div>
    </div>
  );
}

function PanelState({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode;
  title: string;
  description?: string;
}) {
  return (
    <div className="rounded-2xl border border-[rgba(166,116,60,0.12)] bg-white/52 px-5 py-10 text-center">
      <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-[rgba(16,163,127,0.08)] text-[#b0743d]">
        {icon}
      </div>
      <div className="text-sm font-semibold text-[#2f2115]">{title}</div>
      {description && (
        <div className="mx-auto mt-2 max-w-md text-sm leading-6 text-[#7d6548]">
          {description}
        </div>
      )}
    </div>
  );
}

function Notice({
  children,
  tone,
}: {
  children: React.ReactNode;
  tone: "error";
}) {
  return (
    <div
      className={`rounded-2xl border px-4 py-3 text-sm ${
        tone === "error"
          ? "border-[rgba(239,65,70,0.18)] bg-[rgba(255,245,245,0.86)] text-hme-danger"
          : ""
      }`}
    >
      {children}
    </div>
  );
}
