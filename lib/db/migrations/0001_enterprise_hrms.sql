-- Rekker PeopleOS Enterprise HRMS Schema Migration (0001_enterprise_hrms)
-- Additive migration preserving all existing data and foreign key constraints.

CREATE TABLE IF NOT EXISTS "peopleos_interviews" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" text NOT NULL REFERENCES "peopleos_organizations"("id") ON DELETE CASCADE,
  "candidate_id" uuid NOT NULL REFERENCES "peopleos_candidates"("id") ON DELETE CASCADE,
  "requisition_id" uuid NOT NULL REFERENCES "peopleos_job_requisitions"("id") ON DELETE CASCADE,
  "interviewer_name" text NOT NULL,
  "scheduled_at" timestamp with time zone NOT NULL,
  "mode" text DEFAULT 'onsite' NOT NULL,
  "status" text DEFAULT 'scheduled' NOT NULL,
  "scorecard_json" text,
  "overall_rating" integer,
  "feedback_summary" text,
  "recommendation" text DEFAULT 'pending',
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "peopleos_interviews_org_cand_idx"
  ON "peopleos_interviews" ("organization_id", "candidate_id");

CREATE TABLE IF NOT EXISTS "peopleos_onboarding_tasks" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" text NOT NULL REFERENCES "peopleos_organizations"("id") ON DELETE CASCADE,
  "employee_id" uuid NOT NULL REFERENCES "peopleos_employees"("id") ON DELETE CASCADE,
  "workflow_type" text DEFAULT 'onboarding' NOT NULL,
  "title" text NOT NULL,
  "category" text NOT NULL,
  "assignee_role" text DEFAULT 'hr_admin' NOT NULL,
  "due_date" date NOT NULL,
  "completed" boolean DEFAULT false NOT NULL,
  "completed_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "peopleos_onboarding_org_emp_idx"
  ON "peopleos_onboarding_tasks" ("organization_id", "employee_id");

CREATE TABLE IF NOT EXISTS "peopleos_expenses" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" text NOT NULL REFERENCES "peopleos_organizations"("id") ON DELETE CASCADE,
  "employee_id" uuid NOT NULL REFERENCES "peopleos_employees"("id") ON DELETE CASCADE,
  "title" text NOT NULL,
  "category" text NOT NULL,
  "amount_kes" integer NOT NULL,
  "incurred_date" date NOT NULL,
  "receipt_reference" text,
  "notes" text,
  "status" text DEFAULT 'pending' NOT NULL,
  "approver_user_id" text,
  "decision_comment" text,
  "decided_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "peopleos_expenses_org_status_idx"
  ON "peopleos_expenses" ("organization_id", "status");

CREATE TABLE IF NOT EXISTS "peopleos_assets" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" text NOT NULL REFERENCES "peopleos_organizations"("id") ON DELETE CASCADE,
  "asset_tag" text NOT NULL,
  "name" text NOT NULL,
  "category" text NOT NULL,
  "serial_number" text NOT NULL,
  "condition" text DEFAULT 'good' NOT NULL,
  "assigned_employee_id" uuid REFERENCES "peopleos_employees"("id") ON DELETE SET NULL,
  "assigned_date" date,
  "return_due_date" date,
  "status" text DEFAULT 'available' NOT NULL,
  "value_kes" integer DEFAULT 0 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "peopleos_assets_org_tag_uq"
  ON "peopleos_assets" ("organization_id", "asset_tag");

CREATE INDEX IF NOT EXISTS "peopleos_assets_org_emp_idx"
  ON "peopleos_assets" ("organization_id", "assigned_employee_id");

CREATE TABLE IF NOT EXISTS "peopleos_statutory_configs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" text NOT NULL REFERENCES "peopleos_organizations"("id") ON DELETE CASCADE,
  "name" text NOT NULL,
  "effective_from" date NOT NULL,
  "effective_to" date,
  "config_json" text NOT NULL,
  "is_active" boolean DEFAULT true NOT NULL,
  "created_by_user_id" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "peopleos_statutory_org_eff_idx"
  ON "peopleos_statutory_configs" ("organization_id", "effective_from");

CREATE TABLE IF NOT EXISTS "peopleos_payroll_disbursements" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" text NOT NULL REFERENCES "peopleos_organizations"("id") ON DELETE CASCADE,
  "payroll_run_id" uuid NOT NULL REFERENCES "peopleos_payroll_runs"("id") ON DELETE CASCADE,
  "employee_id" uuid NOT NULL REFERENCES "peopleos_employees"("id") ON DELETE CASCADE,
  "channel" text DEFAULT 'mpesa_b2c' NOT NULL,
  "recipient_masked" text NOT NULL,
  "amount_kes" integer NOT NULL,
  "provider_mode" text DEFAULT 'SANDBOX_SIMULATION' NOT NULL,
  "transaction_reference" text NOT NULL,
  "status" text DEFAULT 'queued' NOT NULL,
  "initiated_by_user_id" text NOT NULL,
  "initiated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "peopleos_disb_org_run_idx"
  ON "peopleos_payroll_disbursements" ("organization_id", "payroll_run_id");

CREATE TABLE IF NOT EXISTS "peopleos_ai_agent_runs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" text NOT NULL REFERENCES "peopleos_organizations"("id") ON DELETE CASCADE,
  "conversation_id" text NOT NULL,
  "user_id" text NOT NULL,
  "user_role" text NOT NULL,
  "requested_agent" text NOT NULL,
  "resolved_agent" text NOT NULL,
  "provider" text NOT NULL,
  "model" text NOT NULL,
  "prompt_tokens" integer DEFAULT 0 NOT NULL,
  "completion_tokens" integer DEFAULT 0 NOT NULL,
  "estimated_cost_micros" integer DEFAULT 0 NOT NULL,
  "latency_ms" integer DEFAULT 0 NOT NULL,
  "tools_called_json" text DEFAULT '[]' NOT NULL,
  "status" text DEFAULT 'completed' NOT NULL,
  "error_message" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "peopleos_ai_runs_org_time_idx"
  ON "peopleos_ai_agent_runs" ("organization_id", "created_at");

CREATE TABLE IF NOT EXISTS "peopleos_ai_approval_requests" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" text NOT NULL REFERENCES "peopleos_organizations"("id") ON DELETE CASCADE,
  "agent_role" text NOT NULL,
  "requested_by_user_id" text NOT NULL,
  "target_type" text NOT NULL,
  "target_id" text NOT NULL,
  "proposed_action" text NOT NULL,
  "payload_json" text NOT NULL,
  "rationale" text NOT NULL,
  "status" text DEFAULT 'pending' NOT NULL,
  "decided_by_user_id" text,
  "decision_comment" text,
  "decided_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "peopleos_ai_approvals_org_status_idx"
  ON "peopleos_ai_approval_requests" ("organization_id", "status");

CREATE TABLE IF NOT EXISTS "peopleos_employee_training" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" text NOT NULL REFERENCES "peopleos_organizations"("id") ON DELETE CASCADE,
  "course_id" uuid NOT NULL REFERENCES "peopleos_courses"("id") ON DELETE CASCADE,
  "employee_id" uuid NOT NULL REFERENCES "peopleos_employees"("id") ON DELETE CASCADE,
  "status" text DEFAULT 'enrolled' NOT NULL,
  "progress_pct" integer DEFAULT 0 NOT NULL,
  "certificate_number" text,
  "completed_at" timestamp with time zone,
  "enrolled_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "peopleos_emp_training_org_emp_idx"
  ON "peopleos_employee_training" ("organization_id", "employee_id");
