-- Rekker PeopleOS Leave Ledger + Statutory Policy Metadata (0004)
-- Additive migration. Existing leave requests and audit records are preserved.

ALTER TABLE "peopleos_leave_policies"
  ADD COLUMN IF NOT EXISTS "entitlement_weeks" integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "entitlement_months" integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "sick_full_pay_days" integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "sick_half_pay_days" integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "minimum_service_months" integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "certificate_required" boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "paid_percentage" integer NOT NULL DEFAULT 100,
  ADD COLUMN IF NOT EXISTS "jurisdiction" text NOT NULL DEFAULT 'KE',
  ADD COLUMN IF NOT EXISTS "effective_from" date NOT NULL DEFAULT DATE '2026-01-01',
  ADD COLUMN IF NOT EXISTS "effective_to" date,
  ADD COLUMN IF NOT EXISTS "source_url" text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS "verified_on" date NOT NULL DEFAULT DATE '2026-11-25',
  ADD COLUMN IF NOT EXISTS "needs_legal_review" boolean NOT NULL DEFAULT true;

ALTER TABLE "peopleos_leave_requests"
  ADD COLUMN IF NOT EXISTS "half_day" boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "certificate_reference" text,
  ADD COLUMN IF NOT EXISTS "recommended_by_user_id" text,
  ADD COLUMN IF NOT EXISTS "recommended_at" timestamptz,
  ADD COLUMN IF NOT EXISTS "recommendation_json" text;

ALTER TABLE "peopleos_audit_events"
  ADD COLUMN IF NOT EXISTS "prev_hash" text,
  ADD COLUMN IF NOT EXISTS "hash" text;

CREATE TABLE IF NOT EXISTS "peopleos_leave_ledger" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" text NOT NULL REFERENCES "peopleos_organizations"("id") ON DELETE CASCADE,
  "employee_id" uuid NOT NULL REFERENCES "peopleos_employees"("id") ON DELETE RESTRICT,
  "leave_type" text NOT NULL,
  "request_id" uuid REFERENCES "peopleos_leave_requests"("id") ON DELETE RESTRICT,
  "entry_type" text NOT NULL,
  "quantity_quarter_days" integer NOT NULL,
  "effective_date" date NOT NULL,
  "idempotency_key" text NOT NULL,
  "note" text NOT NULL DEFAULT '',
  "created_by_user_id" text,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "is_demo" boolean NOT NULL DEFAULT false,
  CONSTRAINT "peopleos_leave_ledger_nonzero_quantity_ck" CHECK ("quantity_quarter_days" <> 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS "peopleos_leave_ledger_org_idempotency_uq"
  ON "peopleos_leave_ledger" ("organization_id", "idempotency_key");
CREATE INDEX IF NOT EXISTS "peopleos_leave_ledger_org_employee_idx"
  ON "peopleos_leave_ledger" ("organization_id", "employee_id");
CREATE INDEX IF NOT EXISTS "peopleos_leave_ledger_request_idx"
  ON "peopleos_leave_ledger" ("request_id");

CREATE TABLE IF NOT EXISTS "peopleos_leave_approval_steps" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" text NOT NULL REFERENCES "peopleos_organizations"("id") ON DELETE CASCADE,
  "request_id" uuid NOT NULL REFERENCES "peopleos_leave_requests"("id") ON DELETE CASCADE,
  "step" text NOT NULL,
  "decision" text NOT NULL,
  "actor_user_id" text NOT NULL,
  "actor_role" text NOT NULL,
  "comment" text NOT NULL DEFAULT '',
  "advisory_json" text,
  "created_at" timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "peopleos_leave_approval_request_step_uq"
  ON "peopleos_leave_approval_steps" ("request_id", "step");
CREATE INDEX IF NOT EXISTS "peopleos_leave_approval_org_time_idx"
  ON "peopleos_leave_approval_steps" ("organization_id", "created_at");

-- Ledgers and audit events are append-only. Reversals are new signed entries.
CREATE OR REPLACE FUNCTION peopleos_reject_immutable_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'Table % is append-only; insert a compensating event instead.', TG_TABLE_NAME;
END;
$$;

DROP TRIGGER IF EXISTS peopleos_leave_ledger_immutable_trg ON "peopleos_leave_ledger";
CREATE TRIGGER peopleos_leave_ledger_immutable_trg
  BEFORE UPDATE OR DELETE ON "peopleos_leave_ledger"
  FOR EACH ROW EXECUTE FUNCTION peopleos_reject_immutable_mutation();

DROP TRIGGER IF EXISTS peopleos_audit_events_immutable_trg ON "peopleos_audit_events";
CREATE TRIGGER peopleos_audit_events_immutable_trg
  BEFORE UPDATE OR DELETE ON "peopleos_audit_events"
  FOR EACH ROW EXECUTE FUNCTION peopleos_reject_immutable_mutation();

-- Backfill the existing approval decision into a one-step approval record.
INSERT INTO "peopleos_leave_approval_steps"
  ("organization_id", "request_id", "step", "decision", "actor_user_id", "actor_role", "comment", "created_at")
SELECT
  "organization_id", "id", 'legacy_decision', "status",
  COALESCE("approver_user_id", "created_by_user_id", 'system_migration'),
  'system_migration', COALESCE("decision_comment", ''), COALESCE("decided_at", "submitted_at")
FROM "peopleos_leave_requests"
WHERE "status" IN ('approved', 'rejected')
ON CONFLICT ("request_id", "step") DO NOTHING;
