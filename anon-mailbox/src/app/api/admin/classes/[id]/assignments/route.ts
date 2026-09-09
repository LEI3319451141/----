import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { classAssignments, classes, staffTitles, users } from "@/db/schema";
import { fail, ok } from "@/lib/api";
import { STAFF_CATEGORY_LABELS } from "@/lib/rbac";
import { requireRole } from "@/lib/guard";

export const runtime = "nodejs";

/** 班级授权名单（每人的职务） */
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
      titleId: staffTitles.id,
      titleName: staffTitles.name,
      category: staffTitles.category,
      status: users.status,
    })
    .from(classAssignments)
    .innerJoin(users, eq(users.id, classAssignments.userId))
    .innerJoin(staffTitles, eq(staffTitles.id, classAssignments.titleId))
    .where(eq(classAssignments.classId, classId))
    .orderBy(staffTitles.sortOrder, staffTitles.id, classAssignments.id);

  return ok(
    list.map((r) => ({
      ...r,
      categoryLabel: STAFF_CATEGORY_LABELS[r.category] ?? r.category,
    }))
  );
}

const assignSchema = z.object({
  userId: z.number().int().positive(),
  titleId: z.number().int().positive(),
});

/**
 * 为班级人员授予职务（幂等：同一人同一职务不重复授权）。
 * 授予班干部类职务时，若对方是学生身份，自动升级为班干部角色。
 */
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
  const { userId, titleId } = parsed.data;

  const [classExists] = await db
    .select({ id: classes.id })
    .from(classes)
    .where(eq(classes.id, classId))
    .limit(1);
  if (!classExists) return fail(404, "班级不存在");

  const [userRow] = await db
    .select({ id: users.id, role: users.role })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (!userRow) return fail(404, "用户不存在");

  const [title] = await db
    .select({
      id: staffTitles.id,
      name: staffTitles.name,
      category: staffTitles.category,
      isActive: staffTitles.isActive,
    })
    .from(staffTitles)
    .where(eq(staffTitles.id, titleId))
    .limit(1);
  if (!title) return fail(404, "职务不存在");
  if (!title.isActive) return fail(400, `职务「${title.name}」已停用，请先启用`);

  const [existing] = await db
    .select({ id: classAssignments.id })
    .from(classAssignments)
    .where(
      and(
        eq(classAssignments.classId, classId),
        eq(classAssignments.userId, userId),
        eq(classAssignments.titleId, titleId)
      )
    )
    .limit(1);
  if (existing) {
    return ok({ id: existing.id, updated: true });
  }

  const [created] = await db
    .insert(classAssignments)
    .values({ classId, userId, titleId })
    .returning({ id: classAssignments.id });

  // 角色同步：学生被授予职务后，按职务类别升级为对应接收端角色
  // （班干部类→cadre；辅导员/教师类→counselor/teacher）
  if (userRow.role === "student") {
    await db
      .update(users)
      .set({ role: title.category, updatedAt: new Date() })
      .where(eq(users.id, userId));
  }

  return ok({ id: created.id, updated: false }, 201);
}
