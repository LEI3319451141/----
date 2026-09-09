import { SignJWT, jwtVerify } from "jose";
import bcrypt from "bcryptjs";
import { cookies, headers } from "next/headers";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";

export const COOKIE_NAME = "mb_token";

function getSecret() {
  const s = process.env.JWT_SECRET;
  if (!s || s.length < 16) {
    throw new Error("环境变量 JWT_SECRET 未正确配置（至少 16 位）");
  }
  return new TextEncoder().encode(s);
}

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, 10);
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

export interface TokenPayload {
  userId: number;
  role: string;
  loginId: string;
}

export async function signToken(payload: TokenPayload): Promise<string> {
  return new SignJWT({ role: payload.role, loginId: payload.loginId })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(String(payload.userId))
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(getSecret());
}

async function verifyToken(token: string): Promise<TokenPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret());
    if (!payload.sub) return null;
    return {
      userId: Number(payload.sub),
      role: String(payload.role),
      loginId: String(payload.loginId ?? ""),
    };
  } catch {
    return null;
  }
}

async function getTokenFromRequest(): Promise<string | null> {
  const h = await headers();
  const auth = h.get("authorization");
  if (auth?.startsWith("Bearer ")) return auth.slice(7);
  const c = await cookies();
  return c.get(COOKIE_NAME)?.value ?? null;
}

export type CurrentUser = typeof users.$inferSelect;

/** 从请求（Bearer token 或 cookie）解析当前登录用户，无效/停用返回 null */
export async function getCurrentUser(): Promise<CurrentUser | null> {
  const token = await getTokenFromRequest();
  if (!token) return null;
  const payload = await verifyToken(token);
  if (!payload) return null;
  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.id, payload.userId))
    .limit(1);
  if (!user || user.status !== "active") return null;
  return user;
}
