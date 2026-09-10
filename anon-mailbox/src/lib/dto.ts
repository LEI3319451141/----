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
  /** 是否匿名：false 时输出提交者真实姓名 */
  isAnonymous: boolean;
  /** 提交者真实姓名（仅 isAnonymous=false 时才会进入响应） */
  authorName?: string | null;
  anonymousLabel: string;
  status: string;
  createdAt: Date | string;
  processedAt: Date | string | null;
  className?: string | null;
  /** 互动统计（由查询层用子查询注入） */
  likeCount?: number;
  commentCount?: number;
  likedByMe?: boolean;
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
 * 物理上不包含 submitterId、targetUserId、学号、精确创建时间，
 * 从根本上杜绝提交者身份与指定对象信息泄露。
 * 唯一例外：学生主动选择"实名提交"（或收信人要求实名）时，authorName 输出真实姓名。
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
    isAnonymous: s.isAnonymous,
    // 实名建议才输出姓名；匿名建议恒为 null
    authorName: s.isAnonymous ? null : (s.authorName ?? null),
    anonymousLabel: s.anonymousLabel,
    likeCount: s.likeCount ?? 0,
    commentCount: s.commentCount ?? 0,
    likedByMe: s.likedByMe ?? false,
    status: s.status,
    timeDisplay: fuzzyTime(s.createdAt),
    processed: s.status === "processed",
    processedTimeDisplay: s.processedAt ? fuzzyTime(s.processedAt) : null,
  };
}
