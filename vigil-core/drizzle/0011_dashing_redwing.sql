CREATE TABLE "brief_pdfs" (
	"brief_id" integer PRIMARY KEY NOT NULL,
	"bytes" "bytea" NOT NULL,
	"content_type" text DEFAULT 'application/pdf' NOT NULL,
	"byte_length" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "brief_pdfs" ADD CONSTRAINT "brief_pdfs_brief_id_briefs_id_fk" FOREIGN KEY ("brief_id") REFERENCES "public"."briefs"("id") ON DELETE cascade ON UPDATE no action;