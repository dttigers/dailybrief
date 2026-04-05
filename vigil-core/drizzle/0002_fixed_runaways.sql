CREATE TABLE "briefs" (
	"id" serial PRIMARY KEY NOT NULL,
	"date" date NOT NULL,
	"summary" jsonb NOT NULL,
	"pdf_filename" text,
	"thought_count" integer NOT NULL,
	"task_count" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "briefs_date_unique" UNIQUE("date")
);
--> statement-breakpoint
CREATE UNIQUE INDEX "uq_briefs_date" ON "briefs" USING btree ("date");--> statement-breakpoint
CREATE INDEX "idx_briefs_created_at" ON "briefs" USING btree ("created_at");