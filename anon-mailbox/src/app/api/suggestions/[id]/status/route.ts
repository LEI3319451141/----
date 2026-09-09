import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { suggestions } from "@/db/schema";
import { fail, ok } from "@/lib/api";
import { isStaffRole, visibilityCondition } from "@/lib/rbac";
import { requireUser } from "@/lib/guard";

export const runtime = "nodejs";

const schema = z.object({
  status: z.enum(["pending", "processed"]),
});

/** 标记建议 已处理/待处理（单向静默模式：不产生任何回复内容） */
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await requireUser();
  if ("response" in guard) return guard.response;
  const user = guard.user;

  if (!isStaffRole(user.role)) {
    return fail(403, "无权限处理建议");
  }

  const { id } = await params;
  const suggestionId = Number(id);
  if (!Number.isInteger(suggestionId)) return fail(400, "建议 ID 不正确");

  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return fail(400, "状态值不正确");

  // 可见性过滤：只有"能看到这条建议"的接收端才能处理它（专人建议仅本人可处理）
  const [target] = await db
    .select({ id: suggestions.id, classId: suggestions.classId })
    .from(suggestions)
    .where(and(eq(suggestions.id, suggestionId), visibilityCondition(user)))
    .limit(1);
  if (!target) return fail(404, "建议不存在或无权操作");

  const processed = parsed.data.status === "processed";
  await db
    .update(suggestions)
    .set({
      status: parsed.data.status,
      processedBy: processed ? user.id : null,
      processedAt: processed ? new Date() : null,
      updatedAt: new Date(),
    })
    .where(eq(suggestions.id, suggestionId));

  return ok({ success: true, status: parsed.data.status });
}
