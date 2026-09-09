import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { users } from "@/db/schema";
import { getCurrentUser, hashPassword, verifyPassword } from "@/lib/auth";
import { fail, ok } from "@/lib/api";

export const runtime = "nodejs";

const schema = z.object({
  oldPassword: z.string().min(1).max(128),
  newPassword: z.string().min(6, "新密码至少 6 位").max(128),
});

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return fail(401, "未登录");

  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return fail(400, parsed.error.issues[0]?.message ?? "参数不正确");
  }
  const { oldPassword, newPassword } = parsed.data;

  const valid = await verifyPassword(oldPassword, user.passwordHash);
  if (!valid) return fail(400, "原密码错误");

  await db
    .update(users)
    .set({
      passwordHash: await hashPassword(newPassword),
      mustResetPassword: false,
      updatedAt: new Date(),
    })
    .where(eq(users.id, user.id));

  return ok({ success: true });
}
