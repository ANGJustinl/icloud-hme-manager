"use client";

import { useEffect, useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { apiFetch } from "@/lib/client/types";
import { useToast } from "@/components/ui/Toast";

interface EditLabelModalProps {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  accountId: number;
  anonymousId: string;
  initialLabel: string;
  initialNote: string;
  email: string;
}

export function EditLabelModal({
  open,
  onClose,
  onSaved,
  accountId,
  anonymousId,
  initialLabel,
  initialNote,
  email,
}: EditLabelModalProps) {
  const [label, setLabel] = useState(initialLabel);
  const [note, setNote] = useState(initialNote);
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  // 打开时重置表单
  useEffect(() => {
    if (open) {
      setLabel(initialLabel);
      setNote(initialNote);
    }
  }, [open, initialLabel, initialNote]);

  async function handleSave() {
    setSaving(true);
    try {
      await apiFetch("/api/hme/update", {
        method: "POST",
        body: JSON.stringify({
          accountId,
          anonymousId,
          label: label.trim(),
          note: note.trim(),
        }),
      });
      toast("已更新标签和备注");
      onSaved();
      onClose();
    } catch (e) {
      toast(e instanceof Error ? e.message : "更新失败", "error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="编辑标签和备注"
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={onClose} disabled={saving}>
            取消
          </Button>
          <Button size="sm" onClick={handleSave} loading={saving}>
            保存
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div>
          <label className="mb-1.5 block text-xs font-medium text-hme-muted">
            邮箱地址（不可编辑）
          </label>
          <input
            value={email}
            disabled
            className="w-full rounded-lg border border-hme-border bg-hme-bg px-3 py-2 font-mono text-xs text-hme-muted"
          />
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-medium text-hme-muted">
            标签
          </label>
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="例如：淘宝、Newsletter"
            maxLength={64}
            className="w-full rounded-lg border border-hme-border bg-white px-3 py-2 text-sm outline-none focus:border-hme-primary"
          />
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-medium text-hme-muted">
            备注
          </label>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="可选"
            rows={3}
            maxLength={500}
            className="w-full resize-none rounded-lg border border-hme-border bg-white px-3 py-2 text-sm outline-none focus:border-hme-primary"
          />
        </div>
      </div>
    </Modal>
  );
}
