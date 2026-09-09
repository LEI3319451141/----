import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { users } from "@/db/schema";
import { fail, ok } from "@/lib/api";
import { hashPassword } from "@/lib/auth";
import { requireRole } from "@/lib/guard";

export const runtime = "nodejs";

const patchSchema = z.object({
  status: z.enum(["active", "disabled"]).optional(),
  realName: z.string().trim().min(1).max(64).optional(),
  resetPassword: z.string().trim().min(6, "重置密码至少 6 位").max(128).optional(),
});

/** 启用/停用账号、修改姓名、重置密码 */
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await requireRole("super_admin");
  if ("response" in guard) return guard.response;

  const { id } = await params;
  const userId = Number(id);
  if (!Number.isInteger(userId)) return fail(400, "用户 ID 不正确");

  const body = await req.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return fail(400, parsed.error.issues[0]?.message ?? "参数不正确");
  }

  const [target] = await db
    .select({ id: users.id, role: users.role })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (!target) return fail(404, "用户不存在");
  if (target.role === "super_admin" && parsed.data.status === "disabled") {
    return fail(400, "不能停用超级管理员账号");
  }

  await db
    .update(users)
    .set({
      ...(parsed.data.status ? { status: parsed.data.status } : {}),
      ...(parsed.data.realName ? { realName: parsed.data.realName } : {}),
      ...(parsed.data.resetPassword
        ? {
            passwordHash: await hashPassword(parsed.data.resetPassword),
            mustResetPassword: true,
          }
        : {}),
      updatedAt: new Date(),
    })
    .where(eq(users.id, userId));

  return ok({ success: true });
}
