import crypto from "node:crypto";
import { auditEventsTable, db } from "@workspace/db";
import { desc, eq, sql } from "drizzle-orm";
import { logger } from "./logger";

type AuditTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
type AuditSink = typeof db | AuditTransaction;

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
  correlationId?: string;
  isDemo: boolean;
  prevHash?: string | null;
  hash?: string | null;
}

export class AuditPersistenceError extends Error {
  readonly status = 503;
  readonly code = "AUDIT_PERSISTENCE_UNAVAILABLE";
  constructor(message: string = "Audit service unavailable; high-risk action blocked for compliance integrity.") {
    super(message);
    this.name = "AuditPersistenceError";
  }
}

function demoAuditTime(daysAgo: number): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - daysAgo);
  date.setUTCHours(9, 0, 0, 0);
  return date.toISOString();
}

function previousDemoPayrollPeriod(now = new Date()): { period: string; label: string } {
  const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  return {
    period: `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`,
    label: date.toLocaleDateString("en-KE", { month: "long", year: "numeric", timeZone: "Africa/Nairobi" }),
  };
}

const demoPayrollPeriod = previousDemoPayrollPeriod();

export const DEMO_AUDIT_STORE: AuditEntry[] = [
  {
    id: "audit-001",
    organizationId: "rekker-demo",
    occurredAt: demoAuditTime(1),
    actor: "Demo HR Administrator",
    actorUserId: "user_demo_admin_01",
    action: "LEAVE_APPROVE",
    targetType: "leave_request",
    targetId: "leave-demo-approved",
    summary: "Approved annual leave request in synthetic sandbox data.",
    isDemo: true,
  },
  {
    id: "audit-002",
    organizationId: "rekker-demo",
    occurredAt: demoAuditTime(3),
    actor: "Demo Finance Manager",
    actorUserId: "user_demo_payroll_01",
    action: "PAYROLL_GENERATION",
    targetType: "payroll_period",
    targetId: `period-${demoPayrollPeriod.period}`,
    summary: `Generated a fictional payroll preview for ${demoPayrollPeriod.label}.`,
    isDemo: true,
  },
  {
    id: "audit-003",
    organizationId: "rekker-demo",
    occurredAt: demoAuditTime(6),
    actor: "Demo Recruiter",
    actorUserId: "user_demo_recruiter_01",
    action: "CANDIDATE_SCREEN",
    targetType: "candidate",
    targetId: "cand-demo-001",
    summary: "Reviewed a fictional candidate profile in the sandbox.",
    isDemo: true,
  },
];

let priorDemoHash: string | null = null;
for (const entry of [...DEMO_AUDIT_STORE].reverse()) {
  entry.prevHash = priorDemoHash;
  entry.hash = crypto.createHash("sha256").update(JSON.stringify({
    organizationId: entry.organizationId,
    actorUserId: entry.actorUserId ?? null,
    actor: entry.actor,
    action: entry.action,
    targetType: entry.targetType,
    targetId: entry.targetId,
    summary: entry.summary,
    occurredAt: entry.occurredAt,
    prevHash: priorDemoHash,
  })).digest("hex");
  priorDemoHash = entry.hash;
}

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
  correlationId?: string;
  critical?: boolean;
  isDemo?: boolean;
  tx?: AuditSink;
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

  if (process.env.DATABASE_URL) {
    const persist = async (sink: AuditSink): Promise<void> => {
      // All audit writes use one transaction and an organisation-scoped advisory
      // lock. Monotonic timestamps make the hash chain deterministic under concurrency.
      await sink.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${params.organizationId}))`);
      const [previous] = await sink
        .select({
          hash: auditEventsTable.hash,
          occurredAt: auditEventsTable.occurredAt,
        })
        .from(auditEventsTable)
        .where(eq(auditEventsTable.organizationId, params.organizationId))
        .orderBy(desc(auditEventsTable.occurredAt))
        .limit(1);
      const prevHash = previous?.hash ?? null;
      const candidateTime = Date.parse(entry.occurredAt);
      const previousTime = previous?.occurredAt?.getTime() ?? 0;
      const occurredAt = new Date(Math.max(candidateTime, previousTime + 1)).toISOString();
      entry.occurredAt = occurredAt;
      const hash = crypto
        .createHash("sha256")
        .update(JSON.stringify({
          organizationId: params.organizationId,
          actorUserId: params.actorUserId ?? null,
          actor: params.actor,
          action: params.action,
          targetType: params.targetType,
          targetId: params.targetId,
          summary: fullSummary,
          occurredAt,
          prevHash,
        }))
        .digest("hex");
      entry.prevHash = prevHash;
      entry.hash = hash;
      await sink.insert(auditEventsTable).values({
        organizationId: params.organizationId,
        actorUserId: params.actorUserId ?? null,
        actor: params.actor,
        action: params.action,
        targetType: params.targetType,
        targetId: params.targetId,
        summary: fullSummary,
        occurredAt: new Date(occurredAt),
        prevHash,
        hash,
        isDemo: params.isDemo ?? false,
      });
    };

    try {
      if (params.tx) {
        await persist(params.tx);
      } else {
        await db.transaction(async (tx) => persist(tx));
      }
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
  } else {
    entry.prevHash = DEMO_AUDIT_STORE[0]?.hash ?? null;
    entry.hash = crypto
      .createHash("sha256")
      .update(JSON.stringify({
        organizationId: entry.organizationId,
        actorUserId: entry.actorUserId,
        actor: entry.actor,
        action: entry.action,
        targetType: entry.targetType,
        targetId: entry.targetId,
        summary: entry.summary,
        occurredAt: entry.occurredAt,
        prevHash: entry.prevHash,
      }))
      .digest("hex");
    DEMO_AUDIT_STORE.unshift(entry);
    if (DEMO_AUDIT_STORE.length > 500) DEMO_AUDIT_STORE.length = 500;
  }
}
