import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { suggestionLikes } from "@/db/schema";
import { fail, ok } from "@/lib/api";
import { canViewSuggestion, getSuggestionCore } from "@/lib/rbac";
import { isUniqueViolation, requireUser } from "@/lib/guard";

export const runtime = "nodejs";

/**
 * 点赞/取消点赞（toggle）。可见即可赞：
 * 公开建议=全班及接收端；群体=在任职务者（超管亦可见可赞）；
 * 专人=被指定人；发信人本人也可赞自己的信。
 */
export async function POST(
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
  if (!suggestion) return fail(404, "建议不存在或无权操作");
  if (!(await canViewSuggestion(user, suggestion))) {
    return fail(404, "建议不存在或无权操作");
  }

  const [existing] = await db
    .select({ id: suggestionLikes.id })
    .from(suggestionLikes)
    .where(
      and(
        eq(suggestionLikes.suggestionId, suggestionId),
        eq(suggestionLikes.userId, user.id)
      )
    )
    .limit(1);

  let liked: boolean;
  if (existing) {
    await db.delete(suggestionLikes).where(eq(suggestionLikes.id, existing.id));
    liked = false;
  } else {
    try {
      await db
        .insert(suggestionLikes)
        .values({ suggestionId, userId: user.id });
      liked = true;
    } catch (e) {
      if (isUniqueViolation(e)) {
        liked = true; // 并发重复点赞：视为已赞
      } else {
        throw e;
      }
    }
  }

  const [countRow] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(suggestionLikes)
    .where(eq(suggestionLikes.suggestionId, suggestionId));

  return ok({ liked, likeCount: countRow?.n ?? 0 });
}
