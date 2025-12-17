CREATE TABLE "ai_invocation_summaries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"invocation_id" text NOT NULL,
	"request_id" text NOT NULL,
	"trace_id" text NOT NULL,
	"langfuse_trace_id" text,
	"litellm_call_id" text,
	"prompt_hash" text NOT NULL,
	"router_policy_version" text NOT NULL,
	"graph_run_id" text,
	"graph_name" text,
	"graph_version" text,
	"provider" text NOT NULL,
	"model" text NOT NULL,
	"tokens_in" integer,
	"tokens_out" integer,
	"tokens_total" integer,
	"provider_cost_usd" numeric,
	"latency_ms" integer NOT NULL,
	"status" text NOT NULL,
	"error_code" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ai_invocation_summaries_invocation_id_unique" UNIQUE("invocation_id")
);
--> statement-breakpoint
CREATE INDEX "ai_invocation_summaries_request_id_idx" ON "ai_invocation_summaries" USING btree ("request_id");--> statement-breakpoint
CREATE INDEX "ai_invocation_summaries_trace_id_idx" ON "ai_invocation_summaries" USING btree ("trace_id");--> statement-breakpoint
CREATE INDEX "ai_invocation_summaries_litellm_call_id_idx" ON "ai_invocation_summaries" USING btree ("litellm_call_id");--> statement-breakpoint
CREATE INDEX "ai_invocation_summaries_prompt_hash_idx" ON "ai_invocation_summaries" USING btree ("prompt_hash");--> statement-breakpoint
CREATE INDEX "ai_invocation_summaries_created_at_idx" ON "ai_invocation_summaries" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "ai_invocation_summaries_status_idx" ON "ai_invocation_summaries" USING btree ("status","created_at");