import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { users } from "@/db/schema";
import { COOKIE_NAME, signToken, verifyPassword } from "@/lib/auth";
import { fail, ok } from "@/lib/api";
import { ROLE_LABELS } from "@/lib/labels";

export const runtime = "nodejs";

const loginSchema = z.object({
  loginId: z.string().trim().min(1, "请输入账号").max(64),
  password: z.string().min(1, "请输入密码").max(128),
});

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = loginSchema.safeParse(body);
  if (!parsed.success) {
    return fail(400, "账号或密码格式不正确");
  }
  const { loginId, password } = parsed.data;

  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.loginId, loginId))
    .limit(1);

  // 统一提示，避免账号枚举
  if (!user || user.status !== "active") {
    return fail(401, "账号或密码错误");
  }

  // 密码为空 → 白名单账号尚未设置初始密码，引导学生先设置
  if (!user.passwordHash) {
    return ok({
      needsPasswordSetup: true,
      loginId: user.loginId,
      message: "该账号尚未设置密码，请先设置密码",
    });
  }

  const valid = await verifyPassword(password, user.passwordHash);
  if (!valid) {
    return fail(401, "账号或密码错误");
  }

  const token = await signToken({
    userId: user.id,
    role: user.role,
    loginId: user.loginId,
  });

  const res = ok({
    token,
    user: {
      id: user.id,
      loginId: user.loginId,
      realName: user.realName,
      role: user.role,
      roleLabel: ROLE_LABELS[user.role] ?? user.role,
      mustResetPassword: user.mustResetPassword,
    },
  });
  res.cookies.set(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });
  return res;
}
