import assert from "node:assert/strict";
import test from "node:test";
import http from "node:http";
import type { AddressInfo } from "node:net";
import app from "../src/app";
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

test("Rekker Trade B2B Platform Test Suite (trade.rekker.co.ke)", async (t) => {
  const adminHeaders = {
    "x-peopleos-user-id": "user_demo_admin_01",
    "x-peopleos-role": PEOPLEOS_ROLES.systemAdmin,
  };

  const salesHeaders = {
    "x-peopleos-user-id": "user_demo_sales_01",
    "x-peopleos-role": PEOPLEOS_ROLES.hrAdmin, // elevated role for operational approvals
  };

  await t.test("1. GET /api/trade/overview returns enterprise trading KPIs and brand breakdown", async () => {
    await withServer(async (baseUrl) => {
      const res = await fetch(`${baseUrl}/api/trade/overview`, {
        method: "GET",
        headers: adminHeaders,
      });

      assert.equal(res.status, 200, `Expected 200, got ${res.status}`);
      const data: any = await res.json();

      assert.equal(data.platform, "Rekker Trade");
      assert.equal(data.domain, "trade.rekker.co.ke");
      assert.ok(data.metrics.totalRevenueCents > 0, "Must report positive B2B revenue");
      assert.ok(data.metrics.registeredBusinesses >= 4, "Must have registered accounts");
      assert.ok(data.metrics.activeOrdersCount >= 1, "Must have active orders");
      assert.ok(data.brands.length >= 4, "Must cover all 4 core Rekker brands");

      const brandNames = data.brands.map((b: any) => b.brand);
      assert.ok(brandNames.includes("Saffron Milan"));
      assert.ok(brandNames.includes("Bio Saff"));
      assert.ok(brandNames.includes("Cornells"));
      assert.ok(brandNames.includes("PetCare"));
    });
  });

  await t.test("2. GET /api/trade/products returns product catalog with carton packaging conversions", async () => {
    await withServer(async (baseUrl) => {
      const res = await fetch(`${baseUrl}/api/trade/products`, {
        method: "GET",
        headers: adminHeaders,
      });

      assert.equal(res.status, 200);
      const data: any = await res.json();

      assert.ok(data.count >= 8, "Expected at least 8 seeded B2B products");
      const first = data.products[0];
      assert.ok(first.sku, "Product must have SKU");
      assert.ok(first.unitsPerCarton > 0, "Must specify units per carton");
      assert.ok(first.basePricePerCarton > 0, "Must have integer cents base carton price");
      assert.ok(first.minOrderQuantityCartons >= 1, "Must enforce minimum order quantity");
      assert.ok(Array.isArray(first.volumeTiers), "Must have volume price tiers");
    });
  });

  await t.test("3. POST /api/trade/pricing/calculate computes wholesale volume breaks & 16% VAT", async () => {
    await withServer(async (baseUrl) => {
      // Order 60 cartons of Saffron lotion (triggers 50+ carton discount)
      const res = await fetch(`${baseUrl}/api/trade/pricing/calculate`, {
        method: "POST",
        headers: {
          ...adminHeaders,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          businessId: "biz-001", // Chandarana Foodplus (Supermarket chain tier)
          items: [
            {
              productId: "prod-001",
              quantityCartons: 60,
            },
          ],
        }),
      });

      assert.equal(res.status, 200);
      const data: any = await res.json();

      assert.equal(data.items.length, 1);
      const item = data.items[0];
      assert.equal(item.quantityCartons, 60);
      assert.equal(item.appliedTier, "50+ Cartons (Wholesale Bulk)");
      assert.ok(item.discountPercent >= 10, "Should apply volume discount");
      assert.ok(data.taxCents > 0, "Should compute 16% VAT");
      assert.equal(data.totalCents, data.subtotalCents - data.discountCents + data.taxCents);
    });
  });

  await t.test("4. POST /api/trade/pricing/calculate enforces Margin Floor Protection", async () => {
    await withServer(async (baseUrl) => {
      // Attempt to price below cost floor
      const res = await fetch(`${baseUrl}/api/trade/pricing/calculate`, {
        method: "POST",
        headers: {
          ...adminHeaders,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          businessId: "biz-001",
          items: [
            {
              productId: "prod-001",
              quantityCartons: 10,
              customPriceCents: 100000, // KES 1,000 (well below unitCostPrice of 3,200,000 cents)
            },
          ],
        }),
      });

      assert.equal(res.status, 422, "Should reject price below margin floor");
      const err: any = await res.json();
      assert.ok(err.error.includes("Margin floor protection"));
    });
  });

  await t.test("5. POST /api/trade/businesses handles onboarding & admin verification", async () => {
    await withServer(async (baseUrl) => {
      // 1. Submit business onboarding application
      const regRes = await fetch(`${baseUrl}/api/trade/businesses`, {
        method: "POST",
        headers: {
          ...adminHeaders,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          legalName: "Naivas Supermarkets East Africa Ltd",
          tradingName: "Naivas Westlands",
          businessType: "distributor",
          registrationNumber: "CPR/2026/889211",
          kraPin: "P051987654Z",
          primaryContactName: "Grace Wanjiku",
          primaryEmail: "procurement@naivas.co.ke",
          primaryPhone: "+254711889900",
          physicalLocation: "Westlands Mall, Waiyaki Way, Nairobi",
          creditTerms: "net_30",
        }),
      });

      assert.equal(regRes.status, 201, "Business registration should succeed");
      const newBiz: any = await regRes.json();
      assert.ok(newBiz.business.id);
      assert.equal(newBiz.business.status, "under_review");

      // 2. Admin verification
      const verifyRes = await fetch(`${baseUrl}/api/trade/businesses/${newBiz.business.id}/verify`, {
        method: "POST",
        headers: {
          ...salesHeaders,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          approved: true,
          creditLimitCents: 500000000, // KES 5M credit line
          tierDiscountPct: 8,
          notes: "KRA PIN verified via iTax portal. Credit facility approved.",
        }),
      });

      assert.equal(verifyRes.status, 200, "Business verification should succeed");
      const verifiedData: any = await verifyRes.json();
      assert.equal(verifiedData.business.status, "approved");
      assert.equal(verifiedData.business.creditLimit, 500000000);
      assert.equal(verifiedData.business.tierDiscountPct, 8);
    });
  });

  await t.test("6. POST /api/trade/orders places bulk order and auto-generates tax invoice", async () => {
    await withServer(async (baseUrl) => {
      const orderRes = await fetch(`${baseUrl}/api/trade/orders`, {
        method: "POST",
        headers: {
          ...adminHeaders,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          businessId: "biz-001",
          poReference: "PO-CHAND-2026-099",
          deliveryAddress: "Chandarana Foodplus Central Warehouse, Baba Dogo Rd, Nairobi",
          items: [
            {
              productId: "prod-001",
              quantityCartons: 10,
            },
            {
              productId: "prod-003",
              quantityCartons: 15,
            },
          ],
        }),
      });

      assert.equal(orderRes.status, 201, "Order creation should succeed");
      const orderData: any = await orderRes.json();

      assert.ok(orderData.order.id);
      assert.ok(orderData.order.orderNumber.startsWith("ORD-2026-"));
      assert.equal(orderData.order.items.length, 2);
      assert.ok(orderData.order.totalCents > 0);
      assert.ok(orderData.invoice, "Should generate automated tax invoice");
      assert.ok(orderData.invoice.invoiceNumber.startsWith("INV-2026-"));
      assert.ok(orderData.invoice.etimsControlCode.startsWith("KRA-ETIMS-"));
    });
  });

  await t.test("7. POST /api/trade/payments/mpesa simulates Daraja B2B STK push and payment reconciliation", async () => {
    await withServer(async (baseUrl) => {
      const payRes = await fetch(`${baseUrl}/api/trade/payments/mpesa`, {
        method: "POST",
        headers: {
          ...adminHeaders,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          invoiceId: "inv-001",
          phoneNumber: "+254722000000",
          amountCents: 41760000, // KES 417,600
        }),
      });

      assert.equal(payRes.status, 200, "M-Pesa payment simulation should succeed");
      const payData: any = await payRes.json();

      assert.equal(payData.success, true);
      assert.ok(payData.receiptNumber.startsWith("QA"));
      assert.equal(payData.status, "completed");
      assert.equal(payData.paymentMethod, "mpesa_b2b");
    });
  });

  await t.test("8. POST /api/trade/ai/query handles natural language order assembly & inventory forecasting", async () => {
    await withServer(async (baseUrl) => {
      // 1. Order assembly intent
      const aiOrderRes = await fetch(`${baseUrl}/api/trade/ai/query`, {
        method: "POST",
        headers: {
          ...adminHeaders,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          prompt: "I need 25 cartons of Bio Saff tea tree oil and 15 cartons of Cornells beard oil",
          businessId: "biz-001",
        }),
      });

      assert.equal(aiOrderRes.status, 200);
      const aiOrderData: any = await aiOrderRes.json();
      assert.equal(aiOrderData.intent, "ORDER_ASSEMBLY");
      assert.equal(aiOrderData.actionable, true);
      assert.ok(aiOrderData.draftOrder.items.length >= 2);
      assert.ok(aiOrderData.pricingSummary.estimatedTotalCents > 0);

      // 2. Inventory forecasting intent
      const aiStockRes = await fetch(`${baseUrl}/api/trade/ai/query`, {
        method: "POST",
        headers: {
          ...adminHeaders,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          prompt: "What is our current warehouse stock status and demand forecast?",
        }),
      });

      assert.equal(aiStockRes.status, 200);
      const aiStockData: any = await aiStockRes.json();
      assert.equal(aiStockData.intent, "STOCK_INTELLIGENCE");
      assert.ok(Array.isArray(aiStockData.insights));
      assert.ok(aiStockData.insights.length >= 2);
    });
  });

  await t.test("9. GET /api/trade/invoices/:id/print & /delivery-note generate formal KRA eTIMS & dispatch docs", async () => {
    await withServer(async (baseUrl) => {
      // 1. KRA eTIMS Tax Invoice
      const invRes = await fetch(`${baseUrl}/api/trade/invoices/inv-001/print`, {
        method: "GET",
        headers: adminHeaders,
      });

      assert.equal(invRes.status, 200);
      const invData: any = await invRes.json();
      assert.equal(invData.documentType, "TAX INVOICE");
      assert.equal(invData.seller.kraPin, "P051234567X");
      assert.ok(invData.invoiceDetails.etimsControlCode.startsWith("KRA-ETIMS-"));
      assert.ok(invData.taxSummary.rate16VatAmountKes > 0);
      assert.ok(Array.isArray(invData.lineItems));

      // 2. Consignment Delivery Note
      const dnRes = await fetch(`${baseUrl}/api/trade/orders/ord-001/delivery-note`, {
        method: "GET",
        headers: adminHeaders,
      });

      assert.equal(dnRes.status, 200);
      const dnData: any = await dnRes.json();
      assert.ok(dnData.deliveryNoteNumber.startsWith("DN-"));
      assert.ok(dnData.carrier.vehicleRegistration.includes("Isuzu"));
      assert.ok(dnData.totalCartonsDispatched > 0);
      assert.ok(dnData.totalGrossWeightKg > 0);
      assert.ok(dnData.dualSignoff.dispatchedBy);
    });
  });

  await t.test("10. Multi-Warehouse Stock Allocation & Driver Dispatch", async () => {
    await withServer(async (baseUrl) => {
      // 1. List Regional Warehouses
      const whRes = await fetch(`${baseUrl}/api/trade/warehouses`, {
        method: "GET",
        headers: adminHeaders,
      });

      assert.equal(whRes.status, 200);
      const whData: any = await whRes.json();
      assert.equal(whData.warehouses.length, 4, "Must have 4 regional warehouses");
      const whCodes = whData.warehouses.map((w: any) => w.code);
      assert.ok(whCodes.includes("WH-NBO-01"));
      assert.ok(whCodes.includes("WH-MSA-01"));

      // 2. Dispatch Order with assigned driver & vehicle
      const dispatchRes = await fetch(`${baseUrl}/api/trade/shipments/dispatch`, {
        method: "POST",
        headers: {
          ...adminHeaders,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          orderId: "ord-001",
          warehouseCode: "WH-NBO-01",
          assignedDriverName: "Juma Omondi",
          vehicleRegistration: "KDF 492B (Isuzu FRR 10-Tonne)",
          deliveryNotes: "Deliver to Baba Dogo Central Logistics depot.",
        }),
      });

      assert.equal(dispatchRes.status, 201);
      const dispatchData: any = await dispatchRes.json();
      assert.ok(dispatchData.shipment.shipmentNumber.startsWith("SHP-2026-"));
      assert.equal(dispatchData.shipment.status, "dispatched");
      assert.equal(dispatchData.shipment.assignedDriverName, "Juma Omondi");
    });
  });

  await t.test("11. Carrier Proof of Delivery confirmation", async () => {
    await withServer(async (baseUrl) => {
      const deliverRes = await fetch(`${baseUrl}/api/trade/shipments/shp-001/deliver`, {
        method: "POST",
        headers: {
          ...adminHeaders,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          recipientName: "Francis Mutua (Receiving Supervisor)",
          recipientSignatureConfirmed: true,
        }),
      });

      assert.equal(deliverRes.status, 200);
      const deliverData: any = await deliverRes.json();
      assert.equal(deliverData.shipment.status, "delivered");
      assert.equal(deliverData.shipment.recipientName, "Francis Mutua (Receiving Supervisor)");
      assert.ok(deliverData.shipment.deliveredAt);
    });
  });

  await t.test("12. Supplier Procurement Desk: Raw Materials PO & GRN Receipt", async () => {
    await withServer(async (baseUrl) => {
      // 1. Check raw materials catalogue
      const matRes = await fetch(`${baseUrl}/api/trade/procurement/materials`, {
        method: "GET",
        headers: adminHeaders,
      });

      assert.equal(matRes.status, 200);
      const matData: any = await matRes.json();
      assert.ok(matData.materials.length >= 5);

      // 2. Issue Purchase Order to Supplier
      const poRes = await fetch(`${baseUrl}/api/trade/procurement/orders`, {
        method: "POST",
        headers: {
          ...adminHeaders,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          supplierId: "sup-003", // Nzoia Botanicals
          warehouseCode: "WH-NBO-01",
          expectedDeliveryDate: "2026-03-28",
          items: [
            {
              materialId: "rm-003", // Tea Tree essential oil
              quantity: 100,
              unitPriceCents: 280000,
            },
          ],
        }),
      });

      assert.equal(poRes.status, 201);
      const poData: any = await poRes.json();
      assert.ok(poData.purchaseOrder.poNumber.startsWith("PO-SUP-2026-"));
      assert.equal(poData.purchaseOrder.status, "issued");
      assert.equal(poData.purchaseOrder.totalCents, 28000000); // KES 280,000

      // 3. Receive Goods against Purchase Order (GRN)
      const grnRes = await fetch(`${baseUrl}/api/trade/procurement/orders/${poData.purchaseOrder.id}/receive`, {
        method: "POST",
        headers: {
          ...adminHeaders,
          "content-type": "application/json",
        },
        body: JSON.stringify({}),
      });

      assert.equal(grnRes.status, 200);
      const grnData: any = await grnRes.json();
      assert.equal(grnData.purchaseOrder.status, "received");
      assert.equal(grnData.purchaseOrder.items[0].quantityReceived, 100);
    });
  });
});
