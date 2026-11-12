import crypto from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import { Router, type IRouter, type Request, type Response } from "express";
import { db, documentsTable, employeesTable } from "@workspace/db";
import { recordAuditEvent } from "../lib/auditService";
import {
  MODULE_PERMISSION_MATRIX,
  PRIVILEGED_HR_ROLES,
} from "../lib/authorization";
import {
  assertSafeDocumentUpload,
  sanitizeText,
} from "../lib/security";
import {
  ensureMembership,
  requireRoles,
} from "../middlewares/peopleosAccess";
import { DEMO_EMPLOYEES_LIST } from "./peopleos";

const router: IRouter = Router();

const docAdminRoles: readonly string[] = [
  ...MODULE_PERMISSION_MATRIX.hrAndPeopleCore.writeRoles,
];

const DOCUMENTS = [
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
    mimeType: "application/pdf",
    checksumSha256: null as string | null,
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
    mimeType: "application/pdf",
    checksumSha256: null as string | null,
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
    mimeType: "application/pdf",
    checksumSha256: null as string | null,
    status: "valid",
  },
  {
    id: "doc-04",
    organizationId: "rekker-demo",
    employeeId: "10000000-0000-4000-8000-000000000002",
    name: "Production Line DOSHS & KEBS Batch Compliance Record.pdf",
    category: "Compliance",
    employeeName: "Mwangi Kariuki",
    uploadedDate: "2025-06-12",
    expiryDate: "2027-06-12",
    fileSize: "3.1 MB",
    mimeType: "application/pdf",
    checksumSha256: null as string | null,
    status: "valid",
  },
];

function computeDaysRemaining(expiryDate: string | null): number | null {
  if (!expiryDate) return null;
  const target = new Date(`${expiryDate.slice(0, 10)}T00:00:00.000Z`).getTime();
  if (!Number.isFinite(target)) return null;
  return Math.ceil((target - Date.now()) / (24 * 60 * 60 * 1000));
}

function formatSize(sizeBytes?: number): string {
  if (typeof sizeBytes !== "number" || !Number.isFinite(sizeBytes) || sizeBytes <= 0) {
    return "Verified Metadata";
  }
  if (sizeBytes >= 1024 * 1024) {
    return `${(sizeBytes / (1024 * 1024)).toFixed(1)} MB`;
  }
  return `${Math.max(1, Math.round(sizeBytes / 1024))} KB`;
}

// GET /api/documents
router.get("/documents", async (req: Request, res: Response) => {
  const membership = await ensureMembership(req, res);
  if (!membership) return;

  const category = typeof req.query.category === "string" ? req.query.category : undefined;
  const isPrivileged = docAdminRoles.includes(membership.role);

  if (!process.env.DATABASE_URL) {
    let filtered = DOCUMENTS.filter(
      (d) => d.organizationId === membership.organizationId,
    );
    if (!isPrivileged) {
      filtered = membership.employeeId
        ? filtered.filter((d) => d.employeeId === membership.employeeId)
        : [];
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

  if (!isPrivileged) {
    rows = membership.employeeId
      ? rows.filter((d) => d.employeeId === membership.employeeId)
      : [];
  }
  if (category) rows = rows.filter((d) => d.category === category);

  res.json({ items: rows, total: rows.length });
});

// GET /api/documents/expiring - Compliance Contract Expiry Alerts (RBAC-scoped)
router.get("/documents/expiring", async (req: Request, res: Response) => {
  const membership = await ensureMembership(req, res);
  if (!membership) return;

  const isPrivileged = docAdminRoles.includes(membership.role);
  const cutoff = new Date(Date.now() + 60 * 86400 * 1000).toISOString().slice(0, 10);

  if (!process.env.DATABASE_URL) {
    let expiring = DOCUMENTS.filter(
      (d) =>
        d.organizationId === membership.organizationId &&
        (d.status === "expiring_soon" || (d.expiryDate && d.expiryDate <= cutoff)),
    );
    if (!isPrivileged) {
      expiring = membership.employeeId
        ? expiring.filter((d) => d.employeeId === membership.employeeId)
        : [];
    }
    res.json({
      totalExpiring: expiring.length,
      contracts: expiring.map((c) => ({
        documentId: c.id,
        title: c.name,
        employee: c.employeeName,
        expiryDate: c.expiryDate,
        daysRemaining: computeDaysRemaining(c.expiryDate) ?? 0,
      })),
    });
    return;
  }

  const [docs, emps] = await Promise.all([
    db
      .select()
      .from(documentsTable)
      .where(eq(documentsTable.organizationId, membership.organizationId)),
    db
      .select({
        id: employeesTable.id,
        firstName: employeesTable.firstName,
        lastName: employeesTable.lastName,
      })
      .from(employeesTable)
      .where(eq(employeesTable.organizationId, membership.organizationId)),
  ]);
  const empNames = new Map(emps.map((e) => [e.id, `${e.firstName} ${e.lastName}`]));

  let expiring = docs.filter(
    (d) => Boolean(d.expiryDate && d.expiryDate <= cutoff),
  );
  if (!isPrivileged) {
    expiring = membership.employeeId
      ? expiring.filter((d) => d.employeeId === membership.employeeId)
      : [];
  }

  res.json({
    totalExpiring: expiring.length,
    contracts: expiring.map((c) => ({
      documentId: c.id,
      title: c.name,
      employee: c.employeeId ? empNames.get(c.employeeId) ?? "Assigned Employee" : "Organization Record",
      expiryDate: c.expiryDate,
      daysRemaining: computeDaysRemaining(c.expiryDate) ?? 0,
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
    const isPrivileged = PRIVILEGED_HR_ROLES.includes(membership.role);
    if (!isPrivileged && membership.employeeId !== employeeId) {
      res.status(403).json({
        error: "Access denied to another employee's employment contract.",
        code: "FORBIDDEN_DOCUMENT_ACCESS",
      });
      return;
    }

    let empSummary: {
      id: string;
      firstName: string;
      lastName: string;
      employeeNumber: string;
      jobTitle: string;
      departmentName: string;
      location: string;
      employmentType: string;
      startDate: string;
      contractEndDate: string | null;
    } | null = null;

    if (!process.env.DATABASE_URL) {
      const demo = DEMO_EMPLOYEES_LIST.find((e) => e.id === employeeId);
      if (demo) {
        empSummary = {
          id: demo.id,
          firstName: demo.firstName,
          lastName: demo.lastName,
          employeeNumber: demo.employeeNumber,
          jobTitle: demo.jobTitle,
          departmentName: demo.departmentName,
          location: demo.location,
          employmentType: demo.employmentType,
          startDate: String(demo.startDate).slice(0, 10),
          contractEndDate: demo.contractEndDate ? String(demo.contractEndDate).slice(0, 10) : null,
        };
      }
    } else {
      const [dbEmp] = await db
        .select()
        .from(employeesTable)
        .where(
          and(
            eq(employeesTable.id, employeeId),
            eq(employeesTable.organizationId, membership.organizationId),
          ),
        )
        .limit(1);
      if (dbEmp) {
        empSummary = {
          id: dbEmp.id,
          firstName: dbEmp.firstName,
          lastName: dbEmp.lastName,
          employeeNumber: dbEmp.employeeNumber,
          jobTitle: dbEmp.jobTitle,
          departmentName: "Assigned Department",
          location: dbEmp.location,
          employmentType: dbEmp.employmentType,
          startDate: String(dbEmp.startDate).slice(0, 10),
          contractEndDate: dbEmp.contractEndDate ? String(dbEmp.contractEndDate).slice(0, 10) : null,
        };
      }
    }

    if (!empSummary) {
      res.status(404).json({ error: "Employee record not found." });
      return;
    }

    const text = `REPUBLIC OF KENYA - EMPLOYMENT ACT 2007 (SECTION 10 WRITTEN PARTICULARS)
EMPLOYER: Rekker Limited, Nairobi
EMPLOYEE: ${empSummary.firstName} ${empSummary.lastName} (${empSummary.employeeNumber})
JOB TITLE: ${empSummary.jobTitle} | DEPARTMENT: ${empSummary.departmentName}
WORKPLACE LOCATION: ${empSummary.location}
EMPLOYMENT TYPE: ${empSummary.employmentType.replaceAll("_", " ").toUpperCase()}
COMMENCEMENT DATE: ${empSummary.startDate}
${empSummary.contractEndDate ? `CONTRACT EXPIRY DATE: ${empSummary.contractEndDate}` : "DURATION: Continuous Permanent Service"}
STATUTORY DEDUCTIONS: Applicable Kenyan PAYE, NSSF, SHIF, and Affordable Housing Levy per active schedule.
LEAVE GOVERNANCE: Leave allocations follow Rekker Organization Leave Policies configured inside PeopleOS in compliance with Employment Act 2007 minimum floors.
DATA PRIVACY NOTICE: Employee records are governed under the Kenya Data Protection Act 2019 (ODPC).`;

    res.json({
      templateType: "KENYA_EMPLOYMENT_ACT_SEC_10",
      employeeId: empSummary.id,
      employeeName: `${empSummary.firstName} ${empSummary.lastName}`,
      content: text,
      generatedAt: new Date().toISOString(),
    });
  },
);

// POST /api/documents - Secure Upload with Extension/MIME/Signature Validation & Transactional Audit Trail
router.post("/documents", async (req: Request, res: Response) => {
  const membership = await requireRoles(req, res, docAdminRoles);
  if (!membership) return;

  const {
    name,
    category = "Contract",
    employeeId,
    expiryDate,
    mimeType,
    sizeBytes,
    base64Sample,
  } = req.body ?? {};

  if (!name || typeof name !== "string") {
    res.status(400).json({ error: "Document name is required." });
    return;
  }
  if (!employeeId || typeof employeeId !== "string" || !employeeId.trim()) {
    res.status(400).json({ error: "A valid target employeeId is required." });
    return;
  }

  const normalizedName = /\.[a-z0-9]+$/i.test(name.trim()) ? name.trim() : `${name.trim()}.pdf`;
  const validation = assertSafeDocumentUpload({
    fileName: normalizedName,
    mimeType: typeof mimeType === "string" ? mimeType : undefined,
    sizeBytes: typeof sizeBytes === "number" ? sizeBytes : undefined,
    base64Sample: typeof base64Sample === "string" ? base64Sample : undefined,
  });
  if (!validation.ok) {
    res.status(400).json({ error: validation.error, code: "INVALID_DOCUMENT_UPLOAD" });
    return;
  }

  const safeName = validation.safeName;
  const cleanCategory = sanitizeText(category, 60) || "Contract";
  const cleanExpiry = expiryDate ? String(expiryDate).slice(0, 10) : null;
  const cleanMimeType = typeof mimeType === "string" ? sanitizeText(mimeType, 120) : "application/pdf";
  const checksumSha256 = crypto
    .createHash("sha256")
    .update(
      typeof base64Sample === "string" && base64Sample.length > 0
        ? Buffer.from(base64Sample, "base64")
        : `${safeName}:${cleanCategory}:${employeeId}`,
    )
    .digest("hex");

  if (!process.env.DATABASE_URL) {
    const targetEmp = DEMO_EMPLOYEES_LIST.find((e) => e.id === employeeId.trim());
    if (!targetEmp) {
      res.status(404).json({ error: "Target employee record was not found." });
      return;
    }

    const newDoc = {
      id: `doc-${crypto.randomUUID().slice(0, 8)}`,
      organizationId: membership.organizationId,
      employeeId: targetEmp.id,
      name: safeName,
      category: cleanCategory,
      employeeName: `${targetEmp.firstName} ${targetEmp.lastName}`,
      uploadedDate: new Date().toISOString().slice(0, 10),
      expiryDate: cleanExpiry,
      fileSize: formatSize(typeof sizeBytes === "number" ? sizeBytes : undefined),
      mimeType: cleanMimeType,
      checksumSha256,
      status: "valid",
    };

    DOCUMENTS.unshift(newDoc);
    await recordAuditEvent({
      organizationId: membership.organizationId,
      actorUserId: membership.userId,
      actor: membership.role,
      action: "DOCUMENT_UPLOADED",
      targetType: "document",
      targetId: newDoc.id,
      summary: `Uploaded "${newDoc.name}" (${newDoc.category}) for ${newDoc.employeeName}.`,
      correlationId: req.correlationId,
      critical: true,
      isDemo: true,
    });

    res.status(201).json(newDoc);
    return;
  }

  const [targetEmp] = await db
    .select({
      id: employeesTable.id,
      firstName: employeesTable.firstName,
      lastName: employeesTable.lastName,
    })
    .from(employeesTable)
    .where(
      and(
        eq(employeesTable.id, employeeId.trim()),
        eq(employeesTable.organizationId, membership.organizationId),
      ),
    )
    .limit(1);

  if (!targetEmp) {
    res.status(404).json({ error: "Target employee record was not found in this organization." });
    return;
  }

  const created = await db.transaction(async (tx) => {
    const [inserted] = await tx
      .insert(documentsTable)
      .values({
        organizationId: membership.organizationId,
        employeeId: targetEmp.id,
        name: safeName,
        category: cleanCategory,
        fileSize: formatSize(typeof sizeBytes === "number" ? sizeBytes : undefined),
        mimeType: cleanMimeType,
        checksumSha256,
        uploadedByUserId: membership.userId,
        expiryDate: cleanExpiry,
      })
      .returning();

    await recordAuditEvent({
      organizationId: membership.organizationId,
      actorUserId: membership.userId,
      actor: membership.role,
      action: "DOCUMENT_UPLOADED",
      targetType: "document",
      targetId: inserted!.id,
      summary: `Uploaded "${safeName}" (${cleanCategory}) for ${targetEmp.firstName} ${targetEmp.lastName}.`,
      correlationId: req.correlationId,
      critical: true,
      isDemo: false,
      tx,
    });

    return inserted!;
  });

  res.status(201).json({
    ...created,
    employeeName: `${targetEmp.firstName} ${targetEmp.lastName}`,
  });
});

export default router;
