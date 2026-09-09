import { fuzzyTime } from "./time";

interface SuggestionSerializable {
  id: number;
  classId: number;
  recipientType: string;
  categoryId: number | null;
  categoryName: string | null;
  content: string;
  anonymousLabel: string;
  status: string;
  createdAt: Date | string;
  processedAt: Date | string | null;
  className?: string | null;
}

/**
 * 建议接收端响应 DTO —— 白名单序列化。
 * 物理上不包含 submitterId、真实姓名、学号、精确创建时间，
 * 从根本上杜绝提交者身份泄露。
 */
export function suggestionToDto(s: SuggestionSerializable) {
  return {
    id: s.id,
    classId: s.classId,
    className: s.className ?? null,
    recipientType: s.recipientType,
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
