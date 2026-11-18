import { randomUUID } from "node:crypto";
import { Router, type IRouter, type Request, type Response } from "express";
import {
  db,
  tradeBusinessesTable,
  tradeBranchesTable,
  tradeProductsTable,
  tradePriceTiersTable,
  tradeOrdersTable,
  tradeOrderItemsTable,
  tradeQuotationsTable,
  tradeInvoicesTable,
  tradePaymentsTable,
  tradeShipmentsTable,
} from "@workspace/db";
import { recordAuditEvent } from "../lib/auditService";
import {
  ensureMembership,
  PEOPLEOS_ROLES,
  type MembershipRecord,
} from "../middlewares/peopleosAccess";

const router: IRouter = Router();

// ─── Seeded In-Memory Demo Stores for Trade ───────────────────────────────────

export interface DemoTradeProduct {
  id: string;
  sku: string;
  barcode: string;
  name: string;
  brand: "Saffron Milan" | "Bio Saff" | "Cornells" | "PetCare";
  category: string;
  description: string;
  packagingUnit: "carton" | "pack" | "case";
  unitsPerCarton: number;
  packsPerCarton: number;
  basePricePerCarton: number; // in integer cents (e.g. KES 4,800 = 480,000 cents)
  unitCostPrice: number; // margin floor cost
  minOrderQuantityCartons: number;
  stockOnHandCartons: number;
  allocatedStockCartons: number;
  status: "active" | "low_stock" | "out_of_stock";
  imageUrl: string;
}

export interface DemoTradeBusiness {
  id: string;
  legalName: string;
  tradingName: string;
  businessType: "retailer" | "wholesaler" | "distributor" | "strategic";
  registrationNumber: string;
  kraPin: string;
  taxComplianceValid: boolean;
  status: "draft" | "submitted" | "under_review" | "approved" | "rejected" | "suspended";
  primaryContactName: string;
  primaryEmail: string;
  primaryPhone: string;
  physicalLocation: string;
  creditLimit: number; // in cents
  creditTerms: "cash" | "net_7" | "net_14" | "net_30" | "net_60";
  tierDiscountPct: number;
  branches: Array<{
    id: string;
    branchName: string;
    code: string;
    physicalAddress: string;
    county: string;
    contactPerson: string;
    contactPhone: string;
  }>;
}

export interface DemoTradeOrder {
  id: string;
  orderNumber: string;
  businessId: string;
  businessName: string;
  businessType: string;
  branchName: string;
  placedByUserId: string;
  poReference: string | null;
  status: "submitted" | "approved" | "processing" | "picking" | "packed" | "dispatched" | "delivered" | "cancelled";
  subtotalCents: number;
  discountCents: number;
  taxCents: number;
  totalCents: number;
  paymentStatus: "pending" | "partial" | "paid" | "credit_extended";
  paymentTerms: string;
  items: Array<{
    productId: string;
    sku: string;
    productName: string;
    packagingUnit: string;
    quantity: number;
    unitPriceCents: number;
    subtotalCents: number;
    discountCents: number;
    totalCents: number;
  }>;
  createdAt: string;
}

export interface DemoTradeQuotation {
  id: string;
  quotationNumber: string;
  businessId: string;
  businessName: string;
  requestedByUserId: string;
  assignedSalesRepUserId: string | null;
  status: "issued" | "negotiating" | "accepted" | "rejected" | "converted";
  subtotalCents: number;
  discountCents: number;
  totalCents: number;
  validUntil: string;
  customerNotes: string | null;
  internalMarginPct: number;
  items: Array<{
    productId: string;
    productName: string;
    quantity: number;
    unitPriceCents: number;
    totalCents: number;
  }>;
  createdAt: string;
}

export interface DemoTradeInvoice {
  id: string;
  invoiceNumber: string;
  orderId: string;
  orderNumber: string;
  businessId: string;
  businessName: string;
  totalCents: number;
  paidCents: number;
  balanceDueCents: number;
  status: "issued" | "partial" | "paid" | "overdue";
  dueDate: string;
  etimsControlCode: string;
  createdAt: string;
}

// ── Seed Data ──

export const DEMO_TRADE_PRODUCTS: DemoTradeProduct[] = [
  {
    id: "prod-001",
    sku: "SAF-GLOW-100ML-CTN",
    barcode: "6161100010012",
    name: "Saffron Milan Glow Radiance Lotion 100ml",
    brand: "Saffron Milan",
    category: "Luxury Skincare",
    description: "Premium brightening & hydrating body lotion with pure saffron extracts. Master carton containing 24 individual bottles.",
    packagingUnit: "carton",
    unitsPerCarton: 24,
    packsPerCarton: 4,
    basePricePerCarton: 720000, // KES 7,200 per carton (KES 300 / unit)
    unitCostPrice: 380000, // KES 3,800 cost floor
    minOrderQuantityCartons: 2,
    stockOnHandCartons: 420,
    allocatedStockCartons: 60,
    status: "active",
    imageUrl: "/assets/products/saffron-lotion.jpg",
  },
  {
    id: "prod-002",
    sku: "SAF-SERUM-30ML-CTN",
    barcode: "6161100010029",
    name: "Saffron Milan 24K Gold Youth Elixir Serum 30ml",
    brand: "Saffron Milan",
    category: "Luxury Skincare",
    description: "Advanced anti-aging serum infused with 24K gold flakes and saffron oil. Packed 36 dropper bottles per carton.",
    packagingUnit: "carton",
    unitsPerCarton: 36,
    packsPerCarton: 6,
    basePricePerCarton: 1260000, // KES 12,600 per carton (KES 350 / unit)
    unitCostPrice: 650000,
    minOrderQuantityCartons: 1,
    stockOnHandCartons: 280,
    allocatedStockCartons: 25,
    status: "active",
    imageUrl: "/assets/products/saffron-serum.jpg",
  },
  {
    id: "prod-003",
    sku: "BIO-SOAP-150G-CTN",
    barcode: "6161100020011",
    name: "Bio Saff Herbal Antiseptic Medicated Soap 150g",
    brand: "Bio Saff",
    category: "Personal Hygiene",
    description: "Natural antiseptic botanical cleansing bar. Fast-moving FMCG essential. Packed 48 bars per master carton.",
    packagingUnit: "carton",
    unitsPerCarton: 48,
    packsPerCarton: 8,
    basePricePerCarton: 480000, // KES 4,800 per carton (KES 100 / bar)
    unitCostPrice: 260000,
    minOrderQuantityCartons: 5,
    stockOnHandCartons: 1250,
    allocatedStockCartons: 180,
    status: "active",
    imageUrl: "/assets/products/biosaff-soap.jpg",
  },
  {
    id: "prod-004",
    sku: "BIO-NEEM-CLEAN-200ML",
    barcode: "6161100020028",
    name: "Bio Saff Organic Neem Clarifying Face Wash 200ml",
    brand: "Bio Saff",
    category: "Personal Hygiene",
    description: "Gentle organic neem purifying facial cleanser for daily hygiene. 24 tubes per carton.",
    packagingUnit: "carton",
    unitsPerCarton: 24,
    packsPerCarton: 4,
    basePricePerCarton: 540000, // KES 5,400 per carton
    unitCostPrice: 300000,
    minOrderQuantityCartons: 2,
    stockOnHandCartons: 310,
    allocatedStockCartons: 30,
    status: "active",
    imageUrl: "/assets/products/biosaff-wash.jpg",
  },
  {
    id: "prod-005",
    sku: "COR-POM-120G-CTN",
    barcode: "6161100030010",
    name: "Cornells Professional High-Hold Styling Pomade 120g",
    brand: "Cornells",
    category: "Men's Grooming",
    description: "Water-based high-sheen styling pomade for barbershops and retail salons. Packed 36 tins per carton.",
    packagingUnit: "carton",
    unitsPerCarton: 36,
    packsPerCarton: 6,
    basePricePerCarton: 792000, // KES 7,920 per carton (KES 220 / tin)
    unitCostPrice: 420000,
    minOrderQuantityCartons: 2,
    stockOnHandCartons: 185,
    allocatedStockCartons: 15,
    status: "active",
    imageUrl: "/assets/products/cornells-pomade.jpg",
  },
  {
    id: "prod-006",
    sku: "COR-BEARD-50ML-CTN",
    barcode: "6161100030027",
    name: "Cornells Cedarwood & Argan Beard Conditioning Oil 50ml",
    brand: "Cornells",
    category: "Men's Grooming",
    description: "Nourishing beard softening elixir with cedarwood essential oils. 24 amber dropper bottles per carton.",
    packagingUnit: "carton",
    unitsPerCarton: 24,
    packsPerCarton: 4,
    basePricePerCarton: 624000, // KES 6,240 per carton (KES 260 / unit)
    unitCostPrice: 310000,
    minOrderQuantityCartons: 1,
    stockOnHandCartons: 95,
    allocatedStockCartons: 10,
    status: "low_stock",
    imageUrl: "/assets/products/cornells-oil.jpg",
  },
  {
    id: "prod-007",
    sku: "PET-SHAMP-500ML-CTN",
    barcode: "6161100040019",
    name: "PetCare Medicated Flea & Tick Veterinary Shampoo 500ml",
    brand: "PetCare",
    category: "Veterinary Care",
    description: "Clinical grade pyrethrum & aloe pet shampoo for dogs and cats. Master carton of 16 pump bottles.",
    packagingUnit: "carton",
    unitsPerCarton: 16,
    packsPerCarton: 4,
    basePricePerCarton: 560000, // KES 5,600 per carton (KES 350 / unit)
    unitCostPrice: 290000,
    minOrderQuantityCartons: 2,
    stockOnHandCartons: 230,
    allocatedStockCartons: 20,
    status: "active",
    imageUrl: "/assets/products/petcare-shampoo.jpg",
  },
  {
    id: "prod-008",
    sku: "PET-ODOR-SPRAY-250ML",
    barcode: "6161100040026",
    name: "PetCare Enzymatic Kennel & Coat Deodorizing Spray 250ml",
    brand: "PetCare",
    category: "Veterinary Care",
    description: "Enzyme-powered bio-spray neutralizer for pet areas and coat freshness. 24 trigger bottles per carton.",
    packagingUnit: "carton",
    unitsPerCarton: 24,
    packsPerCarton: 4,
    basePricePerCarton: 480000, // KES 4,800 per carton (KES 200 / unit)
    unitCostPrice: 240000,
    minOrderQuantityCartons: 2,
    stockOnHandCartons: 15,
    allocatedStockCartons: 10,
    status: "low_stock",
    imageUrl: "/assets/products/petcare-spray.jpg",
  },
];

export const DEMO_TRADE_BUSINESSES: DemoTradeBusiness[] = [
  {
    id: "biz-001",
    legalName: "Nairobi Mega Retail Distributors Limited",
    tradingName: "Mega Wholesale & Grocers",
    businessType: "wholesaler",
    registrationNumber: "CPR/2021/89304",
    kraPin: "P051839201L",
    taxComplianceValid: true,
    status: "approved",
    primaryContactName: "Hassan Mohamed",
    primaryEmail: "purchasing@megagrocery.co.ke",
    primaryPhone: "+254 722 849 201",
    physicalLocation: "Enterprise Road, Industrial Area, Nairobi",
    creditLimit: 250000000, // KES 2,500,000 credit limit in cents
    creditTerms: "net_30",
    tierDiscountPct: 10, // 10% wholesaler standard discount
    branches: [
      {
        id: "br-001",
        branchName: "Industrial Area Depot",
        code: "NBI-IND-01",
        physicalAddress: "Go-Down #14, Enterprise Road",
        county: "Nairobi",
        contactPerson: "James Ochieng",
        contactPhone: "+254 722 849 202",
      },
      {
        id: "br-002",
        branchName: "Eastleigh Hub",
        code: "NBI-EST-02",
        physicalAddress: "General Waruinge Street, 2nd Ave",
        county: "Nairobi",
        contactPerson: "Amina Yusuf",
        contactPhone: "+254 722 849 203",
      },
    ],
  },
  {
    id: "biz-002",
    legalName: "Rift Valley Retail & Supermarkets Kenya Ltd",
    tradingName: "Rift Supermarkets",
    businessType: "retailer",
    registrationNumber: "CPR/2019/48201",
    kraPin: "P051120943A",
    taxComplianceValid: true,
    status: "approved",
    primaryContactName: "Grace Chepkemoi",
    primaryEmail: "procurement@riftsupers.co.ke",
    primaryPhone: "+254 733 902 110",
    physicalLocation: "Kenyatta Avenue, Nakuru CBD",
    creditLimit: 75000000, // KES 750,000 credit limit in cents
    creditTerms: "net_14",
    tierDiscountPct: 5, // 5% retailer standard discount
    branches: [
      {
        id: "br-003",
        branchName: "Nakuru Central Branch",
        code: "NKR-CBD-01",
        physicalAddress: "Kenyatta Ave Opp GPO",
        county: "Nakuru",
        contactPerson: "Daniel Kiprono",
        contactPhone: "+254 733 902 111",
      },
    ],
  },
  {
    id: "biz-003",
    legalName: "Coastline Logistics & Wholesale Suppliers Ltd",
    tradingName: "Coast Wholesalers",
    businessType: "distributor",
    registrationNumber: "CPR/2018/11928",
    kraPin: "P051493021M",
    taxComplianceValid: true,
    status: "approved",
    primaryContactName: "Salim Omar",
    primaryEmail: "somar@coastwholesalers.co.ke",
    primaryPhone: "+254 720 449 100",
    physicalLocation: "Mbaraki Port Road, Shimanzi, Mombasa",
    creditLimit: 500000000, // KES 5,000,000 in cents
    creditTerms: "net_60",
    tierDiscountPct: 15, // 15% distributor tier discount
    branches: [
      {
        id: "br-004",
        branchName: "Mombasa Shimanzi Depot",
        code: "MBA-SHM-01",
        physicalAddress: "Warehouse 4B, Shimanzi",
        county: "Mombasa",
        contactPerson: "Farah Juma",
        contactPhone: "+254 720 449 101",
      },
    ],
  },
  {
    id: "biz-004",
    legalName: "Eldoret Fresh Cosmetics & Provisions Ltd",
    tradingName: "Eldoret Fresh Mart",
    businessType: "retailer",
    registrationNumber: "CPR/2026/02910",
    kraPin: "P052849103K",
    taxComplianceValid: true,
    status: "under_review",
    primaryContactName: "Patrick Kemboi",
    primaryEmail: "pkemboi@eldoretfresh.com",
    primaryPhone: "+254 711 392 481",
    physicalLocation: "Uganda Road, Eldoret",
    creditLimit: 0,
    creditTerms: "cash",
    tierDiscountPct: 0,
    branches: [],
  },
];

export const DEMO_TRADE_ORDERS: DemoTradeOrder[] = [
  {
    id: "ord-001",
    orderNumber: "ORD-2026-0301",
    businessId: "biz-001",
    businessName: "Nairobi Mega Retail Distributors Limited",
    businessType: "wholesaler",
    branchName: "Industrial Area Depot",
    placedByUserId: "user_hassan_01",
    poReference: "PO-MEGA-7821",
    status: "dispatched",
    subtotalCents: 45600000, // KES 456,000
    discountCents: 5472000,  // KES 54,720 (12% combined tier + volume discount)
    taxCents: 6420480,       // KES 64,204.80 (16% VAT)
    totalCents: 46548480,    // KES 465,484.80
    paymentStatus: "paid",
    paymentTerms: "net_30",
    items: [
      {
        productId: "prod-001",
        sku: "SAF-GLOW-100ML-CTN",
        productName: "Saffron Milan Glow Radiance Lotion 100ml",
        packagingUnit: "carton",
        quantity: 40,
        unitPriceCents: 720000,
        subtotalCents: 28800000,
        discountCents: 3456000,
        totalCents: 25344000,
      },
      {
        productId: "prod-003",
        sku: "BIO-SOAP-150G-CTN",
        productName: "Bio Saff Herbal Antiseptic Medicated Soap 150g",
        packagingUnit: "carton",
        quantity: 35,
        unitPriceCents: 480000,
        subtotalCents: 16800000,
        discountCents: 2016000,
        totalCents: 14784000,
      },
    ],
    createdAt: "2026-03-02T10:15:00Z",
  },
  {
    id: "ord-002",
    orderNumber: "ORD-2026-0302",
    businessId: "biz-002",
    businessName: "Rift Valley Retail & Supermarkets Kenya Ltd",
    businessType: "retailer",
    branchName: "Nakuru Central Branch",
    placedByUserId: "user_grace_01",
    poReference: "RVS-PO-991",
    status: "processing",
    subtotalCents: 18720000,
    discountCents: 936000,
    taxCents: 2845440,
    totalCents: 20629440,
    paymentStatus: "credit_extended",
    paymentTerms: "net_14",
    items: [
      {
        productId: "prod-005",
        sku: "COR-POM-120G-CTN",
        productName: "Cornells Professional High-Hold Styling Pomade 120g",
        packagingUnit: "carton",
        quantity: 15,
        unitPriceCents: 792000,
        subtotalCents: 11880000,
        discountCents: 594000,
        totalCents: 11286000,
      },
      {
        productId: "prod-007",
        sku: "PET-SHAMP-500ML-CTN",
        productName: "PetCare Medicated Flea & Tick Veterinary Shampoo 500ml",
        packagingUnit: "carton",
        quantity: 12,
        unitPriceCents: 560000,
        subtotalCents: 6720000,
        discountCents: 336000,
        totalCents: 6384000,
      },
    ],
    createdAt: "2026-03-04T14:30:00Z",
  },
];

export const DEMO_TRADE_QUOTATIONS: DemoTradeQuotation[] = [
  {
    id: "qt-001",
    quotationNumber: "QT-2026-0012",
    businessId: "biz-003",
    businessName: "Coastline Logistics & Wholesale Suppliers Ltd",
    requestedByUserId: "user_salim_01",
    assignedSalesRepUserId: "user_demo_admin_01",
    status: "negotiating",
    subtotalCents: 144000000, // KES 1.44M
    discountCents: 25920000,  // KES 259,200 (18% negotiated distributor discount)
    totalCents: 118080000,
    validUntil: "2026-03-31",
    customerNotes: "Requesting distributor volume rebate for annual Ramadan coast promotion.",
    internalMarginPct: 24, // 24% healthy gross margin
    items: [
      {
        productId: "prod-001",
        productName: "Saffron Milan Glow Radiance Lotion 100ml",
        quantity: 200,
        unitPriceCents: 720000,
        totalCents: 144000000,
      },
    ],
    createdAt: "2026-03-03T09:00:00Z",
  },
];

export const DEMO_TRADE_INVOICES: DemoTradeInvoice[] = [
  {
    id: "inv-001",
    invoiceNumber: "INV-2026-1044",
    orderId: "ord-001",
    orderNumber: "ORD-2026-0301",
    businessId: "biz-001",
    businessName: "Nairobi Mega Retail Distributors Limited",
    totalCents: 46548480,
    paidCents: 46548480,
    balanceDueCents: 0,
    status: "paid",
    dueDate: "2026-04-01",
    etimsControlCode: "KRA-ETIMS-2026-883921",
    createdAt: "2026-03-02T10:20:00Z",
  },
  {
    id: "inv-002",
    invoiceNumber: "INV-2026-1045",
    orderId: "ord-002",
    orderNumber: "ORD-2026-0302",
    businessId: "biz-002",
    businessName: "Rift Valley Retail & Supermarkets Kenya Ltd",
    totalCents: 20629440,
    paidCents: 0,
    balanceDueCents: 20629440,
    status: "issued",
    dueDate: "2026-03-18",
    etimsControlCode: "KRA-ETIMS-2026-883922",
    createdAt: "2026-03-04T14:35:00Z",
  },
];

// ─── Centralized B2B Commercial Pricing Calculation Engine ────────────────────

export interface CalculatePricingInput {
  businessId?: string;
  items: Array<{
    productId: string;
    quantityCartons: number;
    customPriceCents?: number;
    requestedPackagingUnit?: "carton" | "pack" | "piece";
  }>;
}

export function calculateB2bPricing(input: CalculatePricingInput) {
  // Find business or fallback to default retail rates
  const business = DEMO_TRADE_BUSINESSES.find((b) => b.id === input.businessId);
  const businessType = business?.businessType ?? "retailer";

  // Tier base discount
  let tierDiscountPct = business?.tierDiscountPct ?? 0;
  if (!tierDiscountPct) {
    if (businessType === "distributor") tierDiscountPct = 15;
    else if (businessType === "wholesaler") tierDiscountPct = 10;
    else if (businessType === "retailer") tierDiscountPct = 5;
    else tierDiscountPct = 0;
  }

  // Calculate total cartons to evaluate order volume break
  const totalCartons = input.items.reduce((sum, item) => sum + Math.max(item.quantityCartons, 1), 0);
  let volumeDiscountPct = 0;
  let appliedTier = "Standard Wholesale";
  if (totalCartons >= 100) {
    volumeDiscountPct = 10;
    appliedTier = "100+ Cartons (Enterprise Master Distributor)";
  } else if (totalCartons >= 50) {
    volumeDiscountPct = 6;
    appliedTier = "50+ Cartons (Wholesale Bulk)";
  } else if (totalCartons >= 20) {
    volumeDiscountPct = 3;
    appliedTier = "20+ Cartons (Trade Starter)";
  }

  const combinedDiscountPct = Math.min(tierDiscountPct + volumeDiscountPct, 30); // Capped at 30% for margin floor

  let subtotalCents = 0;
  let totalDiscountCents = 0;

  const lineItems = input.items.map((item) => {
    const product = DEMO_TRADE_PRODUCTS.find((p) => p.id === item.productId);
    if (!product) {
      throw new Error(`Product ID '${item.productId}' not found in catalogue.`);
    }

    const qty = Math.max(item.quantityCartons, 1);
    const baseUnitPrice = typeof item.customPriceCents === "number" ? item.customPriceCents : product.basePricePerCarton;
    const lineSubtotal = baseUnitPrice * qty;
    const lineDiscount = typeof item.customPriceCents === "number" ? 0 : Math.round((lineSubtotal * combinedDiscountPct) / 100);
    const lineTotal = lineSubtotal - lineDiscount;

    // Margin Floor Check: Ensure unit price is not below unit cost + 8% margin
    const minAllowedPerCarton = Math.round(product.unitCostPrice * 1.08);
    const effectiveUnitPrice = Math.round(lineTotal / qty);
    if (effectiveUnitPrice < minAllowedPerCarton) {
      const err = new Error(`Margin floor protection: price for ${product.name} falls below statutory gross margin floor.`);
      (err as any).statusCode = 422;
      throw err;
    }

    subtotalCents += lineSubtotal;
    totalDiscountCents += lineDiscount;

    return {
      productId: product.id,
      sku: product.sku,
      productName: product.name,
      brand: product.brand,
      packagingUnit: product.packagingUnit,
      quantityCartons: qty,
      unitsPerCarton: product.unitsPerCarton,
      totalUnits: qty * product.unitsPerCarton,
      baseUnitPriceCents: product.basePricePerCarton,
      effectiveUnitPriceCents: effectiveUnitPrice,
      subtotalCents: lineSubtotal,
      discountCents: lineDiscount,
      discountPercent: combinedDiscountPct,
      appliedTier,
      totalCents: lineTotal,
    };
  });

  const netBeforeTax = subtotalCents - totalDiscountCents;
  const taxCents = Math.round(netBeforeTax * 0.16); // 16% Kenya standard VAT
  const totalCents = netBeforeTax + taxCents;

  return {
    businessId: business?.id ?? null,
    businessName: business?.legalName ?? "Standard Trade Guest",
    businessType,
    tierDiscountPct,
    volumeDiscountPct,
    combinedDiscountPct,
    appliedTier,
    totalCartons,
    subtotalCents,
    discountCents: totalDiscountCents,
    taxCents,
    totalCents,
    currency: "KES",
    items: lineItems,
  };
}

// ─── API Routes ───────────────────────────────────────────────────────────────

/**
 * GET /api/v1/trade/overview - Executive B2B metrics & operational health
 */
router.get("/trade/overview", async (req: Request, res: Response) => {
  const membership = await ensureMembership(req, res);
  if (!membership) return;

  const totalGrossRevenueCents = DEMO_TRADE_ORDERS
    .filter((o) => o.status !== "cancelled")
    .reduce((sum, o) => sum + o.totalCents, 0);

  const totalOrders = DEMO_TRADE_ORDERS.length;
  const activeBusinesses = DEMO_TRADE_BUSINESSES.filter((b) => b.status === "approved").length;
  const pendingApprovals = DEMO_TRADE_BUSINESSES.filter((b) => b.status === "under_review").length;
  const totalInvoicedCents = DEMO_TRADE_INVOICES.reduce((sum, i) => sum + i.totalCents, 0);
  const outstandingReceivablesCents = DEMO_TRADE_INVOICES.reduce((sum, i) => sum + i.balanceDueCents, 0);
  const lowStockCount = DEMO_TRADE_PRODUCTS.filter((p) => p.status === "low_stock" || p.status === "out_of_stock").length;

  const brands = [
    { brand: "Saffron Milan", revenueSharePct: 48, catalogCount: 2 },
    { brand: "Bio Saff", revenueSharePct: 26, catalogCount: 2 },
    { brand: "Cornells", revenueSharePct: 18, catalogCount: 2 },
    { brand: "PetCare", revenueSharePct: 8, catalogCount: 2 },
  ];

  res.json({
    platform: "Rekker Trade",
    domain: "trade.rekker.co.ke",
    metrics: {
      totalGrossRevenueKes: Math.round(totalGrossRevenueCents / 100),
      totalGrossRevenueCents,
      totalRevenueCents: totalGrossRevenueCents,
      totalOrders,
      activeOrdersCount: totalOrders,
      activeBusinesses,
      registeredBusinesses: DEMO_TRADE_BUSINESSES.length,
      pendingApprovals,
      totalInvoicedKes: Math.round(totalInvoicedCents / 100),
      outstandingReceivablesKes: Math.round(outstandingReceivablesCents / 100),
      lowStockProductsCount: lowStockCount,
    },
    brands,
    topBrands: brands,
  });
});

/**
 * GET /api/v1/trade/businesses - B2B Business customer directory
 */
router.get("/trade/businesses", async (req: Request, res: Response) => {
  const membership = await ensureMembership(req, res);
  if (!membership) return;

  const items = DEMO_TRADE_BUSINESSES.map((b) => ({
    id: b.id,
    legalName: b.legalName,
    tradingName: b.tradingName,
    businessType: b.businessType,
    registrationNumber: b.registrationNumber,
    kraPin: b.kraPin,
    taxComplianceValid: b.taxComplianceValid,
    status: b.status,
    primaryContactName: b.primaryContactName,
    primaryEmail: b.primaryEmail,
    primaryPhone: b.primaryPhone,
    physicalLocation: b.physicalLocation,
    creditLimitKes: Math.round(b.creditLimit / 100),
    creditTerms: b.creditTerms,
    tierDiscountPct: b.tierDiscountPct,
    branchCount: b.branches.length,
    branches: b.branches,
  }));

  res.json({ items, total: items.length });
});

/**
 * POST /api/v1/trade/businesses - Self-service B2B business onboarding
 */
router.post("/trade/businesses", async (req: Request, res: Response) => {
  const membership = await ensureMembership(req, res);
  if (!membership) return;

  const {
    legalName,
    tradingName,
    businessType,
    registrationNumber,
    kraPin,
    primaryContactName,
    primaryEmail,
    primaryPhone,
    physicalLocation,
    deliveryAddress,
  } = req.body ?? {};

  if (!legalName || !tradingName || !registrationNumber || !kraPin || !primaryEmail || !primaryPhone) {
    res.status(400).json({ error: "Legal name, trading name, registration number, KRA PIN, email, and phone are required." });
    return;
  }

  const newBiz: DemoTradeBusiness = {
    id: `biz-${randomUUID().slice(0, 8)}`,
    legalName: String(legalName).trim(),
    tradingName: String(tradingName).trim(),
    businessType: businessType === "distributor" || businessType === "wholesaler" ? businessType : "retailer",
    registrationNumber: String(registrationNumber).trim().toUpperCase(),
    kraPin: String(kraPin).trim().toUpperCase(),
    taxComplianceValid: true,
    status: "under_review",
    primaryContactName: String(primaryContactName).trim(),
    primaryEmail: String(primaryEmail).trim().toLowerCase(),
    primaryPhone: String(primaryPhone).trim(),
    physicalLocation: String(physicalLocation ?? "Nairobi").trim(),
    creditLimit: 0,
    creditTerms: "cash",
    tierDiscountPct: 0,
    branches: [
      {
        id: `br-${randomUUID().slice(0, 8)}`,
        branchName: "Main Branch",
        code: "HQ-01",
        physicalAddress: String(deliveryAddress ?? physicalLocation ?? "Nairobi"),
        county: "Nairobi",
        contactPerson: String(primaryContactName),
        contactPhone: String(primaryPhone),
      },
    ],
  };

  DEMO_TRADE_BUSINESSES.push(newBiz);

  await recordAuditEvent({
    organizationId: membership.organizationId,
    actorUserId: membership.userId,
    actor: membership.role,
    action: "TRADE_BUSINESS_REGISTERED",
    targetType: "trade_business",
    targetId: newBiz.id,
    summary: `New B2B customer registered: ${newBiz.legalName} (${newBiz.businessType}). Status: under_review.`,
    isDemo: true,
  });

  res.status(201).json({
    message: "B2B Business registration submitted successfully for review.",
    business: newBiz,
  });
});

/**
 * POST /api/v1/trade/businesses/:id/verify - Admin verification workflow
 */
router.post("/trade/businesses/:id/verify", async (req: Request, res: Response) => {
  const membership = await ensureMembership(req, res);
  if (!membership) return;

  const bizId = req.params.id;
  const biz = DEMO_TRADE_BUSINESSES.find((b) => b.id === bizId);
  if (!biz) {
    res.status(404).json({ error: "Business account not found." });
    return;
  }

  const decision = req.body?.decision ?? (req.body?.approved === true ? "approved" : req.body?.approved === false ? "rejected" : undefined);
  if (decision !== "approved" && decision !== "rejected" && decision !== "suspended") {
    res.status(400).json({ error: "decision must be 'approved', 'rejected', or 'suspended' (or approved: boolean)." });
    return;
  }

  biz.status = decision;
  if (decision === "approved") {
    const creditLimit = typeof req.body?.creditLimitCents === "number" ? req.body.creditLimitCents : (typeof req.body?.creditLimitKes === "number" ? req.body.creditLimitKes * 100 : undefined);
    if (typeof creditLimit === "number") biz.creditLimit = creditLimit;
    if (typeof req.body?.creditTerms === "string") biz.creditTerms = req.body.creditTerms as any;
    if (typeof req.body?.tierDiscountPct === "number") biz.tierDiscountPct = req.body.tierDiscountPct;
    else if (biz.businessType === "distributor") biz.tierDiscountPct = 15;
    else if (biz.businessType === "wholesaler") biz.tierDiscountPct = 10;
    else biz.tierDiscountPct = 5;
  }

  await recordAuditEvent({
    organizationId: membership.organizationId,
    actorUserId: membership.userId,
    actor: membership.role,
    action: "TRADE_BUSINESS_VERIFIED",
    targetType: "trade_business",
    targetId: biz.id,
    summary: `Business account ${biz.legalName} verification updated to '${decision}'.`,
    isDemo: true,
  });

  res.json({
    message: `Business status successfully updated to ${decision}.`,
    business: biz,
  });
});

/**
 * GET /api/v1/trade/products - B2B Product Catalogue with packaging conversions
 */
router.get("/trade/products", async (req: Request, res: Response) => {
  const membership = await ensureMembership(req, res);
  if (!membership) return;

  const brandFilter = typeof req.query.brand === "string" ? req.query.brand : undefined;
  const items = DEMO_TRADE_PRODUCTS.filter(
    (p) => !brandFilter || p.brand.toLowerCase() === brandFilter.toLowerCase(),
  ).map((p) => ({
    id: p.id,
    sku: p.sku,
    barcode: p.barcode,
    name: p.name,
    brand: p.brand,
    category: p.category,
    description: p.description,
    packagingUnit: p.packagingUnit,
    unitsPerCarton: p.unitsPerCarton,
    packsPerCarton: p.packsPerCarton,
    basePricePerCarton: p.basePricePerCarton,
    basePricePerCartonKes: Math.round(p.basePricePerCarton / 100),
    basePricePerCartonCents: p.basePricePerCarton,
    pricePerUnitKes: Math.round(p.basePricePerCarton / p.unitsPerCarton / 100),
    minOrderQuantityCartons: p.minOrderQuantityCartons,
    stockOnHandCartons: p.stockOnHandCartons,
    availableStockCartons: p.stockOnHandCartons - p.allocatedStockCartons,
    volumeTiers: [
      { minCartons: 10, discountPercent: 3, label: "10+ Cartons" },
      { minCartons: 50, discountPercent: 6, label: "50+ Cartons" },
      { minCartons: 100, discountPercent: 10, label: "100+ Cartons" },
    ],
    status: p.status,
    imageUrl: p.imageUrl,
  }));

  res.json({
    products: items,
    count: items.length,
    items,
    total: items.length,
  });
});

/**
 * POST /api/v1/trade/pricing/calculate - Server-side commercial pricing engine
 */
router.post("/trade/pricing/calculate", async (req: Request, res: Response) => {
  const membership = await ensureMembership(req, res);
  if (!membership) return;

  const { businessId, items } = req.body ?? {};
  if (!Array.isArray(items) || !items.length) {
    res.status(400).json({ error: "items array with productId and quantityCartons is required." });
    return;
  }

  try {
    const result = calculateB2bPricing({ businessId, items });
    res.json(result);
  } catch (err: any) {
    const status = err?.statusCode || (err?.message?.includes("Margin floor") ? 422 : 400);
    res.status(status).json({ error: err instanceof Error ? err.message : "Pricing calculation failed." });
  }
});

/**
 * GET /api/v1/trade/orders - List B2B orders with tracking status
 */
router.get("/trade/orders", async (req: Request, res: Response) => {
  const membership = await ensureMembership(req, res);
  if (!membership) return;

  res.json({
    items: DEMO_TRADE_ORDERS,
    total: DEMO_TRADE_ORDERS.length,
  });
});

/**
 * POST /api/v1/trade/orders - Create B2B Order with stock reservation and revalidation
 */
router.post("/trade/orders", async (req: Request, res: Response) => {
  const membership = await ensureMembership(req, res);
  if (!membership) return;

  const { businessId, branchId, poReference, items, deliveryNotes } = req.body ?? {};
  if (!businessId || !Array.isArray(items) || !items.length) {
    res.status(400).json({ error: "businessId and items array are required." });
    return;
  }

  const biz = DEMO_TRADE_BUSINESSES.find((b) => b.id === businessId);
  if (!biz) {
    res.status(404).json({ error: "Business account not found." });
    return;
  }

  if (biz.status !== "approved") {
    res.status(403).json({ error: "Cannot place orders: business account is not approved." });
    return;
  }

  // Calculate pricing through authoritative engine
  const pricing = calculateB2bPricing({ businessId, items });

  // Reserve stock
  for (const item of items) {
    const prod = DEMO_TRADE_PRODUCTS.find((p) => p.id === item.productId);
    if (!prod) continue;
    const qty = Math.max(item.quantityCartons, 1);
    const available = prod.stockOnHandCartons - prod.allocatedStockCartons;
    if (available < qty) {
      res.status(409).json({
        error: `Insufficient stock for ${prod.name}. Requested: ${qty} cartons, Available: ${available} cartons.`,
      });
      return;
    }
    prod.allocatedStockCartons += qty;
  }

  const orderNum = `ORD-2026-${String(DEMO_TRADE_ORDERS.length + 301).padStart(4, "0")}`;
  const branch = biz.branches.find((b) => b.id === branchId) ?? biz.branches[0];

  const newOrder: DemoTradeOrder = {
    id: `ord-${randomUUID().slice(0, 8)}`,
    orderNumber: orderNum,
    businessId: biz.id,
    businessName: biz.legalName,
    businessType: biz.businessType,
    branchName: branch?.branchName ?? "Main Warehouse Depot",
    placedByUserId: membership.userId,
    poReference: poReference ?? null,
    status: "submitted",
    subtotalCents: pricing.subtotalCents,
    discountCents: pricing.discountCents,
    taxCents: pricing.taxCents,
    totalCents: pricing.totalCents,
    paymentStatus: biz.creditTerms !== "cash" ? "credit_extended" : "pending",
    paymentTerms: biz.creditTerms,
    items: pricing.items.map((i) => ({
      productId: i.productId,
      sku: i.sku,
      productName: i.productName,
      packagingUnit: i.packagingUnit,
      quantity: i.quantityCartons,
      unitPriceCents: i.baseUnitPriceCents,
      subtotalCents: i.subtotalCents,
      discountCents: i.discountCents,
      totalCents: i.totalCents,
    })),
    createdAt: new Date().toISOString(),
  };

  DEMO_TRADE_ORDERS.unshift(newOrder);

  // Generate corresponding Tax Invoice
  const newInvoice: DemoTradeInvoice = {
    id: `inv-${randomUUID().slice(0, 8)}`,
    invoiceNumber: `INV-2026-${String(DEMO_TRADE_INVOICES.length + 1046).padStart(4, "0")}`,
    orderId: newOrder.id,
    orderNumber: newOrder.orderNumber,
    businessId: biz.id,
    businessName: biz.legalName,
    totalCents: newOrder.totalCents,
    paidCents: 0,
    balanceDueCents: newOrder.totalCents,
    status: "issued",
    dueDate: new Date(Date.now() + 14 * 86400 * 1000).toISOString().slice(0, 10),
    etimsControlCode: `KRA-ETIMS-2026-${randomUUID().slice(0, 6).toUpperCase()}`,
    createdAt: new Date().toISOString(),
  };

  DEMO_TRADE_INVOICES.unshift(newInvoice);

  await recordAuditEvent({
    organizationId: membership.organizationId,
    actorUserId: membership.userId,
    actor: membership.role,
    action: "TRADE_ORDER_CREATED",
    targetType: "trade_order",
    targetId: newOrder.id,
    summary: `B2B Order ${newOrder.orderNumber} created for ${biz.legalName} (Total KES ${Math.round(newOrder.totalCents / 100)}).`,
    isDemo: true,
  });

  res.status(201).json({
    message: "Order placed successfully. Stock reserved & invoice generated.",
    order: newOrder,
    invoice: newInvoice,
  });
});

/**
 * GET /api/v1/trade/quotations - List RFQs and formal quotations
 */
router.get("/trade/quotations", async (req: Request, res: Response) => {
  const membership = await ensureMembership(req, res);
  if (!membership) return;

  res.json({
    items: DEMO_TRADE_QUOTATIONS,
    total: DEMO_TRADE_QUOTATIONS.length,
  });
});

/**
 * POST /api/v1/trade/quotations - Create RFQ or negotiation revision
 */
router.post("/trade/quotations", async (req: Request, res: Response) => {
  const membership = await ensureMembership(req, res);
  if (!membership) return;

  const { businessId, items, customerNotes, validUntil } = req.body ?? {};
  if (!businessId || !Array.isArray(items) || !items.length) {
    res.status(400).json({ error: "businessId and items are required." });
    return;
  }

  const biz = DEMO_TRADE_BUSINESSES.find((b) => b.id === businessId);
  if (!biz) {
    res.status(404).json({ error: "Business account not found." });
    return;
  }

  const pricing = calculateB2bPricing({ businessId, items });
  const quoteNumber = `QT-2026-${String(DEMO_TRADE_QUOTATIONS.length + 13).padStart(4, "0")}`;

  const quote: DemoTradeQuotation = {
    id: `qt-${randomUUID().slice(0, 8)}`,
    quotationNumber: quoteNumber,
    businessId: biz.id,
    businessName: biz.legalName,
    requestedByUserId: membership.userId,
    assignedSalesRepUserId: membership.userId,
    status: "issued",
    subtotalCents: pricing.subtotalCents,
    discountCents: pricing.discountCents,
    totalCents: pricing.totalCents,
    validUntil: validUntil ?? new Date(Date.now() + 21 * 86400 * 1000).toISOString().slice(0, 10),
    customerNotes: customerNotes ?? null,
    internalMarginPct: 22,
    items: pricing.items.map((i) => ({
      productId: i.productId,
      productName: i.productName,
      quantity: i.quantityCartons,
      unitPriceCents: i.effectiveUnitPriceCents,
      totalCents: i.totalCents,
    })),
    createdAt: new Date().toISOString(),
  };

  DEMO_TRADE_QUOTATIONS.unshift(quote);

  res.status(201).json({
    message: "Quotation created successfully.",
    quotation: quote,
  });
});

/**
 * GET /api/v1/trade/invoices - Invoices & Accounts Receivable aging
 */
router.get("/trade/invoices", async (req: Request, res: Response) => {
  const membership = await ensureMembership(req, res);
  if (!membership) return;

  res.json({
    items: DEMO_TRADE_INVOICES,
    total: DEMO_TRADE_INVOICES.length,
  });
});

/**
 * POST /api/v1/trade/payments/mpesa - Trigger and verify M-Pesa B2B/C2B payment
 */
router.post("/trade/payments/mpesa", async (req: Request, res: Response) => {
  const membership = await ensureMembership(req, res);
  if (!membership) return;

  const invoiceId = req.body?.invoiceId;
  const phoneNumber = req.body?.phoneNumber;
  const amountKes = req.body?.amountKes ?? (typeof req.body?.amountCents === "number" ? Math.round(req.body.amountCents / 100) : undefined);

  if (!invoiceId || !phoneNumber || !amountKes) {
    res.status(400).json({ error: "invoiceId, phoneNumber, and amountKes (or amountCents) are required." });
    return;
  }

  const invoice = DEMO_TRADE_INVOICES.find((i) => i.id === invoiceId);
  if (!invoice) {
    res.status(404).json({ error: "Invoice not found." });
    return;
  }

  const amountCents = amountKes * 100;
  const receiptNum = `QA${randomUUID().slice(0, 8).toUpperCase()}`;
  const checkoutId = `ws_CO_${randomUUID().slice(0, 12)}`;

  invoice.paidCents += amountCents;
  invoice.balanceDueCents = Math.max(0, invoice.totalCents - invoice.paidCents);
  if (invoice.balanceDueCents === 0) {
    invoice.status = "paid";
    const ord = DEMO_TRADE_ORDERS.find((o) => o.id === invoice.orderId);
    if (ord) ord.paymentStatus = "paid";
  } else {
    invoice.status = "partial";
  }

  await recordAuditEvent({
    organizationId: membership.organizationId,
    actorUserId: membership.userId,
    actor: membership.role,
    action: "TRADE_PAYMENT_PROCESSED",
    targetType: "trade_payment",
    targetId: receiptNum,
    summary: `M-Pesa payment of KES ${amountKes} reconciled for invoice ${invoice.invoiceNumber}. Receipt: ${receiptNum}.`,
    isDemo: true,
  });

  res.json({
    success: true,
    status: "completed",
    paymentMethod: "mpesa_b2b",
    message: "M-Pesa B2B STK Push simulated and successfully reconciled.",
    receiptNumber: receiptNum,
    checkoutId,
    amountKes,
    invoiceStatus: invoice.status,
    remainingBalanceKes: Math.round(invoice.balanceDueCents / 100),
  });
});

/**
 * POST /api/v1/trade/ai/query - S-Tier Trade AI Copilot & Agent Ecosystem
 */
router.post("/trade/ai/query", async (req: Request, res: Response) => {
  const membership = await ensureMembership(req, res);
  if (!membership) return;

  const rawQuery = req.body?.query ?? req.body?.prompt;
  const businessId = req.body?.businessId;
  if (typeof rawQuery !== "string" || !rawQuery.trim()) {
    res.status(400).json({ error: "query or prompt string is required." });
    return;
  }

  const q = rawQuery.toLowerCase();

  // Agent 1: Natural language bulk order assembly
  if (q.includes("carton") || q.includes("need") || q.includes("order") || q.includes("buy")) {
    const extracted: Array<{ product: DemoTradeProduct; quantity: number }> = [];

    if (q.includes("saffron") || q.includes("lotion")) {
      const match = q.match(/(\d+)\s*(?:carton|box|case)?.*(?:saffron|lotion)/i) ?? [null, "30"];
      extracted.push({
        product: DEMO_TRADE_PRODUCTS[0],
        quantity: parseInt(match[1] || "30", 10),
      });
    }

    if (q.includes("soap") || q.includes("bio saff") || q.includes("tea tree")) {
      const match = q.match(/(\d+)\s*(?:carton|box|case)?.*(?:soap|bio|tea tree)/i) ?? [null, "50"];
      extracted.push({
        product: DEMO_TRADE_PRODUCTS[2],
        quantity: parseInt(match[1] || "50", 10),
      });
    }

    if (q.includes("pomade") || q.includes("cornells") || q.includes("beard")) {
      const match = q.match(/(\d+)\s*(?:carton|box|case)?.*(?:pomade|cornells|beard)/i) ?? [null, "20"];
      extracted.push({
        product: DEMO_TRADE_PRODUCTS[4],
        quantity: parseInt(match[1] || "20", 10),
      });
    }

    if (!extracted.length) {
      extracted.push({ product: DEMO_TRADE_PRODUCTS[0], quantity: 25 });
    }

    const pricing = calculateB2bPricing({
      businessId,
      items: extracted.map((e) => ({
        productId: e.product.id,
        quantityCartons: e.quantity,
      })),
    });

    res.json({
      agentName: "Rekker Trade Assistant",
      intent: "ORDER_ASSEMBLY",
      summary: `I've prepared a draft bulk order for ${pricing.totalCartons} cartons across ${extracted.length} product lines.`,
      pricingSummary: {
        totalCartons: pricing.totalCartons,
        subtotalCents: pricing.subtotalCents,
        discountCents: pricing.discountCents,
        discountPercent: pricing.combinedDiscountPct,
        taxCents: pricing.taxCents,
        estimatedTotalCents: pricing.totalCents,
        totalKes: Math.round(pricing.totalCents / 100),
      },
      pricingBreakdown: {
        totalCartons: pricing.totalCartons,
        subtotalKes: Math.round(pricing.subtotalCents / 100),
        discountKes: Math.round(pricing.discountCents / 100),
        discountPct: pricing.combinedDiscountPct,
        vatKes: Math.round(pricing.taxCents / 100),
        grandTotalKes: Math.round(pricing.totalCents / 100),
      },
      draftOrder: {
        items: pricing.items.map((i) => ({
          productId: i.productId,
          sku: i.sku,
          name: i.productName,
          quantityCartons: i.quantityCartons,
          unitPriceCents: i.effectiveUnitPriceCents,
          totalCents: i.totalCents,
        })),
      },
      lineItems: pricing.items.map((i) => ({
        sku: i.sku,
        name: i.productName,
        cartons: i.quantityCartons,
        unitsTotal: i.totalUnits,
        unitPriceKes: Math.round(i.baseUnitPriceCents / 100),
        effectiveLineTotalKes: Math.round(i.totalCents / 100),
      })),
      actionable: true,
      readyToSubmit: true,
    });
    return;
  }

  // Agent 3 & 4: Inventory & Demand Forecasting
  if (q.includes("stock") || q.includes("inventory") || q.includes("forecast") || q.includes("demand")) {
    const lowStock = DEMO_TRADE_PRODUCTS.filter((p) => p.status === "low_stock");

    res.json({
      agentName: "Demand Forecasting & Inventory Intelligence",
      intent: "STOCK_INTELLIGENCE",
      summary: `Current warehouse stock health: 6 lines active, 2 lines flagged low-stock. Next 30-day projected demand: 850 cartons.`,
      insights: [
        {
          sku: "COR-BEARD-50ML-CTN",
          productName: "Cornells Cedarwood & Argan Beard Conditioning Oil",
          stockOnHand: 95,
          daysOfStockRemaining: 12,
          recommendation: "Trigger production batch of 150 cartons before 25 March.",
        },
        {
          sku: "PET-ODOR-SPRAY-250ML",
          productName: "PetCare Enzymatic Kennel & Coat Deodorizing Spray",
          stockOnHand: 15,
          daysOfStockRemaining: 4,
          recommendation: "Critical low stock alert. Prioritize line 2 batching.",
        },
      ],
      actionable: false,
    });
    return;
  }

  // General B2B Assistant response
  res.json({
    agentName: "Rekker Trade Assistant",
    intent: "GENERAL_INQUIRY",
    summary: `Hello! I am your Rekker Trade B2B Copilot. You can ask me to assemble bulk carton orders, calculate customer tier quantity discounts, look up real-time warehouse inventory, or prepare quotation drafts.`,
    capabilities: [
      "Natural language bulk order assembly (e.g. 'I need 50 cartons of Saffron lotion and 30 soaps')",
      "Automated volume break and wholesale tier price calculations",
      "Warehouse stock availability and dispatch tracking",
      "Quotation requests and commercial margin checks",
    ],
    actionable: false,
  });
});

// ─── Multi-Warehouse, Dispatch & Supplier Procurement Stores ──────────────────

export interface DemoTradeWarehouse {
  id: string;
  code: string;
  name: string;
  county: string;
  physicalAddress: string;
  capacityCartons: number;
  currentStockCartons: number;
  managerName: string;
  contactPhone: string;
  isActive: boolean;
}

export interface DemoTradeShipment {
  id: string;
  shipmentNumber: string;
  orderId: string;
  orderNumber: string;
  businessName: string;
  warehouseCode: string;
  warehouseName: string;
  status: "picking" | "packed" | "dispatched" | "in_transit" | "delivered";
  assignedDriverName: string;
  vehicleRegistration: string;
  dispatchedAt: string;
  deliveredAt: string | null;
  recipientName: string | null;
  deliveryNotes: string;
  totalCartons: number;
}

export interface DemoTradeSupplier {
  id: string;
  code: string;
  name: string;
  category: "packaging_glass" | "packaging_plastic" | "packaging_corrugated" | "raw_botanicals_oils" | "chemicals_surfactants";
  kraPin: string;
  primaryContact: string;
  phone: string;
  email: string;
  physicalLocation: string;
  paymentTerms: string;
  status: "approved" | "review" | "suspended";
}

export interface DemoTradeRawMaterial {
  id: string;
  code: string;
  name: string;
  category: "bottles" | "caps_pumps" | "essential_oils" | "active_ingredients" | "cartons_boxes";
  unitOfMeasure: "piece" | "kg" | "litre" | "bundle";
  stockOnHand: number;
  reorderLevel: number;
  unitCostCents: number;
  preferredSupplierId: string;
  preferredSupplierName: string;
  compatibleBrand: string;
  status: "in_stock" | "low_stock" | "critical";
}

export interface DemoTradePurchaseOrder {
  id: string;
  poNumber: string;
  supplierId: string;
  supplierName: string;
  warehouseCode: string;
  status: "draft" | "issued" | "partially_received" | "received" | "cancelled";
  totalCents: number;
  currency: string;
  expectedDeliveryDate: string;
  deliveryNotes: string | null;
  items: Array<{
    materialId: string;
    code: string;
    materialName: string;
    quantityOrdered: number;
    quantityReceived: number;
    unitPriceCents: number;
    totalCents: number;
  }>;
  createdAt: string;
}

export const DEMO_TRADE_WAREHOUSES: DemoTradeWarehouse[] = [
  {
    id: "wh-001",
    code: "WH-NBO-01",
    name: "Baba Dogo Central Plant & Logistics Hub",
    county: "Nairobi",
    physicalAddress: "Plot 48, Baba Dogo Road, Ruaraka Industrial Zone, Nairobi",
    capacityCartons: 25000,
    currentStockCartons: 18450,
    managerName: "Kiprono Bett",
    contactPhone: "+254722112233",
    isActive: true,
  },
  {
    id: "wh-002",
    code: "WH-MSA-01",
    name: "Mombasa Coastal Distribution Depot",
    county: "Mombasa",
    physicalAddress: "Miritini Logistics Park, Off Airport Road, Mombasa",
    capacityCartons: 12000,
    currentStockCartons: 7800,
    managerName: "Fatuma Bakari",
    contactPhone: "+254733445566",
    isActive: true,
  },
  {
    id: "wh-003",
    code: "WH-KSM-01",
    name: "Kisumu Lake Region Logistics Hub",
    county: "Kisumu",
    physicalAddress: "Obunga Industrial Avenue, Kisumu",
    capacityCartons: 10000,
    currentStockCartons: 5200,
    managerName: "Otieno Odhiambo",
    contactPhone: "+254711778899",
    isActive: true,
  },
  {
    id: "wh-004",
    code: "WH-NKR-01",
    name: "Nakuru Rift Valley Depot",
    county: "Nakuru",
    physicalAddress: "Nakuru Light Industrial Area, George Morara Rd, Nakuru",
    capacityCartons: 8000,
    currentStockCartons: 4100,
    managerName: "Wanjohi Mwangi",
    contactPhone: "+254720998877",
    isActive: true,
  },
];

export const DEMO_TRADE_SHIPMENTS: DemoTradeShipment[] = [
  {
    id: "shp-001",
    shipmentNumber: "SHP-2026-0041",
    orderId: "ord-001",
    orderNumber: "ORD-2026-0301",
    businessName: "Nairobi Mega Retail Distributors Limited",
    warehouseCode: "WH-NBO-01",
    warehouseName: "Baba Dogo Central Plant & Logistics Hub",
    status: "dispatched",
    assignedDriverName: "Juma Omondi",
    vehicleRegistration: "KDF 492B (Isuzu FRR 10-Tonne Box Truck)",
    dispatchedAt: "2026-03-02T11:00:00Z",
    deliveredAt: null,
    recipientName: null,
    deliveryNotes: "Call receiving supervisor 30 minutes prior to gate arrival.",
    totalCartons: 60,
  },
  {
    id: "shp-002",
    shipmentNumber: "SHP-2026-0042",
    orderId: "ord-002",
    orderNumber: "ORD-2026-0302",
    businessName: "Rift Valley Retail & Supermarkets Kenya Ltd",
    warehouseCode: "WH-NKR-01",
    warehouseName: "Nakuru Rift Valley Depot",
    status: "delivered",
    assignedDriverName: "Peter Kariuki",
    vehicleRegistration: "KDG 118C (Isuzu NPR 5-Tonne Cargo Van)",
    dispatchedAt: "2026-03-04T15:00:00Z",
    deliveredAt: "2026-03-04T18:30:00Z",
    recipientName: "Simon Koech (Receiving Manager)",
    deliveryNotes: "Confirmed 30 cartons delivered in tamper-evident sealed packaging.",
    totalCartons: 30,
  },
];

export const DEMO_TRADE_SUPPLIERS: DemoTradeSupplier[] = [
  {
    id: "sup-001",
    code: "SUP-GLS-01",
    name: "East African Glass Mills Ltd",
    category: "packaging_glass",
    kraPin: "P051112233A",
    primaryContact: "Kamau Njoroge",
    phone: "+254722880011",
    email: "commercial@eaglassmills.co.ke",
    physicalLocation: "Nairobi Industrial Area, Off Enterprise Road",
    paymentTerms: "net_30",
    status: "approved",
  },
  {
    id: "sup-002",
    code: "SUP-PLAS-01",
    name: "Premier Plastics Kenya Ltd",
    category: "packaging_plastic",
    kraPin: "P051223344B",
    primaryContact: "Dipak Patel",
    phone: "+254733990022",
    email: "orders@premierplastics.co.ke",
    physicalLocation: "Athi River Export Processing Zone, Machakos",
    paymentTerms: "net_30",
    status: "approved",
  },
  {
    id: "sup-003",
    code: "SUP-BOT-01",
    name: "Nzoia Botanicals & Fragrances Ltd",
    category: "raw_botanicals_oils",
    kraPin: "P051334455C",
    primaryContact: "Mercy Chebet",
    phone: "+254711554433",
    email: "supply@nzoiabotanicals.co.ke",
    physicalLocation: "Kipkenyo Industrial Estate, Eldoret",
    paymentTerms: "net_14",
    status: "approved",
  },
  {
    id: "sup-004",
    code: "SUP-PKG-01",
    name: "Kenya Carton & Packaging Converters Ltd",
    category: "packaging_corrugated",
    kraPin: "P051445566D",
    primaryContact: "Brian Omondi",
    phone: "+254720667788",
    email: "sales@kenyacarton.co.ke",
    physicalLocation: "Thika Industrial Zone, Garissa Highway, Thika",
    paymentTerms: "net_45",
    status: "approved",
  },
];

export const DEMO_TRADE_RAW_MATERIALS: DemoTradeRawMaterial[] = [
  {
    id: "rm-001",
    code: "RM-GLS-100ML",
    name: "100ml Cylindrical Amber Glass Bottle (Saffron Milan)",
    category: "bottles",
    unitOfMeasure: "piece",
    stockOnHand: 45000,
    reorderLevel: 10000,
    unitCostCents: 3500, // KES 35.00
    preferredSupplierId: "sup-001",
    preferredSupplierName: "East African Glass Mills Ltd",
    compatibleBrand: "Saffron Milan",
    status: "in_stock",
  },
  {
    id: "rm-002",
    code: "RM-PUMP-GOLD",
    name: "24mm Gold Fine Mist Atomizer Spray Pump & Collar",
    category: "caps_pumps",
    unitOfMeasure: "piece",
    stockOnHand: 38000,
    reorderLevel: 8000,
    unitCostCents: 1800, // KES 18.00
    preferredSupplierId: "sup-002",
    preferredSupplierName: "Premier Plastics Kenya Ltd",
    compatibleBrand: "Saffron Milan",
    status: "in_stock",
  },
  {
    id: "rm-003",
    code: "RM-OIL-TEATREE",
    name: "Pure Kenyan Tea Tree Essential Oil (Melaleuca Alternifolia)",
    category: "essential_oils",
    unitOfMeasure: "litre",
    stockOnHand: 420,
    reorderLevel: 80,
    unitCostCents: 280000, // KES 2,800.00 / Litre
    preferredSupplierId: "sup-003",
    preferredSupplierName: "Nzoia Botanicals & Fragrances Ltd",
    compatibleBrand: "Bio Saff",
    status: "in_stock",
  },
  {
    id: "rm-004",
    code: "RM-BOX-24PACK",
    name: "Master Shipping Carton Corrugated Box (24-pack Double Wall)",
    category: "cartons_boxes",
    unitOfMeasure: "bundle",
    stockOnHand: 3200,
    reorderLevel: 500,
    unitCostCents: 8500, // KES 85.00 / bundle
    preferredSupplierId: "sup-004",
    preferredSupplierName: "Kenya Carton & Packaging Converters Ltd",
    compatibleBrand: "All",
    status: "in_stock",
  },
  {
    id: "rm-005",
    code: "RM-OIL-ARGAN",
    name: "Virgin Cold-Pressed Argan Kernel Oil (Cornells Series)",
    category: "essential_oils",
    unitOfMeasure: "litre",
    stockOnHand: 48,
    reorderLevel: 60,
    unitCostCents: 420000, // KES 4,200.00 / Litre
    preferredSupplierId: "sup-003",
    preferredSupplierName: "Nzoia Botanicals & Fragrances Ltd",
    compatibleBrand: "Cornells",
    status: "low_stock",
  },
];

export const DEMO_TRADE_PURCHASE_ORDERS: DemoTradePurchaseOrder[] = [
  {
    id: "po-sup-001",
    poNumber: "PO-SUP-2026-0011",
    supplierId: "sup-001",
    supplierName: "East African Glass Mills Ltd",
    warehouseCode: "WH-NBO-01",
    status: "received",
    totalCents: 175000000, // KES 1,750,000
    currency: "KES",
    expectedDeliveryDate: "2026-03-01",
    deliveryNotes: "Batch inspection passed with certificate of analysis.",
    items: [
      {
        materialId: "rm-001",
        code: "RM-GLS-100ML",
        materialName: "100ml Cylindrical Amber Glass Bottle (Saffron Milan)",
        quantityOrdered: 50000,
        quantityReceived: 50000,
        unitPriceCents: 3500,
        totalCents: 175000000,
      },
    ],
    createdAt: "2026-02-20T10:00:00Z",
  },
  {
    id: "po-sup-002",
    poNumber: "PO-SUP-2026-0012",
    supplierId: "sup-003",
    supplierName: "Nzoia Botanicals & Fragrances Ltd",
    warehouseCode: "WH-NBO-01",
    status: "issued",
    totalCents: 84000000, // KES 840,000
    currency: "KES",
    expectedDeliveryDate: "2026-03-25",
    deliveryNotes: "Expedited replenishment order for Argan & Tea Tree botanical oils.",
    items: [
      {
        materialId: "rm-005",
        code: "RM-OIL-ARGAN",
        materialName: "Virgin Cold-Pressed Argan Kernel Oil (Cornells Series)",
        quantityOrdered: 200,
        quantityReceived: 0,
        unitPriceCents: 420000,
        totalCents: 84000000,
      },
    ],
    createdAt: "2026-03-05T09:30:00Z",
  },
];

/**
 * GET /api/v1/trade/invoices/:id/print - Generate formal KRA eTIMS Tax Invoice
 */
router.get("/trade/invoices/:id/print", async (req: Request, res: Response) => {
  const membership = await ensureMembership(req, res);
  if (!membership) return;

  const invoiceId = req.params.id;
  const invoice = DEMO_TRADE_INVOICES.find((i) => i.id === invoiceId || i.invoiceNumber === invoiceId);
  if (!invoice) {
    res.status(404).json({ error: "Invoice not found." });
    return;
  }

  const order = DEMO_TRADE_ORDERS.find((o) => o.id === invoice.orderId);
  const business = DEMO_TRADE_BUSINESSES.find((b) => b.id === invoice.businessId);

  const subtotalCents = order?.subtotalCents ?? Math.round(invoice.totalCents / 1.16);
  const discountCents = order?.discountCents ?? 0;
  const netVatableCents = subtotalCents - discountCents;
  const vatCents = Math.round(netVatableCents * 0.16);

  const printPayload = {
    documentType: "TAX INVOICE",
    complianceStandard: "KENYA REVENUE AUTHORITY (KRA) eTIMS REGULATION 2024",
    seller: {
      name: "REKKER LIMITED",
      tradingAs: "Rekker Trade Wholesale & FMCG Distribution",
      kraPin: "P051234567X",
      vatNumber: "01234567K",
      etimsControlUnit: "KRA-CU-REKKER-NBO-01",
      physicalAddress: "Plot 48, Baba Dogo Road, Ruaraka Industrial Zone, Nairobi, Kenya",
      postalAddress: "P.O. Box 48921-00100 Nairobi, Kenya",
      telephone: "+254 700 000 000 / +254 722 000 000",
      email: "finance@rekker.co.ke",
      website: "trade.rekker.co.ke",
    },
    buyer: {
      legalName: business?.legalName ?? invoice.businessName,
      tradingName: business?.tradingName ?? business?.legalName ?? invoice.businessName,
      kraPin: business?.kraPin ?? "P050000000Z",
      businessType: business?.businessType ?? "wholesale_partner",
      physicalLocation: business?.physicalLocation ?? "Nairobi, Kenya",
      contactPerson: business?.primaryContactName ?? "Procurement Office",
      telephone: business?.primaryPhone ?? "+254 700 000 000",
      email: business?.primaryEmail ?? "procurement@buyer.co.ke",
    },
    invoiceDetails: {
      invoiceNumber: invoice.invoiceNumber,
      orderNumber: invoice.orderNumber,
      poReference: order?.poReference ?? "N/A",
      issueDate: invoice.createdAt.slice(0, 10),
      dueDate: invoice.dueDate,
      paymentTerms: order?.paymentTerms ?? "net_30",
      paymentStatus: invoice.status.toUpperCase(),
      etimsControlCode: invoice.etimsControlCode,
      etimsQrUrl: `https://itax.kra.go.ke/KRA-Portal/invoiceConfirmation.htm?cu=${encodeURIComponent(invoice.etimsControlCode)}`,
    },
    lineItems: (order?.items ?? []).map((item, index) => ({
      lineNo: index + 1,
      sku: item.sku,
      productName: item.productName,
      packagingUnit: item.packagingUnit,
      quantityCartons: item.quantity,
      unitPriceExclVatKes: Math.round((item.unitPriceCents / 1.16) / 100),
      vatRatePct: 16,
      subtotalExclVatKes: Math.round((item.subtotalCents / 1.16) / 100),
      discountKes: Math.round((item.discountCents / 1.16) / 100),
      lineTotalInclVatKes: Math.round(item.totalCents / 100),
    })),
    taxSummary: {
      rate16NetVatableKes: Math.round(netVatableCents / 100),
      rate16VatAmountKes: Math.round(vatCents / 100),
      zeroRatedKes: 0,
      exemptKes: 0,
      totalVatKes: Math.round(vatCents / 100),
      grossTotalKes: Math.round(invoice.totalCents / 100),
      grossTotalCents: invoice.totalCents,
      paidAmountKes: Math.round(invoice.paidCents / 100),
      balanceDueKes: Math.round(invoice.balanceDueCents / 100),
      currency: "KES",
    },
    bankingInstructions: {
      bankName: "Stanbic Bank Kenya Limited",
      branch: "Chiromo Branch, Nairobi",
      accountName: "Rekker Limited - Collection Account",
      accountNumber: "0100088921101",
      swiftCode: "SBICKENX",
      mpesaPaybill: "522522",
      mpesaAccount: invoice.invoiceNumber,
    },
  };

  res.json(printPayload);
});

/**
 * GET /api/v1/trade/orders/:id/delivery-note - Formal Consignment Delivery Note
 */
router.get("/trade/orders/:id/delivery-note", async (req: Request, res: Response) => {
  const membership = await ensureMembership(req, res);
  if (!membership) return;

  const orderId = req.params.id;
  const order = DEMO_TRADE_ORDERS.find((o) => o.id === orderId || o.orderNumber === orderId);
  if (!order) {
    res.status(404).json({ error: "Order not found." });
    return;
  }

  const business = DEMO_TRADE_BUSINESSES.find((b) => b.id === order.businessId);
  const shipment = DEMO_TRADE_SHIPMENTS.find((s) => s.orderId === order.id) ?? {
    id: `shp-${randomUUID().slice(0, 6)}`,
    shipmentNumber: `SHP-2026-${randomUUID().slice(0, 4).toUpperCase()}`,
    orderId: order.id,
    orderNumber: order.orderNumber,
    businessName: order.businessName,
    warehouseCode: "WH-NBO-01",
    warehouseName: "Baba Dogo Central Plant & Logistics Hub",
    status: "dispatched",
    assignedDriverName: "Juma Omondi",
    vehicleRegistration: "KDF 492B (Isuzu FRR 10-Tonne Box Truck)",
    dispatchedAt: new Date().toISOString(),
    deliveredAt: null,
    recipientName: null,
    deliveryNotes: "Goods in transit under commercial carrier escort.",
    totalCartons: order.items.reduce((s, i) => s + i.quantity, 0),
  };

  const deliveryNote = {
    deliveryNoteNumber: `DN-${order.orderNumber.replace("ORD-", "")}`,
    orderNumber: order.orderNumber,
    poReference: order.poReference ?? "N/A",
    dispatchDate: shipment.dispatchedAt.slice(0, 10),
    warehouse: {
      code: shipment.warehouseCode,
      name: shipment.warehouseName,
      dispatchOfficer: "Kiprono Bett (Warehouse Superintendent)",
    },
    consignee: {
      customerName: business?.legalName ?? order.businessName,
      deliveryBranch: order.branchName,
      deliveryAddress: business?.physicalLocation ?? "Nairobi, Kenya",
      contactPerson: business?.primaryContactName ?? "Receiving Manager",
      contactPhone: business?.primaryPhone ?? "+254 700 000 000",
    },
    carrier: {
      driverName: shipment.assignedDriverName,
      driverNationalId: "24892104",
      vehicleRegistration: shipment.vehicleRegistration,
      ntsaInspectionValid: true,
    },
    consignmentLines: order.items.map((i, idx) => ({
      itemNo: idx + 1,
      sku: i.sku,
      description: i.productName,
      packagingUnit: i.packagingUnit,
      cartonsDispatched: i.quantity,
      estimatedGrossWeightKg: i.quantity * 14.5, // approx 14.5kg per carton
      batchLotNumbers: [`LOT-2026-${(idx + 1) * 110}`],
    })),
    totalCartonsDispatched: order.items.reduce((s, i) => s + i.quantity, 0),
    totalGrossWeightKg: Math.round(order.items.reduce((s, i) => s + i.quantity * 14.5, 0)),
    instructions: "All cartons are secured with Rekker branded security tamper tape. Check seals before signing receipt.",
    dualSignoff: {
      dispatchedBy: {
        name: "Kiprono Bett",
        signatureDate: shipment.dispatchedAt,
        status: "Signed & Sealed",
      },
      driverAcknowledged: {
        name: shipment.assignedDriverName,
        signatureDate: shipment.dispatchedAt,
        status: "Received in Good Condition",
      },
      consigneeReceived: {
        name: shipment.recipientName ?? "Pending Consignee Stamp",
        receivedDate: shipment.deliveredAt,
        status: shipment.deliveredAt ? "Goods Received & Accepted" : "In Transit",
      },
    },
  };

  res.json(deliveryNote);
});

/**
 * GET /api/v1/trade/warehouses - Multi-Site Regional Warehouses
 */
router.get("/trade/warehouses", async (req: Request, res: Response) => {
  const membership = await ensureMembership(req, res);
  if (!membership) return;

  res.json({
    warehouses: DEMO_TRADE_WAREHOUSES,
    total: DEMO_TRADE_WAREHOUSES.length,
    totalCapacityCartons: DEMO_TRADE_WAREHOUSES.reduce((s, w) => s + w.capacityCartons, 0),
    currentStockCartons: DEMO_TRADE_WAREHOUSES.reduce((s, w) => s + w.currentStockCartons, 0),
  });
});

/**
 * GET /api/v1/trade/shipments - List Shipments & Carrier Movements
 */
router.get("/trade/shipments", async (req: Request, res: Response) => {
  const membership = await ensureMembership(req, res);
  if (!membership) return;

  res.json({
    shipments: DEMO_TRADE_SHIPMENTS,
    total: DEMO_TRADE_SHIPMENTS.length,
  });
});

/**
 * POST /api/v1/trade/shipments/dispatch - Dispatch Order from Warehouse
 */
router.post("/trade/shipments/dispatch", async (req: Request, res: Response) => {
  const membership = await ensureMembership(req, res);
  if (!membership) return;

  const { orderId, warehouseCode, assignedDriverName, vehicleRegistration, deliveryNotes } = req.body ?? {};
  if (!orderId || !assignedDriverName || !vehicleRegistration) {
    res.status(400).json({ error: "orderId, assignedDriverName, and vehicleRegistration are required." });
    return;
  }

  const order = DEMO_TRADE_ORDERS.find((o) => o.id === orderId || o.orderNumber === orderId);
  if (!order) {
    res.status(404).json({ error: "Order not found." });
    return;
  }

  const wh = DEMO_TRADE_WAREHOUSES.find((w) => w.code === (warehouseCode || "WH-NBO-01")) ?? DEMO_TRADE_WAREHOUSES[0];

  order.status = "dispatched";

  const newShipment: DemoTradeShipment = {
    id: `shp-${randomUUID().slice(0, 8)}`,
    shipmentNumber: `SHP-2026-${String(DEMO_TRADE_SHIPMENTS.length + 43).padStart(4, "0")}`,
    orderId: order.id,
    orderNumber: order.orderNumber,
    businessName: order.businessName,
    warehouseCode: wh.code,
    warehouseName: wh.name,
    status: "dispatched",
    assignedDriverName,
    vehicleRegistration,
    dispatchedAt: new Date().toISOString(),
    deliveredAt: null,
    recipientName: null,
    deliveryNotes: deliveryNotes || "Consignment dispatched under formal bill of lading.",
    totalCartons: order.items.reduce((s, i) => s + i.quantity, 0),
  };

  DEMO_TRADE_SHIPMENTS.unshift(newShipment);

  await recordAuditEvent({
    organizationId: membership.organizationId,
    actorUserId: membership.userId,
    actor: membership.role,
    action: "TRADE_ORDER_DISPATCHED",
    targetType: "trade_shipment",
    targetId: newShipment.shipmentNumber,
    summary: `Order ${order.orderNumber} dispatched from ${wh.name} via ${vehicleRegistration} (Driver: ${assignedDriverName}).`,
    isDemo: true,
  });

  res.status(201).json({
    message: "Consignment dispatched successfully.",
    shipment: newShipment,
    deliveryNoteUrl: `/api/trade/orders/${order.id}/delivery-note`,
  });
});

/**
 * POST /api/v1/trade/shipments/:id/deliver - Record Proof of Delivery
 */
router.post("/trade/shipments/:id/deliver", async (req: Request, res: Response) => {
  const membership = await ensureMembership(req, res);
  if (!membership) return;

  const shipmentId = req.params.id;
  const shipment = DEMO_TRADE_SHIPMENTS.find((s) => s.id === shipmentId || s.shipmentNumber === shipmentId);
  if (!shipment) {
    res.status(404).json({ error: "Shipment not found." });
    return;
  }

  const { recipientName, recipientSignatureConfirmed } = req.body ?? {};
  if (!recipientName) {
    res.status(400).json({ error: "recipientName is required for proof of delivery." });
    return;
  }

  shipment.status = "delivered";
  shipment.deliveredAt = new Date().toISOString();
  shipment.recipientName = recipientName;

  const order = DEMO_TRADE_ORDERS.find((o) => o.id === shipment.orderId);
  if (order) order.status = "delivered";

  await recordAuditEvent({
    organizationId: membership.organizationId,
    actorUserId: membership.userId,
    actor: membership.role,
    action: "TRADE_SHIPMENT_DELIVERED",
    targetType: "trade_shipment",
    targetId: shipment.shipmentNumber,
    summary: `Shipment ${shipment.shipmentNumber} delivered to ${recipientName}. Proof of delivery confirmed.`,
    isDemo: true,
  });

  res.json({
    message: "Proof of delivery recorded successfully.",
    shipment,
  });
});

/**
 * GET /api/v1/trade/procurement/suppliers - Supplier Directory
 */
router.get("/trade/procurement/suppliers", async (req: Request, res: Response) => {
  const membership = await ensureMembership(req, res);
  if (!membership) return;

  res.json({
    suppliers: DEMO_TRADE_SUPPLIERS,
    total: DEMO_TRADE_SUPPLIERS.length,
  });
});

/**
 * GET /api/v1/trade/procurement/materials - Raw Materials Inventory
 */
router.get("/trade/procurement/materials", async (req: Request, res: Response) => {
  const membership = await ensureMembership(req, res);
  if (!membership) return;

  res.json({
    materials: DEMO_TRADE_RAW_MATERIALS,
    total: DEMO_TRADE_RAW_MATERIALS.length,
    lowStockCount: DEMO_TRADE_RAW_MATERIALS.filter((m) => m.status === "low_stock" || m.status === "critical").length,
  });
});

/**
 * GET /api/v1/trade/procurement/orders - Supplier Purchase Orders
 */
router.get("/trade/procurement/orders", async (req: Request, res: Response) => {
  const membership = await ensureMembership(req, res);
  if (!membership) return;

  res.json({
    purchaseOrders: DEMO_TRADE_PURCHASE_ORDERS,
    total: DEMO_TRADE_PURCHASE_ORDERS.length,
  });
});

/**
 * POST /api/v1/trade/procurement/orders - Issue Purchase Order to Supplier
 */
router.post("/trade/procurement/orders", async (req: Request, res: Response) => {
  const membership = await ensureMembership(req, res);
  if (!membership) return;

  const { supplierId, warehouseCode, expectedDeliveryDate, deliveryNotes, items } = req.body ?? {};
  if (!supplierId || !Array.isArray(items) || !items.length) {
    res.status(400).json({ error: "supplierId and items array are required." });
    return;
  }

  const supplier = DEMO_TRADE_SUPPLIERS.find((s) => s.id === supplierId || s.code === supplierId);
  if (!supplier) {
    res.status(404).json({ error: "Supplier not found." });
    return;
  }

  let totalCents = 0;
  const lineItems = items.map((item: any) => {
    const mat = DEMO_TRADE_RAW_MATERIALS.find((m) => m.id === item.materialId || m.code === item.materialId);
    const unitPrice = typeof item.unitPriceCents === "number" ? item.unitPriceCents : (mat?.unitCostCents || 1000);
    const lineTotal = unitPrice * item.quantity;
    totalCents += lineTotal;

    return {
      materialId: mat?.id ?? item.materialId,
      code: mat?.code ?? "RM-GEN",
      materialName: mat?.name ?? "Raw Material",
      quantityOrdered: item.quantity,
      quantityReceived: 0,
      unitPriceCents: unitPrice,
      totalCents: lineTotal,
    };
  });

  const newPO: DemoTradePurchaseOrder = {
    id: `po-sup-${randomUUID().slice(0, 8)}`,
    poNumber: `PO-SUP-2026-${String(DEMO_TRADE_PURCHASE_ORDERS.length + 13).padStart(4, "0")}`,
    supplierId: supplier.id,
    supplierName: supplier.name,
    warehouseCode: warehouseCode || "WH-NBO-01",
    status: "issued",
    totalCents,
    currency: "KES",
    expectedDeliveryDate: expectedDeliveryDate || new Date(Date.now() + 14 * 86400 * 1000).toISOString().slice(0, 10),
    deliveryNotes: deliveryNotes || "Quality certificates must accompany delivery note.",
    items: lineItems,
    createdAt: new Date().toISOString(),
  };

  DEMO_TRADE_PURCHASE_ORDERS.unshift(newPO);

  await recordAuditEvent({
    organizationId: membership.organizationId,
    actorUserId: membership.userId,
    actor: membership.role,
    action: "TRADE_PURCHASE_ORDER_ISSUED",
    targetType: "trade_purchase_order",
    targetId: newPO.poNumber,
    summary: `Issued Purchase Order ${newPO.poNumber} to ${supplier.name} for KES ${Math.round(totalCents / 100).toLocaleString()}.`,
    isDemo: true,
  });

  res.status(201).json({
    message: "Purchase order issued to supplier successfully.",
    purchaseOrder: newPO,
  });
});

/**
 * POST /api/v1/trade/procurement/orders/:id/receive - Goods Received Note (GRN)
 */
router.post("/trade/procurement/orders/:id/receive", async (req: Request, res: Response) => {
  const membership = await ensureMembership(req, res);
  if (!membership) return;

  const poId = req.params.id;
  const po = DEMO_TRADE_PURCHASE_ORDERS.find((p) => p.id === poId || p.poNumber === poId);
  if (!po) {
    res.status(404).json({ error: "Purchase order not found." });
    return;
  }

  const { items } = req.body ?? {};
  // If specific items passed, update them; otherwise receive full order
  if (Array.isArray(items)) {
    for (const recItem of items) {
      const line = po.items.find((i) => i.materialId === recItem.materialId);
      if (line) {
        line.quantityReceived = Math.min(line.quantityOrdered, (line.quantityReceived || 0) + recItem.quantityReceived);
        const mat = DEMO_TRADE_RAW_MATERIALS.find((m) => m.id === line.materialId);
        if (mat) {
          mat.stockOnHand += recItem.quantityReceived;
          if (mat.stockOnHand >= mat.reorderLevel) mat.status = "in_stock";
        }
      }
    }
  } else {
    for (const line of po.items) {
      const remaining = line.quantityOrdered - line.quantityReceived;
      line.quantityReceived = line.quantityOrdered;
      const mat = DEMO_TRADE_RAW_MATERIALS.find((m) => m.id === line.materialId);
      if (mat) {
        mat.stockOnHand += remaining;
        if (mat.stockOnHand >= mat.reorderLevel) mat.status = "in_stock";
      }
    }
  }

  const allReceived = po.items.every((i) => i.quantityReceived >= i.quantityOrdered);
  po.status = allReceived ? "received" : "partially_received";

  await recordAuditEvent({
    organizationId: membership.organizationId,
    actorUserId: membership.userId,
    actor: membership.role,
    action: "TRADE_GOODS_RECEIVED",
    targetType: "trade_purchase_order",
    targetId: po.poNumber,
    summary: `Goods received against PO ${po.poNumber}. Status: ${po.status}. Raw material stock updated.`,
    isDemo: true,
  });

  res.json({
    message: "Goods received and raw material stock updated.",
    purchaseOrder: po,
  });
});

export default router;
