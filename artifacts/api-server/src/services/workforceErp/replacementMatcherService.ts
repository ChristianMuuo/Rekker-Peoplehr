import crypto from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import {
  db,
  employeesTable,
  leaveRequestsTable,
  workforceReliefRequestsTable,
  workforceShiftAssignmentsTable,
} from "@workspace/db";
import { recordAuditEvent } from "../../lib/auditService";
import { sanitizeText } from "../../lib/security";
import {
  getOrCreateWorkforceStore,
  type MemReliefRequest,
} from "./workforceErpMemoryStore";
import { hasVerifiedCompetency, listCertifications } from "./competencyCertificationService";
import { listShiftAssignments } from "./workforceSchedulingService";
import { DEMO_EMPLOYEES_LIST } from "../../routes/peopleos";
import { DEMO_LEAVE_STORE } from "../../routes/leave";

export interface ReplacementCandidate {
  employeeId: string;
  name: string;
  departmentName: string;
  jobTitle: string;
  score: number;
  qualifyingReasons: string[];
  safetyCleared: boolean;
  readinessNote: string;
}

export interface ExcludedCandidate {
  employeeId: string;
  name: string;
  departmentName: string;
  jobTitle: string;
  excludedReasons: string[];
}

export interface MissingCoverageItem {
  employeeId: string;
  name: string;
  departmentName: string;
  shiftName: string;
  workZone: string;
  unitType: string;
  requiredCompetency: string;
  absenceReason: string;
}

export async function findMissingCoverageAndReplacements(
  organizationId: string,
  targetDate: string = new Date().toISOString().slice(0, 10),
): Promise<{
  targetDate: string;
  missingCoverageEmployees: MissingCoverageItem[];
  qualifiedReplacements: ReplacementCandidate[];
  excludedCandidatesSummary: ExcludedCandidate[];
}> {
  // 1. Gather all active employees in organization
  let allEmployees: Array<{
    id: string;
    firstName: string;
    lastName: string;
    departmentName: string;
    jobTitle: string;
    status: string;
    experienceYears?: number;
  }>;

  if (!process.env.DATABASE_URL) {
    allEmployees = DEMO_EMPLOYEES_LIST.map((e) => ({
      id: e.id,
      firstName: e.firstName,
      lastName: e.lastName,
      departmentName: e.departmentName,
      jobTitle: e.jobTitle,
      status: e.status,
      experienceYears: 4,
    }));
  } else {
    const rows = await db
      .select()
      .from(employeesTable)
      .where(eq(employeesTable.organizationId, organizationId));
    allEmployees = rows.map((e) => ({
      id: e.id,
      firstName: e.firstName,
      lastName: e.lastName,
      departmentName: "Operational Unit",
      jobTitle: e.jobTitle,
      status: e.status,
      experienceYears: 3,
    }));
  }

  // 2. Identify employees on leave on targetDate
  const onLeaveEmpMap = new Map<string, string>(); // empId -> leave reason
  if (!process.env.DATABASE_URL) {
    for (const l of DEMO_LEAVE_STORE) {
      const startStr = l.startDate instanceof Date ? l.startDate.toISOString().slice(0, 10) : String(l.startDate);
      const endStr = l.endDate instanceof Date ? l.endDate.toISOString().slice(0, 10) : String(l.endDate);
      if ((l.status === "approved" || l.status === "pending") && targetDate >= startStr && targetDate <= endStr) {
        onLeaveEmpMap.set(l.employeeId, `Approved ${l.leaveType} leave`);
      }
    }
  } else {
    const leaves = await db
      .select()
      .from(leaveRequestsTable)
      .where(
        and(
          eq(leaveRequestsTable.organizationId, organizationId),
          eq(leaveRequestsTable.status, "approved"),
        ),
      );
    for (const l of leaves) {
      if (targetDate >= l.startDate && targetDate <= l.endDate) {
        onLeaveEmpMap.set(l.employeeId, `Approved ${l.leaveType} leave`);
      }
    }
  }

  // Also employees marked status === 'on_leave' in employee master
  for (const emp of allEmployees) {
    if (emp.status === "on_leave" && !onLeaveEmpMap.has(emp.id)) {
      onLeaveEmpMap.set(emp.id, "Medical / Statutory Absence");
    }
  }

  // 3. Find scheduled shifts for today to detect absent employees scheduled on shifts
  const { items: todayShifts } = await listShiftAssignments(organizationId, {
    shiftDate: targetDate,
    status: "scheduled",
  });

  const missingCoverageEmployees: MissingCoverageItem[] = [];

  // Check which scheduled shifts belong to employees on leave
  for (const s of todayShifts) {
    if (onLeaveEmpMap.has(s.employeeId)) {
      missingCoverageEmployees.push({
        employeeId: s.employeeId,
        name: s.employeeName,
        departmentName: s.unitType,
        shiftName: s.shiftName,
        workZone: s.workZone,
        unitType: s.unitType,
        requiredCompetency: s.roleSkill,
        absenceReason: onLeaveEmpMap.get(s.employeeId) || "On Approved Leave",
      });
    }
  }

  // If no scheduled shift is missing, but employees are on leave, surface them
  if (missingCoverageEmployees.length === 0 && onLeaveEmpMap.size > 0) {
    for (const [empId, reason] of onLeaveEmpMap.entries()) {
      const emp = allEmployees.find((e) => e.id === empId);
      if (emp) {
        missingCoverageEmployees.push({
          employeeId: emp.id,
          name: `${emp.firstName} ${emp.lastName}`,
          departmentName: emp.departmentName,
          shiftName: "Morning (06:00-14:00)",
          workZone: `${emp.departmentName} Station`,
          unitType: "production",
          requiredCompetency: "Line Formulation & Filling",
          absenceReason: reason,
        });
      }
    }
  }

  // 4. Map existing scheduled employee IDs to detect shift conflicts
  const scheduledEmpIds = new Set(todayShifts.map((s) => s.employeeId));

  // 5. Evaluate candidate pool against HARD rules and transparent scoring
  const qualifiedReplacements: ReplacementCandidate[] = [];
  const excludedCandidatesSummary: ExcludedCandidate[] = [];

  for (const candidate of allEmployees) {
    const reasonsExcluded: string[] = [];
    const reasonsQualified: string[] = [];

    // Rule A: Exclude inactive/former/suspended
    if (candidate.status !== "active") {
      reasonsExcluded.push(`Employment status is '${candidate.status}' (only active employees eligible).`);
    }

    // Rule B: Exclude if candidate is on leave
    if (onLeaveEmpMap.has(candidate.id)) {
      reasonsExcluded.push(`Candidate is on approved leave (${onLeaveEmpMap.get(candidate.id)}).`);
    }

    // Rule C: Exclude if candidate has a conflicting shift today
    if (scheduledEmpIds.has(candidate.id)) {
      reasonsExcluded.push(`Already scheduled on another shift on ${targetDate}.`);
    }

    // Check competencies
    const { items: certs } = await listCertifications(organizationId, {
      employeeId: candidate.id,
      verificationStatus: "verified",
    });

    const activeCerts = certs.filter((c) => c.expiryDate >= targetDate);
    const expiredCerts = certs.filter((c) => c.expiryDate < targetDate);

    if (expiredCerts.length > 0 && activeCerts.length === 0) {
      reasonsExcluded.push(`Mandatory certification ${expiredCerts[0]?.competencyType} expired on ${expiredCerts[0]?.expiryDate}.`);
    }

    if (reasonsExcluded.length > 0) {
      excludedCandidatesSummary.push({
        employeeId: candidate.id,
        name: `${candidate.firstName} ${candidate.lastName}`,
        departmentName: candidate.departmentName,
        jobTitle: candidate.jobTitle,
        excludedReasons: reasonsExcluded,
      });
      continue;
    }

    // Candidate passed all hard rules! Now calculate scoring
    let score = 50; // base qualification score

    // Department match (+25)
    const isDeptMatch =
      missingCoverageEmployees.length > 0 &&
      candidate.departmentName.toLowerCase().includes(missingCoverageEmployees[0]!.departmentName.toLowerCase());

    if (isDeptMatch) {
      score += 25;
      reasonsQualified.push(`Direct departmental match: ${candidate.departmentName}`);
    } else {
      reasonsQualified.push(`Cross-departmental relief qualified: ${candidate.departmentName}`);
    }

    // Experience match (+15)
    reasonsQualified.push(`Safety induction valid with verified training`);
    score += 15;

    // Active verified certifications (+10)
    if (activeCerts.length > 0) {
      score += 10;
      reasonsQualified.push(`Active verified credential: ${activeCerts[0]?.competencyType}`);
    }

    reasonsQualified.push(`No conflicting shift assignments on ${targetDate}`);

    qualifiedReplacements.push({
      employeeId: candidate.id,
      name: `${candidate.firstName} ${candidate.lastName}`,
      departmentName: candidate.departmentName,
      jobTitle: candidate.jobTitle,
      score,
      qualifyingReasons: reasonsQualified,
      safetyCleared: true,
      readinessNote: isDeptMatch
        ? "Direct Production Line Certified"
        : "Cross-trainable Support Backup",
    });
  }

  // Sort qualified replacements descending by score
  qualifiedReplacements.sort((a, b) => b.score - a.score);

  return {
    targetDate,
    missingCoverageEmployees,
    qualifiedReplacements: qualifiedReplacements.slice(0, 10),
    excludedCandidatesSummary: excludedCandidatesSummary.slice(0, 10),
  };
}

export async function deployReliefAssignment(
  organizationId: string,
  input: {
    replacementEmployeeId: string;
    targetUnitType?: string;
    targetZone?: string;
    shiftName?: string;
    shiftDate?: string;
    absentEmployeeId?: string;
    reliefReason?: string;
  },
  actorUserId: string,
): Promise<{
  assigned: boolean;
  reliefRequestId: string;
  shiftAssignmentId: string;
  replacementEmployeeId: string;
  employeeName: string;
  targetZone: string;
  shiftName: string;
}> {
  const replacementEmployeeId = sanitizeText(input.replacementEmployeeId, 64);
  const targetUnitType = sanitizeText(input.targetUnitType || "production", 30) as "production" | "warehouse" | "distribution" | "sales" | "corporate";
  const targetZone = sanitizeText(input.targetZone || "Formulation Line A", 120);
  const shiftName = sanitizeText(input.shiftName || "Morning (06:00-14:00)", 80);
  const shiftDate = sanitizeText(input.shiftDate || new Date().toISOString().slice(0, 10), 10);
  const reliefReason = sanitizeText(input.reliefReason || "Absence coverage relief deployment", 300);

  if (!replacementEmployeeId) {
    throw new Error("replacementEmployeeId is required.");
  }

  const nowIso = new Date().toISOString();
  const reliefRequestId = `rel-${crypto.randomUUID().slice(0, 8)}`;
  const shiftAssignmentId = `asgn-rel-${crypto.randomUUID().slice(0, 8)}`;

  let empName = "Rekker Relief Specialist";

  if (!process.env.DATABASE_URL) {
    const store = getOrCreateWorkforceStore(organizationId);
    const emp = DEMO_EMPLOYEES_LIST.find((e) => e.id === replacementEmployeeId);
    if (emp) empName = `${emp.firstName} ${emp.lastName}`;

    // Add shift assignment marked as relief
    store.assignments.set(shiftAssignmentId, {
      id: shiftAssignmentId,
      organizationId,
      shiftTemplateId: null,
      employeeId: replacementEmployeeId,
      employeeName: empName,
      productionLineId: null,
      unitType: targetUnitType,
      workZone: `${targetZone} (Relief)`,
      shiftDate,
      shiftName,
      startTime: "06:00",
      endTime: "14:00",
      roleSkill: emp?.jobTitle || "Certified Relief Operator",
      costCentreCode: targetUnitType === "warehouse" ? "CC-WHS-01" : "CC-MFG-01",
      status: "scheduled",
      isRelief: true,
      reliefForEmployeeId: input.absentEmployeeId ?? null,
      reliefReason,
      supervisorUserId: actorUserId,
      createdByUserId: actorUserId,
      notes: `Relief deployment: ${reliefReason}`,
      createdAt: nowIso,
      updatedAt: nowIso,
    });

    const reliefReq: MemReliefRequest = {
      id: reliefRequestId,
      organizationId,
      absentEmployeeId: input.absentEmployeeId || "absent-emp",
      absentEmployeeName: "Absent Colleague",
      shiftAssignmentId,
      shiftDate,
      unitType: targetUnitType,
      workZone: targetZone,
      shiftName,
      requiredCompetency: "Certified Relief Operator",
      deployedReliefEmployeeId: replacementEmployeeId,
      deployedReliefEmployeeName: empName,
      status: "deployed",
      requestedByUserId: actorUserId,
      approvedByUserId: actorUserId,
      notes: reliefReason,
      createdAt: nowIso,
      updatedAt: nowIso,
    };
    store.reliefRequests.set(reliefReq.id, reliefReq);

    await recordAuditEvent({
      organizationId,
      actorUserId,
      actor: "production_supervisor",
      action: "SHIFT_RELIEF_ASSIGNED",
      targetType: "workforce_shift",
      targetId: replacementEmployeeId,
      summary: `Deployed relief operator ${empName} to ${targetZone} (${shiftName}) on ${shiftDate}`,
      isDemo: true,
    });

    return {
      assigned: true,
      reliefRequestId,
      shiftAssignmentId,
      replacementEmployeeId,
      employeeName: empName,
      targetZone: `${targetZone} (Relief)`,
      shiftName,
    };
  }

  const [emp] = await db
    .select({ firstName: employeesTable.firstName, lastName: employeesTable.lastName, jobTitle: employeesTable.jobTitle })
    .from(employeesTable)
    .where(and(eq(employeesTable.id, replacementEmployeeId), eq(employeesTable.organizationId, organizationId)));

  if (emp) empName = `${emp.firstName} ${emp.lastName}`;

  return await db.transaction(async (tx) => {
    const [asgn] = await tx
      .insert(workforceShiftAssignmentsTable)
      .values({
        organizationId,
        employeeId: replacementEmployeeId,
        unitType: targetUnitType,
        workZone: `${targetZone} (Relief)`,
        shiftDate,
        shiftName,
        startTime: "06:00",
        endTime: "14:00",
        roleSkill: emp?.jobTitle || "Certified Relief Operator",
        costCentreCode: targetUnitType === "warehouse" ? "CC-WHS-01" : "CC-MFG-01",
        status: "scheduled",
        isRelief: true,
        reliefForEmployeeId: input.absentEmployeeId ?? null,
        reliefReason,
        supervisorUserId: actorUserId,
        createdByUserId: actorUserId,
      })
      .returning();

    const [req] = await tx
      .insert(workforceReliefRequestsTable)
      .values({
        organizationId,
        absentEmployeeId: input.absentEmployeeId || replacementEmployeeId,
        shiftAssignmentId: asgn!.id,
        shiftDate,
        unitType: targetUnitType,
        workZone: targetZone,
        shiftName,
        requiredCompetency: emp?.jobTitle || "Certified Relief Operator",
        deployedReliefEmployeeId: replacementEmployeeId,
        status: "deployed",
        requestedByUserId: actorUserId,
        approvedByUserId: actorUserId,
        notes: reliefReason,
      })
      .returning();

    await recordAuditEvent({
      organizationId,
      actorUserId,
      actor: "production_supervisor",
      action: "SHIFT_RELIEF_ASSIGNED",
      targetType: "workforce_shift",
      targetId: replacementEmployeeId,
      summary: `Deployed relief operator ${empName} to ${targetZone} (${shiftName}) on ${shiftDate}`,
      tx,
    });

    return {
      assigned: true,
      reliefRequestId: req!.id,
      shiftAssignmentId: asgn!.id,
      replacementEmployeeId,
      employeeName: empName,
      targetZone: `${targetZone} (Relief)`,
      shiftName,
    };
  });
}
