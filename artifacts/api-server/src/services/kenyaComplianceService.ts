import type { EmployeeRecord } from "@workspace/db";

export interface LegalRuleMetadata {
  code: string;
  title: string;
  statute: string;
  sourceUrl: string;
  effectiveDate: string;
  dateResearched: string;
  summary: string;
  requiresHrLegalReview: boolean;
}

export const KENYA_HR_LEGAL_METADATA: LegalRuleMetadata[] = [
  {
    code: "EMPLOYMENT_ACT_S10_PARTICULARS",
    title: "Written Particulars of Employment",
    statute: "Employment Act, Cap 226 (Kenya), Section 10",
    sourceUrl: "https://new.kenyalaw.org/akn/ke/act/2007/11/eng@2024-04-26",
    effectiveDate: "2008-06-02",
    dateResearched: "2026-11-12",
    summary:
      "Employers must issue a written statement of particulars within 2 months of employment start for contracts of 3 months or longer, covering identity, job title, start date, duration/form, workplace, hours, remuneration, leave entitlement, notice periods, and disciplinary/grievance procedures.",
    requiresHrLegalReview: true,
  },
  {
    code: "EMPLOYMENT_ACT_S28_ANNUAL_LEAVE",
    title: "Annual Leave Statutory Minimum Reference",
    statute: "Employment Act, Cap 226 (Kenya), Section 28",
    sourceUrl: "https://new.kenyalaw.org/akn/ke/act/2007/11/eng@2024-04-26",
    effectiveDate: "2008-06-02",
    dateResearched: "2026-11-12",
    summary:
      "Statutory baseline in Kenya is at least 21 working days of paid annual leave after every 12 consecutive months of service (pro-rated from day 1 at 1.75 days/month). Organization-configured policies are never auto-populated; HR must explicitly configure and approve org policies.",
    requiresHrLegalReview: true,
  },
  {
    code: "EMPLOYMENT_ACT_S42_PROBATION",
    title: "Probationary Contract Rules & Extensions",
    statute: "Employment Act, Cap 226 (Kenya), Sections 2 & 42",
    sourceUrl: "https://new.kenyalaw.org/akn/ke/act/2007/11/eng@2024-04-26",
    effectiveDate: "2008-06-02",
    dateResearched: "2026-11-12",
    summary:
      "Probation must be in writing, may not exceed 6 months initially, and may be extended only once for a further period up to 6 months with employee agreement. Termination during probation requires at least 7 days notice (or pay in lieu) and procedural fairness.",
    requiresHrLegalReview: true,
  },
  {
    code: "DPA_2019_ACCESS_RECTIFICATION_ERASURE",
    title: "Employee Data Subject Rights & Statutory Deadlines",
    statute:
      "Data Protection Act, 2019 §§ 26, 40 & Data Protection (General) Regulations, 2021 Regs 9(4), 10(4), 12(3)",
    sourceUrl:
      "https://www.odpc.go.ke/wp-content/uploads/2022/03/Data-Protection-General-Regulations-2021.pdf",
    effectiveDate: "2022-02-14",
    dateResearched: "2026-11-12",
    summary:
      "Data access requests must be answered within 7 days; rectification within 14 days; erasure within 14 days subject to statutory retention obligations (tax/KRA, NSSF, SHA/SHIF, Employment Act records). Never auto-delete employment records without human legal/retention review.",
    requiresHrLegalReview: true,
  },
];

export interface Section10CompletenessResult {
  employeeId: string;
  employeeNumber: string;
  fullName: string;
  scorePercent: number;
  compliantForChecklist: boolean;
  writtenParticularsDeadline: string | null;
  deadlineApproachingOrPassed: boolean;
  missingFields: Array<{ field: string; label: string; category: string }>;
  presentFieldsCount: number;
  totalRequiredFieldsCount: number;
}

const SECTION_10_CHECKS: Array<{
  field: string;
  label: string;
  category: string;
  check: (emp: EmployeeRecord) => boolean;
}> = [
  {
    field: "fullName",
    label: "Employee legal name (First & Last)",
    category: "Identity",
    check: (e) => Boolean(e.firstName?.trim() && e.lastName?.trim()),
  },
  {
    field: "workEmail",
    label: "Work email / contact address",
    category: "Contact",
    check: (e) => Boolean(e.workEmail?.trim()),
  },
  {
    field: "phone",
    label: "Primary telephone number",
    category: "Contact",
    check: (e) => Boolean(e.phone?.trim()),
  },
  {
    field: "nationalId",
    label: "National ID / Passport reference",
    category: "Statutory Identity",
    check: (e) => Boolean(e.nationalId?.trim()),
  },
  {
    field: "jobTitle",
    label: "Job title & role description",
    category: "Role Particulars",
    check: (e) => Boolean(e.jobTitle?.trim()),
  },
  {
    field: "departmentId",
    label: "Department / functional unit",
    category: "Organization",
    check: (e) => Boolean(e.departmentId),
  },
  {
    field: "startDate",
    label: "Date of commencement",
    category: "Employment Terms",
    check: (e) => Boolean(e.startDate),
  },
  {
    field: "employmentType",
    label: "Form & duration of employment",
    category: "Employment Terms",
    check: (e) => Boolean(e.employmentType?.trim()),
  },
  {
    field: "location",
    label: "Place of work",
    category: "Employment Terms",
    check: (e) => Boolean(e.location?.trim()),
  },
  {
    field: "emergencyContactJson",
    label: "Next-of-kin / emergency contact",
    category: "Welfare & Safety",
    check: (e) => Boolean(e.emergencyContactJson?.trim()),
  },
];

export function addCalendarDaysIso(isoDate: string, days: number): string {
  const base = new Date(`${isoDate}T00:00:00.000Z`);
  if (Number.isNaN(base.getTime())) {
    const fallback = new Date();
    fallback.setUTCDate(fallback.getUTCDate() + days);
    return fallback.toISOString().slice(0, 10);
  }
  base.setUTCDate(base.getUTCDate() + days);
  return base.toISOString().slice(0, 10);
}

export function addMonthsIso(isoDate: string, months: number): string | null {
  const base = new Date(`${isoDate}T00:00:00.000Z`);
  if (Number.isNaN(base.getTime())) return null;
  base.setUTCMonth(base.getUTCMonth() + months);
  return base.toISOString().slice(0, 10);
}

export function evaluateEmployeeSection10Completeness(
  emp: EmployeeRecord,
  options: { hasSignedContractDocument?: boolean } = {},
  todayIso = new Date().toISOString().slice(0, 10),
): Section10CompletenessResult {
  const missingFields: Array<{ field: string; label: string; category: string }> = [];
  let presentCount = 0;

  for (const item of SECTION_10_CHECKS) {
    if (item.check(emp)) {
      presentCount += 1;
    } else {
      missingFields.push({
        field: item.field,
        label: item.label,
        category: item.category,
      });
    }
  }

  // Optional written particulars / contract document check
  const totalCount = SECTION_10_CHECKS.length + 1;
  if (options.hasSignedContractDocument) {
    presentCount += 1;
  } else {
    missingFields.push({
      field: "contractDocument",
      label: "Written contract / Section 10 particulars document",
      category: "Employment Terms",
    });
  }

  const deadline = emp.startDate ? addMonthsIso(emp.startDate, 2) : null;
  const deadlineApproachingOrPassed =
    Boolean(deadline && deadline <= addCalendarDaysIso(todayIso, 14)) &&
    missingFields.length > 0;

  const scorePercent = Math.round((presentCount / totalCount) * 100);

  return {
    employeeId: emp.id,
    employeeNumber: emp.employeeNumber,
    fullName: `${emp.firstName} ${emp.lastName}`.trim(),
    scorePercent,
    compliantForChecklist: missingFields.length === 0,
    writtenParticularsDeadline: deadline,
    deadlineApproachingOrPassed,
    missingFields,
    presentFieldsCount: presentCount,
    totalRequiredFieldsCount: totalCount,
  };
}

export function computePrivacyRequestDueDate(
  requestType: "access" | "rectification" | "erasure" | "restriction",
  submittedIsoDate = new Date().toISOString().slice(0, 10),
): { dueDate: string; slaDays: number; legalBasisReference: string } {
  if (requestType === "access") {
    return {
      dueDate: addCalendarDaysIso(submittedIsoDate, 7),
      slaDays: 7,
      legalBasisReference:
        "Kenya Data Protection Act 2019 s.26 & General Regulations 2021 Reg 9(4) (7-day access SLA)",
    };
  }
  if (requestType === "rectification") {
    return {
      dueDate: addCalendarDaysIso(submittedIsoDate, 14),
      slaDays: 14,
      legalBasisReference:
        "Kenya Data Protection Act 2019 s.40 & General Regulations 2021 Reg 10(4) (14-day rectification SLA)",
    };
  }
  return {
    dueDate: addCalendarDaysIso(submittedIsoDate, 14),
    slaDays: 14,
    legalBasisReference:
      "Kenya Data Protection Act 2019 s.40 & General Regulations 2021 Reg 12(3) (14-day review SLA; statutory tax/NSSF/SHA retention review required)",
  };
}

