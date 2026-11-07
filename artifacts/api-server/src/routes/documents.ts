import { Router, type IRouter, type Request, type Response } from "express";
import {
  ensureMembership,
  requireRoles,
  PEOPLEOS_ROLES,
} from "../middlewares/peopleosAccess";

const router: IRouter = Router();

let DOCUMENTS = [
  {
    id: "doc-01",
    name: "Executive Employment Agreement - Plant Operations.pdf",
    category: "Contract",
    employeeName: "Achieng Odhiambo",
    uploadedDate: "2021-03-15",
    expiryDate: null,
    fileSize: "2.4 MB",
    status: "valid",
  },
  {
    id: "doc-02",
    name: "Fixed-Term Commercial Specialist Contract.pdf",
    category: "Contract",
    employeeName: "Brian Kiprotich",
    uploadedDate: "2024-02-01",
    expiryDate: "2026-04-30",
    fileSize: "1.8 MB",
    status: "expiring_soon",
  },
  {
    id: "doc-03",
    name: "KRA Personal Tax Exemption & P9 Certificate 2025.pdf",
    category: "Tax & KRA",
    employeeName: "David Kibet",
    uploadedDate: "2026-01-10",
    expiryDate: "2026-12-31",
    fileSize: "850 KB",
    status: "valid",
  },
];

// GET /api/documents
router.get("/documents", async (req: Request, res: Response) => {
  const membership = await ensureMembership(req, res);
  if (!membership) return;

  const category = req.query.category as string;
  const filtered = category ? DOCUMENTS.filter((d) => d.category === category) : DOCUMENTS;
  res.json({ items: filtered, total: filtered.length });
});

// GET /api/documents/expiring - Compliance Contract Expiry Alerts
router.get("/documents/expiring", async (req: Request, res: Response) => {
  const membership = await ensureMembership(req, res);
  if (!membership) return;

  const expiring = DOCUMENTS.filter((d) => d.status === "expiring_soon" || (d.expiryDate && d.expiryDate <= "2026-05-01"));
  res.json({
    totalExpiring: expiring.length,
    contracts: expiring.map((c) => ({
      documentId: c.id,
      title: c.name,
      employee: c.employeeName,
      expiryDate: c.expiryDate,
      daysRemaining: 54,
    })),
  });
});

// POST /api/documents
router.post("/documents", async (req: Request, res: Response) => {
  const membership = await ensureMembership(req, res);
  if (!membership) return;

  const { name, category } = req.body;
  if (!name) {
    res.status(400).json({ error: "Document name is required." });
    return;
  }

  const newDoc = {
    id: `doc-${Date.now()}`,
    name: name.endsWith(".pdf") ? name : `${name}.pdf`,
    category: category || "Contract",
    employeeName: "David Kibet",
    uploadedDate: new Date().toISOString().slice(0, 10),
    expiryDate: null,
    fileSize: "1.5 MB",
    status: "valid",
  };

  DOCUMENTS.unshift(newDoc);
  res.status(201).json(newDoc);
});

export default router;

