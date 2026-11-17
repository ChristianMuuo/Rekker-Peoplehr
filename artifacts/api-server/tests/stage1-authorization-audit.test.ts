import { describe, test } from "node:test";
import assert from "node:assert";
import http from "node:http";
import type { AddressInfo } from "node:net";
import app from "../src/app";
import {
  __setAuditSinkFailureForTest,
  AuditPersistenceError,
  recordAuditEvent,
  sanitizeAuditSummary,
} from "../src/lib/auditService";
import {
  decryptSensitiveField,
  encryptSensitiveField,
  maskKraPin,
  maskNationalId,
  maskPhoneNumber,
  resetSecurityKeyCache,
} from "../src/lib/security";
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

describe("Stage 1: Authorization, Multi-Tenant Isolation & Audit Pipeline Verification", { concurrency: 1 }, () => {
  test("1. Negative RBAC: Unauthorized roles are rejected with 403 across operational modules", async () => {
    await withServer(async (baseUrl) => {
      const empHeaders = {
        "x-peopleos-user-id": "user_demo_emp_01",
        "x-peopleos-role": PEOPLEOS_ROLES.employee,
      };

      // Employee cannot read audit events
      const auditRes = await fetch(`${baseUrl}/api/audit-events`, { headers: empHeaders });
      assert.strictEqual(auditRes.status, 403, "Employee should not access audit events");

      // Employee cannot create leave policy
      const policyRes = await fetch(`${baseUrl}/api/leave-policies`, {
        method: "POST",
        headers: { ...empHeaders, "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Rogue Holiday", entitlementDays: 30, paid: true }),
      });
      assert.strictEqual(policyRes.status, 403, "Employee should not create leave policies");

      // Recruiter cannot access payroll runs
      const recruiterHeaders = {
        "x-peopleos-user-id": "user_demo_recruiter_01",
        "x-peopleos-role": PEOPLEOS_ROLES.recruiter,
      };
      const payrollRes = await fetch(`${baseUrl}/api/payroll/runs`, { headers: recruiterHeaders });
      assert.strictEqual(payrollRes.status, 403, "Recruiter should not access payroll runs");

      // Employee cannot register assets
      const assetRes = await fetch(`${baseUrl}/api/assets`, {
        method: "POST",
        headers: { ...empHeaders, "Content-Type": "application/json" },
        body: JSON.stringify({ assetTag: "HACK-01", name: "Rogue Laptop", serialNumber: "SN-999" }),
      });
      assert.strictEqual(assetRes.status, 403, "Employee should not register assets");
    });
  });

  test("2. Cross-Tenant Isolation: Tampered organization headers fail closed", async () => {
    const prevMode = process.env.PEOPLEOS_AUTH_MODE;
    const prevClerk = process.env.CLERK_SECRET_KEY;
    try {
      process.env.PEOPLEOS_AUTH_MODE = "clerk";
      process.env.CLERK_SECRET_KEY = "sk_test_stage1_verification_key";

      await withServer(async (baseUrl) => {
        const foreignHeaders = {
          "x-peopleos-user-id": "user_demo_admin_01",
          "x-peopleos-role": PEOPLEOS_ROLES.hrAdmin,
          "x-peopleos-org-id": "evil-corp-external-tenant",
        };
        const res = await fetch(`${baseUrl}/api/peopleos/overview`, { headers: foreignHeaders });
        assert.strictEqual(res.status, 403, "Mismatched cross-tenant header must be rejected");
        const body = (await res.json()) as { code?: string };
        assert.ok(
          body.code === "CROSS_TENANT_DENIED" || body.code === "DEMO_HEADERS_FORBIDDEN",
          `Expected cross-tenant or demo header rejection, got ${body.code}`,
        );
      });
    } finally {
      if (prevMode !== undefined) process.env.PEOPLEOS_AUTH_MODE = prevMode;
      else delete process.env.PEOPLEOS_AUTH_MODE;

      if (prevClerk !== undefined) process.env.CLERK_SECRET_KEY = prevClerk;
      else delete process.env.CLERK_SECRET_KEY;
    }
  });

  test("3. Maker-Checker Segregation of Duties: Self-approval is strictly prohibited", async () => {
    await withServer(async (baseUrl) => {
      // Maker-Checker on Expense Approvals: Employee cannot approve their own claim
      // exp-003 belongs to Achieng Odhiambo (10000000-0000-4000-8000-000000000001)
      // When Achieng acts as department manager and tries to decide exp-003, it must be rejected
      const managerWhoIsEmployee = {
        "x-peopleos-user-id": "user_demo_mgr_01", // Maps to employeeId 10000000-...-0001
        "x-peopleos-role": PEOPLEOS_ROLES.departmentManager,
      };

      const decideRes = await fetch(`${baseUrl}/api/expenses/exp-003/decision`, {
        method: "POST",
        headers: { ...managerWhoIsEmployee, "Content-Type": "application/json" },
        body: JSON.stringify({ decision: "approve", comment: "Self approving" }),
      });
      assert.strictEqual(decideRes.status, 403, "Manager cannot approve their own expense claim");
      const decideBody = (await decideRes.json()) as { code?: string };
      assert.strictEqual(decideBody.code, "MAKER_CHECKER_VIOLATION");
    });
  });

  test("4. Confidential HR Cases Firewall: Sealed notes and cases are isolated from non-HR staff", async () => {
    await withServer(async (baseUrl) => {
      // Regular employee query: confidentialNotes MUST be stripped to null
      const empHeaders = {
        "x-peopleos-user-id": "user_demo_emp_02",
        "x-peopleos-role": PEOPLEOS_ROLES.employee,
      };
      const listRes = await fetch(`${baseUrl}/api/hr-cases`, { headers: empHeaders });
      assert.strictEqual(listRes.status, 200);
      const listData = (await listRes.json()) as { items: Array<{ confidentialNotes?: unknown }> };
      for (const item of listData.items) {
        assert.strictEqual(item.confidentialNotes, null, "Confidential notes must be null for non-HR staff");
      }

      // Department manager query: strictly forbidden from browsing confidential HR cases
      const mgrHeaders = {
        "x-peopleos-user-id": "user_demo_mgr_99",
        "x-peopleos-role": PEOPLEOS_ROLES.departmentManager,
      };
      const mgrRes = await fetch(`${baseUrl}/api/hr-cases`, { headers: mgrHeaders });
      assert.strictEqual(mgrRes.status, 403, "Department managers must be firewalled from HR cases");
    });
  });

  test("5. Object-level IDOR Protection: Employees cannot mutate other employees' performance goals", async () => {
    await withServer(async (baseUrl) => {
      const empHeaders = {
        "x-peopleos-user-id": "user_demo_emp_01", // Bound to Mwangi Kariuki (10000000-...-0002)
        "x-peopleos-role": PEOPLEOS_ROLES.employee,
      };

      // goal_01 belongs to Achieng Odhiambo (10000000-...-0001). Mwangi should NOT be allowed to update it.
      const patchRes = await fetch(`${baseUrl}/api/performance/goals/goal_01/progress`, {
        method: "PATCH",
        headers: { ...empHeaders, "Content-Type": "application/json" },
        body: JSON.stringify({ progress: 99 }),
      });
      assert.strictEqual(patchRes.status, 403, "Employee cannot mutate another employee's performance goal");
    });
  });

  test("6. Cryptographic Security & ODPC PII Masking: AES-256-GCM round trip and sanitization", () => {
    resetSecurityKeyCache();

    const plainPin = "A001928374Z";
    const plainNatId = "29384756";
    const plainPhone = "+254712345678";

    // Encryption generates versioned envelope
    const encryptedPin = encryptSensitiveField(plainPin);
    assert.ok(encryptedPin?.startsWith("enc:v2:"), "Should emit enc:v2 format");

    // Decryption round-trips correctly
    const decrypted = decryptSensitiveField(encryptedPin);
    assert.strictEqual(decrypted, plainPin, "Decrypted text must match original plaintext");

    // Masking prevents raw exposure
    assert.strictEqual(maskKraPin(plainPin), "A00*****4Z", "KRA PIN must be masked");
    assert.strictEqual(maskNationalId(plainNatId), "****756", "National ID must be masked with trailing digits");
    assert.strictEqual(maskPhoneNumber(plainPhone), "+254****678", "Phone number must be masked");
  });

  test("7. Audit Pipeline: Summary sanitizer redacts tokens, PINs and ciphertexts", () => {
    const raw = "Admin processed salary for employee with PIN A123456789B with Bearer eyJhbGciOiJIUzI1Ni and payload enc:v2:k1:iv:tag:data";
    const sanitized = sanitizeAuditSummary(raw);

    assert.ok(!sanitized.includes("eyJhbGciOiJIUzI1Ni"), "Bearer token must be redacted");
    assert.ok(!sanitized.includes("A123456789B"), "KRA PIN must be redacted");
    assert.ok(!sanitized.includes("enc:v2:"), "Ciphertext payload must be redacted");
    assert.ok(sanitized.includes("[REDACTED_PIN]"));
    assert.ok(sanitized.includes("Bearer [REDACTED]"));
    assert.ok(sanitized.includes("[ENCRYPTED_FIELD]"));
  });

  test("8. Audit Pipeline Resilience: Critical state mutations fail closed if audit persistence fails", async () => {
    __setAuditSinkFailureForTest(true);
    try {
      await assert.rejects(
        async () => {
          await recordAuditEvent({
            organizationId: "rekker-demo",
            actorUserId: "user_demo_admin_01",
            actor: "hr_admin",
            action: "SALARY_DISBURSEMENT",
            targetType: "payroll_item",
            targetId: "pi-001",
            summary: "Disbursed executive salary",
            critical: true,
          });
        },
        AuditPersistenceError,
        "Critical operation must throw AuditPersistenceError when audit sink fails",
      );
    } finally {
      __setAuditSinkFailureForTest(false);
    }
  });
});
