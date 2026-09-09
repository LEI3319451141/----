"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  apiFetch,
  fetchMe,
  homePathForRole,
  type MeResponse,
} from "@/lib/client-api";
import { TopNav } from "@/components/TopNav";
import { PasswordModal } from "@/components/PasswordModal";

type Visibility = "public" | "group" | "person";

interface Meta {
  myClass: { id: number; name: string };
  groupOptions: { value: string; label: string }[];
  categories: { id: number; name: string }[];
}

interface StaffMember {
  id: number;
  name: string;
  role: string;
  roleLabel: string;
  title: string | null;
}

interface MySuggestion {
  id: number;
  audienceLabel: string;
  categoryName: string | null;
  content: string;
  status: string;
  timeDisplay: string;
}

export default function SubmitPage() {
  const router = useRouter();
  const [me, setMe] = useState<MeResponse | null>(null);
  const [meta, setMeta] = useState<Meta | null>(null);
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [needReset, setNeedReset] = useState(false);
  const [loadError, setLoadError] = useState("");

  const [visibility, setVisibility] = useState<Visibility>("public");
  const [targetGroups, setTargetGroups] = useState<string[]>([]);
  const [targetUserId, setTargetUserId] = useState<number | null>(null);
  const [categoryId, setCategoryId] = useState<number | null>(null);
  const [content, setContent] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [successLabel, setSuccessLabel] = useState<string | null>(null);

  const [history, setHistory] = useState<MySuggestion[]>([]);

  const loadHistory = useCallback(async () => {
    try {
      const res = await apiFetch<{ items: MySuggestion[] }>(
        "/api/my/suggestions"
      );
      setHistory(res.items ?? []);
    } catch {
      /* 忽略历史加载失败 */
    }
  }, []);

  useEffect(() => {
    (async () => {
      const data = await fetchMe();
      if (!data) {
        router.replace("/login");
        return;
      }
      if (!data.studentClass) {
        // 无学籍的接收端账号（辅导员/教师）不能提交
        router.replace(homePathForRole(data.user.role));
        return;
      }
      setMe(data);
      setNeedReset(data.user.mustResetPassword);
      try {
        const [m, dir] = await Promise.all([
          apiFetch<Meta>("/api/student/meta"),
          apiFetch<{ items: StaffMember[] }>("/api/staff/directory"),
        ]);
        setMeta(m);
        setStaff(dir.items ?? []);
        if (m.categories.length > 0) setCategoryId(m.categories[0].id);
      } catch (err) {
        setLoadError(err instanceof Error ? err.message : "加载失败");
      }
      loadHistory();
    })();
  }, [router, loadHistory]);

  function toggleGroup(value: string) {
    setTargetGroups((prev) =>
      prev.includes(value)
        ? prev.filter((g) => g !== value)
        : [...prev, value]
    );
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (content.trim().length < 5) {
      setError("建议内容至少 5 个字");
      return;
    }
    if (visibility === "group" && targetGroups.length === 0) {
      setError("请至少勾选一个可见群体");
      return;
    }
    if (visibility === "person" && !targetUserId) {
      setError("请选择指定接收人");
      return;
    }
    setSubmitting(true);
    try {
      const res = await apiFetch<{ anonymousLabel: string }>(
        "/api/suggestions",
        {
          method: "POST",
          body: JSON.stringify({
            visibility,
            targetGroups: visibility === "group" ? targetGroups : undefined,
            targetUserId: visibility === "person" ? targetUserId : undefined,
            categoryId,
            content: content.trim(),
          }),
        }
      );
      setSuccessLabel(res.anonymousLabel);
      setContent("");
      setTargetGroups([]);
      setTargetUserId(null);
      loadHistory();
    } catch (err) {
      setError(err instanceof Error ? err.message : "提交失败");
    } finally {
      setSubmitting(false);
    }
  }

  if (!me) {
    return (
      <div className="min-h-screen flex items-center justify-center text-[var(--color-ink-2)]">
        加载中…
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      {needReset && (
        <PasswordModal
          onDone={() => {
            setNeedReset(false);
          }}
        />
      )}
      <TopNav
        user={me.user}
        links={[
          { href: "/submit", label: "提交建议" },
          { href: "/inbox", label: "建议信箱" },
        ]}
      />

      <main className="max-w-3xl mx-auto px-5 py-10">
        {successLabel ? (
          <div className="card p-10 text-center fade-in">
            <div className="text-5xl mb-4">🔒</div>
            <h2 className="text-xl font-semibold mb-2">建议已匿名提交</h2>
            <p className="text-[var(--color-ink-2)] text-sm leading-relaxed">
              你的身份信息已完全保密，接收端只会看到
              <span className="chip chip-purple mx-1">{successLabel}</span>
              这样的脱敏标识，无法追溯到你本人。
            </p>
            <button
              className="btn btn-primary mt-7"
              onClick={() => setSuccessLabel(null)}
            >
              再提一条
            </button>
          </div>
        ) : (
          <div className="card p-7 sm:p-9 fade-in">
            <h1 className="text-2xl font-semibold tracking-tight">
              提交匿名建议
            </h1>
            <p className="text-sm text-[var(--color-ink-2)] mt-1.5">
              当前班级：<b>{meta?.myClass.name ?? "…"}</b>
              。你的姓名与学号不会出现在任何接收端页面。
            </p>

            <form onSubmit={submit} className="mt-7 space-y-6">
              {/* 可见性 */}
              <div>
                <label className="label">这条建议谁可以看到？</label>
                <div className="segmented">
                  <button
                    type="button"
                    className={visibility === "public" ? "active" : ""}
                    onClick={() => setVisibility("public")}
                  >
                    公开
                  </button>
                  <button
                    type="button"
                    className={visibility === "group" ? "active" : ""}
                    onClick={() => setVisibility("group")}
                  >
                    指定群体
                  </button>
                  <button
                    type="button"
                    className={visibility === "person" ? "active" : ""}
                    onClick={() => setVisibility("person")}
                  >
                    指定专人
                  </button>
                </div>

                {visibility === "public" && (
                  <p className="text-xs text-[var(--color-ink-2)] mt-2">
                    公开建议：本班所有同学和接收端均可查阅，内容请避免包含可识别个人的信息。
                  </p>
                )}

                {visibility === "group" && (
                  <div className="mt-3 space-y-2">
                    <div className="flex gap-2 flex-wrap">
                      {(meta?.groupOptions ?? []).map((g) => (
                        <button
                          type="button"
                          key={g.value}
                          onClick={() => toggleGroup(g.value)}
                          className={`chip cursor-pointer transition-all ${
                            targetGroups.includes(g.value)
                              ? "chip-purple ring-2 ring-[var(--color-accent)]/40"
                              : "opacity-60 hover:opacity-100"
                          }`}
                        >
                          {targetGroups.includes(g.value) ? "✓ " : ""}
                          {g.label}
                        </button>
                      ))}
                    </div>
                    <p className="text-xs text-[var(--color-ink-2)]">
                      仅被勾选群体的成员能看到这条建议，其他同学与接收端均不可见，可多选。
                    </p>
                  </div>
                )}

                {visibility === "person" && (
                  <div className="mt-3 space-y-2">
                    <select
                      className="select"
                      value={targetUserId ?? ""}
                      onChange={(e) =>
                        setTargetUserId(
                          e.target.value ? Number(e.target.value) : null
                        )
                      }
                    >
                      <option value="">请选择一位接收人…</option>
                      {staff.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}（{s.title ?? s.roleLabel}）
                        </option>
                      ))}
                    </select>
                    <p className="text-xs text-[var(--color-ink-2)]">
                      该建议仅这位接收人本人可见，其他任何人（包括其他老师、班干部、管理员）都无法查看。
                    </p>
                  </div>
                )}
              </div>

              <div>
                <label className="label">建议分类</label>
                <select
                  className="select"
                  value={categoryId ?? ""}
                  onChange={(e) =>
                    setCategoryId(e.target.value ? Number(e.target.value) : null)
                  }
                >
                  {meta?.categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="label">建议内容</label>
                <textarea
                  className="textarea"
                  placeholder="请客观、具体地描述你的建议或反映的问题……（5–2000 字）"
                  value={content}
                  maxLength={2000}
                  onChange={(e) => setContent(e.target.value)}
                />
                <div className="text-right text-xs text-[var(--color-ink-2)] mt-1">
                  {content.length} / 2000
                </div>
              </div>

              {error && (
                <p className="text-sm text-[var(--color-danger)]">{error}</p>
              )}
              {loadError && (
                <p className="text-sm text-[var(--color-danger)]">
                  {loadError}
                </p>
              )}

              <button
                type="submit"
                className="btn btn-primary w-full"
                disabled={submitting}
              >
                {submitting ? "提交中…" : "匿名提交"}
              </button>
            </form>
          </div>
        )}

        {history.length > 0 && (
          <div className="mt-8">
            <h2 className="text-base font-semibold text-[var(--color-ink-2)] mb-3 px-1">
              我的历史提交
            </h2>
            <div className="space-y-3">
              {history.map((s) => (
                <div key={s.id} className="card p-5 fade-in">
                  <div className="flex items-center gap-2 flex-wrap mb-2">
                    <span className="chip chip-purple">{s.audienceLabel}</span>
                    {s.categoryName && <span className="chip">{s.categoryName}</span>}
                    <span
                      className={`chip ${s.status === "processed" ? "chip-green" : "chip-orange"}`}
                    >
                      {s.status === "processed" ? "已处理" : "待处理"}
                    </span>
                    <span className="text-xs text-[var(--color-ink-2)] ml-auto">
                      {s.timeDisplay}
                    </span>
                  </div>
                  <p className="text-sm leading-relaxed whitespace-pre-wrap text-[var(--color-ink)]">
                    {s.content}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
