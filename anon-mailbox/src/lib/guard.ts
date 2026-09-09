import type { CurrentUser } from "./auth";
import { getCurrentUser } from "./auth";
import { fail } from "./api";

export type GuardResult = { user: CurrentUser } | { response: Response };

export async function requireUser(): Promise<GuardResult> {
  const user = await getCurrentUser();
  if (!user) return { response: fail(401, "未登录或登录已过期") };
  return { user };
}

export async function requireRole(...roles: string[]): Promise<GuardResult> {
  const result = await requireUser();
  if ("response" in result) return result;
  if (!roles.includes(result.user.role)) {
    return { response: fail(403, "无权限执行此操作") };
  }
  return result;
}

/** 统一处理 Postgres 唯一约束冲突 */
export function isUniqueViolation(e: unknown): boolean {
  return typeof e === "object" && e !== null && "code" in e && (e as { code?: string }).code === "23505";
}
