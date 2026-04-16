CREATE TABLE "ai_cache" (
  "id" serial PRIMARY KEY NOT NULL,
  "type" text NOT NULL,
  "result" jsonb NOT NULL,
  "generated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "uq_ai_cache_type" ON "ai_cache" USING btree ("type");
