CREATE TABLE "compute_provider_outcomes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"compute_provider" text NOT NULL,
	"provider_account" text NOT NULL,
	"outcome" text NOT NULL,
	"lease_id" text,
	"workload" text,
	"boot_seconds" integer,
	"detail" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "compute_provider_outcomes_outcome_check" CHECK ("compute_provider_outcomes"."outcome" IN ('boot_ok', 'slo_timeout'))
);
--> statement-breakpoint
CREATE INDEX "compute_provider_outcomes_account_idx" ON "compute_provider_outcomes" USING btree ("compute_provider","provider_account","created_at");