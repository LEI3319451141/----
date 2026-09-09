import { asc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { classAssignments, staffTitles } from "@/db/schema";
import { fail, ok } from "@/lib/api";
import { isUniqueViolation, requireRole } from "@/lib/guard";
import { STAFF_CATEGORY_LABELS } from "@/lib/rbac";

export const runtime = "nodejs";

/** 职务字典列表（附带每个职务的在任人数，供管理后台判断能否停用/删除） */
export async function GET() {
  const guard = await requireRole("super_admin");
  if ("response" in guard) return guard.response;

  const titles = await db
    .select({
      id: staffTitles.id,
      name: staffTitles.name,
      category: staffTitles.category,
      isActive: staffTitles.isActive,
      sortOrder: staffTitles.sortOrder,
    })
    .from(staffTitles)
    .orderBy(asc(staffTitles.sortOrder), staffTitles.id);

  // 统计每个职务当前在任人数
  const usage = await db
    .select({
      titleId: classAssignments.titleId,
      count: classAssignments.id,
    })
    .from(classAssignments);
  const countMap = new Map<number, number>();
  for (const u of usage) {
    countMap.set(u.titleId, (countMap.get(u.titleId) ?? 0) + 1);
  }

  return ok(
    titles.map((t) => ({
      ...t,
      categoryLabel: STAFF_CATEGORY_LABELS[t.category] ?? t.category,
      holderCount: countMap.get(t.id) ?? 0,
    }))
  );
}

const createSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "请填写职务名称")
    .max(64, "职务名称不超过 64 字"),
  category: z.enum(["counselor", "teacher", "cadre"]).default("cadre"),
  sortOrder: z.number().int().optional(),
});

/** 新增职务（即新增一种学生可选的收信对象） */
export async function POST(req: Request) {
  const guard = await requireRole("super_admin");
  if ("response" in guard) return guard.response;

  const body = await req.json().catch(() => null);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return fail(400, parsed.error.issues[0]?.message ?? "参数不正确");
  }
  const { name, category, sortOrder } = parsed.data;

  try {
    const [created] = await db
      .insert(staffTitles)
      .values({
        name,
        category,
        sortOrder: sortOrder ?? (category === "cadre" ? 10 : 5),
      })
      .returning({
        id: staffTitles.id,
        name: staffTitles.name,
        category: staffTitles.category,
        isActive: staffTitles.isActive,
      });
    return ok(created, 201);
  } catch (e) {
    if (isUniqueViolation(e)) return fail(409, "该职务名称已存在");
    throw e;
  }
}
