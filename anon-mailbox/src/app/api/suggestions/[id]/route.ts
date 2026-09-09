import { eq } from "drizzle-orm";
import { db } from "@/db";
import { classes, suggestionCategories, suggestions } from "@/db/schema";
import { fail, ok } from "@/lib/api";
import { canAccessClass } from "@/lib/rbac";
import { suggestionToDto } from "@/lib/dto";
import { requireUser } from "@/lib/guard";

export const runtime = "nodejs";

/** 建议详情：逐条校验班级访问权限（防 IDOR），仅返回脱敏 DTO */
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

  const [row] = await db
    .select({
      id: suggestions.id,
      classId: suggestions.classId,
      className: classes.name,
      recipientType: suggestions.recipientType,
      categoryId: suggestions.categoryId,
      categoryName: suggestionCategories.name,
      content: suggestions.content,
      anonymousLabel: suggestions.anonymousLabel,
      status: suggestions.status,
      createdAt: suggestions.createdAt,
      processedAt: suggestions.processedAt,
    })
    .from(suggestions)
    .leftJoin(classes, eq(classes.id, suggestions.classId))
    .leftJoin(suggestionCategories, eq(suggestionCategories.id, suggestions.categoryId))
    .where(eq(suggestions.id, suggestionId))
    .limit(1);

  if (!row) return fail(404, "建议不存在");

  const allowed = await canAccessClass(user, row.classId);
  if (!allowed) return fail(403, "无权访问该建议");

  return ok(suggestionToDto(row));
}
