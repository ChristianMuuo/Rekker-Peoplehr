import crypto from "node:crypto";
import { desc, eq } from "drizzle-orm";
import { Router, type IRouter, type Request, type Response } from "express";
import { db, documentsTable } from "@workspace/db";
import { recordAuditEvent } from "../lib/auditService";
import {
  assertSafeDocumentExtension,
  sanitizeFileName,
  sanitizeText,
} from "../lib/security";
import {
  ensureMembership,
  PEOPLEOS_ROLES,
  requireRoles,
} from "../middlewares/peopleosAccess";
import { DEMO_EMPLOYEES_LIST } from "./peopleos";

const router: IRouter = Router();

const docAdminRoles = [
  PEOPLEOS_ROLES.hrAdmin,
  PEOPLEOS_ROLES.hrManager,
  PEOPLEOS_ROLES.systemAdmin,
];

let DOCUMENTS = [
  {
    id: "doc-01",
    organizationId: "rekker-demo",
    employeeId: "10000000-0000-4000-8000-000000000001",
    name: "Executive Employment Agreement - Plant Operations.pdf",
    category: "Contract",
    employeeName: "Achieng Odhiambo",
    uploadedDate: "2021-03-15",
    expiryDate: null as string | null,
    fileSize: "2.4 MB",
    status: "valid",
  },
  {
    id: "doc-02",
    organizationId: "rekker-demo",
    employeeId: "10000000-0000-4000-8000-000000000006",
    name: "Fixed-Term Commercial Specialist Contract.pdf",
    category: "Contract",
    employeeName: "Brian Kiprotich",
    uploadedDate: "2024-02-01",
    expiryDate: "2026-04-30",
    fileSize: "1.8 MB",
    status: "expiring_soon",
  },
  {
    id: "doc-03",
    organizationId: "rekker-demo",
    employeeId: "10000000-0000-4000-8000-000000000007",
    name: "KRA Personal Tax Exemption & P9 Certificate 2025.pdf",
    category: "Tax & KRA",
    employeeName: "David Kibet",
    uploadedDate: "2026-01-10",
    expiryDate: "2026-12-31",
    fileSize: "850 KB",
    status: "valid",
  },
  {
    id: "doc-04",
    organizationId: "rekker-demo",
    employeeId: "10000000-0000-4000-8000-000000000002",
    name: "Brewery Fermentation OSHA & HACCP Certification.pdf",
    category: "Compliance",
    employeeName: "Mwangi Kariuki",
    uploadedDate: "2025-06-12",
    expiryDate: "2027-06-12",
    fileSize: "3.1 MB",
    status: "valid",
  },
];

// GET /api/documents
router.get("/documents", async (req: Request, res: Response) => {
  const membership = await ensureMembership(req, res);
  if (!membership) return;

  const category = req.query.category as string | undefined;
  const isPrivileged = docAdminRoles.includes(membership.role as any);

  if (!process.env.DATABASE_URL) {
    let filtered = DOCUMENTS.filter(
      (d) => d.organizationId === membership.organizationId,
    );
    if (!isPrivileged && membership.employeeId) {
      filtered = filtered.filter((d) => d.employeeId === membership.employeeId);
    }
    if (category) filtered = filtered.filter((d) => d.category === category);
    res.json({ items: filtered, total: filtered.length });
    return;
  }

  let rows = await db
    .select()
    .from(documentsTable)
    .where(eq(documentsTable.organizationId, membership.organizationId))
    .orderBy(desc(documentsTable.createdAt));

  if (!isPrivileged && membership.employeeId) {
    rows = rows.filter((d) => d.employeeId === membership.employeeId);
  }
  if (category) rows = rows.filter((d) => d.category === category);

  res.json({ items: rows, total: rows.length });
});

// GET /api/documents/expiring - Compliance Contract Expiry Alerts
router.get("/documents/expiring", async (req: Request, res: Response) => {
  const membership = await ensureMembership(req, res);
  if (!membership) return;

  const cutoff = new Date(Date.now() + 60 * 86400 * 1000)
    .toISOString()
    .slice(0, 10);
  const expiring = DOCUMENTS.filter(
    (d) =>
      d.organizationId === membership.organizationId &&
      (d.status === "expiring_soon" ||
        (d.expiryDate && d.expiryDate <= cutoff)),
  );
  res.json({
    totalExpiring: expiring.length,
    contracts: expiring.map((c) => ({
      documentId: c.id,
      title: c.name,
      employee: c.employeeName,
      expiryDate: c.expiryDate,
      daysRemaining: 54,
    })),
  });
});

// GET /api/documents/templates/employment-contract/:employeeId
// Kenya Employment Act 2007 §10 Written Particulars Statement Generator
router.get(
  "/documents/templates/employment-contract/:employeeId",
  async (req: Request, res: Response) => {
    const membership = await ensureMembership(req, res);
    if (!membership) return;

    const employeeId = String(req.params.employeeId ?? "");
    const isPrivileged = docAdminRoles.includes(membership.role as any);
    if (!isPrivileged && membership.employeeId !== employeeId) {
      res.status(403).json({ error: "Access denied to another employee's employment contract." });
      return;
    }

    const emp = DEMO_EMPLOYEES_LIST.find((e) => e.id === employeeId);
    if (!emp) {
      res.status(404).json({ error: "Employee record not found." });
      return;
    }

    const text = `REPUBLIC OF KENYA - EMPLOYMENT ACT 2007 (SECTION 10 WRITTEN PARTICULARS)
EMPLOYER: Rekker Breweries Kenya Ltd, Nairobi
EMPLOYEE: ${emp.firstName} ${emp.lastName} (${emp.employeeNumber})
JOB TITLE: ${emp.jobTitle} | DEPARTMENT: ${emp.departmentName}
WORKPLACE LOCATION: ${emp.location}
EMPLOYMENT TYPE: ${emp.employmentType.replaceAll("_", " ").toUpperCase()}
COMMENCEMENT DATE: ${emp.startDate}
${emp.contractEndDate ? `CONTRACT EXPIRY DATE: ${emp.contractEndDate}` : "DURATION: Continuous Permanent Service"}
STATUTORY DEDUCTIONS: Applicable Kenyan PAYE, NSSF, SHIF, and Affordable Housing Levy per active schedule.
LEAVE GOVERNANCE: Leave allocations follow Rekker Organization Leave Policies configured inside PeopleOS in compliance with Employment Act 2007 minimum floors.
DATA PRIVACY NOTICE: Employee records are governed under the Kenya Data Protection Act 2019 (ODPC).`;

    res.json({
      templateType: "KENYA_EMPLOYMENT_ACT_SEC_10",
      employeeId: emp.id,
      employeeName: `${emp.firstName} ${emp.lastName}`,
      content: text,
      generatedAt: new Date().toISOString(),
    });
  },
);

// POST /api/documents - Secure Upload with Extension Validation & Audit Trail
router.post("/documents", async (req: Request, res: Response) => {
  const membership = await requireRoles(req, res, docAdminRoles);
  if (!membership) return;

  const { name, category = "Contract", employeeId, expiryDate } = req.body ?? {};
  if (!name || typeof name !== "string") {
    res.status(400).json({ error: "Document name is required." });
    return;
  }

  let safeName = sanitizeFileName(name);
  if (!/\.[a-z0-9]+$/i.test(safeName)) {
    safeName = `${safeName}.pdf`;
  }
  if (!assertSafeDocumentExtension(safeName)) {
    res.status(400).json({
      error: "Disallowed document extension. Allowed formats: .pdf, .png, .jpg, .jpeg, .csv, .docx, .xlsx",
    });
    return;
  }

  const targetEmp = DEMO_EMPLOYEES_LIST.find((e) => e.id === employeeId);
  const newDoc = {
    id: `doc-${crypto.randomUUID().slice(0, 8)}`,
    organizationId: membership.organizationId,
    employeeId: targetEmp?.id ?? "10000000-0000-4000-8000-000000000007",
    name: safeName,
    category: sanitizeText(category, 60),
    employeeName: targetEmp
      ? `${targetEmp.firstName} ${targetEmp.lastName}`
      : "David Kibet",
    uploadedDate: new Date().toISOString().slice(0, 10),
    expiryDate: expiryDate ? String(expiryDate).slice(0, 10) : null,
    fileSize: "1.5 MB",
    status: "valid",
  };

  if (!process.env.DATABASE_URL) {
    DOCUMENTS.unshift(newDoc);
  } else {
    const [created] = await db
      .insert(documentsTable)
      .values({
        organizationId: membership.organizationId,
        employeeId: newDoc.employeeId,
        name: newDoc.name,
        category: newDoc.category,
        fileSize: newDoc.fileSize,
        expiryDate: newDoc.expiryDate,
      })
      .returning();
    newDoc.id = created!.id;
  }

  await recordAuditEvent({
    organizationId: membership.organizationId,
    actorUserId: membership.userId,
    actor: membership.role,
    action: "DOCUMENT_UPLOADED",
    targetType: "document",
    targetId: newDoc.id,
    summary: `Uploaded "${newDoc.name}" (${newDoc.category}) for ${newDoc.employeeName}.`,
  });

  res.status(201).json(newDoc);
});

export default router;
