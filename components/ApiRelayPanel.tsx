"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Code2,
  Copy,
  ExternalLink,
  FileJson,
  Link,
  Loader2,
  Mail,
  Pencil,
  Plus,
  Radio,
  RefreshCw,
  Search,
  Share2,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { Modal } from "@/components/ui/Modal";
import {
  apiFetch,
  type RelayLookupResponse,
  type RelayMessage,
  type RelayShareResponse,
  type RelaySourcePublic,
} from "@/lib/client/types";
import { useCopyToClipboard, useToast } from "@/components/ui/Toast";

type SourceForm = { name: string; url: string };

export function ApiRelayPanel() {
  const { toast } = useToast();
  const copy = useCopyToClipboard();

  const [sources, setSources] = useState<RelaySourcePublic[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [sourcesLoading, setSourcesLoading] = useState(false);
  const [lookupLoading, setLookupLoading] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [tempLoading, setTempLoading] = useState(false);
  const [listExpanded, setListExpanded] = useState(false);
  const [autoWatch, setAutoWatch] = useState(false);
  const [jsonOpen, setJsonOpen] = useState(false);
  const [messageOpen, setMessageOpen] = useState<RelayMessage | null>(null);
  const [shareOpen, setShareOpen] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<RelaySourcePublic | null>(null);
  const [shareSource, setShareSource] = useState<RelaySourcePublic | null>(null);
  const [shareData, setShareData] = useState<RelayShareResponse["share"] | null>(null);
  const [shareLoading, setShareLoading] = useState(false);
  const [form, setForm] = useState<SourceForm>({ name: "", url: "" });
  const [tempUrl, setTempUrl] = useState("");
  const [result, setResult] = useState<RelayLookupResponse | null>(null);
  const lastCopiedRef = useRef<string | null>(null);

  const selectedSource = useMemo(
    () => sources.find((s) => s.id === selectedId) ?? null,
    [selectedId, sources],
  );

  const refreshSources = useCallback(async () => {
    setSourcesLoading(true);
    try {
      const r = await apiFetch<{ sources: RelaySourcePublic[] }>("/api/relay/sources");
      setSources(r.sources);
      setSelectedId((prev) => {
        if (prev != null && r.sources.some((s) => s.id === prev)) return prev;
        return r.sources[0]?.id ?? null;
      });
    } catch (e) {
      toast(e instanceof Error ? e.message : "加载 API 邮箱失败", "error");
    } finally {
      setSourcesLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    refreshSources();
  }, [refreshSources]);

  const lookupSaved = useCallback(
    async (id: number, opts: { silent?: boolean; watch?: boolean } = {}) => {
      if (!opts.silent) setLookupLoading(true);
      try {
      const r = await apiFetch<RelayLookupResponse>("/api/relay/lookup", {
        method: "POST",
        body: JSON.stringify({ sourceId: id, includeBodies: false }),
        });
        setResult(r);
        setMessageOpen(null);
        setListExpanded(false);
        setSources((prev) =>
          prev.map((source) =>
            source.id === id
              ? {
                  ...source,
                  inboxHint: r.inbox ?? source.inboxHint,
                  lastCode: r.code,
                  lastSubject: r.latest?.subject ?? source.lastSubject,
                  lastSender: r.latest?.from ?? source.lastSender,
                  lastCheckedAt: r.checkedAt,
                  lastMessageDate: r.messageDate,
                }
              : source,
          ),
        );
        if (r.code && r.code !== lastCopiedRef.current) {
          lastCopiedRef.current = r.code;
          await copy(r.code, `已复制验证码: ${r.code}`);
        } else if (!r.code && !opts.silent) {
          toast("未从该 API 的最新邮件中提取到验证码", "info");
        }
      } catch (e) {
        if (!opts.silent) toast(e instanceof Error ? e.message : "获取失败", "error");
        if (opts.watch) setAutoWatch(false);
      } finally {
        if (!opts.silent) setLookupLoading(false);
      }
    },
    [copy, refreshSources, toast],
  );

  async function lookupTemporary() {
    if (!tempUrl.trim()) {
      toast("请先输入临时邮箱 API 地址", "info");
      return;
    }
    setTempLoading(true);
    try {
      const r = await apiFetch<RelayLookupResponse>("/api/relay/lookup", {
        method: "POST",
        body: JSON.stringify({ url: tempUrl.trim(), includeBodies: false }),
      });
      setResult(r);
      setMessageOpen(null);
      setListExpanded(false);
      setSelectedId(null);
      setAutoWatch(false);
      if (r.code && r.code !== lastCopiedRef.current) {
        lastCopiedRef.current = r.code;
        await copy(r.code, `已复制验证码: ${r.code}`);
      } else if (!r.code) {
        toast("未从该 API 的最新邮件中提取到验证码", "info");
      }
    } catch (e) {
      toast(e instanceof Error ? e.message : "获取失败", "error");
    } finally {
      setTempLoading(false);
    }
  }

  async function openJsonModal() {
    if (!selectedId && !tempUrl.trim()) return;
    setJsonOpen(true);
    if (result?.raw) return;

    try {
      const body =
        selectedId != null
          ? { sourceId: selectedId, includeRaw: true }
          : { url: tempUrl.trim(), includeRaw: true };
      const r = await apiFetch<RelayLookupResponse>("/api/relay/lookup", {
        method: "POST",
        body: JSON.stringify(body),
      });
      setResult((prev) => ({
        ...(prev ?? r),
        ...r,
      }));
    } catch (e) {
      toast(e instanceof Error ? e.message : "加载 JSON 失败", "error");
    }
  }

  async function openMessage(message: RelayMessage) {
    if (message.html || message.text) {
      setMessageOpen(message);
      return;
    }

    setDetailLoading(true);
    try {
      const body =
        selectedId != null
          ? { sourceId: selectedId, messageId: message.id }
          : { url: tempUrl.trim(), messageId: message.id };
      const r = await apiFetch<{ message: RelayMessage }>("/api/relay/message", {
        method: "POST",
        body: JSON.stringify(body),
      });
      setMessageOpen(r.message);
    } catch (e) {
      toast(e instanceof Error ? e.message : "加载邮件正文失败", "error");
    } finally {
      setDetailLoading(false);
    }
  }

  useEffect(() => {
    if (!autoWatch || selectedId == null) return;
    lastCopiedRef.current = result?.code ?? selectedSource?.lastCode ?? null;
    const timer = setInterval(() => {
      lookupSaved(selectedId, { silent: true, watch: true });
    }, 5000);
    return () => clearInterval(timer);
  }, [autoWatch, lookupSaved, result?.code, selectedId, selectedSource?.lastCode]);

  function openCreate() {
    setEditing(null);
    setForm({ name: "", url: "" });
    setEditorOpen(true);
  }

  function selectSource(source: RelaySourcePublic) {
    setSelectedId(source.id);
    setResult(null);
    setListExpanded(false);
    setAutoWatch(false);
    lastCopiedRef.current = source.lastCode;
  }

  function openEdit(source: RelaySourcePublic) {
    setEditing(source);
    setForm({ name: source.name, url: "" });
    setEditorOpen(true);
  }

  async function openShare(source: RelaySourcePublic) {
    setShareSource(source);
    setShareData(null);
    setShareOpen(true);
    setShareLoading(true);
    try {
      const r = await apiFetch<RelayShareResponse>(`/api/relay/sources/${source.id}/share`);
      setShareData(r.share);
    } catch (e) {
      toast(e instanceof Error ? e.message : "生成分享链接失败", "error");
    } finally {
      setShareLoading(false);
    }
  }

  async function saveSource() {
    const name = form.name.trim();
    const url = form.url.trim();
    if (!name) {
      toast("名称不能为空", "error");
      return;
    }
    if (!editing && !url) {
      toast("邮箱 API 地址不能为空", "error");
      return;
    }

    try {
      if (editing) {
        const body: { name: string; url?: string } = { name };
        if (url) body.url = url;
        const r = await apiFetch<{ source: RelaySourcePublic }>(
          `/api/relay/sources/${editing.id}`,
          { method: "PATCH", body: JSON.stringify(body) },
        );
        setSelectedId(r.source.id);
        toast("API 邮箱已更新");
      } else {
        const r = await apiFetch<{ source: RelaySourcePublic }>("/api/relay/sources", {
          method: "POST",
          body: JSON.stringify({ name, url }),
        });
        setSelectedId(r.source.id);
        toast("API 邮箱已保存");
      }
      setEditorOpen(false);
      await refreshSources();
    } catch (e) {
      toast(e instanceof Error ? e.message : "保存失败", "error");
    }
  }

  async function deleteSource(source: RelaySourcePublic) {
    if (!confirm(`确定删除 API 邮箱「${source.name}」？`)) return;
    try {
      await apiFetch(`/api/relay/sources/${source.id}`, { method: "DELETE" });
      if (selectedId === source.id) {
        setSelectedId(null);
        setResult(null);
        setAutoWatch(false);
      }
      toast("API 邮箱已删除");
      await refreshSources();
    } catch (e) {
      toast(e instanceof Error ? e.message : "删除失败", "error");
    }
  }

  const newestMessage = result?.latest ?? result?.messages?.[0] ?? null;
  const messages = result?.messages ?? [];
  const visibleMessages = listExpanded ? messages : newestMessage ? [newestMessage] : [];

  return (
    <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
      <aside className="space-y-4">
        <div className="rounded-xl border border-hme-border bg-hme-card">
          <div className="flex items-center gap-2 border-b border-hme-border px-4 py-3">
            <Code2 size={16} className="text-hme-primary" />
            <h2 className="text-sm font-semibold text-hme-text">API 收件台</h2>
            <div className="flex-1" />
            <Button size="sm" variant="ghost" icon={<Plus size={14} />} onClick={openCreate}>
              新增
            </Button>
          </div>

          {sourcesLoading && sources.length === 0 ? (
            <EmptyState icon={<Loader2 size={24} className="hme-spin" />} title="加载 API 邮箱..." />
          ) : sources.length === 0 ? (
            <EmptyState
              icon={<Mail size={28} />}
              title="还没有保存 API 邮箱"
              description="点击新增，保存带 token 的邮箱 API 地址"
            />
          ) : (
            <div className="max-h-[360px] divide-y divide-hme-border overflow-auto">
              {sources.map((source) => (
                <SourceRow
                  key={source.id}
                  source={source}
                  active={source.id === selectedId}
                  onSelect={() => selectSource(source)}
                  onShare={() => openShare(source)}
                  onEdit={() => openEdit(source)}
                  onDelete={() => deleteSource(source)}
                />
              ))}
            </div>
          )}
        </div>

        <div className="rounded-xl border border-hme-border bg-hme-card p-4">
          <div className="mb-2 flex items-center gap-2 text-sm font-medium text-hme-text">
            <Link size={15} className="text-hme-primary" />
            临时查询
          </div>
          <input
            value={tempUrl}
            onChange={(e) => setTempUrl(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") lookupTemporary();
            }}
            placeholder="粘贴 API 地址（不保存）"
            className="w-full rounded-lg border border-hme-border bg-white px-3 py-2 font-mono text-xs outline-none focus:border-hme-primary"
          />
          <Button
            className="mt-2 w-full"
            variant="ghost"
            size="sm"
            loading={tempLoading}
            icon={<Search size={14} />}
            onClick={lookupTemporary}
          >
            临时获取
          </Button>
          <p className="mt-2 text-[11px] leading-relaxed text-hme-muted">
            临时查询不会保存 token。需要自动监听时请保存为 API 邮箱。
          </p>
        </div>
      </aside>

      <section className="space-y-4">
        <div className="rounded-xl border border-hme-border bg-hme-card">
          <div className="border-b border-hme-border px-5 py-4">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-sm font-semibold text-hme-text">
                {selectedSource?.name ?? result?.inbox ?? "API 验证码查询"}
              </h2>
              {selectedSource?.inboxHint && (
                <span className="text-xs text-hme-muted">{selectedSource.inboxHint}</span>
              )}
              <div className="flex-1" />
              <Button
                size="sm"
                variant={autoWatch ? "primary" : "ghost"}
                icon={<Radio size={14} />}
                onClick={() => setAutoWatch((v) => !v)}
                disabled={!selectedSource}
              >
                {autoWatch ? "监听中" : "自动监听"}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                icon={<RefreshCw size={14} />}
                onClick={() => selectedId != null && lookupSaved(selectedId)}
                loading={lookupLoading}
                disabled={selectedId == null}
              >
                刷新
              </Button>
            </div>
          </div>

          <div className="space-y-4 px-5 py-4">
            <div className="rounded-lg border border-hme-border bg-hme-bg/60 p-4">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-hme-primary">
                  Code
                </div>
              {(result?.code ?? selectedSource?.lastCode) && (
                <Button
                  size="sm"
                  variant="ghost"
                  icon={<Copy size={14} />}
                  onClick={() => {
                    const code = result?.code ?? selectedSource?.lastCode;
                    if (code) copy(code, `已复制验证码: ${code}`);
                  }}
                >
                  复制
                </Button>
              )}
              </div>
              <div className="font-mono text-2xl font-semibold text-hme-primary">
                {lookupLoading || tempLoading
                  ? "获取中..."
                  : result?.code ?? selectedSource?.lastCode ?? "等待获取"}
              </div>
            </div>

            <div className="grid gap-3 text-xs sm:grid-cols-2">
              <InfoItem label="邮箱" value={result?.inbox ?? selectedSource?.inboxHint ?? "-"} />
              <InfoItem label="邮件时间" value={formatTime(result?.messageDate ?? null)} />
              <InfoItem label="主题" value={result?.subject ?? "-"} />
              <InfoItem
                label="最近检查"
                value={formatTime(result?.checkedAt ?? selectedSource?.lastCheckedAt ?? null)}
              />
            </div>

            {newestMessage && (
              <div className="rounded-xl border border-hme-border bg-white p-4 shadow-[0_10px_24px_rgba(0,0,0,0.04)]">
                <div className="mb-2 flex items-center justify-between gap-3">
                  <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-hme-primary">
                    Latest
                  </div>
                  <span className="text-xs text-hme-muted">{formatTime(newestMessage.date)}</span>
                </div>
                <div className="text-base font-semibold text-hme-text">
                  {newestMessage.subject}
                </div>
                <div className="mt-1 text-xs text-hme-muted">
                  {newestMessage.from}
                </div>
                <div className="mt-3 line-clamp-3 text-sm leading-6 text-hme-text">
                  {newestMessage.snippet || newestMessage.text || "(空邮件)"}
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant="ghost"
                    icon={<ExternalLink size={14} />}
                    onClick={() => {
                      void openMessage(newestMessage);
                    }}
                  >
                    查看正文
                  </Button>
                  {newestMessage.code && (
                    <Button
                      size="sm"
                      variant="ghost"
                      icon={<Copy size={14} />}
                      onClick={() => copy(newestMessage.code!, `已复制验证码: ${newestMessage.code}`)}
                    >
                      复制 {newestMessage.code}
                    </Button>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="rounded-xl border border-hme-border bg-hme-card">
          <div className="flex flex-wrap items-center gap-2 border-b border-hme-border px-5 py-3">
            <span className="text-sm font-medium text-hme-text">
              {result ? `最近 ${result.count} 封邮件` : "邮件结果"}
            </span>
            <div className="flex-1" />
            <Button
              size="sm"
              variant={listExpanded ? "primary" : "ghost"}
              onClick={() => setListExpanded((v) => !v)}
              disabled={messages.length <= 1}
            >
              {listExpanded ? "收起列表" : "展开列表"}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              icon={<FileJson size={14} />}
              onClick={() => {
                void openJsonModal();
              }}
              disabled={!result}
            >
              JSON
            </Button>
          </div>

          {lookupLoading && !result ? (
            <EmptyState icon={<Loader2 size={28} className="hme-spin" />} title="正在获取邮箱 API..." />
          ) : !result ? (
            <EmptyState icon={<Mail size={32} />} title="选择 API 邮箱或临时查询" />
          ) : messages.length === 0 ? (
            <EmptyState
              icon={<Mail size={32} />}
              title="没有邮件"
              description="当前没有可展示的邮件，发送后再手动刷新。"
            />
          ) : (
            <div className="divide-y divide-hme-border">
              {visibleMessages.map((m) => (
                <RelayMessageCard
                  key={m.id}
                  message={m}
                  onCopy={copy}
                  onOpen={() => {
                    void openMessage(m);
                  }}
                />
              ))}
            </div>
          )}
        </div>
      </section>

      <SourceEditorModal
        open={editorOpen}
        editing={editing}
        form={form}
        onChange={setForm}
        onClose={() => setEditorOpen(false)}
        onSubmit={saveSource}
      />

      <Modal
        open={jsonOpen}
        onClose={() => setJsonOpen(false)}
        title="邮箱 API JSON"
        width="max-w-3xl"
        footer={
          <Button size="sm" variant="ghost" onClick={() => setJsonOpen(false)}>
            关闭
          </Button>
        }
      >
        <pre className="max-h-[60vh] overflow-auto rounded-lg bg-hme-bg p-3 text-xs text-hme-text">
          {jsonOpen ? JSON.stringify(result?.raw ?? null, null, 2) : ""}
        </pre>
      </Modal>

      <Modal
        open={shareOpen}
        onClose={() => setShareOpen(false)}
        title={`用户访问 · ${shareSource?.name ?? ""}`}
        width="max-w-2xl"
        footer={
          <Button size="sm" variant="ghost" onClick={() => setShareOpen(false)}>
            关闭
          </Button>
        }
      >
        {shareLoading ? (
          <EmptyState icon={<Loader2 size={24} className="hme-spin" />} title="生成分享链接..." />
        ) : shareData ? (
          <div className="space-y-4">
            <div className="text-xs text-hme-muted">
              邮箱：{shareData.inbox} · 过期时间：{formatTime(shareData.expiresAt)}
            </div>
            <ShareField label="用户页链接" value={shareData.pageUrl} onCopy={copy} />
            <ShareField label="用户 API 链接" value={shareData.apiUrl} onCopy={copy} />
          </div>
        ) : (
          <EmptyState title="未生成分享链接" />
        )}
      </Modal>

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

function SourceRow({
  source,
  active,
  onSelect,
  onShare,
  onEdit,
  onDelete,
}: {
  source: RelaySourcePublic;
  active: boolean;
  onSelect: () => void;
  onShare: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <div
      className={`flex gap-2 px-4 py-3 ${
        active ? "bg-hme-primary/6" : "hover:bg-black/[0.02]"
      }`}
    >
      <button className="min-w-0 flex-1 text-left" onClick={onSelect}>
        <div className={`truncate text-sm font-medium ${active ? "text-hme-primary" : "text-hme-text"}`}>
          {source.name}
        </div>
        <div className="mt-0.5 truncate text-xs text-hme-muted">
          {source.inboxHint || "未识别邮箱"}
        </div>
        <div className="mt-2 rounded-lg bg-hme-bg/70 px-2.5 py-2">
          <div className="truncate text-[11px] font-medium text-hme-text">
            {source.lastSubject || "暂无最新主题"}
          </div>
          <div className="mt-1 truncate text-[11px] text-hme-muted">
            {source.lastSender || "等待第一次同步"}
          </div>
        </div>
        <div className="mt-2 flex flex-wrap gap-1.5 text-[11px]">
          <SourceMetaPill>
            {source.lastCode ? `验证码 ${source.lastCode}` : "暂无验证码"}
          </SourceMetaPill>
          <SourceMetaPill>
            {source.lastMessageDate ? `邮件 ${formatTime(source.lastMessageDate)}` : "无邮件"}
          </SourceMetaPill>
          <SourceMetaPill>
            {source.lastCheckedAt ? `检查 ${formatTime(source.lastCheckedAt)}` : "未检查"}
          </SourceMetaPill>
        </div>
      </button>
      <div className="flex shrink-0 items-start gap-1">
        <IconButton title="分享" onClick={onShare}>
          <Share2 size={14} />
        </IconButton>
        <IconButton title="编辑" onClick={onEdit}>
          <Pencil size={14} />
        </IconButton>
        <IconButton title="删除" onClick={onDelete} danger>
          <Trash2 size={14} />
        </IconButton>
      </div>
    </div>
  );
}

function SourceEditorModal({
  open,
  editing,
  form,
  onChange,
  onClose,
  onSubmit,
}: {
  open: boolean;
  editing: RelaySourcePublic | null;
  form: SourceForm;
  onChange: (form: SourceForm) => void;
  onClose: () => void;
  onSubmit: () => void;
}) {
  const set = <K extends keyof SourceForm>(key: K, value: SourceForm[K]) =>
    onChange({ ...form, [key]: value });

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editing ? "编辑 API 邮箱" : "新增 API 邮箱"}
      width="max-w-lg"
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={onClose}>
            取消
          </Button>
          <Button size="sm" onClick={onSubmit}>
            保存
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div>
          <label className="mb-1.5 block text-xs font-medium text-hme-muted">
            名称
          </label>
          <input
            value={form.name}
            onChange={(e) => set("name", e.target.value)}
            placeholder="例如：OpenAI 注册池"
            className="w-full rounded-lg border border-hme-border bg-white px-3 py-2 text-sm outline-none focus:border-hme-primary"
          />
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-medium text-hme-muted">
            邮箱 API 地址
          </label>
          <textarea
            value={form.url}
            onChange={(e) => set("url", e.target.value)}
            placeholder={
              editing
                ? "留空则不修改已保存的 API 地址"
                : "https://example.com/v1/inboxes/alias_x/messages?token=..."
            }
            rows={4}
            className="w-full resize-none rounded-lg border border-hme-border bg-white px-3 py-2 font-mono text-xs outline-none focus:border-hme-primary"
          />
          <p className="mt-1 text-[11px] leading-relaxed text-hme-muted">
            API 地址可能包含 token，保存后会加密存入 SQLite，前端不会再显示完整地址。
          </p>
        </div>
      </div>
    </Modal>
  );
}

function RelayMessageCard({
  message,
  onCopy,
  onOpen,
}: {
  message: RelayMessage;
  onCopy: (text: string, hint?: string) => Promise<void>;
  onOpen: () => void;
}) {
  return (
    <article className="px-5 py-4">
      <div className="flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-hme-primary/10 font-semibold text-hme-primary">
          {(message.from || message.fromAddress || "?").slice(0, 1).toUpperCase()}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="truncate text-sm font-semibold text-hme-text">
              {message.from}
            </span>
            <span className="text-xs text-hme-muted">{message.fromAddress}</span>
            <span className="ml-auto text-xs text-hme-muted">{formatTime(message.date)}</span>
          </div>
          {message.to && <div className="mt-0.5 text-xs text-hme-muted">{message.to}</div>}
        </div>
      </div>

      <div className="mt-3 flex items-center gap-3 border-y border-hme-border py-3">
        <h3 className="min-w-0 flex-1 text-base font-semibold text-hme-text">
          {message.subject}
        </h3>
        <Button
          size="sm"
          variant="ghost"
          icon={<ExternalLink size={14} />}
          onClick={onOpen}
        >
          查看正文
        </Button>
        {message.code && (
          <Button
            size="sm"
            variant="ghost"
            icon={<Copy size={14} />}
            onClick={() => onCopy(message.code!, `已复制验证码: ${message.code}`)}
          >
            {message.code}
          </Button>
        )}
      </div>

      <div className="mt-3 rounded-lg bg-hme-bg p-3 text-sm text-hme-text">
        {message.snippet || message.text || "(空邮件)"}
      </div>
    </article>
  );
}

function IconButton({
  children,
  title,
  onClick,
  danger,
}: {
  children: React.ReactNode;
  title: string;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      title={title}
      onClick={onClick}
      className={`rounded p-1 text-hme-muted hover:bg-black/[0.05] ${
        danger ? "hover:text-hme-danger" : "hover:text-hme-text"
      }`}
    >
      {children}
    </button>
  );
}

function ShareField({
  label,
  value,
  onCopy,
}: {
  label: string;
  value: string;
  onCopy: (text: string, hint?: string) => Promise<void>;
}) {
  return (
    <div>
      <div className="mb-1.5 text-xs font-medium text-hme-muted">{label}</div>
      <div className="flex gap-2">
        <input
          value={value}
          readOnly
          className="w-full rounded-lg border border-hme-border bg-hme-bg px-3 py-2 font-mono text-xs text-hme-text"
        />
        <Button
          size="sm"
          variant="ghost"
          icon={<Copy size={14} />}
          onClick={() => onCopy(value, `已复制${label}`)}
        >
          复制
        </Button>
      </div>
    </div>
  );
}

function SourceMetaPill({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-full border border-hme-border bg-white/80 px-2 py-1 text-[11px] text-hme-muted">
      {children}
    </span>
  );
}

function InfoItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="font-medium text-hme-text">{label}</div>
      <div className="mt-1 break-words text-hme-muted">{value}</div>
    </div>
  );
}

function formatTime(ts: number | null): string {
  if (!ts) return "-";
  return new Date(ts).toLocaleString();
}
