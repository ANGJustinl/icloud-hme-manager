"use client";

import { CheckCircle2, Info, TriangleAlert, X } from "lucide-react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

type ToastType = "success" | "error" | "info";

interface Toast {
  id: number;
  type: ToastType;
  message: string;
}

interface ToastCtx {
  toast: (message: string, type?: ToastType) => void;
}

const Ctx = createContext<ToastCtx | null>(null);

export function useToast(): ToastCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error("useToast 必须在 ToastProvider 内使用");
  return c;
}

const ICONS: Record<ToastType, ReactNode> = {
  success: <CheckCircle2 size={16} className="text-hme-primary" />,
  error: <TriangleAlert size={16} className="text-hme-danger" />,
  info: <Info size={16} className="text-hme-muted" />,
};

const BORDER: Record<ToastType, string> = {
  success: "border-l-hme-primary",
  error: "border-l-hme-danger",
  info: "border-l-hme-muted",
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const toast = useCallback((message: string, type: ToastType = "success") => {
    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev, { id, type, message }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3200);
  }, []);

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return (
    <Ctx.Provider value={{ toast }}>
      {children}
      <div className="fixed top-5 right-5 z-[9999] flex flex-col gap-2.5 pointer-events-none">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`hme-toast-in pointer-events-auto flex items-center gap-2 rounded-lg border-l-[3px] ${BORDER[t.type]} bg-hme-card px-4 py-3 text-sm shadow-[0_4px_16px_rgba(0,0,0,0.12)]`}
          >
            {ICONS[t.type]}
            <span className="leading-snug">{t.message}</span>
            <button
              onClick={() => dismiss(t.id)}
              className="ml-2 text-hme-muted hover:text-hme-text"
              aria-label="关闭"
            >
              <X size={14} />
            </button>
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}

/** 便捷的剪贴板复制 hook（带 toast 反馈） */
export function useCopyToClipboard() {
  const { toast } = useToast();
  const [supported, setSupported] = useState(true);
  useEffect(() => {
    setSupported(
      typeof navigator !== "undefined" && Boolean(navigator.clipboard),
    );
  }, []);
  return useCallback(
    async (text: string, hint?: string) => {
      try {
        if (supported) {
          await navigator.clipboard.writeText(text);
        } else {
          // 回退：textarea + execCommand
          const ta = document.createElement("textarea");
          ta.value = text;
          document.body.appendChild(ta);
          ta.select();
          document.execCommand("copy");
          document.body.removeChild(ta);
        }
        toast(hint ?? `已复制: ${text}`);
      } catch {
        toast("复制失败，请手动复制", "error");
      }
    },
    [toast, supported],
  );
}
