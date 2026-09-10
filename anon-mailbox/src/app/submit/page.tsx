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
import { CommentPanel } from "@/components/CommentPanel";

type Visibility = "public" | "group" | "person";

interface AnonymousQuota {
  limit: number;
  used: number;
  remaining: number;
  resetAt: string;
}

interface Meta {
  myClass: { id: number; name: string };
  groupOptions: {
    id: number;
    name: string;
    category?: string;
    forceRealName?: boolean;
  }[];
  categories: { id: number; name: string }[];
  anonymousQuota: AnonymousQuota;
}

interface StaffMember {
  id: number;
  name: string;
  titleId: number;
  titleName: string;
  category: string;
  categoryLabel: string;
  forceRealName?: boolean;
}

interface MySuggestion {
  id: number;
  audienceLabel: string;
  categoryName: string | null;
  content: string;
  status: string;
  timeDisplay: string;
  isAnonymous: boolean;
  likeCount: number;
  commentCount: number;
  likedByMe: boolean;
  isMine: boolean;
}

export default function SubmitPage() {
  const router = useRouter();
  const [me, setMe] = useState<MeResponse | null>(null);
  const [meta, setMeta] = useState<Meta | null>(null);
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [needReset, setNeedReset] = useState(false);
  const [loadError, setLoadError] = useState("");

  const [visibility, setVisibility] = useState<Visibility>("public");
  const [targetTitleIds, setTargetTitleIds] = useState<number[]>([]);
  const [targetUserId, setTargetUserId] = useState<number | null>(null);
  const [categoryId, setCategoryId] = useState<number | null>(null);
  const [content, setContent] = useState("");
  // 署名方式：默认匿名；当受众含"要求实名"的接收人时由服务端强制实名
  const [isAnonymous, setIsAnonymous] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [submitResult, setSubmitResult] = useState<{
    anonymousLabel: string;
    isAnonymous: boolean;
  } | null>(null);

  const [history, setHistory] = useState<MySuggestion[]>([]);
  const [openComments, setOpenComments] = useState<number | null>(null);
  const [historyTotal, setHistoryTotal] = useState(0);
  const [historyPage, setHistoryPage] = useState(1);
  const historyPageSize = 20;

  const loadHistory = useCallback(async (page: number = 1, append: boolean = false) => {
    try {
      const res = await apiFetch<{ items: MySuggestion[]; total: number }>(
        `/api/my/suggestions?page=${page}`
      );
      setHistory((prev) => (append ? [...prev, ...(res.items ?? [])] : res.items ?? []));
      setHistoryTotal(res.total ?? 0);
      setHistoryPage(page);
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

  // 当前选择的受众中是否含"要求实名"的接收人（如辅导员谢智）
  const forceRealName =
    visibility === "person"
      ? !!staff.find((s) => s.id === targetUserId)?.forceRealName
      : visibility === "group"
        ? targetTitleIds.some(
            (id) =>
              meta?.groupOptions.find((g) => g.id === id)?.forceRealName === true
          )
        : false;
  const effectiveAnonymous = forceRealName ? false : isAnonymous;

  // 本周匿名配额（无 meta 时给一个宽松占位，不影响渲染；以后端校验为准）
  const quota = meta?.anonymousQuota ?? {
    limit: 7,
    used: 0,
    remaining: 7,
    resetAt: "",
  };
  const anonymousExhausted = quota.remaining <= 0;
  const quotaResetText = quota.resetAt
    ? new Date(quota.resetAt).toLocaleDateString("zh-CN", {
        month: "long",
        day: "numeric",
      })
    : "下周一";

  // 配额用尽且当前未被强制实名时，自动切到实名，避免提交后才被后端拒绝
  useEffect(() => {
    if (anonymousExhausted && !forceRealName && isAnonymous) {
      setIsAnonymous(false);
    }
  }, [anonymousExhausted, forceRealName, isAnonymous]);

  function toggleTitle(id: number) {
    setTargetTitleIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }

  async function toggleHistoryLike(s: MySuggestion) {
    try {
      const res = await apiFetch<{ liked: boolean; likeCount: number }>(
        `/api/suggestions/${s.id}/like`,
        { method: "POST" }
      );
      setHistory((prev) =>
        prev.map((it) =>
          it.id === s.id
            ? { ...it, likedByMe: res.liked, likeCount: res.likeCount }
            : it
        )
      );
    } catch {
      // 静默失败：点赞不阻塞主流程
    }
  }

  async function deleteHistory(s: MySuggestion) {
    if (
      !window.confirm(
        "确定删除这条建议？相关评论和点赞将一并删除，且不可恢复。"
      )
    )
      return;
    try {
      await apiFetch(`/api/suggestions/${s.id}`, { method: "DELETE" });
      setHistory((prev) => prev.filter((it) => it.id !== s.id));
      if (openComments === s.id) setOpenComments(null);
      // 匿名建议删除后返还本周配额，重新拉取
      if (s.isAnonymous) {
        try {
          const m = await apiFetch<Meta>("/api/student/meta");
          setMeta(m);
        } catch {
          /* 配额刷新失败不阻塞删除结果 */
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "删除失败");
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (content.trim().length < 5) {
      setError("建议内容至少 5 个字");
      return;
    }
    if (visibility === "group" && targetTitleIds.length === 0) {
      setError("请至少勾选一个收信职务");
      return;
    }
    if (visibility === "person" && !targetUserId) {
      setError("请选择指定接收人");
      return;
    }
    if (effectiveAnonymous && anonymousExhausted) {
      setError("本周匿名建议次数已用完，请改用实名提交");
      return;
    }
    setSubmitting(true);
    try {
      const res = await apiFetch<{
        anonymousLabel: string;
        isAnonymous: boolean;
      }>("/api/suggestions", {
        method: "POST",
        body: JSON.stringify({
          visibility,
          targetTitleIds:
            visibility === "group" ? targetTitleIds : undefined,
          targetUserId: visibility === "person" ? targetUserId : undefined,
          categoryId,
          isAnonymous: effectiveAnonymous,
          content: content.trim(),
        }),
      });
      setSubmitResult({
        anonymousLabel: res.anonymousLabel,
        isAnonymous: res.isAnonymous,
      });
      if (res.isAnonymous) {
        // 本地扣减本周匿名配额
        setMeta((prev) =>
          prev
            ? {
                ...prev,
                anonymousQuota: {
                  ...prev.anonymousQuota,
                  used: prev.anonymousQuota.used + 1,
                  remaining: Math.max(0, prev.anonymousQuota.remaining - 1),
                },
              }
            : prev
        );
      }
      setContent("");
      setTargetTitleIds([]);
      setTargetUserId(null);
      setIsAnonymous(true);
      loadHistory(1);
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
        {submitResult ? (
          <div className="card p-10 text-center fade-in">
            {submitResult.isAnonymous ? (
              <>
                <div className="text-5xl mb-4">🔒</div>
                <h2 className="text-xl font-semibold mb-2">建议已匿名提交</h2>
                <p className="text-[var(--color-ink-2)] text-sm leading-relaxed">
                  你的身份信息已完全保密，接收端只会看到
                  <span className="chip chip-purple mx-1">
                    {submitResult.anonymousLabel}
                  </span>
                  这样的脱敏标识，无法追溯到你本人。
                </p>
              </>
            ) : (
              <>
                <div className="text-5xl mb-4">✉️</div>
                <h2 className="text-xl font-semibold mb-2">建议已实名提交</h2>
                <p className="text-[var(--color-ink-2)] text-sm leading-relaxed">
                  接收端将显示你的真实姓名
                  <span className="chip chip-blue mx-1">{me.user.realName}</span>
                  ，请耐心等待对方查阅与处理。
                </p>
              </>
            )}
            <button
              className="btn btn-primary mt-7"
              onClick={() => setSubmitResult(null)}
            >
              再提一条
            </button>
          </div>
        ) : (
          <div className="card p-7 sm:p-9 fade-in">
            <h1 className="text-2xl font-semibold tracking-tight">
              提交建议
            </h1>
            <p className="text-sm text-[var(--color-ink-2)] mt-1.5">
              当前班级：<b>{meta?.myClass.name ?? "…"}</b>
              。可自由选择匿名或实名提交；致辅导员谢智的信件将按要求实名呈现。
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
                          key={g.id}
                          onClick={() => toggleTitle(g.id)}
                          className={`chip cursor-pointer transition-all ${
                            targetTitleIds.includes(g.id)
                              ? "chip-purple ring-2 ring-[var(--color-accent)]/40"
                              : "opacity-60 hover:opacity-100"
                          }`}
                        >
                          {targetTitleIds.includes(g.id) ? "✓ " : ""}
                          {g.name}
                        </button>
                      ))}
                    </div>
                    {meta && meta.groupOptions.length === 0 ? (
                      <p className="text-xs text-[var(--color-warning)]">
                        本班暂时没有可收信的职务，请联系管理员设置。
                      </p>
                    ) : (
                      <p className="text-xs text-[var(--color-ink-2)]">
                        仅担任所选职务的人员能看到这条建议，其他同学与接收端均不可见，可多选。
                      </p>
                    )}
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
                          {s.name}（{s.titleName}）
                        </option>
                      ))}
                    </select>
                    <p className="text-xs text-[var(--color-ink-2)]">
                      该建议仅这位接收人本人可见，其他任何人（包括其他老师、班干部、管理员）都无法查看。
                    </p>
                  </div>
                )}
              </div>

              {/* 署名方式 */}
              <div>
                <label className="label">
                  署名方式
                  {!forceRealName && (
                    <span
                      className={`ml-2 font-normal ${
                        anonymousExhausted
                          ? "text-[var(--color-danger)]"
                          : "text-[var(--color-ink-2)]"
                      }`}
                    >
                      本周匿名机会剩余 {quota.remaining}/{quota.limit} 次
                      （{quotaResetText} 0 点重置）
                    </span>
                  )}
                </label>
                <div className="segmented">
                  <button
                    type="button"
                    className={effectiveAnonymous ? "active" : ""}
                    disabled={forceRealName || anonymousExhausted}
                    onClick={() => setIsAnonymous(true)}
                  >
                    匿名提交
                  </button>
                  <button
                    type="button"
                    className={!effectiveAnonymous ? "active" : ""}
                    onClick={() => setIsAnonymous(false)}
                  >
                    实名提交
                  </button>
                </div>
                {forceRealName ? (
                  <p className="text-xs text-[var(--color-warning)] mt-2">
                    致辅导员谢智的信件按要求需实名呈现，接收端将显示你的真实姓名，不可匿名。
                  </p>
                ) : anonymousExhausted ? (
                  <p className="text-xs text-[var(--color-danger)] mt-2">
                    本周 {quota.limit} 次匿名建议机会已用完，{quotaResetText} 0 点自动重置；
                    现在可改用实名提交（不占用匿名次数）。
                  </p>
                ) : effectiveAnonymous ? (
                  <p className="text-xs text-[var(--color-ink-2)] mt-2">
                    匿名提交：接收端只会看到「同学X」这类随机脱敏标识，无法追溯到你本人。
                    每账号每周仅 {quota.limit} 次匿名机会。
                  </p>
                ) : (
                  <p className="text-xs text-[var(--color-ink-2)] mt-2">
                    实名提交：接收端将显示你的真实姓名，请确认内容客观、属实。
                  </p>
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
                {submitting
                  ? "提交中…"
                  : effectiveAnonymous
                    ? "匿名提交"
                    : "实名提交"}
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
                    <span className={`chip ${s.isAnonymous ? "" : "chip-blue"}`}>
                      {s.isAnonymous ? "匿名" : "实名"}
                    </span>
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
                  <div className="flex items-center gap-4 mt-3">
                    <button
                      className={`text-sm flex items-center gap-1.5 transition-colors ${
                        s.likedByMe
                          ? "text-[var(--color-accent)] font-medium"
                          : "text-[var(--color-ink-2)] hover:text-[var(--color-accent)]"
                      }`}
                      onClick={() => toggleHistoryLike(s)}
                    >
                      <span>{s.likedByMe ? "👍" : "👍🏻"}</span>
                      <span>{s.likeCount > 0 ? s.likeCount : "赞"}</span>
                    </button>
                    <button
                      className={`text-sm flex items-center gap-1.5 transition-colors ${
                        openComments === s.id
                          ? "text-[var(--color-accent)] font-medium"
                          : "text-[var(--color-ink-2)] hover:text-[var(--color-accent)]"
                      }`}
                      onClick={() =>
                        setOpenComments(openComments === s.id ? null : s.id)
                      }
                    >
                      <span>💬</span>
                      <span>{s.commentCount > 0 ? s.commentCount : "评论"}</span>
                    </button>
                    {(s.isMine || me?.user.role === "super_admin") && (
                      <button
                        className="text-sm flex items-center gap-1.5 text-[var(--color-ink-2)] hover:text-[var(--color-danger)] transition-colors"
                        onClick={() => deleteHistory(s)}
                      >
                        <span>🗑</span>
                        <span>删除</span>
                      </button>
                    )}
                  </div>
                  {openComments === s.id && (
                    <CommentPanel
                      suggestionId={s.id}
                      onCountChange={(n) =>
                        setHistory((prev) =>
                          prev.map((it) =>
                            it.id === s.id ? { ...it, commentCount: n } : it
                          )
                        )
                      }
                    />
                  )}
                </div>
              ))}
            </div>
            {history.length < historyTotal && (
              <div className="text-center mt-4">
                <button
                  className="btn btn-ghost"
                  onClick={() => loadHistory(historyPage + 1, true)}
                >
                  加载更多（剩余 {historyTotal - history.length} 条）
                </button>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
