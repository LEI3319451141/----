"use client";

import { useState } from "react";
import { apiFetch } from "@/lib/client-api";

/** 首登强制改密弹窗（不可关闭，完成后才能使用系统） */
export function PasswordModal({ onDone }: { onDone: () => void }) {
  const [oldPassword, setOld] = useState("");
  const [newPassword, setNew] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (newPassword.length < 6) {
      setError("新密码至少 6 位");
      return;
    }
    if (newPassword !== confirm) {
      setError("两次输入的新密码不一致");
      return;
    }
    setLoading(true);
    try {
      await apiFetch("/api/auth/change-password", {
        method: "POST",
        body: JSON.stringify({ oldPassword, newPassword }),
      });
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : "修改失败");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="modal-backdrop">
      <form onSubmit={submit} className="card p-7 w-full max-w-md fade-in">
        <h2 className="text-xl font-semibold mb-1">请先修改密码</h2>
        <p className="text-sm text-[var(--color-ink-2)] mb-6">
          检测到你正在使用初始密码，为了账号安全，请先修改密码。
        </p>
        <div className="space-y-4">
          <div>
            <label className="label">原密码</label>
            <input
              type="password"
              className="input"
              value={oldPassword}
              onChange={(e) => setOld(e.target.value)}
              autoFocus
            />
          </div>
          <div>
            <label className="label">新密码（至少 6 位）</label>
            <input
              type="password"
              className="input"
              value={newPassword}
              onChange={(e) => setNew(e.target.value)}
            />
          </div>
          <div>
            <label className="label">确认新密码</label>
            <input
              type="password"
              className="input"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
            />
          </div>
        </div>
        {error && (
          <p className="text-sm text-[var(--color-danger)] mt-4">{error}</p>
        )}
        <button
          className="btn btn-primary w-full mt-6"
          disabled={loading}
          type="submit"
        >
          {loading ? "提交中…" : "确认修改"}
        </button>
      </form>
    </div>
  );
}
