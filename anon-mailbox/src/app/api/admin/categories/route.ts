import { asc } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { suggestionCategories } from "@/db/schema";
import { fail, ok } from "@/lib/api";
import { isUniqueViolation, requireRole } from "@/lib/guard";

export const runtime = "nodejs";

export async function GET() {
  const guard = await requireRole("super_admin");
  if ("response" in guard) return guard.response;

  const list = await db
    .select()
    .from(suggestionCategories)
    .orderBy(asc(suggestionCategories.sortOrder), suggestionCategories.id);
  return ok(list);
}

const createSchema = z.object({
  name: z.string().trim().min(1, "请填写分类名称").max(64),
  sortOrder: z.number().int().min(0).optional(),
});

export async function POST(req: Request) {
  const guard = await requireRole("super_admin");
  if ("response" in guard) return guard.response;

  const body = await req.json().catch(() => null);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return fail(400, parsed.error.issues[0]?.message ?? "参数不正确");
  }

  try {
    const [created] = await db
      .insert(suggestionCategories)
      .values({
        name: parsed.data.name,
        sortOrder: parsed.data.sortOrder ?? 50,
      })
      .returning();
    return ok(created, 201);
  } catch (e) {
    if (isUniqueViolation(e)) return fail(409, "分类名称已存在");
    throw e;
  }
}
