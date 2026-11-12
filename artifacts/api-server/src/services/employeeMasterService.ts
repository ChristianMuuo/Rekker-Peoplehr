import { randomUUID } from "node:crypto";
import { and, desc, eq, inArray } from "drizzle-orm";
import {
  db,
  departmentsTable,
  documentsTable,
  employeeAssignmentHistoryTable,
  employeePositionAssignmentsTable,
  employeesTable,
  leaveRequestsTable,
  onboardingTasksTable,
  positionsTable,
  privacyRequestsTable,
  probationReviewsTable,
  profileCorrectionRequestsTable,
  type EmployeeAssignmentHistoryRecord,
  type EmployeeRecord,
} from "@workspace/db";
import { recordAuditEvent } from "../lib/auditService";
import { evaluateEmployeeSection10Completeness } from "./kenyaComplianceService";
import { phase2MemoryStore } from "./phase2MemoryStore";

export interface HierarchyNodeCandidate {
  id: string;
  organizationId?: string;
  managerId: string | null;
  status?: string;
  firstName?: string;
  lastName?: string;
}

export class HierarchyValidationError extends Error {
  readonly code: string;
  readonly statusCode: number;

  constructor(code: string, message: string, statusCode = 400) {
    super(message);
    this.name = "HierarchyValidationError";
    this.code = code;
    this.statusCode = statusCode;
  }
}

/**
 * Validates managerId assignment for an employee within an organization.
 * Prevents self-reporting, cross-organization references, inactive managers, and multi-hop reporting cycles.
 */
export function assertValidManagerAssignment(params: {
  organizationId: string;
  employeeId?: string | null;
  managerId: string | null | undefined;
  employeesById: Map<string, HierarchyNodeCandidate>;
  allowFormerManager?: boolean;
}): void {
  const { organizationId, employeeId, managerId, employeesById, allowFormerManager } = params;
  if (!managerId) return;

  if (employeeId && managerId === employeeId) {
    throw new HierarchyValidationError(
      "SELF_MANAGER_FORBIDDEN",
      "An employee cannot be assigned as their own manager.",
    );
  }

  const manager = employeesById.get(managerId);
  if (!manager) {
    throw new HierarchyValidationError(
      "MANAGER_NOT_FOUND",
      "Specified manager does not exist in this organization.",
    );
  }

  if (manager.organizationId && manager.organizationId !== organizationId) {
    throw new HierarchyValidationError(
      "CROSS_TENANT_MANAGER_FORBIDDEN",
      "Manager must belong to the same organization.",
      403,
    );
  }

  if (!allowFormerManager && manager.status === "former") {
    throw new HierarchyValidationError(
      "INACTIVE_MANAGER_FORBIDDEN",
      "A former employee cannot be assigned as an active reporting manager.",
    );
  }

  if (!employeeId) return;

  // Walk upward from managerId to verify employeeId is not an ancestor (which would create a cycle)
  const visited = new Set<string>([employeeId]);
  let cursor: string | null = managerId;
  let hops = 0;
  const maxHops = employeesById.size + 5;

  while (cursor) {
    if (visited.has(cursor)) {
      throw new HierarchyValidationError(
        "REPORTING_CYCLE_DETECTED",
        "Reporting hierarchy cycle detected: assigning this manager creates a circular reporting chain.",
      );
    }
    visited.add(cursor);
    hops += 1;
    if (hops > maxHops) {
      throw new HierarchyValidationError(
        "REPORTING_CHAIN_DEPTH_EXCEEDED",
        "Reporting chain exceeds valid organization depth.",
      );
    }
    const nextNode = employeesById.get(cursor);
    cursor = nextNode?.managerId ?? null;
  }
}

export async function recordAssignmentHistoryEntry(params: {
  organizationId: string;
  employeeId: string;
  effectiveDate: string;
  changeType:
    | "hire"
    | "bulk_import"
    | "transfer"
    | "promotion"
    | "manager_change"
    | "position_change"
    | "status_change"
    | "contract_renewal"
    | "offboarding"
    | "profile_update";
  departmentId: string;
  positionId?: string | null;
  managerId?: string | null;
  jobTitle: string;
  location: string;
  employmentType: string;
  status: string;
  reason?: string | null;
  approvedByUserId?: string | null;
  changedByUserId?: string | null;
  previousSnapshot?: Record<string, unknown> | null;
  tx?: typeof db;
}): Promise<EmployeeAssignmentHistoryRecord> {
  const effectiveDate = params.effectiveDate.slice(0, 10);

  if (process.env.DATABASE_URL) {
    const runner = params.tx ?? db;
    // Close open historical row if effectiveDate >= prior row
    const priorRows = await runner
      .select()
      .from(employeeAssignmentHistoryTable)
      .where(
        and(
          eq(employeeAssignmentHistoryTable.organizationId, params.organizationId),
          eq(employeeAssignmentHistoryTable.employeeId, params.employeeId),
        ),
      )
      .orderBy(desc(employeeAssignmentHistoryTable.effectiveDate), desc(employeeAssignmentHistoryTable.createdAt))
      .limit(1);

    if (priorRows[0] && !priorRows[0].effectiveEndDate) {
      await runner
        .update(employeeAssignmentHistoryTable)
        .set({ effectiveEndDate: effectiveDate })
        .where(eq(employeeAssignmentHistoryTable.id, priorRows[0].id));
    }

    const [created] = await runner
      .insert(employeeAssignmentHistoryTable)
      .values({
        organizationId: params.organizationId,
        employeeId: params.employeeId,
        effectiveDate,
        effectiveEndDate: null,
        changeType: params.changeType,
        departmentId: params.departmentId,
        positionId: params.positionId ?? null,
        managerId: params.managerId ?? null,
        jobTitle: params.jobTitle,
        location: params.location,
        employmentType: params.employmentType,
        status: params.status,
        reason: params.reason ?? null,
        approvedByUserId: params.approvedByUserId ?? null,
        changedByUserId: params.changedByUserId ?? null,
        previousSnapshotJson: params.previousSnapshot
          ? JSON.stringify(params.previousSnapshot)
          : null,
      })
      .returning();

    return created!;
  }

  const orgRows = phase2MemoryStore.assignmentHistory
    .filter(
      (r) =>
        r.organizationId === params.organizationId &&
        r.employeeId === params.employeeId &&
        !r.effectiveEndDate,
    )
    .sort((a, b) => b.effectiveDate.localeCompare(a.effectiveDate));

  if (orgRows[0]) {
    orgRows[0].effectiveEndDate = effectiveDate;
  }

  const record: EmployeeAssignmentHistoryRecord = {
    id: randomUUID(),
    organizationId: params.organizationId,
    employeeId: params.employeeId,
    effectiveDate,
    effectiveEndDate: null,
    changeType: params.changeType,
    departmentId: params.departmentId,
    positionId: params.positionId ?? null,
    managerId: params.managerId ?? null,
    jobTitle: params.jobTitle,
    location: params.location,
    employmentType: params.employmentType,
    status: params.status,
    reason: params.reason ?? null,
    approvedByUserId: params.approvedByUserId ?? null,
    changedByUserId: params.changedByUserId ?? null,
    previousSnapshotJson: params.previousSnapshot
      ? JSON.stringify(params.previousSnapshot)
      : null,
    createdAt: new Date(),
  };

  phase2MemoryStore.assignmentHistory.push(record);
  return record;
}

export async function listEmployeeAssignmentHistory(
  organizationId: string,
  employeeId: string,
): Promise<EmployeeAssignmentHistoryRecord[]> {
  if (process.env.DATABASE_URL) {
    return db
      .select()
      .from(employeeAssignmentHistoryTable)
      .where(
        and(
          eq(employeeAssignmentHistoryTable.organizationId, organizationId),
          eq(employeeAssignmentHistoryTable.employeeId, employeeId),
        ),
      )
      .orderBy(
        desc(employeeAssignmentHistoryTable.effectiveDate),
        desc(employeeAssignmentHistoryTable.createdAt),
      );
  }

  return phase2MemoryStore.assignmentHistory
    .filter(
      (row) =>
        row.organizationId === organizationId && row.employeeId === employeeId,
    )
    .sort((a, b) => {
      const dateCmp = b.effectiveDate.localeCompare(a.effectiveDate);
      if (dateCmp !== 0) return dateCmp;
      return b.createdAt.getTime() - a.createdAt.getTime();
    });
}

export async function applyEffectiveDatedAssignmentChange(params: {
  organizationId: string;
  actorUserId: string;
  actorName: string;
  employeeId: string;
  effectiveDate: string;
  changeType:
    | "transfer"
    | "promotion"
    | "manager_change"
    | "position_change"
    | "status_change"
    | "contract_renewal"
    | "offboarding"
    | "profile_update";
  reason: string;
  departmentId?: string;
  positionId?: string | null;
  managerId?: string | null;
  jobTitle?: string;
  location?: string;
  employmentType?: "permanent" | "fixed_term" | "casual" | "intern";
  status?: "active" | "probation" | "on_leave" | "suspended" | "former";
  contractEndDate?: string | null;
  probationEndDate?: string | null;
  demoEmployees?: Array<{
    id: string;
    employeeNumber: string;
    firstName: string;
    lastName: string;
    departmentId: string;
    departmentName: string;
    managerId: string | null;
    managerName: string | null;
    jobTitle: string;
    location: string;
    employmentType: "permanent" | "fixed_term" | "casual" | "intern";
    status: "active" | "probation" | "on_leave" | "suspended" | "former";
    startDate: string | Date;
    probationEndDate: string | Date | null;
    contractEndDate: string | Date | null;
  }>;
  demoDepartments?: Array<{ id: string; name: string }>;
}) {
  if (process.env.DATABASE_URL) {
    return db.transaction(async (tx) => {
      const allEmployees = await tx
        .select()
        .from(employeesTable)
        .where(eq(employeesTable.organizationId, params.organizationId));
      const existing = allEmployees.find((e) => e.id === params.employeeId);
      if (!existing) {
        throw new HierarchyValidationError("EMPLOYEE_NOT_FOUND", "Employee not found.", 404);
      }

      const nextDepartmentId = params.departmentId ?? existing.departmentId;
      const [dept] = await tx
        .select()
        .from(departmentsTable)
        .where(
          and(
            eq(departmentsTable.organizationId, params.organizationId),
            eq(departmentsTable.id, nextDepartmentId),
          ),
        )
        .limit(1);
      if (!dept) {
        throw new HierarchyValidationError("DEPARTMENT_NOT_FOUND", "Department not found.", 400);
      }

      const nextManagerId =
        params.managerId !== undefined ? params.managerId : existing.managerId;
      const empMap = new Map<string, HierarchyNodeCandidate>(
        allEmployees.map((e) => [
          e.id,
          {
            id: e.id,
            organizationId: e.organizationId,
            managerId: e.managerId,
            status: e.status,
          },
        ]),
      );
      assertValidManagerAssignment({
        organizationId: params.organizationId,
        employeeId: existing.id,
        managerId: nextManagerId,
        employeesById: empMap,
      });

      const nextPositionId =
        params.positionId !== undefined ? params.positionId : existing.positionId;

      if (nextPositionId && nextPositionId !== existing.positionId) {
        const [pos] = await tx
          .select()
          .from(positionsTable)
          .where(
            and(
              eq(positionsTable.organizationId, params.organizationId),
              eq(positionsTable.id, nextPositionId),
            ),
          )
          .limit(1);
        if (!pos) {
          throw new HierarchyValidationError("POSITION_NOT_FOUND", "Target position not found.", 400);
        }
        if (["frozen", "abolished", "draft"].includes(pos.status)) {
          throw new HierarchyValidationError(
            "POSITION_NOT_ASSIGNABLE",
            `Position '${pos.positionCode}' is in '${pos.status}' state and cannot accept new assignments.`,
            400,
          );
        }
        // Close previous position assignment & open new one
        await tx
          .update(employeePositionAssignmentsTable)
          .set({ isCurrent: false, effectiveTo: params.effectiveDate })
          .where(
            and(
              eq(employeePositionAssignmentsTable.organizationId, params.organizationId),
              eq(employeePositionAssignmentsTable.employeeId, existing.id),
              eq(employeePositionAssignmentsTable.isCurrent, true),
            ),
          );
        await tx.insert(employeePositionAssignmentsTable).values({
          organizationId: params.organizationId,
          employeeId: existing.id,
          positionId: nextPositionId,
          assignmentType: "primary",
          effectiveFrom: params.effectiveDate,
          isCurrent: true,
          changeReason: params.reason,
          changedByUserId: params.actorUserId,
        });
        await tx
          .update(positionsTable)
          .set({ status: "occupied" })
          .where(eq(positionsTable.id, nextPositionId));
      }

      if (existing.positionId && (nextPositionId !== existing.positionId || params.status === "former")) {
        const remaining = await tx
          .select()
          .from(employeePositionAssignmentsTable)
          .where(
            and(
              eq(employeePositionAssignmentsTable.organizationId, params.organizationId),
              eq(employeePositionAssignmentsTable.positionId, existing.positionId),
              eq(employeePositionAssignmentsTable.isCurrent, true),
            ),
          );
        if (remaining.length === 0) {
          await tx
            .update(positionsTable)
            .set({ status: "vacant" })
            .where(eq(positionsTable.id, existing.positionId));
        }
      }

      const [updated] = await tx
        .update(employeesTable)
        .set({
          departmentId: nextDepartmentId,
          positionId: nextPositionId ?? null,
          managerId: nextManagerId ?? null,
          jobTitle: params.jobTitle ?? existing.jobTitle,
          location: params.location ?? existing.location,
          employmentType: params.employmentType ?? existing.employmentType,
          status: params.status ?? existing.status,
          contractEndDate:
            params.contractEndDate !== undefined
              ? params.contractEndDate
              : existing.contractEndDate,
          probationEndDate:
            params.probationEndDate !== undefined
              ? params.probationEndDate
              : existing.probationEndDate,
        })
        .where(
          and(
            eq(employeesTable.organizationId, params.organizationId),
            eq(employeesTable.id, existing.id),
          ),
        )
        .returning();

      const historyEntry = await recordAssignmentHistoryEntry({
        organizationId: params.organizationId,
        employeeId: existing.id,
        effectiveDate: params.effectiveDate,
        changeType: params.changeType,
        departmentId: updated!.departmentId,
        positionId: updated!.positionId,
        managerId: updated!.managerId,
        jobTitle: updated!.jobTitle,
        location: updated!.location,
        employmentType: updated!.employmentType,
        status: updated!.status,
        reason: params.reason,
        approvedByUserId: params.actorUserId,
        changedByUserId: params.actorUserId,
        previousSnapshot: {
          departmentId: existing.departmentId,
          positionId: existing.positionId,
          managerId: existing.managerId,
          jobTitle: existing.jobTitle,
          location: existing.location,
          employmentType: existing.employmentType,
          status: existing.status,
        },
        tx: tx as unknown as typeof db,
      });

      await recordAuditEvent({
        organizationId: params.organizationId,
        actorUserId: params.actorUserId,
        actor: params.actorName,
        action: `employee.lifecycle.${params.changeType}`,
        targetType: "employee",
        targetId: existing.id,
        summary: `${params.changeType} effective ${params.effectiveDate}: ${params.reason}`,
        critical: params.changeType === "offboarding",
        tx: tx as unknown as typeof db,
      });

      return { employee: updated!, historyEntry };
    });
  }

  // Sandbox / offline mode
  const employees = params.demoEmployees ?? [];
  const depts = params.demoDepartments ?? [];
  const existing = employees.find((e) => e.id === params.employeeId);
  if (!existing) {
    throw new HierarchyValidationError("EMPLOYEE_NOT_FOUND", "Employee not found.", 404);
  }

  const nextDepartmentId = params.departmentId ?? existing.departmentId;
  const dept = depts.find((d) => d.id === nextDepartmentId);
  if (!dept) {
    throw new HierarchyValidationError("DEPARTMENT_NOT_FOUND", "Department not found.", 400);
  }

  const nextManagerId =
    params.managerId !== undefined ? params.managerId : existing.managerId;
  const empMap = new Map<string, HierarchyNodeCandidate>(
    employees.map((e) => [
      e.id,
      {
        id: e.id,
        organizationId: params.organizationId,
        managerId: e.managerId,
        status: e.status,
      },
    ]),
  );
  assertValidManagerAssignment({
    organizationId: params.organizationId,
    employeeId: existing.id,
    managerId: nextManagerId,
    employeesById: empMap,
  });

  const extras = phase2MemoryStore.employeeExtras.get(existing.id) ?? {};
  const previousSnapshot = {
    departmentId: existing.departmentId,
    positionId: extras.positionId ?? null,
    managerId: existing.managerId,
    jobTitle: existing.jobTitle,
    location: existing.location,
    employmentType: existing.employmentType,
    status: existing.status,
  };

  const nextPositionId =
    params.positionId !== undefined ? params.positionId : (extras.positionId ?? null);

  if (nextPositionId && nextPositionId !== extras.positionId) {
    const pos = phase2MemoryStore.positions.find(
      (p) => p.organizationId === params.organizationId && p.id === nextPositionId,
    );
    if (!pos) {
      throw new HierarchyValidationError("POSITION_NOT_FOUND", "Target position not found.", 400);
    }
    if (["frozen", "abolished", "draft"].includes(pos.status)) {
      throw new HierarchyValidationError(
        "POSITION_NOT_ASSIGNABLE",
        `Position '${pos.positionCode}' is '${pos.status}' and cannot be assigned.`,
        400,
      );
    }
    for (const a of phase2MemoryStore.positionAssignments) {
      if (
        a.organizationId === params.organizationId &&
        a.employeeId === existing.id &&
        a.isCurrent
      ) {
        a.isCurrent = false;
        a.effectiveTo = params.effectiveDate;
      }
    }
    phase2MemoryStore.positionAssignments.push({
      id: randomUUID(),
      organizationId: params.organizationId,
      employeeId: existing.id,
      positionId: nextPositionId,
      assignmentType: "primary",
      effectiveFrom: params.effectiveDate,
      effectiveTo: null,
      isCurrent: true,
      changeReason: params.reason,
      changedByUserId: params.actorUserId,
      createdAt: new Date(),
    });
    pos.status = "occupied";
    pos.updatedAt = new Date();
  }

  if (
    extras.positionId &&
    (nextPositionId !== extras.positionId || params.status === "former")
  ) {
    if (params.status === "former") {
      for (const a of phase2MemoryStore.positionAssignments) {
        if (
          a.organizationId === params.organizationId &&
          a.employeeId === existing.id &&
          a.isCurrent
        ) {
          a.isCurrent = false;
          a.effectiveTo = params.effectiveDate;
        }
      }
    }
    const oldPos = phase2MemoryStore.positions.find(
      (p) => p.organizationId === params.organizationId && p.id === extras.positionId,
    );
    if (oldPos) {
      const activeOccupants = phase2MemoryStore.positionAssignments.filter(
        (a) =>
          a.organizationId === params.organizationId &&
          a.positionId === oldPos.id &&
          a.isCurrent,
      ).length;
      if (activeOccupants === 0 && oldPos.status === "occupied") {
        oldPos.status = "vacant";
        oldPos.updatedAt = new Date();
      }
    }
  }

  existing.departmentId = nextDepartmentId;
  existing.departmentName = dept.name;
  existing.managerId = nextManagerId ?? null;
  const mgrObj = nextManagerId ? employees.find((e) => e.id === nextManagerId) : null;
  existing.managerName = mgrObj ? `${mgrObj.firstName} ${mgrObj.lastName}` : null;
  if (params.jobTitle) existing.jobTitle = params.jobTitle;
  if (params.location) existing.location = params.location;
  if (params.employmentType) existing.employmentType = params.employmentType;
  if (params.status) existing.status = params.status;
  if (params.contractEndDate !== undefined) existing.contractEndDate = params.contractEndDate;
  if (params.probationEndDate !== undefined) existing.probationEndDate = params.probationEndDate;
  phase2MemoryStore.employeeExtras.set(existing.id, {
    ...extras,
    positionId: nextPositionId,
  });

  const historyEntry = await recordAssignmentHistoryEntry({
    organizationId: params.organizationId,
    employeeId: existing.id,
    effectiveDate: params.effectiveDate,
    changeType: params.changeType,
    departmentId: existing.departmentId,
    positionId: nextPositionId,
    managerId: existing.managerId,
    jobTitle: existing.jobTitle,
    location: existing.location,
    employmentType: existing.employmentType,
    status: existing.status,
    reason: params.reason,
    approvedByUserId: params.actorUserId,
    changedByUserId: params.actorUserId,
    previousSnapshot,
  });

  await recordAuditEvent({
    organizationId: params.organizationId,
    actorUserId: params.actorUserId,
    actor: params.actorName,
    action: `employee.lifecycle.${params.changeType}`,
    targetType: "employee",
    targetId: existing.id,
    summary: `${params.changeType} effective ${params.effectiveDate}: ${params.reason}`,
    critical: params.changeType === "offboarding",
    isDemo: true,
  });

  return { employee: existing, historyEntry };
}

export async function getEmployeeLifecycleTimeline(
  organizationId: string,
  employeeId: string,
  fallbackStartDate?: string,
) {
  const history = await listEmployeeAssignmentHistory(organizationId, employeeId);

  if (process.env.DATABASE_URL) {
    const [onboarding, probation, docs, leaves, corrections, privacy] = await Promise.all([
      db
        .select()
        .from(onboardingTasksTable)
        .where(
          and(
            eq(onboardingTasksTable.organizationId, organizationId),
            eq(onboardingTasksTable.employeeId, employeeId),
          ),
        ),
      db
        .select()
        .from(probationReviewsTable)
        .where(
          and(
            eq(probationReviewsTable.organizationId, organizationId),
            eq(probationReviewsTable.employeeId, employeeId),
          ),
        ),
      db
        .select({
          id: documentsTable.id,
          name: documentsTable.name,
          category: documentsTable.category,
          createdAt: documentsTable.createdAt,
        })
        .from(documentsTable)
        .where(
          and(
            eq(documentsTable.organizationId, organizationId),
            eq(documentsTable.employeeId, employeeId),
          ),
        ),
      db
        .select({
          id: leaveRequestsTable.id,
          leaveType: leaveRequestsTable.leaveType,
          startDate: leaveRequestsTable.startDate,
          endDate: leaveRequestsTable.endDate,
          status: leaveRequestsTable.status,
        })
        .from(leaveRequestsTable)
        .where(
          and(
            eq(leaveRequestsTable.organizationId, organizationId),
            eq(leaveRequestsTable.employeeId, employeeId),
          ),
        ),
      db
        .select()
        .from(profileCorrectionRequestsTable)
        .where(
          and(
            eq(profileCorrectionRequestsTable.organizationId, organizationId),
            eq(profileCorrectionRequestsTable.employeeId, employeeId),
          ),
        ),
      db
        .select()
        .from(privacyRequestsTable)
        .where(
          and(
            eq(privacyRequestsTable.organizationId, organizationId),
            eq(privacyRequestsTable.employeeId, employeeId),
          ),
        ),
    ]);

    const events = [
      ...(fallbackStartDate
        ? [
            {
              id: `hire-${employeeId}`,
              date: fallbackStartDate.slice(0, 10),
              category: "hire",
              title: "Employment Commencement",
              details: "Original start date recorded in employee master.",
            },
          ]
        : []),
      ...history.map((h) => ({
        id: h.id,
        date: h.effectiveDate,
        category: h.changeType,
        title: `${h.changeType.replace(/_/g, " ")} — ${h.jobTitle}`,
        details: h.reason || `${h.location} (${h.employmentType})`,
      })),
      ...probation.map((p) => ({
        id: p.id,
        date: p.probationEndDate,
        category: "probation",
        title: `Probation Milestone (${p.milestoneDay}d) — ${p.status}`,
        details: p.outcome ? `Outcome: ${p.outcome}` : "Pending formal review",
      })),
      ...onboarding
        .filter((t) => t.completed && t.completedAt)
        .map((t) => ({
          id: t.id,
          date: t.completedAt!.toISOString().slice(0, 10),
          category: t.workflowType,
          title: `${t.workflowType} task completed: ${t.title}`,
          details: t.category,
        })),
      ...docs.map((d) => ({
        id: d.id,
        date: d.createdAt.toISOString().slice(0, 10),
        category: "document",
        title: `Document archived: ${d.name}`,
        details: d.category,
      })),
      ...leaves
        .filter((l) => l.status === "approved")
        .map((l) => ({
          id: l.id,
          date: l.startDate,
          category: "leave",
          title: `Approved ${l.leaveType} leave`,
          details: `${l.startDate} to ${l.endDate}`,
        })),
      ...corrections.map((c) => ({
        id: c.id,
        date: c.createdAt.toISOString().slice(0, 10),
        category: "profile_correction",
        title: `Profile correction (${c.fieldName}): ${c.status}`,
        details: c.reason,
      })),
      ...privacy.map((pr) => ({
        id: pr.id,
        date: pr.createdAt.toISOString().slice(0, 10),
        category: "privacy",
        title: `Data rights request (${pr.requestType}): ${pr.status}`,
        details: `Statutory due date: ${pr.statutoryDueDate}`,
      })),
    ].sort((a, b) => b.date.localeCompare(a.date));

    return { history, events };
  }

  const probation = phase2MemoryStore.probationReviews.filter(
    (p) => p.organizationId === organizationId && p.employeeId === employeeId,
  );
  const corrections = phase2MemoryStore.profileCorrectionRequests.filter(
    (c) => c.organizationId === organizationId && c.employeeId === employeeId,
  );
  const privacy = phase2MemoryStore.privacyRequests.filter(
    (p) => p.organizationId === organizationId && p.employeeId === employeeId,
  );

  const events = [
    ...(fallbackStartDate
      ? [
          {
            id: `hire-${employeeId}`,
            date: fallbackStartDate.slice(0, 10),
            category: "hire",
            title: "Employment Commencement",
            details: "Original start date recorded in employee master.",
          },
        ]
      : []),
    ...history.map((h) => ({
      id: h.id,
      date: h.effectiveDate,
      category: h.changeType,
      title: `${h.changeType.replace(/_/g, " ")} — ${h.jobTitle}`,
      details: h.reason || `${h.location} (${h.employmentType})`,
    })),
    ...probation.map((p) => ({
      id: p.id,
      date: p.probationEndDate,
      category: "probation",
      title: `Probation Milestone (${p.milestoneDay}d) — ${p.status}`,
      details: p.outcome ? `Outcome: ${p.outcome}` : "Pending formal review",
    })),
    ...corrections.map((c) => ({
      id: c.id,
      date: c.createdAt.toISOString().slice(0, 10),
      category: "profile_correction",
      title: `Profile correction (${c.fieldName}): ${c.status}`,
      details: c.reason,
    })),
    ...privacy.map((pr) => ({
      id: pr.id,
      date: pr.createdAt.toISOString().slice(0, 10),
      category: "privacy",
      title: `Data rights request (${pr.requestType}): ${pr.status}`,
      details: `Statutory due date: ${pr.statutoryDueDate}`,
    })),
  ].sort((a, b) => b.date.localeCompare(a.date));

  return { history, events };
}

export async function getEmployeeCompletenessForOrg(
  organizationId: string,
  demoEmployees: Array<
    Partial<Omit<EmployeeRecord, "startDate" | "probationEndDate" | "contractEndDate">> & {
      id: string;
      employeeNumber: string;
      firstName: string;
      lastName: string;
      workEmail: string;
      jobTitle: string;
      departmentId: string;
      location: string;
      employmentType: string;
      status: string;
      startDate: string | Date;
      probationEndDate?: string | Date | null;
      contractEndDate?: string | Date | null;
    }
  >,
) {
  if (process.env.DATABASE_URL) {
    const employees = await db
      .select()
      .from(employeesTable)
      .where(eq(employeesTable.organizationId, organizationId));
    const empIds = employees.map((e) => e.id);
    const docs =
      empIds.length > 0
        ? await db
            .select({ employeeId: documentsTable.employeeId, category: documentsTable.category })
            .from(documentsTable)
            .where(
              and(
                eq(documentsTable.organizationId, organizationId),
                inArray(documentsTable.employeeId, empIds),
              ),
            )
        : [];
    const contractSet = new Set(
      docs
        .filter((d) => ["contract", "Contract", "offer", "Offer Letter"].includes(d.category))
        .map((d) => d.employeeId)
        .filter((id): id is string => Boolean(id)),
    );
    return employees.map((e) =>
      evaluateEmployeeSection10Completeness(e, {
        hasSignedContractDocument: contractSet.has(e.id),
      }),
    );
  }

  return demoEmployees.map((de) => {
    const extras = phase2MemoryStore.employeeExtras.get(de.id);
    const merged = {
      ...de,
      startDate:
        typeof de.startDate === "object" && de.startDate !== null
          ? de.startDate.toISOString().slice(0, 10)
          : String(de.startDate).slice(0, 10),
      nationalId: extras?.nationalId ?? de.nationalId ?? null,
      emergencyContactJson:
        extras?.emergencyContactJson ?? de.emergencyContactJson ?? null,
    } as EmployeeRecord;
    return evaluateEmployeeSection10Completeness(merged, {
      hasSignedContractDocument: false,
    });
  });
}
