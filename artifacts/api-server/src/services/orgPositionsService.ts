import { randomUUID } from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import {
  db,
  departmentsTable,
  employeeAssignmentHistoryTable,
  employeePositionAssignmentsTable,
  employeesTable,
  positionsTable,
  type PositionRecord,
} from "@workspace/db";
import { recordAuditEvent } from "../lib/auditService";
import { phase2MemoryStore } from "./phase2MemoryStore";

export type OrgChartViewMode =
  | "company"
  | "department"
  | "manager"
  | "employee"
  | "position";

export interface OrgIntegrityAlert {
  code:
    | "CYCLE_DETECTED"
    | "SELF_REPORTING"
    | "MISSING_MANAGER"
    | "INACTIVE_MANAGER"
    | "MISSING_DEPARTMENT"
    | "POSITION_OCCUPANCY_MISMATCH";
  severity: "critical" | "warning" | "info";
  employeeId?: string;
  positionId?: string;
  message: string;
}

export const VALID_POSITION_TRANSITIONS: Record<string, Set<string>> = {
  draft: new Set(["pending_approval", "approved", "abolished"]),
  pending_approval: new Set(["approved", "draft", "abolished"]),
  approved: new Set(["vacant", "occupied", "frozen", "abolished"]),
  vacant: new Set(["occupied", "frozen", "abolished"]),
  occupied: new Set(["vacant", "frozen"]),
  frozen: new Set(["vacant", "approved", "abolished"]),
  abolished: new Set([]),
};

export async function buildOrganizationChart(params: {
  organizationId: string;
  view?: OrgChartViewMode;
  departmentId?: string;
  status?: string;
  location?: string;
  asOf?: string;
  demoEmployees: Array<{
    id: string;
    employeeNumber: string;
    firstName: string;
    lastName: string;
    jobTitle: string;
    departmentId: string;
    departmentName: string;
    managerId: string | null;
    managerName: string | null;
    location: string;
    employmentType: string;
    status: string;
  }>;
  demoDepartments: Array<{
    id: string;
    code: string;
    name: string;
    location: string;
    managerEmployeeId: string | null;
    budgetedPositions: number;
  }>;
}) {
  const view = params.view ?? "company";
  const asOf = params.asOf?.trim() || null;

  const orgDepartments = process.env.DATABASE_URL
    ? await db
        .select()
        .from(departmentsTable)
        .where(eq(departmentsTable.organizationId, params.organizationId))
    : params.demoDepartments;

  const deptById = new Map(orgDepartments.map((d) => [d.id, d]));

  let sourceNodes: Array<{
    id: string;
    employeeNumber: string;
    fullName: string;
    jobTitle: string;
    departmentId: string;
    departmentName: string;
    departmentHeadId: string | null;
    managerId: string | null;
    positionId: string | null;
    location: string;
    employmentType: string;
    status: string;
  }> = [];

  let historicalMode = false;
  let historicalDataGap = false;
  let historicalNotice: string | null = null;

  if (asOf) {
    historicalMode = true;
    const allEmployees = process.env.DATABASE_URL
      ? await db
          .select()
          .from(employeesTable)
          .where(eq(employeesTable.organizationId, params.organizationId))
      : params.demoEmployees;

    const allHistory = process.env.DATABASE_URL
      ? await db
          .select()
          .from(employeeAssignmentHistoryTable)
          .where(eq(employeeAssignmentHistoryTable.organizationId, params.organizationId))
          .orderBy(
            desc(employeeAssignmentHistoryTable.effectiveDate),
            desc(employeeAssignmentHistoryTable.createdAt),
          )
      : [...phase2MemoryStore.assignmentHistory]
          .filter((h) => h.organizationId === params.organizationId)
          .sort((a, b) => {
            const cmp = b.effectiveDate.localeCompare(a.effectiveDate);
            return cmp !== 0 ? cmp : b.createdAt.getTime() - a.createdAt.getTime();
          });

    const empInfoById = new Map(allEmployees.map((e) => [e.id, e]));
    const matchedByEmp = new Map<string, (typeof allHistory)[number]>();

    for (const h of allHistory) {
      if (matchedByEmp.has(h.employeeId)) continue;
      if (
        h.effectiveDate <= asOf &&
        (!h.effectiveEndDate || h.effectiveEndDate > asOf)
      ) {
        matchedByEmp.set(h.employeeId, h);
      }
    }

    if (matchedByEmp.size === 0) {
      historicalDataGap = true;
      historicalNotice = `No persisted effective-dated assignment history snapshots exist on or before ${asOf}. Historical snapshots are only shown from real Phase 2 assignment history and are never fabricated.`;
    } else if (matchedByEmp.size < allEmployees.length) {
      historicalDataGap = true;
      historicalNotice = `Showing ${matchedByEmp.size} persisted assignment history snapshot(s) active as of ${asOf}. Employees without pre-${asOf} Phase 2 history entries are omitted rather than fabricated.`;
    }

    sourceNodes = [...matchedByEmp.values()].map((h) => {
      const emp = empInfoById.get(h.employeeId);
      const dept = h.departmentId ? deptById.get(h.departmentId) : undefined;
      return {
        id: h.employeeId,
        employeeNumber: emp?.employeeNumber ?? "HIST",
        fullName: emp ? `${emp.firstName} ${emp.lastName}` : h.employeeId,
        jobTitle: h.jobTitle,
        departmentId: h.departmentId ?? "",
        departmentName: dept?.name ?? "Unassigned",
        departmentHeadId: dept?.managerEmployeeId ?? null,
        managerId: h.managerId ?? null,
        positionId: h.positionId ?? null,
        location: h.location,
        employmentType: h.employmentType,
        status: h.status,
      };
    });
  } else {
    const rawEmps = process.env.DATABASE_URL
      ? await db
          .select()
          .from(employeesTable)
          .where(eq(employeesTable.organizationId, params.organizationId))
      : params.demoEmployees.map((de) => ({
          ...de,
          positionId: phase2MemoryStore.employeeExtras.get(de.id)?.positionId ?? null,
        }));

    sourceNodes = rawEmps.map((e) => {
      const dept = deptById.get(e.departmentId);
      return {
        id: e.id,
        employeeNumber: e.employeeNumber,
        fullName: `${e.firstName} ${e.lastName}`.trim(),
        jobTitle: e.jobTitle,
        departmentId: e.departmentId,
        departmentName: dept?.name ?? "Unassigned",
        departmentHeadId: dept?.managerEmployeeId ?? null,
        managerId: e.managerId,
        positionId: e.positionId ?? null,
        location: e.location,
        employmentType: e.employmentType,
        status: e.status,
      };
    });
  }

  // Apply search/view filters cleanly
  const filteredNodes = sourceNodes.filter((n) => {
    if (params.departmentId && n.departmentId !== params.departmentId) return false;
    if (params.status && n.status !== params.status) return false;
    if (params.location && n.location !== params.location) return false;
    return true;
  });

  // Hierarchy integrity diagnostics on full snapshot
  const nodeById = new Map(sourceNodes.map((n) => [n.id, n]));
  const integrityAlerts: OrgIntegrityAlert[] = [];
  const brokenCycleLinks = new Set<string>();

  for (const node of sourceNodes) {
    if (!deptById.has(node.departmentId)) {
      integrityAlerts.push({
        code: "MISSING_DEPARTMENT",
        severity: "warning",
        employeeId: node.id,
        message: `${node.fullName} (${node.employeeNumber}) references a missing department.`,
      });
    }
    if (!node.managerId) continue;

    if (node.managerId === node.id) {
      integrityAlerts.push({
        code: "SELF_REPORTING",
        severity: "critical",
        employeeId: node.id,
        message: `${node.fullName} is configured as their own reporting manager.`,
      });
      brokenCycleLinks.add(node.id);
      continue;
    }

    const mgr = nodeById.get(node.managerId);
    if (!mgr) {
      integrityAlerts.push({
        code: "MISSING_MANAGER",
        severity: "warning",
        employeeId: node.id,
        message: `${node.fullName} references a missing manager (${node.managerId}).`,
      });
      continue;
    }

    if (mgr.status === "former" && node.status !== "former") {
      integrityAlerts.push({
        code: "INACTIVE_MANAGER",
        severity: "warning",
        employeeId: node.id,
        message: `${node.fullName} reports to former employee ${mgr.fullName}.`,
      });
    }

    // Cycle detection walk
    const visited = new Set<string>([node.id]);
    let cursor: string | null = node.managerId;
    while (cursor) {
      if (visited.has(cursor)) {
        integrityAlerts.push({
          code: "CYCLE_DETECTED",
          severity: "critical",
          employeeId: node.id,
          message: `Circular reporting cycle detected involving ${node.fullName}.`,
        });
        brokenCycleLinks.add(node.id);
        break;
      }
      visited.add(cursor);
      cursor = nodeById.get(cursor)?.managerId ?? null;
    }
  }

  // Span of control counts (safe from cycles)
  const directReportsCountMap = new Map<string, number>();
  for (const n of sourceNodes) {
    if (n.managerId && !brokenCycleLinks.has(n.id)) {
      directReportsCountMap.set(
        n.managerId,
        (directReportsCountMap.get(n.managerId) ?? 0) + 1,
      );
    }
  }

  const totalSubtreeCache = new Map<string, number>();
  const childrenByMgr = new Map<string, string[]>();
  for (const n of sourceNodes) {
    if (n.managerId && !brokenCycleLinks.has(n.id) && nodeById.has(n.managerId)) {
      const list = childrenByMgr.get(n.managerId) ?? [];
      list.push(n.id);
      childrenByMgr.set(n.managerId, list);
    }
  }

  function computeSpan(empId: string, stack = new Set<string>()): number {
    if (totalSubtreeCache.has(empId)) return totalSubtreeCache.get(empId)!;
    if (stack.has(empId)) return 0;
    stack.add(empId);
    const kids = childrenByMgr.get(empId) ?? [];
    let total = kids.length;
    for (const k of kids) {
      total += computeSpan(k, stack);
    }
    stack.delete(empId);
    totalSubtreeCache.set(empId, total);
    return total;
  }

  const enrichedNodes = filteredNodes.map((n) => {
    const safeManagerId = brokenCycleLinks.has(n.id) ? null : n.managerId;
    return {
      ...n,
      managerId: safeManagerId,
      rawManagerId: n.managerId,
      directReportsCount: directReportsCountMap.get(n.id) ?? 0,
      totalSpanOfControl: computeSpan(n.id),
      isDepartmentHead: n.departmentHeadId === n.id,
      hasIntegrityIssue: brokenCycleLinks.has(n.id),
    };
  });

  // Load positions establishment when view === "position" or for summary
  const posResult = await listPositionsWithOccupancy(
    params.organizationId,
    params.demoEmployees,
    params.demoDepartments,
  );

  return {
    view,
    asOf,
    historicalMode,
    historicalDataGap,
    historicalNotice,
    totalNodes: enrichedNodes.length,
    integrityAlerts,
    departments: orgDepartments.map((d) => ({
      id: d.id,
      code: d.code,
      name: d.name,
      location: d.location,
      managerEmployeeId: d.managerEmployeeId,
      budgetedPositions: d.budgetedPositions,
      activeHeadcount: sourceNodes.filter(
        (n) => n.departmentId === d.id && n.status !== "former",
      ).length,
    })),
    nodes: enrichedNodes,
    positions: posResult.positions,
    establishmentSummary: posResult.summary,
  };
}

export async function listPositionsWithOccupancy(
  organizationId: string,
  demoEmployees: Array<{ id: string; firstName: string; lastName: string; employeeNumber: string; departmentId: string; status: string }>,
  demoDepartments: Array<{ id: string; code: string; name: string; budgetedPositions: number }>,
) {
  const positions: PositionRecord[] = process.env.DATABASE_URL
    ? await db
        .select()
        .from(positionsTable)
        .where(eq(positionsTable.organizationId, organizationId))
        .orderBy(positionsTable.positionCode)
    : [...phase2MemoryStore.positions]
        .filter((p) => p.organizationId === organizationId)
        .sort((a, b) => a.positionCode.localeCompare(b.positionCode));

  const assignments = process.env.DATABASE_URL
    ? await db
        .select()
        .from(employeePositionAssignmentsTable)
        .where(
          and(
            eq(employeePositionAssignmentsTable.organizationId, organizationId),
            eq(employeePositionAssignmentsTable.isCurrent, true),
          ),
        )
    : phase2MemoryStore.positionAssignments.filter(
        (a) => a.organizationId === organizationId && a.isCurrent,
      );

  const employees = process.env.DATABASE_URL
    ? await db
        .select({
          id: employeesTable.id,
          firstName: employeesTable.firstName,
          lastName: employeesTable.lastName,
          employeeNumber: employeesTable.employeeNumber,
          departmentId: employeesTable.departmentId,
          status: employeesTable.status,
          positionId: employeesTable.positionId,
        })
        .from(employeesTable)
        .where(eq(employeesTable.organizationId, organizationId))
    : demoEmployees.map((de) => ({
        ...de,
        positionId: phase2MemoryStore.employeeExtras.get(de.id)?.positionId ?? null,
      }));

  const departments = process.env.DATABASE_URL
    ? await db
        .select()
        .from(departmentsTable)
        .where(eq(departmentsTable.organizationId, organizationId))
    : demoDepartments;

  const deptMap = new Map(departments.map((d) => [d.id, d]));
  const empMap = new Map(employees.map((e) => [e.id, e]));

  const occupantsByPosId = new Map<
    string,
    Array<{ id: string; employeeNumber: string; fullName: string; status: string }>
  >();

  for (const a of assignments) {
    const emp = empMap.get(a.employeeId);
    if (!emp || emp.status === "former") continue;
    const list = occupantsByPosId.get(a.positionId) ?? [];
    list.push({
      id: emp.id,
      employeeNumber: emp.employeeNumber,
      fullName: `${emp.firstName} ${emp.lastName}`.trim(),
      status: emp.status,
    });
    occupantsByPosId.set(a.positionId, list);
  }

  for (const emp of employees) {
    if (!emp.positionId || emp.status === "former") continue;
    const list = occupantsByPosId.get(emp.positionId) ?? [];
    if (!list.some((o) => o.id === emp.id)) {
      list.push({
        id: emp.id,
        employeeNumber: emp.employeeNumber,
        fullName: `${emp.firstName} ${emp.lastName}`.trim(),
        status: emp.status,
      });
      occupantsByPosId.set(emp.positionId, list);
    }
  }

  const enrichedPositions = positions.map((pos) => {
    const dept = deptMap.get(pos.departmentId);
    const occupants = occupantsByPosId.get(pos.id) ?? [];
    const filledCount = occupants.length;
    const openSlots =
      pos.status === "frozen" || pos.status === "abolished" || pos.status === "draft"
        ? 0
        : Math.max(0, pos.budgetedHeadcount - filledCount);
    return {
      ...pos,
      departmentCode: dept?.code ?? "",
      departmentName: dept?.name ?? "",
      occupants,
      filledHeadcount: filledCount,
      openSlots,
    };
  });

  const activeHeadcount = employees.filter((e) => e.status !== "former").length;
  const approvedOrActivePositions = enrichedPositions.filter((p) =>
    ["approved", "vacant", "occupied"].includes(p.status),
  );
  const openVacanciesCount = enrichedPositions.reduce((sum, p) => sum + p.openSlots, 0);
  const occupiedPositionsCount = enrichedPositions.filter(
    (p) => p.filledHeadcount > 0 || p.status === "occupied",
  ).length;
  const approvedBudgetedSlots = approvedOrActivePositions.reduce(
    (sum, p) => sum + p.budgetedHeadcount,
    0,
  );
  const departmentBudgetedCapacity = departments.reduce(
    (sum, d) => sum + (d.budgetedPositions || 0),
    0,
  );

  return {
    positions: enrichedPositions,
    summary: {
      activeHeadcount,
      totalPositions: enrichedPositions.length,
      approvedPositionsCount: approvedOrActivePositions.length,
      approvedBudgetedSlots,
      occupiedPositionsCount,
      openVacanciesCount,
      vacantPositionsCount: enrichedPositions.filter(
        (p) => p.status === "vacant" || (p.status === "approved" && p.filledHeadcount === 0),
      ).length,
      frozenPositionsCount: enrichedPositions.filter((p) => p.status === "frozen").length,
      abolishedPositionsCount: enrichedPositions.filter((p) => p.status === "abolished").length,
      departmentBudgetedCapacity,
    },
  };
}

export async function createPosition(params: {
  organizationId: string;
  actorUserId: string;
  actorName: string;
  positionCode: string;
  title: string;
  departmentId: string;
  reportsToPositionId?: string | null;
  location: string;
  employmentType: "permanent" | "fixed_term" | "casual" | "intern";
  employeeCategory?: string;
  budgetedHeadcount?: number;
  gradeBand?: string | null;
  costCenter?: string | null;
  description?: string | null;
  initialStatus?: "draft" | "pending_approval" | "approved" | "vacant";
  demoDepartments?: Array<{ id: string }>;
}) {
  const code = params.positionCode.trim().toUpperCase();
  const status = params.initialStatus ?? "draft";
  const budgeted = Math.max(1, params.budgetedHeadcount ?? 1);

  if (process.env.DATABASE_URL) {
    const [dept] = await db
      .select()
      .from(departmentsTable)
      .where(
        and(
          eq(departmentsTable.organizationId, params.organizationId),
          eq(departmentsTable.id, params.departmentId),
        ),
      )
      .limit(1);
    if (!dept) {
      throw new Error("Department not found in this organization.");
    }
    const existing = await db
      .select()
      .from(positionsTable)
      .where(
        and(
          eq(positionsTable.organizationId, params.organizationId),
          eq(positionsTable.positionCode, code),
        ),
      )
      .limit(1);
    if (existing[0]) {
      throw new Error(`Position code '${code}' already exists in this organization.`);
    }

    const [created] = await db
      .insert(positionsTable)
      .values({
        organizationId: params.organizationId,
        positionCode: code,
        title: params.title.trim(),
        departmentId: params.departmentId,
        reportsToPositionId: params.reportsToPositionId ?? null,
        location: params.location.trim(),
        employmentType: params.employmentType,
        employeeCategory: params.employeeCategory?.trim() || "staff",
        status,
        budgetedHeadcount: budgeted,
        gradeBand: params.gradeBand ?? null,
        costCenter: params.costCenter ?? null,
        description: params.description ?? null,
        createdByUserId: params.actorUserId,
        approvedByUserId:
          status === "approved" || status === "vacant" ? params.actorUserId : null,
        approvedAt: status === "approved" || status === "vacant" ? new Date() : null,
      })
      .returning();

    await recordAuditEvent({
      organizationId: params.organizationId,
      actorUserId: params.actorUserId,
      actor: params.actorName,
      action: "position.created",
      targetType: "position",
      targetId: created!.id,
      summary: `Created position ${created!.positionCode} (${created!.title}) in status '${status}'`,
    });

    return created!;
  }

  const deptExists = (params.demoDepartments ?? []).some(
    (d) => d.id === params.departmentId,
  );
  if (!deptExists) {
    throw new Error("Department not found in this organization.");
  }
  if (
    phase2MemoryStore.positions.some(
      (p) => p.organizationId === params.organizationId && p.positionCode === code,
    )
  ) {
    throw new Error(`Position code '${code}' already exists in this organization.`);
  }

  const now = new Date();
  const created: PositionRecord = {
    id: randomUUID(),
    organizationId: params.organizationId,
    positionCode: code,
    title: params.title.trim(),
    departmentId: params.departmentId,
    reportsToPositionId: params.reportsToPositionId ?? null,
    location: params.location.trim(),
    employmentType: params.employmentType,
    employeeCategory: params.employeeCategory?.trim() || "staff",
    status,
    budgetedHeadcount: budgeted,
    gradeBand: params.gradeBand ?? null,
    costCenter: params.costCenter ?? null,
    description: params.description ?? null,
    createdByUserId: params.actorUserId,
    approvedByUserId:
      status === "approved" || status === "vacant" ? params.actorUserId : null,
    approvedAt: status === "approved" || status === "vacant" ? now : null,
    createdAt: now,
    updatedAt: now,
  };
  phase2MemoryStore.positions.push(created);

  await recordAuditEvent({
    organizationId: params.organizationId,
    actorUserId: params.actorUserId,
    actor: params.actorName,
    action: "position.created",
    targetType: "position",
    targetId: created.id,
    summary: `Created position ${created.positionCode} (${created.title}) in status '${status}'`,
    isDemo: true,
  });

  return created;
}

export async function transitionPositionStatus(params: {
  organizationId: string;
  actorUserId: string;
  actorName: string;
  positionId: string;
  targetStatus: "draft" | "pending_approval" | "approved" | "vacant" | "occupied" | "frozen" | "abolished";
  demoEmployees: Array<{ id: string; status: string }>;
}) {
  const existing = process.env.DATABASE_URL
    ? (
        await db
          .select()
          .from(positionsTable)
          .where(
            and(
              eq(positionsTable.organizationId, params.organizationId),
              eq(positionsTable.id, params.positionId),
            ),
          )
          .limit(1)
      )[0]
    : phase2MemoryStore.positions.find(
        (p) => p.organizationId === params.organizationId && p.id === params.positionId,
      );

  if (!existing) {
    throw new Error("Position not found.");
  }

  const allowed = VALID_POSITION_TRANSITIONS[existing.status] ?? new Set();
  if (!allowed.has(params.targetStatus)) {
    throw new Error(
      `Invalid position status transition from '${existing.status}' to '${params.targetStatus}'.`,
    );
  }

  // Block abolishing an occupied position
  if (params.targetStatus === "abolished") {
    const activeOccupants = process.env.DATABASE_URL
      ? (
          await db
            .select()
            .from(employeePositionAssignmentsTable)
            .where(
              and(
                eq(employeePositionAssignmentsTable.organizationId, params.organizationId),
                eq(employeePositionAssignmentsTable.positionId, existing.id),
                eq(employeePositionAssignmentsTable.isCurrent, true),
              ),
            )
        ).length
      : phase2MemoryStore.positionAssignments.filter(
          (a) =>
            a.organizationId === params.organizationId &&
            a.positionId === existing.id &&
            a.isCurrent,
        ).length;

    if (activeOccupants > 0) {
      throw new Error(
        `Cannot abolish position '${existing.positionCode}' while ${activeOccupants} active employee assignment(s) remain.`,
      );
    }
  }

  if (process.env.DATABASE_URL) {
    const [updated] = await db
      .update(positionsTable)
      .set({
        status: params.targetStatus,
        approvedByUserId:
          params.targetStatus === "approved" || params.targetStatus === "vacant"
            ? params.actorUserId
            : existing.approvedByUserId,
        approvedAt:
          params.targetStatus === "approved" || params.targetStatus === "vacant"
            ? new Date()
            : existing.approvedAt,
      })
      .where(eq(positionsTable.id, existing.id))
      .returning();

    await recordAuditEvent({
      organizationId: params.organizationId,
      actorUserId: params.actorUserId,
      actor: params.actorName,
      action: "position.status_changed",
      targetType: "position",
      targetId: existing.id,
      summary: `Position ${existing.positionCode}: ${existing.status} -> ${params.targetStatus}`,
    });
    return updated!;
  }

  existing.status = params.targetStatus;
  if (params.targetStatus === "approved" || params.targetStatus === "vacant") {
    existing.approvedByUserId = params.actorUserId;
    existing.approvedAt = new Date();
  }
  existing.updatedAt = new Date();

  await recordAuditEvent({
    organizationId: params.organizationId,
    actorUserId: params.actorUserId,
    actor: params.actorName,
    action: "position.status_changed",
    targetType: "position",
    targetId: existing.id,
    summary: `Position ${existing.positionCode}: ${existing.status} -> ${params.targetStatus}`,
    isDemo: true,
  });

  return existing;
}

