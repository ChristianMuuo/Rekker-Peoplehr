-- Store the entitlement year separately from the timestamp so requests
-- approved in one year for leave taken in another are posted to the correct balance.
ALTER TABLE "peopleos_leave_ledger"
  ADD COLUMN IF NOT EXISTS "leave_year" integer;

UPDATE "peopleos_leave_ledger"
SET "leave_year" = EXTRACT(YEAR FROM "occurred_at")::integer
WHERE "leave_year" IS NULL;

UPDATE "peopleos_leave_ledger" l
SET "leave_year" = EXTRACT(YEAR FROM r."start_date")::integer
FROM "peopleos_leave_requests" r
WHERE l."leave_request_id" = r."id"
  AND l."leave_year" IS DISTINCT FROM EXTRACT(YEAR FROM r."start_date")::integer;

ALTER TABLE "peopleos_leave_ledger"
  ALTER COLUMN "leave_year" SET NOT NULL;

CREATE INDEX IF NOT EXISTS "peopleos_leave_ledger_org_year_idx"
  ON "peopleos_leave_ledger" ("organization_id", "leave_year", "employee_id", "leave_type");
