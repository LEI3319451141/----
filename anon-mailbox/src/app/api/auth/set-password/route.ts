import { z } from "zod";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { users } from "@/db/schema";
import { hashPassword, signToken, COOKIE_NAME } from "@/lib/auth";
import { ROLE_LABELS } from "@/lib/labels";

const schema = z.object({
  loginId: z.string().trim().min(1, "请输入账号").max(64),
  password: z.string().min(6, "密码至少 6 位").max(128),
});

/**
 * 白名单账号首次设置密码。
 * 仅允许「passwordHash 为空」的账号（即管理员导入但未设密码的白名单账号）调用。
 * 设置成功后直接签发登录态。
 */
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "参数错误" },
      { status: 400 }
    );
  }
  const { loginId, password } = parsed.data;

  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.loginId, loginId))
    .limit(1);

  if (!user || user.status !== "active") {
    return NextResponse.json(
      { error: "账号不存在" },
      { status: 404 }
    );
  }

  // 已经设置过密码的账号不能再走此接口（防止覆盖）
  if (user.passwordHash) {
    return NextResponse.json(
      { error: "该账号已设置密码，请直接登录" },
      { status: 409 }
    );
  }

  const passwordHash = await hashPassword(password);
  const [updated] = await db
    .update(users)
    .set({ passwordHash, mustResetPassword: false })
    .where(eq(users.id, user.id))
    .returning({ id: users.id });

  if (!updated) {
    return NextResponse.json({ error: "设置失败" }, { status: 500 });
  }

  const token = await signToken({
    userId: user.id,
    role: user.role,
    loginId: user.loginId,
  });

  const res = NextResponse.json({
    token,
    user: {
      id: user.id,
      loginId: user.loginId,
      realName: user.realName,
      role: user.role,
      roleLabel: ROLE_LABELS[user.role] ?? user.role,
      mustResetPassword: false,
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
