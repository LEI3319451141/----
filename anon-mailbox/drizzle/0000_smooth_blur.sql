CREATE TYPE "public"."class_status" AS ENUM('active', 'archived');--> statement-breakpoint
CREATE TYPE "public"."recipient_type" AS ENUM('counselor', 'teacher', 'cadre');--> statement-breakpoint
CREATE TYPE "public"."role" AS ENUM('super_admin', 'counselor', 'teacher', 'cadre', 'student');--> statement-breakpoint
CREATE TYPE "public"."staff_role" AS ENUM('counselor', 'teacher', 'cadre');--> statement-breakpoint
CREATE TYPE "public"."suggestion_status" AS ENUM('pending', 'processed');--> statement-breakpoint
CREATE TYPE "public"."user_status" AS ENUM('active', 'disabled');--> statement-breakpoint
CREATE TABLE "class_assignments" (
	"id" serial PRIMARY KEY NOT NULL,
	"class_id" integer NOT NULL,
	"user_id" integer NOT NULL,
	"staff_role" "staff_role" NOT NULL,
	"title" varchar(64),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "classes" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(128) NOT NULL,
	"grade" varchar(32),
	"department" varchar(128),
	"status" "class_status" DEFAULT 'active' NOT NULL,
	"created_by" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "import_batches" (
	"id" serial PRIMARY KEY NOT NULL,
	"class_id" integer NOT NULL,
	"operator_id" integer,
	"file_name" varchar(255),
	"total_rows" integer DEFAULT 0 NOT NULL,
	"success_count" integer DEFAULT 0 NOT NULL,
	"failed_count" integer DEFAULT 0 NOT NULL,
	"error_report" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "student_enrollments" (
	"id" serial PRIMARY KEY NOT NULL,
	"class_id" integer NOT NULL,
	"user_id" integer NOT NULL,
	"student_no" varchar(32) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "suggestion_categories" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(64) NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "suggestion_categories_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "suggestions" (
	"id" serial PRIMARY KEY NOT NULL,
	"class_id" integer NOT NULL,
	"submitter_id" integer NOT NULL,
	"recipient_type" "recipient_type" NOT NULL,
	"category_id" integer,
	"content" text NOT NULL,
	"anonymous_label" varchar(32) NOT NULL,
	"status" "suggestion_status" DEFAULT 'pending' NOT NULL,
	"processed_by" integer,
	"processed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"login_id" varchar(64) NOT NULL,
	"password_hash" varchar(255) NOT NULL,
	"real_name" varchar(64) NOT NULL,
	"role" "role" NOT NULL,
	"status" "user_status" DEFAULT 'active' NOT NULL,
	"must_reset_password" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_login_id_unique" UNIQUE("login_id")
);
--> statement-breakpoint
ALTER TABLE "class_assignments" ADD CONSTRAINT "class_assignments_class_id_classes_id_fk" FOREIGN KEY ("class_id") REFERENCES "public"."classes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "class_assignments" ADD CONSTRAINT "class_assignments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "classes" ADD CONSTRAINT "classes_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_batches" ADD CONSTRAINT "import_batches_class_id_classes_id_fk" FOREIGN KEY ("class_id") REFERENCES "public"."classes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_batches" ADD CONSTRAINT "import_batches_operator_id_users_id_fk" FOREIGN KEY ("operator_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_enrollments" ADD CONSTRAINT "student_enrollments_class_id_classes_id_fk" FOREIGN KEY ("class_id") REFERENCES "public"."classes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_enrollments" ADD CONSTRAINT "student_enrollments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "suggestions" ADD CONSTRAINT "suggestions_class_id_classes_id_fk" FOREIGN KEY ("class_id") REFERENCES "public"."classes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "suggestions" ADD CONSTRAINT "suggestions_submitter_id_users_id_fk" FOREIGN KEY ("submitter_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "suggestions" ADD CONSTRAINT "suggestions_category_id_suggestion_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."suggestion_categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "suggestions" ADD CONSTRAINT "suggestions_processed_by_users_id_fk" FOREIGN KEY ("processed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "class_assignments_uq" ON "class_assignments" USING btree ("class_id","user_id","staff_role");--> statement-breakpoint
CREATE UNIQUE INDEX "student_enrollments_class_user_uq" ON "student_enrollments" USING btree ("class_id","user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "student_enrollments_student_no_uq" ON "student_enrollments" USING btree ("student_no");--> statement-breakpoint
CREATE INDEX "suggestions_class_created_idx" ON "suggestions" USING btree ("class_id","created_at");--> statement-breakpoint
CREATE INDEX "suggestions_class_status_idx" ON "suggestions" USING btree ("class_id","status");