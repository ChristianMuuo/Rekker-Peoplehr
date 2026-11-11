import { describe, test } from "node:test";
import assert from "node:assert";
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

describe("Rekker Digital Ecosystem: Firewall, Portals, MOQ & CRM Integration", () => {
  test("Public endpoints strip internal trade prices, salaries & reject customer/distributor access to CRM", async () => {
    await withServer(async (baseUrl) => {
      const catRes = await fetch(`${baseUrl}/api/public/catalog`);
      assert.strictEqual(catRes.status, 200);
      const cat = (await catRes.json()) as any;
      assert.ok(Array.isArray(cat.items) && cat.items.length >= 4);
      for (const item of cat.items) {
        assert.strictEqual(item.tradePriceKes, undefined, "Public catalog must never expose internal trade pricing");
      }

      const careersRes = await fetch(`${baseUrl}/api/public/careers`);
      assert.strictEqual(careersRes.status, 200);
      const careers = (await careersRes.json()) as any;
      assert.ok(careers.items.length >= 1);
      for (const job of careers.items) {
        assert.strictEqual(job.minSalary, undefined, "Public careers must never expose internal payroll bands");
        assert.strictEqual(job.maxSalary, undefined);
      }

      for (const blockedRole of ["customer", "distributor", "employee"]) {
        const crmRes = await fetch(`${baseUrl}/api/erp/crm/leads`, {
          headers: { "x-peopleos-role": blockedRole },
        });
        assert.strictEqual(crmRes.status, 403, `Role ${blockedRole} must not read internal CRM leads`);
      }
    });
  });

  test("Public quotation request routes into CRM pipeline and isolates customer accounts strictly", async () => {
    await withServer(async (baseUrl) => {
      // Alice submits public quote while authenticated with her buyer ID
      const quoteRes = await fetch(`${baseUrl}/api/public/quotes`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-peopleos-user-id": "cust_alice_isolated",
        },
        body: JSON.stringify({
          customerName: "Alice Wanjiru",
          companyName: "Alice Mart",
          email: "alice@mart.co.ke",
          productName: "Saffron Milan Hard-Water Laundry Detergent Line",
          requestedQuantity: 36,
          deliveryLocation: "Nakuru",
        }),
      });
      assert.strictEqual(quoteRes.status, 201);
      const quoteConfirm = (await quoteRes.json()) as any;
      assert.ok(quoteConfirm.referenceCode.startsWith("QT-"));

      // Alice sees her quote in Customer Portal
      const alicePortal = await fetch(`${baseUrl}/api/portal/customer/summary`, {
        headers: {
          "x-peopleos-role": "customer",
          "x-peopleos-user-id": "cust_alice_isolated",
        },
      });
      assert.strictEqual(alicePortal.status, 200);
      const aliceData = (await alicePortal.json()) as any;
      assert.ok(aliceData.quotations.some((q: any) => q.referenceCode === quoteConfirm.referenceCode));

      // Bob cannot see Alice's quotation in Customer Portal
      const bobPortal = await fetch(`${baseUrl}/api/portal/customer/summary`, {
        headers: {
          "x-peopleos-role": "customer",
          "x-peopleos-user-id": "cust_bob_isolated",
        },
      });
      assert.strictEqual(bobPortal.status, 200);
      const bobData = (await bobPortal.json()) as any;
      assert.strictEqual(
        bobData.quotations.some((q: any) => q.referenceCode === quoteConfirm.referenceCode),
        false,
        "Customer Bob must never view Customer Alice's quotations",
      );

      // Sales Manager inspects CRM pipeline, moves lead to won, and checks derived analytics
      const leadsRes = await fetch(`${baseUrl}/api/erp/crm/leads`, {
        headers: { "x-peopleos-role": "sales_manager" },
      });
      assert.strictEqual(leadsRes.status, 200);
      const leadsJson = (await leadsRes.json()) as any;
      const targetLead = leadsJson.items.find((l: any) => l.referenceCode === quoteConfirm.referenceCode);
      assert.ok(targetLead, "Quotation must appear automatically in CRM pipeline");
      assert.strictEqual(targetLead.stage, "quotation_requested");

      const moveRes = await fetch(`${baseUrl}/api/erp/crm/leads/${targetLead.id}/stage`, {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
          "x-peopleos-role": "sales_manager",
        },
        body: JSON.stringify({ stage: "won", estimatedValueKes: 18000 }),
      });
      assert.strictEqual(moveRes.status, 200);

      const analyticsRes = await fetch(`${baseUrl}/api/erp/crm/analytics`, {
        headers: { "x-peopleos-role": "sales_manager" },
      });
      const analytics = (await analyticsRes.json()) as any;
      assert.strictEqual(analytics.dataSource, "ACTUAL_STORED_RECORDS");
      assert.ok(analytics.wonCount >= 1 && analytics.wonValueKes >= 18000);
    });
  });

  test("Distributor wholesale ordering enforces server-side MOQ, calculates totals securely, and isolates competing distributors", async () => {
    await withServer(async (baseUrl) => {
      // Below MOQ (qty 2 < 12) must fail
      const belowMoqRes = await fetch(`${baseUrl}/api/portal/distributor/orders`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-peopleos-role": "distributor",
          "x-peopleos-user-id": "dist_alpha",
        },
        body: JSON.stringify({
          deliveryCounty: "Kiambu",
          submitNow: true,
          items: [{ productId: "prod-saffron-laundry", quantity: 2 }],
        }),
      });
      assert.strictEqual(belowMoqRes.status, 400);

      // Valid order succeeds & ignores any client-tampered totals
      const validRes = await fetch(`${baseUrl}/api/portal/distributor/orders`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-peopleos-role": "distributor",
          "x-peopleos-user-id": "dist_alpha",
        },
        body: JSON.stringify({
          deliveryCounty: "Kiambu",
          submitNow: true,
          totalAmountKes: 1, // spoofed low total should be ignored
          items: [{ productId: "prod-saffron-laundry", quantity: 12 }],
        }),
      });
      assert.strictEqual(validRes.status, 201);
      const created = (await validRes.json()) as any;
      assert.strictEqual(created.totalUnits, 12);
      assert.strictEqual(created.totalAmountKes, 12 * 380, "Server must compute trade total, never trust client totals");

      // Competing distributor Beta sees zero of Alpha's wholesale orders
      const betaDashRes = await fetch(`${baseUrl}/api/portal/distributor/dashboard`, {
        headers: {
          "x-peopleos-role": "distributor",
          "x-peopleos-user-id": "dist_beta",
        },
      });
      assert.strictEqual(betaDashRes.status, 200);
      const betaDash = (await betaDashRes.json()) as any;
      assert.strictEqual(
        betaDash.orders.some((o: any) => o.orderNumber === created.orderNumber),
        false,
        "Competing distributor Beta must never see Alpha's wholesale orders",
      );
    });
  });
});
