"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  apiFetch,
  fetchMe,
  type MeResponse,
} from "@/lib/client-api";
import { TopNav } from "@/components/TopNav";
import { PasswordModal } from "@/components/PasswordModal";
import { CommentPanel } from "@/components/CommentPanel";

interface ClassOption {
  id: number;
  name: string;
}

interface SuggestionDto {
  id: number;
  classId: number;
  className: string | null;
  visibility: string;
  audienceLabel: string;
  categoryName: string | null;
  content: string;
  isAnonymous: boolean;
  authorName: string | null;
  anonymousLabel: string;
  likeCount: number;
  commentCount: number;
  likedByMe: boolean;
  isMine: boolean;
  status: string;
  timeDisplay: string;
  processed: boolean;
  processedTimeDisplay: string | null;
}

interface ListResponse {
  items: SuggestionDto[];
  total: number;
  page: number;
  pageSize: number;
}

export default function InboxPage() {
  const router = useRouter();
  const [me, setMe] = useState<MeResponse | null>(null);
  const [needReset, setNeedReset] = useState(false);
  const [classes, setClasses] = useState<ClassOption[]>([]);
  const [categories, setCategories] = useState<{ id: number; name: string }[]>(
    []
  );

  const [classId, setClassId] = useState<number | "">("");
  const [visibility, setVisibility] = useState<string>("");
  const [status, setStatus] = useState<string>("");
  const [categoryId, setCategoryId] = useState<string>("");

  const [items, setItems] = useState<SuggestionDto[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [pendingTotal, setPendingTotal] = useState(0);
  // 当前展开评论面板的建议 ID（同屏只展开一个）
  const [openComments, setOpenComments] = useState<number | null>(null);

  const loadPage = useCallback(
    async (p: number, replace: boolean) => {
      setLoading(true);
      setError("");
      // 切换筛选条件时先清空，避免旧数据闪烁
      if (replace) setItems([]);
      try {
        const params = new URLSearchParams();
        if (classId !== "") params.set("classId", String(classId));
        if (visibility) params.set("visibility", visibility);
        if (status) params.set("status", status);
        if (categoryId) params.set("categoryId", categoryId);
        params.set("page", String(p));
        const res = await apiFetch<ListResponse>(
          `/api/suggestions?${params.toString()}`
        );
        setItems((prev) => (replace ? res.items : [...prev, ...res.items]));
        setTotal(res.total);
        setPage(p);
      } catch (err) {
        setError(err instanceof Error ? err.message : "加载失败");
      } finally {
        setLoading(false);
      }
    },
    [classId, visibility, status, categoryId]
  );

  useEffect(() => {
    (async () => {
      const data = await fetchMe();
      if (!data) {
        router.replace("/login");
        return;
      }
      setMe(data);
      setNeedReset(data.user.mustResetPassword);

      if (data.isSuperAdmin) {
        const cls = await apiFetch<{ id: number; name: string }[]>(
          "/api/admin/classes"
        );
        setClasses(cls.map((c) => ({ id: c.id, name: c.name })));
      } else if (data.studentClass) {
        // 学生：只能看自己班级
        setClasses([
          { id: data.studentClass.classId, name: data.studentClass.className },
        ]);
      } else {
        const map = new Map<number, string>();
        data.managedClasses.forEach((c) => map.set(c.classId, c.className));
        setClasses(
          Array.from(map.entries()).map(([id, name]) => ({ id, name }))
        );
      }
      const cats = await apiFetch<{ id: number; name: string }[]>(
        "/api/categories"
      );
      setCategories(cats);

      loadStats();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  async function loadStats() {
    try {
      const stats = await apiFetch<{ pending: number }>(
        "/api/stats/overview"
      );
      setPendingTotal(stats.pending ?? 0);
    } catch {
      /* 统计非关键 */
    }
  }

  useEffect(() => {
    if (me) loadPage(1, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me, classId, visibility, status, categoryId]);

  async function toggleStatus(s: SuggestionDto) {
    const next = s.status === "processed" ? "pending" : "processed";
    try {
      await apiFetch(`/api/suggestions/${s.id}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status: next }),
      });
      // 重新拉取列表和统计，确保 UI 与数据库一致
      await Promise.all([loadPage(1, true), loadStats()]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "操作失败");
    }
  }

  async function toggleLike(s: SuggestionDto) {
    try {
      const res = await apiFetch<{ liked: boolean; likeCount: number }>(
        `/api/suggestions/${s.id}/like`,
        { method: "POST" }
      );
      setItems((prev) =>
        prev.map((it) =>
          it.id === s.id
            ? { ...it, likedByMe: res.liked, likeCount: res.likeCount }
            : it
        )
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "点赞失败");
    }
  }

  function updateCommentCount(id: number, count: number) {
    setItems((prev) =>
      prev.map((it) => (it.id === id ? { ...it, commentCount: count } : it))
    );
  }

  /** 发信人可删自己的建议；超管可删除任何建议 */
  const canDeleteSuggestion = (s: SuggestionDto) =>
    s.isMine || me?.user.role === "super_admin";

  async function deleteSuggestion(s: SuggestionDto) {
    if (
      !window.confirm(
        "确定删除这条建议？相关评论和点赞将一并删除，且不可恢复。"
      )
    )
      return;
    try {
      await apiFetch(`/api/suggestions/${s.id}`, { method: "DELETE" });
      setItems((prev) => prev.filter((it) => it.id !== s.id));
      setTotal((t) => Math.max(0, t - 1));
      if (openComments === s.id) setOpenComments(null);
      loadStats();
    } catch (err) {
      setError(err instanceof Error ? err.message : "删除失败");
    }
  }

  const hasMore = items.length < total;

  if (!me) {
    return (
      <div className="min-h-screen flex items-center justify-center text-[var(--color-ink-2)]">
        加载中…
      </div>
    );
  }

  const isStaff = ["super_admin", "counselor", "teacher", "cadre"].includes(
    me.user.role
  );

  return (
    <div className="min-h-screen">
      {needReset && <PasswordModal onDone={() => setNeedReset(false)} />}
      <TopNav
        user={me.user}
        links={[
          { href: "/inbox", label: "建议信箱" },
          ...(me.studentClass
            ? [{ href: "/submit", label: "提交建议" }]
            : []),
          ...(me.isSuperAdmin ? [{ href: "/admin", label: "管理后台" }] : []),
        ]}
      />

      <main className="max-w-4xl mx-auto px-5 py-10">
        <div className="flex items-end justify-between flex-wrap gap-3 mb-6">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">建议信箱</h1>
            <p className="text-sm text-[var(--color-ink-2)] mt-1">
              共 {total} 条建议，其中 {pendingTotal} 条待处理
            </p>
          </div>
        </div>

        {/* 筛选区 */}
        <div className="card p-4 sm:p-5 space-y-3 mb-6">
          {classes.length > 1 && (
            <div className="flex items-center gap-3 flex-wrap">
              <span className="text-sm text-[var(--color-ink-2)] whitespace-nowrap">
                班级
              </span>
              <div className="segmented flex-1 min-w-[240px]">
                <button
                  type="button"
                  className={classId === "" ? "active" : ""}
                  onClick={() => setClassId("")}
                >
                  全部
                </button>
                {classes.map((c) => (
                  <button
                    type="button"
                    key={c.id}
                    className={classId === c.id ? "active" : ""}
                    onClick={() => setClassId(c.id)}
                  >
                    {c.name}
                  </button>
                ))}
              </div>
            </div>
          )}
          <div className="flex items-center gap-3 flex-wrap">
            <select
              className="select max-w-[150px]"
              value={visibility}
              onChange={(e) => setVisibility(e.target.value)}
            >
              <option value="">全部可见性</option>
              <option value="public">公开</option>
              <option value="group">指定群体</option>
              <option value="person">指定专人</option>
            </select>
            <select
              className="select max-w-[130px]"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
            >
              <option value="">全部状态</option>
              <option value="pending">待处理</option>
              <option value="processed">已处理</option>
            </select>
            <select
              className="select max-w-[150px]"
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
            >
              <option value="">全部分类</option>
              {categories.map((c) => (
                <option key={c.id} value={String(c.id)}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {error && (
          <p className="text-sm text-[var(--color-danger)] mb-4">{error}</p>
        )}

        {/* 建议列表 */}
        <div className="space-y-4">
          {loading && items.length === 0 ? (
            <div className="space-y-4">
              {[1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="card p-6 animate-pulse"
                  style={{ minHeight: 120 }}
                >
                  <div
                    className="h-4 bg-black/5 rounded mb-3"
                    style={{ width: "40%" }}
                  />
                  <div
                    className="h-3 bg-black/5 rounded mb-2"
                    style={{ width: "80%" }}
                  />
                  <div
                    className="h-3 bg-black/5 rounded"
                    style={{ width: "60%" }}
                  />
                </div>
              ))}
            </div>
          ) : items.length === 0 && !error ? (
            <div className="card p-8 text-center text-[var(--color-ink-2)]">
              暂无建议
            </div>
          ) : (
            items.map((s) => (
            <div key={s.id} className="card p-6 fade-in">
              <div className="flex items-center gap-2 flex-wrap mb-3">
                {s.isAnonymous ? (
                  <span className="chip chip-purple font-medium">
                    {s.anonymousLabel}
                  </span>
                ) : (
                  <span className="chip chip-blue font-medium">
                    实名 · {s.authorName}
                  </span>
                )}
                <span
                  className={`chip ${
                    s.visibility === "person"
                      ? "chip-orange"
                      : s.visibility === "group"
                        ? "chip-blue"
                        : "chip-green"
                  }`}
                >
                  {s.audienceLabel}
                </span>
                {s.categoryName && <span className="chip">{s.categoryName}</span>}
                {me.isSuperAdmin && s.className && (
                  <span className="chip">{s.className}</span>
                )}
                <span
                  className={`chip ml-auto ${s.processed ? "chip-green" : "chip-orange"}`}
                >
                  {s.processed ? "已处理" : "待处理"}
                </span>
              </div>
              <p className="text-[15px] leading-7 whitespace-pre-wrap">
                {s.content}
              </p>
              <div className="flex items-center flex-wrap gap-x-3 gap-y-2 mt-4 pt-4 border-t border-black/5">
                <div className="flex items-center gap-4">
                  <button
                    className={`text-sm flex items-center gap-1.5 whitespace-nowrap transition-colors ${
                      s.likedByMe
                        ? "text-[var(--color-accent)] font-medium"
                        : "text-[var(--color-ink-2)] hover:text-[var(--color-accent)]"
                    }`}
                    onClick={() => toggleLike(s)}
                  >
                    <span>{s.likedByMe ? "👍" : "👍🏻"}</span>
                    <span>{s.likeCount > 0 ? s.likeCount : "赞"}</span>
                  </button>
                  <button
                    className={`text-sm flex items-center gap-1.5 whitespace-nowrap transition-colors ${
                      openComments === s.id
                        ? "text-[var(--color-accent)] font-medium"
                        : "text-[var(--color-ink-2)] hover:text-[var(--color-accent)]"
                    }`}
                    onClick={() =>
                      setOpenComments(openComments === s.id ? null : s.id)
                    }
                  >
                    <span>💬</span>
                    <span>
                      {s.commentCount > 0 ? s.commentCount : "评论"}
                    </span>
                  </button>
                  {canDeleteSuggestion(s) && (
                    <button
                      className="text-sm flex items-center gap-1.5 whitespace-nowrap text-[var(--color-ink-2)] hover:text-[var(--color-danger)] transition-colors"
                      onClick={() => deleteSuggestion(s)}
                    >
                      <span>🗑</span>
                      <span>删除</span>
                    </button>
                  )}
                </div>
                <div className="flex items-center gap-3 ml-auto flex-wrap justify-end">
                  <span className="text-xs text-[var(--color-ink-2)] whitespace-nowrap">
                    {s.timeDisplay}
                    {s.processed && s.processedTimeDisplay
                      ? ` · 处理于${s.processedTimeDisplay}`
                      : ""}
                  </span>
                  {isStaff && (
                    <button
                      className={`btn btn-sm ${s.processed ? "btn-ghost" : "btn-primary"}`}
                      onClick={() => toggleStatus(s)}
                    >
                      {s.processed ? "标记为待处理" : "标记已处理"}
                    </button>
                  )}
                </div>
              </div>
              {openComments === s.id && (
                <CommentPanel
                  suggestionId={s.id}
                  onCountChange={(n) => updateCommentCount(s.id, n)}
                />
              )}
            </div>
          ))
          )}
        </div>

        {hasMore && (
          <div className="text-center mt-8">
            <button
              className="btn btn-ghost"
              onClick={() => loadPage(page + 1, false)}
              disabled={loading}
            >
              {loading ? "加载中…" : "加载更多"}
            </button>
          </div>
        )}
      </main>
    </div>
  );
}
