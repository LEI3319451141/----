import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { classes } from "@/db/schema";
import { fail, ok } from "@/lib/api";
import { isUniqueViolation, requireRole } from "@/lib/guard";

export const runtime = "nodejs";

const patchSchema = z.object({
  name: z.string().trim().min(2).max(128).optional(),
  grade: z.string().trim().max(32).optional(),
  department: z.string().trim().max(128).optional(),
  status: z.enum(["active", "archived"]).optional(),
});

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await requireRole("super_admin");
  if ("response" in guard) return guard.response;

  const { id } = await params;
  const classId = Number(id);
  if (!Number.isInteger(classId)) return fail(400, "班级 ID 不正确");

  const body = await req.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return fail(400, parsed.error.issues[0]?.message ?? "参数不正确");
  }

  try {
    const [updated] = await db
      .update(classes)
      .set({ ...parsed.data, updatedAt: new Date() })
      .where(eq(classes.id, classId))
      .returning();
    if (!updated) return fail(404, "班级不存在");
    return ok(updated);
  } catch (e) {
    if (isUniqueViolation(e)) return fail(409, "班级名称已存在");
    throw e;
  }
}
