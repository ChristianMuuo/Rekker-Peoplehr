-- Additive Enterprise Digital Ecosystem Migration (Phases 3, 4, 5, 6)
-- Zero breaking modifications to existing PeopleOS HRMS tables.

CREATE TABLE IF NOT EXISTS "product_categories" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" text NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "slug" text NOT NULL,
  "name" text NOT NULL,
  "brand_key" text NOT NULL,
  "description" text NOT NULL DEFAULT '',
  "image_url" text,
  "sort_order" integer NOT NULL DEFAULT 0,
  "is_active" boolean NOT NULL DEFAULT true,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "product_categories_org_idx" ON "product_categories" ("organization_id", "slug");

CREATE TABLE IF NOT EXISTS "products" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" text NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "category_id" uuid REFERENCES "product_categories"("id") ON DELETE SET NULL,
  "sku" text NOT NULL,
  "slug" text NOT NULL,
  "name" text NOT NULL,
  "brand_slug" text NOT NULL,
  "brand_name" text NOT NULL,
  "short_description" text NOT NULL,
  "description" text NOT NULL,
  "specifications_json" text NOT NULL DEFAULT '[]',
  "packaging_info" text NOT NULL DEFAULT '',
  "variants_json" text NOT NULL DEFAULT '[]',
  "image_urls_json" text NOT NULL DEFAULT '[]',
  "document_urls_json" text NOT NULL DEFAULT '[]',
  "moq_units" integer NOT NULL DEFAULT 12,
  "trade_price_kes" integer,
  "seo_title" text,
  "seo_description" text,
  "is_featured" boolean NOT NULL DEFAULT false,
  "status" text NOT NULL DEFAULT 'published',
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "products_org_status_idx" ON "products" ("organization_id", "status", "brand_slug");

CREATE TABLE IF NOT EXISTS "crm_leads" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" text NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "reference_code" text NOT NULL,
  "source" text NOT NULL,
  "stage" text NOT NULL DEFAULT 'new_lead',
  "customer_name" text NOT NULL,
  "company_name" text,
  "email" text NOT NULL,
  "phone" text,
  "interest_category" text NOT NULL DEFAULT 'General Trade',
  "priority" text NOT NULL DEFAULT 'medium',
  "assigned_employee_id" uuid,
  "follow_up_date" text,
  "estimated_value_kes" integer NOT NULL DEFAULT 0,
  "notes" text NOT NULL DEFAULT '',
  "communication_history_json" text NOT NULL DEFAULT '[]',
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "crm_leads_org_stage_idx" ON "crm_leads" ("organization_id", "stage");

CREATE TABLE IF NOT EXISTS "quotations" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" text NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "reference_code" text NOT NULL,
  "lead_id" uuid,
  "customer_user_id" text,
  "customer_name" text NOT NULL,
  "company_name" text,
  "email" text NOT NULL,
  "phone" text,
  "product_id" text,
  "product_name" text NOT NULL,
  "requested_quantity" integer NOT NULL,
  "packaging_preference" text,
  "delivery_location" text NOT NULL,
  "requirements" text NOT NULL DEFAULT '',
  "quoted_total_kes" integer,
  "status" text NOT NULL DEFAULT 'submitted',
  "reviewed_by_user_id" text,
  "review_comment" text,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "quotations_org_customer_idx" ON "quotations" ("organization_id", "customer_user_id");

CREATE TABLE IF NOT EXISTS "distributor_applications" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" text NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "reference_code" text NOT NULL,
  "applicant_user_id" text,
  "business_name" text NOT NULL,
  "registration_number" text,
  "tax_pin" text,
  "contact_name" text NOT NULL,
  "email" text NOT NULL,
  "phone" text NOT NULL,
  "business_type" text NOT NULL,
  "distribution_area" text NOT NULL,
  "outlets_served" integer,
  "years_experience" integer,
  "product_interests_json" text NOT NULL DEFAULT '[]',
  "supporting_docs_json" text NOT NULL DEFAULT '[]',
  "status" text NOT NULL DEFAULT 'submitted',
  "reviewer_user_id" text,
  "reviewer_notes" text,
  "rejection_reason" text,
  "tier_name" text NOT NULL DEFAULT 'Standard Trade',
  "credit_limit_kes" integer NOT NULL DEFAULT 0,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "dist_apps_org_status_idx" ON "distributor_applications" ("organization_id", "status");

CREATE TABLE IF NOT EXISTS "wholesale_orders" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" text NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "order_number" text NOT NULL,
  "distributor_user_id" text NOT NULL,
  "distributor_name" text NOT NULL,
  "items_json" text NOT NULL DEFAULT '[]',
  "total_units" integer NOT NULL DEFAULT 0,
  "total_amount_kes" integer NOT NULL DEFAULT 0,
  "payment_method" text NOT NULL DEFAULT 'mpesa_b2c',
  "delivery_county" text NOT NULL,
  "delivery_notes" text,
  "status" text NOT NULL DEFAULT 'draft',
  "approved_by_user_id" text,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "wholesale_orders_org_dist_idx" ON "wholesale_orders" ("organization_id", "distributor_user_id");

CREATE TABLE IF NOT EXISTS "customer_tickets" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" text NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "ticket_number" text NOT NULL,
  "customer_user_id" text NOT NULL,
  "customer_name" text NOT NULL,
  "subject" text NOT NULL,
  "category" text NOT NULL DEFAULT 'Order Support',
  "description" text NOT NULL,
  "priority" text NOT NULL DEFAULT 'medium',
  "status" text NOT NULL DEFAULT 'open',
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "customer_tickets_org_user_idx" ON "customer_tickets" ("organization_id", "customer_user_id");
