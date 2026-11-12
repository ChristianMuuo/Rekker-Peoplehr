import crypto from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import { Router, type IRouter, type Request, type Response } from "express";
import { attendanceRecordsTable, db } from "@workspace/db";
import { recordAuditEvent } from "../lib/auditService";
import { runPythonMlTask } from "../lib/mlBridge";
import { sanitizeText } from "../lib/security";
import {
  ensureMembership,
  PEOPLEOS_ROLES,
  requireRoles,
  type MembershipRecord,
} from "../middlewares/peopleosAccess";
import { DEMO_EMPLOYEES_LIST } from "./peopleos";
import {
  createPersistedAttendanceCorrection,
  decidePersistedAttendanceCorrection,
  getLocalDateTimeInTimezone,
  listPersistedAttendanceCorrections,
  resolveEffectiveWorkCalendar,
} from "../services/workCalendarService";

const router: IRouter = Router();

const managerRoles = [
  PEOPLEOS_ROLES.hrAdmin,
  PEOPLEOS_ROLES.hrManager,
  PEOPLEOS_ROLES.systemAdmin,
  PEOPLEOS_ROLES.departmentManager,
];

export interface AttendanceItem {
  id: string;
  organizationId: string;
  employeeId: string;
  employeeName: string;
  departmentName: string;
  date: string;
  shift: string;
  clockIn: string | null;
  clockOut: string | null;
  status: string;
  overtimeHours: number;
  anomalyFlag?: string | null;
}

export interface AttendanceCorrectionItem {
  id: string;
  organizationId: string;
  employeeId: string;
  employeeName: string;
  date: string;
  requestedClockIn: string;
  requestedClockOut: string;
  reason: string;
  status: "pending" | "approved" | "rejected";
  submittedAt: string;
  decidedByUserId: string | null;
}

let ATTENDANCE_RECORDS: AttendanceItem[] = [
  {
    id: "att_01",
    organizationId: "rekker-demo",
    employeeId: "10000000-0000-4000-8000-000000000001",
    employeeName: "Achieng Odhiambo",
    departmentName: "Formulation & Filling",
    date: "2026-03-06",
    shift: "Morning (06:00 - 14:00)",
    clockIn: "05:52",
    clockOut: "14:15",
    status: "on_time",
    overtimeHours: 0.25,
  },
  {
    id: "att_02",
    organizationId: "rekker-demo",
    employeeId: "10000000-0000-4000-8000-000000000002",
    employeeName: "Mwangi Kariuki",
    departmentName: "Formulation & Filling",
    date: "2026-03-06",
    shift: "Morning (06:00 - 14:00)",
    clockIn: "05:58",
    clockOut: "16:30",
    status: "overtime",
    overtimeHours: 2.5,
  },
  {
    id: "att_03",
    organizationId: "rekker-demo",
    employeeId: "10000000-0000-4000-8000-000000000003",
    employeeName: "Juma Omondi",
    departmentName: "Logistics & Distribution",
    date: "2026-03-06",
    shift: "Day (08:30 - 17:00)",
    clockIn: "08:48",
    clockOut: null,
    status: "late",
    overtimeHours: 0,
    anomalyFlag: "Late arrival: 18 minutes past shift start",
  },
];

const ATTENDANCE_CORRECTIONS: AttendanceCorrectionItem[] = [
  {
    id: "corr_01",
    organizationId: "rekker-demo",
    employeeId: "10000000-0000-4000-8000-000000000003",
    employeeName: "Juma Omondi",
    date: "2026-03-06",
    requestedClockIn: "08:30",
    requestedClockOut: "17:05",
    reason: "Gate biometric scanner had power delay at Nairobi Central Hub.",
    status: "pending",
    submittedAt: "2026-03-06T09:10:00Z",
    decidedByUserId: null,
  },
];

function resolveAttendanceTargetEmployee(
  membership: MembershipRecord,
  requestedEmployeeId: unknown,
): { ok: true; employeeId: string } | { ok: false; statusCode: number; error: string } {
  const reqId =
    typeof requestedEmployeeId === "string" && requestedEmployeeId.trim()
      ? requestedEmployeeId.trim()
      : null;
  const isManager = managerRoles.includes(membership.role as any);

  if (reqId && reqId !== membership.employeeId && !isManager) {
    return {
      ok: false,
      statusCode: 403,
      error: "Forbidden: you may only record attendance for your own linked employee profile.",
    };
  }
  const targetId = isManager && reqId ? reqId : membership.employeeId;
  if (!targetId) {
    return {
      ok: false,
      statusCode: 403,
      error: "Account is not linked to an employee record in this organization.",
    };
  }
  return { ok: true, employeeId: targetId };
}

// GET /api/attendance & /api/attendance/records
router.get(["/attendance", "/attendance/records"], async (req: Request, res: Response) => {
  const membership = await ensureMembership(req, res);
  if (!membership) return;

  const date = req.query.date as string | undefined;

  if (!process.env.DATABASE_URL) {
    let items = ATTENDANCE_RECORDS.filter(
      (r) =>
        r.organizationId === membership.organizationId &&
        (!date || r.date === date),
    );
    if (membership.role === PEOPLEOS_ROLES.employee) {
      items = membership.employeeId
        ? items.filter((r) => r.employeeId === membership.employeeId)
        : [];
    }
    res.json({ date: date || "2026-03-06", items, total: items.length });
    return;
  }

  let items = await db
    .select()
    .from(attendanceRecordsTable)
    .where(eq(attendanceRecordsTable.organizationId, membership.organizationId))
    .orderBy(desc(attendanceRecordsTable.createdAt));

  if (date) items = items.filter((r) => r.date === date);
  if (membership.role === PEOPLEOS_ROLES.employee) {
    items = membership.employeeId
      ? items.filter((r) => r.employeeId === membership.employeeId)
      : [];
  }
  res.json({ date: date || "all", items, total: items.length });
});

// POST /api/attendance/clock-in
router.post("/attendance/clock-in", async (req: Request, res: Response) => {
  const membership = await ensureMembership(req, res);
  if (!membership) return;

  const resolved = resolveAttendanceTargetEmployee(membership, req.body?.employeeId);
  if (!resolved.ok) {
    res.status(resolved.statusCode).json({ error: resolved.error });
    return;
  }
  const employeeId = resolved.employeeId;
  const shift = typeof req.body?.shift === "string" ? req.body.shift : "Day (08:00 - 17:00)";

  const emp = DEMO_EMPLOYEES_LIST.find((e) => e.id === employeeId);
  const calendar = await resolveEffectiveWorkCalendar(
    membership.organizationId,
    emp?.location ?? null,
  );
  const localNow = getLocalDateTimeInTimezone(calendar.timezone);
  const timeStr = localNow.timeHm;
  const dateStr = localNow.dateIso;

  let hasOpenShift = false;
  if (!process.env.DATABASE_URL) {
    hasOpenShift = ATTENDANCE_RECORDS.some(
      (r) =>
        r.organizationId === membership.organizationId &&
        r.employeeId === employeeId &&
        r.date === dateStr &&
        !r.clockOut,
    );
  } else {
    const existingRows = await db
      .select({ id: attendanceRecordsTable.id, clockOut: attendanceRecordsTable.clockOut })
      .from(attendanceRecordsTable)
      .where(
        and(
          eq(attendanceRecordsTable.organizationId, membership.organizationId),
          eq(attendanceRecordsTable.employeeId, employeeId),
          eq(attendanceRecordsTable.date, dateStr),
        ),
      );
    hasOpenShift = existingRows.some((r) => !r.clockOut);
  }

  const anomalyFlag = hasOpenShift
    ? "Duplicate active clock-in detected for same shift date"
    : null;

  const isLate = timeStr > calendar.shiftStartTime;

  const newRecord: AttendanceItem = {
    id: `att_${Date.now()}`,
    organizationId: membership.organizationId,
    employeeId,
    employeeName: emp ? `${emp.firstName} ${emp.lastName}` : "Employee",
    departmentName: emp?.departmentName || "Operations",
    date: dateStr,
    shift: sanitizeText(shift, 80),
    clockIn: timeStr,
    clockOut: null,
    status: isLate ? "late" : "on_time",
    overtimeHours: 0,
    anomalyFlag,
  };

  if (!process.env.DATABASE_URL) {
    ATTENDANCE_RECORDS.unshift(newRecord);
  } else {
    const [created] = await db
      .insert(attendanceRecordsTable)
      .values({
        organizationId: membership.organizationId,
        employeeId: newRecord.employeeId,
        date: newRecord.date,
        shift: newRecord.shift,
        clockIn: newRecord.clockIn,
        status: newRecord.status,
        overtimeHours: 0,
        anomalyFlag,
      })
      .returning();
    newRecord.id = created!.id;
  }

  await recordAuditEvent({
    organizationId: membership.organizationId,
    actorUserId: membership.userId,
    actor: membership.role,
    action: "ATTENDANCE_CLOCK_IN",
    targetType: "attendance",
    targetId: newRecord.id,
    summary: `${newRecord.employeeName} clocked in at ${timeStr} (${calendar.timezone}).`,
  });

  res.status(201).json({ ...newRecord, timezone: calendar.timezone });
});

// POST /api/attendance/clock-out
router.post("/attendance/clock-out", async (req: Request, res: Response) => {
  const membership = await ensureMembership(req, res);
  if (!membership) return;

  const resolved = resolveAttendanceTargetEmployee(membership, req.body?.employeeId);
  if (!resolved.ok) {
    res.status(resolved.statusCode).json({ error: resolved.error });
    return;
  }
  const employeeId = resolved.employeeId;

  const emp = DEMO_EMPLOYEES_LIST.find((e) => e.id === employeeId);
  const calendar = await resolveEffectiveWorkCalendar(
    membership.organizationId,
    emp?.location ?? null,
  );
  const localNow = getLocalDateTimeInTimezone(calendar.timezone);
  const timeStr = localNow.timeHm;

  if (!process.env.DATABASE_URL) {
    const record = ATTENDANCE_RECORDS.find(
      (r) =>
        r.organizationId === membership.organizationId &&
        r.employeeId === employeeId &&
        !r.clockOut,
    );
    if (!record) {
      res.status(404).json({ error: "Active shift record not found to clock out." });
      return;
    }
    record.clockOut = timeStr;
    res.json({ ...record, timezone: calendar.timezone });
    return;
  }

  const rows = await db
    .select()
    .from(attendanceRecordsTable)
    .where(
      and(
        eq(attendanceRecordsTable.organizationId, membership.organizationId),
        eq(attendanceRecordsTable.employeeId, employeeId),
      ),
    )
    .orderBy(desc(attendanceRecordsTable.createdAt));

  const openRec = rows.find((r) => !r.clockOut);
  if (!openRec) {
    res.status(404).json({ error: "Active shift record not found to clock out." });
    return;
  }
  const [updated] = await db
    .update(attendanceRecordsTable)
    .set({ clockOut: timeStr })
    .where(eq(attendanceRecordsTable.id, openRec.id))
    .returning();
  res.json({ ...updated, timezone: calendar.timezone });
});

// GET /api/attendance/corrections
router.get("/attendance/corrections", async (req: Request, res: Response) => {
  const membership = await ensureMembership(req, res);
  if (!membership) return;

  const isManager = managerRoles.includes(membership.role as any);
  const filterEmpId = isManager ? null : membership.employeeId;
  if (!isManager && !membership.employeeId) {
    res.json({ items: [], total: 0 });
    return;
  }

  const persisted = await listPersistedAttendanceCorrections(
    membership.organizationId,
    filterEmpId,
  );
  const empMap = new Map(
    DEMO_EMPLOYEES_LIST.map((e) => [e.id, `${e.firstName} ${e.lastName}`]),
  );

  // Merge legacy seed only in demo mode if no persisted corrections yet match its ID
  const enriched = persisted.map((c) => ({
    ...c,
    employeeName: empMap.get(c.employeeId) ?? c.employeeId,
  }));

  res.json({ items: enriched, total: enriched.length });
});

// POST /api/attendance/corrections
router.post("/attendance/corrections", async (req: Request, res: Response) => {
  const membership = await ensureMembership(req, res);
  if (!membership) return;

  const { date, requestedClockIn, requestedClockOut, reason, employeeId } =
    req.body ?? {};
  if (!date || !requestedClockIn || !reason) {
    res.status(400).json({ error: "date, requestedClockIn, and reason are required." });
    return;
  }

  const resolved = resolveAttendanceTargetEmployee(membership, employeeId);
  if (!resolved.ok) {
    res.status(resolved.statusCode).json({ error: resolved.error });
    return;
  }

  try {
    const created = await createPersistedAttendanceCorrection({
      organizationId: membership.organizationId,
      employeeId: resolved.employeeId,
      requestedByUserId: membership.userId,
      actorName: membership.role,
      date: String(date).slice(0, 10),
      requestedClockIn: sanitizeText(requestedClockIn, 10),
      requestedClockOut: requestedClockOut ? sanitizeText(requestedClockOut, 10) : null,
      reason: sanitizeText(reason, 400),
    });
    const emp = DEMO_EMPLOYEES_LIST.find((e) => e.id === resolved.employeeId);
    res.status(201).json({
      ...created,
      employeeName: emp ? `${emp.firstName} ${emp.lastName}` : created.employeeId,
    });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : "Invalid correction." });
  }
});

// POST /api/attendance/corrections/:id/decision
router.post(
  "/attendance/corrections/:id/decision",
  async (req: Request, res: Response) => {
    const membership = await requireRoles(req, res, managerRoles);
    if (!membership) return;

    const id = String(req.params.id ?? "");
    const { decision, comment } = req.body ?? {};
    const normalizedDecision =
      decision === "approve" || decision === "approved"
        ? "approved"
        : decision === "reject" || decision === "rejected"
          ? "rejected"
          : null;

    if (!normalizedDecision) {
      res.status(400).json({ error: "Decision must be approve or reject." });
      return;
    }

    const result = await decidePersistedAttendanceCorrection({
      organizationId: membership.organizationId,
      correctionId: id,
      reviewerUserId: membership.userId,
      reviewerName: membership.role,
      decision: normalizedDecision,
      comment: typeof comment === "string" ? comment : undefined,
      demoAttendance: ATTENDANCE_RECORDS,
    });

    if (!result.ok) {
      res.status(result.statusCode).json({ error: result.error });
      return;
    }

    res.json(result.correction);
  },
);

// GET /api/attendance/anomalies - Runs Python ML IsolationForest + duplicate punch detection
router.get("/attendance/anomalies", async (req: Request, res: Response) => {
  const membership = await ensureMembership(req, res);
  if (!membership) return;

  const scoped = ATTENDANCE_RECORDS.filter(
    (r) => r.organizationId === membership.organizationId,
  );
  try {
    const ml = await runPythonMlTask("attendance_anomalies", {
      records: scoped,
      isDemo: true,
    });
    res.json(ml);
  } catch {
    const anomalies = scoped.filter((r) => r.status === "late" || r.anomalyFlag);
    res.json({
      totalAnomalies: anomalies.length,
      anomalies: anomalies.map((a) => ({
        recordId: a.id,
        employeeName: a.employeeName,
        department: a.departmentName,
        type: "UNUSUAL_CLOCK_IN",
        explanation: a.anomalyFlag || "Late clock-in recorded",
      })),
    });
  }
});

export default router;
