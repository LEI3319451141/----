import { and, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { suggestions } from "@/db/schema";
import { ok } from "@/lib/api";
import {
  getAccessibleClassIds,
  visibilityCondition,
} from "@/lib/rbac";
import { requireUser } from "@/lib/guard";

export const runtime = "nodejs";

/** 看板统计：班级隔离 + 可见性双重过滤后的数量 */
export async function GET() {
  const guard = await requireUser();
  if ("response" in guard) return guard.response;
  const user = guard.user;

  const accessible = await getAccessibleClassIds(user.id, user.role);

  const conds = [visibilityCondition(user)];
  if (accessible !== "all") {
    conds.push(inArray(suggestions.classId, accessible));
  }

  const [totals] = await db
    .select({
      total: sql<number>`count(*)::int`,
      pending: sql<number>`count(*) filter (where ${suggestions.status} = 'pending')::int`,
      processed: sql<number>`count(*) filter (where ${suggestions.status} = 'processed')::int`,
    })
    .from(suggestions)
    .where(and(...conds));

  return ok({
    total: totals?.total ?? 0,
    pending: totals?.pending ?? 0,
    processed: totals?.processed ?? 0,
  });
}
