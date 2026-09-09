import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { classAssignments, studentEnrollments, users } from "@/db/schema";
import { fail, ok } from "@/lib/api";
import { requireRole } from "@/lib/guard";

export const runtime = "nodejs";

/** 班级学生名单（含班干部职务）——仅超管可见真实姓名/学号 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await requireRole("super_admin");
  if ("response" in guard) return guard.response;

  const { id } = await params;
  const classId = Number(id);
  if (!Number.isInteger(classId)) return fail(400, "班级 ID 不正确");

  const rows = await db
    .select({
      userId: users.id,
      studentNo: studentEnrollments.studentNo,
      realName: users.realName,
      loginId: users.loginId,
      status: users.status,
      cadreTitle: classAssignments.title,
    })
    .from(studentEnrollments)
    .innerJoin(users, eq(users.id, studentEnrollments.userId))
    .leftJoin(
      classAssignments,
      and(
        eq(classAssignments.userId, studentEnrollments.userId),
        eq(classAssignments.classId, studentEnrollments.classId),
        eq(classAssignments.staffRole, "cadre")
      )
    )
    .where(eq(studentEnrollments.classId, classId))
    .orderBy(studentEnrollments.studentNo);

  return ok(rows);
}
