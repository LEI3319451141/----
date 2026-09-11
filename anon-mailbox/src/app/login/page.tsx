"use client";

import { useState } from "react";
import { apiFetch, homePathForRole } from "@/lib/client-api";

interface LoginResponse {
  needsPasswordSetup?: boolean;
  loginId?: string;
  user?: {
    id: number;
    loginId: string;
    realName: string;
    role: "super_admin" | "counselor" | "teacher" | "cadre" | "student";
  };
}

export default function LoginPage() {
  const [loginId, setLoginId] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // 设置密码视图
  const [setupMode, setSetupMode] = useState(false);
  const [setupLoginId, setSetupLoginId] = useState("");
  const [newPwd, setNewPwd] = useState("");
  const [confirmPwd, setConfirmPwd] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await apiFetch<LoginResponse>("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ loginId: loginId.trim(), password }),
      });
      if (res.needsPasswordSetup && res.loginId) {
        // 白名单账号尚未设置密码 → 进入设置密码视图
        setSetupLoginId(res.loginId);
        setSetupMode(true);
        setNewPwd("");
        setConfirmPwd("");
        return;
      }
      if (res.user) {
        window.location.href = homePathForRole(res.user.role);
        return;
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "登录失败");
    } finally {
      setLoading(false);
    }
  }

  async function submitSetup(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (newPwd.length < 6) {
      setError("密码至少 6 位");
      return;
    }
    if (newPwd !== confirmPwd) {
      setError("两次输入的密码不一致");
      return;
    }
    setLoading(true);
    try {
      const res = await apiFetch<LoginResponse>("/api/auth/set-password", {
        method: "POST",
        body: JSON.stringify({ loginId: setupLoginId, password: newPwd }),
      });
      if (res.user) {
        window.location.href = homePathForRole(res.user.role);
        return;
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "设置失败");
    } finally {
      setLoading(false);
    }
  }

  if (setupMode) {
    return (
      <div className="min-h-screen flex items-center justify-center px-5">
        <div className="card p-9 w-full max-w-md fade-in">
          <div className="text-center mb-8">
            <div className="text-4xl mb-3">🔐</div>
            <h1 className="text-2xl font-semibold tracking-tight">设置密码</h1>
            <p className="text-sm text-[var(--color-ink-2)] mt-2 break-all">
              账号：{setupLoginId}
              <br />
              你是首次登录，请先设置登录密码。
            </p>
          </div>
          <form onSubmit={submitSetup} className="space-y-4">
            <div>
              <label className="label">新密码</label>
              <input
                type="password"
                className="input"
                placeholder="至少 6 位"
                value={newPwd}
                onChange={(e) => setNewPwd(e.target.value)}
                autoFocus
                autoComplete="new-password"
              />
            </div>
            <div>
              <label className="label">确认密码</label>
              <input
                type="password"
                className="input"
                placeholder="再输入一次"
                value={confirmPwd}
                onChange={(e) => setConfirmPwd(e.target.value)}
                autoComplete="new-password"
              />
            </div>
            {error && (
              <p className="text-sm text-[var(--color-danger)]">{error}</p>
            )}
            <button
              type="submit"
              className="btn btn-primary w-full"
              disabled={loading}
            >
              {loading ? "设置中…" : "确认设置并登录"}
            </button>
            <button
              type="button"
              className="btn btn-ghost w-full"
              onClick={() => {
                setSetupMode(false);
                setError("");
                setLoginId(setupLoginId);
                setPassword("");
              }}
            >
              返回登录
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-5">
      <div className="card p-9 w-full max-w-md fade-in">
        <div className="text-center mb-8">
          <div className="text-4xl mb-3">✉️</div>
          <h1 className="text-2xl font-semibold tracking-tight">匿名建议信箱</h1>
          <p className="text-sm text-[var(--color-ink-2)] mt-2">
            身份保密，畅所欲言。请使用账号登录。
          </p>
        </div>
        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="label">账号</label>
            <input
              className="input"
              placeholder="请输入账号"
              value={loginId}
              onChange={(e) => setLoginId(e.target.value)}
              autoFocus
              autoComplete="username"
            />
          </div>
          <div>
            <label className="label">密码</label>
            <input
              type="password"
              className="input"
              placeholder="请输入密码"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
            />
          </div>
          {error && (
            <p className="text-sm text-[var(--color-danger)]">{error}</p>
          )}
          <button
            type="submit"
            className="btn btn-primary w-full"
            disabled={loading}
          >
            {loading ? "登录中…" : "登 录"}
          </button>
        </form>
        <p className="text-xs text-[var(--color-ink-2)] text-center mt-6 leading-relaxed">
          系统不开放注册，账号由管理员统一导入。
          <br />
          未在名单内的账号无法登录；首次登录需自行设置密码。
        </p>
      </div>
    </div>
  );
}
