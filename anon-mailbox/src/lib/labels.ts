/** 角色/接收对象/状态的中文展示文案（前后端共用） */

export const ROLE_LABELS: Record<string, string> = {
  super_admin: "超级管理员",
  counselor: "辅导员",
  teacher: "科任教师",
  cadre: "班干部",
  student: "学生",
};

export const RECIPIENT_TYPE_LABELS: Record<string, string> = {
  counselor: "辅导员",
  teacher: "科任教师",
  cadre: "班干部",
};

export const SUGGESTION_VISIBILITY_LABELS: Record<string, string> = {
  public: "公开",
  group: "指定群体",
  person: "指定专人",
};

export const SUGGESTION_STATUS_LABELS: Record<string, string> = {
  pending: "待处理",
  processed: "已处理",
};
