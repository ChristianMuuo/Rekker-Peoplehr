import { sql } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { organizationsTable } from "./peopleos";

export const productCategoriesTable = pgTable(
  "product_categories",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizationsTable.id, { onDelete: "cascade" }),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    brandKey: text("brand_key").notNull(),
    description: text("description").notNull().default(""),
    imageUrl: text("image_url"),
    sortOrder: integer("sort_order").notNull().default(0),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("product_categories_org_idx").on(table.organizationId, table.slug),
  ],
);

export const productsTable = pgTable(
  "products",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizationsTable.id, { onDelete: "cascade" }),
    categoryId: uuid("category_id").references(() => productCategoriesTable.id, {
      onDelete: "set null",
    }),
    sku: text("sku").notNull(),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    brandSlug: text("brand_slug").notNull(),
    brandName: text("brand_name").notNull(),
    shortDescription: text("short_description").notNull(),
    description: text("description").notNull(),
    specificationsJson: text("specifications_json").notNull().default("[]"),
    packagingInfo: text("packaging_info").notNull().default(""),
    variantsJson: text("variants_json").notNull().default("[]"),
    imageUrlsJson: text("image_urls_json").notNull().default("[]"),
    documentUrlsJson: text("document_urls_json").notNull().default("[]"),
    moqUnits: integer("moq_units").notNull().default(12),
    tradePriceKes: integer("trade_price_kes"),
    seoTitle: text("seo_title"),
    seoDescription: text("seo_description"),
    isFeatured: boolean("is_featured").notNull().default(false),
    status: text("status").notNull().default("published"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("products_org_status_idx").on(
      table.organizationId,
      table.status,
      table.brandSlug,
    ),
  ],
);

export const crmLeadsTable = pgTable(
  "crm_leads",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizationsTable.id, { onDelete: "cascade" }),
    referenceCode: text("reference_code").notNull(),
    source: text("source").notNull(),
    stage: text("stage").notNull().default("new_lead"),
    customerName: text("customer_name").notNull(),
    companyName: text("company_name"),
    email: text("email").notNull(),
    phone: text("phone"),
    interestCategory: text("interest_category").notNull().default("General Trade"),
    priority: text("priority").notNull().default("medium"),
    assignedEmployeeId: uuid("assigned_employee_id"),
    followUpDate: text("follow_up_date"),
    estimatedValueKes: integer("estimated_value_kes").notNull().default(0),
    notes: text("notes").notNull().default(""),
    communicationHistoryJson: text("communication_history_json")
      .notNull()
      .default("[]"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("crm_leads_org_stage_idx").on(table.organizationId, table.stage),
  ],
);

export const quotationsTable = pgTable(
  "quotations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizationsTable.id, { onDelete: "cascade" }),
    referenceCode: text("reference_code").notNull(),
    leadId: uuid("lead_id"),
    customerUserId: text("customer_user_id"),
    customerName: text("customer_name").notNull(),
    companyName: text("company_name"),
    email: text("email").notNull(),
    phone: text("phone"),
    productId: text("product_id"),
    productName: text("product_name").notNull(),
    requestedQuantity: integer("requested_quantity").notNull(),
    packagingPreference: text("packaging_preference"),
    deliveryLocation: text("delivery_location").notNull(),
    requirements: text("requirements").notNull().default(""),
    quotedTotalKes: integer("quoted_total_kes"),
    status: text("status").notNull().default("submitted"),
    reviewedByUserId: text("reviewed_by_user_id"),
    reviewComment: text("review_comment"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("quotations_org_customer_idx").on(
      table.organizationId,
      table.customerUserId,
    ),
  ],
);

export const distributorApplicationsTable = pgTable(
  "distributor_applications",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizationsTable.id, { onDelete: "cascade" }),
    referenceCode: text("reference_code").notNull(),
    applicantUserId: text("applicant_user_id"),
    businessName: text("business_name").notNull(),
    registrationNumber: text("registration_number"),
    taxPin: text("tax_pin"),
    contactName: text("contact_name").notNull(),
    email: text("email").notNull(),
    phone: text("phone").notNull(),
    businessType: text("business_type").notNull(),
    distributionArea: text("distribution_area").notNull(),
    outletsServed: integer("outlets_served"),
    yearsExperience: integer("years_experience"),
    productInterestsJson: text("product_interests_json").notNull().default("[]"),
    supportingDocsJson: text("supporting_docs_json").notNull().default("[]"),
    status: text("status").notNull().default("submitted"),
    reviewerUserId: text("reviewer_user_id"),
    reviewerNotes: text("reviewer_notes"),
    rejectionReason: text("rejection_reason"),
    tierName: text("tier_name").notNull().default("Standard Trade"),
    creditLimitKes: integer("credit_limit_kes").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("dist_apps_org_status_idx").on(table.organizationId, table.status),
  ],
);

export const wholesaleOrdersTable = pgTable(
  "wholesale_orders",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizationsTable.id, { onDelete: "cascade" }),
    orderNumber: text("order_number").notNull(),
    distributorUserId: text("distributor_user_id").notNull(),
    distributorName: text("distributor_name").notNull(),
    itemsJson: text("items_json").notNull().default("[]"),
    totalUnits: integer("total_units").notNull().default(0),
    totalAmountKes: integer("total_amount_kes").notNull().default(0),
    paymentMethod: text("payment_method").notNull().default("mpesa_b2b"),
    deliveryCounty: text("delivery_county").notNull(),
    deliveryNotes: text("delivery_notes"),
    status: text("status").notNull().default("draft"),
    approvedByUserId: text("approved_by_user_id"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("wholesale_orders_org_dist_idx").on(
      table.organizationId,
      table.distributorUserId,
    ),
  ],
);

export const customerTicketsTable = pgTable(
  "customer_tickets",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizationsTable.id, { onDelete: "cascade" }),
    ticketNumber: text("ticket_number").notNull(),
    customerUserId: text("customer_user_id").notNull(),
    customerName: text("customer_name").notNull(),
    subject: text("subject").notNull(),
    category: text("category").notNull().default("Order Support"),
    description: text("description").notNull(),
    priority: text("priority").notNull().default("medium"),
    status: text("status").notNull().default("open"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("customer_tickets_org_user_idx").on(
      table.organizationId,
      table.customerUserId,
    ),
  ],
);

export const ecosystemTableCountSql = sql`7`;
