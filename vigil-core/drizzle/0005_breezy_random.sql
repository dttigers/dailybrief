CREATE TABLE "work_orders" (
	"case_number" text PRIMARY KEY NOT NULL,
	"store" text DEFAULT '' NOT NULL,
	"short_description" text DEFAULT '' NOT NULL,
	"trade" text DEFAULT '' NOT NULL,
	"location" text DEFAULT '' NOT NULL,
	"equipment" text DEFAULT '' NOT NULL,
	"priority" text DEFAULT '' NOT NULL,
	"contact" text DEFAULT '' NOT NULL,
	"state" text DEFAULT '' NOT NULL,
	"synced_at" timestamp with time zone DEFAULT now() NOT NULL
);
