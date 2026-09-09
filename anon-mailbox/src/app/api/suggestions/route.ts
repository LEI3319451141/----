import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import {
  classes,
  suggestionCategories,
  suggestions,
} from "@/db/schema";
import { fail, ok } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth";
import { randomAnonymousLabel } from "@/lib/label";
import { getAccessibleClassIds, getStudentClassId } from "@/lib/rbac";
import { suggestionToDto } from "@/lib/dto";
import { requireUser } from "@/lib/guard";

export const runtime = "nodejs";

const PAGE_SIZE = 20;

/** 接收端：建议列表（强制按角色班级隔离；仅输出脱敏 DTO） */
export async function GET(req: Request) {
  const guard = await requireUser();
  if ("response" in guard) return guard.response;
  const user = guard.user;

  // 所有人（含学生）均可查看建议，按 getAccessibleClassIds 强制隔离
  const url = new URL(req.url);
  const classIdParam = url.searchParams.get("classId");
  const recipientType = url.searchParams.get("recipientType");
  const categoryId = url.searchParams.get("categoryId");
  const status = url.searchParams.get("status");
  const page = Math.max(1, Number(url.searchParams.get("page") ?? "1") || 1);
  const pageSize = PAGE_SIZE;

  const accessible = await getAccessibleClassIds(user.id, user.role);
  if (accessible !== "all" && accessible.length === 0) {
    return ok({ items: [], total: 0, page, pageSize });
  }

  const conds = [];
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
  if (recipientType === "counselor" || recipientType === "teacher" || recipientType === "cadre") {
    // 接收对象仅作筛选标签（班级全员可见）
    conds.push(eq(suggestions.recipientType, recipientType));
  }
  if (categoryId) {
    const catId = Number(categoryId);
    if (Number.isInteger(catId)) conds.push(eq(suggestions.categoryId, catId));
  }
  if (status === "pending" || status === "processed") {
    conds.push(eq(suggestions.status, status));
  }

  const where = conds.length > 0 ? and(...conds) : undefined;

  const [totalRow] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(suggestions)
    .where(where);

  const rows = await db
    .select({
      id: suggestions.id,
      classId: suggestions.classId,
      className: classes.name,
      recipientType: suggestions.recipientType,
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

const submitSchema = z.object({
  recipientType: z.enum(["counselor", "teacher", "cadre"]),
  categoryId: z.number().int().positive().nullable().optional(),
  content: z
    .string()
    .trim()
    .min(5, "建议内容至少 5 个字")
    .max(2000, "建议内容不超过 2000 字"),
});

/** 学生端：提交建议（classId 强制取本人班级，忽略前端传值） */
export async function POST(req: Request) {
  const guard = await requireUser();
  if ("response" in guard) return guard.response;
  const user = guard.user;

  const ownClassId = await getStudentClassId(user.id);
  if (!ownClassId) {
    return fail(403, "您尚未归属任何班级，无法提交建议");
  }

  const body = await req.json().catch(() => null);
  const parsed = submitSchema.safeParse(body);
  if (!parsed.success) {
    return fail(400, parsed.error.issues[0]?.message ?? "参数不正确");
  }
  const { recipientType, categoryId, content } = parsed.data;

  // 分类校验（若传了）
  if (categoryId) {
    const [cat] = await db
      .select({ id: suggestionCategories.id, isActive: suggestionCategories.isActive })
      .from(suggestionCategories)
      .where(eq(suggestionCategories.id, categoryId))
      .limit(1);
    if (!cat || !cat.isActive) return fail(400, "建议分类不存在");
  }

  const [created] = await db
    .insert(suggestions)
    .values({
      classId: ownClassId,
      submitterId: user.id,
      recipientType,
      categoryId: categoryId ?? null,
      content,
      anonymousLabel: randomAnonymousLabel(),
    })
    .returning({ id: suggestions.id, anonymousLabel: suggestions.anonymousLabel });

  return ok({ success: true, id: created.id, anonymousLabel: created.anonymousLabel }, 201);
}
