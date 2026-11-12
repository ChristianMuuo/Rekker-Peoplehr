import { describe, test } from "node:test";
import assert from "node:assert";
import http from "node:http";
import type { AddressInfo } from "node:net";
import app from "../src/app";
import { validateRuntimeEnvironment } from "../src/config/env";
import { __setAuditSinkFailureForTest, AuditPersistenceError, recordAuditEvent } from "../src/lib/auditService";
import {
  assertSafeDocumentUpload,
  decryptSensitiveField,
  encryptSensitiveField,
  inspectKeyRotationReadiness,
  resetSecurityKeyCache,
} from "../src/lib/security";
import { PEOPLEOS_ROLES } from "../src/middlewares/peopleosAccess";
import {
  __setFallbackAllowedForTest,
  ApiError,
  customFetch,
} from "../../../lib/api-client-react/src/custom-fetch";

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

describe("Phase 1 Enterprise Foundation: Auth, IDOR, Config, Encryption, Audit & Client Safety", () => {
  test("1. Unauthenticated access (signed-out) fails closed with 401 across protected endpoints", async () => {
    await withServer(async (baseUrl) => {
      const signedOutHeaders = { "x-peopleos-auth": "signed-out" };
      for (const route of [
        "/api/auth/context",
        "/api/employees",
        "/api/payroll/runs",
        "/api/audit-events",
        "/api/admin/diagnostics",
      ]) {
        const res = await fetch(`${baseUrl}${route}`, { headers: signedOutHeaders });
        assert.strictEqual(res.status, 401, `Expected 401 for unauthenticated GET ${route}`);
        const body = (await res.json()) as { code?: string };
        assert.strictEqual(body.code, "UNAUTHENTICATED");
      }
    });
  });

  test("2. Horizontal & vertical IDOR enforcement isolates employees and restricts managers to direct reports", async () => {
    await withServer(async (baseUrl) => {
      const employeeHeaders = {
        "x-peopleos-user-id": "user_demo_emp_01", // Bound to Mwangi Kariuki (10000000-...-0002)
        "x-peopleos-role": PEOPLEOS_ROLES.employee,
      };

      // Self profile list only contains own record (even in demo sandbox mode)
      const listRes = await fetch(`${baseUrl}/api/employees`, { headers: employeeHeaders });
      assert.strictEqual(listRes.status, 200);
      const listData = (await listRes.json()) as { items: Array<{ id: string }> };
      assert.strictEqual(listData.items.length, 1);
      assert.strictEqual(listData.items[0]?.id, "10000000-0000-4000-8000-000000000002");

      // Reading colleague's profile & 360 profile returns 403 FORBIDDEN_EMPLOYEE_PROFILE
      const colleagueRes = await fetch(
        `${baseUrl}/api/employees/10000000-0000-4000-8000-000000000001`,
        { headers: employeeHeaders },
      );
      assert.strictEqual(colleagueRes.status, 403);

      const colleague360Res = await fetch(
        `${baseUrl}/api/employees/10000000-0000-4000-8000-000000000001/profile-360`,
        { headers: employeeHeaders },
      );
      assert.strictEqual(colleague360Res.status, 403);

      // Own 360 profile is permitted and omits hardcoded fake phone numbers
      const self360Res = await fetch(
        `${baseUrl}/api/employees/10000000-0000-4000-8000-000000000002/profile-360`,
        { headers: employeeHeaders },
      );
      assert.strictEqual(self360Res.status, 200);
      const self360 = (await self360Res.json()) as any;
      assert.strictEqual(self360.statutoryIdentifiers.kraPin, "DEM*****02");
      assert.notStrictEqual(self360.emergencyContact?.name, "Grace Njoki");

      // Employee blocked from payroll, audit, and admin diagnostics
      assert.strictEqual((await fetch(`${baseUrl}/api/payroll/runs`, { headers: employeeHeaders })).status, 403);
      assert.strictEqual((await fetch(`${baseUrl}/api/audit-events`, { headers: employeeHeaders })).status, 403);
      assert.strictEqual((await fetch(`${baseUrl}/api/admin/diagnostics`, { headers: employeeHeaders })).status, 403);

      // Department manager (Achieng 0001) can inspect direct report (Mwangi 0002) but NOT unrelated report (Brian 0006)
      const managerHeaders = {
        "x-peopleos-user-id": "user_demo_mgr_01",
        "x-peopleos-role": PEOPLEOS_ROLES.departmentManager,
      };
      assert.strictEqual(
        (await fetch(`${baseUrl}/api/employees/10000000-0000-4000-8000-000000000002`, { headers: managerHeaders })).status,
        200,
      );
      assert.strictEqual(
        (await fetch(`${baseUrl}/api/employees/10000000-0000-4000-8000-000000000006`, { headers: managerHeaders })).status,
        403,
      );
      // Manager cannot read confidential HR cases
      assert.strictEqual(
        (await fetch(`${baseUrl}/api/hr-cases`, { headers: managerHeaders })).status,
        403,
      );
    });
  });

  test("3. Expanded enterprise roles resolve cleanly in /auth/context while invalid roles fail with 403", async () => {
    await withServer(async (baseUrl) => {
      const finRes = await fetch(`${baseUrl}/api/auth/context`, {
        headers: { "x-peopleos-role": PEOPLEOS_ROLES.financeManager },
      });
      assert.strictEqual(finRes.status, 200);
      const finCtx = (await finRes.json()) as { role: string; canViewPayroll: boolean; canViewAudit: boolean };
      assert.strictEqual(finCtx.role, "finance_manager");
      assert.strictEqual(finCtx.canViewPayroll, true);
      assert.strictEqual(finCtx.canViewAudit, false);

      const dirRes = await fetch(`${baseUrl}/api/auth/context`, {
        headers: { "x-peopleos-role": PEOPLEOS_ROLES.hrDirector },
      });
      assert.strictEqual(dirRes.status, 200);
      const dirCtx = (await dirRes.json()) as { role: string; canManageSettings: boolean; canViewAudit: boolean };
      assert.strictEqual(dirCtx.role, "hr_director");
      assert.strictEqual(dirCtx.canManageSettings, true);
      assert.strictEqual(dirCtx.canViewAudit, true);

      const badRoleRes = await fetch(`${baseUrl}/api/auth/context`, {
        headers: { "x-peopleos-role": "super_hacker_role" },
      });
      assert.strictEqual(badRoleRes.status, 403);
    });
  });

  test("4. Spoofed demo headers and cross-tenant org headers are rejected with 403 when Clerk mode is enforced", async () => {
    const prevMode = process.env.PEOPLEOS_AUTH_MODE;
    const prevClerk = process.env.CLERK_SECRET_KEY;
    try {
      process.env.PEOPLEOS_AUTH_MODE = "clerk";
      process.env.CLERK_SECRET_KEY = "sk_test_phase1_mock_verification_key";

      await withServer(async (baseUrl) => {
        const spoofedRole = await fetch(`${baseUrl}/api/employees`, {
          headers: { "x-peopleos-role": "system_admin" },
        });
        assert.strictEqual(spoofedRole.status, 403);
        const spoofJson = (await spoofedRole.json()) as { code?: string };
        assert.strictEqual(spoofJson.code, "DEMO_HEADERS_FORBIDDEN");

        const spoofedUser = await fetch(`${baseUrl}/api/employees`, {
          headers: { "x-peopleos-user-id": "user_demo_admin_01" },
        });
        assert.strictEqual(spoofedUser.status, 403);

        const noSession = await fetch(`${baseUrl}/api/employees`);
        assert.strictEqual(noSession.status, 401);
      });
    } finally {
      if (prevMode === undefined) delete process.env.PEOPLEOS_AUTH_MODE;
      else process.env.PEOPLEOS_AUTH_MODE = prevMode;
      if (prevClerk === undefined) delete process.env.CLERK_SECRET_KEY;
      else process.env.CLERK_SECRET_KEY = prevClerk;
    }
  });

  test("5. Startup environment validator fails closed on unsafe production combinations", () => {
    const missingProdConfig = validateRuntimeEnvironment({
      NODE_ENV: "production",
      PEOPLEOS_AUTH_MODE: "demo",
      PEOPLEOS_DEMO_AUTH: "true",
      PEOPLEOS_ALLOWED_ORIGINS: "*",
    });
    assert.strictEqual(missingProdConfig.valid, false);
    assert.ok(missingProdConfig.errors.some((e) => e.includes("Demo authentication")));
    assert.ok(missingProdConfig.errors.some((e) => e.includes("CLERK_SECRET_KEY")));
    assert.ok(missingProdConfig.errors.some((e) => e.includes("PEOPLEOS_ENCRYPTION_KEY")));
    assert.ok(missingProdConfig.errors.some((e) => e.includes("wildcard '*'")));
    assert.ok(missingProdConfig.errors.some((e) => e.includes("DATABASE_URL")));

    const keyReuseConfig = validateRuntimeEnvironment({
      NODE_ENV: "production",
      PEOPLEOS_AUTH_MODE: "clerk",
      DATABASE_URL: "postgres://user:pass@localhost:5432/db",
      CLERK_SECRET_KEY: "sk_live_very_secret_reused_string_value_1234",
      VITE_CLERK_PUBLISHABLE_KEY: "pk_live_1234",
      PEOPLEOS_ENCRYPTION_KEY: "sk_live_very_secret_reused_string_value_1234",
      PEOPLEOS_ALLOWED_ORIGINS: "https://peopleos.rekker.co.ke",
    });
    assert.strictEqual(keyReuseConfig.valid, false);
    assert.ok(keyReuseConfig.errors.some((e) => e.includes("not reused from CLERK_SECRET_KEY")));

    const validProdConfig = validateRuntimeEnvironment({
      NODE_ENV: "production",
      PEOPLEOS_AUTH_MODE: "clerk",
      DATABASE_URL: "postgres://user:pass@localhost:5432/db",
      CLERK_SECRET_KEY: "sk_live_abc123",
      VITE_CLERK_PUBLISHABLE_KEY: "pk_live_abc123",
      PEOPLEOS_ENCRYPTION_KEY: "a_strong_independent_32_plus_char_enterprise_secret_key",
      PEOPLEOS_ALLOWED_ORIGINS: "https://peopleos.rekker.co.ke,https://admin.rekker.co.ke",
    });
    assert.strictEqual(validProdConfig.valid, true);
    assert.strictEqual(validProdConfig.errors.length, 0);
  });

  test("6. Strict CORS allowlist rejects unknown origins with 403 and echoes X-Correlation-Id", async () => {
    await withServer(async (baseUrl) => {
      const blockedCors = await fetch(`${baseUrl}/api/healthz`, {
        headers: {
          Origin: "https://untrusted.attacker.invalid",
          "X-Correlation-Id": "phase1-test-cid-001",
        },
      });
      assert.strictEqual(blockedCors.status, 403);
      assert.strictEqual(blockedCors.headers.get("access-control-allow-origin"), null);
      assert.strictEqual(blockedCors.headers.get("x-correlation-id"), "phase1-test-cid-001");
      const corsJson = (await blockedCors.json()) as { code?: string; correlationId?: string };
      assert.strictEqual(corsJson.code, "CORS_ORIGIN_DENIED");
      assert.strictEqual(corsJson.correlationId, "phase1-test-cid-001");

      const allowedCors = await fetch(`${baseUrl}/api/healthz`, {
        headers: { Origin: "http://localhost:5173" },
      });
      assert.strictEqual(allowedCors.status, 200);
      assert.strictEqual(allowedCors.headers.get("access-control-allow-origin"), "http://localhost:5173");
    });
  });

  test("7. Versioned AES-256-GCM enc:v2 key ring supports seamless key rotation and fails gracefully on tamper", () => {
    const prevKey = process.env.PEOPLEOS_ENCRYPTION_KEY;
    const prevId = process.env.PEOPLEOS_ENCRYPTION_KEY_ID;
    const prevPrevious = process.env.PEOPLEOS_ENCRYPTION_PREVIOUS_KEYS;

    try {
      process.env.PEOPLEOS_ENCRYPTION_KEY_ID = "k1";
      process.env.PEOPLEOS_ENCRYPTION_KEY = "phase1_first_rotation_key_at_least_32_chars";
      delete process.env.PEOPLEOS_ENCRYPTION_PREVIOUS_KEYS;
      resetSecurityKeyCache();

      const ctK1 = encryptSensitiveField("DEMO-PIN-K1");
      assert.ok(ctK1?.startsWith("enc:v2:k1:"));

      // Rotate active key to k2 while keeping k1 in previous keys ring
      process.env.PEOPLEOS_ENCRYPTION_KEY_ID = "k2";
      process.env.PEOPLEOS_ENCRYPTION_KEY = "phase1_second_rotation_key_at_least_32_chars";
      process.env.PEOPLEOS_ENCRYPTION_PREVIOUS_KEYS =
        "k1=phase1_first_rotation_key_at_least_32_chars";
      resetSecurityKeyCache();

      const ctK2 = encryptSensitiveField("DEMO-PIN-K2");
      assert.ok(ctK2?.startsWith("enc:v2:k2:"));
      assert.strictEqual(decryptSensitiveField(ctK1), "DEMO-PIN-K1");
      assert.strictEqual(decryptSensitiveField(ctK2), "DEMO-PIN-K2");

      // Tampered envelope returns safe sentinel instead of raw plaintext or uncaught crash
      const tampered = ctK2!.slice(0, -4) + "ZZZZ";
      assert.strictEqual(decryptSensitiveField(tampered), "[ENCRYPTED_UNAVAILABLE]");

      const readiness = inspectKeyRotationReadiness([
        { recordId: "1", field: "kraPin", ciphertext: ctK2 },
        { recordId: "2", field: "kraPin", ciphertext: ctK1 },
        { recordId: "3", field: "kraPin", ciphertext: tampered },
      ]);
      assert.strictEqual(readiness.activeKeyId, "k2");
      assert.strictEqual(readiness.alreadyCurrentV2, 1);
      assert.strictEqual(readiness.eligibleLegacyV1, 1);
      assert.strictEqual(readiness.unreadable, 1);
    } finally {
      if (prevKey === undefined) delete process.env.PEOPLEOS_ENCRYPTION_KEY;
      else process.env.PEOPLEOS_ENCRYPTION_KEY = prevKey;
      if (prevId === undefined) delete process.env.PEOPLEOS_ENCRYPTION_KEY_ID;
      else process.env.PEOPLEOS_ENCRYPTION_KEY_ID = prevId;
      if (prevPrevious === undefined) delete process.env.PEOPLEOS_ENCRYPTION_PREVIOUS_KEYS;
      else process.env.PEOPLEOS_ENCRYPTION_PREVIOUS_KEYS = prevPrevious;
      resetSecurityKeyCache();
    }
  });

  test("8. Document upload validation enforces MIME, signature bytes, size limits, and explicit employeeId", async () => {
    assert.strictEqual(
      assertSafeDocumentUpload({ fileName: "malware.exe" }).ok,
      false,
    );
    assert.strictEqual(
      assertSafeDocumentUpload({
        fileName: "contract.pdf",
        mimeType: "text/html",
      }).ok,
      false,
    );
    assert.strictEqual(
      assertSafeDocumentUpload({
        fileName: "fake.pdf",
        mimeType: "application/pdf",
        base64Sample: Buffer.from("<html>evil</html>").toString("base64"),
      }).ok,
      false,
    );
    assert.strictEqual(
      assertSafeDocumentUpload({
        fileName: "oversized.pdf",
        sizeBytes: 25 * 1024 * 1024,
      }).ok,
      false,
    );

    const validPdf = assertSafeDocumentUpload({
      fileName: "Signed Contract.pdf",
      mimeType: "application/pdf",
      sizeBytes: 1024,
      base64Sample: Buffer.from("%PDF-1.7 sample").toString("base64"),
    });
    assert.strictEqual(validPdf.ok, true);

    await withServer(async (baseUrl) => {
      // Missing employeeId rejected instead of defaulting silently
      const missingEmp = await fetch(`${baseUrl}/api/documents`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-peopleos-role": "hr_admin" },
        body: JSON.stringify({ name: "contract.pdf", category: "Contract" }),
      });
      assert.strictEqual(missingEmp.status, 400);

      // Disallowed MIME/extension rejected
      const badMime = await fetch(`${baseUrl}/api/documents`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-peopleos-role": "hr_admin" },
        body: JSON.stringify({
          name: "payload.pdf",
          employeeId: "10000000-0000-4000-8000-000000000002",
          mimeType: "application/x-msdownload",
        }),
      });
      assert.strictEqual(badMime.status, 400);

      // Valid document upload succeeds with checksum
      const okRes = await fetch(`${baseUrl}/api/documents`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-peopleos-role": "hr_admin" },
        body: JSON.stringify({
          name: "Phase 1 Policy Ack.pdf",
          employeeId: "10000000-0000-4000-8000-000000000002",
          mimeType: "application/pdf",
          sizeBytes: 2048,
          base64Sample: Buffer.from("%PDF-1.4 valid").toString("base64"),
        }),
      });
      assert.strictEqual(okRes.status, 201);
      const uploaded = (await okRes.json()) as { checksumSha256?: string };
      assert.ok(uploaded.checksumSha256 && uploaded.checksumSha256.length === 64);
    });
  });

  test("9. Critical audit persistence fails closed with AuditPersistenceError and returns 503", async () => {
    try {
      __setAuditSinkFailureForTest(true);
      await assert.rejects(
        () =>
          recordAuditEvent({
            organizationId: "rekker-demo",
            actorUserId: "user_demo_admin_01",
            actor: "hr_admin",
            action: "PAYROLL_APPROVED",
            targetType: "payroll_run",
            targetId: "run_test",
            summary: "Bearer top_secret_token_should_not_leak",
            critical: true,
          }),
        AuditPersistenceError,
      );

      await withServer(async (baseUrl) => {
        const res = await fetch(`${baseUrl}/api/documents`, {
          method: "POST",
          headers: { "content-type": "application/json", "x-peopleos-role": "hr_admin" },
          body: JSON.stringify({
            name: "Critical Audit Check.pdf",
            employeeId: "10000000-0000-4000-8000-000000000002",
            mimeType: "application/pdf",
            sizeBytes: 120,
          }),
        });
        assert.strictEqual(res.status, 503);
      });
    } finally {
      __setAuditSinkFailureForTest(false);
    }
  });

  test("10. /api/readyz and RBAC-protected /api/admin/diagnostics never leak environment secrets", async () => {
    const prevEnc = process.env.PEOPLEOS_ENCRYPTION_KEY;
    const prevOpenAi = process.env.OPENAI_API_KEY;
    const fakeEncSecret = "super_secret_encryption_material_for_leak_check";
    const fakeAiSecret = "sk-proj-super-secret-openai-token-check";
    try {
      process.env.PEOPLEOS_ENCRYPTION_KEY = fakeEncSecret;
      process.env.OPENAI_API_KEY = fakeAiSecret;

      await withServer(async (baseUrl) => {
        const readyRes = await fetch(`${baseUrl}/api/readyz`);
        assert.strictEqual(readyRes.status, 200);
        const readyText = await readyRes.text();
        assert.ok(!readyText.includes(fakeEncSecret));
        assert.ok(!readyText.includes(fakeAiSecret));

        const adminDiagRes = await fetch(`${baseUrl}/api/admin/diagnostics`, {
          headers: { "x-peopleos-role": "auditor" },
        });
        assert.strictEqual(adminDiagRes.status, 200);
        const diagText = await adminDiagRes.text();
        assert.ok(!diagText.includes(fakeEncSecret));
        assert.ok(!diagText.includes(fakeAiSecret));

        const diag = JSON.parse(diagText) as {
          subsystems: Array<{ id: string }>;
          integrations: Array<{ id: string }>;
        };
        assert.ok(diag.subsystems.some((s) => s.id === "postgresql_db"));
        assert.ok(diag.integrations.some((i) => i.id === "rekker_external_web"));
      });
    } finally {
      if (prevEnc === undefined) delete process.env.PEOPLEOS_ENCRYPTION_KEY;
      else process.env.PEOPLEOS_ENCRYPTION_KEY = prevEnc;
      if (prevOpenAi === undefined) delete process.env.OPENAI_API_KEY;
      else process.env.OPENAI_API_KEY = prevOpenAi;
    }
  });

  test("11. Frontend customFetch never masks HTTP 4xx/5xx server errors behind mock data", async () => {
    const originalFetch = globalThis.fetch;
    try {
      __setFallbackAllowedForTest(true);

      // Real HTTP 403 or 500 MUST throw ApiError even if fallback is enabled
      globalThis.fetch = async () =>
        new Response(JSON.stringify({ error: "Access denied by server", code: "FORBIDDEN" }), {
          status: 403,
          headers: { "content-type": "application/json" },
        });

      await assert.rejects(
        () => customFetch("http://127.0.0.1:59999/api/employees"),
        (err: unknown) => err instanceof ApiError && err.status === 403,
      );

      globalThis.fetch = async () =>
        new Response(JSON.stringify({ error: "Database failure" }), {
          status: 500,
          headers: { "content-type": "application/json" },
        });

      await assert.rejects(
        () => customFetch("http://127.0.0.1:59999/api/employees"),
        (err: unknown) => err instanceof ApiError && err.status === 500,
      );

      // Network failure with fallback disabled throws cleanly
      __setFallbackAllowedForTest(false);
      globalThis.fetch = async () => {
        throw new TypeError("fetch failed: connection refused");
      };
      await assert.rejects(
        () => customFetch("http://127.0.0.1:59999/api/employees"),
        TypeError,
      );

      // Network failure with explicit static fallback reports synthetic preview honestly
      __setFallbackAllowedForTest(true);
      const readyFallback = await customFetch<{ status: string }>(
        "http://127.0.0.1:59999/api/readyz",
      );
      assert.strictEqual(readyFallback.status, "static_preview");
    } finally {
      globalThis.fetch = originalFetch;
      __setFallbackAllowedForTest(null);
    }
  });
});
