import { Router, type IRouter, type Request, type Response } from "express";
import {
  getConversationHistory,
  getTelemetrySummary,
  runMultiAgentGraph,
  SPECIALIST_AGENTS,
  type SpecialistAgentId,
} from "../ai/orchestrator";
import {
  decideAiApproval,
  listAiApprovals,
  retrieveRelevantPolicies,
} from "../ai/tools";
import {
  ensureMembership,
  PEOPLEOS_ROLES,
  requireRoles,
} from "../middlewares/peopleosAccess";

export { retrieveRelevantPolicies };

const router: IRouter = Router();

const governanceRoles = [
  PEOPLEOS_ROLES.hrAdmin,
  PEOPLEOS_ROLES.hrManager,
  PEOPLEOS_ROLES.systemAdmin,
  PEOPLEOS_ROLES.auditor,
  PEOPLEOS_ROLES.payrollOfficer,
];

// GET /api/ai/agents - Registry of Supervisor + 10 Specialist Agents
router.get("/ai/agents", async (req: Request, res: Response) => {
  const membership = await ensureMembership(req, res);
  if (!membership) return;
  res.json({
    agents: Object.values(SPECIALIST_AGENTS),
    total: Object.keys(SPECIALIST_AGENTS).length,
  });
});

// POST /api/ai/chat - Multi-Agent StateGraph Supervisor Endpoint
router.post("/ai/chat", async (req: Request, res: Response) => {
  const membership = await ensureMembership(req, res);
  if (!membership) return;

  const {
    query,
    agentRole = "supervisor",
    conversationId = "default",
  } = req.body ?? {};

  if (!query || typeof query !== "string" || !query.trim()) {
    res.status(400).json({ error: "Query string is required." });
    return;
  }

  const result = await runMultiAgentGraph({
    query: query.trim().slice(0, 2000),
    requestedAgent: agentRole as SpecialistAgentId,
    conversationId: String(conversationId || "default").slice(0, 64),
    membership,
  });

  res.status(result.statusCode).json(result.body);
});

// GET /api/ai/history
router.get("/ai/history", async (req: Request, res: Response) => {
  const membership = await ensureMembership(req, res);
  if (!membership) return;

  const conversationId = String(req.query.conversationId || "default");
  const items = await getConversationHistory(
    membership.organizationId,
    conversationId,
  );
  res.json({ conversationId, items });
});

// POST /api/ai/rag/query
router.post("/ai/rag/query", async (req: Request, res: Response) => {
  const membership = await ensureMembership(req, res);
  if (!membership) return;

  const { query } = req.body ?? {};
  if (!query || typeof query !== "string") {
    res.status(400).json({ error: "Query is required." });
    return;
  }

  const results = retrieveRelevantPolicies(query, 3);
  res.json({ query, results, totalFound: results.length });
});

// GET /api/ai/telemetry - Execution observability, token usage & cost tracking
router.get("/ai/telemetry", async (req: Request, res: Response) => {
  const membership = await requireRoles(req, res, governanceRoles);
  if (!membership) return;

  const summary = await getTelemetrySummary(membership.organizationId);
  res.json(summary);
});

// GET /api/ai/approvals - Pending & resolved AI human-in-the-loop proposals
router.get("/ai/approvals", async (req: Request, res: Response) => {
  const membership = await requireRoles(req, res, governanceRoles);
  if (!membership) return;

  const items = await listAiApprovals(membership.organizationId);
  res.json({ items, total: items.length });
});

// POST /api/ai/approvals/:approvalId/decision - Explicit Human Approval Gate
router.post(
  "/ai/approvals/:approvalId/decision",
  async (req: Request, res: Response) => {
    const membership = await requireRoles(req, res, [
      PEOPLEOS_ROLES.hrAdmin,
      PEOPLEOS_ROLES.systemAdmin,
      PEOPLEOS_ROLES.payrollOfficer,
    ]);
    if (!membership) return;

    const approvalId = String(req.params.approvalId ?? "");
    const { decision, comment } = req.body ?? {};
    if (decision !== "approve" && decision !== "reject") {
      res.status(400).json({ error: "Decision must be 'approve' or 'reject'." });
      return;
    }

    try {
      const updated = await decideAiApproval({
        organizationId: membership.organizationId,
        approvalId,
        deciderUserId: membership.userId,
        deciderRole: membership.role,
        decision,
        comment: typeof comment === "string" ? comment.trim() : null,
        enforceReviewerSeparation: true,
      });

      if (!updated) {
        res.status(404).json({ error: "Pending AI approval proposal not found." });
        return;
      }

      res.json(updated);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to decide proposal.";
      const isReviewerViolation = msg.includes("Reviewer separation");
      res.status(isReviewerViolation ? 403 : 400).json({
        error: msg,
        code: isReviewerViolation ? "REVIEWER_SEPARATION_VIOLATION" : "APPROVAL_DECISION_FAILED",
      });
    }
  },
);

export default router;
