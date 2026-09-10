import { asc, eq, and } from "drizzle-orm";
import { db } from "@/db";
import {
  classAssignments,
  classes,
  staffTitles,
  suggestionCategories,
  users,
} from "@/db/schema";
import { fail, ok } from "@/lib/api";
import { getStudentClassId } from "@/lib/rbac";
import { getAnonymousQuota } from "@/lib/quota";
import { requireUser } from "@/lib/guard";

export const runtime = "nodejs";

/** 提交页所需数据：我的班级、本班可选职务群体、建议分类 */
export async function GET() {
  const guard = await requireUser();
  if ("response" in guard) return guard.response;
  const user = guard.user;

  const classId = await getStudentClassId(user.id);
  if (!classId) {
    return fail(403, "您尚未归属任何班级，请联系管理员");
  }

  const [cls] = await db
    .select({ id: classes.id, name: classes.name })
    .from(classes)
    .where(eq(classes.id, classId))
    .limit(1);

  // 本班"群体可见"可选职务：本班有在任人员且职务处于启用状态
  const titleRows = await db
    .select({
      id: staffTitles.id,
      name: staffTitles.name,
      category: staffTitles.category,
      holderForceRealName: users.forceRealName,
    })
    .from(classAssignments)
    .innerJoin(staffTitles, eq(staffTitles.id, classAssignments.titleId))
    .innerJoin(users, eq(users.id, classAssignments.userId))
    .where(
      and(
        eq(classAssignments.classId, classId),
        eq(staffTitles.isActive, true)
      )
    )
    .orderBy(asc(staffTitles.sortOrder), staffTitles.id);

  // 去重（同一职务可能多人在任）；任一在任人要求实名，则该职务强制实名
  const seen = new Set<number>();
  const forceTitleIds = new Set<number>();
  for (const t of titleRows) {
    if (t.holderForceRealName) forceTitleIds.add(t.id);
  }
  const groupOptions = titleRows
    .filter((t) => {
      if (seen.has(t.id)) return false;
      seen.add(t.id);
      return true;
    })
    .map((t) => ({
      id: t.id,
      name: t.name,
      category: t.category,
      forceRealName: forceTitleIds.has(t.id),
    }));

  const categories = await db
    .select({
      id: suggestionCategories.id,
      name: suggestionCategories.name,
      sortOrder: suggestionCategories.sortOrder,
    })
    .from(suggestionCategories)
    .where(eq(suggestionCategories.isActive, true))
    .orderBy(asc(suggestionCategories.sortOrder), suggestionCategories.id);

  return ok({
    myClass: cls ?? { id: classId, name: "未知班级" },
    groupOptions,
    categories,
    anonymousQuota: await getAnonymousQuota(user.id),
  });
}
