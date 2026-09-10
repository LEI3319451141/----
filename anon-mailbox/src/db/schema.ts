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
  type AnyPgColumn,
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

// 职务的粗粒度权限类别：决定该职务持有者能否处理建议、归属哪类接收端
export const staffCategoryEnum = pgEnum("staff_category", [
  "counselor", // 辅导员类（跨班管理）
  "teacher", // 科任教师类
  "cadre", // 班干部类（学生兼任）
]);

export const suggestionVisibilityEnum = pgEnum("suggestion_visibility", [
  "public", // 公开：全班所有人可见
  "group", // 指定群体：target_groups 中的角色成员可见（可多选）
  "person", // 指定专人：仅 target_user_id 本人可见
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
  // 真实姓名——默认保密，仅当建议为实名提交（is_anonymous=false）时才进入接收端响应
  realName: varchar("real_name", { length: 64 }).notNull(),
  role: roleEnum("role").notNull(),
  status: userStatusEnum("status").notNull().default("active"),
  mustResetPassword: boolean("must_reset_password").notNull().default(false),
  // 特例：该接收人（如辅导员谢智）收到的建议信必须实名呈现
  forceRealName: boolean("force_real_name").notNull().default(false),
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

// ---------- 职务字典（全局可配置的收信对象，如 辅导员/科任老师/班长/学习委员） ----------
export const staffTitles = pgTable("staff_titles", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 64 }).notNull().unique(),
  // 粗粒度权限类别：counselor/teacher/cadre
  category: staffCategoryEnum("category").notNull().default("cadre"),
  isActive: boolean("is_active").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// ---------- 班级授权：某人以某职务在某班任职（决定能看哪个班的建议） ----------
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
    titleId: integer("title_id")
      .notNull()
      .references(() => staffTitles.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("class_assignments_uq").on(t.classId, t.userId, t.titleId),
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
    // 可见性：public=全班公开 / group=指定职务群体 / person=指定专人
    visibility: suggestionVisibilityEnum("visibility")
      .notNull()
      .default("public"),
    // visibility=group 时生效：目标职务 ID 数组（可多选，如 [学习委员ID, 班长ID]）
    targetTitleIds: integer("target_title_ids")
      .array()
      .notNull()
      .default([]),
    // visibility=person 时生效：仅该用户本人可见（含超管在内其他任何人不可见）
    targetUserId: integer("target_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    categoryId: integer("category_id").references(() => suggestionCategories.id, {
      onDelete: "set null",
    }),
    content: text("content").notNull(),
    // 是否匿名：true=接收端只见脱敏标识（同学X）；false=实名呈现提交者姓名
    isAnonymous: boolean("is_anonymous").notNull().default(true),
    // 每次提交随机生成的脱敏标识，如 "同学F"（实名建议仍生成但不展示）
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

// ---------- 建议点赞（一人一赞，可取消） ----------
export const suggestionLikes = pgTable(
  "suggestion_likes",
  {
    id: serial("id").primaryKey(),
    suggestionId: integer("suggestion_id")
      .notNull()
      .references(() => suggestions.id, { onDelete: "cascade" }),
    // 保密关联：仅权限判定与防重复点赞用，绝不进入响应
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("suggestion_likes_uq").on(t.suggestionId, t.userId)]
);

// ---------- 建议评论（支持一层回复展示，parentId 指向被回复的评论） ----------
export const suggestionComments = pgTable(
  "suggestion_comments",
  {
    id: serial("id").primaryKey(),
    suggestionId: integer("suggestion_id")
      .notNull()
      .references(() => suggestions.id, { onDelete: "cascade" }),
    // 保密关联：仅权限判定与匿名标签复用用，绝不直接输出
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    // 被回复的评论 ID；null=顶层评论
    parentId: integer("parent_id").references((): AnyPgColumn => suggestionComments.id, {
      onDelete: "cascade",
    }),
    content: varchar("content", { length: 500 }).notNull(),
    // 是否匿名：false 时接收端显示评论者真实姓名
    isAnonymous: boolean("is_anonymous").notNull().default(true),
    // 匿名标识；发信人匿名评论时复用建议的 anonymousLabel，保证同人同标
    anonymousLabel: varchar("anonymous_label", { length: 32 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("suggestion_comments_suggestion_idx").on(t.suggestionId, t.createdAt),
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
