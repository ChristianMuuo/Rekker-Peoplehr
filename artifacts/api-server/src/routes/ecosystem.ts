import crypto from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import { Router, type IRouter, type Request, type Response } from "express";
import {
  crmLeadsTable,
  customerTicketsTable,
  db,
  distributorApplicationsTable,
  productCategoriesTable,
  productsTable,
  quotationsTable,
  wholesaleOrdersTable,
} from "@workspace/db";
import { recordAuditEvent } from "../lib/auditService";
import { sanitizeText } from "../lib/security";
import {
  ensureMembership,
  MODULE_PERMISSION_MATRIX,
  PEOPLEOS_ORGANIZATION_ID,
  PEOPLEOS_ROLES,
  requireRoles,
} from "../middlewares/peopleosAccess";
import { getPublicJobPostings } from "./recruitment";

const router: IRouter = Router();

const erpSalesAndAdminRoles = [
  PEOPLEOS_ROLES.hrAdmin,
  PEOPLEOS_ROLES.systemAdmin,
  PEOPLEOS_ROLES.salesManager,
  PEOPLEOS_ROLES.salesRep,
];
const crmReadRoles = [
  ...erpSalesAndAdminRoles,
  PEOPLEOS_ROLES.executive,
];
const catalogWriteRoles = [
  PEOPLEOS_ROLES.hrAdmin,
  PEOPLEOS_ROLES.systemAdmin,
  PEOPLEOS_ROLES.salesManager,
];
const distributorPortalRoles = [
  PEOPLEOS_ROLES.distributor,
  ...erpSalesAndAdminRoles,
];

const CRM_STAGES = [
  "new_lead",
  "contacted",
  "qualified",
  "quotation_requested",
  "quotation_sent",
  "negotiation",
  "won",
  "lost",
] as const;

export const VERIFIED_BRANDS = [
  {
    slug: "saffron-milan",
    name: "Saffron Milan",
    category: "Home & Cleaning",
    origin: "Rekker In-House Brand",
    tagline: "Detergents, cleaning and household care built for real Kenyan homes.",
    description:
      "Saffron Milan is Rekker's home and household care brand. From laundry to dishwashing to surface care, every formulation is developed for hard water, heavy use and value-conscious households — then manufactured and quality-tested locally.",
    highlights: [
      "Laundry detergents and fabric care",
      "Dishwashing and kitchen cleaning",
      "Household surface and floor care",
      "Bulk and retail pack sizes",
    ],
    image: "https://rekker.co.ke/images/brand-saffron.jpg",
    defaultMoqUnits: 12,
  },
  {
    slug: "bio-saff",
    name: "Bio Saff",
    category: "Beauty & Personal Care",
    origin: "Rekker In-House Brand",
    tagline: "Hair and body care formulated for African hair and skin.",
    description:
      "Bio Saff is Rekker's beauty and personal care brand — braid sprays, edge control, shampoos, body care and more. Built around real routines, honest ingredients and accessible salon and retail formats.",
    highlights: [
      "Hair care and braid maintenance",
      "Edge control and styling",
      "Body and skin care",
      "Salon and retail formats",
    ],
    image: "https://rekker.co.ke/images/brand-biosaff.jpg",
    defaultMoqUnits: 12,
  },
  {
    slug: "cornells",
    name: "Cornells",
    category: "Fragrance & Beauty",
    origin: "Starling Parfums (Distributed by Rekker)",
    tagline: "Fragrance by Starling Parfums, distributed nationwide by Rekker.",
    description:
      "Cornells brings international fragrance craft to the Kenyan market. Rekker distributes the range nationwide from modern retail to independent stockists, with direct consumer shopping on shop.rekker.co.ke.",
    highlights: [
      "Signature fragrance collections",
      "Gifting and seasonal sets",
      "Retail and wholesale supply",
      "Nationwide availability",
    ],
    image: "https://rekker.co.ke/images/brand-cornells.jpg",
    defaultMoqUnits: 12,
  },
  {
    slug: "petcare",
    name: "PetCare",
    category: "Pet Care",
    origin: "Rekker In-House Brand",
    tagline: "Little Paws, Lots of Love. Premium pet shampoo for dogs, cats and horses.",
    description:
      "PetCare is Rekker's pet-care line dedicated to making everyday pet care safer, gentler and more enjoyable — launched with a gentle pet shampoo developed after months of research and quality testing.",
    highlights: [
      "Gentle pet shampoo for dogs, cats and horses",
      "Developed with pet safety and well-being in mind",
      "Quality-led formulation development",
      "Available across modern & specialist retail",
    ],
    image: "https://rekker.co.ke/images/petcare-banner.jpg",
    defaultMoqUnits: 12,
  },
];

// In-memory store strictly active only when DATABASE_URL is absent (local dev / test sandbox)
interface CategoryRec {
  id: string;
  organizationId: string;
  slug: string;
  name: string;
  brandKey: string;
  description: string;
  imageUrl: string | null;
  sortOrder: number;
  isActive: boolean;
}

interface ProductRec {
  id: string;
  organizationId: string;
  categoryId: string | null;
  sku: string;
  slug: string;
  name: string;
  brandSlug: string;
  brandName: string;
  shortDescription: string;
  description: string;
  specifications: Array<{ label: string; value: string }>;
  packagingInfo: string;
  variants: string[];
  imageUrls: string[];
  documentUrls: Array<{ name: string; url: string }>;
  moqUnits: number;
  tradePriceKes: number | null;
  seoTitle: string | null;
  seoDescription: string | null;
  isFeatured: boolean;
  status: "draft" | "published" | "archived";
}

interface CrmLeadRec {
  id: string;
  organizationId: string;
  referenceCode: string;
  source: string;
  stage: string;
  customerName: string;
  companyName: string | null;
  email: string;
  phone: string | null;
  interestCategory: string;
  priority: "low" | "medium" | "high";
  assignedEmployeeId: string | null;
  followUpDate: string | null;
  estimatedValueKes: number;
  notes: string;
  communicationHistory: Array<{ timestamp: string; actor: string; note: string }>;
  createdAt: string;
  updatedAt: string;
}

interface QuotationRec {
  id: string;
  organizationId: string;
  referenceCode: string;
  leadId: string | null;
  customerUserId: string | null;
  customerName: string;
  companyName: string | null;
  email: string;
  phone: string | null;
  productId: string | null;
  productName: string;
  requestedQuantity: number;
  packagingPreference: string | null;
  deliveryLocation: string;
  requirements: string;
  quotedTotalKes: number | null;
  status: "submitted" | "under_review" | "approved_quoted" | "accepted" | "rejected";
  reviewedByUserId: string | null;
  reviewComment: string | null;
  createdAt: string;
  updatedAt: string;
}

interface DistributorAppRec {
  id: string;
  organizationId: string;
  referenceCode: string;
  applicantUserId: string | null;
  businessName: string;
  registrationNumber: string | null;
  taxPin: string | null;
  contactName: string;
  email: string;
  phone: string;
  businessType: string;
  distributionArea: string;
  outletsServed: number | null;
  yearsExperience: number | null;
  productInterests: string[];
  supportingDocs: string[];
  status: "draft" | "submitted" | "under_review" | "info_requested" | "approved" | "rejected" | "suspended";
  reviewerUserId: string | null;
  reviewerNotes: string | null;
  rejectionReason: string | null;
  tierName: string;
  creditLimitKes: number;
  createdAt: string;
  updatedAt: string;
}

interface WholesaleOrderRec {
  id: string;
  organizationId: string;
  orderNumber: string;
  distributorUserId: string;
  distributorName: string;
  items: Array<{ productId: string; sku: string; productName: string; quantity: number; unitPriceKes: number; lineTotalKes: number }>;
  totalUnits: number;
  totalAmountKes: number;
  paymentMethod: string;
  deliveryCounty: string;
  deliveryNotes: string | null;
  status: "draft" | "submitted" | "approved" | "dispatched" | "delivered" | "rejected";
  approvedByUserId: string | null;
  createdAt: string;
  updatedAt: string;
}

interface TicketRec {
  id: string;
  organizationId: string;
  ticketNumber: string;
  customerUserId: string;
  customerName: string;
  subject: string;
  category: string;
  description: string;
  priority: string;
  status: "open" | "in_progress" | "resolved" | "closed";
  createdAt: string;
  updatedAt: string;
}

const DEFAULT_CATEGORIES: CategoryRec[] = [
  { id: "cat-home", organizationId: PEOPLEOS_ORGANIZATION_ID, slug: "home-cleaning", name: "Home & Cleaning Care", brandKey: "saffron-milan", description: "Laundry detergents, dishwashing liquids, and household surface cleaners.", imageUrl: "https://rekker.co.ke/images/brand-saffron.jpg", sortOrder: 1, isActive: true },
  { id: "cat-beauty", organizationId: PEOPLEOS_ORGANIZATION_ID, slug: "beauty-personal-care", name: "Beauty & Personal Care", brandKey: "bio-saff", description: "Hair care, braid maintenance, edge control, shampoos, and skin care.", imageUrl: "https://rekker.co.ke/images/brand-biosaff.jpg", sortOrder: 2, isActive: true },
  { id: "cat-fragrance", organizationId: PEOPLEOS_ORGANIZATION_ID, slug: "fragrance", name: "Fine Fragrances & Gifting", brandKey: "cornells", description: "Cornells signature fragrance lines by Starling Parfums distributed across Kenya.", imageUrl: "https://rekker.co.ke/images/brand-cornells.jpg", sortOrder: 3, isActive: true },
  { id: "cat-petcare", organizationId: PEOPLEOS_ORGANIZATION_ID, slug: "pet-care", name: "Pet Care Essentials", brandKey: "petcare", description: "Gentle shampoos formulated for dogs, cats, and horses.", imageUrl: "https://rekker.co.ke/images/petcare-banner.jpg", sortOrder: 4, isActive: true },
];

const DEFAULT_PRODUCTS: ProductRec[] = [
  {
    id: "prod-saffron-laundry",
    organizationId: PEOPLEOS_ORGANIZATION_ID,
    categoryId: "cat-home",
    sku: "SM-HC-101",
    slug: "saffron-milan-laundry-care",
    name: "Saffron Milan Hard-Water Laundry Detergent Line",
    brandSlug: "saffron-milan",
    brandName: "Saffron Milan",
    shortDescription: "Formulated locally for hard water performance and everyday household laundry across Kenyan homes.",
    description: "Manufactured and quality-tested locally in Nairobi for general trade, supermarkets, and bulk household buyers.",
    specifications: [
      { label: "Water Compatibility", value: "Hard & soft Kenyan municipal water" },
      { label: "Channel Availability", value: "Retail, Wholesale & Trade Cartons" },
      { label: "Quality Control", value: "Batch-level check prior to release" },
    ],
    packagingInfo: "Bulk trade cartons and retail packs (confirm current pack sizes with Trade Desk)",
    variants: ["Retail Pack", "Wholesale Carton", "Bulk Hospitality Format"],
    imageUrls: ["https://rekker.co.ke/images/brand-saffron.jpg"],
    documentUrls: [],
    moqUnits: 12,
    tradePriceKes: 380,
    seoTitle: "Saffron Milan Laundry & Home Care | Rekker",
    seoDescription: "Hard-water compatible laundry detergents and home cleaning lines manufactured locally by Rekker Limited.",
    isFeatured: true,
    status: "published",
  },
  {
    id: "prod-saffron-surface",
    organizationId: PEOPLEOS_ORGANIZATION_ID,
    categoryId: "cat-home",
    sku: "SM-SC-102",
    slug: "saffron-milan-dishwashing-surface-care",
    name: "Saffron Milan Dishwashing & Kitchen Surface Care",
    brandSlug: "saffron-milan",
    brandName: "Saffron Milan",
    shortDescription: "High-grease-cutting dishwashing liquids and floor cleaners packaged for domestic and bulk trade.",
    description: "Everyday household cleaning line produced locally under controlled batch formulation standards.",
    specifications: [
      { label: "Application", value: "Dishwashing, kitchen surfaces & floors" },
      { label: "Trade Supply", value: "Minimum 12 units per mixed carton" },
    ],
    packagingInfo: "Retail bottles and bulk trade jerrycans",
    variants: ["Retail Format", "Institutional Bulk Format"],
    imageUrls: ["https://rekker.co.ke/images/brand-saffron.jpg"],
    documentUrls: [],
    moqUnits: 12,
    tradePriceKes: 320,
    seoTitle: "Saffron Milan Dishwashing & Surface Care | Rekker",
    seoDescription: "Locally formulated dishwashing and household surface care line distributed nationwide by Rekker.",
    isFeatured: false,
    status: "published",
  },
  {
    id: "prod-biosaff-hair",
    organizationId: PEOPLEOS_ORGANIZATION_ID,
    categoryId: "cat-beauty",
    sku: "BS-PC-201",
    slug: "bio-saff-braid-edge-care",
    name: "Bio Saff Braid Spray, Edge Control & Salon Hair Care",
    brandSlug: "bio-saff",
    brandName: "Bio Saff",
    shortDescription: "Hair care, braid maintenance, and edge styling formulated specifically for African hair and skin.",
    description: "Designed for daily consumers and professional beauty salons across Kenya's 47 counties.",
    specifications: [
      { label: "Focus", value: "African hair & skin routines" },
      { label: "Formats", value: "Salon backbar & consumer retail" },
    ],
    packagingInfo: "Retail shelf trays and salon supply packs",
    variants: ["Braid Spray", "Edge Control", "Conditioning Shampoo"],
    imageUrls: ["https://rekker.co.ke/images/brand-biosaff.jpg"],
    documentUrls: [],
    moqUnits: 12,
    tradePriceKes: 450,
    seoTitle: "Bio Saff Hair & Personal Care | Rekker",
    seoDescription: "Bio Saff braid maintenance, edge control and body care formulated for African hair and skin.",
    isFeatured: true,
    status: "published",
  },
  {
    id: "prod-cornells-fragrance",
    organizationId: PEOPLEOS_ORGANIZATION_ID,
    categoryId: "cat-fragrance",
    sku: "CN-FR-301",
    slug: "cornells-signature-fragrance-collection",
    name: "Cornells Signature Fragrance & Gift Collection",
    brandSlug: "cornells",
    brandName: "Cornells",
    shortDescription: "International fragrance collections by Starling Parfums distributed across Kenya by Rekker.",
    description: "Supplied to modern supermarkets, beauty stockists, and wholesale fragrance distributors nationwide.",
    specifications: [
      { label: "Principal", value: "Starling Parfums (Official Distribution)" },
      { label: "D2C Store", value: "Available online on shop.rekker.co.ke" },
    ],
    packagingInfo: "Signature bottles and seasonal gift sets",
    variants: ["Signature EDP Range", "Seasonal Gift Sets"],
    imageUrls: ["https://rekker.co.ke/images/brand-cornells.jpg"],
    documentUrls: [],
    moqUnits: 12,
    tradePriceKes: 950,
    seoTitle: "Cornells Fragrances Distributed by Rekker Kenya",
    seoDescription: "Authorized nationwide distribution of Cornells fragrance collections across Kenya.",
    isFeatured: true,
    status: "published",
  },
  {
    id: "prod-petcare-shampoo",
    organizationId: PEOPLEOS_ORGANIZATION_ID,
    categoryId: "cat-petcare",
    sku: "PC-AN-401",
    slug: "petcare-gentle-pet-shampoo",
    name: "PetCare Gentle Coat Shampoo (Dogs, Cats & Horses)",
    brandSlug: "petcare",
    brandName: "PetCare",
    shortDescription: "Gentle, safety-focused coat cleansing developed by Rekker's PetCare formulation team.",
    description: "Little Paws, Lots of Love — crafted for everyday pet safety, hygiene, and coat conditioning.",
    specifications: [
      { label: "Suitable For", value: "Dogs, cats, and horses" },
      { label: "Formulation", value: "Developed with pet safety & comfort priority" },
    ],
    packagingInfo: "Retail consumer bottles & veterinary/groomer trade cartons",
    variants: ["Retail Grooming Bottle", "Groomer Trade Pack"],
    imageUrls: ["https://rekker.co.ke/images/petcare-banner.jpg"],
    documentUrls: [],
    moqUnits: 12,
    tradePriceKes: 620,
    seoTitle: "PetCare Pet Shampoo | Rekker Limited",
    seoDescription: "PetCare gentle coat shampoo for dogs, cats and horses by Rekker.",
    isFeatured: true,
    status: "published",
  },
];

const MEM_CATEGORIES = new Map<string, CategoryRec[]>();
const MEM_PRODUCTS = new Map<string, ProductRec[]>();
const MEM_LEADS = new Map<string, CrmLeadRec[]>();
const MEM_QUOTES = new Map<string, QuotationRec[]>();
const MEM_DIST_APPS = new Map<string, DistributorAppRec[]>();
const MEM_WHOLESALE_ORDERS = new Map<string, WholesaleOrderRec[]>();
const MEM_TICKETS = new Map<string, TicketRec[]>();

function ensureOrgSeeded(orgId: string) {
  if (!MEM_CATEGORIES.has(orgId)) {
    MEM_CATEGORIES.set(
      orgId,
      DEFAULT_CATEGORIES.map((c) => ({ ...c, organizationId: orgId })),
    );
  }
  if (!MEM_PRODUCTS.has(orgId)) {
    MEM_PRODUCTS.set(
      orgId,
      DEFAULT_PRODUCTS.map((p) => ({ ...p, organizationId: orgId })),
    );
  }
  if (!MEM_LEADS.has(orgId)) MEM_LEADS.set(orgId, []);
  if (!MEM_QUOTES.has(orgId)) MEM_QUOTES.set(orgId, []);
  if (!MEM_DIST_APPS.has(orgId)) MEM_DIST_APPS.set(orgId, []);
  if (!MEM_WHOLESALE_ORDERS.has(orgId)) MEM_WHOLESALE_ORDERS.set(orgId, []);
  if (!MEM_TICKETS.has(orgId)) MEM_TICKETS.set(orgId, []);
}

function toPublicProductDto(p: ProductRec) {
  // Rule #10: Public catalog omits internal trade/cost pricing & ERP metadata
  return {
    id: p.id,
    sku: p.sku,
    slug: p.slug,
    name: p.name,
    brandSlug: p.brandSlug,
    brandName: p.brandName,
    shortDescription: p.shortDescription,
    description: p.description,
    specifications: p.specifications,
    packagingInfo: p.packagingInfo,
    variants: p.variants,
    imageUrls: p.imageUrls,
    moqUnits: p.moqUnits,
    seoTitle: p.seoTitle,
    seoDescription: p.seoDescription,
    isFeatured: p.isFeatured,
  };
}

function makeRef(prefix: string): string {
  const rand = crypto.randomBytes(2).toString("hex").toUpperCase();
  return `${prefix}-${new Date().getFullYear()}-${rand}`;
}

async function listProductsInternal(orgId: string): Promise<ProductRec[]> {
  if (!process.env.DATABASE_URL) {
    ensureOrgSeeded(orgId);
    return MEM_PRODUCTS.get(orgId)!;
  }
  const rows = await db
    .select()
    .from(productsTable)
    .where(eq(productsTable.organizationId, orgId))
    .orderBy(desc(productsTable.isFeatured), productsTable.name);

  if (rows.length === 0) {
    // Seed initial verified Rekker brand lines if database table is empty
    const cats = await db
      .select()
      .from(productCategoriesTable)
      .where(eq(productCategoriesTable.organizationId, orgId));
    const catByBrand = new Map<string, string>();
    if (cats.length === 0) {
      for (const c of DEFAULT_CATEGORIES) {
        const [ins] = await db
          .insert(productCategoriesTable)
          .values({
            organizationId: orgId,
            slug: c.slug,
            name: c.name,
            brandKey: c.brandKey,
            description: c.description,
            imageUrl: c.imageUrl,
            sortOrder: c.sortOrder,
            isActive: c.isActive,
          })
          .returning();
        if (ins) catByBrand.set(c.brandKey, ins.id);
      }
    } else {
      for (const c of cats) catByBrand.set(c.brandKey, c.id);
    }

    for (const p of DEFAULT_PRODUCTS) {
      await db.insert(productsTable).values({
        organizationId: orgId,
        categoryId: catByBrand.get(p.brandSlug) ?? null,
        sku: p.sku,
        slug: p.slug,
        name: p.name,
        brandSlug: p.brandSlug,
        brandName: p.brandName,
        shortDescription: p.shortDescription,
        description: p.description,
        specificationsJson: JSON.stringify(p.specifications),
        packagingInfo: p.packagingInfo,
        variantsJson: JSON.stringify(p.variants),
        imageUrlsJson: JSON.stringify(p.imageUrls),
        documentUrlsJson: JSON.stringify(p.documentUrls),
        moqUnits: p.moqUnits,
        tradePriceKes: p.tradePriceKes,
        seoTitle: p.seoTitle,
        seoDescription: p.seoDescription,
        isFeatured: p.isFeatured,
        status: p.status,
      });
    }
    return listProductsInternal(orgId);
  }

  return rows.map((r) => ({
    id: r.id,
    organizationId: r.organizationId,
    categoryId: r.categoryId,
    sku: r.sku,
    slug: r.slug,
    name: r.name,
    brandSlug: r.brandSlug,
    brandName: r.brandName,
    shortDescription: r.shortDescription,
    description: r.description,
    specifications: JSON.parse(r.specificationsJson || "[]"),
    packagingInfo: r.packagingInfo,
    variants: JSON.parse(r.variantsJson || "[]"),
    imageUrls: JSON.parse(r.imageUrlsJson || "[]"),
    documentUrls: JSON.parse(r.documentUrlsJson || "[]"),
    moqUnits: r.moqUnits,
    tradePriceKes: r.tradePriceKes,
    seoTitle: r.seoTitle,
    seoDescription: r.seoDescription,
    isFeatured: r.isFeatured,
    status: r.status as ProductRec["status"],
  }));
}

/* ============================================================================
 * PUBLIC WEBSITE APIs (/api/public/*) — STRICTLY FIREWALLED FROM ERP TABLES
 * ==========================================================================*/

router.get("/public/overview", async (_req: Request, res: Response) => {
  const products = await listProductsInternal(PEOPLEOS_ORGANIZATION_ID);
  const published = products.filter((p) => p.status === "published");
  res.json({
    company: {
      name: "Rekker Limited",
      tagline: "Manufacturing and distributing the brands Kenya uses every day.",
      city: "Nairobi, Kenya",
      email: "info@rekker.co.ke",
      shopUrl: "https://shop.rekker.co.ke",
      logoUrl: "https://rekker.co.ke/Logo.jpg",
      heroImageUrl: "https://rekker.co.ke/images/hero-rekker.jpg",
      countiesCoverageTarget: 47,
      orderTurnaroundTargetHours: 24,
    },
    brands: VERIFIED_BRANDS,
    featuredProducts: published.filter((p) => p.isFeatured).map(toPublicProductDto),
    totalPublishedProducts: published.length,
  });
});

router.get("/public/catalog", async (req: Request, res: Response) => {
  const brand = sanitizeText(req.query.brand ?? "", 64).toLowerCase();
  const search = sanitizeText(req.query.search ?? "", 120).toLowerCase();
  const featured = req.query.featured === "true";

  const products = await listProductsInternal(PEOPLEOS_ORGANIZATION_ID);
  let filtered = products.filter((p) => p.status === "published");
  if (brand) filtered = filtered.filter((p) => p.brandSlug.toLowerCase() === brand);
  if (featured) filtered = filtered.filter((p) => p.isFeatured);
  if (search) {
    filtered = filtered.filter((p) =>
      `${p.name} ${p.sku} ${p.brandName} ${p.shortDescription}`.toLowerCase().includes(search),
    );
  }

  ensureOrgSeeded(PEOPLEOS_ORGANIZATION_ID);
  const categories = MEM_CATEGORIES.get(PEOPLEOS_ORGANIZATION_ID)!.filter((c) => c.isActive);

  res.json({
    brands: VERIFIED_BRANDS,
    categories: categories.map((c) => ({
      id: c.id,
      slug: c.slug,
      name: c.name,
      brandKey: c.brandKey,
      description: c.description,
      imageUrl: c.imageUrl,
    })),
    items: filtered.map(toPublicProductDto),
    total: filtered.length,
  });
});

router.get("/public/catalog/:slug", async (req: Request, res: Response) => {
  const slug = sanitizeText(req.params.slug ?? "", 120);
  const products = await listProductsInternal(PEOPLEOS_ORGANIZATION_ID);
  const target = products.find((p) => p.status === "published" && (p.slug === slug || p.id === slug));
  if (!target) {
    res.status(404).json({ error: "Product not found." });
    return;
  }
  const related = products
    .filter((p) => p.status === "published" && p.id !== target.id && p.brandSlug === target.brandSlug)
    .slice(0, 3)
    .map(toPublicProductDto);
  res.json({ product: toPublicProductDto(target), related });
});

router.get("/public/careers", async (_req: Request, res: Response) => {
  const postings = await getPublicJobPostings();
  res.json({ items: postings, total: postings.length });
});

router.post("/public/contact", async (req: Request, res: Response) => {
  const name = sanitizeText(req.body?.name, 120);
  const email = sanitizeText(req.body?.email, 160);
  const phone = sanitizeText(req.body?.phone, 40) || null;
  const company = sanitizeText(req.body?.company, 140) || null;
  const interest = sanitizeText(req.body?.interest || "Trade & General Enquiry", 80);
  const message = sanitizeText(req.body?.message, 2000);

  if (!name || !email.includes("@") || message.length < 10) {
    res.status(400).json({ error: "Please provide your name, a valid email address, and message (min 10 chars)." });
    return;
  }

  const orgId = PEOPLEOS_ORGANIZATION_ID;
  const ref = makeRef("CNT");
  const nowIso = new Date().toISOString();

  if (!process.env.DATABASE_URL) {
    ensureOrgSeeded(orgId);
    MEM_LEADS.get(orgId)!.unshift({
      id: crypto.randomUUID(),
      organizationId: orgId,
      referenceCode: ref,
      source: "contact_form",
      stage: "new_lead",
      customerName: name,
      companyName: company,
      email,
      phone,
      interestCategory: interest,
      priority: "medium",
      assignedEmployeeId: null,
      followUpDate: null,
      estimatedValueKes: 0,
      notes: message,
      communicationHistory: [{ timestamp: nowIso, actor: "website_contact", note: `Contact inquiry submitted: ${interest}` }],
      createdAt: nowIso,
      updatedAt: nowIso,
    });
  } else {
    await db.insert(crmLeadsTable).values({
      organizationId: orgId,
      referenceCode: ref,
      source: "contact_form",
      stage: "new_lead",
      customerName: name,
      companyName: company,
      email,
      phone,
      interestCategory: interest,
      priority: "medium",
      notes: message,
      communicationHistoryJson: JSON.stringify([{ timestamp: nowIso, actor: "website_contact", note: `Contact inquiry submitted: ${interest}` }]),
    });
  }

  await recordAuditEvent({
    organizationId: orgId,
    actorUserId: "public_visitor",
    actor: "public_website",
    action: "PUBLIC_CONTACT_SUBMITTED",
    targetType: "crm_lead",
    targetId: ref,
    summary: `Public commercial inquiry ${ref} routed to CRM pipeline`,
    isDemo: !process.env.DATABASE_URL,
  });

  res.status(201).json({
    referenceCode: ref,
    status: "submitted",
    message: "Thank you — our commercial team responds to trade enquiries within one business day.",
    submittedAt: nowIso,
  });
});

router.post("/public/quotes", async (req: Request, res: Response) => {
  const customerName = sanitizeText(req.body?.customerName, 120);
  const companyName = sanitizeText(req.body?.companyName, 140) || null;
  const email = sanitizeText(req.body?.email, 160);
  const phone = sanitizeText(req.body?.phone, 40) || null;
  const productId = sanitizeText(req.body?.productId, 120) || null;
  const productName = sanitizeText(req.body?.productName, 160);
  const requestedQuantity = Number(req.body?.requestedQuantity ?? 0);
  const packagingPreference = sanitizeText(req.body?.packagingPreference, 120) || null;
  const deliveryLocation = sanitizeText(req.body?.deliveryLocation, 140);
  const requirements = sanitizeText(req.body?.requirements, 1500);
  const customerUserId = typeof req.headers["x-peopleos-user-id"] === "string" ? sanitizeText(req.headers["x-peopleos-user-id"], 128) : null;

  if (!customerName || !email.includes("@") || !productName || !deliveryLocation || requestedQuantity < 1) {
    res.status(400).json({ error: "Customer name, valid email, product, delivery location, and quantity >= 1 are required." });
    return;
  }

  const orgId = PEOPLEOS_ORGANIZATION_ID;
  const ref = makeRef("QT");
  const nowIso = new Date().toISOString();

  if (!process.env.DATABASE_URL) {
    ensureOrgSeeded(orgId);
    const leadId = crypto.randomUUID();
    MEM_LEADS.get(orgId)!.unshift({
      id: leadId,
      organizationId: orgId,
      referenceCode: ref,
      source: "quote_request",
      stage: "quotation_requested",
      customerName,
      companyName,
      email,
      phone,
      interestCategory: productName,
      priority: requestedQuantity >= 100 ? "high" : "medium",
      assignedEmployeeId: null,
      followUpDate: null,
      estimatedValueKes: 0,
      notes: `Qty: ${requestedQuantity} · Delivery: ${deliveryLocation}. ${requirements}`,
      communicationHistory: [{ timestamp: nowIso, actor: "website_quote", note: `Quotation request ${ref} submitted for ${requestedQuantity} units` }],
      createdAt: nowIso,
      updatedAt: nowIso,
    });
    MEM_QUOTES.get(orgId)!.unshift({
      id: crypto.randomUUID(),
      organizationId: orgId,
      referenceCode: ref,
      leadId,
      customerUserId,
      customerName,
      companyName,
      email,
      phone,
      productId,
      productName,
      requestedQuantity,
      packagingPreference,
      deliveryLocation,
      requirements,
      quotedTotalKes: null,
      status: "submitted",
      reviewedByUserId: null,
      reviewComment: null,
      createdAt: nowIso,
      updatedAt: nowIso,
    });
  } else {
    const [lead] = await db
      .insert(crmLeadsTable)
      .values({
        organizationId: orgId,
        referenceCode: ref,
        source: "quote_request",
        stage: "quotation_requested",
        customerName,
        companyName,
        email,
        phone,
        interestCategory: productName,
        priority: requestedQuantity >= 100 ? "high" : "medium",
        notes: `Qty: ${requestedQuantity} · Delivery: ${deliveryLocation}. ${requirements}`,
        communicationHistoryJson: JSON.stringify([{ timestamp: nowIso, actor: "website_quote", note: `Quotation request ${ref} submitted` }]),
      })
      .returning();

    await db.insert(quotationsTable).values({
      organizationId: orgId,
      referenceCode: ref,
      leadId: lead?.id ?? null,
      customerUserId,
      customerName,
      companyName,
      email,
      phone,
      productId,
      productName,
      requestedQuantity,
      packagingPreference,
      deliveryLocation,
      requirements,
      status: "submitted",
    });
  }

  await recordAuditEvent({
    organizationId: orgId,
    actorUserId: customerUserId ?? "public_visitor",
    actor: "public_website",
    action: "QUOTATION_REQUESTED",
    targetType: "quotation",
    targetId: ref,
    summary: `Quotation request ${ref} entered CRM pipeline (${requestedQuantity}x ${productName})`,
    isDemo: !process.env.DATABASE_URL,
  });

  res.status(201).json({
    referenceCode: ref,
    status: "submitted",
    message: `Quotation request ${ref} received and routed to our sales team.`,
    submittedAt: nowIso,
  });
});

router.post("/public/distributors/apply", async (req: Request, res: Response) => {
  const businessName = sanitizeText(req.body?.businessName, 160);
  const registrationNumber = sanitizeText(req.body?.registrationNumber, 80) || null;
  const taxPin = sanitizeText(req.body?.taxPin, 40) || null;
  const contactName = sanitizeText(req.body?.contactName, 120);
  const email = sanitizeText(req.body?.email, 160);
  const phone = sanitizeText(req.body?.phone, 40);
  const businessType = sanitizeText(req.body?.businessType || "stockist", 60);
  const distributionArea = sanitizeText(req.body?.distributionArea, 140);
  const outletsServed = req.body?.outletsServed ? Number(req.body.outletsServed) : null;
  const yearsExperience = req.body?.yearsExperience ? Number(req.body.yearsExperience) : null;
  const productInterests = Array.isArray(req.body?.productInterests)
    ? req.body.productInterests.map((v: unknown) => sanitizeText(v, 80)).filter(Boolean)
    : [];
  const applicantUserId = typeof req.headers["x-peopleos-user-id"] === "string" ? sanitizeText(req.headers["x-peopleos-user-id"], 128) : null;

  if (!businessName || !contactName || !email.includes("@") || !phone || !distributionArea) {
    res.status(400).json({ error: "Business name, contact person, valid email, phone, and distribution area are required." });
    return;
  }

  const orgId = PEOPLEOS_ORGANIZATION_ID;
  const ref = makeRef("DIST");
  const nowIso = new Date().toISOString();

  if (!process.env.DATABASE_URL) {
    ensureOrgSeeded(orgId);
    MEM_DIST_APPS.get(orgId)!.unshift({
      id: crypto.randomUUID(),
      organizationId: orgId,
      referenceCode: ref,
      applicantUserId,
      businessName,
      registrationNumber,
      taxPin,
      contactName,
      email,
      phone,
      businessType,
      distributionArea,
      outletsServed,
      yearsExperience,
      productInterests,
      supportingDocs: [],
      status: "submitted",
      reviewerUserId: null,
      reviewerNotes: null,
      rejectionReason: null,
      tierName: "Standard Trade",
      creditLimitKes: 0,
      createdAt: nowIso,
      updatedAt: nowIso,
    });
    MEM_LEADS.get(orgId)!.unshift({
      id: crypto.randomUUID(),
      organizationId: orgId,
      referenceCode: ref,
      source: "distributor_application",
      stage: "qualified",
      customerName: contactName,
      companyName: businessName,
      email,
      phone,
      interestCategory: `Partner: ${businessType}`,
      priority: "high",
      assignedEmployeeId: null,
      followUpDate: null,
      estimatedValueKes: 0,
      notes: `Coverage: ${distributionArea}. Interests: ${productInterests.join(", ") || "All Rekker lines"}.`,
      communicationHistory: [{ timestamp: nowIso, actor: "partner_portal", note: `Distributor application ${ref} submitted.` }],
      createdAt: nowIso,
      updatedAt: nowIso,
    });
  } else {
    await db.insert(distributorApplicationsTable).values({
      organizationId: orgId,
      referenceCode: ref,
      applicantUserId,
      businessName,
      registrationNumber,
      taxPin,
      contactName,
      email,
      phone,
      businessType,
      distributionArea,
      outletsServed,
      yearsExperience,
      productInterestsJson: JSON.stringify(productInterests),
      status: "submitted",
    });
    await db.insert(crmLeadsTable).values({
      organizationId: orgId,
      referenceCode: ref,
      source: "distributor_application",
      stage: "qualified",
      customerName: contactName,
      companyName: businessName,
      email,
      phone,
      interestCategory: `Partner: ${businessType}`,
      priority: "high",
      notes: `Coverage: ${distributionArea}`,
      communicationHistoryJson: JSON.stringify([{ timestamp: nowIso, actor: "partner_portal", note: `Distributor application ${ref} submitted.` }]),
    });
  }

  await recordAuditEvent({
    organizationId: orgId,
    actorUserId: applicantUserId ?? "public_visitor",
    actor: "partner_onboarding",
    action: "DISTRIBUTOR_APPLICATION_SUBMITTED",
    targetType: "distributor_application",
    targetId: ref,
    summary: `Partner application ${ref} submitted for ${businessName} (${distributionArea})`,
    isDemo: !process.env.DATABASE_URL,
  });

  res.status(201).json({
    referenceCode: ref,
    status: "submitted",
    message: `Partner application ${ref} submitted. Our trade team reviews coverage and replies within 1-2 working days.`,
    submittedAt: nowIso,
  });
});

/* ============================================================================
 * CUSTOMER SELF-SERVICE PORTAL (/api/portal/customer/*) — STRICTLY ISOLATED
 * ==========================================================================*/

router.get("/portal/customer/summary", async (req: Request, res: Response) => {
  const membership = await ensureMembership(req, res);
  if (!membership) return;

  const isAdminViewer = erpSalesAndAdminRoles.includes(membership.role as any);

  if (!process.env.DATABASE_URL) {
    ensureOrgSeeded(membership.organizationId);
    const quotes = MEM_QUOTES.get(membership.organizationId)!.filter((q) =>
      isAdminViewer ? true : q.customerUserId === membership.userId,
    );
    const tickets = MEM_TICKETS.get(membership.organizationId)!.filter((t) =>
      isAdminViewer ? true : t.customerUserId === membership.userId,
    );
    res.json({
      customerId: membership.userId,
      role: membership.role,
      quotations: quotes,
      tickets,
      authorizedDocuments: [
        { id: "doc-odpc", name: "Rekker Commercial Terms & ODPC Privacy Notice.pdf", category: "Legal" },
        { id: "doc-moq", name: "Trade Ordering & Delivery Turnaround Schedule.pdf", category: "Trade Info" },
      ],
    });
    return;
  }

  const quoteWhere = isAdminViewer
    ? eq(quotationsTable.organizationId, membership.organizationId)
    : and(eq(quotationsTable.organizationId, membership.organizationId), eq(quotationsTable.customerUserId, membership.userId));
  const ticketWhere = isAdminViewer
    ? eq(customerTicketsTable.organizationId, membership.organizationId)
    : and(eq(customerTicketsTable.organizationId, membership.organizationId), eq(customerTicketsTable.customerUserId, membership.userId));

  const quotations = await db.select().from(quotationsTable).where(quoteWhere).orderBy(desc(quotationsTable.createdAt));
  const tickets = await db.select().from(customerTicketsTable).where(ticketWhere).orderBy(desc(customerTicketsTable.createdAt));

  res.json({
    customerId: membership.userId,
    role: membership.role,
    quotations,
    tickets,
    authorizedDocuments: [
      { id: "doc-odpc", name: "Rekker Commercial Terms & ODPC Privacy Notice.pdf", category: "Legal" },
    ],
  });
});

router.post("/portal/customer/tickets", async (req: Request, res: Response) => {
  const membership = await ensureMembership(req, res);
  if (!membership) return;

  const subject = sanitizeText(req.body?.subject, 160);
  const category = sanitizeText(req.body?.category || "Order Support", 80);
  const description = sanitizeText(req.body?.description, 2000);
  const customerName = sanitizeText(req.body?.customerName || membership.userId, 120);
  const priority = sanitizeText(req.body?.priority || "medium", 20);

  if (!subject || description.length < 10) {
    res.status(400).json({ error: "Ticket subject and description (min 10 chars) are required." });
    return;
  }

  const num = makeRef("TCK");
  const nowIso = new Date().toISOString();
  if (!process.env.DATABASE_URL) {
    ensureOrgSeeded(membership.organizationId);
    const created: TicketRec = {
      id: crypto.randomUUID(),
      organizationId: membership.organizationId,
      ticketNumber: num,
      customerUserId: membership.userId,
      customerName,
      subject,
      category,
      description,
      priority,
      status: "open",
      createdAt: nowIso,
      updatedAt: nowIso,
    };
    MEM_TICKETS.get(membership.organizationId)!.unshift(created);
    res.status(201).json(created);
    return;
  }

  const [created] = await db
    .insert(customerTicketsTable)
    .values({
      organizationId: membership.organizationId,
      ticketNumber: num,
      customerUserId: membership.userId,
      customerName,
      subject,
      category,
      description,
      priority,
      status: "open",
    })
    .returning();
  res.status(201).json(created);
});

/* ============================================================================
 * DISTRIBUTOR & WHOLESALE PORTAL (/api/portal/distributor/*)
 * ==========================================================================*/

router.get("/portal/distributor/dashboard", async (req: Request, res: Response) => {
  const membership = await requireRoles(req, res, distributorPortalRoles);
  if (!membership) return;

  const isAdminViewer = erpSalesAndAdminRoles.includes(membership.role as any);
  const catalog = (await listProductsInternal(membership.organizationId)).filter(
    (p) => p.status === "published",
  );

  if (!process.env.DATABASE_URL) {
    ensureOrgSeeded(membership.organizationId);
    const orders = MEM_WHOLESALE_ORDERS.get(membership.organizationId)!.filter((o) =>
      isAdminViewer ? true : o.distributorUserId === membership.userId,
    );
    const applications = MEM_DIST_APPS.get(membership.organizationId)!.filter((a) =>
      isAdminViewer ? true : a.applicantUserId === membership.userId,
    );
    res.json({
      distributorId: membership.userId,
      partnerStatus: applications[0]?.status ?? "active",
      tierName: applications[0]?.tierName ?? "Regional Trade Partner",
      catalog: catalog.map((p) => ({
        id: p.id,
        sku: p.sku,
        name: p.name,
        brandName: p.brandName,
        moqUnits: p.moqUnits,
        tradePriceKes: p.tradePriceKes ?? 0,
        packagingInfo: p.packagingInfo,
      })),
      orders,
      applications,
    });
    return;
  }

  const ordersWhere = isAdminViewer
    ? eq(wholesaleOrdersTable.organizationId, membership.organizationId)
    : and(eq(wholesaleOrdersTable.organizationId, membership.organizationId), eq(wholesaleOrdersTable.distributorUserId, membership.userId));
  const ordersRows = await db.select().from(wholesaleOrdersTable).where(ordersWhere).orderBy(desc(wholesaleOrdersTable.createdAt));

  res.json({
    distributorId: membership.userId,
    partnerStatus: "active",
    tierName: "Regional Trade Partner",
    catalog: catalog.map((p) => ({
      id: p.id,
      sku: p.sku,
      name: p.name,
      brandName: p.brandName,
      moqUnits: p.moqUnits,
      tradePriceKes: p.tradePriceKes ?? 0,
      packagingInfo: p.packagingInfo,
    })),
    orders: ordersRows.map((o) => ({
      id: o.id,
      orderNumber: o.orderNumber,
      distributorUserId: o.distributorUserId,
      distributorName: o.distributorName,
      items: JSON.parse(o.itemsJson || "[]"),
      totalUnits: o.totalUnits,
      totalAmountKes: o.totalAmountKes,
      paymentMethod: o.paymentMethod,
      deliveryCounty: o.deliveryCounty,
      status: o.status,
      createdAt: o.createdAt.toISOString(),
    })),
    applications: [],
  });
});

router.post("/portal/distributor/orders", async (req: Request, res: Response) => {
  const membership = await requireRoles(req, res, distributorPortalRoles);
  if (!membership) return;

  const rawItems = Array.isArray(req.body?.items) ? req.body.items : [];
  const deliveryCounty = sanitizeText(req.body?.deliveryCounty, 100);
  const deliveryNotes = sanitizeText(req.body?.deliveryNotes, 500) || null;
  const paymentMethod = sanitizeText(req.body?.paymentMethod || "mpesa_b2b", 40);
  const submitNow = Boolean(req.body?.submitNow);
  const distributorName = sanitizeText(req.body?.distributorName || membership.userId, 140);

  if (!rawItems.length || !deliveryCounty) {
    res.status(400).json({ error: "Wholesale order requires at least one item and a delivery county." });
    return;
  }

  const catalog = await listProductsInternal(membership.organizationId);
  const resolvedItems: WholesaleOrderRec["items"] = [];
  let totalUnits = 0;
  let totalAmountKes = 0;

  for (const row of rawItems) {
    const product = catalog.find((p) => p.id === row?.productId || p.sku === row?.sku);
    const qty = Number(row?.quantity ?? 0);
    if (!product || !Number.isFinite(qty) || qty <= 0) {
      res.status(400).json({ error: `Invalid product or quantity in wholesale order.` });
      return;
    }
    if (qty < product.moqUnits) {
      res.status(400).json({
        error: `${product.name} requires a minimum order quantity (MOQ) of ${product.moqUnits} units.`,
      });
      return;
    }
    const unitPrice = product.tradePriceKes ?? 0;
    const lineTotal = unitPrice * qty;
    totalUnits += qty;
    totalAmountKes += lineTotal;
    resolvedItems.push({
      productId: product.id,
      sku: product.sku,
      productName: product.name,
      quantity: qty,
      unitPriceKes: unitPrice,
      lineTotalKes: lineTotal,
    });
  }

  const orderNumber = makeRef("PO-WH");
  const status = submitNow ? "submitted" : "draft";
  const nowIso = new Date().toISOString();

  if (!process.env.DATABASE_URL) {
    ensureOrgSeeded(membership.organizationId);
    const created: WholesaleOrderRec = {
      id: crypto.randomUUID(),
      organizationId: membership.organizationId,
      orderNumber,
      distributorUserId: membership.userId,
      distributorName,
      items: resolvedItems,
      totalUnits,
      totalAmountKes,
      paymentMethod,
      deliveryCounty,
      deliveryNotes,
      status,
      approvedByUserId: null,
      createdAt: nowIso,
      updatedAt: nowIso,
    };
    MEM_WHOLESALE_ORDERS.get(membership.organizationId)!.unshift(created);
    await recordAuditEvent({
      organizationId: membership.organizationId,
      actorUserId: membership.userId,
      actor: membership.role,
      action: `WHOLESALE_ORDER_${status.toUpperCase()}`,
      targetType: "wholesale_order",
      targetId: created.id,
      summary: `Wholesale order ${orderNumber} (${totalUnits} units, KES ${totalAmountKes.toLocaleString()})`,
      isDemo: true,
    });
    res.status(201).json(created);
    return;
  }

  const [created] = await db
    .insert(wholesaleOrdersTable)
    .values({
      organizationId: membership.organizationId,
      orderNumber,
      distributorUserId: membership.userId,
      distributorName,
      itemsJson: JSON.stringify(resolvedItems),
      totalUnits,
      totalAmountKes,
      paymentMethod,
      deliveryCounty,
      deliveryNotes,
      status,
    })
    .returning();

  await recordAuditEvent({
    organizationId: membership.organizationId,
    actorUserId: membership.userId,
    actor: membership.role,
    action: `WHOLESALE_ORDER_${status.toUpperCase()}`,
    targetType: "wholesale_order",
    targetId: created?.id ?? orderNumber,
    summary: `Wholesale order ${orderNumber} (${totalUnits} units)`,
  });

  res.status(201).json(created);
});

/* ============================================================================
 * ERP ADMIN & CRM PIPELINE ENDPOINTS (/api/erp/*)
 * ==========================================================================*/

router.get("/erp/permissions", async (req: Request, res: Response) => {
  const membership = await ensureMembership(req, res);
  if (!membership) return;
  res.json({
    currentRole: membership.role,
    roles: PEOPLEOS_ROLES,
    matrix: MODULE_PERMISSION_MATRIX,
  });
});

router.get("/erp/catalog/products", async (req: Request, res: Response) => {
  const membership = await requireRoles(req, res, crmReadRoles);
  if (!membership) return;
  const products = await listProductsInternal(membership.organizationId);
  ensureOrgSeeded(membership.organizationId);
  res.json({
    items: products,
    categories: MEM_CATEGORIES.get(membership.organizationId)!,
    brands: VERIFIED_BRANDS,
  });
});

router.post("/erp/catalog/products", async (req: Request, res: Response) => {
  const membership = await requireRoles(req, res, catalogWriteRoles);
  if (!membership) return;

  const sku = sanitizeText(req.body?.sku, 60);
  const name = sanitizeText(req.body?.name, 180);
  const brandSlug = sanitizeText(req.body?.brandSlug, 80);
  const shortDescription = sanitizeText(req.body?.shortDescription, 400);
  const description = sanitizeText(req.body?.description || shortDescription, 2000);
  const packagingInfo = sanitizeText(req.body?.packagingInfo || "Confirmed via Trade Desk", 240);
  const moqUnits = Math.max(1, Number(req.body?.moqUnits ?? 12));
  const tradePriceKes = req.body?.tradePriceKes ? Number(req.body.tradePriceKes) : null;
  const isFeatured = Boolean(req.body?.isFeatured);
  const status = req.body?.status === "draft" ? "draft" : "published";

  if (!sku || !name || !brandSlug || !shortDescription) {
    res.status(400).json({ error: "SKU, product name, brand slug, and short description are required." });
    return;
  }

  const brand = VERIFIED_BRANDS.find((b) => b.slug === brandSlug);
  const slug = sanitizeText(req.body?.slug || name.toLowerCase().replace(/[^a-z0-9]+/g, "-"), 120);
  const imageUrl = sanitizeText(req.body?.imageUrl, 300) || brand?.image || "https://rekker.co.ke/images/hero-rekker.jpg";

  if (!process.env.DATABASE_URL) {
    ensureOrgSeeded(membership.organizationId);
    const created: ProductRec = {
      id: crypto.randomUUID(),
      organizationId: membership.organizationId,
      categoryId: null,
      sku,
      slug,
      name,
      brandSlug,
      brandName: brand?.name ?? brandSlug,
      shortDescription,
      description,
      specifications: [{ label: "Packaging", value: packagingInfo }],
      packagingInfo,
      variants: ["Standard Trade"],
      imageUrls: [imageUrl],
      documentUrls: [],
      moqUnits,
      tradePriceKes,
      seoTitle: `${name} | Rekker`,
      seoDescription: shortDescription,
      isFeatured,
      status,
    };
    MEM_PRODUCTS.get(membership.organizationId)!.unshift(created);
    await recordAuditEvent({
      organizationId: membership.organizationId,
      actorUserId: membership.userId,
      actor: membership.role,
      action: "PRODUCT_CREATED",
      targetType: "product",
      targetId: created.id,
      summary: `Created catalogue product ${sku} (${name})`,
      isDemo: true,
    });
    res.status(201).json(created);
    return;
  }

  const [created] = await db
    .insert(productsTable)
    .values({
      organizationId: membership.organizationId,
      sku,
      slug,
      name,
      brandSlug,
      brandName: brand?.name ?? brandSlug,
      shortDescription,
      description,
      packagingInfo,
      imageUrlsJson: JSON.stringify([imageUrl]),
      moqUnits,
      tradePriceKes,
      seoTitle: `${name} | Rekker`,
      seoDescription: shortDescription,
      isFeatured,
      status,
    })
    .returning();
  res.status(201).json(created);
});

router.patch("/erp/catalog/products/:id", async (req: Request, res: Response) => {
  const membership = await requireRoles(req, res, catalogWriteRoles);
  if (!membership) return;
  const productId = String(req.params.id ?? "");

  if (!process.env.DATABASE_URL) {
    ensureOrgSeeded(membership.organizationId);
    const target = MEM_PRODUCTS.get(membership.organizationId)!.find((p) => p.id === productId);
    if (!target) {
      res.status(404).json({ error: "Product not found." });
      return;
    }
    if (typeof req.body?.isFeatured === "boolean") target.isFeatured = req.body.isFeatured;
    if (req.body?.status && ["draft", "published", "archived"].includes(req.body.status)) {
      target.status = req.body.status;
    }
    if (typeof req.body?.tradePriceKes === "number") target.tradePriceKes = req.body.tradePriceKes;
    if (typeof req.body?.moqUnits === "number" && req.body.moqUnits >= 1) target.moqUnits = req.body.moqUnits;

    await recordAuditEvent({
      organizationId: membership.organizationId,
      actorUserId: membership.userId,
      actor: membership.role,
      action: "PRODUCT_UPDATED",
      targetType: "product",
      targetId: target.id,
      summary: `Updated catalogue product ${target.sku} (status: ${target.status}, featured: ${target.isFeatured})`,
      isDemo: true,
    });
    res.json(target);
    return;
  }

  const [updated] = await db
    .update(productsTable)
    .set({
      ...(typeof req.body?.isFeatured === "boolean" ? { isFeatured: req.body.isFeatured } : {}),
      ...(req.body?.status ? { status: sanitizeText(req.body.status, 30) } : {}),
      ...(typeof req.body?.tradePriceKes === "number" ? { tradePriceKes: req.body.tradePriceKes } : {}),
      ...(typeof req.body?.moqUnits === "number" ? { moqUnits: Math.max(1, req.body.moqUnits) } : {}),
      updatedAt: new Date(),
    })
    .where(and(eq(productsTable.id, productId), eq(productsTable.organizationId, membership.organizationId)))
    .returning();
  if (!updated) {
    res.status(404).json({ error: "Product not found." });
    return;
  }
  res.json(updated);
});

router.get("/erp/crm/leads", async (req: Request, res: Response) => {
  const membership = await requireRoles(req, res, crmReadRoles);
  if (!membership) return;

  if (!process.env.DATABASE_URL) {
    ensureOrgSeeded(membership.organizationId);
    const items = MEM_LEADS.get(membership.organizationId)!;
    res.json({ items, total: items.length, stages: CRM_STAGES });
    return;
  }

  const rows = await db
    .select()
    .from(crmLeadsTable)
    .where(eq(crmLeadsTable.organizationId, membership.organizationId))
    .orderBy(desc(crmLeadsTable.createdAt));

  res.json({
    items: rows.map((r) => ({
      ...r,
      communicationHistory: JSON.parse(r.communicationHistoryJson || "[]"),
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
    })),
    total: rows.length,
    stages: CRM_STAGES,
  });
});

router.post("/erp/crm/leads", async (req: Request, res: Response) => {
  const membership = await requireRoles(req, res, erpSalesAndAdminRoles);
  if (!membership) return;

  const customerName = sanitizeText(req.body?.customerName, 120);
  const companyName = sanitizeText(req.body?.companyName, 140) || null;
  const email = sanitizeText(req.body?.email, 160);
  const phone = sanitizeText(req.body?.phone, 40) || null;
  const interestCategory = sanitizeText(req.body?.interestCategory || "General Trade", 120);
  const estimatedValueKes = Math.max(0, Number(req.body?.estimatedValueKes ?? 0));
  const notes = sanitizeText(req.body?.notes, 1500);

  if (!customerName || !email.includes("@")) {
    res.status(400).json({ error: "Lead name and valid email are required." });
    return;
  }

  const ref = makeRef("LD");
  const nowIso = new Date().toISOString();

  if (!process.env.DATABASE_URL) {
    ensureOrgSeeded(membership.organizationId);
    const created: CrmLeadRec = {
      id: crypto.randomUUID(),
      organizationId: membership.organizationId,
      referenceCode: ref,
      source: "manual",
      stage: "new_lead",
      customerName,
      companyName,
      email,
      phone,
      interestCategory,
      priority: "medium",
      assignedEmployeeId: membership.employeeId ?? null,
      followUpDate: null,
      estimatedValueKes,
      notes,
      communicationHistory: [{ timestamp: nowIso, actor: membership.userId, note: "Lead created manually in CRM" }],
      createdAt: nowIso,
      updatedAt: nowIso,
    };
    MEM_LEADS.get(membership.organizationId)!.unshift(created);
    res.status(201).json(created);
    return;
  }

  const [created] = await db
    .insert(crmLeadsTable)
    .values({
      organizationId: membership.organizationId,
      referenceCode: ref,
      source: "manual",
      stage: "new_lead",
      customerName,
      companyName,
      email,
      phone,
      interestCategory,
      estimatedValueKes,
      notes,
      communicationHistoryJson: JSON.stringify([{ timestamp: nowIso, actor: membership.userId, note: "Lead created manually" }]),
    })
    .returning();
  res.status(201).json(created);
});

router.patch("/erp/crm/leads/:id/stage", async (req: Request, res: Response) => {
  const membership = await requireRoles(req, res, erpSalesAndAdminRoles);
  if (!membership) return;

  const leadId = String(req.params.id ?? "");
  const stage = String(req.body?.stage ?? "");
  const note = sanitizeText(req.body?.note, 400);

  if (!CRM_STAGES.includes(stage as any)) {
    res.status(400).json({ error: "Invalid CRM pipeline stage." });
    return;
  }

  const nowIso = new Date().toISOString();
  if (!process.env.DATABASE_URL) {
    ensureOrgSeeded(membership.organizationId);
    const lead = MEM_LEADS.get(membership.organizationId)!.find((l) => l.id === leadId);
    if (!lead) {
      res.status(404).json({ error: "Lead not found." });
      return;
    }
    const prevStage = lead.stage;
    lead.stage = stage;
    lead.updatedAt = nowIso;
    if (typeof req.body?.estimatedValueKes === "number") {
      lead.estimatedValueKes = Math.max(0, req.body.estimatedValueKes);
    }
    lead.communicationHistory.unshift({
      timestamp: nowIso,
      actor: membership.userId,
      note: note || `Moved stage ${prevStage} -> ${stage}`,
    });
    await recordAuditEvent({
      organizationId: membership.organizationId,
      actorUserId: membership.userId,
      actor: membership.role,
      action: "CRM_STAGE_CHANGED",
      targetType: "crm_lead",
      targetId: lead.id,
      summary: `CRM lead ${lead.referenceCode} moved ${prevStage} -> ${stage}`,
      isDemo: true,
    });
    res.json(lead);
    return;
  }

  const [updated] = await db
    .update(crmLeadsTable)
    .set({ stage, updatedAt: new Date() })
    .where(and(eq(crmLeadsTable.id, leadId), eq(crmLeadsTable.organizationId, membership.organizationId)))
    .returning();
  if (!updated) {
    res.status(404).json({ error: "Lead not found." });
    return;
  }
  await recordAuditEvent({
    organizationId: membership.organizationId,
    actorUserId: membership.userId,
    actor: membership.role,
    action: "CRM_STAGE_CHANGED",
    targetType: "crm_lead",
    targetId: updated.id,
    summary: `CRM lead ${updated.referenceCode} moved to ${stage}`,
  });
  res.json(updated);
});

router.get("/erp/crm/analytics", async (req: Request, res: Response) => {
  const membership = await requireRoles(req, res, crmReadRoles);
  if (!membership) return;

  ensureOrgSeeded(membership.organizationId);
  const leads = !process.env.DATABASE_URL
    ? MEM_LEADS.get(membership.organizationId)!
    : (await db.select().from(crmLeadsTable).where(eq(crmLeadsTable.organizationId, membership.organizationId)));

  const byStage: Record<string, number> = {};
  const bySource: Record<string, number> = {};
  let wonValueKes = 0;
  let wonCount = 0;

  for (const l of leads) {
    byStage[l.stage] = (byStage[l.stage] ?? 0) + 1;
    bySource[l.source] = (bySource[l.source] ?? 0) + 1;
    if (l.stage === "won") {
      wonCount += 1;
      wonValueKes += l.estimatedValueKes ?? 0;
    }
  }

  const totalLeads = leads.length;
  const conversionRatePct = totalLeads > 0 ? Math.round((wonCount / totalLeads) * 1000) / 10 : 0;

  res.json({
    dataSource: "ACTUAL_STORED_RECORDS",
    totalLeads,
    openOpportunities: totalLeads - (byStage.won ?? 0) - (byStage.lost ?? 0),
    wonCount,
    lostCount: byStage.lost ?? 0,
    wonValueKes,
    conversionRatePct,
    byStage,
    bySource,
  });
});

router.get("/erp/quotations", async (req: Request, res: Response) => {
  const membership = await requireRoles(req, res, crmReadRoles);
  if (!membership) return;

  if (!process.env.DATABASE_URL) {
    ensureOrgSeeded(membership.organizationId);
    res.json({ items: MEM_QUOTES.get(membership.organizationId)! });
    return;
  }
  const rows = await db.select().from(quotationsTable).where(eq(quotationsTable.organizationId, membership.organizationId)).orderBy(desc(quotationsTable.createdAt));
  res.json({ items: rows });
});

router.patch("/erp/quotations/:id", async (req: Request, res: Response) => {
  const membership = await requireRoles(req, res, erpSalesAndAdminRoles);
  if (!membership) return;

  const id = String(req.params.id ?? "");
  const status = String(req.body?.status ?? "approved_quoted");
  const quotedTotalKes = typeof req.body?.quotedTotalKes === "number" ? Math.max(0, req.body.quotedTotalKes) : null;
  const reviewComment = sanitizeText(req.body?.reviewComment, 500) || null;

  if (!process.env.DATABASE_URL) {
    ensureOrgSeeded(membership.organizationId);
    const quote = MEM_QUOTES.get(membership.organizationId)!.find((q) => q.id === id);
    if (!quote) {
      res.status(404).json({ error: "Quotation not found." });
      return;
    }
    quote.status = status as QuotationRec["status"];
    if (quotedTotalKes !== null) quote.quotedTotalKes = quotedTotalKes;
    quote.reviewedByUserId = membership.userId;
    quote.reviewComment = reviewComment;
    quote.updatedAt = new Date().toISOString();

    await recordAuditEvent({
      organizationId: membership.organizationId,
      actorUserId: membership.userId,
      actor: membership.role,
      action: "QUOTATION_UPDATED",
      targetType: "quotation",
      targetId: quote.id,
      summary: `Quotation ${quote.referenceCode} marked ${status}`,
      isDemo: true,
    });
    res.json(quote);
    return;
  }

  const [updated] = await db
    .update(quotationsTable)
    .set({
      status,
      ...(quotedTotalKes !== null ? { quotedTotalKes } : {}),
      reviewedByUserId: membership.userId,
      reviewComment,
      updatedAt: new Date(),
    })
    .where(and(eq(quotationsTable.id, id), eq(quotationsTable.organizationId, membership.organizationId)))
    .returning();
  if (!updated) {
    res.status(404).json({ error: "Quotation not found." });
    return;
  }
  res.json(updated);
});

router.get("/erp/distributors/applications", async (req: Request, res: Response) => {
  const membership = await requireRoles(req, res, crmReadRoles);
  if (!membership) return;

  if (!process.env.DATABASE_URL) {
    ensureOrgSeeded(membership.organizationId);
    res.json({ items: MEM_DIST_APPS.get(membership.organizationId)! });
    return;
  }
  const rows = await db
    .select()
    .from(distributorApplicationsTable)
    .where(eq(distributorApplicationsTable.organizationId, membership.organizationId))
    .orderBy(desc(distributorApplicationsTable.createdAt));
  res.json({ items: rows });
});

router.patch("/erp/distributors/applications/:id", async (req: Request, res: Response) => {
  const membership = await requireRoles(req, res, erpSalesAndAdminRoles);
  if (!membership) return;

  const id = String(req.params.id ?? "");
  const status = String(req.body?.status ?? "under_review");
  const validStatuses = ["submitted", "under_review", "info_requested", "approved", "rejected", "suspended"];
  if (!validStatuses.includes(status)) {
    res.status(400).json({ error: "Invalid application review status." });
    return;
  }

  const reviewerNotes = sanitizeText(req.body?.reviewerNotes, 1000) || null;
  const rejectionReason = sanitizeText(req.body?.rejectionReason, 500) || null;
  const tierName = sanitizeText(req.body?.tierName || "Approved Regional Partner", 80);

  if (!process.env.DATABASE_URL) {
    ensureOrgSeeded(membership.organizationId);
    const appRec = MEM_DIST_APPS.get(membership.organizationId)!.find((a) => a.id === id);
    if (!appRec) {
      res.status(404).json({ error: "Distributor application not found." });
      return;
    }
    appRec.status = status as DistributorAppRec["status"];
    appRec.reviewerUserId = membership.userId;
    appRec.reviewerNotes = reviewerNotes;
    appRec.rejectionReason = rejectionReason;
    appRec.tierName = tierName;
    appRec.updatedAt = new Date().toISOString();

    await recordAuditEvent({
      organizationId: membership.organizationId,
      actorUserId: membership.userId,
      actor: membership.role,
      action: `DISTRIBUTOR_APP_${status.toUpperCase()}`,
      targetType: "distributor_application",
      targetId: appRec.id,
      summary: `Partner application ${appRec.referenceCode} (${appRec.businessName}) set to ${status}`,
      isDemo: true,
    });
    res.json(appRec);
    return;
  }

  const [updated] = await db
    .update(distributorApplicationsTable)
    .set({
      status,
      reviewerUserId: membership.userId,
      reviewerNotes,
      rejectionReason,
      tierName,
      updatedAt: new Date(),
    })
    .where(and(eq(distributorApplicationsTable.id, id), eq(distributorApplicationsTable.organizationId, membership.organizationId)))
    .returning();
  if (!updated) {
    res.status(404).json({ error: "Distributor application not found." });
    return;
  }
  res.json(updated);
});

router.patch("/erp/wholesale-orders/:id", async (req: Request, res: Response) => {
  const membership = await requireRoles(req, res, erpSalesAndAdminRoles);
  if (!membership) return;

  const id = String(req.params.id ?? "");
  const status = String(req.body?.status ?? "approved");

  if (!process.env.DATABASE_URL) {
    ensureOrgSeeded(membership.organizationId);
    const order = MEM_WHOLESALE_ORDERS.get(membership.organizationId)!.find((o) => o.id === id);
    if (!order) {
      res.status(404).json({ error: "Wholesale order not found." });
      return;
    }
    order.status = status as WholesaleOrderRec["status"];
    order.approvedByUserId = membership.userId;
    order.updatedAt = new Date().toISOString();
    res.json(order);
    return;
  }

  const [updated] = await db
    .update(wholesaleOrdersTable)
    .set({ status, approvedByUserId: membership.userId, updatedAt: new Date() })
    .where(and(eq(wholesaleOrdersTable.id, id), eq(wholesaleOrdersTable.organizationId, membership.organizationId)))
    .returning();
  if (!updated) {
    res.status(404).json({ error: "Wholesale order not found." });
    return;
  }
  res.json(updated);
});

export default router;
