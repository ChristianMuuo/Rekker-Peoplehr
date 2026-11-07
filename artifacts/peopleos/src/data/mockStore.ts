// REKKER PeopleOS Enterprise Data Store & Business Engine
// Kenya-localized HR, Payroll, ATS, Attendance, Performance & Multi-Agent Intelligence

export interface Department {
  id: string;
  code: string;
  name: string;
  description: string;
  location: string;
  managerEmployeeId: string | null;
  budgetedPositions: number;
}

export interface Employee {
  id: string;
  employeeNumber: string;
  firstName: string;
  lastName: string;
  preferredName?: string | null;
  workEmail: string;
  phone?: string | null;
  nationalId: string;
  kraPin: string;
  nssfNo: string;
  shaNo: string;
  jobTitle: string;
  departmentId: string;
  managerId: string | null;
  location: string;
  employmentType: 'permanent' | 'contract' | 'probation' | 'casual';
  status: 'active' | 'on_leave' | 'probation' | 'terminated';
  baseSalary: number; // KES
  allowances: number; // KES
  startDate: string;
  probationEndDate?: string | null;
  contractEndDate?: string | null;
  emergencyContact: {
    name: string;
    relationship: string;
    phone: string;
  };
  skills: string[];
}

export interface LeaveRequest {
  id: string;
  employeeId: string;
  employeeName?: string;
  leaveType: 'annual' | 'sick' | 'maternity' | 'paternity' | 'compassionate' | 'unpaid';
  startDate: string;
  endDate: string;
  days: number;
  reason: string;
  status: 'pending' | 'approved' | 'rejected' | 'cancelled';
  submittedAt: string;
  decidedAt?: string | null;
  approverComment?: string | null;
}

export interface AuditEvent {
  id: string;
  actor: string;
  action: string;
  targetType: string;
  targetId: string;
  summary: string;
  occurredAt: string;
}

export interface JobRequisition {
  id: string;
  title: string;
  departmentId: string;
  location: string;
  employmentType: string;
  status: 'draft' | 'published' | 'closed';
  minSalary: number;
  maxSalary: number;
  openings: number;
  applicantsCount: number;
  description: string;
  requirements: string[];
  createdAt: string;
}

export interface Candidate {
  id: string;
  requisitionId: string;
  jobTitle: string;
  fullName: string;
  email: string;
  phone: string;
  stage: 'applied' | 'screening' | 'interview' | 'offer' | 'hired' | 'rejected';
  experienceYears: number;
  matchScore: number; // 0-100%
  skillsSummary: string;
  appliedDate: string;
  notes?: string;
}

export interface AttendanceRecord {
  id: string;
  employeeId: string;
  employeeName: string;
  departmentId: string;
  date: string;
  shift: 'Morning (06:00 - 14:00)' | 'Day (08:30 - 17:00)' | 'Night (14:00 - 22:00)';
  clockIn: string | null;
  clockOut: string | null;
  status: 'on_time' | 'late' | 'early_departure' | 'absent' | 'overtime';
  overtimeHours: number;
  anomalyFlag?: string | null;
}

export interface PayrollRecord {
  id: string;
  employeeId: string;
  employeeName: string;
  departmentName: string;
  period: string; // e.g., "March 2026"
  baseSalary: number;
  allowances: number;
  overtimePay: number;
  grossPay: number;
  nssfTier1: number;
  nssfTier2: number;
  totalNssf: number;
  taxablePay: number;
  payeBeforeRelief: number;
  personalRelief: number;
  insuranceRelief: number;
  netPaye: number;
  sha: number;
  housingLevy: number;
  totalDeductions: number;
  netPay: number;
  status: 'draft' | 'reviewed' | 'approved' | 'paid';
}

export interface Goal {
  id: string;
  employeeId: string;
  employeeName: string;
  title: string;
  description: string;
  category: 'Strategic' | 'Operational' | 'Learning' | 'Quality';
  targetDate: string;
  progress: number; // 0 - 100
  status: 'in_progress' | 'completed' | 'behind';
}

export interface TrainingCourse {
  id: string;
  title: string;
  category: string;
  durationHours: number;
  provider: string;
  enrolledCount: number;
  completedCount: number;
  status: 'mandatory' | 'elective';
}

// Kenya Statutory Calculation Engine
export function calculateKenyaPayroll(grossSalary: number, allowances: number = 0, overtime: number = 0) {
  const totalGross = grossSalary + allowances + overtime;

  // NSSF (Versioned 2024/2026 rates)
  // Tier 1: 6% of lower limit up to KES 8,000 = KES 480
  const nssfTier1 = Math.min(totalGross, 8000) * 0.06;
  // Tier 2: 6% of salary between KES 8,001 and KES 72,000 (cap KES 64,000 band = KES 3,840)
  const tier2Salary = Math.max(0, Math.min(totalGross, 72000) - 8000);
  const nssfTier2 = tier2Salary * 0.06;
  const totalNssf = Math.round(nssfTier1 + nssfTier2);

  // SHA (Social Health Authority - replaces NHIF): 2.75% of Gross, min KES 300
  const sha = Math.max(300, Math.round(totalGross * 0.0275));

  // Affordable Housing Levy (AHL): 1.5% of Gross
  const housingLevy = Math.round(totalGross * 0.015);

  // Taxable Pay
  const taxablePay = Math.max(0, totalGross - totalNssf);

  // PAYE Tax Bands (Kenya Finance Act 2023/2024/2026)
  // 1. First KES 24,000 @ 10% = 2,400
  // 2. Next KES 8,333 @ 25% = 2,083.25
  // 3. Next KES 467,667 @ 30% = up to 140,300.10
  // 4. Next KES 300,000 @ 32.5% = up to 97,500
  // 5. Above KES 800,000 @ 35%
  let tax = 0;
  let remaining = taxablePay;

  if (remaining > 0) {
    const band1 = Math.min(remaining, 24000);
    tax += band1 * 0.10;
    remaining -= band1;
  }
  if (remaining > 0) {
    const band2 = Math.min(remaining, 8333);
    tax += band2 * 0.25;
    remaining -= band2;
  }
  if (remaining > 0) {
    const band3 = Math.min(remaining, 467667);
    tax += band3 * 0.30;
    remaining -= band3;
  }
  if (remaining > 0) {
    const band4 = Math.min(remaining, 300000);
    tax += band4 * 0.325;
    remaining -= band4;
  }
  if (remaining > 0) {
    tax += remaining * 0.35;
  }

  const payeBeforeRelief = Math.round(tax);
  const personalRelief = 2400; // Monthly personal relief KES 2,400
  const insuranceRelief = Math.min(Math.round(sha * 0.15), 5000); // 15% of health contribution relief
  const netPaye = Math.max(0, payeBeforeRelief - personalRelief - insuranceRelief);

  const totalDeductions = totalNssf + sha + housingLevy + netPaye;
  const netPay = Math.round(totalGross - totalDeductions);

  return {
    grossPay: totalGross,
    nssfTier1: Math.round(nssfTier1),
    nssfTier2: Math.round(nssfTier2),
    totalNssf,
    sha,
    housingLevy,
    taxablePay: Math.round(taxablePay),
    payeBeforeRelief,
    personalRelief,
    insuranceRelief,
    netPaye,
    totalDeductions,
    netPay,
  };
}

// Initial Mock Data
const INITIAL_DEPARTMENTS: Department[] = [
  {
    id: 'dept_mfg_01',
    code: 'MFG',
    name: 'Manufacturing & Brewing',
    description: 'Brewery production lines, quality inspection, fermentation operations and packaging facilities.',
    location: 'Nairobi Industrial Area Plant',
    managerEmployeeId: 'emp_01',
    budgetedPositions: 15,
  },
  {
    id: 'dept_dist_02',
    code: 'DIST',
    name: 'Logistics & Distribution',
    description: 'Fleet transport, distribution hub management, route dispatching and regional cold storage.',
    location: 'Nairobi Central Logistics Hub',
    managerEmployeeId: 'emp_03',
    budgetedPositions: 12,
  },
  {
    id: 'dept_brand_03',
    code: 'BRAND',
    name: 'Brand & Commercial Marketing',
    description: 'Brand activation, trade marketing, distributor relations and consumer digital campaigns.',
    location: 'Westlands Commercial Office',
    managerEmployeeId: 'emp_05',
    budgetedPositions: 8,
  },
  {
    id: 'dept_people_04',
    code: 'PEOPLE',
    name: 'People Operations & Culture',
    description: 'Workforce intelligence, statutory compliance, talent acquisition and employee relations.',
    location: 'Westlands Commercial Office',
    managerEmployeeId: 'emp_07',
    budgetedPositions: 6,
  },
  {
    id: 'dept_fin_05',
    code: 'FIN',
    name: 'Finance & Supply Chain',
    description: 'Financial accounting, KRA reporting, payroll governance, procurement and audit controls.',
    location: 'Westlands Commercial Office',
    managerEmployeeId: null,
    budgetedPositions: 5,
  },
];

const INITIAL_EMPLOYEES: Employee[] = [
  {
    id: 'emp_01',
    employeeNumber: 'REK-0101',
    firstName: 'Achieng',
    lastName: 'Odhiambo',
    preferredName: 'Achieng',
    workEmail: 'achieng.odhiambo@rekker.co.ke',
    phone: '+254 722 100 201',
    nationalId: '28491023',
    kraPin: 'A004819201Z',
    nssfNo: 'NSSF-491028',
    shaNo: 'SHA-881920',
    jobTitle: 'Plant Operations Director',
    departmentId: 'dept_mfg_01',
    managerId: null,
    location: 'Nairobi Industrial Area Plant',
    employmentType: 'permanent',
    status: 'active',
    baseSalary: 320000,
    allowances: 35000,
    startDate: '2021-03-15',
    probationEndDate: null,
    contractEndDate: null,
    emergencyContact: { name: 'Kevin Odhiambo', relationship: 'Spouse', phone: '+254 722 999 111' },
    skills: ['Brewery Management', 'ISO 22000', 'HACCP', 'Lean Manufacturing', 'Team Leadership'],
  },
  {
    id: 'emp_02',
    employeeNumber: 'REK-0102',
    firstName: 'Mwangi',
    lastName: 'Kariuki',
    preferredName: 'Mwangi',
    workEmail: 'mwangi.kariuki@rekker.co.ke',
    phone: '+254 733 410 882',
    nationalId: '31092844',
    kraPin: 'A009182341M',
    nssfNo: 'NSSF-310928',
    shaNo: 'SHA-771829',
    jobTitle: 'Senior Brewmaster & Quality Lead',
    departmentId: 'dept_mfg_01',
    managerId: 'emp_01',
    location: 'Nairobi Industrial Area Plant',
    employmentType: 'permanent',
    status: 'active',
    baseSalary: 210000,
    allowances: 20000,
    startDate: '2022-06-01',
    probationEndDate: null,
    contractEndDate: null,
    emergencyContact: { name: 'Grace Kariuki', relationship: 'Spouse', phone: '+254 733 888 222' },
    skills: ['Fermentation Tech', 'Yeast Propagation', 'Sensory Evaluation', 'Quality Assurance'],
  },
  {
    id: 'emp_03',
    employeeNumber: 'REK-0103',
    firstName: 'Juma',
    lastName: 'Omondi',
    preferredName: null,
    workEmail: 'juma.omondi@rekker.co.ke',
    phone: '+254 711 502 918',
    nationalId: '29817263',
    kraPin: 'A007718291Q',
    nssfNo: 'NSSF-298172',
    shaNo: 'SHA-661928',
    jobTitle: 'Logistics Fleet Manager',
    departmentId: 'dept_dist_02',
    managerId: null,
    location: 'Nairobi Central Logistics Hub',
    employmentType: 'permanent',
    status: 'active',
    baseSalary: 185000,
    allowances: 15000,
    startDate: '2022-09-10',
    probationEndDate: null,
    contractEndDate: null,
    emergencyContact: { name: 'Amina Omondi', relationship: 'Sister', phone: '+254 711 777 333' },
    skills: ['Fleet Dispatch', 'Route Optimization', 'Cold Chain Transport', 'DOT Safety Compliance'],
  },
  {
    id: 'emp_04',
    employeeNumber: 'REK-0104',
    firstName: 'Wanjiku',
    lastName: 'Kimani',
    preferredName: 'Wawa',
    workEmail: 'wanjiku.kimani@rekker.co.ke',
    phone: '+254 700 819 223',
    nationalId: '33182910',
    kraPin: 'A006619283K',
    nssfNo: 'NSSF-331829',
    shaNo: 'SHA-552819',
    jobTitle: 'Distribution Dispatch Specialist',
    departmentId: 'dept_dist_02',
    managerId: 'emp_03',
    location: 'Nairobi Central Logistics Hub',
    employmentType: 'permanent',
    status: 'on_leave',
    baseSalary: 115000,
    allowances: 10000,
    startDate: '2023-04-12',
    probationEndDate: null,
    contractEndDate: null,
    emergencyContact: { name: 'Peter Kimani', relationship: 'Father', phone: '+254 700 333 444' },
    skills: ['WMS', 'Inventory Auditing', 'ERP Systems', 'Customer Fulfillment'],
  },
  {
    id: 'emp_05',
    employeeNumber: 'REK-0105',
    firstName: 'Brenda',
    lastName: 'Mutheu',
    preferredName: 'Brenda',
    workEmail: 'brenda.mutheu@rekker.co.ke',
    phone: '+254 721 349 018',
    nationalId: '30192837',
    kraPin: 'A005518293B',
    nssfNo: 'NSSF-301928',
    shaNo: 'SHA-441928',
    jobTitle: 'Brand Strategy & Trade Lead',
    departmentId: 'dept_brand_03',
    managerId: null,
    location: 'Westlands Commercial Office',
    employmentType: 'permanent',
    status: 'active',
    baseSalary: 230000,
    allowances: 25000,
    startDate: '2022-01-10',
    probationEndDate: null,
    contractEndDate: null,
    emergencyContact: { name: 'Dennis Mutheu', relationship: 'Brother', phone: '+254 721 555 666' },
    skills: ['Brand Development', 'Trade Marketing', 'Commercial Strategy', 'Media Planning'],
  },
  {
    id: 'emp_06',
    employeeNumber: 'REK-0106',
    firstName: 'Brian',
    lastName: 'Kiprotich',
    preferredName: 'Brian',
    workEmail: 'brian.kiprotich@rekker.co.ke',
    phone: '+254 725 619 827',
    nationalId: '34819201',
    kraPin: 'A003318294P',
    nssfNo: 'NSSF-348192',
    shaNo: 'SHA-332918',
    jobTitle: 'Digital Growth & Social Media Specialist',
    departmentId: 'dept_brand_03',
    managerId: 'emp_05',
    location: 'Westlands Commercial Office',
    employmentType: 'contract',
    status: 'active',
    baseSalary: 125000,
    allowances: 10000,
    startDate: '2024-02-01',
    probationEndDate: null,
    contractEndDate: '2026-04-30', // Expiring in ~2 months!
    emergencyContact: { name: 'Eileen Chepkemoi', relationship: 'Spouse', phone: '+254 725 111 222' },
    skills: ['Content Production', 'Performance Marketing', 'SEO', 'Influencer Management'],
  },
  {
    id: 'emp_07',
    employeeNumber: 'REK-0107',
    firstName: 'David',
    lastName: 'Kibet',
    preferredName: 'David',
    workEmail: 'david.kibet@rekker.co.ke',
    phone: '+254 720 182 930',
    nationalId: '27182930',
    kraPin: 'A002219284D',
    nssfNo: 'NSSF-271829',
    shaNo: 'SHA-221928',
    jobTitle: 'Head of People & Organization Culture',
    departmentId: 'dept_people_04',
    managerId: null,
    location: 'Westlands Commercial Office',
    employmentType: 'permanent',
    status: 'active',
    baseSalary: 310000,
    allowances: 30000,
    startDate: '2021-08-01',
    probationEndDate: null,
    contractEndDate: null,
    emergencyContact: { name: 'Faith Kibet', relationship: 'Spouse', phone: '+254 720 444 888' },
    skills: ['Strategic HR', 'Kenya Labor Law', 'Talent Development', 'Compensation & Benefits', 'HR Analytics'],
  },
  {
    id: 'emp_08',
    employeeNumber: 'REK-0108',
    firstName: 'Faith',
    lastName: 'Chebet',
    preferredName: 'Faith',
    workEmail: 'faith.chebet@rekker.co.ke',
    phone: '+254 724 991 823',
    nationalId: '35192837',
    kraPin: 'A001192837F',
    nssfNo: 'NSSF-351928',
    shaNo: 'SHA-112938',
    jobTitle: 'Talent Acquisition & Employee Experience Officer',
    departmentId: 'dept_people_04',
    managerId: 'emp_07',
    location: 'Westlands Commercial Office',
    employmentType: 'probation',
    status: 'probation',
    baseSalary: 135000,
    allowances: 10000,
    startDate: '2026-01-15',
    probationEndDate: '2026-04-15', // Due for review!
    contractEndDate: null,
    emergencyContact: { name: 'Daniel Chebet', relationship: 'Father', phone: '+254 724 000 999' },
    skills: ['Recruitment', 'Onboarding Experience', 'Employer Branding', 'Employee Engagement'],
  },
  {
    id: 'emp_09',
    employeeNumber: 'REK-0109',
    firstName: 'Dennis',
    lastName: 'Otieno',
    preferredName: 'Denno',
    workEmail: 'dennis.otieno@rekker.co.ke',
    phone: '+254 731 442 819',
    nationalId: '32091823',
    kraPin: 'A008829102X',
    nssfNo: 'NSSF-320918',
    shaNo: 'SHA-992019',
    jobTitle: 'Financial Accountant & Payroll Controller',
    departmentId: 'dept_fin_05',
    managerId: null,
    location: 'Westlands Commercial Office',
    employmentType: 'permanent',
    status: 'active',
    baseSalary: 195000,
    allowances: 15000,
    startDate: '2023-01-09',
    probationEndDate: null,
    contractEndDate: null,
    emergencyContact: { name: 'Lucy Otieno', relationship: 'Spouse', phone: '+254 731 666 777' },
    skills: ['Payroll Accounting', 'KRA iTax Returns', 'NSSF/SHA Filing', 'Financial Reporting'],
  },
  {
    id: 'emp_10',
    employeeNumber: 'REK-0110',
    firstName: 'Sarah',
    lastName: 'Njeri',
    preferredName: 'Sarah',
    workEmail: 'sarah.njeri@rekker.co.ke',
    phone: '+254 718 293 847',
    nationalId: '36019283',
    kraPin: 'A009938172N',
    nssfNo: 'NSSF-360192',
    shaNo: 'SHA-883920',
    jobTitle: 'Junior Quality Assurance Chemist',
    departmentId: 'dept_mfg_01',
    managerId: 'emp_02',
    location: 'Nairobi Industrial Area Plant',
    employmentType: 'permanent',
    status: 'active',
    baseSalary: 110000,
    allowances: 10000,
    startDate: '2024-05-02',
    probationEndDate: null,
    contractEndDate: null,
    emergencyContact: { name: 'Mary Njeri', relationship: 'Mother', phone: '+254 718 111 444' },
    skills: ['Spectrophotometry', 'Microbiological Testing', 'ISO 17025', 'Lab Documentation'],
  },
];

const INITIAL_LEAVE_REQUESTS: LeaveRequest[] = [
  {
    id: 'leave_req_01',
    employeeId: 'emp_04',
    employeeName: 'Wanjiku Kimani',
    leaveType: 'annual',
    startDate: '2026-03-02',
    endDate: '2026-03-13',
    days: 10,
    reason: 'Annual family break and rest',
    status: 'approved',
    submittedAt: '2026-02-15T08:30:00Z',
    decidedAt: '2026-02-16T10:00:00Z',
    approverComment: 'Approved. Fleet coverage arranged with team.',
  },
  {
    id: 'leave_req_02',
    employeeId: 'emp_06',
    employeeName: 'Brian Kiprotich',
    leaveType: 'annual',
    startDate: '2026-03-20',
    endDate: '2026-03-27',
    days: 6,
    reason: 'Personal development study leave',
    status: 'pending',
    submittedAt: '2026-03-01T11:45:00Z',
    decidedAt: null,
    approverComment: null,
  },
  {
    id: 'leave_req_03',
    employeeId: 'emp_02',
    employeeName: 'Mwangi Kariuki',
    leaveType: 'paternity',
    startDate: '2026-04-06',
    endDate: '2026-04-17',
    days: 10,
    reason: 'Paternity leave following delivery',
    status: 'pending',
    submittedAt: '2026-03-04T09:15:00Z',
    decidedAt: null,
    approverComment: null,
  },
  {
    id: 'leave_req_04',
    employeeId: 'emp_10',
    employeeName: 'Sarah Njeri',
    leaveType: 'sick',
    startDate: '2026-02-10',
    endDate: '2026-02-12',
    days: 3,
    reason: 'Medical recovery with doctor note',
    status: 'approved',
    submittedAt: '2026-02-10T07:00:00Z',
    decidedAt: '2026-02-10T09:30:00Z',
    approverComment: 'Get well soon. Medical certificate filed.',
  },
];

const INITIAL_AUDIT_EVENTS: AuditEvent[] = [
  {
    id: 'audit_01',
    actor: 'David Kibet (HR Admin)',
    action: 'LEAVE_APPROVE',
    targetType: 'leave_request',
    targetId: 'leave_req_01',
    summary: 'Approved 10 days annual leave for Wanjiku Kimani',
    occurredAt: '2026-02-16T10:00:00Z',
  },
  {
    id: 'audit_02',
    actor: 'Dennis Otieno (Finance)',
    action: 'PAYROLL_GENERATION',
    targetType: 'payroll_period',
    targetId: 'payroll_2026_02',
    summary: 'Calculated and generated February 2026 payroll run with statutory KRA/NSSF/SHA deductions',
    occurredAt: '2026-02-25T16:20:00Z',
  },
  {
    id: 'audit_03',
    actor: 'Faith Chebet (Recruiter)',
    action: 'CANDIDATE_STAGE_CHANGE',
    targetType: 'candidate',
    targetId: 'cand_02',
    summary: 'Advanced candidate Evans Kiprono to Technical Interview stage for Logistics Requisition',
    occurredAt: '2026-03-03T14:10:00Z',
  },
  {
    id: 'audit_04',
    actor: 'Achieng Odhiambo (Director)',
    action: 'EMPLOYEE_PROBATION_NOTE',
    targetType: 'employee',
    targetId: 'emp_08',
    summary: 'Logged 60-day positive performance milestone for Faith Chebet',
    occurredAt: '2026-03-05T09:30:00Z',
  },
];

const INITIAL_REQUISITIONS: JobRequisition[] = [
  {
    id: 'req_01',
    title: 'Senior Industrial Brewing Engineer',
    departmentId: 'dept_mfg_01',
    location: 'Nairobi Plant',
    employmentType: 'Full-time Permanent',
    status: 'published',
    minSalary: 180000,
    maxSalary: 240000,
    openings: 1,
    applicantsCount: 14,
    description: 'Lead automated fermentation, continuous line quality control and plant steam/cooling efficiency.',
    requirements: ['B.Sc. Mechanical or Chemical Engineering', '5+ years commercial brewing or beverage experience', 'HACCP & ISO 22000 certified'],
    createdAt: '2026-02-10',
  },
  {
    id: 'req_02',
    title: 'Regional Supply Chain Dispatch Coordinator',
    departmentId: 'dept_dist_02',
    location: 'Nairobi Central Hub',
    employmentType: 'Full-time Permanent',
    status: 'published',
    minSalary: 130000,
    maxSalary: 170000,
    openings: 2,
    applicantsCount: 22,
    description: 'Coordinate multi-hub cold chain logistics, distributor fulfillment schedules and driver telemetry.',
    requirements: ['Degree in Supply Chain or Logistics Management', '3+ years fleet or 3PL routing experience', 'SAP or Oracle ERP proficiency'],
    createdAt: '2026-02-18',
  },
  {
    id: 'req_03',
    title: 'Brand Activation & On-Premise Executive',
    departmentId: 'dept_brand_03',
    location: 'Nairobi Commercial Office',
    employmentType: 'Full-time Permanent',
    status: 'published',
    minSalary: 140000,
    maxSalary: 180000,
    openings: 1,
    applicantsCount: 19,
    description: 'Execute experiential consumer activations, key distributor events and on-premise bar partnership programs.',
    requirements: ['Bachelor in Marketing or Business Admin', '3+ years FMCG or beverage trade marketing experience', 'Proven budget management'],
    createdAt: '2026-02-24',
  },
];

const INITIAL_CANDIDATES: Candidate[] = [
  {
    id: 'cand_01',
    requisitionId: 'req_01',
    jobTitle: 'Senior Industrial Brewing Engineer',
    fullName: 'Peter Ndung\'u',
    email: 'peter.ndungu@gmail.com',
    phone: '+254 712 345 678',
    stage: 'interview',
    experienceYears: 6,
    matchScore: 94,
    skillsSummary: 'Strong PLC automation, brewing chemistry, thermal process optimization and ISO safety audits.',
    appliedDate: '2026-02-14',
    notes: 'Exceptional technical scorecard in Round 1 phone screen with Brewmaster.',
  },
  {
    id: 'cand_02',
    requisitionId: 'req_02',
    jobTitle: 'Regional Supply Chain Dispatch Coordinator',
    fullName: 'Evans Kiprono',
    email: 'evans.kiprono@yahoo.com',
    phone: '+254 723 456 789',
    stage: 'screening',
    experienceYears: 4,
    matchScore: 88,
    skillsSummary: 'Fleet GPS dispatch, distributor delivery reconciliation and cold chain temperature monitoring.',
    appliedDate: '2026-02-20',
  },
  {
    id: 'cand_03',
    requisitionId: 'req_03',
    jobTitle: 'Brand Activation & On-Premise Executive',
    fullName: 'Caroline Njoki',
    email: 'carol.njoki@outlook.com',
    phone: '+254 734 567 890',
    stage: 'offer',
    experienceYears: 5,
    matchScore: 96,
    skillsSummary: 'Led East African experiential campaigns, festival sponsor partnerships and distributor point-of-sale merchandising.',
    appliedDate: '2026-02-26',
    notes: 'Offer letter drafted. Pending executive compensation signoff.',
  },
  {
    id: 'cand_04',
    requisitionId: 'req_01',
    jobTitle: 'Senior Industrial Brewing Engineer',
    fullName: 'Mercy Auma',
    email: 'mercy.auma@gmail.com',
    phone: '+254 745 678 901',
    stage: 'applied',
    experienceYears: 3,
    matchScore: 78,
    skillsSummary: 'Laboratory quality testing, fermentation monitoring, water filtration chemistry.',
    appliedDate: '2026-03-02',
  },
];

const INITIAL_ATTENDANCE: AttendanceRecord[] = [
  {
    id: 'att_01',
    employeeId: 'emp_01',
    employeeName: 'Achieng Odhiambo',
    departmentId: 'dept_mfg_01',
    date: '2026-03-06',
    shift: 'Morning (06:00 - 14:00)',
    clockIn: '05:52',
    clockOut: '14:15',
    status: 'on_time',
    overtimeHours: 0.25,
  },
  {
    id: 'att_02',
    employeeId: 'emp_02',
    employeeName: 'Mwangi Kariuki',
    departmentId: 'dept_mfg_01',
    date: '2026-03-06',
    shift: 'Morning (06:00 - 14:00)',
    clockIn: '05:58',
    clockOut: '14:30',
    status: 'overtime',
    overtimeHours: 0.5,
  },
  {
    id: 'att_03',
    employeeId: 'emp_03',
    employeeName: 'Juma Omondi',
    departmentId: 'dept_dist_02',
    date: '2026-03-06',
    shift: 'Day (08:30 - 17:00)',
    clockIn: '08:48',
    clockOut: null,
    status: 'late',
    overtimeHours: 0,
    anomalyFlag: 'Late arrival: 18 minutes after shift start',
  },
  {
    id: 'att_04',
    employeeId: 'emp_05',
    employeeName: 'Brenda Mutheu',
    departmentId: 'dept_brand_03',
    date: '2026-03-06',
    shift: 'Day (08:30 - 17:00)',
    clockIn: '08:25',
    clockOut: null,
    status: 'on_time',
    overtimeHours: 0,
  },
  {
    id: 'att_05',
    employeeId: 'emp_07',
    employeeName: 'David Kibet',
    departmentId: 'dept_people_04',
    date: '2026-03-06',
    shift: 'Day (08:30 - 17:00)',
    clockIn: '08:15',
    clockOut: null,
    status: 'on_time',
    overtimeHours: 0,
  },
];

const INITIAL_GOALS: Goal[] = [
  {
    id: 'goal_01',
    employeeId: 'emp_01',
    employeeName: 'Achieng Odhiambo',
    title: 'Achieve 99.8% Brewery Batch Consistency & Zero Waste Spill',
    description: 'Maintain strict temperature & pressure controls to prevent batch variations across Nairobi plant fermentation vats.',
    category: 'Quality',
    targetDate: '2026-06-30',
    progress: 85,
    status: 'in_progress',
  },
  {
    id: 'goal_02',
    employeeId: 'emp_03',
    employeeName: 'Juma Omondi',
    title: 'Reduce Regional Transit Delivery Lead Times by 18%',
    description: 'Implement automated route dispatching and real-time distributor unloading window tracking.',
    category: 'Operational',
    targetDate: '2026-05-15',
    progress: 70,
    status: 'in_progress',
  },
  {
    id: 'goal_03',
    employeeId: 'emp_05',
    employeeName: 'Brenda Mutheu',
    title: 'Expand Coast Region Distributor Key Accounts by 35 Outlets',
    description: 'Establish premium refrigerated tap handles across coastal hospitality and resort accounts.',
    category: 'Strategic',
    targetDate: '2026-07-31',
    progress: 45,
    status: 'in_progress',
  },
  {
    id: 'goal_04',
    employeeId: 'emp_08',
    employeeName: 'Faith Chebet',
    title: 'Complete 30-60-90 Day Onboarding SLA Index for 100% of New Hires',
    description: 'Ensure all recruits receive digital asset handovers, compliance briefings and manager 30-day reviews within target.',
    category: 'Operational',
    targetDate: '2026-04-15',
    progress: 90,
    status: 'in_progress',
  },
];

const INITIAL_COURSES: TrainingCourse[] = [
  {
    id: 'crs_01',
    title: 'Good Manufacturing Practices (GMP) & ISO 22000 Food Safety',
    category: 'Manufacturing & Compliance',
    durationHours: 12,
    provider: 'Kenya Bureau of Standards (KEBS) & Rekker Academy',
    enrolledCount: 18,
    completedCount: 16,
    status: 'mandatory',
  },
  {
    id: 'crs_02',
    title: 'Occupational Safety & Health Act (OSHA 2007) Plant Protocols',
    category: 'Workplace Safety',
    durationHours: 8,
    provider: 'Directorate of Occupational Safety and Health Services (DOSHS)',
    enrolledCount: 24,
    completedCount: 22,
    status: 'mandatory',
  },
  {
    id: 'crs_03',
    title: 'Kenya Data Protection Act (2019) & Employee Records Governance',
    category: 'Legal & Privacy',
    durationHours: 6,
    provider: 'Office of Data Protection Commissioner (ODPC) Accredited',
    enrolledCount: 10,
    completedCount: 9,
    status: 'mandatory',
  },
  {
    id: 'crs_04',
    title: 'Cold Chain Fleet Management & Route Optimization Systems',
    category: 'Logistics',
    durationHours: 10,
    provider: 'Chartered Institute of Logistics & Transport (CILT)',
    enrolledCount: 8,
    completedCount: 5,
    status: 'elective',
  },
];

// In-Memory & LocalStorage Persisted Data Store
class PeopleOsStore {
  private departments: Department[] = [];
  private employees: Employee[] = [];
  private leaveRequests: LeaveRequest[] = [];
  private auditEvents: AuditEvent[] = [];
  private requisitions: JobRequisition[] = [];
  private candidates: Candidate[] = [];
  private attendance: AttendanceRecord[] = [];
  private goals: Goal[] = [];
  private courses: TrainingCourse[] = [];

  constructor() {
    this.init();
  }

  private init() {
    try {
      const storedDepts = localStorage.getItem('peopleos_depts');
      this.departments = storedDepts ? JSON.parse(storedDepts) : INITIAL_DEPARTMENTS;

      const storedEmps = localStorage.getItem('peopleos_employees');
      this.employees = storedEmps ? JSON.parse(storedEmps) : INITIAL_EMPLOYEES;

      const storedLeaves = localStorage.getItem('peopleos_leaves');
      this.leaveRequests = storedLeaves ? JSON.parse(storedLeaves) : INITIAL_LEAVE_REQUESTS;

      const storedAudits = localStorage.getItem('peopleos_audits');
      this.auditEvents = storedAudits ? JSON.parse(storedAudits) : INITIAL_AUDIT_EVENTS;

      const storedReqs = localStorage.getItem('peopleos_reqs');
      this.requisitions = storedReqs ? JSON.parse(storedReqs) : INITIAL_REQUISITIONS;

      const storedCands = localStorage.getItem('peopleos_cands');
      this.candidates = storedCands ? JSON.parse(storedCands) : INITIAL_CANDIDATES;

      const storedAtt = localStorage.getItem('peopleos_attendance');
      this.attendance = storedAtt ? JSON.parse(storedAtt) : INITIAL_ATTENDANCE;

      const storedGoals = localStorage.getItem('peopleos_goals');
      this.goals = storedGoals ? JSON.parse(storedGoals) : INITIAL_GOALS;

      const storedCourses = localStorage.getItem('peopleos_courses');
      this.courses = storedCourses ? JSON.parse(storedCourses) : INITIAL_COURSES;
    } catch {
      this.departments = INITIAL_DEPARTMENTS;
      this.employees = INITIAL_EMPLOYEES;
      this.leaveRequests = INITIAL_LEAVE_REQUESTS;
      this.auditEvents = INITIAL_AUDIT_EVENTS;
      this.requisitions = INITIAL_REQUISITIONS;
      this.candidates = INITIAL_CANDIDATES;
      this.attendance = INITIAL_ATTENDANCE;
      this.goals = INITIAL_GOALS;
      this.courses = INITIAL_COURSES;
    }
  }

  private persist(key: string, data: any) {
    try {
      localStorage.setItem(key, JSON.stringify(data));
    } catch {}
  }

  // Employees
  getEmployees() { return [...this.employees]; }
  getEmployee(id: string) { return this.employees.find(e => e.id === id) || null; }
  addEmployee(empData: Omit<Employee, 'id'>) {
    const newEmp: Employee = {
      ...empData,
      id: `emp_${Date.now()}`,
    };
    this.employees = [newEmp, ...this.employees];
    this.persist('peopleos_employees', this.employees);
    this.logAudit('David Kibet', 'CREATE_EMPLOYEE', 'employee', newEmp.id, `Created new employee profile: ${newEmp.firstName} ${newEmp.lastName} (${newEmp.employeeNumber})`);
    return newEmp;
  }
  updateEmployee(id: string, updates: Partial<Employee>) {
    this.employees = this.employees.map(e => e.id === id ? { ...e, ...updates } : e);
    this.persist('peopleos_employees', this.employees);
    this.logAudit('David Kibet', 'UPDATE_EMPLOYEE', 'employee', id, `Updated employee profile records`);
    return this.getEmployee(id);
  }

  // Departments
  getDepartments() { return [...this.departments]; }

  // Leave
  getLeaveRequests() { return [...this.leaveRequests]; }
  createLeaveRequest(input: { employeeId: string; leaveType: LeaveRequest['leaveType']; startDate: string; endDate: string; reason: string }) {
    const emp = this.getEmployee(input.employeeId);
    const start = new Date(input.startDate);
    const end = new Date(input.endDate);
    const diffDays = Math.max(1, Math.ceil((end.getTime() - start.getTime()) / (1000 * 3600 * 24)) + 1);

    const newLeave: LeaveRequest = {
      id: `leave_${Date.now()}`,
      employeeId: input.employeeId,
      employeeName: emp ? `${emp.firstName} ${emp.lastName}` : 'Employee',
      leaveType: input.leaveType,
      startDate: input.startDate,
      endDate: input.endDate,
      days: diffDays,
      reason: input.reason,
      status: 'pending',
      submittedAt: new Date().toISOString(),
    };
    this.leaveRequests = [newLeave, ...this.leaveRequests];
    this.persist('peopleos_leaves', this.leaveRequests);
    this.logAudit('System', 'LEAVE_SUBMIT', 'leave_request', newLeave.id, `Submitted ${diffDays}-day ${input.leaveType} leave request for ${newLeave.employeeName}`);
    return newLeave;
  }
  decideLeave(id: string, decision: 'approved' | 'rejected', comment?: string) {
    this.leaveRequests = this.leaveRequests.map(l => l.id === id ? {
      ...l,
      status: decision,
      decidedAt: new Date().toISOString(),
      approverComment: comment || (decision === 'approved' ? 'Approved by authorized manager' : 'Declined due to coverage constraints'),
    } : l);
    this.persist('peopleos_leaves', this.leaveRequests);
    const item = this.leaveRequests.find(l => l.id === id);
    this.logAudit('David Kibet', decision === 'approved' ? 'LEAVE_APPROVE' : 'LEAVE_REJECT', 'leave_request', id, `${decision.toUpperCase()} leave request for ${item?.employeeName}`);
    return item;
  }

  // Audits
  getAuditEvents() { return [...this.auditEvents]; }
  logAudit(actor: string, action: string, targetType: string, targetId: string, summary: string) {
    const event: AuditEvent = {
      id: `audit_${Date.now()}`,
      actor,
      action,
      targetType,
      targetId,
      summary,
      occurredAt: new Date().toISOString(),
    };
    this.auditEvents = [event, ...this.auditEvents];
    this.persist('peopleos_audits', this.auditEvents);
  }

  // Requisitions & Candidates
  getRequisitions() { return [...this.requisitions]; }
  addRequisition(reqData: Omit<JobRequisition, 'id' | 'createdAt' | 'applicantsCount'>) {
    const newReq: JobRequisition = {
      ...reqData,
      id: `req_${Date.now()}`,
      applicantsCount: 0,
      createdAt: new Date().toISOString().slice(0, 10),
    };
    this.requisitions = [newReq, ...this.requisitions];
    this.persist('peopleos_reqs', this.requisitions);
    this.logAudit('David Kibet', 'CREATE_REQUISITION', 'requisition', newReq.id, `Published new requisition: ${newReq.title}`);
    return newReq;
  }
  getCandidates() { return [...this.candidates]; }
  updateCandidateStage(id: string, stage: Candidate['stage']) {
    this.candidates = this.candidates.map(c => c.id === id ? { ...c, stage } : c);
    this.persist('peopleos_cands', this.candidates);
    const cand = this.candidates.find(c => c.id === id);
    this.logAudit('Faith Chebet', 'CANDIDATE_STAGE_CHANGE', 'candidate', id, `Updated stage for ${cand?.fullName} to ${stage.toUpperCase()}`);
    return cand;
  }
  addCandidate(candData: Omit<Candidate, 'id' | 'appliedDate'>) {
    const newCand: Candidate = {
      ...candData,
      id: `cand_${Date.now()}`,
      appliedDate: new Date().toISOString().slice(0, 10),
    };
    this.candidates = [newCand, ...this.candidates];
    this.persist('peopleos_cands', this.candidates);
    return newCand;
  }

  // Attendance
  getAttendance() { return [...this.attendance]; }
  clockIn(employeeId: string) {
    const emp = this.getEmployee(employeeId);
    const now = new Date();
    const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const dateStr = now.toISOString().slice(0, 10);

    const record: AttendanceRecord = {
      id: `att_${Date.now()}`,
      employeeId,
      employeeName: emp ? `${emp.firstName} ${emp.lastName}` : 'Employee',
      departmentId: emp?.departmentId || 'dept_mfg_01',
      date: dateStr,
      shift: 'Day (08:30 - 17:00)',
      clockIn: timeStr,
      clockOut: null,
      status: 'on_time',
      overtimeHours: 0,
    };
    this.attendance = [record, ...this.attendance];
    this.persist('peopleos_attendance', this.attendance);
    this.logAudit(record.employeeName, 'ATTENDANCE_CLOCK_IN', 'attendance', record.id, `Clocked in at ${timeStr}`);
    return record;
  }
  clockOut(employeeId: string) {
    const now = new Date();
    const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    this.attendance = this.attendance.map(a => {
      if (a.employeeId === employeeId && !a.clockOut) {
        return { ...a, clockOut: timeStr };
      }
      return a;
    });
    this.persist('peopleos_attendance', this.attendance);
    return this.attendance.find(a => a.employeeId === employeeId);
  }

  // Goals
  getGoals() { return [...this.goals]; }
  updateGoalProgress(id: string, progress: number) {
    this.goals = this.goals.map(g => g.id === id ? {
      ...g,
      progress,
      status: progress >= 100 ? 'completed' : progress < 40 ? 'behind' : 'in_progress',
    } : g);
    this.persist('peopleos_goals', this.goals);
    return this.goals.find(g => g.id === id);
  }

  // Courses
  getCourses() { return [...this.courses]; }

  // Payroll Generation (Kenya Versioned Engine)
  getPayrollRecords(period: string = 'March 2026'): PayrollRecord[] {
    return this.employees.map(emp => {
      const calc = calculateKenyaPayroll(emp.baseSalary, emp.allowances, 0);
      return {
        id: `pay_${period.replace(' ', '_')}_${emp.id}`,
        employeeId: emp.id,
        employeeName: `${emp.firstName} ${emp.lastName}`,
        departmentName: this.departments.find(d => d.id === emp.departmentId)?.name || 'Operations',
        period,
        baseSalary: emp.baseSalary,
        allowances: emp.allowances,
        overtimePay: 0,
        grossPay: calc.grossPay,
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
        status: 'approved',
      };
    });
  }

  // Overview Stats
  getOverview() {
    const totalHeadcount = this.employees.length;
    const activeHeadcount = this.employees.filter(e => e.status === 'active').length;
    const onLeaveHeadcount = this.employees.filter(e => e.status === 'on_leave').length;
    const probationHeadcount = this.employees.filter(e => e.status === 'probation').length;
    const pendingLeaves = this.leaveRequests.filter(l => l.status === 'pending').length;

    // Approvals: pending leaves + expiring contracts
    const expiringContracts = this.employees.filter(e => {
      if (!e.contractEndDate) return false;
      const end = new Date(e.contractEndDate).getTime();
      const now = new Date().getTime();
      return (end - now) < (60 * 24 * 60 * 60 * 1000); // within 60 days
    }).length;

    const monthlyHeadcount = [
      { month: 'Oct 2025', count: 8 },
      { month: 'Nov 2025', count: 8 },
      { month: 'Dec 2025', count: 9 },
      { month: 'Jan 2026', count: 9 },
      { month: 'Feb 2026', count: 10 },
      { month: 'Mar 2026', count: totalHeadcount },
    ];

    const departmentHeadcount = this.departments.map(d => ({
      departmentId: d.id,
      departmentCode: d.code,
      departmentName: d.name,
      count: this.employees.filter(e => e.departmentId === d.id).length,
      budgeted: d.budgetedPositions,
    }));

    const priorities = [
      {
        id: 'prio_01',
        category: 'STATUTORY_COMPLIANCE',
        title: 'KRA Monthly PAYE & Housing Levy Filing Due',
        description: 'Statutory returns for March 2026 must be validated and filed before the 9th on KRA iTax portal.',
        source: 'Payroll Engine',
      },
      {
        id: 'prio_02',
        category: 'CONTRACT_EXPIRY',
        title: `${expiringContracts} Fixed-term Contract Approaching Expiry`,
        description: 'Brian Kiprotich (Digital Specialist) contract ends on 2026-04-30. Review renewal decision.',
        source: 'Workforce Records',
      },
      {
        id: 'prio_03',
        category: 'PROBATION_REVIEW',
        title: `${probationHeadcount} Employee Ready for 90-Day Probation Assessment`,
        description: 'Faith Chebet completes 90-day probation on 2026-04-15. Schedule manager performance signoff.',
        source: 'People Operations',
      },
      {
        id: 'prio_04',
        category: 'LEAVE_COVERAGE',
        title: `${pendingLeaves} Pending Leave Applications Awaiting Authorization`,
        description: 'Mwangi Kariuki and Brian Kiprotich submitted leave requests requiring supervisor review.',
        source: 'Time Away Hub',
      },
    ];

    return {
      organizationName: 'Rekker Breweries Kenya Ltd',
      dataMode: 'live_interactive',
      stats: {
        totalHeadcount,
        activeHeadcount,
        onLeaveHeadcount,
        probationHeadcount,
        pendingApprovalsCount: pendingLeaves + expiringContracts,
        expiringContractsCount: expiringContracts,
      },
      departmentHeadcount,
      monthlyHeadcount,
      priorities,
    };
  }
}

export const peopleOsStore = new PeopleOsStore();
