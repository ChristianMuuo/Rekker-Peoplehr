export type FeatureStatus = "live" | "beta" | "preview" | "roadmap";

export interface FeatureRegistryEntry {
  id: string;
  label: string;
  status: FeatureStatus;
  description: string;
  evidence: string;
}

/**
 * Single source of truth for user-facing capability maturity.
 * "live" is reserved for a capability backed by its persisted API workflow;
 * unverified modelling and fallback chat are explicitly preview/roadmap.
 */
export const FEATURE_REGISTRY: Record<string, FeatureRegistryEntry> = {
  "/leave": {
    id: "leave",
    label: "Leave management",
    status: "beta",
    description: "Policy-backed leave requests, human recommendation, HR decision and ledger-based balances.",
    evidence: "Express leave routes, Drizzle leave ledger and leave-engine unit tests; end-to-end CI verification pending.",
  },
  "/agent-hub": {
    id: "agent-hub",
    label: "AI Agent Hub",
    status: "preview",
    description: "Interface concept; local fallback responses are simulated and not live agent execution.",
    evidence: "Local processAgentQuery fallback is labelled simulated; connected service status must be verified per deployment.",
  },
  "/ml": {
    id: "ml",
    label: "ML intelligence",
    status: "preview",
    description: "ML service interface; model cards, provenance and evaluation metrics must be supplied before production claims.",
    evidence: "Python service and health probes exist; trained model performance is not verified by the frontend alone.",
  },
  "/workforce-erp": {
    id: "workforce-erp",
    label: "Workforce ERP",
    status: "roadmap",
    description: "Broader workforce operations capability, not part of the validated leave release slice.",
    evidence: "Module is kept accessible but moved out of primary navigation pending module-level acceptance evidence.",
  },
  "/hr-cases": {
    id: "hr-cases",
    label: "HR Cases",
    status: "beta",
    description: "HR case management module; operational scope and access require tenant-level verification.",
    evidence: "Existing API and frontend module retained; acceptance coverage not verified in this sprint.",
  },
  "/payroll": {
    id: "payroll",
    label: "Payroll",
    status: "beta",
    description: "Payroll calculations and workflows require current statutory rule verification and production integration checks.",
    evidence: "Existing payroll engine and API are retained; go-live review remains required.",
  },
};

export function featureStatusLabel(status: FeatureStatus): string {
  switch (status) {
    case "live": return "Live";
    case "beta": return "Beta";
    case "preview": return "Preview";
    case "roadmap": return "Roadmap";
  }
}
