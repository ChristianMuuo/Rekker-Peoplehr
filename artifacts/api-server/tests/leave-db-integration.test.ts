import { describe, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { PGlite } from "@workspace/db";
import app from "../src/app";
import { computeAuditEntryHash } from "../src/lib/auditLogger";

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

describe("PostgreSQL (PGlite) Schema Migration, Ledger & First-Party Auth Verification", { concurrency: 1 }, () => {
  test("1. PGlite executes 0008_production_core.sql and enforces ledger idempotency + transaction rollback", async () => {
    const pg = new PGlite();
    // Create minimal parent tables referenced by foreign keys in 0008_production_core.sql
    await pg.exec(`
      CREATE TABLE IF NOT EXISTS organizations (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        is_demo BOOLEAN NOT NULL DEFAULT false
      );
      CREATE TABLE IF NOT EXISTS employees (
        id UUID PRIMARY KEY,
        organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        first_name TEXT NOT NULL,
        last_name TEXT NOT NULL
      );
    `);

    const migrationPath = path.resolve(
      process.cwd(),
      "../../lib/db/migrations/0008_production_core.sql",
    );
    const migrationSql = fs.readFileSync(migrationPath, "utf8");
    await pg.exec(migrationSql);

    const orgId = "rekker-pglite-test";
    const empId = "10000000-0000-4000-8000-000000000099";
    await pg.query("INSERT INTO organizations (id, name, is_demo) VALUES ($1, $2, true)", [
      orgId,
      "Rekker Test Org",
    ]);
    await pg.query(
      "INSERT INTO employees (id, organization_id, first_name, last_name) VALUES ($1, $2, $3, $4)",
      [empId, orgId, "Test", "Employee"],
    );

    // Seed balance row (21.00 days = 2100 hundredths)
    await pg.query(
      `INSERT INTO peopleos_leave_balances
        (organization_id, employee_id, leave_type_code, leave_year, entitled_hundredths, accrued_hundredths, available_hundredths)
       VALUES ($1, $2, 'annual', 2027, 2100, 2100, 2100)`,
      [orgId, empId],
    );

    // Atomic deduction + ledger entry with idempotency key
    const idempKey = "approve-leave-req-001";
    await pg.exec("BEGIN");
    await pg.query(
      `INSERT INTO peopleos_leave_ledger
        (organization_id, employee_id, leave_type_code, leave_year, entry_type, days_hundredths, reason, idempotency_key)
       VALUES ($1, $2, 'annual', 2027, 'deduction', -500, 'Approved annual leave', $3)`,
      [orgId, empId, idempKey],
    );
    await pg.query(
      `UPDATE peopleos_leave_balances
       SET used_hundredths = used_hundredths + 500, available_hundredths = available_hundredths - 500
       WHERE organization_id = $1 AND employee_id = $2 AND leave_type_code = 'annual' AND leave_year = 2027`,
      [orgId, empId],
    );
    await pg.exec("COMMIT");

    // Duplicate idempotency key must be rejected by unique index
    await assert.rejects(
      pg.query(
        `INSERT INTO peopleos_leave_ledger
          (organization_id, employee_id, leave_type_code, leave_year, entry_type, days_hundredths, reason, idempotency_key)
         VALUES ($1, $2, 'annual', 2027, 'deduction', -500, 'Duplicate retry', $3)`,
        [orgId, empId, idempKey],
      ),
    );

    // Rollback preserves balance at 1600
    await pg.exec("BEGIN");
    await pg.query(
      `UPDATE peopleos_leave_balances SET available_hundredths = available_hundredths - 300 WHERE organization_id = $1 AND employee_id = $2`,
      [orgId, empId],
    );
    await pg.exec("ROLLBACK");

    const balRes = await pg.query<{ used_hundredths: number; available_hundredths: number }>(
      "SELECT used_hundredths, available_hundredths FROM peopleos_leave_balances WHERE organization_id = $1 AND employee_id = $2",
      [orgId, empId],
    );
    assert.equal(balRes.rows[0]?.used_hundredths, 500);
    assert.equal(balRes.rows[0]?.available_hundredths, 1600);

    // Hash-chained audit log verification
    const h1 = computeAuditEntryHash("GENESIS", {
      organizationId: orgId,
      actorUserId: "user_1",
      action: "leave_request_approved",
      entityType: "leave_request",
      entityId: "req-1",
      occurredAtIso: "2026-11-27T10:00:00.000Z",
    });
    const h2 = computeAuditEntryHash(h1, {
      organizationId: orgId,
      actorUserId: "user_1",
      action: "leave_request_cancelled",
      entityType: "leave_request",
      entityId: "req-1",
      occurredAtIso: "2026-11-27T10:05:00.000Z",
    });
    assert.notEqual(h1, h2);
    assert.equal(h1.length, 64);

    await pg.close();
  });

  test("2. First-party argon2id login sets httpOnly session cookie, resolves /api/auth/me & /api/auth/context, and logs out", async () => {
    await withServer(async (baseUrl) => {
      const loginRes = await fetch(`${baseUrl}/api/auth/login`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email: "demo.hradmin@rekker-demo.invalid",
          password: process.env.DEMO_USER_PASSWORD || "RekkerDemo!2026",
        }),
      });
      assert.equal(loginRes.status, 200);
      const setCookie = loginRes.headers.get("set-cookie") ?? "";
      assert.ok(setCookie.includes("peopleos_sid="), "Must set peopleos_sid cookie");
      assert.ok(setCookie.toLowerCase().includes("httponly"), "Session cookie must be HttpOnly");

      const sidCookie = setCookie
        .split(",")
        .flatMap((c) => c.split(";"))
        .find((c) => c.trim().startsWith("peopleos_sid="))!
        .trim();

      const meRes = await fetch(`${baseUrl}/api/auth/me`, {
        headers: { cookie: sidCookie },
      });
      assert.equal(meRes.status, 200);
      const me = (await meRes.json()) as any;
      assert.equal(me.authenticated, true);
      assert.equal(me.user.role, "hr_admin");

      const ctxRes = await fetch(`${baseUrl}/api/auth/context`, {
        headers: { cookie: sidCookie },
      });
      assert.equal(ctxRes.status, 200);
      const ctx = (await ctxRes.json()) as any;
      assert.equal(ctx.role, "hr_admin");
      assert.equal(ctx.canManagePeople, true);

      const logoutRes = await fetch(`${baseUrl}/api/auth/logout`, {
        method: "POST",
        headers: { cookie: sidCookie },
      });
      assert.equal(logoutRes.status, 200);

      const meAfter = await fetch(`${baseUrl}/api/auth/me`, {
        headers: { cookie: sidCookie },
      });
      assert.equal(meAfter.status, 401, "Revoked session must reject /api/auth/me");
    });
  });

  test("3. LeaveAdmin endpoints manage Kenyan work schedules, public holidays, and workspace settings", async () => {
    await withServer(async (baseUrl) => {
      const hrHeaders = {
        "content-type": "application/json",
        "x-peopleos-role": "hr_admin",
      };
      const holRes = await fetch(`${baseUrl}/api/leave/public-holidays/2026`, { headers: hrHeaders });
      assert.equal(holRes.status, 200);
      const hols = (await holRes.json()) as any;
      assert.ok(hols.items.some((h: any) => h.name === "Mashujaa Day"));

      const settingsRes = await fetch(`${baseUrl}/api/settings`, { headers: hrHeaders });
      assert.equal(settingsRes.status, 200);
      const settings = (await settingsRes.json()) as any;
      assert.equal(settings.defaultTimezone, "Africa/Nairobi");

      const auditCsvRes = await fetch(`${baseUrl}/api/audit-events/export.csv`, { headers: hrHeaders });
      assert.equal(auditCsvRes.status, 200);
      assert.ok((auditCsvRes.headers.get("content-type") ?? "").includes("text/csv"));
      const csvText = await auditCsvRes.text();
      assert.ok(csvText.startsWith("id,occurredAt,actor,action,targetType,targetId,summary"));
    });
  });
});
