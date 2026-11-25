import { describe, test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import type { AddressInfo } from "node:net";
import app from "../src/app";

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

const employeeId = "10000000-0000-4000-8000-000000000002";
const managerId = "10000000-0000-4000-8000-000000000001";

function headers(orgId: string, role: string, userId: string) {
  return {
    "content-type": "application/json",
    "x-peopleos-org-id": orgId,
    "x-peopleos-role": role,
    "x-peopleos-user-id": userId,
  };
}

function dateAfter(days: number): string {
  const date = new Date();
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

describe("Leave workflow acceptance: preview, recommend, approve, ledger, cancel and audit", () => {
  test("a leave request is deducted once on HR approval and restored by a cancellation reversal", async () => {
    await withServer(async (baseUrl) => {
      const organizationId = `leave-flow-${Date.now()}`;
      const employeeHeaders = headers(organizationId, "employee", "user_demo_employee_leave_flow");
      const managerHeaders = headers(organizationId, "department_manager", "user_demo_manager_leave_flow");
      const hrHeaders = headers(organizationId, "hr_admin", "user_demo_hr_leave_flow");
      const startDate = dateAfter(7);
      const endDate = dateAfter(13);

      // The first policy read bootstraps the Kenya statutory policy pack.
      const policiesResponse = await fetch(`${baseUrl}/api/leave-policies`, { headers: hrHeaders });
      assert.equal(policiesResponse.status, 200);
      const policies = await policiesResponse.json() as Array<{
        code: string;
        entitlementDays: number;
        entitlementWeeks: number;
      }>;
      assert.ok(policies.some((policy) => policy.code === "annual" && policy.entitlementDays === 21));
      assert.ok(policies.some((policy) => policy.code === "paternity" && policy.entitlementWeeks === 2));

      const beforeResponse = await fetch(
        `${baseUrl}/api/leave-balances?employeeId=${employeeId}`,
        { headers: employeeHeaders },
      );
      assert.equal(beforeResponse.status, 200);
      const beforeBalances = await beforeResponse.json() as Array<{
        leaveType: string;
        remainingDays: number;
      }>;
      const beforeAnnual = beforeBalances.find((balance) => balance.leaveType === "annual");
      assert.ok(beforeAnnual);
      assert.ok(beforeAnnual.remainingDays >= 5);

      // A preview calculates working days and available annual balance before submit.
      const previewUrl = new URL(`${baseUrl}/api/leave-preview`);
      previewUrl.searchParams.set("employeeId", employeeId);
      previewUrl.searchParams.set("leaveType", "annual");
      previewUrl.searchParams.set("startDate", startDate);
      previewUrl.searchParams.set("endDate", endDate);
      const previewResponse = await fetch(previewUrl, { headers: employeeHeaders });
      assert.equal(previewResponse.status, 200);
      const preview = await previewResponse.json() as {
        workingDays: number;
        requestedDays: number;
        eligible: boolean;
        availableDays: number | null;
      };
      assert.equal(preview.workingDays, 5);
      assert.equal(preview.requestedDays, 5);
      assert.equal(preview.eligible, true);
      assert.ok(preview.availableDays !== null && preview.availableDays >= 5);

      // Apply as the employee. The manager is a distinct actor from the employee.
      const submitResponse = await fetch(`${baseUrl}/api/leave-requests`, {
        method: "POST",
        headers: employeeHeaders,
        body: JSON.stringify({
          employeeId,
          leaveType: "annual",
          startDate,
          endDate,
          reason: "Leave workflow integration acceptance test",
          halfDay: false,
        }),
      });
      assert.equal(submitResponse.status, 201);
      const submitted = await submitResponse.json() as { id: string; status: string };
      assert.equal(submitted.status, "pending");

      // The manager provides a separate recommendation, not the final approval.
      const recommendationResponse = await fetch(
        `${baseUrl}/api/leave-requests/${submitted.id}/recommendation`,
        {
          method: "POST",
          headers: managerHeaders,
          body: JSON.stringify({ decision: "recommend", comment: "Team coverage is confirmed." }),
        },
      );
      assert.equal(recommendationResponse.status, 200);
      const recommendation = await recommendationResponse.json() as {
        status: string;
        recommendationLabel: string;
        recommendationSuggestion: string;
      };
      assert.equal(recommendation.status, "recommended");
      assert.equal(recommendation.recommendationLabel, "Rule-based advisory");
      assert.ok(["approve", "review"].includes(recommendation.recommendationSuggestion));

      // HR makes the final human decision and the ledger deduction is committed.
      const approveResponse = await fetch(
        `${baseUrl}/api/leave-requests/${submitted.id}/decision`,
        {
          method: "POST",
          headers: hrHeaders,
          body: JSON.stringify({ decision: "approve", comment: "Approved after manager recommendation." }),
        },
      );
      assert.equal(approveResponse.status, 200);
      const approved = await approveResponse.json() as { status: string };
      assert.equal(approved.status, "approved");

      // A repeated approval is an idempotent acknowledgement, not a second deduction.
      const repeatApprovalResponse = await fetch(
        `${baseUrl}/api/leave-requests/${submitted.id}/decision`,
        {
          method: "POST",
          headers: hrHeaders,
          body: JSON.stringify({ decision: "approve", comment: "Repeated approval test." }),
        },
      );
      assert.equal(repeatApprovalResponse.status, 200);

      const ledgerResponse = await fetch(
        `${baseUrl}/api/leave-ledger?employeeId=${employeeId}&leaveType=annual`,
        { headers: hrHeaders },
      );
      assert.equal(ledgerResponse.status, 200);
      const ledger = await ledgerResponse.json() as Array<{
        requestId: string | null;
        entryType: string;
        quantityDays: number;
      }>;
      const deductions = ledger.filter((entry) =>
        entry.requestId === submitted.id && entry.entryType === "deduction");
      assert.equal(deductions.length, 1);
      assert.equal(deductions[0]?.quantityDays, -5);

      const afterApprovalResponse = await fetch(
        `${baseUrl}/api/leave-balances?employeeId=${employeeId}`,
        { headers: employeeHeaders },
      );
      const afterApproval = await afterApprovalResponse.json() as Array<{
        leaveType: string;
        remainingDays: number;
        usedDays: number;
      }>;
      const afterApprovalAnnual = afterApproval.find((balance) => balance.leaveType === "annual");
      assert.ok(afterApprovalAnnual);
      assert.equal(afterApprovalAnnual.usedDays, 5);
      assert.equal(beforeAnnual.remainingDays - afterApprovalAnnual.remainingDays, 5);

      // Cancellation creates a compensating ledger row and restores the balance.
      const cancelResponse = await fetch(
        `${baseUrl}/api/leave-requests/${submitted.id}/cancel`,
        { method: "POST", headers: employeeHeaders },
      );
      assert.equal(cancelResponse.status, 200);
      const cancelled = await cancelResponse.json() as { status: string };
      assert.equal(cancelled.status, "cancelled");

      const finalLedgerResponse = await fetch(
        `${baseUrl}/api/leave-ledger?employeeId=${employeeId}&leaveType=annual`,
        { headers: hrHeaders },
      );
      const finalLedger = await finalLedgerResponse.json() as Array<{
        requestId: string | null;
        entryType: string;
        quantityDays: number;
      }>;
      assert.equal(finalLedger.filter((entry) =>
        entry.requestId === submitted.id && entry.entryType === "deduction").length, 1);
      const reversal = finalLedger.filter((entry) =>
        entry.requestId === submitted.id && entry.entryType === "reversal");
      assert.equal(reversal.length, 1);
      assert.equal(reversal[0]?.quantityDays, 5);

      const finalBalanceResponse = await fetch(
        `${baseUrl}/api/leave-balances?employeeId=${employeeId}`,
        { headers: employeeHeaders },
      );
      const finalBalances = await finalBalanceResponse.json() as Array<{
        leaveType: string;
        remainingDays: number;
        usedDays: number;
      }>;
      const finalAnnual = finalBalances.find((balance) => balance.leaveType === "annual");
      assert.ok(finalAnnual);
      assert.equal(finalAnnual.usedDays, 0);
      assert.equal(finalAnnual.remainingDays, beforeAnnual.remainingDays);

      // All three human workflow transitions are recorded in the organisation audit.
      const auditResponse = await fetch(`${baseUrl}/api/audit-events?limit=100`, {
        headers: headers(organizationId, "auditor", "user_demo_auditor_leave_flow"),
      });
      assert.equal(auditResponse.status, 200);
      const audit = await auditResponse.json() as Array<{ action: string; targetId: string }>;
      const actions = audit.filter((entry) => entry.targetId === submitted.id).map((entry) => entry.action);
      assert.ok(actions.includes("leave_request_submitted"));
      assert.ok(actions.includes("leave_request_recommended"));
      assert.ok(actions.includes("leave_request_approved"));
      assert.ok(actions.includes("leave_request_cancelled"));
    });
  });

  test("half-day preview is exactly half a scheduled day", async () => {
    await withServer(async (baseUrl) => {
      const organizationId = `leave-half-day-${Date.now()}`;
      const employeeHeaders = headers(organizationId, "employee", "user_demo_employee_half_day");
      const previewUrl = new URL(`${baseUrl}/api/leave-preview`);
      previewUrl.searchParams.set("employeeId", employeeId);
      previewUrl.searchParams.set("leaveType", "annual");
      previewUrl.searchParams.set("startDate", dateAfter(7));
      previewUrl.searchParams.set("endDate", dateAfter(7));
      previewUrl.searchParams.set("halfDay", "true");
      const response = await fetch(previewUrl, { headers: employeeHeaders });
      assert.equal(response.status, 200);
      const preview = await response.json() as { workingDays: number; requestedDays: number };
      assert.equal(preview.workingDays, 1);
      assert.equal(preview.requestedDays, 0.5);
    });
  });
});
