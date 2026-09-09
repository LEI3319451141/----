import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { classAssignments, staffTitles, users } from "@/db/schema";
import { ok } from "@/lib/api";
import { STAFF_CATEGORY_LABELS, getStudentClassId } from "@/lib/rbac";
import { requireUser } from "@/lib/guard";

export const runtime = "nodejs";

/**
 * 本班接收端名录：学生提交"指定专人"建议时选择目标。
 * 返回本班所有职务持有者（姓名+职务属班级公开信息）。
 */
export async function GET() {
  const guard = await requireUser();
  if ("response" in guard) return guard.response;
  const user = guard.user;

  const classId = await getStudentClassId(user.id);
  if (!classId) {
    return ok({ items: [] });
  }

  const rows = await db
    .select({
      id: users.id,
      name: users.realName,
      titleId: staffTitles.id,
      titleName: staffTitles.name,
      category: staffTitles.category,
    })
    .from(classAssignments)
    .innerJoin(users, eq(users.id, classAssignments.userId))
    .innerJoin(staffTitles, eq(staffTitles.id, classAssignments.titleId))
    .where(eq(classAssignments.classId, classId))
    .orderBy(asc(staffTitles.sortOrder), users.id);

  return ok({
    items: rows.map((r) => ({
      id: r.id,
      name: r.name,
      titleId: r.titleId,
      titleName: r.titleName,
      category: r.category,
      categoryLabel: STAFF_CATEGORY_LABELS[r.category] ?? r.category,
    })),
  });
}
