-- Append-only, tamper-evident audit metadata.
-- pgcrypto provides a SHA-256 chain; advisory transaction locks serialize inserts per tenant.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

ALTER TABLE "peopleos_audit_events"
  ADD COLUMN IF NOT EXISTS "before_json" text,
  ADD COLUMN IF NOT EXISTS "after_json" text,
  ADD COLUMN IF NOT EXISTS "reason" text,
  ADD COLUMN IF NOT EXISTS "ip_address" text,
  ADD COLUMN IF NOT EXISTS "user_agent" text,
  ADD COLUMN IF NOT EXISTS "request_id" text,
  ADD COLUMN IF NOT EXISTS "prev_hash" text,
  ADD COLUMN IF NOT EXISTS "hash" text;

CREATE OR REPLACE FUNCTION peopleos_audit_chain_and_immutability()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  previous_hash text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM pg_advisory_xact_lock(hashtext(NEW.organization_id));
    SELECT e."hash"
      INTO previous_hash
      FROM "peopleos_audit_events" e
      WHERE e."organization_id" = NEW."organization_id"
      ORDER BY e."occurred_at" DESC, e."id" DESC
      LIMIT 1;

    NEW."prev_hash" := COALESCE(previous_hash, '');
    NEW."hash" := encode(
      digest(
        concat_ws(
          '|',
          NEW."prev_hash",
          NEW."id"::text,
          NEW."organization_id",
          COALESCE(NEW."actor_user_id", ''),
          NEW."actor",
          NEW."action",
          NEW."target_type",
          NEW."target_id",
          NEW."summary",
          COALESCE(NEW."before_json", ''),
          COALESCE(NEW."after_json", ''),
          COALESCE(NEW."reason", ''),
          COALESCE(NEW."request_id", ''),
          NEW."occurred_at"::text
        ),
        'sha256'
      ),
      'hex'
    );
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'peopleos_audit_events is append-only; updates and deletes are prohibited';
END;
$$;

DROP TRIGGER IF EXISTS "peopleos_audit_events_immutable" ON "peopleos_audit_events";
CREATE TRIGGER "peopleos_audit_events_immutable"
BEFORE INSERT OR UPDATE OR DELETE ON "peopleos_audit_events"
FOR EACH ROW EXECUTE FUNCTION peopleos_audit_chain_and_immutability();

CREATE INDEX IF NOT EXISTS "peopleos_audit_org_hash_idx"
  ON "peopleos_audit_events" ("organization_id", "hash");
