import { fuzzyTime } from "./time";

interface SuggestionSerializable {
  id: number;
  classId: number;
  visibility: string;
  targetTitleIds: number[] | null;
  /** 目标职务名称（由 API 层根据职务字典解析后传入） */
  targetTitleNames?: string[] | null;
  categoryId: number | null;
  categoryName: string | null;
  content: string;
  anonymousLabel: string;
  status: string;
  createdAt: Date | string;
  processedAt: Date | string | null;
  className?: string | null;
}

/** 可见性展示文案（person 定向建议只有被指定人本人能查到，故直接显示"仅你可见"） */
export function audienceLabel(s: {
  visibility: string;
  targetTitleNames?: string[] | null;
}): string {
  if (s.visibility === "public") return "公开";
  if (s.visibility === "person") return "仅你可见";
  const names = (s.targetTitleNames ?? []).filter(Boolean);
  return names.length ? `致：${names.join("、")}` : "群体可见";
}

/**
 * 建议接收端响应 DTO —— 白名单序列化。
 * 物理上不包含 submitterId、targetUserId、真实姓名、学号、精确创建时间，
 * 从根本上杜绝提交者身份与指定对象信息泄露。
 */
export function suggestionToDto(s: SuggestionSerializable) {
  const titleNames = s.visibility === "group" ? (s.targetTitleNames ?? []) : [];
  return {
    id: s.id,
    classId: s.classId,
    className: s.className ?? null,
    visibility: s.visibility,
    targetTitleIds: s.visibility === "group" ? s.targetTitleIds ?? [] : [],
    targetTitleNames: titleNames,
    audienceLabel: audienceLabel({
      visibility: s.visibility,
      targetTitleNames: titleNames,
    }),
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
