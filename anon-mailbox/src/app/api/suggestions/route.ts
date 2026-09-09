import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import {
  classAssignments,
  classes,
  suggestionCategories,
  suggestions,
} from "@/db/schema";
import { fail, ok } from "@/lib/api";
import { randomAnonymousLabel } from "@/lib/label";
import {
  TARGETABLE_STAFF_ROLES,
  getAccessibleClassIds,
  getStudentClassId,
  visibilityCondition,
} from "@/lib/rbac";
import { suggestionToDto } from "@/lib/dto";
import { requireUser } from "@/lib/guard";
import type { CurrentUser } from "@/lib/auth";

export const runtime = "nodejs";

const PAGE_SIZE = 20;

/** 建议列表：班级隔离 + 可见性过滤双重强制；仅输出脱敏 DTO */
export async function GET(req: Request) {
  const guard = await requireUser();
  if ("response" in guard) return guard.response;
  const user: CurrentUser = guard.user;

  const url = new URL(req.url);
  const classIdParam = url.searchParams.get("classId");
  const visibility = url.searchParams.get("visibility");
  const categoryId = url.searchParams.get("categoryId");
  const status = url.searchParams.get("status");
  const page = Math.max(1, Number(url.searchParams.get("page") ?? "1") || 1);
  const pageSize = PAGE_SIZE;

  const accessible = await getAccessibleClassIds(user.id, user.role);
  if (accessible !== "all" && accessible.length === 0) {
    return ok({ items: [], total: 0, page, pageSize });
  }

  const conds = [visibilityCondition(user)];
  if (accessible !== "all") {
    conds.push(inArray(suggestions.classId, accessible));
  }
  if (classIdParam) {
    const cid = Number(classIdParam);
    if (accessible !== "all" && !accessible.includes(cid)) {
      return fail(403, "无权访问该班级");
    }
    conds.push(eq(suggestions.classId, cid));
  }
  if (visibility === "public" || visibility === "group" || visibility === "person") {
    conds.push(eq(suggestions.visibility, visibility));
  }
  if (categoryId) {
    const catId = Number(categoryId);
    if (Number.isInteger(catId)) conds.push(eq(suggestions.categoryId, catId));
  }
  if (status === "pending" || status === "processed") {
    conds.push(eq(suggestions.status, status));
  }

  const where = and(...conds);

  const [totalRow] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(suggestions)
    .where(where);

  const rows = await db
    .select({
      id: suggestions.id,
      classId: suggestions.classId,
      className: classes.name,
      visibility: suggestions.visibility,
      targetGroups: suggestions.targetGroups,
      categoryId: suggestions.categoryId,
      categoryName: suggestionCategories.name,
      content: suggestions.content,
      anonymousLabel: suggestions.anonymousLabel,
      status: suggestions.status,
      createdAt: suggestions.createdAt,
      processedAt: suggestions.processedAt,
    })
    .from(suggestions)
    .leftJoin(classes, eq(classes.id, suggestions.classId))
    .leftJoin(suggestionCategories, eq(suggestionCategories.id, suggestions.categoryId))
    .where(where)
    .orderBy(desc(suggestions.createdAt))
    .limit(pageSize)
    .offset((page - 1) * pageSize);

  return ok({
    items: rows.map((r) => suggestionToDto(r)),
    total: totalRow?.count ?? 0,
    page,
    pageSize,
  });
}

const STAFF_ROLE_VALUES = TARGETABLE_STAFF_ROLES as readonly string[];

const submitSchema = z
  .object({
    visibility: z.enum(["public", "group", "person"]),
    // group 模式：可多选的角色群体
    targetGroups: z.array(z.string()).optional(),
    // person 模式：被指定的具体接收人
    targetUserId: z.number().int().positive().optional(),
    categoryId: z.number().int().positive().nullable().optional(),
    content: z
      .string()
      .trim()
      .min(5, "建议内容至少 5 个字")
      .max(2000, "建议内容不超过 2000 字"),
  })
  .superRefine((v, ctx) => {
    if (v.visibility === "group") {
      const groups = (v.targetGroups ?? []).filter(Boolean);
      if (groups.length === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["targetGroups"],
          message: "请至少选择一个可见群体",
        });
      } else if (!groups.every((g) => STAFF_ROLE_VALUES.includes(g))) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["targetGroups"],
          message: "可见群体参数不合法",
        });
      }
    }
    if (v.visibility === "person" && !v.targetUserId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["targetUserId"],
        message: "请选择指定接收人",
      });
    }
  });

/** 学生端：提交建议（classId 强制取本人班级；可见性参数严格校验） */
export async function POST(req: Request) {
  const guard = await requireUser();
  if ("response" in guard) return guard.response;
  const user: CurrentUser = guard.user;

  const ownClassId = await getStudentClassId(user.id);
  if (!ownClassId) {
    return fail(403, "您尚未归属任何班级，无法提交建议");
  }

  const body = await req.json().catch(() => null);
  const parsed = submitSchema.safeParse(body);
  if (!parsed.success) {
    return fail(400, parsed.error.issues[0]?.message ?? "参数不正确");
  }
  const { visibility, targetGroups, targetUserId, categoryId, content } =
    parsed.data;

  // 分类校验（若传了）
  if (categoryId) {
    const [cat] = await db
      .select({ id: suggestionCategories.id, isActive: suggestionCategories.isActive })
      .from(suggestionCategories)
      .where(eq(suggestionCategories.id, categoryId))
      .limit(1);
    if (!cat || !cat.isActive) return fail(400, "建议分类不存在");
  }

  let normalizedTargetGroups: NonNullable<
    typeof suggestions.$inferInsert.targetGroups
  > = [];

  if (visibility === "person") {
    // 指定专人：必须是本班的辅导员/教师/班干部（class_assignments 中存在授权）
    const [assignment] = await db
      .select({ id: classAssignments.id })
      .from(classAssignments)
      .where(
        and(
          eq(classAssignments.classId, ownClassId),
          eq(classAssignments.userId, targetUserId!)
        )
      )
      .limit(1);
    if (!assignment) {
      return fail(400, "指定的接收人不存在或不在本班接收端名单中");
    }
  }

  if (visibility === "group") {
    // 已通过 zod 校验，值必为 staff_role 枚举
    normalizedTargetGroups = Array.from(new Set(targetGroups ?? [])) as typeof normalizedTargetGroups;
  }

  const [created] = await db
    .insert(suggestions)
    .values({
      classId: ownClassId,
      submitterId: user.id,
      visibility,
      targetGroups: normalizedTargetGroups,
      targetUserId: visibility === "person" ? targetUserId : null,
      categoryId: categoryId ?? null,
      content,
      anonymousLabel: randomAnonymousLabel(),
    })
    .returning({ id: suggestions.id, anonymousLabel: suggestions.anonymousLabel });

  return ok(
    { success: true, id: created.id, anonymousLabel: created.anonymousLabel },
    201
  );
}
