import { randomUUID } from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import {
  assetsTable,
  candidatesTable,
  contractRemindersTable,
  db,
  departmentsTable,
  documentsTable,
  employeePositionAssignmentsTable,
  employeesTable,
  jobRequisitionsTable,
  onboardingTasksTable,
  onboardingTemplatesTable,
  positionsTable,
  probationReviewsTable,
  type OnboardingTemplateRecord,
} from "@workspace/db";
import { recordAuditEvent } from "../lib/auditService";
import { addCalendarDaysIso, addMonthsIso } from "./kenyaComplianceService";
import { phase2MemoryStore } from "./phase2MemoryStore";
import {
  applyEffectiveDatedAssignmentChange,
  recordAssignmentHistoryEntry,
} from "./employeeMasterService";

export async function listOnboardingTemplates(organizationId: string) {
  if (process.env.DATABASE_URL) {
    return db
      .select()
      .from(onboardingTemplatesTable)
      .where(eq(onboardingTemplatesTable.organizationId, organizationId))
      .orderBy(desc(onboardingTemplatesTable.createdAt));
  }
  return phase2MemoryStore.onboardingTemplates.filter(
    (t) => t.organizationId === organizationId,
  );
}

export async function createOnboardingTemplate(params: {
  organizationId: string;
  actorUserId: string;
  name: string;
  workflowType: "onboarding" | "offboarding";
  departmentCode?: string | null;
  employmentType?: string | null;
  tasks: Array<{
    title: string;
    category: string;
    assigneeRole: string;
    dueOffsetDays: number;
  }>;
}): Promise<OnboardingTemplateRecord> {
  if (process.env.DATABASE_URL) {
    const [created] = await db
      .insert(onboardingTemplatesTable)
      .values({
        organizationId: params.organizationId,
        name: params.name.trim(),
        workflowType: params.workflowType,
        departmentCode: params.departmentCode ?? null,
        employmentType: params.employmentType ?? null,
        tasksJson: JSON.stringify(params.tasks),
        active: true,
        createdByUserId: params.actorUserId,
      })
      .returning();
    return created!;
  }

  const record: OnboardingTemplateRecord = {
    id: randomUUID(),
    organizationId: params.organizationId,
    name: params.name.trim(),
    workflowType: params.workflowType,
    departmentCode: params.departmentCode ?? null,
    employmentType: params.employmentType ?? null,
    tasksJson: JSON.stringify(params.tasks),
    active: true,
    createdByUserId: params.actorUserId,
    createdAt: new Date(),
  };
  phase2MemoryStore.onboardingTemplates.push(record);
  return record;
}

export async function convertCandidateToEmployee(params: {
  organizationId: string;
  actorUserId: string;
  actorName: string;
  candidateId: string;
  startDate: string;
  employeeNumber?: string;
  workEmail?: string;
  employmentType?: "permanent" | "fixed_term" | "casual" | "intern";
  positionId?: string | null;
  managerId?: string | null;
  onboardingTemplateId?: string | null;
  probationMonths?: number;
  contractEndDate?: string | null;
  offerNotes?: string | null;
  demoCandidates: Array<any>;
  demoRequisitions: Array<any>;
  demoEmployees: Array<any>;
  demoDepartments: Array<any>;
  demoOnboardingTasks: Array<any>;
}) {
  const todayIso = new Date().toISOString().slice(0, 10);
  const startDate = params.startDate.slice(0, 10);
  const probationMonths =
    params.probationMonths !== undefined
      ? Math.min(6, Math.max(0, params.probationMonths))
      : 3;
  const probationEndDate =
    probationMonths > 0 ? addMonthsIso(startDate, probationMonths) : null;

  if (process.env.DATABASE_URL) {
    return db.transaction(async (tx) => {
      const [candidate] = await tx
        .select()
        .from(candidatesTable)
        .where(
          and(
            eq(candidatesTable.organizationId, params.organizationId),
            eq(candidatesTable.id, params.candidateId),
          ),
        )
        .limit(1);
      if (!candidate) {
        return { ok: false as const, statusCode: 404, error: "Candidate not found." };
      }
      if (candidate.convertedEmployeeId) {
        return {
          ok: false as const,
          statusCode: 409,
          error: `Candidate has already been converted to employee ${candidate.convertedEmployeeId}.`,
          existingEmployeeId: candidate.convertedEmployeeId,
        };
      }
      if (!["interview", "offer", "hired"].includes(candidate.stage)) {
        return {
          ok: false as const,
          statusCode: 400,
          error: `Candidate stage '${candidate.stage}' must reach interview/offer before conversion to employee.`,
        };
      }

      const [reqRecord] = await tx
        .select()
        .from(jobRequisitionsTable)
        .where(
          and(
            eq(jobRequisitionsTable.organizationId, params.organizationId),
            eq(jobRequisitionsTable.id, candidate.requisitionId),
          ),
        )
        .limit(1);

      if (!reqRecord) {
        return { ok: false as const, statusCode: 404, error: "Parent requisition not found." };
      }

      const targetPositionId = params.positionId ?? reqRecord.positionId ?? null;
      if (targetPositionId) {
        const [pos] = await tx
          .select()
          .from(positionsTable)
          .where(
            and(
              eq(positionsTable.organizationId, params.organizationId),
              eq(positionsTable.id, targetPositionId),
            ),
          )
          .limit(1);
        if (!pos || ["frozen", "abolished", "draft"].includes(pos.status)) {
          return {
            ok: false as const,
            statusCode: 400,
            error: "Linked position is invalid or not open for hire.",
          };
        }
      }

      const nameParts = candidate.fullName.trim().split(/\s+/);
      const firstName = nameParts[0] || "New";
      const lastName = nameParts.slice(1).join(" ") || "Employee";
      const generatedNumber =
        params.employeeNumber?.trim().toUpperCase() ||
        `REK-${Date.now().toString().slice(-5)}`;
      const workEmail = (params.workEmail || candidate.email).trim().toLowerCase();
      const employmentType =
        params.employmentType ??
        (reqRecord.employmentType as "permanent" | "fixed_term" | "casual" | "intern") ??
        "permanent";
      const status = probationMonths > 0 ? "probation" : "active";

      const [createdEmp] = await tx
        .insert(employeesTable)
        .values({
          organizationId: params.organizationId,
          employeeNumber: generatedNumber,
          firstName,
          lastName,
          preferredName: firstName,
          workEmail,
          personalEmail: candidate.email.toLowerCase(),
          phone: candidate.phone ?? null,
          jobTitle: reqRecord.title,
          departmentId: reqRecord.departmentId,
          positionId: targetPositionId,
          managerId: params.managerId ?? null,
          location: reqRecord.location,
          employmentType,
          employeeCategory: "staff",
          status,
          startDate,
          contractStartDate: startDate,
          probationEndDate,
          contractEndDate: params.contractEndDate ?? null,
          isDemo: false,
        })
        .returning();

      if (targetPositionId) {
        await tx.insert(employeePositionAssignmentsTable).values({
          organizationId: params.organizationId,
          employeeId: createdEmp!.id,
          positionId: targetPositionId,
          assignmentType: "primary",
          effectiveFrom: startDate,
          isCurrent: true,
          changeReason: `Hired from requisition ${reqRecord.id}`,
          changedByUserId: params.actorUserId,
        });
        await tx
          .update(positionsTable)
          .set({ status: "occupied" })
          .where(eq(positionsTable.id, targetPositionId));
      }

      await recordAssignmentHistoryEntry({
        organizationId: params.organizationId,
        employeeId: createdEmp!.id,
        effectiveDate: startDate,
        changeType: "hire",
        departmentId: createdEmp!.departmentId,
        positionId: targetPositionId,
        managerId: createdEmp!.managerId,
        jobTitle: createdEmp!.jobTitle,
        location: createdEmp!.location,
        employmentType: createdEmp!.employmentType,
        status: createdEmp!.status,
        reason: `Converted hired candidate ${candidate.fullName}`,
        approvedByUserId: params.actorUserId,
        changedByUserId: params.actorUserId,
        tx: tx as unknown as typeof db,
      });

      if (probationEndDate) {
        await tx.insert(probationReviewsTable).values({
          organizationId: params.organizationId,
          employeeId: createdEmp!.id,
          probationStartDate: startDate,
          probationEndDate,
          extensionCount: 0,
          milestoneDay: probationMonths * 30,
          status: "pending_review",
        });
      }

      if (params.contractEndDate) {
        await tx.insert(contractRemindersTable).values({
          organizationId: params.organizationId,
          employeeId: createdEmp!.id,
          contractEndDate: params.contractEndDate,
          reminderWindowDays: 30,
          status: "open",
        });
      }

      // Instantiate onboarding tasks from template
      const templateList = await tx
        .select()
        .from(onboardingTemplatesTable)
        .where(
          and(
            eq(onboardingTemplatesTable.organizationId, params.organizationId),
            eq(onboardingTemplatesTable.workflowType, "onboarding"),
          ),
        );
      const chosenTemplate =
        (params.onboardingTemplateId
          ? templateList.find((t) => t.id === params.onboardingTemplateId)
          : undefined) ?? templateList[0];

      const templateTasks = chosenTemplate
        ? (JSON.parse(chosenTemplate.tasksJson) as Array<{
            title: string;
            category: string;
            assigneeRole: string;
            dueOffsetDays: number;
          }>)
        : [
            {
              title: "Verify Employment Act s.10 written particulars & signed offer",
              category: "Compliance",
              assigneeRole: "hr_admin",
              dueOffsetDays: 3,
            },
            {
              title: "Complete role onboarding & workstation readiness",
              category: "Manager",
              assigneeRole: "manager",
              dueOffsetDays: 7,
            },
          ];

      const createdTasks = [];
      for (const task of templateTasks) {
        const [insertedTask] = await tx
          .insert(onboardingTasksTable)
          .values({
            organizationId: params.organizationId,
            employeeId: createdEmp!.id,
            workflowType: "onboarding",
            templateId: chosenTemplate?.id ?? null,
            title: task.title,
            category: task.category,
            assigneeRole: task.assigneeRole,
            dueDate: addCalendarDaysIso(startDate, task.dueOffsetDays || 5),
            completed: false,
          })
          .returning();
        createdTasks.push(insertedTask!);
      }

      // Create offer summary document placeholder record for traceability
      await tx.insert(documentsTable).values({
        organizationId: params.organizationId,
        employeeId: createdEmp!.id,
        name: `Offer Acceptance & Particulars Record - ${createdEmp!.firstName} ${createdEmp!.lastName}`,
        category: "Offer Letter",
        uploadedByUserId: params.actorUserId,
      });

      await tx
        .update(candidatesTable)
        .set({
          stage: "hired",
          convertedEmployeeId: createdEmp!.id,
          convertedAt: new Date(),
          offerDetailsJson: JSON.stringify({
            startDate,
            employmentType,
            positionId: targetPositionId,
            offerNotes: params.offerNotes ?? null,
            convertedAtIso: todayIso,
          }),
        })
        .where(eq(candidatesTable.id, candidate.id));

      await recordAuditEvent({
        organizationId: params.organizationId,
        actorUserId: params.actorUserId,
        actor: params.actorName,
        action: "recruitment.candidate_converted_to_employee",
        targetType: "employee",
        targetId: createdEmp!.id,
        summary: `Converted candidate '${candidate.fullName}' (${candidate.id}) into employee ${createdEmp!.employeeNumber} with ${createdTasks.length} onboarding task(s).`,
        critical: true,
        tx: tx as unknown as typeof db,
      });

      return {
        ok: true as const,
        employee: createdEmp!,
        onboardingTasksCreated: createdTasks.length,
        probationEndDate,
      };
    });
  }

  // Sandbox / offline mode
  const candidate = params.demoCandidates.find((c) => c.id === params.candidateId);
  if (!candidate) {
    return { ok: false as const, statusCode: 404, error: "Candidate not found." };
  }
  if (candidate.convertedEmployeeId) {
    return {
      ok: false as const,
      statusCode: 409,
      error: `Candidate has already been converted to employee ${candidate.convertedEmployeeId}.`,
      existingEmployeeId: candidate.convertedEmployeeId,
    };
  }
  if (!["interview", "offer", "hired"].includes(candidate.stage)) {
    return {
      ok: false as const,
      statusCode: 400,
      error: `Candidate stage '${candidate.stage}' must reach interview/offer before conversion to employee.`,
    };
  }

  const reqRecord = params.demoRequisitions.find((r) => r.id === candidate.requisitionId);
  if (!reqRecord) {
    return { ok: false as const, statusCode: 404, error: "Parent requisition not found." };
  }

  const targetPositionId = params.positionId ?? reqRecord.positionId ?? null;
  if (targetPositionId) {
    const pos = phase2MemoryStore.positions.find(
      (p) => p.organizationId === params.organizationId && p.id === targetPositionId,
    );
    if (!pos || ["frozen", "abolished", "draft"].includes(pos.status)) {
      return {
        ok: false as const,
        statusCode: 400,
        error: "Linked position is invalid or not open for hire.",
      };
    }
  }

  const nameParts = String(candidate.fullName).trim().split(/\s+/);
  const firstName = nameParts[0] || "New";
  const lastName = nameParts.slice(1).join(" ") || "Employee";
  const generatedNumber =
    params.employeeNumber?.trim().toUpperCase() ||
    `REK-${Date.now().toString().slice(-5)}`;
  const workEmail = (params.workEmail || candidate.email).trim().toLowerCase();
  const employmentType =
    params.employmentType ??
    (reqRecord.employmentType as "permanent" | "fixed_term" | "casual" | "intern") ??
    "permanent";
  const status = probationMonths > 0 ? "probation" : "active";
  const dept = params.demoDepartments.find((d) => d.id === reqRecord.departmentId);
  const mgr = params.managerId
    ? params.demoEmployees.find((e) => e.id === params.managerId)
    : null;

  const newEmpId = randomUUID();
  const newEmployee = {
    id: newEmpId,
    employeeNumber: generatedNumber,
    firstName,
    lastName,
    preferredName: firstName,
    workEmail,
    phone: candidate.phone ?? null,
    jobTitle: reqRecord.title,
    departmentId: reqRecord.departmentId,
    departmentName: dept?.name ?? "Department",
    managerId: params.managerId ?? null,
    managerName: mgr ? `${mgr.firstName} ${mgr.lastName}` : null,
    location: reqRecord.location,
    employmentType,
    status,
    startDate,
    probationEndDate,
    contractEndDate: params.contractEndDate ?? null,
    isDemo: true,
  };
  params.demoEmployees.push(newEmployee);
  phase2MemoryStore.employeeExtras.set(newEmpId, {
    personalEmail: candidate.email.toLowerCase(),
    positionId: targetPositionId,
    employeeCategory: "staff",
    contractStartDate: startDate,
    timezone: "Africa/Nairobi",
  });

  if (targetPositionId) {
    phase2MemoryStore.positionAssignments.push({
      id: randomUUID(),
      organizationId: params.organizationId,
      employeeId: newEmpId,
      positionId: targetPositionId,
      assignmentType: "primary",
      effectiveFrom: startDate,
      effectiveTo: null,
      isCurrent: true,
      changeReason: `Hired from requisition ${reqRecord.id}`,
      changedByUserId: params.actorUserId,
      createdAt: new Date(),
    });
    const pos = phase2MemoryStore.positions.find((p) => p.id === targetPositionId);
    if (pos) pos.status = "occupied";
  }

  await recordAssignmentHistoryEntry({
    organizationId: params.organizationId,
    employeeId: newEmpId,
    effectiveDate: startDate,
    changeType: "hire",
    departmentId: newEmployee.departmentId,
    positionId: targetPositionId,
    managerId: newEmployee.managerId,
    jobTitle: newEmployee.jobTitle,
    location: newEmployee.location,
    employmentType: newEmployee.employmentType,
    status: newEmployee.status,
    reason: `Converted hired candidate ${candidate.fullName}`,
    approvedByUserId: params.actorUserId,
    changedByUserId: params.actorUserId,
  });

  if (probationEndDate) {
    phase2MemoryStore.probationReviews.push({
      id: randomUUID(),
      organizationId: params.organizationId,
      employeeId: newEmpId,
      probationStartDate: startDate,
      probationEndDate,
      extendedUntilDate: null,
      extensionCount: 0,
      milestoneDay: probationMonths * 30,
      status: "pending_review",
      managerRecommendation: null,
      outcome: null,
      decisionNotes: null,
      reviewedByUserId: null,
      reviewedAt: null,
      createdAt: new Date(),
    });
  }

  if (params.contractEndDate) {
    phase2MemoryStore.contractReminders.push({
      id: randomUUID(),
      organizationId: params.organizationId,
      employeeId: newEmpId,
      contractEndDate: params.contractEndDate,
      reminderWindowDays: 30,
      status: "open",
      actionTaken: null,
      notes: "Tracked fixed-term contract milestone.",
      handledByUserId: null,
      handledAt: null,
      createdAt: new Date(),
    });
  }

  const chosenTemplate =
    (params.onboardingTemplateId
      ? phase2MemoryStore.onboardingTemplates.find(
          (t) =>
            t.id === params.onboardingTemplateId &&
            t.organizationId === params.organizationId,
        )
      : undefined) ??
    phase2MemoryStore.onboardingTemplates.find(
      (t) => t.organizationId === params.organizationId && t.workflowType === "onboarding",
    );

  const templateTasks = chosenTemplate
    ? (JSON.parse(chosenTemplate.tasksJson) as Array<{
        title: string;
        category: string;
        assigneeRole: string;
        dueOffsetDays: number;
      }>)
    : [
        {
          title: "Verify Employment Act s.10 written particulars & signed offer",
          category: "Compliance",
          assigneeRole: "hr_admin",
          dueOffsetDays: 3,
        },
      ];

  for (const task of templateTasks) {
    params.demoOnboardingTasks.push({
      id: randomUUID(),
      employeeId: newEmpId,
      employeeName: `${newEmployee.firstName} ${newEmployee.lastName}`,
      workflowType: "onboarding",
      title: task.title,
      category: task.category,
      assigneeRole: task.assigneeRole,
      dueDate: addCalendarDaysIso(startDate, task.dueOffsetDays || 5),
      completed: false,
      completedAt: null,
    });
  }

  candidate.stage = "hired";
  candidate.convertedEmployeeId = newEmpId;
  candidate.convertedAt = new Date().toISOString();

  await recordAuditEvent({
    organizationId: params.organizationId,
    actorUserId: params.actorUserId,
    actor: params.actorName,
    action: "recruitment.candidate_converted_to_employee",
    targetType: "employee",
    targetId: newEmpId,
    summary: `Converted candidate '${candidate.fullName}' into employee ${newEmployee.employeeNumber} with ${templateTasks.length} onboarding task(s).`,
    critical: true,
    isDemo: true,
  });

  return {
    ok: true as const,
    employee: newEmployee,
    onboardingTasksCreated: templateTasks.length,
    probationEndDate,
  };
}

export async function listProbationAndContracts(
  organizationId: string,
  demoEmployees: Array<any>,
) {
  const reviews = process.env.DATABASE_URL
    ? await db
        .select()
        .from(probationReviewsTable)
        .where(eq(probationReviewsTable.organizationId, organizationId))
        .orderBy(probationReviewsTable.probationEndDate)
    : phase2MemoryStore.probationReviews.filter(
        (p) => p.organizationId === organizationId,
      );

  const contracts = process.env.DATABASE_URL
    ? await db
        .select()
        .from(contractRemindersTable)
        .where(eq(contractRemindersTable.organizationId, organizationId))
        .orderBy(contractRemindersTable.contractEndDate)
    : phase2MemoryStore.contractReminders.filter(
        (c) => c.organizationId === organizationId,
      );

  const emps = process.env.DATABASE_URL
    ? await db
        .select({
          id: employeesTable.id,
          employeeNumber: employeesTable.employeeNumber,
          firstName: employeesTable.firstName,
          lastName: employeesTable.lastName,
          jobTitle: employeesTable.jobTitle,
          status: employeesTable.status,
          employmentType: employeesTable.employmentType,
          contractEndDate: employeesTable.contractEndDate,
          probationEndDate: employeesTable.probationEndDate,
        })
        .from(employeesTable)
        .where(eq(employeesTable.organizationId, organizationId))
    : demoEmployees;

  const empMap = new Map(emps.map((e) => [e.id, e]));

  return {
    probationReviews: reviews.map((r) => {
      const emp = empMap.get(r.employeeId);
      return {
        ...r,
        employeeName: emp ? `${emp.firstName} ${emp.lastName}` : r.employeeId,
        employeeNumber: emp?.employeeNumber ?? "",
        jobTitle: emp?.jobTitle ?? "",
        employeeStatus: emp?.status ?? "",
      };
    }),
    contractReminders: contracts.map((c) => {
      const emp = empMap.get(c.employeeId);
      return {
        ...c,
        employeeName: emp ? `${emp.firstName} ${emp.lastName}` : c.employeeId,
        employeeNumber: emp?.employeeNumber ?? "",
        jobTitle: emp?.jobTitle ?? "",
        employeeStatus: emp?.status ?? "",
      };
    }),
  };
}

export async function decideProbationReview(params: {
  organizationId: string;
  actorUserId: string;
  actorName: string;
  reviewId: string;
  decision: "confirm" | "extend" | "do_not_confirm";
  extendedUntilDate?: string;
  notes: string;
  demoEmployees: Array<any>;
  demoDepartments: Array<any>;
}) {
  const existing = process.env.DATABASE_URL
    ? (
        await db
          .select()
          .from(probationReviewsTable)
          .where(
            and(
              eq(probationReviewsTable.organizationId, params.organizationId),
              eq(probationReviewsTable.id, params.reviewId),
            ),
          )
          .limit(1)
      )[0]
    : phase2MemoryStore.probationReviews.find(
        (r) => r.organizationId === params.organizationId && r.id === params.reviewId,
      );

  if (!existing) {
    return { ok: false as const, statusCode: 404, error: "Probation review not found." };
  }

  if (params.decision === "extend") {
    if (existing.extensionCount >= 1) {
      return {
        ok: false as const,
        statusCode: 400,
        error:
          "Kenya Employment Act s.42 permits probation extension only once with employee agreement.",
      };
    }
    if (!params.extendedUntilDate) {
      return {
        ok: false as const,
        statusCode: 400,
        error: "extendedUntilDate is required when extending probation.",
      };
    }
  }

  const todayIso = new Date().toISOString().slice(0, 10);

  if (process.env.DATABASE_URL) {
    const [updated] = await db
      .update(probationReviewsTable)
      .set({
        status:
          params.decision === "confirm"
            ? "confirmed"
            : params.decision === "extend"
              ? "extended"
              : "non_confirmation_review",
        outcome: params.decision,
        decisionNotes: params.notes,
        extendedUntilDate:
          params.decision === "extend"
            ? params.extendedUntilDate!
            : existing.extendedUntilDate,
        extensionCount:
          params.decision === "extend"
            ? existing.extensionCount + 1
            : existing.extensionCount,
        reviewedByUserId: params.actorUserId,
        reviewedAt: new Date(),
      })
      .where(eq(probationReviewsTable.id, existing.id))
      .returning();

    if (params.decision === "confirm") {
      await applyEffectiveDatedAssignmentChange({
        organizationId: params.organizationId,
        actorUserId: params.actorUserId,
        actorName: params.actorName,
        employeeId: existing.employeeId,
        effectiveDate: todayIso,
        changeType: "status_change",
        status: "active",
        probationEndDate: existing.probationEndDate,
        reason: `Probation confirmed: ${params.notes}`,
      });
    } else if (params.decision === "extend") {
      await db
        .update(employeesTable)
        .set({ probationEndDate: params.extendedUntilDate! })
        .where(eq(employeesTable.id, existing.employeeId));
    }

    await recordAuditEvent({
      organizationId: params.organizationId,
      actorUserId: params.actorUserId,
      actor: params.actorName,
      action: `probation.${params.decision}`,
      targetType: "probation_review",
      targetId: existing.id,
      summary: `Probation decision '${params.decision}' for employee ${existing.employeeId}: ${params.notes}`,
      critical: true,
    });

    return { ok: true as const, review: updated! };
  }

  existing.status =
    params.decision === "confirm"
      ? "confirmed"
      : params.decision === "extend"
        ? "extended"
        : "non_confirmation_review";
  existing.outcome = params.decision;
  existing.decisionNotes = params.notes;
  if (params.decision === "extend") {
    existing.extendedUntilDate = params.extendedUntilDate!;
    existing.extensionCount += 1;
  }
  existing.reviewedByUserId = params.actorUserId;
  existing.reviewedAt = new Date();

  if (params.decision === "confirm") {
    await applyEffectiveDatedAssignmentChange({
      organizationId: params.organizationId,
      actorUserId: params.actorUserId,
      actorName: params.actorName,
      employeeId: existing.employeeId,
      effectiveDate: todayIso,
      changeType: "status_change",
      status: "active",
      probationEndDate: existing.probationEndDate,
      reason: `Probation confirmed: ${params.notes}`,
      demoEmployees: params.demoEmployees,
      demoDepartments: params.demoDepartments,
    });
  } else if (params.decision === "extend") {
    const emp = params.demoEmployees.find((e) => e.id === existing.employeeId);
    if (emp) emp.probationEndDate = params.extendedUntilDate!;
  }

  await recordAuditEvent({
    organizationId: params.organizationId,
    actorUserId: params.actorUserId,
    actor: params.actorName,
    action: `probation.${params.decision}`,
    targetType: "probation_review",
    targetId: existing.id,
    summary: `Probation decision '${params.decision}' for employee ${existing.employeeId}: ${params.notes}`,
    critical: true,
    isDemo: true,
  });

  return { ok: true as const, review: existing };
}

export async function initiateStructuredOffboarding(params: {
  organizationId: string;
  actorUserId: string;
  actorName: string;
  employeeId: string;
  effectiveDate: string;
  reason: string;
  onboardingTemplateId?: string | null;
  demoEmployees: Array<any>;
  demoDepartments: Array<any>;
  demoOnboardingTasks: Array<any>;
  demoAssets?: Array<any>;
}) {
  const assignedAssets = process.env.DATABASE_URL
    ? await db
        .select()
        .from(assetsTable)
        .where(
          and(
            eq(assetsTable.organizationId, params.organizationId),
            eq(assetsTable.assignedEmployeeId, params.employeeId),
          ),
        )
    : (params.demoAssets ?? []).filter(
        (a) => a.assignedEmployeeId === params.employeeId,
      );

  const unreturnedAssets = assignedAssets.filter((a) => a.status === "assigned");

  const result = await applyEffectiveDatedAssignmentChange({
    organizationId: params.organizationId,
    actorUserId: params.actorUserId,
    actorName: params.actorName,
    employeeId: params.employeeId,
    effectiveDate: params.effectiveDate,
    changeType: "offboarding",
    status: "former",
    reason: params.reason,
    demoEmployees: params.demoEmployees,
    demoDepartments: params.demoDepartments,
  });

  const offboardingTemplate =
    (params.onboardingTemplateId
      ? (process.env.DATABASE_URL
          ? (
              await db
                .select()
                .from(onboardingTemplatesTable)
                .where(
                  and(
                    eq(onboardingTemplatesTable.organizationId, params.organizationId),
                    eq(onboardingTemplatesTable.id, params.onboardingTemplateId),
                  ),
                )
                .limit(1)
            )[0]
          : phase2MemoryStore.onboardingTemplates.find(
              (t) =>
                t.organizationId === params.organizationId &&
                t.id === params.onboardingTemplateId,
            ))
      : undefined) ??
    (process.env.DATABASE_URL
      ? (
          await db
            .select()
            .from(onboardingTemplatesTable)
            .where(
              and(
                eq(onboardingTemplatesTable.organizationId, params.organizationId),
                eq(onboardingTemplatesTable.workflowType, "offboarding"),
              ),
            )
            .limit(1)
        )[0]
      : phase2MemoryStore.onboardingTemplates.find(
          (t) =>
            t.organizationId === params.organizationId &&
            t.workflowType === "offboarding",
        ));

  const templateTasks = offboardingTemplate
    ? (JSON.parse(offboardingTemplate.tasksJson) as Array<{
        title: string;
        category: string;
        assigneeRole: string;
        dueOffsetDays: number;
      }>)
    : [
        {
          title: "Complete equipment return & access revocation",
          category: "Asset Clearance",
          assigneeRole: "it_admin",
          dueOffsetDays: 2,
        },
      ];

  for (const a of unreturnedAssets) {
    templateTasks.push({
      title: `Recover assigned asset ${a.assetTag} (${a.name})`,
      category: "Asset Clearance",
      assigneeRole: "it_admin",
      dueOffsetDays: 1,
    });
  }

  if (process.env.DATABASE_URL) {
    for (const task of templateTasks) {
      await db.insert(onboardingTasksTable).values({
        organizationId: params.organizationId,
        employeeId: params.employeeId,
        workflowType: "offboarding",
        templateId: offboardingTemplate?.id ?? null,
        title: task.title,
        category: task.category,
        assigneeRole: task.assigneeRole,
        dueDate: addCalendarDaysIso(params.effectiveDate, task.dueOffsetDays || 2),
        completed: false,
      });
    }
  } else {
    const emp = params.demoEmployees.find((e) => e.id === params.employeeId);
    for (const task of templateTasks) {
      params.demoOnboardingTasks.push({
        id: randomUUID(),
        employeeId: params.employeeId,
        employeeName: emp ? `${emp.firstName} ${emp.lastName}` : params.employeeId,
        workflowType: "offboarding",
        title: task.title,
        category: task.category,
        assigneeRole: task.assigneeRole,
        dueDate: addCalendarDaysIso(params.effectiveDate, task.dueOffsetDays || 2),
        completed: false,
        completedAt: null,
      });
    }
  }

  return {
    employee: result.employee,
    historyEntry: result.historyEntry,
    offboardingTasksCreated: templateTasks.length,
    unreturnedAssetsCount: unreturnedAssets.length,
    unreturnedAssets,
  };
}

