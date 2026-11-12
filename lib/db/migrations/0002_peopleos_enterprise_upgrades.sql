-- PeopleOS Enterprise HR & ERP Workforce Operations Migration (0002)
-- Reconciled FK targets to physical tables "peopleos_organizations" and "peopleos_employees".

CREATE TABLE IF NOT EXISTS "hr_cases" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" text NOT NULL REFERENCES "peopleos_organizations"("id") ON DELETE CASCADE,
  "case_number" text NOT NULL,
  "subject_employee_id" uuid REFERENCES "peopleos_employees"("id") ON DELETE SET NULL,
  "submitted_by_user_id" text NOT NULL,
  "category" text NOT NULL,
  "severity" text NOT NULL DEFAULT 'medium',
  "title" text NOT NULL,
  "description" text NOT NULL,
  "confidential_notes" text NOT NULL DEFAULT '',
  "assigned_investigator_user_id" text,
  "status" text NOT NULL DEFAULT 'open',
  "resolution_summary" text,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "hr_cases_org_status_idx" ON "hr_cases" ("organization_id", "status");

CREATE TABLE IF NOT EXISTS "workforce_shifts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" text NOT NULL REFERENCES "peopleos_organizations"("id") ON DELETE CASCADE,
  "employee_id" uuid NOT NULL REFERENCES "peopleos_employees"("id") ON DELETE CASCADE,
  "unit_type" text NOT NULL,
  "work_zone" text NOT NULL,
  "shift_name" text NOT NULL,
  "role_skill" text NOT NULL,
  "certification_valid_until" text,
  "safety_cleared" boolean NOT NULL DEFAULT true,
  "cost_centre_code" text NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "workforce_shifts_org_unit_idx" ON "workforce_shifts" ("organization_id", "unit_type");

CREATE TABLE IF NOT EXISTS "workflow_rules" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" text NOT NULL REFERENCES "peopleos_organizations"("id") ON DELETE CASCADE,
  "domain" text NOT NULL,
  "name" text NOT NULL,
  "threshold_amount_kes" integer,
  "approval_levels" integer NOT NULL DEFAULT 1,
  "required_approver_roles_json" text NOT NULL DEFAULT '[]',
  "sla_hours" integer NOT NULL DEFAULT 24,
  "is_active" boolean NOT NULL DEFAULT true,
  "created_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "workflow_rules_org_domain_idx" ON "workflow_rules" ("organization_id", "domain");
