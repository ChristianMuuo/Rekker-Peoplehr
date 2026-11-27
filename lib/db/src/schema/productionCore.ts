import {
  boolean,
  date,
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { employeesTable, organizationsTable } from "./peopleos";

export const rolesTable = pgTable("peopleos_roles", {
  id: text("id").primaryKey(),
  displayName: text("display_name").notNull(),
  description: text("description").notNull().default(""),
  isSystem: boolean("is_system").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const permissionsTable = pgTable("peopleos_permissions", {
  code: text("code").primaryKey(),
  displayName: text("display_name").notNull(),
  module: text("module").notNull(),
  description: text("description").notNull().default(""),
});

export const rolePermissionsTable = pgTable(
  "peopleos_role_permissions",
  {
    roleId: text("role_id")
      .notNull()
      .references(() => rolesTable.id, { onDelete: "cascade" }),
    permissionCode: text("permission_code")
      .notNull()
      .references(() => permissionsTable.code, { onDelete: "cascade" }),
  },
  (table) => [primaryKey({ columns: [table.roleId, table.permissionCode] })],
);

export const usersTable = pgTable(
  "peopleos_users",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizationsTable.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    passwordHash: text("password_hash").notNull(),
    fullName: text("full_name").notNull(),
    role: text("role").notNull().default("employee"),
    employeeId: uuid("employee_id").references(() => employeesTable.id, {
      onDelete: "set null",
    }),
    isActive: boolean("is_active").notNull().default(true),
    failedLoginAttempts: integer("failed_login_attempts").notNull().default(0),
    lockedUntil: timestamp("locked_until", { withTimezone: true }),
    totpSecretEncrypted: text("totp_secret_encrypted"),
    totpEnabled: boolean("totp_enabled").notNull().default(false),
    passwordResetTokenHash: text("password_reset_token_hash"),
    passwordResetExpiresAt: timestamp("password_reset_expires_at", { withTimezone: true }),
    isDemo: boolean("is_demo").notNull().default(false),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex("peopleos_users_org_email_uq").on(table.organizationId, table.email),
    index("peopleos_users_org_role_idx").on(table.organizationId, table.role),
  ],
);

export const userSessionsTable = pgTable(
  "peopleos_user_sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizationsTable.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull(),
    csrfSecret: text("csrf_secret").notNull(),
    mfaVerified: boolean("mfa_verified").notNull().default(false),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("peopleos_user_sessions_token_uq").on(table.tokenHash),
    index("peopleos_user_sessions_user_idx").on(table.userId, table.expiresAt),
  ],
);

export const designationsTable = pgTable(
  "peopleos_designations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizationsTable.id, { onDelete: "cascade" }),
    code: text("code").notNull(),
    title: text("title").notNull(),
    gradeBand: text("grade_band").notNull().default("G1"),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex("peopleos_designations_org_code_uq").on(table.organizationId, table.code),
  ],
);

export const workSchedulesTable = pgTable(
  "peopleos_work_schedules",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizationsTable.id, { onDelete: "cascade" }),
    code: text("code").notNull(),
    name: text("name").notNull(),
    patternType: text("pattern_type").notNull().default("5_day"),
    workdaysJson: text("workdays_json").notNull().default("[1,2,3,4,5]"),
    halfDayWeekdaysJson: text("half_day_weekdays_json").notNull().default("[]"),
    hoursPerDay: integer("hours_per_day").notNull().default(8),
    isDefault: boolean("is_default").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex("peopleos_work_schedules_org_code_uq").on(table.organizationId, table.code),
  ],
);

export const publicHolidaysTable = pgTable(
  "peopleos_public_holidays",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizationsTable.id, { onDelete: "cascade" }),
    holidayDate: date("holiday_date", { mode: "string" }).notNull(),
    name: text("name").notNull(),
    holidayType: text("holiday_type").notNull().default("gazetted"),
    year: integer("year").notNull(),
    sourceUrl: text("source_url"),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex("peopleos_public_holidays_org_date_uq").on(
      table.organizationId,
      table.holidayDate,
    ),
    index("peopleos_public_holidays_org_year_idx").on(table.organizationId, table.year),
  ],
);

export const leaveTypesTable = pgTable(
  "peopleos_leave_types",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizationsTable.id, { onDelete: "cascade" }),
    code: text("code").notNull(),
    name: text("name").notNull(),
    category: text("category").notNull().default("statutory"),
    isPaid: boolean("is_paid").notNull().default(true),
    paidPercentage: integer("paid_percentage").notNull().default(100),
    requiresCertificate: boolean("requires_certificate").notNull().default(false),
    certificateAfterDays: integer("certificate_after_days"),
    allowHalfDays: boolean("allow_half_days").notNull().default(true),
    statutoryCitation: text("statutory_citation"),
    sourceUrl: text("source_url"),
    verifiedOn: date("verified_on", { mode: "string" }),
    needsLegalReview: boolean("needs_legal_review").notNull().default(false),
    legalNote: text("legal_note"),
    isActive: boolean("is_active").notNull().default(true),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex("peopleos_leave_types_org_code_uq").on(table.organizationId, table.code),
  ],
);

export const leavePolicyConfigsTable = pgTable(
  "peopleos_leave_policy_configs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizationsTable.id, { onDelete: "cascade" }),
    leaveTypeId: uuid("leave_type_id")
      .notNull()
      .references(() => leaveTypesTable.id, { onDelete: "cascade" }),
    leaveTypeCode: text("leave_type_code").notNull(),
    name: text("name").notNull(),
    jurisdiction: text("jurisdiction").notNull().default("KE"),
    entitlementQuantity: integer("entitlement_quantity").notNull().default(21),
    entitlementUnit: text("entitlement_unit").notNull().default("days"),
    accrualFrequency: text("accrual_frequency").notNull().default("monthly"),
    accrualRateHundredths: integer("accrual_rate_hundredths").notNull().default(175),
    minServiceMonths: integer("min_service_months").notNull().default(0),
    maxConsecutiveDays: integer("max_consecutive_days"),
    carryForwardCapDays: integer("carry_forward_cap_days").notNull().default(0),
    carryForwardExpiryMonths: integer("carry_forward_expiry_months").notNull().default(3),
    allowNegativeBalance: boolean("allow_negative_balance").notNull().default(false),
    excludeWeekends: boolean("exclude_weekends").notNull().default(true),
    excludePublicHolidays: boolean("exclude_public_holidays").notNull().default(true),
    requiresRecommendation: boolean("requires_recommendation").notNull().default(true),
    requiresApproval: boolean("requires_approval").notNull().default(true),
    approvalStagesJson: text("approval_stages_json")
      .notNull()
      .default('["line_manager","hr_manager"]'),
    applicableDepartmentsJson: text("applicable_departments_json").notNull().default("[]"),
    applicableEmploymentTypesJson: text("applicable_employment_types_json").notNull().default("[]"),
    effectiveFrom: date("effective_from", { mode: "string" }).notNull(),
    effectiveTo: date("effective_to", { mode: "string" }),
    sourceUrl: text("source_url"),
    verifiedOn: date("verified_on", { mode: "string" }),
    needsLegalReview: boolean("needs_legal_review").notNull().default(false),
    isActive: boolean("is_active").notNull().default(true),
    createdByUserId: text("created_by_user_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index("peopleos_leave_pol_cfg_org_code_idx").on(
      table.organizationId,
      table.leaveTypeCode,
      table.isActive,
    ),
  ],
);

export const leavePolicyAssignmentsTable = pgTable(
  "peopleos_leave_policy_assignments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizationsTable.id, { onDelete: "cascade" }),
    policyId: uuid("policy_id")
      .notNull()
      .references(() => leavePolicyConfigsTable.id, { onDelete: "cascade" }),
    employeeId: uuid("employee_id").references(() => employeesTable.id, {
      onDelete: "cascade",
    }),
    departmentId: uuid("department_id"),
    effectiveFrom: date("effective_from", { mode: "string" }).notNull(),
    effectiveTo: date("effective_to", { mode: "string" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("peopleos_leave_pol_assign_org_emp_idx").on(
      table.organizationId,
      table.employeeId,
    ),
  ],
);

export const leaveTransactionsTable = pgTable(
  "peopleos_leave_ledger",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizationsTable.id, { onDelete: "cascade" }),
    employeeId: uuid("employee_id")
      .notNull()
      .references(() => employeesTable.id, { onDelete: "cascade" }),
    leaveTypeCode: text("leave_type_code").notNull(),
    leaveYear: integer("leave_year").notNull(),
    entryType: text("entry_type").notNull(),
    daysHundredths: integer("days_hundredths").notNull(),
    leaveRequestId: uuid("leave_request_id"),
    reason: text("reason").notNull(),
    idempotencyKey: text("idempotency_key"),
    createdByUserId: text("created_by_user_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("peopleos_leave_ledger_idemp_uq").on(
      table.organizationId,
      table.idempotencyKey,
    ),
    index("peopleos_leave_ledger_emp_type_yr_idx").on(
      table.organizationId,
      table.employeeId,
      table.leaveTypeCode,
      table.leaveYear,
    ),
  ],
);

export const leaveBalancesTable = pgTable(
  "peopleos_leave_balances",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizationsTable.id, { onDelete: "cascade" }),
    employeeId: uuid("employee_id")
      .notNull()
      .references(() => employeesTable.id, { onDelete: "cascade" }),
    leaveTypeCode: text("leave_type_code").notNull(),
    leaveYear: integer("leave_year").notNull(),
    entitledHundredths: integer("entitled_hundredths").notNull().default(0),
    accruedHundredths: integer("accrued_hundredths").notNull().default(0),
    usedHundredths: integer("used_hundredths").notNull().default(0),
    pendingHundredths: integer("pending_hundredths").notNull().default(0),
    availableHundredths: integer("available_hundredths").notNull().default(0),
    carriedForwardHundredths: integer("carried_forward_hundredths").notNull().default(0),
    expiredHundredths: integer("expired_hundredths").notNull().default(0),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex("peopleos_leave_bal_org_emp_type_yr_uq").on(
      table.organizationId,
      table.employeeId,
      table.leaveTypeCode,
      table.leaveYear,
    ),
  ],
);

export const leaveApprovalsTable = pgTable(
  "peopleos_leave_approvals",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizationsTable.id, { onDelete: "cascade" }),
    leaveRequestId: uuid("leave_request_id").notNull(),
    stage: text("stage").notNull(),
    actorUserId: text("actor_user_id").notNull(),
    actorRole: text("actor_role").notNull(),
    decision: text("decision").notNull(),
    comment: text("comment"),
    decidedAt: timestamp("decided_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("peopleos_leave_approvals_req_idx").on(
      table.organizationId,
      table.leaveRequestId,
    ),
  ],
);

export const leaveAttachmentsTable = pgTable(
  "peopleos_leave_attachments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizationsTable.id, { onDelete: "cascade" }),
    leaveRequestId: uuid("leave_request_id"),
    fileName: text("file_name").notNull(),
    mimeType: text("mime_type").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    checksumSha256: text("checksum_sha256").notNull(),
    contentBase64: text("content_base64").notNull(),
    uploadedByUserId: text("uploaded_by_user_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("peopleos_leave_attach_req_idx").on(
      table.organizationId,
      table.leaveRequestId,
    ),
  ],
);

export const auditLogTable = pgTable(
  "peopleos_audit_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizationsTable.id, { onDelete: "cascade" }),
    actorUserId: text("actor_user_id"),
    actorRole: text("actor_role").notNull(),
    actorDisplayName: text("actor_display_name").notNull(),
    action: text("action").notNull(),
    module: text("module").notNull().default("core"),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id").notNull(),
    affectedEmployeeId: text("affected_employee_id"),
    beforeJson: text("before_json"),
    afterJson: text("after_json"),
    reason: text("reason"),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    correlationId: text("correlation_id"),
    prevHash: text("prev_hash").notNull().default("GENESIS"),
    hash: text("hash").notNull(),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
    isDemo: boolean("is_demo").notNull().default(false),
  },
  (table) => [
    index("peopleos_audit_log_org_time_idx").on(table.organizationId, table.occurredAt),
    index("peopleos_audit_log_org_entity_idx").on(
      table.organizationId,
      table.entityType,
      table.entityId,
    ),
    index("peopleos_audit_log_org_emp_idx").on(
      table.organizationId,
      table.affectedEmployeeId,
    ),
  ],
);

export const notificationsTable = pgTable(
  "peopleos_notifications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizationsTable.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull(),
    title: text("title").notNull(),
    body: text("body").notNull(),
    category: text("category").notNull().default("leave"),
    entityType: text("entity_type"),
    entityId: text("entity_id"),
    isRead: boolean("is_read").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("peopleos_notif_org_user_idx").on(table.organizationId, table.userId, table.isRead),
  ],
);

export const systemSettingsTable = pgTable("peopleos_system_settings", {
  organizationId: text("organization_id")
    .primaryKey()
    .references(() => organizationsTable.id, { onDelete: "cascade" }),
  organizationName: text("organization_name").notNull().default("Rekker Limited"),
  defaultTimezone: text("default_timezone").notNull().default("Africa/Nairobi"),
  workingDaysJson: text("working_days_json").notNull().default("[1,2,3,4,5]"),
  holidayCountry: text("holiday_country").notNull().default("KE"),
  leaveApprovalChainJson: text("leave_approval_chain_json")
    .notNull()
    .default('["line_manager","hr_manager"]'),
  allowSelfApproval: boolean("allow_self_approval").notNull().default(false),
  requireAdminMfa: boolean("require_admin_mfa").notNull().default(false),
  emailNotificationMode: text("email_notification_mode").notNull().default("dev_log"),
  auditRetentionDays: integer("audit_retention_days").notNull().default(2555),
  updatedByUserId: text("updated_by_user_id"),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});
