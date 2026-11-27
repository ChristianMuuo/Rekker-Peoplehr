import { and, eq } from "drizzle-orm";
import { Router, type IRouter, type Request, type Response } from "express";
import {
  db,
  publicHolidaysTable,
  systemSettingsTable,
  workSchedulesTable,
} from "@workspace/db";
import { recordAuditEvent } from "../lib/auditService";
import {
  ensureMembership,
  PEOPLEOS_ROLES,
  requireRoles,
} from "../middlewares/peopleosAccess";

const router: IRouter = Router();

const adminRoles: readonly string[] = [
  PEOPLEOS_ROLES.hrAdmin,
  PEOPLEOS_ROLES.hrManager,
  PEOPLEOS_ROLES.systemAdmin,
];

interface DemoWorkSchedule {
  id: string;
  organizationId: string;
  code: string;
  name: string;
  patternType: string;
  workdaysJson: string;
  hoursPerDay: number;
  isDefault: boolean;
}

interface DemoHoliday {
  id: string;
  organizationId: string;
  holidayDate: string;
  name: string;
  holidayType: string;
  year: number;
  isActive: boolean;
}

interface DemoSettings {
  organizationId: string;
  organizationName: string;
  defaultTimezone: string;
  workingDaysJson: string;
  holidayCountry: string;
  leaveApprovalChainJson: string;
  allowSelfApproval: boolean;
  requireAdminMfa: boolean;
  auditRetentionDays: number;
}

const DEMO_WORK_SCHEDULES: DemoWorkSchedule[] = [
  {
    id: "ws-default-ke-5day",
    organizationId: "rekker-demo",
    code: "KE_STANDARD_5D",
    name: "Nairobi Standard (Mon-Fri, 08:00-17:00)",
    patternType: "5_day",
    workdaysJson: "[1,2,3,4,5]",
    hoursPerDay: 8,
    isDefault: true,
  },
];

const DEMO_PUBLIC_HOLIDAYS: DemoHoliday[] = [
  { id: "hol-ke-0101", organizationId: "rekker-demo", holidayDate: "2026-01-01", name: "New Year's Day", holidayType: "gazetted", year: 2026, isActive: true },
  { id: "hol-ke-0501", organizationId: "rekker-demo", holidayDate: "2026-05-01", name: "Labour Day", holidayType: "gazetted", year: 2026, isActive: true },
  { id: "hol-ke-0601", organizationId: "rekker-demo", holidayDate: "2026-06-01", name: "Madaraka Day", holidayType: "gazetted", year: 2026, isActive: true },
  { id: "hol-ke-1010", organizationId: "rekker-demo", holidayDate: "2026-10-10", name: "Mazingira Day", holidayType: "gazetted", year: 2026, isActive: true },
  { id: "hol-ke-1020", organizationId: "rekker-demo", holidayDate: "2026-10-20", name: "Mashujaa Day", holidayType: "gazetted", year: 2026, isActive: true },
  { id: "hol-ke-1212", organizationId: "rekker-demo", holidayDate: "2026-12-12", name: "Jamhuri Day", holidayType: "gazetted", year: 2026, isActive: true },
  { id: "hol-ke-1225", organizationId: "rekker-demo", holidayDate: "2026-12-25", name: "Christmas Day", holidayType: "gazetted", year: 2026, isActive: true },
  { id: "hol-ke-1226", organizationId: "rekker-demo", holidayDate: "2026-12-26", name: "Utamaduni / Boxing Day", holidayType: "gazetted", year: 2026, isActive: true },
];

const DEMO_SETTINGS = new Map<string, DemoSettings>([
  [
    "rekker-demo",
    {
      organizationId: "rekker-demo",
      organizationName: "Rekker Limited",
      defaultTimezone: "Africa/Nairobi",
      workingDaysJson: "[1,2,3,4,5]",
      holidayCountry: "KE",
      leaveApprovalChainJson: '["department_manager","hr_manager"]',
      allowSelfApproval: false,
      requireAdminMfa: false,
      auditRetentionDays: 2555,
    },
  ],
]);

router.get("/leave/work-schedules", async (req: Request, res: Response): Promise<void> => {
  const membership = await ensureMembership(req, res);
  if (!membership) return;
  if (!process.env.DATABASE_URL) {
    res.json({
      items: DEMO_WORK_SCHEDULES.filter((s) => s.organizationId === membership.organizationId),
    });
    return;
  }
  const rows = await db
    .select()
    .from(workSchedulesTable)
    .where(eq(workSchedulesTable.organizationId, membership.organizationId));
  res.json({ items: rows });
});

router.post("/leave/work-schedules", async (req: Request, res: Response): Promise<void> => {
  const membership = await requireRoles(req, res, adminRoles);
  if (!membership) return;
  const name = typeof req.body?.name === "string" ? req.body.name.trim() : "";
  const code =
    typeof req.body?.code === "string" && req.body.code.trim()
      ? req.body.code.trim().toUpperCase()
      : name.toUpperCase().replace(/[^A-Z0-9]+/g, "_").slice(0, 32);
  if (!name || !code) {
    res.status(400).json({ error: "Work schedule name and code are required." });
    return;
  }
  const workdaysJson = Array.isArray(req.body?.workdays)
    ? JSON.stringify(req.body.workdays)
    : "[1,2,3,4,5]";
  const hoursPerDay = Number(req.body?.hoursPerDay) || 8;
  const isDefault = Boolean(req.body?.isDefault);

  if (!process.env.DATABASE_URL) {
    const created: DemoWorkSchedule = {
      id: `ws-${Date.now()}`,
      organizationId: membership.organizationId,
      code,
      name,
      patternType: String(req.body?.patternType || "5_day"),
      workdaysJson,
      hoursPerDay,
      isDefault,
    };
    DEMO_WORK_SCHEDULES.push(created);
    await recordAuditEvent({
      organizationId: membership.organizationId,
      actorUserId: membership.userId,
      actor: membership.role,
      action: "work_schedule_created",
      targetType: "work_schedule",
      targetId: created.id,
      summary: `Created work schedule ${name}.`,
      isDemo: true,
    });
    res.status(201).json(created);
    return;
  }

  const [created] = await db
    .insert(workSchedulesTable)
    .values({
      organizationId: membership.organizationId,
      code,
      name,
      patternType: String(req.body?.patternType || "5_day"),
      workdaysJson,
      hoursPerDay,
      isDefault,
    })
    .returning();
  res.status(201).json(created);
});

router.get("/leave/public-holidays/:year", async (req: Request, res: Response): Promise<void> => {
  const membership = await ensureMembership(req, res);
  if (!membership) return;
  const year = Number(req.params.year) || new Date().getUTCFullYear();
  if (!process.env.DATABASE_URL) {
    const items = DEMO_PUBLIC_HOLIDAYS.filter(
      (h) => h.organizationId === membership.organizationId && h.year === year && h.isActive,
    );
    res.json({ year, items });
    return;
  }
  const items = await db
    .select()
    .from(publicHolidaysTable)
    .where(
      and(
        eq(publicHolidaysTable.organizationId, membership.organizationId),
        eq(publicHolidaysTable.year, year),
        eq(publicHolidaysTable.isActive, true),
      ),
    );
  res.json({ year, items });
});

router.post("/leave/public-holidays", async (req: Request, res: Response): Promise<void> => {
  const membership = await requireRoles(req, res, adminRoles);
  if (!membership) return;
  const holidayDate = typeof req.body?.holidayDate === "string" ? req.body.holidayDate.trim() : "";
  const name = typeof req.body?.name === "string" ? req.body.name.trim() : "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(holidayDate) || !name) {
    res.status(400).json({ error: "holidayDate (YYYY-MM-DD) and name are required." });
    return;
  }
  const year = Number(holidayDate.slice(0, 4));
  if (!process.env.DATABASE_URL) {
    const item: DemoHoliday = {
      id: `hol-${Date.now()}`,
      organizationId: membership.organizationId,
      holidayDate,
      name,
      holidayType: String(req.body?.holidayType || "gazetted"),
      year,
      isActive: true,
    };
    DEMO_PUBLIC_HOLIDAYS.push(item);
    res.status(201).json(item);
    return;
  }
  const [created] = await db
    .insert(publicHolidaysTable)
    .values({
      organizationId: membership.organizationId,
      holidayDate,
      name,
      holidayType: String(req.body?.holidayType || "gazetted"),
      year,
      isActive: true,
    })
    .returning();
  res.status(201).json(created);
});

router.get("/settings", async (req: Request, res: Response): Promise<void> => {
  const membership = await requireRoles(req, res, adminRoles);
  if (!membership) return;
  if (!process.env.DATABASE_URL) {
    const existing = DEMO_SETTINGS.get(membership.organizationId) ?? {
      organizationId: membership.organizationId,
      organizationName: "Rekker Limited",
      defaultTimezone: "Africa/Nairobi",
      workingDaysJson: "[1,2,3,4,5]",
      holidayCountry: "KE",
      leaveApprovalChainJson: '["department_manager","hr_manager"]',
      allowSelfApproval: false,
      requireAdminMfa: false,
      auditRetentionDays: 2555,
    };
    res.json(existing);
    return;
  }
  const [row] = await db
    .select()
    .from(systemSettingsTable)
    .where(eq(systemSettingsTable.organizationId, membership.organizationId))
    .limit(1);
  res.json(
    row ?? {
      organizationId: membership.organizationId,
      organizationName: "Rekker Limited",
      defaultTimezone: "Africa/Nairobi",
      workingDaysJson: "[1,2,3,4,5]",
      holidayCountry: "KE",
      leaveApprovalChainJson: '["department_manager","hr_manager"]',
      allowSelfApproval: false,
      requireAdminMfa: false,
      auditRetentionDays: 2555,
    },
  );
});

router.patch("/settings", async (req: Request, res: Response): Promise<void> => {
  const membership = await requireRoles(req, res, adminRoles);
  if (!membership) return;
  const orgName =
    typeof req.body?.organizationName === "string" ? req.body.organizationName.trim() : undefined;
  const retention =
    typeof req.body?.auditRetentionDays === "number" ? req.body.auditRetentionDays : undefined;

  if (!process.env.DATABASE_URL) {
    const current = DEMO_SETTINGS.get(membership.organizationId) ?? {
      organizationId: membership.organizationId,
      organizationName: "Rekker Limited",
      defaultTimezone: "Africa/Nairobi",
      workingDaysJson: "[1,2,3,4,5]",
      holidayCountry: "KE",
      leaveApprovalChainJson: '["department_manager","hr_manager"]',
      allowSelfApproval: false,
      requireAdminMfa: false,
      auditRetentionDays: 2555,
    };
    const updated: DemoSettings = {
      ...current,
      ...(orgName ? { organizationName: orgName } : {}),
      ...(retention !== undefined ? { auditRetentionDays: retention } : {}),
      ...(typeof req.body?.requireAdminMfa === "boolean"
        ? { requireAdminMfa: req.body.requireAdminMfa }
        : {}),
    };
    DEMO_SETTINGS.set(membership.organizationId, updated);
    await recordAuditEvent({
      organizationId: membership.organizationId,
      actorUserId: membership.userId,
      actor: membership.role,
      action: "system_settings_updated",
      targetType: "system_settings",
      targetId: membership.organizationId,
      summary: "Updated organization workspace settings.",
      isDemo: true,
    });
    res.json(updated);
    return;
  }

  const [updated] = await db
    .insert(systemSettingsTable)
    .values({
      organizationId: membership.organizationId,
      organizationName: orgName || "Rekker Limited",
      auditRetentionDays: retention ?? 2555,
      updatedByUserId: membership.userId,
    })
    .onConflictDoUpdate({
      target: systemSettingsTable.organizationId,
      set: {
        ...(orgName ? { organizationName: orgName } : {}),
        ...(retention !== undefined ? { auditRetentionDays: retention } : {}),
        updatedByUserId: membership.userId,
      },
    })
    .returning();
  res.json(updated);
});

export default router;
