import { eq, sql, SQL } from "drizzle-orm";
import { db } from "@/db";
import {
  classAssignments,
  studentEnrollments,
  suggestions,
} from "@/db/schema";
import type { CurrentUser } from "./auth";

/** 建议可见性类型 */
export type SuggestionVisibility = "public" | "group" | "person";

/** 群体定向可选的角色 */
export const TARGETABLE_STAFF_ROLES = ["counselor", "teacher", "cadre"] as const;
export type TargetableStaffRole = (typeof TARGETABLE_STAFF_ROLES)[number];

export const STAFF_ROLE_LABELS: Record<string, string> = {
  counselor: "辅导员",
  teacher: "科任老师",
  cadre: "班干部",
};

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

/**
 * 建议可见性 SQL 过滤条件（班级隔离之外的第二道强制过滤）：
 * - public：全班所有人可见
 * - group：仅被选中的角色群体成员可见（超管可看，便于全局管理）
 * - person：仅被指定的本人可见（含超管在内其他任何人不可见）
 */
export function visibilityCondition(user: CurrentUser): SQL {
  const publicCond = sql`${suggestions.visibility} = 'public'`;
  const personCond = sql`(
    ${suggestions.visibility} = 'person'
    AND ${suggestions.targetUserId} = ${user.id}
  )`;

  // 超管：可见 public + group（便于全局管理），不可见 person（严格保护）
  if (user.role === "super_admin") {
    return sql`(${publicCond} OR ${suggestions.visibility} = 'group')`;
  }

  // 教职工/班干部：可见 public + 被点名的 group + 被指定的 person
  if (isStaffRole(user.role)) {
    // user.role 来自 JWT/数据库，非用户输入；用单引号包裹为字符串字面量
    const roleLiteral = sql.raw(`'${user.role}'`);
    const groupCond = sql`(
      ${suggestions.visibility} = 'group'
      AND ${suggestions.targetGroups} && ARRAY[${roleLiteral}]::"staff_role"[]
    )`;
    return sql`(${publicCond} OR ${groupCond} OR ${personCond})`;
  }

  // 学生：仅可见 public + 被指定给自己的 person
  return sql`(${publicCond} OR ${personCond})`;
}
