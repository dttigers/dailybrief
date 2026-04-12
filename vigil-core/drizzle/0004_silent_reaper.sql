CREATE TABLE "work_order_statuses" (
	"case_number" text PRIMARY KEY NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
