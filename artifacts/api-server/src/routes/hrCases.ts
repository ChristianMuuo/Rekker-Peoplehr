import crypto from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import { Router, type IRouter, type Request, type Response } from "express";
import { db, hrCasesTable } from "@workspace/db";
import { recordAuditEvent } from "../lib/auditService";
import { sanitizeText } from "../lib/security";
import {
  ensureMembership,
  PEOPLEOS_ROLES,
  requireRoles,
} from "../middlewares/peopleosAccess";

const router: IRouter = Router();

export const HR_CASE_OFFICERS: readonly string[] = [
  PEOPLEOS_ROLES.hrAdmin,
  PEOPLEOS_ROLES.hrDirector,
  PEOPLEOS_ROLES.hrManager,
  PEOPLEOS_ROLES.systemAdmin,
];

interface DemoHrCase {
  id: string;
  organizationId: string;
  caseNumber: string;
  subjectEmployeeId: string | null;
  submittedByUserId: string;
  category: "grievance" | "disciplinary" | "workplace_query" | "policy_breach";
  severity: "low" | "medium" | "high" | "critical";
  title: string;
  description: string;
  confidentialNotes: string;
  assignedInvestigatorUserId: string | null;
  status: "open" | "investigating" | "escalated" | "resolved" | "closed";
  resolutionSummary: string | null;
  createdAt: string;
  updatedAt: string;
}

const DEMO_HR_CASES = new Map<string, DemoHrCase[]>();

function ensureHrCasesSeeded(orgId: string) {
  if (!DEMO_HR_CASES.has(orgId)) {
    DEMO_HR_CASES.set(orgId, [
      {
        id: "hrc-001",
        organizationId: orgId,
        caseNumber: "HRC-2026-001",
        subjectEmployeeId: "10000000-0000-4000-8000-000000000006",
        submittedByUserId: "user_demo_admin_01",
        category: "workplace_query",
        severity: "low",
        title: "Fixed-Term Contract Renewal Clarification",
        description: "Review timeline and statutory gratuity query ahead of 30 April contract end.",
        confidentialNotes: "HR Director noted positive KPI attainment; renewal addendum drafted.",
        assignedInvestigatorUserId: "user_demo_admin_01",
        status: "investigating",
        resolutionSummary: null,
        createdAt: "2026-03-01T09:30:00Z",
        updatedAt: "2026-03-04T11:00:00Z",
      },
    ]);
  }
}

function redactForEmployee(c: DemoHrCase, requesterUserId: string) {
  return {
    id: c.id,
    caseNumber: c.caseNumber,
    category: c.category,
    severity: c.severity,
    title: c.title,
    description: c.submittedByUserId === requesterUserId ? c.description : "[RESTRICTED]",
    confidentialNotes: null, // Strictly hidden from non-HR roles
    assignedInvestigatorUserId: null,
    status: c.status,
    resolutionSummary: c.resolutionSummary,
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
  };
}

// GET /api/hr-cases — Strictly confidential firewall
router.get("/hr-cases", async (req: Request, res: Response) => {
  const membership = await ensureMembership(req, res);
  if (!membership) return;

  const isOfficer = HR_CASE_OFFICERS.includes(membership.role);
  const isSelfEmployee = membership.role === PEOPLEOS_ROLES.employee;

  // Non-HR managers/supervisors/recruiters/payroll CANNOT browse other employees' confidential HR cases
  if (!isOfficer && !isSelfEmployee) {
    res.status(403).json({
      error: "Confidential HR Case access denied. Only HR Case Officers or submitting employees may access permitted records.",
    });
    return;
  }

  if (!process.env.DATABASE_URL) {
    ensureHrCasesSeeded(membership.organizationId);
    const list = DEMO_HR_CASES.get(membership.organizationId)!;
    if (isOfficer) {
      res.json({
        items: list,
        total: list.length,
        accessScope: "HR_CASE_OFFICER_FULL",
      });
      return;
    }

    // Employee sees ONLY their own submitted cases, with confidential investigation notes scrubbed
    const own = list
      .filter((c) => c.submittedByUserId === membership.userId)
      .map((c) => redactForEmployee(c, membership.userId));
    res.json({
      items: own,
      total: own.length,
      accessScope: "EMPLOYEE_SELF_REDACTED",
    });
    return;
  }

  const rows = isOfficer
    ? await db
        .select()
        .from(hrCasesTable)
        .where(eq(hrCasesTable.organizationId, membership.organizationId))
        .orderBy(desc(hrCasesTable.createdAt))
    : await db
        .select()
        .from(hrCasesTable)
        .where(
          and(
            eq(hrCasesTable.organizationId, membership.organizationId),
            eq(hrCasesTable.submittedByUserId, membership.userId),
          ),
        )
        .orderBy(desc(hrCasesTable.createdAt));

  res.json({
    items: rows.map((r) =>
      isOfficer
        ? r
        : {
            id: r.id,
            caseNumber: r.caseNumber,
            category: r.category,
            severity: r.severity,
            title: r.title,
            description: r.description,
            confidentialNotes: null,
            status: r.status,
            resolutionSummary: r.resolutionSummary,
            createdAt: r.createdAt,
            updatedAt: r.updatedAt,
          },
    ),
    total: rows.length,
    accessScope: isOfficer ? "HR_CASE_OFFICER_FULL" : "EMPLOYEE_SELF_REDACTED",
  });
});

// GET /api/hr-cases/summary — Anonymized analytics summary (no employee identifiers)
router.get("/hr-cases/summary", async (req: Request, res: Response) => {
  const membership = await requireRoles(req, res, [
    ...HR_CASE_OFFICERS,
    PEOPLEOS_ROLES.executive,
    PEOPLEOS_ROLES.auditor,
  ]);
  if (!membership) return;

  ensureHrCasesSeeded(membership.organizationId);
  const rows = !process.env.DATABASE_URL
    ? DEMO_HR_CASES.get(membership.organizationId)!
    : await db
        .select()
        .from(hrCasesTable)
        .where(eq(hrCasesTable.organizationId, membership.organizationId));

  const byCategory: Record<string, number> = {};
  const byStatus: Record<string, number> = {};
  for (const r of rows) {
    byCategory[r.category] = (byCategory[r.category] ?? 0) + 1;
    byStatus[r.status] = (byStatus[r.status] ?? 0) + 1;
  }

  res.json({
    anonymized: true,
    totalCases: rows.length,
    openOrInvestigating: (byStatus.open ?? 0) + (byStatus.investigating ?? 0),
    byCategory,
    byStatus,
  });
});

// POST /api/hr-cases — Submit grievance, HR query, or confidential case
router.post("/hr-cases", async (req: Request, res: Response) => {
  const membership = await ensureMembership(req, res);
  if (!membership) return;

  const title = sanitizeText(req.body?.title, 180);
  const description = sanitizeText(req.body?.description, 2500);
  const category = sanitizeText(req.body?.category || "grievance", 40) as DemoHrCase["category"];
  const severity = sanitizeText(req.body?.severity || "medium", 20) as DemoHrCase["severity"];
  const validCats = ["grievance", "disciplinary", "workplace_query", "policy_breach"];
  if (!title || description.length < 10 || !validCats.includes(category)) {
    res.status(400).json({ error: "Case title, valid category, and details (min 10 chars) are required." });
    return;
  }

  const isOfficer = HR_CASE_OFFICERS.includes(membership.role);
  const subjectEmployeeId = isOfficer && req.body?.subjectEmployeeId
    ? sanitizeText(req.body.subjectEmployeeId, 64)
    : membership.employeeId ?? null;
  const confidentialNotes = isOfficer ? sanitizeText(req.body?.confidentialNotes, 2000) : "";

  const caseNumber = `HRC-${new Date().getFullYear()}-${crypto.randomBytes(2).toString("hex").toUpperCase()}`;
  const nowIso = new Date().toISOString();

  if (!process.env.DATABASE_URL) {
    ensureHrCasesSeeded(membership.organizationId);
    const created: DemoHrCase = {
      id: crypto.randomUUID(),
      organizationId: membership.organizationId,
      caseNumber,
      subjectEmployeeId,
      submittedByUserId: membership.userId,
      category,
      severity,
      title,
      description,
      confidentialNotes,
      assignedInvestigatorUserId: null,
      status: "open",
      resolutionSummary: null,
      createdAt: nowIso,
      updatedAt: nowIso,
    };
    DEMO_HR_CASES.get(membership.organizationId)!.unshift(created);
    await recordAuditEvent({
      organizationId: membership.organizationId,
      actorUserId: membership.userId,
      actor: membership.role,
      action: "HR_CASE_OPENED",
      targetType: "hr_case",
      targetId: created.id,
      summary: `Confidential HR case ${caseNumber} opened (${category})`,
      critical: true,
      isDemo: true,
    });
    res.status(201).json(isOfficer ? created : redactForEmployee(created, membership.userId));
    return;
  }

  const created = await db.transaction(async (tx) => {
    const [row] = await tx
      .insert(hrCasesTable)
      .values({
        organizationId: membership.organizationId,
        caseNumber,
        subjectEmployeeId,
        submittedByUserId: membership.userId,
        category,
        severity,
        title,
        description,
        confidentialNotes,
        status: "open",
      })
      .returning();

    await recordAuditEvent({
      organizationId: membership.organizationId,
      actorUserId: membership.userId,
      actor: membership.role,
      action: "HR_CASE_OPENED",
      targetType: "hr_case",
      targetId: row?.id ?? caseNumber,
      summary: `Confidential HR case ${caseNumber} opened (${category})`,
      critical: true,
      tx,
    });

    return row!;
  });

  res.status(201).json(
    isOfficer
      ? created
      : {
          id: created.id,
          caseNumber: created.caseNumber,
          category: created.category,
          severity: created.severity,
          title: created.title,
          description: created.description,
          confidentialNotes: null,
          assignedInvestigatorUserId: null,
          status: created.status,
          resolutionSummary: created.resolutionSummary,
          createdAt: created.createdAt,
          updatedAt: created.updatedAt,
        },
  );
});

// GET /api/hr-cases/:id — Strict access boundary per case
router.get("/hr-cases/:id", async (req: Request, res: Response) => {
  const membership = await ensureMembership(req, res);
  if (!membership) return;

  const caseId = String(req.params.id ?? "");
  const isOfficer = HR_CASE_OFFICERS.includes(membership.role);

  if (!process.env.DATABASE_URL) {
    ensureHrCasesSeeded(membership.organizationId);
    const target = DEMO_HR_CASES.get(membership.organizationId)?.find((c) => c.id === caseId);
    if (!target) {
      res.status(404).json({ error: "HR Case not found." });
      return;
    }
    if (!isOfficer && target.submittedByUserId !== membership.userId) {
      res.status(403).json({
        error: "Confidential HR Case access denied. You are not authorized to view this investigation.",
        code: "CONFIDENTIAL_CASE_ACCESS_DENIED",
      });
      return;
    }
    res.json(isOfficer ? target : redactForEmployee(target, membership.userId));
    return;
  }

  const [target] = await db
    .select()
    .from(hrCasesTable)
    .where(
      and(
        eq(hrCasesTable.id, caseId),
        eq(hrCasesTable.organizationId, membership.organizationId),
      ),
    )
    .limit(1);

  if (!target) {
    res.status(404).json({ error: "HR Case not found." });
    return;
  }

  if (!isOfficer && target.submittedByUserId !== membership.userId) {
    res.status(403).json({
      error: "Confidential HR Case access denied. You are not authorized to view this investigation.",
      code: "CONFIDENTIAL_CASE_ACCESS_DENIED",
    });
    return;
  }

  res.json(
    isOfficer
      ? target
      : {
          id: target.id,
          caseNumber: target.caseNumber,
          category: target.category,
          severity: target.severity,
          title: target.title,
          description: target.description,
          confidentialNotes: null,
          assignedInvestigatorUserId: null,
          status: target.status,
          resolutionSummary: target.resolutionSummary,
          createdAt: target.createdAt,
          updatedAt: target.updatedAt,
        },
  );
});

// PATCH /api/hr-cases/:id — Strictly HR Case Officers Only
router.patch("/hr-cases/:id", async (req: Request, res: Response) => {
  const membership = await requireRoles(req, res, HR_CASE_OFFICERS);
  if (!membership) return;

  const caseId = String(req.params.id ?? "");
  const status = req.body?.status ? sanitizeText(req.body.status, 30) : undefined;
  const confidentialNotes = req.body?.confidentialNotes !== undefined
    ? sanitizeText(req.body.confidentialNotes, 3000)
    : undefined;
  const resolutionSummary = req.body?.resolutionSummary !== undefined
    ? sanitizeText(req.body.resolutionSummary, 1500)
    : undefined;

  if (!process.env.DATABASE_URL) {
    ensureHrCasesSeeded(membership.organizationId);
    const target = DEMO_HR_CASES.get(membership.organizationId)!.find((c) => c.id === caseId);
    if (!target) {
      res.status(404).json({ error: "HR Case not found." });
      return;
    }
    if (status) target.status = status as DemoHrCase["status"];
    if (confidentialNotes !== undefined) target.confidentialNotes = confidentialNotes;
    if (resolutionSummary !== undefined) target.resolutionSummary = resolutionSummary;
    target.assignedInvestigatorUserId = membership.userId;
    target.updatedAt = new Date().toISOString();

    await recordAuditEvent({
      organizationId: membership.organizationId,
      actorUserId: membership.userId,
      actor: membership.role,
      action: "HR_CASE_UPDATED",
      targetType: "hr_case",
      targetId: target.id,
      summary: `Updated HR case ${target.caseNumber} -> ${target.status}`,
      critical: true,
      isDemo: true,
    });
    res.json(target);
    return;
  }

  const updated = await db.transaction(async (tx) => {
    const [row] = await tx
      .update(hrCasesTable)
      .set({
        ...(status ? { status } : {}),
        ...(confidentialNotes !== undefined ? { confidentialNotes } : {}),
        ...(resolutionSummary !== undefined ? { resolutionSummary } : {}),
        assignedInvestigatorUserId: membership.userId,
        updatedAt: new Date(),
      })
      .where(and(eq(hrCasesTable.id, caseId), eq(hrCasesTable.organizationId, membership.organizationId)))
      .returning();

    if (!row) return null;

    await recordAuditEvent({
      organizationId: membership.organizationId,
      actorUserId: membership.userId,
      actor: membership.role,
      action: "HR_CASE_UPDATED",
      targetType: "hr_case",
      targetId: row.id,
      summary: `Updated HR case ${row.caseNumber} -> ${row.status}`,
      critical: true,
      tx,
    });

    return row;
  });

  if (!updated) {
    res.status(404).json({ error: "HR Case not found." });
    return;
  }
  res.json(updated);
});

export default router;

