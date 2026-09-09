import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { suggestionCategories } from "@/db/schema";
import { fail, ok } from "@/lib/api";
import { requireUser } from "@/lib/guard";

export const runtime = "nodejs";

/** 启用中的建议分类（所有登录用户可见，用于提交页/筛选） */
export async function GET() {
  const guard = await requireUser();
  if ("response" in guard) return guard.response;

  const list = await db
    .select({
      id: suggestionCategories.id,
      name: suggestionCategories.name,
      sortOrder: suggestionCategories.sortOrder,
    })
    .from(suggestionCategories)
    .where(eq(suggestionCategories.isActive, true))
    .orderBy(asc(suggestionCategories.sortOrder), suggestionCategories.id);

  return ok(list);
}
