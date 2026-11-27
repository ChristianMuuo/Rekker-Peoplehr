-- 0008_production_core.sql: Persistent RBAC, Auth Sessions, Leave Ledger/Balances/Types/Policies, Audit Chain, Notifications & Settings

CREATE TABLE IF NOT EXISTS peopleos_roles (
  id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  is_system BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS peopleos_permissions (
  code TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  module TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS peopleos_role_permissions (
  role_id TEXT NOT NULL REFERENCES peopleos_roles(id) ON DELETE CASCADE,
  permission_code TEXT NOT NULL REFERENCES peopleos_permissions(code) ON DELETE CASCADE,
  PRIMARY KEY (role_id, permission_code)
);

CREATE TABLE IF NOT EXISTS peopleos_users (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  full_name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'employee',
  employee_id UUID REFERENCES employees(id) ON DELETE SET NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  failed_login_attempts INTEGER NOT NULL DEFAULT 0,
  locked_until TIMESTAMPTZ,
  totp_secret_encrypted TEXT,
  totp_enabled BOOLEAN NOT NULL DEFAULT false,
  password_reset_token_hash TEXT,
  password_reset_expires_at TIMESTAMPTZ,
  is_demo BOOLEAN NOT NULL DEFAULT false,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS peopleos_users_org_email_uq ON peopleos_users (organization_id, email);
CREATE INDEX IF NOT EXISTS peopleos_users_org_role_idx ON peopleos_users (organization_id, role);

CREATE TABLE IF NOT EXISTS peopleos_user_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL REFERENCES peopleos_users(id) ON DELETE CASCADE,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL,
  csrf_secret TEXT NOT NULL,
  mfa_verified BOOLEAN NOT NULL DEFAULT false,
  ip_address TEXT,
  user_agent TEXT,
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS peopleos_user_sessions_token_uq ON peopleos_user_sessions (token_hash);
CREATE INDEX IF NOT EXISTS peopleos_user_sessions_user_idx ON peopleos_user_sessions (user_id, expires_at);

CREATE TABLE IF NOT EXISTS peopleos_designations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  title TEXT NOT NULL,
  grade_band TEXT NOT NULL DEFAULT 'G1',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS peopleos_designations_org_code_uq ON peopleos_designations (organization_id, code);

CREATE TABLE IF NOT EXISTS peopleos_work_schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  pattern_type TEXT NOT NULL DEFAULT '5_day',
  workdays_json TEXT NOT NULL DEFAULT '[1,2,3,4,5]',
  half_day_weekdays_json TEXT NOT NULL DEFAULT '[]',
  hours_per_day INTEGER NOT NULL DEFAULT 8,
  is_default BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS peopleos_work_schedules_org_code_uq ON peopleos_work_schedules (organization_id, code);

CREATE TABLE IF NOT EXISTS peopleos_public_holidays (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  holiday_date DATE NOT NULL,
  name TEXT NOT NULL,
  holiday_type TEXT NOT NULL DEFAULT 'gazetted',
  year INTEGER NOT NULL,
  source_url TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS peopleos_public_holidays_org_date_uq ON peopleos_public_holidays (organization_id, holiday_date);
CREATE INDEX IF NOT EXISTS peopleos_public_holidays_org_year_idx ON peopleos_public_holidays (organization_id, year);

CREATE TABLE IF NOT EXISTS peopleos_leave_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'statutory',
  is_paid BOOLEAN NOT NULL DEFAULT true,
  paid_percentage INTEGER NOT NULL DEFAULT 100,
  requires_certificate BOOLEAN NOT NULL DEFAULT false,
  certificate_after_days INTEGER,
  allow_half_days BOOLEAN NOT NULL DEFAULT true,
  statutory_citation TEXT,
  source_url TEXT,
  verified_on DATE,
  needs_legal_review BOOLEAN NOT NULL DEFAULT false,
  legal_note TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS peopleos_leave_types_org_code_uq ON peopleos_leave_types (organization_id, code);

CREATE TABLE IF NOT EXISTS peopleos_leave_policy_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  leave_type_id UUID NOT NULL REFERENCES peopleos_leave_types(id) ON DELETE CASCADE,
  leave_type_code TEXT NOT NULL,
  name TEXT NOT NULL,
  jurisdiction TEXT NOT NULL DEFAULT 'KE',
  entitlement_quantity INTEGER NOT NULL DEFAULT 21,
  entitlement_unit TEXT NOT NULL DEFAULT 'days',
  accrual_frequency TEXT NOT NULL DEFAULT 'monthly',
  accrual_rate_hundredths INTEGER NOT NULL DEFAULT 175,
  min_service_months INTEGER NOT NULL DEFAULT 0,
  max_consecutive_days INTEGER,
  carry_forward_cap_days INTEGER NOT NULL DEFAULT 0,
  carry_forward_expiry_months INTEGER NOT NULL DEFAULT 3,
  allow_negative_balance BOOLEAN NOT NULL DEFAULT false,
  exclude_weekends BOOLEAN NOT NULL DEFAULT true,
  exclude_public_holidays BOOLEAN NOT NULL DEFAULT true,
  requires_recommendation BOOLEAN NOT NULL DEFAULT true,
  requires_approval BOOLEAN NOT NULL DEFAULT true,
  approval_stages_json TEXT NOT NULL DEFAULT '["line_manager","hr_manager"]',
  applicable_departments_json TEXT NOT NULL DEFAULT '[]',
  applicable_employment_types_json TEXT NOT NULL DEFAULT '[]',
  effective_from DATE NOT NULL,
  effective_to DATE,
  source_url TEXT,
  verified_on DATE,
  needs_legal_review BOOLEAN NOT NULL DEFAULT false,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by_user_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS peopleos_leave_pol_cfg_org_code_idx ON peopleos_leave_policy_configs (organization_id, leave_type_code, is_active);

CREATE TABLE IF NOT EXISTS peopleos_leave_policy_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  policy_id UUID NOT NULL REFERENCES peopleos_leave_policy_configs(id) ON DELETE CASCADE,
  employee_id UUID REFERENCES employees(id) ON DELETE CASCADE,
  department_id UUID,
  effective_from DATE NOT NULL,
  effective_to DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS peopleos_leave_pol_assign_org_emp_idx ON peopleos_leave_policy_assignments (organization_id, employee_id);

CREATE TABLE IF NOT EXISTS peopleos_leave_ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  leave_type_code TEXT NOT NULL,
  leave_year INTEGER NOT NULL,
  entry_type TEXT NOT NULL,
  days_hundredths INTEGER NOT NULL,
  leave_request_id UUID,
  reason TEXT NOT NULL,
  idempotency_key TEXT,
  created_by_user_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS peopleos_leave_ledger_idemp_uq ON peopleos_leave_ledger (organization_id, idempotency_key);
CREATE INDEX IF NOT EXISTS peopleos_leave_ledger_emp_type_yr_idx ON peopleos_leave_ledger (organization_id, employee_id, leave_type_code, leave_year);

CREATE TABLE IF NOT EXISTS peopleos_leave_balances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  leave_type_code TEXT NOT NULL,
  leave_year INTEGER NOT NULL,
  entitled_hundredths INTEGER NOT NULL DEFAULT 0,
  accrued_hundredths INTEGER NOT NULL DEFAULT 0,
  used_hundredths INTEGER NOT NULL DEFAULT 0,
  pending_hundredths INTEGER NOT NULL DEFAULT 0,
  available_hundredths INTEGER NOT NULL DEFAULT 0,
  carried_forward_hundredths INTEGER NOT NULL DEFAULT 0,
  expired_hundredths INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS peopleos_leave_bal_org_emp_type_yr_uq ON peopleos_leave_balances (organization_id, employee_id, leave_type_code, leave_year);

CREATE TABLE IF NOT EXISTS peopleos_leave_approvals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  leave_request_id UUID NOT NULL,
  stage TEXT NOT NULL,
  actor_user_id TEXT NOT NULL,
  actor_role TEXT NOT NULL,
  decision TEXT NOT NULL,
  comment TEXT,
  decided_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS peopleos_leave_approvals_req_idx ON peopleos_leave_approvals (organization_id, leave_request_id);

CREATE TABLE IF NOT EXISTS peopleos_leave_attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  leave_request_id UUID,
  file_name TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  checksum_sha256 TEXT NOT NULL,
  content_base64 TEXT NOT NULL,
  uploaded_by_user_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS peopleos_leave_attach_req_idx ON peopleos_leave_attachments (organization_id, leave_request_id);

CREATE TABLE IF NOT EXISTS peopleos_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  actor_user_id TEXT,
  actor_role TEXT NOT NULL,
  actor_display_name TEXT NOT NULL,
  action TEXT NOT NULL,
  module TEXT NOT NULL DEFAULT 'core',
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  affected_employee_id TEXT,
  before_json TEXT,
  after_json TEXT,
  reason TEXT,
  ip_address TEXT,
  user_agent TEXT,
  correlation_id TEXT,
  prev_hash TEXT NOT NULL DEFAULT 'GENESIS',
  hash TEXT NOT NULL,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  is_demo BOOLEAN NOT NULL DEFAULT false
);
CREATE INDEX IF NOT EXISTS peopleos_audit_log_org_time_idx ON peopleos_audit_log (organization_id, occurred_at);
CREATE INDEX IF NOT EXISTS peopleos_audit_log_org_entity_idx ON peopleos_audit_log (organization_id, entity_type, entity_id);
CREATE INDEX IF NOT EXISTS peopleos_audit_log_org_emp_idx ON peopleos_audit_log (organization_id, affected_employee_id);

CREATE TABLE IF NOT EXISTS peopleos_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'leave',
  entity_type TEXT,
  entity_id TEXT,
  is_read BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS peopleos_notif_org_user_idx ON peopleos_notifications (organization_id, user_id, is_read);

CREATE TABLE IF NOT EXISTS peopleos_system_settings (
  organization_id TEXT PRIMARY KEY REFERENCES organizations(id) ON DELETE CASCADE,
  organization_name TEXT NOT NULL DEFAULT 'Rekker Limited',
  default_timezone TEXT NOT NULL DEFAULT 'Africa/Nairobi',
  working_days_json TEXT NOT NULL DEFAULT '[1,2,3,4,5]',
  holiday_country TEXT NOT NULL DEFAULT 'KE',
  leave_approval_chain_json TEXT NOT NULL DEFAULT '["line_manager","hr_manager"]',
  allow_self_approval BOOLEAN NOT NULL DEFAULT false,
  require_admin_mfa BOOLEAN NOT NULL DEFAULT false,
  email_notification_mode TEXT NOT NULL DEFAULT 'dev_log',
  audit_retention_days INTEGER NOT NULL DEFAULT 2555,
  updated_by_user_id TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
