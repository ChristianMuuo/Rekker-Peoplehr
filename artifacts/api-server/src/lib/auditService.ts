import crypto from "node:crypto";
import { auditEventsTable, db } from "@workspace/db";
import { logger } from "./logger";

export interface AuditEntry {
  id: string;
  organizationId: string;
  occurredAt: string;
  actor: string;
  actorUserId?: string | null;
  action: string;
  targetType: string;
  targetId: string;
  summary: string;
  beforeJson?: string | null;
  afterJson?: string | null;
  reason?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  requestId?: string | null;
  prevHash?: string | null;
  hash?: string | null;
  correlationId?: string;
  isDemo: boolean;
}

export class AuditPersistenceError extends Error {
  readonly status = 503;
  readonly code = "AUDIT_PERSISTENCE_UNAVAILABLE";
  constructor(message: string = "Audit service unavailable; high-risk action blocked for compliance integrity.") {
    super(message);
    this.name = "AuditPersistenceError";
  }
}

function demoAuditTime(daysAgo: number, hour: number): string {
  const value = new Date();
  value.setUTCDate(value.getUTCDate() - daysAgo);
  value.setUTCHours(hour, 0, 0, 0);
  return value.toISOString();
}

const demoPayrollPeriod = new Date().toISOString().slice(0, 7);

export const DEMO_AUDIT_STORE: AuditEntry[] = [
  {
    id: "audit-001",
    organizationId: "rekker-demo",
    occurredAt: demoAuditTime(1, 14),
    actor: "Demo HR Administrator",
    actorUserId: "user_demo_admin_01",
    action: "LEAVE_APPROVE",
    targetType: "leave_request",
    targetId: "leave-001",
    summary: "Synthetic annual leave approval activity in the sandbox preview.",
    isDemo: true,
  },
  {
    id: "audit-002",
    organizationId: "rekker-demo",
    occurredAt: demoAuditTime(2, 9),
    actor: "Demo Finance Manager",
    actorUserId: "user_demo_payroll_01",
    action: "PAYROLL_GENERATION",
    targetType: "payroll_period",
    targetId: `period-${demoPayrollPeriod}`,
    summary: `Synthetic payroll-period activity for ${demoPayrollPeriod} in the sandbox preview.`,
    isDemo: true,
  },
  {
    id: "audit-003",
    organizationId: "rekker-demo",
    occurredAt: demoAuditTime(4, 16),
    actor: "Demo Recruiter",
    actorUserId: "user_demo_recruiter_01",
    action: "CANDIDATE_SCREEN",
    targetType: "candidate",
    targetId: "cand-001",
    summary: "Synthetic candidate review activity in the sandbox preview.",
    isDemo: true,
  },
];

let forcedAuditFailureForTest = false;
export function __setAuditSinkFailureForTest(fail: boolean): void {
  forcedAuditFailureForTest = fail;
}

export function sanitizeAuditSummary(summary: string): string {
  return summary
    .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, "Bearer [REDACTED]")
    .replace(/enc:v[12]:[^\s]+/gi, "[ENCRYPTED_FIELD]")
    .replace(/\b[A-Z]\d{9}[A-Z]\b/g, "[REDACTED_PIN]")
    .slice(0, 600);
}

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
  before?: unknown;
  after?: unknown;
  reason?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  requestId?: string | null;
  correlationId?: string;
  critical?: boolean;
  isDemo?: boolean;
  tx?: Pick<typeof db, "insert">;
}): Promise<void> {
  const safeSummary = sanitizeAuditSummary(params.summary);
  const fullSummary = params.correlationId
    ? `${safeSummary} [cid:${params.correlationId}]`
    : safeSummary;

  const entry: AuditEntry = {
    id: `audit-${crypto.randomUUID()}`,
    organizationId: params.organizationId,
    occurredAt: new Date().toISOString(),
    actor: params.actor,
    actorUserId: params.actorUserId ?? null,
    action: params.action,
    targetType: params.targetType,
    targetId: params.targetId,
    summary: fullSummary,
    beforeJson: params.before === undefined ? null : JSON.stringify(params.before),
    afterJson: params.after === undefined ? null : JSON.stringify(params.after),
    reason: params.reason ?? null,
    ipAddress: params.ipAddress ?? null,
    userAgent: params.userAgent ?? null,
    requestId: params.requestId ?? params.correlationId ?? null,
    correlationId: params.correlationId,
    isDemo: params.isDemo ?? !process.env.DATABASE_URL,
  };

  if (forcedAuditFailureForTest) {
    logger.error({ action: params.action, critical: params.critical }, "Audit persistence sink failure");
    if (params.critical) {
      throw new AuditPersistenceError();
    }
    return;
  }

  DEMO_AUDIT_STORE.unshift(entry);
  if (DEMO_AUDIT_STORE.length > 500) {
    DEMO_AUDIT_STORE.length = 500;
  }

  if (process.env.DATABASE_URL) {
    const sink = params.tx ?? db;
    try {
      await sink.insert(auditEventsTable).values({
        organizationId: params.organizationId,
        actorUserId: params.actorUserId ?? null,
        actor: params.actor,
        action: params.action,
        targetType: params.targetType,
        targetId: params.targetId,
        summary: fullSummary,
        beforeJson: params.before === undefined ? null : JSON.stringify(params.before),
        afterJson: params.after === undefined ? null : JSON.stringify(params.after),
        reason: params.reason ?? null,
        ipAddress: params.ipAddress ?? null,
        userAgent: params.userAgent ?? null,
        requestId: params.requestId ?? params.correlationId ?? null,
        isDemo: params.isDemo ?? false,
      });
    } catch (err) {
      logger.error(
        {
          event: "AUDIT_PERSISTENCE_FAILED",
          action: params.action,
          targetType: params.targetType,
          critical: Boolean(params.critical),
          err,
        },
        "Failed to persist audit record to PostgreSQL",
      );
      if (params.critical) {
        throw new AuditPersistenceError();
      }
    }
  }
}
