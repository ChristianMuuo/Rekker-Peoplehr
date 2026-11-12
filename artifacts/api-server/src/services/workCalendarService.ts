import { randomUUID } from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import {
  attendanceCorrectionsTable,
  attendanceRecordsTable,
  db,
  organizationsTable,
  workCalendarsTable,
  type AttendanceCorrectionRecord,
  type WorkCalendarRecord,
} from "@workspace/db";
import { recordAuditEvent } from "../lib/auditService";
import { sanitizeText } from "../lib/security";
import { phase2MemoryStore } from "./phase2MemoryStore";

export const DEFAULT_ORG_TIMEZONE = "Africa/Nairobi";

/**
 * Formats an instant into YYYY-MM-DD and HH:mm using the configured organization/location timezone.
 */
export function getLocalDateTimeInTimezone(
  timezone = DEFAULT_ORG_TIMEZONE,
  instant = new Date(),
): { dateIso: string; timeHm: string; timezone: string } {
  const safeTz = timezone || DEFAULT_ORG_TIMEZONE;
  try {
    const dateParts = new Intl.DateTimeFormat("en-CA", {
      timeZone: safeTz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(instant);

    const timeParts = new Intl.DateTimeFormat("en-GB", {
      timeZone: safeTz,
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).formatToParts(instant);

    const get = (parts: Intl.DateTimeFormatPart[], type: string) =>
      parts.find((p) => p.type === type)?.value ?? "";

    const year = get(dateParts, "year");
    const month = get(dateParts, "month");
    const day = get(dateParts, "day");
    const hour = get(timeParts, "hour");
    const minute = get(timeParts, "minute");

    return {
      dateIso: `${year}-${month}-${day}`,
      timeHm: `${hour}:${minute}`,
      timezone: safeTz,
    };
  } catch {
    return {
      dateIso: instant.toISOString().slice(0, 10),
      timeHm: instant.toISOString().slice(11, 16),
      timezone: "UTC",
    };
  }
}

export async function getWorkCalendars(organizationId: string): Promise<WorkCalendarRecord[]> {
  if (process.env.DATABASE_URL) {
    return db
      .select()
      .from(workCalendarsTable)
      .where(eq(workCalendarsTable.organizationId, organizationId))
      .orderBy(desc(workCalendarsTable.isDefault), workCalendarsTable.name);
  }
  return phase2MemoryStore.workCalendars.filter(
    (c) => c.organizationId === organizationId,
  );
}

export async function resolveEffectiveWorkCalendar(
  organizationId: string,
  location?: string | null,
) {
  const calendars = await getWorkCalendars(organizationId);
  const byLoc = location
    ? calendars.find((c) => c.location && c.location.toLowerCase() === location.toLowerCase())
    : undefined;
  const def = byLoc ?? calendars.find((c) => c.isDefault) ?? calendars[0];

  if (def) {
    return {
      id: def.id,
      name: def.name,
      timezone: def.timezone || DEFAULT_ORG_TIMEZONE,
      workdays: JSON.parse(def.workdaysJson || "[1,2,3,4,5]") as number[],
      holidays: JSON.parse(def.holidaysJson || "[]") as Array<{
        date: string;
        name: string;
      }>,
      shiftStartTime: def.shiftStartTime || "08:00",
      shiftEndTime: def.shiftEndTime || "17:00",
    };
  }

  let orgTz = DEFAULT_ORG_TIMEZONE;
  if (process.env.DATABASE_URL) {
    const [org] = await db
      .select({ defaultTimezone: organizationsTable.defaultTimezone })
      .from(organizationsTable)
      .where(eq(organizationsTable.id, organizationId))
      .limit(1);
    if (org?.defaultTimezone) orgTz = org.defaultTimezone;
  }

  return {
    id: null,
    name: "Organization Default Calendar",
    timezone: orgTz,
    workdays: [1, 2, 3, 4, 5],
    holidays: [] as Array<{ date: string; name: string }>,
    shiftStartTime: "08:00",
    shiftEndTime: "17:00",
  };
}

export async function upsertWorkCalendar(params: {
  organizationId: string;
  actorUserId: string;
  actorName: string;
  name: string;
  location?: string | null;
  timezone: string;
  workdays: number[];
  holidays: Array<{ date: string; name: string }>;
  shiftStartTime: string;
  shiftEndTime: string;
  isDefault: boolean;
}) {
  // Validate timezone using Intl
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: params.timezone });
  } catch {
    throw new Error(`Invalid IANA timezone '${params.timezone}'.`);
  }

  const cleanWorkdays = [...new Set(params.workdays)].filter(
    (d) => Number.isInteger(d) && d >= 0 && d <= 6,
  );
  if (cleanWorkdays.length === 0) {
    throw new Error("At least one working day of the week must be configured.");
  }

  if (process.env.DATABASE_URL) {
    return db.transaction(async (tx) => {
      if (params.isDefault) {
        await tx
          .update(workCalendarsTable)
          .set({ isDefault: false })
          .where(eq(workCalendarsTable.organizationId, params.organizationId));
      }

      const [created] = await tx
        .insert(workCalendarsTable)
        .values({
          organizationId: params.organizationId,
          name: sanitizeText(params.name, 120),
          location: params.location ? sanitizeText(params.location, 120) : null,
          timezone: params.timezone,
          workdaysJson: JSON.stringify(cleanWorkdays),
          holidaysJson: JSON.stringify(params.holidays),
          shiftStartTime: params.shiftStartTime,
          shiftEndTime: params.shiftEndTime,
          isDefault: params.isDefault,
          updatedByUserId: params.actorUserId,
        })
        .returning();

      await recordAuditEvent({
        organizationId: params.organizationId,
        actorUserId: params.actorUserId,
        actor: params.actorName,
        action: "work_calendar.configured",
        targetType: "work_calendar",
        targetId: created!.id,
        summary: `Configured work calendar '${created!.name}' (${created!.timezone}) with ${params.holidays.length} holidays.`,
        tx: tx as unknown as typeof db,
      });

      return created!;
    });
  }

  if (params.isDefault) {
    for (const c of phase2MemoryStore.workCalendars) {
      if (c.organizationId === params.organizationId) {
        c.isDefault = false;
      }
    }
  }
  const now = new Date();
  const created: WorkCalendarRecord = {
    id: randomUUID(),
    organizationId: params.organizationId,
    name: sanitizeText(params.name, 120),
    location: params.location ? sanitizeText(params.location, 120) : null,
    timezone: params.timezone,
    workdaysJson: JSON.stringify(cleanWorkdays),
    holidaysJson: JSON.stringify(params.holidays),
    shiftStartTime: params.shiftStartTime,
    shiftEndTime: params.shiftEndTime,
    isDefault: params.isDefault,
    updatedByUserId: params.actorUserId,
    createdAt: now,
    updatedAt: now,
  };
  phase2MemoryStore.workCalendars.push(created);

  await recordAuditEvent({
    organizationId: params.organizationId,
    actorUserId: params.actorUserId,
    actor: params.actorName,
    action: "work_calendar.configured",
    targetType: "work_calendar",
    targetId: created.id,
    summary: `Configured work calendar '${created.name}' (${created.timezone}) with ${params.holidays.length} holidays.`,
    isDemo: true,
  });

  return created;
}

export function countCalendarWorkingDays(
  startIso: string,
  endIso: string,
  calendar: {
    workdays: number[];
    holidays: Array<{ date: string; name: string }>;
  },
): { workingDays: number; excludedHolidayCount: number } {
  const workdaySet = new Set(calendar.workdays);
  const holidaySet = new Set(calendar.holidays.map((h) => h.date));
  const cursor = new Date(`${startIso}T00:00:00.000Z`);
  const final = new Date(`${endIso}T00:00:00.000Z`);
  let workingDays = 0;
  let excludedHolidayCount = 0;

  while (cursor <= final) {
    const iso = cursor.toISOString().slice(0, 10);
    const weekday = cursor.getUTCDay();
    if (workdaySet.has(weekday)) {
      if (holidaySet.has(iso)) {
        excludedHolidayCount += 1;
      } else {
        workingDays += 1;
      }
    }
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return { workingDays, excludedHolidayCount };
}

export function computeAccruedDaysFromPolicy(params: {
  entitlementDays: number;
  accrualMethod: string;
  employeeStartDate: string;
  asOfIso?: string;
}): number {
  const { entitlementDays, accrualMethod, employeeStartDate } = params;
  if (entitlementDays <= 0) return 0;
  if (accrualMethod !== "monthly_prorata" && accrualMethod !== "prorata") {
    return entitlementDays;
  }

  const asOf = new Date(`${(params.asOfIso ?? new Date().toISOString().slice(0, 10))}T00:00:00.000Z`);
  const yearStart = new Date(Date.UTC(asOf.getUTCFullYear(), 0, 1));
  const start = new Date(`${employeeStartDate.slice(0, 10)}T00:00:00.000Z`);
  const effectiveStart = start > yearStart ? start : yearStart;
  if (effectiveStart > asOf) return 0;

  const monthsCompleted =
    (asOf.getUTCFullYear() - effectiveStart.getUTCFullYear()) * 12 +
    (asOf.getUTCMonth() - effectiveStart.getUTCMonth()) +
    1;
  const cappedMonths = Math.min(12, Math.max(0, monthsCompleted));
  return Math.round(((entitlementDays / 12) * cappedMonths) * 10) / 10;
}

export async function listPersistedAttendanceCorrections(
  organizationId: string,
  filterEmployeeId?: string | null,
) {
  if (process.env.DATABASE_URL) {
    const rows = await db
      .select()
      .from(attendanceCorrectionsTable)
      .where(
        filterEmployeeId
          ? and(
              eq(attendanceCorrectionsTable.organizationId, organizationId),
              eq(attendanceCorrectionsTable.employeeId, filterEmployeeId),
            )
          : eq(attendanceCorrectionsTable.organizationId, organizationId),
      )
      .orderBy(desc(attendanceCorrectionsTable.createdAt));
    return rows;
  }

  return phase2MemoryStore.attendanceCorrections
    .filter(
      (c) =>
        c.organizationId === organizationId &&
        (!filterEmployeeId || c.employeeId === filterEmployeeId),
    )
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
}

export async function createPersistedAttendanceCorrection(params: {
  organizationId: string;
  employeeId: string;
  requestedByUserId: string;
  actorName: string;
  date: string;
  requestedClockIn: string;
  requestedClockOut?: string | null;
  reason: string;
  attendanceRecordId?: string | null;
}) {
  const cleanReason = sanitizeText(params.reason, 400);
  if (!cleanReason) {
    throw new Error("Correction reason is required.");
  }

  if (process.env.DATABASE_URL) {
    const [created] = await db
      .insert(attendanceCorrectionsTable)
      .values({
        organizationId: params.organizationId,
        employeeId: params.employeeId,
        attendanceRecordId: params.attendanceRecordId ?? null,
        date: params.date,
        requestedClockIn: params.requestedClockIn,
        requestedClockOut: params.requestedClockOut ?? null,
        reason: cleanReason,
        status: "pending",
        requestedByUserId: params.requestedByUserId,
      })
      .returning();

    await recordAuditEvent({
      organizationId: params.organizationId,
      actorUserId: params.requestedByUserId,
      actor: params.actorName,
      action: "attendance.correction_requested",
      targetType: "attendance_correction",
      targetId: created!.id,
      summary: `Submitted attendance correction for ${params.date} (${params.requestedClockIn} - ${params.requestedClockOut ?? "open"})`,
    });
    return created!;
  }

  const record: AttendanceCorrectionRecord = {
    id: randomUUID(),
    organizationId: params.organizationId,
    employeeId: params.employeeId,
    attendanceRecordId: params.attendanceRecordId ?? null,
    date: params.date,
    requestedClockIn: params.requestedClockIn,
    requestedClockOut: params.requestedClockOut ?? null,
    reason: cleanReason,
    status: "pending",
    requestedByUserId: params.requestedByUserId,
    reviewedByUserId: null,
    decisionComment: null,
    reviewedAt: null,
    createdAt: new Date(),
  };
  phase2MemoryStore.attendanceCorrections.push(record);

  await recordAuditEvent({
    organizationId: params.organizationId,
    actorUserId: params.requestedByUserId,
    actor: params.actorName,
    action: "attendance.correction_requested",
    targetType: "attendance_correction",
    targetId: record.id,
    summary: `Submitted attendance correction for ${params.date}`,
    isDemo: true,
  });

  return record;
}

export async function decidePersistedAttendanceCorrection(params: {
  organizationId: string;
  correctionId: string;
  reviewerUserId: string;
  reviewerName: string;
  decision: "approved" | "rejected";
  comment?: string;
  demoAttendance?: Array<any>;
}) {
  const existing = process.env.DATABASE_URL
    ? (
        await db
          .select()
          .from(attendanceCorrectionsTable)
          .where(
            and(
              eq(attendanceCorrectionsTable.organizationId, params.organizationId),
              eq(attendanceCorrectionsTable.id, params.correctionId),
            ),
          )
          .limit(1)
      )[0]
    : phase2MemoryStore.attendanceCorrections.find(
        (c) => c.organizationId === params.organizationId && c.id === params.correctionId,
      );

  if (!existing) {
    return { ok: false as const, statusCode: 404, error: "Attendance correction not found." };
  }
  if (existing.status !== "pending") {
    return { ok: false as const, statusCode: 400, error: "Correction has already been decided." };
  }
  if (existing.requestedByUserId === params.reviewerUserId) {
    return {
      ok: false as const,
      statusCode: 403,
      error: "Segregation of duties: employees cannot approve their own attendance corrections.",
    };
  }

  if (process.env.DATABASE_URL) {
    return db.transaction(async (tx) => {
      if (params.decision === "approved") {
        const matchingRows = await tx
          .select()
          .from(attendanceRecordsTable)
          .where(
            and(
              eq(attendanceRecordsTable.organizationId, params.organizationId),
              eq(attendanceRecordsTable.employeeId, existing.employeeId),
              eq(attendanceRecordsTable.date, existing.date),
            ),
          )
          .limit(1);

        if (matchingRows[0]) {
          await tx
            .update(attendanceRecordsTable)
            .set({
              clockIn: existing.requestedClockIn,
              clockOut: existing.requestedClockOut ?? matchingRows[0].clockOut,
              anomalyFlag: `Corrected (${params.decision}): ${existing.reason}`,
            })
            .where(eq(attendanceRecordsTable.id, matchingRows[0].id));
        } else {
          await tx.insert(attendanceRecordsTable).values({
            organizationId: params.organizationId,
            employeeId: existing.employeeId,
            date: existing.date,
            shift: "Day Shift (08:00-17:00)",
            clockIn: existing.requestedClockIn,
            clockOut: existing.requestedClockOut ?? null,
            status: "on_time",
            anomalyFlag: `Created via approved correction: ${existing.reason}`,
          });
        }
      }

      const [updated] = await tx
        .update(attendanceCorrectionsTable)
        .set({
          status: params.decision,
          reviewedByUserId: params.reviewerUserId,
          decisionComment: params.comment ?? null,
          reviewedAt: new Date(),
        })
        .where(eq(attendanceCorrectionsTable.id, existing.id))
        .returning();

      await recordAuditEvent({
        organizationId: params.organizationId,
        actorUserId: params.reviewerUserId,
        actor: params.reviewerName,
        action: `attendance.correction_${params.decision}`,
        targetType: "attendance_correction",
        targetId: existing.id,
        summary: `${params.decision} attendance correction for ${existing.date}`,
        tx: tx as unknown as typeof db,
      });

      return { ok: true as const, correction: updated! };
    });
  }

  if (params.decision === "approved" && params.demoAttendance) {
    const rec = params.demoAttendance.find(
      (r) => r.employeeId === existing.employeeId && r.date === existing.date,
    );
    if (rec) {
      rec.clockIn = existing.requestedClockIn;
      if (existing.requestedClockOut) rec.clockOut = existing.requestedClockOut;
    } else {
      params.demoAttendance.unshift({
        id: randomUUID(),
        employeeId: existing.employeeId,
        date: existing.date,
        shift: "Day Shift (08:00-17:00)",
        clockIn: existing.requestedClockIn,
        clockOut: existing.requestedClockOut ?? null,
        status: "on_time",
        overtimeHours: 0,
        notes: `Approved correction: ${existing.reason}`,
      });
    }
  }

  existing.status = params.decision;
  existing.reviewedByUserId = params.reviewerUserId;
  existing.decisionComment = params.comment ?? null;
  existing.reviewedAt = new Date();

  await recordAuditEvent({
    organizationId: params.organizationId,
    actorUserId: params.reviewerUserId,
    actor: params.reviewerName,
    action: `attendance.correction_${params.decision}`,
    targetType: "attendance_correction",
    targetId: existing.id,
    summary: `${params.decision} attendance correction for ${existing.date}`,
    isDemo: true,
  });

  return { ok: true as const, correction: existing };
}
