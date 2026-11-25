import assert from "node:assert/strict";
import test from "node:test";
import { countCalendarWorkingDays } from "../src/services/workCalendarService";

const monday = "2026-11-23";
const saturday = "2026-11-28";

test("work calendar supports 5-day, 5.5-day and 6-day schedules", () => {
  const holidays: Array<{ date: string; name: string }> = [];

  const fiveDay = countCalendarWorkingDays(monday, saturday, {
    workdays: [1, 2, 3, 4, 5],
    holidays,
  });
  assert.equal(fiveDay.workingDays, 5);

  const fiveAndHalfDay = countCalendarWorkingDays(monday, saturday, {
    workdays: [1, 2, 3, 4, 5, 6],
    workdayWeights: { 1: 1, 2: 1, 3: 1, 4: 1, 5: 1, 6: 0.5 },
    holidays,
  });
  assert.equal(fiveAndHalfDay.workingDays, 5.5);

  const sixDay = countCalendarWorkingDays(monday, saturday, {
    workdays: [1, 2, 3, 4, 5, 6],
    workdayWeights: { 1: 1, 2: 1, 3: 1, 4: 1, 5: 1, 6: 1 },
    holidays,
  });
  assert.equal(sixDay.workingDays, 6);
});

test("public holidays subtract the configured workday weight", () => {
  const result = countCalendarWorkingDays(monday, saturday, {
    workdays: [1, 2, 3, 4, 5, 6],
    workdayWeights: { 1: 1, 2: 1, 3: 1, 4: 1, 5: 1, 6: 0.5 },
    holidays: [{ date: "2026-11-25", name: "Test holiday" }],
  });
  assert.equal(result.workingDays, 4.5);
  assert.equal(result.excludedHolidayCount, 1);
});
