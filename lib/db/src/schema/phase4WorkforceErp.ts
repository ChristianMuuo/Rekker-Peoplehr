import {
  boolean,
  date,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import {
  assetsTable,
  departmentsTable,
  documentsTable,
  employeesTable,
  organizationsTable,
} from "./peopleos";

/**
 * Workstream A: Production Lines & Facilities Configuration
 */
export const workforceProductionLinesTable = pgTable(
  "workforce_production_lines",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizationsTable.id, { onDelete: "cascade" }),
    code: text("code").notNull(),
    name: text("name").notNull(),
    departmentId: uuid("department_id")
      .notNull()
      .references(() => departmentsTable.id, { onDelete: "restrict" }),
    workZone: text("work_zone").notNull(),
    operationalStatus: text("operational_status").notNull().default("active"), // active | maintenance | paused | offline
    requiredRoleTypesJson: text("required_role_types_json").notNull().default("[]"),
    requiredSkillsJson: text("required_skills_json").notNull().default("[]"),
    requiredCertificationsJson: text("required_certifications_json").notNull().default("[]"),
    minStaffing: integer("min_staffing").notNull().default(2),
    operatingHours: text("operating_hours").notNull().default("06:00-22:00"),
    supervisorEmployeeId: uuid("supervisor_employee_id").references(
      () => employeesTable.id,
      { onDelete: "set null" },
    ),
    costCentreCode: text("cost_centre_code").notNull().default("CC-MFG-01"),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex("workforce_prod_lines_org_code_uq").on(
      table.organizationId,
      table.code,
    ),
    index("workforce_prod_lines_org_status_idx").on(
      table.organizationId,
      table.operationalStatus,
    ),
  ],
);

/**
 * Workstream A & G: Shift Templates
 */
export const workforceShiftTemplatesTable = pgTable(
  "workforce_shift_templates",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizationsTable.id, { onDelete: "cascade" }),
    code: text("code").notNull(),
    name: text("name").notNull(),
    unitType: text("unit_type").notNull(), // production | warehouse | distribution | sales | corporate
    productionLineId: uuid("production_line_id").references(
      () => workforceProductionLinesTable.id,
      { onDelete: "set null" },
    ),
    workZone: text("work_zone").notNull(),
    startTime: text("start_time").notNull(), // e.g. "06:00"
    endTime: text("end_time").notNull(), // e.g. "14:00"
    durationHours: integer("duration_hours").notNull().default(8),
    minStaffing: integer("min_staffing").notNull().default(2),
    costCentreCode: text("cost_centre_code").notNull().default("CC-MFG-01"),
    requiredCompetency: text("required_competency").notNull().default("General Operator"),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex("workforce_shift_tpl_org_code_uq").on(
      table.organizationId,
      table.code,
    ),
    index("workforce_shift_tpl_org_unit_idx").on(
      table.organizationId,
      table.unitType,
    ),
  ],
);

/**
 * Workstream G: Operational Shift Assignments
 */
export const workforceShiftAssignmentsTable = pgTable(
  "workforce_shift_assignments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizationsTable.id, { onDelete: "cascade" }),
    shiftTemplateId: uuid("shift_template_id").references(
      () => workforceShiftTemplatesTable.id,
      { onDelete: "set null" },
    ),
    employeeId: uuid("employee_id")
      .notNull()
      .references(() => employeesTable.id, { onDelete: "cascade" }),
    productionLineId: uuid("production_line_id").references(
      () => workforceProductionLinesTable.id,
      { onDelete: "set null" },
    ),
    unitType: text("unit_type").notNull(), // production | warehouse | distribution | sales | corporate
    workZone: text("work_zone").notNull(),
    shiftDate: date("shift_date", { mode: "string" }).notNull(),
    shiftName: text("shift_name").notNull(),
    startTime: text("start_time").notNull(),
    endTime: text("end_time").notNull(),
    roleSkill: text("role_skill").notNull(),
    costCentreCode: text("cost_centre_code").notNull(),
    status: text("status").notNull().default("scheduled"), // scheduled | completed | cancelled | swapped | relieved
    isRelief: boolean("is_relief").notNull().default(false),
    reliefForEmployeeId: uuid("relief_for_employee_id").references(
      () => employeesTable.id,
      { onDelete: "set null" },
    ),
    reliefReason: text("relief_reason"),
    supervisorUserId: text("supervisor_user_id"),
    createdByUserId: text("created_by_user_id"),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index("workforce_shift_asgn_org_date_idx").on(
      table.organizationId,
      table.shiftDate,
      table.status,
    ),
    index("workforce_shift_asgn_org_emp_date_idx").on(
      table.organizationId,
      table.employeeId,
      table.shiftDate,
    ),
  ],
);

/**
 * Workstream C: Employee Competencies & Equipment Certifications Registry
 */
export const employeeCertificationsTable = pgTable(
  "employee_certifications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizationsTable.id, { onDelete: "cascade" }),
    employeeId: uuid("employee_id")
      .notNull()
      .references(() => employeesTable.id, { onDelete: "cascade" }),
    category: text("category").notNull(), // production_safety | equipment_operation | driving_license | technical_qualification | compliance
    competencyType: text("competency_type").notNull(), // e.g. "Forklift Operator", "BCE Commercial Heavy", "GMP Cleanroom Protocol"
    equipmentType: text("equipment_type"), // Counterbalance Forklift | Reach Truck | VNA | Drum Clamp | Box Truck KDM 482L
    issuingOrg: text("issuing_org").notNull(), // NTSA | OSHA Kenya | DOSHS | Toyota Forklift Academy | Internal Safety Committee
    certificateNumber: text("certificate_number").notNull(),
    issueDate: date("issue_date", { mode: "string" }).notNull(),
    expiryDate: date("expiry_date", { mode: "string" }).notNull(),
    verificationStatus: text("verification_status").notNull().default("pending_verification"), // pending_verification | verified | rejected | expired | revoked
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
    verifiedByUserId: text("verified_by_user_id"),
    rejectionReason: text("rejection_reason"),
    revocationReason: text("revocation_reason"),
    evidenceDocumentId: uuid("evidence_document_id").references(
      () => documentsTable.id,
      { onDelete: "set null" },
    ),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex("emp_certs_org_emp_certno_uq").on(
      table.organizationId,
      table.employeeId,
      table.competencyType,
      table.certificateNumber,
    ),
    index("emp_certs_org_status_expiry_idx").on(
      table.organizationId,
      table.verificationStatus,
      table.expiryDate,
    ),
    index("emp_certs_org_emp_idx").on(
      table.organizationId,
      table.employeeId,
    ),
  ],
);

/**
 * Workstream D: Distribution Drivers & Compliance
 */
export const workforceDriverProfilesTable = pgTable(
  "workforce_driver_profiles",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizationsTable.id, { onDelete: "cascade" }),
    employeeId: uuid("employee_id")
      .notNull()
      .references(() => employeesTable.id, { onDelete: "cascade" }),
    licenseNumber: text("license_number").notNull(),
    licenseClass: text("license_class").notNull(), // BCE Commercial Heavy | C1 Medium | C Heavy | CE Articulated
    licenseIssueDate: date("license_issue_date", { mode: "string" }),
    licenseExpiryDate: date("license_expiry_date", { mode: "string" }).notNull(),
    psvOrSafetyCertExpiry: date("psv_or_safety_cert_expiry", { mode: "string" }),
    medicalClearanceExpiry: date("medical_clearance_expiry", { mode: "string" }),
    verificationStatus: text("verification_status").notNull().default("verified"), // pending_verification | verified | expired | suspended
    assignedAssetId: uuid("assigned_asset_id").references(
      () => assetsTable.id,
      { onDelete: "set null" },
    ),
    assignedVehicleSnapshot: text("assigned_vehicle_snapshot"), // e.g. "KDM 482L · Box Distribution Truck"
    routeCorridor: text("route_corridor").notNull(), // e.g. "Nairobi -> Nakuru -> Eldoret"
    status: text("status").notNull().default("active"), // active | grounded | on_leave
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex("workforce_drivers_org_emp_uq").on(
      table.organizationId,
      table.employeeId,
    ),
    uniqueIndex("workforce_drivers_org_lic_uq").on(
      table.organizationId,
      table.licenseNumber,
    ),
  ],
);

/**
 * Workstream E: Sales Force Territories
 */
export const workforceTerritoriesTable = pgTable(
  "workforce_territories",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizationsTable.id, { onDelete: "cascade" }),
    code: text("code").notNull(),
    name: text("name").notNull(),
    region: text("region").notNull(),
    costCentreCode: text("cost_centre_code").notNull().default("CC-SLS-01"),
    monthlyTargetKes: integer("monthly_target_kes").notNull().default(2000000),
    defaultCommissionRatePct: text("default_commission_rate_pct").notNull().default("2.5"),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex("workforce_territories_org_code_uq").on(
      table.organizationId,
      table.code,
    ),
  ],
);

/**
 * Workstream E: Sales Rep Assignments & Attainment
 */
export const workforceSalesAssignmentsTable = pgTable(
  "workforce_sales_assignments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizationsTable.id, { onDelete: "cascade" }),
    territoryId: uuid("territory_id")
      .notNull()
      .references(() => workforceTerritoriesTable.id, { onDelete: "cascade" }),
    employeeId: uuid("employee_id")
      .notNull()
      .references(() => employeesTable.id, { onDelete: "cascade" }),
    effectiveFrom: date("effective_from", { mode: "string" }).notNull(),
    effectiveTo: date("effective_to", { mode: "string" }),
    monthlyTargetKes: integer("monthly_target_kes").notNull(),
    actualAttributedKes: integer("actual_attributed_kes").notNull().default(0),
    commissionRatePct: text("commission_rate_pct").notNull().default("2.5"),
    reportingPeriod: text("reporting_period").notNull().default("2026-03"),
    status: text("status").notNull().default("active"), // active | archived
    attributionSource: text("attribution_source")
      .notNull()
      .default("CRM Pipeline Target (Phase 1 Ecosystem)"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index("workforce_sales_asgn_org_emp_period_idx").on(
      table.organizationId,
      table.employeeId,
      table.reportingPeriod,
    ),
    index("workforce_sales_asgn_org_terr_idx").on(
      table.organizationId,
      table.territoryId,
    ),
  ],
);

/**
 * Workstream G: Shift Swaps
 */
export const workforceShiftSwapsTable = pgTable(
  "workforce_shift_swaps",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizationsTable.id, { onDelete: "cascade" }),
    requestingEmployeeId: uuid("requesting_employee_id")
      .notNull()
      .references(() => employeesTable.id, { onDelete: "cascade" }),
    requestingShiftAssignmentId: uuid("requesting_shift_assignment_id")
      .notNull()
      .references(() => workforceShiftAssignmentsTable.id, { onDelete: "cascade" }),
    targetEmployeeId: uuid("target_employee_id")
      .notNull()
      .references(() => employeesTable.id, { onDelete: "cascade" }),
    targetShiftAssignmentId: uuid("target_shift_assignment_id").references(
      () => workforceShiftAssignmentsTable.id,
      { onDelete: "cascade" },
    ),
    status: text("status").notNull().default("pending"), // pending | approved | rejected | cancelled
    reason: text("reason").notNull(),
    decisionNotes: text("decision_notes"),
    decidedByUserId: text("decided_by_user_id"),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index("workforce_shift_swaps_org_status_idx").on(
      table.organizationId,
      table.status,
    ),
  ],
);

/**
 * Workstream B: Absence Relief Requests
 */
export const workforceReliefRequestsTable = pgTable(
  "workforce_relief_requests",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizationsTable.id, { onDelete: "cascade" }),
    absentEmployeeId: uuid("absent_employee_id")
      .notNull()
      .references(() => employeesTable.id, { onDelete: "cascade" }),
    shiftAssignmentId: uuid("shift_assignment_id").references(
      () => workforceShiftAssignmentsTable.id,
      { onDelete: "set null" },
    ),
    shiftDate: date("shift_date", { mode: "string" }).notNull(),
    unitType: text("unit_type").notNull(),
    workZone: text("work_zone").notNull(),
    shiftName: text("shift_name").notNull(),
    requiredCompetency: text("required_competency").notNull(),
    deployedReliefEmployeeId: uuid("deployed_relief_employee_id").references(
      () => employeesTable.id,
      { onDelete: "set null" },
    ),
    status: text("status").notNull().default("pending"), // pending | deployed | rejected
    requestedByUserId: text("requested_by_user_id").notNull(),
    approvedByUserId: text("approved_by_user_id"),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index("workforce_relief_reqs_org_status_idx").on(
      table.organizationId,
      table.status,
    ),
  ],
);

/**
 * Workstream H: Integration Health & Adapter Monitoring
 */
export const integrationHealthChecksTable = pgTable(
  "workforce_integration_health",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizationsTable.id, { onDelete: "cascade" }),
    integrationKey: text("integration_key").notNull(), // biometric_clock | mpesa_daraja | python_ml | kra_etims | rekker_external_sites | clerk_auth | openai_llm
    name: text("name").notNull(),
    category: text("category").notNull(),
    status: text("status").notNull(), // CONNECTED | SANDBOX_SIMULATION | AWAITING_CREDENTIALS | AWAITING_HARDWARE | TEMPORARILY_UNAVAILABLE | EXTERNAL_SYSTEMS_LINKED
    isConfigured: boolean("is_configured").notNull().default(false),
    lastCheckedAt: timestamp("last_checked_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    lastSyncSuccessAt: timestamp("last_sync_success_at", { withTimezone: true }),
    latencyMs: integer("latency_ms"),
    errorSummary: text("error_summary"),
    configurationRequirement: text("configuration_requirement"),
    responsibleAdminRole: text("responsible_admin_role").notNull().default("system_admin"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex("workforce_int_health_org_key_uq").on(
      table.organizationId,
      table.integrationKey,
    ),
  ],
);
