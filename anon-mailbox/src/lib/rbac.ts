import { eq } from "drizzle-orm";
import { db } from "@/db";
import { classAssignments, studentEnrollments } from "@/db/schema";
import type { CurrentUser } from "./auth";

/** 接收端角色：可以查看/处理建议的人 */
export function isStaffRole(role: string): boolean {
  return (
    role === "super_admin" ||
    role === "counselor" ||
    role === "teacher" ||
    role === "cadre"
  );
}

/**
 * 返回用户可查看建议的班级 ID 集合。
 * - super_admin：返回 "all"（全局可见）
 * - 辅导员/科任教师/班干部：取 class_assignments 授权记录
 * - 学生：取自己所在班级（所有人可见本班所有建议）
 * 这是所有建议查询的强制过滤条件，防止越权（IDOR）。
 */
export async function getAccessibleClassIds(
  userId: number,
  role: string
): Promise<number[] | "all"> {
  if (role === "super_admin") return "all";

  // 教职工/班干部：从授权表取
  if (isStaffRole(role)) {
    const rows = await db
      .select({ classId: classAssignments.classId })
      .from(classAssignments)
      .where(eq(classAssignments.userId, userId));
    return Array.from(new Set(rows.map((r) => r.classId)));
  }

  // 学生：只能看自己所在班级
  const studentClassId = await getStudentClassId(userId);
  return studentClassId ? [studentClassId] : [];
}

/** 学生（及有学籍的班干部）所在班级 ID */
export async function getStudentClassId(userId: number): Promise<number | null> {
  const [row] = await db
    .select({ classId: studentEnrollments.classId })
    .from(studentEnrollments)
    .where(eq(studentEnrollments.userId, userId))
    .limit(1);
  return row?.classId ?? null;
}

/** 校验用户是否有权访问某个班级的建议 */
export async function canAccessClass(
  user: CurrentUser,
  classId: number
): Promise<boolean> {
  const ids = await getAccessibleClassIds(user.id, user.role);
  if (ids === "all") return true;
  return ids.includes(classId);
}
