import crypto from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import { Router, type IRouter, type Request, type Response } from "express";
import { db, expensesTable } from "@workspace/db";
import { recordAuditEvent } from "../lib/auditService";
import { sanitizeText } from "../lib/security";
import {
  ensureMembership,
  PEOPLEOS_ROLES,
  requireRoles,
} from "../middlewares/peopleosAccess";
import { DEMO_EMPLOYEES_LIST } from "./peopleos";

const router: IRouter = Router();

const approverRoles = [
  PEOPLEOS_ROLES.hrAdmin,
  PEOPLEOS_ROLES.hrManager,
  PEOPLEOS_ROLES.systemAdmin,
  PEOPLEOS_ROLES.payrollOfficer,
  PEOPLEOS_ROLES.departmentManager,
];

interface DemoExpense {
  id: string;
  organizationId: string;
  employeeId: string;
  employeeName: string;
  title: string;
  category: string;
  amountKes: number;
  incurredDate: string;
  receiptReference: string | null;
  notes: string | null;
  status: "pending" | "approved" | "rejected" | "reimbursed";
  approverUserId: string | null;
  decisionComment: string | null;
  decidedAt: string | null;
  createdAt: string;
}

const DEMO_EXPENSES: DemoExpense[] = [
  {
    id: "exp-001",
    organizationId: "rekker-demo",
    employeeId: "10000000-0000-4000-8000-000000000003",
    employeeName: "Juma Omondi",
    title: "Nakuru Cold-Chain Distributor Audit Travel & Fuel",
    category: "Travel & Fleet",
    amountKes: 14800,
    incurredDate: "2026-03-04",
    receiptReference: "KRA-ETR-991827",
    notes: "Overnight route audit across Nakuru & Naivasha hubs.",
    status: "pending",
    approverUserId: null,
    decisionComment: null,
    decidedAt: null,
    createdAt: "2026-03-04T15:10:00.000Z",
  },
  {
    id: "exp-002",
    organizationId: "rekker-demo",
    employeeId: "10000000-0000-4000-8000-000000000005",
    employeeName: "Brenda Mutheu",
    title: "Trade Activation POS Display Print Materials",
    category: "Commercial Marketing",
    amountKes: 28500,
    incurredDate: "2026-02-27",
    receiptReference: "INV-2026-441",
    notes: "Nairobi Westlands retail distributor launch kits.",
    status: "approved",
    approverUserId: "user_demo_admin_01",
    decisionComment: "Approved within Q1 brand activation budget.",
    decidedAt: "2026-02-28T10:20:00.000Z",
    createdAt: "2026-02-27T11:00:00.000Z",
  },
];

// GET /api/expenses
router.get("/expenses", async (req: Request, res: Response) => {
  const membership = await ensureMembership(req, res);
  if (!membership) return;

  const isPrivileged = approverRoles.includes(membership.role as any);

  if (!process.env.DATABASE_URL) {
    let items = DEMO_EXPENSES.filter(
      (e) => e.organizationId === membership.organizationId,
    );
    if (!isPrivileged && membership.employeeId) {
      items = items.filter((e) => e.employeeId === membership.employeeId);
    }
    res.json({ items, total: items.length });
    return;
  }

  const rows = await db
    .select()
    .from(expensesTable)
    .where(eq(expensesTable.organizationId, membership.organizationId))
    .orderBy(desc(expensesTable.createdAt));

  const filtered =
    !isPrivileged && membership.employeeId
      ? rows.filter((r) => r.employeeId === membership.employeeId)
      : rows;

  res.json({ items: filtered, total: filtered.length });
});

// POST /api/expenses
router.post("/expenses", async (req: Request, res: Response) => {
  const membership = await ensureMembership(req, res);
  if (!membership) return;

  const { title, category, amountKes, incurredDate, receiptReference, notes, employeeId } =
    req.body ?? {};
  const cleanTitle = sanitizeText(title, 180);
  const cleanCategory = sanitizeText(category || "Operations", 80);
  const amount = Math.round(Number(amountKes));

  if (!cleanTitle || !Number.isFinite(amount) || amount <= 0) {
    res.status(400).json({ error: "Expense title and positive amountKes are required." });
    return;
  }

  const targetEmpId =
    approverRoles.includes(membership.role as any) && employeeId
      ? String(employeeId)
      : membership.employeeId || "10000000-0000-4000-8000-000000000007";

  const emp = DEMO_EMPLOYEES_LIST.find((e) => e.id === targetEmpId);
  const empName = emp ? `${emp.firstName} ${emp.lastName}` : "Teammate";

  if (!process.env.DATABASE_URL) {
    const newExp: DemoExpense = {
      id: `exp-${crypto.randomUUID().slice(0, 8)}`,
      organizationId: membership.organizationId,
      employeeId: targetEmpId,
      employeeName: empName,
      title: cleanTitle,
      category: cleanCategory,
      amountKes: amount,
      incurredDate: String(incurredDate || new Date().toISOString().slice(0, 10)).slice(0, 10),
      receiptReference: receiptReference ? sanitizeText(receiptReference, 80) : null,
      notes: notes ? sanitizeText(notes, 400) : null,
      status: "pending",
      approverUserId: null,
      decisionComment: null,
      decidedAt: null,
      createdAt: new Date().toISOString(),
    };
    DEMO_EXPENSES.unshift(newExp);
    await recordAuditEvent({
      organizationId: membership.organizationId,
      actorUserId: membership.userId,
      actor: membership.role,
      action: "EXPENSE_SUBMITTED",
      targetType: "expense",
      targetId: newExp.id,
      summary: `Expense claim "${cleanTitle}" (KES ${amount.toLocaleString()}) submitted.`,
      isDemo: true,
    });
    res.status(201).json(newExp);
    return;
  }

  const [created] = await db
    .insert(expensesTable)
    .values({
      organizationId: membership.organizationId,
      employeeId: targetEmpId,
      title: cleanTitle,
      category: cleanCategory,
      amountKes: amount,
      incurredDate: String(incurredDate || new Date().toISOString().slice(0, 10)).slice(0, 10),
      receiptReference: receiptReference ? sanitizeText(receiptReference, 80) : null,
      notes: notes ? sanitizeText(notes, 400) : null,
      status: "pending",
    })
    .returning();

  await recordAuditEvent({
    organizationId: membership.organizationId,
    actorUserId: membership.userId,
    actor: membership.role,
    action: "EXPENSE_SUBMITTED",
    targetType: "expense",
    targetId: created!.id,
    summary: `Expense claim "${cleanTitle}" (KES ${amount.toLocaleString()}) submitted.`,
  });

  res.status(201).json(created);
});

// POST /api/expenses/:expenseId/decision
router.post("/expenses/:expenseId/decision", async (req: Request, res: Response) => {
  const membership = await requireRoles(req, res, approverRoles);
  if (!membership) return;

  const expenseId = String(req.params.expenseId ?? "");
  const { decision, comment } = req.body ?? {};
  if (!["approve", "reject", "reimburse"].includes(decision)) {
    res.status(400).json({ error: "Decision must be approve, reject, or reimburse." });
    return;
  }
  const nextStatus =
    decision === "approve"
      ? "approved"
      : decision === "reimburse"
        ? "reimbursed"
        : "rejected";

  if (!process.env.DATABASE_URL) {
    const item = DEMO_EXPENSES.find(
      (e) =>
        e.id === expenseId && e.organizationId === membership.organizationId,
    );
    if (!item) {
      res.status(404).json({ error: "Expense claim not found." });
      return;
    }
    item.status = nextStatus;
    item.approverUserId = membership.userId;
    item.decisionComment = comment ? sanitizeText(comment, 240) : null;
    item.decidedAt = new Date().toISOString();
    await recordAuditEvent({
      organizationId: membership.organizationId,
      actorUserId: membership.userId,
      actor: membership.role,
      action: `EXPENSE_${nextStatus.toUpperCase()}`,
      targetType: "expense",
      targetId: item.id,
      summary: `Expense "${item.title}" marked ${nextStatus}.`,
      isDemo: true,
    });
    res.json(item);
    return;
  }

  const [updated] = await db
    .update(expensesTable)
    .set({
      status: nextStatus,
      approverUserId: membership.userId,
      decisionComment: comment ? sanitizeText(comment, 240) : null,
      decidedAt: new Date(),
    })
    .where(
      and(
        eq(expensesTable.id, expenseId),
        eq(expensesTable.organizationId, membership.organizationId),
      ),
    )
    .returning();

  if (!updated) {
    res.status(404).json({ error: "Expense claim not found." });
    return;
  }

  await recordAuditEvent({
    organizationId: membership.organizationId,
    actorUserId: membership.userId,
    actor: membership.role,
    action: `EXPENSE_${nextStatus.toUpperCase()}`,
    targetType: "expense",
    targetId: updated.id,
    summary: `Expense "${updated.title}" marked ${nextStatus}.`,
  });

  res.json(updated);
});

export default router;

