CREATE TABLE "accounts" (
	"id" text PRIMARY KEY NOT NULL,
	"display_name" text,
	"balance_credits" numeric(10, 2) DEFAULT '0.00' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
