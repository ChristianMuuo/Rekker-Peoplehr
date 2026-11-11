import crypto from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import { Router, type IRouter, type Request, type Response } from "express";
import { db, goalsTable } from "@workspace/db";
import { recordAuditEvent } from "../lib/auditService";
import { sanitizeText } from "../lib/security";
import { ensureMembership, PEOPLEOS_ROLES } from "../middlewares/peopleosAccess";
import { DEMO_EMPLOYEES_LIST } from "./peopleos";

const router: IRouter = Router();

let GOALS = [
  {
    id: "goal_01",
    organizationId: "rekker-demo",
    employeeId: "10000000-0000-4000-8000-000000000001",
    employeeName: "Achieng Odhiambo",
    title: "Achieve 99.8% Batch Consistency & Zero Material Waste",
    description:
      "Maintain strict formulation viscosity, filling tolerance, and batch-level quality checks across Nairobi production lines.",
    category: "Quality",
    targetDate: "2026-06-30",
    progress: 85,
    status: "in_progress",
  },
  {
    id: "goal_02",
    organizationId: "rekker-demo",
    employeeId: "10000000-0000-4000-8000-000000000003",
    employeeName: "Juma Omondi",
    title: "Reduce Regional Transit Delivery Lead Times by 18%",
    description:
      "Implement automated route dispatching and real-time distributor unloading window tracking.",
    category: "Operational",
    targetDate: "2026-05-15",
    progress: 70,
    status: "in_progress",
  },
  {
    id: "goal_03",
    organizationId: "rekker-demo",
    employeeId: "10000000-0000-4000-8000-000000000009",
    employeeName: "Dennis Otieno",
    title: "100% On-Time Monthly KRA, SHIF, NSSF & AHL Statutory Returns",
    description:
      "Complete automated reconciliation by the 5th and iTax submission before the 9th of every month.",
    category: "Compliance",
    targetDate: "2026-12-31",
    progress: 95,
    status: "in_progress",
  },
];

// GET /api/performance/goals
router.get("/performance/goals", async (req: Request, res: Response) => {
  const membership = await ensureMembership(req, res);
  if (!membership) return;

  const empId = req.query.employeeId as string | undefined;

  if (!process.env.DATABASE_URL) {
    let items = GOALS.filter((g) => g.organizationId === membership.organizationId);
    if (membership.role === PEOPLEOS_ROLES.employee && membership.employeeId) {
      items = items.filter((g) => g.employeeId === membership.employeeId);
    }
    if (empId) items = items.filter((g) => g.employeeId === empId);
    res.json({ items, total: items.length });
    return;
  }

  let items = await db
    .select()
    .from(goalsTable)
    .where(eq(goalsTable.organizationId, membership.organizationId))
    .orderBy(desc(goalsTable.createdAt));

  if (empId) items = items.filter((g) => g.employeeId === empId);
  res.json({ items, total: items.length });
});

// POST /api/performance/goals
router.post("/performance/goals", async (req: Request, res: Response) => {
  const membership = await ensureMembership(req, res);
  if (!membership) return;

  const { title, description, category, targetDate, employeeId } = req.body ?? {};
  const cleanTitle = sanitizeText(title, 180);
  if (!cleanTitle) {
    res.status(400).json({ error: "Goal title is required." });
    return;
  }

  const targetEmpId =
    employeeId || membership.employeeId || "10000000-0000-4000-8000-000000000007";
  const emp = DEMO_EMPLOYEES_LIST.find((e) => e.id === targetEmpId);

  const newGoal = {
    id: `goal_${crypto.randomUUID().slice(0, 8)}`,
    organizationId: membership.organizationId,
    employeeId: String(targetEmpId),
    employeeName: emp ? `${emp.firstName} ${emp.lastName}` : "Teammate",
    title: cleanTitle,
    description: sanitizeText(description || "Achieve operational key result.", 500),
    category: sanitizeText(category || "Operational", 60),
    targetDate: String(targetDate || "2026-06-30").slice(0, 10),
    progress: 0,
    status: "in_progress",
  };

  if (!process.env.DATABASE_URL) {
    GOALS.unshift(newGoal);
  } else {
    const [created] = await db
      .insert(goalsTable)
      .values({
        organizationId: membership.organizationId,
        employeeId: newGoal.employeeId,
        title: newGoal.title,
        description: newGoal.description,
        category: newGoal.category,
        targetDate: newGoal.targetDate,
        progress: 0,
        status: "in_progress",
      })
      .returning();
    newGoal.id = created!.id;
  }

  await recordAuditEvent({
    organizationId: membership.organizationId,
    actorUserId: membership.userId,
    actor: membership.role,
    action: "PERFORMANCE_GOAL_CREATED",
    targetType: "goal",
    targetId: newGoal.id,
    summary: `Created OKR goal "${newGoal.title}" for ${newGoal.employeeName}.`,
  });

  res.status(201).json(newGoal);
});

// PATCH /api/performance/goals/:id/progress
router.patch(
  "/performance/goals/:id/progress",
  async (req: Request, res: Response) => {
    const membership = await ensureMembership(req, res);
    if (!membership) return;

    const id = String(req.params.id ?? "");
    const progress = Math.max(0, Math.min(100, Math.round(Number(req.body?.progress) || 0)));
    const nextStatus =
      progress >= 100 ? "completed" : progress < 40 ? "behind" : "in_progress";

    if (!process.env.DATABASE_URL) {
      const goal = GOALS.find(
        (g) => g.id === id && g.organizationId === membership.organizationId,
      );
      if (!goal) {
        res.status(404).json({ error: "Goal not found." });
        return;
      }
      goal.progress = progress;
      goal.status = nextStatus;
      res.json(goal);
      return;
    }

    const [updated] = await db
      .update(goalsTable)
      .set({ progress, status: nextStatus })
      .where(
        and(
          eq(goalsTable.id, id),
          eq(goalsTable.organizationId, membership.organizationId),
        ),
      )
      .returning();

    if (!updated) {
      res.status(404).json({ error: "Goal not found." });
      return;
    }
    res.json(updated);
  },
);

export default router;
