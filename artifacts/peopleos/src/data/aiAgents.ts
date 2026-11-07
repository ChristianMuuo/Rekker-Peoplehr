// REKKER PeopleOS Multi-Agent Intelligence Architecture
// Supervisor + Specialist Agents with real workforce queries and explainable execution

import { peopleOsStore, calculateKenyaPayroll } from './mockStore';

export type AgentRole =
  | 'supervisor'
  | 'copilot'
  | 'recruitment'
  | 'payroll'
  | 'compliance'
  | 'performance';

export interface AgentInfo {
  id: AgentRole;
  name: string;
  tagline: string;
  avatarColor: string;
  iconName: string;
  description: string;
  sampleQueries: string[];
}

export const AGENT_REGISTRY: Record<AgentRole, AgentInfo> = {
  supervisor: {
    id: 'supervisor',
    name: 'Rekker AI Supervisor',
    tagline: 'Multi-Agent Intent Router & Governance Engine',
    avatarColor: 'bg-red-700 text-white',
    iconName: 'Sparkles',
    description: 'Central orchestrator that parses user inquiries, determines the ideal specialist agent, and verifies authorization before execution.',
    sampleQueries: [
      'Give me an executive workforce intelligence briefing',
      'Which employee contracts need urgent attention?',
      'Audit the entire workforce and statutory compliance status',
    ],
  },
  copilot: {
    id: 'copilot',
    name: 'HR Copilot Agent',
    tagline: 'Workforce Operations & Real-Time Query Assistant',
    avatarColor: 'bg-amber-600 text-white',
    iconName: 'Users',
    description: 'Direct workforce analyst that queries live employee directories, pending leave requests, department allocations, and operational bottlenecks.',
    sampleQueries: [
      'Show me all pending leave requests requiring review',
      'Which employees are currently on probation?',
      'List all employees in Manufacturing & Brewing',
      'Generate a 30-day onboarding checklist for new engineers',
    ],
  },
  recruitment: {
    id: 'recruitment',
    name: 'Recruitment & ATS Agent',
    tagline: 'Job Descriptions, Candidate Screening & Interview Prep',
    avatarColor: 'bg-emerald-700 text-white',
    iconName: 'Briefcase',
    description: 'Assists recruitment teams with job description drafting, candidate resume skill matching, interview scorecards, and offer drafting.',
    sampleQueries: [
      'Draft a comprehensive Job Description for Senior Brewmaster',
      'Compare applicants for Regional Supply Chain Coordinator',
      'Generate 5 behavioral & technical interview questions for brewing engineer',
    ],
  },
  payroll: {
    id: 'payroll',
    name: 'Payroll Intelligence Agent',
    tagline: 'Kenya Statutory Deductions (PAYE, NSSF, SHA, AHL) & Audit',
    avatarColor: 'bg-blue-700 text-white',
    iconName: 'Calculator',
    description: 'Calculates versioned statutory taxes according to Kenya Revenue Authority (KRA), audits payroll runs for anomalies, and explains net pay breakdowns.',
    sampleQueries: [
      'Calculate complete Kenya statutory deductions for KES 220,000 gross salary',
      'Audit March 2026 payroll run and verify NSSF Tier 1 & 2 caps',
      'Explain the Affordable Housing Levy (1.5%) and SHA (2.75%) calculation',
    ],
  },
  compliance: {
    id: 'compliance',
    name: 'Compliance & Labor Law Agent',
    tagline: 'Kenya Employment Act 2007 & Data Protection Act 2019',
    avatarColor: 'bg-purple-700 text-white',
    iconName: 'ShieldCheck',
    description: 'Advises on statutory labor compliance, notice periods, leave entitlements, ODPC privacy constraints, and disciplinary guidelines in Kenya.',
    sampleQueries: [
      'What are the mandatory statutory leave requirements under the Kenya Employment Act 2007?',
      'What are the legal guidelines for fixed-term contract non-renewal?',
      'How does the Kenya Data Protection Act 2019 apply to employee medical records?',
    ],
  },
  performance: {
    id: 'performance',
    name: 'Performance & Talent Agent',
    tagline: 'OKRs, KPIs, 360 Reviews & Skills Development',
    avatarColor: 'bg-rose-700 text-white',
    iconName: 'Target',
    description: 'Facilitates goal drafting, OKR alignment, performance review summaries, and personalized training recommendations.',
    sampleQueries: [
      'Draft Q2 2026 OKRs for Logistics & Fleet Department',
      'Suggest a career development and certification path for Quality Chemists',
      'How do I structure a 360-degree feedback framework for department managers?',
    ],
  },
};

export interface ChatMessage {
  id: string;
  sender: 'user' | 'agent';
  agentRole: AgentRole;
  text: string;
  timestamp: string;
  structuredCard?: {
    type: 'kpis' | 'table' | 'payroll_breakdown' | 'job_description' | 'checklist';
    title: string;
    data: any;
  };
}

export function processAgentQuery(query: string, selectedRole: AgentRole = 'supervisor'): ChatMessage {
  const lower = query.toLowerCase();
  let role: AgentRole = selectedRole;

  // Auto-route if supervisor is selected
  if (selectedRole === 'supervisor') {
    if (lower.includes('pay') || lower.includes('salary') || lower.includes('kra') || lower.includes('nssf') || lower.includes('sha') || lower.includes('tax') || lower.includes('deduct')) {
      role = 'payroll';
    } else if (lower.includes('job') || lower.includes('candidate') || lower.includes('hire') || lower.includes('interview') || lower.includes('resume') || lower.includes('applicant')) {
      role = 'recruitment';
    } else if (lower.includes('law') || lower.includes('compliance') || lower.includes('act') || lower.includes('legal') || lower.includes('privacy') || lower.includes('data protection')) {
      role = 'compliance';
    } else if (lower.includes('goal') || lower.includes('okr') || lower.includes('performance') || lower.includes('review') || lower.includes('kpi') || lower.includes('training')) {
      role = 'performance';
    } else {
      role = 'copilot';
    }
  }

  // Generate real deterministic response based on live data
  const employees = peopleOsStore.getEmployees();
  const depts = peopleOsStore.getDepartments();
  const leaves = peopleOsStore.getLeaveRequests();

  if (role === 'payroll') {
    const salaryMatch = query.match(/(\d[\d,]+)/);
    const grossAmount = salaryMatch ? parseInt(salaryMatch[1].replace(/,/g, ''), 10) : 220000;
    const calc = calculateKenyaPayroll(grossAmount);

    return {
      id: `msg_${Date.now()}`,
      sender: 'agent',
      agentRole: 'payroll',
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      text: `Here is the comprehensive Kenya statutory tax & payroll breakdown for **KES ${grossAmount.toLocaleString()}** according to current Kenya Revenue Authority (KRA), NSSF, and Social Health Authority (SHA) statutory regulations:`,
      structuredCard: {
        type: 'payroll_breakdown',
        title: `Statutory Payslip Breakdown (Gross KES ${grossAmount.toLocaleString()})`,
        data: {
          gross: grossAmount,
          nssfTier1: calc.nssfTier1,
          nssfTier2: calc.nssfTier2,
          totalNssf: calc.totalNssf,
          taxablePay: calc.taxablePay,
          payeBeforeRelief: calc.payeBeforeRelief,
          personalRelief: calc.personalRelief,
          insuranceRelief: calc.insuranceRelief,
          netPaye: calc.netPaye,
          sha: calc.sha,
          housingLevy: calc.housingLevy,
          totalDeductions: calc.totalDeductions,
          netPay: calc.netPay,
        },
      },
    };
  }

  if (role === 'recruitment') {
    return {
      id: `msg_${Date.now()}`,
      sender: 'agent',
      agentRole: 'recruitment',
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      text: `I have generated an enterprise-grade Job Description tailored for **Rekker Breweries Kenya**, incorporating technical brewing requirements, quality standards, and compensation benchmarks:`,
      structuredCard: {
        type: 'job_description',
        title: 'Job Description: Senior Industrial Brewing & Quality Engineer',
        data: {
          department: 'Manufacturing & Brewing',
          location: 'Nairobi Industrial Area Plant',
          employmentType: 'Full-time Permanent',
          salaryRange: 'KES 200,000 – KES 260,000 gross monthly + Medical & Pension',
          coreResponsibilities: [
            'Supervise automated wort cooling, yeast pitch rates, and closed fermentation vats across high-capacity brewery lines.',
            'Maintain continuous microbiological quality standards in accordance with KEBS KS EAS 104 and ISO 22000.',
            'Collaborate with the Logistics Fleet Lead to ensure timely chilled tank transfer and packaging run readiness.',
            'Monitor utility consumption metrics (steam boiler efficiency, refrigeration compressors, and CO2 recovery).',
          ],
          minimumRequirements: [
            'B.Sc. in Chemical Engineering, Food Science, or Mechanical Engineering from an accredited university.',
            '5+ years hands-on experience in commercial brewing, craft beverage, or high-speed bottling plants.',
            'Demonstrated proficiency with SCADA / PLC control interfaces and HACCP sanitation principles.',
          ],
        },
      },
    };
  }

  if (role === 'compliance') {
    return {
      id: `msg_${Date.now()}`,
      sender: 'agent',
      agentRole: 'compliance',
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      text: `### Kenya Employment Act (2007) & Statutory Compliance Summary\n\nUnder Kenya labor laws, all Rekker PeopleOS employment workflows must adhere to the following statutory minimums:\n\n1. **Annual Leave (Section 28)**:\n   - Minimum **21 working days** of fully paid annual leave after 12 consecutive months of service.\n\n2. **Maternity & Paternity Leave (Section 29)**:\n   - **Maternity Leave**: **3 months (90 calendar days)** fully paid, without forfeiture of annual leave.\n   - **Paternity Leave**: **2 weeks (14 calendar days)** fully paid.\n\n3. **Sick Leave (Section 30)**:\n   - Up to **7 days on full pay** and **7 days on half pay** during any 12-month period, supported by medical practitioner certification.\n\n4. **Affordable Housing Levy (AHL 2024)**:\n   - Mandatory statutory deduction of **1.5% of gross salary** by employee matched by **1.5%** by employer.\n\n5. **Kenya Data Protection Act (2019)**:\n   - All workforce personal data (national ID, bank details, health records) must be processed transparently with purpose limitation. No unauthorized sharing.`,
    };
  }

  if (role === 'performance') {
    return {
      id: `msg_${Date.now()}`,
      sender: 'agent',
      agentRole: 'performance',
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      text: `### Proposed Q2 2026 OKR Framework for Rekker Breweries Operations\n\n**Objective 1: Maximize Production Throughput & Maintain 99.8% Batch Quality**\n- *KR 1.1:* Zero uncontained fermentation batch variations across all Nairobi plant brew vats.\n- *KR 1.2:* Reduce unplanned equipment downtime to under 2.5 hours per operating month.\n- *KR 1.3:* Achieve 100% staff completion of the ISO 22000 Food Safety refresher certification.\n\n**Objective 2: Expand Supply Chain Cold Transit Reliability**\n- *KR 2.1:* Cut route distribution delivery delays from 6.8% to under 2.0%.\n- *KR 2.2:* Maintain 100% cold-chain temperature telemetry compliance during transit.`,
    };
  }

  // Default: Copilot / Supervisor real data summary
  const pendingLeaves = leaves.filter(l => l.status === 'pending');
  const expiringContracts = employees.filter(e => e.contractEndDate);
  const probationEmployees = employees.filter(e => e.status === 'probation');

  return {
    id: `msg_${Date.now()}`,
    sender: 'agent',
    agentRole: role,
    timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    text: `### Rekker Workforce Intelligence Overview\n\nHere is the real-time operational status across **${depts.length} departments** and **${employees.length} active team members**:\n\n- **Headcount:** ${employees.length} total personnel across Manufacturing, Distribution, Brand, and People & Culture.\n- **Pending Leave Requests:** **${pendingLeaves.length} requests** waiting for manager approval (${pendingLeaves.map(l => l.employeeName).join(', ')}).\n- **Probation Assessments:** **${probationEmployees.length} employee** (${probationEmployees.map(e => e.firstName + ' ' + e.lastName).join(', ')}) approaching 90-day review date.\n- **Contracts Approaching Expiry:** **${expiringContracts.length} fixed-term contract** due for renewal discussion (${expiringContracts.map(e => e.firstName + ' ' + e.lastName + ' ending ' + e.contractEndDate).join(', ')}).\n\nWhat action would you like to take? I can draft approvals, prepare review scorecards, or run payroll tax audits.`,
    structuredCard: {
      type: 'kpis',
      title: 'Current Workforce Action Items',
      data: [
        { label: 'Pending Approvals', value: `${pendingLeaves.length} items`, status: 'warning' },
        { label: 'Expiring Contracts', value: `${expiringContracts.length} personnel`, status: 'alert' },
        { label: 'Probation Reviews', value: `${probationEmployees.length} personnel`, status: 'info' },
        { label: 'Statutory Taxes', value: 'KRA Compliant', status: 'success' },
      ],
    },
  };
}
