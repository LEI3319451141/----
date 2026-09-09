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

/** 职务类别（粗粒度权限） */
export const STAFF_CATEGORY_LABELS: Record<string, string> = {
  counselor: "辅导员",
  teacher: "科任老师",
  cadre: "班干部",
};

/** 接收端角色（users.role）：可以查看/处理建议的人 */
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
 * - 职务持有者（辅导员/教师/班干部）：取 class_assignments 授权记录
 * - 学生：取自己所在班级（公开建议全班可见）
 * 这是所有建议查询的强制过滤条件，防止越权（IDOR）。
 */
export async function getAccessibleClassIds(
  userId: number,
  role: string
): Promise<number[] | "all"> {
  if (role === "super_admin") return "all";

  // 职务持有者：从授权表取（班干部是学生兼任，也走这条，与其学籍班级一致）
  const assignmentRows = await db
    .select({ classId: classAssignments.classId })
    .from(classAssignments)
    .where(eq(classAssignments.userId, userId));
  if (assignmentRows.length > 0) {
    return Array.from(new Set(assignmentRows.map((r) => r.classId)));
  }

  // 普通学生：只能看自己所在班级
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
 * - group：仅在本班持有目标职务的人可见（职务动态可配置，按 class_assignments 判定）
 * - person：仅被指定的本人可见（含超管在内其他任何人不可见）
 */
export function visibilityCondition(user: CurrentUser): SQL {
  const publicCond = sql`${suggestions.visibility} = 'public'`;
  const personCond = sql`(
    ${suggestions.visibility} = 'person'
    AND ${suggestions.targetUserId} = ${user.id}
  )`;
  // 群体可见：当前用户在该建议班级持有任一目标职务
  const groupCond = sql`(
    ${suggestions.visibility} = 'group'
    AND EXISTS (
      SELECT 1 FROM ${classAssignments} ca
      WHERE ca.class_id = ${suggestions.classId}
        AND ca.user_id = ${user.id}
        AND ca.title_id = ANY(${suggestions.targetTitleIds})
    )
  )`;

  // 超管：可见 public + group（便于全局管理），不可见 person（严格保护）
  if (user.role === "super_admin") {
    return sql`(${publicCond} OR ${suggestions.visibility} = 'group')`;
  }

  // 其他所有登录用户（含学生）：公开 + 自己持有的职务群体 + 指定给自己的专人建议
  return sql`(${publicCond} OR ${groupCond} OR ${personCond})`;
}
