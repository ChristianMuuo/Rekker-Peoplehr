import { Router, type IRouter } from "express";
import { and, eq } from "drizzle-orm";
import {
  candidatesTable,
  db,
  employeesTable,
  jobRequisitionsTable,
  onboardingTasksTable,
} from "@workspace/db";
import { MODULE_PERMISSION_MATRIX } from "../lib/authorization";
import {
  getReadAccess,
  PEOPLEOS_ROLES,
  requireRoles,
} from "../middlewares/peopleosAccess";
import {
  DEMO_DEPARTMENTS_LIST,
  DEMO_EMPLOYEES_LIST,
} from "./peopleos";
import {
  CANDIDATES as DEMO_CANDIDATES,
  REQUISITIONS as DEMO_REQUISITIONS,
} from "./recruitment";
import { DEMO_LIFECYCLE_TASKS } from "./onboarding";
import { DEMO_ASSETS } from "./assets";
import {
  applyEffectiveDatedAssignmentChange,
  getEmployeeCompletenessForOrg,
  getEmployeeLifecycleTimeline,
  HierarchyValidationError,
  listEmployeeAssignmentHistory,
} from "../services/employeeMasterService";
import {
  ALLOWLISTED_IMPORT_FIELDS,
  getImportBatchErrorsCsv,
  getImportTemplate,
  listImportBatches,
  listMappingProfiles,
  saveMappingProfile,
} from "../services/csvImportService";
import {
  createPosition,
  listPositionsWithOccupancy,
  transitionPositionStatus,
} from "../services/orgPositionsService";
import {
  decidePrivacyRequest,
  decideProfileCorrectionRequest,
  getManagerScopedWorkspace,
  getSelfServiceWorkspace,
  submitPrivacyRequest,
  submitProfileCorrectionRequest,
} from "../services/selfServicePrivacyService";
import { KENYA_HR_LEGAL_METADATA } from "../services/kenyaComplianceService";
import {
  getWorkCalendars,
  upsertWorkCalendar,
} from "../services/workCalendarService";
import {
  getDataQualityAnalytics,
  getLifecycleAnalytics,
  getWorkforceAnalytics,
} from "../services/peopleAnalyticsService";
import { phase2MemoryStore } from "../services/phase2MemoryStore";

const router: IRouter = Router();
const peopleManagers: readonly string[] = [
  ...MODULE_PERMISSION_MATRIX.hrAndPeopleCore.writeRoles,
];
const managerAndHrRoles: readonly string[] = [
  ...MODULE_PERMISSION_MATRIX.hrAndPeopleCore.writeRoles,
  PEOPLEOS_ROLES.departmentManager,
  PEOPLEOS_ROLES.productionSupervisor,
  PEOPLEOS_ROLES.warehouseSupervisor,
  PEOPLEOS_ROLES.salesManager,
];
const allEmployeeRoles: readonly string[] = Object.values(PEOPLEOS_ROLES);

const CHANGE_TYPES = new Set([
  "transfer",
  "promotion",
  "manager_change",
  "position_change",
  "status_change",
  "contract_renewal",
  "offboarding",
  "profile_update",
]);
const POSITION_STATUSES = new Set([
  "draft",
  "pending_approval",
  "approved",
  "vacant",
  "occupied",
  "frozen",
  "abolished",
]);
const EMPLOYMENT_TYPES = new Set(["permanent", "fixed_term", "casual", "intern"]);

// ─── Workstream F: Self-Service Workspace (/api/peopleos/me) ────────────────

router.get("/peopleos/me", async (req, res): Promise<void> => {
  const access = await getReadAccess(req, res);
  if (!access || !access.membership) return;

  const workspace = await getSelfServiceWorkspace({
    membership: access.membership,
    demoEmployees: DEMO_EMPLOYEES_LIST,
    demoDepartments: DEMO_DEPARTMENTS_LIST,
    demoOnboardingTasks: DEMO_LIFECYCLE_TASKS,
    demoAssets: DEMO_ASSETS,
  });
  res.json(workspace);
});

router.get("/peopleos/manager/workspace", async (req, res): Promise<void> => {
  const membership = await requireRoles(req, res, managerAndHrRoles);
  if (!membership) return;

  const workspace = await getManagerScopedWorkspace({
    membership,
    demoEmployees: DEMO_EMPLOYEES_LIST,
    demoDepartments: DEMO_DEPARTMENTS_LIST,
  });
  res.json(workspace);
});

// ─── Workstream A: Effective-Dated Assignment History & Timeline ─────────────

router.get(
  "/peopleos/employees/:employeeId/assignment-history",
  async (req, res): Promise<void> => {
    const access = await getReadAccess(req, res);
    if (!access || !access.membership) return;

    const employeeId = String(req.params.employeeId ?? "");
    const history = await listEmployeeAssignmentHistory(
      access.membership.organizationId,
      employeeId,
    );
    res.json({
      employeeId,
      history,
      historicalGapNotice:
        history.length === 0
          ? "No effective-dated assignment changes recorded yet prior to Phase 2 tracking."
          : null,
    });
  },
);

router.get(
  "/peopleos/employees/:employeeId/timeline",
  async (req, res): Promise<void> => {
    const access = await getReadAccess(req, res);
    if (!access || !access.membership) return;

    const employeeId = String(req.params.employeeId ?? "");
    let startDate: string | undefined;
    if (process.env.DATABASE_URL) {
      const [emp] = await db
        .select({ startDate: employeesTable.startDate })
        .from(employeesTable)
        .where(
          and(
            eq(employeesTable.organizationId, access.membership.organizationId),
            eq(employeesTable.id, employeeId),
          ),
        )
        .limit(1);
      startDate = emp?.startDate;
    } else {
      const emp = DEMO_EMPLOYEES_LIST.find((e) => e.id === employeeId);
      if (emp) startDate = String(emp.startDate).slice(0, 10);
    }

    const timeline = await getEmployeeLifecycleTimeline(
      access.membership.organizationId,
      employeeId,
      startDate,
    );
    res.json({ employeeId, ...timeline });
  },
);

router.post(
  "/peopleos/employees/:employeeId/assignment-changes",
  async (req, res): Promise<void> => {
    const membership = await requireRoles(req, res, peopleManagers);
    if (!membership) return;

    const body = req.body ?? {};
    const effectiveDate = String(body.effectiveDate ?? "").slice(0, 10);
    const changeType = String(body.changeType ?? "");
    const reason = String(body.reason ?? "").trim();

    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(effectiveDate) ||
      !CHANGE_TYPES.has(changeType) ||
      reason.length < 3
    ) {
      res.status(400).json({
        error: "Valid effectiveDate (YYYY-MM-DD), changeType, and reason (>=3 chars) are required.",
      });
      return;
    }

    try {
      const result = await applyEffectiveDatedAssignmentChange({
        organizationId: membership.organizationId,
        actorUserId: membership.userId,
        actorName: membership.role,
        employeeId: String(req.params.employeeId ?? ""),
        effectiveDate,
        changeType: changeType as any,
        reason,
        departmentId: typeof body.departmentId === "string" ? body.departmentId : undefined,
        positionId: body.positionId === null ? null : typeof body.positionId === "string" ? body.positionId : undefined,
        managerId: body.managerId === null ? null : typeof body.managerId === "string" ? body.managerId : undefined,
        jobTitle: typeof body.jobTitle === "string" ? body.jobTitle : undefined,
        location: typeof body.location === "string" ? body.location : undefined,
        employmentType: EMPLOYMENT_TYPES.has(body.employmentType) ? body.employmentType : undefined,
        status: ["active", "probation", "on_leave", "suspended", "former"].includes(body.status) ? body.status : undefined,
        contractEndDate: body.contractEndDate === null ? null : typeof body.contractEndDate === "string" ? body.contractEndDate : undefined,
        probationEndDate: body.probationEndDate === null ? null : typeof body.probationEndDate === "string" ? body.probationEndDate : undefined,
        demoEmployees: DEMO_EMPLOYEES_LIST,
        demoDepartments: DEMO_DEPARTMENTS_LIST,
      });
      res.status(201).json(result);
    } catch (err) {
      if (err instanceof HierarchyValidationError) {
        res.status(err.statusCode).json({ error: err.message, code: err.code });
        return;
      }
      res
        .status(400)
        .json({ error: err instanceof Error ? err.message : "Failed to apply assignment change." });
    }
  },
);

// ─── Workstream B: Import Templates, Mapping Profiles, Batch History, Errors ─

router.get("/peopleos/employees/import-template", async (req, res): Promise<void> => {
  const membership = await requireRoles(req, res, peopleManagers);
  if (!membership) return;

  const kind = req.query.kind === "starter_guide" ? "starter_guide" : "standard";
  const tpl = getImportTemplate(kind);
  if (req.query.download === "1") {
    res.setHeader("Content-Type", `${tpl.mimeType}; charset=utf-8`);
    res.setHeader("Content-Disposition", `attachment; filename="${tpl.fileName}"`);
    res.send(tpl.content);
    return;
  }
  res.json({
    ...tpl,
    allowlistedFields: [...ALLOWLISTED_IMPORT_FIELDS],
  });
});

router.get(
  "/peopleos/employees/import-mapping-profiles",
  async (req, res): Promise<void> => {
    const membership = await requireRoles(req, res, peopleManagers);
    if (!membership) return;

    const profiles = await listMappingProfiles(membership.organizationId);
    res.json({ items: profiles });
  },
);

router.post(
  "/peopleos/employees/import-mapping-profiles",
  async (req, res): Promise<void> => {
    const membership = await requireRoles(req, res, peopleManagers);
    if (!membership) return;

    const { name, description, mapping } = req.body ?? {};
    if (typeof name !== "string" || name.trim().length < 2 || !mapping || typeof mapping !== "object") {
      res.status(400).json({ error: "Profile name and mapping object are required." });
      return;
    }

    try {
      const saved = await saveMappingProfile({
        organizationId: membership.organizationId,
        actorUserId: membership.userId,
        name,
        description: typeof description === "string" ? description : null,
        mapping: mapping as Record<string, string>,
      });
      res.status(201).json(saved);
    } catch (err) {
      res
        .status(400)
        .json({ error: err instanceof Error ? err.message : "Invalid mapping profile." });
    }
  },
);

router.get("/peopleos/employees/import-batches", async (req, res): Promise<void> => {
  const membership = await requireRoles(req, res, peopleManagers);
  if (!membership) return;

  const batches = await listImportBatches(membership.organizationId);
  res.json({ items: batches });
});

router.get(
  "/peopleos/employees/import-batches/:batchId/errors.csv",
  async (req, res): Promise<void> => {
    const membership = await requireRoles(req, res, peopleManagers);
    if (!membership) return;

    const result = await getImportBatchErrorsCsv(
      membership.organizationId,
      String(req.params.batchId ?? ""),
    );
    if (!result) {
      res.status(404).json({ error: "Import batch not found." });
      return;
    }

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${result.fileName}"`);
    res.send(result.csv);
  },
);

// ─── Workstream D: Position & Establishment Management ───────────────────────

router.get("/peopleos/positions", async (req, res): Promise<void> => {
  const access = await getReadAccess(req, res);
  if (!access || !access.membership) return;

  const result = await listPositionsWithOccupancy(
    access.membership.organizationId,
    DEMO_EMPLOYEES_LIST,
    DEMO_DEPARTMENTS_LIST,
  );
  res.json(result);
});

router.post("/peopleos/positions", async (req, res): Promise<void> => {
  const membership = await requireRoles(req, res, peopleManagers);
  if (!membership) return;

  const b = req.body ?? {};
  if (
    typeof b.positionCode !== "string" ||
    b.positionCode.trim().length < 2 ||
    typeof b.title !== "string" ||
    b.title.trim().length < 2 ||
    typeof b.departmentId !== "string" ||
    typeof b.location !== "string" ||
    !EMPLOYMENT_TYPES.has(b.employmentType)
  ) {
    res.status(400).json({
      error: "positionCode, title, departmentId, location, and valid employmentType are required.",
    });
    return;
  }

  try {
    const created = await createPosition({
      organizationId: membership.organizationId,
      actorUserId: membership.userId,
      actorName: membership.role,
      positionCode: b.positionCode,
      title: b.title,
      departmentId: b.departmentId,
      reportsToPositionId: b.reportsToPositionId ?? null,
      location: b.location,
      employmentType: b.employmentType,
      employeeCategory: typeof b.employeeCategory === "string" ? b.employeeCategory : "staff",
      budgetedHeadcount: b.budgetedHeadcount !== undefined ? Number(b.budgetedHeadcount) : 1,
      gradeBand: b.gradeBand ?? null,
      costCenter: b.costCenter ?? null,
      description: b.description ?? null,
      initialStatus: ["draft", "pending_approval", "approved", "vacant"].includes(b.initialStatus)
        ? b.initialStatus
        : "draft",
      demoDepartments: DEMO_DEPARTMENTS_LIST,
    });
    res.status(201).json(created);
  } catch (err) {
    res
      .status(400)
      .json({ error: err instanceof Error ? err.message : "Could not create position." });
  }
});

router.post(
  "/peopleos/positions/:positionId/transition",
  async (req, res): Promise<void> => {
    const membership = await requireRoles(req, res, peopleManagers);
    if (!membership) return;

    const targetStatus = String(req.body?.targetStatus ?? "");
    if (!POSITION_STATUSES.has(targetStatus)) {
      res.status(400).json({ error: "Invalid targetStatus for position." });
      return;
    }

    try {
      const updated = await transitionPositionStatus({
        organizationId: membership.organizationId,
        actorUserId: membership.userId,
        actorName: membership.role,
        positionId: String(req.params.positionId ?? ""),
        targetStatus: targetStatus as any,
        demoEmployees: DEMO_EMPLOYEES_LIST,
      });
      res.json(updated);
    } catch (err) {
      res
        .status(400)
        .json({ error: err instanceof Error ? err.message : "Position transition failed." });
    }
  },
);

// ─── Workstream F & H: Profile Correction & ODPC Privacy Rights Requests ─────

router.post("/peopleos/profile-correction-requests", async (req, res): Promise<void> => {
  const membership = await requireRoles(req, res, allEmployeeRoles);
  if (!membership) return;

  const { fieldName, proposedValue, reason } = req.body ?? {};
  if (
    typeof fieldName !== "string" ||
    typeof proposedValue !== "string" ||
    typeof reason !== "string" ||
    !proposedValue.trim() ||
    reason.trim().length < 3
  ) {
    res.status(400).json({ error: "fieldName, proposedValue, and reason are required." });
    return;
  }

  const result = await submitProfileCorrectionRequest({
    membership,
    fieldName,
    proposedValue,
    reason,
    demoEmployees: DEMO_EMPLOYEES_LIST,
  });
  if (!result.ok) {
    res.status(result.statusCode).json({ error: result.error });
    return;
  }
  res.status(201).json(result.request);
});

router.post(
  "/peopleos/profile-correction-requests/:requestId/decide",
  async (req, res): Promise<void> => {
    const membership = await requireRoles(req, res, peopleManagers);
    if (!membership) return;

    const { decision, comment } = req.body ?? {};
    if (decision !== "approved" && decision !== "rejected") {
      res.status(400).json({ error: "decision must be 'approved' or 'rejected'." });
      return;
    }

    const result = await decideProfileCorrectionRequest({
      membership,
      requestId: String(req.params.requestId ?? ""),
      decision,
      comment: typeof comment === "string" ? comment : undefined,
      demoEmployees: DEMO_EMPLOYEES_LIST,
    });
    if (!result.ok) {
      res.status(result.statusCode).json({ error: result.error });
      return;
    }
    res.json(result.request);
  },
);

router.post("/peopleos/privacy-requests", async (req, res): Promise<void> => {
  const membership = await requireRoles(req, res, allEmployeeRoles);
  if (!membership) return;

  const { requestType, details } = req.body ?? {};
  if (
    !["access", "rectification", "erasure", "restriction"].includes(requestType) ||
    typeof details !== "string" ||
    details.trim().length < 5
  ) {
    res.status(400).json({
      error: "Valid requestType (access | rectification | erasure | restriction) and details are required.",
    });
    return;
  }

  const result = await submitPrivacyRequest({
    membership,
    requestType,
    details,
  });
  if (!result.ok) {
    res.status(result.statusCode).json({ error: result.error });
    return;
  }
  res.status(201).json(result.request);
});

router.post(
  "/peopleos/privacy-requests/:requestId/decide",
  async (req, res): Promise<void> => {
    const membership = await requireRoles(req, res, peopleManagers);
    if (!membership) return;

    const { status, decisionNotes } = req.body ?? {};
    if (
      !["under_review", "fulfilled", "retention_exception_retained", "rejected"].includes(status) ||
      typeof decisionNotes !== "string" ||
      decisionNotes.trim().length < 3
    ) {
      res.status(400).json({ error: "Valid status and decisionNotes are required." });
      return;
    }

    const result = await decidePrivacyRequest({
      membership,
      requestId: String(req.params.requestId ?? ""),
      status,
      decisionNotes,
    });
    if (!result.ok) {
      res.status(result.statusCode).json({ error: result.error });
      return;
    }
    res.json(result.request);
  },
);

// ─── Workstream G: Work Calendars & Kenyan Compliance Readiness ─────────────

router.get("/peopleos/work-calendars", async (req, res): Promise<void> => {
  const access = await getReadAccess(req, res);
  if (!access || !access.membership) return;

  const calendars = await getWorkCalendars(access.membership.organizationId);
  res.json({ items: calendars });
});

router.post("/peopleos/work-calendars", async (req, res): Promise<void> => {
  const membership = await requireRoles(req, res, peopleManagers);
  if (!membership) return;

  const b = req.body ?? {};
  if (
    typeof b.name !== "string" ||
    b.name.trim().length < 2 ||
    typeof b.timezone !== "string" ||
    !Array.isArray(b.workdays) ||
    b.workdays.length === 0 ||
    typeof b.shiftStartTime !== "string" ||
    typeof b.shiftEndTime !== "string"
  ) {
    res.status(400).json({
      error: "name, timezone, non-empty workdays, shiftStartTime, and shiftEndTime are required.",
    });
    return;
  }

  try {
    const saved = await upsertWorkCalendar({
      organizationId: membership.organizationId,
      actorUserId: membership.userId,
      actorName: membership.role,
      name: b.name,
      location: typeof b.location === "string" ? b.location : null,
      timezone: b.timezone,
      workdays: b.workdays.map(Number),
      holidays: Array.isArray(b.holidays) ? b.holidays : [],
      shiftStartTime: b.shiftStartTime,
      shiftEndTime: b.shiftEndTime,
      isDefault: Boolean(b.isDefault),
    });
    res.status(201).json(saved);
  } catch (err) {
    res
      .status(400)
      .json({ error: err instanceof Error ? err.message : "Invalid work calendar configuration." });
  }
});

router.get("/peopleos/compliance/kenya-readiness", async (req, res): Promise<void> => {
  const membership = await requireRoles(req, res, peopleManagers);
  if (!membership) return;

  const completeness = await getEmployeeCompletenessForOrg(
    membership.organizationId,
    DEMO_EMPLOYEES_LIST,
  );
  const privacyQueue = phase2MemoryStore.privacyRequests.filter(
    (p) => p.organizationId === membership.organizationId,
  );

  res.json({
    legalMetadata: KENYA_HR_LEGAL_METADATA,
    section10Summary: {
      totalEmployees: completeness.length,
      compliantCount: completeness.filter((c) => c.compliantForChecklist).length,
      approachingDeadlineCount: completeness.filter(
        (c) => c.deadlineApproachingOrPassed,
      ).length,
      employees: completeness,
    },
    privacyQueueCount: privacyQueue.length,
  });
});

// ─── Workstream I: People Operations Analytics ──────────────────────────────

router.get("/peopleos/analytics/workforce", async (req, res): Promise<void> => {
  const access = await getReadAccess(req, res);
  if (!access || !access.membership) return;

  const data = await getWorkforceAnalytics({
    organizationId: access.membership.organizationId,
    viewerRole: access.membership.role,
    demoEmployees: DEMO_EMPLOYEES_LIST,
    demoDepartments: DEMO_DEPARTMENTS_LIST,
  });
  res.json(data);
});

router.get("/peopleos/analytics/lifecycle", async (req, res): Promise<void> => {
  const membership = await requireRoles(req, res, managerAndHrRoles);
  if (!membership) return;

  const [candidates, requisitions, tasks] = process.env.DATABASE_URL
    ? await Promise.all([
        db
          .select()
          .from(candidatesTable)
          .where(eq(candidatesTable.organizationId, membership.organizationId)),
        db
          .select()
          .from(jobRequisitionsTable)
          .where(eq(jobRequisitionsTable.organizationId, membership.organizationId)),
        db
          .select()
          .from(onboardingTasksTable)
          .where(eq(onboardingTasksTable.organizationId, membership.organizationId)),
      ])
    : [[], [], []];

  const data = await getLifecycleAnalytics({
    organizationId: membership.organizationId,
    demoEmployees: DEMO_EMPLOYEES_LIST,
    demoCandidates: process.env.DATABASE_URL
      ? candidates
      : DEMO_CANDIDATES.filter((c) => c.organizationId === membership.organizationId),
    demoRequisitions: process.env.DATABASE_URL
      ? requisitions
      : DEMO_REQUISITIONS.filter((r) => r.organizationId === membership.organizationId),
    demoOnboardingTasks: process.env.DATABASE_URL
      ? tasks
      : DEMO_LIFECYCLE_TASKS.filter((t) => t.organizationId === membership.organizationId),
  });
  res.json(data);
});

router.get("/peopleos/analytics/data-quality", async (req, res): Promise<void> => {
  const membership = await requireRoles(req, res, peopleManagers);
  if (!membership) return;

  const data = await getDataQualityAnalytics({
    organizationId: membership.organizationId,
    demoEmployees: DEMO_EMPLOYEES_LIST,
    demoDepartments: DEMO_DEPARTMENTS_LIST,
  });
  res.json(data);
});

export default router;
