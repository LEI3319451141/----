CREATE TYPE "staff_category" AS ENUM('counselor', 'teacher', 'cadre');--> statement-breakpoint
CREATE TABLE "staff_titles" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(64) NOT NULL,
	"category" "staff_category" DEFAULT 'cadre' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamptz DEFAULT now() NOT NULL,
	"updated_at" timestamptz DEFAULT now() NOT NULL,
	CONSTRAINT "staff_titles_name_unique" UNIQUE("name")
);--> statement-breakpoint
-- 种子职务：覆盖旧的三类硬编码角色
INSERT INTO "staff_titles" ("name", "category", "sort_order") VALUES
	('辅导员', 'counselor', 1),
	('科任老师', 'teacher', 2),
	('班长', 'cadre', 3);--> statement-breakpoint
-- 存量班干部职务名（如"学习委员"）自动补建为班干部类职务
INSERT INTO "staff_titles" ("name", "category")
SELECT DISTINCT "title", 'cadre'::"staff_category" FROM "class_assignments"
WHERE "staff_role" = 'cadre' AND "title" IS NOT NULL
ON CONFLICT ("name") DO NOTHING;--> statement-breakpoint
ALTER TABLE "class_assignments" ADD COLUMN "title_id" integer;--> statement-breakpoint
-- 回填授权职务
UPDATE "class_assignments" ca SET "title_id" = t."id" FROM "staff_titles" t
WHERE (ca."staff_role" = 'counselor' AND t."name" = '辅导员')
   OR (ca."staff_role" = 'teacher' AND t."name" = '科任老师')
   OR (ca."staff_role" = 'cadre' AND ca."title" IS NOT NULL AND t."name" = ca."title")
   OR (ca."staff_role" = 'cadre' AND ca."title" IS NULL AND t."name" = '班长');--> statement-breakpoint
ALTER TABLE "class_assignments" ALTER COLUMN "title_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "class_assignments" ADD CONSTRAINT "class_assignments_title_id_staff_titles_id_fk" FOREIGN KEY ("title_id") REFERENCES "staff_titles"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
DROP INDEX "class_assignments_uq";--> statement-breakpoint
CREATE UNIQUE INDEX "class_assignments_uq" ON "class_assignments" ("class_id", "user_id", "title_id");--> statement-breakpoint
ALTER TABLE "class_assignments" DROP COLUMN "staff_role";--> statement-breakpoint
ALTER TABLE "class_assignments" DROP COLUMN "title";--> statement-breakpoint
ALTER TABLE "suggestions" ADD COLUMN "target_title_ids" integer[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
-- 回填建议定向：旧角色标签 → 对应职务 ID（cadre 标签映射到"班长"职务）
UPDATE "suggestions" SET "target_title_ids" = ARRAY(
	SELECT t."id" FROM "staff_titles" t, unnest("target_groups") g
	WHERE t."category" = g::text::"staff_category"
);--> statement-breakpoint
ALTER TABLE "suggestions" DROP COLUMN "target_groups";--> statement-breakpoint
DROP TYPE "staff_role";
