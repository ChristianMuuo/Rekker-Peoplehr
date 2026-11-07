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
  systemAdmin: "system_admin",
  executive: "read_only_executive",
  auditor: "auditor",
  hrManager: "hr_manager",
  recruiter: "recruiter",
  payrollOfficer: "payroll_officer",
} as const;

export type PeopleOsOrganization = {
  id: string;
  name: string;
  isDemo: boolean;
};

export async function getPeopleOsOrganization(): Promise<PeopleOsOrganization | null> {
  if (!process.env.DATABASE_URL) {
    return {
      id: PEOPLEOS_ORGANIZATION_ID,
      name: "Rekker Breweries Kenya Ltd",
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
      .where(eq(organizationsTable.id, PEOPLEOS_ORGANIZATION_ID))
      .limit(1);
    return organization ?? {
      id: PEOPLEOS_ORGANIZATION_ID,
      name: "Rekker Breweries Kenya Ltd",
      isDemo: true,
    };
  } catch {
    return {
      id: PEOPLEOS_ORGANIZATION_ID,
      name: "Rekker Breweries Kenya Ltd",
      isDemo: true,
    };
  }
}

export async function ensureMembership(
  req: Request,
  res: Response,
): Promise<MembershipRecord | null> {
  let userId: string | null | undefined = null;
  try {
    userId = getAuth(req).userId;
  } catch {}

  if (!userId && (process.env.NODE_ENV !== "production" || !process.env.CLERK_SECRET_KEY)) {
    userId = (req.headers["x-peopleos-user-id"] as string) || "user_demo_admin_01";
  }

  if (!userId) {
    res.status(401).json({ error: "Sign in to access this PeopleOS action." });
    return null;
  }

  const organization = await getPeopleOsOrganization();
  if (!organization) {
    res.status(503).json({ error: "PeopleOS organization is not initialized." });
    return null;
  }

  const simulatedRole =
    (req.headers["x-peopleos-role"] as string) ||
    (userId.includes("employee")
      ? PEOPLEOS_ROLES.employee
      : userId.includes("manager")
      ? PEOPLEOS_ROLES.hrManager
      : PEOPLEOS_ROLES.hrAdmin);

  if (!process.env.DATABASE_URL) {
    return {
      userId,
      organizationId: organization.id,
      role: simulatedRole,
      employeeId: null,
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
  const organization = await getPeopleOsOrganization();
  if (!organization) {
    res.status(503).json({ error: "PeopleOS organization is not initialized." });
    return null;
  }

  const membership = await ensureMembership(req, res);
  if (!membership) return null;
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
