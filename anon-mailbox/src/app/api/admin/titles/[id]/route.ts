import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { classAssignments, staffTitles } from "@/db/schema";
import { fail, ok } from "@/lib/api";
import { isUniqueViolation, requireRole } from "@/lib/guard";

export const runtime = "nodejs";

const patchSchema = z
  .object({
    name: z.string().trim().min(1).max(64).optional(),
    category: z.enum(["counselor", "teacher", "cadre"]).optional(),
    isActive: z.boolean().optional(),
    sortOrder: z.number().int().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, "无更新字段");

/** 编辑职务：改名 / 调整类别 / 停用启用（停用后学生写信时不再可选，存量建议不受影响） */
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await requireRole("super_admin");
  if ("response" in guard) return guard.response;

  const { id } = await params;
  const titleId = Number(id);
  if (!Number.isInteger(titleId)) return fail(400, "职务 ID 不正确");

  const body = await req.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return fail(400, parsed.error.issues[0]?.message ?? "参数不正确");
  }

  const [title] = await db
    .select({ id: staffTitles.id, name: staffTitles.name })
    .from(staffTitles)
    .where(eq(staffTitles.id, titleId))
    .limit(1);
  if (!title) return fail(404, "职务不存在");

  // 停用职务不影响在任授权；但若停用时仍有在任人员，给出提示但允许操作
  try {
    const [updated] = await db
      .update(staffTitles)
      .set({ ...parsed.data, updatedAt: new Date() })
      .where(eq(staffTitles.id, titleId))
      .returning({
        id: staffTitles.id,
        name: staffTitles.name,
        category: staffTitles.category,
        isActive: staffTitles.isActive,
      });
    return ok(updated);
  } catch (e) {
    if (isUniqueViolation(e)) return fail(409, "该职务名称已存在");
    throw e;
  }
}

/** 删除职务：仅允许删除"无人在任"的职务（有授权记录时外键 RESTRICT 会拒绝） */
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await requireRole("super_admin");
  if ("response" in guard) return guard.response;

  const { id } = await params;
  const titleId = Number(id);
  if (!Number.isInteger(titleId)) return fail(400, "职务 ID 不正确");

  const [inUse] = await db
    .select({ id: classAssignments.id })
    .from(classAssignments)
    .where(and(eq(classAssignments.titleId, titleId)))
    .limit(1);
  if (inUse) {
    return fail(409, "该职务仍有人在任，无法删除（可改为停用）");
  }

  await db.delete(staffTitles).where(eq(staffTitles.id, titleId));
  return ok({ success: true });
}
