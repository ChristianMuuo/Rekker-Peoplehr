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

export const DEMO_AUDIT_EVENTS = [
  { id: 'audit-001', occurredAt: '2026-03-05T14:20:00.000Z', actor: 'David Kibet (HR Admin)', action: 'LEAVE_APPROVE', targetType: 'leave_request', targetId: 'leave-001', summary: 'Approved annual leave for Wanjiku Kimani', isDemo: true },
  { id: 'audit-002', occurredAt: '2026-03-01T09:00:00.000Z', actor: 'Dennis Otieno (Finance)', action: 'PAYROLL_GENERATION', targetType: 'payroll_period', targetId: 'period-2026-02', summary: 'Finalized statutory KRA & NSSF payroll report for February 2026', isDemo: true },
  { id: 'audit-003', occurredAt: '2026-02-28T16:45:00.000Z', actor: 'Faith Chebet (Recruiter)', action: 'CANDIDATE_SCREEN', targetType: 'candidate', targetId: 'cand-001', summary: 'Completed phone interview scorecard for Brewing Engineer candidate', isDemo: true },
];

router.get("/audit-events", async (req, res): Promise<void> => {
  const query = ListAuditEventsQueryParams.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: query.error.message });
    return;
  }
  const membership = await requireRoles(req, res, auditRoles);
  if (!membership) return;
  if (!process.env.DATABASE_URL) {
    res.json(ListAuditEventsResponse.parse(DEMO_AUDIT_EVENTS));
    return;
  }
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
