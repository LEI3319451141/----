import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import {
  classAssignments,
  classes,
  staffTitles,
  suggestionCategories,
  suggestions,
  users,
} from "@/db/schema";
import { fail, ok } from "@/lib/api";
import { randomAnonymousLabel } from "@/lib/anonymous-label";
import {
  getAccessibleClassIds,
  getStudentClassId,
  visibilityCondition,
} from "@/lib/rbac";
import { suggestionToDto } from "@/lib/dto";
import { interactionSelectFields } from "@/lib/interactions";
import { getAnonymousQuota } from "@/lib/quota";
import { suggestionRateLimit } from "@/lib/rate-limit";
import { requireUser } from "@/lib/guard";
import type { CurrentUser } from "@/lib/auth";

export const runtime = "nodejs";

const PAGE_SIZE = 20;

/** 加载职务字典（id → 名称），用于群体建议的展示文案 */
async function loadTitleMap(ids: number[]): Promise<Map<number, string>> {
  const uniqueIds = Array.from(new Set(ids));
  if (uniqueIds.length === 0) return new Map();
  const rows = await db
    .select({ id: staffTitles.id, name: staffTitles.name })
    .from(staffTitles)
    .where(inArray(staffTitles.id, uniqueIds));
  return new Map(rows.map((r) => [r.id, r.name]));
}

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
      targetTitleIds: suggestions.targetTitleIds,
      categoryId: suggestions.categoryId,
      categoryName: suggestionCategories.name,
      content: suggestions.content,
      isAnonymous: suggestions.isAnonymous,
      authorName: users.realName,
      anonymousLabel: suggestions.anonymousLabel,
      status: suggestions.status,
      createdAt: suggestions.createdAt,
      processedAt: suggestions.processedAt,
      ...interactionSelectFields(user.id),
    })
    .from(suggestions)
    .leftJoin(classes, eq(classes.id, suggestions.classId))
    .leftJoin(users, eq(users.id, suggestions.submitterId))
    .leftJoin(suggestionCategories, eq(suggestionCategories.id, suggestions.categoryId))
    .where(where)
    .orderBy(desc(suggestions.createdAt))
    .limit(pageSize)
    .offset((page - 1) * pageSize);

  const titleMap = await loadTitleMap(
    rows.flatMap((r) => r.targetTitleIds ?? [])
  );

  return ok({
    items: rows.map((r) =>
      suggestionToDto({
        ...r,
        targetTitleNames: (r.targetTitleIds ?? []).map((id) => titleMap.get(id) ?? ""),
      })
    ),
    total: totalRow?.count ?? 0,
    page,
    pageSize,
  });
}

const submitSchema = z
  .object({
    visibility: z.enum(["public", "group", "person"]),
    // group 模式：目标职务 ID（可多选）
    targetTitleIds: z.array(z.number().int().positive()).optional(),
    // person 模式：被指定的具体接收人
    targetUserId: z.number().int().positive().optional(),
    categoryId: z.number().int().positive().nullable().optional(),
    // 是否匿名：默认匿名；收信人要求实名时服务端强制改为 false
    isAnonymous: z.boolean().optional(),
    content: z
      .string()
      .trim()
      .min(5, "建议内容至少 5 个字")
      .max(2000, "建议内容不超过 2000 字"),
  })
  .superRefine((v, ctx) => {
    if (v.visibility === "group") {
      const ids = Array.from(new Set(v.targetTitleIds ?? []));
      if (ids.length === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["targetTitleIds"],
          message: "请至少选择一个收信职务",
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

  // 限流：每用户每 5 分钟最多 5 条建议
  const rl = suggestionRateLimit(user.id);
  if (!rl.allowed) {
    return fail(429, `提交过快，请 ${rl.retryAfter} 秒后再试`);
  }

  const body = await req.json().catch(() => null);
  const parsed = submitSchema.safeParse(body);
  if (!parsed.success) {
    return fail(400, parsed.error.issues[0]?.message ?? "参数不正确");
  }
  const { visibility, targetTitleIds, targetUserId, categoryId, content } =
    parsed.data;

  // 受众中是否包含"要求实名"的接收人（如辅导员谢智）——服务端强制，前端不可绕过
  let audienceForceRealName = false;

  // 分类校验（若传了）
  if (categoryId) {
    const [cat] = await db
      .select({ id: suggestionCategories.id, isActive: suggestionCategories.isActive })
      .from(suggestionCategories)
      .where(eq(suggestionCategories.id, categoryId))
      .limit(1);
    if (!cat || !cat.isActive) return fail(400, "建议分类不存在");
  }

  let normalizedTitleIds: number[] = [];

  if (visibility === "group") {
    const ids = Array.from(new Set(targetTitleIds ?? []));
    // 职务必须存在、启用，且在本班有在任人员（否则建议无人可见）
    const titleRows = await db
      .select({
        id: staffTitles.id,
        name: staffTitles.name,
        isActive: staffTitles.isActive,
      })
      .from(staffTitles)
      .where(inArray(staffTitles.id, ids));
    if (titleRows.length !== ids.length) {
      return fail(400, "选择的职务不存在");
    }
    const inactive = titleRows.find((t) => !t.isActive);
    if (inactive) {
      return fail(400, `职务「${inactive.name}」已停用，无法选择`);
    }
    const holders = await db
      .select({ titleId: classAssignments.titleId })
      .from(classAssignments)
      .where(
        and(
          eq(classAssignments.classId, ownClassId),
          inArray(classAssignments.titleId, ids)
        )
      );
    const heldIds = new Set(holders.map((h) => h.titleId));
    const noHolder = titleRows.find((t) => !heldIds.has(t.id));
    if (noHolder) {
      return fail(400, `职务「${noHolder.name}」在本班暂无在任人员`);
    }
    normalizedTitleIds = ids;

    // 所选职务的在任人中若有"要求实名"的接收人（如辅导员谢智），强制实名
    const [forcedHolder] = await db
      .select({ id: classAssignments.id })
      .from(classAssignments)
      .innerJoin(users, eq(users.id, classAssignments.userId))
      .where(
        and(
          eq(classAssignments.classId, ownClassId),
          inArray(classAssignments.titleId, ids),
          eq(users.forceRealName, true)
        )
      )
      .limit(1);
    if (forcedHolder) audienceForceRealName = true;
  }

  if (visibility === "person") {
    // 指定专人：必须是本班的职务持有者；同时读取该接收人是否要求实名
    const [assignment] = await db
      .select({
        id: classAssignments.id,
        forceRealName: users.forceRealName,
      })
      .from(classAssignments)
      .innerJoin(users, eq(users.id, classAssignments.userId))
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
    audienceForceRealName = assignment.forceRealName;
  }

  // 强制实名优先；否则尊重学生选择，缺省匿名
  const isAnonymous = audienceForceRealName
    ? false
    : (parsed.data.isAnonymous ?? true);

  // 匿名建议受每周 7 次配额限制（自然周，按北京时间周一重置；强制实名不占用）
  if (isAnonymous) {
    const quota = await getAnonymousQuota(user.id);
    if (quota.remaining <= 0) {
      return fail(
        429,
        `本周匿名建议次数已用完（每周 ${quota.limit} 次，周一 0 点重置），请改用实名提交`
      );
    }
  }

  const [created] = await db
    .insert(suggestions)
    .values({
      classId: ownClassId,
      submitterId: user.id,
      visibility,
      targetTitleIds: normalizedTitleIds,
      targetUserId: visibility === "person" ? targetUserId : null,
      categoryId: categoryId ?? null,
      content,
      isAnonymous,
      anonymousLabel: randomAnonymousLabel(),
    })
    .returning({ id: suggestions.id, anonymousLabel: suggestions.anonymousLabel });

  return ok(
    {
      success: true,
      id: created.id,
      anonymousLabel: created.anonymousLabel,
      isAnonymous,
      forceRealName: audienceForceRealName,
    },
    201
  );
}
