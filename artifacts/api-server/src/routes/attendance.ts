import { Router, type IRouter, type Request, type Response } from "express";
import {
  ensureMembership,
  requireRoles,
  PEOPLEOS_ROLES,
} from "../middlewares/peopleosAccess";

const router: IRouter = Router();

export interface AttendanceItem {
  id: string;
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

let ATTENDANCE_RECORDS: AttendanceItem[] = [
  {
    id: "att_01",
    employeeId: "10000000-0000-4000-8000-000000000001",
    employeeName: "Achieng Odhiambo",
    departmentName: "Manufacturing & Brewing",
    date: "2026-03-06",
    shift: "Morning (06:00 - 14:00)",
    clockIn: "05:52",
    clockOut: "14:15",
    status: "on_time",
    overtimeHours: 0.25,
  },
  {
    id: "att_02",
    employeeId: "10000000-0000-4000-8000-000000000002",
    employeeName: "Mwangi Kariuki",
    departmentName: "Manufacturing & Brewing",
    date: "2026-03-06",
    shift: "Morning (06:00 - 14:00)",
    clockIn: "05:58",
    clockOut: "14:30",
    status: "overtime",
    overtimeHours: 0.5,
  },
  {
    id: "att_03",
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

// GET /api/attendance & /api/attendance/records
router.get(["/attendance", "/attendance/records"], async (req: Request, res: Response) => {
  const membership = await ensureMembership(req, res);
  if (!membership) return;

  const date = (req.query.date as string) || "2026-03-06";
  const records = ATTENDANCE_RECORDS.filter((r) => !date || r.date === date);
  res.json({ date, items: records, total: records.length });
});

// POST /api/attendance/clock-in
router.post("/attendance/clock-in", async (req: Request, res: Response) => {
  const membership = await ensureMembership(req, res);
  if (!membership) return;

  const { employeeId = "10000000-0000-4000-8000-000000000007", shift = "Day (08:30 - 17:00)" } = req.body;
  const now = new Date();
  const timeStr = now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const dateStr = now.toISOString().slice(0, 10);

  const newRecord = {
    id: `att_${Date.now()}`,
    employeeId,
    employeeName: "David Kibet",
    departmentName: "People Operations & Culture",
    date: dateStr,
    shift,
    clockIn: timeStr,
    clockOut: null,
    status: "on_time",
    overtimeHours: 0,
  };

  ATTENDANCE_RECORDS.unshift(newRecord);
  res.status(201).json(newRecord);
});

// POST /api/attendance/clock-out
router.post("/attendance/clock-out", async (req: Request, res: Response) => {
  const membership = await ensureMembership(req, res);
  if (!membership) return;

  const { employeeId = "10000000-0000-4000-8000-000000000007" } = req.body;
  const now = new Date();
  const timeStr = now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

  const record = ATTENDANCE_RECORDS.find((r) => r.employeeId === employeeId && !r.clockOut);
  if (record) {
    record.clockOut = timeStr;
    res.json(record);
  } else {
    res.status(404).json({ error: "Active shift record not found to clock out." });
  }
});

// GET /api/attendance/anomalies - Attendance anomaly detection
router.get("/attendance/anomalies", async (req: Request, res: Response) => {
  const membership = await ensureMembership(req, res);
  if (!membership) return;

  const anomalies = ATTENDANCE_RECORDS.filter((r) => r.status === "late" || r.anomalyFlag);
  res.json({
    totalAnomalies: anomalies.length,
    anomalies: anomalies.map((a) => ({
      recordId: a.id,
      employee: a.employeeName,
      department: a.departmentName,
      type: "UNUSUAL_CLOCK_IN",
      message: a.anomalyFlag || "Late clock-in recorded",
      confidence: 0.94,
    })),
  });
});

export default router;
