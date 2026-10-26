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
  const [organization] = await db
    .select({
      id: organizationsTable.id,
      name: organizationsTable.name,
      isDemo: organizationsTable.isDemo,
    })
    .from(organizationsTable)
    .where(eq(organizationsTable.id, PEOPLEOS_ORGANIZATION_ID))
    .limit(1);
  return organization ?? null;
}

export async function ensureMembership(
  req: Request,
  res: Response,
): Promise<MembershipRecord | null> {
  const userId = getAuth(req).userId;
  if (!userId) {
    res.status(401).json({ error: "Sign in to access this PeopleOS action." });
    return null;
  }

  const organization = await getPeopleOsOrganization();
  if (!organization) {
    res.status(503).json({ error: "PeopleOS organization is not initialized." });
    return null;
  }

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
        role: PEOPLEOS_ROLES.hrAdmin,
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

  const userId = getAuth(req).userId;
  if (organization.isDemo && !userId) {
    return { organization, membership: null };
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
