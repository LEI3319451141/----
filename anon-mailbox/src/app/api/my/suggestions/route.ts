import { desc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import {
  classes,
  staffTitles,
  suggestionCategories,
  suggestions,
  users,
} from "@/db/schema";
import { ok } from "@/lib/api";
import { suggestionToDto } from "@/lib/dto";
import { interactionSelectFields } from "@/lib/interactions";
import { requireUser } from "@/lib/guard";

export const runtime = "nodejs";

/** 学生查看本人的历史提交（仅自己的，看不到任何人的内容） */
export async function GET() {
  const guard = await requireUser();
  if ("response" in guard) return guard.response;
  const user = guard.user;

  const rows = await db
    .select({
      id: suggestions.id,
      classId: suggestions.classId,
      className: classes.name,
      visibility: suggestions.visibility,
      targetTitleIds: suggestions.targetTitleIds,
      categoryId: suggestions.categoryId,
      categoryName: suggestionCategories.name,
      content: suggestions.content,
      isAnonymous: suggestions.isAnonymous,
      authorName: users.realName,
      anonymousLabel: suggestions.anonymousLabel,
      status: suggestions.status,
      createdAt: suggestions.createdAt,
      processedAt: suggestions.processedAt,
      ...interactionSelectFields(user.id),
    })
    .from(suggestions)
    .leftJoin(classes, eq(classes.id, suggestions.classId))
    .leftJoin(users, eq(users.id, suggestions.submitterId))
    .leftJoin(suggestionCategories, eq(suggestionCategories.id, suggestions.categoryId))
    .where(eq(suggestions.submitterId, user.id))
    .orderBy(desc(suggestions.createdAt))
    .limit(100);

  if (rows.length === 0) return ok({ items: [] });

  const titleIds = Array.from(
    new Set(rows.flatMap((r) => r.targetTitleIds ?? []))
  );
  const titleRows = titleIds.length
    ? await db
        .select({ id: staffTitles.id, name: staffTitles.name })
        .from(staffTitles)
        .where(inArray(staffTitles.id, titleIds))
    : [];
  const titleMap = new Map(titleRows.map((t) => [t.id, t.name]));

  // 学生本人只能看到自己提交的内容；DTO 白名单同样不含身份字段
  return ok({
    items: rows.map((r) =>
      suggestionToDto({
        ...r,
        targetTitleNames: (r.targetTitleIds ?? []).map((id) => titleMap.get(id) ?? ""),
      })
    ),
  });
}
