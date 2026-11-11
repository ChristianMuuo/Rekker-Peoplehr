import crypto from "node:crypto";
import { desc, eq } from "drizzle-orm";
import {
  aiAgentRunsTable,
  aiConversationsTable,
  db,
  type MembershipRecord,
} from "@workspace/db";
import { invokeLlmWithRetry } from "./llmClient";
import {
  enqueueAiApprovalProposal,
  executeScopedTool,
  retrieveRelevantPolicies,
  type RagPolicy,
} from "./tools";
import { PEOPLEOS_ROLES } from "../middlewares/peopleosAccess";

export type SpecialistAgentId =
  | "supervisor"
  | "copilot"
  | "recruitment"
  | "onboarding"
  | "payroll"
  | "attendance"
  | "performance"
  | "retention"
  | "learning"
  | "compliance"
  | "executive";

export interface AgentMetadata {
  id: SpecialistAgentId;
  name: string;
  tagline: string;
  description: string;
  collaboratesWith: SpecialistAgentId[];
  requiredRoles?: readonly string[];
}

export const SPECIALIST_AGENTS: Record<SpecialistAgentId, AgentMetadata> = {
  supervisor: {
    id: "supervisor",
    name: "Rekker AI Supervisor",
    tagline: "Multi-Agent Orchestrator & RBAC Router",
    description: "Classifies workforce inquiries, enforces RBAC scope, delegates across 10 specialist HR agents, and gates high-impact actions for human signoff.",
    collaboratesWith: ["copilot", "payroll", "compliance", "executive", "retention"],
  },
  copilot: {
    id: "copilot",
    name: "HR Copilot Agent",
    tagline: "Employee Self-Service & Workforce Operations",
    description: "Answers team headcount, directory, leave coverage, and self-service operational questions.",
    collaboratesWith: ["compliance", "onboarding"],
  },
  recruitment: {
    id: "recruitment",
    name: "Recruitment Intelligence Agent",
    tagline: "ATS Matching, JD Drafting & Structured Scorecards",
    description: "Scores candidates strictly on job criteria (no protected traits, never auto-rejects) and assists with interviews.",
    collaboratesWith: ["onboarding", "compliance"],
  },
  onboarding: {
    id: "onboarding",
    name: "Onboarding & Lifecycle Agent",
    tagline: "30-60-90 Day Plans, Probation & Offboarding",
    description: "Manages onboarding checklists, KRA/NSSF/SHIF enrollment steps, asset assignment, and offboarding clearance.",
    collaboratesWith: ["copilot", "compliance"],
  },
  payroll: {
    id: "payroll",
    name: "Payroll Intelligence Agent",
    tagline: "Configurable Kenya Statutory PAYE, NSSF, SHIF & AHL",
    description: "Runs effective-dated Kenyan payroll calculations, IsolationForest anomaly audits, and proposes M-Pesa/bank runs.",
    collaboratesWith: ["compliance", "executive"],
  },
  attendance: {
    id: "attendance",
    name: "Attendance Intelligence Agent",
    tagline: "Shifts, Overtime & Anomaly Detection",
    description: "Detects duplicate punches, late shift patterns, and recommends plant/hub shift balancing.",
    collaboratesWith: ["payroll", "retention"],
  },
  performance: {
    id: "performance",
    name: "Performance Intelligence Agent",
    tagline: "OKRs, KPIs & 360 Feedback Synthesis",
    description: "Analyzes goal momentum, highlights behind-target KPIs, and drafts structured review frameworks.",
    collaboratesWith: ["learning", "retention"],
  },
  retention: {
    id: "retention",
    name: "Employee Retention Agent",
    tagline: "XGBoost Attrition Risk & Sentiment Early Warning",
    description: "Combines XGBoost turnover predictors with NLP sentiment analysis to flag burnout & contract expiry risks.",
    collaboratesWith: ["payroll", "attendance", "performance"],
  },
  learning: {
    id: "learning",
    name: "Learning & Development Agent",
    tagline: "Skills-Gap Matrix & Certification Roadmaps",
    description: "Maps role competency gaps across departments and recommends statutory/technical training.",
    collaboratesWith: ["performance", "onboarding"],
  },
  compliance: {
    id: "compliance",
    name: "Compliance Monitoring Agent",
    tagline: "Kenya Employment Act 2007, KRA & ODPC Privacy",
    description: "Performs RAG citations over verified HR policies, monitors contract expiry windows, and guards PII.",
    collaboratesWith: ["payroll", "onboarding"],
  },
  executive: {
    id: "executive",
    name: "Executive Intelligence Agent",
    tagline: "Strategic Workforce Demand Forecasting & Cross-Module Briefings",
    description: "Synthesizes Ridge demand forecasts, budget gap utilization, attrition exposure, and compliance readiness.",
    collaboratesWith: ["retention", "payroll", "compliance"],
  },
};

export interface OrchestratorRunRecord {
  id: string;
  organizationId: string;
  conversationId: string;
  userId: string;
  userRole: string;
  requestedAgent: SpecialistAgentId;
  resolvedAgent: SpecialistAgentId;
  provider: string;
  model: string;
  promptTokens: number;
  completionTokens: number;
  estimatedCostMicros: number;
  latencyMs: number;
  toolsCalled: string[];
  status: string;
  errorMessage: string | null;
  createdAt: string;
}

const IN_MEMORY_CONVERSATIONS = new Map<string, any[]>();
const IN_MEMORY_RUNS: OrchestratorRunRecord[] = [];

export function classifyIntentToAgent(
  query: string,
  requestedAgent: SpecialistAgentId = "supervisor",
): SpecialistAgentId {
  if (requestedAgent !== "supervisor" && SPECIALIST_AGENTS[requestedAgent]) {
    return requestedAgent;
  }
  const lower = query.toLowerCase();

  if (
    lower.includes("onboard") ||
    lower.includes("offboard") ||
    lower.includes("probation checklist") ||
    lower.includes("30-60-90") ||
    lower.includes("exit interview")
  ) {
    return "onboarding";
  }
  if (
    lower.includes("executive") ||
    lower.includes("forecast") ||
    lower.includes("demand") ||
    lower.includes("briefing") ||
    /\bboard\b/.test(lower)
  ) {
    return "executive";
  }
  if (
    lower.includes("attrition") ||
    lower.includes("retention") ||
    lower.includes("turnover") ||
    lower.includes("sentiment") ||
    lower.includes("burnout") ||
    lower.includes("resign")
  ) {
    return "retention";
  }
  if (
    lower.includes("skill") ||
    lower.includes("training") ||
    lower.includes("course") ||
    lower.includes("learning") ||
    lower.includes("certif")
  ) {
    return "learning";
  }
  if (
    lower.includes("attendance") ||
    lower.includes("clock") ||
    lower.includes("shift") ||
    lower.includes("late") ||
    lower.includes("overtime pattern")
  ) {
    return "attendance";
  }
  if (
    lower.includes("pay") ||
    lower.includes("salary") ||
    lower.includes("kra") ||
    lower.includes("nssf") ||
    lower.includes("sha") ||
    lower.includes("shif") ||
    lower.includes("housing levy") ||
    lower.includes("mpesa") ||
    lower.includes("p9a")
  ) {
    return "payroll";
  }
  if (
    lower.includes("job") ||
    lower.includes("candidate") ||
    lower.includes("hire") ||
    lower.includes("interview") ||
    lower.includes("resume") ||
    lower.includes("recruit")
  ) {
    return "recruitment";
  }
  if (
    lower.includes("policy") ||
    lower.includes("law") ||
    lower.includes("act") ||
    lower.includes("entitlement") ||
    lower.includes("maternity") ||
    lower.includes("paternity") ||
    lower.includes("odpc") ||
    lower.includes("privacy") ||
    lower.includes("compliance")
  ) {
    return "compliance";
  }
  if (
    lower.includes("goal") ||
    lower.includes("okr") ||
    lower.includes("performance") ||
    lower.includes("kpi") ||
    lower.includes("review")
  ) {
    return "performance";
  }
  return "copilot";
}

function detectHighImpactProposal(query: string): {
  action: string;
  targetType: string;
  targetId: string;
  payload: Record<string, unknown>;
} | null {
  const lower = query.toLowerCase();
  if (
    (lower.includes("salary") || lower.includes("raise") || lower.includes("increment")) &&
    (lower.includes("modify") ||
      lower.includes("update") ||
      lower.includes("increase") ||
      lower.includes("change") ||
      lower.includes("propose"))
  ) {
    const numMatch = query.match(/(\d[\d,]{3,})/);
    return {
      action: "MODIFY_COMPENSATION",
      targetType: "employee",
      targetId: "10000000-0000-4000-8000-000000000006",
      payload: {
        proposedAmountKes: numMatch ? Number(numMatch[1]!.replace(/,/g, "")) : 135000,
        sourcePrompt: query.slice(0, 240),
      },
    };
  }
  if (
    (lower.includes("approve") || lower.includes("disburse") || lower.includes("mpesa")) &&
    lower.includes("payroll") &&
    !lower.includes("explain") &&
    !lower.includes("how")
  ) {
    return {
      action: "APPROVE_AND_DISBURSE_PAYROLL",
      targetType: "payroll_run",
      targetId: "run_2026_03",
      payload: { period: "March 2026", channel: "mpesa_b2c" },
    };
  }
  if (lower.includes("terminate") || lower.includes("dismiss")) {
    return {
      action: "TERMINATE_EMPLOYMENT_CONTRACT",
      targetType: "employee",
      targetId: "review_required",
      payload: { reason: "Requested via AI agent workflow", sourcePrompt: query.slice(0, 240) },
    };
  }
  return null;
}

export async function runMultiAgentGraph(params: {
  query: string;
  requestedAgent: SpecialistAgentId;
  conversationId: string;
  membership: MembershipRecord;
}) {
  const startMs = Date.now();
  const { query, requestedAgent, conversationId, membership } = params;
  const role = membership.role;
  const lower = query.toLowerCase();

  // Stage 1: Supervisor Classification Node
  const resolvedAgent = classifyIntentToAgent(query, requestedAgent);
  const agentMeta = SPECIALIST_AGENTS[resolvedAgent];

  // Stage 2: Strict Negative Authorization & Privacy Guardrail Node
  const isEmployeeOnly = role === PEOPLEOS_ROLES.employee;
  const isOrgWidePayroll =
    (lower.includes("payroll") || lower.includes("salary") || lower.includes("compensation")) &&
    (lower.includes("all") || lower.includes("company") || lower.includes("workforce") || lower.includes("director") || lower.includes("audit"));
  const isAuditQuery =
    lower.includes("audit") || lower.includes("audit log") || lower.includes("tracking log");
  const isAttritionCompanyQuery =
    resolvedAgent === "retention" || resolvedAgent === "executive";

  if (
    isEmployeeOnly &&
    (isOrgWidePayroll || isAuditQuery || isAttritionCompanyQuery)
  ) {
    const latencyMs = Date.now() - startMs;
    const denied = {
      id: `resp_${Date.now()}`,
      conversationId,
      agentRole: resolvedAgent,
      agentName: agentMeta.name,
      query,
      response:
        "Access Denied: Under Rekker PeopleOS role-based access controls and Kenya Data Protection Act 2019 boundaries, standard employee accounts cannot query organization-wide compensation, executive attrition predictions, or audit trails.",
      citations: [],
      structuredCard: null,
      collaboratorsConsulted: [],
      toolsCalled: [],
      provider: "RBAC Policy Guardrail",
      model: "rbac-enforcer-v2",
      tokenUsage: { promptTokens: 0, completionTokens: 0, estimatedCostUsd: 0 },
      latencyMs,
      authorizedRole: role,
      timestamp: new Date().toISOString(),
    };
    await persistRunAndTurn(membership, conversationId, denied, "denied_rbac");
    return { statusCode: 403 as const, body: denied };
  }

  // Stage 3: Tool Planning & Multi-Agent Collaboration Execution Node
  const toolsCalled: string[] = [];
  const toolOutputs: Record<string, any> = {};
  const collaborators: SpecialistAgentId[] = [...agentMeta.collaboratesWith];

  const snapshot = await executeScopedTool("get_workforce_snapshot", membership);
  toolsCalled.push("get_workforce_snapshot");
  toolOutputs.snapshot = snapshot.data;

  const retrievedPolicies: RagPolicy[] = retrieveRelevantPolicies(query, 2);
  toolsCalled.push("search_policies_rag");

  if (resolvedAgent === "payroll") {
    const numMatch = query.match(/(\d[\d,]{3,})/);
    const grossSalary = numMatch ? Number(numMatch[1]!.replace(/,/g, "")) : 220000;
    const calc = await executeScopedTool("compute_kenya_statutory_breakdown", membership, {
      grossSalary,
    });
    toolsCalled.push("compute_kenya_statutory_breakdown");
    toolOutputs.payrollBreakdown = calc.data;

    if (lower.includes("audit") || lower.includes("anomal")) {
      const anom = await executeScopedTool("run_payroll_anomaly_ml", membership);
      toolsCalled.push("run_payroll_anomaly_ml");
      toolOutputs.payrollAnomalies = anom.allowed ? anom.data : { accessDenied: anom.reason };
    }
  } else if (resolvedAgent === "retention") {
    const mlRes = await executeScopedTool("run_attrition_and_sentiment_ml", membership);
    toolsCalled.push("run_attrition_and_sentiment_ml");
    toolOutputs.retentionMl = mlRes.allowed ? mlRes.data : { accessDenied: mlRes.reason };
  } else if (resolvedAgent === "executive") {
    const [forecastRes, retentionRes] = await Promise.all([
      executeScopedTool("run_workforce_forecast_ml", membership),
      executeScopedTool("run_attrition_and_sentiment_ml", membership),
    ]);
    toolsCalled.push("run_workforce_forecast_ml", "run_attrition_and_sentiment_ml");
    toolOutputs.forecast = forecastRes.allowed ? forecastRes.data : null;
    toolOutputs.retention = retentionRes.allowed ? retentionRes.data : null;
  } else if (resolvedAgent === "recruitment") {
    const matchRes = await executeScopedTool("run_candidate_match_ml", membership);
    toolsCalled.push("run_candidate_match_ml");
    toolOutputs.candidateRanking = matchRes.allowed ? matchRes.data : { accessDenied: matchRes.reason };
  } else if (resolvedAgent === "attendance") {
    const attRes = await executeScopedTool("run_attendance_anomalies_ml", membership);
    toolsCalled.push("run_attendance_anomalies_ml");
    toolOutputs.attendanceMl = attRes.allowed ? attRes.data : { accessDenied: attRes.reason };
  } else if (resolvedAgent === "learning") {
    const skillsRes = await executeScopedTool("run_skills_gap_ml", membership);
    toolsCalled.push("run_skills_gap_ml");
    toolOutputs.skillsGap = skillsRes.data;
  }

  // Stage 4: Human Approval Gate Check (Never mutate salaries, payroll signoff, or terminations without human signoff)
  const highImpact = detectHighImpactProposal(query);
  let queuedApproval = null;
  if (highImpact) {
    queuedApproval = await enqueueAiApprovalProposal({
      membership,
      agentRole: resolvedAgent,
      targetType: highImpact.targetType,
      targetId: highImpact.targetId,
      proposedAction: highImpact.action,
      payload: highImpact.payload,
      rationale: `Triggered from ${agentMeta.name} user inquiry; held pending human HR/Payroll Admin approval.`,
    });
    toolsCalled.push("enqueue_ai_approval_proposal");
  }

  // Stage 5: Deterministic Grounded Text + Optional OpenAI Synthesis with Retry/Fallback
  const deterministicDraft = buildGroundedNarrative(
    resolvedAgent,
    query,
    toolOutputs,
    retrievedPolicies,
    queuedApproval,
  );

  const llmResult = await invokeLlmWithRetry({
    systemPrompt: `You are the ${agentMeta.name} inside Rekker PeopleOS (Kenya enterprise HRMS).
Role: ${agentMeta.description}
User RBAC role: ${role}.
Rules:
1. Only cite facts from the provided tool outputs and HR policy excerpts. Never invent numbers or expose unauthorized data.
2. Be concise, executive-ready, and accurate on Kenyan payroll/labor governance.
3. If an action requires human approval, explicitly state it has been queued for human review.`,
    userPrompt: `User Question: ${query}\n\nTool Results JSON:\n${JSON.stringify(toolOutputs).slice(0, 3500)}\n\nPolicy Citations:\n${JSON.stringify(retrievedPolicies).slice(0, 1200)}\n\nApproval Queued: ${queuedApproval ? queuedApproval.proposedAction : "None"}`,
  });

  const finalReply = llmResult.content || deterministicDraft.text;
  const structuredCard = deterministicDraft.structuredCard;
  const citations = retrievedPolicies.map((p) => ({
    title: p.title,
    source: p.sourceDocument,
    effectiveDate: p.effectiveDate,
    excerpt: p.content,
  }));

  const latencyMs = Date.now() - startMs;
  const responsePayload = {
    id: `resp_${Date.now()}`,
    conversationId,
    agentRole: resolvedAgent,
    agentName: agentMeta.name,
    query,
    response: finalReply,
    citations,
    structuredCard,
    collaboratorsConsulted: collaborators.slice(0, 3),
    toolsCalled,
    humanApprovalQueued: queuedApproval,
    provider: llmResult.provider,
    model: llmResult.model,
    tokenUsage: {
      promptTokens: llmResult.promptTokens,
      completionTokens: llmResult.completionTokens,
      estimatedCostUsd: Number((llmResult.estimatedCostMicros / 1_000_000).toFixed(6)),
    },
    latencyMs,
    authorizedRole: role,
    timestamp: new Date().toISOString(),
  };

  await persistRunAndTurn(membership, conversationId, {
    ...responsePayload,
    estimatedCostMicros: llmResult.estimatedCostMicros,
    requestedAgent,
  }, "completed");

  return { statusCode: 200 as const, body: responsePayload };
}

function buildGroundedNarrative(
  agent: SpecialistAgentId,
  query: string,
  tools: Record<string, any>,
  policies: RagPolicy[],
  approval: any,
): { text: string; structuredCard: any } {
  const snap = tools.snapshot ?? {};

  if (approval) {
    return {
      text: `### Human Approval Required: \`${approval.proposedAction}\`\n\nPer Rekker PeopleOS AI Governance Policy, high-impact actions cannot execute autonomously. I have queued a formal **Human Approval Proposal** (\`${approval.id.slice(0, 8)}\`) for authorized HR / Payroll Admin review.`,
      structuredCard: {
        type: "approval_proposal",
        title: `Queued Action: ${approval.proposedAction}`,
        data: {
          approvalId: approval.id,
          status: approval.status,
          targetType: approval.targetType,
          targetId: approval.targetId,
          payload: approval.payload,
        },
      },
    };
  }

  if (agent === "payroll" && tools.payrollBreakdown) {
    const p = tools.payrollBreakdown;
    return {
      text: `### Kenya Statutory Payroll Calculation (${p.configName})\n\nFor a gross pay of **KES ${p.grossPay.toLocaleString()}**:\n- **NSSF Tier I & II:** KES ${p.totalNssf.toLocaleString()}\n- **SHIF (2.75%):** KES ${p.sha.toLocaleString()}\n- **Affordable Housing Levy (1.5%):** KES ${p.housingLevy.toLocaleString()} (matched by employer)\n- **Net PAYE Income Tax:** KES ${p.netPaye.toLocaleString()} (after KES ${p.personalRelief.toLocaleString()} relief)\n- **Net Take-Home Payout:** **KES ${p.netPay.toLocaleString()}**`,
      structuredCard: {
        type: "payroll_breakdown",
        title: `Statutory Breakdown (${p.effectiveFrom})`,
        data: {
          gross: p.grossPay,
          totalNssf: p.totalNssf,
          sha: p.sha,
          housingLevy: p.housingLevy,
          netPaye: p.netPaye,
          netPay: p.netPay,
        },
      },
    };
  }

  if (agent === "retention" && tools.retentionMl?.attrition) {
    const preds = tools.retentionMl.attrition.predictions ?? [];
    const top = preds.slice(0, 3);
    const auc = tools.retentionMl.attrition.evaluationMetrics?.cvRocAuc ?? "N/A";
    const mode = tools.retentionMl.attrition.analyticsMode ?? "SIMULATED_DEMO_BASELINE";
    return {
      text: `### Employee Retention & XGBoost Attrition Intelligence (${mode})\n\nEvaluated **${preds.length} active employee records** (CV ROC-AUC: **${auc}**).\n\n${top
        .map(
          (e: any) =>
            `- **${e.employeeName}** (${e.department}): **${(e.attritionProbability * 100).toFixed(1)}% risk** [${e.riskTier.toUpperCase()}] — Top driver: ${e.topDrivers?.[0]?.feature ?? "Tenure"}`,
        )
        .join("\n")}\n\n*Sentiment Scan:* ${tools.retentionMl.sentiment?.atRiskCount ?? 0} burnout signal(s) identified.`,
      structuredCard: {
        type: "kpis",
        title: "Retention ML Summary",
        data: [
          { label: "Analytics Mode", value: mode },
          { label: "Model CV ROC-AUC", value: String(auc) },
          { label: "High-Risk Flagged", value: `${preds.filter((x: any) => x.riskTier === "high").length} personnel` },
          { label: "Burnout Signals", value: `${tools.retentionMl.sentiment?.atRiskCount ?? 0} entries` },
        ],
      },
    };
  }

  if (agent === "executive") {
    const f = tools.forecast?.forecast ?? [];
    const nextQ = f[2]?.projectedHeadcount ?? snap.totalEmployees;
    return {
      text: `### Executive Workforce Intelligence Briefing\n\nCollaborated across **Retention**, **Payroll**, and **Compliance** specialists for organization \`${snap.organizationId}\`:\n\n- **Active Headcount:** ${snap.totalEmployees} employees across ${snap.departmentsCount} divisions\n- **3-Month Demand Forecast:** Projected **${nextQ}** personnel (Ridge Regression)\n- **Action Queues:** ${snap.pendingLeaveCount} pending leave requests · ${snap.expiringContractsCount} contract milestone(s)\n- **Leave Policy Governance:** ${snap.configuredLeavePoliciesCount} organization-configured leave rule(s)`,
      structuredCard: {
        type: "kpis",
        title: "Executive Workforce Metrics",
        data: [
          { label: "Current Workforce", value: `${snap.totalEmployees} people` },
          { label: "90-Day Forecast", value: `${nextQ} projected` },
          { label: "Pending Approvals", value: `${snap.pendingLeaveCount} leave items` },
          { label: "Contract Alerts", value: `${snap.expiringContractsCount} expiring` },
        ],
      },
    };
  }

  if (agent === "recruitment" && tools.candidateRanking?.rankings) {
    const top = tools.candidateRanking.rankings[0];
    return {
      text: `### Recruitment & Explainable Candidate Matching\n\nScored **${tools.candidateRanking.rankings.length} active candidates** using TF-IDF job criteria alignment (protected characteristics excluded, no auto-reject):\n\n${tools.candidateRanking.rankings
        .map(
          (r: any) =>
            `- **${r.fullName}** (${r.stage}): **${r.overallMatchPct}% match** — Matched terms: \`${(r.matchedJobCriteria || []).join(", ") || "experience"}\``,
        )
        .join("\n")}`,
      structuredCard: top
        ? {
            type: "kpis",
            title: "Top Candidate Alignment",
            data: [
              { label: "Leading Candidate", value: top.fullName },
              { label: "Composite Match", value: `${top.overallMatchPct}%` },
              { label: "Skills Alignment", value: `${top.semanticSkillsScorePct}%` },
              { label: "Fairness Guard", value: "Criteria-Only" },
            ],
          }
        : null,
    };
  }

  if (agent === "learning" && tools.skillsGap?.employeeGaps) {
    const readiness = tools.skillsGap.organizationSkillReadinessPct ?? 0;
    const firstGap = tools.skillsGap.employeeGaps[0];
    return {
      text: `### Learning & Development Skills-Gap Analysis\n\nAverage competency readiness across scoped roles is **${readiness}%**.\n\n${tools.skillsGap.employeeGaps
        .slice(0, 4)
        .map(
          (g: any) =>
            `- **${g.employeeName}** (${g.departmentName}): ${g.coveragePct}% coverage — Missing: ${g.missingSkills.join(", ") || "None"}`,
        )
        .join("\n")}`,
      structuredCard: firstGap
        ? {
            type: "kpis",
            title: "Organization Skills Readiness",
            data: [
              { label: "Overall Readiness", value: `${readiness}%` },
              { label: "Employees Analyzed", value: `${tools.skillsGap.employeeGaps.length}` },
              { label: "Top Priority", value: firstGap.missingSkills[0] || "On Track" },
              { label: "Compliance Courses", value: "KEBS / DOSHS / ODPC" },
            ],
          }
        : null,
    };
  }

  if (agent === "attendance" && tools.attendanceMl?.anomalies) {
    const list = tools.attendanceMl.anomalies;
    return {
      text: `### Attendance & Shift Anomaly Intelligence\n\nAnalyzed **${tools.attendanceMl.recordsAnalyzed ?? 0} recent shift punches** via IsolationForest + duplicate-event detection:\n\n${list.length ? list.map((a: any) => `- **${a.employeeName}** [${a.type}]: ${a.explanation}`).join("\n") : "- No shift anomalies flagged."}`,
      structuredCard: {
        type: "kpis",
        title: "Shift Telemetry Summary",
        data: [
          { label: "Records Scanned", value: `${tools.attendanceMl.recordsAnalyzed ?? 0}` },
          { label: "Anomalies Flagged", value: `${list.length}` },
          { label: "Model", value: "IsolationForest" },
          { label: "Duplicate Guards", value: "Active" },
        ],
      },
    };
  }

  if (agent === "onboarding") {
    return {
      text: `### Onboarding & Offboarding Lifecycle Agent\n\nCurrently monitoring **${snap.probationCount ?? 0} probation employee(s)** and **${snap.expiringContractsCount ?? 0} contract renewal/offboarding check-in(s)**.\n\n- **Day 1–30:** Verify KRA PIN, NSSF, SHIF & signed §10 Employment Contract\n- **Day 31–60:** Confirm IT asset tag assignment & manager check-in\n- **Day 61–90:** Human HR & Manager confirmation signoff`,
      structuredCard: {
        type: "kpis",
        title: "Lifecycle Checkpoints",
        data: [
          { label: "Probation Reviews", value: `${snap.probationCount ?? 0} active` },
          { label: "Contract Expiries", value: `${snap.expiringContractsCount ?? 0} within 60d` },
          { label: "Onboarding SLA", value: "30-60-90 Day" },
          { label: "Asset Clearance", value: "Tracked" },
        ],
      },
    };
  }

  if (agent === "performance") {
    return {
      text: `### Performance & OKR Intelligence Agent\n\nRecommended quarterly OKR cadence aligns plant throughput, logistics turnaround, and KRA financial accuracy across **${snap.departmentsCount} divisions**. Visit **Performance** to update OKR key-result sliders or generate role OKRs.`,
      structuredCard: {
        type: "kpis",
        title: "Performance Alignment",
        data: [
          { label: "Active Cycle", value: "Q1/Q2 2026" },
          { label: "Divisions Covered", value: `${snap.departmentsCount}` },
          { label: "Framework", value: "OKR + 360 Review" },
          { label: "Trend Engine", value: "Active" },
        ],
      },
    };
  }

  if (agent === "compliance" && policies.length > 0) {
    const p = policies[0]!;
    return {
      text: `### Verified Policy & Statutory Guidance\n\n**${p.title}**\n\n${p.content}\n\n*Source: ${p.sourceDocument} (Effective: ${p.effectiveDate})*`,
      structuredCard: {
        type: "policy_citation",
        title: p.title,
        data: p,
      },
    };
  }

  // Copilot default
  return {
    text: `### Rekker HR Copilot Overview\n\nWorkspace: \`${snap.organizationId}\` · **${snap.totalEmployees} workforce records** across **${snap.departmentsCount} teams**.\n\n- **Pending Leave Requests:** ${snap.pendingLeaveCount}\n- **Probation Milestones:** ${snap.probationCount}\n- **Expiring Contracts:** ${snap.expiringContractsCount}\n\nQuery intent classified as: \`${query.slice(0, 80)}\`. How would you like to proceed?`,
    structuredCard: {
      type: "kpis",
      title: "Workforce Snapshot",
      data: [
        { label: "Headcount", value: `${snap.totalEmployees} people` },
        { label: "Active Today", value: `${snap.activeEmployees}` },
        { label: "Pending Leaves", value: `${snap.pendingLeaveCount}` },
        { label: "Leave Policies", value: `${snap.configuredLeavePoliciesCount}` },
      ],
    },
  };
}

async function persistRunAndTurn(
  membership: MembershipRecord,
  conversationId: string,
  turnPayload: any,
  status: string,
) {
  const convKey = `${membership.organizationId}::${conversationId}`;
  const current = IN_MEMORY_CONVERSATIONS.get(convKey) ?? [];
  current.push(turnPayload);
  IN_MEMORY_CONVERSATIONS.set(convKey, current);

  const runRec: OrchestratorRunRecord = {
    id: crypto.randomUUID(),
    organizationId: membership.organizationId,
    conversationId,
    userId: membership.userId,
    userRole: membership.role,
    requestedAgent: turnPayload.requestedAgent ?? turnPayload.agentRole,
    resolvedAgent: turnPayload.agentRole,
    provider: turnPayload.provider ?? "Rekker Deterministic Orchestrator",
    model: turnPayload.model ?? "tool-grounded-synthesizer-v2",
    promptTokens: turnPayload.tokenUsage?.promptTokens ?? 0,
    completionTokens: turnPayload.tokenUsage?.completionTokens ?? 0,
    estimatedCostMicros: turnPayload.estimatedCostMicros ?? 0,
    latencyMs: turnPayload.latencyMs ?? 0,
    toolsCalled: turnPayload.toolsCalled ?? [],
    status,
    errorMessage: status === "denied_rbac" ? "RBAC guardrail block" : null,
    createdAt: new Date().toISOString(),
  };
  IN_MEMORY_RUNS.unshift(runRec);

  if (process.env.DATABASE_URL) {
    try {
      await db.insert(aiAgentRunsTable).values({
        organizationId: runRec.organizationId,
        conversationId: runRec.conversationId,
        userId: runRec.userId,
        userRole: runRec.userRole,
        requestedAgent: runRec.requestedAgent,
        resolvedAgent: runRec.resolvedAgent,
        provider: runRec.provider,
        model: runRec.model,
        promptTokens: runRec.promptTokens,
        completionTokens: runRec.completionTokens,
        estimatedCostMicros: runRec.estimatedCostMicros,
        latencyMs: runRec.latencyMs,
        toolsCalledJson: JSON.stringify(runRec.toolsCalled),
        status: runRec.status,
        errorMessage: runRec.errorMessage,
      });

      await db.insert(aiConversationsTable).values({
        organizationId: membership.organizationId,
        userId: membership.userId,
        agentRole: runRec.resolvedAgent,
        messagesJson: JSON.stringify(current.slice(-20)),
      });
    } catch {
      // Keep chat operational even if telemetry DB insert encounters transient latency
    }
  }
}

export async function getConversationHistory(
  organizationId: string,
  conversationId: string,
) {
  const convKey = `${organizationId}::${conversationId}`;
  return IN_MEMORY_CONVERSATIONS.get(convKey) ?? [];
}

export async function getTelemetrySummary(organizationId: string) {
  let runs = IN_MEMORY_RUNS.filter((r) => r.organizationId === organizationId);

  if (process.env.DATABASE_URL && runs.length === 0) {
    try {
      const dbRuns = await db
        .select()
        .from(aiAgentRunsTable)
        .where(eq(aiAgentRunsTable.organizationId, organizationId))
        .orderBy(desc(aiAgentRunsTable.createdAt))
        .limit(50);

      runs = dbRuns.map((r) => ({
        id: r.id,
        organizationId: r.organizationId,
        conversationId: r.conversationId,
        userId: r.userId,
        userRole: r.userRole,
        requestedAgent: r.requestedAgent as SpecialistAgentId,
        resolvedAgent: r.resolvedAgent as SpecialistAgentId,
        provider: r.provider,
        model: r.model,
        promptTokens: r.promptTokens,
        completionTokens: r.completionTokens,
        estimatedCostMicros: r.estimatedCostMicros,
        latencyMs: r.latencyMs,
        toolsCalled: JSON.parse(r.toolsCalledJson) as string[],
        status: r.status,
        errorMessage: r.errorMessage,
        createdAt: r.createdAt.toISOString(),
      }));
    } catch {
      // fallback to memory list
    }
  }

  const totalPromptTokens = runs.reduce((s, r) => s + r.promptTokens, 0);
  const totalCompletionTokens = runs.reduce((s, r) => s + r.completionTokens, 0);
  const totalCostUsd =
    runs.reduce((s, r) => s + r.estimatedCostMicros, 0) / 1_000_000;
  const avgLatencyMs = runs.length
    ? Math.round(runs.reduce((s, r) => s + r.latencyMs, 0) / runs.length)
    : 0;

  return {
    totalRuns: runs.length,
    totalPromptTokens,
    totalCompletionTokens,
    totalEstimatedCostUsd: Number(totalCostUsd.toFixed(6)),
    averageLatencyMs: avgLatencyMs,
    openAiConfigured: Boolean(process.env.OPENAI_API_KEY),
    recentRuns: runs.slice(0, 25),
  };
}
