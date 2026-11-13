import crypto from "node:crypto";
import { eq } from "drizzle-orm";
import { Router, type IRouter, type Request, type Response } from "express";
import { db, workflowRulesTable } from "@workspace/db";
import { recordAuditEvent } from "../lib/auditService";
import { sanitizeText } from "../lib/security";
import {
  ensureMembership,
  MODULE_PERMISSION_MATRIX,
  PEOPLEOS_ROLES,
  requireRoles,
} from "../middlewares/peopleosAccess";
import {
  createProductionLine,
  createShiftAssignment,
  createShiftTemplate,
  decideShiftSwap,
  listProductionLines,
  listShiftAssignments,
  listShiftTemplates,
  requestShiftSwap,
} from "../services/workforceErp/workforceSchedulingService";
import {
  deployReliefAssignment,
  findMissingCoverageAndReplacements,
} from "../services/workforceErp/replacementMatcherService";
import {
  createCertification,
  listCertifications,
  verifyCertification,
} from "../services/workforceErp/competencyCertificationService";
import {
  createOrUpdateDriverProfile,
  listDrivers,
  validateVehicleDispatch,
} from "../services/workforceErp/driverComplianceService";
import {
  assignSalesRep,
  createTerritory,
  listSalesForce,
  listTerritories,
} from "../services/workforceErp/salesTerritoryService";
import { getWorkforceOverview } from "../services/workforceErp/workforceHeatmapService";
import {
  getIntegrationsStatus,
  pingIntegrationAdapter,
} from "../services/workforceErp/integrationHealthService";

const router: IRouter = Router();

export const erpOpsReaders: readonly string[] = [
  PEOPLEOS_ROLES.hrAdmin,
  PEOPLEOS_ROLES.hrDirector,
  PEOPLEOS_ROLES.hrManager,
  PEOPLEOS_ROLES.hrOfficer,
  PEOPLEOS_ROLES.productionSupervisor,
  PEOPLEOS_ROLES.warehouseSupervisor,
  PEOPLEOS_ROLES.salesManager,
  PEOPLEOS_ROLES.financeManager,
  PEOPLEOS_ROLES.departmentManager,
  PEOPLEOS_ROLES.executive,
  PEOPLEOS_ROLES.systemAdmin,
];

export const erpShiftManagers: readonly string[] = [
  PEOPLEOS_ROLES.hrAdmin,
  PEOPLEOS_ROLES.hrDirector,
  PEOPLEOS_ROLES.hrManager,
  PEOPLEOS_ROLES.productionSupervisor,
  PEOPLEOS_ROLES.warehouseSupervisor,
  PEOPLEOS_ROLES.systemAdmin,
];

export const fleetManagers: readonly string[] = [
  PEOPLEOS_ROLES.hrAdmin,
  PEOPLEOS_ROLES.hrDirector,
  PEOPLEOS_ROLES.warehouseSupervisor,
  PEOPLEOS_ROLES.productionSupervisor,
  PEOPLEOS_ROLES.systemAdmin,
];

export const salesManagers: readonly string[] = [
  PEOPLEOS_ROLES.salesManager,
  PEOPLEOS_ROLES.hrAdmin,
  PEOPLEOS_ROLES.hrDirector,
  PEOPLEOS_ROLES.systemAdmin,
];

// In-memory workflow rules fallback for tests without DATABASE_URL
const MEM_WORKFLOW_RULES = new Map<string, any[]>();
function ensureRulesSeeded(orgId: string) {
  if (!MEM_WORKFLOW_RULES.has(orgId)) {
    MEM_WORKFLOW_RULES.set(orgId, [
      { id: "wf-leave-01", organizationId: orgId, domain: "leave", name: "Standard Department Manager + HR Signoff", thresholdAmountKes: null, approvalLevels: 2, requiredApproverRoles: ["department_manager", "hr_manager"], slaHours: 24, isActive: true },
      { id: "wf-payroll-01", organizationId: orgId, domain: "payroll", name: "Dual Maker-Checker Statutory Disbursement", thresholdAmountKes: 0, approvalLevels: 2, requiredApproverRoles: ["payroll_officer", "finance_manager"], slaHours: 48, isActive: true },
      { id: "wf-expense-01", organizationId: orgId, domain: "expense", name: "High-Value Travel & Field Claim Verification", thresholdAmountKes: 10000, approvalLevels: 2, requiredApproverRoles: ["department_manager", "finance_manager"], slaHours: 48, isActive: true },
      { id: "wf-hrcase-01", organizationId: orgId, domain: "hr_case", name: "Confidential HR Director Case Escalation", thresholdAmountKes: null, approvalLevels: 1, requiredApproverRoles: ["hr_director", "hr_admin"], slaHours: 12, isActive: true },
    ]);
  }
}

// ---------------------------------------------------------------------------
// Workstream F: Operational Staffing Availability & Heatmap
// ---------------------------------------------------------------------------

// GET /api/workforce-erp/overview
router.get("/workforce-erp/overview", async (req: Request, res: Response) => {
  const membership = await requireRoles(req, res, erpOpsReaders);
  if (!membership) return;

  const unitType = typeof req.query.unitType === "string" ? req.query.unitType : undefined;
  const shiftDate = typeof req.query.date === "string" ? req.query.date : undefined;

  const result = await getWorkforceOverview(membership.organizationId, {
    unitType,
    shiftDate,
  });

  res.json(result);
});

// GET /api/workforce-erp/executive-summary
router.get("/workforce-erp/executive-summary", async (req: Request, res: Response) => {
  const membership = await requireRoles(req, res, erpOpsReaders);
  if (!membership) return;

  const overview = await getWorkforceOverview(membership.organizationId);
  const drivers = await listDrivers(membership.organizationId);
  const sales = await listSalesForce(membership.organizationId);
  const certs = await listCertifications(membership.organizationId, { expiringWithinDays: 30 });

  res.json({
    dataScope: "ERP_EXECUTIVE_SUMMARY",
    overallCoveragePct: overview.overallCoveragePct,
    criticalShortagesCount: overview.understaffedUnits.length,
    activeDriversCount: drivers.items.length,
    driverAlertsCount: drivers.alertsCount,
    salesTargetAttainmentPct: sales.averageAttainmentPct,
    totalAttributedSalesKes: sales.totalAttributedKes,
    expiringCertifications30dCount: certs.total,
    generatedAt: new Date().toISOString(),
  });
});

// ---------------------------------------------------------------------------
// Workstream A & G: Shift Scheduling & Production Lines
// ---------------------------------------------------------------------------

// GET /api/workforce-erp/shifts
router.get("/workforce-erp/shifts", async (req: Request, res: Response) => {
  const membership = await ensureMembership(req, res);
  if (!membership) return;

  const isSupervisor = erpOpsReaders.includes(membership.role);
  const employeeId = isSupervisor
    ? (typeof req.query.employeeId === "string" ? req.query.employeeId : undefined)
    : membership.employeeId ?? membership.userId;

  const shiftDate = typeof req.query.date === "string" ? req.query.date : undefined;
  const unitType = typeof req.query.unitType === "string" ? req.query.unitType : undefined;

  const result = await listShiftAssignments(membership.organizationId, {
    employeeId,
    shiftDate,
    unitType,
  });

  res.json(result);
});

// POST /api/workforce-erp/shifts
router.post("/workforce-erp/shifts", async (req: Request, res: Response) => {
  const membership = await requireRoles(req, res, erpShiftManagers);
  if (!membership) return;

  try {
    const created = await createShiftAssignment(
      membership.organizationId,
      req.body ?? {},
      membership.userId,
    );
    res.status(201).json(created);
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : "Failed to assign shift." });
  }
});

// GET /api/workforce-erp/production/lines
router.get("/workforce-erp/production/lines", async (req: Request, res: Response) => {
  const membership = await requireRoles(req, res, erpOpsReaders);
  if (!membership) return;

  const result = await listProductionLines(membership.organizationId);
  res.json(result);
});

// POST /api/workforce-erp/production/lines
router.post("/workforce-erp/production/lines", async (req: Request, res: Response) => {
  const membership = await requireRoles(req, res, erpShiftManagers);
  if (!membership) return;

  try {
    const created = await createProductionLine(
      membership.organizationId,
      req.body ?? {},
      membership.userId,
    );
    res.status(201).json(created);
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : "Failed to configure production line." });
  }
});

// GET /api/workforce-erp/shift-templates
router.get("/workforce-erp/shift-templates", async (req: Request, res: Response) => {
  const membership = await requireRoles(req, res, erpOpsReaders);
  if (!membership) return;

  const unitType = typeof req.query.unitType === "string" ? req.query.unitType : undefined;
  const result = await listShiftTemplates(membership.organizationId, unitType);
  res.json(result);
});

// POST /api/workforce-erp/shift-templates
router.post("/workforce-erp/shift-templates", async (req: Request, res: Response) => {
  const membership = await requireRoles(req, res, erpShiftManagers);
  if (!membership) return;

  try {
    const created = await createShiftTemplate(
      membership.organizationId,
      req.body ?? {},
      membership.userId,
    );
    res.status(201).json(created);
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : "Failed to create shift template." });
  }
});

// POST /api/workforce-erp/shift-swaps
router.post("/workforce-erp/shift-swaps", async (req: Request, res: Response) => {
  const membership = await ensureMembership(req, res);
  if (!membership) return;

  try {
    const requestingEmployeeId =
      req.body?.requestingEmployeeId || membership.employeeId || membership.userId;
    const created = await requestShiftSwap(
      membership.organizationId,
      {
        ...req.body,
        requestingEmployeeId,
      },
      membership.userId,
    );
    res.status(201).json(created);
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : "Failed to request shift swap." });
  }
});

// POST /api/workforce-erp/shift-swaps/:id/decision
router.post("/workforce-erp/shift-swaps/:id/decision", async (req: Request, res: Response) => {
  const membership = await requireRoles(req, res, erpShiftManagers);
  if (!membership) return;

  const swapId = String(req.params.id);
  const decision = req.body?.decision === "approved" ? "approved" : "rejected";

  try {
    const updated = await decideShiftSwap(
      membership.organizationId,
      swapId,
      decision,
      req.body?.decisionNotes || req.body?.decisionComment,
      membership.userId,
    );
    res.json(updated);
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : "Failed to process shift swap decision." });
  }
});

// ---------------------------------------------------------------------------
// Workstream B: Absence Replacement Matching & Relief Deployment
// ---------------------------------------------------------------------------

// GET /api/workforce-erp/production/replacements
router.get("/workforce-erp/production/replacements", async (req: Request, res: Response) => {
  const membership = await requireRoles(req, res, erpOpsReaders);
  if (!membership) return;

  const targetDate = typeof req.query.date === "string" ? req.query.date : undefined;
  const result = await findMissingCoverageAndReplacements(membership.organizationId, targetDate);
  res.json(result);
});

// POST /api/workforce-erp/production/assign-relief
router.post("/workforce-erp/production/assign-relief", async (req: Request, res: Response) => {
  const membership = await requireRoles(req, res, erpShiftManagers);
  if (!membership) return;

  try {
    const result = await deployReliefAssignment(
      membership.organizationId,
      req.body ?? {},
      membership.userId,
    );
    res.status(201).json(result);
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : "Failed to deploy relief operator." });
  }
});

// ---------------------------------------------------------------------------
// Workstream C: Warehouse & Equipment Competency Registry
// ---------------------------------------------------------------------------

// GET /api/workforce-erp/certifications
router.get("/workforce-erp/certifications", async (req: Request, res: Response) => {
  const membership = await ensureMembership(req, res);
  if (!membership) return;

  const isSupervisor = erpOpsReaders.includes(membership.role);
  const employeeId = isSupervisor
    ? (typeof req.query.employeeId === "string" ? req.query.employeeId : undefined)
    : membership.employeeId ?? membership.userId;

  const category = typeof req.query.category === "string" ? req.query.category : undefined;
  const verificationStatus = typeof req.query.verificationStatus === "string" ? req.query.verificationStatus : undefined;
  const expiringWithinDays = req.query.expiringWithinDays ? Number(req.query.expiringWithinDays) : undefined;

  const result = await listCertifications(membership.organizationId, {
    employeeId,
    category,
    verificationStatus,
    expiringWithinDays,
  });

  res.json(result);
});

// POST /api/workforce-erp/certifications
router.post("/workforce-erp/certifications", async (req: Request, res: Response) => {
  const membership = await requireRoles(req, res, [
    ...erpShiftManagers,
    PEOPLEOS_ROLES.warehouseSupervisor,
  ]);
  if (!membership) return;

  try {
    const created = await createCertification(
      membership.organizationId,
      req.body ?? {},
      membership.userId,
    );
    res.status(201).json(created);
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : "Failed to register certification." });
  }
});

// POST /api/workforce-erp/certifications/:id/verify
router.post("/workforce-erp/certifications/:id/verify", async (req: Request, res: Response) => {
  const membership = await requireRoles(req, res, [
    PEOPLEOS_ROLES.hrAdmin,
    PEOPLEOS_ROLES.hrDirector,
    PEOPLEOS_ROLES.hrManager,
    PEOPLEOS_ROLES.systemAdmin,
  ]);
  if (!membership) return;

  const certId = String(req.params.id);
  const decision = req.body?.decision;
  if (decision !== "verified" && decision !== "rejected" && decision !== "revoked") {
    res.status(400).json({ error: "decision must be 'verified', 'rejected', or 'revoked'." });
    return;
  }

  try {
    const updated = await verifyCertification(
      membership.organizationId,
      certId,
      decision,
      req.body?.reason,
      membership.userId,
    );
    res.json(updated);
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : "Failed to verify certification." });
  }
});

// ---------------------------------------------------------------------------
// Workstream D: Distribution & Driver Compliance
// ---------------------------------------------------------------------------

// GET /api/workforce-erp/drivers
router.get("/workforce-erp/drivers", async (req: Request, res: Response) => {
  const membership = await requireRoles(req, res, erpOpsReaders);
  if (!membership) return;

  const asOf = req.query.asOfDate ? new Date(String(req.query.asOfDate)) : new Date();
  const result = await listDrivers(membership.organizationId, asOf);
  res.json(result);
});

// POST /api/workforce-erp/drivers
router.post("/workforce-erp/drivers", async (req: Request, res: Response) => {
  const membership = await requireRoles(req, res, fleetManagers);
  if (!membership) return;

  try {
    const updated = await createOrUpdateDriverProfile(
      membership.organizationId,
      req.body ?? {},
      membership.userId,
    );
    res.status(201).json(updated);
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : "Failed to update driver profile." });
  }
});

// POST /api/workforce-erp/drivers/:employeeId/dispatch-check
router.post("/workforce-erp/drivers/:employeeId/dispatch-check", async (req: Request, res: Response) => {
  const membership = await requireRoles(req, res, fleetManagers);
  if (!membership) return;

  const employeeId = String(req.params.employeeId);
  const check = await validateVehicleDispatch(membership.organizationId, employeeId);
  res.json(check);
});

// POST /api/workforce-erp/drivers/validate-dispatch
router.post("/workforce-erp/drivers/validate-dispatch", async (req: Request, res: Response) => {
  const membership = await requireRoles(req, res, fleetManagers);
  if (!membership) return;

  const employeeId = String(req.body?.driverEmployeeId || req.body?.employeeId);
  const check = await validateVehicleDispatch(membership.organizationId, employeeId);
  res.json(check);
});

// ---------------------------------------------------------------------------
// Workstream E: Sales Force & Territory Alignment
// ---------------------------------------------------------------------------

// GET /api/workforce-erp/territories
router.get("/workforce-erp/territories", async (req: Request, res: Response) => {
  const membership = await requireRoles(req, res, erpOpsReaders);
  if (!membership) return;

  const result = await listTerritories(membership.organizationId);
  res.json(result);
});

// POST /api/workforce-erp/territories
router.post("/workforce-erp/territories", async (req: Request, res: Response) => {
  const membership = await requireRoles(req, res, salesManagers);
  if (!membership) return;

  try {
    const created = await createTerritory(
      membership.organizationId,
      req.body ?? {},
      membership.userId,
    );
    res.status(201).json(created);
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : "Failed to create sales territory." });
  }
});

// GET /api/workforce-erp/sales-force
router.get("/workforce-erp/sales-force", async (req: Request, res: Response) => {
  const membership = await requireRoles(req, res, erpOpsReaders);
  if (!membership) return;

  const period = typeof req.query.period === "string" ? req.query.period : "2026-03";
  const result = await listSalesForce(membership.organizationId, period);
  res.json(result);
});

// POST /api/workforce-erp/sales-force
router.post("/workforce-erp/sales-force", async (req: Request, res: Response) => {
  const membership = await requireRoles(req, res, salesManagers);
  if (!membership) return;

  try {
    const assigned = await assignSalesRep(
      membership.organizationId,
      req.body ?? {},
      membership.userId,
    );
    res.status(201).json(assigned);
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : "Failed to assign sales representative." });
  }
});

// ---------------------------------------------------------------------------
// Workflow Rules & Approval Matrix
// ---------------------------------------------------------------------------

// GET /api/workflow-rules
router.get("/workflow-rules", async (req: Request, res: Response) => {
  const membership = await ensureMembership(req, res);
  if (!membership) return;

  if (!process.env.DATABASE_URL) {
    ensureRulesSeeded(membership.organizationId);
    res.json({ items: MEM_WORKFLOW_RULES.get(membership.organizationId)! });
    return;
  }

  const rows = await db
    .select()
    .from(workflowRulesTable)
    .where(eq(workflowRulesTable.organizationId, membership.organizationId));

  res.json({
    items: rows.map((r) => ({
      ...r,
      requiredApproverRoles: JSON.parse(r.requiredApproverRolesJson || "[]"),
    })),
  });
});

// POST /api/workflow-rules
router.post("/workflow-rules", async (req: Request, res: Response) => {
  const membership = await requireRoles(req, res, [
    PEOPLEOS_ROLES.hrAdmin,
    PEOPLEOS_ROLES.hrDirector,
    PEOPLEOS_ROLES.systemAdmin,
  ]);
  if (!membership) return;

  const domain = sanitizeText(req.body?.domain || "leave", 40);
  const name = sanitizeText(req.body?.name, 140);
  const approvalLevels = Math.max(1, Math.min(4, Number(req.body?.approvalLevels ?? 2)));
  const thresholdAmountKes = req.body?.thresholdAmountKes != null ? Number(req.body.thresholdAmountKes) : null;
  const slaHours = Math.max(1, Number(req.body?.slaHours ?? 24));
  const roles = Array.isArray(req.body?.requiredApproverRoles)
    ? req.body.requiredApproverRoles.map((r: unknown) => sanitizeText(r, 40)).filter(Boolean)
    : ["hr_manager"];

  if (!name) {
    res.status(400).json({ error: "Workflow rule name is required." });
    return;
  }

  if (!process.env.DATABASE_URL) {
    ensureRulesSeeded(membership.organizationId);
    const created = {
      id: `wf-${crypto.randomUUID().slice(0, 8)}`,
      organizationId: membership.organizationId,
      domain,
      name,
      thresholdAmountKes,
      approvalLevels,
      requiredApproverRoles: roles,
      slaHours,
      isActive: true,
    };
    MEM_WORKFLOW_RULES.get(membership.organizationId)!.unshift(created);

    await recordAuditEvent({
      organizationId: membership.organizationId,
      actorUserId: membership.userId,
      actor: membership.role,
      action: "WORKFLOW_RULE_CREATED",
      targetType: "workflow_rule",
      targetId: created.id,
      summary: `Created ${approvalLevels}-level workflow rule "${name}" for ${domain}`,
      isDemo: true,
    });

    res.status(201).json(created);
    return;
  }

  const [created] = await db
    .insert(workflowRulesTable)
    .values({
      organizationId: membership.organizationId,
      domain,
      name,
      thresholdAmountKes,
      approvalLevels,
      requiredApproverRolesJson: JSON.stringify(roles),
      slaHours,
      isActive: true,
    })
    .returning();

  res.status(201).json(created);
});

// ---------------------------------------------------------------------------
// Workstream H: Honest Integration Adapter Status & Diagnostic Ping
// ---------------------------------------------------------------------------

// GET /api/integrations/status & /api/workforce-erp/integrations
const handleIntegrationsStatus = async (req: Request, res: Response) => {
  const membership = await ensureMembership(req, res);
  if (!membership) return;

  const result = await getIntegrationsStatus(membership.organizationId);
  res.json(result);
};
router.get("/integrations/status", handleIntegrationsStatus);
router.get("/workforce-erp/integrations", handleIntegrationsStatus);

// POST /api/integrations/:key/ping & /api/workforce-erp/integrations/:key/ping
const handleIntegrationPing = async (req: Request, res: Response) => {
  const membership = await requireRoles(req, res, [
    PEOPLEOS_ROLES.hrAdmin,
    PEOPLEOS_ROLES.hrDirector,
    PEOPLEOS_ROLES.systemAdmin,
    PEOPLEOS_ROLES.financeManager,
    PEOPLEOS_ROLES.productionSupervisor,
    PEOPLEOS_ROLES.warehouseSupervisor,
  ]);
  if (!membership) return;

  const key = String(req.params.key);
  const result = await pingIntegrationAdapter(membership.organizationId, key, membership.userId);
  res.json(result);
};
router.post("/integrations/:key/ping", handleIntegrationPing);
router.post("/workforce-erp/integrations/:key/ping", handleIntegrationPing);

export default router;
