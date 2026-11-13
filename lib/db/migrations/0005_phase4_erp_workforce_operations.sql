-- Phase 4: ERP Workforce Connections, Operational Scheduling & Competency Management
-- Additive, idempotent migration creating tables for production lines, shift scheduling,
-- competencies/certifications, driver compliance, sales territories, and integration health.

CREATE TABLE IF NOT EXISTS workforce_production_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id TEXT NOT NULL REFERENCES peopleos_organizations(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  department_id UUID NOT NULL REFERENCES peopleos_departments(id) ON DELETE RESTRICT,
  work_zone TEXT NOT NULL,
  operational_status TEXT NOT NULL DEFAULT 'active',
  required_role_types_json TEXT NOT NULL DEFAULT '[]',
  required_skills_json TEXT NOT NULL DEFAULT '[]',
  required_certifications_json TEXT NOT NULL DEFAULT '[]',
  min_staffing INTEGER NOT NULL DEFAULT 2,
  operating_hours TEXT NOT NULL DEFAULT '06:00-22:00',
  supervisor_employee_id UUID REFERENCES peopleos_employees(id) ON DELETE SET NULL,
  cost_centre_code TEXT NOT NULL DEFAULT 'CC-MFG-01',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS workforce_prod_lines_org_code_uq
  ON workforce_production_lines(organization_id, code);

CREATE INDEX IF NOT EXISTS workforce_prod_lines_org_status_idx
  ON workforce_production_lines(organization_id, operational_status);

CREATE TABLE IF NOT EXISTS workforce_shift_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id TEXT NOT NULL REFERENCES peopleos_organizations(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  unit_type TEXT NOT NULL,
  production_line_id UUID REFERENCES workforce_production_lines(id) ON DELETE SET NULL,
  work_zone TEXT NOT NULL,
  start_time TEXT NOT NULL,
  end_time TEXT NOT NULL,
  duration_hours INTEGER NOT NULL DEFAULT 8,
  min_staffing INTEGER NOT NULL DEFAULT 2,
  cost_centre_code TEXT NOT NULL DEFAULT 'CC-MFG-01',
  required_competency TEXT NOT NULL DEFAULT 'General Operator',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS workforce_shift_tpl_org_code_uq
  ON workforce_shift_templates(organization_id, code);

CREATE INDEX IF NOT EXISTS workforce_shift_tpl_org_unit_idx
  ON workforce_shift_templates(organization_id, unit_type);

CREATE TABLE IF NOT EXISTS workforce_shift_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id TEXT NOT NULL REFERENCES peopleos_organizations(id) ON DELETE CASCADE,
  shift_template_id UUID REFERENCES workforce_shift_templates(id) ON DELETE SET NULL,
  employee_id UUID NOT NULL REFERENCES peopleos_employees(id) ON DELETE CASCADE,
  production_line_id UUID REFERENCES workforce_production_lines(id) ON DELETE SET NULL,
  unit_type TEXT NOT NULL,
  work_zone TEXT NOT NULL,
  shift_date DATE NOT NULL,
  shift_name TEXT NOT NULL,
  start_time TEXT NOT NULL,
  end_time TEXT NOT NULL,
  role_skill TEXT NOT NULL,
  cost_centre_code TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'scheduled',
  is_relief BOOLEAN NOT NULL DEFAULT FALSE,
  relief_for_employee_id UUID REFERENCES peopleos_employees(id) ON DELETE SET NULL,
  relief_reason TEXT,
  supervisor_user_id TEXT,
  created_by_user_id TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS workforce_shift_asgn_org_date_idx
  ON workforce_shift_assignments(organization_id, shift_date, status);

CREATE INDEX IF NOT EXISTS workforce_shift_asgn_org_emp_date_idx
  ON workforce_shift_assignments(organization_id, employee_id, shift_date);

CREATE TABLE IF NOT EXISTS employee_certifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id TEXT NOT NULL REFERENCES peopleos_organizations(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES peopleos_employees(id) ON DELETE CASCADE,
  category TEXT NOT NULL,
  competency_type TEXT NOT NULL,
  equipment_type TEXT,
  issuing_org TEXT NOT NULL,
  certificate_number TEXT NOT NULL,
  issue_date DATE NOT NULL,
  expiry_date DATE NOT NULL,
  verification_status TEXT NOT NULL DEFAULT 'pending_verification',
  verified_at TIMESTAMPTZ,
  verified_by_user_id TEXT,
  rejection_reason TEXT,
  revocation_reason TEXT,
  evidence_document_id UUID REFERENCES peopleos_documents(id) ON DELETE SET NULL,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS emp_certs_org_emp_certno_uq
  ON employee_certifications(organization_id, employee_id, competency_type, certificate_number);

CREATE INDEX IF NOT EXISTS emp_certs_org_status_expiry_idx
  ON employee_certifications(organization_id, verification_status, expiry_date);

CREATE INDEX IF NOT EXISTS emp_certs_org_emp_idx
  ON employee_certifications(organization_id, employee_id);

CREATE TABLE IF NOT EXISTS workforce_driver_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id TEXT NOT NULL REFERENCES peopleos_organizations(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES peopleos_employees(id) ON DELETE CASCADE,
  license_number TEXT NOT NULL,
  license_class TEXT NOT NULL,
  license_issue_date DATE,
  license_expiry_date DATE NOT NULL,
  psv_or_safety_cert_expiry DATE,
  medical_clearance_expiry DATE,
  verification_status TEXT NOT NULL DEFAULT 'verified',
  assigned_asset_id UUID REFERENCES peopleos_assets(id) ON DELETE SET NULL,
  assigned_vehicle_snapshot TEXT,
  route_corridor TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS workforce_drivers_org_emp_uq
  ON workforce_driver_profiles(organization_id, employee_id);

CREATE UNIQUE INDEX IF NOT EXISTS workforce_drivers_org_lic_uq
  ON workforce_driver_profiles(organization_id, license_number);

CREATE TABLE IF NOT EXISTS workforce_territories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id TEXT NOT NULL REFERENCES peopleos_organizations(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  region TEXT NOT NULL,
  cost_centre_code TEXT NOT NULL DEFAULT 'CC-SLS-01',
  monthly_target_kes INTEGER NOT NULL DEFAULT 2000000,
  default_commission_rate_pct TEXT NOT NULL DEFAULT '2.5',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS workforce_territories_org_code_uq
  ON workforce_territories(organization_id, code);

CREATE TABLE IF NOT EXISTS workforce_sales_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id TEXT NOT NULL REFERENCES peopleos_organizations(id) ON DELETE CASCADE,
  territory_id UUID NOT NULL REFERENCES workforce_territories(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES peopleos_employees(id) ON DELETE CASCADE,
  effective_from DATE NOT NULL,
  effective_to DATE,
  monthly_target_kes INTEGER NOT NULL,
  actual_attributed_kes INTEGER NOT NULL DEFAULT 0,
  commission_rate_pct TEXT NOT NULL DEFAULT '2.5',
  reporting_period TEXT NOT NULL DEFAULT '2026-03',
  status TEXT NOT NULL DEFAULT 'active',
  attribution_source TEXT NOT NULL DEFAULT 'CRM Pipeline Target (Phase 1 Ecosystem)',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS workforce_sales_asgn_org_emp_period_idx
  ON workforce_sales_assignments(organization_id, employee_id, reporting_period);

CREATE INDEX IF NOT EXISTS workforce_sales_asgn_org_terr_idx
  ON workforce_sales_assignments(organization_id, territory_id);

CREATE TABLE IF NOT EXISTS workforce_shift_swaps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id TEXT NOT NULL REFERENCES peopleos_organizations(id) ON DELETE CASCADE,
  requesting_employee_id UUID NOT NULL REFERENCES peopleos_employees(id) ON DELETE CASCADE,
  requesting_shift_assignment_id UUID NOT NULL REFERENCES workforce_shift_assignments(id) ON DELETE CASCADE,
  target_employee_id UUID NOT NULL REFERENCES peopleos_employees(id) ON DELETE CASCADE,
  target_shift_assignment_id UUID REFERENCES workforce_shift_assignments(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending',
  reason TEXT NOT NULL,
  decision_notes TEXT,
  decided_by_user_id TEXT,
  decided_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS workforce_shift_swaps_org_status_idx
  ON workforce_shift_swaps(organization_id, status);

CREATE TABLE IF NOT EXISTS workforce_relief_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id TEXT NOT NULL REFERENCES peopleos_organizations(id) ON DELETE CASCADE,
  absent_employee_id UUID NOT NULL REFERENCES peopleos_employees(id) ON DELETE CASCADE,
  shift_assignment_id UUID REFERENCES workforce_shift_assignments(id) ON DELETE SET NULL,
  shift_date DATE NOT NULL,
  unit_type TEXT NOT NULL,
  work_zone TEXT NOT NULL,
  shift_name TEXT NOT NULL,
  required_competency TEXT NOT NULL,
  deployed_relief_employee_id UUID REFERENCES peopleos_employees(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  requested_by_user_id TEXT NOT NULL,
  approved_by_user_id TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS workforce_relief_reqs_org_status_idx
  ON workforce_relief_requests(organization_id, status);

CREATE TABLE IF NOT EXISTS workforce_integration_health (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id TEXT NOT NULL REFERENCES peopleos_organizations(id) ON DELETE CASCADE,
  integration_key TEXT NOT NULL,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  status TEXT NOT NULL,
  is_configured BOOLEAN NOT NULL DEFAULT FALSE,
  last_checked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_sync_success_at TIMESTAMPTZ,
  latency_ms INTEGER,
  error_summary TEXT,
  configuration_requirement TEXT,
  responsible_admin_role TEXT NOT NULL DEFAULT 'system_admin',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS workforce_int_health_org_key_uq
  ON workforce_integration_health(organization_id, integration_key);
