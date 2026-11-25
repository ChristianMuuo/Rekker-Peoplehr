export type FeatureStatus = "live" | "beta" | "preview" | "roadmap";

export const FEATURE_REGISTRY = {
  overview: {
    label: "Overview",
    status: "live",
    description: "Workforce overview based on authorized PeopleOS records.",
  },
  selfService: {
    label: "My workspace",
    status: "beta",
    description: "Employee self-service workflows with role-limited access.",
  },
  people: {
    label: "People",
    status: "live",
    description: "Employee directory and profile management.",
  },
  organization: {
    label: "Organization",
    status: "live",
    description: "Department and reporting structure views.",
  },
  leave: {
    label: "Leave",
    status: "beta",
    description: "Leave policies, request workflow, ledger balances and approvals.",
  },
  approvals: {
    label: "Approvals",
    status: "beta",
    description: "Human approval queues for configured workflows.",
  },
  recruitment: {
    label: "Recruitment",
    status: "beta",
    description: "Recruitment records and candidate workflows.",
  },
  onboarding: {
    label: "Onboarding",
    status: "beta",
    description: "Employee lifecycle onboarding workflows.",
  },
  attendance: {
    label: "Attendance",
    status: "beta",
    description: "Attendance records and work calendar operations.",
  },
  payroll: {
    label: "Payroll",
    status: "beta",
    description: "Kenyan payroll calculations requiring current statutory verification.",
  },
  expenses: {
    label: "Expenses",
    status: "beta",
    description: "Expense capture and approval workflows.",
  },
  assets: {
    label: "Company assets",
    status: "beta",
    description: "Asset register and assignment workflows.",
  },
  performance: {
    label: "Performance",
    status: "beta",
    description: "Performance goals and review workflows.",
  },
  learning: {
    label: "Learning",
    status: "beta",
    description: "Learning catalogue and completion tracking.",
  },
  documents: {
    label: "Documents",
    status: "beta",
    description: "Employee document management workflows.",
  },
  hrCases: {
    label: "HR Cases",
    status: "beta",
    description: "Restricted employee case-management workflows.",
  },
  workforceErp: {
    label: "Workforce ERP",
    status: "roadmap",
    description: "Operational ERP concept; not represented as a complete live ERP.",
  },
  mlIntelligence: {
    label: "ML intelligence",
    status: "preview",
    description: "Model-service preview. Predictions require a model card and evidence before production use.",
  },
  agentHub: {
    label: "Agent hub",
    status: "preview",
    description: "Concept preview. Only connected API responses are live; role catalogue entries are not proof of deployed agents.",
  },
  reports: {
    label: "Reports & Analytics",
    status: "beta",
    description: "Reporting views from current authorized records.",
  },
  audit: {
    label: "Audit trail",
    status: "beta",
    description: "Organisation-scoped audit history for authorized roles.",
  },
  diagnostics: {
    label: "Diagnostics",
    status: "live",
    description: "Live backend and dependency health probes.",
  },
  settings: {
    label: "Settings",
    status: "beta",
    description: "Workspace configuration hub and settings shortcuts.",
  },
} as const satisfies Record<string, { label: string; status: FeatureStatus; description: string }>;

export type FeatureId = keyof typeof FEATURE_REGISTRY;

export function featureStatusLabel(status: FeatureStatus): string {
  switch (status) {
    case "live": return "Live";
    case "beta": return "Beta";
    case "preview": return "Preview";
    case "roadmap": return "Roadmap";
  }
}
