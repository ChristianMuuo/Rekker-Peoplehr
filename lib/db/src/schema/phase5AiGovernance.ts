import {
  boolean,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { organizationsTable } from "./peopleos";

/**
 * ML Model Registry: High-level definitions of supported ML intelligence models
 */
export const mlModelRegistryTable = pgTable(
  "peopleos_ml_model_registry",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizationsTable.id, { onDelete: "cascade" }),
    taskType: text("task_type").notNull(), // attrition | workforce_forecast | candidate_match | payroll_anomalies | attendance_anomalies | skills_gap | sentiment | performance_trends
    name: text("name").notNull(),
    algorithm: text("algorithm").notNull(), // XGBClassifier | Ridge | TfidfVectorizer | IsolationForest | etc.
    featureSchemaVersion: text("feature_schema_version").notNull().default("1.0.0"),
    activeVersionId: text("active_version_id"),
    status: text("status").notNull().default("active"), // active | archived
    description: text("description").notNull().default(""),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("peopleos_ml_registry_org_task_uq").on(
      table.organizationId,
      table.taskType,
    ),
    index("peopleos_ml_registry_org_status_idx").on(
      table.organizationId,
      table.status,
    ),
  ],
);

/**
 * ML Model Versions: Track distinct trained/evaluated versions, metrics, and approval states
 */
export const mlModelVersionsTable = pgTable(
  "peopleos_ml_model_versions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    modelRegistryId: uuid("model_registry_id")
      .notNull()
      .references(() => mlModelRegistryTable.id, { onDelete: "cascade" }),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizationsTable.id, { onDelete: "cascade" }),
    version: text("version").notNull(), // e.g. "1.0.0", "1.1.0"
    featureSchemaVersion: text("feature_schema_version").notNull().default("1.0.0"),
    algorithm: text("algorithm").notNull(),
    metricsJson: text("metrics_json").notNull().default("{}"),
    dataProvenance: text("data_provenance").notNull().default("live_tenant_data"), // live_tenant_data | insufficient_data | synthetic_development_fixture
    status: text("status").notNull().default("development"), // development | evaluated | approved | deployed | retired
    trainedAt: timestamp("trained_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    approvedByUserId: text("approved_by_user_id"),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    approvalComment: text("approval_comment"),
    trainingSampleCount: integer("training_sample_count").notNull().default(0),
    hyperparametersJson: text("hyperparameters_json").notNull().default("{}"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("peopleos_ml_versions_org_model_ver_uq").on(
      table.organizationId,
      table.modelRegistryId,
      table.version,
    ),
    index("peopleos_ml_versions_org_status_idx").on(
      table.organizationId,
      table.status,
    ),
  ],
);

/**
 * ML Evaluation Results: Fine-grained quantitative validation metrics for model cards
 */
export const mlEvaluationResultsTable = pgTable(
  "peopleos_ml_evaluation_results",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    modelVersionId: uuid("model_version_id")
      .notNull()
      .references(() => mlModelVersionsTable.id, { onDelete: "cascade" }),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizationsTable.id, { onDelete: "cascade" }),
    taskType: text("task_type").notNull(),
    metricName: text("metric_name").notNull(), // cv_roc_auc | cv_f1 | in_sample_mae | in_sample_mse | anomaly_rate
    metricValue: text("metric_value").notNull(),
    evaluationDatasetRef: text("evaluation_dataset_ref").notNull().default("tenant_live_partition"),
    isSyntheticBenchmark: boolean("is_synthetic_benchmark").notNull().default(false),
    evaluatedAt: timestamp("evaluated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("peopleos_ml_eval_org_task_idx").on(
      table.organizationId,
      table.taskType,
    ),
  ],
);

/**
 * AI Tool Audit Logs: Immutable execution audit trail for all AI agent tool calls and data lineage
 */
export const aiToolAuditLogsTable = pgTable(
  "peopleos_ai_tool_audit_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizationsTable.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull(),
    agentRole: text("agent_role").notNull(),
    toolName: text("tool_name").notNull(),
    inputHash: text("input_hash").notNull(),
    status: text("status").notNull().default("success"), // success | denied | error | insufficient_data
    dataProvenance: text("data_provenance").notNull().default("live_tenant_data"),
    latencyMs: integer("latency_ms").notNull().default(0),
    errorMessage: text("error_message"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("peopleos_ai_tool_audit_org_time_idx").on(
      table.organizationId,
      table.createdAt,
    ),
  ],
);

/**
 * RAG Policy Documents: Tenant-scoped and statutory documents backing verified citation retrieval
 */
export const ragPolicyDocumentsTable = pgTable(
  "peopleos_rag_policy_documents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizationsTable.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    category: text("category").notNull(),
    content: text("content").notNull(),
    sourceDocument: text("source_document").notNull(),
    effectiveDate: text("effective_date").notNull(),
    status: text("status").notNull().default("active"),
    version: text("version").notNull().default("1.0.0"),
    accessRolesJson: text("access_roles_json").notNull().default("[]"), // Allowed roles, empty = all authenticated
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("peopleos_rag_policy_org_cat_idx").on(
      table.organizationId,
      table.category,
    ),
  ],
);

export type MlModelRegistryRecord = typeof mlModelRegistryTable.$inferSelect;
export type MlModelVersionRecord = typeof mlModelVersionsTable.$inferSelect;
export type MlEvaluationResultRecord = typeof mlEvaluationResultsTable.$inferSelect;
export type AiToolAuditLogRecord = typeof aiToolAuditLogsTable.$inferSelect;
export type RagPolicyDocumentRecord = typeof ragPolicyDocumentsTable.$inferSelect;
