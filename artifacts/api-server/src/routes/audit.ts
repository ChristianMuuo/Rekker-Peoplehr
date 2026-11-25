import { and, desc, eq, gte, ilike, lte } from "drizzle-orm";
import { Router, type IRouter } from "express";
import {
  ListAuditEventsQueryParams,
  ListAuditEventsResponse,
} from "@workspace/api-zod";
import { auditEventsTable, db } from "@workspace/db";
import { DEMO_AUDIT_STORE, listDemoAuditEvents } from "../lib/auditService";
import {
  MODULE_PERMISSION_MATRIX,
  requireRoles,
} from "../middlewares/peopleosAccess";

const router: IRouter = Router();
const auditRoles = MODULE_PERMISSION_MATRIX.auditTrail.readRoles;
function queryText(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function auditFilters(req: import("express").Request) {
  const actor = queryText(req.query.actor);
  const action = queryText(req.query.action);
  const from = queryText(req.query.from);
  const to = queryText(req.query.to);
  const validFrom = from && /^\d{4}-\d{2}-\d{2}$/.test(from) ? new Date(`${from}T00:00:00.000Z`) : undefined;
  const validTo = to && /^\d{4}-\d{2}-\d{2}$/.test(to) ? new Date(`${to}T23:59:59.999Z`) : undefined;
  return { actor, action, validFrom, validTo };
}

function toCsvCell(value: unknown): string {
  return `"${String(value ?? "").replace(/"/g, '""')}"`;
}

function sendAuditCsv(
  res: import("express").Response,
  rows: Array<{
    id: string;
    occurredAt: string | Date;
    actor: string;
    action: string;
    targetType: string;
    targetId: string;
    summary: string;
    prevHash?: string | null;
    hash?: string | null;
  }>,
): void {
  const columns = ["id", "occurredAt", "actor", "action", "targetType", "targetId", "summary", "prevHash", "hash"];
  const csv = [
    columns.map(toCsvCell).join(","),
    ...rows.map((row) =>
      columns.map((column) => toCsvCell(row[column as keyof typeof row])).join(","),
    ),
  ].join("\r\n");
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="peopleos-audit-${new Date().toISOString().slice(0, 10)}.csv"`);
  res.setHeader("Cache-Control", "no-store");
  res.status(200).send(csv);
}


router.get("/audit-events/export.csv", async (req, res): Promise<void> => {
  const membership = await requireRoles(req, res, auditRoles);
  if (!membership) return;
  const { actor, action, validFrom, validTo } = auditFilters(req);

  if (!process.env.DATABASE_URL) {
    const rows = DEMO_AUDIT_STORE
      .filter((event) => event.organizationId === membership.organizationId)
      .filter((event) => !actor || event.actor.toLowerCase().includes(actor.toLowerCase()))
      .filter((event) => !action || event.action.toLowerCase().includes(action.toLowerCase()))
      .filter((event) => !validFrom || new Date(event.occurredAt) >= validFrom)
      .filter((event) => !validTo || new Date(event.occurredAt) <= validTo)
      .map((event) => ({ ...event }));
    sendAuditCsv(res, rows);
    return;
  }

  const conditions = [eq(auditEventsTable.organizationId, membership.organizationId)];
  if (actor) conditions.push(ilike(auditEventsTable.actor, `%${actor}%`));
  if (action) conditions.push(ilike(auditEventsTable.action, `%${action}%`));
  if (validFrom) conditions.push(gte(auditEventsTable.occurredAt, validFrom));
  if (validTo) conditions.push(lte(auditEventsTable.occurredAt, validTo));
  const rows = await db
    .select()
    .from(auditEventsTable)
    .where(and(...conditions))
    .orderBy(desc(auditEventsTable.occurredAt))
    .limit(10_000);
  sendAuditCsv(res, rows);
});

router.get("/audit-events", async (req, res): Promise<void> => {
  const query = ListAuditEventsQueryParams.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: query.error.message });
    return;
  }
  const membership = await requireRoles(req, res, auditRoles);
  if (!membership) return;

  const limit = query.data.limit ?? 30;
  const { actor, action, validFrom, validTo } = auditFilters(req);
  if (!process.env.DATABASE_URL) {
    const events = listDemoAuditEvents(membership.organizationId, 500)
      .filter((event) => !actor || event.actor.toLowerCase().includes(actor.toLowerCase()))
      .filter((event) => !action || event.action.toLowerCase().includes(action.toLowerCase()))
      .filter((event) => !validFrom || new Date(event.occurredAt) >= validFrom)
      .filter((event) => !validTo || new Date(event.occurredAt) <= validTo)
      .slice(0, limit);
    res.json(
      ListAuditEventsResponse.parse(
        events.map((event) => ({
          id: event.id,
          occurredAt: event.occurredAt,
          actor: event.actor,
          action: event.action,
          targetType: event.targetType,
          targetId: event.targetId,
          summary: event.summary,
          prevHash: event.prevHash ?? null,
          hash: event.hash ?? null,
          isDemo: event.isDemo,
        })),
      ),
    );
    return;
  }
  const events = await db
    .select()
    .from(auditEventsTable)
    .where(and(
      eq(auditEventsTable.organizationId, membership.organizationId),
      ...(auditFilters(req).actor ? [ilike(auditEventsTable.actor, `%${auditFilters(req).actor}%`)] : []),
      ...(auditFilters(req).action ? [ilike(auditEventsTable.action, `%${auditFilters(req).action}%`)] : []),
      ...(auditFilters(req).validFrom ? [gte(auditEventsTable.occurredAt, auditFilters(req).validFrom!)] : []),
      ...(auditFilters(req).validTo ? [lte(auditEventsTable.occurredAt, auditFilters(req).validTo!)] : []),
    ))
    .orderBy(desc(auditEventsTable.occurredAt))
    .limit(limit);
  res.json(
    ListAuditEventsResponse.parse(
      events.map((event) => ({
        id: event.id,
        occurredAt: event.occurredAt.toISOString(),
        actor: event.actor,
        action: event.action,
        targetType: event.targetType,
        targetId: event.targetId,
        summary: event.summary,
        prevHash: event.prevHash ?? null,
        hash: event.hash ?? null,
        isDemo: event.isDemo,
      })),
    ),
  );
});

export default router;
