import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { classAssignments, classes, users } from "@/db/schema";
import { fail, ok } from "@/lib/api";
import { requireRole } from "@/lib/guard";
import { ROLE_LABELS } from "@/lib/labels";

export const runtime = "nodejs";

/** 班级授权名单（辅导员/科任教师/班干部） */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await requireRole("super_admin");
  if ("response" in guard) return guard.response;

  const { id } = await params;
  const classId = Number(id);
  if (!Number.isInteger(classId)) return fail(400, "班级 ID 不正确");

  const list = await db
    .select({
      id: classAssignments.id,
      userId: users.id,
      loginId: users.loginId,
      realName: users.realName,
      staffRole: classAssignments.staffRole,
      title: classAssignments.title,
      status: users.status,
    })
    .from(classAssignments)
    .innerJoin(users, eq(users.id, classAssignments.userId))
    .where(eq(classAssignments.classId, classId))
    .orderBy(classAssignments.staffRole, classAssignments.id);

  return ok(
    list.map((r) => ({
      ...r,
      staffRoleLabel: ROLE_LABELS[r.staffRole] ?? r.staffRole,
    }))
  );
}

const assignSchema = z.object({
  userId: z.number().int().positive(),
  staffRole: z.enum(["counselor", "teacher", "cadre"]),
  title: z.string().trim().max(64).optional(),
});

/** 为班级分配人员（幂等：已存在则更新 title） */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await requireRole("super_admin");
  if ("response" in guard) return guard.response;

  const { id } = await params;
  const classId = Number(id);
  if (!Number.isInteger(classId)) return fail(400, "班级 ID 不正确");

  const body = await req.json().catch(() => null);
  const parsed = assignSchema.safeParse(body);
  if (!parsed.success) {
    return fail(400, parsed.error.issues[0]?.message ?? "参数不正确");
  }
  const { userId, staffRole, title } = parsed.data;

  const [classExists] = await db
    .select({ id: classes.id })
    .from(classes)
    .where(eq(classes.id, classId))
    .limit(1);
  if (!classExists) return fail(404, "班级不存在");

  const [userExists] = await db
    .select({ id: users.id, role: users.role })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (!userExists) return fail(404, "用户不存在");

  const [existing] = await db
    .select({ id: classAssignments.id })
    .from(classAssignments)
    .where(
      and(
        eq(classAssignments.classId, classId),
        eq(classAssignments.userId, userId),
        eq(classAssignments.staffRole, staffRole)
      )
    )
    .limit(1);

  if (existing) {
    await db
      .update(classAssignments)
      .set({ title: title ?? null })
      .where(eq(classAssignments.id, existing.id));
    return ok({ id: existing.id, updated: true });
  }

  const [created] = await db
    .insert(classAssignments)
    .values({ classId, userId, staffRole, title: title ?? null })
    .returning({ id: classAssignments.id });
  return ok({ id: created.id, updated: false }, 201);
}
