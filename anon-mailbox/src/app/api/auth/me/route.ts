import { eq } from "drizzle-orm";
import { db } from "@/db";
import { classAssignments, classes, studentEnrollments } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth";
import { fail, ok } from "@/lib/api";
import { ROLE_LABELS } from "@/lib/labels";

export const runtime = "nodejs";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return fail(401, "未登录");

  // 学籍（学生 / 有学籍的班干部）
  const [enrollment] = await db
    .select({
      classId: classes.id,
      className: classes.name,
      grade: classes.grade,
      department: classes.department,
    })
    .from(studentEnrollments)
    .innerJoin(classes, eq(classes.id, studentEnrollments.classId))
    .where(eq(studentEnrollments.userId, user.id))
    .limit(1);

  // 班级授权（辅导员 / 科任教师 / 班干部）
  const managedClasses = await db
    .select({
      classId: classes.id,
      className: classes.name,
      grade: classes.grade,
      department: classes.department,
      staffRole: classAssignments.staffRole,
      title: classAssignments.title,
    })
    .from(classAssignments)
    .innerJoin(classes, eq(classes.id, classAssignments.classId))
    .where(eq(classAssignments.userId, user.id));

  return ok({
    user: {
      id: user.id,
      loginId: user.loginId,
      realName: user.realName,
      role: user.role,
      roleLabel: ROLE_LABELS[user.role] ?? user.role,
      mustResetPassword: user.mustResetPassword,
    },
    isSuperAdmin: user.role === "super_admin",
    studentClass: enrollment ?? null,
    managedClasses,
  });
}
