import { sql } from "drizzle-orm";
import { suggestions } from "@/db/schema";

/**
 * 建议查询的互动统计字段（子查询注入，避免 N+1）：
 * likeCount 点赞数 / commentCount 评论数 / likedByMe 当前用户是否已赞
 * isMine 当前用户是否为发信人（仅用于"删除我的建议"按钮显隐，无隐私泄露）
 */
export function interactionSelectFields(userId: number) {
  return {
    likeCount: sql<number>`(SELECT count(*)::int FROM suggestion_likes sl WHERE sl.suggestion_id = ${suggestions.id})`,
    commentCount: sql<number>`(SELECT count(*)::int FROM suggestion_comments sc WHERE sc.suggestion_id = ${suggestions.id})`,
    likedByMe: sql<boolean>`EXISTS(SELECT 1 FROM suggestion_likes sl2 WHERE sl2.suggestion_id = ${suggestions.id} AND sl2.user_id = ${userId})`,
    isMine: sql<boolean>`${suggestions.submitterId} = ${userId}`,
  };
}
