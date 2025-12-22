ALTER TABLE "charge_receipts" RENAME COLUMN "request_id" TO "ingress_request_id";--> statement-breakpoint
ALTER TABLE "charge_receipts" DROP CONSTRAINT "charge_receipts_request_id_unique";--> statement-breakpoint
DROP INDEX "charge_receipts_source_link_idx";--> statement-breakpoint
ALTER TABLE "charge_receipts" ADD COLUMN "run_id" text NOT NULL;--> statement-breakpoint
ALTER TABLE "charge_receipts" ADD COLUMN "attempt" integer NOT NULL;--> statement-breakpoint
CREATE INDEX "charge_receipts_ingress_request_idx" ON "charge_receipts" USING btree ("ingress_request_id");--> statement-breakpoint
CREATE INDEX "charge_receipts_run_attempt_idx" ON "charge_receipts" USING btree ("run_id","attempt");--> statement-breakpoint
CREATE UNIQUE INDEX "charge_receipts_source_idempotency_unique" ON "charge_receipts" USING btree ("source_system","source_reference");