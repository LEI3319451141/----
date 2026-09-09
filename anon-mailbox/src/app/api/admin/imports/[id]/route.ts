import { eq } from "drizzle-orm";
import { db } from "@/db";
import { importBatches } from "@/db/schema";
import { fail, ok } from "@/lib/api";
import { requireRole } from "@/lib/guard";
import { fuzzyTime } from "@/lib/time";

export const runtime = "nodejs";

/** 导入批次详情（含逐行错误报告） */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await requireRole("super_admin");
  if ("response" in guard) return guard.response;

  const { id } = await params;
  const batchId = Number(id);
  if (!Number.isInteger(batchId)) return fail(400, "批次 ID 不正确");

  const [batch] = await db
    .select()
    .from(importBatches)
    .where(eq(importBatches.id, batchId))
    .limit(1);
  if (!batch) return fail(404, "导入批次不存在");

  return ok({ ...batch, timeDisplay: fuzzyTime(batch.createdAt) });
}
