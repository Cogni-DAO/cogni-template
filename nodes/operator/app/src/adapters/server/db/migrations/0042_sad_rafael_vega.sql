ALTER TABLE "ingestion_receipts" ADD COLUMN "display_snapshot" jsonb;--> statement-breakpoint

CREATE OR REPLACE FUNCTION ingestion_receipts_guard_mutation() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'DELETE not allowed on ingestion_receipts (immutable economic core)';
  END IF;

  IF ROW(
    NEW.node_id,
    NEW.receipt_id,
    NEW.source,
    NEW.event_type,
    NEW.platform_user_id,
    NEW.platform_login,
    NEW.artifact_url,
    NEW.metadata,
    NEW.payload_hash,
    NEW.producer,
    NEW.producer_version,
    NEW.event_time,
    NEW.retrieved_at,
    NEW.ingested_at
  ) IS DISTINCT FROM ROW(
    OLD.node_id,
    OLD.receipt_id,
    OLD.source,
    OLD.event_type,
    OLD.platform_user_id,
    OLD.platform_login,
    OLD.artifact_url,
    OLD.metadata,
    OLD.payload_hash,
    OLD.producer,
    OLD.producer_version,
    OLD.event_time,
    OLD.retrieved_at,
    OLD.ingested_at
  ) THEN
    RAISE EXCEPTION 'UPDATE may only refresh ingestion_receipts.display_snapshot';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint

DROP TRIGGER IF EXISTS ingestion_receipts_immutable ON "ingestion_receipts";--> statement-breakpoint
CREATE TRIGGER ingestion_receipts_immutable
  BEFORE UPDATE OR DELETE ON "ingestion_receipts"
  FOR EACH ROW EXECUTE FUNCTION ingestion_receipts_guard_mutation();--> statement-breakpoint

UPDATE "ingestion_receipts"
SET "display_snapshot" = jsonb_build_object(
  'schemaVersion', 1,
  'platformLogin', "platform_login",
  'artifactUrl', "artifact_url",
  'metadata', COALESCE("metadata", '{}'::jsonb)
)
WHERE "display_snapshot" IS NULL;
