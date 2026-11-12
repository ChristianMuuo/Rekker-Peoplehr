import crypto from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import { Router, type IRouter, type Request, type Response } from "express";
import { db, onboardingTasksTable } from "@workspace/db";
import { recordAuditEvent } from "../lib/auditService";
import { sanitizeText } from "../lib/security";
import {
  ensureMembership,
  PEOPLEOS_ROLES,
  requireRoles,
} from "../middlewares/peopleosAccess";
import { DEMO_DEPARTMENTS_LIST, DEMO_EMPLOYEES_LIST } from "./peopleos";
import { DEMO_ASSETS } from "./assets";
import {
  createOnboardingTemplate,
  decideProbationReview,
  initiateStructuredOffboarding,
  listOnboardingTemplates,
  listProbationAndContracts,
} from "../services/lifecycleService";
import { phase2MemoryStore } from "../services/phase2MemoryStore";
import { contractRemindersTable } from "@workspace/db";

const router: IRouter = Router();

const lifecycleRoles = [
  PEOPLEOS_ROLES.hrAdmin,
  PEOPLEOS_ROLES.hrManager,
  PEOPLEOS_ROLES.systemAdmin,
  PEOPLEOS_ROLES.departmentManager,
];

interface DemoLifecycleTask {
  id: string;
  organizationId: string;
  employeeId: string;
  employeeName: string;
  workflowType: "onboarding" | "offboarding";
  title: string;
  category: string;
  assigneeRole: string;
  dueDate: string;
  completed: boolean;
  completedAt: string | null;
}

export const DEMO_LIFECYCLE_TASKS: DemoLifecycleTask[] = [
  { id: "task-01", organizationId: "rekker-demo", employeeId: "10000000-0000-4000-8000-000000000008", employeeName: "Faith Chebet", workflowType: "onboarding", title: "Collect & Verify KRA PIN, NSSF & SHIF Numbers", category: "Compliance", assigneeRole: "hr_admin", dueDate: "2026-01-20", completed: true, completedAt: "2026-01-20T10:00:00Z" },
  { id: "task-02", organizationId: "rekker-demo", employeeId: "10000000-0000-4000-8000-000000000008", employeeName: "Faith Chebet", workflowType: "onboarding", title: "Sign Employment Act §10 Contract & ODPC Privacy Notice", category: "Compliance", assigneeRole: "hr_admin", dueDate: "2026-01-22", completed: true, completedAt: "2026-01-22T14:00:00Z" },
  { id: "task-03", organizationId: "rekker-demo", employeeId: "10000000-0000-4000-8000-000000000008", employeeName: "Faith Chebet", workflowType: "onboarding", title: "Provision Corporate Laptop, Email & ERP Access", category: "IT & Assets", assigneeRole: "system_admin", dueDate: "2026-01-25", completed: true, completedAt: "2026-01-25T11:30:00Z" },
  { id: "task-04", organizationId: "rekker-demo", employeeId: "10000000-0000-4000-8000-000000000008", employeeName: "Faith Chebet", workflowType: "onboarding", title: "Complete OSHA Plant Safety & GMP Refresher", category: "Training", assigneeRole: "hr_manager", dueDate: "2026-02-15", completed: true, completedAt: "2026-02-15T16:00:00Z" },
  { id: "task-05", organizationId: "rekker-demo", employeeId: "10000000-0000-4000-8000-000000000008", employeeName: "Faith Chebet", workflowType: "onboarding", title: "Conduct 60-Day Performance & Cultural Check-in", category: "HR & Benefits", assigneeRole: "department_manager", dueDate: "2026-03-05", completed: true, completedAt: "2026-03-05T09:00:00Z" },
  { id: "task-06", organizationId: "rekker-demo", employeeId: "10000000-0000-4000-8000-000000000008", employeeName: "Faith Chebet", workflowType: "onboarding", title: "Final 90-Day Probation Assessment & Human Confirmation Signoff", category: "HR & Benefits", assigneeRole: "hr_admin", dueDate: "2026-04-15", completed: false, completedAt: null },
  { id: "task-07", organizationId: "rekker-demo", employeeId: "10000000-0000-4000-8000-000000000006", employeeName: "Brian Kiprotich", workflowType: "offboarding", title: "Fixed-Term Contract Renewal or Exit Decision Review", category: "Compliance", assigneeRole: "hr_admin", dueDate: "2026-04-15", completed: false, completedAt: null },
  { id: "task-08", organizationId: "rekker-demo", employeeId: "10000000-0000-4000-8000-000000000006", employeeName: "Brian Kiprotich", workflowType: "offboarding", title: "Asset Clearance: Recover MacBook Pro (REK-IT-058) if Exiting", category: "IT & Assets", assigneeRole: "system_admin", dueDate: "2026-04-30", completed: false, completedAt: null },
  { id: "task-09", organizationId: "rekker-demo", employeeId: "10000000-0000-4000-8000-000000000006", employeeName: "Brian Kiprotich", workflowType: "offboarding", title: "Conduct Structured Exit Interview & Final Dues / P9A Computation", category: "HR & Benefits", assigneeRole: "hr_manager", dueDate: "2026-04-30", completed: false, completedAt: null },
];

// GET /api/onboarding/tasks
router.get("/onboarding/tasks", async (req: Request, res: Response) => {
  const membership = await ensureMembership(req, res);
  if (!membership) return;

  const employeeId = req.query.employeeId as string | undefined;
  const workflowType = req.query.workflowType as string | undefined;

  if (!process.env.DATABASE_URL) {
    let items = DEMO_LIFECYCLE_TASKS.filter(
      (t) => t.organizationId === membership.organizationId,
    );
    if (membership.role === PEOPLEOS_ROLES.employee && membership.employeeId) {
      items = items.filter((t) => t.employeeId === membership.employeeId);
    }
    if (employeeId) items = items.filter((t) => t.employeeId === employeeId);
    if (workflowType) items = items.filter((t) => t.workflowType === workflowType);
    res.json({ items, total: items.length });
    return;
  }

  let items = await db
    .select()
    .from(onboardingTasksTable)
    .where(eq(onboardingTasksTable.organizationId, membership.organizationId))
    .orderBy(desc(onboardingTasksTable.createdAt));

  if (membership.role === PEOPLEOS_ROLES.employee && membership.employeeId) {
    items = items.filter((t) => t.employeeId === membership.employeeId);
  }
  if (employeeId) items = items.filter((t) => t.employeeId === employeeId);
  if (workflowType) items = items.filter((t) => t.workflowType === workflowType);

  res.json({ items, total: items.length });
});

// POST /api/onboarding/tasks
router.post("/onboarding/tasks", async (req: Request, res: Response) => {
  const membership = await requireRoles(req, res, lifecycleRoles);
  if (!membership) return;

  const { employeeId, workflowType = "onboarding", title, category = "Compliance", dueDate } =
    req.body ?? {};
  const cleanTitle = sanitizeText(title, 180);
  if (!cleanTitle || !employeeId) {
    res.status(400).json({ error: "employeeId and title are required." });
    return;
  }

  const wf = workflowType === "offboarding" ? "offboarding" : "onboarding";
  const emp = DEMO_EMPLOYEES_LIST.find((e) => e.id === employeeId);
  const cleanDue = String(dueDate || new Date().toISOString().slice(0, 10)).slice(0, 10);

  if (!process.env.DATABASE_URL) {
    const newTask: DemoLifecycleTask = {
      id: `task-${crypto.randomUUID().slice(0, 8)}`,
      organizationId: membership.organizationId,
      employeeId: String(employeeId),
      employeeName: emp ? `${emp.firstName} ${emp.lastName}` : "Teammate",
      workflowType: wf,
      title: cleanTitle,
      category: sanitizeText(category, 60),
      assigneeRole: "hr_admin",
      dueDate: cleanDue,
      completed: false,
      completedAt: null,
    };
    DEMO_LIFECYCLE_TASKS.unshift(newTask);
    await recordAuditEvent({
      organizationId: membership.organizationId,
      actorUserId: membership.userId,
      actor: membership.role,
      action: `${wf.toUpperCase()}_TASK_CREATED`,
      targetType: "onboarding_task",
      targetId: newTask.id,
      summary: `Created ${wf} task "${cleanTitle}" for ${newTask.employeeName}.`,
      isDemo: true,
    });
    res.status(201).json(newTask);
    return;
  }

  const [created] = await db
    .insert(onboardingTasksTable)
    .values({
      organizationId: membership.organizationId,
      employeeId: String(employeeId),
      workflowType: wf,
      title: cleanTitle,
      category: sanitizeText(category, 60),
      assigneeRole: "hr_admin",
      dueDate: cleanDue,
      completed: false,
    })
    .returning();

  await recordAuditEvent({
    organizationId: membership.organizationId,
    actorUserId: membership.userId,
    actor: membership.role,
    action: `${wf.toUpperCase()}_TASK_CREATED`,
    targetType: "onboarding_task",
    targetId: created!.id,
    summary: `Created ${wf} task "${cleanTitle}".`,
  });

  res.status(201).json(created);
});

// PATCH /api/onboarding/tasks/:taskId/toggle
router.patch(
  "/onboarding/tasks/:taskId/toggle",
  async (req: Request, res: Response) => {
    const membership = await ensureMembership(req, res);
    if (!membership) return;

    const taskId = String(req.params.taskId ?? "");

    if (!process.env.DATABASE_URL) {
      const task = DEMO_LIFECYCLE_TASKS.find(
        (t) =>
          t.id === taskId && t.organizationId === membership.organizationId,
      );
      if (!task) {
        res.status(404).json({ error: "Lifecycle task not found." });
        return;
      }
      if (
        membership.role === PEOPLEOS_ROLES.employee &&
        membership.employeeId !== task.employeeId
      ) {
        res.status(403).json({ error: "Cannot toggle another teammate's task." });
        return;
      }
      task.completed = !task.completed;
      task.completedAt = task.completed ? new Date().toISOString() : null;
      await recordAuditEvent({
        organizationId: membership.organizationId,
        actorUserId: membership.userId,
        actor: membership.role,
        action: task.completed ? "LIFECYCLE_TASK_COMPLETED" : "LIFECYCLE_TASK_REOPENED",
        targetType: "onboarding_task",
        targetId: task.id,
        summary: `${task.title} marked ${task.completed ? "completed" : "pending"}.`,
        isDemo: true,
      });
      res.json(task);
      return;
    }

    const [existing] = await db
      .select()
      .from(onboardingTasksTable)
      .where(
        and(
          eq(onboardingTasksTable.id, taskId),
          eq(onboardingTasksTable.organizationId, membership.organizationId),
        ),
      )
      .limit(1);

    if (!existing) {
      res.status(404).json({ error: "Lifecycle task not found." });
      return;
    }
    const nextCompleted = !existing.completed;
    const [updated] = await db
      .update(onboardingTasksTable)
      .set({
        completed: nextCompleted,
        completedAt: nextCompleted ? new Date() : null,
      })
      .where(eq(onboardingTasksTable.id, existing.id))
      .returning();

    res.json(updated);
  },
);

// ─── Workstream E: Onboarding Templates, Probation Reviews, Contract Reminders & Offboarding ──

router.get("/onboarding/templates", async (req: Request, res: Response) => {
  const membership = await ensureMembership(req, res);
  if (!membership) return;

  const items = await listOnboardingTemplates(membership.organizationId);
  res.json({ items });
});

router.post("/onboarding/templates", async (req: Request, res: Response) => {
  const membership = await requireRoles(req, res, lifecycleRoles);
  if (!membership) return;

  const { name, workflowType = "onboarding", departmentCode, employmentType, tasks } =
    req.body ?? {};
  if (!name || !Array.isArray(tasks) || tasks.length === 0) {
    res.status(400).json({ error: "Template name and non-empty tasks array are required." });
    return;
  }

  const created = await createOnboardingTemplate({
    organizationId: membership.organizationId,
    actorUserId: membership.userId,
    name: sanitizeText(name, 140),
    workflowType: workflowType === "offboarding" ? "offboarding" : "onboarding",
    departmentCode: departmentCode ? sanitizeText(departmentCode, 30) : null,
    employmentType: employmentType ? sanitizeText(employmentType, 30) : null,
    tasks: tasks.map((t: any) => ({
      title: sanitizeText(t.title, 180),
      category: sanitizeText(t.category || "Compliance", 60),
      assigneeRole: sanitizeText(t.assigneeRole || "hr_admin", 40),
      dueOffsetDays: Math.max(1, Number(t.dueOffsetDays) || 5),
    })),
  });
  res.status(201).json(created);
});

router.get("/onboarding/probation-and-contracts", async (req: Request, res: Response) => {
  const membership = await ensureMembership(req, res);
  if (!membership) return;

  const data = await listProbationAndContracts(
    membership.organizationId,
    DEMO_EMPLOYEES_LIST,
  );
  res.json(data);
});

router.post(
  "/onboarding/probation-reviews/:reviewId/decide",
  async (req: Request, res: Response) => {
    const membership = await requireRoles(req, res, lifecycleRoles);
    if (!membership) return;

    const { decision, extendedUntilDate, notes } = req.body ?? {};
    if (!["confirm", "extend", "do_not_confirm"].includes(decision) || !notes) {
      res.status(400).json({
        error: "decision ('confirm' | 'extend' | 'do_not_confirm') and notes are required.",
      });
      return;
    }

    const result = await decideProbationReview({
      organizationId: membership.organizationId,
      actorUserId: membership.userId,
      actorName: membership.role,
      reviewId: String(req.params.reviewId ?? ""),
      decision,
      extendedUntilDate,
      notes: sanitizeText(notes, 400),
      demoEmployees: DEMO_EMPLOYEES_LIST,
      demoDepartments: DEMO_DEPARTMENTS_LIST,
    });
    if (!result.ok) {
      res.status(result.statusCode).json({ error: result.error });
      return;
    }
    res.json(result);
  },
);

router.post(
  "/onboarding/contract-reminders/:reminderId/action",
  async (req: Request, res: Response) => {
    const membership = await requireRoles(req, res, lifecycleRoles);
    if (!membership) return;

    const reminderId = String(req.params.reminderId ?? "");
    const { actionTaken, notes } = req.body ?? {};
    if (!actionTaken || typeof actionTaken !== "string") {
      res.status(400).json({ error: "actionTaken is required." });
      return;
    }

    if (process.env.DATABASE_URL) {
      const [updated] = await db
        .update(contractRemindersTable)
        .set({
          status: "reviewed",
          actionTaken: sanitizeText(actionTaken, 80),
          notes: sanitizeText(notes || "", 400),
          handledByUserId: membership.userId,
          handledAt: new Date(),
        })
        .where(
          and(
            eq(contractRemindersTable.id, reminderId),
            eq(contractRemindersTable.organizationId, membership.organizationId),
          ),
        )
        .returning();
      if (!updated) {
        res.status(404).json({ error: "Contract reminder not found." });
        return;
      }
      res.json(updated);
      return;
    }

    const item = phase2MemoryStore.contractReminders.find(
      (c) => c.id === reminderId && c.organizationId === membership.organizationId,
    );
    if (!item) {
      res.status(404).json({ error: "Contract reminder not found." });
      return;
    }
    item.status = "reviewed";
    item.actionTaken = sanitizeText(actionTaken, 80);
    item.notes = sanitizeText(notes || "", 400);
    item.handledByUserId = membership.userId;
    item.handledAt = new Date();
    res.json(item);
  },
);

router.post("/onboarding/offboard", async (req: Request, res: Response) => {
  const membership = await requireRoles(req, res, [
    PEOPLEOS_ROLES.hrAdmin,
    PEOPLEOS_ROLES.hrManager,
    PEOPLEOS_ROLES.systemAdmin,
  ]);
  if (!membership) return;

  const { employeeId, effectiveDate, reason, onboardingTemplateId } = req.body ?? {};
  if (!employeeId || !effectiveDate || !reason) {
    res.status(400).json({
      error: "employeeId, effectiveDate (YYYY-MM-DD), and reason are required.",
    });
    return;
  }

  try {
    const result = await initiateStructuredOffboarding({
      organizationId: membership.organizationId,
      actorUserId: membership.userId,
      actorName: membership.role,
      employeeId: String(employeeId),
      effectiveDate: String(effectiveDate).slice(0, 10),
      reason: sanitizeText(reason, 400),
      onboardingTemplateId: onboardingTemplateId ?? null,
      demoEmployees: DEMO_EMPLOYEES_LIST,
      demoDepartments: DEMO_DEPARTMENTS_LIST,
      demoOnboardingTasks: DEMO_LIFECYCLE_TASKS,
      demoAssets: DEMO_ASSETS,
    });
    res.status(201).json(result);
  } catch (err) {
    res.status(400).json({
      error: err instanceof Error ? err.message : "Offboarding failed.",
    });
  }
});

export default router;

