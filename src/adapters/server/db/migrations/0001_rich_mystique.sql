ALTER TABLE "charge_receipts" ADD COLUMN "charge_reason" text NOT NULL;--> statement-breakpoint
ALTER TABLE "charge_receipts" ADD COLUMN "source_system" text NOT NULL;--> statement-breakpoint
ALTER TABLE "charge_receipts" ADD COLUMN "source_reference" text NOT NULL;--> statement-breakpoint
CREATE INDEX "charge_receipts_source_link_idx" ON "charge_receipts" USING btree ("source_system","source_reference");