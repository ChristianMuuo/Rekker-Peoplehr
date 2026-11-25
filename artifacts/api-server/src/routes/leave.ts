import crypto from "node:crypto";
import { and, eq, gte, inArray, lte } from "drizzle-orm";
import { Router, type IRouter } from "express";
import {
  CreateLeavePolicyBody,
  CreateLeavePolicyResponse,
  CreateLeaveRequestBody,
  CreateLeaveRequestResponse,
  DecideLeaveRequestBody,
  DecideLeaveRequestParams,
  DecideLeaveRequestResponse,
  ListApprovalsResponse,
  ListLeaveBalancesQueryParams,
  ListLeaveBalancesResponse,
  ListLeavePoliciesResponse,
  ListLeaveRequestsQueryParams,
  ListLeaveRequestsResponse,
  UpdateLeavePolicyBody,
  UpdateLeavePolicyParams,
  UpdateLeavePolicyResponse,
} from "@workspace/api-zod";
import {
  auditEventsTable,
  db,
  employeesTable,
  leavePoliciesTable,
  leaveRequestsTable,
  leaveLedgerTable,
} from "@workspace/db";
import { recordAuditEvent } from "../lib/auditService";
import {
  entitlementToCalendarDays,
  recommendLeave,
  validateKenyaStatutoryFloor,
} from "../services/leaveEngine";
import { DEMO_DEPARTMENTS_LIST, DEMO_EMPLOYEES_LIST } from "./peopleos";
import {
  countCalendarWorkingDays,
  resolveEffectiveWorkCalendar,
} from "../services/workCalendarService";
import {
  ensureMembership,
  getPeopleOsOrganization,
  PEOPLEOS_ROLES,
  requireRoles,
} from "../middlewares/peopleosAccess";

const router: IRouter = Router();

export interface DemoLeavePolicyItem {
  id: string;
  organizationId: string;
  code: string;
  name: string;
  entitlementDays: number;
  accrualMethod: "annual" | "monthly";
  active: boolean;
  entitlementQuantity?: number;
  entitlementUnit?: "days" | "weeks" | "months";
  needsLegalReview?: boolean;
  sourceUrl?: string | null;
}

const KENYA_EMPLOYMENT_ACT_SOURCE =
  "https://new.kenyalaw.org/akn/ke/act/2007/11/eng%402007-11-09/source.pdf";

const DEFAULT_KENYA_LEAVE_POLICIES = [
  {
    code: "annual",
    name: "Annual Leave",
    entitlementDays: 21,
    entitlementQuantity: 21,
    entitlementUnit: "days" as const,
    accrualMethod: "monthly" as const,
    needsLegalReview: true,
    sourceUrl: KENYA_EMPLOYMENT_ACT_SOURCE,
    policyMetadataJson: JSON.stringify({ section: "28", note: "At least 21 working days with full pay per 12 consecutive months." }),
  },
  {
    code: "sick",
    name: "Sick Leave (7 full-pay + 7 half-pay days)",
    entitlementDays: 14,
    entitlementQuantity: 14,
    entitlementUnit: "days" as const,
    accrualMethod: "annual" as const,
    needsLegalReview: true,
    sourceUrl: KENYA_EMPLOYMENT_ACT_SOURCE,
    policyMetadataJson: JSON.stringify({ section: "30", minimumServiceMonths: 2, fullPayDays: 7, halfPayDays: 7 }),
  },
  {
    code: "maternity",
    name: "Maternity Leave (3 months)",
    entitlementDays: 90,
    entitlementQuantity: 3,
    entitlementUnit: "months" as const,
    accrualMethod: "annual" as const,
    needsLegalReview: true,
    sourceUrl: KENYA_EMPLOYMENT_ACT_SOURCE,
    policyMetadataJson: JSON.stringify({ section: "29", paidPercentage: 100 }),
  },
  {
    code: "paternity",
    name: "Paternity Leave (2 weeks / 14 calendar days)",
    entitlementDays: 14,
    entitlementQuantity: 2,
    entitlementUnit: "weeks" as const,
    accrualMethod: "annual" as const,
    needsLegalReview: true,
    sourceUrl: KENYA_EMPLOYMENT_ACT_SOURCE,
    policyMetadataJson: JSON.stringify({ section: "29(8)", statutoryUnit: "weeks", calendarDays: 14, workingDayConversionNeedsLegalReview: true }),
  },
  {
    code: "pre-adoptive",
    name: "Pre-adoptive Leave (1 month)",
    entitlementDays: 30,
    entitlementQuantity: 1,
    entitlementUnit: "months" as const,
    accrualMethod: "annual" as const,
    needsLegalReview: true,
    sourceUrl: KENYA_EMPLOYMENT_ACT_SOURCE,
    policyMetadataJson: JSON.stringify({ section: "29A", verifyCurrentConsolidatedText: true }),
  },
];

export const DEMO_LEAVE_POLICIES: DemoLeavePolicyItem[] =
  DEFAULT_KENYA_LEAVE_POLICIES.map((policy, index) => ({
    id: `demo-leave-policy-${index + 1}`,
    organizationId: "rekker-demo",
    ...policy,
    active: true,
  }));

async function ensureKenyaDefaultPolicies(organizationId: string): Promise<void> {
  if (!process.env.DATABASE_URL) {
    if (!DEMO_LEAVE_POLICIES.some((policy) => policy.organizationId === organizationId)) {
      DEMO_LEAVE_POLICIES.push(...DEFAULT_KENYA_LEAVE_POLICIES.map((policy, index) => ({
        id: `demo-${organizationId}-leave-policy-${index + 1}`,
        organizationId,
        ...policy,
        active: true,
      })));
    }
    return;
  }

  const existing = await db
    .select({ id: leavePoliciesTable.id })
    .from(leavePoliciesTable)
    .where(eq(leavePoliciesTable.organizationId, organizationId))
    .limit(1);
  if (existing.length) return;

  await db.insert(leavePoliciesTable).values(
    DEFAULT_KENYA_LEAVE_POLICIES.map((policy) => ({
      organizationId,
      code: policy.code,
      name: policy.name,
      entitlementDays: policy.entitlementDays,
      entitlementQuantity: policy.entitlementQuantity,
      entitlementUnit: policy.entitlementUnit,
      jurisdiction: "KE",
      effectiveFrom: new Date().toISOString().slice(0, 10),
      sourceUrl: policy.sourceUrl,
      needsLegalReview: policy.needsLegalReview,
      policyMetadataJson: policy.policyMetadataJson,
      accrualMethod: policy.accrualMethod,
      active: true,
      createdByUserId: "system:kenya-default-policy-pack",
    })),
  ).onConflictDoNothing();
}
const approverRoles = [
  PEOPLEOS_ROLES.hrAdmin,
  PEOPLEOS_ROLES.hrManager,
  PEOPLEOS_ROLES.systemAdmin,
];
const recommenderRoles = [
  ...approverRoles,
  PEOPLEOS_ROLES.departmentManager,
];
const adminRoles: readonly string[] = [
  PEOPLEOS_ROLES.hrAdmin,
  PEOPLEOS_ROLES.hrManager,
  PEOPLEOS_ROLES.systemAdmin,
];

export interface DemoLeaveItem {
  id: string;
  employeeId: string;
  employeeName: string;
  leaveType: string;
  startDate: Date;
  endDate: Date;
  days: number;
  reason: string;
  status: "pending" | "approved" | "rejected" | "cancelled";
  approverId: string | null;
  decisionComment: string | null;
  submittedAt: Date;
  decidedAt: Date | null;
  isDemo: boolean;
  recommendationStatus?: "not_assessed" | "recommended" | "not_recommended";
  recommendationComment?: string | null;
  halfDay?: boolean;
  createdByUserId?: string | null;
  recommendationByUserId?: string | null;
  recommendationAt?: Date | null;
}

function demoDateOffset(offsetDays: number, hour = 9): Date {
  const value = new Date();
  value.setUTCHours(hour, 0, 0, 0);
  value.setUTCDate(value.getUTCDate() + offsetDays);
  return value;
}

export const DEMO_LEAVE_STORE: DemoLeaveItem[] = [
  {
    id: "leave-001",
    employeeId: "10000000-0000-4000-8000-000000000004",
    employeeName: "Wanjiku Kimani",
    leaveType: "annual",
    startDate: demoDateOffset(-60),
    endDate: demoDateOffset(-49),
    days: 10,
    reason: "Annual rest and family leave",
    status: "approved",
    approverId: "10000000-0000-4000-8000-000000000007",
    decisionComment: "Approved. Fleet coverage confirmed.",
    submittedAt: demoDateOffset(-75, 8),
    decidedAt: demoDateOffset(-74, 10),
    isDemo: true,
  },
  {
    id: "leave-002",
    employeeId: "10000000-0000-4000-8000-000000000006",
    employeeName: "Brian Kiprotich",
    leaveType: "annual",
    startDate: demoDateOffset(14),
    endDate: demoDateOffset(21),
    days: 6,
    reason: "Professional certification exam study period",
    status: "pending",
    approverId: null,
    decisionComment: null,
    submittedAt: demoDateOffset(-3, 11),
    decidedAt: null,
    isDemo: true,
  },
  {
    id: "leave-003",
    employeeId: "10000000-0000-4000-8000-000000000002",
    employeeName: "Mwangi Kariuki",
    leaveType: "paternity",
    startDate: demoDateOffset(30),
    endDate: demoDateOffset(43),
    days: 10,
    reason: "Paternity leave: statutory entitlement is 2 weeks (14 calendar days); work-schedule conversion is subject to legal review.",
    status: "pending",
    approverId: null,
    decisionComment: null,
    submittedAt: demoDateOffset(-2, 9),
    decidedAt: null,
    isDemo: true,
  },
];

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

function businessDaysForYear(start: string, end: string, year: number): number {
  const yearStart = `${year}-01-01`;
  const yearEnd = `${year}-12-31`;
  const clippedStart = start < yearStart ? yearStart : start;
  const clippedEnd = end > yearEnd ? yearEnd : end;
  return clippedStart > clippedEnd
    ? 0
    : businessDaysBetween(clippedStart, clippedEnd);
}

function businessDaysByYear(start: string, end: string): Map<number, number> {
  const days = new Map<number, number>();
  const firstYear = Number(start.slice(0, 4));
  const lastYear = Number(end.slice(0, 4));
  for (let year = firstYear; year <= lastYear; year += 1) {
    days.set(year, businessDaysForYear(start, end, year));
  }
  return days;
}

function addMonthsClamped(date: Date, months: number): Date {
  const targetMonth = date.getUTCMonth() + months;
  const result = new Date(Date.UTC(date.getUTCFullYear(), targetMonth, 1));
  const lastDay = new Date(Date.UTC(result.getUTCFullYear(), result.getUTCMonth() + 1, 0)).getUTCDate();
  result.setUTCDate(Math.min(date.getUTCDate(), lastDay));
  return result;
}

function completedServiceMonths(startDate: string, asOf: Date): number {
  const start = new Date(`${startDate}T00:00:00.000Z`);
  if (start.getTime() > asOf.getTime()) return 0;
  let months =
    (asOf.getUTCFullYear() - start.getUTCFullYear()) * 12 +
    asOf.getUTCMonth() - start.getUTCMonth();
  if (addMonthsClamped(start, months).getTime() > asOf.getTime()) months -= 1;
  return Math.max(0, months);
}

function accruedDaysForYear(
  policy: { code?: string; entitlementDays: number; accrualMethod: string },
  year: number,
  asOf: Date,
  employeeStartDate = `${year}-01-01`,
): number {
  const hireDate = new Date(`${employeeStartDate}T00:00:00.000Z`);
  const yearStart = new Date(Date.UTC(year, 0, 1));
  const endOfYear = new Date(Date.UTC(year, 11, 31, 23, 59, 59, 999));
  const effectiveAsOf = asOf.getUTCFullYear() > year ? endOfYear : asOf;
  if (effectiveAsOf.getUTCFullYear() < year || hireDate > effectiveAsOf) return 0;

  const code = (policy.code ?? "").toLowerCase();
  if (["maternity", "paternity", "pre-adoptive"].includes(code)) return 0;

  const serviceMonths = completedServiceMonths(employeeStartDate, effectiveAsOf);
  if (code === "sick" && serviceMonths < 2) return 0;

  if (policy.accrualMethod === "monthly") {
    let earnedMonths = 0;
    for (let month = 1; month <= serviceMonths; month += 1) {
      const anniversary = addMonthsClamped(hireDate, month);
      if (anniversary >= yearStart && anniversary <= effectiveAsOf) earnedMonths += 1;
    }
    return Math.round((earnedMonths * policy.entitlementDays / 12) * 100) / 100;
  }

  // Annual policies post their grant at the first eligible anniversary or
  // leave-year boundary. The grant is represented once per employee/policy/year.
  if (code === "sick") return policy.entitlementDays;
  const anniversary = addMonthsClamped(hireDate, 12);
  return anniversary <= effectiveAsOf && (
    anniversary.getUTCFullYear() === year ||
    (hireDate < yearStart && effectiveAsOf >= yearStart)
  ) ? policy.entitlementDays : 0;
}

async function ensureAccrualLedgerEntries(
  employee: { id: string; startDate: string; isDemo?: boolean },
  policy: typeof leavePoliciesTable.$inferSelect,
  asOf: Date,
): Promise<void> {
  const code = policy.code.toLowerCase();
  if (["maternity", "paternity", "pre-adoptive"].includes(code)) return;
  const serviceMonths = completedServiceMonths(employee.startDate, asOf);
  if (code === "sick" && serviceMonths < 2) return;

  if (policy.accrualMethod === "monthly") {
    for (let month = 1; month <= serviceMonths; month += 1) {
      const anniversary = addMonthsClamped(
        new Date(`${employee.startDate}T00:00:00.000Z`),
        month,
      );
      if (anniversary > asOf) continue;
      const quantityDays = Math.round((policy.entitlementDays / 12) * 100) / 100;
      const sourceKey = `accrual:${employee.id}:${policy.code}:${anniversary.toISOString().slice(0, 10)}`;
      await db.insert(leaveLedgerTable).values({
        organizationId: policy.organizationId,
        employeeId: employee.id,
        leaveType: policy.code,
        leaveYear: anniversary.getUTCFullYear(),
        entryType: "accrual",
        quantityDays,
        sourceKey,
        description: `Monthly leave accrual for completed service month ending ${anniversary.toISOString().slice(0, 10)}`,
        createdByUserId: "system:leave-accrual",
        occurredAt: anniversary,
        isDemo: employee.isDemo ?? false,
      }).onConflictDoNothing();
    }
    return;
  }

  const firstEligibleDate = code === "sick"
    ? addMonthsClamped(new Date(`${employee.startDate}T00:00:00.000Z`), 2)
    : addMonthsClamped(new Date(`${employee.startDate}T00:00:00.000Z`), 12);
  const eligibleDate = firstEligibleDate.getTime() > Date.UTC(asOf.getUTCFullYear(), 0, 1)
    ? firstEligibleDate
    : new Date(Date.UTC(asOf.getUTCFullYear(), 0, 1));
  if (eligibleDate > asOf) return;
  const grantYear = eligibleDate.getUTCFullYear();
  const sourceKey = `annual-grant:${employee.id}:${policy.code}:${grantYear}`;
  await db.insert(leaveLedgerTable).values({
    organizationId: policy.organizationId,
    employeeId: employee.id,
    leaveType: policy.code,
    leaveYear: grantYear,
    entryType: "accrual",
    quantityDays: policy.entitlementDays,
    sourceKey,
    description: `Annual leave entitlement grant for ${grantYear}`,
    createdByUserId: "system:leave-accrual",
    occurredAt: eligibleDate,
    isDemo: employee.isDemo ?? false,
  }).onConflictDoNothing();
}

function dateOnly(value: Date | string): string {
  return value instanceof Date ? value.toISOString().slice(0, 10) : value.slice(0, 10);
}

async function serializeRequests(
  organizationId: string,
  requests: (typeof leaveRequestsTable.$inferSelect)[],
) {
  if (!requests.length) return [];
  const employeeIds = [...new Set(requests.map((request) => request.employeeId))];
  const leaveTypes = [...new Set(requests.map((request) => request.leaveType))];
  const [employees, policies] = await Promise.all([
    db
      .select({
        id: employeesTable.id,
        firstName: employeesTable.firstName,
        lastName: employeesTable.lastName,
      })
      .from(employeesTable)
      .where(
        and(
          eq(employeesTable.organizationId, organizationId),
          inArray(employeesTable.id, employeeIds),
        ),
      ),
    db
      .select({ code: leavePoliciesTable.code, name: leavePoliciesTable.name })
      .from(leavePoliciesTable)
      .where(
        and(
          eq(leavePoliciesTable.organizationId, organizationId),
          inArray(leavePoliciesTable.code, leaveTypes),
        ),
      ),
  ]);
  const employeeNames = new Map(
    employees.map((employee) => [
      employee.id,
      `${employee.firstName} ${employee.lastName}`,
    ]),
  );
  const leaveTypeNames = new Map(
    policies.map((policy) => [policy.code, policy.name]),
  );
  return requests.map((request) => ({
    id: request.id,
    employeeId: request.employeeId,
    employeeName: employeeNames.get(request.employeeId) ?? "Employee",
    leaveType: leaveTypeNames.get(request.leaveType) ?? request.leaveType,
    startDate: request.startDate,
    endDate: request.endDate,
    days: request.days,
    reason: request.reason,
    status: request.status,
    approverId: request.approverUserId,
    decisionComment: request.decisionComment,
    submittedAt: request.submittedAt.toISOString(),
    decidedAt: request.decidedAt?.toISOString() ?? null,
    isDemo: request.isDemo,
    recommendationStatus: (request.recommendationStatus ?? "not_assessed") as "not_assessed" | "recommended" | "not_recommended",
    recommendationComment: request.recommendationComment,
    halfDay: request.halfDay ?? false,
  }));
}

async function canManageRequest(
  organizationId: string,
  managerEmployeeId: string,
  role: string,
  employeeId: string,
): Promise<boolean> {
  if (adminRoles.includes(role)) return true;
  if (role !== PEOPLEOS_ROLES.departmentManager) return false;
  const [employee] = await db
    .select({ managerId: employeesTable.managerId })
    .from(employeesTable)
    .where(
      and(
        eq(employeesTable.id, employeeId),
        eq(employeesTable.organizationId, organizationId),
      ),
    )
    .limit(1);
  return Boolean(employee && employee.managerId === managerEmployeeId);
}

router.get("/leave-requests", async (req, res): Promise<void> => {
  const query = ListLeaveRequestsQueryParams.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: query.error.message });
    return;
  }
  const membership = await ensureMembership(req, res);
  if (!membership) return;
  if (
    membership.role === PEOPLEOS_ROLES.employee &&
    query.data.employeeId &&
    query.data.employeeId !== membership.employeeId
  ) {
    res.status(403).json({ error: "You cannot view leave requests for this employee." });
    return;
  }
  if (!process.env.DATABASE_URL) {
    let items = [...DEMO_LEAVE_STORE];
    if (membership.role === PEOPLEOS_ROLES.employee && membership.employeeId) {
      items = items.filter((r) => r.employeeId === membership.employeeId);
    }
    if (query.data.status) {
      items = items.filter((r) => r.status === query.data.status);
    }
    if (query.data.employeeId) {
      items = items.filter((r) => r.employeeId === query.data.employeeId);
    }
    res.json(ListLeaveRequestsResponse.parse(items));
    return;
  }
  const conditions = [
    eq(leaveRequestsTable.organizationId, membership.organizationId),
  ];
  if (query.data.status) {
    conditions.push(eq(leaveRequestsTable.status, query.data.status));
  }
  if (query.data.employeeId) {
    conditions.push(eq(leaveRequestsTable.employeeId, query.data.employeeId));
  }
  if (membership.role === PEOPLEOS_ROLES.employee) {
    if (!membership.employeeId) {
      res.json(ListLeaveRequestsResponse.parse([]));
      return;
    }
    conditions.push(eq(leaveRequestsTable.employeeId, membership.employeeId));
  } else if (membership.role === PEOPLEOS_ROLES.departmentManager) {
    if (!membership.employeeId) {
      res.json(ListLeaveRequestsResponse.parse([]));
      return;
    }
    const reports = await db
      .select({ id: employeesTable.id })
      .from(employeesTable)
      .where(
        and(
          eq(employeesTable.organizationId, membership.organizationId),
          eq(employeesTable.managerId, membership.employeeId),
        ),
      );
    if (!reports.length) {
      res.json(ListLeaveRequestsResponse.parse([]));
      return;
    }
    conditions.push(
      inArray(
        leaveRequestsTable.employeeId,
        reports.map((employee) => employee.id),
      ),
    );
  }
  const requests = await db
    .select()
    .from(leaveRequestsTable)
    .where(and(...conditions))
    .orderBy(leaveRequestsTable.submittedAt);
  res.json(
    ListLeaveRequestsResponse.parse(
      await serializeRequests(membership.organizationId, requests),
    ),
  );
});

router.get("/leave-policies", async (req, res): Promise<void> => {
  const membership = await ensureMembership(req, res);
  if (!membership) return;
  await ensureKenyaDefaultPolicies(membership.organizationId);
  if (!process.env.DATABASE_URL) {
    let items = DEMO_LEAVE_POLICIES.filter(
      (p) => p.organizationId === membership.organizationId,
    );
    if (!adminRoles.includes(membership.role)) {
      items = items.filter((p) => p.active);
    }
    res.json(
      ListLeavePoliciesResponse.parse(
        items
          .sort((a, b) => a.name.localeCompare(b.name))
          .map((policy) => ({
            id: policy.id,
            code: policy.code,
            name: policy.name,
            entitlementDays: policy.entitlementDays,
            entitlementQuantity: policy.entitlementQuantity ?? policy.entitlementDays,
            entitlementUnit: policy.entitlementUnit ?? "days",
            needsLegalReview: policy.needsLegalReview ?? true,
            accrualMethod: policy.accrualMethod,
            active: policy.active,
          })),
      ),
    );
    return;
  }
  const conditions = [
    eq(leavePoliciesTable.organizationId, membership.organizationId),
  ];
  if (!adminRoles.includes(membership.role)) {
    conditions.push(eq(leavePoliciesTable.active, true));
  }
  const policies = await db
    .select()
    .from(leavePoliciesTable)
    .where(and(...conditions))
    .orderBy(leavePoliciesTable.name);
  res.json(
    ListLeavePoliciesResponse.parse(
      policies.map((policy) => ({
        id: policy.id,
        code: policy.code,
        name: policy.name,
        entitlementDays: policy.entitlementDays,
        entitlementQuantity: policy.entitlementQuantity,
        entitlementUnit: policy.entitlementUnit,
        needsLegalReview: policy.needsLegalReview,
        accrualMethod: policy.accrualMethod,
        active: policy.active,
      })),
    ),
  );
});

router.post("/leave-policies", async (req, res): Promise<void> => {
  const membership = await requireRoles(req, res, adminRoles);
  if (!membership) return;
  const body = CreateLeavePolicyBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }
  const name = body.data.name.trim();
  const entitlementUnit = body.data.entitlementUnit ?? "days";
  const entitlementQuantity = body.data.entitlementQuantity ?? body.data.entitlementDays;
  const entitlementDays = entitlementToCalendarDays(entitlementQuantity, entitlementUnit);
  const floor = validateKenyaStatutoryFloor({
    name,
    entitlementQuantity,
    entitlementUnit,
    entitlementDays,
  });
  if (!floor.valid) {
    res.status(422).json({
      error: floor.message,
      code: floor.code,
      sourceUrl: floor.sourceUrl,
    });
    return;
  }
  const code = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 64)
    .replace(/-$/g, "");
  if (!code) {
    res.status(400).json({ error: "Enter a leave type name with letters or numbers." });
    return;
  }
  const organization = await getPeopleOsOrganization(membership.organizationId);
  if (!organization) {
    res.status(503).json({ error: "PeopleOS organization is not initialized." });
    return;
  }
  if (!process.env.DATABASE_URL) {
    const existing = DEMO_LEAVE_POLICIES.find(
      (p) => p.organizationId === membership.organizationId && p.code === code,
    );
    if (existing) {
      res.status(409).json({ error: "A leave type with this name already exists." });
      return;
    }
    const created: DemoLeavePolicyItem = {
      id: crypto.randomUUID(),
      organizationId: membership.organizationId,
      code,
      name,
      entitlementDays,
      entitlementQuantity,
      entitlementUnit,
      needsLegalReview: true,
      sourceUrl: floor.sourceUrl,
      accrualMethod: body.data.accrualMethod,
      active: true,
    };
    DEMO_LEAVE_POLICIES.push(created);
    await recordAuditEvent({
      organizationId: membership.organizationId,
      actorUserId: membership.userId,
      actor: membership.role,
      action: "leave_policy_created",
      targetType: "leave_policy",
      targetId: created.id,
      summary: `The ${name} leave policy was created.`,
      isDemo: organization.isDemo,
    });
    res.status(201).json(
      CreateLeavePolicyResponse.parse({
        id: created.id,
        code: created.code,
        name: created.name,
        entitlementDays: created.entitlementDays,
        entitlementQuantity: created.entitlementQuantity,
        entitlementUnit: created.entitlementUnit,
        needsLegalReview: created.needsLegalReview,
        accrualMethod: created.accrualMethod,
        active: created.active,
      }),
    );
    return;
  }
  const [existing] = await db
    .select({ id: leavePoliciesTable.id })
    .from(leavePoliciesTable)
    .where(
      and(
        eq(leavePoliciesTable.organizationId, membership.organizationId),
        eq(leavePoliciesTable.code, code),
      ),
    )
    .limit(1);
  if (existing) {
    res.status(409).json({ error: "A leave type with this name already exists." });
    return;
  }
  const policy = await db.transaction(async (tx) => {
    const [created] = await tx
      .insert(leavePoliciesTable)
      .values({
        organizationId: membership.organizationId,
        code,
        name,
        entitlementDays,
        entitlementQuantity,
        entitlementUnit,
        jurisdiction: "KE",
        effectiveFrom: new Date().toISOString().slice(0, 10),
        sourceUrl: floor.sourceUrl,
        needsLegalReview: true,
        accrualMethod: body.data.accrualMethod,
        active: true,
        createdByUserId: membership.userId,
      })
      .returning();
    if (!created) return null;
    await tx.insert(auditEventsTable).values({
      organizationId: membership.organizationId,
      actorUserId: membership.userId,
      actor: membership.role,
      action: "leave_policy_created",
      targetType: "leave_policy",
      targetId: created.id,
      summary: `The ${name} leave policy was created.`,
      isDemo: organization.isDemo,
    });
    return created;
  });
  if (!policy) {
    res.status(500).json({ error: "Leave policy could not be created." });
    return;
  }
  res.status(201).json(
    CreateLeavePolicyResponse.parse({
      id: policy.id,
      code: policy.code,
      name: policy.name,
      entitlementDays: policy.entitlementDays,
      entitlementQuantity: policy.entitlementQuantity,
      entitlementUnit: policy.entitlementUnit,
      needsLegalReview: policy.needsLegalReview,
      accrualMethod: policy.accrualMethod,
      active: policy.active,
    }),
  );
});

router.patch(
  "/leave-policies/:policyId",
  async (req, res): Promise<void> => {
    const params = UpdateLeavePolicyParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const body = UpdateLeavePolicyBody.safeParse(req.body);
    if (!body.success) {
      res.status(400).json({ error: body.error.message });
      return;
    }
    const membership = await requireRoles(req, res, adminRoles);
    if (!membership) return;
    const name = body.data.name.trim();
    if (!name) {
      res.status(400).json({ error: "Leave type name cannot be blank." });
      return;
    }
    const entitlementUnit = body.data.entitlementUnit ?? "days";
    const entitlementQuantity = body.data.entitlementQuantity ?? body.data.entitlementDays;
    const entitlementDays = entitlementToCalendarDays(entitlementQuantity, entitlementUnit);
    const floor = validateKenyaStatutoryFloor({
      name,
      entitlementQuantity,
      entitlementUnit,
      entitlementDays,
    });
    if (!floor.valid) {
      res.status(422).json({
        error: floor.message,
        code: floor.code,
        sourceUrl: floor.sourceUrl,
      });
      return;
    }
    const organization = await getPeopleOsOrganization(membership.organizationId);
    if (!organization) {
      res.status(503).json({ error: "PeopleOS organization is not initialized." });
      return;
    }
    if (!process.env.DATABASE_URL) {
      const target = DEMO_LEAVE_POLICIES.find(
        (p) =>
          p.id === params.data.policyId &&
          p.organizationId === membership.organizationId,
      );
      if (!target) {
        res.status(404).json({ error: "Leave policy not found." });
        return;
      }
      target.name = name;
      target.entitlementDays = entitlementDays;
      target.entitlementQuantity = entitlementQuantity;
      target.entitlementUnit = entitlementUnit;
      target.needsLegalReview = true;
      target.sourceUrl = floor.sourceUrl;
      target.accrualMethod = body.data.accrualMethod;
      target.active = body.data.active;
      await recordAuditEvent({
        organizationId: membership.organizationId,
        actorUserId: membership.userId,
        actor: membership.role,
        action: "leave_policy_updated",
        targetType: "leave_policy",
        targetId: target.id,
        summary: `The ${target.name} leave policy was updated.`,
        isDemo: organization.isDemo,
      });
      res.json(
        UpdateLeavePolicyResponse.parse({
          id: target.id,
          code: target.code,
          name: target.name,
          entitlementDays: target.entitlementDays,
          entitlementQuantity: target.entitlementQuantity,
          entitlementUnit: target.entitlementUnit,
          needsLegalReview: target.needsLegalReview,
          accrualMethod: target.accrualMethod,
          active: target.active,
        }),
      );
      return;
    }
    const updated = await db.transaction(async (tx) => {
      const [policy] = await tx
        .update(leavePoliciesTable)
        .set({
          name,
          entitlementDays,
          entitlementQuantity,
          entitlementUnit,
          sourceUrl: floor.sourceUrl,
          needsLegalReview: true,
          active: body.data.active,
        })
        .where(
          and(
            eq(leavePoliciesTable.id, params.data.policyId),
            eq(leavePoliciesTable.organizationId, membership.organizationId),
          ),
        )
        .returning();
      if (!policy) return null;
      await tx.insert(auditEventsTable).values({
        organizationId: membership.organizationId,
        actorUserId: membership.userId,
        actor: membership.role,
        action: "leave_policy_updated",
        targetType: "leave_policy",
        targetId: policy.id,
        summary: `The ${policy.name} leave policy was updated.`,
        isDemo: organization.isDemo,
      });
      return policy;
    });
    if (!updated) {
      res.status(404).json({ error: "Leave policy not found." });
      return;
    }
    res.json(
      UpdateLeavePolicyResponse.parse({
        id: updated.id,
        code: updated.code,
        name: updated.name,
        entitlementDays: updated.entitlementDays,
        entitlementQuantity: updated.entitlementQuantity,
        entitlementUnit: updated.entitlementUnit,
        needsLegalReview: updated.needsLegalReview,
        accrualMethod: updated.accrualMethod,
        active: updated.active,
      }),
    );
  },
);

router.get("/leave-balances", async (req, res): Promise<void> => {
  const query = ListLeaveBalancesQueryParams.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: query.error.message });
    return;
  }
  const membership = await ensureMembership(req, res);
  if (!membership) return;
  const isOrganizationAdmin = adminRoles.includes(membership.role);
  const year = query.data.year ?? new Date().getUTCFullYear();
  await ensureKenyaDefaultPolicies(membership.organizationId);

  if (!process.env.DATABASE_URL) {
    let permittedDemoEmployees = isOrganizationAdmin
      ? DEMO_EMPLOYEES_LIST
      : membership.role === PEOPLEOS_ROLES.departmentManager && membership.employeeId
        ? DEMO_EMPLOYEES_LIST.filter(
            (e) =>
              e.id === membership.employeeId ||
              e.managerId === membership.employeeId,
          )
        : membership.employeeId
          ? DEMO_EMPLOYEES_LIST.filter((e) => e.id === membership.employeeId)
          : [];

    if (query.data.employeeId) {
      if (!permittedDemoEmployees.some((e) => e.id === query.data.employeeId)) {
        res
          .status(403)
          .json({ error: "You cannot view leave balances for this employee." });
        return;
      }
      permittedDemoEmployees = permittedDemoEmployees.filter(
        (e) => e.id === query.data.employeeId,
      );
    }

    const policies = DEMO_LEAVE_POLICIES.filter(
      (p) => p.organizationId === membership.organizationId,
    ).sort((a, b) => a.name.localeCompare(b.name));

    const balances = permittedDemoEmployees.flatMap((employee) =>
      policies.map((policy) => {
        const relevantRequests = DEMO_LEAVE_STORE.filter(
          (request) =>
            request.employeeId === employee.id &&
            request.leaveType === policy.code &&
            (request.status === "approved" || request.status === "pending"),
        );
        const usedDays = relevantRequests
          .filter((request) => request.status === "approved")
          .reduce(
            (total, request) =>
              total +
              businessDaysForYear(
                dateOnly(request.startDate),
                dateOnly(request.endDate),
                year,
              ),
            0,
          );
        const pendingDays = relevantRequests
          .filter((request) => request.status === "pending")
          .reduce(
            (total, request) =>
              total +
              businessDaysForYear(
                dateOnly(request.startDate),
                dateOnly(request.endDate),
                year,
              ),
            0,
          );
        const accruedDays = accruedDaysForYear(policy, year, new Date(), employee.startDate);
        return {
          employeeId: employee.id,
          employeeName: `${employee.firstName} ${employee.lastName}`,
          leaveType: policy.code,
          leaveTypeName: policy.name,
          year,
          entitlementDays: policy.entitlementDays,
          accruedDays,
          usedDays,
          pendingDays,
          remainingDays: accruedDays - usedDays - pendingDays,
          accrualMethod: policy.accrualMethod,
          active: policy.active,
        };
      }),
    );
    res.json(ListLeaveBalancesResponse.parse(balances));
    return;
  }

  let permittedEmployees: {
    id: string;
    firstName: string;
    lastName: string;
    startDate: string;
    isDemo: boolean;
  }[] = [];

  if (isOrganizationAdmin) {
    const conditions = [
      eq(employeesTable.organizationId, membership.organizationId),
    ];
    if (query.data.employeeId) {
      conditions.push(eq(employeesTable.id, query.data.employeeId));
    }
    permittedEmployees = await db
      .select({
        id: employeesTable.id,
        firstName: employeesTable.firstName,
        lastName: employeesTable.lastName,
        startDate: employeesTable.startDate,
        isDemo: employeesTable.isDemo,
      })
      .from(employeesTable)
      .where(and(...conditions));
  } else if (membership.role === PEOPLEOS_ROLES.departmentManager) {
    const conditions = [
      eq(employeesTable.organizationId, membership.organizationId),
    ];
    if (membership.employeeId) {
      conditions.push(
        inArray(employeesTable.id, [
          membership.employeeId,
          ...(
            await db
              .select({ id: employeesTable.id })
              .from(employeesTable)
              .where(
                and(
                  eq(employeesTable.organizationId, membership.organizationId),
                  eq(employeesTable.managerId, membership.employeeId),
                ),
              )
          ).map((employee) => employee.id),
        ]),
      );
    } else {
      res.json(ListLeaveBalancesResponse.parse([]));
      return;
    }
    permittedEmployees = await db
      .select({
        id: employeesTable.id,
        firstName: employeesTable.firstName,
        lastName: employeesTable.lastName,
        startDate: employeesTable.startDate,
        isDemo: employeesTable.isDemo,
      })
      .from(employeesTable)
      .where(and(...conditions));
  } else if (membership.employeeId) {
    permittedEmployees = await db
      .select({
        id: employeesTable.id,
        firstName: employeesTable.firstName,
        lastName: employeesTable.lastName,
        startDate: employeesTable.startDate,
        isDemo: employeesTable.isDemo,
      })
      .from(employeesTable)
      .where(
        and(
          eq(employeesTable.organizationId, membership.organizationId),
          eq(employeesTable.id, membership.employeeId),
        ),
      );
  }

  if (
    query.data.employeeId &&
    !permittedEmployees.some((employee) => employee.id === query.data.employeeId)
  ) {
    res.status(403).json({ error: "You cannot view leave balances for this employee." });
    return;
  }
  if (!permittedEmployees.length) {
    res.json(ListLeaveBalancesResponse.parse([]));
    return;
  }

  const employeeIds = permittedEmployees.map((employee) => employee.id);
  const yearStart = `${year}-01-01`;
  const yearEnd = `${year}-12-31`;
  const [policies, requests] = await Promise.all([
    db
      .select()
      .from(leavePoliciesTable)
      .where(eq(leavePoliciesTable.organizationId, membership.organizationId))
      .orderBy(leavePoliciesTable.name),
    db
      .select()
      .from(leaveRequestsTable)
      .where(
        and(
          eq(leaveRequestsTable.organizationId, membership.organizationId),
          inArray(leaveRequestsTable.employeeId, employeeIds),
          inArray(leaveRequestsTable.status, ["pending", "approved"]),
          lte(leaveRequestsTable.startDate, yearEnd),
          gte(leaveRequestsTable.endDate, yearStart),
        ),
      ),
  ]);

  // Materialize accrual entries once using unique source keys. The ledger,
  // not a mutable balance field or a request-table sum, is authoritative.
  await Promise.all(
    permittedEmployees.flatMap((employee) =>
      policies.map((policy) =>
        ensureAccrualLedgerEntries(employee, policy, new Date()),
      ),
    ),
  );

  const ledgerEntries = await db
    .select()
    .from(leaveLedgerTable)
    .where(
      and(
        eq(leaveLedgerTable.organizationId, membership.organizationId),
        inArray(leaveLedgerTable.employeeId, employeeIds),
        eq(leaveLedgerTable.leaveYear, year),
      ),
    );

  const employeesById = new Map(
    permittedEmployees.map((employee) => [
      employee.id,
      `${employee.firstName} ${employee.lastName}`,
    ]),
  );
  const balances = permittedEmployees.flatMap((employee) =>
    policies.map((policy) => {
      const relevantRequests = requests.filter(
        (request) =>
          request.employeeId === employee.id &&
          request.leaveType === policy.code &&
          request.status === "pending",
      );
      const pendingDays = relevantRequests.reduce(
        (total, request) =>
          total +
          businessDaysForYear(request.startDate, request.endDate, year) -
          (request.halfDay ? 0.5 : 0),
        0,
      );
      const relevantLedger = ledgerEntries.filter(
        (entry) =>
          entry.employeeId === employee.id &&
          entry.leaveType === policy.code,
      );
      const accrualEntries = relevantLedger.filter(
        (entry) => entry.entryType !== "deduction" && entry.entryType !== "reversal",
      );
      const usageEntries = relevantLedger.filter(
        (entry) => entry.entryType === "deduction" || entry.entryType === "reversal",
      );
      const accruedDays = sumLeaveLedgerDays(accrualEntries);
      const usedDays = Math.max(0, -sumLeaveLedgerDays(usageEntries));
      const ledgerBalance = sumLeaveLedgerDays(relevantLedger);
      return {
        employeeId: employee.id,
        employeeName: employeesById.get(employee.id) ?? "Employee",
        leaveType: policy.code,
        leaveTypeName: policy.name,
        year,
        entitlementDays: policy.entitlementDays,
        accruedDays,
        usedDays,
        pendingDays,
        remainingDays: Math.round((ledgerBalance - pendingDays) * 100) / 100,
        accrualMethod: policy.accrualMethod,
        active: policy.active,
      };
    }),
  );
  res.json(ListLeaveBalancesResponse.parse(balances));
});

router.post("/leave-requests", async (req, res): Promise<void> => {
  const body = CreateLeaveRequestBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }
  const membership = await ensureMembership(req, res);
  if (!membership) return;
  const organization = await getPeopleOsOrganization(membership.organizationId);
  if (!organization) {
    res.status(503).json({ error: "PeopleOS organization is not initialized." });
    return;
  }
  const input = body.data;
  const startDate = dateOnly(input.startDate);
  const endDate = dateOnly(input.endDate);
  if (startDate < new Date().toISOString().slice(0, 10)) {
    res.status(400).json({ error: "Leave requests cannot start in the past." });
    return;
  }
  if (endDate < startDate) {
    res.status(400).json({ error: "End date must be on or after the start date." });
    return;
  }
  const effectiveCalendar = await resolveEffectiveWorkCalendar(
    membership.organizationId,
  );
  const calendarDaysResult = countCalendarWorkingDays(
    startDate,
    endDate,
    effectiveCalendar,
  );
  if (input.halfDay && startDate !== endDate) {
    res.status(400).json({ error: "Half-day leave must be requested for one working date only." });
    return;
  }
  const days = Math.round(
    (calendarDaysResult.workingDays - (input.halfDay ? 0.5 : 0)) * 100,
  ) / 100;
  if (calendarDaysResult.workingDays < 1 || days <= 0) {
    res.status(400).json({
      error:
        "Choose at least one working day (excluding configured rest days and public holidays).",
    });
    return;
  }
  if (!process.env.DATABASE_URL) {
    const demoEmp = DEMO_EMPLOYEES_LIST.find((e) => e.id === input.employeeId);
    if (!demoEmp) {
      res.status(404).json({ error: "Employee not found in this organization." });
      return;
    }
    const policy = DEMO_LEAVE_POLICIES.find(
      (p) =>
        p.organizationId === membership.organizationId &&
        p.code === input.leaveType &&
        p.active,
    );
    if (!policy) {
      res.status(400).json({
        error: "Choose an active leave type configured by your organization.",
      });
      return;
    }
    if (policy.code === "sick" && completedServiceMonths(demoEmp.startDate, new Date()) < 2) {
      res.status(422).json({
        error: "Sick leave under Employment Act, 2007 section 30 is available after two consecutive months of service.",
        code: "SICK_LEAVE_MINIMUM_SERVICE_NOT_MET",
        sourceUrl: KENYA_EMPLOYMENT_ACT_SOURCE,
      });
      return;
    }
    const overlap = DEMO_LEAVE_STORE.some(
      (r) =>
        r.employeeId === demoEmp.id &&
        (r.status === "pending" || r.status === "approved") &&
        dateOnly(r.startDate) <= endDate &&
        dateOnly(r.endDate) >= startDate,
    );
    if (overlap) {
      res.status(409).json({
        error: "This request overlaps an existing pending or approved leave request.",
      });
      return;
    }
    const existingRequests = DEMO_LEAVE_STORE.filter(
      (r) =>
        r.employeeId === demoEmp.id &&
        r.leaveType === policy.code &&
        (r.status === "pending" || r.status === "approved"),
    );
    const requestYearDays = businessDaysByYear(startDate, endDate);
    for (const [year, requestDaysForYear] of requestYearDays) {
      const leaveYearStart = `${year}-01-01`;
      const now = new Date();
      const requestedStart = new Date(`${startDate}T00:00:00.000Z`);
      const asOf =
        startDate.slice(0, 4) === String(year)
          ? new Date(Math.max(requestedStart.getTime(), now.getTime()))
          : new Date(`${leaveYearStart}T00:00:00.000Z`);
      const eventBased = ["maternity", "paternity", "pre-adoptive"].includes(policy.code);
      const accrued = eventBased ? policy.entitlementDays : accruedDaysForYear(policy, year, asOf, demoEmp.startDate);
      const reservedDays = existingRequests.reduce(
        (total, request) =>
          total +
          Math.max(
            0,
            businessDaysForYear(
              dateOnly(request.startDate),
              dateOnly(request.endDate),
              year,
            ) - (request.halfDay && dateOnly(request.startDate).slice(0, 4) === String(year) ? 0.5 : 0),
          ),
        0,
      );
      if (reservedDays + requestDaysForYear > accrued || requestDaysForYear > policy.entitlementDays) {
        res.status(409).json({
          error: `This request exceeds the available ${policy.name} balance for ${year}. ${Math.round((accrued - reservedDays) * 100) / 100} day(s) are available.`,
        });
        return;
      }
    }
    const newReq: DemoLeaveItem = {
      id: `leave-${Date.now()}`,
      employeeId: demoEmp.id,
      employeeName: `${demoEmp.firstName} ${demoEmp.lastName}`,
      leaveType: policy.code,
      startDate: new Date(startDate),
      endDate: new Date(endDate),
      days,
      reason: input.reason,
      status: "pending",
      approverId: null,
      decisionComment: null,
      submittedAt: new Date(),
      decidedAt: null,
      isDemo: true,
      halfDay: input.halfDay ?? false,
      createdByUserId: membership.userId,
      recommendationStatus: "not_assessed",
      recommendationComment: null,
      recommendationByUserId: null,
      recommendationAt: null,
      recommendationStatus: "not_assessed",
      recommendationComment: null,
    };
    DEMO_LEAVE_STORE.unshift(newReq);
    await recordAuditEvent({
      organizationId: membership.organizationId,
      actorUserId: membership.userId,
      actor: membership.role,
      action: "leave_request_submitted",
      targetType: "leave_request",
      targetId: newReq.id,
      summary: `Leave request submitted for ${newReq.employeeName}.`,
      isDemo: true,
    });
    res.status(201).json(CreateLeaveRequestResponse.parse(newReq));
    return;
  }

  const [employee] = await db
    .select()
    .from(employeesTable)
    .where(
      and(
        eq(employeesTable.id, input.employeeId),
        eq(employeesTable.organizationId, organization.id),
      ),
    )
    .limit(1);
  if (!employee) {
    res.status(404).json({ error: "Employee not found in this organization." });
    return;
  }
  if (membership.role === PEOPLEOS_ROLES.employee) {
    if (membership.employeeId !== employee.id) {
      res.status(403).json({ error: "Employees may only request leave for themselves." });
      return;
    }
  } else if (
    membership.role === PEOPLEOS_ROLES.departmentManager &&
    membership.employeeId !== employee.managerId &&
    membership.employeeId !== employee.id
  ) {
    res.status(403).json({ error: "Managers may only request leave for themselves or their direct reports." });
    return;
  }
  if (
    organization.isDemo &&
    !employee.workEmail.toLowerCase().endsWith("@rekker-demo.invalid")
  ) {
    res.status(400).json({ error: "Leave requests in demo mode must use synthetic employee records." });
    return;
  }
  const [preflightPolicy] = await db
    .select()
    .from(leavePoliciesTable)
    .where(
      and(
        eq(leavePoliciesTable.organizationId, organization.id),
        eq(leavePoliciesTable.code, input.leaveType),
        eq(leavePoliciesTable.active, true),
      ),
    )
    .limit(1);
  if (!preflightPolicy) {
    res.status(400).json({ error: "Choose an active leave type configured by your organization." });
    return;
  }
  const completedMonths = completedServiceMonths(employee.startDate, new Date());
  if (preflightPolicy.code === "sick" && completedMonths < 2) {
    res.status(422).json({
      error: "Sick leave under Employment Act, 2007 section 30 is available after two consecutive months of service.",
      code: "SICK_LEAVE_MINIMUM_SERVICE_NOT_MET",
      sourceUrl: KENYA_EMPLOYMENT_ACT_SOURCE,
    });
    return;
  }
  await ensureAccrualLedgerEntries(employee, preflightPolicy, new Date());

  const requestResult = await db.transaction(async (tx) => {
    const [lockedEmployee] = await tx
      .select({ id: employeesTable.id })
      .from(employeesTable)
      .where(
        and(
          eq(employeesTable.id, employee.id),
          eq(employeesTable.organizationId, organization.id),
        ),
      )
      .for("update");
    if (!lockedEmployee) return { kind: "employee_missing" as const };

    const [policy] = await tx
      .select()
      .from(leavePoliciesTable)
      .where(
        and(
          eq(leavePoliciesTable.organizationId, organization.id),
          eq(leavePoliciesTable.code, input.leaveType),
          eq(leavePoliciesTable.active, true),
        ),
      )
      .limit(1);
    if (!policy) return { kind: "policy_unavailable" as const };

    const overlaps = await tx
      .select({ id: leaveRequestsTable.id })
      .from(leaveRequestsTable)
      .where(
        and(
          eq(leaveRequestsTable.organizationId, organization.id),
          eq(leaveRequestsTable.employeeId, employee.id),
          inArray(leaveRequestsTable.status, ["pending", "approved"]),
          lte(leaveRequestsTable.startDate, endDate),
          gte(leaveRequestsTable.endDate, startDate),
        ),
      )
      .limit(1);
    if (overlaps.length) return { kind: "overlap" as const };

    const existingRequests = await tx
      .select({
        startDate: leaveRequestsTable.startDate,
        endDate: leaveRequestsTable.endDate,
        halfDay: leaveRequestsTable.halfDay,
      })
      .from(leaveRequestsTable)
      .where(
        and(
          eq(leaveRequestsTable.organizationId, organization.id),
          eq(leaveRequestsTable.employeeId, employee.id),
          eq(leaveRequestsTable.leaveType, policy.code),
          eq(leaveRequestsTable.status, "pending"),
        ),
      );
    const requestYearDays = businessDaysByYear(startDate, endDate);
    for (const [year, requestDaysForYear] of requestYearDays) {
      const requestedDaysInYear =
        requestDaysForYear -
        (input.halfDay && startDate.slice(0, 4) === String(year) ? 0.5 : 0);
      const pendingReserved = existingRequests.reduce(
        (total, request) =>
          total +
          Math.max(
            0,
            businessDaysForYear(request.startDate, request.endDate, year) -
              (request.halfDay && request.startDate.slice(0, 4) === String(year) ? 0.5 : 0),
          ),
        0,
      );

      const eventBased = ["maternity", "paternity", "pre-adoptive"].includes(policy.code);
      let availableDays = 0;
      if (eventBased) {
        const usageEntries = await tx
          .select({ quantityDays: leaveLedgerTable.quantityDays })
          .from(leaveLedgerTable)
          .where(
            and(
              eq(leaveLedgerTable.organizationId, organization.id),
              eq(leaveLedgerTable.employeeId, employee.id),
              eq(leaveLedgerTable.leaveType, policy.code),
            ),
          );
        availableDays =
          policy.entitlementDays -
          Math.max(0, -sumLeaveLedgerDays(usageEntries));
      } else {
        const entries = await tx
          .select({ quantityDays: leaveLedgerTable.quantityDays })
          .from(leaveLedgerTable)
          .where(
            and(
              eq(leaveLedgerTable.organizationId, organization.id),
              eq(leaveLedgerTable.employeeId, employee.id),
              eq(leaveLedgerTable.leaveType, policy.code),
              eq(leaveLedgerTable.leaveYear, year),
            ),
          );
        availableDays = sumLeaveLedgerDays(entries);
      }

      const remainingDays = Math.round((availableDays - pendingReserved) * 100) / 100;
      if (pendingReserved + requestedDaysInYear > availableDays || requestedDaysInYear > policy.entitlementDays) {
        return {
          kind: "insufficient_balance" as const,
          year,
          remainingDays,
          leaveTypeName: policy.name,
        };
      }
    }

    const [created] = await tx
      .insert(leaveRequestsTable)
      .values({
        organizationId: organization.id,
        employeeId: employee.id,
        leaveType: policy.code,
        startDate,
        endDate,
        days,
        halfDay: input.halfDay ?? false,
        reason: input.reason,
        status: "pending",
        createdByUserId: membership.userId,
        isDemo: organization.isDemo,
      })
      .returning();
    if (!created) return { kind: "insert_failed" as const };
    await tx.insert(auditEventsTable).values({
      organizationId: organization.id,
      actorUserId: membership.userId,
      actor: membership.role,
      action: "leave_request_submitted",
      targetType: "leave_request",
      targetId: created.id,
      summary: "A leave request was submitted.",
      isDemo: organization.isDemo,
    });
    return { kind: "created" as const, request: created };
  });
  if (requestResult.kind === "policy_unavailable") {
    res.status(400).json({
      error: "Choose an active leave type configured by your organization.",
    });
    return;
  }
  if (requestResult.kind === "overlap") {
    res.status(409).json({
      error: "This request overlaps an existing pending or approved leave request.",
    });
    return;
  }
  if (requestResult.kind === "insufficient_balance") {
    res.status(409).json({
      error: `This request exceeds the available ${requestResult.leaveTypeName} balance for ${requestResult.year}. ${requestResult.remainingDays} day(s) are available.`,
    });
    return;
  }
  if (requestResult.kind !== "created") {
    if (requestResult.kind === "employee_missing") {
      res.status(404).json({ error: "Employee not found in this organization." });
      return;
    }
    res.status(500).json({ error: "Leave request could not be submitted." });
    return;
  }
  const [response] = await serializeRequests(organization.id, [
    requestResult.request,
  ]);
  res.status(201).json(CreateLeaveRequestResponse.parse(response));
});

router.get(
  "/leave-requests/:requestId/advisory",
  async (req, res): Promise<void> => {
    const params = DecideLeaveRequestParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const membership = await ensureMembership(req, res);
    if (!membership) return;

    if (!process.env.DATABASE_URL) {
      const request = DEMO_LEAVE_STORE.find((item) => item.id === params.data.requestId);
      if (!request || !DEMO_EMPLOYEES_LIST.some((employee) => employee.id === request.employeeId)) {
        res.status(404).json({ error: "Leave request not found." });
        return;
      }
      const policy = DEMO_LEAVE_POLICIES.find(
        (item) => item.organizationId === membership.organizationId && item.code === request.leaveType,
      );
      const employee = DEMO_EMPLOYEES_LIST.find((item) => item.id === request.employeeId);
      if (!policy || !employee) {
        res.status(404).json({ error: "Leave policy or employee record was not found." });
        return;
      }
      const statutory = validateKenyaStatutoryFloor({
        name: policy.name,
        code: policy.code,
        entitlementQuantity: policy.entitlementQuantity,
        entitlementUnit: policy.entitlementUnit,
        entitlementDays: policy.entitlementDays,
      });
      const annualAccrued = accruedDaysForYear(policy, new Date(request.startDate).getUTCFullYear(), new Date(), employee.startDate);
      const eventBased = ["maternity", "paternity", "pre-adoptive"].includes(policy.code);
      const matching = DEMO_LEAVE_STORE.filter(
        (item) => item.employeeId === request.employeeId && item.leaveType === request.leaveType,
      );
      const reserved = matching
        .filter((item) => item.id !== request.id && (item.status === "pending" || item.status === "approved"))
        .reduce((total, item) => total + item.days, 0);
      const availableDays = eventBased
        ? Math.max(0, policy.entitlementDays - reserved)
        : Math.max(0, annualAccrued - reserved);
      const advisory = recommendLeave({
        requestedDays: request.days,
        availableDays,
        eligible: policy.code !== "sick" || completedServiceMonths(employee.startDate, new Date()) >= 2,
        hasOverlap: DEMO_LEAVE_STORE.some(
          (item) =>
            item.id !== request.id &&
            item.employeeId === request.employeeId &&
            (item.status === "pending" || item.status === "approved") &&
            dateOnly(item.startDate) <= dateOnly(request.endDate) &&
            dateOnly(item.endDate) >= dateOnly(request.startDate),
        ),
        blackoutPeriod: false,
        statutoryPolicyCompliant: statutory.valid,
      });
      res.json(advisory);
      return;
    }

    const [request] = await db
      .select()
      .from(leaveRequestsTable)
      .where(
        and(
          eq(leaveRequestsTable.id, params.data.requestId),
          eq(leaveRequestsTable.organizationId, membership.organizationId),
        ),
      )
      .limit(1);
    if (!request) {
      res.status(404).json({ error: "Leave request not found." });
      return;
    }
    const [policy] = await db
      .select()
      .from(leavePoliciesTable)
      .where(
        and(
          eq(leavePoliciesTable.organizationId, membership.organizationId),
          eq(leavePoliciesTable.code, request.leaveType),
        ),
      )
      .limit(1);
    const [employee] = await db
      .select()
      .from(employeesTable)
      .where(
        and(
          eq(employeesTable.organizationId, membership.organizationId),
          eq(employeesTable.id, request.employeeId),
        ),
      )
      .limit(1);
    if (!policy || !employee) {
      res.status(404).json({ error: "Leave policy or employee record was not found." });
      return;
    }

    const statutory = validateKenyaStatutoryFloor({
      name: policy.name,
      code: policy.code,
      entitlementQuantity: policy.entitlementQuantity,
      entitlementUnit: policy.entitlementUnit as "days" | "weeks" | "months",
      entitlementDays: policy.entitlementDays,
    });
    const requestYear = Number(request.startDate.slice(0, 4));
    const eventBased = ["maternity", "paternity", "pre-adoptive"].includes(policy.code);
    let availableDays = policy.entitlementDays;
    if (eventBased) {
      const usage = await db
        .select({ quantityDays: leaveLedgerTable.quantityDays })
        .from(leaveLedgerTable)
        .where(
          and(
            eq(leaveLedgerTable.organizationId, membership.organizationId),
            eq(leaveLedgerTable.employeeId, employee.id),
            eq(leaveLedgerTable.leaveType, policy.code),
          ),
        );
      availableDays = Math.max(0, policy.entitlementDays + sumLeaveLedgerDays(usage));
    } else {
      await ensureAccrualLedgerEntries(employee, policy, new Date());
      const [ledger, pending] = await Promise.all([
        db
          .select({ quantityDays: leaveLedgerTable.quantityDays })
          .from(leaveLedgerTable)
          .where(
            and(
              eq(leaveLedgerTable.organizationId, membership.organizationId),
              eq(leaveLedgerTable.employeeId, employee.id),
              eq(leaveLedgerTable.leaveType, policy.code),
              eq(leaveLedgerTable.leaveYear, requestYear),
            ),
          ),
        db
          .select()
          .from(leaveRequestsTable)
          .where(
            and(
              eq(leaveRequestsTable.organizationId, membership.organizationId),
              eq(leaveRequestsTable.employeeId, employee.id),
              eq(leaveRequestsTable.leaveType, policy.code),
              eq(leaveRequestsTable.status, "pending"),
            ),
          ),
      ]);
      availableDays =
        sumLeaveLedgerDays(ledger) -
        pending
          .filter((item) => item.id !== request.id)
          .reduce(
            (sum, item) =>
              sum + businessDaysForYear(item.startDate, item.endDate, requestYear) - (item.halfDay ? 0.5 : 0),
            0,
          );
    }

    const overlaps = await db
      .select({ id: leaveRequestsTable.id })
      .from(leaveRequestsTable)
      .where(
        and(
          eq(leaveRequestsTable.organizationId, membership.organizationId),
          eq(leaveRequestsTable.employeeId, employee.id),
          inArray(leaveRequestsTable.status, ["pending", "approved"]),
          lte(leaveRequestsTable.startDate, request.endDate),
          gte(leaveRequestsTable.endDate, request.startDate),
        ),
      );
    const advisory = recommendLeave({
      requestedDays: request.days,
      availableDays: Math.max(0, availableDays),
      eligible: policy.code !== "sick" || completedServiceMonths(employee.startDate, new Date()) >= 2,
      hasOverlap: overlaps.some((item) => item.id !== request.id),
      blackoutPeriod: false,
      statutoryPolicyCompliant: statutory.valid,
    });
    res.json(advisory);
  },
);

router.post(
  "/leave-requests/:requestId/recommendation",
  async (req, res): Promise<void> => {
    const params = DecideLeaveRequestParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const body = req.body as { decision?: unknown; comment?: unknown };
    if (body.decision !== "recommend" && body.decision !== "not_recommend") {
      res.status(400).json({ error: "Decision must be recommend or not_recommend." });
      return;
    }
    if (body.comment !== undefined && body.comment !== null && (typeof body.comment !== "string" || body.comment.length > 1000)) {
      res.status(400).json({ error: "Recommendation comment must be 1,000 characters or fewer." });
      return;
    }
    const membership = await requireRoles(req, res, recommenderRoles);
    if (!membership) return;
    const recommended = body.decision === "recommend";
    const comment = typeof body.comment === "string" ? body.comment.trim() : null;

    if (!process.env.DATABASE_URL) {
      const request = DEMO_LEAVE_STORE.find((item) => item.id === params.data.requestId);
      if (!request) {
        res.status(404).json({ error: "Leave request not found." });
        return;
      }
      if (request.status !== "pending" || request.recommendationStatus !== "not_assessed") {
        res.status(409).json({ error: "This request has already been recommended or decided." });
        return;
      }
      if (request.createdByUserId === membership.userId || request.employeeId === membership.employeeId) {
        res.status(403).json({ error: "You cannot recommend your own leave request." });
        return;
      }
      if (
        membership.role === PEOPLEOS_ROLES.departmentManager &&
        !DEMO_EMPLOYEES_LIST.some(
          (employee) => employee.id === request.employeeId && employee.managerId === membership.employeeId,
        )
      ) {
        res.status(403).json({ error: "You can only recommend leave for your direct reports." });
        return;
      }
      request.recommendationStatus = recommended ? "recommended" : "not_recommended";
      request.recommendationComment = comment;
      request.recommendationByUserId = membership.userId;
      request.recommendationAt = new Date();
      await recordAuditEvent({
        organizationId: membership.organizationId,
        actorUserId: membership.userId,
        actor: membership.role,
        action: "leave_request_recommended",
        targetType: "leave_request",
        targetId: request.id,
        summary: `A leave request was ${recommended ? "recommended" : "not recommended"} by a human reviewer.`,
        correlationId: req.correlationId,
        critical: true,
        isDemo: true,
      });
      res.json({
        id: request.id,
        recommendationStatus: request.recommendationStatus,
        recommendationComment: request.recommendationComment,
        recommendationByUserId: request.recommendationByUserId,
        recommendationAt: request.recommendationAt?.toISOString() ?? null,
      });
      return;
    }

    const [request] = await db
      .select()
      .from(leaveRequestsTable)
      .where(
        and(
          eq(leaveRequestsTable.id, params.data.requestId),
          eq(leaveRequestsTable.organizationId, membership.organizationId),
        ),
      )
      .limit(1);
    if (!request) {
      res.status(404).json({ error: "Leave request not found." });
      return;
    }
    if (request.status !== "pending" || request.recommendationStatus !== "not_assessed") {
      res.status(409).json({ error: "This request has already been recommended or decided." });
      return;
    }
    if (request.createdByUserId === membership.userId || request.employeeId === membership.employeeId) {
      res.status(403).json({ error: "You cannot recommend your own leave request." });
      return;
    }
    if (
      membership.role === PEOPLEOS_ROLES.departmentManager &&
      !(await canManageRequest(
        membership.organizationId,
        membership.employeeId ?? "",
        membership.role,
        request.employeeId,
      ))
    ) {
      res.status(403).json({ error: "You can only recommend leave for your direct reports." });
      return;
    }
    const [policy] = await db
      .select()
      .from(leavePoliciesTable)
      .where(
        and(
          eq(leavePoliciesTable.organizationId, membership.organizationId),
          eq(leavePoliciesTable.code, request.leaveType),
        ),
      )
      .limit(1);
    const [employee] = await db
      .select()
      .from(employeesTable)
      .where(
        and(
          eq(employeesTable.organizationId, membership.organizationId),
          eq(employeesTable.id, request.employeeId),
        ),
      )
      .limit(1);
    if (!policy || !employee) {
      res.status(404).json({ error: "Leave policy or employee record was not found." });
      return;
    }
    const statutory = validateKenyaStatutoryFloor({
      name: policy.name,
      code: policy.code,
      entitlementQuantity: policy.entitlementQuantity,
      entitlementUnit: policy.entitlementUnit as "days" | "weeks" | "months",
      entitlementDays: policy.entitlementDays,
    });
    const advisory = recommendLeave({
      requestedDays: request.days,
      availableDays: policy.entitlementDays,
      eligible: policy.code !== "sick" || completedServiceMonths(employee.startDate, new Date()) >= 2,
      hasOverlap: false,
      blackoutPeriod: false,
      statutoryPolicyCompliant: statutory.valid,
    });
    const updated = await db.transaction(async (tx) => {
      const [result] = await tx
        .update(leaveRequestsTable)
        .set({
          recommendationStatus: recommended ? "recommended" : "not_recommended",
          recommendationComment: comment,
          recommendationByUserId: membership.userId,
          recommendationAt: new Date(),
          recommendationJson: JSON.stringify(advisory),
        })
        .where(
          and(
            eq(leaveRequestsTable.id, request.id),
            eq(leaveRequestsTable.organizationId, membership.organizationId),
            eq(leaveRequestsTable.status, "pending"),
            eq(leaveRequestsTable.recommendationStatus, "not_assessed"),
          ),
        )
        .returning();
      if (!result) return null;
      await tx.insert(auditEventsTable).values({
        organizationId: membership.organizationId,
        actorUserId: membership.userId,
        actor: membership.role,
        action: "leave_request_recommended",
        targetType: "leave_request",
        targetId: request.id,
        summary: `A leave request was ${recommended ? "recommended" : "not recommended"} by a human reviewer.`,
        isDemo: request.isDemo,
      });
      return result;
    });
    if (!updated) {
      res.status(409).json({ error: "This request has already been recommended or decided." });
      return;
    }
    res.json({
      id: updated.id,
      recommendationStatus: updated.recommendationStatus,
      recommendationComment: updated.recommendationComment,
      recommendationByUserId: updated.recommendationByUserId,
      recommendationAt: updated.recommendationAt?.toISOString() ?? null,
      advisory,
    });
  },
);

router.get("/approvals", async (req, res): Promise<void> => {
  const membership = await requireRoles(req, res, recommenderRoles);
  if (!membership) return;
  if (!process.env.DATABASE_URL) {
    const pending = DEMO_LEAVE_STORE.filter((r) => r.status === "pending");
    const approvals = pending.map((r) => ({
      id: r.id,
      type: "leave" as const,
      title: `${r.leaveType} leave · ${r.days} day${r.days === 1 ? "" : "s"}`,
      requester: r.employeeName,
      submittedAt: r.submittedAt,
      href: "/leave",
    }));
    res.json(ListApprovalsResponse.parse(approvals));
    return;
  }
  const conditions = [
    eq(leaveRequestsTable.organizationId, membership.organizationId),
    eq(leaveRequestsTable.status, "pending"),
  ];
  if (
    membership.role === PEOPLEOS_ROLES.departmentManager &&
    membership.employeeId
  ) {
    const reports = await db
      .select({ id: employeesTable.id })
      .from(employeesTable)
      .where(
        and(
          eq(employeesTable.organizationId, membership.organizationId),
          eq(employeesTable.managerId, membership.employeeId),
        ),
      );
    if (!reports.length) {
      res.json(ListApprovalsResponse.parse([]));
      return;
    }
    conditions.push(
      inArray(
        leaveRequestsTable.employeeId,
        reports.map((employee) => employee.id),
      ),
    );
  }
  const requests = await db
    .select()
    .from(leaveRequestsTable)
    .where(and(...conditions))
    .orderBy(leaveRequestsTable.submittedAt);
  const people = await serializeRequests(membership.organizationId, requests);
  const response = people.map((request) => ({
    id: request.id,
    type: "leave" as const,
    title: `${request.leaveType} leave · ${request.days} day${request.days === 1 ? "" : "s"}`,
    requester: request.employeeName,
    submittedAt: request.submittedAt,
    href: "/leave",
  }));
  res.json(ListApprovalsResponse.parse(response));
});

router.post(
  "/leave-requests/:requestId/decision",
  async (req, res): Promise<void> => {
    const params = DecideLeaveRequestParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const body = DecideLeaveRequestBody.safeParse(req.body);
    if (!body.success) {
      res.status(400).json({ error: body.error.message });
      return;
    }
    const membership = await requireRoles(req, res, approverRoles);
    if (!membership) return;
    const targetStatus = body.data.decision === "approve" ? "approved" : "rejected";

    if (!process.env.DATABASE_URL) {
      const target = DEMO_LEAVE_STORE.find((item) => item.id === params.data.requestId);
      if (!target) {
        res.status(404).json({ error: "Leave request not found." });
        return;
      }
      if (target.status !== "pending") {
        res.status(409).json({ error: "This request has already been decided." });
        return;
      }
      if (!target.recommendationStatus || target.recommendationStatus === "not_assessed") {
        res.status(409).json({ error: "A manager recommendation is required before HR can decide this request." });
        return;
      }
      if (body.data.decision === "approve" && target.recommendationStatus !== "recommended") {
        res.status(409).json({ error: "This request was not recommended. HR may reject it, but cannot approve it without a recommendation." });
        return;
      }
      if (
        target.createdByUserId === membership.userId ||
        target.recommendationByUserId === membership.userId ||
        (membership.employeeId && target.employeeId === membership.employeeId)
      ) {
        res.status(403).json({ error: "The requester or recommender cannot approve their own leave request." });
        return;
      }
      target.status = targetStatus;
      target.decisionComment = body.data.comment ?? null;
      target.decidedAt = new Date();
      target.approverId = membership.userId;
      await recordAuditEvent({
        organizationId: membership.organizationId,
        actorUserId: membership.userId,
        actor: membership.role,
        action: target.status === "approved" ? "leave_request_approved" : "leave_request_rejected",
        targetType: "leave_request",
        targetId: target.id,
        summary: `Leave request for ${target.employeeName} was ${target.status}.`,
        correlationId: req.correlationId,
        critical: true,
        isDemo: true,
      });
      res.json(DecideLeaveRequestResponse.parse(target));
      return;
    }

    const result = await db.transaction(async (tx) => {
      const [request] = await tx
        .select()
        .from(leaveRequestsTable)
        .where(
          and(
            eq(leaveRequestsTable.id, params.data.requestId),
            eq(leaveRequestsTable.organizationId, membership.organizationId),
          ),
        )
        .for("update")
        .limit(1);
      if (!request) return { kind: "missing" as const };
      if (request.status !== "pending") return { kind: "already_decided" as const };
      if (!request.recommendationStatus || request.recommendationStatus === "not_assessed") {
        return { kind: "recommendation_required" as const };
      }
      if (body.data.decision === "approve" && request.recommendationStatus !== "recommended") {
        return { kind: "not_recommended" as const };
      }
      if (
        request.createdByUserId === membership.userId ||
        request.recommendationByUserId === membership.userId
      ) {
        return { kind: "self_approval" as const };
      }

      const [updated] = await tx
        .update(leaveRequestsTable)
        .set({
          status: targetStatus,
          approverUserId: membership.userId,
          decisionComment: body.data.comment ?? null,
          decidedAt: new Date(),
        })
        .where(
          and(
            eq(leaveRequestsTable.id, request.id),
            eq(leaveRequestsTable.organizationId, membership.organizationId),
            eq(leaveRequestsTable.status, "pending"),
            eq(leaveRequestsTable.recommendationStatus, request.recommendationStatus),
          ),
        )
        .returning();
      if (!updated) return { kind: "already_decided" as const };

      if (targetStatus === "approved") {
        const yearlyDays = businessDaysByYear(request.startDate, request.endDate);
        for (const [leaveYear, fullDays] of yearlyDays) {
          const quantityDays =
            fullDays - (request.halfDay && request.startDate.slice(0, 4) === String(leaveYear) ? 0.5 : 0);
          if (quantityDays <= 0) continue;
          await tx
            .insert(leaveLedgerTable)
            .values({
              organizationId: membership.organizationId,
              employeeId: request.employeeId,
              leaveType: request.leaveType,
              leaveYear,
              leaveRequestId: request.id,
              entryType: "deduction",
              quantityDays: -quantityDays,
              sourceKey: `approval:${request.id}:${leaveYear}`,
              description: `Approved leave deduction for ${leaveYear}`,
              createdByUserId: membership.userId,
              isDemo: request.isDemo,
            })
            .onConflictDoNothing();
        }
      }

      await tx.insert(auditEventsTable).values({
        organizationId: membership.organizationId,
        actorUserId: membership.userId,
        actor: membership.role,
        action: targetStatus === "approved" ? "leave_request_approved" : "leave_request_rejected",
        targetType: "leave_request",
        targetId: request.id,
        summary: `A leave request was ${targetStatus}.`,
        isDemo: request.isDemo,
      });
      return { kind: "updated" as const, request: updated };
    });

    if (result.kind === "missing") {
      res.status(404).json({ error: "Leave request not found." });
      return;
    }
    if (result.kind === "already_decided") {
      res.status(409).json({ error: "This request has already been decided." });
      return;
    }
    if (result.kind === "recommendation_required") {
      res.status(409).json({ error: "A manager recommendation is required before HR can decide this request." });
      return;
    }
    if (result.kind === "not_recommended") {
      res.status(409).json({ error: "This request was not recommended and cannot be approved." });
      return;
    }
    if (result.kind === "self_approval") {
      res.status(403).json({ error: "The requester or recommender cannot approve their own leave request." });
      return;
    }
    const [response] = await serializeRequests(membership.organizationId, [result.request]);
    res.json(DecideLeaveRequestResponse.parse(response));
  },
);

router.get("/leave/department-coverage", async (req, res): Promise<void> => {
  const membership = await ensureMembership(req, res);
  if (!membership) return;

  const startDate =
    typeof req.query.startDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(req.query.startDate)
      ? req.query.startDate
      : new Date().toISOString().slice(0, 10);
  const endDate =
    typeof req.query.endDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(req.query.endDate)
      ? req.query.endDate
      : new Date(Date.now() + 14 * 86400 * 1000).toISOString().slice(0, 10);

  const employees = process.env.DATABASE_URL
    ? await db
        .select()
        .from(employeesTable)
        .where(eq(employeesTable.organizationId, membership.organizationId))
    : DEMO_EMPLOYEES_LIST;

  const leaveRows = process.env.DATABASE_URL
    ? await db
        .select()
        .from(leaveRequestsTable)
        .where(
          and(
            eq(leaveRequestsTable.organizationId, membership.organizationId),
            eq(leaveRequestsTable.status, "approved"),
            lte(leaveRequestsTable.startDate, endDate),
            gte(leaveRequestsTable.endDate, startDate),
          ),
        )
    : DEMO_LEAVE_STORE.filter(
        (r) =>
          r.status === "approved" &&
          dateOnly(r.startDate) <= endDate &&
          dateOnly(r.endDate) >= startDate,
      );

  const onLeaveEmpIds = new Set(leaveRows.map((l) => l.employeeId));

  const departments = DEMO_DEPARTMENTS_LIST.map((dept) => {
    const deptEmps = employees.filter(
      (e) => e.departmentId === dept.id && e.status !== "former",
    );
    const awayEmps = deptEmps.filter(
      (e) => e.status === "on_leave" || onLeaveEmpIds.has(e.id),
    );
    const availableCount = deptEmps.length - awayEmps.length;
    return {
      departmentId: dept.id,
      departmentCode: dept.code,
      departmentName: dept.name,
      activeHeadcount: deptEmps.length,
      onLeaveOrScheduledCount: awayEmps.length,
      availableCount,
      coveragePct:
        deptEmps.length > 0
          ? Math.round((availableCount / deptEmps.length) * 100)
          : 100,
    };
  });

  res.json({
    startDate,
    endDate,
    departments,
    items: departments,
  });
});

// ─── Workstream: Team Availability & Role-Aware Leave Calendar ────────────────

router.get(["/leave/calendar", "/leave-calendar"], async (req, res): Promise<void> => {
  const membership = await ensureMembership(req, res);
  if (!membership) return;

  const nowIso = new Date().toISOString().slice(0, 10);
  const month =
    typeof req.query.month === "string" && /^\d{4}-\d{2}$/.test(req.query.month)
      ? req.query.month
      : nowIso.slice(0, 7);

  const startDate =
    typeof req.query.startDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(req.query.startDate)
      ? req.query.startDate
      : `${month}-01`;

  const endDate =
    typeof req.query.endDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(req.query.endDate)
      ? req.query.endDate
      : (() => {
          const [y, m] = month.split("-").map(Number);
          const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
          return `${month}-${String(lastDay).padStart(2, "0")}`;
        })();

  const departmentFilter =
    typeof req.query.departmentId === "string" && req.query.departmentId.trim()
      ? req.query.departmentId.trim()
      : undefined;

  // Retrieve effective work calendar and holidays
  const effectiveCalendar = await resolveEffectiveWorkCalendar(membership.organizationId);
  const holidays = (effectiveCalendar.holidays ?? []).filter(
    (h) => h.date >= startDate && h.date <= endDate,
  );

  const employees = process.env.DATABASE_URL
    ? await db
        .select()
        .from(employeesTable)
        .where(eq(employeesTable.organizationId, membership.organizationId))
    : DEMO_EMPLOYEES_LIST;

  const empMap = new Map(employees.map((e) => [e.id, e]));
  const deptMap = new Map(DEMO_DEPARTMENTS_LIST.map((d) => [d.id, d]));

  const policies = process.env.DATABASE_URL
    ? await db
        .select()
        .from(leavePoliciesTable)
        .where(eq(leavePoliciesTable.organizationId, membership.organizationId))
    : DEMO_LEAVE_POLICIES;
  const policyNameMap = new Map(policies.map((p) => [p.code, p.name]));

  // Retrieve leave requests overlapping the window
  const leaveRows = process.env.DATABASE_URL
    ? await db
        .select()
        .from(leaveRequestsTable)
        .where(
          and(
            eq(leaveRequestsTable.organizationId, membership.organizationId),
            inArray(leaveRequestsTable.status, ["approved", "pending"]),
            lte(leaveRequestsTable.startDate, endDate),
            gte(leaveRequestsTable.endDate, startDate),
          ),
        )
    : DEMO_LEAVE_STORE.filter(
        (r) =>
          (r.status === "approved" || r.status === "pending") &&
          dateOnly(r.startDate) <= endDate &&
          dateOnly(r.endDate) >= startDate,
      );

  // Role resolution for Privacy & Kenya ODPC Compliance:
  // - HR/Admin sees full details (actual policy, reason, approver)
  // - Managers see actual policy unless Sick / Compassionate (redacted to 'Leave' and reason hidden)
  // - Peers/Employees see 'Away' without policy type or reason (unless it is their own leave)
  const isHrOrAdmin = [
    PEOPLEOS_ROLES.hrAdmin,
    PEOPLEOS_ROLES.hrDirector,
    PEOPLEOS_ROLES.hrManager,
    PEOPLEOS_ROLES.systemAdmin,
  ].includes(membership.role as any);

  const isManager = [
    PEOPLEOS_ROLES.departmentManager,
    PEOPLEOS_ROLES.productionSupervisor,
    PEOPLEOS_ROLES.warehouseSupervisor,
    PEOPLEOS_ROLES.salesManager,
  ].includes(membership.role as any);

  const callerEmp = membership.employeeId ? empMap.get(membership.employeeId) : null;
  const callerDeptId = callerEmp?.departmentId ?? null;

  const entries: Array<{
    id: string;
    employeeId: string;
    employeeName: string;
    departmentId: string | null;
    departmentName: string;
    startDate: string;
    endDate: string;
    days: number;
    status: "approved" | "pending";
    displayType: string;
    reason: string | null;
    isOwn: boolean;
  }> = [];

  for (const row of leaveRows) {
    const emp = empMap.get(row.employeeId);
    if (departmentFilter && emp?.departmentId !== departmentFilter) {
      continue;
    }

    const isOwn = Boolean(membership.employeeId && row.employeeId === membership.employeeId);
    const rawType = row.leaveType;
    const policyName =
      policyNameMap.get(rawType) ??
      (rawType.charAt(0).toUpperCase() + rawType.slice(1) + " Leave");

    const isSensitive =
      /sick|compassionate|medical|bereavement/i.test(rawType) ||
      /sick|compassionate|medical|bereavement/i.test(policyName);

    let displayType: string;
    let reason: string | null = null;

    if (isOwn || isHrOrAdmin) {
      displayType = policyName;
      reason = row.reason ?? null;
    } else if (isManager) {
      const inDept = callerDeptId && emp?.departmentId === callerDeptId;
      if (inDept) {
        if (isSensitive) {
          displayType = "Leave"; // Redacted for medical privacy
          reason = null;
        } else {
          displayType = policyName;
          reason = row.reason ?? null;
        }
      } else {
        displayType = "Away";
        reason = null;
      }
    } else {
      // Regular employee / peer
      displayType = "Away";
      reason = null;
    }

    const dept = emp?.departmentId ? deptMap.get(emp.departmentId) : null;

    const rowEmpName =
      "employeeName" in row && typeof row.employeeName === "string"
        ? row.employeeName
        : "Employee";

    entries.push({
      id: row.id,
      employeeId: row.employeeId,
      employeeName: emp ? `${emp.firstName} ${emp.lastName}` : rowEmpName,
      departmentId: emp?.departmentId ?? null,
      departmentName: dept?.name ?? "General",
      startDate: dateOnly(row.startDate),
      endDate: dateOnly(row.endDate),
      days: row.days,
      status: row.status as "approved" | "pending",
      displayType,
      reason,
      isOwn,
    });
  }

  entries.sort((a, b) => a.startDate.localeCompare(b.startDate));

  res.json({
    period: {
      month,
      startDate,
      endDate,
    },
    workCalendar: {
      timezone: effectiveCalendar.timezone,
      workdays: effectiveCalendar.workdays,
      shiftStartTime: effectiveCalendar.shiftStartTime,
      shiftEndTime: effectiveCalendar.shiftEndTime,
    },
    holidays,
    entries,
    summary: {
      totalEmployeesOnLeave: new Set(entries.map((e) => e.employeeId)).size,
      approvedCount: entries.filter((e) => e.status === "approved").length,
      pendingCount: entries.filter((e) => e.status === "pending").length,
      holidaysCount: holidays.length,
    },
    viewMode: isHrOrAdmin ? "hr" : isManager ? "manager" : "peer",
  });
});

router.post("/leave/requests/preview", async (req, res): Promise<void> => {
  const membership = await ensureMembership(req, res);
  if (!membership) return;

  const { leaveType, startDate, endDate, employeeId } = req.body ?? {};
  if (
    typeof leaveType !== "string" ||
    typeof startDate !== "string" ||
    typeof endDate !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(startDate) ||
    !/^\d{4}-\d{2}-\d{2}$/.test(endDate)
  ) {
    res.status(400).json({
      error: "leaveType, startDate, and endDate (YYYY-MM-DD) are required.",
    });
    return;
  }

  if (endDate < startDate) {
    res.status(400).json({ error: "End date must be on or after start date." });
    return;
  }

  const targetEmpId =
    membership.role === PEOPLEOS_ROLES.employee && membership.employeeId
      ? membership.employeeId
      : typeof employeeId === "string" && employeeId
        ? employeeId
        : membership.employeeId;

  const effectiveCalendar = await resolveEffectiveWorkCalendar(membership.organizationId);
  const calendarDaysResult = countCalendarWorkingDays(startDate, endDate, effectiveCalendar);
  const days = calendarDaysResult.workingDays;

  const existingRows = process.env.DATABASE_URL
    ? await db
        .select()
        .from(leaveRequestsTable)
        .where(
          and(
            eq(leaveRequestsTable.organizationId, membership.organizationId),
            targetEmpId ? eq(leaveRequestsTable.employeeId, targetEmpId) : undefined,
            inArray(leaveRequestsTable.status, ["approved", "pending"]),
            lte(leaveRequestsTable.startDate, endDate),
            gte(leaveRequestsTable.endDate, startDate),
          ),
        )
    : DEMO_LEAVE_STORE.filter(
        (r) =>
          (!targetEmpId || r.employeeId === targetEmpId) &&
          (r.status === "approved" || r.status === "pending") &&
          dateOnly(r.startDate) <= endDate &&
          dateOnly(r.endDate) >= startDate,
      );

  const hasOverlap = existingRows.length > 0;
  const holidaysInRange = (effectiveCalendar.holidays ?? []).filter(
    (h) => h.date >= startDate && h.date <= endDate,
  );

  res.json({
    workingDays: days,
    excludedHolidays: holidaysInRange,
    excludedHolidayCount: calendarDaysResult.excludedHolidayCount,
    hasOverlap,
    overlappingRequests: existingRows.map((r) => ({
      id: r.id,
      startDate: dateOnly(r.startDate),
      endDate: dateOnly(r.endDate),
      status: r.status,
    })),
  });
});

export default router;
