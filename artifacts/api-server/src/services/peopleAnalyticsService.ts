import { eq } from "drizzle-orm";
import {
  candidatesTable,
  db,
  departmentsTable,
  employeeAssignmentHistoryTable,
  employeesTable,
  jobRequisitionsTable,
  leaveRequestsTable,
  membershipsTable,
  onboardingTasksTable,
  probationReviewsTable,
} from "@workspace/db";
import { getEmployeeCompletenessForOrg } from "./employeeMasterService";
import { buildOrganizationChart, listPositionsWithOccupancy } from "./orgPositionsService";
import { phase2MemoryStore } from "./phase2MemoryStore";

const SMALL_GROUP_THRESHOLD = 3;

function applySmallGroupSuppression<T extends { count: number }>(
  buckets: T[],
  suppress: boolean,
): { items: Array<T & { suppressed?: boolean }>; suppressionApplied: boolean } {
  if (!suppress) return { items: buckets, suppressionApplied: false };
  let applied = false;
  const items = buckets.map((b) => {
    if (b.count > 0 && b.count <= SMALL_GROUP_THRESHOLD) {
      applied = true;
      return { ...b, count: 0, suppressed: true };
    }
    return b;
  });
  return { items, suppressionApplied: applied };
}

export async function getWorkforceAnalytics(params: {
  organizationId: string;
  viewerRole: string;
  demoEmployees: Array<any>;
  demoDepartments: Array<any>;
}) {
  const isPrivilegedHr = ["hr_admin", "executive", "owner", "super_admin"].includes(
    params.viewerRole,
  );
  const suppressSmallGroups = !isPrivilegedHr;

  const employees = process.env.DATABASE_URL
    ? await db
        .select()
        .from(employeesTable)
        .where(eq(employeesTable.organizationId, params.organizationId))
    : params.demoEmployees;

  const departments = process.env.DATABASE_URL
    ? await db
        .select()
        .from(departmentsTable)
        .where(eq(departmentsTable.organizationId, params.organizationId))
    : params.demoDepartments;

  const deptNameById = new Map(departments.map((d) => [d.id, d.name]));
  const activeEmps = employees.filter((e) => e.status !== "former");
  const today = new Date();

  const byDeptMap = new Map<string, number>();
  const byLocationMap = new Map<string, number>();
  const byTypeMap = new Map<string, number>();
  const byStatusMap = new Map<string, number>();
  const tenureBuckets = new Map<string, number>([
    ["< 1 year", 0],
    ["1 - 3 years", 0],
    ["3+ years", 0],
  ]);

  for (const e of employees) {
    byStatusMap.set(e.status, (byStatusMap.get(e.status) ?? 0) + 1);
  }
  for (const e of activeEmps) {
    const deptName = deptNameById.get(e.departmentId) ?? "Unassigned";
    byDeptMap.set(deptName, (byDeptMap.get(deptName) ?? 0) + 1);
    byLocationMap.set(e.location, (byLocationMap.get(e.location) ?? 0) + 1);
    byTypeMap.set(e.employmentType, (byTypeMap.get(e.employmentType) ?? 0) + 1);

    const start = new Date(`${String(e.startDate).slice(0, 10)}T00:00:00.000Z`);
    const years = (today.getTime() - start.getTime()) / (365.25 * 24 * 60 * 60 * 1000);
    if (years < 1) tenureBuckets.set("< 1 year", (tenureBuckets.get("< 1 year") ?? 0) + 1);
    else if (years < 3) tenureBuckets.set("1 - 3 years", (tenureBuckets.get("1 - 3 years") ?? 0) + 1);
    else tenureBuckets.set("3+ years", (tenureBuckets.get("3+ years") ?? 0) + 1);
  }

  const rawByDept = [...byDeptMap.entries()].map(([department, count]) => ({
    department,
    count,
  }));
  const rawByLocation = [...byLocationMap.entries()].map(([location, count]) => ({
    location,
    count,
  }));
  const rawByType = [...byTypeMap.entries()].map(([employmentType, count]) => ({
    employmentType,
    count,
  }));

  const deptSupp = applySmallGroupSuppression(rawByDept, suppressSmallGroups);
  const locSupp = applySmallGroupSuppression(rawByLocation, suppressSmallGroups);
  const typeSupp = applySmallGroupSuppression(rawByType, suppressSmallGroups);

  const posData = await listPositionsWithOccupancy(
    params.organizationId,
    params.demoEmployees,
    params.demoDepartments,
  );

  const next60DaysIso = new Date(Date.now() + 60 * 86400 * 1000).toISOString().slice(0, 10);
  const upcomingContracts = activeEmps.filter(
    (e) => e.contractEndDate && String(e.contractEndDate).slice(0, 10) <= next60DaysIso,
  ).length;

  return {
    dataFreshnessAt: new Date().toISOString(),
    privacySuppressionApplied:
      deptSupp.suppressionApplied || locSupp.suppressionApplied || typeSupp.suppressionApplied,
    smallGroupThreshold: suppressSmallGroups ? SMALL_GROUP_THRESHOLD : null,
    summary: {
      totalHeadcountAllStatuses: employees.length,
      onLeaveCount: activeEmps.filter((e) => e.status === "on_leave").length,
      probationCount: activeEmps.filter((e) => e.status === "probation").length,
      formerCount: employees.filter((e) => e.status === "former").length,
      upcomingContractExpiries60d: upcomingContracts,
      ...posData.summary,
    },
    breakdowns: {
      byDepartment: deptSupp.items,
      byLocation: locSupp.items,
      byEmploymentType: typeSupp.items,
      byStatus: [...byStatusMap.entries()].map(([status, count]) => ({ status, count })),
      byTenure: [...tenureBuckets.entries()].map(([band, count]) => ({ band, count })),
    },
    metricDefinitions: {
      activeHeadcount: "Employees whose current master status is not 'former'.",
      openVacanciesCount:
        "Sum of open budgeted slots across approved, vacant, or occupied positions.",
      budgetedHeadcountCapacity:
        "Sum of department budgeted positions versus active headcount.",
    },
  };
}

export async function getLifecycleAnalytics(params: {
  organizationId: string;
  demoEmployees: Array<any>;
  demoCandidates: Array<any>;
  demoRequisitions: Array<any>;
  demoOnboardingTasks: Array<any>;
}) {
  const employees = process.env.DATABASE_URL
    ? await db
        .select()
        .from(employeesTable)
        .where(eq(employeesTable.organizationId, params.organizationId))
    : params.demoEmployees;

  const requisitions = process.env.DATABASE_URL
    ? await db
        .select()
        .from(jobRequisitionsTable)
        .where(eq(jobRequisitionsTable.organizationId, params.organizationId))
    : params.demoRequisitions;

  const candidates = process.env.DATABASE_URL
    ? await db
        .select()
        .from(candidatesTable)
        .where(eq(candidatesTable.organizationId, params.organizationId))
    : params.demoCandidates;

  const tasks = process.env.DATABASE_URL
    ? await db
        .select()
        .from(onboardingTasksTable)
        .where(eq(onboardingTasksTable.organizationId, params.organizationId))
    : params.demoOnboardingTasks;

  const probation = process.env.DATABASE_URL
    ? await db
        .select()
        .from(probationReviewsTable)
        .where(eq(probationReviewsTable.organizationId, params.organizationId))
    : phase2MemoryStore.probationReviews.filter(
        (p) => p.organizationId === params.organizationId,
      );

  const history = process.env.DATABASE_URL
    ? await db
        .select()
        .from(employeeAssignmentHistoryTable)
        .where(eq(employeeAssignmentHistoryTable.organizationId, params.organizationId))
    : phase2MemoryStore.assignmentHistory.filter(
        (h) => h.organizationId === params.organizationId,
      );

  const stageCounts = new Map<string, number>();
  for (const c of candidates) {
    stageCounts.set(c.stage, (stageCounts.get(c.stage) ?? 0) + 1);
  }

  const totalTasks = tasks.length;
  const completedTasks = tasks.filter((t) => t.completed).length;
  const todayIso = new Date().toISOString().slice(0, 10);
  const overdueTasks = tasks.filter(
    (t) => !t.completed && String(t.dueDate).slice(0, 10) < todayIso,
  ).length;

  const formerCount = employees.filter((e) => e.status === "former").length;
  const attritionRatePct =
    employees.length > 0
      ? Math.round((formerCount / employees.length) * 1000) / 10
      : 0;

  return {
    dataFreshnessAt: new Date().toISOString(),
    recruitmentFunnel: {
      openRequisitions: requisitions.filter((r) => r.status === "published").length,
      totalCandidates: candidates.length,
      byStage: [...stageCounts.entries()].map(([stage, count]) => ({ stage, count })),
      hiredAndConverted: candidates.filter(
        (c) => c.stage === "hired" || Boolean(c.convertedEmployeeId),
      ).length,
    },
    onboarding: {
      totalTasks,
      completedTasks,
      completionRatePct:
        totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0,
      overdueTasksCount: overdueTasks,
    },
    probation: {
      totalTracked: probation.length,
      pendingReview: probation.filter((p) => p.status === "pending_review").length,
      confirmed: probation.filter((p) => p.status === "confirmed").length,
      extended: probation.filter((p) => p.status === "extended").length,
    },
    movementsAndAttrition: {
      persistedAssignmentChangesCount: history.length,
      formerEmployeesCount: formerCount,
      attritionRatePct,
      historicalGapNotice:
        history.length === 0
          ? "No historical assignment movement rows exist before Phase 2 effective-dated tracking."
          : null,
    },
  };
}

export async function getDataQualityAnalytics(params: {
  organizationId: string;
  demoEmployees: Array<any>;
  demoDepartments: Array<any>;
}) {
  const completenessRows = await getEmployeeCompletenessForOrg(
    params.organizationId,
    params.demoEmployees,
  );
  const orgChart = await buildOrganizationChart({
    organizationId: params.organizationId,
    demoEmployees: params.demoEmployees,
    demoDepartments: params.demoDepartments,
  });

  const memberships = process.env.DATABASE_URL
    ? await db
        .select()
        .from(membershipsTable)
        .where(eq(membershipsTable.organizationId, params.organizationId))
    : [];

  const avgScore =
    completenessRows.length > 0
      ? Math.round(
          completenessRows.reduce((sum, r) => sum + r.scorePercent, 0) /
            completenessRows.length,
        )
      : 0;

  return {
    dataFreshnessAt: new Date().toISOString(),
    averageSection10CompletenessPct: avgScore,
    fullyCompliantRecordsCount: completenessRows.filter((r) => r.compliantForChecklist)
      .length,
    totalEvaluatedEmployees: completenessRows.length,
    approachingOrPastParticularsDeadlineCount: completenessRows.filter(
      (r) => r.deadlineApproachingOrPassed,
    ).length,
    hierarchyIntegrityAlertsCount: orgChart.integrityAlerts.length,
    hierarchyIntegrityAlerts: orgChart.integrityAlerts,
    unlinkedMembershipAccountsCount: memberships.filter((m) => !m.employeeId).length,
    employeesWithMissingFields: completenessRows.filter(
      (r) => r.missingFields.length > 0,
    ),
  };
}
