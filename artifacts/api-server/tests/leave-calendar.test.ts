import assert from "node:assert/strict";
import test from "node:test";
import http from "node:http";
import type { AddressInfo } from "node:net";
import app from "../src/app";
import { PEOPLEOS_ROLES } from "../src/middlewares/peopleosAccess";
import { DEMO_LEAVE_STORE } from "../src/routes/leave";

async function withServer(
  fn: (baseUrl: string) => Promise<void>,
): Promise<void> {
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  try {
    await fn(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

function dateOnly(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function monthFor(value: Date): string {
  return dateOnly(value).slice(0, 7);
}

function futureMonday(offsetDays: number): Date {
  const value = new Date();
  value.setUTCHours(0, 0, 0, 0);
  value.setUTCDate(value.getUTCDate() + offsetDays);
  while (value.getUTCDay() !== 1) value.setUTCDate(value.getUTCDate() + 1);
  return value;
}

test("Leave Calendar & Team Availability Hub (Spec 3)", async (t) => {
  const firstLeave = DEMO_LEAVE_STORE[0]!;
  const paternityLeave = DEMO_LEAVE_STORE[2]!;
  const firstLeaveMonth = monthFor(firstLeave.startDate);
  const paternityLeaveMonth = monthFor(paternityLeave.startDate);
  const hrHeaders = {
    "x-peopleos-user-id": "user_demo_admin_01",
    "x-peopleos-role": PEOPLEOS_ROLES.hrAdmin,
  };

  const employeeHeaders = {
    "x-peopleos-user-id": "user_demo_emp_01",
    "x-peopleos-role": PEOPLEOS_ROLES.employee,
    "x-peopleos-employee-id": "10000000-0000-4000-8000-000000000002",
  };

  await t.test("1. GET /api/leave/calendar returns monthly schedule, holidays & summary", async () => {
    await withServer(async (baseUrl) => {
      const res = await fetch(`${baseUrl}/api/leave/calendar?month=${firstLeaveMonth}`, {
        method: "GET",
        headers: hrHeaders,
      });

      assert.equal(res.status, 200, `Expected 200, got ${res.status}`);
      const data: any = await res.json();

      assert.equal(data.period.month, firstLeaveMonth);
      const [year, month] = firstLeaveMonth.split("-").map(Number);
      assert.equal(data.period.startDate, `${firstLeaveMonth}-01`);
      assert.equal(
        data.period.endDate,
        `${firstLeaveMonth}-${String(new Date(Date.UTC(year!, month!, 0)).getUTCDate()).padStart(2, "0")}`,
      );
      assert.equal(data.workCalendar.timezone, "Africa/Nairobi");
      assert.ok(Array.isArray(data.workCalendar.workdays), "Workdays must be an array");
      assert.ok(Array.isArray(data.entries), "Entries must be an array");
      assert.ok(data.summary.totalEmployeesOnLeave >= 1, "Must report employees on leave");
      assert.equal(data.viewMode, "hr");

      const entry001 = data.entries.find((e: any) => e.id === "leave-001");
      assert.ok(entry001, "relative demo leave-001 must be present in its start month");
      assert.equal(entry001.employeeName, "Wanjiku Kimani");
      assert.equal(entry001.displayType, "Annual Leave");
      assert.equal(entry001.reason, "Annual rest and family leave");
    });
  });

  await t.test("2. Role-Based Privacy Scoping (KDPA 2019): Peers see 'Away' and reasons are redacted", async () => {
    await withServer(async (baseUrl) => {
      const res = await fetch(`${baseUrl}/api/leave/calendar?month=${firstLeaveMonth}`, {
        method: "GET",
        headers: employeeHeaders,
      });

      assert.equal(res.status, 200);
      const data: any = await res.json();
      assert.equal(data.viewMode, "peer");

      const peerEntry = data.entries.find((e: any) => e.id === "leave-001");
      assert.ok(peerEntry, "Peer entry must exist");
      assert.equal(peerEntry.isOwn, false, "Must be flagged as not own leave");
      assert.equal(peerEntry.displayType, "Away", "Peer leave type must be redacted to 'Away'");
      assert.equal(peerEntry.reason, null, "Peer leave reason must be strictly redacted (null)");
    });
  });

  await t.test("3. Self-Service Visibility: Employee sees own leave type & reason in calendar", async () => {
    await withServer(async (baseUrl) => {
      const res = await fetch(`${baseUrl}/api/leave/calendar?month=${paternityLeaveMonth}`, {
        method: "GET",
        headers: employeeHeaders,
      });

      assert.equal(res.status, 200);
      const data: any = await res.json();

      const ownEntry = data.entries.find((e: any) => e.id === "leave-003");
      assert.ok(ownEntry, "Relative paternity leave request must be visible in its start month");
      assert.equal(ownEntry.isOwn, true, "Must be flagged as own leave");
      assert.ok(ownEntry.displayType.startsWith("Paternity Leave"));
      assert.ok(ownEntry.reason?.includes("Paternity leave"), "Own reason must be preserved");
    });
  });

  await t.test("4. Department Filtering: Scopes calendar entries to selected department", async () => {
    await withServer(async (baseUrl) => {
      // Query with non-matching department
      const resEmpty = await fetch(
        `${baseUrl}/api/leave/calendar?month=${firstLeaveMonth}&departmentId=99999999-0000-0000-0000-000000000099`,
        {
          method: "GET",
          headers: hrHeaders,
        },
      );

      assert.equal(resEmpty.status, 200);
      const dataEmpty: any = await resEmpty.json();
      assert.equal(dataEmpty.entries.length, 0, "No entries should match nonexistent department");

      // Query with the current Logistics department used by the synthetic employee fixture.
      const resLogistics = await fetch(
        `${baseUrl}/api/leave/calendar?month=${firstLeaveMonth}&departmentId=20000000-0000-4000-8000-000000000002`,
        {
          method: "GET",
          headers: hrHeaders,
        },
      );

      assert.equal(resLogistics.status, 200);
      const dataLogistics: any = await resLogistics.json();
      assert.ok(dataLogistics.entries.length >= 1, "Must return logistics department entries");
      assert.ok(dataLogistics.entries.every((e: any) => e.departmentId === "20000000-0000-4000-8000-000000000002"));
    });
  });

  await t.test("5. POST /api/leave/requests/preview computes working days and checks overlaps without writing", async () => {
    await withServer(async (baseUrl) => {
      const monday = futureMonday(60);
      const friday = new Date(monday);
      friday.setUTCDate(friday.getUTCDate() + 4);
      const startDate = dateOnly(monday);
      const endDate = dateOnly(friday);
      const res = await fetch(`${baseUrl}/api/leave/requests/preview`, {
        method: "POST",
        headers: {
          ...employeeHeaders,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          leaveType: "annual",
          startDate,
          endDate,
        }),
      });

      assert.equal(res.status, 200);
      const data: any = await res.json();
      assert.equal(data.workingDays, 5, "Monday to Friday must be 5 working days");
      assert.equal(data.hasOverlap, false);

      // Negative test: invalid date range
      const badRes = await fetch(`${baseUrl}/api/leave/requests/preview`, {
        method: "POST",
        headers: {
          ...employeeHeaders,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          leaveType: "annual",
          startDate,
          endDate: dateOnly(new Date(monday.getTime() - 24 * 60 * 60 * 1000)),
        }),
      });

      assert.equal(badRes.status, 400);
    });
  });
});
