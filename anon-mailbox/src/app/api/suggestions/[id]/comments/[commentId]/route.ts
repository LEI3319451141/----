import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { suggestionComments } from "@/db/schema";
import { fail, ok } from "@/lib/api";
import { requireUser } from "@/lib/guard";

export const runtime = "nodejs";

/**
 * 删除评论（硬删除）：
 * - 评论作者可删自己的评论（其下回复级联删除）
 * - 超管拥有全部权限，可删除任何评论
 * - 其他人一律 404
 */
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string; commentId: string }> }
) {
  const guard = await requireUser();
  if ("response" in guard) return guard.response;
  const user = guard.user;

  const { id, commentId: commentIdRaw } = await params;
  const suggestionId = Number(id);
  const commentId = Number(commentIdRaw);
  if (!Number.isInteger(suggestionId) || !Number.isInteger(commentId)) {
    return fail(400, "ID 不正确");
  }

  const [comment] = await db
    .select({
      id: suggestionComments.id,
      suggestionId: suggestionComments.suggestionId,
      userId: suggestionComments.userId,
    })
    .from(suggestionComments)
    .where(eq(suggestionComments.id, commentId))
    .limit(1);
  if (!comment || comment.suggestionId !== suggestionId) {
    return fail(404, "评论不存在或无权删除");
  }

  const isOwner = comment.userId === user.id;
  if (!isOwner && user.role !== "super_admin") {
    return fail(404, "评论不存在或无权删除");
  }

  // 其下回复经外键级联一并删除
  await db
    .delete(suggestionComments)
    .where(
      and(
        eq(suggestionComments.id, commentId),
        eq(suggestionComments.suggestionId, suggestionId)
      )
    );
  return ok({ success: true });
}
