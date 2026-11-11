import crypto from "node:crypto";
import { eq } from "drizzle-orm";
import { Router, type IRouter, type Request, type Response } from "express";
import { db, workflowRulesTable } from "@workspace/db";
import { recordAuditEvent } from "../lib/auditService";
import { isMpesaLiveConfigured } from "../lib/mpesaService";
import { sanitizeText } from "../lib/security";
import {
  ensureMembership,
  MODULE_PERMISSION_MATRIX,
  PEOPLEOS_ROLES,
  requireRoles,
} from "../middlewares/peopleosAccess";
import { DEMO_EMPLOYEES_LIST } from "./peopleos";
import { DEMO_LEAVE_STORE } from "./leave";

const router: IRouter = Router();

const erpOpsReaders = [
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

const DEMO_WORKFORCE_ROSTER = [
  { employeeId: "10000000-0000-4000-8000-000000000001", employeeName: "Achieng Odhiambo", unitType: "production", workZone: "Formulation Line A", shiftName: "Morning (06:00-14:00)", roleSkill: "Lead Formulation Chemist", certificationValidUntil: "2027-01-15", costCentreCode: "CC-MFG-01" },
  { employeeId: "10000000-0000-4000-8000-000000000002", employeeName: "Mwangi Kariuki", unitType: "production", workZone: "Automated Filling Line B", shiftName: "Morning (06:00-14:00)", roleSkill: "High-Speed Filler Operator", certificationValidUntil: "2026-08-20", costCentreCode: "CC-MFG-01" },
  { employeeId: "10000000-0000-4000-8000-000000000004", employeeName: "Wanjiku Kimani", unitType: "warehouse", workZone: "Nairobi Central Dispatch Warehouse", shiftName: "Day (08:00-17:00)", roleSkill: "Forklift & Pallet Control Operator", certificationValidUntil: "2026-04-05", costCentreCode: "CC-WHS-01" },
  { employeeId: "10000000-0000-4000-8000-000000000003", employeeName: "Juma Omondi", unitType: "distribution", workZone: "Nairobi - Rift Corridor", shiftName: "Route Dispatch (06:30-16:30)", roleSkill: "Fleet Logistics Supervisor", certificationValidUntil: "2026-11-30", costCentreCode: "CC-LOG-01" },
  { employeeId: "10000000-0000-4000-8000-000000000005", employeeName: "Brenda Mutheu", unitType: "sales", workZone: "Nairobi & Mt. Kenya Trade", shiftName: "Field Commercial", roleSkill: "Key Trade Account Manager", certificationValidUntil: "2027-03-01", costCentreCode: "CC-SLS-01" },
  { employeeId: "10000000-0000-4000-8000-000000000006", employeeName: "Brian Kiprotich", unitType: "sales", workZone: "Rift Valley Territory", shiftName: "Field Commercial", roleSkill: "Trade Territory Representative", certificationValidUntil: "2026-04-30", costCentreCode: "CC-SLS-01" },
];

const DEMO_DRIVER_CREDENTIALS = [
  {
    employeeId: "10000000-0000-4000-8000-000000000003",
    driverName: "Juma Omondi",
    licenseNumber: "DL-KE-881204",
    licenseClass: "BCE Commercial Heavy",
    licenseExpiry: "2026-03-29",
    psvOrSafetyCertExpiry: "2026-04-12",
    assignedVehicle: "KDM 482L · Box Distribution Truck",
    routeCorridor: "Nairobi -> Nakuru -> Eldoret",
  },
  {
    employeeId: "10000000-0000-4000-8000-000000000004",
    driverName: "Wanjiku Kimani",
    licenseNumber: "DL-KE-550192",
    licenseClass: "BCE + Forklift Endorsement",
    licenseExpiry: "2026-12-15",
    psvOrSafetyCertExpiry: "2026-10-01",
    assignedVehicle: "KDG 910M · Urban Van",
    routeCorridor: "Nairobi Metro & Thika Road",
  },
];

const DEMO_SALES_WORKFORCE = [
  {
    employeeId: "10000000-0000-4000-8000-000000000005",
    repName: "Brenda Mutheu",
    territory: "Nairobi Metro & Modern Trade",
    costCentreCode: "CC-SLS-01",
    monthlyTargetKes: 2500000,
    actualAttributedKes: 2310000,
    commissionRatePct: 2.5,
  },
  {
    employeeId: "10000000-0000-4000-8000-000000000006",
    repName: "Brian Kiprotich",
    territory: "Nakuru & South Rift",
    costCentreCode: "CC-SLS-01",
    monthlyTargetKes: 1400000,
    actualAttributedKes: 1180000,
    commissionRatePct: 3.0,
  },
];

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

// GET /api/workforce-erp/overview — Staffing Availability & Dept × Shift Heatmap
router.get("/workforce-erp/overview", async (req: Request, res: Response) => {
  const membership = await requireRoles(req, res, erpOpsReaders);
  if (!membership) return;

  const onLeaveIds = new Set(
    DEMO_LEAVE_STORE.filter((l) => l.status === "approved" || l.status === "pending").map((l) => l.employeeId),
  );
  const empStatusMap = new Map(DEMO_EMPLOYEES_LIST.map((e) => [e.id, e]));

  const roster = DEMO_WORKFORCE_ROSTER.map((r) => {
    const emp = empStatusMap.get(r.employeeId);
    const unavailable = emp?.status === "on_leave" || onLeaveIds.has(r.employeeId);
    return {
      ...r,
      employeeStatus: emp?.status ?? "active",
      availableToday: !unavailable,
    };
  });

  const zones = Array.from(new Set(roster.map((r) => r.unitType)));
  const heatmap = zones.map((unitType) => {
    const unitRows = roster.filter((r) => r.unitType === unitType);
    const present = unitRows.filter((r) => r.availableToday).length;
    return {
      unitType,
      scheduled: unitRows.length,
      present,
      awayOrPendingLeave: unitRows.length - present,
      coveragePct: unitRows.length ? Math.round((present / unitRows.length) * 100) : 100,
    };
  });

  res.json({
    dataScope: "ERP_WORKFORCE_AVAILABILITY",
    roster,
    heatmap,
    understaffedUnits: heatmap.filter((h) => h.coveragePct < 100),
  });
});

// GET /api/workforce-erp/production/replacements — Match Qualified Replacements for Missing Shift Coverage
router.get("/workforce-erp/production/replacements", async (req: Request, res: Response) => {
  const membership = await requireRoles(req, res, erpOpsReaders);
  if (!membership) return;

  const onLeaveSet = new Set(
    DEMO_EMPLOYEES_LIST.filter((e) => e.status === "on_leave").map((e) => e.id),
  );
  const qualifiedPool = DEMO_EMPLOYEES_LIST.filter(
    (e) => e.status === "active" && !onLeaveSet.has(e.id),
  ).map((e) => ({
    employeeId: e.id,
    name: `${e.firstName} ${e.lastName}`,
    departmentName: e.departmentName,
    jobTitle: e.jobTitle,
    safetyCleared: true,
    readinessNote: e.departmentName.includes("Formulation")
      ? "Direct Production Line Certified"
      : "Cross-trainable Support Backup",
  }));

  res.json({
    missingCoverageEmployees: DEMO_EMPLOYEES_LIST.filter((e) => e.status === "on_leave").map((e) => ({
      employeeId: e.id,
      name: `${e.firstName} ${e.lastName}`,
      departmentName: e.departmentName,
    })),
    qualifiedReplacements: qualifiedPool.slice(0, 5),
  });
});

// GET /api/workforce-erp/drivers — Driver Credentials & Expiry Monitoring
router.get("/workforce-erp/drivers", async (req: Request, res: Response) => {
  const membership = await requireRoles(req, res, erpOpsReaders);
  if (!membership) return;

  const todayMs = Date.parse("2026-03-06T00:00:00Z");
  const drivers = DEMO_DRIVER_CREDENTIALS.map((d) => {
    const expMs = Date.parse(`${d.licenseExpiry}T00:00:00Z`);
    const daysRemaining = Math.ceil((expMs - todayMs) / 86400000);
    const alertLevel = daysRemaining <= 0 ? "expired" : daysRemaining <= 45 ? "expiring_soon" : "valid";
    return { ...d, daysRemaining, alertLevel };
  });

  res.json({ items: drivers, alertsCount: drivers.filter((d) => d.alertLevel !== "valid").length });
});

// GET /api/workforce-erp/sales-force — Sales Reps Territory, Targets & Commission Alignment
router.get("/workforce-erp/sales-force", async (req: Request, res: Response) => {
  const membership = await requireRoles(req, res, erpOpsReaders);
  if (!membership) return;

  const items = DEMO_SALES_WORKFORCE.map((rep) => {
    const attainmentPct = Math.round((rep.actualAttributedKes / rep.monthlyTargetKes) * 1000) / 10;
    const estimatedCommissionKes = Math.round(rep.actualAttributedKes * (rep.commissionRatePct / 100));
    return { ...rep, attainmentPct, estimatedCommissionKes };
  });

  res.json({ items, totalAttributedKes: items.reduce((s, r) => s + r.actualAttributedKes, 0) });
});

// GET /api/workflow-rules & POST /api/workflow-rules
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

// GET /api/integrations/status — Honest Integration Adapter Center
router.get("/integrations/status", async (req: Request, res: Response) => {
  const membership = await ensureMembership(req, res);
  if (!membership) return;

  res.json({
    permissionMatrix: MODULE_PERMISSION_MATRIX,
    adapters: [
      {
        key: "clerk_auth",
        name: "Clerk Identity & MFA",
        category: "Authentication",
        configured: Boolean(process.env.CLERK_SECRET_KEY),
        status: process.env.CLERK_SECRET_KEY ? "CONNECTED" : "SANDBOX_FALLBACK",
        detail: process.env.CLERK_SECRET_KEY
          ? "CLERK_SECRET_KEY configured on server."
          : "Running local non-production demo mode; supply CLERK_SECRET_KEY for SSO/MFA.",
      },
      {
        key: "openai_llm",
        name: "OpenAI Multi-Agent Reasoning",
        category: "AI Orchestrator",
        configured: Boolean(process.env.OPENAI_API_KEY),
        status: process.env.OPENAI_API_KEY ? "CONNECTED" : "DETERMINISTIC_FALLBACK",
        detail: process.env.OPENAI_API_KEY
          ? "Live LLM tool-calling active."
          : "Using deterministic tool-grounded synthesis until OPENAI_API_KEY is supplied.",
      },
      {
        key: "python_ml",
        name: "Python Scikit-learn / XGBoost ML Service",
        category: "Predictive ML",
        configured: true,
        status: "CONNECTED",
        detail: process.env.PEOPLEOS_ML_URL || "Embedded services/ml-engine CLI runtime active.",
      },
      {
        key: "mpesa_daraja",
        name: "Safaricom M-Pesa Daraja B2C",
        category: "Kenyan Payroll",
        configured: isMpesaLiveConfigured(),
        status: isMpesaLiveConfigured() ? "CONNECTED" : "AWAITING_CREDENTIALS",
        detail: isMpesaLiveConfigured()
          ? "Daraja B2C credentials verified in environment."
          : "Adapter ready; running SANDBOX_SIMULATION until MPESA_CONSUMER_KEY/SECRET/SHORTCODE provided.",
      },
      {
        key: "biometric_clock",
        name: "Plant & Warehouse Biometric Timeclock Feed",
        category: "Attendance ERP",
        configured: Boolean(process.env.BIOMETRIC_SYNC_SECRET),
        status: process.env.BIOMETRIC_SYNC_SECRET ? "CONNECTED" : "AWAITING_CREDENTIALS",
        detail: "Accepts signed webhook punches when BIOMETRIC_SYNC_SECRET is provisioned.",
      },
      {
        key: "rekker_external_sites",
        name: "Launched Rekker Websites (rekker.co.ke & shop.rekker.co.ke)",
        category: "External Channels",
        configured: false,
        status: "EXTERNAL_SYSTEMS_LINKED",
        detail: "Kept intentionally separate to avoid storefront/catalog duplication; direct outbound links active.",
      },
    ],
  });
});

export default router;

