import {
  pgTable,
  pgEnum,
  serial,
  varchar,
  text,
  timestamp,
  boolean,
  integer,
  jsonb,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";

// ---------- 枚举 ----------
export const roleEnum = pgEnum("role", [
  "super_admin", // 超级管理员
  "counselor", // 辅导员
  "teacher", // 科任教师
  "cadre", // 班干部
  "student", // 学生
]);

export const userStatusEnum = pgEnum("user_status", ["active", "disabled"]);

export const classStatusEnum = pgEnum("class_status", ["active", "archived"]);

export const staffRoleEnum = pgEnum("staff_role", [
  "counselor", // 辅导员
  "teacher", // 科任教师
  "cadre", // 班干部
]);

export const recipientTypeEnum = pgEnum("recipient_type", [
  "counselor", // 辅导员
  "teacher", // 科任教师
  "cadre", // 班干部
]);

export const suggestionStatusEnum = pgEnum("suggestion_status", [
  "pending", // 待处理
  "processed", // 已处理
]);

// ---------- 用户账号（统一表） ----------
export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  // 登录账号：学生=学号，教职工=工号/自定义账号
  loginId: varchar("login_id", { length: 64 }).notNull().unique(),
  passwordHash: varchar("password_hash", { length: 255 }).notNull(),
  // 真实姓名——学生的此字段属于保密信息，绝不进入接收端响应
  realName: varchar("real_name", { length: 64 }).notNull(),
  role: roleEnum("role").notNull(),
  status: userStatusEnum("status").notNull().default("active"),
  mustResetPassword: boolean("must_reset_password").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// ---------- 班级（多租户单元） ----------
export const classes = pgTable("classes", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 128 }).notNull(),
  grade: varchar("grade", { length: 32 }),
  department: varchar("department", { length: 128 }),
  // 白名单账号前缀，如 "工管26-3"。导入时 loginId = 此前缀 + 姓名；
  // 为空时回退到"以学号为账号"的旧模式。
  rosterPrefix: varchar("roster_prefix", { length: 64 }),
  status: classStatusEnum("status").notNull().default("active"),
  createdBy: integer("created_by").references(() => users.id, {
    onDelete: "set null",
  }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// ---------- 学籍：学生/班干部与班级的归属 ----------
export const studentEnrollments = pgTable(
  "student_enrollments",
  {
    id: serial("id").primaryKey(),
    classId: integer("class_id")
      .notNull()
      .references(() => classes.id, { onDelete: "cascade" }),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    studentNo: varchar("student_no", { length: 32 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("student_enrollments_class_user_uq").on(t.classId, t.userId),
    uniqueIndex("student_enrollments_student_no_uq").on(t.studentNo),
  ]
);

// ---------- 班级授权：决定谁能看哪个班的建议 ----------
export const classAssignments = pgTable(
  "class_assignments",
  {
    id: serial("id").primaryKey(),
    classId: integer("class_id")
      .notNull()
      .references(() => classes.id, { onDelete: "cascade" }),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    staffRole: staffRoleEnum("staff_role").notNull(),
    // 职务/任教学科，如：班长、学习委员、数学
    title: varchar("title", { length: 64 }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("class_assignments_uq").on(t.classId, t.userId, t.staffRole),
  ]
);

// ---------- 建议分类 ----------
export const suggestionCategories = pgTable("suggestion_categories", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 64 }).notNull().unique(),
  sortOrder: integer("sort_order").notNull().default(0),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ---------- 建议（核心表） ----------
export const suggestions = pgTable(
  "suggestions",
  {
    id: serial("id").primaryKey(),
    // 多租户隔离键
    classId: integer("class_id")
      .notNull()
      .references(() => classes.id, { onDelete: "cascade" }),
    // 保密关联：仅数据库内审计用，任何接收端 API 都不得输出
    submitterId: integer("submitter_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    // 学生选择的意向接收对象（班级全员可见，仅作筛选标签）
    recipientType: recipientTypeEnum("recipient_type").notNull(),
    categoryId: integer("category_id").references(() => suggestionCategories.id, {
      onDelete: "set null",
    }),
    content: text("content").notNull(),
    // 每次提交随机生成的脱敏标识，如 "同学F"
    anonymousLabel: varchar("anonymous_label", { length: 32 }).notNull(),
    status: suggestionStatusEnum("status").notNull().default("pending"),
    processedBy: integer("processed_by").references(() => users.id, {
      onDelete: "set null",
    }),
    processedAt: timestamp("processed_at", { withTimezone: true }),
    // 精确时间仅存库审计，不对接收端输出；API 只输出分桶后的模糊时间
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("suggestions_class_created_idx").on(t.classId, t.createdAt),
    index("suggestions_class_status_idx").on(t.classId, t.status),
  ]
);

// ---------- 导入批次（容错报告） ----------
export const importBatches = pgTable("import_batches", {
  id: serial("id").primaryKey(),
  classId: integer("class_id")
    .notNull()
    .references(() => classes.id, { onDelete: "cascade" }),
  operatorId: integer("operator_id").references(() => users.id, {
    onDelete: "set null",
  }),
  fileName: varchar("file_name", { length: 255 }),
  totalRows: integer("total_rows").notNull().default(0),
  successCount: integer("success_count").notNull().default(0),
  failedCount: integer("failed_count").notNull().default(0),
  // 逐行错误：[{ "row": 12, "reason": "学号已存在" }]
  errorReport: jsonb("error_report").$type<{ row: number; reason: string }[]>()
    .notNull()
    .default([]),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
