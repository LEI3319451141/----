import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { classes, suggestionCategories, suggestions } from "@/db/schema";
import { fail, ok } from "@/lib/api";
import { suggestionToDto } from "@/lib/dto";
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
      targetGroups: suggestions.targetGroups,
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
    .where(eq(suggestions.submitterId, user.id))
    .orderBy(desc(suggestions.createdAt))
    .limit(100);

  if (rows.length === 0) return ok({ items: [] });

  // 学生本人只能看到自己提交的内容；DTO 白名单同样不含身份字段
  return ok({ items: rows.map((r) => suggestionToDto(r)) });
}
