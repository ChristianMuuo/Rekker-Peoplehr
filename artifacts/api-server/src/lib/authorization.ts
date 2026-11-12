import type { MembershipRecord } from "@workspace/db";

export const PEOPLEOS_ROLES = {
  employee: "employee",
  departmentManager: "department_manager",
  hrAdmin: "hr_admin",
  hrDirector: "hr_director",
  hrManager: "hr_manager",
  hrOfficer: "hr_officer",
  payrollOfficer: "payroll_officer",
  financeManager: "finance_manager",
  productionSupervisor: "production_supervisor",
  warehouseSupervisor: "warehouse_supervisor",
  salesManager: "sales_manager",
  recruiter: "recruiter",
  executive: "read_only_executive",
  auditor: "auditor",
  systemAdmin: "system_admin",
} as const;

export type PeopleOsRole = (typeof PEOPLEOS_ROLES)[keyof typeof PEOPLEOS_ROLES];

export const ALL_VALID_ROLES = new Set<string>(Object.values(PEOPLEOS_ROLES));

export interface ModulePermissionRule {
  readRoles: readonly PeopleOsRole[];
  writeRoles: readonly PeopleOsRole[];
  confidentialIsolated?: boolean;
  classification: "internal" | "confidential" | "highly_restricted";
}

export const MODULE_PERMISSION_MATRIX: Record<string, ModulePermissionRule> = {
  hrAndPeopleCore: {
    readRoles: Object.values(PEOPLEOS_ROLES) as PeopleOsRole[],
    writeRoles: [
      PEOPLEOS_ROLES.hrAdmin,
      PEOPLEOS_ROLES.hrDirector,
      PEOPLEOS_ROLES.hrManager,
      PEOPLEOS_ROLES.hrOfficer,
      PEOPLEOS_ROLES.systemAdmin,
    ],
    classification: "confidential",
  },
  confidentialHrCases: {
    readRoles: [
      PEOPLEOS_ROLES.hrAdmin,
      PEOPLEOS_ROLES.hrDirector,
      PEOPLEOS_ROLES.hrManager,
      PEOPLEOS_ROLES.employee,
    ],
    writeRoles: [
      PEOPLEOS_ROLES.hrAdmin,
      PEOPLEOS_ROLES.hrDirector,
      PEOPLEOS_ROLES.hrManager,
      PEOPLEOS_ROLES.employee,
    ],
    confidentialIsolated: true,
    classification: "highly_restricted",
  },
  payrollAndJournal: {
    readRoles: [
      PEOPLEOS_ROLES.payrollOfficer,
      PEOPLEOS_ROLES.financeManager,
      PEOPLEOS_ROLES.hrAdmin,
      PEOPLEOS_ROLES.hrDirector,
      PEOPLEOS_ROLES.systemAdmin,
      PEOPLEOS_ROLES.auditor,
    ],
    writeRoles: [
      PEOPLEOS_ROLES.payrollOfficer,
      PEOPLEOS_ROLES.financeManager,
      PEOPLEOS_ROLES.hrAdmin,
      PEOPLEOS_ROLES.systemAdmin,
    ],
    classification: "highly_restricted",
  },
  workforceErpOperations: {
    readRoles: [
      PEOPLEOS_ROLES.productionSupervisor,
      PEOPLEOS_ROLES.warehouseSupervisor,
      PEOPLEOS_ROLES.salesManager,
      PEOPLEOS_ROLES.financeManager,
      PEOPLEOS_ROLES.departmentManager,
      PEOPLEOS_ROLES.hrAdmin,
      PEOPLEOS_ROLES.hrManager,
      PEOPLEOS_ROLES.hrDirector,
      PEOPLEOS_ROLES.executive,
      PEOPLEOS_ROLES.systemAdmin,
    ],
    writeRoles: [
      PEOPLEOS_ROLES.productionSupervisor,
      PEOPLEOS_ROLES.warehouseSupervisor,
      PEOPLEOS_ROLES.salesManager,
      PEOPLEOS_ROLES.hrAdmin,
      PEOPLEOS_ROLES.hrManager,
      PEOPLEOS_ROLES.hrDirector,
      PEOPLEOS_ROLES.systemAdmin,
    ],
    classification: "internal",
  },
  auditTrail: {
    readRoles: [
      PEOPLEOS_ROLES.hrAdmin,
      PEOPLEOS_ROLES.hrDirector,
      PEOPLEOS_ROLES.auditor,
      PEOPLEOS_ROLES.systemAdmin,
    ],
    writeRoles: [],
    classification: "highly_restricted",
  },
  adminDiagnostics: {
    readRoles: [
      PEOPLEOS_ROLES.hrAdmin,
      PEOPLEOS_ROLES.systemAdmin,
      PEOPLEOS_ROLES.auditor,
    ],
    writeRoles: [PEOPLEOS_ROLES.systemAdmin],
    classification: "highly_restricted",
  },
};

export const PRIVILEGED_HR_ROLES: readonly string[] = [
  PEOPLEOS_ROLES.hrAdmin,
  PEOPLEOS_ROLES.hrDirector,
  PEOPLEOS_ROLES.hrManager,
  PEOPLEOS_ROLES.hrOfficer,
  PEOPLEOS_ROLES.systemAdmin,
];

export const BROAD_DIRECTORY_ROLES: readonly string[] = [
  PEOPLEOS_ROLES.hrAdmin,
  PEOPLEOS_ROLES.hrDirector,
  PEOPLEOS_ROLES.hrManager,
  PEOPLEOS_ROLES.hrOfficer,
  PEOPLEOS_ROLES.systemAdmin,
  PEOPLEOS_ROLES.payrollOfficer,
  PEOPLEOS_ROLES.financeManager,
  PEOPLEOS_ROLES.executive,
  PEOPLEOS_ROLES.auditor,
  PEOPLEOS_ROLES.recruiter,
];

export function hasModulePermission(
  role: string,
  moduleKey: keyof typeof MODULE_PERMISSION_MATRIX,
  mode: "read" | "write" = "read",
): boolean {
  const rule = MODULE_PERMISSION_MATRIX[moduleKey];
  if (!rule) return false;
  const allowed: readonly string[] = mode === "read" ? rule.readRoles : rule.writeRoles;
  return allowed.includes(role);
}

/**
 * Enforces object-level authorization when accessing an individual employee profile or 360 view.
 * Prevents horizontal IDOR (employees browsing colleagues) and enforces manager reporting lines.
 */
export function canReadEmployeeProfile(
  membership: MembershipRecord,
  targetEmployee: { id: string; organizationId?: string; managerId?: string | null },
): boolean {
  if (
    targetEmployee.organizationId &&
    targetEmployee.organizationId !== membership.organizationId
  ) {
    return false;
  }

  if (BROAD_DIRECTORY_ROLES.includes(membership.role)) {
    return true;
  }

  const isSelf = Boolean(membership.employeeId && membership.employeeId === targetEmployee.id);
  if (isSelf) {
    return true;
  }

  if (
    membership.role === PEOPLEOS_ROLES.departmentManager ||
    membership.role === PEOPLEOS_ROLES.productionSupervisor ||
    membership.role === PEOPLEOS_ROLES.warehouseSupervisor ||
    membership.role === PEOPLEOS_ROLES.salesManager
  ) {
    return Boolean(
      membership.employeeId &&
        targetEmployee.managerId &&
        targetEmployee.managerId === membership.employeeId,
    );
  }

  return false;
}

/**
 * Determines whether a requester may see unmasked/partially-masked personal statutory identifiers
 * (KRA PIN, National ID, NSSF/SHA numbers, emergency contact) for a target employee.
 */
export function canViewSensitiveStatutoryIdentifiers(
  membership: MembershipRecord,
  targetEmployeeId: string,
): { kraAndSocial: boolean; nationalIdAndEmergency: boolean } {
  const isSelf = Boolean(membership.employeeId && membership.employeeId === targetEmployeeId);
  const isHrAdmin = PRIVILEGED_HR_ROLES.includes(membership.role);
  const isPayroll =
    isHrAdmin ||
    membership.role === PEOPLEOS_ROLES.payrollOfficer ||
    membership.role === PEOPLEOS_ROLES.financeManager ||
    membership.role === PEOPLEOS_ROLES.systemAdmin;

  return {
    kraAndSocial: isSelf || isPayroll,
    nationalIdAndEmergency: isSelf || isHrAdmin,
  };
}
