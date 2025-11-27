CREATE TABLE "llm_usage" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"billing_account_id" text NOT NULL,
	"virtual_key_id" uuid NOT NULL,
	"request_id" text,
	"model" text,
	"prompt_tokens" integer,
	"completion_tokens" integer,
	"provider_cost_usd" numeric,
	"provider_cost_credits" bigint,
	"user_price_credits" bigint,
	"markup_factor" numeric,
	"billing_status" text DEFAULT 'needs_review' NOT NULL,
	"usage" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "billing_accounts" ALTER COLUMN "balance_credits" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "credit_ledger" ALTER COLUMN "balance_after" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "llm_usage" ADD CONSTRAINT "llm_usage_billing_account_id_billing_accounts_id_fk" FOREIGN KEY ("billing_account_id") REFERENCES "public"."billing_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "llm_usage" ADD CONSTRAINT "llm_usage_virtual_key_id_virtual_keys_id_fk" FOREIGN KEY ("virtual_key_id") REFERENCES "public"."virtual_keys"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "llm_usage_billing_account_idx" ON "llm_usage" USING btree ("billing_account_id");--> statement-breakpoint
CREATE INDEX "llm_usage_virtual_key_idx" ON "llm_usage" USING btree ("virtual_key_id");--> statement-breakpoint
CREATE INDEX "llm_usage_request_idx" ON "llm_usage" USING btree ("request_id");