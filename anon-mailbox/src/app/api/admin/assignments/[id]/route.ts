import { eq } from "drizzle-orm";
import { db } from "@/db";
import {
  classAssignments,
  staffTitles,
  studentEnrollments,
  users,
} from "@/db/schema";
import { fail, ok } from "@/lib/api";
import { requireRole } from "@/lib/guard";

export const runtime = "nodejs";

/**
 * 移除一条班级授权（卸任职务）。
 * 若该用户是有学籍的学生，且已无任何在任职务，则角色回退为普通学生。
 */
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await requireRole("super_admin");
  if ("response" in guard) return guard.response;

  const { id } = await params;
  const assignmentId = Number(id);
  if (!Number.isInteger(assignmentId)) return fail(400, "授权 ID 不正确");

  const [target] = await db
    .select({
      id: classAssignments.id,
      userId: classAssignments.userId,
      classId: classAssignments.classId,
      category: staffTitles.category,
    })
    .from(classAssignments)
    .innerJoin(staffTitles, eq(staffTitles.id, classAssignments.titleId))
    .where(eq(classAssignments.id, assignmentId))
    .limit(1);
  if (!target) return fail(404, "授权记录不存在");

  await db
    .delete(classAssignments)
    .where(eq(classAssignments.id, assignmentId));

  // 角色回退：学生身份且已无任何在任职务 → 恢复为普通学生
  const [userRow] = await db
    .select({ id: users.id, role: users.role })
    .from(users)
    .where(eq(users.id, target.userId))
    .limit(1);

  if (userRow) {
    const [enrollment] = await db
      .select({ id: studentEnrollments.id })
      .from(studentEnrollments)
      .where(eq(studentEnrollments.userId, target.userId))
      .limit(1);
    const remaining = await db
      .select({ id: classAssignments.id })
      .from(classAssignments)
      .where(eq(classAssignments.userId, target.userId))
      .limit(1);

    if (enrollment && remaining.length === 0) {
      await db
        .update(users)
        .set({ role: "student", updatedAt: new Date() })
        .where(eq(users.id, target.userId));
    }
  }

  return ok({ success: true });
}
