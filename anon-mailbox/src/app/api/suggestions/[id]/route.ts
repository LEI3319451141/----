import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import {
  classes,
  staffTitles,
  suggestionCategories,
  suggestions,
} from "@/db/schema";
import { fail, ok } from "@/lib/api";
import { visibilityCondition } from "@/lib/rbac";
import { suggestionToDto } from "@/lib/dto";
import { requireUser } from "@/lib/guard";

export const runtime = "nodejs";

/** 建议详情：班级隔离 + 可见性双重校验（防 IDOR），仅返回脱敏 DTO */
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
      visibility: suggestions.visibility,
      targetTitleIds: suggestions.targetTitleIds,
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
    .where(and(eq(suggestions.id, suggestionId), visibilityCondition(user)))
    .limit(1);

  if (!row) return fail(404, "建议不存在或无权查看");

  const titleRows = row.targetTitleIds?.length
    ? await db
        .select({ id: staffTitles.id, name: staffTitles.name })
        .from(staffTitles)
        .where(inArray(staffTitles.id, row.targetTitleIds))
    : [];
  const titleMap = new Map(titleRows.map((t) => [t.id, t.name]));

  return ok(
    suggestionToDto({
      ...row,
      targetTitleNames: (row.targetTitleIds ?? []).map((id) => titleMap.get(id) ?? ""),
    })
  );
}
