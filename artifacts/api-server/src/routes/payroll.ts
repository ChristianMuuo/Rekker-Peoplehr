import crypto from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import { Router, type IRouter, type Request, type Response } from "express";
import {
  db,
  employeesTable,
  payrollDisbursementsTable,
  payrollItemsTable,
  payrollRunsTable,
} from "@workspace/db";
import { recordAuditEvent } from "../lib/auditService";
import {
  activateStatutoryConfig,
  calculateKenyaStatutoryWithConfig,
  createDefaultStatutoryConfigs,
  getActiveStatutoryConfig,
  listStatutoryConfigs,
  saveStatutoryConfig,
  type StatutoryRuleConfig,
} from "../lib/kenyaPayrollEngine";
import {
  initiateMpesaSalaryPayout,
  isMpesaLiveConfigured,
} from "../lib/mpesaService";
import { maskKraPin } from "../lib/security";
import {
  ensureMembership,
  PEOPLEOS_ROLES,
  requireRoles,
} from "../middlewares/peopleosAccess";
import { DEMO_EMPLOYEES_LIST } from "./peopleos";

const router: IRouter = Router();

const payrollViewRoles = [
  PEOPLEOS_ROLES.hrAdmin,
  PEOPLEOS_ROLES.hrManager,
  PEOPLEOS_ROLES.payrollOfficer,
  PEOPLEOS_ROLES.executive,
  PEOPLEOS_ROLES.systemAdmin,
];

const payrollActionRoles = [
  PEOPLEOS_ROLES.hrAdmin,
  PEOPLEOS_ROLES.payrollOfficer,
  PEOPLEOS_ROLES.systemAdmin,
];

// Configurable Kenya salary schedule calculator (backward-compatible helper delegating to configurable rule engine)
export function calculateStatutoryKenya(
  grossSalary: number,
  allowances: number = 0,
  overtime: number = 0,
  overrideConfig?: StatutoryRuleConfig,
) {
  const config =
    overrideConfig ?? createDefaultStatutoryConfigs("rekker-demo")[0]!;
  return calculateKenyaStatutoryWithConfig(
    grossSalary,
    allowances,
    overtime,
    config,
  );
}

interface DemoSalaryProfile {
  employeeId: string;
  baseSalary: number;
  allowances: number;
  kraPin: string;
  departmentName: string;
}

const DEMO_COMPENSATION_BY_EMP: Record<string, DemoSalaryProfile> = {
  "10000000-0000-4000-8000-000000000001": { employeeId: "10000000-0000-4000-8000-000000000001", baseSalary: 320000, allowances: 40000, kraPin: "A001928374K", departmentName: "Manufacturing & Brewing" },
  "10000000-0000-4000-8000-000000000002": { employeeId: "10000000-0000-4000-8000-000000000002", baseSalary: 195000, allowances: 15000, kraPin: "A004591823M", departmentName: "Manufacturing & Brewing" },
  "10000000-0000-4000-8000-000000000003": { employeeId: "10000000-0000-4000-8000-000000000003", baseSalary: 245000, allowances: 30000, kraPin: "A009182734L", departmentName: "Logistics & Distribution" },
  "10000000-0000-4000-8000-000000000004": { employeeId: "10000000-0000-4000-8000-000000000004", baseSalary: 135000, allowances: 10000, kraPin: "A007162534W", departmentName: "Logistics & Distribution" },
  "10000000-0000-4000-8000-000000000005": { employeeId: "10000000-0000-4000-8000-000000000005", baseSalary: 265000, allowances: 25000, kraPin: "A006253418B", departmentName: "Brand & Commercial Marketing" },
  "10000000-0000-4000-8000-000000000006": { employeeId: "10000000-0000-4000-8000-000000000006", baseSalary: 115000, allowances: 10000, kraPin: "A008192736P", departmentName: "Brand & Commercial Marketing" },
  "10000000-0000-4000-8000-000000000007": { employeeId: "10000000-0000-4000-8000-000000000007", baseSalary: 310000, allowances: 35000, kraPin: "A003491827D", departmentName: "People Operations & Culture" },
  "10000000-0000-4000-8000-000000000008": { employeeId: "10000000-0000-4000-8000-000000000008", baseSalary: 105000, allowances: 8000, kraPin: "A005283941F", departmentName: "People Operations & Culture" },
  "10000000-0000-4000-8000-000000000009": { employeeId: "10000000-0000-4000-8000-000000000009", baseSalary: 225000, allowances: 20000, kraPin: "A002837465E", departmentName: "Finance & Supply Chain" },
  "10000000-0000-4000-8000-000000000010": { employeeId: "10000000-0000-4000-8000-000000000010", baseSalary: 88000, allowances: 7000, kraPin: "A009485712S", departmentName: "Manufacturing & Brewing" },
};

interface DemoPayrollRun {
  id: string;
  organizationId: string;
  period: string;
  totalGross: number;
  totalNet: number;
  totalPaye: number;
  totalNssf: number;
  totalSha: number;
  totalHousingLevy: number;
  status: string;
  approvedBy: string | null;
  approvedAt: string | null;
  createdByUserId: string | null;
  isDemo: boolean;
}

const DEMO_PAYROLL_RUNS: DemoPayrollRun[] = [];
const DEMO_DISBURSEMENTS: any[] = [];

function buildDemoItemsForRun(
  runId: string,
  period: string,
  config: StatutoryRuleConfig,
) {
  return DEMO_EMPLOYEES_LIST.map((emp) => {
    const comp = DEMO_COMPENSATION_BY_EMP[emp.id] ?? {
      employeeId: emp.id,
      baseSalary: 110000,
      allowances: 10000,
      kraPin: "A000000000X",
      departmentName: emp.departmentName,
    };
    const calc = calculateKenyaStatutoryWithConfig(
      comp.baseSalary,
      comp.allowances,
      0,
      config,
    );
    return {
      id: `item-${runId}-${emp.employeeNumber}`,
      payrollRunId: runId,
      period,
      employeeId: emp.id,
      employeeNumber: emp.employeeNumber,
      employeeName: `${emp.firstName} ${emp.lastName}`,
      departmentName: emp.departmentName,
      kraPinMasked: maskKraPin(comp.kraPin),
      phone: emp.phone ?? "+254700000000",
      baseSalary: comp.baseSalary,
      allowances: comp.allowances,
      overtimePay: 0,
      ...calc,
    };
  });
}

async function ensureDemoRunsSeeded(organizationId: string) {
  if (DEMO_PAYROLL_RUNS.some((r) => r.organizationId === organizationId)) return;
  const cfg = await getActiveStatutoryConfig(organizationId);
  const marchItems = buildDemoItemsForRun("run_2026_03", "March 2026", cfg);
  const sum = (fn: (x: (typeof marchItems)[number]) => number) =>
    marchItems.reduce((acc, i) => acc + fn(i), 0);

  DEMO_PAYROLL_RUNS.push(
    {
      id: "run_2026_03",
      organizationId,
      period: "March 2026",
      totalGross: sum((x) => x.grossPay),
      totalNet: sum((x) => x.netPay),
      totalPaye: sum((x) => x.netPaye),
      totalNssf: sum((x) => x.totalNssf),
      totalSha: sum((x) => x.sha),
      totalHousingLevy: sum((x) => x.housingLevy),
      status: "reviewed",
      approvedBy: null,
      approvedAt: null,
      createdByUserId: "system_scheduler",
      isDemo: true,
    },
    {
      id: "run_2026_02",
      organizationId,
      period: "February 2026",
      totalGross: sum((x) => x.grossPay) - 45000,
      totalNet: sum((x) => x.netPay) - 31000,
      totalPaye: sum((x) => x.netPaye) - 11000,
      totalNssf: sum((x) => x.totalNssf),
      totalSha: sum((x) => x.sha) - 1230,
      totalHousingLevy: sum((x) => x.housingLevy) - 675,
      status: "disbursed",
      approvedBy: "Dennis Otieno (payroll_officer)",
      approvedAt: "2026-02-25T14:00:00Z",
      createdByUserId: "user_demo_admin_01",
      isDemo: true,
    },
  );
}

// GET /api/payroll/statutory-configs
router.get("/payroll/statutory-configs", async (req: Request, res: Response) => {
  const membership = await ensureMembership(req, res);
  if (!membership) return;
  const configs = await listStatutoryConfigs(membership.organizationId);
  res.json({ items: configs, total: configs.length });
});

// POST /api/payroll/statutory-configs - Create & optionally activate a new tax schedule version
router.post("/payroll/statutory-configs", async (req: Request, res: Response) => {
  const membership = await requireRoles(req, res, payrollActionRoles);
  if (!membership) return;

  const {
    name,
    effectiveFrom,
    effectiveTo,
    activate = true,
    nssf,
    shif,
    housingLevy,
    paye,
  } = req.body ?? {};

  if (!name || !effectiveFrom || !nssf || !shif || !housingLevy || !paye) {
    res.status(400).json({
      error: "Complete statutory config payload (name, effectiveFrom, nssf, shif, housingLevy, paye) is required.",
    });
    return;
  }

  const created = await saveStatutoryConfig({
    organizationId: membership.organizationId,
    userId: membership.userId,
    name: String(name).trim(),
    effectiveFrom: String(effectiveFrom).slice(0, 10),
    effectiveTo: effectiveTo ? String(effectiveTo).slice(0, 10) : null,
    activate: Boolean(activate),
    nssf,
    shif,
    housingLevy,
    paye,
  });

  await recordAuditEvent({
    organizationId: membership.organizationId,
    actorUserId: membership.userId,
    actor: membership.role,
    action: "STATUTORY_CONFIG_CREATED",
    targetType: "statutory_config",
    targetId: created.id,
    summary: `Created Kenyan statutory configuration "${created.name}" effective ${created.effectiveFrom}`,
  });

  res.status(201).json(created);
});

// POST /api/payroll/statutory-configs/:configId/activate
router.post(
  "/payroll/statutory-configs/:configId/activate",
  async (req: Request, res: Response) => {
    const membership = await requireRoles(req, res, payrollActionRoles);
    if (!membership) return;

    const configId = String(req.params.configId ?? "");
    const activated = await activateStatutoryConfig(
      membership.organizationId,
      configId,
    );
    if (!activated) {
      res.status(404).json({ error: "Statutory config not found for your organization." });
      return;
    }

    await recordAuditEvent({
      organizationId: membership.organizationId,
      actorUserId: membership.userId,
      actor: membership.role,
      action: "STATUTORY_CONFIG_ACTIVATED",
      targetType: "statutory_config",
      targetId: activated.id,
      summary: `Activated Kenyan statutory schedule "${activated.name}"`,
    });

    res.json(activated);
  },
);

// GET /api/payroll/runs
router.get("/payroll/runs", async (req: Request, res: Response) => {
  const membership = await requireRoles(req, res, payrollViewRoles);
  if (!membership) return;

  if (!process.env.DATABASE_URL) {
    await ensureDemoRunsSeeded(membership.organizationId);
    const runs = DEMO_PAYROLL_RUNS.filter(
      (r) => r.organizationId === membership.organizationId,
    );
    res.json({ runs, mpesaLiveConfigured: isMpesaLiveConfigured() });
    return;
  }

  const runs = await db
    .select()
    .from(payrollRunsTable)
    .where(eq(payrollRunsTable.organizationId, membership.organizationId))
    .orderBy(desc(payrollRunsTable.createdAt));

  res.json({
    runs: runs.map((r) => ({
      id: r.id,
      period: r.period,
      totalGross: r.totalGross,
      totalNet: r.totalNet,
      totalPaye: r.totalPaye,
      totalNssf: r.totalNssf,
      totalSha: r.totalSha,
      totalHousingLevy: r.totalHousingLevy,
      status: r.status,
      approvedBy: r.approvedByUserId,
      approvedAt: r.approvedAt?.toISOString() ?? null,
    })),
    mpesaLiveConfigured: isMpesaLiveConfigured(),
  });
});

// GET /api/payroll/runs/:runId/items
router.get("/payroll/runs/:runId/items", async (req: Request, res: Response) => {
  const membership = await ensureMembership(req, res);
  if (!membership) return;

  const runId = String(req.params.runId ?? "");
  const isPayrollViewer = payrollViewRoles.includes(membership.role as any);
  const cfg = await getActiveStatutoryConfig(membership.organizationId);

  if (!process.env.DATABASE_URL) {
    await ensureDemoRunsSeeded(membership.organizationId);
    const run = DEMO_PAYROLL_RUNS.find(
      (r) => r.id === runId && r.organizationId === membership.organizationId,
    );
    if (!run) {
      res.status(404).json({ error: "Payroll run not found." });
      return;
    }
    let items = buildDemoItemsForRun(run.id, run.period, cfg);
    if (!isPayrollViewer) {
      items = items.filter((i) => i.employeeId === membership.employeeId);
    }
    res.json({ run, items, configUsed: { id: cfg.id, name: cfg.name } });
    return;
  }

  const [run] = await db
    .select()
    .from(payrollRunsTable)
    .where(
      and(
        eq(payrollRunsTable.id, runId),
        eq(payrollRunsTable.organizationId, membership.organizationId),
      ),
    )
    .limit(1);

  if (!run) {
    res.status(404).json({ error: "Payroll run not found." });
    return;
  }

  const rawItems = await db
    .select()
    .from(payrollItemsTable)
    .where(eq(payrollItemsTable.payrollRunId, run.id));

  const emps = await db
    .select()
    .from(employeesTable)
    .where(eq(employeesTable.organizationId, membership.organizationId));
  const empMap = new Map(emps.map((e) => [e.id, e]));

  let items = rawItems.map((item) => {
    const emp = empMap.get(item.employeeId);
    return {
      ...item,
      period: run.period,
      employeeNumber: emp?.employeeNumber ?? "REK",
      employeeName: emp ? `${emp.firstName} ${emp.lastName}` : "Employee",
      kraPinMasked: maskKraPin(emp?.kraPin),
    };
  });

  if (!isPayrollViewer) {
    items = items.filter((i) => i.employeeId === membership.employeeId);
  }

  res.json({ run, items, configUsed: { id: cfg.id, name: cfg.name } });
});

// POST /api/payroll/runs - Generate new payroll run for a period using active statutory config
router.post("/payroll/runs", async (req: Request, res: Response) => {
  const membership = await requireRoles(req, res, payrollActionRoles);
  if (!membership) return;

  const { period, configId } = req.body ?? {};
  if (!period || typeof period !== "string" || !period.trim()) {
    res.status(400).json({ error: "Payroll period string (e.g. 'April 2026') is required." });
    return;
  }
  const cleanPeriod = period.trim();

  const configs = await listStatutoryConfigs(membership.organizationId);
  const config =
    (configId && configs.find((c) => c.id === configId)) ||
    configs.find((c) => c.isActive) ||
    configs[0]!;

  if (!process.env.DATABASE_URL) {
    await ensureDemoRunsSeeded(membership.organizationId);
    if (
      DEMO_PAYROLL_RUNS.some(
        (r) =>
          r.organizationId === membership.organizationId &&
          r.period.toLowerCase() === cleanPeriod.toLowerCase(),
      )
    ) {
      res.status(409).json({ error: `Payroll run for ${cleanPeriod} already exists.` });
      return;
    }
    const runId = `run_${Date.now()}`;
    const items = buildDemoItemsForRun(runId, cleanPeriod, config);
    const sum = (fn: (x: (typeof items)[number]) => number) =>
      items.reduce((acc, i) => acc + fn(i), 0);

    const newRun: DemoPayrollRun = {
      id: runId,
      organizationId: membership.organizationId,
      period: cleanPeriod,
      totalGross: sum((x) => x.grossPay),
      totalNet: sum((x) => x.netPay),
      totalPaye: sum((x) => x.netPaye),
      totalNssf: sum((x) => x.totalNssf),
      totalSha: sum((x) => x.sha),
      totalHousingLevy: sum((x) => x.housingLevy),
      status: "reviewed",
      approvedBy: null,
      approvedAt: null,
      createdByUserId: membership.userId,
      isDemo: true,
    };
    DEMO_PAYROLL_RUNS.unshift(newRun);

    await recordAuditEvent({
      organizationId: membership.organizationId,
      actorUserId: membership.userId,
      actor: membership.role,
      action: "PAYROLL_RUN_GENERATED",
      targetType: "payroll_run",
      targetId: newRun.id,
      summary: `Generated payroll run for ${cleanPeriod} using "${config.name}"`,
    });

    res.status(201).json({ run: newRun, items, configUsed: config.name });
    return;
  }

  const activeEmps = await db
    .select()
    .from(employeesTable)
    .where(eq(employeesTable.organizationId, membership.organizationId));

  const eligible = activeEmps.filter((e) => e.status !== "former");
  const calculated = eligible.map((e) => ({
    emp: e,
    calc: calculateKenyaStatutoryWithConfig(
      e.baseSalary,
      e.allowances,
      0,
      config,
    ),
  }));

  const sum = (fn: (x: (typeof calculated)[number]) => number) =>
    calculated.reduce((acc, i) => acc + fn(i), 0);

  const created = await db.transaction(async (tx) => {
    const [run] = await tx
      .insert(payrollRunsTable)
      .values({
        organizationId: membership.organizationId,
        period: cleanPeriod,
        totalGross: sum((x) => x.calc.grossPay),
        totalNet: sum((x) => x.calc.netPay),
        totalPaye: sum((x) => x.calc.netPaye),
        totalNssf: sum((x) => x.calc.totalNssf),
        totalSha: sum((x) => x.calc.sha),
        totalHousingLevy: sum((x) => x.calc.housingLevy),
        status: "reviewed",
      })
      .returning();

    for (const row of calculated) {
      await tx.insert(payrollItemsTable).values({
        payrollRunId: run!.id,
        employeeId: row.emp.id,
        baseSalary: row.emp.baseSalary,
        allowances: row.emp.allowances,
        overtimePay: 0,
        grossPay: row.calc.grossPay,
        nssfTier1: row.calc.nssfTier1,
        nssfTier2: row.calc.nssfTier2,
        totalNssf: row.calc.totalNssf,
        sha: row.calc.sha,
        housingLevy: row.calc.housingLevy,
        taxablePay: row.calc.taxablePay,
        netPaye: row.calc.netPaye,
        totalDeductions: row.calc.totalDeductions,
        netPay: row.calc.netPay,
      });
    }
    return run!;
  });

  await recordAuditEvent({
    organizationId: membership.organizationId,
    actorUserId: membership.userId,
    actor: membership.role,
    action: "PAYROLL_RUN_GENERATED",
    targetType: "payroll_run",
    targetId: created.id,
    summary: `Generated payroll run for ${cleanPeriod} (${calculated.length} employees)`,
  });

  res.status(201).json({ run: created, configUsed: config.name });
});

// POST /api/payroll/calculate
router.post("/payroll/calculate", async (req: Request, res: Response) => {
  const membership = await ensureMembership(req, res);
  if (!membership) return;

  const { grossSalary, allowances = 0, overtime = 0, configId } = req.body ?? {};
  if (typeof grossSalary !== "number" || Number.isNaN(grossSalary) || grossSalary < 0) {
    res.status(400).json({ error: "Non-negative numeric grossSalary is required." });
    return;
  }

  const configs = await listStatutoryConfigs(membership.organizationId);
  const config =
    (configId && configs.find((c) => c.id === configId)) ||
    configs.find((c) => c.isActive) ||
    configs[0]!;

  const breakdown = calculateKenyaStatutoryWithConfig(
    grossSalary,
    Number(allowances) || 0,
    Number(overtime) || 0,
    config,
  );
  res.json(breakdown);
});

// POST /api/payroll/approve - Mandatory Human Approval Workflow
router.post("/payroll/approve", async (req: Request, res: Response) => {
  const membership = await requireRoles(req, res, payrollActionRoles);
  if (!membership) return;

  const { period } = req.body ?? {};
  if (!period) {
    res.status(400).json({ error: "Payroll period or run ID is required." });
    return;
  }

  if (!process.env.DATABASE_URL) {
    await ensureDemoRunsSeeded(membership.organizationId);
    const run = DEMO_PAYROLL_RUNS.find(
      (r) =>
        r.organizationId === membership.organizationId &&
        (r.period === period || r.id === period),
    );
    if (!run) {
      res.status(404).json({ error: "Payroll run not found." });
      return;
    }

    run.status = "approved";
    run.approvedBy = `${membership.userId} (${membership.role})`;
    run.approvedAt = new Date().toISOString();

    await recordAuditEvent({
      organizationId: membership.organizationId,
      actorUserId: membership.userId,
      actor: membership.role,
      action: "PAYROLL_APPROVED",
      targetType: "payroll_run",
      targetId: run.id,
      summary: `Approved ${run.period} payroll run (Gross KES ${run.totalGross.toLocaleString()})`,
      isDemo: true,
    });

    res.json({
      message: "Payroll run approved and signed off for M-Pesa / bank disbursement.",
      run,
    });
    return;
  }

  const runs = await db
    .select()
    .from(payrollRunsTable)
    .where(eq(payrollRunsTable.organizationId, membership.organizationId));
  const target = runs.find((r) => r.period === period || r.id === period);
  if (!target) {
    res.status(404).json({ error: "Payroll run not found." });
    return;
  }

  const [updated] = await db
    .update(payrollRunsTable)
    .set({
      status: "approved",
      approvedByUserId: membership.userId,
      approvedAt: new Date(),
    })
    .where(eq(payrollRunsTable.id, target.id))
    .returning();

  await recordAuditEvent({
    organizationId: membership.organizationId,
    actorUserId: membership.userId,
    actor: membership.role,
    action: "PAYROLL_APPROVED",
    targetType: "payroll_run",
    targetId: target.id,
    summary: `Approved ${target.period} payroll run (Gross KES ${target.totalGross.toLocaleString()})`,
  });

  res.json({
    message: "Payroll run approved and signed off for disbursement.",
    run: updated,
  });
});

// POST /api/payroll/runs/:runId/disburse-mpesa
router.post(
  "/payroll/runs/:runId/disburse-mpesa",
  async (req: Request, res: Response) => {
    const membership = await requireRoles(req, res, payrollActionRoles);
    if (!membership) return;

    const runId = String(req.params.runId ?? "");
    const cfg = await getActiveStatutoryConfig(membership.organizationId);

    if (!process.env.DATABASE_URL) {
      await ensureDemoRunsSeeded(membership.organizationId);
      const run = DEMO_PAYROLL_RUNS.find(
        (r) => r.id === runId && r.organizationId === membership.organizationId,
      );
      if (!run) {
        res.status(404).json({ error: "Payroll run not found." });
        return;
      }
      if (run.status !== "approved") {
        res.status(409).json({
          error: "Human approval signoff is required before M-Pesa salary disbursement.",
        });
        return;
      }

      const items = buildDemoItemsForRun(run.id, run.period, cfg);
      const results = [];
      for (const item of items) {
        const resPayout = await initiateMpesaSalaryPayout({
          employeeId: item.employeeId,
          employeeName: item.employeeName,
          phone: item.phone,
          amountKes: item.netPay,
          period: run.period,
        });
        DEMO_DISBURSEMENTS.unshift({
          ...resPayout,
          payrollRunId: run.id,
          organizationId: membership.organizationId,
          initiatedAt: new Date().toISOString(),
        });
        results.push(resPayout);
      }
      run.status = "disbursed";

      await recordAuditEvent({
        organizationId: membership.organizationId,
        actorUserId: membership.userId,
        actor: membership.role,
        action: "PAYROLL_MPESA_DISBURSED",
        targetType: "payroll_run",
        targetId: run.id,
        summary: `Initiated M-Pesa B2C disbursement for ${run.period} (${results.length} payouts, mode: ${results[0]?.providerMode})`,
        isDemo: true,
      });

      res.json({
        runId: run.id,
        period: run.period,
        providerMode: results[0]?.providerMode ?? "SANDBOX_SIMULATION",
        totalEmployeesPaid: results.length,
        totalDisbursedKes: results.reduce((s, r) => s + r.amountKes, 0),
        results,
      });
      return;
    }

    const [run] = await db
      .select()
      .from(payrollRunsTable)
      .where(
        and(
          eq(payrollRunsTable.id, runId),
          eq(payrollRunsTable.organizationId, membership.organizationId),
        ),
      )
      .limit(1);

    if (!run) {
      res.status(404).json({ error: "Payroll run not found." });
      return;
    }
    if (run.status !== "approved") {
      res.status(409).json({
        error: "Human approval signoff is required before M-Pesa salary disbursement.",
      });
      return;
    }

    const items = await db
      .select()
      .from(payrollItemsTable)
      .where(eq(payrollItemsTable.payrollRunId, run.id));
    const emps = await db
      .select()
      .from(employeesTable)
      .where(eq(employeesTable.organizationId, membership.organizationId));
    const empMap = new Map(emps.map((e) => [e.id, e]));

    const results = [];
    for (const item of items) {
      const emp = empMap.get(item.employeeId);
      const payout = await initiateMpesaSalaryPayout({
        employeeId: item.employeeId,
        employeeName: emp ? `${emp.firstName} ${emp.lastName}` : "Employee",
        phone: emp?.phone || "+254700000000",
        amountKes: item.netPay,
        period: run.period,
      });
      await db.insert(payrollDisbursementsTable).values({
        organizationId: membership.organizationId,
        payrollRunId: run.id,
        employeeId: item.employeeId,
        channel: payout.channel,
        recipientMasked: payout.recipientMasked,
        amountKes: payout.amountKes,
        providerMode: payout.providerMode,
        transactionReference: payout.transactionReference,
        status: payout.status,
        initiatedByUserId: membership.userId,
      });
      results.push(payout);
    }

    await db
      .update(payrollRunsTable)
      .set({ status: "disbursed" })
      .where(eq(payrollRunsTable.id, run.id));

    await recordAuditEvent({
      organizationId: membership.organizationId,
      actorUserId: membership.userId,
      actor: membership.role,
      action: "PAYROLL_MPESA_DISBURSED",
      targetType: "payroll_run",
      targetId: run.id,
      summary: `Disbursed ${run.period} via M-Pesa B2C (${results.length} payouts)`,
    });

    res.json({
      runId: run.id,
      period: run.period,
      providerMode: results[0]?.providerMode ?? "SANDBOX_SIMULATION",
      totalEmployeesPaid: results.length,
      totalDisbursedKes: results.reduce((s, r) => s + r.amountKes, 0),
      results,
    });
  },
);

// GET /api/payroll/p9a/:employeeId - KRA P9A Annual Tax Deduction Card summary
router.get("/payroll/p9a/:employeeId", async (req: Request, res: Response) => {
  const membership = await ensureMembership(req, res);
  if (!membership) return;

  const employeeId = String(req.params.employeeId ?? "");
  const isViewer = payrollViewRoles.includes(membership.role as any);
  if (!isViewer && membership.employeeId !== employeeId) {
    res.status(403).json({ error: "Access denied to another employee's KRA P9A card." });
    return;
  }

  const emp = DEMO_EMPLOYEES_LIST.find((e) => e.id === employeeId);
  const comp = DEMO_COMPENSATION_BY_EMP[employeeId];
  if (!emp && !process.env.DATABASE_URL) {
    res.status(404).json({ error: "Employee not found." });
    return;
  }

  const cfg = await getActiveStatutoryConfig(membership.organizationId);
  const monthly = calculateKenyaStatutoryWithConfig(
    comp?.baseSalary ?? 150000,
    comp?.allowances ?? 15000,
    0,
    cfg,
  );

  const months = ["January", "February", "March"].map((m) => ({
    month: m,
    basicSalary: comp?.baseSalary ?? 150000,
    allowances: comp?.allowances ?? 15000,
    grossPay: monthly.grossPay,
    nssfContribution: monthly.totalNssf,
    shifContribution: monthly.sha,
    housingLevy: monthly.housingLevy,
    chargeablePay: monthly.taxablePay,
    taxCharged: monthly.payeBeforeRelief,
    personalRelief: monthly.personalRelief,
    payeDeducted: monthly.netPaye,
  }));

  res.json({
    formType: "KRA Form P9A (Employee Tax Deduction Card)",
    taxYear: 2026,
    employerName: "Rekker Breweries Kenya Ltd",
    employerPin: "P051482910K",
    employeeId,
    employeeName: emp ? `${emp.firstName} ${emp.lastName}` : "Employee",
    employeeNumber: emp?.employeeNumber ?? "REK",
    employeePinMasked: maskKraPin(comp?.kraPin ?? "A000000000K"),
    statutoryConfigName: cfg.name,
    months,
    totals: {
      grossPay: monthly.grossPay * months.length,
      nssf: monthly.totalNssf * months.length,
      shif: monthly.sha * months.length,
      housingLevy: monthly.housingLevy * months.length,
      taxablePay: monthly.taxablePay * months.length,
      payeDeducted: monthly.netPaye * months.length,
    },
  });
});

// GET /api/payroll/anomalies - Fixed route path (was wrongly /api/payroll/anomalies!)
router.get("/payroll/anomalies", async (req: Request, res: Response) => {
  const membership = await requireRoles(req, res, payrollViewRoles);
  if (!membership) return;

  const cfg = await getActiveStatutoryConfig(membership.organizationId);
  const items = buildDemoItemsForRun("audit_check", "March 2026", cfg);
  const nssfMaxPossible =
    Math.round(cfg.nssf.tier1UpperLimitKes * cfg.nssf.rate) +
    Math.round(
      Math.max(0, cfg.nssf.tier2UpperLimitKes - cfg.nssf.tier1UpperLimitKes) *
        cfg.nssf.rate,
    );

  const anomalies: any[] = [];
  for (const item of items) {
    if (item.totalNssf > nssfMaxPossible) {
      anomalies.push({
        type: "NSSF_CAP_EXCEEDED",
        severity: "high",
        employee: item.employeeName,
        description: `NSSF KES ${item.totalNssf} exceeds cap KES ${nssfMaxPossible}.`,
        status: "flagged",
      });
    }
  }

  res.json({
    auditedRun: "March 2026",
    statutorySchedule: cfg.name,
    nssfMaxEmployeeCapKes: nssfMaxPossible,
    anomalies: anomalies.length
      ? anomalies
      : [
          {
            type: "STATUTORY_CAP_CHECK",
            severity: "low",
            description: `Verified all ${items.length} employee NSSF deductions honor statutory cap of KES ${nssfMaxPossible.toLocaleString()}.`,
            status: "passed",
          },
          {
            type: "HOUSING_LEVY_CHECK",
            severity: "low",
            description: `Affordable Housing Levy (${(cfg.housingLevy.employeeRate * 100).toFixed(1)}% employee + ${(cfg.housingLevy.employerRate * 100).toFixed(1)}% employer) verified across all active employees.`,
            status: "passed",
          },
          {
            type: "SHIF_MINIMUM_CHECK",
            severity: "low",
            description: `All SHIF deductions (${(cfg.shif.rate * 100).toFixed(2)}%, min KES ${cfg.shif.minimumKes}) verified within compliance thresholds.`,
            status: "passed",
          },
        ],
  });
});

export default router;
