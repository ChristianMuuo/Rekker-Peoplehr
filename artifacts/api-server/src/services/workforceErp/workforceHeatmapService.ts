import { listShiftAssignments } from "./workforceSchedulingService";
import { listProductionLines } from "./workforceSchedulingService";
import { listCertifications } from "./competencyCertificationService";
import { DEMO_LEAVE_STORE } from "../../routes/leave";
import { DEMO_EMPLOYEES_LIST } from "../../routes/peopleos";
import { db, employeesTable, leaveRequestsTable } from "@workspace/db";
import { and, eq } from "drizzle-orm";

export interface UnitHeatmapItem {
  unitType: string;
  requiredHeadcount: number;
  scheduledHeadcount: number;
  presentEligibleHeadcount: number;
  awayOrPendingLeave: number;
  qualificationBlocked: number;
  coveragePct: number;
  shortageStatus: "fully_staffed" | "adequately_staffed" | "understaffed" | "critical_shortage" | "qualification_blocked" | "unknown";
}

export interface WorkforceOverviewResult {
  dataScope: "ERP_WORKFORCE_AVAILABILITY";
  shiftDate: string;
  roster: Array<{
    id: string;
    employeeId: string;
    employeeName: string;
    unitType: string;
    workZone: string;
    shiftName: string;
    roleSkill: string;
    costCentreCode: string;
    status: string;
    employeeStatus: string;
    availableToday: boolean;
    qualificationValid: boolean;
  }>;
  heatmap: UnitHeatmapItem[];
  understaffedUnits: UnitHeatmapItem[];
  overallCoveragePct: number;
  metrics: {
    totalRequiredStaffing: number;
    totalScheduled: number;
    totalEligiblePresent: number;
    totalAwayOrLeave: number;
    totalBlockedCertifications: number;
  };
}

export async function getWorkforceOverview(
  organizationId: string,
  filters?: {
    shiftDate?: string;
    unitType?: string;
  },
): Promise<WorkforceOverviewResult> {
  const shiftDate = filters?.shiftDate || new Date().toISOString().slice(0, 10);

  // 1. Load active shift assignments for target date
  const { items: rawAssignments } = await listShiftAssignments(organizationId, {
    shiftDate,
    unitType: filters?.unitType,
  });

  // 2. Load employee master records & leave status
  const onLeaveEmpIds = new Set<string>();
  const empMasterMap = new Map<string, { id: string; status: string; firstName: string; lastName: string }>();

  if (!process.env.DATABASE_URL) {
    for (const l of DEMO_LEAVE_STORE) {
      const startStr = l.startDate instanceof Date ? l.startDate.toISOString().slice(0, 10) : String(l.startDate);
      const endStr = l.endDate instanceof Date ? l.endDate.toISOString().slice(0, 10) : String(l.endDate);
      if ((l.status === "approved" || l.status === "pending") && shiftDate >= startStr && shiftDate <= endStr) {
        onLeaveEmpIds.add(l.employeeId);
      }
    }
    for (const e of DEMO_EMPLOYEES_LIST) {
      empMasterMap.set(e.id, { id: e.id, status: e.status, firstName: e.firstName, lastName: e.lastName });
      if (e.status === "on_leave") onLeaveEmpIds.add(e.id);
    }
  } else {
    const [leaves, emps] = await Promise.all([
      db
        .select()
        .from(leaveRequestsTable)
        .where(
          and(
            eq(leaveRequestsTable.organizationId, organizationId),
            eq(leaveRequestsTable.status, "approved"),
          ),
        ),
      db
        .select({ id: employeesTable.id, status: employeesTable.status, firstName: employeesTable.firstName, lastName: employeesTable.lastName })
        .from(employeesTable)
        .where(eq(employeesTable.organizationId, organizationId)),
    ]);

    for (const l of leaves) {
      if (shiftDate >= l.startDate && shiftDate <= l.endDate) {
        onLeaveEmpIds.add(l.employeeId);
      }
    }
    for (const e of emps) {
      empMasterMap.set(e.id, e);
      if (e.status === "on_leave") onLeaveEmpIds.add(e.id);
    }
  }

  // 3. Load certifications to check qualification validity
  const { items: allCerts } = await listCertifications(organizationId);
  const certMap = new Map<string, typeof allCerts>();
  for (const c of allCerts) {
    const list = certMap.get(c.employeeId) || [];
    list.push(c);
    certMap.set(c.employeeId, list);
  }

  // 4. Build enriched roster items
  const roster = rawAssignments.map((a) => {
    const emp = empMasterMap.get(a.employeeId);
    const isAway = onLeaveEmpIds.has(a.employeeId) || emp?.status !== "active";

    const empCerts = certMap.get(a.employeeId) || [];
    // Qualification is valid if no expired mandatory cert exists or has active verified certs
    const hasExpired = empCerts.some((c) => c.expiryDate < shiftDate && c.verificationStatus === "expired");
    const qualificationValid = !hasExpired;

    const availableToday = !isAway && qualificationValid && a.status === "scheduled";

    return {
      id: a.id,
      employeeId: a.employeeId,
      employeeName: a.employeeName,
      unitType: a.unitType,
      workZone: a.workZone,
      shiftName: a.shiftName,
      roleSkill: a.roleSkill,
      costCentreCode: a.costCentreCode,
      status: a.status,
      employeeStatus: emp?.status || "active",
      availableToday,
      qualificationValid,
    };
  });

  // 5. Gather minimum staffing requirements per unit from production lines
  const { items: prodLines } = await listProductionLines(organizationId);
  const requiredByUnit: Record<string, number> = {
    production: 0,
    warehouse: 2,
    distribution: 2,
    sales: 2,
  };

  for (const line of prodLines) {
    if (line.isActive && line.operationalStatus === "active") {
      requiredByUnit.production = (requiredByUnit.production || 0) + line.minStaffing;
    }
  }
  if (!requiredByUnit.production) requiredByUnit.production = 4;

  // 6. Calculate Heatmap across units
  const units = ["production", "warehouse", "distribution", "sales"];
  const heatmap: UnitHeatmapItem[] = units.map((unitType) => {
    const unitRoster = roster.filter((r) => r.unitType === unitType);
    const required = requiredByUnit[unitType] ?? 2;
    const scheduled = unitRoster.length;
    const presentEligible = unitRoster.filter((r) => r.availableToday).length;
    const away = unitRoster.filter((r) => onLeaveEmpIds.has(r.employeeId)).length;
    const blocked = unitRoster.filter((r) => !r.qualificationValid).length;

    // Strict formula: (Eligible Assigned / Required) * 100
    const coveragePct = required > 0 ? Math.round((presentEligible / required) * 100) : 100;

    let shortageStatus: UnitHeatmapItem["shortageStatus"] = "adequately_staffed";
    if (blocked > 0 && presentEligible < required) {
      shortageStatus = "qualification_blocked";
    } else if (coveragePct >= 100) {
      shortageStatus = "fully_staffed";
    } else if (coveragePct >= 85) {
      shortageStatus = "adequately_staffed";
    } else if (coveragePct >= 60) {
      shortageStatus = "understaffed";
    } else {
      shortageStatus = "critical_shortage";
    }

    return {
      unitType,
      requiredHeadcount: required,
      scheduledHeadcount: scheduled,
      presentEligibleHeadcount: presentEligible,
      awayOrPendingLeave: away,
      qualificationBlocked: blocked,
      coveragePct,
      shortageStatus,
    };
  });

  const understaffedUnits = heatmap.filter(
    (h) => h.shortageStatus === "understaffed" || h.shortageStatus === "critical_shortage" || h.shortageStatus === "qualification_blocked",
  );

  const totalRequired = heatmap.reduce((s, h) => s + h.requiredHeadcount, 0);
  const totalEligible = heatmap.reduce((s, h) => s + h.presentEligibleHeadcount, 0);
  const overallCoveragePct = totalRequired > 0 ? Math.round((totalEligible / totalRequired) * 100) : 100;

  return {
    dataScope: "ERP_WORKFORCE_AVAILABILITY",
    shiftDate,
    roster,
    heatmap,
    understaffedUnits,
    overallCoveragePct,
    metrics: {
      totalRequiredStaffing: totalRequired,
      totalScheduled: heatmap.reduce((s, h) => s + h.scheduledHeadcount, 0),
      totalEligiblePresent: totalEligible,
      totalAwayOrLeave: heatmap.reduce((s, h) => s + h.awayOrPendingLeave, 0),
      totalBlockedCertifications: heatmap.reduce((s, h) => s + h.qualificationBlocked, 0),
    },
  };
}
