import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { countCalendarWorkingDays } from "../src/services/workCalendarService";

describe("work calendar fractional weekdays", () => {
  test("counts a six-day week with a half Saturday and excludes public holidays", () => {
    const result = countCalendarWorkingDays("2026-11-23", "2026-11-28", {
      workdays: [1, 2, 3, 4, 5, 6],
      halfWorkdays: [6],
      holidays: [{ date: "2026-11-25", name: "Test public holiday" }],
    });
    assert.equal(result.workingDays, 4.5);
    assert.equal(result.excludedHolidayCount, 1);
  });

  test("counts half of a regular workday as quarter-day units when requested", () => {
    const calendar = {
      workdays: [1, 2, 3, 4, 5, 6],
      halfWorkdays: [6],
      holidays: [],
    };
    const result = countCalendarWorkingDays("2026-11-28", "2026-11-28", calendar);
    assert.equal(result.workingDays, 0.5);
  });
});
