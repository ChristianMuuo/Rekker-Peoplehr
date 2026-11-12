-- Rekker PeopleOS Phase 1 Foundation Additive Migration (0003)
-- 1. Persists payroll run preparer identity on peopleos_payroll_runs for DB-level Maker-Checker enforcement.
-- 2. Adds MIME type, SHA-256 integrity checksum, and uploader metadata to peopleos_documents.
-- 3. Idempotently reconciles any pre-existing hr_cases/workforce_shifts/workflow_rules FKs if previously applied.

ALTER TABLE "peopleos_payroll_runs"
  ADD COLUMN IF NOT EXISTS "created_by_user_id" text;

ALTER TABLE "peopleos_documents"
  ADD COLUMN IF NOT EXISTS "mime_type" text,
  ADD COLUMN IF NOT EXISTS "checksum_sha256" text,
  ADD COLUMN IF NOT EXISTS "uploaded_by_user_id" text;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'hr_cases_organization_id_organizations_id_fk'
  ) THEN
    ALTER TABLE "hr_cases" DROP CONSTRAINT "hr_cases_organization_id_organizations_id_fk";
    ALTER TABLE "hr_cases" ADD CONSTRAINT "hr_cases_organization_id_peopleos_organizations_id_fk"
      FOREIGN KEY ("organization_id") REFERENCES "peopleos_organizations"("id") ON DELETE CASCADE;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'workforce_shifts_organization_id_organizations_id_fk'
  ) THEN
    ALTER TABLE "workforce_shifts" DROP CONSTRAINT "workforce_shifts_organization_id_organizations_id_fk";
    ALTER TABLE "workforce_shifts" ADD CONSTRAINT "workforce_shifts_organization_id_peopleos_organizations_id_fk"
      FOREIGN KEY ("organization_id") REFERENCES "peopleos_organizations"("id") ON DELETE CASCADE;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'workflow_rules_organization_id_organizations_id_fk'
  ) THEN
    ALTER TABLE "workflow_rules" DROP CONSTRAINT "workflow_rules_organization_id_organizations_id_fk";
    ALTER TABLE "workflow_rules" ADD CONSTRAINT "workflow_rules_organization_id_peopleos_organizations_id_fk"
      FOREIGN KEY ("organization_id") REFERENCES "peopleos_organizations"("id") ON DELETE CASCADE;
  END IF;
END $$;
