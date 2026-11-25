import assert from "node:assert/strict";
import test from "node:test";
import http from "node:http";
import type { AddressInfo } from "node:net";
import app from "../src/app";
import { DEMO_LEAVE_STORE } from "../src/routes/leave";
import { PEOPLEOS_ROLES } from "../src/middlewares/peopleosAccess";

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

function nextMonday(offsetDays: number): Date {
  const value = new Date();
  value.setUTCHours(0, 0, 0, 0);
  value.setUTCDate(value.getUTCDate() + offsetDays);
  while (value.getUTCDay() !== 1) value.setUTCDate(value.getUTCDate() + 1);
  return value;
}

function dateOnly(value: Date): string {
  return value.toISOString().slice(0, 10);
}

const employeeId = "10000000-0000-4000-8000-000000000010";
const employeeHeaders = {
  "x-peopleos-user-id": "user_demo_employee_10",
  "x-peopleos-role": PEOPLEOS_ROLES.employee,
  "x-peopleos-employee-id": employeeId,
};
const managerHeaders = {
  "x-peopleos-user-id": "user_demo_hr_manager_reviewer",
  "x-peopleos-role": PEOPLEOS_ROLES.hrManager,
};
const hrHeaders = {
  "x-peopleos-user-id": "user_demo_hr_admin_approver",
  "x-peopleos-role": PEOPLEOS_ROLES.hrAdmin,
};

test("Leave workflow: apply → advisory → human recommendation → HR approval → balance → audit → cancellation reversal", async () => {
  await withServer(async (baseUrl) => {
    const start = nextMonday(14);
    const end = new Date(start);
    end.setUTCDate(end.getUTCDate() + 1);
    const startDate = dateOnly(start);
    const endDate = dateOnly(end);

    // First-run onboarding supplies the Kenya policy pack with no manual setup.
    const policyResponse = await fetch(`${baseUrl}/api/leave-policies`, {
      headers: hrHeaders,
    });
    assert.equal(policyResponse.status, 200);
    const policies = (await policyResponse.json()) as Array<{ code: string; entitlementUnit?: string; entitlementQuantity?: number }>;
    const annual = policies.find((policy) => policy.code === "annual");
    const paternity = policies.find((policy) => policy.code === "paternity");
    assert.ok(annual, "Annual leave default policy must be available");
    assert.equal(paternity?.entitlementUnit, "weeks");
    assert.equal(paternity?.entitlementQuantity, 2);

    const beforeResponse = await fetch(
      `${baseUrl}/api/leave-balances?employeeId=${employeeId}`,
      { headers: employeeHeaders },
    );
    assert.equal(beforeResponse.status, 200);
    const beforeRows = (await beforeResponse.json()) as Array<{
      leaveType: string;
      remainingDays: number;
      usedDays: number;
    }>;
    const before = beforeRows.find((row) => row.leaveType === "annual");
    assert.ok(before, "Employee annual balance must exist after first-run onboarding");

    // Employee applies. Request is persisted to the demo sandbox store in this
    // test; the database-backed path is separately covered by the schema/CI setup.
    const applyResponse = await fetch(`${baseUrl}/api/leave-requests`, {
      method: "POST",
      headers: { ...employeeHeaders, "content-type": "application/json" },
      body: JSON.stringify({
        employeeId,
        leaveType: "annual",
        startDate,
        endDate,
        reason: "Planned family leave",
      }),
    });
    assert.equal(applyResponse.status, 201, await applyResponse.text());
    const applied = (await applyResponse.json()) as { id: string; status: string };
    assert.equal(applied.status, "pending");
    assert.ok(DEMO_LEAVE_STORE.some((request) => request.id === applied.id));

    const advisoryResponse = await fetch(
      `${baseUrl}/api/leave-requests/${applied.id}/advisory`,
      { headers: managerHeaders },
    );
    assert.equal(advisoryResponse.status, 200);
    const advisory = (await advisoryResponse.json()) as {
      label: string;
      suggestion: string;
      reasons: string[];
      rulesFired: string[];
    };
    assert.equal(advisory.label, "Rule-based advisory");
    assert.equal(advisory.suggestion, "approve");
    assert.ok(Array.isArray(advisory.reasons));
    assert.ok(advisory.rulesFired.includes("POLICY_CHECKS_PASSED"));

    // A human reviewer records the recommendation independently of the model.
    const recommendationResponse = await fetch(
      `${baseUrl}/api/leave-requests/${applied.id}/recommendation`,
      {
        method: "POST",
        headers: { ...managerHeaders, "content-type": "application/json" },
        body: JSON.stringify({ decision: "recommend", comment: "Coverage confirmed." }),
      },
    );
    assert.equal(recommendationResponse.status, 200);
    const recommendation = (await recommendationResponse.json()) as {
      recommendationStatus: string;
      recommendationByUserId: string;
    };
    assert.equal(recommendation.recommendationStatus, "recommended");
    assert.equal(recommendation.recommendationByUserId, managerHeaders["x-peopleos-user-id"]);

    // The recommender cannot perform the final HR approval.
    const selfApproval = await fetch(
      `${baseUrl}/api/leave-requests/${applied.id}/decision`,
      {
        method: "POST",
        headers: { ...managerHeaders, "content-type": "application/json" },
        body: JSON.stringify({ decision: "approve" }),
      },
    );
    assert.equal(selfApproval.status, 403);

    const approvalResponse = await fetch(
      `${baseUrl}/api/leave-requests/${applied.id}/decision`,
      {
        method: "POST",
        headers: { ...hrHeaders, "content-type": "application/json" },
        body: JSON.stringify({ decision: "approve", comment: "HR approval recorded." }),
      },
    );
    assert.equal(approvalResponse.status, 200);
    const approved = (await approvalResponse.json()) as { status: string };
    assert.equal(approved.status, "approved");

    // A repeated approval is rejected, never applied twice.
    const duplicateApproval = await fetch(
      `${baseUrl}/api/leave-requests/${applied.id}/decision`,
      {
        method: "POST",
        headers: { ...hrHeaders, "content-type": "application/json" },
        body: JSON.stringify({ decision: "approve" }),
      },
    );
    assert.equal(duplicateApproval.status, 409);

    const afterApprovalResponse = await fetch(
      `${baseUrl}/api/leave-balances?employeeId=${employeeId}`,
      { headers: employeeHeaders },
    );
    assert.equal(afterApprovalResponse.status, 200);
    const afterApprovalRows = (await afterApprovalResponse.json()) as Array<{
      leaveType: string;
      remainingDays: number;
      usedDays: number;
    }>;
    const afterApproval = afterApprovalRows.find((row) => row.leaveType === "annual");
    assert.ok(afterApproval);
    assert.equal(afterApproval.usedDays - before.usedDays, 2);
    assert.equal(before.remainingDays - afterApproval.remainingDays, 2);

    const auditResponse = await fetch(`${baseUrl}/api/audit-events?limit=30`, {
      headers: hrHeaders,
    });
    assert.equal(auditResponse.status, 200);
    const auditRows = (await auditResponse.json()) as Array<{ action: string; targetId: string }>;
    const actions = auditRows.filter((event) => event.targetId === applied.id).map((event) => event.action);
    assert.ok(actions.includes("leave_request_submitted"));
    assert.ok(actions.includes("leave_request_recommended"));
    assert.ok(actions.includes("leave_request_approved"));

    // Cancellation is an append-only reversal in the database path and restores
    // the computed balance in the sandbox path used for this route-level test.
    const cancelResponse = await fetch(
      `${baseUrl}/api/leave-requests/${applied.id}/cancel`,
      { method: "POST", headers: employeeHeaders },
    );
    assert.equal(cancelResponse.status, 200);
    const cancelled = (await cancelResponse.json()) as { status: string };
    assert.equal(cancelled.status, "cancelled");

    const afterCancelResponse = await fetch(
      `${baseUrl}/api/leave-balances?employeeId=${employeeId}`,
      { headers: employeeHeaders },
    );
    assert.equal(afterCancelResponse.status, 200);
    const afterCancelRows = (await afterCancelResponse.json()) as Array<{
      leaveType: string;
      remainingDays: number;
      usedDays: number;
    }>;
    const afterCancel = afterCancelRows.find((row) => row.leaveType === "annual");
    assert.ok(afterCancel);
    assert.equal(afterCancel.usedDays, before.usedDays);
    assert.equal(afterCancel.remainingDays, before.remainingDays);

    const cancelledAuditResponse = await fetch(`${baseUrl}/api/audit-events?limit=30`, {
      headers: hrHeaders,
    });
    assert.equal(cancelledAuditResponse.status, 200);
    const cancelledAuditRows = (await cancelledAuditResponse.json()) as Array<{ action: string; targetId: string }>;
    assert.ok(cancelledAuditRows.some(
      (event) => event.targetId === applied.id && event.action === "leave_request_cancelled",
    ));
  });
});
