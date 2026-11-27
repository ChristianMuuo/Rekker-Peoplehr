import { desc, eq } from "drizzle-orm";
import { Router, type IRouter } from "express";
import {
  ListAuditEventsQueryParams,
  ListAuditEventsResponse,
} from "@workspace/api-zod";
import { auditEventsTable, db } from "@workspace/db";
import { listDemoAuditEvents } from "../lib/auditService";
import {
  MODULE_PERMISSION_MATRIX,
  requireRoles,
} from "../middlewares/peopleosAccess";

const router: IRouter = Router();
const auditRoles = MODULE_PERMISSION_MATRIX.auditTrail.readRoles;

router.get("/audit-events", async (req, res): Promise<void> => {
  const query = ListAuditEventsQueryParams.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: query.error.message });
    return;
  }
  const membership = await requireRoles(req, res, auditRoles);
  if (!membership) return;

  const limit = query.data.limit ?? 30;
  const actionFilter = typeof req.query.action === "string" ? req.query.action.trim().toLowerCase() : "";
  const targetTypeFilter = typeof req.query.targetType === "string" ? req.query.targetType.trim().toLowerCase() : "";
  const actorFilter = typeof req.query.actor === "string" ? req.query.actor.trim().toLowerCase() : "";

  if (!process.env.DATABASE_URL) {
    let items = listDemoAuditEvents(membership.organizationId, 500);
    if (actionFilter) items = items.filter((e) => e.action.toLowerCase().includes(actionFilter));
    if (targetTypeFilter) items = items.filter((e) => e.targetType.toLowerCase() === targetTypeFilter);
    if (actorFilter) items = items.filter((e) => e.actor.toLowerCase().includes(actorFilter));
    res.json(
      ListAuditEventsResponse.parse(
        items.slice(0, limit).map((event) => ({
          id: event.id,
          occurredAt: event.occurredAt,
          actor: event.actor,
          action: event.action,
          targetType: event.targetType,
          targetId: event.targetId,
          summary: event.summary,
          isDemo: event.isDemo,
        })),
      ),
    );
    return;
  }
  let events = await db
    .select()
    .from(auditEventsTable)
    .where(eq(auditEventsTable.organizationId, membership.organizationId))
    .orderBy(desc(auditEventsTable.occurredAt))
    .limit(Math.max(limit, 200));
  if (actionFilter) events = events.filter((e) => e.action.toLowerCase().includes(actionFilter));
  if (targetTypeFilter) events = events.filter((e) => e.targetType.toLowerCase() === targetTypeFilter);
  if (actorFilter) events = events.filter((e) => e.actor.toLowerCase().includes(actorFilter));
  res.json(
    ListAuditEventsResponse.parse(
      events.slice(0, limit).map((event) => ({
        id: event.id,
        occurredAt: event.occurredAt.toISOString(),
        actor: event.actor,
        action: event.action,
        targetType: event.targetType,
        targetId: event.targetId,
        summary: event.summary,
        isDemo: event.isDemo,
      })),
    ),
  );
});

router.get("/audit-events/export.csv", async (req, res): Promise<void> => {
  const membership = await requireRoles(req, res, auditRoles);
  if (!membership) return;

  const rows = !process.env.DATABASE_URL
    ? listDemoAuditEvents(membership.organizationId, 500)
    : (
        await db
          .select()
          .from(auditEventsTable)
          .where(eq(auditEventsTable.organizationId, membership.organizationId))
          .orderBy(desc(auditEventsTable.occurredAt))
          .limit(500)
      ).map((e) => ({
        id: e.id,
        occurredAt: e.occurredAt.toISOString(),
        actor: e.actor,
        action: e.action,
        targetType: e.targetType,
        targetId: e.targetId,
        summary: e.summary,
      }));

  const csvCell = (val: string) => `"${String(val).replaceAll('"', '""')}"`;
  const lines = [
    ["id", "occurredAt", "actor", "action", "targetType", "targetId", "summary"].join(","),
    ...rows.map((r) =>
      [r.id, r.occurredAt, r.actor, r.action, r.targetType, r.targetId, r.summary]
        .map(csvCell)
        .join(","),
    ),
  ];

  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", 'attachment; filename="rekker-audit-log.csv"');
  res.send(lines.join("\n"));
});

export default router;
