import { sql } from "drizzle-orm";
import {
  boolean,
  date,
  integer,
  pgTable,
  text,
  timestamp,
  uuid,
  index,
} from "drizzle-orm/pg-core";

// ─── 1. B2B Business Customers & Onboarding ──────────────────────────────────

export const tradeBusinessesTable = pgTable(
  "trade_businesses",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    legalName: text("legal_name").notNull(),
    tradingName: text("trading_name").notNull(),
    businessType: text("business_type").notNull().default("retailer"), // retailer | wholesaler | distributor | strategic
    registrationNumber: text("registration_number").notNull().unique(),
    kraPin: text("kra_pin").notNull(),
    taxComplianceValid: boolean("tax_compliance_valid").notNull().default(true),
    status: text("status").notNull().default("under_review"), // draft | submitted | under_review | approved | rejected | suspended
    primaryContactName: text("primary_contact_name").notNull(),
    primaryEmail: text("primary_email").notNull(),
    primaryPhone: text("primary_phone").notNull(),
    physicalLocation: text("physical_location").notNull().default("Nairobi"),
    creditLimit: integer("credit_limit").notNull().default(0), // in integer cents (e.g. KES 500,000 = 50,000,000)
    creditTerms: text("credit_terms").notNull().default("cash"), // cash | net_7 | net_14 | net_30 | net_60
    assignedSalesRepId: text("assigned_sales_rep_id"),
    tierDiscountPct: integer("tier_discount_pct").notNull().default(0), // percentage discount based on tier
    internalRiskScore: text("internal_risk_score").default("low"), // low | medium | high
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index("trade_biz_type_idx").on(table.businessType),
    index("trade_biz_status_idx").on(table.status),
  ],
);

export const tradeBranchesTable = pgTable(
  "trade_branches",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    businessId: uuid("business_id")
      .notNull()
      .references(() => tradeBusinessesTable.id, { onDelete: "cascade" }),
    branchName: text("branch_name").notNull(),
    code: text("code").notNull(),
    physicalAddress: text("physical_address").notNull(),
    county: text("county").notNull().default("Nairobi"),
    deliveryInstructions: text("delivery_instructions"),
    contactPerson: text("contact_person").notNull(),
    contactPhone: text("contact_phone").notNull(),
    purchasingLimitPerOrder: integer("purchasing_limit_per_order").default(0),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index("trade_branch_biz_idx").on(table.businessId),
  ],
);

// ─── 2. Product Catalogue & Packaging Conversions ────────────────────────────

export const tradeProductsTable = pgTable(
  "trade_products",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sku: text("sku").notNull().unique(),
    barcode: text("barcode"),
    name: text("name").notNull(),
    brand: text("brand").notNull(), // Saffron Milan | Bio Saff | Cornells | PetCare
    category: text("category").notNull(),
    description: text("description").notNull(),
    packagingUnit: text("packaging_unit").notNull().default("carton"), // piece | pack | carton | case
    unitsPerCarton: integer("units_per_carton").notNull().default(24),
    packsPerCarton: integer("packs_per_carton").notNull().default(4),
    basePricePerCarton: integer("base_price_per_carton").notNull(), // in integer cents (e.g. KES 4,800 = 480,000 cents)
    unitCostPrice: integer("unit_cost_price").notNull(), // internal floor price in cents
    minOrderQuantityCartons: integer("min_order_quantity_cartons").notNull().default(1),
    stockOnHandCartons: integer("stock_on_hand_cartons").notNull().default(0),
    allocatedStockCartons: integer("allocated_stock_cartons").notNull().default(0),
    reorderThresholdCartons: integer("reorder_threshold_cartons").notNull().default(20),
    imageUrl: text("image_url"),
    status: text("status").notNull().default("active"), // active | low_stock | out_of_stock | discontinued
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index("trade_prod_brand_idx").on(table.brand),
    index("trade_prod_cat_idx").on(table.category),
    index("trade_prod_sku_idx").on(table.sku),
  ],
);

export const tradePriceTiersTable = pgTable(
  "trade_price_tiers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    productId: uuid("product_id")
      .notNull()
      .references(() => tradeProductsTable.id, { onDelete: "cascade" }),
    customerCategory: text("customer_category").notNull(), // all | retailer | wholesaler | distributor
    minQuantityCartons: integer("min_quantity_cartons").notNull(), // e.g. 10, 50, 100
    unitPriceCents: integer("unit_price_cents").notNull(),
    discountPercentage: integer("discount_percentage").notNull().default(0),
    validFrom: date("valid_from", { mode: "string" }),
    validTo: date("valid_to", { mode: "string" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("trade_price_prod_idx").on(table.productId),
    index("trade_price_cat_idx").on(table.customerCategory),
  ],
);

// ─── 3. Orders, Cart & Quotations ────────────────────────────────────────────

export const tradeOrdersTable = pgTable(
  "trade_orders",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderNumber: text("order_number").notNull().unique(),
    businessId: uuid("business_id")
      .notNull()
      .references(() => tradeBusinessesTable.id, { onDelete: "restrict" }),
    branchId: uuid("branch_id").references(() => tradeBranchesTable.id),
    placedByUserId: text("placed_by_user_id").notNull(),
    poReference: text("po_reference"),
    status: text("status").notNull().default("submitted"), // draft | submitted | approved | processing | picking | packed | dispatched | in_transit | delivered | completed | cancelled
    subtotalCents: integer("subtotal_cents").notNull(),
    discountCents: integer("discount_cents").notNull().default(0),
    taxCents: integer("tax_cents").notNull().default(0), // 16% VAT
    totalCents: integer("total_cents").notNull(),
    paymentStatus: text("payment_status").notNull().default("pending"), // pending | partial | paid | credit_extended
    paymentTerms: text("payment_terms").notNull().default("cash"),
    deliveryNotes: text("delivery_notes"),
    approvedByUserId: text("approved_by_user_id"),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index("trade_order_biz_idx").on(table.businessId),
    index("trade_order_status_idx").on(table.status),
  ],
);

export const tradeOrderItemsTable = pgTable(
  "trade_order_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => tradeOrdersTable.id, { onDelete: "cascade" }),
    productId: uuid("product_id")
      .notNull()
      .references(() => tradeProductsTable.id, { onDelete: "restrict" }),
    sku: text("sku").notNull(),
    productName: text("product_name").notNull(),
    packagingUnit: text("packaging_unit").notNull().default("carton"),
    quantity: integer("quantity").notNull(),
    unitPriceCents: integer("unit_price_cents").notNull(),
    subtotalCents: integer("subtotal_cents").notNull(),
    discountCents: integer("discount_cents").notNull().default(0),
    totalCents: integer("total_cents").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("trade_item_order_idx").on(table.orderId),
    index("trade_item_prod_idx").on(table.productId),
  ],
);

export const tradeQuotationsTable = pgTable(
  "trade_quotations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    quotationNumber: text("quotation_number").notNull().unique(),
    businessId: uuid("business_id")
      .notNull()
      .references(() => tradeBusinessesTable.id, { onDelete: "restrict" }),
    requestedByUserId: text("requested_by_user_id").notNull(),
    assignedSalesRepUserId: text("assigned_sales_rep_user_id"),
    status: text("status").notNull().default("issued"), // draft | issued | negotiating | accepted | rejected | expired | converted
    subtotalCents: integer("subtotal_cents").notNull(),
    discountCents: integer("discount_cents").notNull().default(0),
    totalCents: integer("total_cents").notNull(),
    validUntil: date("valid_until", { mode: "string" }).notNull(),
    customerNotes: text("customer_notes"),
    internalMarginPct: integer("internal_margin_pct"),
    convertedToOrderId: uuid("converted_to_order_id"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index("trade_quote_biz_idx").on(table.businessId),
    index("trade_quote_status_idx").on(table.status),
  ],
);

// ─── 4. Invoicing, Payments & Fulfilment ──────────────────────────────────────

export const tradeInvoicesTable = pgTable(
  "trade_invoices",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    invoiceNumber: text("invoice_number").notNull().unique(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => tradeOrdersTable.id, { onDelete: "restrict" }),
    businessId: uuid("business_id")
      .notNull()
      .references(() => tradeBusinessesTable.id, { onDelete: "restrict" }),
    totalCents: integer("total_cents").notNull(),
    paidCents: integer("paid_cents").notNull().default(0),
    balanceDueCents: integer("balance_due_cents").notNull(),
    status: text("status").notNull().default("issued"), // draft | issued | partial | paid | overdue
    dueDate: date("due_date", { mode: "string" }).notNull(),
    etimsControlCode: text("etims_control_code"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index("trade_inv_order_idx").on(table.orderId),
    index("trade_inv_biz_idx").on(table.businessId),
    index("trade_inv_status_idx").on(table.status),
  ],
);

export const tradePaymentsTable = pgTable(
  "trade_payments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    receiptNumber: text("receipt_number").notNull().unique(),
    invoiceId: uuid("invoice_id").references(() => tradeInvoicesTable.id),
    businessId: uuid("business_id")
      .notNull()
      .references(() => tradeBusinessesTable.id, { onDelete: "restrict" }),
    amountCents: integer("amount_cents").notNull(),
    paymentMethod: text("payment_method").notNull(), // mpesa | bank_transfer | cheque | credit_adjustment
    transactionReference: text("transaction_reference").notNull(),
    status: text("status").notNull().default("verified"), // pending | verified | reconciled | failed
    verifiedByUserId: text("verified_by_user_id"),
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("trade_pay_inv_idx").on(table.invoiceId),
    index("trade_pay_biz_idx").on(table.businessId),
  ],
);

export const tradeShipmentsTable = pgTable(
  "trade_shipments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    shipmentNumber: text("shipment_number").notNull().unique(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => tradeOrdersTable.id, { onDelete: "restrict" }),
    warehouseLocation: text("warehouse_location").notNull().default("Nairobi Central Distribution Hub"),
    status: text("status").notNull().default("picking"), // picking | packed | dispatched | in_transit | delivered
    assignedDriverName: text("assigned_driver_name"),
    vehicleRegistration: text("vehicle_registration"),
    dispatchedAt: timestamp("dispatched_at", { withTimezone: true }),
    deliveredAt: timestamp("delivered_at", { withTimezone: true }),
    recipientName: text("recipient_name"),
    recipientSignatureConfirmed: boolean("recipient_signature_confirmed").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index("trade_ship_order_idx").on(table.orderId),
    index("trade_ship_status_idx").on(table.status),
  ],
);

// ─── 5. Warehouses & Multi-Site Inventory Allocation ─────────────────────────

export const tradeWarehousesTable = pgTable(
  "trade_warehouses",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    code: text("code").notNull().unique(), // e.g. WH-NBO-01, WH-MSA-01, WH-KSM-01, WH-NKR-01
    name: text("name").notNull(),
    county: text("county").notNull(),
    physicalAddress: text("physical_address").notNull(),
    capacityCartons: integer("capacity_cartons").notNull().default(10000),
    managerName: text("manager_name").notNull(),
    contactPhone: text("contact_phone").notNull(),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index("trade_wh_code_idx").on(table.code),
    index("trade_wh_county_idx").on(table.county),
  ],
);

export const tradeWarehouseStockTable = pgTable(
  "trade_warehouse_stock",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    warehouseId: uuid("warehouse_id")
      .notNull()
      .references(() => tradeWarehousesTable.id, { onDelete: "cascade" }),
    productId: uuid("product_id")
      .notNull()
      .references(() => tradeProductsTable.id, { onDelete: "cascade" }),
    stockOnHandCartons: integer("stock_on_hand_cartons").notNull().default(0),
    allocatedStockCartons: integer("allocated_stock_cartons").notNull().default(0),
    reorderThresholdCartons: integer("reorder_threshold_cartons").notNull().default(20),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index("trade_wh_stock_wh_idx").on(table.warehouseId),
    index("trade_wh_stock_prod_idx").on(table.productId),
  ],
);

// ─── 6. Raw Materials & Supplier Procurement Desk ────────────────────────────

export const tradeSuppliersTable = pgTable(
  "trade_suppliers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    code: text("code").notNull().unique(), // e.g. SUP-GLS-01, SUP-PLAS-01
    name: text("name").notNull(),
    category: text("category").notNull(), // packaging_glass | packaging_plastic | packaging_corrugated | raw_botanicals_oils | chemicals_surfactants
    kraPin: text("kra_pin").notNull(),
    primaryContact: text("primary_contact").notNull(),
    phone: text("phone").notNull(),
    email: text("email").notNull(),
    physicalLocation: text("physical_location").notNull(),
    paymentTerms: text("payment_terms").notNull().default("net_30"),
    status: text("status").notNull().default("approved"), // approved | review | suspended
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index("trade_sup_cat_idx").on(table.category),
    index("trade_sup_code_idx").on(table.code),
  ],
);

export const tradeRawMaterialsTable = pgTable(
  "trade_raw_materials",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    code: text("code").notNull().unique(), // e.g. RM-GLS-100ML, RM-CAP-PUMP, RM-OIL-TEATREE
    name: text("name").notNull(),
    category: text("category").notNull(), // bottles | caps_pumps | essential_oils | active_ingredients | cartons_boxes
    unitOfMeasure: text("unit_of_measure").notNull().default("piece"), // piece | kg | litre | bundle
    stockOnHand: integer("stock_on_hand").notNull().default(0),
    reorderLevel: integer("reorder_level").notNull().default(1000),
    unitCostCents: integer("unit_cost_cents").notNull().default(0),
    preferredSupplierId: uuid("preferred_supplier_id").references(() => tradeSuppliersTable.id),
    compatibleBrand: text("compatible_brand"), // Saffron Milan | Bio Saff | Cornells | PetCare | All
    status: text("status").notNull().default("in_stock"), // in_stock | low_stock | critical
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index("trade_rm_cat_idx").on(table.category),
    index("trade_rm_code_idx").on(table.code),
  ],
);

export const tradePurchaseOrdersTable = pgTable(
  "trade_purchase_orders",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    poNumber: text("po_number").notNull().unique(), // e.g. PO-SUP-2026-0012
    supplierId: uuid("supplier_id")
      .notNull()
      .references(() => tradeSuppliersTable.id, { onDelete: "restrict" }),
    warehouseId: uuid("warehouse_id").references(() => tradeWarehousesTable.id),
    status: text("status").notNull().default("draft"), // draft | issued | partially_received | received | cancelled
    totalCents: integer("total_cents").notNull(),
    currency: text("currency").notNull().default("KES"),
    expectedDeliveryDate: date("expected_delivery_date", { mode: "string" }).notNull(),
    deliveryNotes: text("delivery_notes"),
    approvedByUserId: text("approved_by_user_id"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index("trade_po_sup_idx").on(table.supplierId),
    index("trade_po_status_idx").on(table.status),
  ],
);

export const tradePurchaseOrderItemsTable = pgTable(
  "trade_purchase_order_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    purchaseOrderId: uuid("purchase_order_id")
      .notNull()
      .references(() => tradePurchaseOrdersTable.id, { onDelete: "cascade" }),
    rawMaterialId: uuid("raw_material_id")
      .notNull()
      .references(() => tradeRawMaterialsTable.id, { onDelete: "restrict" }),
    quantityOrdered: integer("quantity_ordered").notNull(),
    quantityReceived: integer("quantity_received").notNull().default(0),
    unitPriceCents: integer("unit_price_cents").notNull(),
    totalCents: integer("total_cents").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("trade_poi_order_idx").on(table.purchaseOrderId),
    index("trade_poi_rm_idx").on(table.rawMaterialId),
  ],
);

// Type inference exports
export type TradeBusinessRecord = typeof tradeBusinessesTable.$inferSelect;
export type TradeBranchRecord = typeof tradeBranchesTable.$inferSelect;
export type TradeProductRecord = typeof tradeProductsTable.$inferSelect;
export type TradePriceTierRecord = typeof tradePriceTiersTable.$inferSelect;
export type TradeOrderRecord = typeof tradeOrdersTable.$inferSelect;
export type TradeOrderItemRecord = typeof tradeOrderItemsTable.$inferSelect;
export type TradeQuotationRecord = typeof tradeQuotationsTable.$inferSelect;
export type TradeInvoiceRecord = typeof tradeInvoicesTable.$inferSelect;
export type TradePaymentRecord = typeof tradePaymentsTable.$inferSelect;
export type TradeShipmentRecord = typeof tradeShipmentsTable.$inferSelect;
export type TradeWarehouseRecord = typeof tradeWarehousesTable.$inferSelect;
export type TradeWarehouseStockRecord = typeof tradeWarehouseStockTable.$inferSelect;
export type TradeSupplierRecord = typeof tradeSuppliersTable.$inferSelect;
export type TradeRawMaterialRecord = typeof tradeRawMaterialsTable.$inferSelect;
export type TradePurchaseOrderRecord = typeof tradePurchaseOrdersTable.$inferSelect;
export type TradePurchaseOrderItemRecord = typeof tradePurchaseOrderItemsTable.$inferSelect;
