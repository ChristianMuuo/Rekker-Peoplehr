import crypto from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import { Router, type IRouter, type Request, type Response } from "express";
import {
  candidatesTable,
  db,
  interviewsTable,
  jobRequisitionsTable,
} from "@workspace/db";
import { recordAuditEvent } from "../lib/auditService";
import { runPythonMlTask } from "../lib/mlBridge";
import { sanitizeText } from "../lib/security";
import {
  ensureMembership,
  PEOPLEOS_ROLES,
  requireRoles,
} from "../middlewares/peopleosAccess";

const router: IRouter = Router();

const recruiterRoles = [
  PEOPLEOS_ROLES.hrAdmin,
  PEOPLEOS_ROLES.hrManager,
  PEOPLEOS_ROLES.recruiter,
  PEOPLEOS_ROLES.systemAdmin,
];

let REQUISITIONS = [
  {
    id: "req_01",
    organizationId: "rekker-demo",
    title: "Senior Formulation & Production Chemist",
    departmentId: "20000000-0000-4000-8000-000000000001",
    departmentName: "Formulation & Filling",
    location: "Nairobi Production Facility",
    employmentType: "Full-time Permanent",
    status: "published",
    minSalary: 180000,
    maxSalary: 240000,
    openings: 1,
    applicantsCount: 14,
    description:
      "Lead home care and personal care formulation, automated filling line supervision, batch-level KEBS quality verification, and private label manufacturing readiness.",
    createdAt: "2026-02-10",
  },
  {
    id: "req_02",
    organizationId: "rekker-demo",
    title: "National Trade & Distributor Fulfillment Coordinator",
    departmentId: "20000000-0000-4000-8000-000000000002",
    departmentName: "Logistics & Distribution",
    location: "Nairobi Central Hub",
    employmentType: "Full-time Permanent",
    status: "published",
    minSalary: 130000,
    maxSalary: 170000,
    openings: 2,
    applicantsCount: 22,
    description:
      "Coordinate nationwide FMCG distributor fulfillment across modern trade, general trade, and regional wholesale channels from Nairobi.",
    createdAt: "2026-02-18",
  },
];

export async function getPublicJobPostings() {
  if (!process.env.DATABASE_URL) {
    return REQUISITIONS.filter((r) => r.status === "published").map((r) => ({
      id: r.id,
      title: r.title,
      departmentName: r.departmentName,
      location: r.location,
      employmentType: r.employmentType,
      openings: r.openings,
      description: r.description,
      postedDate: r.createdAt,
    }));
  }
  const rows = await db
    .select()
    .from(jobRequisitionsTable)
    .where(eq(jobRequisitionsTable.status, "published"))
    .orderBy(desc(jobRequisitionsTable.createdAt));
  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    departmentName: r.departmentId.endsWith("0001")
      ? "Formulation & Filling"
      : r.departmentId.endsWith("0002")
        ? "Logistics & Distribution"
        : "Commercial & Operations",
    location: r.location,
    employmentType: r.employmentType,
    openings: r.openings,
    description: r.description,
    postedDate: r.createdAt.toISOString().slice(0, 10),
  }));
}

let CANDIDATES = [
  {
    id: "cand_01",
    organizationId: "rekker-demo",
    requisitionId: "req_01",
    jobTitle: "Senior Formulation & Production Chemist",
    fullName: "Peter Ndung'u",
    email: "peter.ndungu@gmail.com",
    phone: "+254 712 345 678",
    stage: "interview",
    experienceYears: 6,
    matchScore: 94,
    skillsSummary:
      "Strong chemical formulation, filling line automation, KEBS product testing, and GMP quality assurance.",
    appliedDate: "2026-02-14",
  },
  {
    id: "cand_02",
    organizationId: "rekker-demo",
    requisitionId: "req_02",
    jobTitle: "National Trade & Distributor Fulfillment Coordinator",
    fullName: "Evans Kiprono",
    email: "evans.kiprono@yahoo.com",
    phone: "+254 723 456 789",
    stage: "screening",
    experienceYears: 4,
    matchScore: 88,
    skillsSummary:
      "Fleet dispatch, 47-county FMCG distributor reconciliation, and modern/general trade order fulfillment.",
    appliedDate: "2026-02-20",
  },
  {
    id: "cand_03",
    organizationId: "rekker-demo",
    requisitionId: "req_01",
    jobTitle: "Senior Formulation & Production Chemist",
    fullName: "Grace Wambui",
    email: "grace.wambui@outlook.com",
    phone: "+254 728 991 200",
    stage: "applied",
    experienceYears: 5,
    matchScore: 90,
    skillsSummary:
      "Brewing microbiology, wort thermal control, KEBS compliance audits and SCADA PLC maintenance.",
    appliedDate: "2026-02-24",
  },
];

let INTERVIEWS = [
  {
    id: "int_01",
    organizationId: "rekker-demo",
    candidateId: "cand_01",
    candidateName: "Peter Ndung'u",
    requisitionId: "req_01",
    jobTitle: "Senior Industrial Brewing Engineer",
    interviewerName: "Achieng Odhiambo",
    scheduledAt: "2026-03-12T10:00:00Z",
    mode: "onsite",
    status: "completed",
    scorecard: {
      technicalDepth: 5,
      safetyAndCompliance: 5,
      operationalLeadership: 4,
      communication: 4,
    },
    overallRating: 4.5,
    feedbackSummary:
      "Strong SCADA/PLC diagnostic grasp and proven zero-batch-loss fermentation track record. Recommended for final panel.",
    recommendation: "strong_hire",
  },
];

// GET /api/recruitment/requisitions
router.get("/recruitment/requisitions", async (req: Request, res: Response) => {
  const membership = await ensureMembership(req, res);
  if (!membership) return;

  if (!process.env.DATABASE_URL) {
    const items = REQUISITIONS.filter(
      (r) => r.organizationId === membership.organizationId,
    );
    res.json({ items, total: items.length });
    return;
  }

  const rows = await db
    .select()
    .from(jobRequisitionsTable)
    .where(eq(jobRequisitionsTable.organizationId, membership.organizationId))
    .orderBy(desc(jobRequisitionsTable.createdAt));

  res.json({ items: rows, total: rows.length });
});

// POST /api/recruitment/requisitions
router.post("/recruitment/requisitions", async (req: Request, res: Response) => {
  const membership = await requireRoles(req, res, recruiterRoles);
  if (!membership) return;

  const { title, departmentId, location, minSalary, maxSalary, openings, description } =
    req.body ?? {};
  const cleanTitle = sanitizeText(title, 160);
  if (!cleanTitle) {
    res.status(400).json({ error: "Job title is required." });
    return;
  }

  const newReq = {
    id: `req_${Date.now()}`,
    organizationId: membership.organizationId,
    title: cleanTitle,
    departmentId: departmentId || "20000000-0000-4000-8000-000000000001",
    departmentName: "Operations",
    location: sanitizeText(location || "Nairobi Industrial Area Plant", 120),
    employmentType: "Full-time Permanent",
    status: "published",
    minSalary: Math.max(0, Number(minSalary) || 120000),
    maxSalary: Math.max(0, Number(maxSalary) || 180000),
    openings: Math.max(1, Number(openings) || 1),
    applicantsCount: 0,
    description: sanitizeText(description || "Lead operational deliverables.", 1500),
    createdAt: new Date().toISOString().slice(0, 10),
  };

  if (!process.env.DATABASE_URL) {
    REQUISITIONS.unshift(newReq);
  } else {
    const [created] = await db
      .insert(jobRequisitionsTable)
      .values({
        organizationId: membership.organizationId,
        departmentId: newReq.departmentId,
        title: newReq.title,
        location: newReq.location,
        employmentType: newReq.employmentType,
        status: newReq.status,
        minSalary: newReq.minSalary,
        maxSalary: newReq.maxSalary,
        openings: newReq.openings,
        description: newReq.description,
      })
      .returning();
    newReq.id = created!.id;
  }

  await recordAuditEvent({
    organizationId: membership.organizationId,
    actorUserId: membership.userId,
    actor: membership.role,
    action: "REQUISITION_PUBLISHED",
    targetType: "job_requisition",
    targetId: newReq.id,
    summary: `Published job requisition "${newReq.title}".`,
  });

  res.status(201).json(newReq);
});

// GET /api/recruitment/candidates
router.get("/recruitment/candidates", async (req: Request, res: Response) => {
  const membership = await ensureMembership(req, res);
  if (!membership) return;

  const reqId = req.query.requisitionId as string | undefined;

  if (!process.env.DATABASE_URL) {
    let items = CANDIDATES.filter(
      (c) => c.organizationId === membership.organizationId,
    );
    if (reqId) items = items.filter((c) => c.requisitionId === reqId);
    res.json({ items, total: items.length });
    return;
  }

  let rows = await db
    .select()
    .from(candidatesTable)
    .where(eq(candidatesTable.organizationId, membership.organizationId))
    .orderBy(desc(candidatesTable.createdAt));

  if (reqId) rows = rows.filter((c) => c.requisitionId === reqId);
  res.json({ items: rows, total: rows.length });
});

// POST /api/recruitment/candidates - Add candidate application
router.post("/recruitment/candidates", async (req: Request, res: Response) => {
  const membership = await requireRoles(req, res, recruiterRoles);
  if (!membership) return;

  const { requisitionId, fullName, email, phone, experienceYears, skillsSummary } =
    req.body ?? {};
  const cleanName = sanitizeText(fullName, 120);
  const cleanEmail = sanitizeText(email, 160);
  if (!cleanName || !cleanEmail || !requisitionId) {
    res.status(400).json({ error: "requisitionId, fullName, and email are required." });
    return;
  }

  const reqItem = REQUISITIONS.find(
    (r) =>
      r.id === requisitionId && r.organizationId === membership.organizationId,
  );

  const newCand = {
    id: `cand_${Date.now()}`,
    organizationId: membership.organizationId,
    requisitionId: String(requisitionId),
    jobTitle: reqItem?.title || "Open Role",
    fullName: cleanName,
    email: cleanEmail,
    phone: phone ? sanitizeText(phone, 40) : "+254 700 000 000",
    stage: "applied",
    experienceYears: Math.max(0, Number(experienceYears) || 0),
    matchScore: 75,
    skillsSummary: sanitizeText(skillsSummary || "Candidate application submitted.", 600),
    appliedDate: new Date().toISOString().slice(0, 10),
  };

  if (!process.env.DATABASE_URL) {
    CANDIDATES.unshift(newCand);
    if (reqItem) reqItem.applicantsCount += 1;
  } else {
    const [created] = await db
      .insert(candidatesTable)
      .values({
        organizationId: membership.organizationId,
        requisitionId: newCand.requisitionId,
        fullName: newCand.fullName,
        email: newCand.email,
        phone: newCand.phone,
        stage: "applied",
        experienceYears: newCand.experienceYears,
        matchScore: newCand.matchScore,
        skillsSummary: newCand.skillsSummary,
      })
      .returning();
    newCand.id = created!.id;
  }

  res.status(201).json(newCand);
});

// PATCH /api/recruitment/candidates/:id/stage
router.patch(
  "/recruitment/candidates/:id/stage",
  async (req: Request, res: Response) => {
    const membership = await requireRoles(req, res, recruiterRoles);
    if (!membership) return;

    const id = String(req.params.id ?? "");
    const { stage } = req.body ?? {};
    const validStages = ["applied", "screening", "interview", "offer", "hired", "rejected"];
    if (!validStages.includes(stage)) {
      res.status(400).json({ error: "Invalid recruitment stage." });
      return;
    }

    if (!process.env.DATABASE_URL) {
      const cand = CANDIDATES.find(
        (c) => c.id === id && c.organizationId === membership.organizationId,
      );
      if (!cand) {
        res.status(404).json({ error: "Candidate not found." });
        return;
      }
      cand.stage = stage;
      await recordAuditEvent({
        organizationId: membership.organizationId,
        actorUserId: membership.userId,
        actor: membership.role,
        action: "CANDIDATE_STAGE_UPDATED",
        targetType: "candidate",
        targetId: cand.id,
        summary: `Moved ${cand.fullName} to stage "${stage}".`,
        isDemo: true,
      });
      res.json(cand);
      return;
    }

    const [updated] = await db
      .update(candidatesTable)
      .set({ stage })
      .where(
        and(
          eq(candidatesTable.id, id),
          eq(candidatesTable.organizationId, membership.organizationId),
        ),
      )
      .returning();

    if (!updated) {
      res.status(404).json({ error: "Candidate not found." });
      return;
    }

    res.json(updated);
  },
);

// GET /api/recruitment/interviews
router.get("/recruitment/interviews", async (req: Request, res: Response) => {
  const membership = await ensureMembership(req, res);
  if (!membership) return;

  if (!process.env.DATABASE_URL) {
    const items = INTERVIEWS.filter(
      (i) => i.organizationId === membership.organizationId,
    );
    res.json({ items, total: items.length });
    return;
  }

  const rows = await db
    .select()
    .from(interviewsTable)
    .where(eq(interviewsTable.organizationId, membership.organizationId))
    .orderBy(desc(interviewsTable.scheduledAt));

  res.json({ items: rows, total: rows.length });
});

// POST /api/recruitment/interviews - Schedule interview
router.post("/recruitment/interviews", async (req: Request, res: Response) => {
  const membership = await requireRoles(req, res, recruiterRoles);
  if (!membership) return;

  const { candidateId, interviewerName, scheduledAt, mode = "onsite" } = req.body ?? {};
  if (!candidateId || !interviewerName || !scheduledAt) {
    res.status(400).json({ error: "candidateId, interviewerName, and scheduledAt are required." });
    return;
  }

  const cand = CANDIDATES.find(
    (c) =>
      c.id === candidateId && c.organizationId === membership.organizationId,
  );
  if (!cand && !process.env.DATABASE_URL) {
    res.status(404).json({ error: "Candidate not found." });
    return;
  }

  const newInt = {
    id: `int_${crypto.randomUUID().slice(0, 8)}`,
    organizationId: membership.organizationId,
    candidateId: String(candidateId),
    candidateName: cand?.fullName ?? "Candidate",
    requisitionId: cand?.requisitionId ?? "req_01",
    jobTitle: cand?.jobTitle ?? "Role",
    interviewerName: sanitizeText(interviewerName, 120),
    scheduledAt: String(scheduledAt),
    mode: mode === "virtual" ? "virtual" : "onsite",
    status: "scheduled",
    scorecard: null as any,
    overallRating: null as any,
    feedbackSummary: null as any,
    recommendation: "pending",
  };

  if (!process.env.DATABASE_URL) {
    INTERVIEWS.unshift(newInt);
  } else {
    const [created] = await db
      .insert(interviewsTable)
      .values({
        organizationId: membership.organizationId,
        candidateId: newInt.candidateId,
        requisitionId: newInt.requisitionId,
        interviewerName: newInt.interviewerName,
        scheduledAt: new Date(newInt.scheduledAt),
        mode: newInt.mode,
        status: "scheduled",
      })
      .returning();
    newInt.id = created!.id;
  }

  await recordAuditEvent({
    organizationId: membership.organizationId,
    actorUserId: membership.userId,
    actor: membership.role,
    action: "INTERVIEW_SCHEDULED",
    targetType: "interview",
    targetId: newInt.id,
    summary: `Scheduled ${newInt.mode} interview for ${newInt.candidateName} with ${newInt.interviewerName}.`,
  });

  res.status(201).json(newInt);
});

// PATCH /api/recruitment/interviews/:id/scorecard - Submit structured interview scorecard
router.patch(
  "/recruitment/interviews/:id/scorecard",
  async (req: Request, res: Response) => {
    const membership = await requireRoles(req, res, [
      ...recruiterRoles,
      PEOPLEOS_ROLES.departmentManager,
    ]);
    if (!membership) return;

    const id = String(req.params.id ?? "");
    const {
      technicalDepth = 4,
      safetyAndCompliance = 4,
      operationalLeadership = 4,
      communication = 4,
      feedbackSummary,
      recommendation = "hire",
    } = req.body ?? {};

    const rating =
      Math.round(
        ((Number(technicalDepth) +
          Number(safetyAndCompliance) +
          Number(operationalLeadership) +
          Number(communication)) /
          4) *
          10,
      ) / 10;

    if (!process.env.DATABASE_URL) {
      const target = INTERVIEWS.find(
        (i) => i.id === id && i.organizationId === membership.organizationId,
      );
      if (!target) {
        res.status(404).json({ error: "Interview record not found." });
        return;
      }
      target.status = "completed";
      target.scorecard = {
        technicalDepth: Number(technicalDepth),
        safetyAndCompliance: Number(safetyAndCompliance),
        operationalLeadership: Number(operationalLeadership),
        communication: Number(communication),
      };
      target.overallRating = rating;
      target.feedbackSummary = sanitizeText(feedbackSummary || "Completed scorecard.", 600);
      target.recommendation = sanitizeText(recommendation, 40);
      res.json(target);
      return;
    }

    const [updated] = await db
      .update(interviewsTable)
      .set({
        status: "completed",
        scorecardJson: JSON.stringify({
          technicalDepth,
          safetyAndCompliance,
          operationalLeadership,
          communication,
        }),
        overallRating: Math.round(rating),
        feedbackSummary: sanitizeText(feedbackSummary || "", 600),
        recommendation: sanitizeText(recommendation, 40),
      })
      .where(
        and(
          eq(interviewsTable.id, id),
          eq(interviewsTable.organizationId, membership.organizationId),
        ),
      )
      .returning();

    if (!updated) {
      res.status(404).json({ error: "Interview not found." });
      return;
    }

    res.json(updated);
  },
);

// POST /api/recruitment/match - Explainable job-criteria candidate matching via Python ML
router.post("/recruitment/match", async (req: Request, res: Response) => {
  const membership = await requireRoles(req, res, recruiterRoles);
  if (!membership) return;

  const { requisitionId } = req.body ?? {};
  const reqItem =
    REQUISITIONS.find(
      (r) =>
        r.id === requisitionId && r.organizationId === membership.organizationId,
    ) ?? REQUISITIONS[0]!;

  const scopedCands = CANDIDATES.filter(
    (c) =>
      c.organizationId === membership.organizationId &&
      (!requisitionId || c.requisitionId === requisitionId),
  );

  try {
    const mlResult = await runPythonMlTask("candidate_match", {
      isDemo: true,
      jobDescription: `${reqItem.title} ${reqItem.description}`,
      minExperienceYears: 4,
      candidates: scopedCands,
    });
    res.json(mlResult);
  } catch (err) {
    res.status(503).json({
      error: "Candidate matching ML engine unavailable.",
      details: err instanceof Error ? err.message : String(err),
    });
  }
});

export default router;
