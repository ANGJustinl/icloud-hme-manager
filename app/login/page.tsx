"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Lock } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { apiFetch } from "@/lib/client/types";

export default function LoginPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [needs, setNeeds] = useState<boolean | null>(null);

  // 先探测是否真的需要登录（未设 ACCESS_PASSWORD 时直接跳转）
  useEffect(() => {
    apiFetch<{ authRequired: boolean }>("/api/auth/login")
      .then((r) => {
        setNeeds(r.authRequired);
        if (!r.authRequired) router.replace("/");
      })
      .catch(() => setNeeds(true));
  }, [router]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      await apiFetch("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ password }),
      });
      router.replace("/");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "登录失败");
    } finally {
      setLoading(false);
    }
  }

  if (needs === null) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-hme-muted">
        加载中…
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm rounded-2xl bg-hme-card p-8 shadow-[0_20px_60px_rgba(0,0,0,0.08)]"
      >
        <div className="mb-6 flex flex-col items-center gap-2 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-hme-primary/10 text-hme-primary">
            <Lock size={22} />
          </div>
          <h1 className="text-lg font-semibold text-hme-text">iCloud HME 管理器</h1>
          <p className="text-xs text-hme-muted">请输入访问密码</p>
        </div>

        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="访问密码"
          autoFocus
          className="mb-3 w-full rounded-lg border border-hme-border bg-white px-3 py-2.5 text-sm outline-none focus:border-hme-primary"
        />

        {error && <div className="mb-3 text-xs text-hme-danger">{error}</div>}

        <Button type="submit" className="w-full" loading={loading}>
          登录
        </Button>
      </form>
    </div>
  );
}
