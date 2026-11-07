import { Router, type IRouter, type Request, type Response } from "express";
import {
  ensureMembership,
  requireRoles,
  PEOPLEOS_ROLES,
} from "../middlewares/peopleosAccess";

const router: IRouter = Router();

// In-Memory store fallback
let REQUISITIONS = [
  {
    id: "req_01",
    title: "Senior Industrial Brewing Engineer",
    departmentId: "20000000-0000-4000-8000-000000000001",
    departmentName: "Manufacturing & Brewing",
    location: "Nairobi Industrial Area Plant",
    employmentType: "Full-time Permanent",
    status: "published",
    minSalary: 180000,
    maxSalary: 240000,
    openings: 1,
    applicantsCount: 14,
    description: "Lead automated fermentation, continuous line quality control and plant steam/cooling efficiency.",
    createdAt: "2026-02-10",
  },
  {
    id: "req_02",
    title: "Regional Supply Chain Dispatch Coordinator",
    departmentId: "20000000-0000-4000-8000-000000000002",
    departmentName: "Logistics & Distribution",
    location: "Nairobi Central Hub",
    employmentType: "Full-time Permanent",
    status: "published",
    minSalary: 130000,
    maxSalary: 170000,
    openings: 2,
    applicantsCount: 22,
    description: "Coordinate multi-hub cold chain logistics, distributor fulfillment schedules and driver telemetry.",
    createdAt: "2026-02-18",
  },
];

let CANDIDATES = [
  {
    id: "cand_01",
    requisitionId: "req_01",
    jobTitle: "Senior Industrial Brewing Engineer",
    fullName: "Peter Ndung'u",
    email: "peter.ndungu@gmail.com",
    phone: "+254 712 345 678",
    stage: "interview",
    experienceYears: 6,
    matchScore: 94,
    skillsSummary: "Strong PLC automation, brewing chemistry, thermal process optimization and ISO safety audits.",
    appliedDate: "2026-02-14",
  },
  {
    id: "cand_02",
    requisitionId: "req_02",
    jobTitle: "Regional Supply Chain Dispatch Coordinator",
    fullName: "Evans Kiprono",
    email: "evans.kiprono@yahoo.com",
    phone: "+254 723 456 789",
    stage: "screening",
    experienceYears: 4,
    matchScore: 88,
    skillsSummary: "Fleet GPS dispatch, distributor delivery reconciliation and cold chain temperature monitoring.",
    appliedDate: "2026-02-20",
  },
];

// GET /api/recruitment/requisitions
router.get("/recruitment/requisitions", async (req: Request, res: Response) => {
  const membership = await ensureMembership(req, res);
  if (!membership) return;
  res.json({ items: REQUISITIONS, total: REQUISITIONS.length });
});

// POST /api/recruitment/requisitions
router.post("/recruitment/requisitions", async (req: Request, res: Response) => {
  const membership = await requireRoles(req, res, [
    PEOPLEOS_ROLES.hrAdmin,
    PEOPLEOS_ROLES.hrManager,
    PEOPLEOS_ROLES.recruiter,
    PEOPLEOS_ROLES.systemAdmin,
  ]);
  if (!membership) return;

  const { title, departmentId, location, minSalary, maxSalary, openings, description } = req.body;
  if (!title) {
    res.status(400).json({ error: "Job title is required." });
    return;
  }

  const newReq = {
    id: `req_${Date.now()}`,
    title,
    departmentId: departmentId || "20000000-0000-4000-8000-000000000001",
    departmentName: "Operations",
    location: location || "Nairobi Plant",
    employmentType: "Full-time Permanent",
    status: "published",
    minSalary: Number(minSalary) || 120000,
    maxSalary: Number(maxSalary) || 180000,
    openings: Number(openings) || 1,
    applicantsCount: 0,
    description: description || "Lead operational deliverables.",
    createdAt: new Date().toISOString().slice(0, 10),
  };

  REQUISITIONS.unshift(newReq);
  res.status(201).json(newReq);
});

// GET /api/recruitment/candidates
router.get("/recruitment/candidates", async (req: Request, res: Response) => {
  const membership = await ensureMembership(req, res);
  if (!membership) return;

  const reqId = req.query.requisitionId as string;
  const filtered = reqId ? CANDIDATES.filter((c) => c.requisitionId === reqId) : CANDIDATES;
  res.json({ items: filtered, total: filtered.length });
});

// PATCH /api/recruitment/candidates/:id/stage
router.patch("/recruitment/candidates/:id/stage", async (req: Request, res: Response) => {
  const membership = await requireRoles(req, res, [
    PEOPLEOS_ROLES.hrAdmin,
    PEOPLEOS_ROLES.hrManager,
    PEOPLEOS_ROLES.recruiter,
    PEOPLEOS_ROLES.systemAdmin,
  ]);
  if (!membership) return;

  const { id } = req.params;
  const { stage } = req.body;

  const cand = CANDIDATES.find((c) => c.id === id);
  if (!cand) {
    res.status(404).json({ error: "Candidate not found." });
    return;
  }

  cand.stage = stage;
  res.json(cand);
});

export default router;

