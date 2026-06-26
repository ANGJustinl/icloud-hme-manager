"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Code2,
  Copy,
  Download,
  ExternalLink,
  Inbox,
  KeyRound,
  Mail,
  Plus,
  RefreshCw,
  Search,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { Modal } from "@/components/ui/Modal";
import { AccountManager } from "@/components/AccountManager";
import { EmailRow } from "@/components/EmailRow";
import { EditLabelModal } from "@/components/EditLabelModal";
import { InboxPanel } from "@/components/InboxPanel";
import { OtpExtractor } from "@/components/OtpExtractor";
import { ApiRelayPanel } from "@/components/ApiRelayPanel";
import { useToast, useCopyToClipboard } from "@/components/ui/Toast";
import {
  apiFetch,
  type AccountPublic,
  type GenerateAliasResponse,
  type HmeEmail,
} from "@/lib/client/types";
import { exportEmailsCsv } from "@/lib/client/csv";

type Tab = "aliases" | "inbox" | "otp" | "api";

export default function HomePage() {
  const router = useRouter();
  const { toast } = useToast();

  const [accounts, setAccounts] = useState<AccountPublic[]>([]);
  const [currentId, setCurrentId] = useState<number | null>(null);
  const [emails, setEmails] = useState<HmeEmail[]>([]);
  const [emailsLoading, setEmailsLoading] = useState(false);
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [tab, setTab] = useState<Tab>("aliases");

  // 初始加载：拉账号列表 + 探测登录态
  const refreshAccounts = useCallback(async () => {
    try {
      const r = await apiFetch<{ accounts: AccountPublic[] }>("/api/accounts");
      setAccounts(r.accounts);
      setCurrentId((prev) => {
        if (prev != null && r.accounts.some((a) => a.id === prev)) return prev;
        return r.accounts[0]?.id ?? null;
      });
    } catch (e) {
      if (e instanceof Error && /401/.test(e.message)) {
        setAuthed(false);
      }
    }
  }, []);

  useEffect(() => {
    refreshAccounts();
  }, [refreshAccounts]);

  const refreshEmails = useCallback(async () => {
    if (currentId == null) {
      setEmails([]);
      return;
    }
    setEmailsLoading(true);
    try {
      const r = await apiFetch<{ emails: HmeEmail[] }>(
        `/api/hme/list?accountId=${currentId}`,
      );
      setEmails(r.emails);
    } catch (e) {
      toast(e instanceof Error ? e.message : "加载失败", "error");
      setEmails([]);
    } finally {
      setEmailsLoading(false);
    }
  }, [currentId, toast]);

  useEffect(() => {
    refreshEmails();
  }, [refreshEmails]);

  // 未登录跳转
  useEffect(() => {
    if (authed === false) router.replace("/login");
  }, [authed, router]);

  const currentAccount = accounts.find((a) => a.id === currentId) ?? null;

  return (
    <div className="min-h-screen">
      {/* 顶栏 */}
      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-hme-border bg-hme-bg/90 px-6 py-3 backdrop-blur">
        <div className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-hme-primary text-white">
            <Mail size={16} />
          </span>
          <h1 className="text-sm font-semibold text-hme-text">隐藏我的邮件</h1>
        </div>
        <AccountManager
          accounts={accounts}
          currentId={currentId}
          onSelect={setCurrentId}
          onChanged={refreshAccounts}
        />
      </header>

      <main className="mx-auto max-w-5xl px-6 py-6">
        {accounts.length === 0 ? (
          <div className="rounded-xl border border-hme-border bg-hme-card">
            <EmptyState
              icon={<Mail size={32} />}
              title="还没有添加任何 iCloud 账号"
              description="点击右上角「账号设置」→「添加账号」，粘贴从 icloud.com 复制的 Cookie"
            />
          </div>
        ) : currentAccount ? (
          <>
            {/* Tab 切换 */}
            <div className="mb-5 flex gap-1 border-b border-hme-border">
              <TabButton active={tab === "aliases"} onClick={() => setTab("aliases")} icon={<Mail size={15} />}>
                别名管理
              </TabButton>
              <TabButton active={tab === "inbox"} onClick={() => setTab("inbox")} icon={<Inbox size={15} />}>
                收件箱
              </TabButton>
              <TabButton active={tab === "otp"} onClick={() => setTab("otp")} icon={<KeyRound size={15} />}>
                验证码提取
              </TabButton>
              <TabButton active={tab === "api"} onClick={() => setTab("api")} icon={<Code2 size={15} />}>
                API 查询
              </TabButton>
            </div>

            {tab === "aliases" && (
              <AliasesView
                accountId={currentAccount.id}
                emails={emails}
                loading={emailsLoading}
                refreshEmails={refreshEmails}
                domain={currentAccount.domain}
              />
            )}
            {tab === "inbox" && (
              <InboxPanel
                accountId={currentAccount.id}
                emails={emails}
                imapReady={currentAccount.hasImapPassword}
                active={tab === "inbox"}
              />
            )}
            {tab === "otp" && (
              <OtpExtractor
                accountId={currentAccount.id}
                emails={emails}
                active={tab === "otp"}
              />
            )}
            {tab === "api" && <ApiRelayPanel />}
          </>
        ) : null}
      </main>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  icon,
  children,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${
        active
          ? "border-hme-primary text-hme-primary"
          : "border-transparent text-hme-muted hover:text-hme-text"
      }`}
    >
      {icon}
      {children}
    </button>
  );
}

/** 别名管理视图 */
function AliasesView({
  accountId,
  emails,
  loading,
  refreshEmails,
  domain,
}: {
  accountId: number;
  emails: HmeEmail[];
  loading: boolean;
  refreshEmails: () => Promise<void>;
  domain: "icloud.com" | "icloud.com.cn";
}) {
  const { toast } = useToast();
  const copyAll = useCopyToClipboard();

  const [generating, setGenerating] = useState(false);
  const [generateOpen, setGenerateOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<HmeEmail | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);

  async function handleGenerate(input: { count: number; label: string; note: string }) {
    setGenerating(true);
    try {
      const r = await apiFetch<GenerateAliasResponse>("/api/hme/generate", {
        method: "POST",
        body: JSON.stringify({
          accountId,
          count: input.count,
          label: input.label,
          note: input.note,
        }),
      });
      const addresses = r.emails.map((e) => e.hme);
      if (r.failed) {
        toast(`已生成 ${addresses.length}/${r.requestedCount} 个，后续失败: ${r.failed}`, "info");
      } else {
        toast(`已生成 ${addresses.length} 个别名`);
      }
      await copyAll(
        addresses.join("\n"),
        addresses.length === 1
          ? `生成成功并已复制: ${addresses[0]}`
          : `已复制 ${addresses.length} 个新别名`,
      );
      setGenerateOpen(false);
      await refreshEmails();
    } catch (e) {
      toast(e instanceof Error ? e.message : "生成失败", "error");
    } finally {
      setGenerating(false);
    }
  }

  function handleCopyAll() {
    if (emails.length === 0) {
      toast("当前没有可复制的邮箱", "info");
      return;
    }
    copyAll(emails.map((e) => e.hme).join("\n"), `已复制 ${emails.length} 个邮箱地址`);
  }

  function handleExport() {
    if (emails.length === 0) {
      toast("没有可导出的数据", "info");
      return;
    }
    exportEmailsCsv(emails);
    toast(`已导出 ${emails.length} 条`);
  }

  const filtered = query.trim()
    ? emails.filter((e) => {
        const q = query.toLowerCase();
        return (
          e.hme.toLowerCase().includes(q) ||
          e.label.toLowerCase().includes(q) ||
          (e.site?.toLowerCase().includes(q) ?? false) ||
          (e.usageTags?.some((t) => t.toLowerCase().includes(q)) ?? false)
        );
      })
    : emails;

  // 选中项只保留在当前过滤结果内（搜索变化时自动收敛）
  const filteredIds = new Set(filtered.map((e) => e.anonymousId));
  const selectedInView = [...selected].filter((id) => filteredIds.has(id));
  const allSelected = filtered.length > 0 && selectedInView.length === filtered.length;

  function toggleSelect(anonymousId: string, checked: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(anonymousId);
      else next.delete(anonymousId);
      return next;
    });
  }

  function toggleSelectAll() {
    setSelected((prev) => {
      if (allSelected) {
        const next = new Set(prev);
        filtered.forEach((e) => next.delete(e.anonymousId));
        return next;
      }
      const next = new Set(prev);
      filtered.forEach((e) => next.add(e.anonymousId));
      return next;
    });
  }

  /** 批量调用单条端点（iCloud API 本身是单条的），限制并发避免触发限流 */
  async function runBulk(
    action: "deactivate" | "reactivate" | "delete",
    ids: string[],
  ) {
    if (ids.length === 0) return;
    const verb =
      action === "delete" ? "删除" : action === "deactivate" ? "停用" : "恢复";
    if (
      action === "delete" &&
      !confirm(
        `确定永久删除选中的 ${ids.length} 个别名？\n\n该操作不可恢复，且会从所有注册过它们的网站失效。`,
      )
    )
      return;

    setBulkBusy(true);
    let ok = 0;
    let fail = 0;
    const CONCURRENCY = 3;
    const queue = [...ids];
    async function worker() {
      while (queue.length) {
        const anonymousId = queue.shift()!;
        try {
          await apiFetch(`/api/hme/${action}`, {
            method: "POST",
            body: JSON.stringify({ accountId, anonymousId }),
          });
          ok++;
        } catch {
          fail++;
        }
      }
    }
    try {
      await Promise.all(
        Array.from({ length: Math.min(CONCURRENCY, ids.length) }, worker),
      );
      toast(
        fail === 0
          ? `已${verb} ${ok} 个别名`
          : `${verb}完成：成功 ${ok} 个，失败 ${fail} 个`,
        fail === 0 ? "success" : "info",
      );
      setSelected(new Set());
      await refreshEmails();
    } finally {
      setBulkBusy(false);
    }
  }

  return (
    <>
      {/* 工具栏 */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="flex min-w-[200px] flex-1 items-center gap-2 rounded-lg border border-hme-border bg-hme-card px-3">
          <Search size={14} className="text-hme-muted" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="搜索别名或标签..."
            className="w-full bg-transparent py-2 text-sm outline-none"
          />
        </div>
        <Button
          variant="ghost"
          size="sm"
          icon={<Download size={14} />}
          onClick={handleExport}
          disabled={emails.length === 0}
        >
          导出 CSV
        </Button>
        <Button
          variant="ghost"
          size="sm"
          icon={<Copy size={14} />}
          onClick={handleCopyAll}
          disabled={emails.length === 0}
        >
          复制全部
        </Button>
        <Button
          variant="ghost"
          size="sm"
          icon={<RefreshCw size={14} />}
          onClick={refreshEmails}
          loading={loading}
        >
          刷新
        </Button>
        <Button
          size="sm"
          icon={<Plus size={14} />}
          onClick={() => setGenerateOpen(true)}
          loading={generating}
        >
          生成别名
        </Button>
      </div>

      {/* 批量操作条（有选中项时出现） */}
      {selectedInView.length > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-hme-primary/30 bg-hme-primary/5 px-3 py-2 text-sm">
          <span className="font-medium text-hme-primary">
            已选 {selectedInView.length} 个
          </span>
          <div className="flex-1" />
          <Button
            variant="ghost"
            size="sm"
            onClick={() => runBulk("reactivate", selectedInView)}
            loading={bulkBusy}
          >
            批量恢复
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => runBulk("deactivate", selectedInView)}
            loading={bulkBusy}
          >
            批量停用
          </Button>
          <Button
            variant="danger"
            size="sm"
            icon={<Trash2 size={14} />}
            onClick={() => runBulk("delete", selectedInView)}
            loading={bulkBusy}
          >
            批量删除
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setSelected(new Set())}
            disabled={bulkBusy}
          >
            取消选择
          </Button>
        </div>
      )}

      {/* 表格 */}
      <div className="overflow-hidden rounded-xl border border-hme-border bg-hme-card">
        <div className="max-h-[calc(100vh-260px)] overflow-auto">
          <table className="w-full text-left">
            <thead className="sticky top-0 z-10">
              <tr className="bg-[#f9f9fa] text-xs font-medium text-hme-muted">
                <th className="w-12 border-b border-hme-border px-4 py-3">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    onChange={toggleSelectAll}
                    disabled={filtered.length === 0}
                    className="h-4 w-4 cursor-pointer accent-hme-primary"
                    aria-label="全选"
                  />
                </th>
                <th className="border-b border-hme-border px-4 py-3">标签 / 邮箱地址</th>
                <th className="w-40 border-b border-hme-border px-4 py-3">转发状态 / 操作</th>
              </tr>
            </thead>
            <tbody>
              {loading && emails.length === 0 ? (
                <tr>
                  <td colSpan={3}>
                    <EmptyState
                      icon={<RefreshCw size={28} className="hme-spin" />}
                      title="正在同步 iCloud 数据..."
                    />
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={3}>
                    <EmptyState
                      icon={<Inbox size={32} />}
                      title={query ? "没有匹配的别名" : "还没有别名"}
                      description={
                        query ? "试试其他关键词" : "点击「生成别名」创建第一个隐藏邮箱"
                      }
                      action={
                        !query ? (
                          <Button
                            size="sm"
                            icon={<Plus size={14} />}
                            onClick={() => setGenerateOpen(true)}
                            loading={generating}
                          >
                            生成别名
                          </Button>
                        ) : null
                      }
                    />
                  </td>
                </tr>
              ) : (
                filtered.map((e) => (
                  <EmailRow
                    key={e.anonymousId}
                    email={e}
                    accountId={accountId}
                    domain={domain}
                    onToggleChanged={refreshEmails}
                    onEdit={setEditing}
                    selected={selected.has(e.anonymousId)}
                    onSelectChange={toggleSelect}
                  />
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="mt-3 flex items-center justify-between text-xs text-hme-muted">
        <span>
          共 {emails.length} 个别名
          {query && ` · 匹配 ${filtered.length} 个`}
        </span>
        <a
          href={`https://www.${domain}/mail/`}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 hover:text-hme-text"
        >
          打开 iCloud 邮箱 <ExternalLink size={12} />
        </a>
      </div>

      {/* 编辑标签 Modal */}
      {editing && (
        <EditLabelModal
          open={editing !== null}
          onClose={() => setEditing(null)}
          onSaved={refreshEmails}
          accountId={accountId}
          anonymousId={editing.anonymousId}
          email={editing.hme}
          initialLabel={editing.label}
          initialNote={editing.note ?? ""}
          initialSite={editing.site ?? ""}
          initialTags={editing.usageTags ?? []}
        />
      )}

      <GenerateAliasModal
        open={generateOpen}
        saving={generating}
        onClose={() => setGenerateOpen(false)}
        onSubmit={handleGenerate}
      />
    </>
  );
}

function GenerateAliasModal({
  open,
  saving,
  onClose,
  onSubmit,
}: {
  open: boolean;
  saving: boolean;
  onClose: () => void;
  onSubmit: (input: { count: number; label: string; note: string }) => void;
}) {
  const [count, setCount] = useState(1);
  const [label, setLabel] = useState("");
  const [note, setNote] = useState("");
  const normalizedCount = Math.min(5, Math.max(1, Math.trunc(count || 1)));
  const previewLabel = label.trim() || "Alias_随机";

  function submit() {
    onSubmit({
      count: normalizedCount,
      label: label.trim(),
      note: note.trim(),
    });
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="生成隐藏邮箱别名"
      width="max-w-lg"
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={onClose} disabled={saving}>
            取消
          </Button>
          <Button size="sm" onClick={submit} loading={saving}>
            生成
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div>
          <label className="mb-1.5 block text-xs font-medium text-hme-muted">
            数量（最多 5 个）
          </label>
          <input
            type="number"
            min={1}
            max={5}
            value={count}
            onChange={(e) => setCount(Number(e.target.value) || 1)}
            className="w-full rounded-lg border border-hme-border bg-white px-3 py-2 text-sm outline-none focus:border-hme-primary"
          />
        </div>

        <div>
          <label className="mb-1.5 block text-xs font-medium text-hme-muted">
            标签
          </label>
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="例如：LinuxDo、注册测试；留空则自动生成"
            maxLength={64}
            className="w-full rounded-lg border border-hme-border bg-white px-3 py-2 text-sm outline-none focus:border-hme-primary"
          />
          <div className="mt-1 text-[11px] text-hme-muted">
            {normalizedCount === 1
              ? `生成标签：${previewLabel}`
              : `生成标签：${previewLabel}-001 到 ${previewLabel}-${String(normalizedCount).padStart(3, "0")}`}
          </div>
        </div>

        <div>
          <label className="mb-1.5 block text-xs font-medium text-hme-muted">
            备注
          </label>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="可选，留空则创建空备注"
            rows={3}
            maxLength={500}
            className="w-full resize-none rounded-lg border border-hme-border bg-white px-3 py-2 text-sm outline-none focus:border-hme-primary"
          />
        </div>
      </div>
    </Modal>
  );
}
