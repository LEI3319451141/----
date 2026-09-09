import { eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { classAssignments, classes, users } from "@/db/schema";
import { fail, ok } from "@/lib/api";
import { hashPassword } from "@/lib/auth";
import { isUniqueViolation, requireRole } from "@/lib/guard";

export const runtime = "nodejs";

/** 教职工列表（辅导员 / 科任教师），附带班级授权信息 */
export async function GET(req: Request) {
  const guard = await requireRole("super_admin");
  if ("response" in guard) return guard.response;

  const url = new URL(req.url);
  const roleFilter = url.searchParams.get("role");
  const roles: ("counselor" | "teacher")[] =
    roleFilter === "counselor" || roleFilter === "teacher"
      ? [roleFilter]
      : ["counselor", "teacher"];

  const list = await db
    .select({
      id: users.id,
      loginId: users.loginId,
      realName: users.realName,
      role: users.role,
      status: users.status,
      mustResetPassword: users.mustResetPassword,
      createdAt: users.createdAt,
    })
    .from(users)
    .where(inArray(users.role, roles))
    .orderBy(users.id);

  const assignments = await db
    .select({
      userId: classAssignments.userId,
      classId: classAssignments.classId,
      className: classes.name,
      staffRole: classAssignments.staffRole,
      title: classAssignments.title,
    })
    .from(classAssignments)
    .innerJoin(classes, eq(classes.id, classAssignments.classId))
    .where(
      inArray(
        classAssignments.userId,
        list.map((u) => u.id)
      )
    );

  return ok(
    list.map((u) => ({
      ...u,
      assignments: assignments.filter((a) => a.userId === u.id),
    }))
  );
}

const createSchema = z.object({
  loginId: z
    .string()
    .trim()
    .min(3, "账号至少 3 个字符")
    .max(64)
    .regex(/^[A-Za-z0-9_-]+$/, "账号仅支持字母、数字、下划线、连字符"),
  realName: z.string().trim().min(1, "请填写姓名").max(64),
  role: z.enum(["counselor", "teacher"]),
  password: z.string().trim().min(6).max(128).optional(),
  title: z.string().trim().max(64).optional(),
});

/** 创建辅导员 / 科任教师账号（不开放注册，仅超管操作） */
export async function POST(req: Request) {
  const guard = await requireRole("super_admin");
  if ("response" in guard) return guard.response;

  const body = await req.json().catch(() => null);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return fail(400, parsed.error.issues[0]?.message ?? "参数不正确");
  }
  const { loginId, realName, role, password, title } = parsed.data;
  const initialPassword = password ?? loginId; // 未指定则初始密码=账号

  try {
    const [created] = await db
      .insert(users)
      .values({
        loginId,
        realName,
        role,
        passwordHash: await hashPassword(initialPassword),
        mustResetPassword: true,
      })
      .returning({
        id: users.id,
        loginId: users.loginId,
        realName: users.realName,
        role: users.role,
      });

    // title 作为备注信息暂存：无班级归属时不建授权，分配班级时再带 title
    void title;
    return ok({ ...created, initialPassword }, 201);
  } catch (e) {
    if (isUniqueViolation(e)) return fail(409, "账号已存在");
    throw e;
  }
}
