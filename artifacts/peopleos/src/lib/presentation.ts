const ROLE_LABELS: Readonly<Record<string, string>> = {
  HR_CASE_OFFICER_FULL: "HR Case Officer",
  hr_case_officer_full: "HR Case Officer",
  employee: "Employee",
  department_manager: "Department Manager",
  hr_admin: "HR Administrator",
  hr_director: "HR Director",
  hr_manager: "HR Manager",
  hr_officer: "HR Officer",
  recruiter: "Recruiter",
  payroll_officer: "Payroll Officer",
  finance_manager: "Finance Manager",
  production_supervisor: "Production Supervisor",
  warehouse_supervisor: "Warehouse Supervisor",
  sales_manager: "Sales Manager",
  read_only_executive: "Executive (Read-only)",
  auditor: "Auditor",
  system_admin: "System Administrator",
};

export function formatRoleLabel(role: string | null | undefined): string {
  if (!role) return "Unassigned";
  const normalized = role.trim();
  return ROLE_LABELS[normalized] ??
    normalized
      .toLowerCase()
      .split(/[_\s]+/)
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(" ");
}

export function formatEnumLabel(value: string | null | undefined): string {
  if (!value) return "Not set";
  return value
    .trim()
    .toLowerCase()
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}
