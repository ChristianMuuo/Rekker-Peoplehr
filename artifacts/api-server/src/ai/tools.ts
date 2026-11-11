import crypto from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import { aiApprovalRequestsTable, db, type MembershipRecord } from "@workspace/db";
import {
  calculateKenyaStatutoryWithConfig,
  getActiveStatutoryConfig,
} from "../lib/kenyaPayrollEngine";
import { runPythonMlTask } from "../lib/mlBridge";
import { buildDefaultPayloadForTask } from "../routes/ml";
import { PEOPLEOS_ROLES } from "../middlewares/peopleosAccess";
import { DEMO_DEPARTMENTS_LIST, DEMO_EMPLOYEES_LIST } from "../routes/peopleos";
import { DEMO_LEAVE_POLICIES, DEMO_LEAVE_STORE } from "../routes/leave";
import { recordAuditEvent } from "../lib/auditService";

export interface RagPolicy {
  id: string;
  title: string;
  category: string;
  content: string;
  sourceDocument: string;
  effectiveDate: string;
}

export const HR_POLICIES: RagPolicy[] = [
  {
    id: "pol_leave_01",
    title: "Organization Leave Policy & Statutory Floor Governance",
    category: "Leave & Absence",
    content:
      "Leave types, annual entitlements, and accrual cadences (annual or monthly) are configured directly per organization inside PeopleOS Leave Policies. Under Section 28 of the Kenya Employment Act 2007, statutory minimum annual leave floors must be respected when HR configures paid leave entitlements, and overlapping leave requests or insufficient balances are automatically guarded.",
    sourceDocument:
      "Kenya Employment Act 2007 §28 & Rekker PeopleOS Workforce Operations Policy §4.1",
    effectiveDate: "2026-01-01",
  },
  {
    id: "pol_maternity_02",
    title: "Maternity and Paternity Leave Provisions",
    category: "Statutory Entitlements",
    content:
      "Under Section 29 of the Kenya Employment Act 2007, female employees are eligible for 3 consecutive months (90 calendar days) of fully paid maternity leave upon medical certification, and male employees are eligible for 2 weeks (14 calendar days) of fully paid paternity leave without forfeiting accrued annual leave.",
    sourceDocument: "Kenya Employment Act 2007 (Cap 226) §29",
    effectiveDate: "2026-01-01",
  },
  {
    id: "pol_payroll_03",
    title: "Configurable Kenya Statutory Deductions & KRA Compliance",
    category: "Compensation & Tax",
    content:
      "Rekker PeopleOS computes Kenyan statutory payroll deductions using versioned, effective-dated rulesets stored in Statutory Configurations (never hardcoded rates). Remittances cover progressive KRA PAYE bands less personal relief, NSSF Tier I & II contributions, Social Health Insurance Fund (SHIF), and Affordable Housing Levy (AHL) matched by employer, due by the 9th of each month.",
    sourceDocument:
      "KRA Income Tax Guidelines, NSSF Act & Social Health Insurance Act",
    effectiveDate: "2026-01-01",
  },
  {
    id: "pol_privacy_04",
    title: "Workforce Data Protection & Privacy Standard",
    category: "Governance & Legal",
    content:
      "All employee personal, health, biometric, National ID, KRA PIN, and compensation data processed by Rekker PeopleOS is subject to the Kenya Data Protection Act 2019. Sensitive identifiers are encrypted with AES-256-GCM and masked by RBAC. AI agents strictly enforce user role boundaries and never disclose unauthorized employee salaries or audit logs.",
    sourceDocument:
      "Office of the Data Protection Commissioner (ODPC) Guidelines 2019",
    effectiveDate: "2026-01-01",
  },
  {
    id: "pol_probation_05",
    title: "Probationary Periods & Contract Lifecycle SOP",
    category: "Employee Lifecycle",
    content:
      "New permanent hires undergo structured 30-60-90 day onboarding milestones. Probation termination requires notice in accordance with Section 42 of the Employment Act. Fixed-term contracts nearing expiration within 60 days trigger automated manager alerts and offboarding/renewal checklists.",
    sourceDocument: "Kenya Employment Act §42 & Rekker Talent SOP",
    effectiveDate: "2026-01-01",
  },
  {
    id: "pol_ai_ethics_06",
    title: "Responsible HR AI & Human-in-the-Loop Governance",
    category: "AI Governance",
    content:
      "AI agents inside PeopleOS use job-related criteria exclusively for candidate scoring and workforce analytics. Agents are strictly prohibited from auto-rejecting candidates, using protected demographic traits, modifying employee salaries, approving payroll disbursements, or terminating contracts without an explicit human HR/Payroll Admin signoff.",
    sourceDocument: "Rekker AI Governance Charter v2.0",
    effectiveDate: "2026-01-01",
  },
];

export function retrieveRelevantPolicies(
  query: string,
  maxResults: number = 2,
): RagPolicy[] {
  const q = query.toLowerCase();
  const scored = HR_POLICIES.map((p) => {
    let score = 0;
    const words = q.split(/\W+/).filter((w) => w.length > 2);
    for (const w of words) {
      if (p.title.toLowerCase().includes(w)) score += 4;
      if (p.category.toLowerCase().includes(w)) score += 3;
      if (p.content.toLowerCase().includes(w)) score += 1;
    }
    return { policy: p, score };
  });

  return scored
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, maxResults)
    .map((s) => s.policy);
}

export interface AiApprovalItem {
  id: string;
  organizationId: string;
  agentRole: string;
  requestedByUserId: string;
  targetType: string;
  targetId: string;
  proposedAction: string;
  payload: Record<string, unknown>;
  rationale: string;
  status: "pending" | "approved" | "rejected";
  decidedByUserId: string | null;
  decisionComment: string | null;
  decidedAt: string | null;
  createdAt: string;
}

const IN_MEMORY_AI_APPROVALS: AiApprovalItem[] = [];

export async function listAiApprovals(
  organizationId: string,
): Promise<AiApprovalItem[]> {
  if (!process.env.DATABASE_URL) {
    return IN_MEMORY_AI_APPROVALS.filter(
      (a) => a.organizationId === organizationId,
    );
  }
  const rows = await db
    .select()
    .from(aiApprovalRequestsTable)
    .where(eq(aiApprovalRequestsTable.organizationId, organizationId))
    .orderBy(desc(aiApprovalRequestsTable.createdAt));

  return rows.map((r) => ({
    id: r.id,
    organizationId: r.organizationId,
    agentRole: r.agentRole,
    requestedByUserId: r.requestedByUserId,
    targetType: r.targetType,
    targetId: r.targetId,
    proposedAction: r.proposedAction,
    payload: JSON.parse(r.payloadJson) as Record<string, unknown>,
    rationale: r.rationale,
    status: r.status as "pending" | "approved" | "rejected",
    decidedByUserId: r.decidedByUserId,
    decisionComment: r.decisionComment,
    decidedAt: r.decidedAt?.toISOString() ?? null,
    createdAt: r.createdAt.toISOString(),
  }));
}

export async function decideAiApproval(params: {
  organizationId: string;
  approvalId: string;
  deciderUserId: string;
  deciderRole: string;
  decision: "approve" | "reject";
  comment?: string | null;
}): Promise<AiApprovalItem | null> {
  const newStatus = params.decision === "approve" ? "approved" : "rejected";

  if (!process.env.DATABASE_URL) {
    const item = IN_MEMORY_AI_APPROVALS.find(
      (a) =>
        a.id === params.approvalId &&
        a.organizationId === params.organizationId,
    );
    if (!item || item.status !== "pending") return null;
    item.status = newStatus;
    item.decidedByUserId = params.deciderUserId;
    item.decisionComment = params.comment ?? null;
    item.decidedAt = new Date().toISOString();
    await recordAuditEvent({
      organizationId: params.organizationId,
      actorUserId: params.deciderUserId,
      actor: params.deciderRole,
      action: `AI_PROPOSAL_${newStatus.toUpperCase()}`,
      targetType: item.targetType,
      targetId: item.targetId,
      summary: `${item.proposedAction} proposal ${newStatus} by ${params.deciderRole}`,
      isDemo: true,
    });
    return item;
  }

  const [updated] = await db
    .update(aiApprovalRequestsTable)
    .set({
      status: newStatus,
      decidedByUserId: params.deciderUserId,
      decisionComment: params.comment ?? null,
      decidedAt: new Date(),
    })
    .where(
      and(
        eq(aiApprovalRequestsTable.id, params.approvalId),
        eq(aiApprovalRequestsTable.organizationId, params.organizationId),
        eq(aiApprovalRequestsTable.status, "pending"),
      ),
    )
    .returning();
  if (!updated) return null;

  await recordAuditEvent({
    organizationId: params.organizationId,
    actorUserId: params.deciderUserId,
    actor: params.deciderRole,
    action: `AI_PROPOSAL_${newStatus.toUpperCase()}`,
    targetType: updated.targetType,
    targetId: updated.targetId,
    summary: `${updated.proposedAction} proposal ${newStatus} by ${params.deciderRole}`,
  });

  return {
    id: updated.id,
    organizationId: updated.organizationId,
    agentRole: updated.agentRole,
    requestedByUserId: updated.requestedByUserId,
    targetType: updated.targetType,
    targetId: updated.targetId,
    proposedAction: updated.proposedAction,
    payload: JSON.parse(updated.payloadJson) as Record<string, unknown>,
    rationale: updated.rationale,
    status: updated.status as "pending" | "approved" | "rejected",
    decidedByUserId: updated.decidedByUserId,
    decisionComment: updated.decisionComment,
    decidedAt: updated.decidedAt?.toISOString() ?? null,
    createdAt: updated.createdAt.toISOString(),
  };
}

export async function enqueueAiApprovalProposal(params: {
  membership: MembershipRecord;
  agentRole: string;
  targetType: string;
  targetId: string;
  proposedAction: string;
  payload: Record<string, unknown>;
  rationale: string;
}): Promise<AiApprovalItem> {
  const item: AiApprovalItem = {
    id: crypto.randomUUID(),
    organizationId: params.membership.organizationId,
    agentRole: params.agentRole,
    requestedByUserId: params.membership.userId,
    targetType: params.targetType,
    targetId: params.targetId,
    proposedAction: params.proposedAction,
    payload: params.payload,
    rationale: params.rationale,
    status: "pending",
    decidedByUserId: null,
    decisionComment: null,
    decidedAt: null,
    createdAt: new Date().toISOString(),
  };

  if (!process.env.DATABASE_URL) {
    IN_MEMORY_AI_APPROVALS.unshift(item);
  } else {
    const [created] = await db
      .insert(aiApprovalRequestsTable)
      .values({
        organizationId: params.membership.organizationId,
        agentRole: params.agentRole,
        requestedByUserId: params.membership.userId,
        targetType: params.targetType,
        targetId: params.targetId,
        proposedAction: params.proposedAction,
        payloadJson: JSON.stringify(params.payload),
        rationale: params.rationale,
        status: "pending",
      })
      .returning();
    if (created) item.id = created.id;
  }

  await recordAuditEvent({
    organizationId: params.membership.organizationId,
    actorUserId: params.membership.userId,
    actor: `ai_agent:${params.agentRole}`,
    action: "AI_APPROVAL_QUEUED",
    targetType: params.targetType,
    targetId: item.id,
    summary: `AI Agent (${params.agentRole}) proposed ${params.proposedAction} requiring human approval`,
    isDemo: !process.env.DATABASE_URL,
  });

  return item;
}

/**
 * Permission-scoped tool execution helper.
 * Never exposes company-wide payroll/attrition/audit to standard employee roles.
 */
export async function executeScopedTool(
  toolName: string,
  membership: MembershipRecord,
  args: Record<string, unknown> = {},
): Promise<{ allowed: boolean; data?: any; reason?: string }> {
  const role = membership.role;
  const orgId = membership.organizationId;

  const isHrOrAdmin = [
    PEOPLEOS_ROLES.hrAdmin,
    PEOPLEOS_ROLES.hrManager,
    PEOPLEOS_ROLES.systemAdmin,
  ].includes(role as any);

  const isPayrollAuthorized = [
    PEOPLEOS_ROLES.hrAdmin,
    PEOPLEOS_ROLES.hrManager,
    PEOPLEOS_ROLES.payrollOfficer,
    PEOPLEOS_ROLES.systemAdmin,
  ].includes(role as any);

  const isExecutiveOrManager =
    isHrOrAdmin ||
    role === PEOPLEOS_ROLES.executive ||
    role === PEOPLEOS_ROLES.departmentManager;

  switch (toolName) {
    case "get_workforce_snapshot": {
      const pendingLeaves = DEMO_LEAVE_STORE.filter((l) => l.status === "pending");
      const expiring = DEMO_EMPLOYEES_LIST.filter((e) => e.contractEndDate);
      const probation = DEMO_EMPLOYEES_LIST.filter((e) => e.status === "probation");
      return {
        allowed: true,
        data: {
          organizationId: orgId,
          totalEmployees: DEMO_EMPLOYEES_LIST.length,
          activeEmployees: DEMO_EMPLOYEES_LIST.filter((e) => e.status === "active").length,
          departmentsCount: DEMO_DEPARTMENTS_LIST.length,
          pendingLeaveCount: pendingLeaves.length,
          pendingLeaveEmployees: isExecutiveOrManager
            ? pendingLeaves.map((l) => l.employeeName)
            : [],
          probationCount: probation.length,
          expiringContractsCount: expiring.length,
          expiringContractNames: isExecutiveOrManager
            ? expiring.map((e) => `${e.firstName} ${e.lastName} (${e.contractEndDate})`)
            : [],
          configuredLeavePoliciesCount: DEMO_LEAVE_POLICIES.filter(
            (p) => p.organizationId === orgId,
          ).length,
        },
      };
    }

    case "compute_kenya_statutory_breakdown": {
      const amount = Number(args.grossSalary) || 180000;
      const cfg = await getActiveStatutoryConfig(orgId);
      const calc = calculateKenyaStatutoryWithConfig(amount, 0, 0, cfg);
      return {
        allowed: true,
        data: {
          configUsed: cfg.name,
          ...calc,
        },
      };
    }

    case "run_payroll_anomaly_ml": {
      if (!isPayrollAuthorized) {
        return {
          allowed: false,
          reason: "Payroll anomaly inspection requires HR Admin, Payroll Officer, or System Admin access.",
        };
      }
      try {
        const mlPayload = await buildDefaultPayloadForTask("payroll_anomalies", orgId);
        const result = await runPythonMlTask("payroll_anomalies", mlPayload);
        return { allowed: true, data: result };
      } catch (err) {
        return {
          allowed: true,
          data: { status: "unavailable", error: err instanceof Error ? err.message : "ML offline" },
        };
      }
    }

    case "run_attrition_and_sentiment_ml": {
      if (!isExecutiveOrManager) {
        return {
          allowed: false,
          reason: "Workforce retention & sentiment ML insights are restricted to HR & Management roles.",
        };
      }
      try {
        const [attrition, sentiment] = await Promise.all([
          runPythonMlTask("attrition", await buildDefaultPayloadForTask("attrition", orgId)),
          runPythonMlTask("sentiment", await buildDefaultPayloadForTask("sentiment", orgId)),
        ]);
        return { allowed: true, data: { attrition, sentiment } };
      } catch (err) {
        return {
          allowed: true,
          data: { status: "unavailable", error: err instanceof Error ? err.message : "ML offline" },
        };
      }
    }

    case "run_workforce_forecast_ml": {
      if (!isExecutiveOrManager) {
        return {
          allowed: false,
          reason: "Executive demand forecasts require Management or Executive role.",
        };
      }
      try {
        const forecast = await runPythonMlTask(
          "workforce_forecast",
          await buildDefaultPayloadForTask("workforce_forecast", orgId),
        );
        return { allowed: true, data: forecast };
      } catch (err) {
        return {
          allowed: true,
          data: { status: "unavailable", error: err instanceof Error ? err.message : "ML offline" },
        };
      }
    }

    case "run_candidate_match_ml": {
      if (!isHrOrAdmin && role !== PEOPLEOS_ROLES.recruiter) {
        return {
          allowed: false,
          reason: "Candidate pipeline matching requires Recruiter or HR permissions.",
        };
      }
      try {
        const ranking = await runPythonMlTask(
          "candidate_match",
          await buildDefaultPayloadForTask("candidate_match", orgId),
        );
        return { allowed: true, data: ranking };
      } catch (err) {
        return {
          allowed: true,
          data: { status: "unavailable", error: err instanceof Error ? err.message : "ML offline" },
        };
      }
    }

    case "run_attendance_anomalies_ml": {
      if (!isExecutiveOrManager) {
        return {
          allowed: false,
          reason: "Attendance anomaly reports require Manager or HR authorization.",
        };
      }
      try {
        const res = await runPythonMlTask(
          "attendance_anomalies",
          await buildDefaultPayloadForTask("attendance_anomalies", orgId),
        );
        return { allowed: true, data: res };
      } catch (err) {
        return {
          allowed: true,
          data: { status: "unavailable", error: err instanceof Error ? err.message : "ML offline" },
        };
      }
    }

    case "run_skills_gap_ml": {
      try {
        const payload = await buildDefaultPayloadForTask("skills_gap", orgId);
        if (!isExecutiveOrManager && membership.employeeId) {
          payload.employees = (payload.employees as any[]).filter(
            (e) => e.id === membership.employeeId,
          );
        }
        const res = await runPythonMlTask("skills_gap", payload);
        return { allowed: true, data: res };
      } catch (err) {
        return {
          allowed: true,
          data: { status: "unavailable", error: err instanceof Error ? err.message : "ML offline" },
        };
      }
    }

    case "search_policies_rag": {
      const query = String(args.query ?? "");
      const policies = retrieveRelevantPolicies(query, 3);
      return { allowed: true, data: policies };
    }

    default:
      return { allowed: false, reason: `Unknown tool: ${toolName}` };
  }
}
