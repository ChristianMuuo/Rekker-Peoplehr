import type {
  AttendanceCorrectionRecord,
  ContractReminderRecord,
  EmployeeAssignmentHistoryRecord,
  EmployeeImportBatchRecord,
  EmployeeImportMappingProfileRecord,
  EmployeeImportRowRecord,
  EmployeePositionAssignmentRecord,
  OnboardingTemplateRecord,
  PositionRecord,
  PrivacyRequestRecord,
  ProbationReviewRecord,
  ProfileCorrectionRequestRecord,
  WorkCalendarRecord,
} from "@workspace/db";
import { PEOPLEOS_ORGANIZATION_ID } from "../middlewares/peopleosAccess";

/**
 * Sandbox / offline in-memory Phase 2 store used exclusively when DATABASE_URL is not configured.
 * Mirrors PostgreSQL Drizzle record shapes and enforces organizationId scoping.
 */
export interface Phase2MemoryState {
  positions: PositionRecord[];
  positionAssignments: EmployeePositionAssignmentRecord[];
  assignmentHistory: EmployeeAssignmentHistoryRecord[];
  importMappingProfiles: EmployeeImportMappingProfileRecord[];
  importBatches: EmployeeImportBatchRecord[];
  importRows: EmployeeImportRowRecord[];
  onboardingTemplates: OnboardingTemplateRecord[];
  probationReviews: ProbationReviewRecord[];
  contractReminders: ContractReminderRecord[];
  profileCorrectionRequests: ProfileCorrectionRequestRecord[];
  privacyRequests: PrivacyRequestRecord[];
  workCalendars: WorkCalendarRecord[];
  attendanceCorrections: AttendanceCorrectionRecord[];
  employeeExtras: Map<
    string,
    {
      personalEmail?: string | null;
      contactPreferencesJson?: string | null;
      positionId?: string | null;
      hrRepresentativeUserId?: string | null;
      timezone?: string;
      employeeCategory?: string | null;
      contractStartDate?: string | null;
      emergencyContactJson?: string | null;
      skillsJson?: string | null;
      qualificationsJson?: string | null;
      certificationsJson?: string | null;
      workExperienceJson?: string | null;
      nationalId?: string | null;
    }
  >;
}

const DEFAULT_ORG = PEOPLEOS_ORGANIZATION_ID;
const NOW = new Date("2026-11-12T06:00:00.000Z");

export const phase2MemoryStore: Phase2MemoryState = {
  positions: [
    {
      id: "40000000-0000-4000-8000-000000000001",
      organizationId: DEFAULT_ORG,
      positionCode: "POS-MFG-001",
      title: "Plant Operations Director",
      departmentId: "20000000-0000-4000-8000-000000000001",
      reportsToPositionId: null,
      location: "Nairobi Production Facility",
      employmentType: "permanent",
      employeeCategory: "management",
      status: "occupied",
      budgetedHeadcount: 1,
      gradeBand: "E1",
      costCenter: "CC-MFG",
      description: "Overall accountability for Rekker formulation, filling, and QA operations.",
      createdByUserId: "system_seed",
      approvedByUserId: "system_seed",
      approvedAt: NOW,
      createdAt: NOW,
      updatedAt: NOW,
    },
    {
      id: "40000000-0000-4000-8000-000000000002",
      organizationId: DEFAULT_ORG,
      positionCode: "POS-MFG-002",
      title: "Lead Formulation & Quality Chemist",
      departmentId: "20000000-0000-4000-8000-000000000001",
      reportsToPositionId: "40000000-0000-4000-8000-000000000001",
      location: "Nairobi Production Facility",
      employmentType: "permanent",
      employeeCategory: "technical",
      status: "occupied",
      budgetedHeadcount: 1,
      gradeBand: "P3",
      costCenter: "CC-MFG",
      description: "Batch formulation standards and laboratory QA release.",
      createdByUserId: "system_seed",
      approvedByUserId: "system_seed",
      approvedAt: NOW,
      createdAt: NOW,
      updatedAt: NOW,
    },
    {
      id: "40000000-0000-4000-8000-000000000003",
      organizationId: DEFAULT_ORG,
      positionCode: "POS-DIST-001",
      title: "Logistics Fleet Manager",
      departmentId: "20000000-0000-4000-8000-000000000002",
      reportsToPositionId: null,
      location: "Nairobi Central Logistics Hub",
      employmentType: "permanent",
      employeeCategory: "management",
      status: "occupied",
      budgetedHeadcount: 1,
      gradeBand: "M2",
      costCenter: "CC-DIST",
      description: "National fleet dispatch and warehouse route scheduling.",
      createdByUserId: "system_seed",
      approvedByUserId: "system_seed",
      approvedAt: NOW,
      createdAt: NOW,
      updatedAt: NOW,
    },
    {
      id: "40000000-0000-4000-8000-000000000004",
      organizationId: DEFAULT_ORG,
      positionCode: "POS-PEOPLE-001",
      title: "Head of People & Organization Culture",
      departmentId: "20000000-0000-4000-8000-000000000004",
      reportsToPositionId: null,
      location: "Westlands Commercial Office",
      employmentType: "permanent",
      employeeCategory: "management",
      status: "occupied",
      budgetedHeadcount: 1,
      gradeBand: "E2",
      costCenter: "CC-PEOPLE",
      description: "Enterprise HR operations, Kenyan compliance governance, and talent culture.",
      createdByUserId: "system_seed",
      approvedByUserId: "system_seed",
      approvedAt: NOW,
      createdAt: NOW,
      updatedAt: NOW,
    },
    {
      id: "40000000-0000-4000-8000-000000000005",
      organizationId: DEFAULT_ORG,
      positionCode: "POS-MFG-003",
      title: "Senior Production Line Supervisor",
      departmentId: "20000000-0000-4000-8000-000000000001",
      reportsToPositionId: "40000000-0000-4000-8000-000000000001",
      location: "Nairobi Production Facility",
      employmentType: "permanent",
      employeeCategory: "operations",
      status: "vacant",
      budgetedHeadcount: 1,
      gradeBand: "S2",
      costCenter: "CC-MFG",
      description: "Approved open position for second filling line supervision.",
      createdByUserId: "system_seed",
      approvedByUserId: "system_seed",
      approvedAt: NOW,
      createdAt: NOW,
      updatedAt: NOW,
    },
  ],
  positionAssignments: [
    {
      id: "41000000-0000-4000-8000-000000000001",
      organizationId: DEFAULT_ORG,
      employeeId: "10000000-0000-4000-8000-000000000001",
      positionId: "40000000-0000-4000-8000-000000000001",
      assignmentType: "primary",
      effectiveFrom: "2021-03-15",
      effectiveTo: null,
      isCurrent: true,
      changeReason: "Initial establishment link",
      changedByUserId: "system_seed",
      createdAt: NOW,
    },
    {
      id: "41000000-0000-4000-8000-000000000002",
      organizationId: DEFAULT_ORG,
      employeeId: "10000000-0000-4000-8000-000000000002",
      positionId: "40000000-0000-4000-8000-000000000002",
      assignmentType: "primary",
      effectiveFrom: "2022-06-01",
      effectiveTo: null,
      isCurrent: true,
      changeReason: "Initial establishment link",
      changedByUserId: "system_seed",
      createdAt: NOW,
    },
    {
      id: "41000000-0000-4000-8000-000000000003",
      organizationId: DEFAULT_ORG,
      employeeId: "10000000-0000-4000-8000-000000000003",
      positionId: "40000000-0000-4000-8000-000000000003",
      assignmentType: "primary",
      effectiveFrom: "2022-09-10",
      effectiveTo: null,
      isCurrent: true,
      changeReason: "Initial establishment link",
      changedByUserId: "system_seed",
      createdAt: NOW,
    },
    {
      id: "41000000-0000-4000-8000-000000000004",
      organizationId: DEFAULT_ORG,
      employeeId: "10000000-0000-4000-8000-000000000007",
      positionId: "40000000-0000-4000-8000-000000000004",
      assignmentType: "primary",
      effectiveFrom: "2021-08-01",
      effectiveTo: null,
      isCurrent: true,
      changeReason: "Initial establishment link",
      changedByUserId: "system_seed",
      createdAt: NOW,
    },
  ],
  assignmentHistory: [],
  importMappingProfiles: [],
  importBatches: [],
  importRows: [],
  onboardingTemplates: [
    {
      id: "42000000-0000-4000-8000-000000000001",
      organizationId: DEFAULT_ORG,
      name: "Kenya Standard Corporate & Operations Onboarding",
      workflowType: "onboarding",
      departmentCode: null,
      employmentType: null,
      tasksJson: JSON.stringify([
        {
          title: "Verify written Employment Act s.10 particulars & signed contract",
          category: "Compliance",
          assigneeRole: "hr_admin",
          dueOffsetDays: 3,
        },
        {
          title: "Collect National ID, KRA PIN, NSSF & SHA/SHIF verification documents",
          category: "Statutory",
          assigneeRole: "hr_admin",
          dueOffsetDays: 5,
        },
        {
          title: "Provision corporate workstation, badge & PeopleOS access",
          category: "IT & Facilities",
          assigneeRole: "it_admin",
          dueOffsetDays: 2,
        },
        {
          title: "Complete role expectations & 90-day probation milestone plan",
          category: "Manager",
          assigneeRole: "manager",
          dueOffsetDays: 7,
        },
      ]),
      active: true,
      createdByUserId: "system_seed",
      createdAt: NOW,
    },
    {
      id: "42000000-0000-4000-8000-000000000002",
      organizationId: DEFAULT_ORG,
      name: "Standard Structured Offboarding & Asset Clearance",
      workflowType: "offboarding",
      departmentCode: null,
      employmentType: null,
      tasksJson: JSON.stringify([
        {
          title: "Retrieve company laptop, ID badge, keys & fleet/plant equipment",
          category: "Asset Clearance",
          assigneeRole: "it_admin",
          dueOffsetDays: 2,
        },
        {
          title: "Revoke ERP, email, and PeopleOS access credentials",
          category: "Access Control",
          assigneeRole: "it_admin",
          dueOffsetDays: 1,
        },
        {
          title: "Conduct structured exit interview & handover confirmation",
          category: "HR",
          assigneeRole: "hr_admin",
          dueOffsetDays: 3,
        },
      ]),
      active: true,
      createdByUserId: "system_seed",
      createdAt: NOW,
    },
  ],
  probationReviews: [
    {
      id: "43000000-0000-4000-8000-000000000001",
      organizationId: DEFAULT_ORG,
      employeeId: "10000000-0000-4000-8000-000000000008",
      probationStartDate: "2026-01-15",
      probationEndDate: "2026-04-15",
      extendedUntilDate: null,
      extensionCount: 0,
      milestoneDay: 90,
      status: "pending_review",
      managerRecommendation: null,
      outcome: null,
      decisionNotes: null,
      reviewedByUserId: null,
      reviewedAt: null,
      createdAt: NOW,
    },
  ],
  contractReminders: [
    {
      id: "44000000-0000-4000-8000-000000000001",
      organizationId: DEFAULT_ORG,
      employeeId: "10000000-0000-4000-8000-000000000006",
      contractEndDate: "2026-04-30",
      reminderWindowDays: 30,
      status: "open",
      actionTaken: null,
      notes: "Fixed-term contract review required by HR & Brand Lead (no auto-termination).",
      handledByUserId: null,
      handledAt: null,
      createdAt: NOW,
    },
  ],
  profileCorrectionRequests: [],
  privacyRequests: [],
  workCalendars: [
    {
      id: "45000000-0000-4000-8000-000000000001",
      organizationId: DEFAULT_ORG,
      name: "Kenya Standard Office & Production Week (EAT)",
      location: null,
      timezone: "Africa/Nairobi",
      workdaysJson: "[1,2,3,4,5]",
      holidaysJson: JSON.stringify([
        { date: "2026-01-01", name: "New Year's Day" },
        { date: "2026-05-01", name: "Labour Day" },
        { date: "2026-06-01", name: "Madaraka Day" },
        { date: "2026-10-10", name: "Mazingira / Utamaduni Day" },
        { date: "2026-10-20", name: "Mashujaa Day" },
        { date: "2026-12-12", name: "Jamhuri Day" },
        { date: "2026-12-25", name: "Christmas Day" },
        { date: "2026-12-26", name: "Boxing Day" },
      ]),
      shiftStartTime: "08:00",
      shiftEndTime: "17:00",
      isDefault: true,
      updatedByUserId: "system_seed",
      createdAt: NOW,
      updatedAt: NOW,
    },
  ],
  attendanceCorrections: [],
  employeeExtras: new Map([
    [
      "10000000-0000-4000-8000-000000000001",
      {
        positionId: "40000000-0000-4000-8000-000000000001",
        timezone: "Africa/Nairobi",
        employeeCategory: "management",
        emergencyContactJson: JSON.stringify({
          name: "Otieno Odhiambo",
          relationship: "Spouse",
          phone: "+254711000101",
        }),
      },
    ],
    [
      "10000000-0000-4000-8000-000000000002",
      {
        positionId: "40000000-0000-4000-8000-000000000002",
        timezone: "Africa/Nairobi",
        employeeCategory: "technical",
      },
    ],
    [
      "10000000-0000-4000-8000-000000000003",
      {
        positionId: "40000000-0000-4000-8000-000000000003",
        timezone: "Africa/Nairobi",
        employeeCategory: "management",
      },
    ],
    [
      "10000000-0000-4000-8000-000000000007",
      {
        positionId: "40000000-0000-4000-8000-000000000004",
        timezone: "Africa/Nairobi",
        employeeCategory: "management",
      },
    ],
  ]),
};
