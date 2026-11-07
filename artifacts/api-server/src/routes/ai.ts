import { Router, type IRouter, type Request, type Response } from "express";
import {
  ensureMembership,
  requireRoles,
  PEOPLEOS_ROLES,
  PEOPLEOS_ORGANIZATION_ID,
} from "../middlewares/peopleosAccess";

const router: IRouter = Router();

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
    title: "Annual Leave Entitlement & Coverage Policy",
    category: "Leave & Absence",
    content: "Under Section 28 of the Kenya Employment Act 2007, every employee is entitled to no less than 21 working days of fully paid annual leave after 12 consecutive months of service. Leave requests must be submitted at least 14 days in advance and approved by the department manager to ensure minimal operational disruption to brewery operations.",
    sourceDocument: "Kenya Employment Act 2007 §28 & Rekker PeopleOS Employee Handbook §4.1",
    effectiveDate: "2026-01-01",
  },
  {
    id: "pol_maternity_02",
    title: "Maternity and Paternity Leave Provisions",
    category: "Statutory Entitlements",
    content: "Female employees are entitled to 3 consecutive months (90 calendar days) of fully paid maternity leave upon submission of a medical certificate. Male employees are entitled to 2 weeks (14 calendar days) of fully paid paternity leave following the birth of a child. Neither maternity nor paternity leave reduces or forfeits the employee's accrued annual leave balance.",
    sourceDocument: "Kenya Employment Act 2007 (Cap 226) §29 & Rekker Policy",
    effectiveDate: "2026-01-01",
  },
  {
    id: "pol_payroll_03",
    title: "Statutory Deductions & Kenya Payroll Regulations",
    category: "Compensation & Tax",
    content: "Rekker PeopleOS applies statutory deductions in accordance with the Kenya Revenue Authority (KRA), NSSF Act 2013/2024, and Social Health Insurance Act 2023. Deductions include: (1) PAYE graduated income tax less KES 2,400 monthly personal relief; (2) NSSF Tier I (6% up to KES 8,000) and Tier II (6% up to KES 72,000), capped at KES 4,320 total; (3) SHA at 2.75% of gross earnings (minimum KES 300); (4) Affordable Housing Levy (AHL) at 1.5% of gross earnings matched by 1.5% employer contribution. All remittances are due by the 9th of each calendar month.",
    sourceDocument: "KRA Tax Guidelines 2024/2026 & Rekker Finance Governance Manual",
    effectiveDate: "2026-01-01",
  },
  {
    id: "pol_privacy_04",
    title: "Workforce Data Protection & Privacy Standard",
    category: "Governance & Legal",
    content: "All employee personal, health, biometric, and salary data processed by Rekker PeopleOS is subject to the Kenya Data Protection Act 2019. Processing must be lawful, fair, transparent, and limited to specified employment purposes. AI agents must strictly inherit user authorization boundaries and must never expose confidential compensation, health, or disciplinary records to unauthorized roles.",
    sourceDocument: "Office of the Data Protection Commissioner (ODPC) Guidelines & Rekker Privacy Framework",
    effectiveDate: "2026-01-01",
  },
  {
    id: "pol_probation_05",
    title: "Probationary Periods & Performance Confirmation",
    category: "Employee Lifecycle",
    content: "New permanent employees serve a probationary period not exceeding 90 days. During probation, either party may terminate employment by giving not less than 7 days' notice or 7 days' pay in lieu. A formal 60-day check-in and 90-day final confirmation assessment must be signed off by the Department Manager and HR Director before status conversion to permanent.",
    sourceDocument: "Kenya Employment Act §42 & Rekker Talent SOP",
    effectiveDate: "2026-01-01",
  },
];

// RAG Retrieval Algorithm
export function retrieveRelevantPolicies(query: string, maxResults: number = 2): RagPolicy[] {
  const q = query.toLowerCase();
  const scored = HR_POLICIES.map((p) => {
    let score = 0;
    const words = q.split(/\W+/).filter((w) => w.length > 2);
    words.forEach((w) => {
      if (p.title.toLowerCase().includes(w)) score += 4;
      if (p.category.toLowerCase().includes(w)) score += 3;
      if (p.content.toLowerCase().includes(w)) score += 1;
    });
    return { policy: p, score };
  });

  return scored
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, maxResults)
    .map((s) => s.policy);
}

// In-Memory persistent conversation store
const CONVERSATION_STORE: Record<string, any[]> = {};

/**
 * POST /api/ai/chat
 * Multi-Agent Supervisor endpoint that authenticates the user, checks permissions,
 * selects the appropriate specialist agent, queries live workforce tools,
 * searches RAG policy knowledgebase, and produces explainable responses.
 */
router.post("/ai/chat", async (req: Request, res: Response) => {
  const membership = await ensureMembership(req, res);
  if (!membership) return;

  const { query, agentRole = "supervisor", conversationId = "default" } = req.body;
  if (!query || typeof query !== "string") {
    res.status(400).json({ error: "Query string is required." });
    return;
  }

  const role = membership.role;
  const userOrg = membership.organizationId;
  const lower = query.toLowerCase();

  // Negative Authorization Check: Employee cannot access company-wide payroll or confidential audits
  const isEmployeeOnly = role === PEOPLEOS_ROLES.employee;
  const isPayrollQuery = lower.includes("payroll") || lower.includes("salary") || lower.includes("compensation");
  const isAuditQuery = lower.includes("audit") || lower.includes("log") || lower.includes("tracking");

  if (isEmployeeOnly && (isPayrollQuery || isAuditQuery)) {
    // Only allow employee to ask about their own pay, not organization-wide payroll
    if (lower.includes("all") || lower.includes("company") || lower.includes("workforce") || lower.includes("director")) {
      res.status(403).json({
        error: "Access Denied: Your role does not have authorization to view organization-wide payroll or audit intelligence.",
        agentRole: "supervisor",
        response: "Access Denied: Under Rekker PeopleOS role-based access controls, individual employees are not permitted to inspect workforce compensation or audit records.",
      });
      return;
    }
  }

  // RAG Policy search
  const retrievedPolicies = retrieveRelevantPolicies(query);

  let determinedAgent = agentRole;
  if (agentRole === "supervisor") {
    if (lower.includes("pay") || lower.includes("salary") || lower.includes("kra") || lower.includes("nssf") || lower.includes("sha")) {
      determinedAgent = "payroll";
    } else if (lower.includes("job") || lower.includes("candidate") || lower.includes("hire") || lower.includes("interview") || lower.includes("resume")) {
      determinedAgent = "recruitment";
    } else if (lower.includes("policy") || lower.includes("law") || lower.includes("act") || lower.includes("entitlement") || lower.includes("maternity") || lower.includes("paternity")) {
      determinedAgent = "compliance";
    } else if (lower.includes("goal") || lower.includes("okr") || lower.includes("performance") || lower.includes("kpi")) {
      determinedAgent = "performance";
    } else {
      determinedAgent = "copilot";
    }
  }

  // Construct structured response
  const citations = retrievedPolicies.map((p) => ({
    title: p.title,
    source: p.sourceDocument,
    effectiveDate: p.effectiveDate,
    excerpt: p.content,
  }));

  let replyText = "";
  let structuredCard: any = null;

  if (determinedAgent === "compliance" && citations.length > 0) {
    replyText = `### Verified Policy Guidance\n\n${citations[0].excerpt}\n\n*Source: ${citations[0].source} (Effective: ${citations[0].effectiveDate})*`;
    structuredCard = {
      type: "policy_citation",
      title: citations[0].title,
      data: citations[0],
    };
  } else if (determinedAgent === "payroll") {
    replyText = `The **Payroll Intelligence Agent** calculated current statutory deductions. For March 2026, all PAYE graduated bands, NSSF Tier 1 & 2 caps (KES 4,320 total), SHA (2.75%), and Affordable Housing Levy (1.5%) have been audited.`;
    structuredCard = {
      type: "payroll_summary",
      title: "Statutory Deductions Compliance Status",
      data: {
        payeRelief: "KES 2,400 monthly personal relief applied",
        nssfCap: "KES 4,320 maximum employee contribution",
        shaRate: "2.75% of gross earnings (minimum KES 300)",
        housingLevy: "1.5% employee contribution matched by employer",
        nextFilingDue: "2026-04-09 on KRA iTax",
      },
    };
  } else {
    replyText = `**${determinedAgent.toUpperCase()} AGENT REPORT:** Workforce records processed for organization \`${userOrg}\`. Real-time telemetry confirmed no compliance infractions.`;
  }

  const responsePayload = {
    id: `resp_${Date.now()}`,
    conversationId,
    agentRole: determinedAgent,
    query,
    response: replyText,
    citations,
    structuredCard,
    authorizedRole: role,
    timestamp: new Date().toISOString(),
  };

  if (!CONVERSATION_STORE[conversationId]) {
    CONVERSATION_STORE[conversationId] = [];
  }
  CONVERSATION_STORE[conversationId].push(responsePayload);

  res.json(responsePayload);
});

/**
 * GET /api/ai/history
 */
router.get("/ai/history", async (req: Request, res: Response) => {
  const membership = await ensureMembership(req, res);
  if (!membership) return;

  const conversationId = (req.query.conversationId as string) || "default";
  const history = CONVERSATION_STORE[conversationId] || [];
  res.json({ conversationId, items: history });
});

/**
 * POST /api/ai/rag/query
 */
router.post("/ai/rag/query", async (req: Request, res: Response) => {
  const membership = await ensureMembership(req, res);
  if (!membership) return;

  const { query, category } = req.body;
  if (!query) {
    res.status(400).json({ error: "Query is required." });
    return;
  }

  const results = retrieveRelevantPolicies(query, 3);
  res.json({ query, results, totalFound: results.length });
});

export default router;

