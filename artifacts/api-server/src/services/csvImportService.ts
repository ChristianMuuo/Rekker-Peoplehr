import { createHash, createHmac, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import {
  db,
  departmentsTable,
  employeeImportBatchesTable,
  employeeImportMappingProfilesTable,
  employeeImportRowsTable,
  employeesTable,
  positionsTable,
  type EmployeeImportBatchRecord,
  type EmployeeImportMappingProfileRecord,
  type EmployeeImportRowRecord,
} from "@workspace/db";
import { recordAuditEvent } from "../lib/auditService";
import { sanitizeText } from "../lib/security";
import { parseRfc4180Csv, serializeSafeCsv } from "./rfc4180Csv";
import { phase2MemoryStore } from "./phase2MemoryStore";
import {
  assertValidManagerAssignment,
  recordAssignmentHistoryEntry,
  type HierarchyNodeCandidate,
} from "./employeeMasterService";

const RUNTIME_HMAC_SECRET =
  process.env.PEOPLEOS_IMPORT_TOKEN_SECRET?.trim() ||
  process.env.ENCRYPTION_KEY?.trim() ||
  randomBytes(32).toString("hex");

const BATCH_TTL_MS = 30 * 60 * 1000; // 30 minutes
const STRICT_EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const STRICT_ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const VALID_EMPLOYMENT_TYPES = new Set(["permanent", "fixed_term", "casual", "intern"]);
const VALID_IMPORT_STATUSES = new Set(["active", "probation", "on_leave"]);

export const ALLOWLISTED_IMPORT_FIELDS = [
  "employeeNumber",
  "firstName",
  "lastName",
  "preferredName",
  "workEmail",
  "personalEmail",
  "phone",
  "jobTitle",
  "departmentCode",
  "departmentName",
  "positionCode",
  "managerEmployeeNumber",
  "managerWorkEmail",
  "location",
  "employmentType",
  "employeeCategory",
  "status",
  "startDate",
  "probationEndDate",
  "contractEndDate",
] as const;

export type AllowedImportField = (typeof ALLOWLISTED_IMPORT_FIELDS)[number];

const FORBIDDEN_SENSITIVE_FIELD_PATTERNS = [
  "nationalid",
  "idnumber",
  "passport",
  "krapin",
  "taxpin",
  "nssf",
  "nhif",
  "shano",
  "shif",
  "basesalary",
  "salary",
  "grosspay",
  "allowances",
  "bankaccount",
  "accountnumber",
  "bankname",
  "iban",
  "swift",
  "mpesa",
];

function normalizeKey(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function isSensitiveForbiddenHeader(headerOrField: string): boolean {
  const norm = normalizeKey(headerOrField);
  return FORBIDDEN_SENSITIVE_FIELD_PATTERNS.some((pattern) => norm.includes(pattern));
}

function isValidIsoCalendarDate(value: string): boolean {
  if (!STRICT_ISO_DATE_RE.test(value)) return false;
  const [yStr, mStr, dStr] = value.split("-");
  const y = Number(yStr);
  const m = Number(mStr);
  const d = Number(dStr);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return (
    dt.getUTCFullYear() === y &&
    dt.getUTCMonth() + 1 === m &&
    dt.getUTCDate() === d
  );
}

function signImportToken(payload: {
  batchId: string;
  organizationId: string;
  userId: string;
  sourceHashSha256: string;
  expiresAtIso: string;
}): { token: string; tokenDigest: string } {
  const rawTokenPayload = `${payload.batchId}:${payload.organizationId}:${payload.userId}:${payload.sourceHashSha256}:${payload.expiresAtIso}`;
  const signature = createHmac("sha256", RUNTIME_HMAC_SECRET)
    .update(rawTokenPayload)
    .digest("hex");
  const token = `${payload.batchId}.${signature}`;
  const tokenDigest = createHash("sha256").update(token).digest("hex");
  return { token, tokenDigest };
}

export interface ImportRowValidationResult {
  rowNumber: number;
  status: "VALID" | "DUPLICATE" | "ERROR";
  raw: Record<string, string>;
  normalized: {
    employeeNumber: string;
    firstName: string;
    lastName: string;
    preferredName: string | null;
    workEmail: string;
    personalEmail: string | null;
    phone: string | null;
    jobTitle: string;
    departmentId: string;
    departmentCode: string;
    positionId: string | null;
    positionCode: string | null;
    managerId: string | null;
    managerRef: string | null;
    location: string;
    employmentType: "permanent" | "fixed_term" | "casual" | "intern";
    employeeCategory: string | null;
    status: "active" | "probation" | "on_leave";
    startDate: string;
    probationEndDate: string | null;
    contractEndDate: string | null;
  } | null;
  errors: string[];
  warnings: string[];
}

export function getImportTemplate(kind: "standard" | "starter_guide") {
  if (kind === "starter_guide") {
    return {
      fileName: "rekker-peopleos-employee-import-guide.md",
      mimeType: "text/markdown",
      content: [
        "# Rekker PeopleOS Bulk Employee Import Guide",
        "",
        "## Allowed Columns",
        "- `employeeNumber` (Required, unique per organization, e.g. `REK-0201`)",
        "- `firstName`, `lastName` (Required)",
        "- `preferredName` (Optional)",
        "- `workEmail` (Required, valid unique email)",
        "- `personalEmail`, `phone` (Optional)",
        "- `jobTitle` (Required)",
        "- `departmentCode` (Required unless `departmentName` is mapped; must match an existing department code in your organization such as `MFG`, `DIST`, `BRAND`, `PEOPLE`, `FIN`)",
        "- `positionCode` (Optional; must match an approved or vacant position code)",
        "- `managerEmployeeNumber` or `managerWorkEmail` (Optional; resolved within your organization)",
        "- `location` (Required)",
        "- `employmentType` (Required: `permanent`, `fixed_term`, `casual`, or `intern`)",
        "- `status` (Optional: `active`, `probation`, or `on_leave`)",
        "- `startDate` (Required: `YYYY-MM-DD`)",
        "- `probationEndDate`, `contractEndDate` (Optional: `YYYY-MM-DD`)",
        "",
        "## Security Policy",
        "Sensitive statutory identifiers (`nationalId`, `kraPin`, `nssfNo`, `shaNo`), bank accounts, and salary figures are strictly blocked from general bulk CSV imports.",
      ].join("\n"),
    };
  }

  const headers = [
    "employeeNumber",
    "firstName",
    "lastName",
    "preferredName",
    "workEmail",
    "phone",
    "jobTitle",
    "departmentCode",
    "positionCode",
    "managerEmployeeNumber",
    "location",
    "employmentType",
    "status",
    "startDate",
    "probationEndDate",
    "contractEndDate",
  ];
  const sampleRows = [
    {
      employeeNumber: "REK-0201",
      firstName: "Grace",
      lastName: "Muthoni",
      preferredName: "Grace",
      workEmail: "grace.muthoni@rekker.co.ke",
      phone: "+254712345678",
      jobTitle: "Packaging Shift Technician",
      departmentCode: "MFG",
      positionCode: "",
      managerEmployeeNumber: "REK-0101",
      location: "Nairobi Production Facility",
      employmentType: "permanent",
      status: "probation",
      startDate: "2026-05-01",
      probationEndDate: "2026-07-31",
      contractEndDate: "",
    },
  ];
  return {
    fileName: "rekker-peopleos-employee-import-template.csv",
    mimeType: "text/csv",
    content: serializeSafeCsv(headers, sampleRows),
  };
}

export async function listMappingProfiles(organizationId: string) {
  if (process.env.DATABASE_URL) {
    return db
      .select()
      .from(employeeImportMappingProfilesTable)
      .where(eq(employeeImportMappingProfilesTable.organizationId, organizationId))
      .orderBy(desc(employeeImportMappingProfilesTable.updatedAt));
  }
  return phase2MemoryStore.importMappingProfiles
    .filter((p) => p.organizationId === organizationId)
    .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
}

export async function saveMappingProfile(params: {
  organizationId: string;
  actorUserId: string;
  name: string;
  description?: string | null;
  mapping: Record<string, string>;
}): Promise<EmployeeImportMappingProfileRecord> {
  // Validate mapping keys/targets against sensitive fields & allowlist
  const cleanMapping: Record<string, string> = {};
  for (const [csvCol, targetField] of Object.entries(params.mapping)) {
    if (!targetField || targetField === "__ignore__") continue;
    if (isSensitiveForbiddenHeader(csvCol) || isSensitiveForbiddenHeader(targetField)) {
      throw new Error(
        `Sensitive statutory/salary/bank field '${csvCol}' -> '${targetField}' is prohibited in bulk CSV mapping.`,
      );
    }
    if (!ALLOWLISTED_IMPORT_FIELDS.includes(targetField as AllowedImportField)) {
      throw new Error(`Unsupported target import field '${targetField}'.`);
    }
    cleanMapping[csvCol] = targetField;
  }

  if (process.env.DATABASE_URL) {
    const existing = await db
      .select()
      .from(employeeImportMappingProfilesTable)
      .where(
        and(
          eq(employeeImportMappingProfilesTable.organizationId, params.organizationId),
          eq(employeeImportMappingProfilesTable.name, params.name.trim()),
        ),
      )
      .limit(1);

    if (existing[0]) {
      const [updated] = await db
        .update(employeeImportMappingProfilesTable)
        .set({
          description: params.description ?? null,
          mappingJson: JSON.stringify(cleanMapping),
        })
        .where(eq(employeeImportMappingProfilesTable.id, existing[0].id))
        .returning();
      return updated!;
    }

    const [created] = await db
      .insert(employeeImportMappingProfilesTable)
      .values({
        organizationId: params.organizationId,
        name: params.name.trim(),
        description: params.description ?? null,
        mappingJson: JSON.stringify(cleanMapping),
        createdByUserId: params.actorUserId,
      })
      .returning();
    return created!;
  }

  const now = new Date();
  const existing = phase2MemoryStore.importMappingProfiles.find(
    (p) => p.organizationId === params.organizationId && p.name === params.name.trim(),
  );
  if (existing) {
    existing.description = params.description ?? null;
    existing.mappingJson = JSON.stringify(cleanMapping);
    existing.updatedAt = now;
    return existing;
  }
  const created: EmployeeImportMappingProfileRecord = {
    id: randomUUID(),
    organizationId: params.organizationId,
    name: params.name.trim(),
    description: params.description ?? null,
    mappingJson: JSON.stringify(cleanMapping),
    createdByUserId: params.actorUserId,
    createdAt: now,
    updatedAt: now,
  };
  phase2MemoryStore.importMappingProfiles.push(created);
  return created;
}

function resolveDefaultColumnMapping(headers: string[]): Record<string, string> {
  const autoMap: Record<string, string> = {};
  const aliasMap = new Map<string, AllowedImportField>([
    ["employeenumber", "employeeNumber"],
    ["empno", "employeeNumber"],
    ["staffnumber", "employeeNumber"],
    ["staffid", "employeeNumber"],
    ["firstname", "firstName"],
    ["givenname", "firstName"],
    ["lastname", "lastName"],
    ["surname", "lastName"],
    ["familyname", "lastName"],
    ["preferredname", "preferredName"],
    ["workemail", "workEmail"],
    ["email", "workEmail"],
    ["personalemail", "personalEmail"],
    ["phone", "phone"],
    ["phonenumber", "phone"],
    ["mobile", "phone"],
    ["jobtitle", "jobTitle"],
    ["role", "jobTitle"],
    ["title", "jobTitle"],
    ["departmentcode", "departmentCode"],
    ["deptcode", "departmentCode"],
    ["department", "departmentCode"],
    ["departmentname", "departmentName"],
    ["positioncode", "positionCode"],
    ["manageremployeenumber", "managerEmployeeNumber"],
    ["managerempno", "managerEmployeeNumber"],
    ["managernumber", "managerEmployeeNumber"],
    ["managerworkemail", "managerWorkEmail"],
    ["manageremail", "managerWorkEmail"],
    ["location", "location"],
    ["worklocation", "location"],
    ["employmenttype", "employmentType"],
    ["employeecategory", "employeeCategory"],
    ["category", "employeeCategory"],
    ["status", "status"],
    ["startdate", "startDate"],
    ["hiredate", "startDate"],
    ["probationenddate", "probationEndDate"],
    ["contractenddate", "contractEndDate"],
  ]);

  for (const h of headers) {
    const norm = normalizeKey(h);
    const matched = aliasMap.get(norm);
    if (matched) {
      autoMap[h] = matched;
    }
  }
  return autoMap;
}

export async function previewAndStageImportBatch(params: {
  organizationId: string;
  actorUserId: string;
  actorName: string;
  csvText: string;
  fileName?: string;
  columnMapping?: Record<string, string>;
  demoDepartments: Array<{ id: string; code: string; name: string }>;
  demoEmployees: Array<{
    id: string;
    employeeNumber: string;
    firstName: string;
    lastName: string;
    workEmail: string;
    managerId: string | null;
    status: string;
  }>;
}) {
  const parsed = parseRfc4180Csv(params.csvText);
  if (parsed.fatalError) {
    return { ok: false as const, error: parsed.fatalError, diagnostics: parsed.diagnostics };
  }

  // Reject any sensitive statutory/salary/bank column headers immediately
  const forbiddenHeaders = parsed.headers.filter((h) => isSensitiveForbiddenHeader(h));
  if (forbiddenHeaders.length > 0) {
    return {
      ok: false as const,
      error: `Bulk CSV import prohibits statutory IDs, salary, or bank columns: ${forbiddenHeaders.join(", ")}. Please remove those columns and manage statutory/compensation fields via secure payroll/onboarding workflows.`,
      diagnostics: forbiddenHeaders.map((h) => ({
        rowNumber: 1,
        code: "SENSITIVE_COLUMN_DISALLOWED",
        message: `Forbidden column header '${h}'`,
      })),
    };
  }

  const effectiveMapping =
    params.columnMapping && Object.keys(params.columnMapping).length > 0
      ? { ...resolveDefaultColumnMapping(parsed.headers), ...params.columnMapping }
      : resolveDefaultColumnMapping(parsed.headers);

  // Also check explicitly mapped values for forbidden or invalid targets
  for (const [csvHeader, targetField] of Object.entries(effectiveMapping)) {
    if (!targetField || targetField === "__ignore__") continue;
    if (isSensitiveForbiddenHeader(targetField) || isSensitiveForbiddenHeader(csvHeader)) {
      return {
        ok: false as const,
        error: `Sensitive field mapping '${csvHeader}' -> '${targetField}' is prohibited.`,
        diagnostics: [
          {
            rowNumber: 1,
            code: "SENSITIVE_COLUMN_DISALLOWED",
            message: `Sensitive field '${targetField}' cannot be bulk imported.`,
          },
        ],
      };
    }
    if (!ALLOWLISTED_IMPORT_FIELDS.includes(targetField as AllowedImportField)) {
      return {
        ok: false as const,
        error: `Invalid target field '${targetField}' in column mapping.`,
        diagnostics: [
          {
            rowNumber: 1,
            code: "UNSUPPORTED_MAPPING_TARGET",
            message: `Unsupported mapping target '${targetField}'.`,
          },
        ],
      };
    }
  }

  // Load org departments, existing employees, and positions strictly scoped to organizationId
  const orgDepartments = process.env.DATABASE_URL
    ? await db
        .select({ id: departmentsTable.id, code: departmentsTable.code, name: departmentsTable.name })
        .from(departmentsTable)
        .where(eq(departmentsTable.organizationId, params.organizationId))
    : params.demoDepartments;

  const orgEmployees = process.env.DATABASE_URL
    ? await db
        .select({
          id: employeesTable.id,
          employeeNumber: employeesTable.employeeNumber,
          firstName: employeesTable.firstName,
          lastName: employeesTable.lastName,
          workEmail: employeesTable.workEmail,
          managerId: employeesTable.managerId,
          status: employeesTable.status,
        })
        .from(employeesTable)
        .where(eq(employeesTable.organizationId, params.organizationId))
    : params.demoEmployees;

  const orgPositions = process.env.DATABASE_URL
    ? await db
        .select()
        .from(positionsTable)
        .where(eq(positionsTable.organizationId, params.organizationId))
    : phase2MemoryStore.positions.filter((p) => p.organizationId === params.organizationId);

  const deptByCode = new Map(orgDepartments.map((d) => [d.code.toUpperCase(), d]));
  const deptByName = new Map(orgDepartments.map((d) => [d.name.toLowerCase(), d]));
  const empByNumber = new Map(orgEmployees.map((e) => [e.employeeNumber.toUpperCase(), e]));
  const empByEmail = new Map(orgEmployees.map((e) => [e.workEmail.toLowerCase(), e]));
  const posByCode = new Map(orgPositions.map((p) => [p.positionCode.toUpperCase(), p]));

  const existingNumbers = new Set(orgEmployees.map((e) => e.employeeNumber.toUpperCase()));
  const existingEmails = new Set(orgEmployees.map((e) => e.workEmail.toLowerCase()));
  const seenNumbersInFile = new Set<string>();
  const seenEmailsInFile = new Set<string>();

  const diagnosticMap = new Map<number, string[]>();
  for (const diag of parsed.diagnostics) {
    const arr = diagnosticMap.get(diag.rowNumber) ?? [];
    arr.push(diag.message);
    diagnosticMap.set(diag.rowNumber, arr);
  }

  // First pass: field & org-entity validation (defer cross-row manager resolution slightly or track pending)
  const intermediateRows: ImportRowValidationResult[] = [];
  const validInBatchByEmpNo = new Map<string, { tempId: string; rowNumber: number }>();
  const validInBatchByEmail = new Map<string, { tempId: string; rowNumber: number }>();

  for (const row of parsed.rows) {
    const mapped: Record<string, string> = {};
    for (const [csvHeader, value] of Object.entries(row.record)) {
      const target = effectiveMapping[csvHeader];
      if (target && target !== "__ignore__") {
        mapped[target] = sanitizeText(value, 240);
      }
    }

    const errors: string[] = [...(diagnosticMap.get(row.rowNumber) ?? [])];
    const warnings: string[] = [];

    const employeeNumber = (mapped.employeeNumber ?? "").trim().toUpperCase();
    const firstName = (mapped.firstName ?? "").trim();
    const lastName = (mapped.lastName ?? "").trim();
    const preferredName = (mapped.preferredName ?? "").trim() || null;
    const workEmail = (mapped.workEmail ?? "").trim().toLowerCase();
    const personalEmail = (mapped.personalEmail ?? "").trim().toLowerCase() || null;
    const phone = (mapped.phone ?? "").trim() || null;
    const jobTitle = (mapped.jobTitle ?? "").trim();
    const deptCodeInput = (mapped.departmentCode ?? "").trim().toUpperCase();
    const deptNameInput = (mapped.departmentName ?? "").trim().toLowerCase();
    const positionCodeInput = (mapped.positionCode ?? "").trim().toUpperCase();
    const managerEmpNoInput = (mapped.managerEmployeeNumber ?? "").trim().toUpperCase();
    const managerEmailInput = (mapped.managerWorkEmail ?? "").trim().toLowerCase();
    const location = (mapped.location ?? "").trim();
    const rawEmploymentType = (mapped.employmentType ?? "").trim().toLowerCase();
    const rawStatus = (mapped.status ?? "active").trim().toLowerCase();
    const employeeCategory = (mapped.employeeCategory ?? "").trim() || null;
    const startDate = (mapped.startDate ?? "").trim();
    const probationEndDate = (mapped.probationEndDate ?? "").trim() || null;
    const contractEndDate = (mapped.contractEndDate ?? "").trim() || null;

    if (!employeeNumber) errors.push("employeeNumber is required.");
    if (!firstName) errors.push("firstName is required.");
    if (!lastName) errors.push("lastName is required.");
    if (!jobTitle) errors.push("jobTitle is required.");
    if (!location) errors.push("location is required.");

    if (!workEmail || !STRICT_EMAIL_RE.test(workEmail)) {
      errors.push("Valid workEmail is required.");
    }
    if (personalEmail && !STRICT_EMAIL_RE.test(personalEmail)) {
      errors.push(`Invalid personalEmail '${personalEmail}'.`);
    }

    // Strict employmentType check (no silent coercion)
    if (!rawEmploymentType || !VALID_EMPLOYMENT_TYPES.has(rawEmploymentType)) {
      errors.push(
        `Invalid employmentType '${mapped.employmentType ?? ""}'. Allowed: permanent, fixed_term, casual, intern.`,
      );
    }

    if (!VALID_IMPORT_STATUSES.has(rawStatus)) {
      errors.push(
        `Invalid status '${mapped.status ?? ""}'. Allowed: active, probation, on_leave.`,
      );
    }

    if (!startDate || !isValidIsoCalendarDate(startDate)) {
      errors.push(`Invalid or missing startDate '${startDate}'. Must be YYYY-MM-DD.`);
    }
    if (probationEndDate && !isValidIsoCalendarDate(probationEndDate)) {
      errors.push(`Invalid probationEndDate '${probationEndDate}'. Must be YYYY-MM-DD.`);
    } else if (probationEndDate && startDate && probationEndDate < startDate) {
      errors.push("probationEndDate cannot precede startDate.");
    }

    if (contractEndDate && !isValidIsoCalendarDate(contractEndDate)) {
      errors.push(`Invalid contractEndDate '${contractEndDate}'. Must be YYYY-MM-DD.`);
    } else if (contractEndDate && startDate && contractEndDate < startDate) {
      errors.push("contractEndDate cannot precede startDate.");
    }
    if (rawEmploymentType === "fixed_term" && !contractEndDate) {
      warnings.push("Fixed-term contract is missing contractEndDate.");
    }

    // Strict Department Resolution (no silent depts[0] fallback!)
    let resolvedDept = deptCodeInput ? deptByCode.get(deptCodeInput) : undefined;
    if (!resolvedDept && deptNameInput) {
      resolvedDept = deptByName.get(deptNameInput);
    }
    if (!resolvedDept) {
      errors.push(
        deptCodeInput || deptNameInput
          ? `Department '${deptCodeInput || deptNameInput}' does not exist in this organization.`
          : "departmentCode (or departmentName) is required and must match an existing department.",
      );
    }

    // Optional Position Resolution
    let resolvedPosition: (typeof orgPositions)[number] | undefined;
    if (positionCodeInput) {
      resolvedPosition = posByCode.get(positionCodeInput);
      if (!resolvedPosition) {
        errors.push(`Position code '${positionCodeInput}' does not exist in this organization.`);
      } else if (["draft", "frozen", "abolished"].includes(resolvedPosition.status)) {
        errors.push(
          `Position '${positionCodeInput}' is '${resolvedPosition.status}' and cannot receive assignments.`,
        );
      } else if (resolvedDept && resolvedPosition.departmentId !== resolvedDept.id) {
        errors.push(
          `Position '${positionCodeInput}' belongs to a different department than '${resolvedDept.code}'.`,
        );
      }
    }

    const isDuplicateInDb =
      (employeeNumber && existingNumbers.has(employeeNumber)) ||
      (workEmail && existingEmails.has(workEmail));
    const isDuplicateInFile =
      (employeeNumber && seenNumbersInFile.has(employeeNumber)) ||
      (workEmail && seenEmailsInFile.has(workEmail));

    if (isDuplicateInDb) {
      errors.push("Duplicate employeeNumber or workEmail already exists in organization.");
    } else if (isDuplicateInFile) {
      errors.push("Duplicate employeeNumber or workEmail within CSV upload.");
    }

    if (employeeNumber) seenNumbersInFile.add(employeeNumber);
    if (workEmail) seenEmailsInFile.add(workEmail);

    const status: "VALID" | "DUPLICATE" | "ERROR" =
      isDuplicateInDb || isDuplicateInFile
        ? "DUPLICATE"
        : errors.length > 0
          ? "ERROR"
          : "VALID";

    // Manager lookup (if manager is in DB or later checked against batch)
    let resolvedManagerId: string | null = null;
    const managerRef = managerEmpNoInput || managerEmailInput || null;
    if (managerEmpNoInput) {
      const m = empByNumber.get(managerEmpNoInput);
      if (m) {
        if (m.status === "former") {
          errors.push(`Assigned manager '${managerEmpNoInput}' is a former employee.`);
        } else {
          resolvedManagerId = m.id;
        }
      }
    } else if (managerEmailInput) {
      const m = empByEmail.get(managerEmailInput);
      if (m) {
        if (m.status === "former") {
          errors.push(`Assigned manager '${managerEmailInput}' is a former employee.`);
        } else {
          resolvedManagerId = m.id;
        }
      }
    }

    if (status === "VALID" && errors.length === 0) {
      const tempId = `batch:${row.rowNumber}`;
      validInBatchByEmpNo.set(employeeNumber, { tempId, rowNumber: row.rowNumber });
      validInBatchByEmail.set(workEmail, { tempId, rowNumber: row.rowNumber });
    }

    const finalStatus: "VALID" | "DUPLICATE" | "ERROR" =
      status === "DUPLICATE" ? "DUPLICATE" : errors.length > 0 ? "ERROR" : "VALID";

    intermediateRows.push({
      rowNumber: row.rowNumber,
      status: finalStatus,
      raw: row.record,
      normalized:
        finalStatus === "VALID" && resolvedDept
          ? {
              employeeNumber,
              firstName,
              lastName,
              preferredName,
              workEmail,
              personalEmail,
              phone,
              jobTitle,
              departmentId: resolvedDept.id,
              departmentCode: resolvedDept.code,
              positionId: resolvedPosition?.id ?? null,
              positionCode: resolvedPosition?.positionCode ?? null,
              managerId: resolvedManagerId,
              managerRef,
              location,
              employmentType: rawEmploymentType as "permanent" | "fixed_term" | "casual" | "intern",
              employeeCategory,
              status: rawStatus as "active" | "probation" | "on_leave",
              startDate,
              probationEndDate,
              contractEndDate,
            }
          : null,
      errors,
      warnings,
    });
  }

  // Second pass: resolve cross-row manager references & detect cycles within CSV
  const batchGraph = new Map<string, HierarchyNodeCandidate>();
  for (const e of orgEmployees) {
    batchGraph.set(e.id, {
      id: e.id,
      organizationId: params.organizationId,
      managerId: e.managerId,
      status: e.status,
    });
  }
  for (const r of intermediateRows) {
    if (r.status === "VALID" && r.normalized) {
      const selfId = `batch:${r.rowNumber}`;
      let mgrId = r.normalized.managerId;
      if (!mgrId && r.normalized.managerRef) {
        const ref = r.normalized.managerRef;
        const foundInBatch =
          validInBatchByEmpNo.get(ref.toUpperCase()) ??
          validInBatchByEmail.get(ref.toLowerCase());
        if (foundInBatch) {
          mgrId = foundInBatch.tempId;
          r.normalized.managerId = mgrId;
        }
      }
      batchGraph.set(selfId, {
        id: selfId,
        organizationId: params.organizationId,
        managerId: mgrId,
        status: r.normalized.status,
      });
    }
  }

  for (const r of intermediateRows) {
    if (r.status === "VALID" && r.normalized?.managerRef) {
      if (!r.normalized.managerId) {
        r.status = "ERROR";
        r.errors.push(
          `Manager '${r.normalized.managerRef}' was not found in organization or valid import batch.`,
        );
        r.normalized = null;
        continue;
      }
      try {
        assertValidManagerAssignment({
          organizationId: params.organizationId,
          employeeId: `batch:${r.rowNumber}`,
          managerId: r.normalized.managerId,
          employeesById: batchGraph,
        });
      } catch (err) {
        r.status = "ERROR";
        r.errors.push(err instanceof Error ? err.message : "Invalid manager cycle detected.");
        r.normalized = null;
      }
    }
  }

  const validCount = intermediateRows.filter((r) => r.status === "VALID").length;
  const duplicateCount = intermediateRows.filter((r) => r.status === "DUPLICATE").length;
  const errorCount = intermediateRows.filter((r) => r.status === "ERROR").length;

  const batchId = randomUUID();
  const sourceHashSha256 = createHash("sha256").update(params.csvText, "utf8").digest("hex");
  const expiresAt = new Date(Date.now() + BATCH_TTL_MS);
  const { token, tokenDigest } = signImportToken({
    batchId,
    organizationId: params.organizationId,
    userId: params.actorUserId,
    sourceHashSha256,
    expiresAtIso: expiresAt.toISOString(),
  });
  const state = validCount > 0 ? "READY_FOR_COMMIT" : "VALIDATED";

  if (process.env.DATABASE_URL) {
    await db.transaction(async (tx) => {
      await tx.insert(employeeImportBatchesTable).values({
        id: batchId,
        organizationId: params.organizationId,
        createdByUserId: params.actorUserId,
        fileName: params.fileName || "bulk-import.csv",
        sourceHashSha256,
        mappingJson: JSON.stringify(effectiveMapping),
        state,
        totalRows: intermediateRows.length,
        validCount,
        duplicateCount,
        errorCount,
        importedCount: 0,
        tokenDigest,
        expiresAt,
        summaryJson: JSON.stringify({
          headers: parsed.headers,
        }),
      });

      if (intermediateRows.length > 0) {
        await tx.insert(employeeImportRowsTable).values(
          intermediateRows.map((r) => ({
            batchId,
            organizationId: params.organizationId,
            rowNumber: r.rowNumber,
            status: r.status,
            rawJson: JSON.stringify(r.raw),
            normalizedJson: r.normalized ? JSON.stringify(r.normalized) : null,
            errorsJson: JSON.stringify(r.errors),
            warningsJson: JSON.stringify(r.warnings),
          })),
        );
      }
    });
  } else {
    const batchRecord: EmployeeImportBatchRecord = {
      id: batchId,
      organizationId: params.organizationId,
      createdByUserId: params.actorUserId,
      fileName: params.fileName || "bulk-import.csv",
      sourceHashSha256,
      mappingJson: JSON.stringify(effectiveMapping),
      state,
      totalRows: intermediateRows.length,
      validCount,
      duplicateCount,
      errorCount,
      importedCount: 0,
      tokenDigest,
      expiresAt,
      committedAt: null,
      committedByUserId: null,
      summaryJson: JSON.stringify({ headers: parsed.headers }),
      createdAt: new Date(),
    };
    phase2MemoryStore.importBatches.push(batchRecord);

    for (const r of intermediateRows) {
      phase2MemoryStore.importRows.push({
        id: randomUUID(),
        batchId,
        organizationId: params.organizationId,
        rowNumber: r.rowNumber,
        status: r.status,
        rawJson: JSON.stringify(r.raw),
        normalizedJson: r.normalized ? JSON.stringify(r.normalized) : null,
        errorsJson: JSON.stringify(r.errors),
        warningsJson: JSON.stringify(r.warnings),
        committedEmployeeId: null,
      });
    }
  }

  return {
    ok: true as const,
    batchId,
    importToken: token,
    state,
    expiresAt: expiresAt.toISOString(),
    sourceHashSha256,
    headers: parsed.headers,
    mapping: effectiveMapping,
    totalRows: intermediateRows.length,
    validCount,
    duplicateCount,
    errorCount,
    rows: intermediateRows.map((r) => ({
      rowNumber: r.rowNumber,
      employeeNumber: r.normalized?.employeeNumber ?? r.raw.employeeNumber ?? "",
      fullName: r.normalized
        ? `${r.normalized.firstName} ${r.normalized.lastName}`
        : `${r.raw.firstName ?? ""} ${r.raw.lastName ?? ""}`.trim(),
      workEmail: r.normalized?.workEmail ?? r.raw.workEmail ?? "",
      departmentCode: r.normalized?.departmentCode ?? r.raw.departmentCode ?? "",
      employmentType: r.normalized?.employmentType ?? r.raw.employmentType ?? "",
      status: r.status,
      errors: r.errors,
      warnings: r.warnings,
    })),
  };
}

function verifyImportToken(params: {
  token: string;
  batch: EmployeeImportBatchRecord;
  actorUserId: string;
}): { valid: boolean; reason?: string } {
  const { token, batch, actorUserId } = params;
  if (!token || !token.includes(".")) {
    return { valid: false, reason: "Malformed import verification token." };
  }
  const [tokenBatchId] = token.split(".");
  if (tokenBatchId !== batch.id) {
    return { valid: false, reason: "Import token does not match requested batchId." };
  }
  if (batch.createdByUserId !== actorUserId) {
    return {
      valid: false,
      reason: "Import batch belongs to a different user and cannot be committed across sessions.",
    };
  }
  if (batch.state !== "READY_FOR_COMMIT") {
    return {
      valid: false,
      reason: `Batch is in state '${batch.state}' and is not ready for commit.`,
    };
  }
  if (new Date() > new Date(batch.expiresAt)) {
    return { valid: false, reason: "Import preview token has expired; please re-validate." };
  }

  const providedDigest = createHash("sha256").update(token).digest("hex");
  const expectedBuf = Buffer.from(batch.tokenDigest, "hex");
  const providedBuf = Buffer.from(providedDigest, "hex");
  if (expectedBuf.length !== providedBuf.length || !timingSafeEqual(expectedBuf, providedBuf)) {
    return { valid: false, reason: "Import token signature verification failed." };
  }
  return { valid: true };
}

export async function commitImportBatch(params: {
  organizationId: string;
  actorUserId: string;
  actorName: string;
  batchId: string;
  importToken: string;
  demoEmployees: Array<any>;
  demoDepartments: Array<{ id: string; code: string; name: string }>;
}) {
  if (process.env.DATABASE_URL) {
    const [batch] = await db
      .select()
      .from(employeeImportBatchesTable)
      .where(
        and(
          eq(employeeImportBatchesTable.id, params.batchId),
          eq(employeeImportBatchesTable.organizationId, params.organizationId),
        ),
      )
      .limit(1);

    if (!batch) {
      return { ok: false as const, statusCode: 404, error: "Import batch not found." };
    }

    const check = verifyImportToken({
      token: params.importToken,
      batch,
      actorUserId: params.actorUserId,
    });
    if (!check.valid) {
      return {
        ok: false as const,
        statusCode: batch.state === "COMMITTED" ? 409 : 400,
        error: check.reason!,
      };
    }

    const rows = await db
      .select()
      .from(employeeImportRowsTable)
      .where(
        and(
          eq(employeeImportRowsTable.batchId, batch.id),
          eq(employeeImportRowsTable.organizationId, params.organizationId),
        ),
      );

    const validRows = rows.filter((r) => r.status === "VALID" && r.normalizedJson);
    if (validRows.length === 0) {
      return {
        ok: false as const,
        statusCode: 400,
        error: "Batch has zero valid rows eligible for commit.",
      };
    }

    const createdIds: string[] = [];
    const batchRowToNewEmpId = new Map<string, string>();

    await db.transaction(async (tx) => {
      // First pass inserts records without cross-batch managerId, then resolves cross-batch managerId
      const insertedList: Array<{
        row: EmployeeImportRowRecord;
        norm: NonNullable<ImportRowValidationResult["normalized"]>;
        empId: string;
      }> = [];

      for (const r of validRows) {
        const norm = JSON.parse(r.normalizedJson!) as NonNullable<
          ImportRowValidationResult["normalized"]
        >;
        const directManagerId =
          norm.managerId && !norm.managerId.startsWith("batch:") ? norm.managerId : null;

        const [created] = await tx
          .insert(employeesTable)
          .values({
            organizationId: params.organizationId,
            employeeNumber: norm.employeeNumber,
            firstName: norm.firstName,
            lastName: norm.lastName,
            preferredName: norm.preferredName,
            workEmail: norm.workEmail,
            personalEmail: norm.personalEmail,
            phone: norm.phone,
            jobTitle: norm.jobTitle,
            departmentId: norm.departmentId,
            positionId: norm.positionId,
            managerId: directManagerId,
            location: norm.location,
            employmentType: norm.employmentType,
            employeeCategory: norm.employeeCategory ?? "staff",
            status: norm.status,
            startDate: norm.startDate,
            probationEndDate: norm.probationEndDate,
            contractEndDate: norm.contractEndDate,
            isDemo: false,
          })
          .returning();

        const empId = created!.id;
        createdIds.push(empId);
        batchRowToNewEmpId.set(`batch:${r.rowNumber}`, empId);
        insertedList.push({ row: r, norm, empId });

        await tx
          .update(employeeImportRowsTable)
          .set({ committedEmployeeId: empId })
          .where(eq(employeeImportRowsTable.id, r.id));

        await recordAssignmentHistoryEntry({
          organizationId: params.organizationId,
          employeeId: empId,
          effectiveDate: norm.startDate,
          changeType: "bulk_import",
          departmentId: norm.departmentId,
          positionId: norm.positionId,
          managerId: directManagerId,
          jobTitle: norm.jobTitle,
          location: norm.location,
          employmentType: norm.employmentType,
          status: norm.status,
          reason: `Bulk CSV import batch ${batch.id}`,
          approvedByUserId: params.actorUserId,
          changedByUserId: params.actorUserId,
          tx: tx as unknown as typeof db,
        });
      }

      // Resolve intra-batch manager references
      for (const item of insertedList) {
        if (item.norm.managerId && item.norm.managerId.startsWith("batch:")) {
          const resolvedId = batchRowToNewEmpId.get(item.norm.managerId) ?? null;
          if (resolvedId) {
            await tx
              .update(employeesTable)
              .set({ managerId: resolvedId })
              .where(eq(employeesTable.id, item.empId));
          }
        }
      }

      await tx
        .update(employeeImportBatchesTable)
        .set({
          state: "COMMITTED",
          importedCount: createdIds.length,
          committedAt: new Date(),
          committedByUserId: params.actorUserId,
        })
        .where(eq(employeeImportBatchesTable.id, batch.id));

      await recordAuditEvent({
        organizationId: params.organizationId,
        actorUserId: params.actorUserId,
        actor: params.actorName,
        action: "employees.bulk_import_committed",
        targetType: "employee_import_batch",
        targetId: batch.id,
        summary: `Committed bulk CSV batch ${batch.fileName}: ${createdIds.length} imported, ${batch.duplicateCount} duplicates, ${batch.errorCount} errors.`,
        critical: true,
        tx: tx as unknown as typeof db,
      });
    });

    return {
      ok: true as const,
      batchId: batch.id,
      state: "COMMITTED",
      importedCount: createdIds.length,
      skippedDuplicatesCount: batch.duplicateCount,
      errorCount: batch.errorCount,
      createdIds,
    };
  }

  // Sandbox / offline mode
  const batch = phase2MemoryStore.importBatches.find(
    (b) => b.id === params.batchId && b.organizationId === params.organizationId,
  );
  if (!batch) {
    return { ok: false as const, statusCode: 404, error: "Import batch not found." };
  }

  const check = verifyImportToken({
    token: params.importToken,
    batch,
    actorUserId: params.actorUserId,
  });
  if (!check.valid) {
    return {
      ok: false as const,
      statusCode: batch.state === "COMMITTED" ? 409 : 400,
      error: check.reason!,
    };
  }

  const rows = phase2MemoryStore.importRows.filter(
    (r) => r.batchId === batch.id && r.organizationId === params.organizationId,
  );
  const validRows = rows.filter((r) => r.status === "VALID" && r.normalizedJson);
  if (validRows.length === 0) {
    return {
      ok: false as const,
      statusCode: 400,
      error: "Batch has zero valid rows eligible for commit.",
    };
  }

  const createdIds: string[] = [];
  const batchRowToNewEmpId = new Map<string, string>();
  const stagedCreates: Array<{ rec: any; norm: NonNullable<ImportRowValidationResult["normalized"]>; row: EmployeeImportRowRecord }> = [];

  for (const r of validRows) {
    const norm = JSON.parse(r.normalizedJson!) as NonNullable<
      ImportRowValidationResult["normalized"]
    >;
    const dept = params.demoDepartments.find((d) => d.id === norm.departmentId);
    const id = randomUUID();
    const directMgrId =
      norm.managerId && !norm.managerId.startsWith("batch:") ? norm.managerId : null;
    const directMgr = directMgrId
      ? params.demoEmployees.find((e) => e.id === directMgrId)
      : null;

    const rec = {
      id,
      employeeNumber: norm.employeeNumber,
      firstName: norm.firstName,
      lastName: norm.lastName,
      preferredName: norm.preferredName,
      workEmail: norm.workEmail,
      phone: norm.phone,
      jobTitle: norm.jobTitle,
      departmentId: norm.departmentId,
      departmentName: dept?.name ?? norm.departmentCode,
      managerId: directMgrId,
      managerName: directMgr ? `${directMgr.firstName} ${directMgr.lastName}` : null,
      location: norm.location,
      employmentType: norm.employmentType,
      status: norm.status,
      startDate: norm.startDate,
      probationEndDate: norm.probationEndDate,
      contractEndDate: norm.contractEndDate,
      isDemo: true,
    };

    params.demoEmployees.push(rec);
    phase2MemoryStore.employeeExtras.set(id, {
      personalEmail: norm.personalEmail,
      positionId: norm.positionId,
      employeeCategory: norm.employeeCategory ?? "staff",
      timezone: "Africa/Nairobi",
    });

    createdIds.push(id);
    batchRowToNewEmpId.set(`batch:${r.rowNumber}`, id);
    stagedCreates.push({ rec, norm, row: r });
  }

  for (const item of stagedCreates) {
    if (item.norm.managerId && item.norm.managerId.startsWith("batch:")) {
      const resolvedId = batchRowToNewEmpId.get(item.norm.managerId) ?? null;
      if (resolvedId) {
        item.rec.managerId = resolvedId;
        const m = params.demoEmployees.find((e) => e.id === resolvedId);
        item.rec.managerName = m ? `${m.firstName} ${m.lastName}` : null;
      }
    }
    item.row.committedEmployeeId = item.rec.id;
    await recordAssignmentHistoryEntry({
      organizationId: params.organizationId,
      employeeId: item.rec.id,
      effectiveDate: item.norm.startDate,
      changeType: "bulk_import",
      departmentId: item.norm.departmentId,
      positionId: item.norm.positionId,
      managerId: item.rec.managerId,
      jobTitle: item.norm.jobTitle,
      location: item.norm.location,
      employmentType: item.norm.employmentType,
      status: item.norm.status,
      reason: `Bulk CSV import batch ${batch.id}`,
      approvedByUserId: params.actorUserId,
      changedByUserId: params.actorUserId,
    });
  }

  batch.state = "COMMITTED";
  batch.importedCount = createdIds.length;
  batch.committedAt = new Date();
  batch.committedByUserId = params.actorUserId;

  await recordAuditEvent({
    organizationId: params.organizationId,
    actorUserId: params.actorUserId,
    actor: params.actorName,
    action: "employees.bulk_import_committed",
    targetType: "employee_import_batch",
    targetId: batch.id,
    summary: `Committed bulk CSV batch ${batch.fileName}: ${createdIds.length} imported, ${batch.duplicateCount} duplicates, ${batch.errorCount} errors.`,
    critical: true,
    isDemo: true,
  });

  return {
    ok: true as const,
    batchId: batch.id,
    state: "COMMITTED",
    importedCount: createdIds.length,
    skippedDuplicatesCount: batch.duplicateCount,
    errorCount: batch.errorCount,
    createdIds,
  };
}

export async function listImportBatches(organizationId: string) {
  if (process.env.DATABASE_URL) {
    return db
      .select({
        id: employeeImportBatchesTable.id,
        fileName: employeeImportBatchesTable.fileName,
        state: employeeImportBatchesTable.state,
        totalRows: employeeImportBatchesTable.totalRows,
        validCount: employeeImportBatchesTable.validCount,
        duplicateCount: employeeImportBatchesTable.duplicateCount,
        errorCount: employeeImportBatchesTable.errorCount,
        importedCount: employeeImportBatchesTable.importedCount,
        createdByUserId: employeeImportBatchesTable.createdByUserId,
        expiresAt: employeeImportBatchesTable.expiresAt,
        committedAt: employeeImportBatchesTable.committedAt,
        createdAt: employeeImportBatchesTable.createdAt,
      })
      .from(employeeImportBatchesTable)
      .where(eq(employeeImportBatchesTable.organizationId, organizationId))
      .orderBy(desc(employeeImportBatchesTable.createdAt))
      .limit(50);
  }

  return phase2MemoryStore.importBatches
    .filter((b) => b.organizationId === organizationId)
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    .map((b) => ({
      id: b.id,
      fileName: b.fileName,
      state: b.state,
      totalRows: b.totalRows,
      validCount: b.validCount,
      duplicateCount: b.duplicateCount,
      errorCount: b.errorCount,
      importedCount: b.importedCount,
      createdByUserId: b.createdByUserId,
      expiresAt: b.expiresAt,
      committedAt: b.committedAt,
      createdAt: b.createdAt,
    }));
}

export async function getImportBatchErrorsCsv(organizationId: string, batchId: string) {
  let batch: EmployeeImportBatchRecord | undefined;
  let rows: EmployeeImportRowRecord[] = [];

  if (process.env.DATABASE_URL) {
    const [foundBatch] = await db
      .select()
      .from(employeeImportBatchesTable)
      .where(
        and(
          eq(employeeImportBatchesTable.id, batchId),
          eq(employeeImportBatchesTable.organizationId, organizationId),
        ),
      )
      .limit(1);
    batch = foundBatch;
    if (batch) {
      rows = await db
        .select()
        .from(employeeImportRowsTable)
        .where(
          and(
            eq(employeeImportRowsTable.batchId, batchId),
            eq(employeeImportRowsTable.organizationId, organizationId),
          ),
        );
    }
  } else {
    batch = phase2MemoryStore.importBatches.find(
      (b) => b.id === batchId && b.organizationId === organizationId,
    );
    if (batch) {
      rows = phase2MemoryStore.importRows.filter(
        (r) => r.batchId === batchId && r.organizationId === organizationId,
      );
    }
  }

  if (!batch) return null;

  const failedRows = rows.filter((r) => r.status !== "VALID");
  const exportRows = failedRows.map((r) => {
    const raw = JSON.parse(r.rawJson) as Record<string, string>;
    const errs = JSON.parse(r.errorsJson) as string[];
    const warns = JSON.parse(r.warningsJson) as string[];
    return {
      rowNumber: r.rowNumber,
      status: r.status,
      employeeNumber: raw.employeeNumber ?? "",
      workEmail: raw.workEmail ?? "",
      firstName: raw.firstName ?? "",
      lastName: raw.lastName ?? "",
      errors: errs.join("; "),
      warnings: warns.join("; "),
    };
  });

  const csv = serializeSafeCsv(
    [
      "rowNumber",
      "status",
      "employeeNumber",
      "workEmail",
      "firstName",
      "lastName",
      "errors",
      "warnings",
    ],
    exportRows,
  );

  return {
    fileName: `import-errors-${batch.id.slice(0, 8)}.csv`,
    csv,
    failedCount: exportRows.length,
  };
}

