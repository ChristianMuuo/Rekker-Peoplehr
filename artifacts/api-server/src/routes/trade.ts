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

export default router;
