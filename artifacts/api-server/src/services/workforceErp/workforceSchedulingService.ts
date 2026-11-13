import crypto from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import {
  db,
  employeesTable,
  leaveRequestsTable,
  workforceProductionLinesTable,
  workforceShiftAssignmentsTable,
  workforceShiftSwapsTable,
  workforceShiftTemplatesTable,
} from "@workspace/db";
import { recordAuditEvent } from "../../lib/auditService";
import { sanitizeText } from "../../lib/security";
import {
  getOrCreateWorkforceStore,
  type MemProductionLine,
  type MemShiftAssignment,
  type MemShiftSwap,
  type MemShiftTemplate,
} from "./workforceErpMemoryStore";
import { hasVerifiedCompetency } from "./competencyCertificationService";
import { validateVehicleDispatch } from "./driverComplianceService";
import { DEMO_EMPLOYEES_LIST } from "../../routes/peopleos";
import { DEMO_LEAVE_STORE } from "../../routes/leave";

export async function listProductionLines(
  organizationId: string,
): Promise<{ items: MemProductionLine[]; total: number }> {
  if (!process.env.DATABASE_URL) {
    const store = getOrCreateWorkforceStore(organizationId);
    const list = Array.from(store.lines.values());
    return { items: list, total: list.length };
  }

  const rows = await db
    .select()
    .from(workforceProductionLinesTable)
    .where(eq(workforceProductionLinesTable.organizationId, organizationId))
    .orderBy(desc(workforceProductionLinesTable.createdAt));

  const items: MemProductionLine[] = rows.map((r) => ({
    id: r.id,
    organizationId: r.organizationId,
    code: r.code,
    name: r.name,
    departmentId: r.departmentId,
    workZone: r.workZone,
    operationalStatus: r.operationalStatus as MemProductionLine["operationalStatus"],
    requiredRoleTypes: JSON.parse(r.requiredRoleTypesJson || "[]"),
    requiredSkills: JSON.parse(r.requiredSkillsJson || "[]"),
    requiredCertifications: JSON.parse(r.requiredCertificationsJson || "[]"),
    minStaffing: r.minStaffing,
    operatingHours: r.operatingHours,
    supervisorEmployeeId: r.supervisorEmployeeId,
    costCentreCode: r.costCentreCode,
    isActive: r.isActive,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  }));

  return { items, total: items.length };
}

export async function createProductionLine(
  organizationId: string,
  input: {
    code: string;
    name: string;
    departmentId: string;
    workZone: string;
    minStaffing?: number;
    operatingHours?: string;
    supervisorEmployeeId?: string | null;
    costCentreCode?: string;
    requiredRoleTypes?: string[];
    requiredSkills?: string[];
    requiredCertifications?: string[];
  },
  actorUserId: string,
): Promise<MemProductionLine> {
  const code = sanitizeText(input.code, 40).toUpperCase();
  const name = sanitizeText(input.name, 120);
  const departmentId = sanitizeText(input.departmentId, 64);
  const workZone = sanitizeText(input.workZone, 120);
  const minStaffing = Math.max(1, Number(input.minStaffing || 2));
  const operatingHours = sanitizeText(input.operatingHours || "06:00-22:00", 60);
  const costCentreCode = sanitizeText(input.costCentreCode || "CC-MFG-01", 30);
  const requiredRoleTypes = input.requiredRoleTypes ?? ["Process Operator"];
  const requiredSkills = input.requiredSkills ?? ["Machine Operation"];
  const requiredCertifications = input.requiredCertifications ?? ["GMP Cleanroom Protocol"];

  if (!code || !name || !workZone) {
    throw new Error("code, name, and workZone are required.");
  }

  const nowIso = new Date().toISOString();

  if (!process.env.DATABASE_URL) {
    const store = getOrCreateWorkforceStore(organizationId);
    if (Array.from(store.lines.values()).some((l) => l.code === code)) {
      throw new Error(`Production line code '${code}' already exists.`);
    }

    const line: MemProductionLine = {
      id: `line-${crypto.randomUUID().slice(0, 8)}`,
      organizationId,
      code,
      name,
      departmentId,
      workZone,
      operationalStatus: "active",
      requiredRoleTypes,
      requiredSkills,
      requiredCertifications,
      minStaffing,
      operatingHours,
      supervisorEmployeeId: input.supervisorEmployeeId ?? null,
      costCentreCode,
      isActive: true,
      createdAt: nowIso,
      updatedAt: nowIso,
    };
    store.lines.set(line.id, line);

    await recordAuditEvent({
      organizationId,
      actorUserId,
      actor: "production_supervisor",
      action: "PRODUCTION_LINE_CREATED",
      targetType: "production_line",
      targetId: line.id,
      summary: `Configured production line ${code} · ${name} (${workZone})`,
      isDemo: true,
    });

    return line;
  }

  const [created] = await db
    .insert(workforceProductionLinesTable)
    .values({
      organizationId,
      code,
      name,
      departmentId,
      workZone,
      requiredRoleTypesJson: JSON.stringify(requiredRoleTypes),
      requiredSkillsJson: JSON.stringify(requiredSkills),
      requiredCertificationsJson: JSON.stringify(requiredCertifications),
      minStaffing,
      operatingHours,
      supervisorEmployeeId: input.supervisorEmployeeId ?? null,
      costCentreCode,
    })
    .returning();

  await recordAuditEvent({
    organizationId,
    actorUserId,
    actor: "production_supervisor",
    action: "PRODUCTION_LINE_CREATED",
    targetType: "production_line",
    targetId: created!.id,
    summary: `Configured production line ${code} · ${name} (${workZone})`,
  });

  return {
    id: created!.id,
    organizationId: created!.organizationId,
    code: created!.code,
    name: created!.name,
    departmentId: created!.departmentId,
    workZone: created!.workZone,
    operationalStatus: created!.operationalStatus as MemProductionLine["operationalStatus"],
    requiredRoleTypes,
    requiredSkills,
    requiredCertifications,
    minStaffing: created!.minStaffing,
    operatingHours: created!.operatingHours,
    supervisorEmployeeId: created!.supervisorEmployeeId,
    costCentreCode: created!.costCentreCode,
    isActive: created!.isActive,
    createdAt: created!.createdAt.toISOString(),
    updatedAt: created!.updatedAt.toISOString(),
  };
}

export async function listShiftTemplates(
  organizationId: string,
  unitType?: string,
): Promise<{ items: MemShiftTemplate[]; total: number }> {
  if (!process.env.DATABASE_URL) {
    const store = getOrCreateWorkforceStore(organizationId);
    let list = Array.from(store.templates.values());
    if (unitType) list = list.filter((t) => t.unitType === unitType);
    return { items: list, total: list.length };
  }

  const rows = await db
    .select()
    .from(workforceShiftTemplatesTable)
    .where(
      unitType
        ? and(
            eq(workforceShiftTemplatesTable.organizationId, organizationId),
            eq(workforceShiftTemplatesTable.unitType, unitType),
          )
        : eq(workforceShiftTemplatesTable.organizationId, organizationId),
    )
    .orderBy(desc(workforceShiftTemplatesTable.createdAt));

  const items: MemShiftTemplate[] = rows.map((r) => ({
    id: r.id,
    organizationId: r.organizationId,
    code: r.code,
    name: r.name,
    unitType: r.unitType as MemShiftTemplate["unitType"],
    productionLineId: r.productionLineId,
    workZone: r.workZone,
    startTime: r.startTime,
    endTime: r.endTime,
    durationHours: r.durationHours,
    minStaffing: r.minStaffing,
    costCentreCode: r.costCentreCode,
    requiredCompetency: r.requiredCompetency,
    isActive: r.isActive,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  }));

  return { items, total: items.length };
}

export async function createShiftTemplate(
  organizationId: string,
  input: {
    code: string;
    name: string;
    unitType: "production" | "warehouse" | "distribution" | "sales" | "corporate";
    productionLineId?: string | null;
    workZone: string;
    startTime: string;
    endTime: string;
    durationHours?: number;
    minStaffing?: number;
    costCentreCode?: string;
    requiredCompetency?: string;
  },
  actorUserId: string,
): Promise<MemShiftTemplate> {
  const code = sanitizeText(input.code, 40).toUpperCase();
  const name = sanitizeText(input.name, 120);
  const unitType = sanitizeText(input.unitType, 30) as MemShiftTemplate["unitType"];
  const workZone = sanitizeText(input.workZone, 120);
  const startTime = sanitizeText(input.startTime, 10);
  const endTime = sanitizeText(input.endTime, 10);
  const durationHours = Math.max(1, Number(input.durationHours || 8));
  const minStaffing = Math.max(1, Number(input.minStaffing || 2));
  const costCentreCode = sanitizeText(input.costCentreCode || "CC-MFG-01", 30);
  const requiredCompetency = sanitizeText(input.requiredCompetency || "General Operator", 120);

  if (!code || !name || !workZone || !startTime || !endTime) {
    throw new Error("code, name, workZone, startTime and endTime are required.");
  }

  const nowIso = new Date().toISOString();

  if (!process.env.DATABASE_URL) {
    const store = getOrCreateWorkforceStore(organizationId);
    const template: MemShiftTemplate = {
      id: `tpl-${crypto.randomUUID().slice(0, 8)}`,
      organizationId,
      code,
      name,
      unitType,
      productionLineId: input.productionLineId ?? null,
      workZone,
      startTime,
      endTime,
      durationHours,
      minStaffing,
      costCentreCode,
      requiredCompetency,
      isActive: true,
      createdAt: nowIso,
      updatedAt: nowIso,
    };
    store.templates.set(template.id, template);

    await recordAuditEvent({
      organizationId,
      actorUserId,
      actor: "supervisor",
      action: "SHIFT_TEMPLATE_CREATED",
      targetType: "shift_template",
      targetId: template.id,
      summary: `Created shift template ${code} · ${name} (${startTime}-${endTime})`,
      isDemo: true,
    });

    return template;
  }

  const [created] = await db
    .insert(workforceShiftTemplatesTable)
    .values({
      organizationId,
      code,
      name,
      unitType,
      productionLineId: input.productionLineId ?? null,
      workZone,
      startTime,
      endTime,
      durationHours,
      minStaffing,
      costCentreCode,
      requiredCompetency,
    })
    .returning();

  await recordAuditEvent({
    organizationId,
    actorUserId,
    actor: "supervisor",
    action: "SHIFT_TEMPLATE_CREATED",
    targetType: "shift_template",
    targetId: created!.id,
    summary: `Created shift template ${code} · ${name} (${startTime}-${endTime})`,
  });

  return {
    id: created!.id,
    organizationId: created!.organizationId,
    code: created!.code,
    name: created!.name,
    unitType: created!.unitType as MemShiftTemplate["unitType"],
    productionLineId: created!.productionLineId,
    workZone: created!.workZone,
    startTime: created!.startTime,
    endTime: created!.endTime,
    durationHours: created!.durationHours,
    minStaffing: created!.minStaffing,
    costCentreCode: created!.costCentreCode,
    requiredCompetency: created!.requiredCompetency,
    isActive: created!.isActive,
    createdAt: created!.createdAt.toISOString(),
    updatedAt: created!.updatedAt.toISOString(),
  };
}

export async function listShiftAssignments(
  organizationId: string,
  filters?: {
    shiftDate?: string;
    unitType?: string;
    employeeId?: string;
    status?: string;
  },
): Promise<{ items: MemShiftAssignment[]; total: number }> {
  if (!process.env.DATABASE_URL) {
    const store = getOrCreateWorkforceStore(organizationId);
    let list = Array.from(store.assignments.values());
    if (filters?.shiftDate) list = list.filter((a) => a.shiftDate === filters.shiftDate);
    if (filters?.unitType) list = list.filter((a) => a.unitType === filters.unitType);
    if (filters?.employeeId) list = list.filter((a) => a.employeeId === filters.employeeId);
    if (filters?.status) list = list.filter((a) => a.status === filters.status);
    list.sort((a, b) => b.shiftDate.localeCompare(a.shiftDate) || a.startTime.localeCompare(b.startTime));
    return { items: list, total: list.length };
  }

  const rows = await db
    .select({
      asgn: workforceShiftAssignmentsTable,
      emp: employeesTable,
    })
    .from(workforceShiftAssignmentsTable)
    .innerJoin(employeesTable, eq(workforceShiftAssignmentsTable.employeeId, employeesTable.id))
    .where(eq(workforceShiftAssignmentsTable.organizationId, organizationId))
    .orderBy(desc(workforceShiftAssignmentsTable.shiftDate));

  let items: MemShiftAssignment[] = rows.map(({ asgn, emp }) => ({
    id: asgn.id,
    organizationId: asgn.organizationId,
    shiftTemplateId: asgn.shiftTemplateId,
    employeeId: asgn.employeeId,
    employeeName: `${emp.firstName} ${emp.lastName}`,
    productionLineId: asgn.productionLineId,
    unitType: asgn.unitType as MemShiftAssignment["unitType"],
    workZone: asgn.workZone,
    shiftDate: asgn.shiftDate,
    shiftName: asgn.shiftName,
    startTime: asgn.startTime,
    endTime: asgn.endTime,
    roleSkill: asgn.roleSkill,
    costCentreCode: asgn.costCentreCode,
    status: asgn.status as MemShiftAssignment["status"],
    isRelief: asgn.isRelief,
    reliefForEmployeeId: asgn.reliefForEmployeeId,
    reliefReason: asgn.reliefReason,
    supervisorUserId: asgn.supervisorUserId,
    createdByUserId: asgn.createdByUserId,
    notes: asgn.notes,
    createdAt: asgn.createdAt.toISOString(),
    updatedAt: asgn.updatedAt.toISOString(),
  }));

  if (filters?.shiftDate) items = items.filter((a) => a.shiftDate === filters.shiftDate);
  if (filters?.unitType) items = items.filter((a) => a.unitType === filters.unitType);
  if (filters?.employeeId) items = items.filter((a) => a.employeeId === filters.employeeId);
  if (filters?.status) items = items.filter((a) => a.status === filters.status);

  return { items, total: items.length };
}

export async function createShiftAssignment(
  organizationId: string,
  input: {
    employeeId: string;
    unitType?: "production" | "warehouse" | "distribution" | "sales" | "corporate";
    workZone: string;
    shiftDate?: string;
    shiftName?: string;
    startTime?: string;
    endTime?: string;
    roleSkill?: string;
    costCentreCode?: string;
    shiftTemplateId?: string | null;
    productionLineId?: string | null;
    requiredCompetency?: string | null;
    notes?: string | null;
  },
  actorUserId: string,
): Promise<MemShiftAssignment> {
  const employeeId = sanitizeText(input.employeeId, 64);
  const unitType = sanitizeText(input.unitType || "production", 30) as MemShiftAssignment["unitType"];
  const workZone = sanitizeText(input.workZone, 120);
  const shiftDate = sanitizeText(input.shiftDate || new Date().toISOString().slice(0, 10), 10);
  const shiftName = sanitizeText(input.shiftName || "Morning (06:00-14:00)", 80);
  const startTime = sanitizeText(input.startTime || "06:00", 10);
  const endTime = sanitizeText(input.endTime || "14:00", 10);
  const roleSkill = sanitizeText(input.roleSkill || "Line Formulation & Filling", 120);
  const costCentreCode = sanitizeText(input.costCentreCode || "CC-MFG-01", 30);
  const requiredCompetency = input.requiredCompetency ? sanitizeText(input.requiredCompetency, 120) : null;

  if (!employeeId || !workZone) {
    throw new Error("employeeId and workZone are required.");
  }

  // 1. Employee Verification
  let employeeName = "Rekker Employee";
  if (!process.env.DATABASE_URL) {
    const emp = DEMO_EMPLOYEES_LIST.find((e) => e.id === employeeId);
    if (!emp) throw new Error(`Employee ${employeeId} not found.`);
    if (emp.status === "former") throw new Error(`Cannot assign former employee ${emp.firstName} ${emp.lastName}.`);
    employeeName = `${emp.firstName} ${emp.lastName}`;
  } else {
    const [emp] = await db
      .select()
      .from(employeesTable)
      .where(and(eq(employeesTable.id, employeeId), eq(employeesTable.organizationId, organizationId)));
    if (!emp) throw new Error(`Employee ${employeeId} not found in this organization.`);
    if (emp.status === "former") throw new Error(`Cannot assign former employee ${emp.firstName} ${emp.lastName}.`);
    employeeName = `${emp.firstName} ${emp.lastName}`;
  }

  // 2. Approved Leave Check
  if (!process.env.DATABASE_URL) {
    const onLeave = DEMO_LEAVE_STORE.some((l) => {
      const startStr = l.startDate instanceof Date ? l.startDate.toISOString().slice(0, 10) : String(l.startDate);
      const endStr = l.endDate instanceof Date ? l.endDate.toISOString().slice(0, 10) : String(l.endDate);
      return (
        l.employeeId === employeeId &&
        (l.status === "approved" || l.status === "pending") &&
        shiftDate >= startStr &&
        shiftDate <= endStr
      );
    });
    if (onLeave) {
      throw new Error(`Assignment rejected: ${employeeName} has an approved or pending leave on ${shiftDate}.`);
    }
  } else {
    const leaves = await db
      .select()
      .from(leaveRequestsTable)
      .where(
        and(
          eq(leaveRequestsTable.organizationId, organizationId),
          eq(leaveRequestsTable.employeeId, employeeId),
          eq(leaveRequestsTable.status, "approved"),
        ),
      );
    const hasConflict = leaves.some((l) => shiftDate >= l.startDate && shiftDate <= l.endDate);
    if (hasConflict) {
      throw new Error(`Assignment rejected: ${employeeName} is on approved leave on ${shiftDate}.`);
    }
  }

  // 3. Overlapping Shift Conflict Check
  const { items: existingShifts } = await listShiftAssignments(organizationId, {
    employeeId,
    shiftDate,
    status: "scheduled",
  });
  if (existingShifts.length > 0) {
    const conflict = existingShifts[0]!;
    throw new Error(
      `Shift scheduling conflict: ${employeeName} is already scheduled on ${conflict.workZone} (${conflict.shiftName}) on ${shiftDate}.`,
    );
  }

  // 4. Competency & Certification Check
  let competencyToCheck = requiredCompetency;
  if (!competencyToCheck && input.shiftTemplateId) {
    const { items: tpls } = await listShiftTemplates(organizationId);
    const tpl = tpls.find((t) => t.id === input.shiftTemplateId);
    if (tpl?.requiredCompetency && tpl.requiredCompetency !== "General Operator") {
      competencyToCheck = tpl.requiredCompetency;
    }
  }
  if (competencyToCheck) {
    const compResult = await hasVerifiedCompetency(organizationId, employeeId, competencyToCheck, shiftDate);
    if (!compResult.verified) {
      throw new Error(`Competency verification failed for ${employeeName}: ${compResult.reason}`);
    }
  }

  // 5. Driver Compliance Check for Distribution & Fleet Drivers
  if (unitType === "distribution" || roleSkill.toLowerCase().includes("driver")) {
    const dispatch = await validateVehicleDispatch(
      organizationId,
      employeeId,
      new Date(`${shiftDate}T00:00:00Z`),
    );
    if (!dispatch.allowed) {
      throw new Error(
        `Commercial Driver compliance check failed for ${employeeName}: ${dispatch.reasons.join("; ")}`,
      );
    }
  }

  const nowIso = new Date().toISOString();

  if (!process.env.DATABASE_URL) {
    const store = getOrCreateWorkforceStore(organizationId);
    const assignment: MemShiftAssignment = {
      id: `asgn-${crypto.randomUUID().slice(0, 8)}`,
      organizationId,
      shiftTemplateId: input.shiftTemplateId ?? null,
      employeeId,
      employeeName,
      productionLineId: input.productionLineId ?? null,
      unitType,
      workZone,
      shiftDate,
      shiftName,
      startTime,
      endTime,
      roleSkill,
      costCentreCode,
      status: "scheduled",
      isRelief: false,
      reliefForEmployeeId: null,
      reliefReason: null,
      supervisorUserId: actorUserId,
      createdByUserId: actorUserId,
      notes: input.notes ?? null,
      createdAt: nowIso,
      updatedAt: nowIso,
    };
    store.assignments.set(assignment.id, assignment);

    await recordAuditEvent({
      organizationId,
      actorUserId,
      actor: "supervisor",
      action: "WORKFORCE_SHIFT_ASSIGNED",
      targetType: "workforce_shift",
      targetId: assignment.id,
      summary: `Assigned ${employeeName} to ${unitType} · ${workZone} (${shiftName}) on ${shiftDate}`,
      isDemo: true,
    });

    return assignment;
  }

  const [created] = await db
    .insert(workforceShiftAssignmentsTable)
    .values({
      organizationId,
      shiftTemplateId: input.shiftTemplateId ?? null,
      employeeId,
      productionLineId: input.productionLineId ?? null,
      unitType,
      workZone,
      shiftDate,
      shiftName,
      startTime,
      endTime,
      roleSkill,
      costCentreCode,
      status: "scheduled",
      supervisorUserId: actorUserId,
      createdByUserId: actorUserId,
      notes: input.notes ?? null,
    })
    .returning();

  await recordAuditEvent({
    organizationId,
    actorUserId,
    actor: "supervisor",
    action: "WORKFORCE_SHIFT_ASSIGNED",
    targetType: "workforce_shift",
    targetId: created!.id,
    summary: `Assigned ${employeeName} to ${unitType} · ${workZone} (${shiftName}) on ${shiftDate}`,
  });

  return {
    id: created!.id,
    organizationId: created!.organizationId,
    shiftTemplateId: created!.shiftTemplateId,
    employeeId: created!.employeeId,
    employeeName,
    productionLineId: created!.productionLineId,
    unitType: created!.unitType as MemShiftAssignment["unitType"],
    workZone: created!.workZone,
    shiftDate: created!.shiftDate,
    shiftName: created!.shiftName,
    startTime: created!.startTime,
    endTime: created!.endTime,
    roleSkill: created!.roleSkill,
    costCentreCode: created!.costCentreCode,
    status: created!.status as MemShiftAssignment["status"],
    isRelief: created!.isRelief,
    reliefForEmployeeId: created!.reliefForEmployeeId,
    reliefReason: created!.reliefReason,
    supervisorUserId: created!.supervisorUserId,
    createdByUserId: created!.createdByUserId,
    notes: created!.notes,
    createdAt: created!.createdAt.toISOString(),
    updatedAt: created!.updatedAt.toISOString(),
  };
}

export async function requestShiftSwap(
  organizationId: string,
  input: {
    requestingEmployeeId: string;
    requestingShiftAssignmentId: string;
    targetEmployeeId: string;
    targetShiftAssignmentId?: string | null;
    reason: string;
  },
  actorUserId: string,
): Promise<MemShiftSwap> {
  const requestingEmployeeId = sanitizeText(input.requestingEmployeeId, 64);
  const requestingShiftAssignmentId = sanitizeText(input.requestingShiftAssignmentId, 64);
  const targetEmployeeId = sanitizeText(input.targetEmployeeId, 64);
  const reason = sanitizeText(input.reason, 300);

  if (!requestingEmployeeId || !requestingShiftAssignmentId || !targetEmployeeId || !reason) {
    throw new Error("requestingEmployeeId, requestingShiftAssignmentId, targetEmployeeId and reason are required.");
  }

  if (requestingEmployeeId === targetEmployeeId) {
    throw new Error("Cannot swap shifts with yourself.");
  }

  const nowIso = new Date().toISOString();

  if (!process.env.DATABASE_URL) {
    const store = getOrCreateWorkforceStore(organizationId);
    const reqShift = store.assignments.get(requestingShiftAssignmentId);
    if (!reqShift || reqShift.employeeId !== requestingEmployeeId) {
      throw new Error("Requesting shift assignment not found or belongs to another employee.");
    }

    const swap: MemShiftSwap = {
      id: `swap-${crypto.randomUUID().slice(0, 8)}`,
      organizationId,
      requestingEmployeeId,
      requestingShiftAssignmentId,
      targetEmployeeId,
      targetShiftAssignmentId: input.targetShiftAssignmentId ?? null,
      status: "pending",
      reason,
      decisionNotes: null,
      decidedByUserId: null,
      decidedAt: null,
      createdAt: nowIso,
      updatedAt: nowIso,
    };
    store.swaps.set(swap.id, swap);

    await recordAuditEvent({
      organizationId,
      actorUserId,
      actor: "employee",
      action: "SHIFT_SWAP_REQUESTED",
      targetType: "shift_swap",
      targetId: swap.id,
      summary: `Requested shift swap on ${reqShift.shiftDate} (${reqShift.shiftName}) with colleague`,
      isDemo: true,
    });

    return swap;
  }

  const [reqShift] = await db
    .select()
    .from(workforceShiftAssignmentsTable)
    .where(
      and(
        eq(workforceShiftAssignmentsTable.id, requestingShiftAssignmentId),
        eq(workforceShiftAssignmentsTable.organizationId, organizationId),
      ),
    );

  if (!reqShift || reqShift.employeeId !== requestingEmployeeId) {
    throw new Error("Requesting shift assignment not found or belongs to another employee.");
  }

  const [created] = await db
    .insert(workforceShiftSwapsTable)
    .values({
      organizationId,
      requestingEmployeeId,
      requestingShiftAssignmentId,
      targetEmployeeId,
      targetShiftAssignmentId: input.targetShiftAssignmentId ?? null,
      reason,
    })
    .returning();

  await recordAuditEvent({
    organizationId,
    actorUserId,
    actor: "employee",
    action: "SHIFT_SWAP_REQUESTED",
    targetType: "shift_swap",
    targetId: created!.id,
    summary: `Requested shift swap on ${reqShift.shiftDate} (${reqShift.shiftName})`,
  });

  return {
    id: created!.id,
    organizationId: created!.organizationId,
    requestingEmployeeId: created!.requestingEmployeeId,
    requestingShiftAssignmentId: created!.requestingShiftAssignmentId,
    targetEmployeeId: created!.targetEmployeeId,
    targetShiftAssignmentId: created!.targetShiftAssignmentId,
    status: created!.status as MemShiftSwap["status"],
    reason: created!.reason,
    decisionNotes: created!.decisionNotes,
    decidedByUserId: created!.decidedByUserId,
    decidedAt: null,
    createdAt: created!.createdAt.toISOString(),
    updatedAt: created!.updatedAt.toISOString(),
  };
}

export async function decideShiftSwap(
  organizationId: string,
  swapId: string,
  decision: "approved" | "rejected",
  decisionNotes: string | undefined,
  actorUserId: string,
): Promise<MemShiftSwap> {
  const nowIso = new Date().toISOString();

  if (!process.env.DATABASE_URL) {
    const store = getOrCreateWorkforceStore(organizationId);
    const swap = store.swaps.get(swapId);
    if (!swap || swap.organizationId !== organizationId) {
      throw new Error("Shift swap request not found.");
    }
    if (swap.status !== "pending") {
      throw new Error(`Shift swap is already ${swap.status}.`);
    }

    swap.status = decision;
    swap.decisionNotes = decisionNotes ?? null;
    swap.decidedByUserId = actorUserId;
    swap.decidedAt = nowIso;
    swap.updatedAt = nowIso;

    if (decision === "approved") {
      const reqShift = store.assignments.get(swap.requestingShiftAssignmentId);
      if (reqShift) {
        reqShift.employeeId = swap.targetEmployeeId;
        const targetEmp = DEMO_EMPLOYEES_LIST.find((e) => e.id === swap.targetEmployeeId);
        if (targetEmp) reqShift.employeeName = `${targetEmp.firstName} ${targetEmp.lastName}`;
        reqShift.status = "swapped";
      }
    }

    await recordAuditEvent({
      organizationId,
      actorUserId,
      actor: "supervisor",
      action: `SHIFT_SWAP_${decision.toUpperCase()}`,
      targetType: "shift_swap",
      targetId: swap.id,
      summary: `${decision.toUpperCase()} shift swap request between employees`,
      isDemo: true,
    });

    return swap;
  }

  const [swap] = await db
    .select()
    .from(workforceShiftSwapsTable)
    .where(
      and(
        eq(workforceShiftSwapsTable.id, swapId),
        eq(workforceShiftSwapsTable.organizationId, organizationId),
      ),
    );

  if (!swap) throw new Error("Shift swap request not found.");
  if (swap.status !== "pending") throw new Error(`Shift swap is already ${swap.status}.`);

  return await db.transaction(async (tx) => {
    const [updatedSwap] = await tx
      .update(workforceShiftSwapsTable)
      .set({
        status: decision,
        decisionNotes: decisionNotes ?? null,
        decidedByUserId: actorUserId,
        decidedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(workforceShiftSwapsTable.id, swapId))
      .returning();

    if (decision === "approved") {
      await tx
        .update(workforceShiftAssignmentsTable)
        .set({
          employeeId: swap.targetEmployeeId,
          status: "swapped",
          updatedAt: new Date(),
        })
        .where(eq(workforceShiftAssignmentsTable.id, swap.requestingShiftAssignmentId));
    }

    await recordAuditEvent({
      organizationId,
      actorUserId,
      actor: "supervisor",
      action: `SHIFT_SWAP_${decision.toUpperCase()}`,
      targetType: "shift_swap",
      targetId: swapId,
      summary: `${decision.toUpperCase()} shift swap request`,
      tx,
    });

    return {
      id: updatedSwap!.id,
      organizationId: updatedSwap!.organizationId,
      requestingEmployeeId: updatedSwap!.requestingEmployeeId,
      requestingShiftAssignmentId: updatedSwap!.requestingShiftAssignmentId,
      targetEmployeeId: updatedSwap!.targetEmployeeId,
      targetShiftAssignmentId: updatedSwap!.targetShiftAssignmentId,
      status: updatedSwap!.status as MemShiftSwap["status"],
      reason: updatedSwap!.reason,
      decisionNotes: updatedSwap!.decisionNotes,
      decidedByUserId: updatedSwap!.decidedByUserId,
      decidedAt: updatedSwap!.decidedAt?.toISOString() ?? null,
      createdAt: updatedSwap!.createdAt.toISOString(),
      updatedAt: updatedSwap!.updatedAt.toISOString(),
    };
  });
}
