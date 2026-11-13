-- Phase 5: Advanced AI Agents, Python ML Intelligence, Predictive Analytics & Responsible AI Governance Migration
-- Tables:
-- 1. peopleos_ml_model_registry
-- 2. peopleos_ml_model_versions
-- 3. peopleos_ml_evaluation_results
-- 4. peopleos_ai_tool_audit_logs
-- 5. peopleos_rag_policy_documents

CREATE TABLE IF NOT EXISTS peopleos_ml_model_registry (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id TEXT NOT NULL REFERENCES peopleos_organizations(id) ON DELETE CASCADE,
    task_type TEXT NOT NULL,
    name TEXT NOT NULL,
    algorithm TEXT NOT NULL,
    feature_schema_version TEXT NOT NULL DEFAULT '1.0.0',
    active_version_id TEXT,
    status TEXT NOT NULL DEFAULT 'active',
    description TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS peopleos_ml_registry_org_task_uq 
    ON peopleos_ml_model_registry (organization_id, task_type);
CREATE INDEX IF NOT EXISTS peopleos_ml_registry_org_status_idx 
    ON peopleos_ml_model_registry (organization_id, status);

CREATE TABLE IF NOT EXISTS peopleos_ml_model_versions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    model_registry_id UUID NOT NULL REFERENCES peopleos_ml_model_registry(id) ON DELETE CASCADE,
    organization_id TEXT NOT NULL REFERENCES peopleos_organizations(id) ON DELETE CASCADE,
    version TEXT NOT NULL,
    feature_schema_version TEXT NOT NULL DEFAULT '1.0.0',
    algorithm TEXT NOT NULL,
    metrics_json TEXT NOT NULL DEFAULT '{}',
    data_provenance TEXT NOT NULL DEFAULT 'live_tenant_data',
    status TEXT NOT NULL DEFAULT 'development',
    trained_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    approved_by_user_id TEXT,
    approved_at TIMESTAMP WITH TIME ZONE,
    approval_comment TEXT,
    training_sample_count INTEGER NOT NULL DEFAULT 0,
    hyperparameters_json TEXT NOT NULL DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS peopleos_ml_versions_org_model_ver_uq 
    ON peopleos_ml_model_versions (organization_id, model_registry_id, version);
CREATE INDEX IF NOT EXISTS peopleos_ml_versions_org_status_idx 
    ON peopleos_ml_model_versions (organization_id, status);

CREATE TABLE IF NOT EXISTS peopleos_ml_evaluation_results (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    model_version_id UUID NOT NULL REFERENCES peopleos_ml_model_versions(id) ON DELETE CASCADE,
    organization_id TEXT NOT NULL REFERENCES peopleos_organizations(id) ON DELETE CASCADE,
    task_type TEXT NOT NULL,
    metric_name TEXT NOT NULL,
    metric_value TEXT NOT NULL,
    evaluation_dataset_ref TEXT NOT NULL DEFAULT 'tenant_live_partition',
    is_synthetic_benchmark BOOLEAN NOT NULL DEFAULT FALSE,
    evaluated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS peopleos_ml_eval_org_task_idx 
    ON peopleos_ml_evaluation_results (organization_id, task_type);

CREATE TABLE IF NOT EXISTS peopleos_ai_tool_audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id TEXT NOT NULL REFERENCES peopleos_organizations(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL,
    agent_role TEXT NOT NULL,
    tool_name TEXT NOT NULL,
    input_hash TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'success',
    data_provenance TEXT NOT NULL DEFAULT 'live_tenant_data',
    latency_ms INTEGER NOT NULL DEFAULT 0,
    error_message TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS peopleos_ai_tool_audit_org_time_idx 
    ON peopleos_ai_tool_audit_logs (organization_id, created_at);

CREATE TABLE IF NOT EXISTS peopleos_rag_policy_documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id TEXT NOT NULL REFERENCES peopleos_organizations(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    category TEXT NOT NULL,
    content TEXT NOT NULL,
    source_document TEXT NOT NULL,
    effective_date TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'active',
    version TEXT NOT NULL DEFAULT '1.0.0',
    access_roles_json TEXT NOT NULL DEFAULT '[]',
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS peopleos_rag_policy_org_cat_idx 
    ON peopleos_rag_policy_documents (organization_id, category);
