import crypto from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import {
  assetsTable,
  db,
  employeesTable,
  workforceDriverProfilesTable,
} from "@workspace/db";
import { recordAuditEvent } from "../../lib/auditService";
import { sanitizeText } from "../../lib/security";
import {
  getOrCreateWorkforceStore,
  type MemDriverProfile,
} from "./workforceErpMemoryStore";
import { DEMO_EMPLOYEES_LIST } from "../../routes/peopleos";

export interface DriverWithAlerts extends MemDriverProfile {
  daysRemaining: number;
  alertLevel: "valid" | "expiring_soon" | "critical" | "expired";
  canDispatch: boolean;
  blockReason: string | null;
}

export async function listDrivers(
  organizationId: string,
  asOfDate: Date = new Date(),
): Promise<{ items: DriverWithAlerts[]; alertsCount: number; blockedCount: number }> {
  const asOfMid = new Date(asOfDate);
  asOfMid.setHours(0, 0, 0, 0);
  const asOfTime = asOfMid.getTime();

  let rawDrivers: MemDriverProfile[];

  if (!process.env.DATABASE_URL) {
    const store = getOrCreateWorkforceStore(organizationId);
    rawDrivers = Array.from(store.drivers.values());
  } else {
    const rows = await db
      .select({
        driver: workforceDriverProfilesTable,
        emp: employeesTable,
        asset: assetsTable,
      })
      .from(workforceDriverProfilesTable)
      .innerJoin(employeesTable, eq(workforceDriverProfilesTable.employeeId, employeesTable.id))
      .leftJoin(assetsTable, eq(workforceDriverProfilesTable.assignedAssetId, assetsTable.id))
      .where(eq(workforceDriverProfilesTable.organizationId, organizationId))
      .orderBy(desc(workforceDriverProfilesTable.createdAt));

    rawDrivers = rows.map(({ driver, emp, asset }) => ({
      id: driver.id,
      organizationId: driver.organizationId,
      employeeId: driver.employeeId,
      driverName: `${emp.firstName} ${emp.lastName}`,
      licenseNumber: driver.licenseNumber,
      licenseClass: driver.licenseClass,
      licenseIssueDate: driver.licenseIssueDate ?? new Date().toISOString().slice(0, 10),
      licenseExpiryDate: driver.licenseExpiryDate,
      psvOrSafetyCertExpiry: driver.psvOrSafetyCertExpiry,
      medicalClearanceExpiry: driver.medicalClearanceExpiry,
      verificationStatus: driver.verificationStatus as MemDriverProfile["verificationStatus"],
      assignedAssetId: driver.assignedAssetId,
      assignedVehicleSnapshot: driver.assignedVehicleSnapshot || (asset ? `${asset.assetTag} · ${asset.name}` : "Unassigned Vehicle"),
      routeCorridor: driver.routeCorridor,
      status: driver.status as MemDriverProfile["status"],
      createdAt: driver.createdAt.toISOString(),
      updatedAt: driver.updatedAt.toISOString(),
    }));
  }

  const items: DriverWithAlerts[] = rawDrivers.map((d) => {
    const expMs = Date.parse(`${d.licenseExpiryDate}T00:00:00Z`);
    const daysRemaining = Math.ceil((expMs - asOfTime) / 86400000);

    let alertLevel: DriverWithAlerts["alertLevel"] = "valid";
    let canDispatch = true;
    let blockReason: string | null = null;

    if (daysRemaining <= 0) {
      alertLevel = "expired";
      canDispatch = false;
      blockReason = `NTSA Driving license ${d.licenseNumber} expired on ${d.licenseExpiryDate}. Mandatory renewal required before vehicle dispatch.`;
    } else if (daysRemaining <= 14) {
      alertLevel = "critical";
    } else if (daysRemaining <= 45) {
      alertLevel = "expiring_soon";
    }

    if (d.psvOrSafetyCertExpiry) {
      const psvMs = Date.parse(`${d.psvOrSafetyCertExpiry}T00:00:00Z`);
      if (psvMs < asOfTime) {
        canDispatch = false;
        blockReason = blockReason || `PSV/Commercial Safety Certification expired on ${d.psvOrSafetyCertExpiry}.`;
        if (alertLevel === "valid") alertLevel = "expired";
      }
    }

    if (d.verificationStatus !== "verified") {
      canDispatch = false;
      blockReason = blockReason || `Driver license verification is currently '${d.verificationStatus}'.`;
    }

    if (d.status === "grounded" || d.status === "on_leave") {
      canDispatch = false;
      blockReason = blockReason || `Driver operational status is '${d.status}'.`;
    }

    return {
      ...d,
      daysRemaining,
      alertLevel,
      canDispatch,
      blockReason,
    };
  });

  const alertsCount = items.filter((d) => d.alertLevel !== "valid").length;
  const blockedCount = items.filter((d) => !d.canDispatch).length;

  return { items, alertsCount, blockedCount };
}

export async function createOrUpdateDriverProfile(
  organizationId: string,
  input: {
    employeeId: string;
    licenseNumber: string;
    licenseClass: string;
    licenseIssueDate: string;
    licenseExpiryDate: string;
    psvOrSafetyCertExpiry?: string | null;
    medicalClearanceExpiry?: string | null;
    assignedAssetId?: string | null;
    assignedVehicleSnapshot?: string | null;
    routeCorridor: string;
  },
  actorUserId: string,
): Promise<DriverWithAlerts> {
  const employeeId = sanitizeText(input.employeeId, 64);
  const licenseNumber = sanitizeText(input.licenseNumber, 60);
  const licenseClass = sanitizeText(input.licenseClass, 80);
  const licenseIssueDate = sanitizeText(input.licenseIssueDate, 10);
  const licenseExpiryDate = sanitizeText(input.licenseExpiryDate, 10);
  const routeCorridor = sanitizeText(input.routeCorridor, 120);
  const assignedVehicleSnapshot = input.assignedVehicleSnapshot ? sanitizeText(input.assignedVehicleSnapshot, 120) : "Fleet Vehicle";

  if (!employeeId || !licenseNumber || !licenseClass || !licenseIssueDate || !licenseExpiryDate || !routeCorridor) {
    throw new Error("employeeId, licenseNumber, licenseClass, licenseIssueDate, licenseExpiryDate and routeCorridor are required.");
  }

  const nowIso = new Date().toISOString();

  if (!process.env.DATABASE_URL) {
    const store = getOrCreateWorkforceStore(organizationId);
    const emp = DEMO_EMPLOYEES_LIST.find((e) => e.id === employeeId);
    const driverName = emp ? `${emp.firstName} ${emp.lastName}` : "Rekker Commercial Driver";

    const existing = Array.from(store.drivers.values()).find((d) => d.employeeId === employeeId);
    const profile: MemDriverProfile = {
      id: existing ? existing.id : `driver-${crypto.randomUUID().slice(0, 8)}`,
      organizationId,
      employeeId,
      driverName,
      licenseNumber,
      licenseClass,
      licenseIssueDate,
      licenseExpiryDate,
      psvOrSafetyCertExpiry: input.psvOrSafetyCertExpiry ?? null,
      medicalClearanceExpiry: input.medicalClearanceExpiry ?? null,
      verificationStatus: "verified",
      assignedAssetId: input.assignedAssetId ?? null,
      assignedVehicleSnapshot,
      routeCorridor,
      status: "active",
      createdAt: existing ? existing.createdAt : nowIso,
      updatedAt: nowIso,
    };
    store.drivers.set(profile.id, profile);

    await recordAuditEvent({
      organizationId,
      actorUserId,
      actor: "fleet_manager",
      action: "DRIVER_PROFILE_UPDATED",
      targetType: "driver_profile",
      targetId: profile.id,
      summary: `Updated driver credentials for ${driverName} (License ${licenseNumber}, class ${licenseClass})`,
      isDemo: true,
    });

    const expMs = Date.parse(`${profile.licenseExpiryDate}T00:00:00Z`);
    const daysRemaining = Math.ceil((expMs - Date.now()) / 86400000);
    const alertLevel = daysRemaining <= 0 ? "expired" : daysRemaining <= 45 ? "expiring_soon" : "valid";

    return {
      ...profile,
      daysRemaining,
      alertLevel,
      canDispatch: alertLevel !== "expired",
      blockReason: alertLevel === "expired" ? "License expired" : null,
    };
  }

  const [existing] = await db
    .select()
    .from(workforceDriverProfilesTable)
    .where(
      and(
        eq(workforceDriverProfilesTable.organizationId, organizationId),
        eq(workforceDriverProfilesTable.employeeId, employeeId),
      ),
    );

  let profileRecord;
  if (existing) {
    const [updated] = await db
      .update(workforceDriverProfilesTable)
      .set({
        licenseNumber,
        licenseClass,
        licenseIssueDate,
        licenseExpiryDate,
        psvOrSafetyCertExpiry: input.psvOrSafetyCertExpiry ?? null,
        medicalClearanceExpiry: input.medicalClearanceExpiry ?? null,
        assignedAssetId: input.assignedAssetId ?? null,
        assignedVehicleSnapshot,
        routeCorridor,
        updatedAt: new Date(),
      })
      .where(eq(workforceDriverProfilesTable.id, existing.id))
      .returning();
    profileRecord = updated!;
  } else {
    const [created] = await db
      .insert(workforceDriverProfilesTable)
      .values({
        organizationId,
        employeeId,
        licenseNumber,
        licenseClass,
        licenseIssueDate,
        licenseExpiryDate,
        psvOrSafetyCertExpiry: input.psvOrSafetyCertExpiry ?? null,
        medicalClearanceExpiry: input.medicalClearanceExpiry ?? null,
        assignedAssetId: input.assignedAssetId ?? null,
        assignedVehicleSnapshot,
        routeCorridor,
      })
      .returning();
    profileRecord = created!;
  }

  const [emp] = await db
    .select({ firstName: employeesTable.firstName, lastName: employeesTable.lastName })
    .from(employeesTable)
    .where(eq(employeesTable.id, employeeId));

  const driverName = emp ? `${emp.firstName} ${emp.lastName}` : "Rekker Commercial Driver";

  await recordAuditEvent({
    organizationId,
    actorUserId,
    actor: "fleet_manager",
    action: "DRIVER_PROFILE_UPDATED",
    targetType: "driver_profile",
    targetId: profileRecord.id,
    summary: `Updated driver credentials for ${driverName} (License ${licenseNumber})`,
  });

  const expMs = Date.parse(`${profileRecord.licenseExpiryDate}T00:00:00Z`);
  const daysRemaining = Math.ceil((expMs - Date.now()) / 86400000);
  const alertLevel = daysRemaining <= 0 ? "expired" : daysRemaining <= 45 ? "expiring_soon" : "valid";

  return {
    id: profileRecord.id,
    organizationId: profileRecord.organizationId,
    employeeId: profileRecord.employeeId,
    driverName,
    licenseNumber: profileRecord.licenseNumber,
    licenseClass: profileRecord.licenseClass,
    licenseIssueDate: profileRecord.licenseIssueDate ?? licenseIssueDate,
    licenseExpiryDate: profileRecord.licenseExpiryDate,
    psvOrSafetyCertExpiry: profileRecord.psvOrSafetyCertExpiry,
    medicalClearanceExpiry: profileRecord.medicalClearanceExpiry,
    verificationStatus: profileRecord.verificationStatus as MemDriverProfile["verificationStatus"],
    assignedAssetId: profileRecord.assignedAssetId,
    assignedVehicleSnapshot: profileRecord.assignedVehicleSnapshot || "Fleet Vehicle",
    routeCorridor: profileRecord.routeCorridor,
    status: profileRecord.status as MemDriverProfile["status"],
    createdAt: profileRecord.createdAt.toISOString(),
    updatedAt: profileRecord.updatedAt.toISOString(),
    daysRemaining,
    alertLevel,
    canDispatch: alertLevel !== "expired",
    blockReason: alertLevel === "expired" ? "License expired" : null,
  };
}

export async function validateVehicleDispatch(
  organizationId: string,
  driverEmployeeId: string,
  asOfDate: Date = new Date(),
): Promise<{
  allowed: boolean;
  dispatchAllowed: boolean;
  driverName?: string;
  daysRemaining?: number;
  alertLevel?: string;
  reasons: string[];
  reason?: string;
}> {
  const { items } = await listDrivers(organizationId, asOfDate);
  const driver = items.find((d) => d.employeeId === driverEmployeeId);

  if (!driver) {
    return {
      allowed: false,
      dispatchAllowed: false,
      reasons: ["No registered commercial driver profile found for this employee."],
      reason: "No registered commercial driver profile found for this employee.",
    };
  }

  if (!driver.canDispatch) {
    const errorMsg = driver.blockReason ?? "Driver license expired under NTSA commercial safety rules.";
    return {
      allowed: false,
      dispatchAllowed: false,
      driverName: driver.driverName,
      daysRemaining: driver.daysRemaining,
      alertLevel: driver.alertLevel,
      reasons: [errorMsg],
      reason: errorMsg,
    };
  }

  return {
    allowed: true,
    dispatchAllowed: true,
    driverName: driver.driverName,
    daysRemaining: driver.daysRemaining,
    alertLevel: driver.alertLevel,
    reasons: [],
  };
}
