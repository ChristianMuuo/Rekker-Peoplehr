import crypto from "node:crypto";
import { asc, and, desc, eq, gte, ilike, lte } from "drizzle-orm";
import { Router, type IRouter, type Request } from "express";
import { ListAuditEventsQueryParams, ListAuditEventsResponse } from "@workspace/api-zod";
import { auditEventsTable, db } from "@workspace/db";
import { listDemoAuditEvents, type AuditEntry } from "../lib/auditService";
import { MODULE_PERMISSION_MATRIX, requireRoles } from "../middlewares/peopleosAccess";

const router: IRouter = Router();
const auditRoles = MODULE_PERMISSION_MATRIX.auditTrail.readRoles;

interface AuditRecord {
  id: string;
  occurredAt: string;
  actor: string;
  actorUserId: string | null;
  action: string;
  targetType: string;
  targetId: string;
  summary: string;
  prevHash: string | null;
  hash: string | null;
  isDemo: boolean;
}

function queryText(value: unknown, maxLength = 120): string | undefined {
  if (typeof value !== "string") return undefined;
  const text = value.trim().slice(0, maxLength);
  return text || undefined;
}

function queryDate(value: unknown): Date | undefined {
  if (typeof value !== "string" || !value.trim()) return undefined;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

function matchesFilters(event: AuditRecord, filters: {
  actor?: string;
  action?: string;
  targetType?: string;
  targetId?: string;
  from?: Date;
  to?: Date;
}): boolean {
  const time = Date.parse(event.occurredAt);
  if (filters.actor && !event.actor.toLowerCase().includes(filters.actor.toLowerCase())) return false;
  if (filters.action && !event.action.toLowerCase().includes(filters.action.toLowerCase())) return false;
  if (filters.targetType && !event.targetType.toLowerCase().includes(filters.targetType.toLowerCase())) return false;
  if (filters.targetId && !event.targetId.toLowerCase().includes(filters.targetId.toLowerCase())) return false;
  if (filters.from && time < filters.from.getTime()) return false;
  if (filters.to && time > filters.to.getTime()) return false;
  return true;
}

async function getAuditRecords(
  organizationId: string,
  filters: {
    actor?: string;
    action?: string;
    targetType?: string;
    targetId?: string;
    from?: Date;
    to?: Date;
  },
  limit = 500,
): Promise<AuditRecord[]> {
  if (!process.env.DATABASE_URL) {
    return listDemoAuditEvents(organizationId, 500)
      .map((event: AuditEntry) => ({
        id: event.id,
        occurredAt: event.occurredAt,
        actor: event.actor,
        actorUserId: event.actorUserId ?? null,
        action: event.action,
        targetType: event.targetType,
        targetId: event.targetId,
        summary: event.summary,
        prevHash: event.prevHash ?? null,
        hash: event.hash ?? null,
        isDemo: event.isDemo,
      }))
      .filter((event) => matchesFilters(event, filters))
      .slice(0, limit);
  }

  const conditions = [eq(auditEventsTable.organizationId, organizationId)];
  if (filters.actor) conditions.push(ilike(auditEventsTable.actor, `%${filters.actor}%`));
  if (filters.action) conditions.push(ilike(auditEventsTable.action, `%${filters.action}%`));
  if (filters.targetType) conditions.push(ilike(auditEventsTable.targetType, `%${filters.targetType}%`));
  if (filters.targetId) conditions.push(ilike(auditEventsTable.targetId, `%${filters.targetId}%`));
  if (filters.from) conditions.push(gte(auditEventsTable.occurredAt, filters.from));
  if (filters.to) conditions.push(lte(auditEventsTable.occurredAt, filters.to));

  const rows = await db
    .select()
    .from(auditEventsTable)
    .where(and(...conditions))
    .orderBy(desc(auditEventsTable.occurredAt))
    .limit(limit);

  return rows.map((event) => ({
    id: event.id,
    occurredAt: event.occurredAt.toISOString(),
    actor: event.actor,
    actorUserId: event.actorUserId ?? null,
    action: event.action,
    targetType: event.targetType,
    targetId: event.targetId,
    summary: event.summary,
    prevHash: event.prevHash ?? null,
    hash: event.hash ?? null,
    isDemo: event.isDemo,
  }));
}

function hashAuditRecord(event: AuditRecord, organizationId: string): string {
  return crypto.createHash("sha256").update(JSON.stringify({
    organizationId,
    actorUserId: event.actorUserId,
    actor: event.actor,
    action: event.action,
    targetType: event.targetType,
    targetId: event.targetId,
    summary: event.summary,
    occurredAt: event.occurredAt,
    prevHash: event.prevHash,
  })).digest("hex");
}

function csvCell(value: string): string {
  const safe = /^[=+@\-\t\r]/.test(value) ? `'${value}` : value;
  return `"${safe.replace(/"/g, '""')}"`;
}

function csvFor(records: AuditRecord[]): string {
  const header = ["id", "occurred_at", "actor", "action", "entity_type", "entity_id", "summary", "is_demo"];
  const lines = records.map((event) => [
    event.id, event.occurredAt, event.actor, event.action, event.targetType,
    event.targetId, event.summary, String(event.isDemo),
  ].map(csvCell).join(","));
  return [header.map(csvCell).join(","), ...lines].join("\r\n") + "\r\n";
}

function getFilters(query: Record<string, unknown>) {
  return {
    actor: queryText(query.actor),
    action: queryText(query.action),
    targetType: queryText(query.targetType),
    targetId: queryText(query.targetId),
    from: queryDate(query.from),
    to: queryDate(query.to),
  };
}

router.get("/audit-events/export.csv", async (req: Request, res): Promise<void> => {
  const membership = await requireRoles(req, res, auditRoles);
  if (!membership) return;
  const filters = getFilters(req.query as Record<string, unknown>);
  if (typeof req.query.from === "string" && !filters.from) {
    res.status(400).json({ error: "The 'from' filter must be a valid ISO date-time." });
    return;
  }
  if (typeof req.query.to === "string" && !filters.to) {
    res.status(400).json({ error: "The 'to' filter must be a valid ISO date-time." });
    return;
  }
  if (filters.from && filters.to && filters.from > filters.to) {
    res.status(400).json({ error: "The 'from' filter must be earlier than or equal to 'to'." });
    return;
  }
  const records = await getAuditRecords(membership.organizationId, filters, 5000);
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", 'attachment; filename="peopleos-audit-events.csv"');
  res.setHeader("Cache-Control", "no-store");
  res.send(csvFor(records));
});

router.get("/audit-events/integrity", async (req: Request, res): Promise<void> => {
  const membership = await requireRoles(req, res, auditRoles);
  if (!membership) return;

  let records: AuditRecord[];
  let truncated = false;
  if (!process.env.DATABASE_URL) {
    records = await getAuditRecords(membership.organizationId, {}, 500);
    records.sort((a, b) => a.occurredAt.localeCompare(b.occurredAt));
  } else {
    const rows = await db.select().from(auditEventsTable)
      .where(eq(auditEventsTable.organizationId, membership.organizationId))
      .orderBy(asc(auditEventsTable.occurredAt))
      .limit(5001);
    truncated = rows.length > 5000;
    records = rows.slice(0, 5000).map((event) => ({
      id: event.id,
      occurredAt: event.occurredAt.toISOString(),
      actor: event.actor,
      actorUserId: event.actorUserId ?? null,
      action: event.action,
      targetType: event.targetType,
      targetId: event.targetId,
      summary: event.summary,
      prevHash: event.prevHash ?? null,
      hash: event.hash ?? null,
      isDemo: event.isDemo,
    }));
  }

  let previousHash: string | null = null;
  let chainStarted = false;
  let invalidEventId: string | null = null;
  let verifiedHashedEntries = 0;
  let legacyUnhashedEntries = 0;
  for (const event of records) {
    if (!event.hash) {
      legacyUnhashedEntries += 1;
      if (chainStarted) {
        invalidEventId = event.id;
        break;
      }
      continue;
    }
    if (
      event.prevHash !== previousHash ||
      hashAuditRecord(event, membership.organizationId) !== event.hash
    ) {
      invalidEventId = event.id;
      break;
    }
    previousHash = event.hash;
    chainStarted = true;
    verifiedHashedEntries += 1;
  }

  const integrityValid = invalidEventId === null && !truncated;
  res.json({
    status: !integrityValid ? "invalid_or_incomplete" : legacyUnhashedEntries ? "partial_legacy_records" : "valid",
    integrityValid,
    checkedAt: new Date().toISOString(),
    organisationScoped: true,
    recordsChecked: records.length,
    verifiedHashedEntries,
    legacyUnhashedEntries,
    truncated,
    invalidEventId,
    message: legacyUnhashedEntries
      ? "The hashed portion is verified. Earlier legacy rows have no stored hash and cannot be retrospectively verified."
      : truncated
        ? "Only the first 5,000 records were checked. Narrow the period before treating the entire chain as verified."
        : integrityValid
          ? "All stored audit hashes and predecessor links in this result match."
          : "A hash or predecessor mismatch was detected. Preserve the records and investigate before making changes.",
  });
});

router.get("/audit-events", async (req, res): Promise<void> => {
  const query = ListAuditEventsQueryParams.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: query.error.message });
    return;
  }
  const membership = await requireRoles(req, res, auditRoles);
  if (!membership) return;

  const filters = getFilters(req.query as Record<string, unknown>);
  if (typeof req.query.from === "string" && !filters.from) {
    res.status(400).json({ error: "The 'from' filter must be a valid ISO date-time." });
    return;
  }
  if (typeof req.query.to === "string" && !filters.to) {
    res.status(400).json({ error: "The 'to' filter must be a valid ISO date-time." });
    return;
  }
  if (filters.from && filters.to && filters.from > filters.to) {
    res.status(400).json({ error: "The 'from' filter must be earlier than or equal to 'to'." });
    return;
  }

  const events = await getAuditRecords(membership.organizationId, filters, query.data.limit);
  res.json(ListAuditEventsResponse.parse(events.map((event) => ({
    id: event.id,
    occurredAt: event.occurredAt,
    actor: event.actor,
    action: event.action,
    targetType: event.targetType,
    targetId: event.targetId,
    summary: event.summary,
    isDemo: event.isDemo,
  }))));
});

export default router;
