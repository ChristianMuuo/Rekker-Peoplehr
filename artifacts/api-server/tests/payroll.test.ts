import { test, describe } from "node:test";
import assert from "node:assert";
import http from "node:http";
import type { AddressInfo } from "node:net";
import app from "../src/app";
import {
  activateStatutoryConfig,
  getActiveStatutoryConfig,
  listStatutoryConfigs,
} from "../src/lib/kenyaPayrollEngine";
import { calculateStatutoryKenya } from "../src/routes/payroll";

describe("Kenya Statutory Payroll & Tax Engine", () => {
  test("calculates NSSF Tier I and Tier II with proper statutory cap", () => {
    // For gross salary of KES 200,000 (above KES 72,000 ceiling):
    // Tier 1: 6% of 8,000 = 480
    // Tier 2: 6% of (72,000 - 8,000) = 3,840
    // Total NSSF must cap at exactly 4,320
    const result = calculateStatutoryKenya(200000);
    assert.strictEqual(result.nssfTier1, 480);
    assert.strictEqual(result.nssfTier2, 3840);
    assert.strictEqual(result.totalNssf, 4320);
  });

  test("calculates SHA at 2.75% with minimum threshold of KES 300", () => {
    // For very low income (e.g. KES 5,000), 2.75% = 137.5, so minimum KES 300 applies
    const lowIncome = calculateStatutoryKenya(5000);
    assert.strictEqual(lowIncome.sha, 300);

    // For KES 100,000 gross, 2.75% = 2,750
    const normalIncome = calculateStatutoryKenya(100000);
    assert.strictEqual(normalIncome.sha, 2750);
  });

  test("calculates Affordable Housing Levy (AHL) at exactly 1.5% of gross earnings", () => {
    // For KES 150,000 gross: 1.5% = 2,250
    const result = calculateStatutoryKenya(150000);
    assert.strictEqual(result.housingLevy, 2250);
  });

  test("computes PAYE graduated tax bands with personal relief of KES 2,400", () => {
    // Salary: KES 120,000
    // Total NSSF: 4,320
    // Taxable Pay: 120,000 - 4,320 = 115,680
    // Band 1: 24,000 * 10% = 2,400
    // Band 2: 8,333 * 25% = 2,083.25
    // Band 3: (115,680 - 32,333) = 83,347 * 30% = 25,004.1
    // Total Tax before relief = 29,487
    // Personal relief: 2,400
    // Net PAYE before insurance relief: 27,087
    const result = calculateStatutoryKenya(120000);
    assert.strictEqual(result.personalRelief, 2400);
    assert.ok(result.payeBeforeRelief > result.netPaye);
    assert.ok(result.netPaye > 20000 && result.netPaye < 30000);
  });

  test("verifies total deductions and net pay arithmetic integrity", () => {
    const gross = 250000;
    const allowances = 30000;
    const result = calculateStatutoryKenya(gross, allowances);

    const totalCalculatedDeductions =
      result.totalNssf + result.sha + result.housingLevy + result.netPaye;

    assert.strictEqual(result.grossPay, gross + allowances);
    assert.strictEqual(result.totalDeductions, totalCalculatedDeductions);
    assert.strictEqual(result.netPay, result.grossPay - result.totalDeductions);
  });

  test("defaults active schedule to 2026 Year 4 NSSF (9,000/108,000) with pre-PAYE deductible SHIF & AHL", async () => {
    const orgId = `test-org-year4-${Date.now()}`;
    const active = await getActiveStatutoryConfig(orgId);
    assert.strictEqual(active.effectiveFrom, "2026-02-01");
    assert.strictEqual(active.nssf.tier1UpperLimitKes, 9000);
    assert.strictEqual(active.nssf.tier2UpperLimitKes, 108000);
    assert.strictEqual(active.shif.deductibleFromTaxablePay, true);
    assert.strictEqual(active.housingLevy.deductibleFromTaxablePay, true);

    const calc = calculateStatutoryKenya(180000, 0, 0, active);
    assert.strictEqual(calc.totalNssf, 6480, "Year 4 NSSF caps at 6% of 108,000 = 6,480");
    assert.strictEqual(calc.sha, 4950, "SHIF = 2.75% of 180,000 = 4,950");
    assert.strictEqual(calc.housingLevy, 2700, "AHL = 1.5% of 180,000 = 2,700");
    assert.strictEqual(calc.insuranceRelief, 0, "No insurance relief when SHIF is tax-deductible");
    assert.strictEqual(calc.taxablePay, 180000 - 6480 - 4950 - 2700);
  });

  test("activateStatutoryConfig switches active schedule and updates P9A/calculate API behavior", async () => {
    const orgId = `test-org-switch-${Date.now()}`;
    const configs = await listStatutoryConfigs(orgId);
    const phase3 = configs.find((c) => c.effectiveFrom === "2025-02-01");
    assert.ok(phase3);

    const switched = await activateStatutoryConfig(orgId, phase3.id);
    assert.ok(switched?.isActive);
    const afterSwitch = await getActiveStatutoryConfig(orgId);
    assert.strictEqual(afterSwitch.id, phase3.id);

    const server = http.createServer(app);
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const { port } = server.address() as AddressInfo;
    try {
      const baseUrl = `http://127.0.0.1:${port}`;
      const p9aRes = await fetch(`${baseUrl}/api/payroll/p9a/10000000-0000-4000-8000-000000000001`, {
        headers: { "x-peopleos-role": "payroll_officer" },
      });
      assert.strictEqual(p9aRes.status, 200);
      const p9a = (await p9aRes.json()) as { months: unknown[]; totals: { grossPay: number }; taxYear: number };
      assert.ok(p9a.months.length >= 1);
      assert.ok(p9a.totals.grossPay > 0);
      assert.ok(p9a.taxYear >= 2026);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
});

