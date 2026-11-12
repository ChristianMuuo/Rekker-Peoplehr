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
  departmentsTable,
  employeesTable,
  organizationsTable,
} from "./peopleos";

export const positionsTable = pgTable(
  "peopleos_positions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizationsTable.id, { onDelete: "cascade" }),
    positionCode: text("position_code").notNull(),
    title: text("title").notNull(),
    departmentId: uuid("department_id")
      .notNull()
      .references(() => departmentsTable.id, { onDelete: "restrict" }),
    reportsToPositionId: uuid("reports_to_position_id"),
    location: text("location").notNull(),
    employmentType: text("employment_type").notNull().default("permanent"),
    employeeCategory: text("employee_category").notNull().default("staff"),
    status: text("status").notNull().default("draft"),
    budgetedHeadcount: integer("budgeted_headcount").notNull().default(1),
    gradeBand: text("grade_band"),
    costCenter: text("cost_center"),
    description: text("description"),
    createdByUserId: text("created_by_user_id"),
    approvedByUserId: text("approved_by_user_id"),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex("peopleos_positions_org_code_uq").on(
      table.organizationId,
      table.positionCode,
    ),
    index("peopleos_positions_org_dept_status_idx").on(
      table.organizationId,
      table.departmentId,
      table.status,
    ),
  ],
);

export const employeePositionAssignmentsTable = pgTable(
  "peopleos_employee_position_assignments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizationsTable.id, { onDelete: "cascade" }),
    employeeId: uuid("employee_id")
      .notNull()
      .references(() => employeesTable.id, { onDelete: "cascade" }),
    positionId: uuid("position_id")
      .notNull()
      .references(() => positionsTable.id, { onDelete: "restrict" }),
    assignmentType: text("assignment_type").notNull().default("primary"),
    effectiveFrom: date("effective_from", { mode: "string" }).notNull(),
    effectiveTo: date("effective_to", { mode: "string" }),
    isCurrent: boolean("is_current").notNull().default(true),
    changeReason: text("change_reason"),
    changedByUserId: text("changed_by_user_id"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("peopleos_emp_pos_org_emp_idx").on(
      table.organizationId,
      table.employeeId,
      table.isCurrent,
    ),
    index("peopleos_emp_pos_org_pos_idx").on(
      table.organizationId,
      table.positionId,
      table.isCurrent,
    ),
  ],
);

export const employeeAssignmentHistoryTable = pgTable(
  "peopleos_employee_assignment_history",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizationsTable.id, { onDelete: "cascade" }),
    employeeId: uuid("employee_id")
      .notNull()
      .references(() => employeesTable.id, { onDelete: "cascade" }),
    effectiveDate: date("effective_date", { mode: "string" }).notNull(),
    effectiveEndDate: date("effective_end_date", { mode: "string" }),
    changeType: text("change_type").notNull(),
    departmentId: uuid("department_id").references(() => departmentsTable.id, {
      onDelete: "restrict",
    }),
    positionId: uuid("position_id").references(() => positionsTable.id, {
      onDelete: "set null",
    }),
    managerId: uuid("manager_id"),
    jobTitle: text("job_title").notNull(),
    location: text("location").notNull(),
    employmentType: text("employment_type").notNull(),
    status: text("status").notNull(),
    reason: text("reason"),
    approvedByUserId: text("approved_by_user_id"),
    changedByUserId: text("changed_by_user_id"),
    previousSnapshotJson: text("previous_snapshot_json"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("peopleos_emp_hist_org_emp_date_idx").on(
      table.organizationId,
      table.employeeId,
      table.effectiveDate,
    ),
  ],
);

export const employeeImportMappingProfilesTable = pgTable(
  "peopleos_employee_import_mapping_profiles",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizationsTable.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),
    mappingJson: text("mapping_json").notNull(),
    createdByUserId: text("created_by_user_id"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex("peopleos_imp_profile_org_name_uq").on(
      table.organizationId,
      table.name,
    ),
  ],
);

export const employeeImportBatchesTable = pgTable(
  "peopleos_employee_import_batches",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizationsTable.id, { onDelete: "cascade" }),
    createdByUserId: text("created_by_user_id").notNull(),
    fileName: text("file_name").notNull(),
    sourceHashSha256: text("source_hash_sha256").notNull(),
    mappingJson: text("mapping_json").notNull(),
    state: text("state").notNull().default("UPLOADED"),
    totalRows: integer("total_rows").notNull().default(0),
    validCount: integer("valid_count").notNull().default(0),
    duplicateCount: integer("duplicate_count").notNull().default(0),
    errorCount: integer("error_count").notNull().default(0),
    importedCount: integer("imported_count").notNull().default(0),
    tokenDigest: text("token_digest").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    committedAt: timestamp("committed_at", { withTimezone: true }),
    committedByUserId: text("committed_by_user_id"),
    summaryJson: text("summary_json"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("peopleos_imp_batch_org_state_idx").on(
      table.organizationId,
      table.state,
    ),
  ],
);

export const employeeImportRowsTable = pgTable(
  "peopleos_employee_import_rows",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    batchId: uuid("batch_id")
      .notNull()
      .references(() => employeeImportBatchesTable.id, { onDelete: "cascade" }),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizationsTable.id, { onDelete: "cascade" }),
    rowNumber: integer("row_number").notNull(),
    status: text("status").notNull(),
    rawJson: text("raw_json").notNull(),
    normalizedJson: text("normalized_json"),
    errorsJson: text("errors_json").notNull().default("[]"),
    warningsJson: text("warnings_json").notNull().default("[]"),
    committedEmployeeId: uuid("committed_employee_id"),
  },
  (table) => [
    index("peopleos_imp_rows_batch_idx").on(table.batchId, table.rowNumber),
  ],
);

export const onboardingTemplatesTable = pgTable(
  "peopleos_onboarding_templates",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizationsTable.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    workflowType: text("workflow_type").notNull().default("onboarding"),
    departmentCode: text("department_code"),
    employmentType: text("employment_type"),
    tasksJson: text("tasks_json").notNull(),
    active: boolean("active").notNull().default(true),
    createdByUserId: text("created_by_user_id"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("peopleos_onb_tmpl_org_type_idx").on(
      table.organizationId,
      table.workflowType,
    ),
  ],
);

export const probationReviewsTable = pgTable(
  "peopleos_probation_reviews",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizationsTable.id, { onDelete: "cascade" }),
    employeeId: uuid("employee_id")
      .notNull()
      .references(() => employeesTable.id, { onDelete: "cascade" }),
    probationStartDate: date("probation_start_date", { mode: "string" }).notNull(),
    probationEndDate: date("probation_end_date", { mode: "string" }).notNull(),
    extendedUntilDate: date("extended_until_date", { mode: "string" }),
    extensionCount: integer("extension_count").notNull().default(0),
    milestoneDay: integer("milestone_day").notNull().default(90),
    status: text("status").notNull().default("pending_review"),
    managerRecommendation: text("manager_recommendation"),
    outcome: text("outcome"),
    decisionNotes: text("decision_notes"),
    reviewedByUserId: text("reviewed_by_user_id"),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("peopleos_probation_org_emp_idx").on(
      table.organizationId,
      table.employeeId,
    ),
  ],
);

export const contractRemindersTable = pgTable(
  "peopleos_contract_reminders",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizationsTable.id, { onDelete: "cascade" }),
    employeeId: uuid("employee_id")
      .notNull()
      .references(() => employeesTable.id, { onDelete: "cascade" }),
    contractEndDate: date("contract_end_date", { mode: "string" }).notNull(),
    reminderWindowDays: integer("reminder_window_days").notNull().default(30),
    status: text("status").notNull().default("open"),
    actionTaken: text("action_taken"),
    notes: text("notes"),
    handledByUserId: text("handled_by_user_id"),
    handledAt: timestamp("handled_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("peopleos_contract_rem_org_emp_idx").on(
      table.organizationId,
      table.employeeId,
    ),
  ],
);

export const profileCorrectionRequestsTable = pgTable(
  "peopleos_profile_correction_requests",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizationsTable.id, { onDelete: "cascade" }),
    employeeId: uuid("employee_id")
      .notNull()
      .references(() => employeesTable.id, { onDelete: "cascade" }),
    requestedByUserId: text("requested_by_user_id").notNull(),
    fieldName: text("field_name").notNull(),
    currentValue: text("current_value"),
    proposedValue: text("proposed_value").notNull(),
    reason: text("reason").notNull(),
    status: text("status").notNull().default("pending"),
    reviewedByUserId: text("reviewed_by_user_id"),
    decisionComment: text("decision_comment"),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("peopleos_prof_corr_org_emp_idx").on(
      table.organizationId,
      table.employeeId,
      table.status,
    ),
  ],
);

export const privacyRequestsTable = pgTable(
  "peopleos_privacy_requests",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizationsTable.id, { onDelete: "cascade" }),
    employeeId: uuid("employee_id")
      .notNull()
      .references(() => employeesTable.id, { onDelete: "cascade" }),
    requestedByUserId: text("requested_by_user_id").notNull(),
    requestType: text("request_type").notNull(),
    details: text("details").notNull(),
    statutoryDueDate: date("statutory_due_date", { mode: "string" }).notNull(),
    legalBasisReference: text("legal_basis_reference").notNull(),
    status: text("status").notNull().default("submitted"),
    retentionCheckRequired: boolean("retention_check_required")
      .notNull()
      .default(true),
    handledByUserId: text("handled_by_user_id"),
    decisionNotes: text("decision_notes"),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("peopleos_privacy_org_emp_idx").on(
      table.organizationId,
      table.employeeId,
      table.status,
    ),
  ],
);

export const workCalendarsTable = pgTable(
  "peopleos_work_calendars",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizationsTable.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    location: text("location"),
    timezone: text("timezone").notNull().default("Africa/Nairobi"),
    workdaysJson: text("workdays_json").notNull().default("[1,2,3,4,5]"),
    holidaysJson: text("holidays_json").notNull().default("[]"),
    shiftStartTime: text("shift_start_time").notNull().default("08:00"),
    shiftEndTime: text("shift_end_time").notNull().default("17:00"),
    isDefault: boolean("is_default").notNull().default(false),
    updatedByUserId: text("updated_by_user_id"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index("peopleos_work_cal_org_idx").on(
      table.organizationId,
      table.isDefault,
    ),
  ],
);

export const attendanceCorrectionsTable = pgTable(
  "peopleos_attendance_corrections",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizationsTable.id, { onDelete: "cascade" }),
    employeeId: uuid("employee_id")
      .notNull()
      .references(() => employeesTable.id, { onDelete: "cascade" }),
    attendanceRecordId: uuid("attendance_record_id"),
    date: date("date", { mode: "string" }).notNull(),
    requestedClockIn: text("requested_clock_in").notNull(),
    requestedClockOut: text("requested_clock_out"),
    reason: text("reason").notNull(),
    status: text("status").notNull().default("pending"),
    requestedByUserId: text("requested_by_user_id").notNull(),
    reviewedByUserId: text("reviewed_by_user_id"),
    decisionComment: text("decision_comment"),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("peopleos_att_corr_org_emp_idx").on(
      table.organizationId,
      table.employeeId,
      table.status,
    ),
  ],
);

export type PositionRecord = typeof positionsTable.$inferSelect;
export type EmployeePositionAssignmentRecord =
  typeof employeePositionAssignmentsTable.$inferSelect;
export type EmployeeAssignmentHistoryRecord =
  typeof employeeAssignmentHistoryTable.$inferSelect;
export type EmployeeImportMappingProfileRecord =
  typeof employeeImportMappingProfilesTable.$inferSelect;
export type EmployeeImportBatchRecord =
  typeof employeeImportBatchesTable.$inferSelect;
export type EmployeeImportRowRecord = typeof employeeImportRowsTable.$inferSelect;
export type OnboardingTemplateRecord = typeof onboardingTemplatesTable.$inferSelect;
export type ProbationReviewRecord = typeof probationReviewsTable.$inferSelect;
export type ContractReminderRecord = typeof contractRemindersTable.$inferSelect;
export type ProfileCorrectionRequestRecord =
  typeof profileCorrectionRequestsTable.$inferSelect;
export type PrivacyRequestRecord = typeof privacyRequestsTable.$inferSelect;
export type WorkCalendarRecord = typeof workCalendarsTable.$inferSelect;
export type AttendanceCorrectionRecord =
  typeof attendanceCorrectionsTable.$inferSelect;

