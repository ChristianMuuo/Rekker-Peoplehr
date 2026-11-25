import { db, pool } from "./index";
import {
  auditEventsTable,
  departmentsTable,
  employeesTable,
  leaveRequestsTable,
  organizationsTable,
} from "./schema";

const organizationId = "rekker-demo";

function relativeDate(offsetDays: number): string {
  const value = new Date();
  value.setUTCHours(0, 0, 0, 0);
  value.setUTCDate(value.getUTCDate() + offsetDays);
  return value.toISOString().slice(0, 10);
}

function relativeMonths(offsetMonths: number): string {
  const value = new Date();
  value.setUTCHours(0, 0, 0, 0);
  value.setUTCMonth(value.getUTCMonth() + offsetMonths);
  return value.toISOString().slice(0, 10);
}

const demoTime = (daysAgo: number) => {
  const value = new Date();
  value.setUTCDate(value.getUTCDate() - daysAgo);
  value.setUTCHours(9, 0, 0, 0);
  return value;
};

const departments = [
  {
    id: "20000000-0000-4000-8000-000000000001",
    organizationId,
    code: "MFG",
    name: "Manufacturing",
    description: "Production operations and quality.",
    location: "Nairobi demo site",
    managerEmployeeId: "10000000-0000-4000-8000-000000000001",
    budgetedPositions: 6,
  },
  {
    id: "20000000-0000-4000-8000-000000000002",
    organizationId,
    code: "DIST",
    name: "Distribution",
    description: "Warehouse, route planning, and delivery operations.",
    location: "Nairobi demo hub",
    managerEmployeeId: "10000000-0000-4000-8000-000000000003",
    budgetedPositions: 8,
  },
  {
    id: "20000000-0000-4000-8000-000000000003",
    organizationId,
    code: "BRAND",
    name: "Brand & Marketing",
    description: "Brand development and commercial marketing.",
    location: "Nairobi demo office",
    managerEmployeeId: "10000000-0000-4000-8000-000000000005",
    budgetedPositions: 3,
  },
  {
    id: "20000000-0000-4000-8000-000000000004",
    organizationId,
    code: "PEOPLE",
    name: "People & Culture",
    description: "People operations and employee support.",
    location: "Nairobi demo office",
    managerEmployeeId: "10000000-0000-4000-8000-000000000007",
    budgetedPositions: 4,
  },
];

const employees = [
  {
    id: "10000000-0000-4000-8000-000000000001",
    organizationId,
    employeeNumber: "DEMO-001",
    firstName: "Demo",
    lastName: "Manager 01",
    preferredName: null,
    workEmail: "demo.manager.01@rekker-demo.invalid",
    phone: null,
    jobTitle: "Production Manager",
    departmentId: departments[0]!.id,
    managerId: null,
    location: "Nairobi demo site",
    employmentType: "permanent",
    status: "active",
    startDate: relativeMonths(-36),
    probationEndDate: null,
    contractEndDate: null,
    isDemo: true,
  },
  {
    id: "10000000-0000-4000-8000-000000000002",
    organizationId,
    employeeNumber: "DEMO-002",
    firstName: "Demo",
    lastName: "Employee 02",
    preferredName: null,
    workEmail: "demo.employee.02@rekker-demo.invalid",
    phone: null,
    jobTitle: "Production Technician",
    departmentId: departments[0]!.id,
    managerId: "10000000-0000-4000-8000-000000000001",
    location: "Nairobi demo site",
    employmentType: "permanent",
    status: "active",
    startDate: relativeMonths(-14),
    probationEndDate: null,
    contractEndDate: null,
    isDemo: true,
  },
  {
    id: "10000000-0000-4000-8000-000000000003",
    organizationId,
    employeeNumber: "DEMO-003",
    firstName: "Demo",
    lastName: "Manager 03",
    preferredName: null,
    workEmail: "demo.manager.03@rekker-demo.invalid",
    phone: null,
    jobTitle: "Distribution Manager",
    departmentId: departments[1]!.id,
    managerId: null,
    location: "Nairobi demo hub",
    employmentType: "permanent",
    status: "active",
    startDate: relativeMonths(-48),
    probationEndDate: null,
    contractEndDate: null,
    isDemo: true,
  },
  {
    id: "10000000-0000-4000-8000-000000000004",
    organizationId,
    employeeNumber: "DEMO-004",
    firstName: "Demo",
    lastName: "Employee 04",
    preferredName: null,
    workEmail: "demo.employee.04@rekker-demo.invalid",
    phone: null,
    jobTitle: "Route Planning Coordinator",
    departmentId: departments[1]!.id,
    managerId: "10000000-0000-4000-8000-000000000003",
    location: "Nairobi demo hub",
    employmentType: "fixed_term",
    status: "probation",
    startDate: relativeDate(-45),
    probationEndDate: relativeDate(45),
    contractEndDate: relativeDate(365),
    isDemo: true,
  },
  {
    id: "10000000-0000-4000-8000-000000000005",
    organizationId,
    employeeNumber: "DEMO-005",
    firstName: "Demo",
    lastName: "Manager 05",
    preferredName: null,
    workEmail: "demo.manager.05@rekker-demo.invalid",
    phone: null,
    jobTitle: "Brand Manager",
    departmentId: departments[2]!.id,
    managerId: null,
    location: "Nairobi demo office",
    employmentType: "permanent",
    status: "active",
    startDate: relativeMonths(-60),
    probationEndDate: null,
    contractEndDate: null,
    isDemo: true,
  },
  {
    id: "10000000-0000-4000-8000-000000000006",
    organizationId,
    employeeNumber: "DEMO-006",
    firstName: "Demo",
    lastName: "Employee 06",
    preferredName: null,
    workEmail: "demo.employee.06@rekker-demo.invalid",
    phone: null,
    jobTitle: "Campaign Coordinator",
    departmentId: departments[2]!.id,
    managerId: "10000000-0000-4000-8000-000000000005",
    location: "Nairobi demo office",
    employmentType: "permanent",
    status: "active",
    startDate: relativeMonths(-12),
    probationEndDate: null,
    contractEndDate: null,
    isDemo: true,
  },
  {
    id: "10000000-0000-4000-8000-000000000007",
    organizationId,
    employeeNumber: "DEMO-007",
    firstName: "Demo",
    lastName: "Manager 07",
    preferredName: null,
    workEmail: "demo.manager.07@rekker-demo.invalid",
    phone: null,
    jobTitle: "People Operations Manager",
    departmentId: departments[3]!.id,
    managerId: null,
    location: "Nairobi demo office",
    employmentType: "permanent",
    status: "active",
    startDate: relativeMonths(-72),
    probationEndDate: null,
    contractEndDate: null,
    isDemo: true,
  },
  {
    id: "10000000-0000-4000-8000-000000000008",
    organizationId,
    employeeNumber: "DEMO-008",
    firstName: "Demo",
    lastName: "Employee 08",
    preferredName: null,
    workEmail: "demo.employee.08@rekker-demo.invalid",
    phone: null,
    jobTitle: "HR Coordinator",
    departmentId: departments[3]!.id,
    managerId: "10000000-0000-4000-8000-000000000007",
    location: "Nairobi demo office",
    employmentType: "fixed_term",
    status: "probation",
    startDate: relativeMonths(-7),
    probationEndDate: relativeDate(60),
    contractEndDate: relativeDate(90),
    isDemo: true,
  },
];

const leaveRequests = [
  {
    id: "30000000-0000-4000-8000-000000000001",
    organizationId,
    employeeId: employees[1]!.id,
    leaveType: "annual",
    startDate: relativeDate(14),
    endDate: relativeDate(16),
    days: 3,
    reason: "Fictional request for demonstrating the approval workflow.",
    status: "pending",
    createdByUserId: "demo-seed",
    approverUserId: null,
    decisionComment: null,
    submittedAt: demoTime(24),
    decidedAt: null,
    isDemo: true,
  },
  {
    id: "30000000-0000-4000-8000-000000000002",
    organizationId,
    employeeId: employees[3]!.id,
    leaveType: "annual",
    startDate: relativeDate(28),
    endDate: relativeDate(29),
    days: 2,
    reason: "Fictional request for demonstrating the approval workflow.",
    status: "pending",
    createdByUserId: "demo-seed",
    approverUserId: null,
    decisionComment: null,
    submittedAt: demoTime(25),
    decidedAt: null,
    isDemo: true,
  },
  {
    id: "30000000-0000-4000-8000-000000000003",
    organizationId,
    employeeId: employees[5]!.id,
    leaveType: "annual",
    startDate: relativeDate(-21),
    endDate: relativeDate(-19),
    days: 3,
    reason: "Fictional approved request for coverage-view demonstration.",
    status: "approved",
    createdByUserId: "demo-seed",
    approverUserId: "demo-seed",
    decisionComment: "Approved in synthetic demo data.",
    submittedAt: demoTime(17),
    decidedAt: demoTime(20),
    isDemo: true,
  },
];

const auditEvents = [
  {
    id: "40000000-0000-4000-8000-000000000001",
    organizationId,
    actorUserId: "demo-seed",
    actor: "Demo HR Administrator",
    action: "leave_request_submitted",
    targetType: "leave_request",
    targetId: leaveRequests[0]!.id,
    summary: "A fictional annual leave request entered the approval queue.",
    occurredAt: demoTime(24),
    isDemo: true,
  },
  {
    id: "40000000-0000-4000-8000-000000000002",
    organizationId,
    actorUserId: "demo-seed",
    actor: "Demo HR Administrator",
    action: "employee_profile_reviewed",
    targetType: "employee",
    targetId: employees[7]!.id,
    summary: "A fictional employee profile was reviewed.",
    occurredAt: demoTime(23),
    isDemo: true,
  },
];

try {
  await db
    .insert(organizationsTable)
    .values({
      id: organizationId,
      name: "Rekker PeopleOS Demo",
      isDemo: true,
    })
    .onConflictDoNothing();
  await db.insert(departmentsTable).values(departments).onConflictDoNothing();
  await db.insert(employeesTable).values(employees).onConflictDoNothing();
  await db
    .insert(leaveRequestsTable)
    .values(leaveRequests)
    .onConflictDoNothing();
  await db.insert(auditEventsTable).values(auditEvents).onConflictDoNothing();
} finally {
  await pool.end();
}
