import crypto from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import { Router, type IRouter, type Request, type Response } from "express";
import {
  crmLeadsTable,
  customerTicketsTable,
  db,
  distributorApplicationsTable,
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
const crmReadRoles = [...erpSalesAndAdminRoles, PEOPLEOS_ROLES.executive];
const distributorPortalRoles = [PEOPLEOS_ROLES.distributor, ...erpSalesAndAdminRoles];

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

// Server-side B2B Wholesale Schedule (MOQ & base wholesale rate schedule used strictly for isolated B2B portal orders, not public storefront display)
const B2B_WHOLESALE_PRICEBOOK = [
  { sku: "SM-HC-101", name: "Saffron Milan Hard-Water Laundry Carton", brandName: "Saffron Milan", moqUnits: 12, wholesaleUnitKes: 380 },
  { sku: "SM-SC-102", name: "Saffron Milan Surface & Dishwashing Carton", brandName: "Saffron Milan", moqUnits: 12, wholesaleUnitKes: 320 },
  { sku: "BS-PC-201", name: "Bio Saff Salon & Hair Care Trade Pack", brandName: "Bio Saff", moqUnits: 12, wholesaleUnitKes: 450 },
  { sku: "CN-FR-301", name: "Cornells Signature Fragrance Trade Case", brandName: "Cornells", moqUnits: 12, wholesaleUnitKes: 950 },
  { sku: "PC-AN-401", name: "PetCare Coat Shampoo Trade Case", brandName: "PetCare", moqUnits: 12, wholesaleUnitKes: 620 },
];

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
  productSku: string | null;
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
  items: Array<{ sku: string; productName: string; quantity: number; unitPriceKes: number; lineTotalKes: number }>;
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

const MEM_LEADS = new Map<string, CrmLeadRec[]>();
const MEM_QUOTES = new Map<string, QuotationRec[]>();
const MEM_DIST_APPS = new Map<string, DistributorAppRec[]>();
const MEM_WHOLESALE_ORDERS = new Map<string, WholesaleOrderRec[]>();
const MEM_TICKETS = new Map<string, TicketRec[]>();

function ensureOrgInitialized(orgId: string) {
  if (!MEM_LEADS.has(orgId)) MEM_LEADS.set(orgId, []);
  if (!MEM_QUOTES.has(orgId)) MEM_QUOTES.set(orgId, []);
  if (!MEM_DIST_APPS.has(orgId)) MEM_DIST_APPS.set(orgId, []);
  if (!MEM_WHOLESALE_ORDERS.has(orgId)) MEM_WHOLESALE_ORDERS.set(orgId, []);
  if (!MEM_TICKETS.has(orgId)) MEM_TICKETS.set(orgId, []);
}

function makeRef(prefix: string): string {
  return `${prefix}-${new Date().getFullYear()}-${crypto.randomBytes(2).toString("hex").toUpperCase()}`;
}

/* ============================================================================
 * NON-DUPLICATED PUBLIC ROUTE: /api/public/careers (HR Openings Only)
 * Corporate & consumer marketing live exclusively on rekker.co.ke & shop.rekker.co.ke
 * ==========================================================================*/

router.get("/public/careers", async (_req: Request, res: Response) => {
  const postings = await getPublicJobPostings();
  res.json({ items: postings, total: postings.length });
});

/* ============================================================================
 * ISOLATED B2B / CUSTOMER ACCOUNT PORTAL (/api/portal/customer/*)
 * ==========================================================================*/

router.get("/portal/customer/summary", async (req: Request, res: Response) => {
  const membership = await ensureMembership(req, res);
  if (!membership) return;

  const isAdminViewer = erpSalesAndAdminRoles.includes(membership.role as any);

  if (!process.env.DATABASE_URL) {
    ensureOrgInitialized(membership.organizationId);
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

router.post("/portal/customer/quotes", async (req: Request, res: Response) => {
  const membership = await ensureMembership(req, res);
  if (!membership) return;

  const customerName = sanitizeText(req.body?.customerName || membership.userId, 120);
  const companyName = sanitizeText(req.body?.companyName, 140) || null;
  const email = sanitizeText(req.body?.email, 160);
  const phone = sanitizeText(req.body?.phone, 40) || null;
  const productSku = sanitizeText(req.body?.productSku, 80) || null;
  const productName = sanitizeText(req.body?.productName, 160);
  const requestedQuantity = Number(req.body?.requestedQuantity ?? 0);
  const packagingPreference = sanitizeText(req.body?.packagingPreference, 120) || null;
  const deliveryLocation = sanitizeText(req.body?.deliveryLocation, 140);
  const requirements = sanitizeText(req.body?.requirements, 1500);

  if (!email.includes("@") || !productName || !deliveryLocation || requestedQuantity < 1) {
    res.status(400).json({ error: "Valid email, product line, delivery county, and quantity >= 1 are required." });
    return;
  }

  const ref = makeRef("QT");
  const nowIso = new Date().toISOString();

  if (!process.env.DATABASE_URL) {
    ensureOrgInitialized(membership.organizationId);
    const leadId = crypto.randomUUID();
    MEM_LEADS.get(membership.organizationId)!.unshift({
      id: leadId,
      organizationId: membership.organizationId,
      referenceCode: ref,
      source: "customer_portal",
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
      communicationHistory: [{ timestamp: nowIso, actor: membership.userId, note: `Portal quotation ${ref} requested` }],
      createdAt: nowIso,
      updatedAt: nowIso,
    });
    const quoteRec: QuotationRec = {
      id: crypto.randomUUID(),
      organizationId: membership.organizationId,
      referenceCode: ref,
      leadId,
      customerUserId: membership.userId,
      customerName,
      companyName,
      email,
      phone,
      productSku,
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
    };
    MEM_QUOTES.get(membership.organizationId)!.unshift(quoteRec);
  } else {
    const [lead] = await db
      .insert(crmLeadsTable)
      .values({
        organizationId: membership.organizationId,
        referenceCode: ref,
        source: "customer_portal",
        stage: "quotation_requested",
        customerName,
        companyName,
        email,
        phone,
        interestCategory: productName,
        priority: requestedQuantity >= 100 ? "high" : "medium",
        notes: `Qty: ${requestedQuantity} · Delivery: ${deliveryLocation}. ${requirements}`,
        communicationHistoryJson: JSON.stringify([{ timestamp: nowIso, actor: membership.userId, note: `Portal quotation ${ref} submitted` }]),
      })
      .returning();

    await db.insert(quotationsTable).values({
      organizationId: membership.organizationId,
      referenceCode: ref,
      leadId: lead?.id ?? null,
      customerUserId: membership.userId,
      customerName,
      companyName,
      email,
      phone,
      productSku,
      productName,
      requestedQuantity,
      packagingPreference,
      deliveryLocation,
      requirements,
      status: "submitted",
    });
  }

  await recordAuditEvent({
    organizationId: membership.organizationId,
    actorUserId: membership.userId,
    actor: membership.role,
    action: "QUOTATION_REQUESTED",
    targetType: "quotation",
    targetId: ref,
    summary: `B2B quote request ${ref} entered CRM pipeline (${requestedQuantity}x ${productName})`,
    isDemo: !process.env.DATABASE_URL,
  });

  res.status(201).json({
    referenceCode: ref,
    status: "submitted",
    message: `Quotation ${ref} submitted to Rekker Trade Desk.`,
    submittedAt: nowIso,
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
    ensureOrgInitialized(membership.organizationId);
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
 * DISTRIBUTOR WHOLESALE PORTAL (/api/portal/distributor/*)
 * ==========================================================================*/

router.get("/portal/distributor/dashboard", async (req: Request, res: Response) => {
  const membership = await requireRoles(req, res, distributorPortalRoles);
  if (!membership) return;

  const isAdminViewer = erpSalesAndAdminRoles.includes(membership.role as any);

  if (!process.env.DATABASE_URL) {
    ensureOrgInitialized(membership.organizationId);
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
      pricebook: B2B_WHOLESALE_PRICEBOOK,
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
    pricebook: B2B_WHOLESALE_PRICEBOOK,
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
    res.status(400).json({ error: "Wholesale order requires at least one trade line and a delivery county." });
    return;
  }

  const resolvedItems: WholesaleOrderRec["items"] = [];
  let totalUnits = 0;
  let totalAmountKes = 0;

  for (const row of rawItems) {
    const skuEntry = B2B_WHOLESALE_PRICEBOOK.find((p) => p.sku === row?.sku);
    const qty = Number(row?.quantity ?? 0);
    if (!skuEntry || !Number.isFinite(qty) || qty <= 0) {
      res.status(400).json({ error: "Invalid SKU or non-positive order quantity." });
      return;
    }
    if (qty < skuEntry.moqUnits) {
      res.status(400).json({
        error: `${skuEntry.name} requires a minimum order quantity (MOQ) of ${skuEntry.moqUnits} units.`,
      });
      return;
    }
    const lineTotal = skuEntry.wholesaleUnitKes * qty;
    totalUnits += qty;
    totalAmountKes += lineTotal;
    resolvedItems.push({
      sku: skuEntry.sku,
      productName: skuEntry.name,
      quantity: qty,
      unitPriceKes: skuEntry.wholesaleUnitKes,
      lineTotalKes: lineTotal,
    });
  }

  const orderNumber = makeRef("PO-WH");
  const status = submitNow ? "submitted" : "draft";
  const nowIso = new Date().toISOString();

  if (!process.env.DATABASE_URL) {
    ensureOrgInitialized(membership.organizationId);
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
 * INTERNAL ERP CRM, QUOTE APPROVAL & PARTNER ONBOARDING (/api/erp/*)
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

// External Webhook / Partner Intake endpoint (e.g. forwarded from rekker.co.ke / shop.rekker.co.ke)
router.post("/erp/crm/leads", async (req: Request, res: Response) => {
  const membership = await requireRoles(req, res, erpSalesAndAdminRoles);
  if (!membership) return;

  const customerName = sanitizeText(req.body?.customerName, 120);
  const companyName = sanitizeText(req.body?.companyName, 140) || null;
  const email = sanitizeText(req.body?.email, 160);
  const phone = sanitizeText(req.body?.phone, 40) || null;
  const source = sanitizeText(req.body?.source || "manual", 60);
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
    ensureOrgInitialized(membership.organizationId);
    const created: CrmLeadRec = {
      id: crypto.randomUUID(),
      organizationId: membership.organizationId,
      referenceCode: ref,
      source,
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
      communicationHistory: [{ timestamp: nowIso, actor: membership.userId, note: `Lead logged (${source})` }],
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
      source,
      stage: "new_lead",
      customerName,
      companyName,
      email,
      phone,
      interestCategory,
      estimatedValueKes,
      notes,
      communicationHistoryJson: JSON.stringify([{ timestamp: nowIso, actor: membership.userId, note: `Lead logged (${source})` }]),
    })
    .returning();
  res.status(201).json(created);
});

router.get("/erp/crm/leads", async (req: Request, res: Response) => {
  const membership = await requireRoles(req, res, crmReadRoles);
  if (!membership) return;

  if (!process.env.DATABASE_URL) {
    ensureOrgInitialized(membership.organizationId);
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
    ensureOrgInitialized(membership.organizationId);
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

  ensureOrgInitialized(membership.organizationId);
  const leads = !process.env.DATABASE_URL
    ? MEM_LEADS.get(membership.organizationId)!
    : await db.select().from(crmLeadsTable).where(eq(crmLeadsTable.organizationId, membership.organizationId));

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
    ensureOrgInitialized(membership.organizationId);
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
    ensureOrgInitialized(membership.organizationId);
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
    ensureOrgInitialized(membership.organizationId);
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

router.post("/erp/distributors/applications", async (req: Request, res: Response) => {
  const membership = await requireRoles(req, res, distributorPortalRoles);
  if (!membership) return;

  const businessName = sanitizeText(req.body?.businessName, 160);
  const registrationNumber = sanitizeText(req.body?.registrationNumber, 80) || null;
  const taxPin = sanitizeText(req.body?.taxPin, 40) || null;
  const contactName = sanitizeText(req.body?.contactName, 120);
  const email = sanitizeText(req.body?.email, 160);
  const phone = sanitizeText(req.body?.phone, 40);
  const businessType = sanitizeText(req.body?.businessType || "regional_distributor", 60);
  const distributionArea = sanitizeText(req.body?.distributionArea, 140);

  if (!businessName || !contactName || !email.includes("@") || !phone || !distributionArea) {
    res.status(400).json({ error: "Business name, contact person, valid email, phone, and territory are required." });
    return;
  }

  const ref = makeRef("DIST");
  const nowIso = new Date().toISOString();

  if (!process.env.DATABASE_URL) {
    ensureOrgInitialized(membership.organizationId);
    const rec: DistributorAppRec = {
      id: crypto.randomUUID(),
      organizationId: membership.organizationId,
      referenceCode: ref,
      applicantUserId: membership.userId,
      businessName,
      registrationNumber,
      taxPin,
      contactName,
      email,
      phone,
      businessType,
      distributionArea,
      outletsServed: null,
      yearsExperience: null,
      productInterests: [],
      supportingDocs: [],
      status: "submitted",
      reviewerUserId: null,
      reviewerNotes: null,
      rejectionReason: null,
      tierName: "Standard Trade",
      creditLimitKes: 0,
      createdAt: nowIso,
      updatedAt: nowIso,
    };
    MEM_DIST_APPS.get(membership.organizationId)!.unshift(rec);
    res.status(201).json(rec);
    return;
  }

  const [created] = await db
    .insert(distributorApplicationsTable)
    .values({
      organizationId: membership.organizationId,
      referenceCode: ref,
      applicantUserId: membership.userId,
      businessName,
      registrationNumber,
      taxPin,
      contactName,
      email,
      phone,
      businessType,
      distributionArea,
      status: "submitted",
    })
    .returning();
  res.status(201).json(created);
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
    ensureOrgInitialized(membership.organizationId);
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
    ensureOrgInitialized(membership.organizationId);
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
