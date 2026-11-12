import { describe, test } from "node:test";
import assert from "node:assert";
import http from "node:http";
import type { AddressInfo } from "node:net";
import app from "../src/app";
import {
  calculateKenyaStatutoryWithConfig,
  listStatutoryConfigs,
  saveStatutoryConfig,
} from "../src/lib/kenyaPayrollEngine";
import { initiateMpesaSalaryPayout } from "../src/lib/mpesaService";
import {
  assertSafeDocumentExtension,
  decryptSensitiveField,
  encryptSensitiveField,
  maskKraPin,
  maskNationalId,
  maskPhoneNumber,
  sanitizeFileName,
} from "../src/lib/security";
import {
  classifyIntentToAgent,
  runMultiAgentGraph,
  SPECIALIST_AGENTS,
} from "../src/ai/orchestrator";
import {
  decideAiApproval,
  enqueueAiApprovalProposal,
  listAiApprovals,
} from "../src/ai/tools";
import { PEOPLEOS_ROLES } from "../src/middlewares/peopleosAccess";

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

describe("Enterprise HRMS Controls: Payroll, Security, Leave, M-Pesa & 10-Agent AI", () => {
  test("Kenya statutory payroll engine computes differing results across versioned effective-dated configs without hardcoded tax rates", async () => {
    const configs = await listStatutoryConfigs("test-org-stat");
    assert.ok(configs.length >= 2, "Expected default Phase 3 + Phase 4 statutory schedules");

    const phase3 = configs.find((c) => c.effectiveFrom === "2025-02-01")!;
    const phase4 = configs.find((c) => c.effectiveFrom === "2026-02-01")!;
    assert.ok(phase3 && phase4);

    const calc3 = calculateKenyaStatutoryWithConfig(180000, 0, 0, phase3);
    const calc4 = calculateKenyaStatutoryWithConfig(180000, 0, 0, phase4);

    assert.strictEqual(calc3.totalNssf, 4320, "Phase 3 NSSF caps at 6% of 72,000 = 4,320");
    assert.strictEqual(calc4.totalNssf, 6480, "Phase 4 NSSF caps at 6% of 108,000 = 6,480");
    assert.ok(
      calc4.taxablePay < calc3.taxablePay,
      "Phase 4 deductible SHIF + AHL + higher NSSF reduces taxable pay",
    );
    assert.notStrictEqual(calc3.netPay, calc4.netPay);

    const custom = await saveStatutoryConfig({
      organizationId: "test-org-custom",
      userId: "tester",
      name: "Custom Experimental Schedule",
      effectiveFrom: "2027-01-01",
      activate: true,
      nssf: { rate: 0.05, tier1UpperLimitKes: 10000, tier2UpperLimitKes: 50000, employerMatch: true },
      shif: { rate: 0.03, minimumKes: 500, deductibleFromTaxablePay: true, insuranceReliefRate: 0, insuranceReliefMaxKes: 0 },
      housingLevy: { employeeRate: 0.01, employerRate: 0.01, deductibleFromTaxablePay: true },
      paye: {
        personalReliefKes: 3000,
        bands: [{ label: "Flat 20%", limitKes: null, rate: 0.2 }],
      },
    });
    const customCalc = calculateKenyaStatutoryWithConfig(100000, 0, 0, custom);
    assert.strictEqual(customCalc.totalNssf, 2500);
    assert.strictEqual(customCalc.sha, 3000);
    assert.strictEqual(customCalc.housingLevy, 1000);
    assert.strictEqual(customCalc.taxablePay, 93500);
  });

  test("AES-256-GCM encryption round-trips PII fields and ODPC masking obscures sensitive identifiers", () => {
    const encryptedPin = encryptSensitiveField("DEMO-PIN-349");
    assert.ok(encryptedPin && encryptedPin.startsWith("enc:v2:"));
    assert.notStrictEqual(encryptedPin, "DEMO-PIN-349");
    assert.strictEqual(decryptSensitiveField(encryptedPin), "DEMO-PIN-349");

    assert.strictEqual(maskKraPin(encryptedPin), "DEM*****49");
    assert.strictEqual(maskPhoneNumber("+254700000911"), "+254****911");
    assert.strictEqual(maskNationalId("29182736"), "****736");

    const sanitized = sanitizeFileName("../../etc/passwd?bad=1");
    assert.ok(!sanitized.includes(".."));
    assert.ok(!sanitized.includes("/"));
    assert.ok(!sanitized.startsWith("."));
    assert.strictEqual(assertSafeDocumentExtension("contract.pdf"), true);
    assert.strictEqual(assertSafeDocumentExtension("payload.exe"), false);
  });

  test("M-Pesa B2C service transparently runs SANDBOX_SIMULATION and validates Kenyan MSISDNs", async () => {
    const valid = await initiateMpesaSalaryPayout({
      employeeId: "emp-1",
      employeeName: "Wanjiku Kimani",
      phone: "0722334455",
      amountKes: 95000,
      period: "March 2026",
    });
    assert.strictEqual(valid.providerMode, "SANDBOX_SIMULATION");
    assert.strictEqual(valid.status, "disbursed");
    assert.strictEqual(valid.recipientMasked, "2547****455");

    const invalid = await initiateMpesaSalaryPayout({
      employeeId: "emp-2",
      employeeName: "Invalid Phone",
      phone: "123",
      amountKes: 5000,
      period: "March 2026",
    });
    assert.strictEqual(invalid.status, "failed");
  });

  test("Multi-agent ecosystem exposes Supervisor + all 10 domain specialists and enforces RBAC + Human Approval gating", async () => {
    const specialistKeys = Object.keys(SPECIALIST_AGENTS);
    assert.strictEqual(specialistKeys.length, 11, "Supervisor + 10 specialist agents required");

    assert.strictEqual(classifyIntentToAgent("How many days of onboarding tasks remain?"), "onboarding");
    assert.strictEqual(classifyIntentToAgent("Check late clock attendance shifts"), "attendance");
    assert.strictEqual(classifyIntentToAgent("Identify attrition and burnout risk in sales"), "retention");
    assert.strictEqual(classifyIntentToAgent("Analyze training and skills gap coverage"), "learning");
    assert.strictEqual(classifyIntentToAgent("Prepare executive forecast briefing"), "executive");

    const employeeMembership = {
      userId: "user_emp_test",
      organizationId: "rekker-demo",
      role: PEOPLEOS_ROLES.employee,
      employeeId: "10000000-0000-4000-8000-000000000004",
      isActive: true,
    } as any;

    const blocked = await runMultiAgentGraph({
      query: "Show workforce attrition risk and company payroll salary list",
      requestedAgent: "supervisor",
      conversationId: "conv-rbac-test",
      membership: employeeMembership,
    });
    assert.strictEqual(blocked.statusCode, 403);
    assert.ok(blocked.body.response.includes("Access Denied"));
    assert.strictEqual(blocked.body.toolsCalled.length, 0);

    const hrMembership = {
      userId: "user_hr_test",
      organizationId: "rekker-demo",
      role: PEOPLEOS_ROLES.hrAdmin,
      employeeId: "10000000-0000-4000-8000-000000000007",
      isActive: true,
    } as any;

    const proposal = await enqueueAiApprovalProposal({
      membership: hrMembership,
      agentRole: "payroll",
      targetType: "employee",
      targetId: "10000000-0000-4000-8000-000000000006",
      proposedAction: "MODIFY_COMPENSATION",
      payload: { proposedAmountKes: 205000 },
      rationale: "Grade progression benchmark",
    });
    assert.strictEqual(proposal.status, "pending");

    const decided = await decideAiApproval({
      organizationId: "rekker-demo",
      approvalId: proposal.id,
      deciderUserId: "user_hr_test",
      deciderRole: PEOPLEOS_ROLES.hrAdmin,
      decision: "approve",
      comment: "Verified budget signoff",
    });
    assert.strictEqual(decided?.status, "approved");

    const allApprovals = await listAiApprovals("rekker-demo");
    assert.ok(allApprovals.some((a) => a.id === proposal.id && a.status === "approved"));
  });

  test("HTTP API enforces empty default leave policies, RBAC boundaries, and human signoff before M-Pesa disbursement", async () => {
    await withServer(async (baseUrl) => {
      // 1. Leave policies start empty by default (no prefilled statutory leave days)
      const policiesRes = await fetch(`${baseUrl}/api/leave-policies`, {
        headers: { "x-peopleos-org-id": "org-fresh-check", "x-peopleos-role": "hr_admin" },
      });
      assert.strictEqual(policiesRes.status, 200);
      const policies = await policiesRes.json();
      assert.deepStrictEqual(policies, []);

      // 2. Employee cannot create leave policies or inspect audit trail
      const deniedPolicyRes = await fetch(`${baseUrl}/api/leave-policies`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-peopleos-org-id": "org-fresh-check",
          "x-peopleos-role": "employee",
        },
        body: JSON.stringify({ name: "Annual Leave", entitlementDays: 21, accrualMethod: "annual" }),
      });
      assert.strictEqual(deniedPolicyRes.status, 403);

      const deniedAuditRes = await fetch(`${baseUrl}/api/audit-events`, {
        headers: { "x-peopleos-role": "recruiter" },
      });
      assert.strictEqual(deniedAuditRes.status, 403);

      // 3. HR Admin creates org policy, and balances reflect configured policy
      const createPolicyRes = await fetch(`${baseUrl}/api/leave-policies`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-peopleos-org-id": "org-fresh-check",
          "x-peopleos-role": "hr_admin",
        },
        body: JSON.stringify({ name: "Annual Rest", entitlementDays: 14, accrualMethod: "annual" }),
      });
      assert.strictEqual(createPolicyRes.status, 201);

      const balancesRes = await fetch(`${baseUrl}/api/leave-balances`, {
        headers: { "x-peopleos-org-id": "org-fresh-check", "x-peopleos-role": "hr_admin" },
      });
      assert.strictEqual(balancesRes.status, 200);
      const balances = (await balancesRes.json()) as any[];
      assert.ok(balances.length > 0);
      assert.strictEqual(balances[0].entitlementDays, 14);

      // 4. M-Pesa disbursement blocks unapproved payroll runs (run_2026_03 starts as "reviewed")
      const unapprovedDisburseRes = await fetch(
        `${baseUrl}/api/payroll/runs/run_2026_03/disburse-mpesa`,
        {
          method: "POST",
          headers: { "x-peopleos-role": "payroll_officer" },
        },
      );
      assert.strictEqual(unapprovedDisburseRes.status, 409);

      // Approve payroll run as authorized payroll officer, then M-Pesa disbursement succeeds
      const approveRes = await fetch(`${baseUrl}/api/payroll/approve`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-peopleos-role": "payroll_officer",
        },
        body: JSON.stringify({ period: "run_2026_03" }),
      });
      assert.strictEqual(approveRes.status, 200);

      const approvedDisburseRes = await fetch(
        `${baseUrl}/api/payroll/runs/run_2026_03/disburse-mpesa`,
        {
          method: "POST",
          headers: { "x-peopleos-role": "payroll_officer" },
        },
      );
      assert.strictEqual(approvedDisburseRes.status, 200);
      const disburseJson = (await approvedDisburseRes.json()) as any;
      assert.strictEqual(disburseJson.totalEmployeesPaid > 0, true);
      assert.strictEqual(disburseJson.providerMode, "SANDBOX_SIMULATION");
    });
  });
});
