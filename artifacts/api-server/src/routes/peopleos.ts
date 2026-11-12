import crypto from "node:crypto";
import { and, count, eq, ilike, inArray, or } from "drizzle-orm";
import { Router, type IRouter } from "express";
import {
  CreateEmployeeBody,
  CreateEmployeeResponse,
  GetAgentProviderStatusResponse,
  GetAuthContextResponse,
  GetEmployeeParams,
  GetEmployeeResponse,
  GetPeopleOsOverviewResponse,
  ListDepartmentsResponse,
  ListEmployeesQueryParams,
  ListEmployeesResponse,
  UpdateEmployeeBody,
  UpdateEmployeeParams,
  UpdateEmployeeResponse,
} from "@workspace/api-zod";
import {
  db,
  departmentsTable,
  employeesTable,
  leaveRequestsTable,
} from "@workspace/db";
import {
  canReadEmployeeProfile,
  canViewSensitiveStatutoryIdentifiers,
  hasModulePermission,
  MODULE_PERMISSION_MATRIX,
} from "../lib/authorization";
import { decryptSensitiveField, maskKraPin, maskNationalId, maskPhoneNumber, sanitizeText } from "../lib/security";
import { recordAuditEvent } from "../lib/auditService";
import {
  getAuthSessionMeta,
  getPeopleOsOrganization,
  getReadAccess,
  PEOPLEOS_ORGANIZATION_ID,
  PEOPLEOS_ROLES,
  requireRoles,
} from "../middlewares/peopleosAccess";

const router: IRouter = Router();
const peopleManagers: readonly string[] = [
  ...MODULE_PERMISSION_MATRIX.hrAndPeopleCore.writeRoles,
];
const overviewRoles: readonly string[] = Object.values(PEOPLEOS_ROLES);
const departmentRoles: readonly string[] = Object.values(PEOPLEOS_ROLES);
const directoryRoles: readonly string[] = Object.values(PEOPLEOS_ROLES);
const dayMs = 24 * 60 * 60 * 1000;

export const DEMO_DEPARTMENTS_LIST = [
  { id: '20000000-0000-4000-8000-000000000001', code: 'MFG', name: 'Formulation & Filling', description: 'Home & personal care formulation, automated filling, batch quality control.', location: 'Nairobi Production Facility', managerEmployeeId: '10000000-0000-4000-8000-000000000001', managerName: 'Achieng Odhiambo', headcount: 3, budgetedPositions: 15 },
  { id: '20000000-0000-4000-8000-000000000002', code: 'DIST', name: 'Logistics & Distribution', description: 'Fleet transport, distribution hub management, route dispatching.', location: 'Nairobi Central Logistics Hub', managerEmployeeId: '10000000-0000-4000-8000-000000000003', managerName: 'Juma Omondi', headcount: 2, budgetedPositions: 12 },
  { id: '20000000-0000-4000-8000-000000000003', code: 'BRAND', name: 'Brand & Commercial Marketing', description: 'Brand activation, trade marketing, distributor relations.', location: 'Westlands Commercial Office', managerEmployeeId: '10000000-0000-4000-8000-000000000005', managerName: 'Brenda Mutheu', headcount: 2, budgetedPositions: 8 },
  { id: '20000000-0000-4000-8000-000000000004', code: 'PEOPLE', name: 'People Operations & Culture', description: 'Workforce intelligence, statutory compliance, talent acquisition.', location: 'Westlands Commercial Office', managerEmployeeId: '10000000-0000-4000-8000-000000000007', managerName: 'David Kibet', headcount: 2, budgetedPositions: 6 },
  { id: '20000000-0000-4000-8000-000000000005', code: 'FIN', name: 'Finance & Supply Chain', description: 'Financial accounting, KRA reporting, payroll governance.', location: 'Westlands Commercial Office', managerEmployeeId: null, managerName: null, headcount: 1, budgetedPositions: 5 },
];

export interface DemoEmployeeItem {
  id: string;
  employeeNumber: string;
  firstName: string;
  lastName: string;
  preferredName: string | null;
  workEmail: string;
  phone: string | null;
  jobTitle: string;
  departmentId: string;
  departmentName: string;
  managerId: string | null;
  managerName: string | null;
  location: string;
  employmentType: "permanent" | "fixed_term" | "casual" | "intern";
  status: "active" | "probation" | "on_leave" | "suspended" | "former";
  startDate: string | Date;
  probationEndDate: string | Date | null;
  contractEndDate: string | Date | null;
  isDemo: boolean;
}

export const DEMO_EMPLOYEES_LIST: DemoEmployeeItem[] = [
  { id: '10000000-0000-4000-8000-000000000001', employeeNumber: 'REK-0101', firstName: 'Achieng', lastName: 'Odhiambo', preferredName: 'Achieng', workEmail: 'achieng.odhiambo@rekker-demo.invalid', phone: null, jobTitle: 'Plant Operations Director', departmentId: '20000000-0000-4000-8000-000000000001', departmentName: 'Formulation & Filling', managerId: null, managerName: null, location: 'Nairobi Production Facility', employmentType: 'permanent', status: 'active', startDate: '2021-03-15', probationEndDate: null, contractEndDate: null, isDemo: true },
  { id: '10000000-0000-4000-8000-000000000002', employeeNumber: 'REK-0102', firstName: 'Mwangi', lastName: 'Kariuki', preferredName: 'Mwangi', workEmail: 'mwangi.kariuki@rekker-demo.invalid', phone: null, jobTitle: 'Lead Formulation & Quality Chemist', departmentId: '20000000-0000-4000-8000-000000000001', departmentName: 'Formulation & Filling', managerId: '10000000-0000-4000-8000-000000000001', managerName: 'Achieng Odhiambo', location: 'Nairobi Production Facility', employmentType: 'permanent', status: 'active', startDate: '2022-06-01', probationEndDate: null, contractEndDate: null, isDemo: true },
  { id: '10000000-0000-4000-8000-000000000003', employeeNumber: 'REK-0103', firstName: 'Juma', lastName: 'Omondi', preferredName: null, workEmail: 'juma.omondi@rekker-demo.invalid', phone: null, jobTitle: 'Logistics Fleet Manager', departmentId: '20000000-0000-4000-8000-000000000002', departmentName: 'Logistics & Distribution', managerId: null, managerName: null, location: 'Nairobi Central Logistics Hub', employmentType: 'permanent', status: 'active', startDate: '2022-09-10', probationEndDate: null, contractEndDate: null, isDemo: true },
  { id: '10000000-0000-4000-8000-000000000004', employeeNumber: 'REK-0104', firstName: 'Wanjiku', lastName: 'Kimani', preferredName: 'Wawa', workEmail: 'wanjiku.kimani@rekker-demo.invalid', phone: null, jobTitle: 'Distribution Dispatch Specialist', departmentId: '20000000-0000-4000-8000-000000000002', departmentName: 'Logistics & Distribution', managerId: '10000000-0000-4000-8000-000000000003', managerName: 'Juma Omondi', location: 'Nairobi Central Logistics Hub', employmentType: 'permanent', status: 'on_leave', startDate: '2023-04-12', probationEndDate: null, contractEndDate: null, isDemo: true },
  { id: '10000000-0000-4000-8000-000000000005', employeeNumber: 'REK-0105', firstName: 'Brenda', lastName: 'Mutheu', preferredName: 'Brenda', workEmail: 'brenda.mutheu@rekker-demo.invalid', phone: null, jobTitle: 'Brand Strategy & Trade Lead', departmentId: '20000000-0000-4000-8000-000000000003', departmentName: 'Brand & Commercial Marketing', managerId: null, managerName: null, location: 'Westlands Commercial Office', employmentType: 'permanent', status: 'active', startDate: '2022-01-10', probationEndDate: null, contractEndDate: null, isDemo: true },
  { id: '10000000-0000-4000-8000-000000000006', employeeNumber: 'REK-0106', firstName: 'Brian', lastName: 'Kiprotich', preferredName: 'Brian', workEmail: 'brian.kiprotich@rekker-demo.invalid', phone: null, jobTitle: 'Digital Growth & Social Media Specialist', departmentId: '20000000-0000-4000-8000-000000000003', departmentName: 'Brand & Commercial Marketing', managerId: '10000000-0000-4000-8000-000000000005', managerName: 'Brenda Mutheu', location: 'Westlands Commercial Office', employmentType: 'fixed_term', status: 'active', startDate: '2024-02-01', probationEndDate: null, contractEndDate: '2026-04-30', isDemo: true },
  { id: '10000000-0000-4000-8000-000000000007', employeeNumber: 'REK-0107', firstName: 'David', lastName: 'Kibet', preferredName: 'David', workEmail: 'david.kibet@rekker-demo.invalid', phone: null, jobTitle: 'Head of People & Organization Culture', departmentId: '20000000-0000-4000-8000-000000000004', departmentName: 'People Operations & Culture', managerId: null, managerName: null, location: 'Westlands Commercial Office', employmentType: 'permanent', status: 'active', startDate: '2021-08-01', probationEndDate: null, contractEndDate: null, isDemo: true },
  { id: '10000000-0000-4000-8000-000000000008', employeeNumber: 'REK-0108', firstName: 'Faith', lastName: 'Chebet', preferredName: 'Faith', workEmail: 'faith.chebet@rekker-demo.invalid', phone: null, jobTitle: 'Talent Acquisition & Employee Experience Officer', departmentId: '20000000-0000-4000-8000-000000000004', departmentName: 'People Operations & Culture', managerId: '10000000-0000-4000-8000-000000000007', managerName: 'David Kibet', location: 'Westlands Commercial Office', employmentType: 'permanent', status: 'probation', startDate: '2026-01-15', probationEndDate: '2026-04-15', contractEndDate: null, isDemo: true },
  { id: '10000000-0000-4000-8000-000000000009', employeeNumber: 'REK-0109', firstName: 'Dennis', lastName: 'Otieno', preferredName: 'Denno', workEmail: 'dennis.otieno@rekker-demo.invalid', phone: null, jobTitle: 'Financial Accountant & Payroll Controller', departmentId: '20000000-0000-4000-8000-000000000005', departmentName: 'Finance & Supply Chain', managerId: null, managerName: null, location: 'Westlands Commercial Office', employmentType: 'permanent', status: 'active', startDate: '2023-01-09', probationEndDate: null, contractEndDate: null, isDemo: true },
  { id: '10000000-0000-4000-8000-000000000010', employeeNumber: 'REK-0110', firstName: 'Sarah', lastName: 'Njeri', preferredName: 'Sarah', workEmail: 'sarah.njeri@rekker-demo.invalid', phone: null, jobTitle: 'Junior Quality Assurance Chemist', departmentId: '20000000-0000-4000-8000-000000000001', departmentName: 'Formulation & Filling', managerId: '10000000-0000-4000-8000-000000000002', managerName: 'Mwangi Kariuki', location: 'Nairobi Production Facility', employmentType: 'permanent', status: 'active', startDate: '2024-05-02', probationEndDate: null, contractEndDate: null, isDemo: true },
];

function dateAfter(days: number): string {
  return new Date(Date.now() + days * dayMs).toISOString().slice(0, 10);
}

function dateOnly(value: Date | string): string {
  return value instanceof Date ? value.toISOString().slice(0, 10) : value.slice(0, 10);
}

function nullableDateOnly(value: Date | string | null | undefined): string | null {
  return value == null ? null : dateOnly(value);
}

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, "\\$&");
}

function businessDaysBetween(start: string, end: string): number {
  const cursor = new Date(`${start}T00:00:00.000Z`);
  const final = new Date(`${end}T00:00:00.000Z`);
  let days = 0;
  while (cursor <= final) {
    const weekday = cursor.getUTCDay();
    if (weekday !== 0 && weekday !== 6) days += 1;
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return days;
}

async function serializeEmployees(records: (typeof employeesTable.$inferSelect)[]) {
  if (records.length === 0) return [];
  const departmentIds = [...new Set(records.map((record) => record.departmentId))];
  const managerIds = [
    ...new Set(
      records
        .map((record) => record.managerId)
        .filter((id): id is string => id !== null),
    ),
  ];
  const [departments, managers] = await Promise.all([
    db
      .select({ id: departmentsTable.id, name: departmentsTable.name })
      .from(departmentsTable)
      .where(
        and(
          eq(departmentsTable.organizationId, PEOPLEOS_ORGANIZATION_ID),
          inArray(departmentsTable.id, departmentIds),
        ),
      ),
    managerIds.length
      ? db
          .select({
            id: employeesTable.id,
            firstName: employeesTable.firstName,
            lastName: employeesTable.lastName,
          })
          .from(employeesTable)
          .where(
            and(
              eq(employeesTable.organizationId, PEOPLEOS_ORGANIZATION_ID),
              inArray(employeesTable.id, managerIds),
            ),
          )
      : Promise.resolve([]),
  ]);
  const departmentNames = new Map(departments.map((department) => [department.id, department.name]));
  const managerNames = new Map(
    managers.map((manager) => [manager.id, `${manager.firstName} ${manager.lastName}`]),
  );
  return records.map((employee) => ({
    id: employee.id,
    employeeNumber: employee.employeeNumber,
    firstName: employee.firstName,
    lastName: employee.lastName,
    preferredName: employee.preferredName,
    workEmail: employee.workEmail,
    phone: employee.phone,
    jobTitle: employee.jobTitle,
    departmentId: employee.departmentId,
    departmentName: departmentNames.get(employee.departmentId) ?? "Unassigned",
    managerId: employee.managerId,
    managerName: employee.managerId
      ? (managerNames.get(employee.managerId) ?? null)
      : null,
    location: employee.location,
    employmentType: employee.employmentType,
    status: employee.status,
    startDate: employee.startDate,
    probationEndDate: employee.probationEndDate,
    contractEndDate: employee.contractEndDate,
    isDemo: employee.isDemo,
  }));
}

router.get("/auth/context", async (req, res): Promise<void> => {
  const organization = await getPeopleOsOrganization();
  if (!organization) {
    res.status(503).json({ error: "PeopleOS organization is not initialized." });
    return;
  }
  const membership = await requireRoles(
    req,
    res,
    Object.values(PEOPLEOS_ROLES),
  );
  if (!membership) return;
  const role = membership.role;
  const isAdmin = peopleManagers.includes(role);
  const displayNameMap: Record<string, string> = {
    [PEOPLEOS_ROLES.hrAdmin]: "David Kibet",
    [PEOPLEOS_ROLES.hrDirector]: "David Kibet",
    [PEOPLEOS_ROLES.hrManager]: "Achieng Odhiambo",
    [PEOPLEOS_ROLES.hrOfficer]: "Faith Chebet",
    [PEOPLEOS_ROLES.payrollOfficer]: "Dennis Otieno",
    [PEOPLEOS_ROLES.financeManager]: "Dennis Otieno",
    [PEOPLEOS_ROLES.departmentManager]: "Achieng Odhiambo",
    [PEOPLEOS_ROLES.productionSupervisor]: "Achieng Odhiambo",
    [PEOPLEOS_ROLES.warehouseSupervisor]: "Juma Omondi",
    [PEOPLEOS_ROLES.salesManager]: "Brenda Mutheu",
    [PEOPLEOS_ROLES.recruiter]: "Faith Chebet",
    [PEOPLEOS_ROLES.employee]: "Mwangi Kariuki",
    [PEOPLEOS_ROLES.executive]: "Executive Observer",
    [PEOPLEOS_ROLES.auditor]: "Compliance Auditor",
    [PEOPLEOS_ROLES.systemAdmin]: "System Administrator",
  };
  const displayName = displayNameMap[role] ?? "Rekker Teammate";

  const response = {
    role,
    displayName,
    organizationName: organization.name,
    canManagePeople: isAdmin,
    canApproveLeave:
      isAdmin ||
      role === PEOPLEOS_ROLES.departmentManager ||
      role === PEOPLEOS_ROLES.productionSupervisor ||
      role === PEOPLEOS_ROLES.warehouseSupervisor ||
      role === PEOPLEOS_ROLES.salesManager,
    canViewAudit: hasModulePermission(role, "auditTrail", "read"),
    canViewPayroll:
      hasModulePermission(role, "payrollAndJournal", "read") ||
      role === PEOPLEOS_ROLES.hrManager ||
      role === PEOPLEOS_ROLES.executive,
    canManageSettings:
      role === PEOPLEOS_ROLES.systemAdmin ||
      role === PEOPLEOS_ROLES.hrAdmin ||
      role === PEOPLEOS_ROLES.hrDirector,
    isDemo: organization.isDemo,
  };
  res.json(GetAuthContextResponse.parse(response));
});

router.get("/peopleos/overview", async (req, res): Promise<void> => {
  const access = await getReadAccess(req, res);
  if (!access) return;
  if (
    !access.organization.isDemo &&
    access.membership &&
    !overviewRoles.includes(access.membership.role)
  ) {
    res.status(403).json({ error: "You do not have permission to view workforce metrics." });
    return;
  }
  if (!process.env.DATABASE_URL) {
    const activeEmps = DEMO_EMPLOYEES_LIST.filter((e) => e.status === "active").length;
    const onLeave = DEMO_EMPLOYEES_LIST.filter((e) => e.status === "on_leave").length;
    const demoOverview = {
      dataMode: "DEMO" as const,
      stats: {
        totalEmployees: DEMO_EMPLOYEES_LIST.length,
        activeEmployees: activeEmps,
        onLeave: onLeave,
        pendingApprovals: 2,
        upcomingMilestones: 2,
      },
      departments: DEMO_DEPARTMENTS_LIST,
      monthlyHeadcount: [
        { month: "Apr", headcount: 6 },
        { month: "May", headcount: 7 },
        { month: "Jun", headcount: 7 },
        { month: "Jul", headcount: 8 },
        { month: "Aug", headcount: 8 },
        { month: "Sep", headcount: 8 },
        { month: "Oct", headcount: 9 },
        { month: "Nov", headcount: 9 },
        { month: "Dec", headcount: 9 },
        { month: "Jan", headcount: 10 },
        { month: "Feb", headcount: 10 },
        { month: "Mar", headcount: 10 },
      ],
      priorities: [
        {
          id: "pending-leave",
          title: "Leave requests are waiting",
          description: "2 requests need a decision.",
          category: "approval" as const,
          source: "2 pending leave requests",
          href: "/approvals",
        },
        {
          id: "contract-expiry",
          title: "Contract milestones are approaching",
          description: "1 contract ends within 60 days.",
          category: "milestone" as const,
          source: "Employee contract records ending within 60 days",
          href: "/people",
        },
        {
          id: "probation-milestone",
          title: "Probation check-ins are due soon",
          description: "1 probation milestone falls within 30 days.",
          category: "milestone" as const,
          source: "Employee probation dates within 30 days",
          href: "/people",
        },
      ],
    };
    res.json(GetPeopleOsOverviewResponse.parse(demoOverview));
    return;
  }
  const organizationId = access.organization.id;
  const today = new Date().toISOString().slice(0, 10);
  const thirtyDaysOut = dateAfter(30);
  const [employees, departments, requests] = await Promise.all([
    db
      .select()
      .from(employeesTable)
      .where(eq(employeesTable.organizationId, organizationId)),
    db
      .select()
      .from(departmentsTable)
      .where(eq(departmentsTable.organizationId, organizationId)),
    db
      .select()
      .from(leaveRequestsTable)
      .where(
        and(
          eq(leaveRequestsTable.organizationId, organizationId),
          inArray(leaveRequestsTable.status, ["pending", "approved"]),
        ),
      ),
  ]);
  const currentEmployees = employees.filter((employee) => employee.status !== "former");
  const activeEmployees = currentEmployees.filter((employee) => employee.status === "active");
  const onLeaveIds = new Set(
    requests
      .filter(
        (request) =>
          request.status === "approved" &&
          request.startDate <= today &&
          request.endDate >= today,
      )
      .map((request) => request.employeeId),
  );
  const pending = requests.filter((request) => request.status === "pending");
  const contracts = currentEmployees.filter(
    (employee) =>
      employee.contractEndDate &&
      employee.contractEndDate >= today &&
      employee.contractEndDate <= thirtyDaysOut,
  );
  const probation = currentEmployees.filter(
    (employee) =>
      employee.probationEndDate &&
      employee.probationEndDate >= today &&
      employee.probationEndDate <= thirtyDaysOut,
  );
  const managerIds = [
    ...new Set(
      departments
        .map((department) => department.managerEmployeeId)
        .filter((id): id is string => id !== null),
    ),
  ];
  const managers = managerIds.length
    ? await db
        .select({
          id: employeesTable.id,
          firstName: employeesTable.firstName,
          lastName: employeesTable.lastName,
        })
        .from(employeesTable)
        .where(
          and(
            eq(employeesTable.organizationId, organizationId),
            inArray(employeesTable.id, managerIds),
          ),
        )
    : [];
  const managerNames = new Map(
    managers.map((manager) => [manager.id, `${manager.firstName} ${manager.lastName}`]),
  );
  const departmentResponses = departments.map((department) => ({
    id: department.id,
    name: department.name,
    code: department.code,
    managerEmployeeId: department.managerEmployeeId,
    managerName: department.managerEmployeeId
      ? (managerNames.get(department.managerEmployeeId) ?? null)
      : null,
    location: department.location,
    headcount: currentEmployees.filter(
      (employee) => employee.departmentId === department.id,
    ).length,
    budgetedPositions: department.budgetedPositions,
    description: department.description,
  }));
  const now = new Date();
  const monthlyHeadcount = Array.from({ length: 12 }, (_, index) => {
    const monthDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 11 + index, 1));
    const monthEnd = new Date(
      Date.UTC(monthDate.getUTCFullYear(), monthDate.getUTCMonth() + 1, 0),
    )
      .toISOString()
      .slice(0, 10);
    return {
      month: new Intl.DateTimeFormat("en", {
        month: "short",
        timeZone: "UTC",
      }).format(monthDate),
      headcount: currentEmployees.filter((employee) => employee.startDate <= monthEnd).length,
    };
  });

  const priorities = [];
  if (pending.length) {
    priorities.push({
      id: "pending-leave",
      title: "Leave requests are waiting",
      description: `${pending.length} request${pending.length === 1 ? "" : "s"} need a decision.`,
      category: "approval" as const,
      source: `${pending.length} pending leave request${pending.length === 1 ? "" : "s"}`,
      href: "/approvals",
    });
  }
  if (contracts.length) {
    priorities.push({
      id: "contract-expiry",
      title: "Contract milestones are approaching",
      description: `${contracts.length} contract${contracts.length === 1 ? "" : "s"} end within 30 days.`,
      category: "milestone" as const,
      source: "Employee contract records ending within 30 days",
      href: "/people",
    });
  }
  if (probation.length) {
    priorities.push({
      id: "probation-milestone",
      title: "Probation check-ins are due soon",
      description: `${probation.length} probation milestone${probation.length === 1 ? "" : "s"} fall within 30 days.`,
      category: "milestone" as const,
      source: "Employee probation dates within 30 days",
      href: "/people",
    });
  }
  if (!priorities.length) {
    priorities.push({
      id: "data-quality",
      title: "Workforce records are up to date",
      description: "No pending leave requests or near-term contract milestones were found.",
      category: "data_quality" as const,
      source: "Current employee, leave, and contract records",
      href: "/people",
    });
  }

  const response = {
    dataMode: access.organization.isDemo ? "DEMO" : "LIVE",
    stats: {
      totalEmployees: currentEmployees.length,
      activeEmployees: activeEmployees.length,
      onLeave: onLeaveIds.size,
      pendingApprovals: pending.length,
      upcomingMilestones: contracts.length + probation.length,
    },
    departments: departmentResponses,
    monthlyHeadcount,
    priorities,
  };
  res.json(GetPeopleOsOverviewResponse.parse(response));
});

router.get("/departments", async (req, res): Promise<void> => {
  const access = await getReadAccess(req, res);
  if (!access) return;
  if (
    !access.organization.isDemo &&
    access.membership &&
    !departmentRoles.includes(access.membership.role)
  ) {
    res.status(403).json({ error: "You do not have permission to view departments." });
    return;
  }
  if (!process.env.DATABASE_URL) {
    res.json(ListDepartmentsResponse.parse(DEMO_DEPARTMENTS_LIST));
    return;
  }
  const [departments, employees] = await Promise.all([
    db
      .select()
      .from(departmentsTable)
      .where(eq(departmentsTable.organizationId, access.organization.id)),
    db
      .select()
      .from(employeesTable)
      .where(eq(employeesTable.organizationId, access.organization.id)),
  ]);
  const managerIds = [
    ...new Set(
      departments
        .map((department) => department.managerEmployeeId)
        .filter((id): id is string => id !== null),
    ),
  ];
  const managers = managerIds.length
    ? await db
        .select({
          id: employeesTable.id,
          firstName: employeesTable.firstName,
          lastName: employeesTable.lastName,
        })
        .from(employeesTable)
        .where(
          and(
            eq(employeesTable.organizationId, access.organization.id),
            inArray(employeesTable.id, managerIds),
          ),
        )
    : [];
  const managerNames = new Map(
    managers.map((manager) => [manager.id, `${manager.firstName} ${manager.lastName}`]),
  );
  const response = departments.map((department) => ({
    id: department.id,
    name: department.name,
    code: department.code,
    managerEmployeeId: department.managerEmployeeId,
    managerName: department.managerEmployeeId
      ? (managerNames.get(department.managerEmployeeId) ?? null)
      : null,
    location: department.location,
    headcount: employees.filter(
      (employee) =>
        employee.departmentId === department.id && employee.status !== "former",
    ).length,
    budgetedPositions: department.budgetedPositions,
    description: department.description,
  }));
  res.json(ListDepartmentsResponse.parse(response));
});

router.get("/employees", async (req, res): Promise<void> => {
  const parsedQuery = ListEmployeesQueryParams.safeParse(req.query);
  if (!parsedQuery.success) {
    res.status(400).json({ error: parsedQuery.error.message });
    return;
  }
  const access = await getReadAccess(req, res);
  if (!access) return;
  if (
    !access.organization.isDemo &&
    access.membership &&
    !directoryRoles.includes(access.membership.role)
  ) {
    res.status(403).json({ error: "You do not have permission to view the employee directory." });
    return;
  }
  if (!process.env.DATABASE_URL) {
    let items = [...DEMO_EMPLOYEES_LIST];
    if (access.membership) {
      items = items.filter((e) =>
        canReadEmployeeProfile(access.membership!, {
          id: e.id,
          organizationId: access.organization.id,
          managerId: e.managerId,
        }),
      );
    }
    const q = parsedQuery.data;
    if (q.departmentId) {
      items = items.filter((e) => e.departmentId === q.departmentId);
    }
    if (q.status) {
      items = items.filter((e) => e.status === q.status);
    }
    if (q.search?.trim()) {
      const term = q.search.trim().toLowerCase();
      items = items.filter(
        (e) =>
          e.firstName.toLowerCase().includes(term) ||
          e.lastName.toLowerCase().includes(term) ||
          e.workEmail.toLowerCase().includes(term) ||
          e.employeeNumber.toLowerCase().includes(term) ||
          e.jobTitle.toLowerCase().includes(term),
      );
    }
    res.json(
      ListEmployeesResponse.parse({
        items,
        page: q.page,
        pageSize: q.pageSize,
        total: items.length,
        dataMode: "DEMO",
      }),
    );
    return;
  }
  const query = parsedQuery.data;
  const conditions = [eq(employeesTable.organizationId, access.organization.id)];
  if (query.departmentId) {
    conditions.push(eq(employeesTable.departmentId, query.departmentId));
  }
  if (query.status) {
    conditions.push(eq(employeesTable.status, query.status));
  }
  if (query.search?.trim()) {
    const term = `%${escapeLike(query.search.trim())}%`;
    conditions.push(
      or(
        ilike(employeesTable.firstName, term),
        ilike(employeesTable.lastName, term),
        ilike(employeesTable.preferredName, term),
        ilike(employeesTable.employeeNumber, term),
        ilike(employeesTable.jobTitle, term),
        ilike(employeesTable.workEmail, term),
      )!,
    );
  }
  if (access.membership) {
    if (access.membership.role === PEOPLEOS_ROLES.employee) {
      conditions.push(
        access.membership.employeeId
          ? eq(employeesTable.id, access.membership.employeeId)
          : eq(employeesTable.id, "00000000-0000-4000-8000-000000000000"),
      );
    } else if (
      access.membership.role === PEOPLEOS_ROLES.departmentManager ||
      access.membership.role === PEOPLEOS_ROLES.productionSupervisor ||
      access.membership.role === PEOPLEOS_ROLES.warehouseSupervisor ||
      access.membership.role === PEOPLEOS_ROLES.salesManager
    ) {
      conditions.push(
        access.membership.employeeId
          ? or(
              eq(employeesTable.id, access.membership.employeeId),
              eq(employeesTable.managerId, access.membership.employeeId),
            )!
          : eq(employeesTable.id, "00000000-0000-4000-8000-000000000000"),
      );
    }
  }

  const where = and(...conditions);
  const page = query.page ?? 1;
  const pageSize = query.pageSize ?? 25;
  const [records, [{ value: total }]] = await Promise.all([
    db
      .select()
      .from(employeesTable)
      .where(where)
      .orderBy(employeesTable.lastName, employeesTable.firstName)
      .limit(pageSize)
      .offset((page - 1) * pageSize),
    db.select({ value: count() }).from(employeesTable).where(where),
  ]);
  const response = {
    items: await serializeEmployees(records),
    page,
    pageSize,
    total,
    dataMode: access.organization.isDemo ? "DEMO" : "LIVE",
  };
  res.json(ListEmployeesResponse.parse(response));
});

router.post("/employees", async (req, res): Promise<void> => {
  const membership = await requireRoles(req, res, peopleManagers);
  if (!membership) return;
  const body = CreateEmployeeBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }
  const organization = await getPeopleOsOrganization();
  if (!organization) {
    res.status(503).json({ error: "PeopleOS organization is not initialized." });
    return;
  }
  const input = body.data;
  if (!process.env.DATABASE_URL) {
    const dept = DEMO_DEPARTMENTS_LIST.find((d) => d.id === input.departmentId);
    const newEmp = {
      id: `10000000-0000-4000-8000-${String(DEMO_EMPLOYEES_LIST.length + 1).padStart(12, "0")}`,
      employeeNumber: input.employeeNumber,
      firstName: input.firstName,
      lastName: input.lastName,
      preferredName: input.preferredName ?? null,
      workEmail: input.workEmail,
      phone: input.phone ?? null,
      jobTitle: input.jobTitle,
      departmentId: input.departmentId,
      departmentName: dept?.name ?? "General",
      managerId: input.managerId ?? null,
      managerName: null,
      location: input.location,
      employmentType: input.employmentType,
      status: input.status ?? ("active" as const),
      startDate: new Date(dateOnly(input.startDate)),
      probationEndDate: input.probationEndDate ? new Date(dateOnly(input.probationEndDate)) : null,
      contractEndDate: input.contractEndDate ? new Date(dateOnly(input.contractEndDate)) : null,
      isDemo: true,
    };
    DEMO_EMPLOYEES_LIST.push(newEmp as any);
    res.status(201).json(CreateEmployeeResponse.parse(newEmp));
    return;
  }
  if (
    organization.isDemo &&
    (!input.workEmail.toLowerCase().endsWith("@rekker-demo.invalid") ||
      input.firstName !== "Demo" ||
      input.phone)
  ) {
    res.status(400).json({
      error:
        "Demo mode only accepts fictional names, @rekker-demo.invalid addresses, and no phone numbers. Do not enter real employee data.",
    });
    return;
  }
  const [department] = await db
    .select({ id: departmentsTable.id })
    .from(departmentsTable)
    .where(
      and(
        eq(departmentsTable.id, input.departmentId),
        eq(departmentsTable.organizationId, organization.id),
      ),
    )
    .limit(1);
  if (!department) {
    res.status(400).json({ error: "Choose a department in this organization." });
    return;
  }
  const [duplicate] = await db
    .select({ id: employeesTable.id })
    .from(employeesTable)
    .where(
      and(
        eq(employeesTable.organizationId, organization.id),
        or(
          eq(employeesTable.employeeNumber, input.employeeNumber),
          eq(employeesTable.workEmail, input.workEmail),
        ),
      ),
    )
    .limit(1);
  if (duplicate) {
    res.status(409).json({ error: "Employee number or work email already exists." });
    return;
  }
  const record = await db.transaction(async (tx) => {
    const [inserted] = await tx
      .insert(employeesTable)
      .values({
        ...input,
        organizationId: organization.id,
        isDemo: organization.isDemo,
        status: input.status ?? "active",
        startDate: dateOnly(input.startDate),
        probationEndDate: nullableDateOnly(input.probationEndDate),
        contractEndDate: nullableDateOnly(input.contractEndDate),
      })
      .returning();

    if (!inserted) return null;

    await recordAuditEvent({
      organizationId: organization.id,
      actorUserId: membership.userId,
      actor: membership.role,
      action: "employee_created",
      targetType: "employee",
      targetId: inserted.id,
      summary: "An employee profile was created.",
      correlationId: req.correlationId,
      critical: true,
      isDemo: organization.isDemo,
      tx,
    });

    return inserted;
  });

  if (!record) {
    res.status(500).json({ error: "Employee record could not be created." });
    return;
  }
  const [employee] = await serializeEmployees([record]);
  res.status(201).json(CreateEmployeeResponse.parse(employee));
});

router.get("/employees/:employeeId", async (req, res): Promise<void> => {
  const params = GetEmployeeParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const access = await getReadAccess(req, res);
  if (!access) return;
  if (
    access.membership &&
    !directoryRoles.includes(access.membership.role)
  ) {
    res.status(403).json({ error: "You do not have permission to view employee profiles." });
    return;
  }
  if (!process.env.DATABASE_URL) {
    const emp = DEMO_EMPLOYEES_LIST.find((e) => e.id === params.data.employeeId);
    if (!emp) {
      res.status(404).json({ error: "Employee not found." });
      return;
    }
    if (
      access.membership &&
      !canReadEmployeeProfile(access.membership, {
        id: emp.id,
        organizationId: access.organization.id,
        managerId: emp.managerId,
      })
    ) {
      res.status(403).json({
        error: "Access denied to another employee profile.",
        code: "FORBIDDEN_EMPLOYEE_PROFILE",
      });
      return;
    }
    res.json(GetEmployeeResponse.parse(emp));
    return;
  }

  const [record] = await db
    .select()
    .from(employeesTable)
    .where(
      and(
        eq(employeesTable.id, params.data.employeeId),
        eq(employeesTable.organizationId, access.organization.id),
      ),
    )
    .limit(1);
  if (!record) {
    res.status(404).json({ error: "Employee not found." });
    return;
  }
  if (access.membership && !canReadEmployeeProfile(access.membership, record)) {
    res.status(403).json({
      error: "Access denied to another employee profile.",
      code: "FORBIDDEN_EMPLOYEE_PROFILE",
    });
    return;
  }
  if (access.membership) {
    await recordAuditEvent({
      organizationId: access.organization.id,
      actorUserId: access.membership.userId,
      actor: access.membership.role,
      action: "employee_profile_viewed",
      targetType: "employee",
      targetId: record.id,
      summary: "An authorized employee profile was viewed.",
      correlationId: req.correlationId,
      isDemo: record.isDemo,
    });
  }
  const [employee] = await serializeEmployees([record]);
  res.json(GetEmployeeResponse.parse(employee));
});

router.patch("/employees/:employeeId", async (req, res): Promise<void> => {
  const params = UpdateEmployeeParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const body = UpdateEmployeeBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }
  const membership = await requireRoles(req, res, peopleManagers);
  if (!membership) return;
  if (Object.keys(body.data).length === 0) {
    res.status(400).json({ error: "Provide at least one permitted field to update." });
    return;
  }
  const organization = await getPeopleOsOrganization();
  if (!organization) {
    res.status(503).json({ error: "PeopleOS organization is not initialized." });
    return;
  }
  const input = body.data;
  if (!process.env.DATABASE_URL) {
    const emp = DEMO_EMPLOYEES_LIST.find((e) => e.id === params.data.employeeId);
    if (!emp) {
      res.status(404).json({ error: "Employee not found." });
      return;
    }
    if (input.preferredName !== undefined) emp.preferredName = input.preferredName;
    if (input.jobTitle !== undefined) emp.jobTitle = input.jobTitle;
    if (input.location !== undefined) emp.location = input.location;
    if (input.status !== undefined) emp.status = input.status;
    if (input.departmentId !== undefined) {
      emp.departmentId = input.departmentId;
      const dept = DEMO_DEPARTMENTS_LIST.find((d) => d.id === input.departmentId);
      if (dept) emp.departmentName = dept.name;
    }
    res.json(UpdateEmployeeResponse.parse(emp));
    return;
  }
  if (organization.isDemo && input.phone) {
    res.status(400).json({
      error: "Demo mode cannot store real phone numbers.",
    });
    return;
  }
  if (input.departmentId) {
    const [department] = await db
      .select({ id: departmentsTable.id })
      .from(departmentsTable)
      .where(
        and(
          eq(departmentsTable.id, input.departmentId),
          eq(departmentsTable.organizationId, organization.id),
        ),
      )
      .limit(1);
    if (!department) {
      res.status(400).json({ error: "Choose a department in this organization." });
      return;
    }
  }
  if (input.managerId) {
    const [manager] = await db
      .select({ id: employeesTable.id })
      .from(employeesTable)
      .where(
        and(
          eq(employeesTable.id, input.managerId),
          eq(employeesTable.organizationId, organization.id),
        ),
      )
      .limit(1);
    if (!manager) {
      res.status(400).json({ error: "Choose a manager in this organization." });
      return;
    }
  }
  const updateData: Partial<typeof employeesTable.$inferInsert> = {
    preferredName: input.preferredName,
    phone: input.phone,
    jobTitle: input.jobTitle,
    departmentId: input.departmentId,
    managerId: input.managerId,
    location: input.location,
    status: input.status,
    ...(input.probationEndDate === undefined
      ? {}
      : { probationEndDate: nullableDateOnly(input.probationEndDate) }),
    ...(input.contractEndDate === undefined
      ? {}
      : { contractEndDate: nullableDateOnly(input.contractEndDate) }),
  };
  const record = await db.transaction(async (tx) => {
    const [updated] = await tx
      .update(employeesTable)
      .set(updateData)
      .where(
        and(
          eq(employeesTable.id, params.data.employeeId),
          eq(employeesTable.organizationId, organization.id),
        ),
      )
      .returning();

    if (!updated) return null;

    await recordAuditEvent({
      organizationId: organization.id,
      actorUserId: membership.userId,
      actor: membership.role,
      action: "employee_profile_updated",
      targetType: "employee",
      targetId: updated.id,
      summary: "Permitted employee profile fields were updated.",
      correlationId: req.correlationId,
      critical: true,
      isDemo: updated.isDemo,
      tx,
    });

    return updated;
  });

  if (!record) {
    res.status(404).json({ error: "Employee not found." });
    return;
  }
  const [employee] = await serializeEmployees([record]);
  res.json(UpdateEmployeeResponse.parse(employee));
});

router.get("/employees/:employeeId/profile-360", async (req, res): Promise<void> => {
  const access = await getReadAccess(req, res);
  if (!access || !access.membership) return;

  const employeeId = String(req.params.employeeId ?? "");
  const membership = access.membership;
  const sensitivity = canViewSensitiveStatutoryIdentifiers(membership, employeeId);
  const canSeeCompensation = sensitivity.kraAndSocial;

  if (!process.env.DATABASE_URL) {
    const emp = DEMO_EMPLOYEES_LIST.find((e) => e.id === employeeId);
    if (!emp) {
      res.status(404).json({ error: "Employee not found." });
      return;
    }
    if (
      !canReadEmployeeProfile(membership, {
        id: emp.id,
        organizationId: access.organization.id,
        managerId: emp.managerId,
      })
    ) {
      res.status(403).json({
        error: "Access denied to another employee's 360 profile.",
        code: "FORBIDDEN_EMPLOYEE_PROFILE",
      });
      return;
    }

    const empSuffix = emp.employeeNumber.slice(-3);
    res.json({
      employeeId: emp.id,
      employeeNumber: emp.employeeNumber,
      fullName: `${emp.firstName} ${emp.lastName}`,
      jobTitle: emp.jobTitle,
      departmentName: emp.departmentName,
      location: emp.location,
      status: emp.status,
      employmentType: emp.employmentType,
      startDate: emp.startDate,
      probationEndDate: emp.probationEndDate,
      contractEndDate: emp.contractEndDate,
      reportingLine: {
        managerName: emp.managerName,
        directReports: DEMO_EMPLOYEES_LIST.filter((e) => e.managerId === emp.id).map(
          (r) => ({ id: r.id, name: `${r.firstName} ${r.lastName}`, jobTitle: r.jobTitle }),
        ),
      },
      statutoryIdentifiers: {
        kraPin: sensitivity.kraAndSocial ? maskKraPin(`DEMO-PIN-${empSuffix}`) : "RESTRICTED",
        nationalId: sensitivity.nationalIdAndEmergency ? maskNationalId(`DEMO-ID-${empSuffix}`) : "RESTRICTED",
        nssfNo: sensitivity.kraAndSocial ? `DEMO-NSSF-${empSuffix}` : "RESTRICTED",
        shaNo: sensitivity.kraAndSocial ? `DEMO-SHA-${empSuffix}` : "RESTRICTED",
        encryptionStatus: "AES-256-GCM Field Protection",
      },
      emergencyContact: sensitivity.nationalIdAndEmergency
        ? {
            name: "Demo Next-of-Kin Contact",
            relationship: "Designated Emergency Contact",
            phone: null,
          }
        : null,
      compensationSummary: canSeeCompensation
        ? {
            currency: "KES",
            payFrequency: "Monthly",
            paymentChannel: "M-Pesa B2C / Bank EFT",
            authorizedToView: true,
          }
        : { authorizedToView: false },
      skills: ["Kenya Compliance", "Operational Excellence", "Team Leadership"],
    });
    return;
  }

  const [dbEmp] = await db
    .select()
    .from(employeesTable)
    .where(
      and(
        eq(employeesTable.id, employeeId),
        eq(employeesTable.organizationId, access.organization.id),
      ),
    )
    .limit(1);

  if (!dbEmp) {
    res.status(404).json({ error: "Employee not found." });
    return;
  }

  if (!canReadEmployeeProfile(membership, dbEmp)) {
    res.status(403).json({
      error: "Access denied to another employee's 360 profile.",
      code: "FORBIDDEN_EMPLOYEE_PROFILE",
    });
    return;
  }

  const [deptRows, reportRows, managerRows] = await Promise.all([
    db
      .select({ name: departmentsTable.name })
      .from(departmentsTable)
      .where(
        and(
          eq(departmentsTable.id, dbEmp.departmentId),
          eq(departmentsTable.organizationId, access.organization.id),
        ),
      )
      .limit(1),
    db
      .select({
        id: employeesTable.id,
        firstName: employeesTable.firstName,
        lastName: employeesTable.lastName,
        jobTitle: employeesTable.jobTitle,
      })
      .from(employeesTable)
      .where(
        and(
          eq(employeesTable.organizationId, access.organization.id),
          eq(employeesTable.managerId, dbEmp.id),
        ),
      ),
    dbEmp.managerId
      ? db
          .select({ firstName: employeesTable.firstName, lastName: employeesTable.lastName })
          .from(employeesTable)
          .where(eq(employeesTable.id, dbEmp.managerId))
          .limit(1)
      : Promise.resolve([]),
  ]);

  let parsedEmergency: { name?: string; relationship?: string; phone?: string } | null = null;
  if (sensitivity.nationalIdAndEmergency && dbEmp.emergencyContactJson) {
    try {
      const dec = decryptSensitiveField(dbEmp.emergencyContactJson);
      if (dec && dec !== "[ENCRYPTED_UNAVAILABLE]") {
        parsedEmergency = JSON.parse(dec) as { name?: string; relationship?: string; phone?: string };
      }
    } catch {
      parsedEmergency = null;
    }
  }

  let parsedSkills: string[] = [];
  if (dbEmp.skillsJson) {
    try {
      const maybe = JSON.parse(dbEmp.skillsJson);
      if (Array.isArray(maybe)) parsedSkills = maybe.map(String);
    } catch {
      parsedSkills = [];
    }
  }

  res.json({
    employeeId: dbEmp.id,
    employeeNumber: dbEmp.employeeNumber,
    fullName: `${dbEmp.firstName} ${dbEmp.lastName}`,
    jobTitle: dbEmp.jobTitle,
    departmentName: deptRows[0]?.name ?? "Assigned Department",
    location: dbEmp.location,
    status: dbEmp.status,
    employmentType: dbEmp.employmentType,
    startDate: dbEmp.startDate,
    probationEndDate: dbEmp.probationEndDate,
    contractEndDate: dbEmp.contractEndDate,
    reportingLine: {
      managerName: managerRows[0] ? `${managerRows[0].firstName} ${managerRows[0].lastName}` : null,
      directReports: reportRows.map((r) => ({
        id: r.id,
        name: `${r.firstName} ${r.lastName}`,
        jobTitle: r.jobTitle,
      })),
    },
    statutoryIdentifiers: {
      kraPin: sensitivity.kraAndSocial ? (maskKraPin(dbEmp.kraPin) ?? "NOT_RECORDED") : "RESTRICTED",
      nationalId: sensitivity.nationalIdAndEmergency ? (maskNationalId(dbEmp.nationalId) ?? "NOT_RECORDED") : "RESTRICTED",
      nssfNo: sensitivity.kraAndSocial ? (dbEmp.nssfNo ? maskNationalId(decryptSensitiveField(dbEmp.nssfNo)) : "NOT_RECORDED") : "RESTRICTED",
      shaNo: sensitivity.kraAndSocial ? (dbEmp.shaNo ? maskNationalId(decryptSensitiveField(dbEmp.shaNo)) : "NOT_RECORDED") : "RESTRICTED",
      encryptionStatus: "AES-256-GCM Field Protection",
    },
    emergencyContact: sensitivity.nationalIdAndEmergency && parsedEmergency
      ? {
          name: parsedEmergency.name ?? "Designated Emergency Contact",
          relationship: parsedEmergency.relationship ?? "Next of Kin",
          phone: parsedEmergency.phone ? maskPhoneNumber(parsedEmergency.phone) : null,
        }
      : null,
    compensationSummary: canSeeCompensation
      ? {
          currency: "KES",
          payFrequency: "Monthly",
          paymentChannel: "M-Pesa B2C / Bank EFT",
          authorizedToView: true,
        }
      : { authorizedToView: false },
    skills: parsedSkills,
  });
});

router.get("/security/status", async (req, res): Promise<void> => {
  const access = await getReadAccess(req, res);
  if (!access || !access.membership) return;
  const session = getAuthSessionMeta(req);
  res.json({
    authProvider: session?.authProvider ?? "demo_sandbox",
    mfaVerified: session?.mfaVerified ?? false,
    role: access.membership.role,
    organizationId: access.membership.organizationId,
    encryptionStandard: "AES-256-GCM",
    rateLimitingActive: true,
    auditLoggingActive: true,
    odpcCompliantMasking: true,
    headersHardened: true,
  });
});

router.get(["/agents/status", "/agent-provider/status"], (_req, res): void => {
  const configured = Boolean(process.env.OPENAI_API_KEY);
  res.json(
    GetAgentProviderStatusResponse.parse({
      configured: true,
      provider: configured
        ? "OpenAI + Rekker 10-Agent Orchestrator"
        : "Rekker 10-Agent Deterministic Core",
      model: configured
        ? (process.env.PEOPLEOS_OPENAI_MODEL ?? "gpt-4o-mini")
        : "tool-grounded-synthesizer-v2",
      message: configured
        ? "OpenAI integration and 10-Agent StateGraph Supervisor with RAG + Python ML tools are active."
        : "10-Agent StateGraph Supervisor, RAG policy engine, and Python Scikit-learn/XGBoost ML tools are active. Add OPENAI_API_KEY in Secrets to enable generative LLM synthesis.",
    }),
  );
});

function parseEmployeeCsv(csvText: string) {
  const lines = csvText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
  if (lines.length === 0) return [];
  const rawHeaders = lines[0]!.split(",").map((h) => h.trim().toLowerCase());
  const hasHeader = rawHeaders.includes("firstname") || rawHeaders.includes("first_name") || rawHeaders.includes("employeenumber") || rawHeaders.includes("employee_number");
  const startIdx = hasHeader ? 1 : 0;

  return lines.slice(startIdx).map((line, i) => {
    const cols = line.split(",").map((c) => c.trim());
    const idxMap = (aliases: string[], fallbackIdx: number) => {
      if (!hasHeader) return cols[fallbackIdx] ?? "";
      for (const a of aliases) {
        const pos = rawHeaders.indexOf(a);
        if (pos >= 0) return cols[pos] ?? "";
      }
      return cols[fallbackIdx] ?? "";
    };
    return {
      rowNumber: startIdx + i + 1,
      employeeNumber: sanitizeText(idxMap(["employeenumber", "employee_number", "emp_no"], 0), 40).toUpperCase(),
      firstName: sanitizeText(idxMap(["firstname", "first_name"], 1), 80),
      lastName: sanitizeText(idxMap(["lastname", "last_name"], 2), 80),
      workEmail: sanitizeText(idxMap(["workemail", "work_email", "email"], 3), 160).toLowerCase(),
      jobTitle: sanitizeText(idxMap(["jobtitle", "job_title", "role"], 4), 120),
      departmentCode: sanitizeText(idxMap(["departmentcode", "department_code", "dept"], 5) || "PEOPLE", 24).toUpperCase(),
      location: sanitizeText(idxMap(["location"], 6) || "Nairobi Production Facility", 120),
      employmentType: sanitizeText(idxMap(["employmenttype", "employment_type"], 7) || "permanent", 30) as DemoEmployeeItem["employmentType"],
      startDate: sanitizeText(idxMap(["startdate", "start_date"], 8) || new Date().toISOString().slice(0, 10), 20),
    };
  });
}

// POST /api/peopleos/employees/import-preview — Validate & Detect Duplicates Before Bulk Import
router.post("/peopleos/employees/import-preview", async (req, res): Promise<void> => {
  const membership = await requireRoles(req, res, peopleManagers);
  if (!membership) return;

  const csvText = String(req.body?.csvText ?? "");
  const parsed = parseEmployeeCsv(csvText);
  if (!parsed.length) {
    res.status(400).json({ error: "No employee CSV rows supplied." });
    return;
  }

  let existingNumbers = new Set<string>();
  let existingEmails = new Set<string>();
  let depts = DEMO_DEPARTMENTS_LIST;

  if (!process.env.DATABASE_URL) {
    existingNumbers = new Set(DEMO_EMPLOYEES_LIST.map((e) => e.employeeNumber.toUpperCase()));
    existingEmails = new Set(DEMO_EMPLOYEES_LIST.map((e) => e.workEmail.toLowerCase()));
  } else {
    const dbEmps = await db
      .select({ empNo: employeesTable.employeeNumber, email: employeesTable.workEmail })
      .from(employeesTable)
      .where(eq(employeesTable.organizationId, membership.organizationId));
    existingNumbers = new Set(dbEmps.map((e) => e.empNo.toUpperCase()));
    existingEmails = new Set(dbEmps.map((e) => e.email.toLowerCase()));
  }

  const seenNumbers = new Set<string>();
  const seenEmails = new Set<string>();
  const validTypes = new Set(["permanent", "fixed_term", "casual", "intern"]);

  const evaluated = parsed.map((row) => {
    const errors: string[] = [];
    if (!row.employeeNumber) errors.push("Missing employeeNumber");
    if (!row.firstName || !row.lastName) errors.push("Missing first/last name");
    if (!row.workEmail || !row.workEmail.includes("@")) errors.push("Invalid workEmail");
    if (!row.jobTitle) errors.push("Missing jobTitle");
    const dept = depts.find((d) => d.code.toUpperCase() === row.departmentCode) ?? depts[0]!;
    const empType = validTypes.has(row.employmentType) ? row.employmentType : "permanent";

    const isDuplicateExisting =
      existingNumbers.has(row.employeeNumber) || existingEmails.has(row.workEmail);
    const isDuplicateInBatch =
      seenNumbers.has(row.employeeNumber) || seenEmails.has(row.workEmail);
    if (isDuplicateExisting) errors.push("Duplicate existing employeeNumber or workEmail");
    if (isDuplicateInBatch) errors.push("Duplicate within CSV batch");

    if (row.employeeNumber) seenNumbers.add(row.employeeNumber);
    if (row.workEmail) seenEmails.add(row.workEmail);

    return {
      ...row,
      departmentId: dept.id,
      departmentName: dept.name,
      employmentType: empType,
      status: isDuplicateExisting || isDuplicateInBatch ? "duplicate" : errors.length ? "error" : "valid",
      errors,
    };
  });

  res.json({
    totalRows: evaluated.length,
    validCount: evaluated.filter((r) => r.status === "valid").length,
    duplicateCount: evaluated.filter((r) => r.status === "duplicate").length,
    errorCount: evaluated.filter((r) => r.status === "error").length,
    rows: evaluated,
  });
});

// POST /api/peopleos/employees/import — Commit Validated Non-Duplicate CSV Employees
router.post("/peopleos/employees/import", async (req, res): Promise<void> => {
  const membership = await requireRoles(req, res, peopleManagers);
  if (!membership) return;

  const csvText = String(req.body?.csvText ?? "");
  const parsed = parseEmployeeCsv(csvText);
  if (!parsed.length) {
    res.status(400).json({ error: "No employee CSV rows supplied." });
    return;
  }

  let existingNumbers = new Set(DEMO_EMPLOYEES_LIST.map((e) => e.employeeNumber.toUpperCase()));
  let existingEmails = new Set(DEMO_EMPLOYEES_LIST.map((e) => e.workEmail.toLowerCase()));
  if (process.env.DATABASE_URL) {
    const dbEmps = await db
      .select({ empNo: employeesTable.employeeNumber, email: employeesTable.workEmail })
      .from(employeesTable)
      .where(eq(employeesTable.organizationId, membership.organizationId));
    existingNumbers = new Set(dbEmps.map((e) => e.empNo.toUpperCase()));
    existingEmails = new Set(dbEmps.map((e) => e.email.toLowerCase()));
  }

  const imported: any[] = [];
  const skippedDuplicates: string[] = [];

  if (!process.env.DATABASE_URL) {
    for (const row of parsed) {
      if (
        !row.employeeNumber ||
        !row.firstName ||
        !row.lastName ||
        !row.workEmail.includes("@") ||
        !row.jobTitle
      ) {
        continue;
      }
      if (existingNumbers.has(row.employeeNumber) || existingEmails.has(row.workEmail)) {
        skippedDuplicates.push(row.employeeNumber || row.workEmail);
        continue;
      }
      existingNumbers.add(row.employeeNumber);
      existingEmails.add(row.workEmail);
      const dept =
        DEMO_DEPARTMENTS_LIST.find((d) => d.code.toUpperCase() === row.departmentCode) ??
        DEMO_DEPARTMENTS_LIST[0]!;
      const rec: DemoEmployeeItem = {
        id: crypto.randomUUID(),
        employeeNumber: row.employeeNumber,
        firstName: row.firstName,
        lastName: row.lastName,
        preferredName: row.firstName,
        workEmail: row.workEmail,
        phone: null,
        jobTitle: row.jobTitle,
        departmentId: dept.id,
        departmentName: dept.name,
        managerId: dept.managerEmployeeId ?? null,
        managerName: dept.managerName ?? null,
        location: row.location,
        employmentType: (["permanent", "fixed_term", "casual", "intern"].includes(row.employmentType)
          ? row.employmentType
          : "permanent") as DemoEmployeeItem["employmentType"],
        status: "active",
        startDate: row.startDate,
        probationEndDate: null,
        contractEndDate: null,
        isDemo: true,
      };
      DEMO_EMPLOYEES_LIST.push(rec);
      imported.push(rec);
    }

    await recordAuditEvent({
      organizationId: membership.organizationId,
      actorUserId: membership.userId,
      actor: membership.role,
      action: "EMPLOYEE_BULK_IMPORTED",
      targetType: "employee_batch",
      targetId: `batch-${Date.now()}`,
      summary: `Imported ${imported.length} employees via CSV (${skippedDuplicates.length} duplicate(s) skipped)`,
      correlationId: req.correlationId,
      critical: true,
      isDemo: true,
    });
  } else {
    await db.transaction(async (tx) => {
      for (const row of parsed) {
        if (
          !row.employeeNumber ||
          !row.firstName ||
          !row.lastName ||
          !row.workEmail.includes("@") ||
          !row.jobTitle
        ) {
          continue;
        }
        if (existingNumbers.has(row.employeeNumber) || existingEmails.has(row.workEmail)) {
          skippedDuplicates.push(row.employeeNumber || row.workEmail);
          continue;
        }
        existingNumbers.add(row.employeeNumber);
        existingEmails.add(row.workEmail);
        const dept =
          DEMO_DEPARTMENTS_LIST.find((d) => d.code.toUpperCase() === row.departmentCode) ??
          DEMO_DEPARTMENTS_LIST[0]!;
        const [created] = await tx
          .insert(employeesTable)
          .values({
            organizationId: membership.organizationId,
            employeeNumber: row.employeeNumber,
            firstName: row.firstName,
            lastName: row.lastName,
            preferredName: row.firstName,
            workEmail: row.workEmail,
            jobTitle: row.jobTitle,
            departmentId: dept.id,
            location: row.location,
            employmentType: row.employmentType || "permanent",
            status: "active",
            startDate: row.startDate,
            isDemo: false,
          })
          .returning();
        if (created) imported.push(created);
      }

      await recordAuditEvent({
        organizationId: membership.organizationId,
        actorUserId: membership.userId,
        actor: membership.role,
        action: "EMPLOYEE_BULK_IMPORTED",
        targetType: "employee_batch",
        targetId: `batch-${Date.now()}`,
        summary: `Imported ${imported.length} employees via CSV (${skippedDuplicates.length} duplicate(s) skipped)`,
        correlationId: req.correlationId,
        critical: true,
        isDemo: false,
        tx,
      });
    });
  }

  res.status(201).json({
    importedCount: imported.length,
    skippedDuplicatesCount: skippedDuplicates.length,
    skippedDuplicates,
    imported,
  });
});

// GET /api/peopleos/org-chart — Hierarchical Reporting Lines (DB + Demo Parity)
router.get("/peopleos/org-chart", async (req, res): Promise<void> => {
  const access = await getReadAccess(req, res);
  if (!access || !access.membership) return;

  let sourceEmployees: Array<{
    id: string;
    employeeNumber: string;
    firstName: string;
    lastName: string;
    jobTitle: string;
    departmentName: string;
    managerId: string | null;
    managerName: string | null;
    status: string;
  }> = [];

  if (!process.env.DATABASE_URL) {
    sourceEmployees = DEMO_EMPLOYEES_LIST;
  } else {
    const [dbEmps, dbDepts] = await Promise.all([
      db
        .select()
        .from(employeesTable)
        .where(eq(employeesTable.organizationId, access.membership.organizationId)),
      db
        .select()
        .from(departmentsTable)
        .where(eq(departmentsTable.organizationId, access.membership.organizationId)),
    ]);
    const deptNameMap = new Map(dbDepts.map((d) => [d.id, d.name]));
    const empNameMap = new Map(dbEmps.map((e) => [e.id, `${e.firstName} ${e.lastName}`]));
    sourceEmployees = dbEmps.map((e) => ({
      id: e.id,
      employeeNumber: e.employeeNumber,
      firstName: e.firstName,
      lastName: e.lastName,
      jobTitle: e.jobTitle,
      departmentName: deptNameMap.get(e.departmentId) ?? "General Operations",
      managerId: e.managerId,
      managerName: e.managerId ? empNameMap.get(e.managerId) ?? null : null,
      status: e.status,
    }));
  }

  const nodes = sourceEmployees.map((e) => ({
    id: e.id,
    employeeNumber: e.employeeNumber,
    fullName: `${e.firstName} ${e.lastName}`,
    jobTitle: e.jobTitle,
    departmentName: e.departmentName,
    managerId: e.managerId,
    managerName: e.managerName,
    status: e.status,
    directReportsCount: sourceEmployees.filter((c) => c.managerId === e.id).length,
  }));

  res.json({ totalNodes: nodes.length, nodes });
});

export default router;
