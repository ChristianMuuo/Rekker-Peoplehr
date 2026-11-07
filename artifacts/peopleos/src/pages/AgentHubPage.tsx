import React, { useState, useRef, useEffect } from 'react';
import {
  Sparkles, Send, Bot, User, CheckCircle2, AlertCircle, Copy,
  ArrowRight, ShieldCheck, Calculator, Briefcase, Target, Users,
  Terminal, CornerDownLeft
} from 'lucide-react';
import {
  AGENT_REGISTRY,
  processAgentQuery,
  type AgentRole,
  type ChatMessage
} from '../data/aiAgents';

export function AgentHubPage() {
  const [activeRole, setActiveRole] = useState<AgentRole>('supervisor');
  const [messages, setMessages] = useState<ChatMessage[]>(() => [
    {
      id: 'init-1',
      sender: 'agent',
      agentRole: 'supervisor',
      text: `Hello David! I am the **Rekker AI Multi-Agent Supervisor**. I coordinate our 5 specialist HR intelligence agents:\n\n• **HR Copilot:** Real-time workforce queries, pending leaves, and active headcount.\n• **Recruitment Agent:** Candidate scoring, interview questions, and job descriptions.\n• **Payroll Intelligence:** KRA PAYE, NSSF, SHA (2.75%), and Housing Levy calculators.\n• **Compliance Agent:** Kenya Employment Act 2007 & ODPC Data Privacy standards.\n• **Performance Agent:** OKRs, KPI alignments, and skills gap analysis.\n\nAsk me anything about your workforce, or select a specialist agent below!`,
      timestamp: '09:00 AM',
    },
  ]);

  const [inputQuery, setInputQuery] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isTyping]);

  const handleSend = (textToSend?: string) => {
    const q = textToSend || inputQuery;
    if (!q.trim()) return;

    const userMsg: ChatMessage = {
      id: `usr_${Date.now()}`,
      sender: 'user',
      agentRole: activeRole,
      text: q.trim(),
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInputQuery('');
    setIsTyping(true);

    // Simulate intelligent multi-agent processing
    setTimeout(() => {
      const response = processAgentQuery(q, activeRole);
      setMessages((prev) => [...prev, response]);
      setIsTyping(false);
    }, 600);
  };

  const activeAgent = AGENT_REGISTRY[activeRole];

  return (
    <div className="flex h-[calc(100vh-140px)] flex-col gap-4 md:flex-row">
      {/* Agent Selector Sidebar */}
      <div className="flex w-full md:w-80 flex-col rounded-2xl border border-stone-200 bg-white p-4 shadow-xs shrink-0">
        <div className="mb-3 flex items-center gap-2 border-b border-stone-100 pb-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-red-100 text-red-700">
            <Sparkles size={16} />
          </div>
          <div>
            <h3 className="font-display text-sm font-bold text-stone-900">Multi-Agent Network</h3>
            <p className="text-[10px] text-stone-500">Authorized Specialist Agents</p>
          </div>
        </div>

        <div className="space-y-1.5 overflow-y-auto flex-1 pr-1">
          {(Object.keys(AGENT_REGISTRY) as AgentRole[]).map((role) => {
            const ag = AGENT_REGISTRY[role];
            const isSelected = activeRole === role;
            return (
              <button
                key={role}
                onClick={() => setActiveRole(role)}
                className={`flex w-full items-start gap-3 rounded-xl p-3 text-left transition ${
                  isSelected
                    ? 'border-2 border-red-700 bg-red-50/50 shadow-xs'
                    : 'border border-transparent hover:bg-stone-50 hover:border-stone-200'
                }`}
              >
                <div className={`flex h-8 w-8 items-center justify-center rounded-lg text-xs font-bold shrink-0 ${ag.avatarColor}`}>
                  {role === 'supervisor' ? '👑' : role === 'payroll' ? '💰' : role === 'recruitment' ? '🎯' : role === 'compliance' ? '⚖️' : role === 'performance' ? '📈' : '💼'}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between">
                    <p className="font-display text-xs font-bold text-stone-900 truncate">{ag.name}</p>
                    {isSelected && <span className="h-2 w-2 rounded-full bg-red-700 shrink-0" />}
                  </div>
                  <p className="mt-0.5 text-[10px] text-stone-500 line-clamp-1">{ag.tagline}</p>
                </div>
              </button>
            );
          })}
        </div>

        {/* Security & Data Boundary Notice */}
        <div className="mt-3 rounded-xl border border-stone-200 bg-stone-50 p-2.5 text-[10px] text-stone-500">
          <span className="font-bold text-stone-700 flex items-center gap-1">
            <ShieldCheck size={12} className="text-emerald-700" /> Enterprise Guardrails
          </span>
          All multi-agent actions are strictly read/write bounded to authorized user permissions.
        </div>
      </div>

      {/* Main Chat Area */}
      <div className="flex flex-1 flex-col rounded-2xl border border-stone-200 bg-white shadow-xs overflow-hidden">
        {/* Active Agent Banner */}
        <div className="flex items-center justify-between border-b border-stone-200 bg-stone-50/70 px-5 py-3">
          <div className="flex items-center gap-3">
            <div className={`flex h-8 w-8 items-center justify-center rounded-lg text-xs font-bold ${activeAgent.avatarColor}`}>
              {activeRole === 'supervisor' ? '👑' : activeRole === 'payroll' ? '💰' : activeRole === 'recruitment' ? '🎯' : activeRole === 'compliance' ? '⚖️' : activeRole === 'performance' ? '📈' : '💼'}
            </div>
            <div>
              <h4 className="font-display text-xs font-bold text-stone-900">{activeAgent.name}</h4>
              <p className="text-[10px] text-stone-500">{activeAgent.description}</p>
            </div>
          </div>
          <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[9px] font-bold text-emerald-800">
            ONLINE · v2.4
          </span>
        </div>

        {/* Messages Stream */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {messages.map((m) => {
            const isUser = m.sender === 'user';
            const ag = AGENT_REGISTRY[m.agentRole];

            return (
              <div key={m.id} className={`flex gap-3 ${isUser ? 'justify-end' : 'justify-start'}`}>
                {!isUser && (
                  <div className={`flex h-8 w-8 items-center justify-center rounded-lg text-xs font-bold shrink-0 ${ag.avatarColor}`}>
                    {m.agentRole === 'supervisor' ? '👑' : m.agentRole === 'payroll' ? '💰' : m.agentRole === 'recruitment' ? '🎯' : m.agentRole === 'compliance' ? '⚖️' : m.agentRole === 'performance' ? '📈' : '💼'}
                  </div>
                )}

                <div className={`max-w-[85%] space-y-2`}>
                  <div
                    className={`rounded-2xl p-4 text-xs leading-relaxed ${
                      isUser
                        ? 'bg-red-700 text-white rounded-tr-none'
                        : 'border border-stone-200 bg-stone-50/70 text-stone-800 rounded-tl-none'
                    }`}
                  >
                    {!isUser && (
                      <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-stone-400">
                        {ag.name} · {m.timestamp}
                      </p>
                    )}
                    <div className="whitespace-pre-wrap">{m.text}</div>
                  </div>

                  {/* Render Structured Output Cards */}
                  {m.structuredCard && (
                    <div className="rounded-2xl border border-stone-200 bg-white p-4 shadow-xs">
                      <div className="mb-3 flex items-center justify-between border-b border-stone-100 pb-2">
                        <span className="text-xs font-bold text-stone-900">{m.structuredCard.title}</span>
                        <span className="rounded bg-red-50 px-2 py-0.5 text-[9px] font-bold text-red-700">
                          Structured Action
                        </span>
                      </div>

                      {/* Payroll Card */}
                      {m.structuredCard.type === 'payroll_breakdown' && (
                        <div className="space-y-2 text-xs">
                          <div className="flex justify-between border-b border-stone-100 pb-1 font-semibold text-stone-800">
                            <span>Gross Pay</span>
                            <span>KES {m.structuredCard.data.gross.toLocaleString()}</span>
                          </div>
                          <div className="flex justify-between text-stone-600">
                            <span>NSSF Tier I & II (Capped)</span>
                            <span>- KES {m.structuredCard.data.totalNssf.toLocaleString()}</span>
                          </div>
                          <div className="flex justify-between text-stone-600">
                            <span>Social Health Authority (SHA 2.75%)</span>
                            <span>- KES {m.structuredCard.data.sha.toLocaleString()}</span>
                          </div>
                          <div className="flex justify-between text-stone-600">
                            <span>Affordable Housing Levy (AHL 1.5%)</span>
                            <span>- KES {m.structuredCard.data.housingLevy.toLocaleString()}</span>
                          </div>
                          <div className="flex justify-between text-stone-600">
                            <span>PAYE Income Tax (Net of Relief)</span>
                            <span>- KES {m.structuredCard.data.netPaye.toLocaleString()}</span>
                          </div>
                          <div className="flex justify-between border-t border-stone-200 pt-2 font-bold text-emerald-800 text-sm">
                            <span>Net Payout</span>
                            <span>KES {m.structuredCard.data.netPay.toLocaleString()}</span>
                          </div>
                        </div>
                      )}

                      {/* Job Description Card */}
                      {m.structuredCard.type === 'job_description' && (
                        <div className="space-y-3 text-xs">
                          <p className="text-stone-600"><strong>Department:</strong> {m.structuredCard.data.department}</p>
                          <p className="text-stone-600"><strong>Compensation:</strong> {m.structuredCard.data.salaryRange}</p>
                          <div>
                            <p className="font-bold text-stone-800 mb-1">Core Responsibilities:</p>
                            <ul className="list-disc pl-4 space-y-1 text-stone-600">
                              {m.structuredCard.data.coreResponsibilities.map((r: string, i: number) => (
                                <li key={i}>{r}</li>
                              ))}
                            </ul>
                          </div>
                          <button
                            onClick={() => {
                              navigator.clipboard.writeText(JSON.stringify(m.structuredCard?.data, null, 2));
                              alert('Job description copied to clipboard!');
                            }}
                            className="btn btn-secondary flex items-center gap-1.5 text-xs font-semibold w-full justify-center"
                          >
                            <Copy size={13} /> Copy to ATS Postings
                          </button>
                        </div>
                      )}

                      {/* KPIs Card */}
                      {m.structuredCard.type === 'kpis' && (
                        <div className="grid grid-cols-2 gap-2">
                          {m.structuredCard.data.map((kpi: any, idx: number) => (
                            <div key={idx} className="rounded-xl border border-stone-100 bg-stone-50 p-2.5">
                              <p className="text-[10px] text-stone-400 font-semibold uppercase">{kpi.label}</p>
                              <p className="text-xs font-bold text-stone-900 mt-0.5">{kpi.value}</p>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {isUser && (
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-stone-800 text-white font-bold text-xs shrink-0">
                    DK
                  </div>
                )}
              </div>
            );
          })}

          {isTyping && (
            <div className="flex items-center gap-2 text-stone-400 text-xs italic">
              <Bot size={16} className="animate-spin text-red-700" />
              <span>{activeAgent.name} is thinking & analyzing workforce records...</span>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Suggested Prompts Pills */}
        <div className="border-t border-stone-100 bg-stone-50/50 px-4 py-2 flex items-center gap-2 overflow-x-auto text-xs">
          <span className="text-[10px] font-bold uppercase text-stone-400 shrink-0">Try asking:</span>
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

        {/* Query Input Bar */}
        <div className="border-t border-stone-200 p-3 bg-white">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSend();
            }}
            className="flex items-center gap-2"
          >
            <input
              type="text"
              placeholder={`Ask ${activeAgent.name}...`}
              value={inputQuery}
              onChange={(e) => setInputQuery(e.target.value)}
              className="flex-1 rounded-xl border border-stone-200 bg-stone-50 px-4 py-2.5 text-xs text-stone-900 focus:border-red-700 focus:bg-white focus:outline-hidden"
            />
            <button
              type="submit"
              disabled={!inputQuery.trim()}
              className="btn btn-primary flex items-center gap-1.5 px-4 py-2.5 text-xs font-bold disabled:opacity-50"
            >
              <span>Send</span> <Send size={13} />
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

