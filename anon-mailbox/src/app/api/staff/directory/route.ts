import { eq } from "drizzle-orm";
import { db } from "@/db";
import { classAssignments, users } from "@/db/schema";
import { ok } from "@/lib/api";
import { STAFF_ROLE_LABELS, getStudentClassId } from "@/lib/rbac";
import { requireUser } from "@/lib/guard";

export const runtime = "nodejs";

/**
 * 本班接收端名录：学生提交"指定专人"建议时选择目标。
 * 仅返回本人所在班级的辅导员/教师/班干部（姓名+职务属班级公开信息）。
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
      role: classAssignments.staffRole,
      title: classAssignments.title,
    })
    .from(classAssignments)
    .innerJoin(users, eq(users.id, classAssignments.userId))
    .where(eq(classAssignments.classId, classId))
    .orderBy(classAssignments.staffRole, users.id);

  return ok({
    items: rows.map((r) => ({
      id: r.id,
      name: r.name,
      role: r.role,
      roleLabel: STAFF_ROLE_LABELS[r.role] ?? r.role,
      title: r.title,
    })),
  });
}
