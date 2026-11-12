// Fallback store providing immediate enterprise resilience
// for Rekker PeopleOS when remote PostgreSQL/Express is unavailable (e.g. offline dev, Vercel static deployments)

export interface MockDepartment {
  id: string;
  name: string;
  code: string;
  managerEmployeeId?: string | null;
  managerName?: string | null;
  location: string;
  headcount: number;
  budgetedPositions: number;
  description?: string;
}

export interface MockEmployee {
  id: string;
  employeeNumber: string;
  firstName: string;
  lastName: string;
  preferredName?: string | null;
  workEmail: string;
  phone?: string | null;
  jobTitle: string;
  departmentId: string;
  departmentName: string;
  managerId?: string | null;
  managerName?: string | null;
  location: string;
  employmentType: 'permanent' | 'contract' | 'probation' | 'casual';
  status: 'active' | 'on_leave' | 'probation' | 'terminated';
  startDate: string;
  probationEndDate?: string | null;
  contractEndDate?: string | null;
  isDemo: boolean;
}

export interface MockLeaveRequest {
  id: string;
  employeeId: string;
  employeeName: string;
  leaveType: string;
  startDate: string;
  endDate: string;
  days: number;
  reason: string;
  status: 'pending' | 'approved' | 'rejected' | 'cancelled';
  approverId?: string | null;
  decisionComment?: string | null;
  submittedAt: string;
  decidedAt?: string | null;
  isDemo: boolean;
}

const DEFAULT_DEPTS: MockDepartment[] = [
  { id: '20000000-0000-4000-8000-000000000001', code: 'MFG', name: 'Formulation & Filling', description: 'Home & personal care formulation, filling lines, batch quality inspection.', location: 'Nairobi Production Facility', managerEmployeeId: '10000000-0000-4000-8000-000000000001', managerName: 'Achieng Odhiambo', headcount: 3, budgetedPositions: 15 },
  { id: '20000000-0000-4000-8000-000000000002', code: 'DIST', name: 'Logistics & Distribution', description: 'Fleet transport, distribution hub management, route dispatching.', location: 'Nairobi Central Logistics Hub', managerEmployeeId: '10000000-0000-4000-8000-000000000003', managerName: 'Juma Omondi', headcount: 2, budgetedPositions: 12 },
  { id: '20000000-0000-4000-8000-000000000003', code: 'BRAND', name: 'Brand & Commercial Marketing', description: 'Brand activation, trade marketing, distributor relations.', location: 'Westlands Commercial Office', managerEmployeeId: '10000000-0000-4000-8000-000000000005', managerName: 'Brenda Mutheu', headcount: 2, budgetedPositions: 8 },
  { id: '20000000-0000-4000-8000-000000000004', code: 'PEOPLE', name: 'People Operations & Culture', description: 'Workforce intelligence, statutory compliance, talent acquisition.', location: 'Westlands Commercial Office', managerEmployeeId: '10000000-0000-4000-8000-000000000007', managerName: 'David Kibet', headcount: 2, budgetedPositions: 6 },
  { id: '20000000-0000-4000-8000-000000000005', code: 'FIN', name: 'Finance & Supply Chain', description: 'Financial accounting, KRA reporting, payroll governance.', location: 'Westlands Commercial Office', managerEmployeeId: null, managerName: null, headcount: 1, budgetedPositions: 5 },
];

const DEFAULT_EMPS: MockEmployee[] = [
  { id: '10000000-0000-4000-8000-000000000001', employeeNumber: 'REK-0101', firstName: 'Achieng', lastName: 'Odhiambo', preferredName: 'Achieng', workEmail: 'achieng.odhiambo@rekker-demo.invalid', phone: null, jobTitle: 'Plant Operations Director', departmentId: '20000000-0000-4000-8000-000000000001', departmentName: 'Formulation & Filling', managerId: null, managerName: null, location: 'Nairobi Production Facility', employmentType: 'permanent', status: 'active', startDate: '2021-03-15', probationEndDate: null, contractEndDate: null, isDemo: true },
  { id: '10000000-0000-4000-8000-000000000002', employeeNumber: 'REK-0102', firstName: 'Mwangi', lastName: 'Kariuki', preferredName: 'Mwangi', workEmail: 'mwangi.kariuki@rekker-demo.invalid', phone: null, jobTitle: 'Lead Formulation & Quality Chemist', departmentId: '20000000-0000-4000-8000-000000000001', departmentName: 'Formulation & Filling', managerId: '10000000-0000-4000-8000-000000000001', managerName: 'Achieng Odhiambo', location: 'Nairobi Production Facility', employmentType: 'permanent', status: 'active', startDate: '2022-06-01', probationEndDate: null, contractEndDate: null, isDemo: true },
  { id: '10000000-0000-4000-8000-000000000003', employeeNumber: 'REK-0103', firstName: 'Juma', lastName: 'Omondi', preferredName: null, workEmail: 'juma.omondi@rekker-demo.invalid', phone: null, jobTitle: 'Logistics Fleet Manager', departmentId: '20000000-0000-4000-8000-000000000002', departmentName: 'Logistics & Distribution', managerId: null, managerName: null, location: 'Nairobi Central Logistics Hub', employmentType: 'permanent', status: 'active', startDate: '2022-09-10', probationEndDate: null, contractEndDate: null, isDemo: true },
  { id: '10000000-0000-4000-8000-000000000004', employeeNumber: 'REK-0104', firstName: 'Wanjiku', lastName: 'Kimani', preferredName: 'Wawa', workEmail: 'wanjiku.kimani@rekker-demo.invalid', phone: null, jobTitle: 'Distribution Dispatch Specialist', departmentId: '20000000-0000-4000-8000-000000000002', departmentName: 'Logistics & Distribution', managerId: '10000000-0000-4000-8000-000000000003', managerName: 'Juma Omondi', location: 'Nairobi Central Logistics Hub', employmentType: 'permanent', status: 'on_leave', startDate: '2023-04-12', probationEndDate: null, contractEndDate: null, isDemo: true },
  { id: '10000000-0000-4000-8000-000000000005', employeeNumber: 'REK-0105', firstName: 'Brenda', lastName: 'Mutheu', preferredName: 'Brenda', workEmail: 'brenda.mutheu@rekker-demo.invalid', phone: null, jobTitle: 'Brand Strategy & Trade Lead', departmentId: '20000000-0000-4000-8000-000000000003', departmentName: 'Brand & Commercial Marketing', managerId: null, managerName: null, location: 'Westlands Commercial Office', employmentType: 'permanent', status: 'active', startDate: '2022-01-10', probationEndDate: null, contractEndDate: null, isDemo: true },
  { id: '10000000-0000-4000-8000-000000000006', employeeNumber: 'REK-0106', firstName: 'Brian', lastName: 'Kiprotich', preferredName: 'Brian', workEmail: 'brian.kiprotich@rekker-demo.invalid', phone: null, jobTitle: 'Digital Growth & Social Media Specialist', departmentId: '20000000-0000-4000-8000-000000000003', departmentName: 'Brand & Commercial Marketing', managerId: '10000000-0000-4000-8000-000000000005', managerName: 'Brenda Mutheu', location: 'Westlands Commercial Office', employmentType: 'contract', status: 'active', startDate: '2024-02-01', probationEndDate: null, contractEndDate: '2026-04-30', isDemo: true },
  { id: '10000000-0000-4000-8000-000000000007', employeeNumber: 'REK-0107', firstName: 'David', lastName: 'Kibet', preferredName: 'David', workEmail: 'david.kibet@rekker-demo.invalid', phone: null, jobTitle: 'Head of People & Organization Culture', departmentId: '20000000-0000-4000-8000-000000000004', departmentName: 'People Operations & Culture', managerId: null, managerName: null, location: 'Westlands Commercial Office', employmentType: 'permanent', status: 'active', startDate: '2021-08-01', probationEndDate: null, contractEndDate: null, isDemo: true },
  { id: '10000000-0000-4000-8000-000000000008', employeeNumber: 'REK-0108', firstName: 'Faith', lastName: 'Chebet', preferredName: 'Faith', workEmail: 'faith.chebet@rekker-demo.invalid', phone: null, jobTitle: 'Talent Acquisition & Employee Experience Officer', departmentId: '20000000-0000-4000-8000-000000000004', departmentName: 'People Operations & Culture', managerId: '10000000-0000-4000-8000-000000000007', managerName: 'David Kibet', location: 'Westlands Commercial Office', employmentType: 'probation', status: 'probation', startDate: '2026-01-15', probationEndDate: '2026-04-15', contractEndDate: null, isDemo: true },
  { id: '10000000-0000-4000-8000-000000000009', employeeNumber: 'REK-0109', firstName: 'Dennis', lastName: 'Otieno', preferredName: 'Denno', workEmail: 'dennis.otieno@rekker-demo.invalid', phone: null, jobTitle: 'Financial Accountant & Payroll Controller', departmentId: '20000000-0000-4000-8000-000000000005', departmentName: 'Finance & Supply Chain', managerId: null, managerName: null, location: 'Westlands Commercial Office', employmentType: 'permanent', status: 'active', startDate: '2023-01-09', probationEndDate: null, contractEndDate: null, isDemo: true },
  { id: '10000000-0000-4000-8000-000000000010', employeeNumber: 'REK-0110', firstName: 'Sarah', lastName: 'Njeri', preferredName: 'Sarah', workEmail: 'sarah.njeri@rekker-demo.invalid', phone: null, jobTitle: 'Junior Quality Assurance Chemist', departmentId: '20000000-0000-4000-8000-000000000001', departmentName: 'Formulation & Filling', managerId: '10000000-0000-4000-8000-000000000002', managerName: 'Mwangi Kariuki', location: 'Nairobi Production Facility', employmentType: 'permanent', status: 'active', startDate: '2024-05-02', probationEndDate: null, contractEndDate: null, isDemo: true },
];

const DEFAULT_LEAVES: MockLeaveRequest[] = [
  { id: 'leave-001', employeeId: '10000000-0000-4000-8000-000000000004', employeeName: 'Wanjiku Kimani', leaveType: 'annual', startDate: '2026-03-02', endDate: '2026-03-13', days: 10, reason: 'Annual rest and family leave', status: 'approved', approverId: '10000000-0000-4000-8000-000000000007', decisionComment: 'Approved. Fleet coverage confirmed.', submittedAt: '2026-02-15T08:30:00Z', decidedAt: '2026-02-16T10:00:00Z', isDemo: true },
  { id: 'leave-002', employeeId: '10000000-0000-4000-8000-000000000006', employeeName: 'Brian Kiprotich', leaveType: 'annual', startDate: '2026-03-20', endDate: '2026-03-27', days: 6, reason: 'Professional certification exam study period', status: 'pending', approverId: null, decisionComment: null, submittedAt: '2026-03-01T11:45:00Z', decidedAt: null, isDemo: true },
  { id: 'leave-003', employeeId: '10000000-0000-4000-8000-000000000002', employeeName: 'Mwangi Kariuki', leaveType: 'paternity', startDate: '2026-04-06', endDate: '2026-04-17', days: 10, reason: 'Paternity leave under Employment Act 2007', status: 'pending', approverId: null, decisionComment: null, submittedAt: '2026-03-04T09:15:00Z', decidedAt: null, isDemo: true },
];

const DEFAULT_AUDITS = [
  { id: 'audit-001', occurredAt: '2026-03-05T14:20:00Z', actor: 'David Kibet (HR Admin)', action: 'LEAVE_APPROVE', targetType: 'leave_request', targetId: 'leave-001', summary: 'Approved annual leave for Wanjiku Kimani', isDemo: true },
  { id: 'audit-002', occurredAt: '2026-03-01T09:00:00Z', actor: 'Dennis Otieno (Finance)', action: 'PAYROLL_GENERATION', targetType: 'payroll_period', targetId: 'period-2026-02', summary: 'Finalized statutory KRA & NSSF payroll report for February 2026', isDemo: true },
  { id: 'audit-003', occurredAt: '2026-02-28T16:45:00Z', actor: 'Faith Chebet (Recruiter)', action: 'CANDIDATE_SCREEN', targetType: 'candidate', targetId: 'cand-001', summary: 'Completed phone interview scorecard for Formulation & Filling Engineer candidate', isDemo: true },
];

// Leave policies start empty by default (organization HR configures entitlements; never prefill statutory amounts).
const DEFAULT_LEAVE_POLICIES: Array<{
  id: string;
  code: string;
  name: string;
  entitlementDays: number;
  accrualMethod: 'annual' | 'monthly';
  active: boolean;
}> = [];

const DEFAULT_EXPENSES: Array<{
  id: string;
  employeeId: string;
  employeeName: string;
  title: string;
  category: string;
  amountKes: number;
  incurredDate: string;
  receiptReference: string | null;
  notes: string;
  status: string;
  approverUserId: string | null;
  decisionComment: string | null;
  decidedAt: string | null;
  createdAt: string;
}> = [
  { id: 'exp-001', employeeId: '10000000-0000-4000-8000-000000000003', employeeName: 'Juma Omondi', title: 'Nakuru Cold-Chain Distributor Audit Travel & Fuel', category: 'Travel & Fleet', amountKes: 14800, incurredDate: '2026-03-04', receiptReference: 'KRA-ETR-991827', notes: 'Overnight route audit across Nakuru & Naivasha hubs.', status: 'pending', approverUserId: null, decisionComment: null, decidedAt: null, createdAt: '2026-03-04T15:10:00Z' },
  { id: 'exp-002', employeeId: '10000000-0000-4000-8000-000000000005', employeeName: 'Brenda Mutheu', title: 'Trade Activation POS Display Print Materials', category: 'Commercial Marketing', amountKes: 28500, incurredDate: '2026-02-27', receiptReference: 'INV-2026-441', notes: 'Westlands launch kits.', status: 'approved', approverUserId: 'user_demo_admin_01', decisionComment: 'Approved within budget.', decidedAt: '2026-02-28T10:20:00Z', createdAt: '2026-02-27T11:00:00Z' },
];

const DEFAULT_ASSETS: Array<{
  id: string;
  assetTag: string;
  name: string;
  category: string;
  serialNumber: string;
  condition: string;
  assignedEmployeeId: string | null;
  assignedEmployeeName: string | null;
  assignedDate: string | null;
  returnDueDate: string | null;
  status: string;
  valueKes: number;
}> = [
  { id: 'asset-001', assetTag: 'REK-IT-041', name: 'ThinkPad X1 Carbon Gen 12', category: 'Laptop & Workstation', serialNumber: 'PF49KL21', condition: 'good', assignedEmployeeId: '10000000-0000-4000-8000-000000000007', assignedEmployeeName: 'David Kibet', assignedDate: '2024-06-15', returnDueDate: null, status: 'assigned', valueKes: 195000 },
  { id: 'asset-002', assetTag: 'REK-IT-058', name: 'MacBook Pro 14 M3', category: 'Laptop & Workstation', serialNumber: 'C02YW9Q8', condition: 'good', assignedEmployeeId: '10000000-0000-4000-8000-000000000006', assignedEmployeeName: 'Brian Kiprotich', assignedDate: '2024-02-01', returnDueDate: '2026-04-30', status: 'assigned', valueKes: 240000 },
  { id: 'asset-003', assetTag: 'REK-FLT-012', name: 'Isuzu FRR Refrigerated Distribution Truck', category: 'Fleet Vehicle', serialNumber: 'KDM-482L', condition: 'good', assignedEmployeeId: '10000000-0000-4000-8000-000000000003', assignedEmployeeName: 'Juma Omondi', assignedDate: '2023-03-10', returnDueDate: null, status: 'assigned', valueKes: 5400000 },
  { id: 'asset-004', assetTag: 'REK-PPE-089', name: 'Industrial Formulation Thermal Safety Kit', category: 'Safety PPE', serialNumber: 'PPE-2026-89', condition: 'new', assignedEmployeeId: null, assignedEmployeeName: null, assignedDate: null, returnDueDate: null, status: 'available', valueKes: 18500 },
];

const DEFAULT_ONBOARDING_TASKS: Array<{
  id: string;
  employeeId: string;
  employeeName: string;
  workflowType: 'onboarding' | 'offboarding';
  title: string;
  category: string;
  dueDate: string;
  completed: boolean;
}> = [
  { id: 'task-01', employeeId: '10000000-0000-4000-8000-000000000008', employeeName: 'Faith Chebet', workflowType: 'onboarding', title: 'Collect & Verify KRA PIN, NSSF & SHIF Numbers', category: 'Compliance', dueDate: '2026-01-20', completed: true },
  { id: 'task-02', employeeId: '10000000-0000-4000-8000-000000000008', employeeName: 'Faith Chebet', workflowType: 'onboarding', title: 'Sign Employment Act §10 Contract & ODPC Privacy Notice', category: 'Compliance', dueDate: '2026-01-22', completed: true },
  { id: 'task-03', employeeId: '10000000-0000-4000-8000-000000000008', employeeName: 'Faith Chebet', workflowType: 'onboarding', title: 'Provision Corporate Laptop, Email & ERP Access', category: 'IT & Assets', dueDate: '2026-01-25', completed: true },
  { id: 'task-06', employeeId: '10000000-0000-4000-8000-000000000008', employeeName: 'Faith Chebet', workflowType: 'onboarding', title: 'Final 90-Day Probation Assessment & Confirmation Signoff', category: 'HR & Benefits', dueDate: '2026-04-15', completed: false },
  { id: 'task-07', employeeId: '10000000-0000-4000-8000-000000000006', employeeName: 'Brian Kiprotich', workflowType: 'offboarding', title: 'Fixed-Term Contract Renewal or Exit Decision Review', category: 'Compliance', dueDate: '2026-04-15', completed: false },
  { id: 'task-08', employeeId: '10000000-0000-4000-8000-000000000006', employeeName: 'Brian Kiprotich', workflowType: 'offboarding', title: 'Asset Clearance: Recover MacBook Pro (REK-IT-058)', category: 'IT & Assets', dueDate: '2026-04-30', completed: false },
];

const DEFAULT_STATUTORY_CONFIGS = [
  {
    id: 'stat-ke-2025-02-rekker-demo',
    name: 'Kenya Statutory Schedule 2025/2026 (NSSF Phase 3 + SHIF + AHL)',
    effectiveFrom: '2025-02-01',
    isActive: true,
    nssf: { rate: 0.06, tier1UpperLimitKes: 8000, tier2UpperLimitKes: 72000, employerMatch: true },
    shif: { rate: 0.0275, minimumKes: 300, deductibleFromTaxablePay: false, insuranceReliefRate: 0.15, insuranceReliefMaxKes: 5000 },
    housingLevy: { employeeRate: 0.015, employerRate: 0.015, deductibleFromTaxablePay: false },
    paye: {
      personalReliefKes: 2400,
      bands: [
        { label: 'First KES 24,000', limitKes: 24000, rate: 0.1 },
        { label: 'Next KES 8,333', limitKes: 8333, rate: 0.25 },
        { label: 'Next KES 467,667', limitKes: 467667, rate: 0.3 },
        { label: 'Next KES 300,000', limitKes: 300000, rate: 0.325 },
        { label: 'Above KES 800,000', limitKes: null, rate: 0.35 },
      ],
    },
  },
];

const FALLBACK_HR_CASES: Array<any> = [
  { id: 'hrc-001', caseNumber: 'HRC-2026-001', category: 'workplace_query', severity: 'low', title: 'Fixed-Term Contract Renewal Clarification', description: 'Review timeline and statutory gratuity query ahead of 30 April contract end.', confidentialNotes: 'HR Director noted positive KPI attainment; renewal addendum drafted.', status: 'investigating', resolutionSummary: null, createdAt: '2026-03-01T09:30:00Z' },
];
const FALLBACK_WF_RULES: Array<any> = [
  { id: 'wf-leave-01', domain: 'leave', name: 'Department Manager + HR Signoff', approvalLevels: 2, slaHours: 24, requiredApproverRoles: ['department_manager', 'hr_manager'], isActive: true },
  { id: 'wf-payroll-01', domain: 'payroll', name: 'Dual Maker-Checker Statutory Disbursement', approvalLevels: 2, slaHours: 48, requiredApproverRoles: ['payroll_officer', 'finance_manager'], isActive: true },
];
const FALLBACK_SHIFT_ROSTER: Array<any> = [
  { employeeId: '10000000-0000-4000-8000-000000000001', employeeName: 'Achieng Odhiambo', unitType: 'production', workZone: 'Formulation Line A', shiftName: 'Morning (06:00-14:00)', roleSkill: 'Lead Formulation Chemist', certificationValidUntil: '2027-01-15', costCentreCode: 'CC-MFG-01', availableToday: true },
  { employeeId: '10000000-0000-4000-8000-000000000002', employeeName: 'Mwangi Kariuki', unitType: 'production', workZone: 'Automated Filling Line B', shiftName: 'Morning (06:00-14:00)', roleSkill: 'High-Speed Filler Operator', certificationValidUntil: '2026-08-20', costCentreCode: 'CC-MFG-01', availableToday: true },
  { employeeId: '10000000-0000-4000-8000-000000000004', employeeName: 'Wanjiku Kimani', unitType: 'warehouse', workZone: 'Nairobi Dispatch Warehouse', shiftName: 'Day (08:00-17:00)', roleSkill: 'Forklift Operator', certificationValidUntil: '2026-04-05', costCentreCode: 'CC-WHS-01', availableToday: false },
  { employeeId: '10000000-0000-4000-8000-000000000003', employeeName: 'Juma Omondi', unitType: 'distribution', workZone: 'Nairobi - Rift Corridor', shiftName: 'Route Dispatch (06:30-16:30)', roleSkill: 'Fleet Logistics Supervisor', certificationValidUntil: '2026-11-30', costCentreCode: 'CC-LOG-01', availableToday: true },
  { employeeId: '10000000-0000-4000-8000-000000000005', employeeName: 'Brenda Mutheu', unitType: 'sales', workZone: 'Nairobi & Mt. Kenya Trade', shiftName: 'Field Commercial', roleSkill: 'Key Trade Account Manager', certificationValidUntil: '2027-03-01', costCentreCode: 'CC-SLS-01', availableToday: true },
];

export function handleFallbackApi(url: string, method: string = 'GET', body?: any): any {
  const path = (() => {
    const raw = url.split('?')[0] ?? url;
    if (raw.startsWith('http://') || raw.startsWith('https://')) {
      try {
        return new URL(raw).pathname;
      } catch {
        return raw;
      }
    }
    return raw;
  })();
  const parsedBody = body && typeof body === 'string' ? (() => { try { return JSON.parse(body); } catch { return {}; } })() : (body || {});

  if (path === '/api/hr-cases') {
    if (method === 'POST') {
      const rec = { id: `hrc-${Date.now()}`, caseNumber: `HRC-2026-0${FALLBACK_HR_CASES.length + 1}`, category: parsedBody.category || 'grievance', severity: parsedBody.severity || 'medium', title: parsedBody.title, description: parsedBody.description, confidentialNotes: parsedBody.confidentialNotes || '', status: 'open', createdAt: new Date().toISOString() };
      FALLBACK_HR_CASES.unshift(rec);
      return rec;
    }
    return { items: FALLBACK_HR_CASES, total: FALLBACK_HR_CASES.length, accessScope: 'HR_CASE_OFFICER_FULL' };
  }
  if (path.startsWith('/api/hr-cases/') && method === 'PATCH') {
    const caseId = path.replace('/api/hr-cases/', '');
    const target = FALLBACK_HR_CASES.find(c => c.id === caseId);
    if (target) {
      if (parsedBody.status) target.status = parsedBody.status;
      if (parsedBody.confidentialNotes !== undefined) target.confidentialNotes = parsedBody.confidentialNotes;
      return target;
    }
  }
  if (path === '/api/workforce-erp/shifts' && method === 'POST') {
    const emp = DEFAULT_EMPS.find(e => e.id === parsedBody.employeeId);
    const entry = {
      employeeId: parsedBody.employeeId || 'custom-emp',
      employeeName: emp ? `${emp.firstName} ${emp.lastName}` : (parsedBody.employeeName || 'Rekker Specialist'),
      unitType: parsedBody.unitType || 'production',
      workZone: parsedBody.workZone || 'Formulation Line A',
      shiftName: parsedBody.shiftName || 'Morning (06:00-14:00)',
      roleSkill: parsedBody.roleSkill || 'Line Operator',
      certificationValidUntil: parsedBody.certificationValidUntil || '2027-06-30',
      costCentreCode: parsedBody.costCentreCode || 'CC-MFG-01',
      availableToday: true,
    };
    FALLBACK_SHIFT_ROSTER.unshift(entry);
    return entry;
  }
  if (path === '/api/workforce-erp/production/assign-relief' && method === 'POST') {
    const emp = DEFAULT_EMPS.find(e => e.id === parsedBody.replacementEmployeeId);
    const empName = emp ? `${emp.firstName} ${emp.lastName}` : 'Relief Specialist';
    const entry = {
      employeeId: parsedBody.replacementEmployeeId || 'relief-emp',
      employeeName: empName,
      unitType: parsedBody.targetUnitType || 'warehouse',
      workZone: `${parsedBody.targetZone || 'Nairobi Dispatch Warehouse'} (Relief)`,
      shiftName: parsedBody.shiftName || 'Day (08:00-17:00)',
      roleSkill: emp?.jobTitle || 'Certified Relief Operator',
      certificationValidUntil: '2027-06-30',
      costCentreCode: 'CC-WHS-01',
      availableToday: true,
    };
    FALLBACK_SHIFT_ROSTER.unshift(entry);
    return { assigned: true, employeeName: empName, targetZone: entry.workZone };
  }
  if (path === '/api/workforce-erp/overview') {
    const units = Array.from(new Set(FALLBACK_SHIFT_ROSTER.map(r => r.unitType)));
    const heatmap = units.map(unitType => {
      const unitRows = FALLBACK_SHIFT_ROSTER.filter(r => r.unitType === unitType);
      const present = unitRows.filter(r => r.availableToday).length;
      return { unitType, scheduled: unitRows.length, present, awayOrPendingLeave: unitRows.length - present, coveragePct: unitRows.length ? Math.round((present / unitRows.length) * 100) : 100 };
    });
    return {
      dataScope: 'ERP_WORKFORCE_AVAILABILITY',
      roster: FALLBACK_SHIFT_ROSTER,
      heatmap,
      understaffedUnits: heatmap.filter(h => h.coveragePct < 100),
    };
  }
  if (path === '/api/workforce-erp/drivers') {
    return { items: [{ employeeId: '10000000-0000-4000-8000-000000000003', driverName: 'Juma Omondi', licenseNumber: 'DL-KE-881204', licenseClass: 'BCE Commercial Heavy', licenseExpiry: '2026-03-29', psvOrSafetyCertExpiry: '2026-04-12', assignedVehicle: 'KDM 482L · Box Truck', routeCorridor: 'Nairobi -> Nakuru', daysRemaining: 23, alertLevel: 'expiring_soon' }], alertsCount: 1 };
  }
  if (path === '/api/workforce-erp/production/replacements') {
    return { missingCoverageEmployees: [{ employeeId: '10000000-0000-4000-8000-000000000004', name: 'Wanjiku Kimani', departmentName: 'Logistics & Distribution' }], qualifiedReplacements: [{ employeeId: '10000000-0000-4000-8000-000000000002', name: 'Mwangi Kariuki', departmentName: 'Formulation & Filling', jobTitle: 'Lead Formulation & Quality Chemist', safetyCleared: true, readinessNote: 'Direct Production Line Certified' }] };
  }
  if (path === '/api/workforce-erp/sales-force') {
    return { items: [{ employeeId: '10000000-0000-4000-8000-000000000005', repName: 'Brenda Mutheu', territory: 'Nairobi Metro & Modern Trade', costCentreCode: 'CC-SLS-01', monthlyTargetKes: 2500000, actualAttributedKes: 2310000, commissionRatePct: 2.5, attainmentPct: 92.4, estimatedCommissionKes: 57750 }], totalAttributedKes: 2310000 };
  }
  if (path === '/api/workflow-rules') {
    if (method === 'POST') {
      const rule = { id: `wf-${Date.now()}`, domain: parsedBody.domain || 'leave', name: parsedBody.name || 'Custom Rule', approvalLevels: Number(parsedBody.approvalLevels || 2), slaHours: Number(parsedBody.slaHours || 24), requiredApproverRoles: parsedBody.requiredApproverRoles || ['hr_manager'], isActive: true };
      FALLBACK_WF_RULES.unshift(rule);
      return rule;
    }
    return { items: FALLBACK_WF_RULES };
  }
  if (path === '/api/peopleos/employees/import-preview' && method === 'POST') {
    const lines = String(parsedBody.csvText || '').split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    const bodyLines = lines.length > 1 ? lines.slice(1) : lines;
    const rows = bodyLines.map((line, i) => {
      const cols = line.split(',').map(c => c.trim());
      return {
        rowNumber: i + 1,
        employeeNumber: (cols[0] || '').toUpperCase(),
        firstName: cols[1] || '',
        lastName: cols[2] || '',
        workEmail: (cols[3] || '').toLowerCase(),
        departmentName: 'Formulation & Filling',
        status: !cols[0] || !cols[3]?.includes('@') ? 'error' : DEFAULT_EMPS.some(e => e.employeeNumber === cols[0]?.toUpperCase()) ? 'duplicate' : 'valid',
        errors: !cols[3]?.includes('@') ? ['Invalid workEmail'] : [],
      };
    });
    return { totalRows: rows.length, validCount: rows.filter(r => r.status === 'valid').length, duplicateCount: rows.filter(r => r.status === 'duplicate').length, errorCount: rows.filter(r => r.status === 'error').length, rows };
  }
  if (path === '/api/peopleos/employees/import' && method === 'POST') {
    const lines = String(parsedBody.csvText || '').split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    const bodyLines = lines.length > 1 ? lines.slice(1) : lines;
    let importedCount = 0;
    let skippedDuplicatesCount = 0;
    for (const line of bodyLines) {
      const cols = line.split(',').map(c => c.trim());
      const empNo = (cols[0] || '').toUpperCase();
      if (!empNo || !cols[1] || !cols[3]?.includes('@')) continue;
      if (DEFAULT_EMPS.some(e => e.employeeNumber === empNo || e.workEmail === cols[3]?.toLowerCase())) {
        skippedDuplicatesCount++;
        continue;
      }
      DEFAULT_EMPS.push({
        id: `emp-csv-${Date.now()}-${importedCount}`,
        employeeNumber: empNo,
        firstName: cols[1],
        lastName: cols[2] || 'Staff',
        preferredName: cols[1],
        workEmail: cols[3].toLowerCase(),
        phone: null,
        jobTitle: cols[4] || 'Operations Specialist',
        departmentId: '20000000-0000-4000-8000-000000000001',
        departmentName: 'Formulation & Filling',
        managerId: '10000000-0000-4000-8000-000000000001',
        managerName: 'Achieng Odhiambo',
        location: cols[6] || 'Nairobi Production Facility',
        employmentType: 'permanent',
        status: 'active',
        startDate: cols[8] || new Date().toISOString().slice(0, 10),
        probationEndDate: null,
        contractEndDate: null,
        isDemo: true,
      });
      importedCount++;
    }
    return { importedCount, skippedDuplicatesCount };
  }
  if (path === '/api/integrations/status') {
    return { adapters: [{ key: 'mpesa_daraja', name: 'Safaricom M-Pesa Daraja B2C', category: 'Kenyan Payroll', configured: false, status: 'AWAITING_CREDENTIALS', detail: 'Static browser preview mode.' }] };
  }
  if (path === '/api/peopleos/org-chart') {
    return {
      totalNodes: DEFAULT_EMPS.length,
      nodes: DEFAULT_EMPS.map(e => ({
        id: e.id,
        employeeNumber: e.employeeNumber,
        fullName: `${e.firstName} ${e.lastName}`,
        jobTitle: e.jobTitle,
        departmentName: e.departmentName,
        managerId: e.managerId ?? null,
        managerName: e.managerName ?? null,
        status: e.status,
        directReportsCount: DEFAULT_EMPS.filter(c => c.managerId === e.id).length,
      })),
    };
  }
  if (path.endsWith('/journal')) {
    return { runId: 'run_2026_03', balanced: true, totalDebitsKes: 1200000, totalCreditsKes: 1200000, lines: [{ accountCode: '6100', accountName: 'Salaries & Wages Expense', costCentre: 'CC-MFG-01', debitKes: 1200000, creditKes: 0 }, { accountCode: '2100', accountName: 'Net Salaries Payable', costCentre: 'BALANCE_SHEET', debitKes: 0, creditKes: 1200000 }] };
  }

  if (path === '/api/auth/context') {
    return {
      role: 'hr_admin',
      displayName: 'David Kibet',
      organizationName: 'Rekker Limited',
      canManagePeople: true,
      canApproveLeave: true,
      canViewAudit: true,
      canViewPayroll: true,
      canManageSettings: true,
      isDemo: true,
    };
  }

  if (path === '/api/agents/status' || path === '/api/agent-provider/status') {
    return {
      configured: true,
      provider: 'Rekker 10-Agent Multi-Agent Core',
      model: 'StateGraph Supervisor (10 Specialists Active)',
      message: 'Autonomous workforce intelligence, RAG policy search, and statutory compliance active.',
    };
  }

  if (path === '/api/security/status') {
    return {
      authProvider: 'demo_sandbox',
      mfaVerified: false,
      role: 'hr_admin',
      organizationId: 'rekker-demo',
      encryptionStandard: 'AES-256-GCM',
      rateLimitingActive: true,
      auditLoggingActive: true,
      odpcCompliantMasking: true,
      headersHardened: true,
    };
  }

  if (path === '/api/peopleos/overview') {
    const totalHeadcount = DEFAULT_EMPS.length;
    const activeHeadcount = DEFAULT_EMPS.filter(e => e.status === 'active').length;
    const onLeaveHeadcount = DEFAULT_EMPS.filter(e => e.status === 'on_leave').length;
    const pendingLeaves = DEFAULT_LEAVES.filter(l => l.status === 'pending').length;

    return {
      dataMode: 'LIVE' as const,
      stats: {
        totalEmployees: totalHeadcount,
        activeEmployees: activeHeadcount,
        onLeave: onLeaveHeadcount,
        pendingApprovals: pendingLeaves,
        upcomingMilestones: 2,
      },
      departments: DEFAULT_DEPTS.map(d => ({
        id: d.id,
        name: d.name,
        code: d.code,
        managerEmployeeId: d.managerEmployeeId ?? null,
        managerName: d.managerName ?? null,
        location: d.location,
        headcount: DEFAULT_EMPS.filter(e => e.departmentId === d.id).length,
        budgetedPositions: d.budgetedPositions,
        description: d.description,
      })),
      monthlyHeadcount: [
        { month: 'Oct', headcount: 8 },
        { month: 'Nov', headcount: 8 },
        { month: 'Dec', headcount: 9 },
        { month: 'Jan', headcount: 9 },
        { month: 'Feb', headcount: 10 },
        { month: 'Mar', headcount: totalHeadcount },
      ],
      priorities: [
        {
          id: 'prio-01',
          category: 'approval' as const,
          title: 'KRA Monthly PAYE & Housing Levy Filing Due',
          description: 'Statutory returns for March 2026 must be validated and filed before the 9th on KRA iTax portal.',
          source: 'Payroll Engine',
          href: '/payroll',
        },
        {
          id: 'prio-02',
          category: 'milestone' as const,
          title: '1 Fixed-term Contract Approaching Expiry',
          description: 'Brian Kiprotich (Digital Specialist) contract ends on 2026-04-30. Review renewal decision.',
          source: 'Workforce Records',
          href: '/people',
        },
        {
          id: 'prio-03',
          category: 'milestone' as const,
          title: '1 Employee Ready for 90-Day Probation Assessment',
          description: 'Faith Chebet completes 90-day probation on 2026-04-15. Schedule manager performance signoff.',
          source: 'People Operations',
          href: '/people',
        },
        {
          id: 'prio-04',
          category: 'approval' as const,
          title: `${pendingLeaves} Pending Leave Applications Awaiting Authorization`,
          description: 'Colleagues submitted leave requests requiring supervisor review.',
          source: 'Time Away Hub',
          href: '/approvals',
        },
      ],
    };
  }

  if (path === '/api/departments') {
    return DEFAULT_DEPTS;
  }

  if (path === '/api/employees') {
    if (method === 'POST') {
      const parsed = typeof body === 'string' ? JSON.parse(body) : body;
      const dept = DEFAULT_DEPTS.find(d => d.id === parsed.departmentId);
      const newEmp: MockEmployee = {
        id: `emp-new-${Date.now()}`,
        employeeNumber: `REK-${Math.floor(1000 + Math.random() * 9000)}`,
        firstName: parsed.firstName,
        lastName: parsed.lastName,
        preferredName: parsed.preferredName || null,
        workEmail: parsed.workEmail,
        phone: parsed.phone || null,
        jobTitle: parsed.jobTitle,
        departmentId: parsed.departmentId,
        departmentName: dept?.name || 'Operations',
        managerId: parsed.managerId || null,
        managerName: DEFAULT_EMPS.find(e => e.id === parsed.managerId)?.firstName || null,
        location: parsed.location,
        employmentType: parsed.employmentType,
        status: parsed.status || 'active',
        startDate: parsed.startDate,
        probationEndDate: parsed.probationEndDate || null,
        contractEndDate: parsed.contractEndDate || null,
        isDemo: true,
      };
      DEFAULT_EMPS.unshift(newEmp);
      return newEmp;
    }

    // GET
    return {
      items: DEFAULT_EMPS,
      page: 1,
      pageSize: 50,
      total: DEFAULT_EMPS.length,
      dataMode: 'live',
    };
  }

  if (path.endsWith('/profile-360') && path.startsWith('/api/employees/')) {
    const empId = path.replace('/api/employees/', '').replace('/profile-360', '');
    const emp = DEFAULT_EMPS.find(e => e.id === empId) ?? DEFAULT_EMPS[0]!;
    return {
      employeeId: emp.id,
      employeeNumber: emp.employeeNumber,
      fullName: `${emp.firstName} ${emp.lastName}`,
      jobTitle: emp.jobTitle,
      departmentName: emp.departmentName,
      location: emp.location,
      status: emp.status,
      employmentType: emp.employmentType,
      startDate: emp.startDate,
      probationEndDate: emp.probationEndDate,
      contractEndDate: emp.contractEndDate,
      reportingLine: {
        managerName: emp.managerName,
        directReports: DEFAULT_EMPS.filter(e => e.managerId === emp.id).map(r => ({
          id: r.id,
          name: `${r.firstName} ${r.lastName}`,
          jobTitle: r.jobTitle,
        })),
      },
      statutoryIdentifiers: {
        kraPin: 'A00*****27K',
        nationalId: '****736',
        nssfNo: 'NS-9012834',
        shaNo: 'SHA-7712941',
        encryptionStatus: 'AES-256-GCM Field Protection',
      },
      emergencyContact: {
        name: 'Grace Njoki',
        relationship: 'Spouse / Next of Kin',
        phone: '+2547****911',
      },
      compensationSummary: {
        currency: 'KES',
        payFrequency: 'Monthly',
        paymentChannel: 'M-Pesa B2C / Bank EFT',
        authorizedToView: true,
      },
      skills: ['Kenya Compliance', 'Operational Excellence', 'Team Leadership'],
    };
  }

  if (path.startsWith('/api/employees/')) {
    const empId = path.replace('/api/employees/', '');
    const emp = DEFAULT_EMPS.find(e => e.id === empId);
    if (!emp) return DEFAULT_EMPS[0];
    return emp;
  }

  if (path === '/api/leave-policies') {
    if (method === 'POST') {
      const code = String(parsedBody.name || 'leave')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '')
        .slice(0, 64);
      const created = {
        id: `pol-${Date.now()}`,
        code,
        name: String(parsedBody.name || 'Custom Leave').trim(),
        entitlementDays: Number(parsedBody.entitlementDays) || 0,
        accrualMethod: parsedBody.accrualMethod === 'monthly' ? ('monthly' as const) : ('annual' as const),
        active: true,
      };
      DEFAULT_LEAVE_POLICIES.push(created);
      return created;
    }
    return [...DEFAULT_LEAVE_POLICIES];
  }

  if (path.startsWith('/api/leave-policies/') && method === 'PATCH') {
    const policyId = path.replace('/api/leave-policies/', '');
    const target = DEFAULT_LEAVE_POLICIES.find(p => p.id === policyId);
    if (target) {
      if (parsedBody.name !== undefined) target.name = String(parsedBody.name).trim();
      if (parsedBody.entitlementDays !== undefined) target.entitlementDays = Number(parsedBody.entitlementDays);
      if (parsedBody.accrualMethod !== undefined) target.accrualMethod = parsedBody.accrualMethod;
      if (parsedBody.active !== undefined) target.active = Boolean(parsedBody.active);
    }
    return target ?? DEFAULT_LEAVE_POLICIES[0];
  }

  if (path === '/api/leave-balances') {
    const year = new Date().getUTCFullYear();
    return DEFAULT_EMPS.flatMap(emp =>
      DEFAULT_LEAVE_POLICIES.map(pol => {
        const used = DEFAULT_LEAVES.filter(l => l.employeeId === emp.id && l.leaveType === pol.code && l.status === 'approved').reduce((s, l) => s + l.days, 0);
        const pending = DEFAULT_LEAVES.filter(l => l.employeeId === emp.id && l.leaveType === pol.code && l.status === 'pending').reduce((s, l) => s + l.days, 0);
        const accrued = pol.accrualMethod === 'monthly' ? Math.floor((pol.entitlementDays * (new Date().getUTCMonth() + 1)) / 12) : pol.entitlementDays;
        return {
          employeeId: emp.id,
          employeeName: `${emp.firstName} ${emp.lastName}`,
          leaveType: pol.code,
          leaveTypeName: pol.name,
          year,
          entitlementDays: pol.entitlementDays,
          accruedDays: accrued,
          usedDays: used,
          pendingDays: pending,
          remainingDays: accrued - used - pending,
          accrualMethod: pol.accrualMethod,
          active: pol.active,
        };
      }),
    );
  }

  if (path === '/api/leave-requests') {
    if (method === 'POST') {
      const emp = DEFAULT_EMPS.find(e => e.id === parsedBody.employeeId);
      const newLeave: MockLeaveRequest = {
        id: `leave-${Date.now()}`,
        employeeId: parsedBody.employeeId,
        employeeName: emp ? `${emp.firstName} ${emp.lastName}` : 'Employee',
        leaveType: parsedBody.leaveType,
        startDate: parsedBody.startDate,
        endDate: parsedBody.endDate,
        days: 5,
        reason: parsedBody.reason,
        status: 'pending',
        approverId: null,
        decisionComment: null,
        submittedAt: new Date().toISOString(),
        decidedAt: null,
        isDemo: true,
      };
      DEFAULT_LEAVES.unshift(newLeave);
      return newLeave;
    }
    return DEFAULT_LEAVES;
  }

  if (path.startsWith('/api/leave-requests/') && path.endsWith('/decision')) {
    const leaveId = path.split('/')[3];
    const leave = DEFAULT_LEAVES.find(l => l.id === leaveId);
    if (leave) {
      leave.status = parsedBody.decision === 'approve' ? 'approved' : 'rejected';
      leave.decisionComment = parsedBody.comment || parsedBody.decisionComment || 'Decided by manager';
      leave.decidedAt = new Date().toISOString();
    }
    return leave || DEFAULT_LEAVES[0];
  }

  if (path === '/api/approvals') {
    return DEFAULT_LEAVES.filter(l => l.status === 'pending').map(l => ({
      id: l.id,
      type: 'leave' as const,
      title: `${l.leaveType.toUpperCase()} Leave (${l.days} days)`,
      requester: l.employeeName,
      submittedAt: l.submittedAt,
      href: '/leave',
    }));
  }

  if (path === '/api/audit' || path === '/api/audit-events') {
    return DEFAULT_AUDITS;
  }

  if (path === '/api/expenses') {
    if (method === 'POST') {
      const emp = DEFAULT_EMPS.find(e => e.id === parsedBody.employeeId);
      const item = {
        id: `exp-${Date.now()}`,
        employeeId: parsedBody.employeeId || '10000000-0000-4000-8000-000000000007',
        employeeName: emp ? `${emp.firstName} ${emp.lastName}` : 'David Kibet',
        title: parsedBody.title,
        category: parsedBody.category || 'Operations',
        amountKes: Number(parsedBody.amountKes) || 0,
        incurredDate: parsedBody.incurredDate || new Date().toISOString().slice(0, 10),
        receiptReference: parsedBody.receiptReference || null,
        notes: parsedBody.notes || null,
        status: 'pending',
        approverUserId: null,
        decisionComment: null,
        decidedAt: null,
        createdAt: new Date().toISOString(),
      };
      DEFAULT_EXPENSES.unshift(item);
      return item;
    }
    return { items: DEFAULT_EXPENSES, total: DEFAULT_EXPENSES.length };
  }

  if (path.startsWith('/api/expenses/') && path.endsWith('/decision')) {
    const expId = path.split('/')[3];
    const target = DEFAULT_EXPENSES.find(e => e.id === expId);
    if (target) {
      target.status = parsedBody.decision === 'approve' ? 'approved' : parsedBody.decision === 'reimburse' ? 'reimbursed' : 'rejected';
      target.decidedAt = new Date().toISOString();
    }
    return target ?? DEFAULT_EXPENSES[0];
  }

  if (path === '/api/assets') {
    if (method === 'POST') {
      const emp = DEFAULT_EMPS.find(e => e.id === parsedBody.assignedEmployeeId);
      const asset = {
        id: `asset-${Date.now()}`,
        assetTag: parsedBody.assetTag,
        name: parsedBody.name,
        category: parsedBody.category || 'Laptop & Workstation',
        serialNumber: parsedBody.serialNumber,
        condition: 'good',
        assignedEmployeeId: parsedBody.assignedEmployeeId || null,
        assignedEmployeeName: emp ? `${emp.firstName} ${emp.lastName}` : null,
        assignedDate: parsedBody.assignedEmployeeId ? new Date().toISOString().slice(0, 10) : null,
        returnDueDate: null,
        status: parsedBody.assignedEmployeeId ? 'assigned' : 'available',
        valueKes: Number(parsedBody.valueKes) || 0,
      };
      DEFAULT_ASSETS.unshift(asset);
      return asset;
    }
    return { items: DEFAULT_ASSETS, total: DEFAULT_ASSETS.length };
  }

  if (path.startsWith('/api/assets/') && path.endsWith('/assign')) {
    const assetId = path.split('/')[3];
    const target = DEFAULT_ASSETS.find(a => a.id === assetId);
    if (target) {
      if (parsedBody.action === 'return' || !parsedBody.employeeId) {
        target.assignedEmployeeId = null;
        target.assignedEmployeeName = null;
        target.assignedDate = null;
        target.status = 'available';
      } else {
        const emp = DEFAULT_EMPS.find(e => e.id === parsedBody.employeeId);
        target.assignedEmployeeId = parsedBody.employeeId;
        target.assignedEmployeeName = emp ? `${emp.firstName} ${emp.lastName}` : 'Assigned Employee';
        target.assignedDate = new Date().toISOString().slice(0, 10);
        target.status = 'assigned';
      }
    }
    return target ?? DEFAULT_ASSETS[0];
  }

  if (path === '/api/onboarding/tasks') {
    if (method === 'POST') {
      const emp = DEFAULT_EMPS.find(e => e.id === parsedBody.employeeId);
      const task = {
        id: `task-${Date.now()}`,
        employeeId: parsedBody.employeeId,
        employeeName: emp ? `${emp.firstName} ${emp.lastName}` : 'Teammate',
        workflowType: (parsedBody.workflowType === 'offboarding' ? 'offboarding' : 'onboarding') as 'onboarding' | 'offboarding',
        title: parsedBody.title,
        category: parsedBody.category || 'Compliance',
        dueDate: parsedBody.dueDate || new Date().toISOString().slice(0, 10),
        completed: false,
      };
      DEFAULT_ONBOARDING_TASKS.unshift(task);
      return task;
    }
    return { items: DEFAULT_ONBOARDING_TASKS, total: DEFAULT_ONBOARDING_TASKS.length };
  }

  if (path.startsWith('/api/onboarding/tasks/') && path.endsWith('/toggle')) {
    const taskId = path.split('/')[4];
    const t = DEFAULT_ONBOARDING_TASKS.find(x => x.id === taskId);
    if (t) t.completed = !t.completed;
    return t ?? DEFAULT_ONBOARDING_TASKS[0];
  }

  if (path === '/api/payroll/statutory-configs') {
    if (method === 'POST') {
      const cfg = {
        id: `stat-${Date.now()}`,
        ...parsedBody,
        isActive: Boolean(parsedBody.activate ?? true),
      };
      if (cfg.isActive) DEFAULT_STATUTORY_CONFIGS.forEach(c => (c.isActive = false));
      DEFAULT_STATUTORY_CONFIGS.unshift(cfg);
      return cfg;
    }
    return { items: DEFAULT_STATUTORY_CONFIGS, total: DEFAULT_STATUTORY_CONFIGS.length };
  }

  if (path.startsWith('/api/payroll/statutory-configs/') && path.endsWith('/activate')) {
    const id = path.split('/')[4];
    DEFAULT_STATUTORY_CONFIGS.forEach(c => (c.isActive = c.id === id));
    return DEFAULT_STATUTORY_CONFIGS.find(c => c.id === id) ?? DEFAULT_STATUTORY_CONFIGS[0];
  }

  const calcKenyaFallback = (grossSalary: number) => {
    const cfg = DEFAULT_STATUTORY_CONFIGS.find(c => c.isActive) ?? DEFAULT_STATUTORY_CONFIGS[0]!;
    const t1 = Math.min(grossSalary, cfg.nssf.tier1UpperLimitKes) * cfg.nssf.rate;
    const t2 = Math.max(0, Math.min(grossSalary, cfg.nssf.tier2UpperLimitKes) - cfg.nssf.tier1UpperLimitKes) * cfg.nssf.rate;
    const totalNssf = Math.round(t1 + t2);
    const sha = Math.max(cfg.shif.minimumKes, Math.round(grossSalary * cfg.shif.rate));
    const housingLevy = Math.round(grossSalary * cfg.housingLevy.employeeRate);
    const taxablePay = Math.max(0, grossSalary - totalNssf);
    let rem = taxablePay;
    let tax = 0;
    for (const band of cfg.paye.bands) {
      if (rem <= 0) break;
      const slice = band.limitKes === null ? rem : Math.min(rem, band.limitKes);
      tax += slice * band.rate;
      rem -= slice;
    }
    const payeBeforeRelief = Math.round(tax);
    const personalRelief = grossSalary > 0 ? cfg.paye.personalReliefKes : 0;
    const insuranceRelief = Math.min(Math.round(sha * cfg.shif.insuranceReliefRate), cfg.shif.insuranceReliefMaxKes);
    const netPaye = Math.max(0, payeBeforeRelief - personalRelief - insuranceRelief);
    const totalDeductions = totalNssf + sha + housingLevy + netPaye;
    return {
      grossPay: grossSalary,
      nssfTier1: Math.round(t1),
      nssfTier2: Math.round(t2),
      totalNssf,
      sha,
      housingLevy,
      taxablePay,
      payeBeforeRelief,
      personalRelief,
      insuranceRelief,
      netPaye,
      totalDeductions,
      netPay: Math.max(0, Math.round(grossSalary - totalDeductions)),
    };
  };

const FALLBACK_PAYROLL_RUNS: Array<any> = [
  { id: 'run_2026_03', period: 'March 2026', totalGross: 2158000, totalNet: 1545200, totalPaye: 412450, totalNssf: 43200, totalSha: 59345, totalHousingLevy: 32370, status: 'reviewed', approvedBy: null, approvedAt: null },
  { id: 'run_2026_02', period: 'February 2026', totalGross: 2113000, totalNet: 1514200, totalPaye: 401450, totalNssf: 43200, totalSha: 58107, totalHousingLevy: 31695, status: 'disbursed', approvedBy: 'Dennis Otieno', approvedAt: '2026-02-25T14:00:00Z' },
];

  if (path === '/api/payroll/runs') {
    if (method === 'POST') {
      const period = String(parsedBody.period || 'April 2026').trim();
      const newRun = {
        id: `run_${Date.now()}`,
        period,
        totalGross: 2158000,
        totalNet: 1545200,
        totalPaye: 412450,
        totalNssf: 43200,
        totalSha: 59345,
        totalHousingLevy: 32370,
        status: 'reviewed',
        approvedBy: null,
        approvedAt: null,
      };
      FALLBACK_PAYROLL_RUNS.unshift(newRun);
      return { run: newRun, items: [] };
    }
    return {
      runs: FALLBACK_PAYROLL_RUNS,
      mpesaLiveConfigured: false,
    };
  }

  if (path.startsWith('/api/payroll/runs/') && path.endsWith('/items')) {
    const runId = path.split('/')[4];
    const active = FALLBACK_PAYROLL_RUNS.find(r => r.id === runId) ?? FALLBACK_PAYROLL_RUNS[0]!;
    const items = DEFAULT_EMPS.map((emp, idx) => {
      const gross = [360000, 210000, 275000, 145000, 290000, 125000, 345000, 113000, 245000, 95000][idx] ?? 150000;
      return {
        id: `item-${emp.employeeNumber}`,
        period: active.period,
        employeeId: emp.id,
        employeeName: `${emp.firstName} ${emp.lastName}`,
        departmentName: emp.departmentName,
        kraPinMasked: 'DEM*****01',
        ...calcKenyaFallback(gross),
      };
    });
    return { run: active, items };
  }

  if (path === '/api/payroll/calculate') {
    return calcKenyaFallback(Number(parsedBody.grossSalary) || 180000);
  }

  if (path.startsWith('/api/payroll/p9a/')) {
    const empId = path.replace('/api/payroll/p9a/', '');
    const emp = DEFAULT_EMPS.find(e => e.id === empId) ?? DEFAULT_EMPS[0]!;
    const monthly = calcKenyaFallback(180000);
    const months = ['January', 'February', 'March'].map(m => ({
      month: m,
      grossPay: monthly.grossPay,
      nssfContribution: monthly.totalNssf,
      chargeablePay: monthly.taxablePay,
      payeDeducted: monthly.netPaye,
    }));
    return {
      formType: 'KRA Form P9A (Employee Tax Deduction Card)',
      employeeName: `${emp.firstName} ${emp.lastName}`,
      employeePinMasked: 'DEM*****07',
      statutoryConfigName: DEFAULT_STATUTORY_CONFIGS[0]!.name,
      months,
      totals: {
        grossPay: monthly.grossPay * 3,
        nssf: monthly.totalNssf * 3,
        shif: monthly.sha * 3,
        housingLevy: monthly.housingLevy * 3,
        taxablePay: monthly.taxablePay * 3,
        payeDeducted: monthly.netPaye * 3,
      },
    };
  }

  if (path === '/api/payroll/approve') {
    return {
      message: 'Payroll run approved and signed off for M-Pesa / bank disbursement.',
      run: { id: 'run_2026_03', period: parsedBody.period || 'March 2026', status: 'approved', approvedBy: 'David Kibet (hr_admin)', approvedAt: new Date().toISOString() },
    };
  }

  if (path.startsWith('/api/payroll/runs/') && path.endsWith('/disburse-mpesa')) {
    return {
      runId: path.split('/')[4],
      period: 'March 2026',
      providerMode: 'SANDBOX_SIMULATION',
      totalEmployeesPaid: DEFAULT_EMPS.length,
      totalDisbursedKes: 1545200,
      results: [],
    };
  }

  if (path === '/api/payroll/anomalies') {
    return {
      auditedRun: 'March 2026',
      anomalies: [
        { type: 'STATUTORY_CAP_CHECK', severity: 'low', description: 'Verified employee NSSF caps against active statutory schedule.', status: 'passed' },
        { type: 'HOUSING_LEVY_CHECK', severity: 'low', description: 'Affordable Housing Levy (1.5% + 1.5%) reconciled.', status: 'passed' },
      ],
    };
  }

  if (path === '/api/recruitment/requisitions') {
    const items = [
      { id: 'req_01', title: 'Senior Formulation & Production Chemist', location: 'Nairobi Production Facility', status: 'published', minSalary: 180000, maxSalary: 240000, applicantsCount: 14, description: 'Lead automated formulation, KEBS GMP compliance, and filling line quality audits.' },
      { id: 'req_02', title: 'Regional Supply Chain Dispatch Coordinator', location: 'Nairobi Central Hub', status: 'published', minSalary: 130000, maxSalary: 170000, applicantsCount: 22, description: 'Coordinate distributor fulfillment logistics and fleet telemetry across Kenya.' },
    ];
    return { items, total: items.length };
  }

  if (path === '/api/recruitment/candidates') {
    const items = [
      { id: 'cand_01', requisitionId: 'req_01', jobTitle: 'Senior Formulation & Production Chemist', fullName: "Peter Ndung'u", stage: 'interview', experienceYears: 6, matchScore: 94, skillsSummary: 'PLC automation, formulation chemistry, KEBS GMP, ISO 22000' },
      { id: 'cand_02', requisitionId: 'req_02', jobTitle: 'Regional Supply Chain Dispatch Coordinator', fullName: 'Evans Kiprono', stage: 'screening', experienceYears: 4, matchScore: 88, skillsSummary: 'Fleet GPS dispatch, multi-county route monitoring' },
    ];
    return { items, total: items.length };
  }

  if (path === '/api/recruitment/interviews') {
    return {
      items: [
        { id: 'int_01', candidateName: "Peter Ndung'u", jobTitle: 'Senior Formulation & Production Chemist', interviewerName: 'Achieng Odhiambo', scheduledAt: '2026-03-12T10:00:00Z', mode: 'onsite', status: 'completed', overallRating: 4.5, feedbackSummary: 'Strong SCADA/PLC and formulation safety record.' },
      ],
      total: 1,
    };
  }

  if (path === '/api/recruitment/match') {
    return {
      rankings: [
        { candidateId: 'cand_01', fullName: "Peter Ndung'u", overallMatchPct: 94, semanticSkillsScorePct: 92, experienceAlignmentPct: 98, matchedJobCriteria: ['plc', 'formulation', 'iso', 'gmp'] },
        { candidateId: 'cand_02', fullName: 'Evans Kiprono', overallMatchPct: 68, semanticSkillsScorePct: 62, experienceAlignmentPct: 80, matchedJobCriteria: ['logistics'] },
      ],
    };
  }

  if (path === '/api/attendance' || path === '/api/attendance/records') {
    return {
      items: [
        { id: 'att_01', employeeName: 'Achieng Odhiambo', shift: 'Morning (06:00 - 14:00)', clockIn: '05:52', clockOut: '14:15', status: 'on_time', anomalyFlag: null },
        { id: 'att_02', employeeName: 'Mwangi Kariuki', shift: 'Morning (06:00 - 14:00)', clockIn: '05:58', clockOut: '16:30', status: 'overtime', anomalyFlag: null },
        { id: 'att_03', employeeName: 'Juma Omondi', shift: 'Day (08:30 - 17:00)', clockIn: '08:48', clockOut: null, status: 'late', anomalyFlag: 'Late arrival: 18 minutes past shift start' },
      ],
      total: 3,
    };
  }

  if (path === '/api/attendance/corrections') {
    return {
      items: [
        { id: 'corr_01', employeeName: 'Juma Omondi', date: '2026-03-06', requestedClockIn: '08:30', requestedClockOut: '17:05', reason: 'Gate biometric scanner delay at Nairobi Central Hub.', status: 'pending' },
      ],
      total: 1,
    };
  }

  if (path === '/api/attendance/anomalies') {
    return { anomalies: [{ employeeName: 'Juma Omondi', type: 'SHIFT_DEVIATION', explanation: 'Late arrival: 18 minutes past shift start' }] };
  }

  if (path === '/api/performance/goals') {
    return {
      items: [
        { id: 'goal_01', employeeName: 'Achieng Odhiambo', title: 'Achieve 99.8% Formulation Batch Consistency', description: 'Zero batch variations across Nairobi filling lines.', category: 'Quality', targetDate: '2026-06-30', progress: 85, status: 'in_progress' },
        { id: 'goal_02', employeeName: 'Juma Omondi', title: 'Reduce Transit Lead Times by 18%', description: 'Automated route dispatching.', category: 'Operational', targetDate: '2026-05-15', progress: 70, status: 'in_progress' },
      ],
      total: 2,
    };
  }

  if (path === '/api/learning/courses') {
    return {
      items: [
        { id: 'course_01', title: 'DOSHS Plant Safety, Chemical Handling & Filling Line Operations', category: 'Health & Safety', durationHours: 6, provider: 'DOSHS Accredited Academy', status: 'mandatory', enrolledCount: 10, completedCount: 9 },
        { id: 'course_02', title: 'KEBS Consumer Goods Batch Hygiene & Quality Standards', category: 'Quality & GMP', durationHours: 4, provider: 'KEBS Institute', status: 'mandatory', enrolledCount: 10, completedCount: 8 },
        { id: 'course_03', title: 'Kenya Data Protection Act 2019 Privacy', category: 'Legal & Compliance', durationHours: 3, provider: 'ODPC Portal', status: 'mandatory', enrolledCount: 10, completedCount: 10 },
      ],
      total: 3,
    };
  }

  if (path === '/api/documents') {
    return {
      items: [
        { id: 'doc-01', name: 'Executive Employment Agreement - Plant Operations.pdf', category: 'Contract', employeeName: 'Achieng Odhiambo', expiryDate: null, status: 'valid' },
        { id: 'doc-02', name: 'Fixed-Term Commercial Specialist Contract.pdf', category: 'Contract', employeeName: 'Brian Kiprotich', expiryDate: '2026-04-30', status: 'expiring_soon' },
        { id: 'doc-03', name: 'KRA P9 Certificate 2025.pdf', category: 'Tax & KRA', employeeName: 'David Kibet', expiryDate: '2026-12-31', status: 'valid' },
      ],
      total: 3,
    };
  }

  if (path === '/api/documents/expiring') {
    return { totalExpiring: 1, contracts: [{ documentId: 'doc-02', employee: 'Brian Kiprotich', expiryDate: '2026-04-30' }] };
  }

  if (path.startsWith('/api/documents/templates/employment-contract/')) {
    return { content: 'REPUBLIC OF KENYA - EMPLOYMENT ACT 2007 (§10 WRITTEN PARTICULARS)\nEmployer: Rekker Limited\nCompliance: Statutory PAYE, NSSF, SHIF & ODPC 2019 privacy governed.' };
  }

  if (path === '/api/ai/chat') {
    return {
      id: `resp_${Date.now()}`,
      agentRole: parsedBody.agentRole || 'supervisor',
      response: 'Processed via Rekker Static Fallback Agent Hub. Connect Express API server for full Python ML tool calling & persistent audit runs.',
      toolsCalled: ['static_fallback_snapshot'],
      provider: 'Rekker Browser Fallback',
      model: 'offline-resilient-v2',
      latencyMs: 12,
    };
  }

  if (path === '/api/ai/telemetry') {
    return {
      totalRuns: 4,
      totalPromptTokens: 1240,
      totalCompletionTokens: 890,
      totalEstimatedCostUsd: 0.00072,
      averageLatencyMs: 142,
      openAiConfigured: false,
      recentRuns: [],
    };
  }

  if (path === '/api/ai/approvals') {
    return { items: [], total: 0 };
  }

  if (path === '/api/ai/agents') {
    return {
      total: 11,
      agents: [
        { id: 'supervisor', name: 'Rekker AI Supervisor' },
        { id: 'copilot', name: 'HR Copilot Agent' },
        { id: 'recruitment', name: 'Recruitment Intelligence Agent' },
        { id: 'onboarding', name: 'Onboarding Agent' },
        { id: 'payroll', name: 'Payroll Intelligence Agent' },
        { id: 'attendance', name: 'Attendance Intelligence Agent' },
        { id: 'performance', name: 'Performance Intelligence Agent' },
        { id: 'retention', name: 'Employee Retention Agent' },
        { id: 'learning', name: 'Learning & Development Agent' },
        { id: 'compliance', name: 'Compliance Monitoring Agent' },
        { id: 'executive', name: 'Executive Intelligence Agent' },
      ],
    };
  }

  if (path === '/api/readyz') {
    return {
      status: 'static_preview',
      authMode: 'demo',
      environment: 'browser_static_preview',
      critical: {
        configuration: 'static_preview',
        database: 'unavailable_in_static_preview',
        encryption: 'unavailable_in_static_preview',
      },
      optionalDependencies: {
        mlService: 'unavailable',
        openAiLlm: 'awaiting_credentials',
        mpesaDaraja: 'awaiting_credentials',
      },
      timestamp: new Date().toISOString(),
    };
  }

  if (path === '/api/admin/diagnostics') {
    return {
      checkedAt: new Date().toISOString(),
      startedAt: new Date().toISOString(),
      correlationId: 'static-preview',
      application: {
        name: 'Rekker PeopleOS (Static Preview Mode)',
        version: '0.1.0',
        nodeVersion: 'browser',
        uptimeSeconds: 0,
        environment: 'static_preview',
        isProduction: false,
      },
      subsystems: [
        { id: 'api_server', name: 'Express 5 Core API & Correlation Layer', status: 'Disconnected (Browser Static Mode)', healthy: false, detail: 'Backend API unreachable; displaying static preview fixtures.' },
        { id: 'postgresql_db', name: 'PostgreSQL & Drizzle ORM', status: 'Unavailable', healthy: false, latencyMs: null, detail: 'No database connection in browser static preview.' },
        { id: 'authentication', name: 'Identity & Access Control', status: 'Demo Mode (Browser Preview)', healthy: false, detail: 'Connect backend API and Clerk credentials for verified sessions.' },
      ],
      integrations: [
        { id: 'clerk', provider: 'Clerk Auth', purpose: 'Enterprise SSO & MFA', owningModule: 'Authentication', environment: 'static_preview', credentialConfigured: false, connectivityState: 'Awaiting Credentials', setupNote: 'Deploy Express API with Clerk keys.' },
        { id: 'mpesa_daraja', provider: 'Safaricom Daraja B2C', purpose: 'Approved Kenya payroll salary disbursement', owningModule: 'Payroll', environment: 'sandbox', credentialConfigured: false, connectivityState: 'Awaiting Credentials', setupNote: 'Configure MPESA_* environment variables on API server.' },
        { id: 'rekker_external_web', provider: 'rekker.co.ke & shop.rekker.co.ke', purpose: 'Launched corporate website & e-commerce storefront', owningModule: 'External Boundary', environment: 'production', credentialConfigured: false, connectivityState: 'Linked Externally (Not Duplicated)', setupNote: 'Authoritative externally.' },
      ],
      configWarnings: ['Running in static browser preview fallback because backend API server is unreachable.'],
      configErrors: [],
    };
  }

  if (path.startsWith('/api/ml/')) {
    return {
      engine: 'Static Browser Fallback (Connect API Server + Python ML Engine for live XGBoost / Scikit-learn inference)',
      analyticsMode: 'STATIC_VERCEL_FALLBACK_DEMO',
      disclaimer: 'Browser-only static fallback mode active; connect the Express + Python ML service for live trained model execution.',
      models: {},
    };
  }

  return { ok: true };
}

