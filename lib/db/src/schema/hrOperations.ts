import {
  boolean,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { employeesTable, organizationsTable } from "./peopleos";

export const hrCasesTable = pgTable(
  "hr_cases",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizationsTable.id, { onDelete: "cascade" }),
    caseNumber: text("case_number").notNull(),
    subjectEmployeeId: uuid("subject_employee_id").references(() => employeesTable.id, {
      onDelete: "set null",
    }),
    submittedByUserId: text("submitted_by_user_id").notNull(),
    category: text("category").notNull(), // grievance | disciplinary | workplace_query | policy_breach
    severity: text("severity").notNull().default("medium"),
    title: text("title").notNull(),
    description: text("description").notNull(),
    confidentialNotes: text("confidential_notes").notNull().default(""),
    assignedInvestigatorUserId: text("assigned_investigator_user_id"),
    status: text("status").notNull().default("open"), // open | investigating | escalated | resolved | closed
    resolutionSummary: text("resolution_summary"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("hr_cases_org_status_idx").on(table.organizationId, table.status),
    index("hr_cases_org_submitter_idx").on(table.organizationId, table.submittedByUserId),
    index("hr_cases_org_case_no_idx").on(table.organizationId, table.caseNumber),
  ],
);

export const workforceShiftsTable = pgTable(
  "workforce_shifts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizationsTable.id, { onDelete: "cascade" }),
    employeeId: uuid("employee_id")
      .notNull()
      .references(() => employeesTable.id, { onDelete: "cascade" }),
    unitType: text("unit_type").notNull(), // production | warehouse | distribution | sales | corporate
    workZone: text("work_zone").notNull(),
    shiftName: text("shift_name").notNull(), // Morning | Afternoon | Night | Field Day
    roleSkill: text("role_skill").notNull(),
    certificationValidUntil: text("certification_valid_until"),
    safetyCleared: boolean("safety_cleared").notNull().default(true),
    costCentreCode: text("cost_centre_code").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("workforce_shifts_org_unit_idx").on(table.organizationId, table.unitType),
    index("workforce_shifts_org_emp_idx").on(table.organizationId, table.employeeId),
  ],
);

export const workflowRulesTable = pgTable(
  "workflow_rules",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizationsTable.id, { onDelete: "cascade" }),
    domain: text("domain").notNull(), // leave | payroll | expense | hr_case | onboarding
    name: text("name").notNull(),
    thresholdAmountKes: integer("threshold_amount_kes"),
    approvalLevels: integer("approval_levels").notNull().default(1),
    requiredApproverRolesJson: text("required_approver_roles_json").notNull().default("[]"),
    slaHours: integer("sla_hours").notNull().default(24),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("workflow_rules_org_domain_idx").on(table.organizationId, table.domain)],
);

