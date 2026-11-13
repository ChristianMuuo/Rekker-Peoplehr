import crypto from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import {
  db,
  employeesTable,
  workforceSalesAssignmentsTable,
  workforceTerritoriesTable,
} from "@workspace/db";
import { recordAuditEvent } from "../../lib/auditService";
import { sanitizeText } from "../../lib/security";
import {
  getOrCreateWorkforceStore,
  type MemSalesAssignment,
  type MemSalesTerritory,
} from "./workforceErpMemoryStore";
import { DEMO_EMPLOYEES_LIST } from "../../routes/peopleos";

export interface SalesRepAttainment extends MemSalesAssignment {
  attainmentPct: number;
  remainingTargetKes: number;
  estimatedCommissionKes: number;
  isEstimatedCommissionPreview: true;
  isDisbursedPayroll: false;
}

export async function listTerritories(
  organizationId: string,
): Promise<{ items: MemSalesTerritory[]; total: number }> {
  if (!process.env.DATABASE_URL) {
    const store = getOrCreateWorkforceStore(organizationId);
    const list = Array.from(store.territories.values());
    return { items: list, total: list.length };
  }

  const rows = await db
    .select()
    .from(workforceTerritoriesTable)
    .where(eq(workforceTerritoriesTable.organizationId, organizationId))
    .orderBy(desc(workforceTerritoriesTable.createdAt));

  const items: MemSalesTerritory[] = rows.map((r) => ({
    id: r.id,
    organizationId: r.organizationId,
    code: r.code,
    name: r.name,
    region: r.region,
    costCentreCode: r.costCentreCode,
    monthlyTargetKes: r.monthlyTargetKes,
    defaultCommissionRatePct: r.defaultCommissionRatePct,
    isActive: r.isActive,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  }));

  return { items, total: items.length };
}

export async function createTerritory(
  organizationId: string,
  input: {
    code: string;
    name: string;
    region: string;
    costCentreCode?: string;
    monthlyTargetKes?: number;
    defaultCommissionRatePct?: string;
  },
  actorUserId: string,
): Promise<MemSalesTerritory> {
  const code = sanitizeText(input.code, 40).toUpperCase();
  const name = sanitizeText(input.name, 120);
  const region = sanitizeText(input.region, 100);
  const costCentreCode = sanitizeText(input.costCentreCode || "CC-SLS-01", 30);
  const monthlyTargetKes = Math.max(0, Number(input.monthlyTargetKes || 2000000));
  const defaultCommissionRatePct = sanitizeText(input.defaultCommissionRatePct || "2.5", 10);

  if (!code || !name || !region) {
    throw new Error("code, name and region are required.");
  }

  const nowIso = new Date().toISOString();

  if (!process.env.DATABASE_URL) {
    const store = getOrCreateWorkforceStore(organizationId);
    if (Array.from(store.territories.values()).some((t) => t.code === code)) {
      throw new Error(`Territory code '${code}' already exists.`);
    }

    const terr: MemSalesTerritory = {
      id: `terr-${crypto.randomUUID().slice(0, 8)}`,
      organizationId,
      code,
      name,
      region,
      costCentreCode,
      monthlyTargetKes,
      defaultCommissionRatePct,
      isActive: true,
      createdAt: nowIso,
      updatedAt: nowIso,
    };
    store.territories.set(terr.id, terr);

    await recordAuditEvent({
      organizationId,
      actorUserId,
      actor: "sales_manager",
      action: "SALES_TERRITORY_CREATED",
      targetType: "sales_territory",
      targetId: terr.id,
      summary: `Created sales territory ${code} · ${name} (${region})`,
      isDemo: true,
    });

    return terr;
  }

  const [created] = await db
    .insert(workforceTerritoriesTable)
    .values({
      organizationId,
      code,
      name,
      region,
      costCentreCode,
      monthlyTargetKes,
      defaultCommissionRatePct,
    })
    .returning();

  await recordAuditEvent({
    organizationId,
    actorUserId,
    actor: "sales_manager",
    action: "SALES_TERRITORY_CREATED",
    targetType: "sales_territory",
    targetId: created!.id,
    summary: `Created sales territory ${code} · ${name} (${region})`,
  });

  return {
    id: created!.id,
    organizationId: created!.organizationId,
    code: created!.code,
    name: created!.name,
    region: created!.region,
    costCentreCode: created!.costCentreCode,
    monthlyTargetKes: created!.monthlyTargetKes,
    defaultCommissionRatePct: created!.defaultCommissionRatePct,
    isActive: created!.isActive,
    createdAt: created!.createdAt.toISOString(),
    updatedAt: created!.updatedAt.toISOString(),
  };
}

export async function listSalesForce(
  organizationId: string,
  reportingPeriod: string = "2026-03",
): Promise<{
  items: SalesRepAttainment[];
  totalAttributedKes: number;
  totalTargetKes: number;
  averageAttainmentPct: number;
}> {
  let rawAssignments: MemSalesAssignment[];

  if (!process.env.DATABASE_URL) {
    const store = getOrCreateWorkforceStore(organizationId);
    rawAssignments = Array.from(store.salesAssignments.values()).filter(
      (s) => s.reportingPeriod === reportingPeriod,
    );
  } else {
    const rows = await db
      .select({
        asgn: workforceSalesAssignmentsTable,
        emp: employeesTable,
        terr: workforceTerritoriesTable,
      })
      .from(workforceSalesAssignmentsTable)
      .innerJoin(employeesTable, eq(workforceSalesAssignmentsTable.employeeId, employeesTable.id))
      .innerJoin(workforceTerritoriesTable, eq(workforceSalesAssignmentsTable.territoryId, workforceTerritoriesTable.id))
      .where(
        and(
          eq(workforceSalesAssignmentsTable.organizationId, organizationId),
          eq(workforceSalesAssignmentsTable.reportingPeriod, reportingPeriod),
        ),
      )
      .orderBy(desc(workforceSalesAssignmentsTable.createdAt));

    rawAssignments = rows.map(({ asgn, emp, terr }) => ({
      id: asgn.id,
      organizationId: asgn.organizationId,
      territoryId: asgn.territoryId,
      territoryCode: terr.code,
      territoryName: terr.name,
      employeeId: asgn.employeeId,
      repName: `${emp.firstName} ${emp.lastName}`,
      effectiveFrom: asgn.effectiveFrom,
      effectiveTo: asgn.effectiveTo,
      monthlyTargetKes: asgn.monthlyTargetKes,
      actualAttributedKes: asgn.actualAttributedKes,
      commissionRatePct: asgn.commissionRatePct,
      reportingPeriod: asgn.reportingPeriod,
      status: asgn.status as MemSalesAssignment["status"],
      attributionSource: asgn.attributionSource,
      createdAt: asgn.createdAt.toISOString(),
      updatedAt: asgn.updatedAt.toISOString(),
    }));
  }

  const items: SalesRepAttainment[] = rawAssignments.map((rep) => {
    const attainmentPct =
      rep.monthlyTargetKes > 0
        ? Math.round((rep.actualAttributedKes / rep.monthlyTargetKes) * 1000) / 10
        : 0;
    const remainingTargetKes = Math.max(0, rep.monthlyTargetKes - rep.actualAttributedKes);
    const rate = parseFloat(rep.commissionRatePct) || 2.5;
    const estimatedCommissionKes = Math.round(rep.actualAttributedKes * (rate / 100));

    return {
      ...rep,
      attainmentPct,
      remainingTargetKes,
      estimatedCommissionKes,
      isEstimatedCommissionPreview: true,
      isDisbursedPayroll: false,
    };
  });

  const totalAttributedKes = items.reduce((s, r) => s + r.actualAttributedKes, 0);
  const totalTargetKes = items.reduce((s, r) => s + r.monthlyTargetKes, 0);
  const averageAttainmentPct =
    items.length && totalTargetKes > 0
      ? Math.round((totalAttributedKes / totalTargetKes) * 1000) / 10
      : 0;

  return {
    items,
    totalAttributedKes,
    totalTargetKes,
    averageAttainmentPct,
  };
}

export async function assignSalesRep(
  organizationId: string,
  input: {
    territoryId: string;
    employeeId: string;
    effectiveFrom?: string;
    monthlyTargetKes?: number;
    commissionRatePct?: string;
    reportingPeriod?: string;
  },
  actorUserId: string,
): Promise<SalesRepAttainment> {
  const territoryId = sanitizeText(input.territoryId, 64);
  const employeeId = sanitizeText(input.employeeId, 64);
  const effectiveFrom = sanitizeText(input.effectiveFrom || new Date().toISOString().slice(0, 10), 10);
  const reportingPeriod = sanitizeText(input.reportingPeriod || "2026-03", 20);

  if (!territoryId || !employeeId) {
    throw new Error("territoryId and employeeId are required.");
  }

  const nowIso = new Date().toISOString();

  if (!process.env.DATABASE_URL) {
    const store = getOrCreateWorkforceStore(organizationId);
    const terr = store.territories.get(territoryId);
    if (!terr) throw new Error("Territory not found.");

    const emp = DEMO_EMPLOYEES_LIST.find((e) => e.id === employeeId);
    const repName = emp ? `${emp.firstName} ${emp.lastName}` : "Rekker Sales Representative";

    const targetKes = input.monthlyTargetKes ?? terr.monthlyTargetKes;
    const ratePct = input.commissionRatePct ?? terr.defaultCommissionRatePct;

    const assignment: MemSalesAssignment = {
      id: `sasgn-${crypto.randomUUID().slice(0, 8)}`,
      organizationId,
      territoryId,
      territoryCode: terr.code,
      territoryName: terr.name,
      employeeId,
      repName,
      effectiveFrom,
      effectiveTo: null,
      monthlyTargetKes: targetKes,
      actualAttributedKes: 0,
      commissionRatePct: ratePct,
      reportingPeriod,
      status: "active",
      attributionSource: "CRM Pipeline Target (Phase 1 Ecosystem)",
      createdAt: nowIso,
      updatedAt: nowIso,
    };
    store.salesAssignments.set(assignment.id, assignment);

    await recordAuditEvent({
      organizationId,
      actorUserId,
      actor: "sales_manager",
      action: "SALES_REP_ASSIGNED",
      targetType: "sales_assignment",
      targetId: assignment.id,
      summary: `Assigned ${repName} to territory ${terr.code} (${terr.name}) for ${reportingPeriod}`,
      isDemo: true,
    });

    return {
      ...assignment,
      attainmentPct: 0,
      remainingTargetKes: targetKes,
      estimatedCommissionKes: 0,
      isEstimatedCommissionPreview: true,
      isDisbursedPayroll: false,
    };
  }

  const [terr] = await db
    .select()
    .from(workforceTerritoriesTable)
    .where(
      and(
        eq(workforceTerritoriesTable.id, territoryId),
        eq(workforceTerritoriesTable.organizationId, organizationId),
      ),
    );
  if (!terr) throw new Error("Territory not found.");

  const [emp] = await db
    .select()
    .from(employeesTable)
    .where(
      and(
        eq(employeesTable.id, employeeId),
        eq(employeesTable.organizationId, organizationId),
      ),
    );
  if (!emp) throw new Error("Employee not found in organization.");

  const targetKes = input.monthlyTargetKes ?? terr.monthlyTargetKes;
  const ratePct = input.commissionRatePct ?? terr.defaultCommissionRatePct;

  const [created] = await db
    .insert(workforceSalesAssignmentsTable)
    .values({
      organizationId,
      territoryId,
      employeeId,
      effectiveFrom,
      monthlyTargetKes: targetKes,
      commissionRatePct: ratePct,
      reportingPeriod,
    })
    .returning();

  const repName = `${emp.firstName} ${emp.lastName}`;
  await recordAuditEvent({
    organizationId,
    actorUserId,
    actor: "sales_manager",
    action: "SALES_REP_ASSIGNED",
    targetType: "sales_assignment",
    targetId: created!.id,
    summary: `Assigned ${repName} to territory ${terr.code} (${terr.name}) for ${reportingPeriod}`,
  });

  return {
    id: created!.id,
    organizationId: created!.organizationId,
    territoryId: created!.territoryId,
    territoryCode: terr.code,
    territoryName: terr.name,
    employeeId: created!.employeeId,
    repName,
    effectiveFrom: created!.effectiveFrom,
    effectiveTo: created!.effectiveTo,
    monthlyTargetKes: created!.monthlyTargetKes,
    actualAttributedKes: created!.actualAttributedKes,
    commissionRatePct: created!.commissionRatePct,
    reportingPeriod: created!.reportingPeriod,
    status: created!.status as MemSalesAssignment["status"],
    attributionSource: created!.attributionSource,
    createdAt: created!.createdAt.toISOString(),
    updatedAt: created!.updatedAt.toISOString(),
    attainmentPct: 0,
    remainingTargetKes: targetKes,
    estimatedCommissionKes: 0,
    isEstimatedCommissionPreview: true,
    isDisbursedPayroll: false,
  };
}
