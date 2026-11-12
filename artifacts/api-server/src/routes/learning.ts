import crypto from "node:crypto";
import { and, eq } from "drizzle-orm";
import { Router, type IRouter, type Request, type Response } from "express";
import { coursesTable, db, employeeTrainingTable } from "@workspace/db";
import { recordAuditEvent } from "../lib/auditService";
import { sanitizeText } from "../lib/security";
import {
  ensureMembership,
  PEOPLEOS_ROLES,
  requireRoles,
} from "../middlewares/peopleosAccess";

const router: IRouter = Router();

interface DemoCourse {
  id: string;
  organizationId: string;
  title: string;
  category: string;
  durationHours: number;
  provider: string;
  status: "mandatory" | "elective";
  enrolledCount: number;
  completedCount: number;
}

const DEMO_COURSES: DemoCourse[] = [
  {
    id: "course_01",
    organizationId: "rekker-demo",
    title: "DOSHS Plant Safety, Chemical Handling & Filling Line Operations",
    category: "Health & Safety",
    durationHours: 6,
    provider: "DOSHS Accredited Academy",
    status: "mandatory",
    enrolledCount: 10,
    completedCount: 9,
  },
  {
    id: "course_02",
    organizationId: "rekker-demo",
    title: "KEBS Consumer Goods Formulation & Batch Quality Standards",
    category: "Quality & GMP",
    durationHours: 4,
    provider: "KEBS Institute",
    status: "mandatory",
    enrolledCount: 10,
    completedCount: 8,
  },
  {
    id: "course_03",
    organizationId: "rekker-demo",
    title: "Kenya Data Protection Act 2019 & Workplace Privacy",
    category: "Legal & Compliance",
    durationHours: 3,
    provider: "ODPC Compliance Portal",
    status: "mandatory",
    enrolledCount: 10,
    completedCount: 10,
  },
  {
    id: "course_04",
    organizationId: "rekker-demo",
    title: "Automated Filling Line & Batch Quality Control Optimization",
    category: "Technical Operations",
    durationHours: 12,
    provider: "Nairobi Industrial Polytechnic",
    status: "elective",
    enrolledCount: 4,
    completedCount: 3,
  },
];

// GET /api/learning/courses
router.get("/learning/courses", async (req: Request, res: Response) => {
  const membership = await ensureMembership(req, res);
  if (!membership) return;

  if (!process.env.DATABASE_URL) {
    const items = DEMO_COURSES.filter(
      (c) => c.organizationId === membership.organizationId,
    );
    res.json({ items, total: items.length });
    return;
  }

  const courses = await db
    .select()
    .from(coursesTable)
    .where(eq(coursesTable.organizationId, membership.organizationId));

  res.json({
    items: courses.map((c) => ({ ...c, enrolledCount: 10, completedCount: 8 })),
    total: courses.length,
  });
});

// POST /api/learning/courses/:courseId/enroll
router.post(
  "/learning/courses/:courseId/enroll",
  async (req: Request, res: Response) => {
    const membership = await ensureMembership(req, res);
    if (!membership) return;

    const courseId = String(req.params.courseId ?? "");
    const isAdmin =
      membership.role === PEOPLEOS_ROLES.hrAdmin ||
      membership.role === PEOPLEOS_ROLES.hrManager ||
      membership.role === PEOPLEOS_ROLES.systemAdmin;
    const requestedEmpId =
      typeof req.body?.employeeId === "string" && req.body.employeeId.trim()
        ? req.body.employeeId.trim()
        : null;
    if (requestedEmpId && requestedEmpId !== membership.employeeId && !isAdmin) {
      res.status(403).json({ error: "Cannot enroll another employee without HR permission." });
      return;
    }
    const targetEmpId =
      isAdmin && requestedEmpId ? requestedEmpId : membership.employeeId;
    if (!targetEmpId) {
      res.status(403).json({ error: "Account is not linked to an employee record." });
      return;
    }

    if (!process.env.DATABASE_URL) {
      const course = DEMO_COURSES.find(
        (c) =>
          c.id === courseId && c.organizationId === membership.organizationId,
      );
      if (!course) {
        res.status(404).json({ error: "Course not found." });
        return;
      }
      course.enrolledCount += 1;
      await recordAuditEvent({
        organizationId: membership.organizationId,
        actorUserId: membership.userId,
        actor: membership.role,
        action: "LEARNING_ENROLLMENT",
        targetType: "course",
        targetId: course.id,
        summary: `Enrolled team member in "${course.title}".`,
        isDemo: true,
      });
      res.status(201).json({ enrolled: true, course, employeeId: targetEmpId });
      return;
    }

    const [created] = await db
      .insert(employeeTrainingTable)
      .values({
        organizationId: membership.organizationId,
        courseId,
        employeeId: String(targetEmpId),
        status: "enrolled",
        progressPct: 0,
      })
      .returning();

    res.status(201).json({ enrolled: true, enrollment: created });
  },
);

// POST /api/learning/courses
router.post("/learning/courses", async (req: Request, res: Response) => {
  const membership = await requireRoles(req, res, [
    PEOPLEOS_ROLES.hrAdmin,
    PEOPLEOS_ROLES.hrManager,
    PEOPLEOS_ROLES.systemAdmin,
  ]);
  if (!membership) return;

  const { title, category, durationHours, provider, status = "elective" } =
    req.body ?? {};
  const cleanTitle = sanitizeText(title, 180);
  if (!cleanTitle) {
    res.status(400).json({ error: "Course title is required." });
    return;
  }

  if (!process.env.DATABASE_URL) {
    const newCourse: DemoCourse = {
      id: `course-${crypto.randomUUID().slice(0, 8)}`,
      organizationId: membership.organizationId,
      title: cleanTitle,
      category: sanitizeText(category || "Professional Skills", 80),
      durationHours: Math.max(1, Math.round(Number(durationHours) || 4)),
      provider: sanitizeText(provider || "Rekker Academy", 100),
      status: status === "mandatory" ? "mandatory" : "elective",
      enrolledCount: 0,
      completedCount: 0,
    };
    DEMO_COURSES.unshift(newCourse);
    res.status(201).json(newCourse);
    return;
  }

  const [created] = await db
    .insert(coursesTable)
    .values({
      organizationId: membership.organizationId,
      title: cleanTitle,
      category: sanitizeText(category || "Professional Skills", 80),
      durationHours: Math.max(1, Math.round(Number(durationHours) || 4)),
      provider: sanitizeText(provider || "Rekker Academy", 100),
      status: status === "mandatory" ? "mandatory" : "elective",
    })
    .returning();

  res.status(201).json({ ...created, enrolledCount: 0, completedCount: 0 });
});

export default router;

