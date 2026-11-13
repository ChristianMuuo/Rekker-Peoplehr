-- Phase 6: Enterprise Security Hardening, Production Reliability & Release Engineering Migration
-- Non-destructive high-performance index additions for tenant isolation and query optimization

-- 1. Optimize Employee Historical Payslip and YTD Payroll Inquiries
CREATE INDEX IF NOT EXISTS peopleos_payroll_items_emp_idx 
    ON peopleos_payroll_items (employee_id);

-- 2. Optimize Confidential HR Case Submitter and Case Number Lookups
CREATE INDEX IF NOT EXISTS hr_cases_org_submitter_idx 
    ON hr_cases (organization_id, submitted_by_user_id);

CREATE INDEX IF NOT EXISTS hr_cases_org_case_no_idx 
    ON hr_cases (organization_id, case_number);

-- 3. Optimize Workforce Shift Queries by Employee
CREATE INDEX IF NOT EXISTS workforce_shifts_org_emp_idx 
    ON workforce_shifts (organization_id, employee_id);

