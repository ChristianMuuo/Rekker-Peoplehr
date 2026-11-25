-- Rekker PeopleOS Leave Management Foundation (0008)
-- Additive migration. Existing leave requests/policies are preserved.
ALTER TABLE "peopleos_leave_policies"
  ADD COLUMN IF NOT EXISTS "entitlement_quantity" integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "entitlement_unit" text NOT NULL DEFAULT 'days',
  ADD COLUMN IF NOT EXISTS "jurisdiction" text NOT NULL DEFAULT 'KE',
  ADD COLUMN IF NOT EXISTS "effective_from" date,
  ADD COLUMN IF NOT EXISTS "effective_to" date,
  ADD COLUMN IF NOT EXISTS "source_url" text,
  ADD COLUMN IF NOT EXISTS "verified_on" date,
  ADD COLUMN IF NOT EXISTS "needs_legal_review" boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "policy_metadata_json" text;

UPDATE "peopleos_leave_policies"
SET "entitlement_quantity" = "entitlement_days"
WHERE "entitlement_quantity" = 0 AND "entitlement_days" > 0;

ALTER TABLE "peopleos_leave_requests"
  ALTER COLUMN "days" TYPE numeric(8,2) USING "days"::numeric(8,2),
  ADD COLUMN IF NOT EXISTS "half_day" boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "recommendation_status" text NOT NULL DEFAULT 'not_assessed',
  ADD COLUMN IF NOT EXISTS "recommendation_comment" text,
  ADD COLUMN IF NOT EXISTS "recommendation_json" text;

CREATE TABLE IF NOT EXISTS "peopleos_leave_ledger" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" text NOT NULL REFERENCES "peopleos_organizations"("id") ON DELETE CASCADE,
  "employee_id" uuid NOT NULL REFERENCES "peopleos_employees"("id") ON DELETE RESTRICT,
  "leave_type" text NOT NULL,
  "leave_request_id" uuid REFERENCES "peopleos_leave_requests"("id") ON DELETE RESTRICT,
  "entry_type" text NOT NULL,
  "quantity_days" numeric(8,2) NOT NULL,
  "source_key" text NOT NULL,
  "description" text NOT NULL,
  "created_by_user_id" text,
  "occurred_at" timestamptz NOT NULL DEFAULT now(),
  "is_demo" boolean NOT NULL DEFAULT false,
  CONSTRAINT "peopleos_leave_ledger_entry_type_check"
    CHECK ("entry_type" IN ('accrual', 'deduction', 'adjustment', 'reversal', 'carry_over', 'expiry'))
);

CREATE UNIQUE INDEX IF NOT EXISTS "peopleos_leave_ledger_org_source_uq"
  ON "peopleos_leave_ledger" ("organization_id", "source_key");
CREATE INDEX IF NOT EXISTS "peopleos_leave_ledger_org_employee_type_idx"
  ON "peopleos_leave_ledger" ("organization_id", "employee_id", "leave_type");
CREATE INDEX IF NOT EXISTS "peopleos_leave_ledger_request_idx"
  ON "peopleos_leave_ledger" ("leave_request_id");

-- Backfill approved historical requests so existing balances remain represented
-- in the ledger after the code switches from request-derived deductions.
INSERT INTO "peopleos_leave_ledger" (
  "organization_id", "employee_id", "leave_type", "leave_request_id",
  "entry_type", "quantity_days", "source_key", "description",
  "created_by_user_id", "occurred_at", "is_demo"
)
SELECT
  r."organization_id", r."employee_id", r."leave_type", r."id",
  'deduction', -r."days", 'approval:' || r."id"::text,
  'Backfilled approved leave request deduction',
  r."approver_user_id", COALESCE(r."decided_at", r."submitted_at"), r."is_demo"
FROM "peopleos_leave_requests" r
WHERE r."status" = 'approved'
ON CONFLICT ("organization_id", "source_key") DO NOTHING;

-- Protect the ledger against normal application UPDATE/DELETE operations.
CREATE OR REPLACE FUNCTION peopleos_reject_leave_ledger_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'peopleos_leave_ledger is append-only; write a reversal entry instead';
END;
$$;

DROP TRIGGER IF EXISTS "peopleos_leave_ledger_immutable" ON "peopleos_leave_ledger";
CREATE TRIGGER "peopleos_leave_ledger_immutable"
BEFORE UPDATE OR DELETE ON "peopleos_leave_ledger"
FOR EACH ROW EXECUTE FUNCTION peopleos_reject_leave_ledger_mutation();
