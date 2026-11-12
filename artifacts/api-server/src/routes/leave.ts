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
} from "@workspace/db";
import { recordAuditEvent } from "../lib/auditService";
import { DEMO_EMPLOYEES_LIST } from "./peopleos";
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
    id: "leave-001",
    employeeId: "10000000-0000-4000-8000-000000000004",
    employeeName: "Wanjiku Kimani",
    leaveType: "annual",
    startDate: new Date("2026-03-02"),
    endDate: new Date("2026-03-13"),
    days: 10,
    reason: "Annual rest and family leave",
    status: "approved",
    approverId: "10000000-0000-4000-8000-000000000007",
    decisionComment: "Approved. Fleet coverage confirmed.",
    submittedAt: new Date("2026-02-15T08:30:00Z"),
    decidedAt: new Date("2026-02-16T10:00:00Z"),
    isDemo: true,
  },
  {
    id: "leave-002",
    employeeId: "10000000-0000-4000-8000-000000000006",
    employeeName: "Brian Kiprotich",
    leaveType: "annual",
    startDate: new Date("2026-03-20"),
    endDate: new Date("2026-03-27"),
    days: 6,
    reason: "Professional certification exam study period",
    status: "pending",
    approverId: null,
    decisionComment: null,
    submittedAt: new Date("2026-03-01T11:45:00Z"),
    decidedAt: null,
    isDemo: true,
  },
  {
    id: "leave-003",
    employeeId: "10000000-0000-4000-8000-000000000002",
    employeeName: "Mwangi Kariuki",
    leaveType: "parental",
    startDate: new Date("2026-04-06"),
    endDate: new Date("2026-04-17"),
    days: 10,
    reason: "Paternity leave under Employment Act 2007",
    status: "pending",
    approverId: null,
    decisionComment: null,
    submittedAt: new Date("2026-03-04T09:15:00Z"),
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
      entitlementDays: body.data.entitlementDays,
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
      target.entitlementDays = body.data.entitlementDays;
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
          entitlementDays: body.data.entitlementDays,
          accrualMethod: body.data.accrualMethod,
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
        const accruedDays = accruedDaysForYear(policy, year, new Date());
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
      })
      .from(employeesTable)
      .where(and(...conditions));
  } else if (membership.employeeId) {
    permittedEmployees = await db
      .select({
        id: employeesTable.id,
        firstName: employeesTable.firstName,
        lastName: employeesTable.lastName,
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
          request.leaveType === policy.code,
      );
      const usedDays = relevantRequests
        .filter((request) => request.status === "approved")
        .reduce(
          (total, request) =>
            total + businessDaysForYear(request.startDate, request.endDate, year),
          0,
        );
      const pendingDays = relevantRequests
        .filter((request) => request.status === "pending")
        .reduce(
          (total, request) =>
            total + businessDaysForYear(request.startDate, request.endDate, year),
          0,
        );
      const accruedDays = accruedDaysForYear(policy, year, new Date());
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
        remainingDays: accruedDays - usedDays - pendingDays,
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
  if (endDate < startDate) {
    res.status(400).json({ error: "End date must be on or after the start date." });
    return;
  }
  const days = businessDaysBetween(startDate, endDate);
  if (days < 1) {
    res.status(400).json({ error: "Choose at least one weekday for the request." });
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

export default router;
