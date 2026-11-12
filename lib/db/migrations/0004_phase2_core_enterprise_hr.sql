-- Phase 2: Core Enterprise HR, Employee Master Data and Lifecycle Transformation
-- Additive, idempotent migration preserving all Phase 1 tables and data.

ALTER TABLE peopleos_organizations
  ADD COLUMN IF NOT EXISTS default_timezone TEXT NOT NULL DEFAULT 'Africa/Nairobi';

ALTER TABLE peopleos_employees
  ADD COLUMN IF NOT EXISTS personal_email TEXT,
  ADD COLUMN IF NOT EXISTS contact_preferences_json TEXT,
  ADD COLUMN IF NOT EXISTS position_id UUID,
  ADD COLUMN IF NOT EXISTS hr_representative_user_id TEXT,
  ADD COLUMN IF NOT EXISTS timezone TEXT NOT NULL DEFAULT 'Africa/Nairobi',
  ADD COLUMN IF NOT EXISTS employee_category TEXT DEFAULT 'staff',
  ADD COLUMN IF NOT EXISTS contract_start_date DATE,
  ADD COLUMN IF NOT EXISTS qualifications_json TEXT,
  ADD COLUMN IF NOT EXISTS certifications_json TEXT,
  ADD COLUMN IF NOT EXISTS work_experience_json TEXT;

ALTER TABLE peopleos_job_requisitions
  ADD COLUMN IF NOT EXISTS position_id UUID;

ALTER TABLE peopleos_candidates
  ADD COLUMN IF NOT EXISTS converted_employee_id UUID,
  ADD COLUMN IF NOT EXISTS converted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS offer_details_json TEXT;

ALTER TABLE peopleos_onboarding_tasks
  ADD COLUMN IF NOT EXISTS template_id UUID,
  ADD COLUMN IF NOT EXISTS owner_user_id TEXT,
  ADD COLUMN IF NOT EXISTS notes TEXT;

CREATE TABLE IF NOT EXISTS peopleos_positions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id TEXT NOT NULL REFERENCES peopleos_organizations(id) ON DELETE CASCADE,
  position_code TEXT NOT NULL,
  title TEXT NOT NULL,
  department_id UUID NOT NULL REFERENCES peopleos_departments(id) ON DELETE RESTRICT,
  reports_to_position_id UUID,
  location TEXT NOT NULL,
  employment_type TEXT NOT NULL DEFAULT 'permanent',
  employee_category TEXT NOT NULL DEFAULT 'staff',
  status TEXT NOT NULL DEFAULT 'draft',
  budgeted_headcount INTEGER NOT NULL DEFAULT 1,
  grade_band TEXT,
  cost_center TEXT,
  description TEXT,
  created_by_user_id TEXT,
  approved_by_user_id TEXT,
  approved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS peopleos_positions_org_code_uq
  ON peopleos_positions(organization_id, position_code);

CREATE INDEX IF NOT EXISTS peopleos_positions_org_dept_status_idx
  ON peopleos_positions(organization_id, department_id, status);

CREATE TABLE IF NOT EXISTS peopleos_employee_position_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id TEXT NOT NULL REFERENCES peopleos_organizations(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES peopleos_employees(id) ON DELETE CASCADE,
  position_id UUID NOT NULL REFERENCES peopleos_positions(id) ON DELETE RESTRICT,
  assignment_type TEXT NOT NULL DEFAULT 'primary',
  effective_from DATE NOT NULL,
  effective_to DATE,
  is_current BOOLEAN NOT NULL DEFAULT TRUE,
  change_reason TEXT,
  changed_by_user_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS peopleos_emp_pos_org_emp_idx
  ON peopleos_employee_position_assignments(organization_id, employee_id, is_current);

CREATE INDEX IF NOT EXISTS peopleos_emp_pos_org_pos_idx
  ON peopleos_employee_position_assignments(organization_id, position_id, is_current);

CREATE TABLE IF NOT EXISTS peopleos_employee_assignment_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id TEXT NOT NULL REFERENCES peopleos_organizations(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES peopleos_employees(id) ON DELETE CASCADE,
  effective_date DATE NOT NULL,
  effective_end_date DATE,
  change_type TEXT NOT NULL,
  department_id UUID REFERENCES peopleos_departments(id) ON DELETE RESTRICT,
  position_id UUID REFERENCES peopleos_positions(id) ON DELETE SET NULL,
  manager_id UUID,
  job_title TEXT NOT NULL,
  location TEXT NOT NULL,
  employment_type TEXT NOT NULL,
  status TEXT NOT NULL,
  reason TEXT,
  approved_by_user_id TEXT,
  changed_by_user_id TEXT,
  previous_snapshot_json TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS peopleos_emp_hist_org_emp_date_idx
  ON peopleos_employee_assignment_history(organization_id, employee_id, effective_date);

CREATE TABLE IF NOT EXISTS peopleos_employee_import_mapping_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id TEXT NOT NULL REFERENCES peopleos_organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  mapping_json TEXT NOT NULL,
  created_by_user_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS peopleos_imp_profile_org_name_uq
  ON peopleos_employee_import_mapping_profiles(organization_id, name);

CREATE TABLE IF NOT EXISTS peopleos_employee_import_batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id TEXT NOT NULL REFERENCES peopleos_organizations(id) ON DELETE CASCADE,
  created_by_user_id TEXT NOT NULL,
  file_name TEXT NOT NULL,
  source_hash_sha256 TEXT NOT NULL,
  mapping_json TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'UPLOADED',
  total_rows INTEGER NOT NULL DEFAULT 0,
  valid_count INTEGER NOT NULL DEFAULT 0,
  duplicate_count INTEGER NOT NULL DEFAULT 0,
  error_count INTEGER NOT NULL DEFAULT 0,
  imported_count INTEGER NOT NULL DEFAULT 0,
  token_digest TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  committed_at TIMESTAMPTZ,
  committed_by_user_id TEXT,
  summary_json TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS peopleos_imp_batch_org_state_idx
  ON peopleos_employee_import_batches(organization_id, state);

CREATE TABLE IF NOT EXISTS peopleos_employee_import_rows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id UUID NOT NULL REFERENCES peopleos_employee_import_batches(id) ON DELETE CASCADE,
  organization_id TEXT NOT NULL REFERENCES peopleos_organizations(id) ON DELETE CASCADE,
  row_number INTEGER NOT NULL,
  status TEXT NOT NULL,
  raw_json TEXT NOT NULL,
  normalized_json TEXT,
  errors_json TEXT NOT NULL DEFAULT '[]',
  warnings_json TEXT NOT NULL DEFAULT '[]',
  committed_employee_id UUID
);

CREATE INDEX IF NOT EXISTS peopleos_imp_rows_batch_idx
  ON peopleos_employee_import_rows(batch_id, row_number);

CREATE TABLE IF NOT EXISTS peopleos_onboarding_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id TEXT NOT NULL REFERENCES peopleos_organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  workflow_type TEXT NOT NULL DEFAULT 'onboarding',
  department_code TEXT,
  employment_type TEXT,
  tasks_json TEXT NOT NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_by_user_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS peopleos_onb_tmpl_org_type_idx
  ON peopleos_onboarding_templates(organization_id, workflow_type);

CREATE TABLE IF NOT EXISTS peopleos_probation_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id TEXT NOT NULL REFERENCES peopleos_organizations(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES peopleos_employees(id) ON DELETE CASCADE,
  probation_start_date DATE NOT NULL,
  probation_end_date DATE NOT NULL,
  extended_until_date DATE,
  extension_count INTEGER NOT NULL DEFAULT 0,
  milestone_day INTEGER NOT NULL DEFAULT 90,
  status TEXT NOT NULL DEFAULT 'pending_review',
  manager_recommendation TEXT,
  outcome TEXT,
  decision_notes TEXT,
  reviewed_by_user_id TEXT,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS peopleos_probation_org_emp_idx
  ON peopleos_probation_reviews(organization_id, employee_id);

CREATE TABLE IF NOT EXISTS peopleos_contract_reminders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id TEXT NOT NULL REFERENCES peopleos_organizations(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES peopleos_employees(id) ON DELETE CASCADE,
  contract_end_date DATE NOT NULL,
  reminder_window_days INTEGER NOT NULL DEFAULT 30,
  status TEXT NOT NULL DEFAULT 'open',
  action_taken TEXT,
  notes TEXT,
  handled_by_user_id TEXT,
  handled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS peopleos_contract_rem_org_emp_idx
  ON peopleos_contract_reminders(organization_id, employee_id);

CREATE TABLE IF NOT EXISTS peopleos_profile_correction_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id TEXT NOT NULL REFERENCES peopleos_organizations(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES peopleos_employees(id) ON DELETE CASCADE,
  requested_by_user_id TEXT NOT NULL,
  field_name TEXT NOT NULL,
  current_value TEXT,
  proposed_value TEXT NOT NULL,
  reason TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  reviewed_by_user_id TEXT,
  decision_comment TEXT,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS peopleos_prof_corr_org_emp_idx
  ON peopleos_profile_correction_requests(organization_id, employee_id, status);

CREATE TABLE IF NOT EXISTS peopleos_privacy_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id TEXT NOT NULL REFERENCES peopleos_organizations(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES peopleos_employees(id) ON DELETE CASCADE,
  requested_by_user_id TEXT NOT NULL,
  request_type TEXT NOT NULL,
  details TEXT NOT NULL,
  statutory_due_date DATE NOT NULL,
  legal_basis_reference TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'submitted',
  retention_check_required BOOLEAN NOT NULL DEFAULT TRUE,
  handled_by_user_id TEXT,
  decision_notes TEXT,
  decided_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS peopleos_privacy_org_emp_idx
  ON peopleos_privacy_requests(organization_id, employee_id, status);

CREATE TABLE IF NOT EXISTS peopleos_work_calendars (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id TEXT NOT NULL REFERENCES peopleos_organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  location TEXT,
  timezone TEXT NOT NULL DEFAULT 'Africa/Nairobi',
  workdays_json TEXT NOT NULL DEFAULT '[1,2,3,4,5]',
  holidays_json TEXT NOT NULL DEFAULT '[]',
  shift_start_time TEXT NOT NULL DEFAULT '08:00',
  shift_end_time TEXT NOT NULL DEFAULT '17:00',
  is_default BOOLEAN NOT NULL DEFAULT FALSE,
  updated_by_user_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS peopleos_work_cal_org_idx
  ON peopleos_work_calendars(organization_id, is_default);

CREATE TABLE IF NOT EXISTS peopleos_attendance_corrections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id TEXT NOT NULL REFERENCES peopleos_organizations(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES peopleos_employees(id) ON DELETE CASCADE,
  attendance_record_id UUID,
  date DATE NOT NULL,
  requested_clock_in TEXT NOT NULL,
  requested_clock_out TEXT,
  reason TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  requested_by_user_id TEXT NOT NULL,
  reviewed_by_user_id TEXT,
  decision_comment TEXT,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS peopleos_att_corr_org_emp_idx
  ON peopleos_attendance_corrections(organization_id, employee_id, status);

