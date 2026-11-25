import crypto from "node:crypto";
import { and, desc, eq, gte, inArray, lte } from "drizzle-orm";
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
  leaveApprovalStepsTable,
} from "@workspace/db";
import { recordAuditEvent } from "../lib/auditService";
import {
  KENYA_LEAVE_POLICY_DEFAULTS,
  adviseOnLeave,
  completedServiceMonths,
  daysFromQuarterDays,
  paternityWorkingDayEquivalent,
  requestQuarterDays,
  validateKenyaStatutoryFloor,
} from "../services/leaveEngine";
import {
  ensureKenyaDefaultLeavePolicies,
  ensureMonthlyAnnualLeaveAccrual,
} from "../services/leavePolicyService";
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
  entitlementWeeks: number;
  entitlementMonths: number;
  sickFullPayDays: number;
  sickHalfPayDays: number;
  minimumServiceMonths: number;
  certificateRequired: boolean;
  paidPercentage: number;
  jurisdiction: "KE";
  sourceUrl: string;
  verifiedOn: string;
  needsLegalReview: boolean;
  accrualMethod: "annual" | "monthly";
  active: boolean;
}

interface DemoLeaveLedgerItem {
  id: string;
  organizationId: string;
  employeeId: string;
  leaveType: string;
  requestId: string | null;
  entryType: "accrual" | "deduction" | "adjustment" | "reversal" | "opening" | "expiry" | "carry_over";
  quantityQuarterDays: number;
  effectiveDate: string;
  idempotencyKey: string;
  note: string;
  createdAt: Date;
}

export const DEMO_LEAVE_LEDGER: DemoLeaveLedgerItem[] = [];

function addDaysIso(offset: number): string {
  const date = new Date();
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCDate(date.getUTCDate() + offset);
  return date.toISOString().slice(0, 10);
}

function ensureDemoKenyaDefaultPolicies(organizationId: string): void {
  if (DEMO_LEAVE_POLICIES.some((policy) => policy.organizationId === organizationId)) return;
  for (const policy of KENYA_LEAVE_POLICY_DEFAULTS) {
    DEMO_LEAVE_POLICIES.push({
      id: `demo-policy-${organizationId}-${policy.code}`,
      organizationId,
      code: policy.code,
      name: policy.name,
      entitlementDays: policy.entitlementDays,
      entitlementWeeks: policy.entitlementWeeks,
      entitlementMonths: policy.entitlementMonths,
      sickFullPayDays: policy.sickFullPayDays,
      sickHalfPayDays: policy.sickHalfPayDays,
      minimumServiceMonths: policy.minimumServiceMonths,
      certificateRequired: policy.certificateRequired,
      paidPercentage: policy.paidPercentage,
      jurisdiction: "KE",
      sourceUrl: policy.sourceUrl,
      verifiedOn: policy.verifiedOn,
      needsLegalReview: policy.needsLegalReview,
      accrualMethod: policy.accrualMethod,
      active: true,
    });
  }
}

function appendDemoLedgerEntry(entry: Omit<DemoLeaveLedgerItem, "id" | "createdAt">): void {
  if (DEMO_LEAVE_LEDGER.some((item) => item.organizationId === entry.organizationId && item.idempotencyKey === entry.idempotencyKey)) return;
  DEMO_LEAVE_LEDGER.unshift({ ...entry, id: crypto.randomUUID(), createdAt: new Date() });
}

function ensureDemoLeaveLedger(organizationId: string): void {
  ensureDemoKenyaDefaultPolicies(organizationId);
  const year = new Date().getUTCFullYear();
  const today = addDaysIso(0);
  for (const employee of DEMO_EMPLOYEES_LIST) {
    const startDate = employee.startDate;
    const effectiveStart = startDate > `${year}-01-01` ? startDate : `${year}-01-01`;
    for (let month = 1; month <= 12; month += 1) {
      const effectiveDate = new Date(`${effectiveStart}T00:00:00.000Z`);
      const requestedDay = effectiveDate.getUTCDate();
      effectiveDate.setUTCDate(1);
      effectiveDate.setUTCMonth(effectiveDate.getUTCMonth() + month);
      const endOfMonth = new Date(Date.UTC(effectiveDate.getUTCFullYear(), effectiveDate.getUTCMonth() + 1, 0)).getUTCDate();
      effectiveDate.setUTCDate(Math.min(requestedDay, endOfMonth));
      const effectiveIso = effectiveDate.toISOString().slice(0, 10);
      if (effectiveIso > today || effectiveIso.slice(0, 4) !== String(year)) break;
      const annualPolicy = KENYA_LEAVE_POLICY_DEFAULTS.find((policy) => policy.code === "annual");
      if (!annualPolicy) continue;
      const quarterDays = Math.round((annualPolicy.entitlementDays * 4) / 12);
      appendDemoLedgerEntry({
        organizationId,
        employeeId: employee.id,
        leaveType: "annual",
        requestId: null,
        entryType: "accrual",
        quantityQuarterDays: quarterDays,
        effectiveDate: effectiveIso,
        idempotencyKey: `accrual:${employee.id}:annual:${effectiveIso.slice(0, 7)}`,
        note: "Monthly annual leave accrual (demo fixture).",
      });
    }
  }
  for (const request of DEMO_LEAVE_STORE) {
    if (request.status !== "approved") continue;
    appendDemoLedgerEntry({
      organizationId,
      employeeId: request.employeeId,
      leaveType: request.leaveType,
      requestId: request.id,
      entryType: "deduction",
      quantityQuarterDays: -Math.round(request.days * 4),
      effectiveDate: dateOnly(request.startDate),
      idempotencyKey: `approval:${request.id}`,
      note: "Approved demo leave deduction.",
    });
  }
}

// Per-organization leave policies start empty by design (never prefilled with statutory amounts).
export const DEMO_LEAVE_POLICIES: DemoLeavePolicyItem[] = [];
const approverRoles = [
  PEOPLEOS_ROLES.hrAdmin,
  PEOPLEOS_ROLES.hrManager,
  PEOPLEOS_ROLES.systemAdmin,
  PEOPLEOS_ROLES.departmentManager,
];
const adminRoles: readonly string[] = [
  PEOPLEOS_ROLES.hrAdmin,
  PEOPLEOS_ROLES.hrManager,
  PEOPLEOS_ROLES.systemAdmin,
];

function canonicalLeaveCode(value: string): string {
  const normalized = value.toLowerCase();
  if (normalized.includes("annual")) return "annual";
  if (normalized.includes("sick")) return "sick";
  if (normalized.includes("maternity")) return "maternity";
  if (normalized.includes("paternity")) return "paternity";
  if (normalized.includes("pre-adoptive") || normalized.includes("preadoptive")) return "pre-adoptive";
  return normalized.replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 64);
}

function policyStatutoryFields(raw: Record<string, unknown>, defaults?: Partial<DemoLeavePolicyItem>) {
  const numeric = (key: string, fallback: number) => {
    const value = raw[key];
    return typeof value === "number" && Number.isFinite(value) ? value : fallback;
  };
  const boolean = (key: string, fallback: boolean) =>
    typeof raw[key] === "boolean" ? raw[key] as boolean : fallback;
  return {
    entitlementWeeks: numeric("entitlementWeeks", defaults?.entitlementWeeks ?? 0),
    entitlementMonths: numeric("entitlementMonths", defaults?.entitlementMonths ?? 0),
    sickFullPayDays: numeric("sickFullPayDays", defaults?.sickFullPayDays ?? 0),
    sickHalfPayDays: numeric("sickHalfPayDays", defaults?.sickHalfPayDays ?? 0),
    minimumServiceMonths: numeric("minimumServiceMonths", defaults?.minimumServiceMonths ?? 0),
    certificateRequired: boolean("certificateRequired", defaults?.certificateRequired ?? false),
    paidPercentage: numeric("paidPercentage", defaults?.paidPercentage ?? 100),
    effectiveFrom: typeof raw.effectiveFrom === "string" ? raw.effectiveFrom : "2026-01-01",
    effectiveTo: typeof raw.effectiveTo === "string" ? raw.effectiveTo : null,
    sourceUrl: typeof raw.sourceUrl === "string" ? raw.sourceUrl : defaults?.sourceUrl ?? "",
    verifiedOn: typeof raw.verifiedOn === "string" ? raw.verifiedOn : new Date().toISOString().slice(0, 10),
    needsLegalReview: boolean("needsLegalReview", defaults?.needsLegalReview ?? true),
  };
}

function statutoryFloorError(code: string, entitlementDays: number, fields: ReturnType<typeof policyStatutoryFields>): string | null {
  return validateKenyaStatutoryFloor({
    code,
    entitlementDays,
    entitlementWeeks: fields.entitlementWeeks,
    entitlementMonths: fields.entitlementMonths,
    sickFullPayDays: fields.sickFullPayDays,
    sickHalfPayDays: fields.sickHalfPayDays,
  });
}

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
}

export const DEMO_LEAVE_STORE: DemoLeaveItem[] = [
  {
    id: "leave-demo-approved",
    employeeId: "10000000-0000-4000-8000-000000000004",
    employeeName: "Demo Employee 04",
    leaveType: "annual",
    startDate: new Date(addDaysIso(-34)),
    endDate: new Date(addDaysIso(-25)),
    days: 8,
    reason: "Annual rest and personal time",
    status: "approved",
    approverId: "user_demo_hr_admin",
    decisionComment: "Approved after team coverage review.",
    submittedAt: new Date(Date.now() - 45 * 86400000),
    decidedAt: new Date(Date.now() - 44 * 86400000),
    isDemo: true,
  },
  {
    id: "leave-demo-pending",
    employeeId: "10000000-0000-4000-8000-000000000006",
    employeeName: "Demo Employee 06",
    leaveType: "annual",
    startDate: new Date(addDaysIso(14)),
    endDate: new Date(addDaysIso(19)),
    days: 4,
    reason: "Family commitment",
    status: "pending",
    approverId: null,
    decisionComment: null,
    submittedAt: new Date(Date.now() - 2 * 86400000),
    decidedAt: null,
    isDemo: true,
  },
  {
    id: "leave-demo-paternity",
    employeeId: "10000000-0000-4000-8000-000000000002",
    employeeName: "Demo Employee 02",
    leaveType: "paternity",
    startDate: new Date(addDaysIso(28)),
    endDate: new Date(addDaysIso(41)),
    days: 10,
    reason: "Paternity leave: statutory entitlement 2 weeks (10 working days on this 5-day schedule).",
    status: "pending",
    approverId: null,
    decisionComment: null,
    submittedAt: new Date(Date.now() - 1 * 86400000),
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

function accruedDaysForYear(
  policy: { entitlementDays: number; accrualMethod: string },
  year: number,
  asOf: Date,
): number {
  if (year < asOf.getUTCFullYear()) return policy.entitlementDays;
  if (year > asOf.getUTCFullYear()) return 0;
  if (policy.accrualMethod === "monthly") {
    return Math.floor((policy.entitlementDays * (asOf.getUTCMonth() + 1)) / 12);
  }
  return policy.entitlementDays;
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
  if (!process.env.DATABASE_URL) {
    ensureDemoKenyaDefaultPolicies(membership.organizationId);
    ensureDemoLeaveLedger(membership.organizationId);
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
            accrualMethod: policy.accrualMethod,
            active: policy.active,
          })),
      ),
    );
    return;
  }
  await ensureKenyaDefaultLeavePolicies(membership.organizationId, membership.userId);
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
        accrualMethod: policy.accrualMethod,
        active: policy.active,
      })),
    ),
  );
});

router.post("/leave-policies", async (req, res): Promise<void> => {
  const body = CreateLeavePolicyBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }
  const membership = await requireRoles(req, res, adminRoles);
  if (!membership) return;
  const name = body.data.name.trim();
  const code = canonicalLeaveCode(name);
  if (!code) {
    res.status(400).json({ error: "Enter a leave type name with letters or numbers." });
    return;
  }
  const raw = (req.body ?? {}) as Record<string, unknown>;
  const statutory = policyStatutoryFields(
    raw,
    KENYA_LEAVE_POLICY_DEFAULTS.find((policy) => policy.code === code),
  );
  const floorError = statutoryFloorError(code, body.data.entitlementDays, statutory);
  if (floorError) {
    res.status(422).json({
      error: floorError,
      sourceUrl: KENYA_LEAVE_POLICY_DEFAULTS.find((policy) => policy.code === code)?.sourceUrl,
      needsLegalReview: true,
    });
    return;
  }
  if (statutory.paidPercentage < 0 || statutory.paidPercentage > 100) {
    res.status(400).json({ error: "Paid percentage must be between 0 and 100." });
    return;
  }
  const organization = await getPeopleOsOrganization(membership.organizationId);
  if (!organization) {
    res.status(503).json({ error: "PeopleOS organization is not initialized." });
    return;
  }
  const statutoryValues = {
    entitlementWeeks: statutory.entitlementWeeks,
    entitlementMonths: statutory.entitlementMonths,
    sickFullPayDays: statutory.sickFullPayDays,
    sickHalfPayDays: statutory.sickHalfPayDays,
    minimumServiceMonths: statutory.minimumServiceMonths,
    certificateRequired: statutory.certificateRequired,
    paidPercentage: statutory.paidPercentage,
    jurisdiction: "KE" as const,
    effectiveFrom: statutory.effectiveFrom,
    effectiveTo: statutory.effectiveTo,
    sourceUrl: statutory.sourceUrl,
    verifiedOn: statutory.verifiedOn,
    needsLegalReview: statutory.needsLegalReview,
  };

  if (!process.env.DATABASE_URL) {
    ensureDemoKenyaDefaultPolicies(membership.organizationId);
    const existing = DEMO_LEAVE_POLICIES.find(
      (policy) => policy.organizationId === membership.organizationId && policy.code === code,
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
      entitlementDays: body.data.entitlementDays,
      accrualMethod: body.data.accrualMethod,
      ...statutoryValues,
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
        entitlementDays: body.data.entitlementDays,
        accrualMethod: body.data.accrualMethod,
        active: true,
        createdByUserId: membership.userId,
        ...statutoryValues,
      })
      .returning();
    if (!created) return null;
    await recordAuditEvent({
      organizationId: membership.organizationId,
      actorUserId: membership.userId,
      actor: membership.role,
      action: "leave_policy_created",
      targetType: "leave_policy",
      targetId: created.id,
      summary: `The ${name} leave policy was created.`,
      isDemo: organization.isDemo,
      tx,
      critical: true,
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
    const organization = await getPeopleOsOrganization(membership.organizationId);
    if (!organization) {
      res.status(503).json({ error: "PeopleOS organization is not initialized." });
      return;
    }
    const raw = (req.body ?? {}) as Record<string, unknown>;

    if (!process.env.DATABASE_URL) {
      ensureDemoKenyaDefaultPolicies(membership.organizationId);
      const target = DEMO_LEAVE_POLICIES.find(
        (policy) =>
          policy.id === params.data.policyId &&
          policy.organizationId === membership.organizationId,
      );
      if (!target) {
        res.status(404).json({ error: "Leave policy not found." });
        return;
      }
      const statutory = policyStatutoryFields(raw, target);
      const floorError = statutoryFloorError(target.code, body.data.entitlementDays, statutory);
      if (floorError) {
        res.status(422).json({ error: floorError, sourceUrl: target.sourceUrl, needsLegalReview: true });
        return;
      }
      target.name = name;
      target.entitlementDays = body.data.entitlementDays;
      target.accrualMethod = body.data.accrualMethod;
      Object.assign(target, statutory);
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
          accrualMethod: target.accrualMethod,
          active: target.active,
        }),
      );
      return;
    }

    const updated = await db.transaction(async (tx) => {
      const [current] = await tx
        .select()
        .from(leavePoliciesTable)
        .where(
          and(
            eq(leavePoliciesTable.id, params.data.policyId),
            eq(leavePoliciesTable.organizationId, membership.organizationId),
          ),
        )
        .for("update")
        .limit(1);
      if (!current) return null;
      const statutory = policyStatutoryFields(raw, current);
      const floorError = statutoryFloorError(current.code, body.data.entitlementDays, statutory);
      if (floorError) return { kind: "floor_error" as const, message: floorError, sourceUrl: current.sourceUrl };
      const [policy] = await tx
        .update(leavePoliciesTable)
        .set({
          name,
          entitlementDays: body.data.entitlementDays,
          accrualMethod: body.data.accrualMethod,
          active: body.data.active,
          ...statutory,
        })
        .where(
          and(
            eq(leavePoliciesTable.id, params.data.policyId),
            eq(leavePoliciesTable.organizationId, membership.organizationId),
          ),
        )
        .returning();
      if (!policy) return null;
      await recordAuditEvent({
        organizationId: membership.organizationId,
        actorUserId: membership.userId,
        actor: membership.role,
        action: "leave_policy_updated",
        targetType: "leave_policy",
        targetId: policy.id,
        summary: `The ${policy.name} leave policy was updated.`,
        isDemo: organization.isDemo,
        tx,
        critical: true,
      });
      return { kind: "updated" as const, policy };
    });
    if (!updated) {
      res.status(404).json({ error: "Leave policy not found." });
      return;
    }
    if ("kind" in updated && updated.kind === "floor_error") {
      res.status(422).json({ error: updated.message, sourceUrl: updated.sourceUrl, needsLegalReview: true });
      return;
    }
    const policy = "kind" in updated ? updated.policy : updated;
    res.json(
      UpdateLeavePolicyResponse.parse({
        id: policy.id,
        code: policy.code,
        name: policy.name,
        entitlementDays: policy.entitlementDays,
        accrualMethod: policy.accrualMethod,
        active: policy.active,
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
  const year = query.data.year ?? new Date().getUTCFullYear();
  const yearStart = `${year}-01-01`;
  const yearEnd = `${year}-12-31`;
  const isOrganizationAdmin = adminRoles.includes(membership.role);

  if (!process.env.DATABASE_URL) {
    ensureDemoLeaveLedger(membership.organizationId);
    let permittedEmployees = isOrganizationAdmin
      ? DEMO_EMPLOYEES_LIST
      : membership.role === PEOPLEOS_ROLES.departmentManager && membership.employeeId
        ? DEMO_EMPLOYEES_LIST.filter((employee) =>
            employee.id === membership.employeeId || employee.managerId === membership.employeeId)
        : membership.employeeId
          ? DEMO_EMPLOYEES_LIST.filter((employee) => employee.id === membership.employeeId)
          : [];
    if (query.data.employeeId) {
      if (!permittedEmployees.some((employee) => employee.id === query.data.employeeId)) {
        res.status(403).json({ error: "You cannot view leave balances for this employee." });
        return;
      }
      permittedEmployees = permittedEmployees.filter((employee) => employee.id === query.data.employeeId);
    }
    const policies = DEMO_LEAVE_POLICIES
      .filter((policy) => policy.organizationId === membership.organizationId)
      .filter((policy) => isOrganizationAdmin || policy.active)
      .sort((a, b) => a.name.localeCompare(b.name));
    const balances = permittedEmployees.flatMap((employee) =>
      policies.map((policy) => {
        const entries = DEMO_LEAVE_LEDGER.filter((entry) =>
          entry.organizationId === membership.organizationId &&
          entry.employeeId === employee.id &&
          entry.leaveType === policy.code &&
          entry.effectiveDate >= yearStart &&
          entry.effectiveDate <= yearEnd);
        const ledgerQuarterDays = entries.reduce((total, entry) => total + entry.quantityQuarterDays, 0);
        const accruedQuarterDays = entries
          .filter((entry) => ["accrual", "opening", "carry_over"].includes(entry.entryType))
          .reduce((total, entry) => total + entry.quantityQuarterDays, 0);
        const deductionQuarterDays = entries
          .filter((entry) => entry.entryType === "deduction")
          .reduce((total, entry) => total + Math.abs(entry.quantityQuarterDays), 0);
        const reversalQuarterDays = entries
          .filter((entry) => entry.entryType === "reversal")
          .reduce((total, entry) => total + entry.quantityQuarterDays, 0);
        const relevantRequests = DEMO_LEAVE_STORE.filter((request) =>
          request.employeeId === employee.id &&
          request.leaveType === policy.code &&
          dateOnly(request.startDate) <= yearEnd &&
          dateOnly(request.endDate) >= yearStart);
        const pendingDays = relevantRequests
          .filter((request) => request.status === "pending")
          .reduce((total, request) => total + request.days, 0);
        const usedDays = Math.max(0, deductionQuarterDays - reversalQuarterDays) / 4;
        const statutoryUnit = policy.entitlementWeeks > 0 ? "weeks" : policy.entitlementMonths > 0 ? "months" : "days";
        const statutoryEntitlementLabel = policy.entitlementWeeks > 0
          ? `${policy.entitlementWeeks} weeks (14 calendar days)`
          : policy.entitlementMonths > 0
            ? `${policy.entitlementMonths} month(s)`
            : `${policy.entitlementDays} working days`;
        return {
          employeeId: employee.id,
          employeeName: `${employee.firstName} ${employee.lastName}`,
          leaveType: policy.code,
          leaveTypeName: policy.name,
          year,
          entitlementDays: policy.entitlementDays,
          entitlementWeeks: policy.entitlementWeeks,
          entitlementMonths: policy.entitlementMonths,
          accruedDays: daysFromQuarterDays(accruedQuarterDays),
          usedDays,
          pendingDays,
          remainingDays: daysFromQuarterDays(ledgerQuarterDays) - pendingDays,
          accrualMethod: policy.accrualMethod,
          active: policy.active,
          statutoryUnit,
          statutoryEntitlementLabel,
          ledgerEntryCount: entries.length,
        };
      }),
    );
    res.json(ListLeaveBalancesResponse.parse(balances));
    return;
  }

  await ensureKenyaDefaultLeavePolicies(membership.organizationId, membership.userId);
  let permittedEmployees: Array<{
    id: string;
    firstName: string;
    lastName: string;
    startDate: string;
  }> = [];

  if (isOrganizationAdmin) {
    const conditions = [eq(employeesTable.organizationId, membership.organizationId)];
    if (query.data.employeeId) conditions.push(eq(employeesTable.id, query.data.employeeId));
    permittedEmployees = await db
      .select({ id: employeesTable.id, firstName: employeesTable.firstName, lastName: employeesTable.lastName, startDate: employeesTable.startDate })
      .from(employeesTable)
      .where(and(...conditions));
  } else if (membership.role === PEOPLEOS_ROLES.departmentManager) {
    if (!membership.employeeId) {
      res.json(ListLeaveBalancesResponse.parse([]));
      return;
    }
    const reports = await db
      .select({ id: employeesTable.id })
      .from(employeesTable)
      .where(and(
        eq(employeesTable.organizationId, membership.organizationId),
        eq(employeesTable.managerId, membership.employeeId),
      ));
    const allowedIds = [membership.employeeId, ...reports.map((employee) => employee.id)];
    if (query.data.employeeId && !allowedIds.includes(query.data.employeeId)) {
      res.status(403).json({ error: "You cannot view leave balances for this employee." });
      return;
    }
    permittedEmployees = await db
      .select({ id: employeesTable.id, firstName: employeesTable.firstName, lastName: employeesTable.lastName, startDate: employeesTable.startDate })
      .from(employeesTable)
      .where(and(
        eq(employeesTable.organizationId, membership.organizationId),
        inArray(employeesTable.id, query.data.employeeId ? [query.data.employeeId] : allowedIds),
      ));
  } else if (membership.employeeId) {
    permittedEmployees = await db
      .select({ id: employeesTable.id, firstName: employeesTable.firstName, lastName: employeesTable.lastName, startDate: employeesTable.startDate })
      .from(employeesTable)
      .where(and(
        eq(employeesTable.organizationId, membership.organizationId),
        eq(employeesTable.id, membership.employeeId),
        query.data.employeeId ? eq(employeesTable.id, query.data.employeeId) : undefined,
      ));
  }

  if (!permittedEmployees.length) {
    res.json(ListLeaveBalancesResponse.parse([]));
    return;
  }

  const policies = await db
    .select()
    .from(leavePoliciesTable)
    .where(and(
      eq(leavePoliciesTable.organizationId, membership.organizationId),
      isOrganizationAdmin ? undefined : eq(leavePoliciesTable.active, true),
    ))
    .orderBy(leavePoliciesTable.name);
  for (const employee of permittedEmployees) {
    for (const policy of policies) {
      await ensureMonthlyAnnualLeaveAccrual(membership.organizationId, employee, policy);
    }
  }
  const employeeIds = permittedEmployees.map((employee) => employee.id);
  const [requests, ledger] = await Promise.all([
    db.select().from(leaveRequestsTable).where(and(
      eq(leaveRequestsTable.organizationId, membership.organizationId),
      inArray(leaveRequestsTable.employeeId, employeeIds),
      inArray(leaveRequestsTable.status, ["pending", "recommended", "approved"]),
      lte(leaveRequestsTable.startDate, yearEnd),
      gte(leaveRequestsTable.endDate, yearStart),
    )),
    db.select().from(leaveLedgerTable).where(and(
      eq(leaveLedgerTable.organizationId, membership.organizationId),
      inArray(leaveLedgerTable.employeeId, employeeIds),
      gte(leaveLedgerTable.effectiveDate, yearStart),
      lte(leaveLedgerTable.effectiveDate, yearEnd),
    )),
  ]);
  const employeesById = new Map(permittedEmployees.map((employee) => [
    employee.id,
    `${employee.firstName} ${employee.lastName}`,
  ]));
  const balances = permittedEmployees.flatMap((employee) =>
    policies.map((policy) => {
      const entries = ledger.filter((entry) =>
        entry.employeeId === employee.id && entry.leaveType === policy.code);
      const ledgerQuarterDays = entries.reduce((total, entry) => total + entry.quantityQuarterDays, 0);
      const accruedQuarterDays = entries
        .filter((entry) => ["accrual", "opening", "carry_over"].includes(entry.entryType))
        .reduce((total, entry) => total + entry.quantityQuarterDays, 0);
      const deductionQuarterDays = entries
        .filter((entry) => entry.entryType === "deduction")
        .reduce((total, entry) => total + Math.abs(entry.quantityQuarterDays), 0);
      const reversalQuarterDays = entries
        .filter((entry) => entry.entryType === "reversal")
        .reduce((total, entry) => total + entry.quantityQuarterDays, 0);
      const relevantRequests = requests.filter((request) =>
        request.employeeId === employee.id &&
        request.leaveType === policy.code &&
        request.status !== "approved" &&
        request.startDate <= yearEnd &&
        request.endDate >= yearStart);
      const pendingDays = relevantRequests.reduce(
        (total, request) => total + (request.halfDay ? 0.5 : request.days),
        0,
      );
      const statutoryUnit = policy.entitlementWeeks > 0 ? "weeks" : policy.entitlementMonths > 0 ? "months" : "days";
      const statutoryEntitlementLabel = policy.entitlementWeeks > 0
        ? `${policy.entitlementWeeks} weeks (14 calendar days)`
        : policy.entitlementMonths > 0
          ? `${policy.entitlementMonths} month(s)`
          : `${policy.entitlementDays} working days`;
      return {
        employeeId: employee.id,
        employeeName: employeesById.get(employee.id) ?? "Employee",
        leaveType: policy.code,
        leaveTypeName: policy.name,
        year,
        entitlementDays: policy.entitlementDays,
        entitlementWeeks: policy.entitlementWeeks,
        entitlementMonths: policy.entitlementMonths,
        accruedDays: daysFromQuarterDays(accruedQuarterDays),
        usedDays: Math.max(0, deductionQuarterDays - reversalQuarterDays) / 4,
        pendingDays,
        remainingDays: daysFromQuarterDays(ledgerQuarterDays) - pendingDays,
        accrualMethod: policy.accrualMethod,
        active: policy.active,
        statutoryUnit,
        statutoryEntitlementLabel,
        ledgerEntryCount: entries.length,
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
  const days = calendarDaysResult.workingDays;
  if (days < 1) {
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
      const accrued = accruedDaysForYear(policy, year, asOf);
      const reservedDays = existingRequests.reduce(
        (total, request) =>
          total +
          businessDaysForYear(
            dateOnly(request.startDate),
            dateOnly(request.endDate),
            year,
          ),
        0,
      );
      if (reservedDays + requestDaysForYear > accrued) {
        res.status(409).json({
          error: `This request exceeds the available ${policy.name} balance for ${year}. ${accrued - reservedDays} day(s) are available.`,
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
      })
      .from(leaveRequestsTable)
      .where(
        and(
          eq(leaveRequestsTable.organizationId, organization.id),
          eq(leaveRequestsTable.employeeId, employee.id),
          eq(leaveRequestsTable.leaveType, policy.code),
          inArray(leaveRequestsTable.status, ["pending", "approved"]),
        ),
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
      const accrued = accruedDaysForYear(policy, year, asOf);
      const reservedDays = existingRequests.reduce(
        (total, request) =>
          total + businessDaysForYear(request.startDate, request.endDate, year),
        0,
      );
      if (reservedDays + requestDaysForYear > accrued) {
        return {
          kind: "insufficient_balance" as const,
          year,
          remainingDays: accrued - reservedDays,
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

router.get("/approvals", async (req, res): Promise<void> => {
  const membership = await requireRoles(req, res, approverRoles);
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
    if (!process.env.DATABASE_URL) {
      const target = DEMO_LEAVE_STORE.find((r) => r.id === params.data.requestId);
      if (!target) {
        res.status(404).json({ error: "Leave request not found." });
        return;
      }
      if (target.status !== "pending") {
        res.status(409).json({ error: "This request has already been decided." });
        return;
      }
      target.status = body.data.decision === "approve" ? "approved" : "rejected";
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
    if (request.status !== "pending") {
      res.status(409).json({ error: "This request has already been decided." });
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
      res.status(403).json({ error: "You cannot approve leave for this employee." });
      return;
    }
    if (request.createdByUserId === membership.userId) {
      res.status(403).json({ error: "You cannot approve a leave request you submitted." });
      return;
    }
    const status = body.data.decision === "approve" ? "approved" : "rejected";
    const updated = await db.transaction(async (tx) => {
      const [result] = await tx
        .update(leaveRequestsTable)
        .set({
          status,
          approverUserId: membership.userId,
          decisionComment: body.data.comment ?? null,
          decidedAt: new Date(),
        })
        .where(
          and(
            eq(leaveRequestsTable.id, request.id),
            eq(leaveRequestsTable.organizationId, membership.organizationId),
            eq(leaveRequestsTable.status, "pending"),
          ),
        )
        .returning();
      if (!result) return null;
      await tx.insert(auditEventsTable).values({
        organizationId: membership.organizationId,
        actorUserId: membership.userId,
        actor: membership.role,
        action: status === "approved" ? "leave_request_approved" : "leave_request_rejected",
        targetType: "leave_request",
        targetId: request.id,
        summary: `A leave request was ${status}.`,
        isDemo: request.isDemo,
      });
      return result;
    });
    if (!updated) {
      res.status(409).json({ error: "This request has already been decided." });
      return;
    }
    const [response] = await serializeRequests(membership.organizationId, [
      updated,
    ]);
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
  });
});

export default router;
