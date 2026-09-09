import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { suggestionCategories } from "@/db/schema";
import { fail, ok } from "@/lib/api";
import { isUniqueViolation, requireRole } from "@/lib/guard";

export const runtime = "nodejs";

const patchSchema = z.object({
  name: z.string().trim().min(1).max(64).optional(),
  sortOrder: z.number().int().min(0).optional(),
  isActive: z.boolean().optional(),
});

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await requireRole("super_admin");
  if ("response" in guard) return guard.response;

  const { id } = await params;
  const categoryId = Number(id);
  if (!Number.isInteger(categoryId)) return fail(400, "分类 ID 不正确");

  const body = await req.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return fail(400, parsed.error.issues[0]?.message ?? "参数不正确");
  }

  try {
    const [updated] = await db
      .update(suggestionCategories)
      .set(parsed.data)
      .where(eq(suggestionCategories.id, categoryId))
      .returning();
    if (!updated) return fail(404, "分类不存在");
    return ok(updated);
  } catch (e) {
    if (isUniqueViolation(e)) return fail(409, "分类名称已存在");
    throw e;
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await requireRole("super_admin");
  if ("response" in guard) return guard.response;

  const { id } = await params;
  const categoryId = Number(id);
  if (!Number.isInteger(categoryId)) return fail(400, "分类 ID 不正确");

  // 建议表外键为 set null，删除分类不影响历史建议
  await db
    .delete(suggestionCategories)
    .where(eq(suggestionCategories.id, categoryId));
  return ok({ success: true });
}
