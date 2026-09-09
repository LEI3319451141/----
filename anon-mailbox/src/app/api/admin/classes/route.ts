import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { classAssignments, classes, studentEnrollments } from "@/db/schema";
import { fail, ok } from "@/lib/api";
import { isUniqueViolation, requireRole } from "@/lib/guard";

export const runtime = "nodejs";

export async function GET() {
  const guard = await requireRole("super_admin");
  if ("response" in guard) return guard.response;

  const list = await db.select().from(classes).orderBy(classes.id);

  // 各班学生数
  const studentCounts = await db
    .select({
      classId: studentEnrollments.classId,
      count: sql<number>`count(*)::int`,
    })
    .from(studentEnrollments)
    .groupBy(studentEnrollments.classId);

  // 各班教职工/班干部授权数
  const staffCounts = await db
    .select({
      classId: classAssignments.classId,
      count: sql<number>`count(*)::int`,
    })
    .from(classAssignments)
    .groupBy(classAssignments.classId);

  return ok(
    list.map((c) => ({
      ...c,
      studentCount: studentCounts.find((s) => s.classId === c.id)?.count ?? 0,
      staffCount: staffCounts.find((s) => s.classId === c.id)?.count ?? 0,
    }))
  );
}

const createSchema = z.object({
  name: z.string().trim().min(2, "班级名称至少 2 个字符").max(128),
  grade: z.string().trim().max(32).optional(),
  department: z.string().trim().max(128).optional(),
});

export async function POST(req: Request) {
  const guard = await requireRole("super_admin");
  if ("response" in guard) return guard.response;

  const body = await req.json().catch(() => null);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return fail(400, parsed.error.issues[0]?.message ?? "参数不正确");
  }

  try {
    const [created] = await db
      .insert(classes)
      .values({
        name: parsed.data.name,
        grade: parsed.data.grade ?? null,
        department: parsed.data.department ?? null,
        createdBy: guard.user.id,
      })
      .returning();
    return ok(created, 201);
  } catch (e) {
    if (isUniqueViolation(e)) return fail(409, "班级名称已存在");
    throw e;
  }
}
