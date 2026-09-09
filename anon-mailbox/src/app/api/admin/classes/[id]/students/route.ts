import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import {
  classAssignments,
  staffTitles,
  studentEnrollments,
  users,
} from "@/db/schema";
import { ok } from "@/lib/api";
import { requireRole } from "@/lib/guard";

export const runtime = "nodejs";

/** 班级学生名单（含所任职务）——仅超管可见真实姓名/学号 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await requireRole("super_admin");
  if ("response" in guard) return guard.response;

  const { id } = await params;
  const classId = Number(id);
  if (!Number.isInteger(classId)) return ok([]);

  const rows = await db
    .select({
      userId: users.id,
      studentNo: studentEnrollments.studentNo,
      realName: users.realName,
      loginId: users.loginId,
      status: users.status,
      titleName: staffTitles.name,
      titleCategory: staffTitles.category,
    })
    .from(studentEnrollments)
    .innerJoin(users, eq(users.id, studentEnrollments.userId))
    .leftJoin(
      classAssignments,
      and(
        eq(classAssignments.userId, studentEnrollments.userId),
        eq(classAssignments.classId, studentEnrollments.classId)
      )
    )
    .leftJoin(staffTitles, eq(staffTitles.id, classAssignments.titleId))
    .where(eq(studentEnrollments.classId, classId))
    .orderBy(studentEnrollments.studentNo, staffTitles.sortOrder);

  // 同一学生可能身兼多职，聚合成数组
  const map = new Map<
    number,
    {
      userId: number;
      studentNo: string;
      realName: string;
      loginId: string;
      status: string;
      titles: string[];
    }
  >();
  for (const r of rows) {
    const existing = map.get(r.userId);
    if (existing) {
      if (r.titleName && !existing.titles.includes(r.titleName)) {
        existing.titles.push(r.titleName);
      }
    } else {
      map.set(r.userId, {
        userId: r.userId,
        studentNo: r.studentNo,
        realName: r.realName,
        loginId: r.loginId,
        status: r.status,
        titles: r.titleName ? [r.titleName] : [],
      });
    }
  }

  return ok(Array.from(map.values()));
}
