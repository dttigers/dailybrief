CREATE TABLE "thought_links" (
	"id" serial PRIMARY KEY NOT NULL,
	"source_thought_id" integer NOT NULL,
	"target_thought_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_thought_links_source_target" UNIQUE("source_thought_id","target_thought_id")
);
--> statement-breakpoint
CREATE TABLE "thoughts" (
	"id" serial PRIMARY KEY NOT NULL,
	"content" text NOT NULL,
	"category" text,
	"confidence" double precision,
	"source" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"modified_at" timestamp with time zone DEFAULT now() NOT NULL,
	"cloudkit_record_id" text NOT NULL,
	"sync_status" text DEFAULT 'pending' NOT NULL,
	"last_synced_at" timestamp with time zone,
	"task_status" text,
	"therapy_classification" text,
	"tags" jsonb,
	"is_favorited" boolean DEFAULT false NOT NULL,
	CONSTRAINT "thoughts_cloudkit_record_id_unique" UNIQUE("cloudkit_record_id")
);
--> statement-breakpoint
ALTER TABLE "thought_links" ADD CONSTRAINT "thought_links_source_thought_id_thoughts_id_fk" FOREIGN KEY ("source_thought_id") REFERENCES "public"."thoughts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "thought_links" ADD CONSTRAINT "thought_links_target_thought_id_thoughts_id_fk" FOREIGN KEY ("target_thought_id") REFERENCES "public"."thoughts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_thought_links_source" ON "thought_links" USING btree ("source_thought_id");--> statement-breakpoint
CREATE INDEX "idx_thought_links_target" ON "thought_links" USING btree ("target_thought_id");--> statement-breakpoint
CREATE INDEX "idx_thoughts_created_at" ON "thoughts" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "idx_thoughts_category" ON "thoughts" USING btree ("category");--> statement-breakpoint
CREATE INDEX "idx_thoughts_sync_status" ON "thoughts" USING btree ("sync_status");--> statement-breakpoint
ALTER TABLE "thoughts" ADD COLUMN "search_vector" tsvector
  GENERATED ALWAYS AS (to_tsvector('english', coalesce("content", ''))) STORED;--> statement-breakpoint
CREATE INDEX "idx_thoughts_search_vector" ON "thoughts" USING gin("search_vector");