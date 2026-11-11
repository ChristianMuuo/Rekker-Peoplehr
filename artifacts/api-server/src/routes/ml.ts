import { Router, type IRouter, type Request, type Response } from "express";
import { runPythonMlTask, type MlTaskName } from "../lib/mlBridge";
import { recordAuditEvent } from "../lib/auditService";
import { getActiveStatutoryConfig, calculateKenyaStatutoryWithConfig } from "../lib/kenyaPayrollEngine";
import { ensureMembership, PEOPLEOS_ROLES, requireRoles } from "../middlewares/peopleosAccess";
import { DEMO_EMPLOYEES_LIST } from "./peopleos";
import { DEMO_LEAVE_STORE } from "./leave";

const router: IRouter = Router();

const hrAndExecutiveRoles = [
  PEOPLEOS_ROLES.hrAdmin,
  PEOPLEOS_ROLES.hrManager,
  PEOPLEOS_ROLES.systemAdmin,
  PEOPLEOS_ROLES.executive,
  PEOPLEOS_ROLES.departmentManager,
];

const ML_EMPLOYEE_FEATURES: Record<
  string,
  { tenureMonths: number; baseSalary: number; overtimeHours: number; lateRatePct: number; skills: string[] }
> = {
  "10000000-0000-4000-8000-000000000001": { tenureMonths: 60, baseSalary: 320000, overtimeHours: 3, lateRatePct: 0.5, skills: ["PLC Automation", "HACCP", "ISO 22000", "Brewing Chemistry", "OSHA Safety"] },
  "10000000-0000-4000-8000-000000000002": { tenureMonths: 45, baseSalary: 195000, overtimeHours: 9, lateRatePct: 1.5, skills: ["Brewing Chemistry", "PLC Automation", "HACCP"] },
  "10000000-0000-4000-8000-000000000003": { tenureMonths: 42, baseSalary: 245000, overtimeHours: 14, lateRatePct: 8.5, skills: ["Fleet GPS Telemetry", "Cold Chain Logistics", "Route Optimization"] },
  "10000000-0000-4000-8000-000000000004": { tenureMonths: 35, baseSalary: 135000, overtimeHours: 4, lateRatePct: 2.0, skills: ["Fleet GPS Telemetry", "Route Optimization"] },
  "10000000-0000-4000-8000-000000000005": { tenureMonths: 50, baseSalary: 265000, overtimeHours: 5, lateRatePct: 1.0, skills: ["Trade Marketing", "Brand Strategy", "Key Account Management"] },
  "10000000-0000-4000-8000-000000000006": { tenureMonths: 25, baseSalary: 115000, overtimeHours: 19, lateRatePct: 9.0, skills: ["Digital Analytics", "Brand Strategy"] },
  "10000000-0000-4000-8000-000000000007": { tenureMonths: 55, baseSalary: 310000, overtimeHours: 6, lateRatePct: 0.5, skills: ["Kenya Employment Act", "HR Analytics", "ODPC Privacy", "Talent Acquisition"] },
  "10000000-0000-4000-8000-000000000008": { tenureMonths: 2, baseSalary: 105000, overtimeHours: 4, lateRatePct: 2.0, skills: ["Talent Acquisition", "Kenya Employment Act"] },
  "10000000-0000-4000-8000-000000000009": { tenureMonths: 38, baseSalary: 225000, overtimeHours: 8, lateRatePct: 1.5, skills: ["KRA iTax", "IFRS Reporting", "Payroll Governance"] },
  "10000000-0000-4000-8000-000000000010": { tenureMonths: 22, baseSalary: 88000, overtimeHours: 11, lateRatePct: 4.5, skills: ["Brewing Chemistry", "HACCP"] },
};

export async function buildDefaultPayloadForTask(
  task: MlTaskName,
  organizationId: string,
): Promise<Record<string, unknown>> {
  const empPayload = DEMO_EMPLOYEES_LIST.map((e) => {
    const feat = ML_EMPLOYEE_FEATURES[e.id] ?? {
      tenureMonths: 18,
      baseSalary: 140000,
      overtimeHours: 5,
      lateRatePct: 3,
      skills: [],
    };
    return {
      id: e.id,
      name: `${e.firstName} ${e.lastName}`,
      departmentName: e.departmentName,
      tenureMonths: feat.tenureMonths,
      baseSalary: feat.baseSalary,
      overtimeHours: feat.overtimeHours,
      lateRatePct: feat.lateRatePct,
      onProbation: e.status === "probation",
      contractExpiringSoon: Boolean(e.contractEndDate),
      skills: feat.skills,
    };
  });

  switch (task) {
    case "attrition":
    case "skills_gap":
      return { employees: empPayload, isDemo: true };
    case "workforce_forecast":
      return {
        isDemo: true,
        budgetedPositionsTotal: 46,
        horizonMonths: 6,
        monthlyHeadcount: [
          { month: "Oct", headcount: 8 },
          { month: "Nov", headcount: 8 },
          { month: "Dec", headcount: 9 },
          { month: "Jan", headcount: 9 },
          { month: "Feb", headcount: 10 },
          { month: "Mar", headcount: DEMO_EMPLOYEES_LIST.length },
        ],
      };
    case "payroll_anomalies": {
      const cfg = await getActiveStatutoryConfig(organizationId);
      const items = empPayload.map((e) => {
        const calc = calculateKenyaStatutoryWithConfig(e.baseSalary, 15000, 0, cfg);
        return {
          employeeName: e.name,
          grossPay: calc.grossPay,
          overtimePay: 0,
          totalDeductions: calc.totalDeductions,
          netPay: calc.netPay,
        };
      });
      return { items, isDemo: true };
    }
    case "attendance_anomalies":
      return {
        isDemo: true,
        records: [
          { id: "att_01", employeeId: "10000000-0000-4000-8000-000000000001", employeeName: "Achieng Odhiambo", departmentName: "Manufacturing & Brewing", date: "2026-03-06", clockIn: "05:52", status: "on_time", overtimeHours: 0.25 },
          { id: "att_02", employeeId: "10000000-0000-4000-8000-000000000002", employeeName: "Mwangi Kariuki", departmentName: "Manufacturing & Brewing", date: "2026-03-06", clockIn: "05:58", status: "overtime", overtimeHours: 4.5 },
          { id: "att_03", employeeId: "10000000-0000-4000-8000-000000000003", employeeName: "Juma Omondi", departmentName: "Logistics & Distribution", date: "2026-03-06", clockIn: "08:48", status: "late", overtimeHours: 0, anomalyFlag: "Late arrival: 18 minutes past shift start" },
          { id: "att_04", employeeId: "10000000-0000-4000-8000-000000000006", employeeName: "Brian Kiprotich", departmentName: "Brand & Commercial Marketing", date: "2026-03-06", clockIn: "08:29", status: "on_time", overtimeHours: 0 },
        ],
      };
    case "sentiment":
      return {
        isDemo: true,
        feedbackEntries: DEMO_LEAVE_STORE.map((l) => ({
          id: l.id,
          author: l.employeeName,
          text: l.reason,
        })).concat([
          { id: "fb_01", author: "Plant Survey", text: "Strong teamwork and safety standards on bottling line, great collaboration." },
          { id: "fb_02", author: "Logistics Feedback", text: "Overworked during peak holiday distribution with heavy overtime stress." },
        ]),
      };
    case "candidate_match":
      return {
        isDemo: true,
        jobDescription: "Senior Industrial Brewing Engineer: PLC automation, fermentation chemistry, HACCP, ISO 22000 quality audits.",
        minExperienceYears: 4,
        candidates: [
          { id: "cand_01", fullName: "Peter Ndung'u", jobTitle: "Brewing Engineer", stage: "interview", experienceYears: 6, skillsSummary: "Strong PLC automation, brewing chemistry, thermal process optimization and ISO safety audits." },
          { id: "cand_02", fullName: "Evans Kiprono", jobTitle: "Dispatch Coordinator", stage: "screening", experienceYears: 4, skillsSummary: "Fleet GPS dispatch, distributor delivery reconciliation and cold chain temperature monitoring." },
        ],
      };
    case "performance_trends":
      return {
        isDemo: true,
        goals: [
          { id: "goal_01", title: "Achieve 99.8% Brewery Batch Consistency", employeeName: "Achieng Odhiambo", progress: 85 },
          { id: "goal_02", title: "Reduce Transit Delivery Lead Times by 18%", employeeName: "Juma Omondi", progress: 70 },
          { id: "goal_03", title: "Complete Q1 KRA Statutory Audit Package", employeeName: "Dennis Otieno", progress: 92 },
        ],
      };
  }
}

// POST /api/ml/run/:task - Execute a real Python Scikit-learn / XGBoost ML task
router.post("/ml/run/:task", async (req: Request, res: Response) => {
  const task = String(req.params.task ?? "") as MlTaskName;
  const validTasks: MlTaskName[] = [
    "attrition",
    "workforce_forecast",
    "candidate_match",
    "payroll_anomalies",
    "attendance_anomalies",
    "skills_gap",
    "sentiment",
    "performance_trends",
  ];
  if (!validTasks.includes(task)) {
    res.status(400).json({ error: `Unsupported ML task '${task}'.` });
    return;
  }

  // Enforce strict role boundaries per ML model domain
  if (task === "payroll_anomalies") {
    const auth = await requireRoles(req, res, [
      PEOPLEOS_ROLES.hrAdmin,
      PEOPLEOS_ROLES.payrollOfficer,
      PEOPLEOS_ROLES.systemAdmin,
    ]);
    if (!auth) return;
  } else if (task === "attrition" || task === "sentiment" || task === "workforce_forecast") {
    const auth = await requireRoles(req, res, hrAndExecutiveRoles);
    if (!auth) return;
  } else if (task === "candidate_match") {
    const auth = await requireRoles(req, res, [
      ...hrAndExecutiveRoles,
      PEOPLEOS_ROLES.recruiter,
    ]);
    if (!auth) return;
  } else {
    const auth = await ensureMembership(req, res);
    if (!auth) return;
  }

  const membership = await ensureMembership(req, res);
  if (!membership) return;

  try {
    const incomingPayload =
      req.body && Object.keys(req.body).length > 0
        ? req.body
        : await buildDefaultPayloadForTask(task, membership.organizationId);

    const result = await runPythonMlTask(task, incomingPayload);

    await recordAuditEvent({
      organizationId: membership.organizationId,
      actorUserId: membership.userId,
      actor: membership.role,
      action: `ML_MODEL_EXECUTED_${task.toUpperCase()}`,
      targetType: "ml_model",
      targetId: task,
      summary: `Executed Python ML task '${task}' (${(result as any).analyticsMode ?? "completed"})`,
    });

    res.json(result);
  } catch (err) {
    res.status(503).json({
      error: "Python ML engine unavailable in this runtime.",
      details: err instanceof Error ? err.message : String(err),
      analyticsMode: "ENGINE_UNAVAILABLE",
    });
  }
});

// GET /api/ml/overview - Run holistic ML health & model cards across PeopleOS
router.get("/ml/overview", async (req: Request, res: Response) => {
  const membership = await requireRoles(req, res, hrAndExecutiveRoles);
  if (!membership) return;

  try {
    const [attrition, forecast, sentiment, skillsGap] = await Promise.all([
      runPythonMlTask(
        "attrition",
        await buildDefaultPayloadForTask("attrition", membership.organizationId),
      ),
      runPythonMlTask(
        "workforce_forecast",
        await buildDefaultPayloadForTask("workforce_forecast", membership.organizationId),
      ),
      runPythonMlTask(
        "sentiment",
        await buildDefaultPayloadForTask("sentiment", membership.organizationId),
      ),
      runPythonMlTask(
        "skills_gap",
        await buildDefaultPayloadForTask("skills_gap", membership.organizationId),
      ),
    ]);

    res.json({
      engine: "Python 3.14 (Scikit-learn + XGBoost)",
      generatedAt: new Date().toISOString(),
      models: { attrition, forecast, sentiment, skillsGap },
    });
  } catch (err) {
    res.status(503).json({
      error: "Python ML engine unavailable.",
      details: err instanceof Error ? err.message : String(err),
    });
  }
});

export default router;
