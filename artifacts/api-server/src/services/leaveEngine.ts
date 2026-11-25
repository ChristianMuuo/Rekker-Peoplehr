export const KENYA_EMPLOYMENT_ACT_SOURCE =
  "https://new.kenyalaw.org/akn/ke/act/2007/11/eng%402007-11-09/source.pdf";
export const KENYA_EMPLOYMENT_RULES_SOURCE =
  "https://new.kenyalaw.org/akn/ke/act/ln/2014/28/eng%402014-03-14/source";

export interface KenyaLeavePolicyDefault {
  code: string;
  name: string;
  entitlementDays: number;
  entitlementWeeks: number;
  entitlementMonths: number;
  sickFullPayDays: number;
  sickHalfPayDays: number;
  accrualMethod: "annual" | "monthly";
  minimumServiceMonths: number;
  certificateRequired: boolean;
  paidPercentage: number;
  jurisdiction: "KE";
  sourceUrl: string;
  verifiedOn: string;
  needsLegalReview: true;
}

const verifiedOn = "2026-11-25";

/**
 * These are a configurable starting pack, not legal advice. Every statutory
 * policy remains flagged for employer/counsel review before go-live.
 */
export const KENYA_LEAVE_POLICY_DEFAULTS: readonly KenyaLeavePolicyDefault[] = [
  {
    code: "annual",
    name: "Annual leave",
    entitlementDays: 21,
    entitlementWeeks: 0,
    entitlementMonths: 0,
    sickFullPayDays: 0,
    sickHalfPayDays: 0,
    accrualMethod: "monthly",
    minimumServiceMonths: 0,
    certificateRequired: false,
    paidPercentage: 100,
    jurisdiction: "KE",
    sourceUrl: KENYA_EMPLOYMENT_ACT_SOURCE,
    verifiedOn,
    needsLegalReview: true,
  },
  {
    code: "sick",
    name: "Sick leave",
    entitlementDays: 14,
    entitlementWeeks: 0,
    entitlementMonths: 0,
    sickFullPayDays: 7,
    sickHalfPayDays: 7,
    accrualMethod: "annual",
    minimumServiceMonths: 2,
    certificateRequired: true,
    paidPercentage: 100,
    jurisdiction: "KE",
    sourceUrl: KENYA_EMPLOYMENT_ACT_SOURCE,
    verifiedOn,
    needsLegalReview: true,
  },
  {
    code: "maternity",
    name: "Maternity leave",
    entitlementDays: 0,
    entitlementWeeks: 0,
    entitlementMonths: 3,
    sickFullPayDays: 0,
    sickHalfPayDays: 0,
    accrualMethod: "annual",
    minimumServiceMonths: 0,
    certificateRequired: false,
    paidPercentage: 100,
    jurisdiction: "KE",
    sourceUrl: KENYA_EMPLOYMENT_ACT_SOURCE,
    verifiedOn,
    needsLegalReview: true,
  },
  {
    code: "paternity",
    name: "Paternity leave",
    entitlementDays: 0,
    entitlementWeeks: 2,
    entitlementMonths: 0,
    sickFullPayDays: 0,
    sickHalfPayDays: 0,
    accrualMethod: "annual",
    minimumServiceMonths: 0,
    certificateRequired: false,
    paidPercentage: 100,
    jurisdiction: "KE",
    sourceUrl: KENYA_EMPLOYMENT_ACT_SOURCE,
    verifiedOn,
    needsLegalReview: true,
  },
  {
    code: "pre-adoptive",
    name: "Pre-adoptive leave",
    entitlementDays: 0,
    entitlementWeeks: 0,
    entitlementMonths: 1,
    sickFullPayDays: 0,
    sickHalfPayDays: 0,
    accrualMethod: "annual",
    minimumServiceMonths: 0,
    certificateRequired: true,
    paidPercentage: 100,
    jurisdiction: "KE",
    sourceUrl: KENYA_EMPLOYMENT_ACT_SOURCE,
    verifiedOn,
    needsLegalReview: true,
  },
  {
    code: "compassionate",
    name: "Compassionate leave (company policy)",
    entitlementDays: 0,
    entitlementWeeks: 0,
    entitlementMonths: 0,
    sickFullPayDays: 0,
    sickHalfPayDays: 0,
    accrualMethod: "annual",
    minimumServiceMonths: 0,
    certificateRequired: false,
    paidPercentage: 100,
    jurisdiction: "KE",
    sourceUrl: "",
    verifiedOn,
    needsLegalReview: true,
  },
  {
    code: "study",
    name: "Study leave (company policy)",
    entitlementDays: 0,
    entitlementWeeks: 0,
    entitlementMonths: 0,
    sickFullPayDays: 0,
    sickHalfPayDays: 0,
    accrualMethod: "annual",
    minimumServiceMonths: 0,
    certificateRequired: false,
    paidPercentage: 100,
    jurisdiction: "KE",
    sourceUrl: "",
    verifiedOn,
    needsLegalReview: true,
  },
  {
    code: "unpaid",
    name: "Unpaid leave (company policy)",
    entitlementDays: 0,
    entitlementWeeks: 0,
    entitlementMonths: 0,
    sickFullPayDays: 0,
    sickHalfPayDays: 0,
    accrualMethod: "annual",
    minimumServiceMonths: 0,
    certificateRequired: false,
    paidPercentage: 0,
    jurisdiction: "KE",
    sourceUrl: "",
    verifiedOn,
    needsLegalReview: true,
  },
] as const;

export interface PolicyFloorInput {
  code: string;
  entitlementDays: number;
  entitlementWeeks?: number;
  entitlementMonths?: number;
  sickFullPayDays?: number;
  sickHalfPayDays?: number;
}

export function validateKenyaStatutoryFloor(policy: PolicyFloorInput): string | null {
  const code = policy.code.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  if (code === "annual" && policy.entitlementDays < 21) {
    return "Kenyan statutory floor: annual leave must be at least 21 working days for each 12 consecutive months (Employment Act, s.28).";
  }
  if (
    code === "sick" &&
    ((policy.sickFullPayDays ?? 0) < 7 || (policy.sickHalfPayDays ?? 0) < 7)
  ) {
    return "Kenyan statutory floor: sick leave must provide at least 7 days on full pay followed by 7 days on half pay after two consecutive months of service (Employment Act, s.30).";
  }
  if (code === "maternity" && (policy.entitlementMonths ?? 0) < 3) {
    return "Kenyan statutory floor: maternity leave must be at least 3 months on full pay (Employment Act, s.29).";
  }
  if (code === "paternity" && (policy.entitlementWeeks ?? 0) < 2) {
    return "Kenyan statutory floor: paternity leave must be at least 2 weeks on full pay (Employment Act, s.29(8)). Store the entitlement in weeks, not a fixed 10-day value.";
  }
  if (
    ["pre-adoptive", "pre-adoptive-leave"].includes(code) &&
    (policy.entitlementMonths ?? 0) < 1
  ) {
    return "Kenyan statutory floor: eligible employees must receive at least one month's pre-adoptive leave on full pay (Employment Act, s.29A).";
  }
  return null;
}

function parseIsoDate(value: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error(`Invalid ISO date: ${value}`);
  }
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    throw new Error(`Invalid calendar date: ${value}`);
  }
  return date;
}

export function countScheduledWorkingDays(
  startIso: string,
  endIso: string,
  workdays: readonly number[] = [1, 2, 3, 4, 5],
  holidays: readonly string[] = [],
  halfWorkdays: readonly number[] = [],
): number {
  const cursor = parseIsoDate(startIso);
  const end = parseIsoDate(endIso);
  if (end < cursor) throw new Error("End date must be on or after start date.");
  const schedule = new Set(workdays);
  const halfSchedule = new Set(halfWorkdays);
  const holidaySet = new Set(holidays);
  let count = 0;
  while (cursor <= end) {
    const iso = cursor.toISOString().slice(0, 10);
    const weekday = cursor.getUTCDay();
    if (schedule.has(weekday) && !holidaySet.has(iso)) {
      count += halfSchedule.has(weekday) ? 0.5 : 1;
    }
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return count;
}

export function requestQuarterDays(workingDays: number, halfDay = false): number {
  if (!Number.isFinite(workingDays) || workingDays <= 0) {
    throw new Error("A leave request must include at least one scheduled working day.");
  }
  if (halfDay && workingDays > 1) {
    throw new Error("A half-day request must cover exactly one scheduled working day.");
  }
  const requestedDays = halfDay ? workingDays / 2 : workingDays;
  return Math.round(requestedDays * 4);
}

export function daysFromQuarterDays(quarterDays: number): number {
  return quarterDays / 4;
}

export function monthlyAccrualQuarterDays(entitlementDays: number): number {
  if (!Number.isFinite(entitlementDays) || entitlementDays < 0) {
    throw new Error("Entitlement days must be a non-negative number.");
  }
  return Math.round((entitlementDays * 4) / 12);
}

export function completedServiceMonths(startIso: string, asOfIso: string): number {
  const start = parseIsoDate(startIso);
  const asOf = parseIsoDate(asOfIso);
  if (asOf < start) return 0;
  let months =
    (asOf.getUTCFullYear() - start.getUTCFullYear()) * 12 +
    (asOf.getUTCMonth() - start.getUTCMonth());
  if (asOf.getUTCDate() < start.getUTCDate()) months -= 1;
  return Math.max(0, months);
}

export function proRataAnnualLeaveOnExit(
  startIso: string,
  terminationIso: string,
): number {
  const months = completedServiceMonths(startIso, terminationIso);
  if (months < 2) return 0;
  return Math.round(months * 1.75 * 100) / 100;
}

export function paternityWorkingDayEquivalent(weeks: number, weeklyWorkdays: number): number {
  if (weeks < 0 || weeklyWorkdays <= 0 || weeklyWorkdays > 7) {
    throw new Error("Paternity weeks and weekly workdays must be valid positive values.");
  }
  return Math.round(weeks * weeklyWorkdays * 100) / 100;
}

export interface LeaveAdvisorInput {
  eligible: boolean;
  availableDays: number;
  requestedDays: number;
  teamCoveragePct?: number | null;
  isBlackout?: boolean;
  policyCompliant: boolean;
}

export interface LeaveAdvisorResult {
  suggestion: "approve" | "review" | "decline";
  label: "Rule-based advisory";
  reasons: string[];
  rulesFired: string[];
  inputs: Omit<LeaveAdvisorInput, "">;
}

export function adviseOnLeave(input: LeaveAdvisorInput): LeaveAdvisorResult {
  const reasons: string[] = [];
  const rulesFired: string[] = [];
  let suggestion: LeaveAdvisorResult["suggestion"] = "approve";

  if (!input.eligible) {
    suggestion = "decline";
    reasons.push("Minimum service or eligibility requirement is not met.");
    rulesFired.push("ELIGIBILITY_FAILED");
  }
  if (!input.policyCompliant) {
    suggestion = "decline";
    reasons.push("The request does not comply with the active leave policy.");
    rulesFired.push("POLICY_NON_COMPLIANT");
  }
  if (input.requestedDays <= 0 || input.requestedDays > input.availableDays) {
    suggestion = "decline";
    reasons.push("The requested duration exceeds the available balance.");
    rulesFired.push("INSUFFICIENT_BALANCE");
  }
  if (input.isBlackout) {
    if (suggestion !== "decline") suggestion = "review";
    reasons.push("The requested dates overlap an organisation blackout period.");
    rulesFired.push("BLACKOUT_PERIOD");
  }
  if (input.teamCoveragePct !== undefined && input.teamCoveragePct !== null && input.teamCoveragePct < 70) {
    if (suggestion !== "decline") suggestion = "review";
    reasons.push("Team coverage would fall below the configured 70% advisory threshold.");
    rulesFired.push("TEAM_COVERAGE_WARNING");
  }
  if (!reasons.length) {
    reasons.push("Eligibility, policy, balance and supplied coverage checks passed.");
    rulesFired.push("BASELINE_CHECKS_PASSED");
  }

  return {
    suggestion,
    label: "Rule-based advisory",
    reasons,
    rulesFired,
    inputs: { ...input },
  };
}

export function sumLeaveLedgerQuarterDays(entries: readonly { quantityQuarterDays: number }[]): number {
  return entries.reduce((total, entry) => total + entry.quantityQuarterDays, 0);
}
