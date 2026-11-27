import crypto from "node:crypto";
import { desc, eq } from "drizzle-orm";
import { auditLogTable, db } from "@workspace/db";

export interface HashChainedAuditInput {
  organizationId: string;
  actorUserId?: string | null;
  actorRole: string;
  actorDisplayName: string;
  action: string;
  module?: string;
  entityType: string;
  entityId: string;
  affectedEmployeeId?: string | null;
  beforeJson?: unknown;
  afterJson?: unknown;
  reason?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  correlationId?: string | null;
  isDemo?: boolean;
}

export function computeAuditEntryHash(
  prevHash: string,
  fields: {
    organizationId: string;
    actorUserId: string | null;
    action: string;
    entityType: string;
    entityId: string;
    occurredAtIso: string;
  },
): string {
  const canonical = [
    prevHash,
    fields.organizationId,
    fields.actorUserId ?? "",
    fields.action,
    fields.entityType,
    fields.entityId,
    fields.occurredAtIso,
  ].join("|");
  return crypto.createHash("sha256").update(canonical).digest("hex");
}

export async function appendHashChainedAudit(input: HashChainedAuditInput): Promise<{ hash: string; prevHash: string }> {
  const occurredAt = new Date();
  const occurredAtIso = occurredAt.toISOString();

  if (!process.env.DATABASE_URL) {
    const hash = computeAuditEntryHash("GENESIS", {
      organizationId: input.organizationId,
      actorUserId: input.actorUserId ?? null,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId,
      occurredAtIso,
    });
    return { prevHash: "GENESIS", hash };
  }

  const [latest] = await db
    .select({ hash: auditLogTable.hash })
    .from(auditLogTable)
    .where(eq(auditLogTable.organizationId, input.organizationId))
    .orderBy(desc(auditLogTable.occurredAt))
    .limit(1);

  const prevHash = latest?.hash ?? "GENESIS";
  const hash = computeAuditEntryHash(prevHash, {
    organizationId: input.organizationId,
    actorUserId: input.actorUserId ?? null,
    action: input.action,
    entityType: input.entityType,
    entityId: input.entityId,
    occurredAtIso,
  });

  await db.insert(auditLogTable).values({
    organizationId: input.organizationId,
    actorUserId: input.actorUserId ?? null,
    actorRole: input.actorRole,
    actorDisplayName: input.actorDisplayName,
    action: input.action,
    module: input.module ?? "core",
    entityType: input.entityType,
    entityId: input.entityId,
    affectedEmployeeId: input.affectedEmployeeId ?? null,
    beforeJson: input.beforeJson !== undefined ? JSON.stringify(input.beforeJson) : null,
    afterJson: input.afterJson !== undefined ? JSON.stringify(input.afterJson) : null,
    reason: input.reason ?? null,
    ipAddress: input.ipAddress ?? null,
    userAgent: input.userAgent ?? null,
    correlationId: input.correlationId ?? null,
    prevHash,
    hash,
    occurredAt,
    isDemo: Boolean(input.isDemo),
  });

  return { prevHash, hash };
}
