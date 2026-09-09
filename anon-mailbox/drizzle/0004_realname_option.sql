ALTER TABLE "suggestions" ADD COLUMN "is_anonymous" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "force_real_name" boolean DEFAULT false NOT NULL;--> statement-breakpoint
-- 特例：辅导员谢智收到的建议信必须实名呈现
UPDATE "users" SET "force_real_name" = true
WHERE "login_id" = '辅导员-谢智'
   OR ("real_name" = '谢智' AND "role" = 'counselor');
