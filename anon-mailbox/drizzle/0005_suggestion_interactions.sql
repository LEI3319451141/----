CREATE TABLE "suggestion_comments" (
	"id" serial PRIMARY KEY NOT NULL,
	"suggestion_id" integer NOT NULL,
	"user_id" integer NOT NULL,
	"parent_id" integer,
	"content" varchar(500) NOT NULL,
	"is_anonymous" boolean DEFAULT true NOT NULL,
	"anonymous_label" varchar(32) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "suggestion_likes" (
	"id" serial PRIMARY KEY NOT NULL,
	"suggestion_id" integer NOT NULL,
	"user_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "suggestion_comments" ADD CONSTRAINT "suggestion_comments_suggestion_id_suggestions_id_fk" FOREIGN KEY ("suggestion_id") REFERENCES "public"."suggestions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "suggestion_comments" ADD CONSTRAINT "suggestion_comments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "suggestion_comments" ADD CONSTRAINT "suggestion_comments_parent_id_suggestion_comments_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."suggestion_comments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "suggestion_likes" ADD CONSTRAINT "suggestion_likes_suggestion_id_suggestions_id_fk" FOREIGN KEY ("suggestion_id") REFERENCES "public"."suggestions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "suggestion_likes" ADD CONSTRAINT "suggestion_likes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "suggestion_comments_suggestion_idx" ON "suggestion_comments" USING btree ("suggestion_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "suggestion_likes_uq" ON "suggestion_likes" USING btree ("suggestion_id","user_id");