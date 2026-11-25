import assert from "node:assert/strict";
import test from "node:test";
import {
  calculateAnnualLeaveProRataOnExit,
  entitlementToCalendarDays,
  recommendLeave,
  sumLeaveLedgerDays,
  validateKenyaStatutoryFloor,
} from "../src/services/leaveEngine";

test("Kenya leave policy statutory floors", async (t) => {
  await t.test("paternity is stored as two weeks, not ten days", () => {
    assert.equal(entitlementToCalendarDays(2, "weeks"), 14);
    assert.equal(
      validateKenyaStatutoryFloor({
        name: "Paternity Leave",
        entitlementQuantity: 2,
        entitlementUnit: "weeks",
      }).valid,
      true,
    );
  });

  await t.test("rejects paternity policy below two weeks", () => {
    const result = validateKenyaStatutoryFloor({
      name: "Paternity Leave",
      entitlementDays: 10,
      entitlementUnit: "days",
    });
    assert.equal(result.valid, false);
    assert.equal(result.code, "PATERNITY_BELOW_STATUTORY_FLOOR");
    assert.ok(result.sourceUrl.includes("kenyalaw.org"));
  });

  await t.test("rejects annual leave below 21 working days", () => {
    const result = validateKenyaStatutoryFloor({
      name: "Annual Leave",
      entitlementDays: 20,
      entitlementUnit: "days",
    });
    assert.equal(result.valid, false);
    assert.equal(result.code, "ANNUAL_LEAVE_BELOW_STATUTORY_FLOOR");
  });
});

test("LeaveAdvisor is deterministic and advisory-only", () => {
  const eligible = recommendLeave({
    requestedDays: 3,
    availableDays: 7,
    eligible: true,
    hasOverlap: false,
    blackoutPeriod: false,
    statutoryPolicyCompliant: true,
  });
  assert.equal(eligible.suggestion, "approve");
  assert.equal(eligible.label, "Rule-based advisory");
  assert.ok(eligible.rulesFired.includes("POLICY_CHECKS_PASSED"));

  const insufficient = recommendLeave({
    requestedDays: 8,
    availableDays: 7,
    eligible: true,
    hasOverlap: false,
    blackoutPeriod: false,
    statutoryPolicyCompliant: true,
  });
  assert.equal(insufficient.suggestion, "decline");
  assert.ok(insufficient.rulesFired.includes("INSUFFICIENT_BALANCE"));

  const blackout = recommendLeave({
    requestedDays: 2,
    availableDays: 7,
    eligible: true,
    hasOverlap: false,
    blackoutPeriod: true,
    statutoryPolicyCompliant: true,
  });
  assert.equal(blackout.suggestion, "review");
  assert.ok(blackout.rulesFired.includes("BLACKOUT_PERIOD"));
});

test("leave ledger sum supports fractional days and reversals", () => {
  assert.equal(
    sumLeaveLedgerDays([
      { quantityDays: 21 },
      { quantityDays: -2.5 },
      { quantityDays: 2.5 },
      { quantityDays: -0.5 },
    ]),
    20.5,
  );
});


test("annual leave termination pro-rata follows Employment Act section 28(1)(b)", () => {
  assert.equal(calculateAnnualLeaveProRataOnExit(1), 0);
  assert.equal(calculateAnnualLeaveProRataOnExit(2), 3.5);
  assert.equal(calculateAnnualLeaveProRataOnExit(6), 10.5);
  assert.equal(calculateAnnualLeaveProRataOnExit(12), 21);
  assert.throws(() => calculateAnnualLeaveProRataOnExit(-1), RangeError);
  assert.throws(() => calculateAnnualLeaveProRataOnExit(1.5), RangeError);
});
