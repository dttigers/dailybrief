CREATE TABLE "chat_sessions" (
	"id" serial PRIMARY KEY NOT NULL,
	"title" text DEFAULT 'New Chat' NOT NULL,
	"messages" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "idx_chat_sessions_updated_at" ON "chat_sessions" USING btree ("updated_at");