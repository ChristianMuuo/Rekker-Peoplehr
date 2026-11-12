import { createInsertSchema } from "drizzle-zod";
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
import { z } from "zod/v4";

export const organizationsTable = pgTable("peopleos_organizations", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  isDemo: boolean("is_demo").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const departmentsTable = pgTable(
  "peopleos_departments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizationsTable.id, { onDelete: "cascade" }),
    code: text("code").notNull(),
    name: text("name").notNull(),
    description: text("description").notNull().default(""),
    location: text("location").notNull(),
    managerEmployeeId: uuid("manager_employee_id"),
    budgetedPositions: integer("budgeted_positions").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("peopleos_departments_org_code_uq").on(
      table.organizationId,
      table.code,
    ),
  ],
);

export const employeesTable = pgTable(
  "peopleos_employees",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizationsTable.id, { onDelete: "cascade" }),
    employeeNumber: text("employee_number").notNull(),
    firstName: text("first_name").notNull(),
    lastName: text("last_name").notNull(),
    preferredName: text("preferred_name"),
    workEmail: text("work_email").notNull(),
    phone: text("phone"),
    nationalId: text("national_id"),
    kraPin: text("kra_pin"),
    nssfNo: text("nssf_no"),
    shaNo: text("sha_no"),
    jobTitle: text("job_title").notNull(),
    departmentId: uuid("department_id")
      .notNull()
      .references(() => departmentsTable.id, { onDelete: "restrict" }),
    managerId: uuid("manager_id"),
    location: text("location").notNull(),
    employmentType: text("employment_type").notNull(),
    status: text("status").notNull().default("active"),
    baseSalary: integer("base_salary").notNull().default(0),
    allowances: integer("allowances").notNull().default(0),
    startDate: date("start_date", { mode: "string" }).notNull(),
    probationEndDate: date("probation_end_date", { mode: "string" }),
    contractEndDate: date("contract_end_date", { mode: "string" }),
    emergencyContactJson: text("emergency_contact_json"),
    skillsJson: text("skills_json"),
    isDemo: boolean("is_demo").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex("peopleos_employees_org_number_uq").on(
      table.organizationId,
      table.employeeNumber,
    ),
    uniqueIndex("peopleos_employees_org_email_uq").on(
      table.organizationId,
      table.workEmail,
    ),
    index("peopleos_employees_org_department_idx").on(
      table.organizationId,
      table.departmentId,
    ),
    index("peopleos_employees_org_status_idx").on(
      table.organizationId,
      table.status,
    ),
  ],
);

export const membershipsTable = pgTable(
  "peopleos_memberships",
  {
    userId: text("user_id").notNull(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizationsTable.id, { onDelete: "cascade" }),
    role: text("role").notNull(),
    employeeId: uuid("employee_id").references(() => employeesTable.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.organizationId] }),
    index("peopleos_memberships_org_role_idx").on(
      table.organizationId,
      table.role,
    ),
  ],
);

export const leavePoliciesTable = pgTable(
  "peopleos_leave_policies",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizationsTable.id, { onDelete: "cascade" }),
    code: text("code").notNull(),
    name: text("name").notNull(),
    entitlementDays: integer("entitlement_days").notNull().default(0),
    accrualMethod: text("accrual_method").notNull().default("annual"),
    active: boolean("active").notNull().default(true),
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
    uniqueIndex("peopleos_leave_policy_org_code_uq").on(
      table.organizationId,
      table.code,
    ),
    index("peopleos_leave_policy_org_active_idx").on(
      table.organizationId,
      table.active,
    ),
  ],
);

export const leaveRequestsTable = pgTable(
  "peopleos_leave_requests",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizationsTable.id, { onDelete: "cascade" }),
    employeeId: uuid("employee_id")
      .notNull()
      .references(() => employeesTable.id, { onDelete: "restrict" }),
    leaveType: text("leave_type").notNull(),
    startDate: date("start_date", { mode: "string" }).notNull(),
    endDate: date("end_date", { mode: "string" }).notNull(),
    days: integer("days").notNull(),
    reason: text("reason").notNull(),
    status: text("status").notNull().default("pending"),
    createdByUserId: text("created_by_user_id"),
    approverUserId: text("approver_user_id"),
    decisionComment: text("decision_comment"),
    submittedAt: timestamp("submitted_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    isDemo: boolean("is_demo").notNull().default(false),
  },
  (table) => [
    index("peopleos_leave_org_status_idx").on(
      table.organizationId,
      table.status,
    ),
    index("peopleos_leave_org_employee_idx").on(
      table.organizationId,
      table.employeeId,
    ),
  ],
);

export const auditEventsTable = pgTable(
  "peopleos_audit_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizationsTable.id, { onDelete: "cascade" }),
    actorUserId: text("actor_user_id"),
    actor: text("actor").notNull(),
    action: text("action").notNull(),
    targetType: text("target_type").notNull(),
    targetId: text("target_id").notNull(),
    summary: text("summary").notNull(),
    occurredAt: timestamp("occurred_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    isDemo: boolean("is_demo").notNull().default(false),
  },
  (table) => [
    index("peopleos_audit_org_time_idx").on(
      table.organizationId,
      table.occurredAt,
    ),
  ],
);

// Advanced HR Modules Tables

export const jobRequisitionsTable = pgTable(
  "peopleos_job_requisitions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizationsTable.id, { onDelete: "cascade" }),
    departmentId: uuid("department_id")
      .notNull()
      .references(() => departmentsTable.id, { onDelete: "restrict" }),
    title: text("title").notNull(),
    location: text("location").notNull(),
    employmentType: text("employment_type").notNull(),
    status: text("status").notNull().default("published"),
    minSalary: integer("min_salary").notNull().default(0),
    maxSalary: integer("max_salary").notNull().default(0),
    openings: integer("openings").notNull().default(1),
    description: text("description").notNull(),
    requirementsJson: text("requirements_json"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("peopleos_reqs_org_status_idx").on(
      table.organizationId,
      table.status,
    ),
  ],
);

export const candidatesTable = pgTable(
  "peopleos_candidates",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizationsTable.id, { onDelete: "cascade" }),
    requisitionId: uuid("requisition_id")
      .notNull()
      .references(() => jobRequisitionsTable.id, { onDelete: "cascade" }),
    fullName: text("full_name").notNull(),
    email: text("email").notNull(),
    phone: text("phone"),
    stage: text("stage").notNull().default("applied"),
    experienceYears: integer("experience_years").notNull().default(0),
    matchScore: integer("match_score").notNull().default(0),
    skillsSummary: text("skills_summary"),
    resumeUrl: text("resume_url"),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("peopleos_candidates_org_stage_idx").on(
      table.organizationId,
      table.stage,
    ),
  ],
);

export const attendanceRecordsTable = pgTable(
  "peopleos_attendance_records",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizationsTable.id, { onDelete: "cascade" }),
    employeeId: uuid("employee_id")
      .notNull()
      .references(() => employeesTable.id, { onDelete: "cascade" }),
    date: date("date", { mode: "string" }).notNull(),
    shift: text("shift").notNull(),
    clockIn: text("clock_in"),
    clockOut: text("clock_out"),
    status: text("status").notNull().default("on_time"),
    overtimeHours: integer("overtime_hours").notNull().default(0),
    anomalyFlag: text("anomaly_flag"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("peopleos_att_org_date_idx").on(
      table.organizationId,
      table.date,
    ),
  ],
);

export const payrollRunsTable = pgTable(
  "peopleos_payroll_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizationsTable.id, { onDelete: "cascade" }),
    period: text("period").notNull(),
    totalGross: integer("total_gross").notNull().default(0),
    totalNet: integer("total_net").notNull().default(0),
    totalPaye: integer("total_paye").notNull().default(0),
    totalNssf: integer("total_nssf").notNull().default(0),
    totalSha: integer("total_sha").notNull().default(0),
    totalHousingLevy: integer("total_housing_levy").notNull().default(0),
    status: text("status").notNull().default("draft"),
    createdByUserId: text("created_by_user_id"),
    approvedByUserId: text("approved_by_user_id"),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("peopleos_payroll_runs_org_period_uq").on(
      table.organizationId,
      table.period,
    ),
  ],
);

export const payrollItemsTable = pgTable(
  "peopleos_payroll_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    payrollRunId: uuid("payroll_run_id")
      .notNull()
      .references(() => payrollRunsTable.id, { onDelete: "cascade" }),
    employeeId: uuid("employee_id")
      .notNull()
      .references(() => employeesTable.id, { onDelete: "cascade" }),
    baseSalary: integer("base_salary").notNull(),
    allowances: integer("allowances").notNull().default(0),
    overtimePay: integer("overtime_pay").notNull().default(0),
    grossPay: integer("gross_pay").notNull(),
    nssfTier1: integer("nssf_tier1").notNull(),
    nssfTier2: integer("nssf_tier2").notNull(),
    totalNssf: integer("total_nssf").notNull(),
    sha: integer("sha").notNull(),
    housingLevy: integer("housing_levy").notNull(),
    taxablePay: integer("taxable_pay").notNull(),
    netPaye: integer("net_paye").notNull(),
    totalDeductions: integer("total_deductions").notNull(),
    netPay: integer("net_pay").notNull(),
  },
  (table) => [
    index("peopleos_payroll_items_run_idx").on(table.payrollRunId),
  ],
);

export const goalsTable = pgTable(
  "peopleos_goals",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizationsTable.id, { onDelete: "cascade" }),
    employeeId: uuid("employee_id")
      .notNull()
      .references(() => employeesTable.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    description: text("description").notNull(),
    category: text("category").notNull(),
    targetDate: date("target_date", { mode: "string" }).notNull(),
    progress: integer("progress").notNull().default(0),
    status: text("status").notNull().default("in_progress"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("peopleos_goals_org_employee_idx").on(
      table.organizationId,
      table.employeeId,
    ),
  ],
);

export const coursesTable = pgTable(
  "peopleos_courses",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizationsTable.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    category: text("category").notNull(),
    durationHours: integer("duration_hours").notNull(),
    provider: text("provider").notNull(),
    status: text("status").notNull().default("mandatory"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
);

export const documentsTable = pgTable(
  "peopleos_documents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizationsTable.id, { onDelete: "cascade" }),
    employeeId: uuid("employee_id")
      .references(() => employeesTable.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    category: text("category").notNull(),
    fileUrl: text("file_url"),
    fileSize: text("file_size"),
    mimeType: text("mime_type"),
    checksumSha256: text("checksum_sha256"),
    uploadedByUserId: text("uploaded_by_user_id"),
    expiryDate: date("expiry_date", { mode: "string" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("peopleos_docs_org_employee_idx").on(
      table.organizationId,
      table.employeeId,
    ),
  ],
);

export const aiConversationsTable = pgTable(
  "peopleos_ai_conversations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizationsTable.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull(),
    agentRole: text("agent_role").notNull(),
    messagesJson: text("messages_json").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("peopleos_ai_conv_org_user_idx").on(
      table.organizationId,
      table.userId,
    ),
  ],
);

export const policiesTable = pgTable(
  "peopleos_policies",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizationsTable.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    category: text("category").notNull(),
    content: text("content").notNull(),
    sourceDocument: text("source_document").notNull(),
    keywords: text("keywords").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("peopleos_policies_org_cat_idx").on(
      table.organizationId,
      table.category,
    ),
  ],
);

export const interviewsTable = pgTable(
  "peopleos_interviews",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizationsTable.id, { onDelete: "cascade" }),
    candidateId: uuid("candidate_id")
      .notNull()
      .references(() => candidatesTable.id, { onDelete: "cascade" }),
    requisitionId: uuid("requisition_id")
      .notNull()
      .references(() => jobRequisitionsTable.id, { onDelete: "cascade" }),
    interviewerName: text("interviewer_name").notNull(),
    scheduledAt: timestamp("scheduled_at", { withTimezone: true }).notNull(),
    mode: text("mode").notNull().default("onsite"),
    status: text("status").notNull().default("scheduled"),
    scorecardJson: text("scorecard_json"),
    overallRating: integer("overall_rating"),
    feedbackSummary: text("feedback_summary"),
    recommendation: text("recommendation").default("pending"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("peopleos_interviews_org_cand_idx").on(
      table.organizationId,
      table.candidateId,
    ),
  ],
);

export const onboardingTasksTable = pgTable(
  "peopleos_onboarding_tasks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizationsTable.id, { onDelete: "cascade" }),
    employeeId: uuid("employee_id")
      .notNull()
      .references(() => employeesTable.id, { onDelete: "cascade" }),
    workflowType: text("workflow_type").notNull().default("onboarding"),
    title: text("title").notNull(),
    category: text("category").notNull(),
    assigneeRole: text("assignee_role").notNull().default("hr_admin"),
    dueDate: date("due_date", { mode: "string" }).notNull(),
    completed: boolean("completed").notNull().default(false),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("peopleos_onboarding_org_emp_idx").on(
      table.organizationId,
      table.employeeId,
    ),
  ],
);

export const expensesTable = pgTable(
  "peopleos_expenses",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizationsTable.id, { onDelete: "cascade" }),
    employeeId: uuid("employee_id")
      .notNull()
      .references(() => employeesTable.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    category: text("category").notNull(),
    amountKes: integer("amount_kes").notNull(),
    incurredDate: date("incurred_date", { mode: "string" }).notNull(),
    receiptReference: text("receipt_reference"),
    notes: text("notes"),
    status: text("status").notNull().default("pending"),
    approverUserId: text("approver_user_id"),
    decisionComment: text("decision_comment"),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("peopleos_expenses_org_status_idx").on(
      table.organizationId,
      table.status,
    ),
  ],
);

export const assetsTable = pgTable(
  "peopleos_assets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizationsTable.id, { onDelete: "cascade" }),
    assetTag: text("asset_tag").notNull(),
    name: text("name").notNull(),
    category: text("category").notNull(),
    serialNumber: text("serial_number").notNull(),
    condition: text("condition").notNull().default("good"),
    assignedEmployeeId: uuid("assigned_employee_id").references(
      () => employeesTable.id,
      { onDelete: "set null" },
    ),
    assignedDate: date("assigned_date", { mode: "string" }),
    returnDueDate: date("return_due_date", { mode: "string" }),
    status: text("status").notNull().default("available"),
    valueKes: integer("value_kes").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("peopleos_assets_org_tag_uq").on(
      table.organizationId,
      table.assetTag,
    ),
    index("peopleos_assets_org_emp_idx").on(
      table.organizationId,
      table.assignedEmployeeId,
    ),
  ],
);

export const statutoryConfigsTable = pgTable(
  "peopleos_statutory_configs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizationsTable.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    effectiveFrom: date("effective_from", { mode: "string" }).notNull(),
    effectiveTo: date("effective_to", { mode: "string" }),
    configJson: text("config_json").notNull(),
    isActive: boolean("is_active").notNull().default(true),
    createdByUserId: text("created_by_user_id"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("peopleos_statutory_org_eff_idx").on(
      table.organizationId,
      table.effectiveFrom,
    ),
  ],
);

export const payrollDisbursementsTable = pgTable(
  "peopleos_payroll_disbursements",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizationsTable.id, { onDelete: "cascade" }),
    payrollRunId: uuid("payroll_run_id")
      .notNull()
      .references(() => payrollRunsTable.id, { onDelete: "cascade" }),
    employeeId: uuid("employee_id")
      .notNull()
      .references(() => employeesTable.id, { onDelete: "cascade" }),
    channel: text("channel").notNull().default("mpesa_b2c"),
    recipientMasked: text("recipient_masked").notNull(),
    amountKes: integer("amount_kes").notNull(),
    providerMode: text("provider_mode").notNull().default("SANDBOX_SIMULATION"),
    transactionReference: text("transaction_reference").notNull(),
    status: text("status").notNull().default("queued"),
    initiatedByUserId: text("initiated_by_user_id").notNull(),
    initiatedAt: timestamp("initiated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("peopleos_disb_org_run_idx").on(
      table.organizationId,
      table.payrollRunId,
    ),
  ],
);

export const aiAgentRunsTable = pgTable(
  "peopleos_ai_agent_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizationsTable.id, { onDelete: "cascade" }),
    conversationId: text("conversation_id").notNull(),
    userId: text("user_id").notNull(),
    userRole: text("user_role").notNull(),
    requestedAgent: text("requested_agent").notNull(),
    resolvedAgent: text("resolved_agent").notNull(),
    provider: text("provider").notNull(),
    model: text("model").notNull(),
    promptTokens: integer("prompt_tokens").notNull().default(0),
    completionTokens: integer("completion_tokens").notNull().default(0),
    estimatedCostMicros: integer("estimated_cost_micros").notNull().default(0),
    latencyMs: integer("latency_ms").notNull().default(0),
    toolsCalledJson: text("tools_called_json").notNull().default("[]"),
    status: text("status").notNull().default("completed"),
    errorMessage: text("error_message"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("peopleos_ai_runs_org_time_idx").on(
      table.organizationId,
      table.createdAt,
    ),
  ],
);

export const aiApprovalRequestsTable = pgTable(
  "peopleos_ai_approval_requests",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizationsTable.id, { onDelete: "cascade" }),
    agentRole: text("agent_role").notNull(),
    requestedByUserId: text("requested_by_user_id").notNull(),
    targetType: text("target_type").notNull(),
    targetId: text("target_id").notNull(),
    proposedAction: text("proposed_action").notNull(),
    payloadJson: text("payload_json").notNull(),
    rationale: text("rationale").notNull(),
    status: text("status").notNull().default("pending"),
    decidedByUserId: text("decided_by_user_id"),
    decisionComment: text("decision_comment"),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("peopleos_ai_approvals_org_status_idx").on(
      table.organizationId,
      table.status,
    ),
  ],
);

export const employeeTrainingTable = pgTable(
  "peopleos_employee_training",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizationsTable.id, { onDelete: "cascade" }),
    courseId: uuid("course_id")
      .notNull()
      .references(() => coursesTable.id, { onDelete: "cascade" }),
    employeeId: uuid("employee_id")
      .notNull()
      .references(() => employeesTable.id, { onDelete: "cascade" }),
    status: text("status").notNull().default("enrolled"),
    progressPct: integer("progress_pct").notNull().default(0),
    certificateNumber: text("certificate_number"),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    enrolledAt: timestamp("enrolled_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("peopleos_emp_training_org_emp_idx").on(
      table.organizationId,
      table.employeeId,
    ),
  ],
);

export const insertEmployeeSchema = createInsertSchema(employeesTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export const insertLeavePolicySchema = createInsertSchema(leavePoliciesTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertEmployee = z.infer<typeof insertEmployeeSchema>;
export type InsertLeavePolicy = z.infer<typeof insertLeavePolicySchema>;
export type EmployeeRecord = typeof employeesTable.$inferSelect;
export type MembershipRecord = typeof membershipsTable.$inferSelect;
export type LeavePolicyRecord = typeof leavePoliciesTable.$inferSelect;
export type LeaveRequestRecord = typeof leaveRequestsTable.$inferSelect;
export type JobRequisitionRecord = typeof jobRequisitionsTable.$inferSelect;
export type CandidateRecord = typeof candidatesTable.$inferSelect;
export type InterviewRecord = typeof interviewsTable.$inferSelect;
export type OnboardingTaskRecord = typeof onboardingTasksTable.$inferSelect;
export type ExpenseRecord = typeof expensesTable.$inferSelect;
export type AssetRecord = typeof assetsTable.$inferSelect;
export type StatutoryConfigRecord = typeof statutoryConfigsTable.$inferSelect;
export type PayrollDisbursementRecord = typeof payrollDisbursementsTable.$inferSelect;
export type AiAgentRunRecord = typeof aiAgentRunsTable.$inferSelect;
export type AiApprovalRequestRecord = typeof aiApprovalRequestsTable.$inferSelect;
export type EmployeeTrainingRecord = typeof employeeTrainingTable.$inferSelect;
export type AttendanceRecordEntity = typeof attendanceRecordsTable.$inferSelect;
export type PayrollRunRecord = typeof payrollRunsTable.$inferSelect;
export type PayrollItemRecord = typeof payrollItemsTable.$inferSelect;
export type GoalRecord = typeof goalsTable.$inferSelect;
export type CourseRecord = typeof coursesTable.$inferSelect;
export type DocumentRecord = typeof documentsTable.$inferSelect;
export type AiConversationRecord = typeof aiConversationsTable.$inferSelect;
export type PolicyRecord = typeof policiesTable.$inferSelect;
