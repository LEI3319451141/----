import { and, asc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { suggestionComments, suggestions, users } from "@/db/schema";
import { fail, ok } from "@/lib/api";
import { randomAnonymousLabel } from "@/lib/label";
import {
  canCommentSuggestion,
  canViewSuggestion,
  getSuggestionCore,
} from "@/lib/rbac";
import { requireUser } from "@/lib/guard";
import { fuzzyTime } from "@/lib/time";

export const runtime = "nodejs";

interface CommentRowRaw {
  id: number;
  parentId: number | null;
  userId: number;
  isAnonymous: boolean;
  anonymousLabel: string;
  content: string;
  createdAt: Date;
  authorRealName: string | null;
}

/** 评论者展示名：匿名时——发信人（且建议本身匿名）复用建议的脱敏标识，其余用评论自己的标识 */
function authorDisplayOf(
  c: CommentRowRaw,
  suggestion: { isAnonymous: boolean; submitterId: number; anonymousLabel: string }
): string {
  if (!c.isAnonymous) return c.authorRealName ?? "已注销用户";
  if (suggestion.isAnonymous && c.userId === suggestion.submitterId) {
    return suggestion.anonymousLabel;
  }
  return c.anonymousLabel;
}

/** 评论列表：可见者或发信人本人可读（发信人需要看到自己信件下的回复） */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await requireUser();
  if ("response" in guard) return guard.response;
  const user = guard.user;

  const { id } = await params;
  const suggestionId = Number(id);
  if (!Number.isInteger(suggestionId)) return fail(400, "建议 ID 不正确");

  const suggestion = await getSuggestionCore(suggestionId);
  if (!suggestion) return fail(404, "建议不存在或无权查看");
  if (!(await canViewSuggestion(user, suggestion))) {
    return fail(404, "建议不存在或无权查看");
  }

  const rows: CommentRowRaw[] = await db
    .select({
      id: suggestionComments.id,
      parentId: suggestionComments.parentId,
      userId: suggestionComments.userId,
      isAnonymous: suggestionComments.isAnonymous,
      anonymousLabel: suggestionComments.anonymousLabel,
      content: suggestionComments.content,
      createdAt: suggestionComments.createdAt,
      authorRealName: users.realName,
    })
    .from(suggestionComments)
    .leftJoin(users, eq(users.id, suggestionComments.userId))
    .where(eq(suggestionComments.suggestionId, suggestionId))
    .orderBy(asc(suggestionComments.createdAt), asc(suggestionComments.id));

  const displayById = new Map<number, string>();
  for (const r of rows) displayById.set(r.id, authorDisplayOf(r, suggestion));

  return ok({
    items: rows.map((r) => ({
      id: r.id,
      parentId: r.parentId,
      // 回复对象显示名（父评论可能已被级联删除，则置空）
      replyToLabel: r.parentId ? (displayById.get(r.parentId) ?? null) : null,
      isAnonymous: r.isAnonymous,
      authorDisplay: displayById.get(r.id) ?? "同学",
      isMine: r.userId === user.id,
      // 作者本人或超管可删
      canDelete: r.userId === user.id || user.role === "super_admin",
      content: r.content,
      timeDisplay: fuzzyTime(r.createdAt),
    })),
  });
}

const createSchema = z.object({
  content: z
    .string()
    .trim()
    .min(1, "评论内容不能为空")
    .max(500, "评论内容不超过 500 字"),
  isAnonymous: z.boolean().optional(),
  parentId: z.number().int().positive().nullable().optional(),
});

/** 发表评论/回复：公开建议=可见者可评；定向建议=仅发信人与指定接收人 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await requireUser();
  if ("response" in guard) return guard.response;
  const user = guard.user;

  const { id } = await params;
  const suggestionId = Number(id);
  if (!Number.isInteger(suggestionId)) return fail(400, "建议 ID 不正确");

  const suggestion = await getSuggestionCore(suggestionId);
  if (!suggestion) return fail(404, "建议不存在或无权操作");
  if (!(await canCommentSuggestion(user, suggestion))) {
    // 404 而非 403：不向无权者泄露定向建议的存在性
    return fail(404, "建议不存在或无权操作");
  }

  const body = await req.json().catch(() => null);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return fail(400, parsed.error.issues[0]?.message ?? "参数不正确");
  }
  const { content } = parsed.data;
  const isAnonymous = parsed.data.isAnonymous ?? true;
  const parentId = parsed.data.parentId ?? null;

  // 回复目标必须属于同一条建议
  if (parentId) {
    const [parent] = await db
      .select({ id: suggestionComments.id, suggestionId: suggestionComments.suggestionId })
      .from(suggestionComments)
      .where(eq(suggestionComments.id, parentId))
      .limit(1);
    if (!parent || parent.suggestionId !== suggestionId) {
      return fail(400, "回复的评论不存在");
    }
  }

  // 匿名标识分配：
  // 1) 建议本身匿名 + 评论者就是发信人 → 复用建议的脱敏标识（同学A 发的信，评论也是同学A）
  // 2) 其他匿名评论者 → 复用其在本讨论串中已有的标识，保证同人同标
  // 3) 实名评论仍生成备用标识（不展示）
  let anonymousLabel: string;
  if (isAnonymous && suggestion.isAnonymous && user.id === suggestion.submitterId) {
    anonymousLabel = suggestion.anonymousLabel;
  } else if (isAnonymous) {
    const [prior] = await db
      .select({ label: suggestionComments.anonymousLabel })
      .from(suggestionComments)
      .where(
        and(
          eq(suggestionComments.suggestionId, suggestionId),
          eq(suggestionComments.userId, user.id),
          eq(suggestionComments.isAnonymous, true)
        )
      )
      .limit(1);
    if (prior) {
      anonymousLabel = prior.label;
    } else {
      const usedRows = await db
        .selectDistinct({ label: suggestionComments.anonymousLabel })
        .from(suggestionComments)
        .where(eq(suggestionComments.suggestionId, suggestionId));
      const used = new Set(usedRows.map((r) => r.label));
      if (suggestion.isAnonymous) used.add(suggestion.anonymousLabel);
      anonymousLabel = randomAnonymousLabel(used);
    }
  } else {
    anonymousLabel = randomAnonymousLabel();
  }

  const [created] = await db
    .insert(suggestionComments)
    .values({
      suggestionId,
      userId: user.id,
      parentId,
      content,
      isAnonymous,
      anonymousLabel,
    })
    .returning({ id: suggestionComments.id });

  return ok({ success: true, id: created.id }, 201);
}
