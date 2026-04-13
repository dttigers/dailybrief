CREATE TABLE "oauth_tokens" (
	"id" serial PRIMARY KEY NOT NULL,
	"provider" text NOT NULL,
	"encrypted_refresh_token" text NOT NULL,
	"access_token" text DEFAULT '' NOT NULL,
	"expires_at" timestamp with time zone,
	"calendar_selections" jsonb DEFAULT '[]'::jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "oauth_tokens_provider_unique" UNIQUE("provider")
);
--> statement-breakpoint
CREATE UNIQUE INDEX "uq_oauth_tokens_provider" ON "oauth_tokens" USING btree ("provider");