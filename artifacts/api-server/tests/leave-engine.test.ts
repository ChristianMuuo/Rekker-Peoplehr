import { describe, test } from "node:test";
import assert from "node:assert/strict";
import {
  adviseOnLeave,
  completedServiceMonths,
  countScheduledWorkingDays,
  daysFromQuarterDays,
  monthlyAccrualQuarterDays,
  paternityWorkingDayEquivalent,
  proRataAnnualLeaveOnExit,
  requestQuarterDays,
  sumLeaveLedgerQuarterDays,
  validateKenyaStatutoryFloor,
} from "../src/services/leaveEngine";

describe("Kenya leave engine", () => {
  test("counts scheduled working days while excluding configured public holidays", () => {
    assert.equal(countScheduledWorkingDays("2026-11-23", "2026-11-27"), 5);
    assert.equal(countScheduledWorkingDays("2026-11-23", "2026-11-27", [1, 2, 3, 4, 5], ["2026-11-25"]), 4);
    assert.equal(countScheduledWorkingDays("2026-11-23", "2026-11-28", [1, 2, 3, 4, 5, 6]), 6);
  });

  test("rejects reversed or malformed date ranges", () => {
    assert.throws(() => countScheduledWorkingDays("2026-11-28", "2026-11-27"));
    assert.throws(() => countScheduledWorkingDays("2026-02-30", "2026-03-02"));
  });

  test("represents half days in quarter-day units without floating point ledger values", () => {
    assert.equal(requestQuarterDays(1, true), 2);
    assert.equal(daysFromQuarterDays(2), 0.5);
    assert.equal(requestQuarterDays(3), 12);
    assert.throws(() => requestQuarterDays(2, true));
  });

  test("accrues 1.75 days per completed month for a 21-day annual policy", () => {
    assert.equal(monthlyAccrualQuarterDays(21), 7);
    assert.equal(daysFromQuarterDays(7 * 4), 7);
  });

  test("counts completed service months from the employment anniversary", () => {
    assert.equal(completedServiceMonths("2026-01-15", "2026-03-14"), 1);
    assert.equal(completedServiceMonths("2026-01-15", "2026-03-15"), 2);
    assert.equal(completedServiceMonths("2026-01-15", "2026-01-14"), 0);
  });

  test("calculates statutory annual leave pro-rata on exit after at least two months", () => {
    assert.equal(proRataAnnualLeaveOnExit("2026-01-01", "2026-02-28"), 3.5);
    assert.equal(proRataAnnualLeaveOnExit("2026-01-15", "2026-03-14"), 0);
  });

  test("converts paternity leave using the configured weekly work pattern", () => {
    assert.equal(paternityWorkingDayEquivalent(2, 5), 10);
    assert.equal(paternityWorkingDayEquivalent(2, 5.5), 11);
    assert.equal(paternityWorkingDayEquivalent(2, 6), 12);
  });

  test("blocks statutory leave policies configured below Kenyan statutory floors", () => {
    assert.match(validateKenyaStatutoryFloor({ code: "annual", entitlementDays: 20 }) ?? "", /21 working days/);
    assert.match(validateKenyaStatutoryFloor({ code: "paternity", entitlementDays: 10, entitlementWeeks: 0 }) ?? "", /2 weeks/);
    assert.match(validateKenyaStatutoryFloor({ code: "maternity", entitlementDays: 90, entitlementMonths: 2 }) ?? "", /3 months/);
    assert.equal(validateKenyaStatutoryFloor({ code: "paternity", entitlementWeeks: 2, entitlementDays: 0 }), null);
    assert.equal(validateKenyaStatutoryFloor({ code: "study", entitlementDays: 0 }), null);
  });

  test("leave advisory is deterministic, explainable and never decides the request", () => {
    const warning = adviseOnLeave({
      eligible: true,
      availableDays: 5,
      requestedDays: 3,
      teamCoveragePct: 60,
      policyCompliant: true,
    });
    assert.equal(warning.suggestion, "review");
    assert.equal(warning.label, "Rule-based advisory");
    assert.ok(warning.rulesFired.includes("TEAM_COVERAGE_WARNING"));

    const denied = adviseOnLeave({
      eligible: false,
      availableDays: 2,
      requestedDays: 3,
      policyCompliant: false,
    });
    assert.equal(denied.suggestion, "decline");
    assert.ok(denied.reasons.length >= 2);
  });

  test("calculates balances from signed ledger entries", () => {
    assert.equal(sumLeaveLedgerQuarterDays([
      { quantityQuarterDays: 84 },
      { quantityQuarterDays: -12 },
      { quantityQuarterDays: 4 },
    ]), 76);
  });
});
