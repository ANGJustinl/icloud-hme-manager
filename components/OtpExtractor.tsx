"use client";

import { useEffect, useRef, useState } from "react";
import { KeyRound, Loader2, RefreshCw, Search } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { useToast, useCopyToClipboard } from "@/components/ui/Toast";
import {
  apiFetch,
  type HmeEmail,
  type OtpExtract,
  type OtpExtractResponse,
  type OtpExtractStats,
} from "@/lib/client/types";

interface OtpExtractorProps {
  accountId: number;
  emails: HmeEmail[];
  /** 是否激活（未激活时停止轮询） */
  active: boolean;
}

/**
 * 验证码提取器（图2 功能）。
 *
 * 工作流：
 *  1. 选择一个隐藏别名（下拉，从 HME 列表来）
 *  2. 点「提取」或开启「自动监听」→ 轮询 /api/otp/extract
 *  3. 命中后大字显示验证码 + 一键复制
 *
 * 定时监听用 setInterval 短连接轮询（IMAP IDLE 在 serverless 不可行）。
 */
export function OtpExtractor({ accountId, emails, active }: OtpExtractorProps) {
  const { toast } = useToast();
  const copy = useCopyToClipboard();

  const [selectedAlias, setSelectedAlias] = useState<string>("");
  const [otp, setOtp] = useState<OtpExtract | null>(null);
  const [loading, setLoading] = useState(false);
  const [autoWatch, setAutoWatch] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<number | null>(null);
  const [scannedCount, setScannedCount] = useState(0);
  const [stats, setStats] = useState<OtpExtractStats | null>(null);
  const lastCodeRef = useRef<string | null>(null);

  // 默认选中第一个别名
  useEffect(() => {
    if (!selectedAlias && emails.length > 0) {
      setSelectedAlias(emails[0].hme);
    }
  }, [emails, selectedAlias]);

  async function extract(silent = false) {
    if (!selectedAlias) {
      if (!silent) toast("请先选择一个隐藏别名", "info");
      return;
    }
    if (!silent) setLoading(true);
    try {
      // 监听模式取最近 20 封，手动提取取最近 30 封。
      const limit = silent ? 20 : 30;
      const r = await apiFetch<OtpExtractResponse>(
        `/api/otp/extract?accountId=${accountId}&alias=${encodeURIComponent(selectedAlias)}&limit=${limit}`,
      );
      setLastUpdate(Date.now());
      setScannedCount(r.latest.length);
      setStats(r.stats);
      if (r.otp) {
        setOtp(r.otp);
        // 新验证码（与上次不同）才弹 toast
        if (r.otp.code !== lastCodeRef.current) {
          lastCodeRef.current = r.otp.code;
          await copy(r.otp.code, `已提取并复制验证码: ${r.otp.code}`);
          // 命中后停止监听：已拿到验证码，无需继续打 iCloud
          setAutoWatch(false);
        }
      } else if (!silent) {
        setOtp(null);
      }
    } catch (e) {
      if (!silent) toast(e instanceof Error ? e.message : "提取失败", "error");
      else if (autoWatch) {
        // 自动监听出错则停止
        setAutoWatch(false);
        toast("监听已停止：" + (e instanceof Error ? e.message : "出错"), "error");
      }
    } finally {
      if (!silent) setLoading(false);
    }
  }

  // 自动监听轮询
  useEffect(() => {
    if (!autoWatch || !active || !selectedAlias) return;
    // 立即跑一次
    extract(true);
    const timer = setInterval(() => extract(true), 5000); // 每 5 秒
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoWatch, active, selectedAlias, accountId]);

  return (
    <div className="rounded-xl border border-hme-border bg-hme-card p-5">
      <div className="mb-4 flex items-center gap-2">
        <KeyRound size={16} className="text-hme-primary" />
        <h2 className="text-sm font-semibold text-hme-text">验证码提取器</h2>
        {lastUpdate && (
          <span className="ml-auto text-[11px] text-hme-muted">
            扫描了 {scannedCount} 封 · 更新于{" "}
            {new Date(lastUpdate).toLocaleTimeString()}
          </span>
        )}
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <div className="flex-1">
          <label className="mb-1.5 block text-xs font-medium text-hme-muted">
            监听的隐藏别名
          </label>
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-hme-muted" />
            <select
              value={selectedAlias}
              onChange={(e) => {
                setSelectedAlias(e.target.value);
                setOtp(null);
                setStats(null);
                lastCodeRef.current = null;
              }}
              className="w-full appearance-none rounded-lg border border-hme-border bg-white py-2 pl-9 pr-3 text-sm outline-none focus:border-hme-primary"
            >
              {emails.length === 0 && <option value="">尚无别名</option>}
              {emails.map((e) => (
                <option key={e.anonymousId} value={e.hme}>
                  {e.label} — {e.hme}
                </option>
              ))}
            </select>
          </div>
        </div>

        <Button onClick={() => extract()} loading={loading} disabled={!selectedAlias}>
          <Search size={14} /> 立即提取
        </Button>

        <label className="flex cursor-pointer items-center gap-2 text-sm text-hme-text">
          <button
            type="button"
            onClick={() => setAutoWatch((v) => !v)}
            className={`relative h-5 w-9 rounded-full transition-colors ${
              autoWatch ? "bg-hme-primary" : "bg-hme-border"
            }`}
          >
            <span
              className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${
                autoWatch ? "translate-x-4" : "translate-x-0.5"
              }`}
            />
          </button>
          自动监听（5秒/次）
        </label>
      </div>

      {/* 验证码展示区 */}
      {stats && (
        <div className="mt-4 rounded-lg border border-hme-border bg-hme-bg/60 px-3 py-2 text-xs text-hme-muted">
          扫描 {stats.searched} 封 · 严格匹配别名 {stats.matchedAlias} 封 · 跳过{" "}
          {stats.skippedByAlias} 封 · 解析 {stats.parsed} 封
        </div>
      )}

      <div className="mt-5">
        {otp ? (
          <div className="rounded-lg border-2 border-hme-primary/30 bg-hme-primary/5 p-6 text-center">
            <div className="text-xs font-medium text-hme-muted">最新验证码</div>
            <div className="my-2 font-mono text-4xl font-bold tracking-[0.3em] text-hme-primary">
              {otp.code}
            </div>
            <div className="text-xs text-hme-muted">
              来自「{otp.subject}」（{otp.rule}）· 已自动复制
            </div>
            <div className="mt-3 flex justify-center gap-2">
              <Button
                size="sm"
                variant="ghost"
                onClick={() => copy(otp.code, `已复制: ${otp.code}`)}
              >
                再次复制
              </Button>
              <Button size="sm" variant="ghost" onClick={() => extract()} loading={loading}>
                <RefreshCw size={14} /> 重新提取
              </Button>
            </div>
          </div>
        ) : (
          <div className="rounded-lg border border-dashed border-hme-border bg-hme-bg/50">
            {loading ? (
              <EmptyState
                icon={<Loader2 size={28} className="hme-spin" />}
                title="正在扫描最新邮件..."
                description={`从 ${selectedAlias || "选中别名"} 的最近邮件中提取验证码`}
              />
            ) : (
              <EmptyState
                icon={<KeyRound size={32} />}
                title="尚未提取到验证码"
                description="选择别名后点击「立即提取」，或开启「自动监听」在注册账号时自动捕获验证码"
              />
            )}
          </div>
        )}
      </div>
    </div>
  );
}
