import crypto from "node:crypto";
import { and, desc, eq, lte, gte } from "drizzle-orm";
import {
  db,
  employeeCertificationsTable,
  employeesTable,
} from "@workspace/db";
import { recordAuditEvent } from "../../lib/auditService";
import { sanitizeText } from "../../lib/security";
import {
  getOrCreateWorkforceStore,
  type MemEmployeeCertification,
} from "./workforceErpMemoryStore";
import { DEMO_EMPLOYEES_LIST } from "../../routes/peopleos";

export interface CreateCertificationInput {
  employeeId: string;
  category: "production_safety" | "equipment_operation" | "driving_license" | "technical_qualification" | "compliance";
  competencyType: string;
  equipmentType?: string | null;
  issuingOrg: string;
  certificateNumber: string;
  issueDate: string; // YYYY-MM-DD
  expiryDate: string; // YYYY-MM-DD
  evidenceDocumentId?: string | null;
  notes?: string | null;
}

export async function listCertifications(
  organizationId: string,
  filters?: {
    employeeId?: string;
    category?: string;
    verificationStatus?: string;
    expiringWithinDays?: number;
    asOfDate?: string;
  },
): Promise<{ items: MemEmployeeCertification[]; total: number }> {
  const asOf = filters?.asOfDate ? new Date(filters.asOfDate) : new Date();

  if (!process.env.DATABASE_URL) {
    const store = getOrCreateWorkforceStore(organizationId);
    let list = Array.from(store.certifications.values());

    if (filters?.employeeId) {
      list = list.filter((c) => c.employeeId === filters.employeeId);
    }
    if (filters?.category) {
      list = list.filter((c) => c.category === filters.category);
    }
    if (filters?.verificationStatus) {
      list = list.filter((c) => c.verificationStatus === filters.verificationStatus);
    }
    if (filters?.expiringWithinDays != null) {
      const windowEndMs = asOf.getTime() + filters.expiringWithinDays * 86400000;
      list = list.filter((c) => {
        const expMs = Date.parse(`${c.expiryDate}T00:00:00Z`);
        return expMs <= windowEndMs;
      });
    }

    // Dynamic auto-expiry update
    list.forEach((c) => {
      const expMs = Date.parse(`${c.expiryDate}T00:00:00Z`);
      if (expMs < asOf.getTime() && c.verificationStatus === "verified") {
        c.verificationStatus = "expired";
      }
    });

    list.sort((a, b) => a.expiryDate.localeCompare(b.expiryDate));
    return { items: list, total: list.length };
  }

  const query = db
    .select({
      cert: employeeCertificationsTable,
      emp: employeesTable,
    })
    .from(employeeCertificationsTable)
    .innerJoin(employeesTable, eq(employeeCertificationsTable.employeeId, employeesTable.id))
    .where(eq(employeeCertificationsTable.organizationId, organizationId))
    .orderBy(desc(employeeCertificationsTable.createdAt));

  const rows = await query;
  let items: MemEmployeeCertification[] = rows.map(({ cert, emp }) => ({
    id: cert.id,
    organizationId: cert.organizationId,
    employeeId: cert.employeeId,
    employeeName: `${emp.firstName} ${emp.lastName}`,
    category: cert.category as MemEmployeeCertification["category"],
    competencyType: cert.competencyType,
    equipmentType: cert.equipmentType,
    issuingOrg: cert.issuingOrg,
    certificateNumber: cert.certificateNumber,
    issueDate: cert.issueDate,
    expiryDate: cert.expiryDate,
    verificationStatus: cert.verificationStatus as MemEmployeeCertification["verificationStatus"],
    verifiedAt: cert.verifiedAt ? cert.verifiedAt.toISOString() : null,
    verifiedByUserId: cert.verifiedByUserId,
    rejectionReason: cert.rejectionReason,
    revocationReason: cert.revocationReason,
    evidenceDocumentId: cert.evidenceDocumentId,
    notes: cert.notes,
    createdAt: cert.createdAt.toISOString(),
    updatedAt: cert.updatedAt.toISOString(),
  }));

  if (filters?.employeeId) {
    items = items.filter((c) => c.employeeId === filters.employeeId);
  }
  if (filters?.category) {
    items = items.filter((c) => c.category === filters.category);
  }
  if (filters?.verificationStatus) {
    items = items.filter((c) => c.verificationStatus === filters.verificationStatus);
  }
  if (filters?.expiringWithinDays != null) {
    const windowEndMs = asOf.getTime() + filters.expiringWithinDays * 86400000;
    items = items.filter((c) => {
      const expMs = Date.parse(`${c.expiryDate}T00:00:00Z`);
      return expMs <= windowEndMs;
    });
  }

  items.sort((a, b) => a.expiryDate.localeCompare(b.expiryDate));
  return { items, total: items.length };
}

export async function createCertification(
  organizationId: string,
  input: CreateCertificationInput,
  actorUserId: string,
): Promise<MemEmployeeCertification> {
  const employeeId = sanitizeText(input.employeeId, 64);
  const category = sanitizeText(input.category, 40) as CreateCertificationInput["category"];
  const competencyType = sanitizeText(input.competencyType, 120);
  const equipmentType = input.equipmentType ? sanitizeText(input.equipmentType, 120) : null;
  const issuingOrg = sanitizeText(input.issuingOrg, 120);
  const certificateNumber = sanitizeText(input.certificateNumber, 80);
  const issueDate = sanitizeText(input.issueDate, 10);
  const expiryDate = sanitizeText(input.expiryDate, 10);
  const notes = input.notes ? sanitizeText(input.notes, 500) : null;

  if (!employeeId || !competencyType || !certificateNumber || !issueDate || !expiryDate) {
    throw new Error("employeeId, competencyType, certificateNumber, issueDate and expiryDate are required.");
  }

  if (Date.parse(expiryDate) <= Date.parse(issueDate)) {
    throw new Error("Certification expiryDate must be after issueDate.");
  }

  const nowIso = new Date().toISOString();

  if (!process.env.DATABASE_URL) {
    const store = getOrCreateWorkforceStore(organizationId);
    const emp = DEMO_EMPLOYEES_LIST.find((e) => e.id === employeeId);
    const employeeName = emp ? `${emp.firstName} ${emp.lastName}` : "Rekker Specialist";

    const cert: MemEmployeeCertification = {
      id: `cert-${crypto.randomUUID().slice(0, 8)}`,
      organizationId,
      employeeId,
      employeeName,
      category,
      competencyType,
      equipmentType,
      issuingOrg,
      certificateNumber,
      issueDate,
      expiryDate,
      verificationStatus: "pending_verification",
      verifiedAt: null,
      verifiedByUserId: null,
      rejectionReason: null,
      revocationReason: null,
      evidenceDocumentId: input.evidenceDocumentId ?? null,
      notes,
      createdAt: nowIso,
      updatedAt: nowIso,
    };
    store.certifications.set(cert.id, cert);

    await recordAuditEvent({
      organizationId,
      actorUserId,
      actor: "supervisor",
      action: "EMPLOYEE_CERTIFICATION_REGISTERED",
      targetType: "employee_certification",
      targetId: cert.id,
      summary: `Registered ${competencyType} for ${employeeName} (Cert #${certificateNumber}, pending verification)`,
      isDemo: true,
    });

    return cert;
  }

  const [created] = await db
    .insert(employeeCertificationsTable)
    .values({
      organizationId,
      employeeId,
      category,
      competencyType,
      equipmentType,
      issuingOrg,
      certificateNumber,
      issueDate,
      expiryDate,
      verificationStatus: "pending_verification",
      notes,
    })
    .returning();

  const [emp] = await db
    .select({ firstName: employeesTable.firstName, lastName: employeesTable.lastName })
    .from(employeesTable)
    .where(eq(employeesTable.id, employeeId));

  const empName = emp ? `${emp.firstName} ${emp.lastName}` : "Rekker Specialist";

  await recordAuditEvent({
    organizationId,
    actorUserId,
    actor: "supervisor",
    action: "EMPLOYEE_CERTIFICATION_REGISTERED",
    targetType: "employee_certification",
    targetId: created!.id,
    summary: `Registered ${competencyType} for ${empName} (Cert #${certificateNumber}, pending verification)`,
  });

  return {
    id: created!.id,
    organizationId: created!.organizationId,
    employeeId: created!.employeeId,
    employeeName: empName,
    category: created!.category as MemEmployeeCertification["category"],
    competencyType: created!.competencyType,
    equipmentType: created!.equipmentType,
    issuingOrg: created!.issuingOrg,
    certificateNumber: created!.certificateNumber,
    issueDate: created!.issueDate,
    expiryDate: created!.expiryDate,
    verificationStatus: created!.verificationStatus as MemEmployeeCertification["verificationStatus"],
    verifiedAt: null,
    verifiedByUserId: null,
    rejectionReason: null,
    revocationReason: null,
    evidenceDocumentId: created!.evidenceDocumentId,
    notes: created!.notes,
    createdAt: created!.createdAt.toISOString(),
    updatedAt: created!.updatedAt.toISOString(),
  };
}

export async function verifyCertification(
  organizationId: string,
  certId: string,
  decision: "verified" | "rejected" | "revoked",
  reason?: string,
  verifierUserId?: string,
): Promise<MemEmployeeCertification> {
  const nowIso = new Date().toISOString();

  if (!process.env.DATABASE_URL) {
    const store = getOrCreateWorkforceStore(organizationId);
    const cert = store.certifications.get(certId);
    if (!cert || cert.organizationId !== organizationId) {
      throw new Error(`Certification ${certId} not found.`);
    }

    cert.verificationStatus = decision;
    cert.verifiedAt = decision === "verified" ? nowIso : null;
    cert.verifiedByUserId = verifierUserId ?? null;
    if (decision === "rejected") cert.rejectionReason = reason ?? "Failed verification criteria";
    if (decision === "revoked") cert.revocationReason = reason ?? "Revoked by supervisor / safety officer";
    cert.updatedAt = nowIso;

    await recordAuditEvent({
      organizationId,
      actorUserId: verifierUserId,
      actor: "hr_manager",
      action: `CERTIFICATION_${decision.toUpperCase()}`,
      targetType: "employee_certification",
      targetId: cert.id,
      summary: `${decision.toUpperCase()} certification ${cert.competencyType} for ${cert.employeeName} (${cert.certificateNumber})`,
      isDemo: true,
    });

    return cert;
  }

  const [target] = await db
    .select()
    .from(employeeCertificationsTable)
    .where(
      and(
        eq(employeeCertificationsTable.id, certId),
        eq(employeeCertificationsTable.organizationId, organizationId),
      ),
    );

  if (!target) {
    throw new Error(`Certification ${certId} not found.`);
  }

  const [updated] = await db
    .update(employeeCertificationsTable)
    .set({
      verificationStatus: decision,
      verifiedAt: decision === "verified" ? new Date() : null,
      verifiedByUserId: verifierUserId ?? null,
      rejectionReason: decision === "rejected" ? reason ?? "Failed verification criteria" : null,
      revocationReason: decision === "revoked" ? reason ?? "Revoked by supervisor" : null,
      updatedAt: new Date(),
    })
    .where(eq(employeeCertificationsTable.id, certId))
    .returning();

  const [emp] = await db
    .select({ firstName: employeesTable.firstName, lastName: employeesTable.lastName })
    .from(employeesTable)
    .where(eq(employeesTable.id, updated!.employeeId));

  const empName = emp ? `${emp.firstName} ${emp.lastName}` : "Rekker Specialist";

  await recordAuditEvent({
    organizationId,
    actorUserId: verifierUserId,
    actor: "hr_manager",
    action: `CERTIFICATION_${decision.toUpperCase()}`,
    targetType: "employee_certification",
    targetId: updated!.id,
    summary: `${decision.toUpperCase()} certification ${updated!.competencyType} for ${empName}`,
  });

  return {
    id: updated!.id,
    organizationId: updated!.organizationId,
    employeeId: updated!.employeeId,
    employeeName: empName,
    category: updated!.category as MemEmployeeCertification["category"],
    competencyType: updated!.competencyType,
    equipmentType: updated!.equipmentType,
    issuingOrg: updated!.issuingOrg,
    certificateNumber: updated!.certificateNumber,
    issueDate: updated!.issueDate,
    expiryDate: updated!.expiryDate,
    verificationStatus: updated!.verificationStatus as MemEmployeeCertification["verificationStatus"],
    verifiedAt: updated!.verifiedAt ? updated!.verifiedAt.toISOString() : null,
    verifiedByUserId: updated!.verifiedByUserId,
    rejectionReason: updated!.rejectionReason,
    revocationReason: updated!.revocationReason,
    evidenceDocumentId: updated!.evidenceDocumentId,
    notes: updated!.notes,
    createdAt: updated!.createdAt.toISOString(),
    updatedAt: updated!.updatedAt.toISOString(),
  };
}

export async function hasVerifiedCompetency(
  organizationId: string,
  employeeId: string,
  requiredCompetency: string,
  asOfDate: string = new Date().toISOString().slice(0, 10),
): Promise<{ verified: boolean; certification?: MemEmployeeCertification; reason?: string }> {
  const { items } = await listCertifications(organizationId, { employeeId });

  // Normalization for comparison
  const reqNorm = requiredCompetency.toLowerCase().trim();

  const valid = items.find((c) => {
    const compMatch = c.competencyType.toLowerCase().includes(reqNorm) || reqNorm.includes(c.competencyType.toLowerCase());
    const catMatch = c.category.toLowerCase().includes(reqNorm) || reqNorm.includes(c.category.toLowerCase());
    const equipMatch = c.equipmentType ? c.equipmentType.toLowerCase().includes(reqNorm) : false;
    const isMatched = compMatch || catMatch || equipMatch;
    const isStatusVerified = c.verificationStatus === "verified";
    const notExpired = c.expiryDate >= asOfDate;
    return isMatched && isStatusVerified && notExpired;
  });

  if (valid) {
    return { verified: true, certification: valid };
  }

  // Check if unverified or expired exists to give better reason
  const candidate = items.find((c) => {
    const compMatch = c.competencyType.toLowerCase().includes(reqNorm) || reqNorm.includes(c.competencyType.toLowerCase());
    const equipMatch = c.equipmentType ? c.equipmentType.toLowerCase().includes(reqNorm) : false;
    return compMatch || equipMatch;
  });

  if (candidate) {
    if (candidate.expiryDate < asOfDate) {
      return {
        verified: false,
        reason: `Certification ${candidate.competencyType} expired on ${candidate.expiryDate}.`,
      };
    }
    if (candidate.verificationStatus !== "verified") {
      return {
        verified: false,
        reason: `Certification ${candidate.competencyType} is currently '${candidate.verificationStatus}'. Only verified certifications satisfy shift requirements.`,
      };
    }
  }

  return {
    verified: false,
    reason: `Missing required verified competency '${requiredCompetency}'.`,
  };
}
