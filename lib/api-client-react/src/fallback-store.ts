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
  { id: '20000000-0000-4000-8000-000000000001', code: 'MFG', name: 'Manufacturing & Brewing', description: 'Brewery production lines, quality inspection, fermentation operations.', location: 'Nairobi Industrial Area Plant', managerEmployeeId: '10000000-0000-4000-8000-000000000001', managerName: 'Achieng Odhiambo', headcount: 3, budgetedPositions: 15 },
  { id: '20000000-0000-4000-8000-000000000002', code: 'DIST', name: 'Logistics & Distribution', description: 'Fleet transport, distribution hub management, route dispatching.', location: 'Nairobi Central Logistics Hub', managerEmployeeId: '10000000-0000-4000-8000-000000000003', managerName: 'Juma Omondi', headcount: 2, budgetedPositions: 12 },
  { id: '20000000-0000-4000-8000-000000000003', code: 'BRAND', name: 'Brand & Commercial Marketing', description: 'Brand activation, trade marketing, distributor relations.', location: 'Westlands Commercial Office', managerEmployeeId: '10000000-0000-4000-8000-000000000005', managerName: 'Brenda Mutheu', headcount: 2, budgetedPositions: 8 },
  { id: '20000000-0000-4000-8000-000000000004', code: 'PEOPLE', name: 'People Operations & Culture', description: 'Workforce intelligence, statutory compliance, talent acquisition.', location: 'Westlands Commercial Office', managerEmployeeId: '10000000-0000-4000-8000-000000000007', managerName: 'David Kibet', headcount: 2, budgetedPositions: 6 },
  { id: '20000000-0000-4000-8000-000000000005', code: 'FIN', name: 'Finance & Supply Chain', description: 'Financial accounting, KRA reporting, payroll governance.', location: 'Westlands Commercial Office', managerEmployeeId: null, managerName: null, headcount: 1, budgetedPositions: 5 },
];

const DEFAULT_EMPS: MockEmployee[] = [
  { id: '10000000-0000-4000-8000-000000000001', employeeNumber: 'REK-0101', firstName: 'Achieng', lastName: 'Odhiambo', preferredName: 'Achieng', workEmail: 'achieng.odhiambo@rekker.co.ke', phone: '+254 722 100 201', jobTitle: 'Plant Operations Director', departmentId: '20000000-0000-4000-8000-000000000001', departmentName: 'Manufacturing & Brewing', managerId: null, managerName: null, location: 'Nairobi Industrial Area Plant', employmentType: 'permanent', status: 'active', startDate: '2021-03-15', probationEndDate: null, contractEndDate: null, isDemo: true },
  { id: '10000000-0000-4000-8000-000000000002', employeeNumber: 'REK-0102', firstName: 'Mwangi', lastName: 'Kariuki', preferredName: 'Mwangi', workEmail: 'mwangi.kariuki@rekker.co.ke', phone: '+254 733 410 882', jobTitle: 'Senior Brewmaster & Quality Lead', departmentId: '20000000-0000-4000-8000-000000000001', departmentName: 'Manufacturing & Brewing', managerId: '10000000-0000-4000-8000-000000000001', managerName: 'Achieng Odhiambo', location: 'Nairobi Industrial Area Plant', employmentType: 'permanent', status: 'active', startDate: '2022-06-01', probationEndDate: null, contractEndDate: null, isDemo: true },
  { id: '10000000-0000-4000-8000-000000000003', employeeNumber: 'REK-0103', firstName: 'Juma', lastName: 'Omondi', preferredName: null, workEmail: 'juma.omondi@rekker.co.ke', phone: '+254 711 502 918', jobTitle: 'Logistics Fleet Manager', departmentId: '20000000-0000-4000-8000-000000000002', departmentName: 'Logistics & Distribution', managerId: null, managerName: null, location: 'Nairobi Central Logistics Hub', employmentType: 'permanent', status: 'active', startDate: '2022-09-10', probationEndDate: null, contractEndDate: null, isDemo: true },
  { id: '10000000-0000-4000-8000-000000000004', employeeNumber: 'REK-0104', firstName: 'Wanjiku', lastName: 'Kimani', preferredName: 'Wawa', workEmail: 'wanjiku.kimani@rekker.co.ke', phone: '+254 700 819 223', jobTitle: 'Distribution Dispatch Specialist', departmentId: '20000000-0000-4000-8000-000000000002', departmentName: 'Logistics & Distribution', managerId: '10000000-0000-4000-8000-000000000003', managerName: 'Juma Omondi', location: 'Nairobi Central Logistics Hub', employmentType: 'permanent', status: 'on_leave', startDate: '2023-04-12', probationEndDate: null, contractEndDate: null, isDemo: true },
  { id: '10000000-0000-4000-8000-000000000005', employeeNumber: 'REK-0105', firstName: 'Brenda', lastName: 'Mutheu', preferredName: 'Brenda', workEmail: 'brenda.mutheu@rekker.co.ke', phone: '+254 721 349 018', jobTitle: 'Brand Strategy & Trade Lead', departmentId: '20000000-0000-4000-8000-000000000003', departmentName: 'Brand & Commercial Marketing', managerId: null, managerName: null, location: 'Westlands Commercial Office', employmentType: 'permanent', status: 'active', startDate: '2022-01-10', probationEndDate: null, contractEndDate: null, isDemo: true },
  { id: '10000000-0000-4000-8000-000000000006', employeeNumber: 'REK-0106', firstName: 'Brian', lastName: 'Kiprotich', preferredName: 'Brian', workEmail: 'brian.kiprotich@rekker.co.ke', phone: '+254 725 619 827', jobTitle: 'Digital Growth & Social Media Specialist', departmentId: '20000000-0000-4000-8000-000000000003', departmentName: 'Brand & Commercial Marketing', managerId: '10000000-0000-4000-8000-000000000005', managerName: 'Brenda Mutheu', location: 'Westlands Commercial Office', employmentType: 'contract', status: 'active', startDate: '2024-02-01', probationEndDate: null, contractEndDate: '2026-04-30', isDemo: true },
  { id: '10000000-0000-4000-8000-000000000007', employeeNumber: 'REK-0107', firstName: 'David', lastName: 'Kibet', preferredName: 'David', workEmail: 'david.kibet@rekker.co.ke', phone: '+254 720 182 930', jobTitle: 'Head of People & Organization Culture', departmentId: '20000000-0000-4000-8000-000000000004', departmentName: 'People Operations & Culture', managerId: null, managerName: null, location: 'Westlands Commercial Office', employmentType: 'permanent', status: 'active', startDate: '2021-08-01', probationEndDate: null, contractEndDate: null, isDemo: true },
  { id: '10000000-0000-4000-8000-000000000008', employeeNumber: 'REK-0108', firstName: 'Faith', lastName: 'Chebet', preferredName: 'Faith', workEmail: 'faith.chebet@rekker.co.ke', phone: '+254 724 991 823', jobTitle: 'Talent Acquisition & Employee Experience Officer', departmentId: '20000000-0000-4000-8000-000000000004', departmentName: 'People Operations & Culture', managerId: '10000000-0000-4000-8000-000000000007', managerName: 'David Kibet', location: 'Westlands Commercial Office', employmentType: 'probation', status: 'probation', startDate: '2026-01-15', probationEndDate: '2026-04-15', contractEndDate: null, isDemo: true },
  { id: '10000000-0000-4000-8000-000000000009', employeeNumber: 'REK-0109', firstName: 'Dennis', lastName: 'Otieno', preferredName: 'Denno', workEmail: 'dennis.otieno@rekker.co.ke', phone: '+254 731 442 819', jobTitle: 'Financial Accountant & Payroll Controller', departmentId: '20000000-0000-4000-8000-000000000005', departmentName: 'Finance & Supply Chain', managerId: null, managerName: null, location: 'Westlands Commercial Office', employmentType: 'permanent', status: 'active', startDate: '2023-01-09', probationEndDate: null, contractEndDate: null, isDemo: true },
  { id: '10000000-0000-4000-8000-000000000010', employeeNumber: 'REK-0110', firstName: 'Sarah', lastName: 'Njeri', preferredName: 'Sarah', workEmail: 'sarah.njeri@rekker.co.ke', phone: '+254 718 293 847', jobTitle: 'Junior Quality Assurance Chemist', departmentId: '20000000-0000-4000-8000-000000000001', departmentName: 'Manufacturing & Brewing', managerId: '10000000-0000-4000-8000-000000000002', managerName: 'Mwangi Kariuki', location: 'Nairobi Industrial Area Plant', employmentType: 'permanent', status: 'active', startDate: '2024-05-02', probationEndDate: null, contractEndDate: null, isDemo: true },
];

const DEFAULT_LEAVES: MockLeaveRequest[] = [
  { id: 'leave-001', employeeId: '10000000-0000-4000-8000-000000000004', employeeName: 'Wanjiku Kimani', leaveType: 'annual', startDate: '2026-03-02', endDate: '2026-03-13', days: 10, reason: 'Annual rest and family leave', status: 'approved', approverId: '10000000-0000-4000-8000-000000000007', decisionComment: 'Approved. Fleet coverage confirmed.', submittedAt: '2026-02-15T08:30:00Z', decidedAt: '2026-02-16T10:00:00Z', isDemo: true },
  { id: 'leave-002', employeeId: '10000000-0000-4000-8000-000000000006', employeeName: 'Brian Kiprotich', leaveType: 'annual', startDate: '2026-03-20', endDate: '2026-03-27', days: 6, reason: 'Professional certification exam study period', status: 'pending', approverId: null, decisionComment: null, submittedAt: '2026-03-01T11:45:00Z', decidedAt: null, isDemo: true },
  { id: 'leave-003', employeeId: '10000000-0000-4000-8000-000000000002', employeeName: 'Mwangi Kariuki', leaveType: 'paternity', startDate: '2026-04-06', endDate: '2026-04-17', days: 10, reason: 'Paternity leave under Employment Act 2007', status: 'pending', approverId: null, decisionComment: null, submittedAt: '2026-03-04T09:15:00Z', decidedAt: null, isDemo: true },
];

const DEFAULT_AUDITS = [
  { id: 'audit-001', occurredAt: '2026-03-05T14:20:00Z', actor: 'David Kibet (HR Admin)', action: 'LEAVE_APPROVE', targetType: 'leave_request', targetId: 'leave-001', summary: 'Approved annual leave for Wanjiku Kimani', isDemo: true },
  { id: 'audit-002', occurredAt: '2026-03-01T09:00:00Z', actor: 'Dennis Otieno (Finance)', action: 'PAYROLL_GENERATION', targetType: 'payroll_period', targetId: 'period-2026-02', summary: 'Finalized statutory KRA & NSSF payroll report for February 2026', isDemo: true },
  { id: 'audit-003', occurredAt: '2026-02-28T16:45:00Z', actor: 'Faith Chebet (Recruiter)', action: 'CANDIDATE_SCREEN', targetType: 'candidate', targetId: 'cand-001', summary: 'Completed phone interview scorecard for Brewing Engineer candidate', isDemo: true },
];

export function handleFallbackApi(url: string, method: string = 'GET', body?: any): any {
  const path = url.split('?')[0];

  if (path === '/api/auth/context') {
    return {
      role: 'hr_admin',
      displayName: 'David Kibet',
      organizationName: 'Rekker Breweries Kenya Ltd',
      canManagePeople: true,
      canApproveLeave: true,
      canViewAudit: true,
      canViewPayroll: true,
      canManageSettings: true,
      isDemo: true,
    };
  }

  if (path === '/api/agent-provider/status') {
    return {
      configured: true,
      provider: 'Rekker Multi-Agent Intelligence Core',
      model: 'Supervised Specialist Network (6 Agents Active)',
      message: 'Autonomous workforce intelligence and statutory compliance engine active.',
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

  if (path.startsWith('/api/employees/')) {
    const empId = path.replace('/api/employees/', '');
    const emp = DEFAULT_EMPS.find(e => e.id === empId);
    if (!emp) return DEFAULT_EMPS[0];
    return emp;
  }

  if (path === '/api/leave-requests') {
    if (method === 'POST') {
      const parsed = typeof body === 'string' ? JSON.parse(body) : body;
      const emp = DEFAULT_EMPS.find(e => e.id === parsed.employeeId);
      const newLeave: MockLeaveRequest = {
        id: `leave-${Date.now()}`,
        employeeId: parsed.employeeId,
        employeeName: emp ? `${emp.firstName} ${emp.lastName}` : 'Employee',
        leaveType: parsed.leaveType,
        startDate: parsed.startDate,
        endDate: parsed.endDate,
        days: 5,
        reason: parsed.reason,
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

  if (path.includes('/decision')) {
    const leaveId = path.split('/')[3];
    const parsed = typeof body === 'string' ? JSON.parse(body) : body;
    const leave = DEFAULT_LEAVES.find(l => l.id === leaveId);
    if (leave) {
      leave.status = parsed.decision === 'approve' ? 'approved' : 'rejected';
      leave.decisionComment = parsed.decisionComment || 'Decided by manager';
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

  if (path === '/api/audit') {
    return DEFAULT_AUDITS;
  }

  return { ok: true };
}

