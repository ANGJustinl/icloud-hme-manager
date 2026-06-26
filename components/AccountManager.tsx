"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, ChevronDown, Mail, Plus, RefreshCw, Trash2 } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { apiFetch, type AccountPublic } from "@/lib/client/types";
import { useToast } from "@/components/ui/Toast";

interface AccountManagerProps {
  accounts: AccountPublic[];
  currentId: number | null;
  onSelect: (id: number) => void;
  onChanged: () => void;
}

/** Cookie 状态小圆点：绿=正常 / 红=失效 / 灰=待校验 */
function CookieDot({ status }: { status: AccountPublic["cookieStatus"] }) {
  const color =
    status === "ok"
      ? "bg-emerald-500"
      : status === "invalid"
        ? "bg-hme-danger"
        : "bg-hme-border";
  const title =
    status === "ok"
      ? "Cookie 正常"
      : status === "invalid"
        ? "Cookie 已失效，请更新"
        : "Cookie 状态未知（尚未校验）";
  return (
    <span
      title={title}
      className={`inline-block h-2 w-2 shrink-0 rounded-full ${color}`}
    />
  );
}

export function AccountManager({
  accounts,
  currentId,
  onSelect,
  onChanged,
}: AccountManagerProps) {
  const [open, setOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [editing, setEditing] = useState<AccountPublic | null>(null);
  const { toast } = useToast();

  // 新建表单状态
  const [form, setForm] = useState({
    name: "",
    domain: "icloud.com" as "icloud.com" | "icloud.com.cn",
    cookie: "",
    imapUsername: "",
    imapAppPassword: "",
  });
  const [saving, setSaving] = useState(false);

  const current = accounts.find((a) => a.id === currentId) ?? null;

  function resetForm() {
    setForm({
      name: "",
      domain: "icloud.com",
      cookie: "",
      imapUsername: "",
      imapAppPassword: "",
    });
  }

  async function handleCreate() {
    if (!form.name.trim() || !form.cookie.trim()) {
      toast("名称和 Cookie 都不能为空", "error");
      return;
    }
    const hasUser = Boolean(form.imapUsername.trim());
    const hasPass = Boolean(form.imapAppPassword.trim());
    if (hasUser !== hasPass) {
      toast("IMAP 主邮箱和应用专用密码需同时填写或同时留空", "error");
      return;
    }
    setSaving(true);
    try {
      await apiFetch("/api/accounts", {
        method: "POST",
        body: JSON.stringify({
          name: form.name.trim(),
          domain: form.domain,
          cookie: form.cookie.trim(),
          imapUsername: hasUser ? form.imapUsername.trim() : undefined,
          imapAppPassword: hasPass ? form.imapAppPassword.trim() : undefined,
        }),
      });
      toast("账号已添加");
      resetForm();
      setOpen(false);
      onChanged();
    } catch (e) {
      toast(e instanceof Error ? e.message : "添加失败", "error");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: number) {
    if (!confirm("确定删除该账号？仅删除本地记录，不影响 iCloud 已注册的别名。")) return;
    try {
      await apiFetch(`/api/accounts/${id}`, { method: "DELETE" });
      toast("账号已删除");
      onChanged();
    } catch (e) {
      toast(e instanceof Error ? e.message : "删除失败", "error");
    }
  }

  return (
    <div className="flex items-center gap-2">
      {/* 账号选择下拉 */}
      <div className="relative">
        <button
          onClick={() => setMenuOpen((v) => !v)}
          className="flex items-center gap-2 rounded-lg border border-hme-border bg-hme-card px-3 py-2 text-sm font-medium hover:bg-black/[0.03]"
        >
          <span className="text-hme-muted">账号:</span>
          {current && <CookieDot status={current.cookieStatus} />}
          <span>{current?.name ?? "未选择"}</span>
          <ChevronDown size={14} className="text-hme-muted" />
        </button>
        {menuOpen && (
          <>
            <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
            <div className="absolute right-0 z-20 mt-1 min-w-[220px] rounded-lg border border-hme-border bg-hme-card py-1 shadow-lg">
              {accounts.map((a) => (
                <button
                  key={a.id}
                  onClick={() => {
                    onSelect(a.id);
                    setMenuOpen(false);
                  }}
                  className={`flex w-full items-center justify-between px-3 py-2 text-sm hover:bg-black/[0.03] ${
                    a.id === currentId ? "text-hme-primary" : "text-hme-text"
                  }`}
                >
                  <span className="flex items-center gap-1.5">
                    <CookieDot status={a.cookieStatus} />
                    {a.name}
                    {a.hasImapPassword && (
                      <Mail size={12} className="text-hme-primary" />
                    )}
                  </span>
                  <span className="text-xs text-hme-muted">{a.domain}</span>
                </button>
              ))}
              {accounts.length === 0 && (
                <div className="px-3 py-2 text-xs text-hme-muted">尚无账号</div>
              )}
              <div className="my-1 border-t border-hme-border" />
              <button
                onClick={() => {
                  setMenuOpen(false);
                  setOpen(true);
                }}
                className="flex w-full items-center gap-2 px-3 py-2 text-sm text-hme-primary hover:bg-black/[0.03]"
              >
                <Plus size={14} /> 添加账号
              </button>
            </div>
          </>
        )}
      </div>

      {/* 管理按钮 */}
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setEditing(current)}
        disabled={!current}
        title="账号设置（Cookie / IMAP / 删除）"
        icon={<RefreshCw size={14} />}
      >
        账号设置
      </Button>

      {/* 添加账号 Modal */}
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="添加 iCloud 账号"
        width="max-w-lg"
        footer={
          <>
            <Button variant="ghost" size="sm" onClick={() => setOpen(false)} disabled={saving}>
              取消
            </Button>
            <Button size="sm" onClick={handleCreate} loading={saving}>
              保存
            </Button>
          </>
        }
      >
        <AddAccountForm form={form} onChange={setForm} />
      </Modal>

      {/* 账号设置 Modal（Cookie / IMAP / 删除） */}
      <ManageModal
        account={editing}
        onClose={() => setEditing(null)}
        onChanged={onChanged}
        onDelete={handleDelete}
      />
    </div>
  );
}

function AddAccountForm({
  form,
  onChange,
}: {
  form: {
    name: string;
    domain: "icloud.com" | "icloud.com.cn";
    cookie: string;
    imapUsername: string;
    imapAppPassword: string;
  };
  onChange: (v: typeof form) => void;
}) {
  const set = <K extends keyof typeof form>(key: K, val: (typeof form)[K]) =>
    onChange({ ...form, [key]: val });

  return (
    <div className="space-y-4">
      <div>
        <label className="mb-1.5 block text-xs font-medium text-hme-muted">
          账号名称（自定义，便于区分）
        </label>
        <input
          value={form.name}
          onChange={(e) => set("name", e.target.value)}
          placeholder="例如：工作账号、主账号"
          className="w-full rounded-lg border border-hme-border bg-white px-3 py-2 text-sm outline-none focus:border-hme-primary"
        />
      </div>

      <div>
        <label className="mb-1.5 block text-xs font-medium text-hme-muted">区域</label>
        <div className="flex gap-2">
          {(["icloud.com", "icloud.com.cn"] as const).map((d) => (
            <button
              key={d}
              onClick={() => set("domain", d)}
              className={`flex-1 rounded-lg border px-3 py-2 text-sm ${
                form.domain === d
                  ? "border-hme-primary bg-hme-primary/10 text-hme-primary"
                  : "border-hme-border bg-white text-hme-muted hover:bg-black/[0.03]"
              }`}
            >
              {d === "icloud.com" ? "国际区" : "中国大陆"}
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className="mb-1.5 block text-xs font-medium text-hme-muted">HME Cookie</label>
        <textarea
          value={form.cookie}
          onChange={(e) => set("cookie", e.target.value)}
          placeholder="浏览器登录 icloud.com 后，F12 → Network → 任一请求 → Request Headers → 复制整行 cookie 值"
          rows={4}
          className="w-full resize-none rounded-lg border border-hme-border bg-white px-3 py-2 font-mono text-xs outline-none focus:border-hme-primary"
        />
      </div>

      <ImapConfigSection
        title="IMAP 邮件读取（可选，用于收件箱和验证码提取）"
        username={form.imapUsername}
        password={form.imapAppPassword}
        onUsername={(v) => set("imapUsername", v)}
        onPassword={(v) => set("imapAppPassword", v)}
      />
    </div>
  );
}

/** IMAP 配置区块（添加/编辑共用） */
function ImapConfigSection({
  title,
  username,
  password,
  onUsername,
  onPassword,
  showStatus,
  status,
}: {
  title: string;
  username: string;
  password: string;
  onUsername: (v: string) => void;
  onPassword: (v: string) => void;
  showStatus?: boolean;
  status?: string;
}) {
  return (
    <div className="rounded-lg border border-hme-border bg-hme-bg/50 p-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs font-medium text-hme-text">{title}</span>
        {showStatus && (
          <span
            className={`text-[10px] font-medium ${
              status ? "text-hme-primary" : "text-hme-muted"
            }`}
          >
            {status ? "已配置" : "未配置"}
          </span>
        )}
      </div>
      <div className="space-y-2">
        <input
          value={username}
          onChange={(e) => onUsername(e.target.value)}
          placeholder="IMAP 主邮箱地址（如 you@icloud.com）"
          className="w-full rounded-lg border border-hme-border bg-white px-3 py-2 text-sm outline-none focus:border-hme-primary"
        />
        <input
          type="password"
          value={password}
          onChange={(e) => onPassword(e.target.value)}
          placeholder="应用专用密码（appleid.apple.com 生成）"
          className="w-full rounded-lg border border-hme-border bg-white px-3 py-2 text-sm outline-none focus:border-hme-primary"
        />
      </div>
      <p className="mt-2 text-[11px] leading-relaxed text-hme-muted">
        隐藏别名收到的邮件进入主收件箱。IMAP 登录需用<strong>主邮箱地址</strong>+
        <strong>应用专用密码</strong>（非 Apple ID 密码）。开启两步验证后在
        appleid.apple.com → 登录与安全 → 应用专用密码 生成。
      </p>
    </div>
  );
}

function ManageModal({
  account,
  onClose,
  onChanged,
  onDelete,
}: {
  account: AccountPublic | null;
  onClose: () => void;
  onChanged: () => void;
  onDelete: (id: number) => void;
}) {
  const { toast } = useToast();
  const [saving, setSaving] = useState<"cookie" | "imap" | null>(null);
  const [cookie, setCookie] = useState("");
  const [imapUser, setImapUser] = useState("");
  const [imapPass, setImapPass] = useState("");

  // 每次打开（切换账号）时重置表单
  useEffect(() => {
    if (account) {
      setCookie("");
      setImapUser(account.imapUsername ?? "");
      setImapPass("");
    }
  }, [account]);

  if (!account) return null;

  async function saveCookie() {
    if (!account) return;
    if (!cookie.trim()) {
      toast("Cookie 不能为空", "error");
      return;
    }
    setSaving("cookie");
    try {
      await apiFetch(`/api/accounts/${account.id}`, {
        method: "PATCH",
        body: JSON.stringify({ cookie: cookie.trim() }),
      });
      toast("Cookie 已更新");
      setCookie("");
      onChanged();
    } catch (e) {
      toast(e instanceof Error ? e.message : "更新失败", "error");
    } finally {
      setSaving(null);
    }
  }

  async function saveImap() {
    if (!account) return;
    if (!imapUser.trim() || !imapPass.trim()) {
      toast("IMAP 主邮箱和应用专用密码都需填写", "error");
      return;
    }
    setSaving("imap");
    try {
      await apiFetch(`/api/accounts/${account.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          imapUsername: imapUser.trim(),
          imapAppPassword: imapPass.trim(),
        }),
      });
      toast("IMAP 配置已更新");
      setImapPass("");
      onChanged();
    } catch (e) {
      toast(e instanceof Error ? e.message : "更新失败", "error");
    } finally {
      setSaving(null);
    }
  }

  async function clearImap() {
    if (!account) return;
    if (!confirm("清除 IMAP 配置？将无法使用收件箱和验证码功能。")) return;
    setSaving("imap");
    try {
      await apiFetch(`/api/accounts/${account.id}`, {
        method: "PATCH",
        body: JSON.stringify({ imapUsername: null }),
      });
      toast("IMAP 配置已清除");
      onChanged();
    } catch (e) {
      toast(e instanceof Error ? e.message : "清除失败", "error");
    } finally {
      setSaving(null);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={`账号设置 · ${account.name}`}
      width="max-w-lg"
      footer={
        <>
          <Button
            variant="danger"
            size="sm"
            icon={<Trash2 size={14} />}
            onClick={() => onDelete(account.id)}
          >
            删除账号
          </Button>
          <div className="flex-1" />
          <Button variant="ghost" size="sm" onClick={onClose}>
            关闭
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        {/* Cookie 失效告警 */}
        {account.cookieStatus === "invalid" && (
          <div className="flex items-start gap-2 rounded-lg border border-hme-danger/30 bg-hme-danger-bg px-3 py-2.5 text-xs text-hme-danger">
            <AlertTriangle size={14} className="mt-0.5 shrink-0" />
            <div>
              <div className="font-medium">Cookie 已失效，请在下方重新粘贴更新。</div>
              {account.lastError && (
                <div className="mt-0.5 text-hme-danger/80">原因：{account.lastError}</div>
              )}
            </div>
          </div>
        )}

        {/* 基本信息 */}
        <div className="rounded-lg bg-hme-bg px-3 py-2 text-xs text-hme-muted">
          <div>区域：{account.domain}</div>
          <div className="mt-1">
            Cookie 状态：
            {account.cookieStatus === "ok"
              ? `正常${account.lastValidatedAt ? `（校验于 ${new Date(account.lastValidatedAt).toLocaleString()}）` : ""}`
              : account.cookieStatus === "invalid"
                ? "已失效"
                : "未知（尚未校验）"}
          </div>
          <div className="mt-1">
            API base 缓存：
            {account.cachedApiBase ? (
              <span className="font-mono">{account.cachedApiBase}</span>
            ) : (
              "无（首次请求时自动发现）"
            )}
          </div>
        </div>

        {/* Cookie 更新 */}
        <div>
          <label className="mb-1.5 block text-xs font-medium text-hme-muted">
            更新 HME Cookie（凭证失效时）
          </label>
          <textarea
            value={cookie}
            onChange={(e) => setCookie(e.target.value)}
            placeholder="从 icloud.com 重新复制整行 cookie"
            rows={3}
            className="mb-2 w-full resize-none rounded-lg border border-hme-border bg-white px-3 py-2 font-mono text-xs outline-none focus:border-hme-primary"
          />
          <Button size="sm" onClick={saveCookie} loading={saving === "cookie"} disabled={!cookie.trim()}>
            保存 Cookie
          </Button>
        </div>

        <div className="border-t border-hme-border" />

        {/* IMAP 配置 */}
        <ImapConfigSection
          title="IMAP 邮件读取"
          username={imapUser}
          password={imapPass}
          onUsername={setImapUser}
          onPassword={setImapPass}
          showStatus
          status={account.hasImapPassword ? account.imapUsername ?? "" : ""}
        />
        <div className="flex gap-2">
          <Button size="sm" onClick={saveImap} loading={saving === "imap"} disabled={!imapUser.trim() || !imapPass.trim()}>
            保存 IMAP 配置
          </Button>
          {account.hasImapPassword && (
            <Button variant="ghost" size="sm" onClick={clearImap} disabled={saving !== null}>
              清除 IMAP
            </Button>
          )}
        </div>
      </div>
    </Modal>
  );
}
