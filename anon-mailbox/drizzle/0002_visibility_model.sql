CREATE TYPE "suggestion_visibility" AS ENUM('public', 'group', 'person');--> statement-breakpoint
ALTER TABLE "suggestions" ADD COLUMN "visibility" "suggestion_visibility" NOT NULL DEFAULT 'public';--> statement-breakpoint
ALTER TABLE "suggestions" ADD COLUMN "target_groups" "staff_role"[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "suggestions" ADD COLUMN "target_user_id" integer;--> statement-breakpoint
-- 存量数据迁移：旧的「定向角色」建议 → group 群体可见
UPDATE "suggestions"
SET "visibility" = 'group',
    "target_groups" = ARRAY["recipient_type"::text::"staff_role"];--> statement-breakpoint
ALTER TABLE "suggestions" DROP COLUMN "recipient_type";--> statement-breakpoint
DROP TYPE "recipient_type";--> statement-breakpoint
ALTER TABLE "suggestions" ADD CONSTRAINT "suggestions_target_user_id_users_id_fk" FOREIGN KEY ("target_user_id") REFERENCES "users"("id") ON DELETE set null ON UPDATE no action;