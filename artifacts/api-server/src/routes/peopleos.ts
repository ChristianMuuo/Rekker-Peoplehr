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
  auditEventsTable,
  db,
  departmentsTable,
  employeesTable,
  leaveRequestsTable,
} from "@workspace/db";
import {
  getPeopleOsOrganization,
  getReadAccess,
  PEOPLEOS_ORGANIZATION_ID,
  PEOPLEOS_ROLES,
  requireRoles,
} from "../middlewares/peopleosAccess";

const router: IRouter = Router();
const peopleManagers = [
  PEOPLEOS_ROLES.hrAdmin,
  PEOPLEOS_ROLES.hrManager,
  PEOPLEOS_ROLES.systemAdmin,
] as const;
const overviewRoles: readonly string[] = [
  PEOPLEOS_ROLES.hrAdmin,
  PEOPLEOS_ROLES.hrManager,
  PEOPLEOS_ROLES.systemAdmin,
  PEOPLEOS_ROLES.departmentManager,
  PEOPLEOS_ROLES.executive,
];
const departmentRoles: readonly string[] = [
  ...overviewRoles,
  PEOPLEOS_ROLES.employee,
];
const directoryRoles: readonly string[] = [
  PEOPLEOS_ROLES.hrAdmin,
  PEOPLEOS_ROLES.hrManager,
  PEOPLEOS_ROLES.systemAdmin,
  PEOPLEOS_ROLES.departmentManager,
  PEOPLEOS_ROLES.employee,
];
const dayMs = 24 * 60 * 60 * 1000;

export const DEMO_DEPARTMENTS_LIST = [
  { id: '20000000-0000-4000-8000-000000000001', code: 'MFG', name: 'Manufacturing & Brewing', description: 'Brewery production lines, quality inspection, fermentation operations.', location: 'Nairobi Industrial Area Plant', managerEmployeeId: '10000000-0000-4000-8000-000000000001', managerName: 'Achieng Odhiambo', headcount: 3, budgetedPositions: 15 },
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
  { id: '10000000-0000-4000-8000-000000000001', employeeNumber: 'REK-0101', firstName: 'Achieng', lastName: 'Odhiambo', preferredName: 'Achieng', workEmail: 'achieng.odhiambo@rekker.co.ke', phone: '+254 722 100 201', jobTitle: 'Plant Operations Director', departmentId: '20000000-0000-4000-8000-000000000001', departmentName: 'Manufacturing & Brewing', managerId: null, managerName: null, location: 'Nairobi Industrial Area Plant', employmentType: 'permanent', status: 'active', startDate: '2021-03-15', probationEndDate: null, contractEndDate: null, isDemo: true },
  { id: '10000000-0000-4000-8000-000000000002', employeeNumber: 'REK-0102', firstName: 'Mwangi', lastName: 'Kariuki', preferredName: 'Mwangi', workEmail: 'mwangi.kariuki@rekker.co.ke', phone: '+254 733 410 882', jobTitle: 'Senior Brewmaster & Quality Lead', departmentId: '20000000-0000-4000-8000-000000000001', departmentName: 'Manufacturing & Brewing', managerId: '10000000-0000-4000-8000-000000000001', managerName: 'Achieng Odhiambo', location: 'Nairobi Industrial Area Plant', employmentType: 'permanent', status: 'active', startDate: '2022-06-01', probationEndDate: null, contractEndDate: null, isDemo: true },
  { id: '10000000-0000-4000-8000-000000000003', employeeNumber: 'REK-0103', firstName: 'Juma', lastName: 'Omondi', preferredName: null, workEmail: 'juma.omondi@rekker.co.ke', phone: '+254 711 502 918', jobTitle: 'Logistics Fleet Manager', departmentId: '20000000-0000-4000-8000-000000000002', departmentName: 'Logistics & Distribution', managerId: null, managerName: null, location: 'Nairobi Central Logistics Hub', employmentType: 'permanent', status: 'active', startDate: '2022-09-10', probationEndDate: null, contractEndDate: null, isDemo: true },
  { id: '10000000-0000-4000-8000-000000000004', employeeNumber: 'REK-0104', firstName: 'Wanjiku', lastName: 'Kimani', preferredName: 'Wawa', workEmail: 'wanjiku.kimani@rekker.co.ke', phone: '+254 700 819 223', jobTitle: 'Distribution Dispatch Specialist', departmentId: '20000000-0000-4000-8000-000000000002', departmentName: 'Logistics & Distribution', managerId: '10000000-0000-4000-8000-000000000003', managerName: 'Juma Omondi', location: 'Nairobi Central Logistics Hub', employmentType: 'permanent', status: 'on_leave', startDate: '2023-04-12', probationEndDate: null, contractEndDate: null, isDemo: true },
  { id: '10000000-0000-4000-8000-000000000005', employeeNumber: 'REK-0105', firstName: 'Brenda', lastName: 'Mutheu', preferredName: 'Brenda', workEmail: 'brenda.mutheu@rekker.co.ke', phone: '+254 721 349 018', jobTitle: 'Brand Strategy & Trade Lead', departmentId: '20000000-0000-4000-8000-000000000003', departmentName: 'Brand & Commercial Marketing', managerId: null, managerName: null, location: 'Westlands Commercial Office', employmentType: 'permanent', status: 'active', startDate: '2022-01-10', probationEndDate: null, contractEndDate: null, isDemo: true },
  { id: '10000000-0000-4000-8000-000000000006', employeeNumber: 'REK-0106', firstName: 'Brian', lastName: 'Kiprotich', preferredName: 'Brian', workEmail: 'brian.kiprotich@rekker.co.ke', phone: '+254 725 619 827', jobTitle: 'Digital Growth & Social Media Specialist', departmentId: '20000000-0000-4000-8000-000000000003', departmentName: 'Brand & Commercial Marketing', managerId: '10000000-0000-4000-8000-000000000005', managerName: 'Brenda Mutheu', location: 'Westlands Commercial Office', employmentType: 'fixed_term', status: 'active', startDate: '2024-02-01', probationEndDate: null, contractEndDate: '2026-04-30', isDemo: true },
  { id: '10000000-0000-4000-8000-000000000007', employeeNumber: 'REK-0107', firstName: 'David', lastName: 'Kibet', preferredName: 'David', workEmail: 'david.kibet@rekker.co.ke', phone: '+254 720 182 930', jobTitle: 'Head of People & Organization Culture', departmentId: '20000000-0000-4000-8000-000000000004', departmentName: 'People Operations & Culture', managerId: null, managerName: null, location: 'Westlands Commercial Office', employmentType: 'permanent', status: 'active', startDate: '2021-08-01', probationEndDate: null, contractEndDate: null, isDemo: true },
  { id: '10000000-0000-4000-8000-000000000008', employeeNumber: 'REK-0108', firstName: 'Faith', lastName: 'Chebet', preferredName: 'Faith', workEmail: 'faith.chebet@rekker.co.ke', phone: '+254 724 991 823', jobTitle: 'Talent Acquisition & Employee Experience Officer', departmentId: '20000000-0000-4000-8000-000000000004', departmentName: 'People Operations & Culture', managerId: '10000000-0000-4000-8000-000000000007', managerName: 'David Kibet', location: 'Westlands Commercial Office', employmentType: 'permanent', status: 'probation', startDate: '2026-01-15', probationEndDate: '2026-04-15', contractEndDate: null, isDemo: true },
  { id: '10000000-0000-4000-8000-000000000009', employeeNumber: 'REK-0109', firstName: 'Dennis', lastName: 'Otieno', preferredName: 'Denno', workEmail: 'dennis.otieno@rekker.co.ke', phone: '+254 731 442 819', jobTitle: 'Financial Accountant & Payroll Controller', departmentId: '20000000-0000-4000-8000-000000000005', departmentName: 'Finance & Supply Chain', managerId: null, managerName: null, location: 'Westlands Commercial Office', employmentType: 'permanent', status: 'active', startDate: '2023-01-09', probationEndDate: null, contractEndDate: null, isDemo: true },
  { id: '10000000-0000-4000-8000-000000000010', employeeNumber: 'REK-0110', firstName: 'Sarah', lastName: 'Njeri', preferredName: 'Sarah', workEmail: 'sarah.njeri@rekker.co.ke', phone: '+254 718 293 847', jobTitle: 'Junior Quality Assurance Chemist', departmentId: '20000000-0000-4000-8000-000000000001', departmentName: 'Manufacturing & Brewing', managerId: '10000000-0000-4000-8000-000000000002', managerName: 'Mwangi Kariuki', location: 'Nairobi Industrial Area Plant', employmentType: 'permanent', status: 'active', startDate: '2024-05-02', probationEndDate: null, contractEndDate: null, isDemo: true },
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

async function writeAudit(
  actorUserId: string,
  actor: string,
  action: string,
  targetType: string,
  targetId: string,
  summary: string,
  isDemo: boolean,
): Promise<void> {
  await db.insert(auditEventsTable).values({
    organizationId: PEOPLEOS_ORGANIZATION_ID,
    actorUserId,
    actor,
    action,
    targetType,
    targetId,
    summary,
    isDemo,
  });
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
    [
      PEOPLEOS_ROLES.employee,
      PEOPLEOS_ROLES.departmentManager,
      PEOPLEOS_ROLES.hrAdmin,
      PEOPLEOS_ROLES.systemAdmin,
      PEOPLEOS_ROLES.executive,
      PEOPLEOS_ROLES.auditor,
      PEOPLEOS_ROLES.hrManager,
    ],
  );
  if (!membership) return;
  const role = membership.role;
  const admin: readonly string[] = peopleManagers;
  const isAdmin = admin.includes(role);
  const response = {
    role,
    displayName: "Rekker teammate",
    organizationName: organization.name,
    canManagePeople: isAdmin,
    canApproveLeave:
      isAdmin || role === PEOPLEOS_ROLES.departmentManager,
    canViewAudit:
      isAdmin || role === PEOPLEOS_ROLES.auditor,
    canViewPayroll:
      role === PEOPLEOS_ROLES.systemAdmin ||
      role === PEOPLEOS_ROLES.payrollOfficer,
    canManageSettings:
      role === PEOPLEOS_ROLES.systemAdmin || role === PEOPLEOS_ROLES.hrAdmin,
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
  if (!access.organization.isDemo && access.membership) {
    if (access.membership.role === PEOPLEOS_ROLES.employee) {
      conditions.push(
        access.membership.employeeId
          ? eq(employeesTable.id, access.membership.employeeId)
          : eq(employeesTable.id, "00000000-0000-4000-8000-000000000000"),
      );
    } else if (
      access.membership.role === PEOPLEOS_ROLES.departmentManager
    ) {
      conditions.push(
        access.membership.employeeId
          ? eq(employeesTable.managerId, access.membership.employeeId)
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
  const [record] = await db
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
  if (!record) {
    res.status(500).json({ error: "Employee record could not be created." });
    return;
  }
  await writeAudit(
    membership.userId,
    membership.role,
    "employee_created",
    "employee",
    record.id,
    "An employee profile was created.",
    organization.isDemo,
  );
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
    !access.organization.isDemo &&
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
    res.json(GetEmployeeResponse.parse(emp));
    return;
  }
  const conditions = [
    eq(employeesTable.id, params.data.employeeId),
    eq(employeesTable.organizationId, access.organization.id),
  ];
  if (
    !access.organization.isDemo &&
    access.membership?.role === PEOPLEOS_ROLES.employee
  ) {
    if (!access.membership.employeeId || access.membership.employeeId !== params.data.employeeId) {
      res.status(404).json({ error: "Employee not found." });
      return;
    }
  }
  if (
    !access.organization.isDemo &&
    access.membership?.role === PEOPLEOS_ROLES.departmentManager
  ) {
    if (!access.membership.employeeId) {
      res.status(404).json({ error: "Employee not found." });
      return;
    }
    const [target] = await db
      .select({ managerId: employeesTable.managerId })
      .from(employeesTable)
      .where(and(...conditions))
      .limit(1);
    if (!target || target.managerId !== access.membership.employeeId) {
      res.status(404).json({ error: "Employee not found." });
      return;
    }
  }
  const [record] = await db
    .select()
    .from(employeesTable)
    .where(and(...conditions))
    .limit(1);
  if (!record) {
    res.status(404).json({ error: "Employee not found." });
    return;
  }
  if (access.membership) {
    await writeAudit(
      access.membership.userId,
      access.membership.role,
      "employee_profile_viewed",
      "employee",
      record.id,
      "An authorized employee profile was viewed.",
      record.isDemo,
    );
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
  const [record] = await db
    .update(employeesTable)
    .set(updateData)
    .where(
      and(
        eq(employeesTable.id, params.data.employeeId),
        eq(employeesTable.organizationId, organization.id),
      ),
    )
    .returning();
  if (!record) {
    res.status(404).json({ error: "Employee not found." });
    return;
  }
  await writeAudit(
    membership.userId,
    membership.role,
    "employee_profile_updated",
    "employee",
    record.id,
    "Permitted employee profile fields were updated.",
    record.isDemo,
  );
  const [employee] = await serializeEmployees([record]);
  res.json(UpdateEmployeeResponse.parse(employee));
});

router.get("/agents/status", (_req, res): void => {
  const configured = Boolean(process.env.OPENAI_API_KEY);
  res.json(
    GetAgentProviderStatusResponse.parse({
      configured,
      provider: configured ? "OpenAI" : null,
      model: configured ? (process.env.PEOPLEOS_OPENAI_MODEL ?? null) : null,
      message: configured
        ? "A provider key is available, but AI actions are not enabled in this phase. Rule-based workforce signals remain active."
        : "AI responses are disabled. Add OPENAI_API_KEY through workspace Secrets to enable them; rule-based workforce signals remain available.",
    }),
  );
});

export default router;
