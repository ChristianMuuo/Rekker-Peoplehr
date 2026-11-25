-- Leave approval-step history, effective policy snapshots and editable public holidays.
CREATE TABLE IF NOT EXISTS "peopleos_leave_approvals" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" text NOT NULL REFERENCES "peopleos_organizations"("id") ON DELETE CASCADE,
  "leave_request_id" uuid NOT NULL REFERENCES "peopleos_leave_requests"("id") ON DELETE RESTRICT,
  "step_index" integer NOT NULL,
  "step_type" text NOT NULL,
  "assigned_role" text NOT NULL,
  "reviewer_user_id" text,
  "decision" text NOT NULL DEFAULT 'pending',
  "comment" text,
  "decided_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "peopleos_leave_approvals_decision_check"
    CHECK ("decision" IN ('pending', 'recommended', 'not_recommended', 'approved', 'rejected', 'skipped'))
);
CREATE UNIQUE INDEX IF NOT EXISTS "peopleos_leave_approvals_request_step_uq"
  ON "peopleos_leave_approvals" ("organization_id", "leave_request_id", "step_index");
CREATE INDEX IF NOT EXISTS "peopleos_leave_approvals_org_reviewer_idx"
  ON "peopleos_leave_approvals" ("organization_id", "reviewer_user_id", "decision");

CREATE TABLE IF NOT EXISTS "peopleos_leave_policy_versions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" text NOT NULL REFERENCES "peopleos_organizations"("id") ON DELETE CASCADE,
  "policy_id" uuid NOT NULL REFERENCES "peopleos_leave_policies"("id") ON DELETE RESTRICT,
  "version" integer NOT NULL,
  "snapshot_json" text NOT NULL,
  "effective_from" date NOT NULL,
  "effective_to" date,
  "changed_by_user_id" text,
  "changed_at" timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "peopleos_leave_policy_versions_policy_ver_uq"
  ON "peopleos_leave_policy_versions" ("organization_id", "policy_id", "version");
CREATE INDEX IF NOT EXISTS "peopleos_leave_policy_versions_effective_idx"
  ON "peopleos_leave_policy_versions" ("organization_id", "policy_id", "effective_from", "effective_to");

CREATE TABLE IF NOT EXISTS "peopleos_public_holidays" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" text NOT NULL REFERENCES "peopleos_organizations"("id") ON DELETE CASCADE,
  "holiday_date" date NOT NULL,
  "name" text NOT NULL,
  "jurisdiction" text NOT NULL DEFAULT 'KE',
  "source_url" text,
  "is_gazetted" boolean NOT NULL DEFAULT false,
  "note" text,
  "created_by_user_id" text,
  "created_at" timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "peopleos_public_holidays_org_date_uq"
  ON "peopleos_public_holidays" ("organization_id", "holiday_date");
CREATE INDEX IF NOT EXISTS "peopleos_public_holidays_org_date_idx"
  ON "peopleos_public_holidays" ("organization_id", "holiday_date");

-- Version the existing policy state before any future policy updates.
INSERT INTO "peopleos_leave_policy_versions" (
  "organization_id", "policy_id", "version", "snapshot_json",
  "effective_from", "effective_to", "changed_by_user_id", "changed_at"
)
SELECT
  p."organization_id",
  p."id",
  1,
  to_jsonb(p)::text,
  COALESCE(p."effective_from", p."created_at"::date),
  p."effective_to",
  p."created_by_user_id",
  p."created_at"
FROM "peopleos_leave_policies" p
ON CONFLICT ("organization_id", "policy_id", "version") DO NOTHING;

-- Preserve existing recommendation and HR decisions as individual approval steps.
INSERT INTO "peopleos_leave_approvals" (
  "organization_id", "leave_request_id", "step_index", "step_type",
  "assigned_role", "reviewer_user_id", "decision", "comment", "decided_at"
)
SELECT
  r."organization_id", r."id", 1, 'manager_recommendation',
  'department_manager', r."recommendation_by_user_id",
  r."recommendation_status", r."recommendation_comment", r."recommendation_at"
FROM "peopleos_leave_requests" r
WHERE r."recommendation_status" IN ('recommended', 'not_recommended')
ON CONFLICT ("organization_id", "leave_request_id", "step_index") DO NOTHING;

INSERT INTO "peopleos_leave_approvals" (
  "organization_id", "leave_request_id", "step_index", "step_type",
  "assigned_role", "reviewer_user_id", "decision", "comment", "decided_at"
)
SELECT
  r."organization_id", r."id", 2, 'hr_approval',
  'hr_approver', r."approver_user_id",
  r."status", r."decision_comment", r."decided_at"
FROM "peopleos_leave_requests" r
WHERE r."status" IN ('approved', 'rejected')
ON CONFLICT ("organization_id", "leave_request_id", "step_index") DO NOTHING;
