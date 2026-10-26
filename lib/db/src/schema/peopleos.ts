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
    jobTitle: text("job_title").notNull(),
    departmentId: uuid("department_id")
      .notNull()
      .references(() => departmentsTable.id, { onDelete: "restrict" }),
    managerId: uuid("manager_id"),
    location: text("location").notNull(),
    employmentType: text("employment_type").notNull(),
    status: text("status").notNull().default("active"),
    startDate: date("start_date", { mode: "string" }).notNull(),
    probationEndDate: date("probation_end_date", { mode: "string" }),
    contractEndDate: date("contract_end_date", { mode: "string" }),
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

export const insertEmployeeSchema = createInsertSchema(employeesTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertEmployee = z.infer<typeof insertEmployeeSchema>;
export type EmployeeRecord = typeof employeesTable.$inferSelect;
export type MembershipRecord = typeof membershipsTable.$inferSelect;
export type LeaveRequestRecord = typeof leaveRequestsTable.$inferSelect;
