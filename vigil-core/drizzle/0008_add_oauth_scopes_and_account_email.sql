ALTER TABLE "oauth_tokens" ADD COLUMN "scopes" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "oauth_tokens" ADD COLUMN "account_email" text;