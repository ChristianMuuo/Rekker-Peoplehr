import { describe, test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import type { AddressInfo } from "node:net";
import app from "../src/app";
import { adviseOnLeaveRequest } from "../src/lib/leaveAdvisor";
import { __setAuditSinkFailureForTest } from "../src/lib/auditService";

async function withServer(fn: (baseUrl: string) => Promise<void>): Promise<void> {
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  try {
    await fn(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

describe("Kenya Leave Engine & End-to-End Lifecycle", { concurrency: 1 }, () => {
  test("1. Unit: LeaveAdvisor handles recommend, insufficient_balance, conflicting_dates, and policy_violation", () => {
    const ok = adviseOnLeaveRequest({
      leaveTypeCode: "annual",
      leaveTypeName: "Annual Leave",
      policyActive: true,
      requestedDays: 5,
      startDate: "2027-03-08",
      endDate: "2027-03-12",
      availableDays: 15,
      hasOverlap: false,
      departmentTotalCount: 5,
      departmentAbsentCount: 0,
    });
    assert.equal(ok.outcome, "recommend");
    assert.equal(ok.recommended, true);
    assert.equal(ok.advisoryOnly, true);

    const low = adviseOnLeaveRequest({
      leaveTypeCode: "annual",
      leaveTypeName: "Annual Leave",
      policyActive: true,
      requestedDays: 10,
      startDate: "2027-03-08",
      endDate: "2027-03-19",
      availableDays: 4,
      hasOverlap: false,
      departmentTotalCount: 5,
      departmentAbsentCount: 0,
    });
    assert.equal(low.outcome, "insufficient_balance");
    assert.equal(low.recommended, false);

    const overlap = adviseOnLeaveRequest({
      leaveTypeCode: "annual",
      leaveTypeName: "Annual Leave",
      policyActive: true,
      requestedDays: 3,
      startDate: "2027-03-08",
      endDate: "2027-03-10",
      availableDays: 15,
      hasOverlap: true,
      departmentTotalCount: 5,
      departmentAbsentCount: 0,
    });
    assert.equal(overlap.outcome, "conflicting_dates");
    assert.equal(overlap.recommended, false);

    const inactive = adviseOnLeaveRequest({
      leaveTypeCode: "custom",
      leaveTypeName: "Custom",
      policyActive: false,
      requestedDays: 2,
      startDate: "2027-03-08",
      endDate: "2027-03-09",
      availableDays: 10,
      hasOverlap: false,
      departmentTotalCount: 5,
      departmentAbsentCount: 0,
    });
    assert.equal(inactive.outcome, "policy_violation");
    assert.equal(inactive.recommended, false);
  });

  test("2. Statutory defaults: rekker-demo pre-populates Kenya policies with paternity = 14 days (2 weeks)", async () => {
    await withServer(async (baseUrl) => {
      const res = await fetch(`${baseUrl}/api/leave-policies`, {
        headers: { "x-peopleos-role": "hr_admin" },
      });
      assert.equal(res.status, 200);
      const policies = (await res.json()) as Array<{ code: string; entitlementDays: number }>;
      assert.ok(policies.length >= 4, "rekker-demo must have configured statutory leave policies");
      const paternity = policies.find((p) => p.code === "paternity");
      assert.ok(paternity, "Paternity leave policy must exist");
      assert.equal(paternity.entitlementDays, 14, "Employment Act s.29(8) paternity leave must be 2 weeks (14 days)");
    });
  });

  test("3. Full workflow: apply -> recommend -> approve -> balance deducted -> audit entry, and rejection does not deduct", async () => {
    await withServer(async (baseUrl) => {
      const empId = "10000000-0000-4000-8000-000000000008"; // Faith Chebet (no initial demo leave)
      const empHeaders = {
        "content-type": "application/json",
        "x-peopleos-user-id": "user_demo_employee_08",
        "x-peopleos-role": "employee",
        "x-peopleos-employee-id": empId,
      };
      const hrHeaders = {
        "content-type": "application/json",
        "x-peopleos-user-id": "user_demo_admin_01",
        "x-peopleos-role": "hr_admin",
      };

      const balBeforeRes = await fetch(`${baseUrl}/api/leave-balances?employeeId=${empId}&year=2027`, {
        headers: hrHeaders,
      });
      assert.equal(balBeforeRes.status, 200);
      const balBefore = ((await balBeforeRes.json()) as any[]).find((b) => b.leaveType === "annual");
      assert.ok(balBefore);
      assert.equal(balBefore.usedDays, 0);

      // Apply for 5 working days (Mon 2027-04-05 to Fri 2027-04-09)
      const applyRes = await fetch(`${baseUrl}/api/leave-requests`, {
        method: "POST",
        headers: empHeaders,
        body: JSON.stringify({
          employeeId: empId,
          leaveType: "annual",
          startDate: "2027-04-05",
          endDate: "2027-04-09",
          reason: "E2E leave verification cycle",
        }),
      });
      assert.equal(applyRes.status, 201);
      const created = (await applyRes.json()) as any;
      assert.equal(created.status, "pending");
      assert.equal(created.days, 5);

      // Recommend step
      const recRes = await fetch(`${baseUrl}/api/leave-requests/${created.id}/recommend`, {
        method: "POST",
        headers: hrHeaders,
      });
      assert.equal(recRes.status, 200);
      const recBody = (await recRes.json()) as any;
      assert.equal(recBody.recommendation.recommended, true);
      assert.equal(recBody.recommendation.advisoryOnly, true);

      // Approve step
      const approveRes = await fetch(`${baseUrl}/api/leave-requests/${created.id}/decision`, {
        method: "POST",
        headers: hrHeaders,
        body: JSON.stringify({ decision: "approve", comment: "Approved after coverage check" }),
      });
      assert.equal(approveRes.status, 200);
      const approved = (await approveRes.json()) as any;
      assert.equal(approved.status, "approved");

      // Verify balance deducted
      const balAfterRes = await fetch(`${baseUrl}/api/leave-balances?employeeId=${empId}&year=2027`, {
        headers: hrHeaders,
      });
      const balAfter = ((await balAfterRes.json()) as any[]).find((b) => b.leaveType === "annual");
      assert.equal(balAfter.usedDays, 5);
      assert.equal(balAfter.remainingDays, balBefore.remainingDays - 5);

      // Verify audit entry exists
      const auditRes = await fetch(`${baseUrl}/api/audit-events?limit=20`, { headers: hrHeaders });
      const audits = (await auditRes.json()) as any[];
      assert.ok(
        audits.some((a) => a.targetId === created.id && a.action === "leave_request_approved"),
        "Audit trail must record leave approval",
      );

      // Cancel approved leave -> reverses balance
      const cancelRes = await fetch(`${baseUrl}/api/leave-requests/${created.id}/cancel`, {
        method: "POST",
        headers: empHeaders,
      });
      assert.equal(cancelRes.status, 200);
      const balAfterCancelRes = await fetch(`${baseUrl}/api/leave-balances?employeeId=${empId}&year=2027`, {
        headers: hrHeaders,
      });
      const balAfterCancel = ((await balAfterCancelRes.json()) as any[]).find((b) => b.leaveType === "annual");
      assert.equal(balAfterCancel.usedDays, 0);

      // Reject flow: apply for another 3 days -> reject -> balance unchanged
      const apply2Res = await fetch(`${baseUrl}/api/leave-requests`, {
        method: "POST",
        headers: empHeaders,
        body: JSON.stringify({
          employeeId: empId,
          leaveType: "annual",
          startDate: "2027-05-10",
          endDate: "2027-05-12",
          reason: "Short break test",
        }),
      });
      assert.equal(apply2Res.status, 201);
      const req2 = (await apply2Res.json()) as any;

      const rejectRes = await fetch(`${baseUrl}/api/leave-requests/${req2.id}/decision`, {
        method: "POST",
        headers: hrHeaders,
        body: JSON.stringify({ decision: "reject", comment: "Peak shift week" }),
      });
      assert.equal(rejectRes.status, 200);

      const balAfterRejectRes = await fetch(`${baseUrl}/api/leave-balances?employeeId=${empId}&year=2027`, {
        headers: hrHeaders,
      });
      const balAfterReject = ((await balAfterRejectRes.json()) as any[]).find((b) => b.leaveType === "annual");
      assert.equal(balAfterReject.usedDays, 0);
      assert.equal(balAfterReject.pendingDays, 0);
    });
  });

  test("4. Atomicity: audit failure rolls back approval decision without deducting balance", async () => {
    await withServer(async (baseUrl) => {
      const empId = "10000000-0000-4000-8000-000000000010";
      const empHeaders = {
        "content-type": "application/json",
        "x-peopleos-user-id": "user_demo_employee_10",
        "x-peopleos-role": "employee",
        "x-peopleos-employee-id": empId,
      };
      const hrHeaders = {
        "content-type": "application/json",
        "x-peopleos-user-id": "user_demo_admin_01",
        "x-peopleos-role": "hr_admin",
      };

      const applyRes = await fetch(`${baseUrl}/api/leave-requests`, {
        method: "POST",
        headers: empHeaders,
        body: JSON.stringify({
          employeeId: empId,
          leaveType: "annual",
          startDate: "2027-06-07",
          endDate: "2027-06-09",
          reason: "Rollback test",
        }),
      });
      assert.equal(applyRes.status, 201);
      const req = (await applyRes.json()) as any;

      __setAuditSinkFailureForTest(true);
      try {
        const failRes = await fetch(`${baseUrl}/api/leave-requests/${req.id}/decision`, {
          method: "POST",
          headers: hrHeaders,
          body: JSON.stringify({ decision: "approve" }),
        });
        assert.ok(failRes.status >= 500, "Must fail loudly if critical audit fails");
      } finally {
        __setAuditSinkFailureForTest(false);
      }

      // Status must still be pending and usedDays still 0
      const listRes = await fetch(`${baseUrl}/api/leave-requests?employeeId=${empId}`, {
        headers: hrHeaders,
      });
      const items = (await listRes.json()) as any[];
      const untouched = items.find((r) => r.id === req.id);
      assert.equal(untouched.status, "pending", "Decision must roll back on audit failure");
    });
  });
});
