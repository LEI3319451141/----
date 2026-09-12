"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/client-api";

interface CommentItem {
  id: number;
  parentId: number | null;
  replyToLabel: string | null;
  isAnonymous: boolean;
  authorDisplay: string;
  isMine: boolean;
  canDelete: boolean;
  content: string;
  timeDisplay: string;
}

interface CommentPanelProps {
  suggestionId: number;
  /** 评论数变化时回调（用于同步卡片上的计数） */
  onCountChange?: (count: number) => void;
}

/** 评论/回复面板：匿名标识与发信一致；公开建议可见者可评，定向建议仅发信人与指定人 */
export function CommentPanel({ suggestionId, onCountChange }: CommentPanelProps) {
  const [items, setItems] = useState<CommentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [content, setContent] = useState("");
  const [isAnonymous, setIsAnonymous] = useState(true);
  const [replyTo, setReplyTo] = useState<CommentItem | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await apiFetch<{ items: CommentItem[] }>(
        `/api/suggestions/${suggestionId}/comments`
      );
      setItems(res.items ?? []);
      onCountChange?.(res.items?.length ?? 0);
    } catch (err) {
      setError(err instanceof Error ? err.message : "评论加载失败");
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [suggestionId]);

  useEffect(() => {
    load();
  }, [load]);

  /** 按根评论分组：顶层评论 + 其下的回复（支持回复的回复归并到同一根） */
  const grouped = useMemo(() => {
    const byId = new Map(items.map((i) => [i.id, i]));
    const rootOf = (c: CommentItem): number => {
      let cur = c;
      while (cur.parentId) {
        const p = byId.get(cur.parentId);
        if (!p) break;
        cur = p;
      }
      return cur.id;
    };
    const topLevel = items.filter((i) => !i.parentId);
    const replies = new Map<number, CommentItem[]>();
    for (const i of items) {
      if (!i.parentId) continue;
      const root = rootOf(i);
      const arr = replies.get(root) ?? [];
      arr.push(i);
      replies.set(root, arr);
    }
    return { topLevel, replies };
  }, [items]);

  async function submit() {
    const text = content.trim();
    if (!text) return;
    setSubmitting(true);
    setError("");
    try {
      await apiFetch(`/api/suggestions/${suggestionId}/comments`, {
        method: "POST",
        body: JSON.stringify({
          content: text,
          isAnonymous,
          parentId: replyTo?.id ?? null,
        }),
      });
      setContent("");
      setReplyTo(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "评论失败");
    } finally {
      setSubmitting(false);
    }
  }

  async function removeComment(c: CommentItem) {
    // 递归统计所有后代回复（不只直接子评论）
    const byParent = new Map<number, CommentItem[]>();
    for (const i of items) {
      if (i.parentId) {
        const arr = byParent.get(i.parentId) ?? [];
        arr.push(i);
        byParent.set(i.parentId, arr);
      }
    }
    function countDescendants(id: number): number {
      const children = byParent.get(id) ?? [];
      return children.length + children.reduce((sum, c) => sum + countDescendants(c.id), 0);
    }
    const replyCount = countDescendants(c.id);
    const tip = replyCount > 0
      ? `删除该评论？其下 ${replyCount} 条回复也将一并删除，不可恢复。`
      : "确定删除这条评论？删除后不可恢复。";
    if (!window.confirm(tip)) return;
    setError("");
    try {
      await apiFetch(`/api/suggestions/${suggestionId}/comments/${c.id}`, {
        method: "DELETE",
      });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "删除失败");
    }
  }

  function authorChip(c: CommentItem) {
    return c.isAnonymous ? (
      <span className="chip chip-purple font-medium">{c.authorDisplay}</span>
    ) : (
      <span className="chip chip-blue font-medium">实名 · {c.authorDisplay}</span>
    );
  }

  function renderComment(c: CommentItem, isReply: boolean) {
    return (
      <div
        key={c.id}
        className={isReply ? "pl-6 py-2.5" : "py-2.5"}
      >
        <div className="flex items-center gap-2 flex-wrap">
          {authorChip(c)}
          {c.isMine && <span className="chip text-[0.7rem]">我</span>}
          {c.replyToLabel && (
            <span className="text-xs text-[var(--color-ink-2)]">
              回复 @{c.replyToLabel}
            </span>
          )}
          <span className="text-xs text-[var(--color-ink-2)] ml-auto whitespace-nowrap">
            {c.timeDisplay}
          </span>
          <button
            type="button"
            className="text-xs whitespace-nowrap text-[var(--color-accent)] hover:underline"
            onClick={() => setReplyTo(c)}
          >
            回复
          </button>
          {c.canDelete && (
            <button
              type="button"
              className="text-xs whitespace-nowrap text-[var(--color-danger)] hover:underline"
              onClick={() => removeComment(c)}
            >
              删除
            </button>
          )}
        </div>
        <p className="text-sm leading-6 mt-1 whitespace-pre-wrap text-[var(--color-ink)]">
          {c.content}
        </p>
      </div>
    );
  }

  return (
    <div className="mt-4 pt-4 border-t border-black/5">
      {loading ? (
        <p className="text-sm text-[var(--color-ink-2)] py-2">评论加载中…</p>
      ) : (
        <>
          {grouped.topLevel.length === 0 ? (
            <p className="text-sm text-[var(--color-ink-2)] py-1">
              还没有评论，来说两句吧
            </p>
          ) : (
            <div className="divide-y divide-black/5">
              {grouped.topLevel.map((c) => (
                <div key={c.id}>
                  {renderComment(c, false)}
                  {(grouped.replies.get(c.id) ?? []).map((r) =>
                    renderComment(r, true)
                  )}
                </div>
              ))}
            </div>
          )}

          <div className="mt-3 space-y-2">
            {replyTo && (
              <div className="flex items-center gap-2 text-xs text-[var(--color-ink-2)]">
                <span>
                  回复 @{replyTo.authorDisplay}：{replyTo.content.slice(0, 20)}
                  {replyTo.content.length > 20 ? "…" : ""}
                </span>
                <button
                  type="button"
                  className="text-[var(--color-danger)] hover:underline"
                  onClick={() => setReplyTo(null)}
                >
                  取消
                </button>
              </div>
            )}
            <textarea
              className="textarea text-sm"
              rows={2}
              maxLength={500}
              placeholder="写下你的评论…（500 字以内）"
              value={content}
              onChange={(e) => setContent(e.target.value)}
            />
            <div className="flex items-center gap-3 flex-wrap">
              <div className="segmented text-xs">
                <button
                  type="button"
                  className={isAnonymous ? "active" : ""}
                  onClick={() => setIsAnonymous(true)}
                >
                  匿名
                </button>
                <button
                  type="button"
                  className={!isAnonymous ? "active" : ""}
                  onClick={() => setIsAnonymous(false)}
                >
                  实名
                </button>
              </div>
              {isAnonymous && (
                <span className="text-xs text-[var(--color-ink-2)]">
                  匿名评论将沿用你在本条讨论中的身份标识
                </span>
              )}
              <button
                type="button"
                className="btn btn-sm btn-primary ml-auto"
                disabled={submitting || !content.trim()}
                onClick={submit}
              >
                {submitting ? "发送中…" : "发送"}
              </button>
            </div>
            {error && (
              <p className="text-sm text-[var(--color-danger)]">{error}</p>
            )}
          </div>
        </>
      )}
    </div>
  );
}
