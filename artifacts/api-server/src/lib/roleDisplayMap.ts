/**
 * Human-readable labels for internal PeopleOS roles and permission scopes.
 * Raw enum identifiers must never be surfaced directly in customer-facing UI text.
 */

export const ROLE_DISPLAY_NAMES: Record<string, string> = {
  employee: "Employee",
  department_manager: "Department Manager",
  hr_admin: "HR Administrator",
  hr_director: "HR Director",
  hr_manager: "HR Manager",
  hr_officer: "HR Officer",
  payroll_officer: "Payroll Officer",
  finance_manager: "Finance Manager",
  production_supervisor: "Production Supervisor",
  warehouse_supervisor: "Warehouse Supervisor",
  sales_manager: "Sales Manager",
  recruiter: "Recruiter",
  read_only_executive: "Executive (Read-Only)",
  auditor: "Compliance Auditor",
  system_admin: "System Administrator",
};

export const ACCESS_SCOPE_DISPLAY_NAMES: Record<string, string> = {
  HR_CASE_OFFICER_FULL: "HR Case Officer (Full Confidential Access)",
  hr_officer_full: "HR Case Officer (Full Confidential Access)",
  EMPLOYEE_SELF_REDACTED: "Employee Self-Service (Confidential Notes Sealed)",
  employee_self: "Employee Self-Service (Confidential Notes Sealed)",
  RESTRICTED: "Restricted Access",
};

export function formatRoleDisplay(role: string | null | undefined): string {
  if (!role) return "Unassigned";
  return (
    ROLE_DISPLAY_NAMES[role] ??
    role
      .replaceAll("_", " ")
      .replace(/\b\w/g, (c) => c.toUpperCase())
  );
}

export function formatAccessScopeDisplay(scope: string | null | undefined): string {
  if (!scope) return "Restricted Access";
  return ACCESS_SCOPE_DISPLAY_NAMES[scope] ?? formatRoleDisplay(scope);
}
