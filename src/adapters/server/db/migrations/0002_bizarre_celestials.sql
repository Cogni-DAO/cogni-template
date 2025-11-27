ALTER TABLE "llm_usage" ALTER COLUMN "provider_cost_usd" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "llm_usage" ALTER COLUMN "provider_cost_credits" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "llm_usage" ALTER COLUMN "user_price_credits" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "llm_usage" ALTER COLUMN "markup_factor" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "llm_usage" ADD COLUMN "billing_status" text DEFAULT 'needs_review' NOT NULL;