import { Router, type IRouter, type Request, type Response } from "express";
import {
  ensureMembership,
  requireRoles,
  PEOPLEOS_ROLES,
} from "../middlewares/peopleosAccess";

const router: IRouter = Router();

let GOALS = [
  {
    id: "goal_01",
    employeeId: "10000000-0000-4000-8000-000000000001",
    employeeName: "Achieng Odhiambo",
    title: "Achieve 99.8% Brewery Batch Consistency & Zero Waste Spill",
    description: "Maintain strict temperature & pressure controls to prevent batch variations across Nairobi plant fermentation vats.",
    category: "Quality",
    targetDate: "2026-06-30",
    progress: 85,
    status: "in_progress",
  },
  {
    id: "goal_02",
    employeeId: "10000000-0000-4000-8000-000000000003",
    employeeName: "Juma Omondi",
    title: "Reduce Regional Transit Delivery Lead Times by 18%",
    description: "Implement automated route dispatching and real-time distributor unloading window tracking.",
    category: "Operational",
    targetDate: "2026-05-15",
    progress: 70,
    status: "in_progress",
  },
];

// GET /api/performance/goals
router.get("/performance/goals", async (req: Request, res: Response) => {
  const membership = await ensureMembership(req, res);
  if (!membership) return;

  const empId = req.query.employeeId as string;
  const filtered = empId ? GOALS.filter((g) => g.employeeId === empId) : GOALS;
  res.json({ items: filtered, total: filtered.length });
});

// POST /api/performance/goals
router.post("/performance/goals", async (req: Request, res: Response) => {
  const membership = await ensureMembership(req, res);
  if (!membership) return;

  const { title, description, category, targetDate, employeeId } = req.body;
  if (!title) {
    res.status(400).json({ error: "Goal title is required." });
    return;
  }

  const newGoal = {
    id: `goal_${Date.now()}`,
    employeeId: employeeId || "10000000-0000-4000-8000-000000000007",
    employeeName: "David Kibet",
    title,
    description: description || "Achieve operational key result.",
    category: category || "Operational",
    targetDate: targetDate || "2026-06-30",
    progress: 0,
    status: "in_progress",
  };

  GOALS.unshift(newGoal);
  res.status(201).json(newGoal);
});

// PATCH /api/performance/goals/:id/progress
router.patch("/performance/goals/:id/progress", async (req: Request, res: Response) => {
  const membership = await ensureMembership(req, res);
  if (!membership) return;

  const { id } = req.params;
  const { progress } = req.body;

  const goal = GOALS.find((g) => g.id === id);
  if (!goal) {
    res.status(404).json({ error: "Goal not found." });
    return;
  }

  goal.progress = Number(progress) || 0;
  goal.status = goal.progress >= 100 ? "completed" : goal.progress < 40 ? "behind" : "in_progress";
  res.json(goal);
});

export default router;

