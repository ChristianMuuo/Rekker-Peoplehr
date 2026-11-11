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
} from "../middlewares/peopleosAccess";
import { DEMO_EMPLOYEES_LIST } from "./peopleos";

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
    if (membership.role === PEOPLEOS_ROLES.employee && membership.employeeId) {
      items = items.filter((r) => r.employeeId === membership.employeeId);
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
  if (membership.role === PEOPLEOS_ROLES.employee && membership.employeeId) {
    items = items.filter((r) => r.employeeId === membership.employeeId);
  }
  res.json({ date: date || "all", items, total: items.length });
});

// POST /api/attendance/clock-in
router.post("/attendance/clock-in", async (req: Request, res: Response) => {
  const membership = await ensureMembership(req, res);
  if (!membership) return;

  const {
    employeeId = membership.employeeId || "10000000-0000-4000-8000-000000000007",
    shift = "Day (08:30 - 17:00)",
  } = req.body ?? {};

  const emp = DEMO_EMPLOYEES_LIST.find((e) => e.id === employeeId);
  const now = new Date();
  const timeStr = `${String(now.getHours()).padStart(2, "0")}:${String(
    now.getMinutes(),
  ).padStart(2, "0")}`;
  const dateStr = now.toISOString().slice(0, 10);

  // Detect duplicate same-day clock-in
  const existingToday = ATTENDANCE_RECORDS.find(
    (r) =>
      r.organizationId === membership.organizationId &&
      r.employeeId === employeeId &&
      r.date === dateStr &&
      !r.clockOut,
  );
  const anomalyFlag = existingToday
    ? "Duplicate active clock-in detected for same shift date"
    : null;

  const newRecord: AttendanceItem = {
    id: `att_${Date.now()}`,
    organizationId: membership.organizationId,
    employeeId: String(employeeId),
    employeeName: emp ? `${emp.firstName} ${emp.lastName}` : "Teammate",
    departmentName: emp?.departmentName || "Operations",
    date: dateStr,
    shift: sanitizeText(shift, 80),
    clockIn: timeStr,
    clockOut: null,
    status: "on_time",
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
    summary: `${newRecord.employeeName} clocked in at ${timeStr}.`,
  });

  res.status(201).json(newRecord);
});

// POST /api/attendance/clock-out
router.post("/attendance/clock-out", async (req: Request, res: Response) => {
  const membership = await ensureMembership(req, res);
  if (!membership) return;

  const {
    employeeId = membership.employeeId || "10000000-0000-4000-8000-000000000007",
  } = req.body ?? {};
  const now = new Date();
  const timeStr = `${String(now.getHours()).padStart(2, "0")}:${String(
    now.getMinutes(),
  ).padStart(2, "0")}`;

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
    res.json(record);
    return;
  }

  const rows = await db
    .select()
    .from(attendanceRecordsTable)
    .where(
      and(
        eq(attendanceRecordsTable.organizationId, membership.organizationId),
        eq(attendanceRecordsTable.employeeId, String(employeeId)),
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
  res.json(updated);
});

// GET /api/attendance/corrections
router.get("/attendance/corrections", async (req: Request, res: Response) => {
  const membership = await ensureMembership(req, res);
  if (!membership) return;

  let items = ATTENDANCE_CORRECTIONS.filter(
    (c) => c.organizationId === membership.organizationId,
  );
  if (membership.role === PEOPLEOS_ROLES.employee && membership.employeeId) {
    items = items.filter((c) => c.employeeId === membership.employeeId);
  }
  res.json({ items, total: items.length });
});

// POST /api/attendance/corrections
router.post("/attendance/corrections", async (req: Request, res: Response) => {
  const membership = await ensureMembership(req, res);
  if (!membership) return;

  const { date, requestedClockIn, requestedClockOut, reason, employeeId } =
    req.body ?? {};
  if (!date || !requestedClockIn || !requestedClockOut || !reason) {
    res.status(400).json({ error: "date, requestedClockIn, requestedClockOut, and reason are required." });
    return;
  }
  const targetEmpId =
    managerRoles.includes(membership.role as any) && employeeId
      ? String(employeeId)
      : membership.employeeId || "10000000-0000-4000-8000-000000000007";
  const emp = DEMO_EMPLOYEES_LIST.find((e) => e.id === targetEmpId);

  const item: AttendanceCorrectionItem = {
    id: `corr_${crypto.randomUUID().slice(0, 8)}`,
    organizationId: membership.organizationId,
    employeeId: targetEmpId,
    employeeName: emp ? `${emp.firstName} ${emp.lastName}` : "Teammate",
    date: String(date).slice(0, 10),
    requestedClockIn: sanitizeText(requestedClockIn, 10),
    requestedClockOut: sanitizeText(requestedClockOut, 10),
    reason: sanitizeText(reason, 400),
    status: "pending",
    submittedAt: new Date().toISOString(),
    decidedByUserId: null,
  };
  ATTENDANCE_CORRECTIONS.unshift(item);

  await recordAuditEvent({
    organizationId: membership.organizationId,
    actorUserId: membership.userId,
    actor: membership.role,
    action: "ATTENDANCE_CORRECTION_SUBMITTED",
    targetType: "attendance_correction",
    targetId: item.id,
    summary: `Attendance correction requested for ${item.employeeName} (${item.date}).`,
    isDemo: true,
  });

  res.status(201).json(item);
});

// POST /api/attendance/corrections/:id/decision
router.post(
  "/attendance/corrections/:id/decision",
  async (req: Request, res: Response) => {
    const membership = await requireRoles(req, res, managerRoles);
    if (!membership) return;

    const id = String(req.params.id ?? "");
    const { decision } = req.body ?? {};
    if (decision !== "approve" && decision !== "reject") {
      res.status(400).json({ error: "Decision must be approve or reject." });
      return;
    }

    const item = ATTENDANCE_CORRECTIONS.find(
      (c) => c.id === id && c.organizationId === membership.organizationId,
    );
    if (!item) {
      res.status(404).json({ error: "Correction request not found." });
      return;
    }
    item.status = decision === "approve" ? "approved" : "rejected";
    item.decidedByUserId = membership.userId;

    await recordAuditEvent({
      organizationId: membership.organizationId,
      actorUserId: membership.userId,
      actor: membership.role,
      action: `ATTENDANCE_CORRECTION_${item.status.toUpperCase()}`,
      targetType: "attendance_correction",
      targetId: item.id,
      summary: `Attendance correction for ${item.employeeName} ${item.status}.`,
      isDemo: true,
    });

    res.json(item);
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
