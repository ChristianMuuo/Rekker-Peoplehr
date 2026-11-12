import { getAuth } from "@clerk/express";
import type { Request, Response } from "express";
import { and, eq } from "drizzle-orm";
import {
  db,
  membershipsTable,
  organizationsTable,
  type MembershipRecord,
} from "@workspace/db";
import { resolveAuthMode } from "../config/env";
import {
  ALL_VALID_ROLES,
  MODULE_PERMISSION_MATRIX,
  PEOPLEOS_ROLES,
} from "../lib/authorization";
import { logger } from "../lib/logger";

export { MODULE_PERMISSION_MATRIX, PEOPLEOS_ROLES };
export type { MembershipRecord };

export const PEOPLEOS_ORGANIZATION_ID =
  process.env.PEOPLEOS_ORGANIZATION_ID ?? "rekker-demo";

export type PeopleOsOrganization = {
  id: string;
  name: string;
  isDemo: boolean;
};

export interface AuthSessionMeta {
  userId: string;
  authProvider: "clerk" | "demo_sandbox";
  mfaVerified: boolean;
}

export function isDemoAuthPermitted(): boolean {
  if (process.env.NODE_ENV === "production") return false;
  if (process.env.CLERK_SECRET_KEY) return false;
  const resolved = resolveAuthMode(process.env);
  return resolved.authMode === "demo" && resolved.errors.length === 0;
}

export function getAuthSessionMeta(req: Request): AuthSessionMeta | null {
  try {
    const auth = getAuth(req);
    if (auth?.userId) {
      const claims = (auth.sessionClaims ?? {}) as Record<string, unknown>;
      const fva = claims.fva as number[] | undefined;
      const mfaVerified = Array.isArray(fva) && fva.length >= 2 && fva[1]! >= 0;
      return {
        userId: auth.userId,
        authProvider: "clerk",
        mfaVerified,
      };
    }
  } catch {
    // Only fall back when explicit non-production demo mode is active
  }

  if (isDemoAuthPermitted()) {
    if (req.headers["x-peopleos-auth"] === "signed-out") {
      return null;
    }
    const headerUser = req.headers["x-peopleos-user-id"];
    const userId =
      typeof headerUser === "string" && headerUser.trim().length > 0
        ? headerUser.trim().slice(0, 128)
        : "user_demo_admin_01";
    return {
      userId,
      authProvider: "demo_sandbox",
      mfaVerified: false,
    };
  }

  return null;
}

export async function getPeopleOsOrganization(
  requestedOrgId?: string,
): Promise<PeopleOsOrganization | null> {
  const demoPermitted = isDemoAuthPermitted();
  const orgId =
    requestedOrgId && demoPermitted ? requestedOrgId : PEOPLEOS_ORGANIZATION_ID;

  if (!process.env.DATABASE_URL) {
    if (process.env.NODE_ENV === "production" || !demoPermitted) {
      return null;
    }
    return {
      id: orgId,
      name:
        orgId === "rekker-demo"
          ? "Rekker Limited (Sandbox)"
          : `Sandbox Org (${orgId})`,
      isDemo: true,
    };
  }

  try {
    const [organization] = await db
      .select({
        id: organizationsTable.id,
        name: organizationsTable.name,
        isDemo: organizationsTable.isDemo,
      })
      .from(organizationsTable)
      .where(eq(organizationsTable.id, orgId))
      .limit(1);

    // Fail closed if organization row does not exist in PostgreSQL
    if (!organization) {
      logger.warn({ orgId }, "Organization lookup returned null; failing closed");
      return null;
    }
    return organization;
  } catch (err) {
    // Never downgrade to fabricated demo organization when database lookup fails
    logger.error({ err, orgId }, "Organization database query failed; failing closed");
    return null;
  }
}

export function assertSameTenant(
  membership: MembershipRecord,
  resourceOrgId: string | null | undefined,
): boolean {
  if (!resourceOrgId) return false;
  return membership.organizationId === resourceOrgId;
}

export async function ensureMembership(
  req: Request,
  res: Response,
): Promise<MembershipRecord | null> {
  const demoPermitted = isDemoAuthPermitted();

  // Reject spoofed demo role/user headers whenever Clerk or Production auth is enforced
  if (!demoPermitted && (req.headers["x-peopleos-role"] || req.headers["x-peopleos-user-id"])) {
    res.status(403).json({
      error: "Simulated identity or role headers are prohibited outside explicit sandbox mode.",
      code: "DEMO_HEADERS_FORBIDDEN",
    });
    return null;
  }

  const session = getAuthSessionMeta(req);
  if (!session) {
    res.status(401).json({
      error: "Sign in to access this PeopleOS action.",
      code: "UNAUTHENTICATED",
    });
    return null;
  }

  const userId = session.userId;
  const requestedOrgHeader = req.headers["x-peopleos-org-id"];
  const requestedOrgId =
    typeof requestedOrgHeader === "string" && requestedOrgHeader.trim()
      ? requestedOrgHeader.trim()
      : undefined;

  // Reject cross-tenant header access unless explicitly in demo sandbox mode
  if (
    requestedOrgId &&
    requestedOrgId !== PEOPLEOS_ORGANIZATION_ID &&
    !demoPermitted
  ) {
    res.status(403).json({
      error: "Cross-tenant organization access is prohibited.",
      code: "CROSS_TENANT_DENIED",
    });
    return null;
  }

  const organization = await getPeopleOsOrganization(requestedOrgId);
  if (!organization) {
    res.status(503).json({
      error: "PeopleOS organization is unavailable or not initialized.",
      code: "ORGANIZATION_UNAVAILABLE",
    });
    return null;
  }

  if (
    requestedOrgId &&
    !organization.isDemo &&
    requestedOrgId !== organization.id
  ) {
    res.status(403).json({
      error: "Cross-tenant organization access is prohibited.",
      code: "CROSS_TENANT_DENIED",
    });
    return null;
  }

  const rawHeaderRole = req.headers["x-peopleos-role"];
  const requestedRole =
    typeof rawHeaderRole === "string" && demoPermitted
      ? rawHeaderRole.trim()
      : undefined;

  if (requestedRole && !ALL_VALID_ROLES.has(requestedRole)) {
    res.status(403).json({
      error: "Invalid organization role specified.",
      code: "INVALID_ROLE",
    });
    return null;
  }

  const simulatedRole =
    requestedRole ||
    (userId.includes("employee")
      ? PEOPLEOS_ROLES.employee
      : userId.includes("production")
        ? PEOPLEOS_ROLES.productionSupervisor
        : userId.includes("warehouse")
          ? PEOPLEOS_ROLES.warehouseSupervisor
          : userId.includes("finance")
            ? PEOPLEOS_ROLES.financeManager
            : userId.includes("sales")
              ? PEOPLEOS_ROLES.salesManager
              : userId.includes("recruiter")
                ? PEOPLEOS_ROLES.recruiter
                : userId.includes("payroll")
                  ? PEOPLEOS_ROLES.payrollOfficer
                  : userId.includes("auditor")
                    ? PEOPLEOS_ROLES.auditor
                    : userId.includes("director")
                      ? PEOPLEOS_ROLES.hrDirector
                      : userId.includes("manager")
                        ? PEOPLEOS_ROLES.hrManager
                        : PEOPLEOS_ROLES.hrAdmin);

  const demoEmployeeId =
    simulatedRole === PEOPLEOS_ROLES.employee
      ? "10000000-0000-4000-8000-000000000002"
      : simulatedRole === PEOPLEOS_ROLES.departmentManager ||
          simulatedRole === PEOPLEOS_ROLES.productionSupervisor
        ? "10000000-0000-4000-8000-000000000001"
        : "10000000-0000-4000-8000-000000000007";

  if (!process.env.DATABASE_URL) {
    return {
      userId,
      organizationId: organization.id,
      role: simulatedRole,
      employeeId: demoEmployeeId,
      createdAt: new Date(),
    };
  }

  try {
    let [membership] = await db
      .select()
      .from(membershipsTable)
      .where(
        and(
          eq(membershipsTable.userId, userId),
          eq(membershipsTable.organizationId, organization.id),
        ),
      )
      .limit(1);

    if (!membership && organization.isDemo && demoPermitted) {
      await db
        .insert(membershipsTable)
        .values({
          userId,
          organizationId: organization.id,
          role: simulatedRole,
        })
        .onConflictDoNothing();
      [membership] = await db
        .select()
        .from(membershipsTable)
        .where(
          and(
            eq(membershipsTable.userId, userId),
            eq(membershipsTable.organizationId, organization.id),
          ),
        )
        .limit(1);
    }

    if (!membership) {
      res.status(403).json({
        error: "You do not have a membership in this PeopleOS organization.",
        code: "NO_ORGANIZATION_MEMBERSHIP",
      });
      return null;
    }
    return membership;
  } catch (err) {
    logger.error({ err, organizationId: organization.id }, "Membership lookup failed; failing closed");
    res.status(503).json({
      error: "Authorization database unavailable.",
      code: "AUTH_DB_UNAVAILABLE",
    });
    return null;
  }
}

export async function getReadAccess(
  req: Request,
  res: Response,
): Promise<{
  organization: PeopleOsOrganization;
  membership: MembershipRecord | null;
} | null> {
  const membership = await ensureMembership(req, res);
  if (!membership) return null;

  const organization = await getPeopleOsOrganization(membership.organizationId);
  if (!organization) {
    res.status(503).json({
      error: "PeopleOS organization is not initialized.",
      code: "ORGANIZATION_UNAVAILABLE",
    });
    return null;
  }

  return { organization, membership };
}

export async function requireRoles(
  req: Request,
  res: Response,
  allowedRoles: readonly string[],
): Promise<MembershipRecord | null> {
  const membership = await ensureMembership(req, res);
  if (!membership) return null;
  if (!allowedRoles.includes(membership.role)) {
    res.status(403).json({
      error: "You do not have permission for this action.",
      code: "FORBIDDEN",
    });
    return null;
  }
  return membership;
}
