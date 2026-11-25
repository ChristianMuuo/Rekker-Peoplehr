export type LeaveUnit = "days" | "weeks" | "months";
export type LeaveRecommendation = "approve" | "review" | "decline";

export interface LeavePolicyCandidate {
  name: string;
  code?: string;
  entitlementQuantity?: number;
  entitlementUnit?: LeaveUnit;
  entitlementDays?: number;
}

export interface LeaveAdvisoryInput {
  requestedDays: number;
  availableDays: number;
  eligible: boolean;
  hasOverlap: boolean;
  blackoutPeriod: boolean;
  statutoryPolicyCompliant: boolean;
}

export interface LeaveAdvisory {
  suggestion: LeaveRecommendation;
  reasons: string[];
  rulesFired: string[];
  inputs: LeaveAdvisoryInput;
  label: "Rule-based advisory";
}

const STATUTORY_SOURCE =
  "https://new.kenyalaw.org/akn/ke/act/2007/11/eng%402007-11-09/source.pdf";

/**
 * Entitlements are stored in their statutory unit. This helper only converts
 * to legacy day values for display/compatibility. A week is seven calendar days;
 * any working-day conversion must be derived from the employee's work schedule.
 */
export function entitlementToCalendarDays(
  quantity: number,
  unit: LeaveUnit,
): number {
  if (!Number.isFinite(quantity) || quantity < 0) {
    throw new RangeError("Entitlement quantity must be a non-negative number.");
  }
  if (unit === "weeks") return quantity * 7;
  if (unit === "months") return quantity * 30;
  return quantity;
}

/**
 * Enforce statutory floors before a company policy can be saved.
 * These rules are deliberately narrow and traceable. Sick leave's full/half-pay
 * split is not representable by a single entitlement and remains a legal-review
 * item until the tiered policy model is configured.
 */
export function validateKenyaStatutoryFloor(
  policy: LeavePolicyCandidate,
): { valid: boolean; code: string | null; message: string | null; sourceUrl: string } {
  const normalized = policy.name.trim().toLowerCase();
  const isPaternity = normalized.includes("paternity") || policy.code === "paternity";
  const isAnnual = normalized.includes("annual") || policy.code === "annual";
  const quantity = policy.entitlementQuantity ?? policy.entitlementDays ?? 0;
  const unit = policy.entitlementUnit ?? "days";

  if (isPaternity) {
    const meetsFloor =
      unit === "weeks" ? quantity >= 2 :
      unit === "days" ? quantity >= 14 :
      entitlementToCalendarDays(quantity, unit) >= 14;
    return meetsFloor
      ? { valid: true, code: null, message: null, sourceUrl: STATUTORY_SOURCE }
      : {
          valid: false,
          code: "PATERNITY_BELOW_STATUTORY_FLOOR",
          message: "Paternity leave must be at least 2 weeks with full pay under Employment Act, 2007, section 29(8). Keep the statutory unit as weeks; any working-day display conversion must use the employee's schedule and receive legal review.",
          sourceUrl: STATUTORY_SOURCE,
        };
  }

  if (isAnnual) {
    const meetsFloor = unit === "days" && quantity >= 21;
    return meetsFloor
      ? { valid: true, code: null, message: null, sourceUrl: STATUTORY_SOURCE }
      : {
          valid: false,
          code: "ANNUAL_LEAVE_BELOW_STATUTORY_FLOOR",
          message: "Annual leave must provide at least 21 working days with full pay per 12 consecutive months under Employment Act, 2007, section 28.",
          sourceUrl: STATUTORY_SOURCE,
        };
  }

  return { valid: true, code: null, message: null, sourceUrl: STATUTORY_SOURCE };
}

/**
 * Deterministic advisory only. It never approves, rejects, or changes a request.
 * A human manager/HR approver remains responsible for the consequential decision.
 */
export function recommendLeave(input: LeaveAdvisoryInput): LeaveAdvisory {
  const reasons: string[] = [];
  const rulesFired: string[] = [];

  if (!input.eligible) {
    reasons.push("Employee service or eligibility requirements are not satisfied.");
    rulesFired.push("ELIGIBILITY_NOT_MET");
  }
  if (input.requestedDays > input.availableDays) {
    reasons.push("Requested leave exceeds the available balance after pending reservations.");
    rulesFired.push("INSUFFICIENT_BALANCE");
  }
  if (input.hasOverlap) {
    reasons.push("The requested dates overlap another pending or approved leave request.");
    rulesFired.push("DATE_OVERLAP");
  }
  if (input.blackoutPeriod) {
    reasons.push("The requested dates fall in a configured blackout period.");
    rulesFired.push("BLACKOUT_PERIOD");
  }
  if (!input.statutoryPolicyCompliant) {
    reasons.push("The configured policy does not meet the statutory floor.");
    rulesFired.push("STATUTORY_FLOOR_NOT_MET");
  }

  const hardStops = ["ELIGIBILITY_NOT_MET", "INSUFFICIENT_BALANCE", "DATE_OVERLAP", "STATUTORY_FLOOR_NOT_MET"];
  const requiresReview = rulesFired.includes("BLACKOUT_PERIOD");

  const suggestion: LeaveRecommendation =
    rulesFired.some((rule) => hardStops.includes(rule))
      ? "decline"
      : requiresReview
        ? "review"
        : "approve";

  if (reasons.length === 0) {
    reasons.push("No configured eligibility, balance, overlap, blackout, or statutory rule blocked this request.");
    rulesFired.push("POLICY_CHECKS_PASSED");
  }

  return {
    suggestion,
    reasons,
    rulesFired,
    inputs: { ...input },
    label: "Rule-based advisory",
  };
}

export function sumLeaveLedgerDays(entries: readonly { quantityDays: number }[]): number {
  return Math.round(
    entries.reduce((sum, entry) => sum + entry.quantityDays, 0) * 100,
  ) / 100;
}
