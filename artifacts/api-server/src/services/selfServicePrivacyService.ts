import { randomUUID } from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import {
  assetsTable,
  attendanceRecordsTable,
  db,
  departmentsTable,
  documentsTable,
  employeeTrainingTable,
  employeesTable,
  expensesTable,
  leaveRequestsTable,
  onboardingTasksTable,
  privacyRequestsTable,
  probationReviewsTable,
  profileCorrectionRequestsTable,
  type PrivacyRequestRecord,
  type ProfileCorrectionRequestRecord,
} from "@workspace/db";
import { recordAuditEvent } from "../lib/auditService";
import { maskKraPin, maskNationalId, sanitizeText } from "../lib/security";
import type { MembershipRecord } from "../middlewares/peopleosAccess";
import { computePrivacyRequestDueDate, evaluateEmployeeSection10Completeness } from "./kenyaComplianceService";
import { phase2MemoryStore } from "./phase2MemoryStore";

export const ALLOWED_PROFILE_CORRECTION_FIELDS = new Set([
  "phone",
  "personalEmail",
  "preferredName",
  "emergencyContactJson",
  "contactPreferencesJson",
  "qualificationsJson",
  "certificationsJson",
  "workExperienceJson",
]);

export const PROTECTED_EMPLOYEE_FIELDS = new Set([
  "baseSalary",
  "allowances",
  "departmentId",
  "managerId",
  "positionId",
  "jobTitle",
  "employmentType",
  "status",
  "employeeNumber",
  "nationalId",
  "kraPin",
  "nssfNo",
  "shaNo",
  "startDate",
]);

export async function getSelfServiceWorkspace(params: {
  membership: MembershipRecord;
  demoEmployees: Array<any>;
  demoDepartments: Array<any>;
  demoOnboardingTasks?: Array<any>;
  demoAssets?: Array<any>;
  demoExpenses?: Array<any>;
  demoTraining?: Array<any>;
  demoAttendance?: Array<any>;
  demoLeaves?: Array<any>;
}) {
  const { membership } = params;
  if (!membership.employeeId) {
    return {
      linked: false as const,
      userId: membership.userId,
      organizationId: membership.organizationId,
      role: membership.role,
      message:
        "Your authenticated account is not yet linked to an employee master record in this organization. Please contact HR Operations to link your profile.",
    };
  }

  const employeeId = membership.employeeId;

  if (process.env.DATABASE_URL) {
    const [employee] = await db
      .select()
      .from(employeesTable)
      .where(
        and(
          eq(employeesTable.organizationId, membership.organizationId),
          eq(employeesTable.id, employeeId),
        ),
      )
      .limit(1);

    if (!employee) {
      return {
        linked: false as const,
        userId: membership.userId,
        organizationId: membership.organizationId,
        role: membership.role,
        message: "Linked employee record could not be located in this organization.",
      };
    }

    const [
      deptRows,
      mgrRows,
      directReports,
      docs,
      tasks,
      assets,
      leaves,
      attendance,
      expenses,
      training,
      probation,
      corrections,
      privacyReqs,
    ] = await Promise.all([
      db
        .select()
        .from(departmentsTable)
        .where(
          and(
            eq(departmentsTable.organizationId, membership.organizationId),
            eq(departmentsTable.id, employee.departmentId),
          ),
        )
        .limit(1),
      employee.managerId
        ? db
            .select({
              id: employeesTable.id,
              firstName: employeesTable.firstName,
              lastName: employeesTable.lastName,
              jobTitle: employeesTable.jobTitle,
              workEmail: employeesTable.workEmail,
            })
            .from(employeesTable)
            .where(
              and(
                eq(employeesTable.organizationId, membership.organizationId),
                eq(employeesTable.id, employee.managerId),
              ),
            )
            .limit(1)
        : Promise.resolve([]),
      db
        .select({
          id: employeesTable.id,
          employeeNumber: employeesTable.employeeNumber,
          firstName: employeesTable.firstName,
          lastName: employeesTable.lastName,
          jobTitle: employeesTable.jobTitle,
          status: employeesTable.status,
        })
        .from(employeesTable)
        .where(
          and(
            eq(employeesTable.organizationId, membership.organizationId),
            eq(employeesTable.managerId, employee.id),
          ),
        ),
      db
        .select()
        .from(documentsTable)
        .where(
          and(
            eq(documentsTable.organizationId, membership.organizationId),
            eq(documentsTable.employeeId, employee.id),
          ),
        ),
      db
        .select()
        .from(onboardingTasksTable)
        .where(
          and(
            eq(onboardingTasksTable.organizationId, membership.organizationId),
            eq(onboardingTasksTable.employeeId, employee.id),
          ),
        ),
      db
        .select()
        .from(assetsTable)
        .where(
          and(
            eq(assetsTable.organizationId, membership.organizationId),
            eq(assetsTable.assignedEmployeeId, employee.id),
          ),
        ),
      db
        .select()
        .from(leaveRequestsTable)
        .where(
          and(
            eq(leaveRequestsTable.organizationId, membership.organizationId),
            eq(leaveRequestsTable.employeeId, employee.id),
          ),
        )
        .orderBy(desc(leaveRequestsTable.submittedAt))
        .limit(20),
      db
        .select()
        .from(attendanceRecordsTable)
        .where(
          and(
            eq(attendanceRecordsTable.organizationId, membership.organizationId),
            eq(attendanceRecordsTable.employeeId, employee.id),
          ),
        )
        .orderBy(desc(attendanceRecordsTable.date))
        .limit(20),
      db
        .select()
        .from(expensesTable)
        .where(
          and(
            eq(expensesTable.organizationId, membership.organizationId),
            eq(expensesTable.employeeId, employee.id),
          ),
        )
        .orderBy(desc(expensesTable.createdAt))
        .limit(20),
      db
        .select()
        .from(employeeTrainingTable)
        .where(
          and(
            eq(employeeTrainingTable.organizationId, membership.organizationId),
            eq(employeeTrainingTable.employeeId, employee.id),
          ),
        ),
      db
        .select()
        .from(probationReviewsTable)
        .where(
          and(
            eq(probationReviewsTable.organizationId, membership.organizationId),
            eq(probationReviewsTable.employeeId, employee.id),
          ),
        ),
      db
        .select()
        .from(profileCorrectionRequestsTable)
        .where(
          and(
            eq(profileCorrectionRequestsTable.organizationId, membership.organizationId),
            eq(profileCorrectionRequestsTable.employeeId, employee.id),
          ),
        )
        .orderBy(desc(profileCorrectionRequestsTable.createdAt)),
      db
        .select()
        .from(privacyRequestsTable)
        .where(
          and(
            eq(privacyRequestsTable.organizationId, membership.organizationId),
            eq(privacyRequestsTable.employeeId, employee.id),
          ),
        )
        .orderBy(desc(privacyRequestsTable.createdAt)),
    ]);

    const dept = deptRows[0];
    const mgr = mgrRows[0];

    return {
      linked: true as const,
      userId: membership.userId,
      organizationId: membership.organizationId,
      role: membership.role,
      employee: {
        id: employee.id,
        employeeNumber: employee.employeeNumber,
        firstName: employee.firstName,
        lastName: employee.lastName,
        preferredName: employee.preferredName,
        workEmail: employee.workEmail,
        personalEmail: employee.personalEmail,
        phone: employee.phone,
        jobTitle: employee.jobTitle,
        departmentId: employee.departmentId,
        departmentName: dept?.name ?? "",
        location: employee.location,
        timezone: employee.timezone,
        employmentType: employee.employmentType,
        status: employee.status,
        startDate: employee.startDate,
        probationEndDate: employee.probationEndDate,
        contractEndDate: employee.contractEndDate,
        hrRepresentativeUserId: employee.hrRepresentativeUserId,
        maskedNationalId: maskNationalId(employee.nationalId),
        maskedKraPin: maskKraPin(employee.kraPin),
        emergencyContactJson: employee.emergencyContactJson,
        contactPreferencesJson: employee.contactPreferencesJson,
        qualificationsJson: employee.qualificationsJson,
        certificationsJson: employee.certificationsJson,
      },
      manager: mgr
        ? {
            id: mgr.id,
            fullName: `${mgr.firstName} ${mgr.lastName}`,
            jobTitle: mgr.jobTitle,
            workEmail: mgr.workEmail,
          }
        : null,
      isManager: directReports.length > 0 || membership.role === "manager",
      directReportsCount: directReports.length,
      completeness: evaluateEmployeeSection10Completeness(employee, {
        hasSignedContractDocument: docs.some((d) =>
          ["contract", "Contract", "Offer Letter"].includes(d.category),
        ),
      }),
      documents: docs,
      onboardingTasks: tasks,
      assets,
      leaveRequests: leaves,
      attendanceRecords: attendance,
      expenses,
      training,
      probationReviews: probation,
      profileCorrectionRequests: corrections,
      privacyRequests: privacyReqs,
    };
  }

  // Sandbox / offline mode
  const emp = params.demoEmployees.find((e) => e.id === employeeId);
  if (!emp) {
    return {
      linked: false as const,
      userId: membership.userId,
      organizationId: membership.organizationId,
      role: membership.role,
      message: "Linked employee record could not be located in this organization.",
    };
  }

  const dept = params.demoDepartments.find((d) => d.id === emp.departmentId);
  const mgr = emp.managerId
    ? params.demoEmployees.find((e) => e.id === emp.managerId)
    : null;
  const directReports = params.demoEmployees.filter((e) => e.managerId === emp.id);
  const extras = phase2MemoryStore.employeeExtras.get(emp.id) ?? {};

  return {
    linked: true as const,
    userId: membership.userId,
    organizationId: membership.organizationId,
    role: membership.role,
    employee: {
      id: emp.id,
      employeeNumber: emp.employeeNumber,
      firstName: emp.firstName,
      lastName: emp.lastName,
      preferredName: emp.preferredName,
      workEmail: emp.workEmail,
      personalEmail: extras.personalEmail ?? null,
      phone: emp.phone,
      jobTitle: emp.jobTitle,
      departmentId: emp.departmentId,
      departmentName: dept?.name ?? emp.departmentName,
      location: emp.location,
      timezone: extras.timezone ?? "Africa/Nairobi",
      employmentType: emp.employmentType,
      status: emp.status,
      startDate: String(emp.startDate).slice(0, 10),
      probationEndDate: emp.probationEndDate
        ? String(emp.probationEndDate).slice(0, 10)
        : null,
      contractEndDate: emp.contractEndDate
        ? String(emp.contractEndDate).slice(0, 10)
        : null,
      hrRepresentativeUserId: extras.hrRepresentativeUserId ?? null,
      maskedNationalId: extras.nationalId ? maskNationalId(extras.nationalId) : null,
      maskedKraPin: null,
      emergencyContactJson: extras.emergencyContactJson ?? null,
      contactPreferencesJson: extras.contactPreferencesJson ?? null,
      qualificationsJson: extras.qualificationsJson ?? null,
      certificationsJson: extras.certificationsJson ?? null,
    },
    manager: mgr
      ? {
          id: mgr.id,
          fullName: `${mgr.firstName} ${mgr.lastName}`,
          jobTitle: mgr.jobTitle,
          workEmail: mgr.workEmail,
        }
      : null,
    isManager: directReports.length > 0 || membership.role === "manager",
    directReportsCount: directReports.length,
    completeness: evaluateEmployeeSection10Completeness({
      ...emp,
      nationalId: extras.nationalId ?? null,
      emergencyContactJson: extras.emergencyContactJson ?? null,
    } as any),
    documents: [],
    onboardingTasks: (params.demoOnboardingTasks ?? []).filter(
      (t) => t.employeeId === emp.id,
    ),
    assets: (params.demoAssets ?? []).filter((a) => a.assignedEmployeeId === emp.id),
    leaveRequests: (params.demoLeaves ?? []).filter((l) => l.employeeId === emp.id),
    attendanceRecords: (params.demoAttendance ?? []).filter(
      (a) => a.employeeId === emp.id,
    ),
    expenses: (params.demoExpenses ?? []).filter((x) => x.employeeId === emp.id),
    training: (params.demoTraining ?? []).filter((t) => t.employeeId === emp.id),
    probationReviews: phase2MemoryStore.probationReviews.filter(
      (p) => p.organizationId === membership.organizationId && p.employeeId === emp.id,
    ),
    profileCorrectionRequests: phase2MemoryStore.profileCorrectionRequests.filter(
      (c) => c.organizationId === membership.organizationId && c.employeeId === emp.id,
    ),
    privacyRequests: phase2MemoryStore.privacyRequests.filter(
      (p) => p.organizationId === membership.organizationId && p.employeeId === emp.id,
    ),
  };
}

export async function getManagerScopedWorkspace(params: {
  membership: MembershipRecord;
  demoEmployees: Array<any>;
  demoDepartments: Array<any>;
  demoLeaves?: Array<any>;
}) {
  const { membership } = params;
  const managerEmpId = membership.employeeId;

  const allEmps = process.env.DATABASE_URL
    ? await db
        .select()
        .from(employeesTable)
        .where(eq(employeesTable.organizationId, membership.organizationId))
    : params.demoEmployees;

  const allDepts = process.env.DATABASE_URL
    ? await db
        .select()
        .from(departmentsTable)
        .where(eq(departmentsTable.organizationId, membership.organizationId))
    : params.demoDepartments;

  const managedDeptIds = new Set(
    allDepts
      .filter((d) => managerEmpId && d.managerEmployeeId === managerEmpId)
      .map((d) => d.id),
  );

  const isOrgWide = ["hr_admin", "executive", "owner", "super_admin"].includes(
    membership.role,
  );

  const directReports = allEmps.filter((e) => {
    if (e.id === managerEmpId) return false;
    if (isOrgWide) return true;
    return (
      (managerEmpId && e.managerId === managerEmpId) ||
      managedDeptIds.has(e.departmentId)
    );
  });

  const reportIds = new Set(directReports.map((e) => e.id));

  const leaves = process.env.DATABASE_URL
    ? await db
        .select()
        .from(leaveRequestsTable)
        .where(eq(leaveRequestsTable.organizationId, membership.organizationId))
    : (params.demoLeaves ?? []);

  const pendingLeaves = leaves.filter(
    (l) => l.status === "pending" && (isOrgWide || reportIds.has(l.employeeId)),
  );

  const pendingCorrections = (
    process.env.DATABASE_URL
      ? await db
          .select()
          .from(profileCorrectionRequestsTable)
          .where(
            and(
              eq(profileCorrectionRequestsTable.organizationId, membership.organizationId),
              eq(profileCorrectionRequestsTable.status, "pending"),
            ),
          )
      : phase2MemoryStore.profileCorrectionRequests.filter(
          (c) =>
            c.organizationId === membership.organizationId && c.status === "pending",
        )
  ).filter((c) => isOrgWide || reportIds.has(c.employeeId));

  const pendingAttendanceCorrections = (
    process.env.DATABASE_URL
      ? await db
          .select()
          .from(profileCorrectionRequestsTable) // checked below properly
          .where(eq(profileCorrectionRequestsTable.organizationId, membership.organizationId))
      : []
  ).slice(0, 0);
  void pendingAttendanceCorrections;

  const attCorrections = phase2MemoryStore.attendanceCorrections.filter(
    (c) =>
      c.organizationId === membership.organizationId &&
      c.status === "pending" &&
      (isOrgWide || reportIds.has(c.employeeId)),
  );

  const probationDue = (
    process.env.DATABASE_URL
      ? await db
          .select()
          .from(probationReviewsTable)
          .where(
            and(
              eq(probationReviewsTable.organizationId, membership.organizationId),
              eq(probationReviewsTable.status, "pending_review"),
            ),
          )
      : phase2MemoryStore.probationReviews.filter(
          (p) =>
            p.organizationId === membership.organizationId &&
            p.status === "pending_review",
        )
  ).filter((p) => isOrgWide || reportIds.has(p.employeeId));

  return {
    scope: isOrgWide ? "ORGANIZATION_WIDE" : "MANAGER_DIRECT_REPORTS",
    managerEmployeeId: managerEmpId,
    teamCount: directReports.length,
    availableCount: directReports.filter((e) => e.status === "active" || e.status === "probation")
      .length,
    onLeaveCount: directReports.filter((e) => e.status === "on_leave").length,
    directReports: directReports.map((e) => ({
      id: e.id,
      employeeNumber: e.employeeNumber,
      fullName: `${e.firstName} ${e.lastName}`,
      jobTitle: e.jobTitle,
      departmentId: e.departmentId,
      status: e.status,
      location: e.location,
      probationEndDate: e.probationEndDate,
      contractEndDate: e.contractEndDate,
    })),
    pendingLeaveRequests: pendingLeaves,
    pendingProfileCorrections: pendingCorrections,
    pendingAttendanceCorrections: attCorrections,
    probationReviewsDue: probationDue,
  };
}

export async function submitProfileCorrectionRequest(params: {
  membership: MembershipRecord;
  fieldName: string;
  proposedValue: string;
  reason: string;
  demoEmployees: Array<any>;
}) {
  if (!params.membership.employeeId) {
    return {
      ok: false as const,
      statusCode: 403,
      error: "Account is not linked to an employee record.",
    };
  }
  if (PROTECTED_EMPLOYEE_FIELDS.has(params.fieldName)) {
    return {
      ok: false as const,
      statusCode: 403,
      error: `Protected field '${params.fieldName}' cannot be modified via self-service correction requests.`,
    };
  }
  if (!ALLOWED_PROFILE_CORRECTION_FIELDS.has(params.fieldName)) {
    return {
      ok: false as const,
      statusCode: 400,
      error: `Field '${params.fieldName}' is not eligible for self-service correction.`,
    };
  }

  const empId = params.membership.employeeId;
  let currentValue: string | null = null;
  if (process.env.DATABASE_URL) {
    const [emp] = await db
      .select()
      .from(employeesTable)
      .where(
        and(
          eq(employeesTable.organizationId, params.membership.organizationId),
          eq(employeesTable.id, empId),
        ),
      )
      .limit(1);
    currentValue = emp ? String((emp as any)[params.fieldName] ?? "") || null : null;
  } else {
    const emp = params.demoEmployees.find((e) => e.id === empId);
    const extras = phase2MemoryStore.employeeExtras.get(empId) ?? {};
    currentValue =
      String((emp as any)?.[params.fieldName] ?? (extras as any)[params.fieldName] ?? "") ||
      null;
  }

  const cleanValue = sanitizeText(params.proposedValue, 500);
  const cleanReason = sanitizeText(params.reason, 400);
  if (!cleanValue || !cleanReason) {
    return { ok: false as const, statusCode: 400, error: "proposedValue and reason are required." };
  }

  if (process.env.DATABASE_URL) {
    const [created] = await db
      .insert(profileCorrectionRequestsTable)
      .values({
        organizationId: params.membership.organizationId,
        employeeId: empId,
        requestedByUserId: params.membership.userId,
        fieldName: params.fieldName,
        currentValue,
        proposedValue: cleanValue,
        reason: cleanReason,
        status: "pending",
      })
      .returning();

    await recordAuditEvent({
      organizationId: params.membership.organizationId,
      actorUserId: params.membership.userId,
      actor: params.membership.role,
      action: "self_service.profile_correction_requested",
      targetType: "profile_correction_request",
      targetId: created!.id,
      summary: `Requested change to ${params.fieldName}: ${cleanReason}`,
    });
    return { ok: true as const, request: created! };
  }

  const record: ProfileCorrectionRequestRecord = {
    id: randomUUID(),
    organizationId: params.membership.organizationId,
    employeeId: empId,
    requestedByUserId: params.membership.userId,
    fieldName: params.fieldName,
    currentValue,
    proposedValue: cleanValue,
    reason: cleanReason,
    status: "pending",
    reviewedByUserId: null,
    decisionComment: null,
    reviewedAt: null,
    createdAt: new Date(),
  };
  phase2MemoryStore.profileCorrectionRequests.push(record);

  await recordAuditEvent({
    organizationId: params.membership.organizationId,
    actorUserId: params.membership.userId,
    actor: params.membership.role,
    action: "self_service.profile_correction_requested",
    targetType: "profile_correction_request",
    targetId: record.id,
    summary: `Requested change to ${params.fieldName}: ${cleanReason}`,
    isDemo: true,
  });

  return { ok: true as const, request: record };
}

export async function decideProfileCorrectionRequest(params: {
  membership: MembershipRecord;
  requestId: string;
  decision: "approved" | "rejected";
  comment?: string;
  demoEmployees: Array<any>;
}) {
  const existing = process.env.DATABASE_URL
    ? (
        await db
          .select()
          .from(profileCorrectionRequestsTable)
          .where(
            and(
              eq(profileCorrectionRequestsTable.organizationId, params.membership.organizationId),
              eq(profileCorrectionRequestsTable.id, params.requestId),
            ),
          )
          .limit(1)
      )[0]
    : phase2MemoryStore.profileCorrectionRequests.find(
        (r) =>
          r.organizationId === params.membership.organizationId &&
          r.id === params.requestId,
      );

  if (!existing) {
    return { ok: false as const, statusCode: 404, error: "Correction request not found." };
  }
  if (existing.status !== "pending") {
    return { ok: false as const, statusCode: 400, error: "Request has already been decided." };
  }
  if (existing.requestedByUserId === params.membership.userId) {
    return {
      ok: false as const,
      statusCode: 403,
      error: "Segregation of duties: employees cannot approve their own profile correction requests.",
    };
  }
  if (!ALLOWED_PROFILE_CORRECTION_FIELDS.has(existing.fieldName)) {
    return {
      ok: false as const,
      statusCode: 400,
      error: `Protected field '${existing.fieldName}' cannot be auto-applied.`,
    };
  }

  if (process.env.DATABASE_URL) {
    return db.transaction(async (tx) => {
      if (params.decision === "approved") {
        await tx
          .update(employeesTable)
          .set({ [existing.fieldName]: existing.proposedValue } as any)
          .where(
            and(
              eq(employeesTable.organizationId, params.membership.organizationId),
              eq(employeesTable.id, existing.employeeId),
            ),
          );
      }

      const [updated] = await tx
        .update(profileCorrectionRequestsTable)
        .set({
          status: params.decision,
          reviewedByUserId: params.membership.userId,
          decisionComment: params.comment ?? null,
          reviewedAt: new Date(),
        })
        .where(eq(profileCorrectionRequestsTable.id, existing.id))
        .returning();

      await recordAuditEvent({
        organizationId: params.membership.organizationId,
        actorUserId: params.membership.userId,
        actor: params.membership.role,
        action: `self_service.profile_correction_${params.decision}`,
        targetType: "profile_correction_request",
        targetId: existing.id,
        summary: `${params.decision} change to ${existing.fieldName} for employee ${existing.employeeId}`,
        tx: tx as unknown as typeof db,
      });

      return { ok: true as const, request: updated! };
    });
  }

  if (params.decision === "approved") {
    const emp = params.demoEmployees.find((e) => e.id === existing.employeeId);
    if (emp && existing.fieldName in emp) {
      (emp as any)[existing.fieldName] = existing.proposedValue;
    } else {
      const cur = phase2MemoryStore.employeeExtras.get(existing.employeeId) ?? {};
      (cur as any)[existing.fieldName] = existing.proposedValue;
      phase2MemoryStore.employeeExtras.set(existing.employeeId, cur);
    }
  }

  existing.status = params.decision;
  existing.reviewedByUserId = params.membership.userId;
  existing.decisionComment = params.comment ?? null;
  existing.reviewedAt = new Date();

  await recordAuditEvent({
    organizationId: params.membership.organizationId,
    actorUserId: params.membership.userId,
    actor: params.membership.role,
    action: `self_service.profile_correction_${params.decision}`,
    targetType: "profile_correction_request",
    targetId: existing.id,
    summary: `${params.decision} change to ${existing.fieldName} for employee ${existing.employeeId}`,
    isDemo: true,
  });

  return { ok: true as const, request: existing };
}

export async function submitPrivacyRequest(params: {
  membership: MembershipRecord;
  requestType: "access" | "rectification" | "erasure" | "restriction";
  details: string;
}) {
  if (!params.membership.employeeId) {
    return {
      ok: false as const,
      statusCode: 403,
      error: "Account must be linked to an employee record to submit a data rights request.",
    };
  }

  const sla = computePrivacyRequestDueDate(params.requestType);
  const cleanDetails = sanitizeText(params.details, 1000);
  if (!cleanDetails) {
    return { ok: false as const, statusCode: 400, error: "Request details are required." };
  }

  if (process.env.DATABASE_URL) {
    const [created] = await db
      .insert(privacyRequestsTable)
      .values({
        organizationId: params.membership.organizationId,
        employeeId: params.membership.employeeId,
        requestedByUserId: params.membership.userId,
        requestType: params.requestType,
        details: cleanDetails,
        statutoryDueDate: sla.dueDate,
        legalBasisReference: sla.legalBasisReference,
        status: "submitted",
        retentionCheckRequired: true,
      })
      .returning();

    await recordAuditEvent({
      organizationId: params.membership.organizationId,
      actorUserId: params.membership.userId,
      actor: params.membership.role,
      action: "privacy.odpc_request_submitted",
      targetType: "privacy_request",
      targetId: created!.id,
      summary: `Submitted ${params.requestType} request (ODPC SLA due ${sla.dueDate}). No auto-erasure permitted.`,
      critical: true,
    });
    return { ok: true as const, request: created! };
  }

  const record: PrivacyRequestRecord = {
    id: randomUUID(),
    organizationId: params.membership.organizationId,
    employeeId: params.membership.employeeId,
    requestedByUserId: params.membership.userId,
    requestType: params.requestType,
    details: cleanDetails,
    statutoryDueDate: sla.dueDate,
    legalBasisReference: sla.legalBasisReference,
    status: "submitted",
    retentionCheckRequired: true,
    handledByUserId: null,
    decisionNotes: null,
    decidedAt: null,
    createdAt: new Date(),
  };
  phase2MemoryStore.privacyRequests.push(record);

  await recordAuditEvent({
    organizationId: params.membership.organizationId,
    actorUserId: params.membership.userId,
    actor: params.membership.role,
    action: "privacy.odpc_request_submitted",
    targetType: "privacy_request",
    targetId: record.id,
    summary: `Submitted ${params.requestType} request (ODPC SLA due ${sla.dueDate}). No auto-erasure permitted.`,
    critical: true,
    isDemo: true,
  });

  return { ok: true as const, request: record };
}

export async function decidePrivacyRequest(params: {
  membership: MembershipRecord;
  requestId: string;
  status: "under_review" | "fulfilled" | "retention_exception_retained" | "rejected";
  decisionNotes: string;
}) {
  const existing = process.env.DATABASE_URL
    ? (
        await db
          .select()
          .from(privacyRequestsTable)
          .where(
            and(
              eq(privacyRequestsTable.organizationId, params.membership.organizationId),
              eq(privacyRequestsTable.id, params.requestId),
            ),
          )
          .limit(1)
      )[0]
    : phase2MemoryStore.privacyRequests.find(
        (r) =>
          r.organizationId === params.membership.organizationId &&
          r.id === params.requestId,
      );

  if (!existing) {
    return { ok: false as const, statusCode: 404, error: "Privacy request not found." };
  }

  if (process.env.DATABASE_URL) {
    const [updated] = await db
      .update(privacyRequestsTable)
      .set({
        status: params.status,
        handledByUserId: params.membership.userId,
        decisionNotes: sanitizeText(params.decisionNotes, 1000),
        decidedAt: new Date(),
      })
      .where(eq(privacyRequestsTable.id, existing.id))
      .returning();

    await recordAuditEvent({
      organizationId: params.membership.organizationId,
      actorUserId: params.membership.userId,
      actor: params.membership.role,
      action: `privacy.odpc_request_${params.status}`,
      targetType: "privacy_request",
      targetId: existing.id,
      summary: `Privacy officer updated ${existing.requestType} request to '${params.status}': ${params.decisionNotes}`,
      critical: true,
    });
    return { ok: true as const, request: updated! };
  }

  existing.status = params.status;
  existing.handledByUserId = params.membership.userId;
  existing.decisionNotes = sanitizeText(params.decisionNotes, 1000);
  existing.decidedAt = new Date();

  await recordAuditEvent({
    organizationId: params.membership.organizationId,
    actorUserId: params.membership.userId,
    actor: params.membership.role,
    action: `privacy.odpc_request_${params.status}`,
    targetType: "privacy_request",
    targetId: existing.id,
    summary: `Privacy officer updated ${existing.requestType} request to '${params.status}': ${params.decisionNotes}`,
    critical: true,
    isDemo: true,
  });

  return { ok: true as const, request: existing };
}
