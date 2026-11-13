import crypto from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import {
  aiApprovalRequestsTable,
  db,
  employeesTable,
  ragPolicyDocumentsTable,
  workforceShiftsTable,
  type MembershipRecord,
} from "@workspace/db";
import {
  calculateKenyaStatutoryWithConfig,
  getActiveStatutoryConfig,
} from "../lib/kenyaPayrollEngine";
import { runPythonMlTask } from "../lib/mlBridge";
import {
  assembleTenantFeaturesForTask,
} from "../services/mlFeatureAssembly";
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
  isCustomPolicy?: boolean;
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

/**
 * Sanitizes external / document text to prevent prompt injection attacks.
 * Strips adversarial instruction override patterns before feeding context to LLM.
 */
export function sanitizeRagText(rawText: string): string {
  let clean = rawText
    .replace(/ignore\s+previous\s+instructions/gi, "[REDACTED_INSTRUCTION]")
    .replace(/disregard\s+(all\s+)?(rbac|rules|instructions)/gi, "[REDACTED_INSTRUCTION]")
    .replace(/you\s+are\s+now\s+in\s+debug\s+mode/gi, "[REDACTED_INSTRUCTION]")
    .replace(/system\s*:\s*/gi, "Context Citation: ")
    .replace(/<\|im_start\|>/gi, "")
    .replace(/<\|im_end\|>/gi, "");
  return clean.trim();
}

/**
 * Synchronous baseline retrieval (preserves 100% backward compatibility for tests and sync helpers)
 */
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

/**
 * Dynamic tenant-scoped RAG search incorporating database policies + statutory baseline
 */
export async function retrieveDynamicPolicies(
  query: string,
  organizationId: string,
  userRole: string,
  maxResults: number = 3,
): Promise<RagPolicy[]> {
  const allPolicies: RagPolicy[] = [...HR_POLICIES];

  if (process.env.DATABASE_URL) {
    try {
      const dbDocs = await db
        .select()
        .from(ragPolicyDocumentsTable)
        .where(
          and(
            eq(ragPolicyDocumentsTable.organizationId, organizationId),
            eq(ragPolicyDocumentsTable.status, "active"),
          ),
        );

      for (const doc of dbDocs) {
        // Enforce RBAC access check on custom documents
        let allowedRoles: string[] = [];
        try {
          if (doc.accessRolesJson) allowedRoles = JSON.parse(doc.accessRolesJson);
        } catch {}

        if (allowedRoles.length > 0 && !allowedRoles.includes(userRole)) {
          continue; // User role not authorized to view this confidential policy
        }

        allPolicies.push({
          id: doc.id,
          title: doc.title,
          category: doc.category,
          content: sanitizeRagText(doc.content),
          sourceDocument: `${doc.sourceDocument} (v${doc.version})`,
          effectiveDate: doc.effectiveDate,
          isCustomPolicy: true,
        });
      }
    } catch (err) {
      console.warn("Dynamic policy retrieval fallback to statutory baseline:", err);
    }
  }

  const q = query.toLowerCase();
  const words = q.split(/\W+/).filter((w) => w.length > 2);

  const scored = allPolicies.map((p) => {
    let score = 0;
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

export type ApprovalRiskLevel = "low" | "medium" | "high" | "critical";

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
  riskLevel: ApprovalRiskLevel;
  expiresAt: string;
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

  return rows.map((r) => {
    let parsed: Record<string, unknown> = {};
    try {
      parsed = JSON.parse(r.payloadJson);
    } catch {}

    const riskLevel = (parsed._riskLevel as ApprovalRiskLevel) || "high";
    const expiresAt =
      (parsed._expiresAt as string) ||
      new Date(r.createdAt.getTime() + 72 * 3600 * 1000).toISOString();

    return {
      id: r.id,
      organizationId: r.organizationId,
      agentRole: r.agentRole,
      requestedByUserId: r.requestedByUserId,
      targetType: r.targetType,
      targetId: r.targetId,
      proposedAction: r.proposedAction,
      payload: parsed,
      rationale: r.rationale,
      status: r.status as "pending" | "approved" | "rejected",
      riskLevel,
      expiresAt,
      decidedByUserId: r.decidedByUserId,
      decisionComment: r.decisionComment,
      decidedAt: r.decidedAt?.toISOString() ?? null,
      createdAt: r.createdAt.toISOString(),
    };
  });
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

  let parsed: Record<string, unknown> = {};
  try {
    parsed = JSON.parse(updated.payloadJson);
  } catch {}

  return {
    id: updated.id,
    organizationId: updated.organizationId,
    agentRole: updated.agentRole,
    requestedByUserId: updated.requestedByUserId,
    targetType: updated.targetType,
    targetId: updated.targetId,
    proposedAction: updated.proposedAction,
    payload: parsed,
    rationale: updated.rationale,
    status: updated.status as "pending" | "approved" | "rejected",
    riskLevel: (parsed._riskLevel as ApprovalRiskLevel) || "high",
    expiresAt:
      (parsed._expiresAt as string) ||
      new Date(updated.createdAt.getTime() + 72 * 3600 * 1000).toISOString(),
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
  riskLevel?: ApprovalRiskLevel;
}): Promise<AiApprovalItem> {
  const riskLevel = params.riskLevel ?? "critical";
  const expiresAt = new Date(Date.now() + 72 * 3600 * 1000).toISOString(); // 72-hour human signoff window

  const payloadWithMeta = {
    ...params.payload,
    _riskLevel: riskLevel,
    _expiresAt: expiresAt,
  };

  const item: AiApprovalItem = {
    id: crypto.randomUUID(),
    organizationId: params.membership.organizationId,
    agentRole: params.agentRole,
    requestedByUserId: params.membership.userId,
    targetType: params.targetType,
    targetId: params.targetId,
    proposedAction: params.proposedAction,
    payload: payloadWithMeta,
    rationale: params.rationale,
    status: "pending",
    riskLevel,
    expiresAt,
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
        payloadJson: JSON.stringify(payloadWithMeta),
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
    summary: `AI Agent (${params.agentRole}) proposed ${params.proposedAction} (${riskLevel} risk) requiring human approval`,
    isDemo: !process.env.DATABASE_URL,
  });

  return item;
}

/**
 * Enterprise Tool Registry with RBAC enforcement and typed domain outputs.
 * Never exposes company-wide payroll/attrition/audit to unauthorized roles.
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

    case "get_employee_profile": {
      const targetEmpId = String(args.employeeId ?? membership.employeeId ?? "");
      // Non-management employees cannot browse peer profiles
      if (!isExecutiveOrManager && targetEmpId !== membership.employeeId) {
        return {
          allowed: false,
          reason: "Standard employees may only query their own self-service profile.",
        };
      }

      const emp = DEMO_EMPLOYEES_LIST.find((e) => e.id === targetEmpId);
      if (!emp) {
        return { allowed: true, data: { status: "not_found", message: "Employee not found." } };
      }

      return {
        allowed: true,
        data: {
          id: emp.id,
          name: `${emp.firstName} ${emp.lastName}`,
          jobTitle: emp.jobTitle,
          departmentName: emp.departmentName,
          startDate: emp.startDate,
          status: emp.status,
          contractEndDate: emp.contractEndDate ? String(emp.contractEndDate) : null,
          skills: (emp as any).skills ?? [],
        },
      };
    }

    case "get_leave_summary": {
      const empLeaves = DEMO_LEAVE_STORE.filter(
        (l) => isExecutiveOrManager || l.employeeId === membership.employeeId,
      );
      return {
        allowed: true,
        data: {
          totalLeaveRequests: empLeaves.length,
          pendingCount: empLeaves.filter((l) => l.status === "pending").length,
          approvedCount: empLeaves.filter((l) => l.status === "approved").length,
          annualDaysFloor: 21,
        },
      };
    }

    case "get_attendance_summary": {
      return {
        allowed: true,
        data: {
          overallOnTimeRatePct: 96.2,
          overtimeHoursRecorded: 84.5,
          shiftCoveragePct: 98.0,
        },
      };
    }

    case "get_payroll_summary": {
      if (!isPayrollAuthorized) {
        return {
          allowed: false,
          reason: "Payroll summary access requires Payroll Officer or HR Admin role.",
        };
      }
      return {
        allowed: true,
        data: {
          period: "March 2026",
          totalGrossPayKes: 2280000,
          totalNetPayKes: 1695420,
          statutoryRemittancesKes: 584580,
          disbursementStatus: "awaiting_approval",
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
        const assembled = await assembleTenantFeaturesForTask("payroll_anomalies", orgId, {
          allowDemoFallback: true,
        });
        const result = await runPythonMlTask("payroll_anomalies", assembled.payload);
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
        const [attAssembled, sentAssembled] = await Promise.all([
          assembleTenantFeaturesForTask("attrition", orgId, { allowDemoFallback: true }),
          assembleTenantFeaturesForTask("sentiment", orgId, { allowDemoFallback: true }),
        ]);

        const [attrition, sentiment] = await Promise.all([
          runPythonMlTask("attrition", attAssembled.payload),
          runPythonMlTask("sentiment", sentAssembled.payload),
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
        const assembled = await assembleTenantFeaturesForTask("workforce_forecast", orgId, {
          allowDemoFallback: true,
        });
        const forecast = await runPythonMlTask("workforce_forecast", assembled.payload);
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
        const assembled = await assembleTenantFeaturesForTask("candidate_match", orgId, {
          allowDemoFallback: true,
        });
        const ranking = await runPythonMlTask("candidate_match", assembled.payload);
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
        const assembled = await assembleTenantFeaturesForTask("attendance_anomalies", orgId, {
          allowDemoFallback: true,
        });
        const res = await runPythonMlTask("attendance_anomalies", assembled.payload);
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
        const assembled = await assembleTenantFeaturesForTask("skills_gap", orgId, {
          allowDemoFallback: true,
          employeeId: !isExecutiveOrManager ? membership.employeeId ?? undefined : undefined,
        });
        const res = await runPythonMlTask("skills_gap", assembled.payload);
        return { allowed: true, data: res };
      } catch (err) {
        return {
          allowed: true,
          data: { status: "unavailable", error: err instanceof Error ? err.message : "ML offline" },
        };
      }
    }

    case "get_certification_expiry_summary": {
      if (!isExecutiveOrManager) {
        return {
          allowed: false,
          reason: "Certification compliance reporting requires HR Manager or Supervisor access.",
        };
      }
      return {
        allowed: true,
        data: {
          expiringWithin30Days: 2,
          expiringWithin60Days: 4,
          highRiskDistributionVehiclesBlocked: 1,
          complianceFloorMet: true,
        },
      };
    }

    case "get_workforce_coverage": {
      return {
        allowed: true,
        data: {
          overallCoveragePct: 98.4,
          fillingLineCoveragePct: 100.0,
          warehouseLogisticsCoveragePct: 96.8,
          activeShiftSwapsPending: 1,
        },
      };
    }

    case "retrieve_hr_policy":
    case "search_policies_rag": {
      const query = String(args.query ?? "");
      const policies = await retrieveDynamicPolicies(query, orgId, role, 3);
      return { allowed: true, data: policies };
    }

    default:
      return { allowed: false, reason: `Unknown tool: ${toolName}` };
  }
}
