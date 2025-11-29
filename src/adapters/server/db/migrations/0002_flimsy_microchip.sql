CREATE TABLE "payment_attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"billing_account_id" text NOT NULL,
	"from_address" text NOT NULL,
	"chain_id" integer NOT NULL,
	"tx_hash" text,
	"token" text NOT NULL,
	"to_address" text NOT NULL,
	"amount_raw" bigint NOT NULL,
	"amount_usd_cents" integer NOT NULL,
	"status" text NOT NULL,
	"error_code" text,
	"expires_at" timestamp with time zone,
	"submitted_at" timestamp with time zone,
	"last_verify_attempt_at" timestamp with time zone,
	"verify_attempt_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payment_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"attempt_id" uuid NOT NULL,
	"event_type" text NOT NULL,
	"from_status" text,
	"to_status" text NOT NULL,
	"error_code" text,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "payment_attempts" ADD CONSTRAINT "payment_attempts_billing_account_id_billing_accounts_id_fk" FOREIGN KEY ("billing_account_id") REFERENCES "public"."billing_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_events" ADD CONSTRAINT "payment_events_attempt_id_payment_attempts_id_fk" FOREIGN KEY ("attempt_id") REFERENCES "public"."payment_attempts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "payment_attempts_chain_tx_unique" ON "payment_attempts" USING btree ("chain_id","tx_hash") WHERE "payment_attempts"."tx_hash" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "payment_attempts_billing_account_idx" ON "payment_attempts" USING btree ("billing_account_id","created_at");--> statement-breakpoint
CREATE INDEX "payment_attempts_status_idx" ON "payment_attempts" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "payment_events_attempt_idx" ON "payment_events" USING btree ("attempt_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "credit_ledger_payment_ref_unique" ON "credit_ledger" USING btree ("reference") WHERE "credit_ledger"."reason" = 'widget_payment';