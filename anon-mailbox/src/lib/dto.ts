import { fuzzyTime } from "./time";
import { STAFF_ROLE_LABELS } from "./rbac";

interface SuggestionSerializable {
  id: number;
  classId: number;
  visibility: string;
  targetGroups: string[] | null;
  categoryId: number | null;
  categoryName: string | null;
  content: string;
  anonymousLabel: string;
  status: string;
  createdAt: Date | string;
  processedAt: Date | string | null;
  className?: string | null;
}

/** 可见性展示文案（注意：person 定向建议只有被指定人本人能查到，故可直接显示"仅你可见"） */
export function audienceLabel(s: {
  visibility: string;
  targetGroups?: string[] | null;
}): string {
  if (s.visibility === "public") return "公开";
  if (s.visibility === "person") return "仅你可见";
  const names = (s.targetGroups ?? [])
    .map((r) => STAFF_ROLE_LABELS[r] ?? r)
    .join("、");
  return names ? `致：${names}` : "群体可见";
}

/**
 * 建议接收端响应 DTO —— 白名单序列化。
 * 物理上不包含 submitterId、targetUserId、真实姓名、学号、精确创建时间，
 * 从根本上杜绝提交者身份与指定对象信息泄露。
 */
export function suggestionToDto(s: SuggestionSerializable) {
  return {
    id: s.id,
    classId: s.classId,
    className: s.className ?? null,
    visibility: s.visibility,
    targetGroups: s.visibility === "group" ? s.targetGroups ?? [] : [],
    audienceLabel: audienceLabel(s),
    categoryId: s.categoryId,
    categoryName: s.categoryName,
    content: s.content,
    anonymousLabel: s.anonymousLabel,
    status: s.status,
    timeDisplay: fuzzyTime(s.createdAt),
    processed: s.status === "processed",
    processedTimeDisplay: s.processedAt ? fuzzyTime(s.processedAt) : null,
  };
}
