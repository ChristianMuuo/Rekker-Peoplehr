/**
 * Deterministic Rule-Based Leave Recommendation Engine (Advisory Only).
 *
 * Evaluates leave requests against configured balances, overlapping leaves,
 * department team coverage, and Kenya Employment Act 2007 statutory notes.
 * Never auto-approves or mutates balances.
 */

export type RecommendationOutcome =
  | "recommend"
  | "insufficient_balance"
  | "conflicting_dates"
  | "requires_manager_review"
  | "policy_violation";

export interface LeaveRecommendationFactor {
  check: string;
  status: "pass" | "warn" | "fail";
  detail: string;
}

export interface LeaveRecommendation {
  outcome: RecommendationOutcome;
  recommended: boolean;
  advisoryOnly: true;
  explanation: string;
  warnings: string[];
  policyReferences: string[];
  factors: LeaveRecommendationFactor[];
}

export interface LeaveAdvisorInput {
  leaveTypeCode: string;
  leaveTypeName: string;
  policyActive: boolean;
  requestedDays: number;
  startDate: string;
  endDate: string;
  availableDays: number;
  hasOverlap: boolean;
  departmentTotalCount: number;
  departmentAbsentCount: number;
}

const STATUTORY_CITATIONS: Record<string, string> = {
  annual: "Kenya Employment Act 2007 s.28 (21 working days min after 12 months service)",
  sick: "Kenya Employment Act 2007 s.30 (7 days full pay + 7 days half pay; NEEDS_LEGAL_REVIEW)",
  maternity: "Kenya Employment Act 2007 s.29 (3 months full pay with written notice)",
  paternity: "Kenya Employment Act 2007 s.29(8) (2 weeks / 14 calendar days full pay; NEEDS_LEGAL_REVIEW)",
  parental: "Kenya Employment Act 2007 s.29(8) (2 weeks / 14 calendar days full pay; NEEDS_LEGAL_REVIEW)",
};

export function adviseOnLeaveRequest(input: LeaveAdvisorInput): LeaveRecommendation {
  const factors: LeaveRecommendationFactor[] = [];
  const warnings: string[] = [];
  const policyReferences: string[] = [];

  const citation = STATUTORY_CITATIONS[input.leaveTypeCode.toLowerCase()];
  if (citation) {
    policyReferences.push(citation);
  }

  // 1. Active policy check
  if (!input.policyActive) {
    factors.push({
      check: "Leave Policy Active",
      status: "fail",
      detail: `${input.leaveTypeName} policy is not active for this organization.`,
    });
  } else {
    factors.push({
      check: "Leave Policy Active",
      status: "pass",
      detail: `${input.leaveTypeName} policy is active.`,
    });
  }

  // 2. Overlap check
  if (input.hasOverlap) {
    factors.push({
      check: "Schedule Overlap",
      status: "fail",
      detail: "Dates overlap an existing pending or approved leave request.",
    });
  } else {
    factors.push({
      check: "Schedule Overlap",
      status: "pass",
      detail: "No overlapping leave requests detected.",
    });
  }

  // 3. Balance sufficiency
  const isUnpaid = input.leaveTypeCode.toLowerCase() === "unpaid";
  const balanceSufficient = isUnpaid || input.availableDays >= input.requestedDays;
  if (!balanceSufficient) {
    factors.push({
      check: "Leave Balance",
      status: "fail",
      detail: `Requested ${input.requestedDays} day(s), but only ${Math.max(0, input.availableDays)} accrued day(s) available.`,
    });
  } else {
    factors.push({
      check: "Leave Balance",
      status: "pass",
      detail: isUnpaid
        ? "Unpaid leave does not draw down paid annual entitlement."
        : `${input.availableDays} accrued day(s) available for ${input.requestedDays} requested day(s).`,
    });
  }

  // 4. Department coverage check
  const totalDept = Math.max(1, input.departmentTotalCount);
  const absentRatio = (input.departmentAbsentCount + 1) / totalDept;
  const highAbsence = totalDept > 1 && absentRatio > 0.35;
  if (highAbsence) {
    const pct = Math.round(absentRatio * 100);
    const msg = `${input.departmentAbsentCount + 1} of ${totalDept} team members (${pct}%) would be away during these dates.`;
    warnings.push(msg);
    factors.push({
      check: "Department Coverage",
      status: "warn",
      detail: msg,
    });
  } else {
    factors.push({
      check: "Department Coverage",
      status: "pass",
      detail: `Adequate staffing: ${input.departmentAbsentCount} other colleague(s) away in department (${totalDept} total).`,
    });
  }

  // 5. Medical certificate reminder for sick leave > 2 days
  if (input.leaveTypeCode.toLowerCase() === "sick" && input.requestedDays > 2) {
    const msg = "Medical practitioner certificate required under Employment Act s.30(2) for sick leave exceeding 2 days.";
    warnings.push(msg);
    factors.push({
      check: "Medical Documentation",
      status: "warn",
      detail: msg,
    });
  }

  if (!input.policyActive) {
    return {
      outcome: "policy_violation",
      recommended: false,
      advisoryOnly: true,
      explanation: `Not recommended: ${input.leaveTypeName} is inactive or unconfigured.`,
      warnings,
      policyReferences,
      factors,
    };
  }

  if (input.hasOverlap) {
    return {
      outcome: "conflicting_dates",
      recommended: false,
      advisoryOnly: true,
      explanation: "Not recommended: requested dates overlap an existing pending or approved leave.",
      warnings,
      policyReferences,
      factors,
    };
  }

  if (!balanceSufficient) {
    return {
      outcome: "insufficient_balance",
      recommended: false,
      advisoryOnly: true,
      explanation: `Not recommended: insufficient ${input.leaveTypeName} balance (${Math.max(0, input.availableDays)} available vs ${input.requestedDays} requested).`,
      warnings,
      policyReferences,
      factors,
    };
  }

  if (warnings.length > 0) {
    return {
      outcome: "requires_manager_review",
      recommended: true,
      advisoryOnly: true,
      explanation: `Eligible based on balance, with advisory note(s) for manager review: ${warnings[0]}`,
      warnings,
      policyReferences,
      factors,
    };
  }

  return {
    outcome: "recommend",
    recommended: true,
    advisoryOnly: true,
    explanation: `Recommended for approval: balance verified (${input.availableDays} days available), no date conflicts, and healthy team coverage.`,
    warnings,
    policyReferences,
    factors,
  };
}
