ALTER TABLE "nodes" ADD COLUMN "deploy_envs" text[] DEFAULT ARRAY['candidate-a']::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "nodes" ADD COLUMN "activity_env" text DEFAULT 'candidate-a' NOT NULL;--> statement-breakpoint
-- Existing rows predate env projection and were born under the legacy all-three-env footprint.
-- Preserve that deploy intent until the catalog reconciler reads merged main; keep wizard/test rows
-- candidate-active by default so production can never start a second epoch ledger during rollout.
UPDATE "nodes" SET "deploy_envs" = ARRAY['candidate-a','preview','production']::text[];--> statement-breakpoint
-- These established fleet nodes already run their canonical activity ledger in production. The
-- throwaway/fresh-spawn set (including toks4) deliberately remains candidate-a until validated cutover.
UPDATE "nodes" SET "activity_env" = 'production'
WHERE "slug" IN ('operator','node-template','beacon','poly','blue','oss','habitat');--> statement-breakpoint
CREATE INDEX "nodes_activity_env_idx" ON "nodes" USING btree ("activity_env");--> statement-breakpoint
ALTER TABLE "nodes" ADD CONSTRAINT "nodes_deploy_envs_check" CHECK ("nodes"."deploy_envs" <@ ARRAY['candidate-a','preview','production']::text[]);--> statement-breakpoint
ALTER TABLE "nodes" ADD CONSTRAINT "nodes_activity_env_check" CHECK ("nodes"."activity_env" IN ('candidate-a','preview','production') AND "nodes"."activity_env" = ANY("nodes"."deploy_envs"));
