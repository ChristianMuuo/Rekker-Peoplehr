import crypto from "node:crypto";
import { auditEventsTable, db } from "@workspace/db";

export interface AuditEntry {
  id: string;
  organizationId: string;
  occurredAt: string;
  actor: string;
  actorUserId: string | null;
  action: string;
  targetType: string;
  targetId: string;
  summary: string;
  isDemo: boolean;
}

const DEMO_AUDIT_STORE: AuditEntry[] = [
  {
    id: "audit-001",
    organizationId: "rekker-demo",
    occurredAt: "2026-03-05T14:20:00.000Z",
    actor: "David Kibet (hr_admin)",
    actorUserId: "user_demo_admin_01",
    action: "LEAVE_APPROVE",
    targetType: "leave_request",
    targetId: "leave-001",
    summary: "Approved annual leave for Wanjiku Kimani",
    isDemo: true,
  },
  {
    id: "audit-002",
    organizationId: "rekker-demo",
    occurredAt: "2026-03-01T09:00:00.000Z",
    actor: "Dennis Otieno (payroll_officer)",
    actorUserId: "user_demo_payroll_01",
    action: "PAYROLL_GENERATION",
    targetType: "payroll_period",
    targetId: "period-2026-02",
    summary: "Finalized statutory KRA & NSSF payroll report for February 2026",
    isDemo: true,
  },
  {
    id: "audit-003",
    organizationId: "rekker-demo",
    occurredAt: "2026-02-28T16:45:00.000Z",
    actor: "Faith Chebet (recruiter)",
    actorUserId: "user_demo_recruiter_01",
    action: "CANDIDATE_SCREEN",
    targetType: "candidate",
    targetId: "cand-001",
    summary: "Completed phone interview scorecard for Brewing Engineer candidate",
    isDemo: true,
  },
];

export function listDemoAuditEvents(
  organizationId: string,
  limit: number = 30,
): AuditEntry[] {
  return DEMO_AUDIT_STORE.filter(
    (e) => e.organizationId === organizationId,
  ).slice(0, limit);
}

export async function recordAuditEvent(params: {
  organizationId: string;
  actorUserId?: string | null;
  actor: string;
  action: string;
  targetType: string;
  targetId: string;
  summary: string;
  isDemo?: boolean;
}): Promise<void> {
  const entry: AuditEntry = {
    id: `audit-${crypto.randomUUID()}`,
    organizationId: params.organizationId,
    occurredAt: new Date().toISOString(),
    actor: params.actor,
    actorUserId: params.actorUserId ?? null,
    action: params.action,
    targetType: params.targetType,
    targetId: params.targetId,
    summary: params.summary,
    isDemo: params.isDemo ?? !process.env.DATABASE_URL,
  };

  DEMO_AUDIT_STORE.unshift(entry);
  if (DEMO_AUDIT_STORE.length > 500) {
    DEMO_AUDIT_STORE.length = 500;
  }

  if (process.env.DATABASE_URL) {
    try {
      await db.insert(auditEventsTable).values({
        organizationId: params.organizationId,
        actorUserId: params.actorUserId ?? null,
        actor: params.actor,
        action: params.action,
        targetType: params.targetType,
        targetId: params.targetId,
        summary: params.summary,
        isDemo: params.isDemo ?? false,
      });
    } catch {
      // Do not fail primary business action if DB fallback audit sink hits transient error
    }
  }
}

