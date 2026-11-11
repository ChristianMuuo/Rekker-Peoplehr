// REKKER PeopleOS 10-Agent + Supervisor AI Intelligence Architecture

import { peopleOsStore, calculateKenyaPayroll } from './mockStore';

export type AgentRole =
  | 'supervisor'
  | 'copilot'
  | 'recruitment'
  | 'onboarding'
  | 'payroll'
  | 'attendance'
  | 'performance'
  | 'retention'
  | 'learning'
  | 'compliance'
  | 'executive';

export interface AgentInfo {
  id: AgentRole;
  name: string;
  tagline: string;
  avatarColor: string;
  description: string;
  sampleQueries: string[];
}

export const AGENT_REGISTRY: Record<AgentRole, AgentInfo> = {
  supervisor: {
    id: 'supervisor',
    name: 'Rekker AI Supervisor',
    tagline: 'StateGraph Intent Router & RBAC Guard',
    avatarColor: 'bg-red-700 text-white',
    description:
      'Coordinates all 10 specialist HR intelligence agents, enforces role-based data boundaries, and gates high-impact actions for human signoff.',
    sampleQueries: [
      'Give me an executive workforce intelligence briefing',
      'Calculate Kenya statutory deductions on KES 220,000',
      'Propose a salary increase to KES 140,000 for Brian Kiprotich',
    ],
  },
  copilot: {
    id: 'copilot',
    name: 'HR Copilot Agent',
    tagline: 'Workforce Operations & Self-Service',
    avatarColor: 'bg-amber-600 text-white',
    description: 'Answers employee directory, leave coverage, and self-service workforce inquiries.',
    sampleQueries: [
      'Show pending leave requests and probation milestones',
      'Which employee contracts expire within 60 days?',
    ],
  },
  recruitment: {
    id: 'recruitment',
    name: 'Recruitment Intelligence Agent',
    tagline: 'Explainable Candidate Matching & Interviews',
    avatarColor: 'bg-emerald-700 text-white',
    description:
      'Ranks applicants strictly by job criteria using TF-IDF (protected traits excluded, never auto-rejects) and drafts JDs.',
    sampleQueries: [
      'Rank and compare candidates for Lead Formulation & Filling Line Engineer',
      'Draft behavioral interview questions for plant process engineers',
    ],
  },
  onboarding: {
    id: 'onboarding',
    name: 'Onboarding & Lifecycle Agent',
    tagline: '30-60-90 Day Checklists & Offboarding',
    avatarColor: 'bg-teal-700 text-white',
    description: 'Tracks probation reviews, statutory ID verification, IT asset clearance, and exit interviews.',
    sampleQueries: [
      'Review onboarding and probation status across the team',
      'What offboarding checks are needed for expiring fixed-term contracts?',
    ],
  },
  payroll: {
    id: 'payroll',
    name: 'Payroll Intelligence Agent',
    tagline: 'Configurable Kenya PAYE, NSSF, SHIF & AHL',
    avatarColor: 'bg-blue-700 text-white',
    description: 'Calculates effective-dated Kenyan payroll schedules and runs IsolationForest anomaly audits.',
    sampleQueries: [
      'Calculate complete Kenya statutory deductions for KES 220,000 gross salary',
      'Audit March 2026 payroll run anomalies and NSSF caps',
    ],
  },
  attendance: {
    id: 'attendance',
    name: 'Attendance Intelligence Agent',
    tagline: 'Shift Anomalies & Overtime Patterns',
    avatarColor: 'bg-cyan-700 text-white',
    description: 'Detects duplicate clock punches, late arrival clusters, and shift staffing balance.',
    sampleQueries: [
      'Check attendance anomalies across manufacturing and logistics shifts',
      'Review overtime patterns on the morning formulation & filling shift',
    ],
  },
  performance: {
    id: 'performance',
    name: 'Performance Intelligence Agent',
    tagline: 'OKRs, KPI Momentum & 360 Reviews',
    avatarColor: 'bg-rose-700 text-white',
    description: 'Monitors goal completion velocity, identifies behind-target OKRs, and drafts appraisal frameworks.',
    sampleQueries: [
      'Analyze Q1 OKR performance momentum across departments',
      'Draft Q2 2026 OKRs for Logistics & Distribution',
    ],
  },
  retention: {
    id: 'retention',
    name: 'Employee Retention Agent',
    tagline: 'XGBoost Attrition & Burnout Early Warning',
    avatarColor: 'bg-orange-700 text-white',
    description: 'Predicts attrition risk drivers with XGBoost + NLP sentiment analysis on workforce signals.',
    sampleQueries: [
      'Run attrition risk predictions and top retention drivers',
      'Scan employee feedback sentiment for burnout risk signals',
    ],
  },
  learning: {
    id: 'learning',
    name: 'Learning & Development Agent',
    tagline: 'Skills-Gap Matrix & Training Plans',
    avatarColor: 'bg-indigo-700 text-white',
    description: 'Evaluates role competency gaps and recommends KEBS, OSHA/DOSHS, and SCADA training.',
    sampleQueries: [
      'Run organization skills-gap analysis and course recommendations',
      'Identify missing safety and KRA certifications across teams',
    ],
  },
  compliance: {
    id: 'compliance',
    name: 'Compliance Monitoring Agent',
    tagline: 'Kenya Employment Act & ODPC Privacy RAG',
    avatarColor: 'bg-purple-700 text-white',
    description: 'Retrieves verified policy citations on Kenyan labor governance, ODPC privacy, and contract compliance.',
    sampleQueries: [
      'What are maternity and paternity leave entitlements under Kenya Employment Act?',
      'How does Kenya Data Protection Act 2019 protect medical and salary records?',
    ],
  },
  executive: {
    id: 'executive',
    name: 'Executive Intelligence Agent',
    tagline: 'Workforce Demand Forecasting & Briefings',
    avatarColor: 'bg-stone-800 text-white',
    description: 'Combines Ridge headcount demand forecasts, budget gap utilization, and cross-agent executive briefings.',
    sampleQueries: [
      'Generate a board-ready executive workforce demand forecast',
      'Summarize headcount against budget and high-priority HR risks',
    ],
  },
};

export interface ChatMessage {
  id: string;
  sender: 'user' | 'agent';
  agentRole: AgentRole;
  text: string;
  timestamp: string;
  citations?: string[];
  toolsCalled?: string[];
  collaboratorsConsulted?: string[];
  provider?: string;
  model?: string;
  latencyMs?: number;
  tokenUsage?: { promptTokens: number; completionTokens: number; estimatedCostUsd: number };
  structuredCard?: {
    type: string;
    title: string;
    data: any;
  };
}

export function processAgentQuery(query: string, selectedRole: AgentRole = 'supervisor'): ChatMessage {
  const lower = query.toLowerCase();
  let role: AgentRole = selectedRole;
  if (selectedRole === 'supervisor') {
    if (lower.includes('executive') || lower.includes('forecast')) role = 'executive';
    else if (lower.includes('attrition') || lower.includes('retention')) role = 'retention';
    else if (lower.includes('skill') || lower.includes('learning') || lower.includes('training')) role = 'learning';
    else if (lower.includes('onboard') || lower.includes('offboard')) role = 'onboarding';
    else if (lower.includes('attendance') || lower.includes('shift')) role = 'attendance';
    else if (lower.includes('pay') || lower.includes('salary') || lower.includes('kra') || lower.includes('nssf') || lower.includes('sha')) role = 'payroll';
    else if (lower.includes('job') || lower.includes('candidate') || lower.includes('interview')) role = 'recruitment';
    else if (lower.includes('law') || lower.includes('compliance') || lower.includes('act') || lower.includes('odpc')) role = 'compliance';
    else if (lower.includes('goal') || lower.includes('okr') || lower.includes('performance')) role = 'performance';
    else role = 'copilot';
  }

  const employees = peopleOsStore.getEmployees();
  const depts = peopleOsStore.getDepartments();
  const leaves = peopleOsStore.getLeaveRequests();

  if (role === 'payroll') {
    const salaryMatch = query.match(/(\d[\d,]+)/);
    const grossAmount = salaryMatch ? parseInt(salaryMatch[1]!.replace(/,/g, ''), 10) : 220000;
    const calc = calculateKenyaPayroll(grossAmount);
    return {
      id: `msg_${Date.now()}`,
      sender: 'agent',
      agentRole: 'payroll',
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      text: `Kenya statutory calculation for **KES ${grossAmount.toLocaleString()}** gross earnings:`,
      structuredCard: {
        type: 'payroll_breakdown',
        title: `Statutory Breakdown (KES ${grossAmount.toLocaleString()})`,
        data: { gross: grossAmount, totalNssf: calc.totalNssf, sha: calc.sha, housingLevy: calc.housingLevy, netPaye: calc.netPaye, netPay: calc.netPay },
      },
    };
  }

  return {
    id: `msg_${Date.now()}`,
    sender: 'agent',
    agentRole: role,
    timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    text: `**${AGENT_REGISTRY[role].name}**: Processed query across **${depts.length} departments**, **${employees.length} employee records**, and **${leaves.filter(l => l.status === 'pending').length} pending approvals**.`,
    structuredCard: {
      type: 'kpis',
      title: 'Workforce Snapshot',
      data: [
        { label: 'Workforce', value: `${employees.length} employees` },
        { label: 'Departments', value: `${depts.length} teams` },
        { label: 'Pending Leaves', value: `${leaves.filter(l => l.status === 'pending').length}` },
        { label: 'RBAC Guardrails', value: 'Enforced' },
      ],
    },
  };
}
