import { and, eq, gte, sql } from "drizzle-orm";
import { db } from "@/db";
import { suggestions } from "@/db/schema";

/** 每个账号每自然周（按北京时间，周一 00:00 重置）可匿名提交的建议条数 */
export const WEEKLY_ANONYMOUS_LIMIT = 7;

/**
 * 本周一起点（北京时间），timestamptz 可直接比较：
 * date_trunc 按 Asia/Shanghai 截断到周一 00:00，再转回 timestamptz
 */
const weekStartExpr = sql`(date_trunc('week', now() AT TIME ZONE 'Asia/Shanghai') AT TIME ZONE 'Asia/Shanghai')`;

export interface AnonymousQuota {
  /** 每周上限（7） */
  limit: number;
  /** 本周已使用（仍存在的匿名建议；删除后返还） */
  used: number;
  /** 本周剩余 */
  remaining: number;
  /** 下次重置时间（下周一 00:00 北京时间，ISO） */
  resetAt: string;
}

/** 查询某学生本周的匿名建议配额 */
export async function getAnonymousQuota(
  userId: number
): Promise<AnonymousQuota> {
  const [row] = await db
    .select({
      used: sql<number>`count(*)::int`,
      resetAt: sql<string>`to_char(
        date_trunc('week', now() AT TIME ZONE 'Asia/Shanghai') + interval '7 days',
        'YYYY-MM-DD"T"HH24:MI:SS"+08:00"'
      )`,
    })
    .from(suggestions)
    .where(
      and(
        eq(suggestions.submitterId, userId),
        eq(suggestions.isAnonymous, true),
        gte(suggestions.createdAt, weekStartExpr)
      )
    );

  const used = row?.used ?? 0;
  return {
    limit: WEEKLY_ANONYMOUS_LIMIT,
    used,
    remaining: Math.max(0, WEEKLY_ANONYMOUS_LIMIT - used),
    resetAt: row?.resetAt ?? "",
  };
}
