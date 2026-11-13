import React, { useState, useRef, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Sparkles, Send, Bot, CheckCircle2, AlertCircle, Copy,
  ShieldCheck, Activity, Check, X, Cpu, Clock3, AlertTriangle, FileText
} from 'lucide-react';
import {
  AGENT_REGISTRY,
  processAgentQuery,
  type AgentRole,
  type ChatMessage
} from '../data/aiAgents';
import { apiGet, apiPost } from '../lib/api';
import { useGetAuthContext } from '@workspace/api-client-react';

export function AgentHubPage() {
  const [activeTab, setActiveTab] = useState<'chat' | 'approvals' | 'telemetry'>('chat');
  const [activeRole, setActiveRole] = useState<AgentRole>('supervisor');
  const [conversationId] = useState('default');
  const [messages, setMessages] = useState<ChatMessage[]>(() => [
    {
      id: 'init-1',
      sender: 'agent',
      agentRole: 'supervisor',
      text: `Hello! I am the **Rekker AI Multi-Agent Supervisor** coordinating **10 specialist HR intelligence agents**:\n\n• **HR Copilot, Onboarding & Learning** — Workforce operations, 30-60-90 checklists & ML skills-gap analysis\n• **Recruitment & Performance** — Explainable TF-IDF candidate matching & OKR momentum\n• **Payroll & Attendance** — Configurable Kenyan PAYE/NSSF/SHIF/AHL & IsolationForest anomaly detection\n• **Retention, Compliance & Executive** — XGBoost attrition risk, NLP sentiment, Ridge demand forecasting & ODPC/Employment Act RAG\n\nSelect any agent on the left or ask me directly. High-impact actions are always held for human signoff.`,
      timestamp: 'Online',
    },
  ]);

  const [inputQuery, setInputQuery] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const qc = useQueryClient();
  const auth = useGetAuthContext();
  const canViewGovernance = Boolean(auth.data?.canViewAudit || auth.data?.canManagePeople || auth.data?.canViewPayroll);

  const telemetryQuery = useQuery({
    queryKey: ['ai-telemetry'],
    queryFn: () => apiGet('/api/ai/telemetry'),
    enabled: canViewGovernance && activeTab === 'telemetry',
  });

  const approvalsQuery = useQuery({
    queryKey: ['ai-approvals'],
    queryFn: () => apiGet('/api/ai/approvals'),
    enabled: canViewGovernance && activeTab === 'approvals',
  });

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isTyping]);

  const handleSend = async (textToSend?: string) => {
    const q = (textToSend || inputQuery).trim();
    if (!q) return;

    const userMsg: ChatMessage = {
      id: `usr_${Date.now()}`,
      sender: 'user',
      agentRole: activeRole,
      text: q,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInputQuery('');
    setIsTyping(true);

    try {
      const data = await apiPost('/api/ai/chat', {
        query: q,
        agentRole: activeRole,
        conversationId,
      });

      const agentMsg: ChatMessage = {
        id: data.id || `msg_${Date.now()}`,
        sender: 'agent',
        agentRole: (data.agentRole as AgentRole) || activeRole,
        text: data.response || 'No response returned.',
        structuredCard: data.structuredCard,
        citations: data.citations?.map((c: any) => `${c.title} (${c.source})`),
        toolsCalled: data.toolsCalled,
        collaboratorsConsulted: data.collaboratorsConsulted,
        provider: data.provider,
        model: data.model,
        latencyMs: data.latencyMs,
        tokenUsage: data.tokenUsage,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };
      setMessages((prev) => [...prev, agentMsg]);
      if (data.humanApprovalQueued) {
        qc.invalidateQueries({ queryKey: ['ai-approvals'] });
      }
      qc.invalidateQueries({ queryKey: ['ai-telemetry'] });
    } catch {
      const fallback = processAgentQuery(q, activeRole);
      setMessages((prev) => [...prev, fallback]);
    } finally {
      setIsTyping(false);
    }
  };

  const handleApprovalDecision = async (approvalId: string, decision: 'approve' | 'reject') => {
    await apiPost(`/api/ai/approvals/${approvalId}/decision`, {
      decision,
      comment: `Reviewed via Rekker AI Governance Console by ${auth.data?.role ?? 'Authorized Admin'}`,
    });
    qc.invalidateQueries({ queryKey: ['ai-approvals'] });
    qc.invalidateQueries({ queryKey: ['audit-events'] });
  };

  const activeAgent = AGENT_REGISTRY[activeRole] || AGENT_REGISTRY.supervisor;

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[.17em] text-[#bd2725]">Multi-Agent AI Intelligence</p>
          <h1 className="font-display text-2xl font-semibold tracking-[-.03em] text-stone-900">
            Rekker AI Agent Hub & Governance
          </h1>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setActiveTab('chat')}
            className={`btn min-h-9 px-3 text-xs ${activeTab === 'chat' ? 'btn-primary' : 'btn-secondary'}`}
          >
            <Sparkles size={14} /> 10-Agent Workspace
          </button>
          {canViewGovernance && (
            <>
              <button
                onClick={() => setActiveTab('approvals')}
                className={`btn min-h-9 px-3 text-xs ${activeTab === 'approvals' ? 'btn-primary' : 'btn-secondary'}`}
              >
                <ShieldCheck size={14} /> Human Approval Gate
                {approvalsQuery.data?.items?.filter((i: any) => i.status === 'pending').length > 0 && (
                  <span className="ml-1.5 rounded-full bg-red-700 px-1.5 py-0.2 text-[9px] font-bold text-white">
                    {approvalsQuery.data.items.filter((i: any) => i.status === 'pending').length}
                  </span>
                )}
              </button>
              <button
                onClick={() => setActiveTab('telemetry')}
                className={`btn min-h-9 px-3 text-xs ${activeTab === 'telemetry' ? 'btn-primary' : 'btn-secondary'}`}
              >
                <Activity size={14} /> Observability & Lineage
              </button>
            </>
          )}
        </div>
      </div>

      {activeTab === 'approvals' && canViewGovernance ? (
        <div className="surface p-5 md:p-6">
          <div className="mb-4 flex items-center justify-between border-b border-stone-100 pb-3">
            <div>
              <h2 className="font-display text-lg font-bold text-stone-900">AI High-Impact Human Approval Queue</h2>
              <p className="text-xs text-stone-500">
                In compliance with Rekker Responsible AI Governance and Kenya ODPC principles, agents are strictly forbidden from executing employment terminations, compensation adjustments, or payroll disbursements without prior human signoff.
              </p>
            </div>
          </div>
          {approvalsQuery.isLoading ? (
            <div className="skeleton h-28" />
          ) : !(approvalsQuery.data?.items?.length) ? (
            <div className="py-12 text-center text-xs text-stone-500">
              <ShieldCheck size={32} className="mx-auto mb-2 text-stone-300" />
              No pending AI proposals. Try asking the Supervisor: &ldquo;Propose a salary increase to KES 140,000 for Brian Kiprotich&rdquo;.
            </div>
          ) : (
            <div className="space-y-3">
              {approvalsQuery.data.items.map((item: any) => {
                const isCritical = item.riskLevel === 'critical' || item.proposedAction?.includes('SALARY') || item.proposedAction?.includes('TERMINATE');
                return (
                  <div key={item.id} className="flex flex-col gap-3 rounded-xl border border-stone-200 bg-white p-4 shadow-xs md:flex-row md:items-center md:justify-between">
                    <div className="flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-xs font-bold text-red-700">{item.proposedAction}</span>
                        <span className={`rounded-full px-2 py-0.5 text-[9px] font-bold uppercase ${
                          isCritical ? 'bg-red-100 text-red-800 border border-red-200' : 'bg-amber-100 text-amber-800 border border-amber-200'
                        }`}>
                          {item.riskLevel || 'critical'} risk
                        </span>
                        <span className={`rounded-full px-2 py-0.5 text-[9px] font-bold uppercase ${
                          item.status === 'pending' ? 'bg-amber-100 text-amber-800' : item.status === 'approved' ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
                        }`}>
                          {item.status}
                        </span>
                        <span className="flex items-center gap-1 text-[10px] text-stone-400">
                          <Clock3 size={11} /> 72h window
                        </span>
                      </div>
                      <p className="mt-1.5 text-xs text-stone-700">{item.rationale}</p>
                      {item.payload && Object.keys(item.payload).length > 0 && (
                        <div className="mt-2 rounded-lg bg-stone-50 p-2 font-mono text-[11px] text-stone-600">
                          {item.payload.proposedAmountKes ? `Proposed Compensation: KES ${Number(item.payload.proposedAmountKes).toLocaleString()}` : null}
                          {item.payload.channel ? `Disbursement Channel: ${item.payload.channel}` : null}
                          {item.payload.reason ? `Justification: ${item.payload.reason}` : null}
                        </div>
                      )}
                      <p className="mt-1 font-mono text-[10px] text-stone-400">
                        Initiator Agent: {item.agentRole} · Target: {item.targetType} ({item.targetId})
                        {item.decidedByUserId ? ` · Decided by: ${item.decidedByUserId}` : ''}
                      </p>
                    </div>
                    {item.status === 'pending' && (
                      <div className="flex gap-2 shrink-0">
                        <button onClick={() => handleApprovalDecision(item.id, 'approve')} className="btn btn-primary min-h-8 px-3 text-xs">
                          <Check size={13} /> Approve Proposal
                        </button>
                        <button onClick={() => handleApprovalDecision(item.id, 'reject')} className="btn btn-secondary min-h-8 px-3 text-xs">
                          <X size={13} /> Reject
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ) : activeTab === 'telemetry' && canViewGovernance ? (
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="surface p-4">
              <p className="text-[10px] font-bold uppercase text-stone-400">Total Orchestrator Runs</p>
              <p className="mt-2 font-display text-2xl font-bold text-stone-900">{telemetryQuery.data?.totalRuns ?? 0}</p>
            </div>
            <div className="surface p-4">
              <p className="text-[10px] font-bold uppercase text-stone-400">Tokens Consumed</p>
              <p className="mt-2 font-display text-2xl font-bold text-stone-900">
                {((telemetryQuery.data?.totalPromptTokens ?? 0) + (telemetryQuery.data?.totalCompletionTokens ?? 0)).toLocaleString()}
              </p>
            </div>
            <div className="surface p-4">
              <p className="text-[10px] font-bold uppercase text-stone-400">Estimated Cost (USD)</p>
              <p className="mt-2 font-display text-2xl font-bold text-emerald-700">${telemetryQuery.data?.totalEstimatedCostUsd ?? 0}</p>
            </div>
            <div className="surface p-4">
              <p className="text-[10px] font-bold uppercase text-stone-400">Avg Execution Latency</p>
              <p className="mt-2 font-display text-2xl font-bold text-stone-900">{telemetryQuery.data?.averageLatencyMs ?? 0} ms</p>
            </div>
          </div>
          <div className="surface overflow-hidden">
            <div className="border-b border-stone-100 p-4 flex items-center justify-between">
              <div>
                <h3 className="font-display text-sm font-bold text-stone-900">Recent Multi-Agent Execution & Tool Audit Logs</h3>
                <p className="text-[10px] text-stone-500">Immutable data lineage and tool execution ledger</p>
              </div>
              <span className="text-[10px] font-semibold text-stone-500">
                LLM Provider: {telemetryQuery.data?.openAiConfigured ? 'OpenAI GPT-4o' : 'Deterministic Grounded Engine'}
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-stone-50 text-[10px] uppercase text-stone-500">
                  <tr>
                    <th className="px-4 py-2.5">Agent</th>
                    <th className="px-4 py-2.5">Provider / Model</th>
                    <th className="px-4 py-2.5">Tools Executed</th>
                    <th className="px-4 py-2.5">Latency</th>
                    <th className="px-4 py-2.5">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100">
                  {(telemetryQuery.data?.recentRuns ?? []).map((r: any) => (
                    <tr key={r.id}>
                      <td className="px-4 py-2.5 font-semibold text-stone-800">{r.resolvedAgent}</td>
                      <td className="px-4 py-2.5 text-stone-500">{r.provider} · {r.model}</td>
                      <td className="px-4 py-2.5 font-mono text-[10px] text-stone-600">{(r.toolsCalled || []).join(', ') || 'none'}</td>
                      <td className="px-4 py-2.5">{r.latencyMs}ms</td>
                      <td className="px-4 py-2.5"><span className="rounded bg-stone-100 px-2 py-0.5 text-[10px] font-bold">{r.status}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : (
        <div className="flex h-[calc(100vh-210px)] min-h-[540px] flex-col gap-4 md:flex-row">
          {/* 11 Agents Sidebar */}
          <div className="flex w-full md:w-80 flex-col rounded-2xl border border-stone-200 bg-white p-3 shadow-xs shrink-0">
            <div className="mb-2 flex items-center justify-between border-b border-stone-100 pb-2.5 px-1">
              <div className="flex items-center gap-2">
                <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-red-100 text-red-700">
                  <Cpu size={15} />
                </div>
                <div>
                  <h3 className="font-display text-xs font-bold text-stone-900">10 Specialist Agents + Supervisor</h3>
                  <p className="text-[10px] text-stone-500">RBAC Scoped StateGraph</p>
                </div>
              </div>
            </div>

            <div className="space-y-1 overflow-y-auto flex-1 pr-1">
              {(Object.keys(AGENT_REGISTRY) as AgentRole[]).map((role) => {
                const ag = AGENT_REGISTRY[role];
                const isSelected = activeRole === role;
                return (
                  <button
                    key={role}
                    onClick={() => setActiveRole(role)}
                    className={`flex w-full items-start gap-2.5 rounded-xl p-2.5 text-left transition ${
                      isSelected
                        ? 'border-2 border-red-700 bg-red-50/50 shadow-xs'
                        : 'border border-transparent hover:bg-stone-50 hover:border-stone-200'
                    }`}
                  >
                    <div className={`flex h-7 w-7 items-center justify-center rounded-lg text-[10px] font-bold shrink-0 ${ag.avatarColor}`}>
                      {ag.name.slice(0, 2).toUpperCase()}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="font-display text-xs font-bold text-stone-900 truncate">{ag.name}</p>
                      <p className="text-[10px] text-stone-500 line-clamp-1">{ag.tagline}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Chat Workspace */}
          <div className="flex flex-1 flex-col rounded-2xl border border-stone-200 bg-white shadow-xs overflow-hidden">
            <div className="flex items-center justify-between border-b border-stone-200 bg-stone-50/70 px-5 py-3">
              <div>
                <h4 className="font-display text-xs font-bold text-stone-900">{activeAgent.name}</h4>
                <p className="text-[10px] text-stone-500">{activeAgent.description}</p>
              </div>
              <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-[9px] font-bold text-emerald-800 shrink-0">
                STATEGRAPH ACTIVE
              </span>
            </div>

            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              {messages.map((m) => {
                const isUser = m.sender === 'user';
                const ag = AGENT_REGISTRY[m.agentRole] || AGENT_REGISTRY.supervisor;
                return (
                  <div key={m.id} className={`flex gap-3 ${isUser ? 'justify-end' : 'justify-start'}`}>
                    <div className="max-w-[85%] space-y-2">
                      <div
                        className={`rounded-2xl p-4 text-xs leading-relaxed ${
                          isUser
                            ? 'bg-red-700 text-white rounded-tr-none'
                            : 'border border-stone-200 bg-stone-50/70 text-stone-800 rounded-tl-none'
                        }`}
                      >
                        {!isUser && (
                          <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2 text-[10px] font-bold uppercase tracking-wider text-stone-400">
                            <span>{ag.name} · {m.timestamp}</span>
                            {m.latencyMs !== undefined && <span className="font-mono">{m.latencyMs}ms · {m.provider}</span>}
                          </div>
                        )}
                        <div className="whitespace-pre-wrap">{m.text}</div>

                        {/* Collaborator specialist indicators */}
                        {!isUser && m.collaboratorsConsulted && m.collaboratorsConsulted.length > 0 && (
                          <div className="mt-2.5 flex flex-wrap items-center gap-1 border-t border-stone-200/70 pt-2 text-[9px] text-stone-500">
                            <span className="font-bold uppercase text-stone-400">Collaborators:</span>
                            {m.collaboratorsConsulted.map((c) => (
                              <span key={c} className="rounded bg-red-50 text-red-700 px-1.5 py-0.2 font-semibold">
                                {c}
                              </span>
                            ))}
                          </div>
                        )}

                        {/* Scoped tools called tags */}
                        {!isUser && m.toolsCalled && m.toolsCalled.length > 0 && (
                          <div className="mt-1.5 flex flex-wrap gap-1">
                            {m.toolsCalled.map((t) => (
                              <span key={t} className="rounded bg-white px-1.5 py-0.5 font-mono text-[9px] text-stone-500 border border-stone-200">
                                tool:{t}
                              </span>
                            ))}
                          </div>
                        )}

                        {/* Statutory & Policy RAG Citations */}
                        {!isUser && m.citations && m.citations.length > 0 && (
                          <div className="mt-2 rounded-lg bg-white/80 p-2 border border-stone-200/80 text-[10px] text-stone-600">
                            <span className="font-bold flex items-center gap-1 text-red-800">
                              <FileText size={11} /> Verified Statutory Citations:
                            </span>
                            <ul className="mt-1 list-disc list-inside space-y-0.5 text-stone-600">
                              {m.citations.map((c, i) => (
                                <li key={i}>{c}</li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>

                      {m.structuredCard && (
                        <div className="rounded-2xl border border-stone-200 bg-white p-4 shadow-xs">
                          <div className="mb-2 flex items-center justify-between border-b border-stone-100 pb-2">
                            <span className="text-xs font-bold text-stone-900">{m.structuredCard.title}</span>
                            <span className="rounded bg-red-50 px-2 py-0.5 text-[9px] font-bold text-red-700">
                              {m.structuredCard.type.replaceAll('_', ' ')}
                            </span>
                          </div>

                          {m.structuredCard.type === 'payroll_breakdown' && (
                            <div className="space-y-1.5 text-xs">
                              <div className="flex justify-between font-semibold"><span>Gross Pay</span><span>KES {m.structuredCard.data.gross?.toLocaleString()}</span></div>
                              <div className="flex justify-between text-stone-600"><span>NSSF</span><span>- KES {m.structuredCard.data.totalNssf?.toLocaleString()}</span></div>
                              <div className="flex justify-between text-stone-600"><span>SHIF (2.75%)</span><span>- KES {m.structuredCard.data.sha?.toLocaleString()}</span></div>
                              <div className="flex justify-between text-stone-600"><span>Housing Levy (1.5%)</span><span>- KES {m.structuredCard.data.housingLevy?.toLocaleString()}</span></div>
                              <div className="flex justify-between text-stone-600"><span>Net PAYE</span><span>- KES {m.structuredCard.data.netPaye?.toLocaleString()}</span></div>
                              <div className="flex justify-between border-t border-stone-200 pt-1.5 font-bold text-emerald-700"><span>Net Payout</span><span>KES {m.structuredCard.data.netPay?.toLocaleString()}</span></div>
                            </div>
                          )}

                          {m.structuredCard.type === 'kpis' && Array.isArray(m.structuredCard.data) && (
                            <div className="grid grid-cols-2 gap-2">
                              {m.structuredCard.data.map((kpi: any, idx: number) => (
                                <div key={idx} className="rounded-xl border border-stone-100 bg-stone-50 p-2.5">
                                  <p className="text-[10px] text-stone-400 font-semibold uppercase">{kpi.label}</p>
                                  <p className="text-xs font-bold text-stone-900 mt-0.5">{kpi.value}</p>
                                </div>
                              ))}
                            </div>
                          )}

                          {m.structuredCard.type === 'approval_proposal' && (
                            <div className="space-y-2 text-xs">
                              <p className="text-stone-600">Proposal ID: <span className="font-mono font-bold">{m.structuredCard.data.approvalId}</span></p>
                              <div className="flex items-center gap-2">
                                <span className="rounded bg-red-100 text-red-800 px-2 py-0.5 text-[9px] font-bold uppercase">
                                  {m.structuredCard.data.riskLevel || 'critical'} risk
                                </span>
                                <span className="text-amber-800 font-semibold">Held pending Human Approval Gate signoff</span>
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}

              {isTyping && (
                <div className="flex items-center gap-2 text-stone-400 text-xs italic">
                  <Bot size={16} className="animate-spin text-red-700" />
                  <span>{activeAgent.name} is invoking scoped HR tools & policy RAG...</span>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            <div className="border-t border-stone-100 bg-stone-50/50 px-4 py-2 flex items-center gap-2 overflow-x-auto text-xs">
              <span className="text-[10px] font-bold uppercase text-stone-400 shrink-0">Try:</span>
              {activeAgent.sampleQueries.map((query, i) => (
                <button
                  key={i}
                  onClick={() => handleSend(query)}
                  className="rounded-full border border-stone-200 bg-white px-3 py-1 text-[11px] font-medium text-stone-700 hover:border-red-700 hover:text-red-700 transition shrink-0"
                >
                  {query}
                </button>
              ))}
            </div>

            <div className="border-t border-stone-200 p-3 bg-white">
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  handleSend();
                }}
                className="flex items-center gap-2"
              >
                <input
                  value={inputQuery}
                  onChange={(e) => setInputQuery(e.target.value)}
                  placeholder={`Ask ${activeAgent.name}...`}
                  className="field flex-1 text-xs"
                />
                <button type="submit" disabled={isTyping || !inputQuery.trim()} className="btn btn-primary min-h-10 px-4 text-xs">
                  <Send size={14} /> Send
                </button>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
