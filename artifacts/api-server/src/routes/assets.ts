import crypto from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import { Router, type IRouter, type Request, type Response } from "express";
import { assetsTable, db } from "@workspace/db";
import { recordAuditEvent } from "../lib/auditService";
import { sanitizeText } from "../lib/security";
import {
  ensureMembership,
  PEOPLEOS_ROLES,
  requireRoles,
} from "../middlewares/peopleosAccess";
import { DEMO_EMPLOYEES_LIST } from "./peopleos";

const router: IRouter = Router();

const assetAdminRoles = [
  PEOPLEOS_ROLES.hrAdmin,
  PEOPLEOS_ROLES.hrManager,
  PEOPLEOS_ROLES.systemAdmin,
];

interface DemoAsset {
  id: string;
  organizationId: string;
  assetTag: string;
  name: string;
  category: string;
  serialNumber: string;
  condition: string;
  assignedEmployeeId: string | null;
  assignedEmployeeName: string | null;
  assignedDate: string | null;
  returnDueDate: string | null;
  status: "available" | "assigned" | "maintenance" | "retired";
  valueKes: number;
}

const DEMO_ASSETS: DemoAsset[] = [
  {
    id: "asset-001",
    organizationId: "rekker-demo",
    assetTag: "REK-IT-041",
    name: "ThinkPad X1 Carbon Gen 12",
    category: "Laptop & Workstation",
    serialNumber: "PF49KL21",
    condition: "good",
    assignedEmployeeId: "10000000-0000-4000-8000-000000000007",
    assignedEmployeeName: "David Kibet",
    assignedDate: "2024-06-15",
    returnDueDate: null,
    status: "assigned",
    valueKes: 195000,
  },
  {
    id: "asset-002",
    organizationId: "rekker-demo",
    assetTag: "REK-IT-058",
    name: "MacBook Pro 14 M3",
    category: "Laptop & Workstation",
    serialNumber: "C02YW9Q8",
    condition: "good",
    assignedEmployeeId: "10000000-0000-4000-8000-000000000006",
    assignedEmployeeName: "Brian Kiprotich",
    assignedDate: "2024-02-01",
    returnDueDate: "2026-04-30",
    status: "assigned",
    valueKes: 240000,
  },
  {
    id: "asset-003",
    organizationId: "rekker-demo",
    assetTag: "REK-FLT-012",
    name: "Isuzu FRR Refrigerated Distribution Truck",
    category: "Fleet Vehicle",
    serialNumber: "KDM-482L",
    condition: "good",
    assignedEmployeeId: "10000000-0000-4000-8000-000000000003",
    assignedEmployeeName: "Juma Omondi",
    assignedDate: "2023-03-10",
    returnDueDate: null,
    status: "assigned",
    valueKes: 5400000,
  },
  {
    id: "asset-004",
    organizationId: "rekker-demo",
    assetTag: "REK-PPE-089",
    name: "Industrial Formulation & Chemical Safety PPE Kit",
    category: "Safety PPE",
    serialNumber: "PPE-2026-89",
    condition: "new",
    assignedEmployeeId: null,
    assignedEmployeeName: null,
    assignedDate: null,
    returnDueDate: null,
    status: "available",
    valueKes: 18500,
  },
];

// GET /api/assets
router.get("/assets", async (req: Request, res: Response) => {
  const membership = await ensureMembership(req, res);
  if (!membership) return;

  const isPrivileged = assetAdminRoles.includes(membership.role as any);

  if (!process.env.DATABASE_URL) {
    let items = DEMO_ASSETS.filter(
      (a) => a.organizationId === membership.organizationId,
    );
    if (!isPrivileged && membership.employeeId) {
      items = items.filter((a) => a.assignedEmployeeId === membership.employeeId);
    }
    res.json({ items, total: items.length });
    return;
  }

  const rows = await db
    .select()
    .from(assetsTable)
    .where(eq(assetsTable.organizationId, membership.organizationId))
    .orderBy(desc(assetsTable.createdAt));

  const filtered =
    !isPrivileged && membership.employeeId
      ? rows.filter((a) => a.assignedEmployeeId === membership.employeeId)
      : rows;

  res.json({ items: filtered, total: filtered.length });
});

// POST /api/assets
router.post("/assets", async (req: Request, res: Response) => {
  const membership = await requireRoles(req, res, assetAdminRoles);
  if (!membership) return;

  const { assetTag, name, category, serialNumber, valueKes, assignedEmployeeId } =
    req.body ?? {};
  const cleanTag = sanitizeText(assetTag, 40);
  const cleanName = sanitizeText(name, 140);
  const cleanSerial = sanitizeText(serialNumber, 80);

  if (!cleanTag || !cleanName || !cleanSerial) {
    res.status(400).json({ error: "assetTag, name, and serialNumber are required." });
    return;
  }

  const assignedEmp = assignedEmployeeId
    ? DEMO_EMPLOYEES_LIST.find((e) => e.id === assignedEmployeeId)
    : null;

  if (!process.env.DATABASE_URL) {
    const newAsset: DemoAsset = {
      id: `asset-${crypto.randomUUID().slice(0, 8)}`,
      organizationId: membership.organizationId,
      assetTag: cleanTag,
      name: cleanName,
      category: sanitizeText(category || "Laptop & Workstation", 80),
      serialNumber: cleanSerial,
      condition: "good",
      assignedEmployeeId: assignedEmployeeId ? String(assignedEmployeeId) : null,
      assignedEmployeeName: assignedEmp
        ? `${assignedEmp.firstName} ${assignedEmp.lastName}`
        : null,
      assignedDate: assignedEmployeeId ? new Date().toISOString().slice(0, 10) : null,
      returnDueDate: null,
      status: assignedEmployeeId ? "assigned" : "available",
      valueKes: Math.max(0, Math.round(Number(valueKes) || 0)),
    };
    DEMO_ASSETS.unshift(newAsset);
    await recordAuditEvent({
      organizationId: membership.organizationId,
      actorUserId: membership.userId,
      actor: membership.role,
      action: "ASSET_REGISTERED",
      targetType: "asset",
      targetId: newAsset.id,
      summary: `Registered asset ${cleanTag} (${cleanName}).`,
      isDemo: true,
    });
    res.status(201).json(newAsset);
    return;
  }

  const [created] = await db
    .insert(assetsTable)
    .values({
      organizationId: membership.organizationId,
      assetTag: cleanTag,
      name: cleanName,
      category: sanitizeText(category || "Laptop & Workstation", 80),
      serialNumber: cleanSerial,
      condition: "good",
      assignedEmployeeId: assignedEmployeeId ? String(assignedEmployeeId) : null,
      assignedDate: assignedEmployeeId ? new Date().toISOString().slice(0, 10) : null,
      status: assignedEmployeeId ? "assigned" : "available",
      valueKes: Math.max(0, Math.round(Number(valueKes) || 0)),
    })
    .returning();

  await recordAuditEvent({
    organizationId: membership.organizationId,
    actorUserId: membership.userId,
    actor: membership.role,
    action: "ASSET_REGISTERED",
    targetType: "asset",
    targetId: created!.id,
    summary: `Registered asset ${cleanTag} (${cleanName}).`,
  });

  res.status(201).json(created);
});

// PATCH /api/assets/:assetId/assign - Assign or recover an asset
router.patch("/assets/:assetId/assign", async (req: Request, res: Response) => {
  const membership = await requireRoles(req, res, assetAdminRoles);
  if (!membership) return;

  const assetId = String(req.params.assetId ?? "");
  const { employeeId, action = "assign" } = req.body ?? {};
  const isReturning = action === "return" || !employeeId;

  if (!process.env.DATABASE_URL) {
    const asset = DEMO_ASSETS.find(
      (a) => a.id === assetId && a.organizationId === membership.organizationId,
    );
    if (!asset) {
      res.status(404).json({ error: "Asset not found." });
      return;
    }
    if (isReturning) {
      asset.assignedEmployeeId = null;
      asset.assignedEmployeeName = null;
      asset.assignedDate = null;
      asset.status = "available";
    } else {
      const emp = DEMO_EMPLOYEES_LIST.find((e) => e.id === employeeId);
      asset.assignedEmployeeId = String(employeeId);
      asset.assignedEmployeeName = emp ? `${emp.firstName} ${emp.lastName}` : "Assigned Employee";
      asset.assignedDate = new Date().toISOString().slice(0, 10);
      asset.status = "assigned";
    }
    await recordAuditEvent({
      organizationId: membership.organizationId,
      actorUserId: membership.userId,
      actor: membership.role,
      action: isReturning ? "ASSET_RETURNED" : "ASSET_ASSIGNED",
      targetType: "asset",
      targetId: asset.id,
      summary: isReturning
        ? `Recovered asset ${asset.assetTag} back to available inventory.`
        : `Assigned asset ${asset.assetTag} to ${asset.assignedEmployeeName}.`,
      isDemo: true,
    });
    res.json(asset);
    return;
  }

  const [updated] = await db
    .update(assetsTable)
    .set({
      assignedEmployeeId: isReturning ? null : String(employeeId),
      assignedDate: isReturning ? null : new Date().toISOString().slice(0, 10),
      status: isReturning ? "available" : "assigned",
    })
    .where(
      and(
        eq(assetsTable.id, assetId),
        eq(assetsTable.organizationId, membership.organizationId),
      ),
    )
    .returning();

  if (!updated) {
    res.status(404).json({ error: "Asset not found." });
    return;
  }

  res.json(updated);
});

export default router;

