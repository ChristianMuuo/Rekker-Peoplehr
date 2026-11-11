import { getAuth } from "@clerk/express";
import type { Request, Response } from "express";
import { and, eq } from "drizzle-orm";
import {
  db,
  membershipsTable,
  organizationsTable,
  type MembershipRecord,
} from "@workspace/db";

export const PEOPLEOS_ORGANIZATION_ID =
  process.env.PEOPLEOS_ORGANIZATION_ID ?? "rekker-demo";

export const PEOPLEOS_ROLES = {
  employee: "employee",
  departmentManager: "department_manager",
  hrAdmin: "hr_admin",
  hrDirector: "hr_director",
  hrManager: "hr_manager",
  hrOfficer: "hr_officer",
  payrollOfficer: "payroll_officer",
  financeManager: "finance_manager",
  productionSupervisor: "production_supervisor",
  warehouseSupervisor: "warehouse_supervisor",
  salesManager: "sales_manager",
  recruiter: "recruiter",
  executive: "read_only_executive",
  auditor: "auditor",
  systemAdmin: "system_admin",
} as const;

export const MODULE_PERMISSION_MATRIX: Record<
  string,
  { readRoles: readonly string[]; writeRoles: readonly string[]; confidentialIsolated?: boolean }
> = {
  hrAndPeopleCore: {
    readRoles: Object.values(PEOPLEOS_ROLES),
    writeRoles: [PEOPLEOS_ROLES.hrAdmin, PEOPLEOS_ROLES.hrDirector, PEOPLEOS_ROLES.hrManager, PEOPLEOS_ROLES.hrOfficer, PEOPLEOS_ROLES.systemAdmin],
  },
  confidentialHrCases: {
    readRoles: [PEOPLEOS_ROLES.hrAdmin, PEOPLEOS_ROLES.hrDirector, PEOPLEOS_ROLES.hrManager, PEOPLEOS_ROLES.employee],
    writeRoles: [PEOPLEOS_ROLES.hrAdmin, PEOPLEOS_ROLES.hrDirector, PEOPLEOS_ROLES.hrManager, PEOPLEOS_ROLES.employee],
    confidentialIsolated: true,
  },
  payrollAndJournal: {
    readRoles: [PEOPLEOS_ROLES.payrollOfficer, PEOPLEOS_ROLES.financeManager, PEOPLEOS_ROLES.hrAdmin, PEOPLEOS_ROLES.hrDirector, PEOPLEOS_ROLES.systemAdmin, PEOPLEOS_ROLES.auditor],
    writeRoles: [PEOPLEOS_ROLES.payrollOfficer, PEOPLEOS_ROLES.financeManager, PEOPLEOS_ROLES.hrAdmin, PEOPLEOS_ROLES.systemAdmin],
  },
  workforceErpOperations: {
    readRoles: [PEOPLEOS_ROLES.productionSupervisor, PEOPLEOS_ROLES.warehouseSupervisor, PEOPLEOS_ROLES.salesManager, PEOPLEOS_ROLES.financeManager, PEOPLEOS_ROLES.departmentManager, PEOPLEOS_ROLES.hrAdmin, PEOPLEOS_ROLES.hrManager, PEOPLEOS_ROLES.executive, PEOPLEOS_ROLES.systemAdmin],
    writeRoles: [PEOPLEOS_ROLES.productionSupervisor, PEOPLEOS_ROLES.warehouseSupervisor, PEOPLEOS_ROLES.salesManager, PEOPLEOS_ROLES.hrAdmin, PEOPLEOS_ROLES.hrManager, PEOPLEOS_ROLES.systemAdmin],
  },
  auditTrail: {
    readRoles: [PEOPLEOS_ROLES.hrAdmin, PEOPLEOS_ROLES.hrDirector, PEOPLEOS_ROLES.auditor, PEOPLEOS_ROLES.systemAdmin],
    writeRoles: [],
  },
};

const VALID_ROLES = new Set<string>(Object.values(PEOPLEOS_ROLES));

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
  if (process.env.CLERK_SECRET_KEY) return false;
  return (
    process.env.NODE_ENV !== "production" ||
    process.env.PEOPLEOS_DEMO_AUTH === "true"
  );
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
    // Fall through to demo sandbox check
  }

  if (isDemoAuthPermitted()) {
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
  const orgId =
    requestedOrgId && isDemoAuthPermitted()
      ? requestedOrgId
      : PEOPLEOS_ORGANIZATION_ID;

  if (!process.env.DATABASE_URL) {
    return {
      id: orgId,
      name:
        orgId === "rekker-demo"
          ? "Rekker Limited"
          : `Organization (${orgId})`,
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
    return (
      organization ?? {
        id: PEOPLEOS_ORGANIZATION_ID,
        name: "Rekker Breweries Kenya Ltd",
        isDemo: true,
      }
    );
  } catch {
    return {
      id: PEOPLEOS_ORGANIZATION_ID,
      name: "Rekker Breweries Kenya Ltd",
      isDemo: true,
    };
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
  const session = getAuthSessionMeta(req);
  if (!session) {
    res.status(401).json({ error: "Sign in to access this PeopleOS action." });
    return null;
  }

  const userId = session.userId;
  const requestedOrgHeader = req.headers["x-peopleos-org-id"];
  const requestedOrgId =
    typeof requestedOrgHeader === "string" && requestedOrgHeader.trim()
      ? requestedOrgHeader.trim()
      : undefined;

  // Reject cross-tenant header access in live mode
  if (
    requestedOrgId &&
    requestedOrgId !== PEOPLEOS_ORGANIZATION_ID &&
    !isDemoAuthPermitted()
  ) {
    res.status(403).json({
      error: "Cross-tenant organization access is prohibited.",
    });
    return null;
  }

  const organization = await getPeopleOsOrganization(requestedOrgId);
  if (!organization) {
    res.status(503).json({ error: "PeopleOS organization is not initialized." });
    return null;
  }

  // Enforce strict tenant isolation: if a non-demo organization is requested with mismatched ID, deny
  if (
    requestedOrgId &&
    !organization.isDemo &&
    requestedOrgId !== organization.id
  ) {
    res.status(403).json({
      error: "Cross-tenant organization access is prohibited.",
    });
    return null;
  }

  const rawHeaderRole = req.headers["x-peopleos-role"];
  const requestedRole =
    typeof rawHeaderRole === "string" && isDemoAuthPermitted()
      ? rawHeaderRole.trim()
      : undefined;

  if (requestedRole && !VALID_ROLES.has(requestedRole)) {
    res.status(403).json({ error: "Invalid organization role specified." });
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

  if (!process.env.DATABASE_URL) {
    return {
      userId,
      organizationId: organization.id,
      role: simulatedRole,
      employeeId: userId.includes("employee")
        ? "10000000-0000-4000-8000-000000000002"
        : "10000000-0000-4000-8000-000000000007",
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

    if (!membership && organization.isDemo) {
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
      });
      return null;
    }
    return membership;
  } catch {
    if (!organization.isDemo) {
      res.status(503).json({ error: "Authorization database unavailable." });
      return null;
    }
    return {
      userId,
      organizationId: organization.id,
      role: simulatedRole,
      employeeId: null,
      createdAt: new Date(),
    };
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
    res.status(503).json({ error: "PeopleOS organization is not initialized." });
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
    res.status(403).json({ error: "You do not have permission for this action." });
    return null;
  }
  return membership;
}
