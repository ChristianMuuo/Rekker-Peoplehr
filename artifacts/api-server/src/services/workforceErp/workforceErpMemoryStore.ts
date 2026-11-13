import crypto from "node:crypto";

export interface MemProductionLine {
  id: string;
  organizationId: string;
  code: string;
  name: string;
  departmentId: string;
  workZone: string;
  operationalStatus: "active" | "maintenance" | "paused" | "offline";
  requiredRoleTypes: string[];
  requiredSkills: string[];
  requiredCertifications: string[];
  minStaffing: number;
  operatingHours: string;
  supervisorEmployeeId: string | null;
  costCentreCode: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface MemShiftTemplate {
  id: string;
  organizationId: string;
  code: string;
  name: string;
  unitType: "production" | "warehouse" | "distribution" | "sales" | "corporate";
  productionLineId: string | null;
  workZone: string;
  startTime: string;
  endTime: string;
  durationHours: number;
  minStaffing: number;
  costCentreCode: string;
  requiredCompetency: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface MemShiftAssignment {
  id: string;
  organizationId: string;
  shiftTemplateId: string | null;
  employeeId: string;
  employeeName: string;
  productionLineId: string | null;
  unitType: "production" | "warehouse" | "distribution" | "sales" | "corporate";
  workZone: string;
  shiftDate: string; // YYYY-MM-DD
  shiftName: string;
  startTime: string;
  endTime: string;
  roleSkill: string;
  costCentreCode: string;
  status: "scheduled" | "completed" | "cancelled" | "swapped" | "relieved";
  isRelief: boolean;
  reliefForEmployeeId: string | null;
  reliefReason: string | null;
  supervisorUserId: string | null;
  createdByUserId: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface MemEmployeeCertification {
  id: string;
  organizationId: string;
  employeeId: string;
  employeeName: string;
  category: "production_safety" | "equipment_operation" | "driving_license" | "technical_qualification" | "compliance";
  competencyType: string;
  equipmentType: string | null;
  issuingOrg: string;
  certificateNumber: string;
  issueDate: string;
  expiryDate: string;
  verificationStatus: "pending_verification" | "verified" | "rejected" | "expired" | "revoked";
  verifiedAt: string | null;
  verifiedByUserId: string | null;
  rejectionReason: string | null;
  revocationReason: string | null;
  evidenceDocumentId: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface MemDriverProfile {
  id: string;
  organizationId: string;
  employeeId: string;
  driverName: string;
  licenseNumber: string;
  licenseClass: string;
  licenseIssueDate: string;
  licenseExpiryDate: string;
  psvOrSafetyCertExpiry: string | null;
  medicalClearanceExpiry: string | null;
  verificationStatus: "pending_verification" | "verified" | "expired" | "suspended";
  assignedAssetId: string | null;
  assignedVehicleSnapshot: string;
  routeCorridor: string;
  status: "active" | "grounded" | "on_leave";
  createdAt: string;
  updatedAt: string;
}

export interface MemSalesTerritory {
  id: string;
  organizationId: string;
  code: string;
  name: string;
  region: string;
  costCentreCode: string;
  monthlyTargetKes: number;
  defaultCommissionRatePct: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface MemSalesAssignment {
  id: string;
  organizationId: string;
  territoryId: string;
  territoryCode: string;
  territoryName: string;
  employeeId: string;
  repName: string;
  effectiveFrom: string;
  effectiveTo: string | null;
  monthlyTargetKes: number;
  actualAttributedKes: number;
  commissionRatePct: string;
  reportingPeriod: string;
  status: "active" | "archived";
  attributionSource: string;
  createdAt: string;
  updatedAt: string;
}

export interface MemShiftSwap {
  id: string;
  organizationId: string;
  requestingEmployeeId: string;
  requestingShiftAssignmentId: string;
  targetEmployeeId: string;
  targetShiftAssignmentId: string | null;
  status: "pending" | "approved" | "rejected" | "cancelled";
  reason: string;
  decisionNotes: string | null;
  decidedByUserId: string | null;
  decidedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface MemReliefRequest {
  id: string;
  organizationId: string;
  absentEmployeeId: string;
  absentEmployeeName: string;
  shiftAssignmentId: string | null;
  shiftDate: string;
  unitType: string;
  workZone: string;
  shiftName: string;
  requiredCompetency: string;
  deployedReliefEmployeeId: string | null;
  deployedReliefEmployeeName: string | null;
  status: "pending" | "deployed" | "rejected";
  requestedByUserId: string;
  approvedByUserId: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface MemIntegrationHealth {
  id: string;
  organizationId: string;
  integrationKey: string;
  name: string;
  category: string;
  status: "CONNECTED" | "SANDBOX_SIMULATION" | "AWAITING_CREDENTIALS" | "AWAITING_HARDWARE" | "TEMPORARILY_UNAVAILABLE" | "EXTERNAL_SYSTEMS_LINKED";
  isConfigured: boolean;
  lastCheckedAt: string;
  lastSyncSuccessAt: string | null;
  latencyMs: number | null;
  errorSummary: string | null;
  configurationRequirement: string;
  responsibleAdminRole: string;
  createdAt: string;
  updatedAt: string;
}

interface OrgWorkforceStore {
  lines: Map<string, MemProductionLine>;
  templates: Map<string, MemShiftTemplate>;
  assignments: Map<string, MemShiftAssignment>;
  certifications: Map<string, MemEmployeeCertification>;
  drivers: Map<string, MemDriverProfile>;
  territories: Map<string, MemSalesTerritory>;
  salesAssignments: Map<string, MemSalesAssignment>;
  swaps: Map<string, MemShiftSwap>;
  reliefRequests: Map<string, MemReliefRequest>;
  integrations: Map<string, MemIntegrationHealth>;
}

const GLOBAL_STORES = new Map<string, OrgWorkforceStore>();

export function getOrCreateWorkforceStore(organizationId: string): OrgWorkforceStore {
  let store = GLOBAL_STORES.get(organizationId);
  if (!store) {
    store = createInitialWorkforceStore(organizationId);
    GLOBAL_STORES.set(organizationId, store);
  }
  return store;
}

function createInitialWorkforceStore(organizationId: string): OrgWorkforceStore {
  const now = new Date().toISOString();
  const store: OrgWorkforceStore = {
    lines: new Map(),
    templates: new Map(),
    assignments: new Map(),
    certifications: new Map(),
    drivers: new Map(),
    territories: new Map(),
    salesAssignments: new Map(),
    swaps: new Map(),
    reliefRequests: new Map(),
    integrations: new Map(),
  };

  // 1. Initial Production Lines
  const line1: MemProductionLine = {
    id: "line-mfg-01",
    organizationId,
    code: "LINE-MFG-01",
    name: "Automated Formulation & Mixing Bay A",
    departmentId: "20000000-0000-4000-8000-000000000001",
    workZone: "Formulation Line A",
    operationalStatus: "active",
    requiredRoleTypes: ["Lead Formulation Chemist", "Process Operator", "Quality Lab Inspector"],
    requiredSkills: ["Chemical Synthesis", "Formulation", "Batch Mixing"],
    requiredCertifications: ["Chemical Safety & Hazardous Materials Protocol", "GMP Cleanroom Protocol"],
    minStaffing: 3,
    operatingHours: "06:00-22:00",
    supervisorEmployeeId: "10000000-0000-4000-8000-000000000001",
    costCentreCode: "CC-MFG-01",
    isActive: true,
    createdAt: now,
    updatedAt: now,
  };
  const line2: MemProductionLine = {
    id: "line-mfg-02",
    organizationId,
    code: "LINE-MFG-02",
    name: "High-Speed Bottling & Filling Line B",
    departmentId: "20000000-0000-4000-8000-000000000001",
    workZone: "Automated Filling Line B",
    operationalStatus: "active",
    requiredRoleTypes: ["High-Speed Filler Operator", "Packaging Technician", "Line Quality Inspector"],
    requiredSkills: ["Rotary Filler Operation", "Capping Calibration", "PLC Diagnostics"],
    requiredCertifications: ["High-Speed Machinery Safety", "GMP Cleanroom Protocol"],
    minStaffing: 4,
    operatingHours: "06:00-22:00",
    supervisorEmployeeId: "10000000-0000-4000-8000-000000000001",
    costCentreCode: "CC-MFG-01",
    isActive: true,
    createdAt: now,
    updatedAt: now,
  };
  const line3: MemProductionLine = {
    id: "line-whs-01",
    organizationId,
    code: "LINE-WHS-01",
    name: "Central Dispatch & High-Bay Pallet Staging",
    departmentId: "20000000-0000-4000-8000-000000000002",
    workZone: "Nairobi Central Dispatch Warehouse",
    operationalStatus: "active",
    requiredRoleTypes: ["Forklift & Pallet Control Operator", "Inbound Dispatch Clerk"],
    requiredSkills: ["High-Bay Reach Stacking", "WMS Barcode Scanning", "Cold Staging"],
    requiredCertifications: ["Counterbalance & Reach Forklift Authorization", "OSHA Warehouse Safety"],
    minStaffing: 2,
    operatingHours: "07:00-19:00",
    supervisorEmployeeId: "10000000-0000-4000-8000-000000000003",
    costCentreCode: "CC-WHS-01",
    isActive: true,
    createdAt: now,
    updatedAt: now,
  };
  store.lines.set(line1.id, line1);
  store.lines.set(line2.id, line2);
  store.lines.set(line3.id, line3);

  // 2. Initial Shift Templates
  const tpl1: MemShiftTemplate = {
    id: "tpl-mfg-morn",
    organizationId,
    code: "SHIFT-MFG-01",
    name: "Morning Production Shift (06:00-14:00)",
    unitType: "production",
    productionLineId: line1.id,
    workZone: "Formulation Line A",
    startTime: "06:00",
    endTime: "14:00",
    durationHours: 8,
    minStaffing: 3,
    costCentreCode: "CC-MFG-01",
    requiredCompetency: "Chemical Safety & Hazardous Materials Protocol",
    isActive: true,
    createdAt: now,
    updatedAt: now,
  };
  const tpl2: MemShiftTemplate = {
    id: "tpl-mfg-aft",
    organizationId,
    code: "SHIFT-MFG-02",
    name: "Afternoon Filling Shift (14:00-22:00)",
    unitType: "production",
    productionLineId: line2.id,
    workZone: "Automated Filling Line B",
    startTime: "14:00",
    endTime: "22:00",
    durationHours: 8,
    minStaffing: 4,
    costCentreCode: "CC-MFG-01",
    requiredCompetency: "High-Speed Machinery Safety",
    isActive: true,
    createdAt: now,
    updatedAt: now,
  };
  const tpl3: MemShiftTemplate = {
    id: "tpl-whs-day",
    organizationId,
    code: "SHIFT-WHS-01",
    name: "Warehouse Day Shift (08:00-17:00)",
    unitType: "warehouse",
    productionLineId: line3.id,
    workZone: "Nairobi Central Dispatch Warehouse",
    startTime: "08:00",
    endTime: "17:00",
    durationHours: 9,
    minStaffing: 2,
    costCentreCode: "CC-WHS-01",
    requiredCompetency: "Counterbalance & Reach Forklift Authorization",
    isActive: true,
    createdAt: now,
    updatedAt: now,
  };
  store.templates.set(tpl1.id, tpl1);
  store.templates.set(tpl2.id, tpl2);
  store.templates.set(tpl3.id, tpl3);

  // 3. Initial Certifications
  const certs: MemEmployeeCertification[] = [
    {
      id: "cert-001",
      organizationId,
      employeeId: "10000000-0000-4000-8000-000000000001",
      employeeName: "Achieng Odhiambo",
      category: "production_safety",
      competencyType: "Chemical Safety & Hazardous Materials Protocol",
      equipmentType: "High-Shear Dispersion Unit",
      issuingOrg: "DOSHS Kenya",
      certificateNumber: "DOSHS-HAZ-2024-819",
      issueDate: "2024-01-15",
      expiryDate: "2027-01-15",
      verificationStatus: "verified",
      verifiedAt: "2024-01-20T10:00:00Z",
      verifiedByUserId: "user_demo_admin_01",
      rejectionReason: null,
      revocationReason: null,
      evidenceDocumentId: null,
      notes: "Lead chemist regulatory compliance verified.",
      createdAt: now,
      updatedAt: now,
    },
    {
      id: "cert-002",
      organizationId,
      employeeId: "10000000-0000-4000-8000-000000000002",
      employeeName: "Mwangi Kariuki",
      category: "equipment_operation",
      competencyType: "High-Speed Machinery Safety",
      equipmentType: "Rotary Piston Filling Machine B",
      issuingOrg: "OSHA Kenya Safety Institute",
      certificateNumber: "OSHA-MFG-9941",
      issueDate: "2023-08-20",
      expiryDate: "2026-08-20",
      verificationStatus: "verified",
      verifiedAt: "2023-08-25T11:00:00Z",
      verifiedByUserId: "user_demo_admin_01",
      rejectionReason: null,
      revocationReason: null,
      evidenceDocumentId: null,
      notes: "Certified for 120 bpm rotary liquid filling.",
      createdAt: now,
      updatedAt: now,
    },
    {
      id: "cert-003",
      organizationId,
      employeeId: "10000000-0000-4000-8000-000000000004",
      employeeName: "Wanjiku Kimani",
      category: "equipment_operation",
      competencyType: "Counterbalance & Reach Forklift Authorization",
      equipmentType: "Toyota Counterbalance & Crown Reach Truck",
      issuingOrg: "Toyota Material Handling East Africa",
      certificateNumber: "TMH-FLT-2023-402",
      issueDate: "2023-04-05",
      expiryDate: "2026-04-05",
      verificationStatus: "verified",
      verifiedAt: "2023-04-10T09:00:00Z",
      verifiedByUserId: "user_demo_admin_01",
      rejectionReason: null,
      revocationReason: null,
      evidenceDocumentId: null,
      notes: "Rated up to 3.5 tonnes high-bay racking.",
      createdAt: now,
      updatedAt: now,
    },
    {
      id: "cert-004",
      organizationId,
      employeeId: "10000000-0000-4000-8000-000000000003",
      employeeName: "Juma Omondi",
      category: "driving_license",
      competencyType: "BCE Commercial Heavy Driving Authorization",
      equipmentType: "Box Distribution Truck KDM 482L",
      issuingOrg: "National Transport and Safety Authority (NTSA)",
      certificateNumber: "DL-KE-881204",
      issueDate: "2023-03-29",
      expiryDate: "2026-03-29",
      verificationStatus: "verified",
      verifiedAt: "2023-04-01T14:00:00Z",
      verifiedByUserId: "user_demo_admin_01",
      rejectionReason: null,
      revocationReason: null,
      evidenceDocumentId: null,
      notes: "Commercial heavy license class BCE verified with NTSA TIMS.",
      createdAt: now,
      updatedAt: now,
    },
    {
      id: "cert-005",
      organizationId,
      employeeId: "10000000-0000-4000-8000-000000000010",
      employeeName: "Mercy Chepngetich",
      category: "production_safety",
      competencyType: "GMP Cleanroom Protocol",
      equipmentType: null,
      issuingOrg: "Kenya Bureau of Standards (KEBS)",
      certificateNumber: "KEBS-GMP-2024-551",
      issueDate: "2024-02-10",
      expiryDate: "2027-02-10",
      verificationStatus: "verified",
      verifiedAt: "2024-02-15T12:00:00Z",
      verifiedByUserId: "user_demo_admin_01",
      rejectionReason: null,
      revocationReason: null,
      evidenceDocumentId: null,
      notes: "Quality inspection and hygiene protocol verified.",
      createdAt: now,
      updatedAt: now,
    },
  ];
  for (const c of certs) store.certifications.set(c.id, c);

  // 4. Initial Shift Assignments
  const todayStr = new Date().toISOString().slice(0, 10);
  const assignments: MemShiftAssignment[] = [
    {
      id: "asgn-001",
      organizationId,
      shiftTemplateId: tpl1.id,
      employeeId: "10000000-0000-4000-8000-000000000001",
      employeeName: "Achieng Odhiambo",
      productionLineId: line1.id,
      unitType: "production",
      workZone: "Formulation Line A",
      shiftDate: todayStr,
      shiftName: "Morning (06:00-14:00)",
      startTime: "06:00",
      endTime: "14:00",
      roleSkill: "Lead Formulation Chemist",
      costCentreCode: "CC-MFG-01",
      status: "scheduled",
      isRelief: false,
      reliefForEmployeeId: null,
      reliefReason: null,
      supervisorUserId: "user_demo_admin_01",
      createdByUserId: "user_demo_admin_01",
      notes: "Batch #2026-F08 Formulation oversight.",
      createdAt: now,
      updatedAt: now,
    },
    {
      id: "asgn-002",
      organizationId,
      shiftTemplateId: tpl2.id,
      employeeId: "10000000-0000-4000-8000-000000000002",
      employeeName: "Mwangi Kariuki",
      productionLineId: line2.id,
      unitType: "production",
      workZone: "Automated Filling Line B",
      shiftDate: todayStr,
      shiftName: "Morning (06:00-14:00)",
      startTime: "06:00",
      endTime: "14:00",
      roleSkill: "High-Speed Filler Operator",
      costCentreCode: "CC-MFG-01",
      status: "scheduled",
      isRelief: false,
      reliefForEmployeeId: null,
      reliefReason: null,
      supervisorUserId: "user_demo_admin_01",
      createdByUserId: "user_demo_admin_01",
      notes: "Line B rotary filler run.",
      createdAt: now,
      updatedAt: now,
    },
    {
      id: "asgn-003",
      organizationId,
      shiftTemplateId: tpl3.id,
      employeeId: "10000000-0000-4000-8000-000000000004",
      employeeName: "Wanjiku Kimani",
      productionLineId: line3.id,
      unitType: "warehouse",
      workZone: "Nairobi Central Dispatch Warehouse",
      shiftDate: todayStr,
      shiftName: "Day (08:00-17:00)",
      startTime: "08:00",
      endTime: "17:00",
      roleSkill: "Forklift & Pallet Control Operator",
      costCentreCode: "CC-WHS-01",
      status: "scheduled",
      isRelief: false,
      reliefForEmployeeId: null,
      reliefReason: null,
      supervisorUserId: "user_demo_admin_01",
      createdByUserId: "user_demo_admin_01",
      notes: "Staging order dispatch.",
      createdAt: now,
      updatedAt: now,
    },
    {
      id: "asgn-004",
      organizationId,
      shiftTemplateId: null,
      employeeId: "10000000-0000-4000-8000-000000000003",
      employeeName: "Juma Omondi",
      productionLineId: null,
      unitType: "distribution",
      workZone: "Nairobi - Rift Corridor",
      shiftDate: todayStr,
      shiftName: "Route Dispatch (06:30-16:30)",
      startTime: "06:30",
      endTime: "16:30",
      roleSkill: "Fleet Logistics Supervisor",
      costCentreCode: "CC-LOG-01",
      status: "scheduled",
      isRelief: false,
      reliefForEmployeeId: null,
      reliefReason: null,
      supervisorUserId: "user_demo_admin_01",
      createdByUserId: "user_demo_admin_01",
      notes: "Scheduled transit delivery.",
      createdAt: now,
      updatedAt: now,
    },
    {
      id: "asgn-005",
      organizationId,
      shiftTemplateId: null,
      employeeId: "10000000-0000-4000-8000-000000000005",
      employeeName: "Brenda Mutheu",
      productionLineId: null,
      unitType: "sales",
      workZone: "Nairobi & Mt. Kenya Trade",
      shiftDate: todayStr,
      shiftName: "Field Commercial",
      startTime: "08:00",
      endTime: "17:00",
      roleSkill: "Key Trade Account Manager",
      costCentreCode: "CC-SLS-01",
      status: "scheduled",
      isRelief: false,
      reliefForEmployeeId: null,
      reliefReason: null,
      supervisorUserId: "user_demo_admin_01",
      createdByUserId: "user_demo_admin_01",
      notes: "Trade merchant engagements.",
      createdAt: now,
      updatedAt: now,
    },
    {
      id: "asgn-006",
      organizationId,
      shiftTemplateId: null,
      employeeId: "10000000-0000-4000-8000-000000000006",
      employeeName: "Brian Kiprotich",
      productionLineId: null,
      unitType: "sales",
      workZone: "Rift Valley Territory",
      shiftDate: todayStr,
      shiftName: "Field Commercial",
      startTime: "08:00",
      endTime: "17:00",
      roleSkill: "Trade Territory Representative",
      costCentreCode: "CC-SLS-01",
      status: "scheduled",
      isRelief: false,
      reliefForEmployeeId: null,
      reliefReason: null,
      supervisorUserId: "user_demo_admin_01",
      createdByUserId: "user_demo_admin_01",
      notes: "Nakuru commercial trade accounts.",
      createdAt: now,
      updatedAt: now,
    },
  ];
  for (const a of assignments) store.assignments.set(a.id, a);

  // 5. Initial Driver Profiles
  const drivers: MemDriverProfile[] = [
    {
      id: "driver-001",
      organizationId,
      employeeId: "10000000-0000-4000-8000-000000000003",
      driverName: "Juma Omondi",
      licenseNumber: "DL-KE-881204",
      licenseClass: "BCE Commercial Heavy",
      licenseIssueDate: "2024-03-29",
      licenseExpiryDate: new Date(Date.now() + 180 * 86400000).toISOString().slice(0, 10),
      psvOrSafetyCertExpiry: new Date(Date.now() + 240 * 86400000).toISOString().slice(0, 10),
      medicalClearanceExpiry: new Date(Date.now() + 300 * 86400000).toISOString().slice(0, 10),
      verificationStatus: "verified",
      assignedAssetId: null,
      assignedVehicleSnapshot: "KDM 482L · Box Distribution Truck",
      routeCorridor: "Nairobi -> Nakuru -> Eldoret",
      status: "active",
      createdAt: now,
      updatedAt: now,
    },
    {
      id: "driver-002",
      organizationId,
      employeeId: "10000000-0000-4000-8000-000000000004",
      driverName: "Wanjiku Kimani",
      licenseNumber: "DL-KE-550192",
      licenseClass: "BCE + Forklift Endorsement",
      licenseIssueDate: "2023-12-15",
      licenseExpiryDate: "2025-10-15", // Expired in the past for compliance testing
      psvOrSafetyCertExpiry: "2025-09-01",
      medicalClearanceExpiry: "2026-01-15",
      verificationStatus: "verified",
      assignedAssetId: null,
      assignedVehicleSnapshot: "KDG 910M · Urban Delivery Van",
      routeCorridor: "Nairobi Metro & Thika Road Corridor",
      status: "active",
      createdAt: now,
      updatedAt: now,
    },
  ];
  for (const d of drivers) store.drivers.set(d.id, d);

  // 6. Initial Sales Territories & Assignments
  const terr1: MemSalesTerritory = {
    id: "terr-001",
    organizationId,
    code: "TERR-NAI-01",
    name: "Nairobi Metro & Modern Trade Corridor",
    region: "Central & Nairobi Metropolis",
    costCentreCode: "CC-SLS-01",
    monthlyTargetKes: 2500000,
    defaultCommissionRatePct: "2.5",
    isActive: true,
    createdAt: now,
    updatedAt: now,
  };
  const terr2: MemSalesTerritory = {
    id: "terr-002",
    organizationId,
    code: "TERR-RIFT-01",
    name: "Nakuru & South Rift Trade Accounts",
    region: "Rift Valley Region",
    costCentreCode: "CC-SLS-01",
    monthlyTargetKes: 1400000,
    defaultCommissionRatePct: "3.0",
    isActive: true,
    createdAt: now,
    updatedAt: now,
  };
  store.territories.set(terr1.id, terr1);
  store.territories.set(terr2.id, terr2);

  const salesAsgn1: MemSalesAssignment = {
    id: "sasgn-001",
    organizationId,
    territoryId: terr1.id,
    territoryCode: terr1.code,
    territoryName: terr1.name,
    employeeId: "10000000-0000-4000-8000-000000000005",
    repName: "Brenda Mutheu",
    effectiveFrom: "2026-01-01",
    effectiveTo: null,
    monthlyTargetKes: 2500000,
    actualAttributedKes: 2310000,
    commissionRatePct: "2.5",
    reportingPeriod: "2026-03",
    status: "active",
    attributionSource: "CRM Pipeline Target (Phase 1 Ecosystem)",
    createdAt: now,
    updatedAt: now,
  };
  const salesAsgn2: MemSalesAssignment = {
    id: "sasgn-002",
    organizationId,
    territoryId: terr2.id,
    territoryCode: terr2.code,
    territoryName: terr2.name,
    employeeId: "10000000-0000-4000-8000-000000000006",
    repName: "Brian Kiprotich",
    effectiveFrom: "2026-01-01",
    effectiveTo: null,
    monthlyTargetKes: 1400000,
    actualAttributedKes: 1180000,
    commissionRatePct: "3.0",
    reportingPeriod: "2026-03",
    status: "active",
    attributionSource: "CRM Pipeline Target (Phase 1 Ecosystem)",
    createdAt: now,
    updatedAt: now,
  };
  store.salesAssignments.set(salesAsgn1.id, salesAsgn1);
  store.salesAssignments.set(salesAsgn2.id, salesAsgn2);

  // 7. Initial Integration Health Checks
  const integrations: MemIntegrationHealth[] = [
    {
      id: "int-clerk",
      organizationId,
      integrationKey: "clerk_auth",
      name: "Clerk Enterprise Identity & MFA",
      category: "Authentication & Security",
      status: process.env.CLERK_SECRET_KEY ? "CONNECTED" : "SANDBOX_SIMULATION",
      isConfigured: Boolean(process.env.CLERK_SECRET_KEY),
      lastCheckedAt: now,
      lastSyncSuccessAt: process.env.CLERK_SECRET_KEY ? now : null,
      latencyMs: 42,
      errorSummary: null,
      configurationRequirement: "CLERK_SECRET_KEY & CLERK_PUBLISHABLE_KEY",
      responsibleAdminRole: "system_admin",
      createdAt: now,
      updatedAt: now,
    },
    {
      id: "int-mpesa",
      organizationId,
      integrationKey: "mpesa_daraja",
      name: "Safaricom M-Pesa Daraja B2C Gateway",
      category: "Kenyan Payroll & Disbursement",
      status: Boolean(process.env.MPESA_CONSUMER_KEY && process.env.MPESA_CONSUMER_SECRET) ? "CONNECTED" : "AWAITING_CREDENTIALS",
      isConfigured: Boolean(process.env.MPESA_CONSUMER_KEY && process.env.MPESA_CONSUMER_SECRET),
      lastCheckedAt: now,
      lastSyncSuccessAt: null,
      latencyMs: null,
      errorSummary: "Awaiting Daraja B2C initiator credentials in production environment.",
      configurationRequirement: "MPESA_CONSUMER_KEY, MPESA_CONSUMER_SECRET, MPESA_SHORTCODE, MPESA_SECURITY_CREDENTIAL",
      responsibleAdminRole: "finance_manager",
      createdAt: now,
      updatedAt: now,
    },
    {
      id: "int-python-ml",
      organizationId,
      integrationKey: "python_ml",
      name: "Python Scikit-Learn / XGBoost ML Microservice",
      category: "Predictive Analytics",
      status: "CONNECTED",
      isConfigured: true,
      lastCheckedAt: now,
      lastSyncSuccessAt: now,
      latencyMs: 18,
      errorSummary: null,
      configurationRequirement: "services/ml-engine Python runtime on PATH",
      responsibleAdminRole: "system_admin",
      createdAt: now,
      updatedAt: now,
    },
    {
      id: "int-biometric",
      organizationId,
      integrationKey: "biometric_clock",
      name: "Plant & Warehouse Biometric Timeclock Feed",
      category: "Attendance & Hardware",
      status: Boolean(process.env.BIOMETRIC_SYNC_SECRET) ? "CONNECTED" : "AWAITING_CREDENTIALS",
      isConfigured: Boolean(process.env.BIOMETRIC_SYNC_SECRET),
      lastCheckedAt: now,
      lastSyncSuccessAt: null,
      latencyMs: null,
      errorSummary: "Signed biometric webhook receiver awaiting BIOMETRIC_SYNC_SECRET provisioning.",
      configurationRequirement: "BIOMETRIC_SYNC_SECRET & Network IP Whitelist for biometric devices",
      responsibleAdminRole: "system_admin",
      createdAt: now,
      updatedAt: now,
    },
    {
      id: "int-etims",
      organizationId,
      integrationKey: "kra_etims",
      name: "KRA eTIMS Tax Compliance Middleware",
      category: "Statutory Compliance",
      status: Boolean(process.env.KRA_ETIMS_API_KEY) ? "CONNECTED" : "AWAITING_CREDENTIALS",
      isConfigured: Boolean(process.env.KRA_ETIMS_API_KEY),
      lastCheckedAt: now,
      lastSyncSuccessAt: null,
      latencyMs: null,
      errorSummary: "Awaiting KRA eTIMS VSCU/OSCU endpoint credentials.",
      configurationRequirement: "KRA_ETIMS_API_KEY & KRA_ETIMS_DEVICE_SERIAL",
      responsibleAdminRole: "finance_manager",
      createdAt: now,
      updatedAt: now,
    },
    {
      id: "int-external-sites",
      organizationId,
      integrationKey: "rekker_external_sites",
      name: "Rekker Ecosystem (rekker.co.ke & shop.rekker.co.ke)",
      category: "Public Channels & Portals",
      status: "EXTERNAL_SYSTEMS_LINKED",
      isConfigured: true,
      lastCheckedAt: now,
      lastSyncSuccessAt: now,
      latencyMs: 35,
      errorSummary: null,
      configurationRequirement: "Outbound enterprise bridge maintaining strict store isolation",
      responsibleAdminRole: "system_admin",
      createdAt: now,
      updatedAt: now,
    },
  ];
  for (const it of integrations) store.integrations.set(it.integrationKey, it);

  return store;
}
