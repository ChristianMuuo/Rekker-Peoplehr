import { desc, eq } from "drizzle-orm";
import { Router, type IRouter } from "express";
import {
  ListAuditEventsQueryParams,
  ListAuditEventsResponse,
} from "@workspace/api-zod";
import { auditEventsTable, db } from "@workspace/db";
import {
  PEOPLEOS_ORGANIZATION_ID,
  PEOPLEOS_ROLES,
  requireRoles,
} from "../middlewares/peopleosAccess";

const router: IRouter = Router();
const auditRoles = [
  PEOPLEOS_ROLES.hrAdmin,
  PEOPLEOS_ROLES.hrManager,
  PEOPLEOS_ROLES.systemAdmin,
  PEOPLEOS_ROLES.auditor,
];

router.get("/audit-events", async (req, res): Promise<void> => {
  const query = ListAuditEventsQueryParams.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: query.error.message });
    return;
  }
  const membership = await requireRoles(req, res, auditRoles);
  if (!membership) return;
  const events = await db
    .select()
    .from(auditEventsTable)
    .where(eq(auditEventsTable.organizationId, PEOPLEOS_ORGANIZATION_ID))
    .orderBy(desc(auditEventsTable.occurredAt))
    .limit(query.data.limit ?? 30);
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
        isDemo: event.isDemo,
      })),
    ),
  );
});

export default router;
