import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { UnifiedAuthProvider, Show, SignIn, SignUp, useClerk, useUser, hasValidClerkKey } from './auth';
import { publishableKeyFromHost } from '@clerk/react/internal';
import { shadcn } from '@clerk/themes';
import { QueryClient, QueryClientProvider, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  getGetEmployeeQueryKey,
  getGetPeopleOsOverviewQueryKey, getListApprovalsQueryKey, getListAuditEventsQueryKey,
  getListDepartmentsQueryKey, getListEmployeesQueryKey, getListLeaveBalancesQueryKey,
  getListLeavePoliciesQueryKey, getListLeaveRequestsQueryKey,
  useCreateEmployee, useCreateLeavePolicy, useCreateLeaveRequest, useDecideLeaveRequest,
  useGetAgentProviderStatus,
  useGetAuthContext, useGetEmployee, useGetPeopleOsOverview, useListApprovals, useListAuditEvents,
  useListDepartments, useListEmployees, useListLeaveBalances, useListLeavePolicies,
  useListLeaveRequests, useUpdateEmployee, useUpdateLeavePolicy,
} from '@workspace/api-client-react';
import type { Employee, EmployeeInput, EmployeeUpdate, LeavePolicy, LeaveRequestInput } from '@workspace/api-client-react';
import {
  Activity, AlertCircle, ArrowDownRight, ArrowRight, ArrowUpRight, BadgeCheck, Bell, BrainCircuit, BriefcaseBusiness,
  CalendarDays, Check, ChevronLeft, ChevronRight, CircleHelp, Clock3, Command, FileText,
  Filter, GitBranch, Handshake, Laptop, LayoutDashboard, LogOut, Menu, Moon, Plus, Receipt, Search, Settings2, ShieldCheck, Sparkles,
  Sun, Target, UserCheck, Users, X,
} from 'lucide-react';
import { Link, Redirect, Route, Switch, useLocation, Router as WouterRouter } from 'wouter';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import { RecruitmentPage } from '@/pages/RecruitmentPage';
import { OnboardingPage } from '@/pages/OnboardingPage';
import { AttendancePage } from '@/pages/AttendancePage';
import { PayrollPage } from '@/pages/PayrollPage';
import { PerformancePage } from '@/pages/PerformancePage';
import { LearningPage } from '@/pages/LearningPage';
import { DocumentsPage } from '@/pages/DocumentsPage';
import { ReportsPage } from '@/pages/ReportsPage';
import { AgentHubPage } from '@/pages/AgentHubPage';
import { SelfServicePage } from '@/pages/SelfServicePage';
import { ExpensesPage } from '@/pages/ExpensesPage';
import { AssetsPage } from '@/pages/AssetsPage';
import { PredictiveMlPage } from '@/pages/PredictiveMlPage';
import { CareersPage, LegalPage } from '@/pages/CareersPage';
import { CustomerPortalPage, DistributorPortalPage } from '@/pages/portals/PortalsPage';
import { CrmPipelinePage, PartnerApprovalsPage } from '@/pages/erp/EcosystemErpPages';
import { apiGet } from '@/lib/api';

const queryClient = new QueryClient();
const basePath = import.meta.env.BASE_URL.replace(/\/$/, '');
const clerkPubKey = publishableKeyFromHost(window.location.hostname, import.meta.env.VITE_CLERK_PUBLISHABLE_KEY);
const clerkProxyUrl = import.meta.env.VITE_CLERK_PROXY_URL || (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' ? 'https://cdn.jsdelivr.net' : undefined);

function stripBase(path: string) {
  return basePath && path.startsWith(basePath) ? path.slice(basePath.length) || '/' : path;
}

const appearance = {
  theme: shadcn,
  cssLayerName: 'clerk',
  options: {
    logoPlacement: 'inside' as const,
    logoLinkUrl: basePath || '/',
    logoImageUrl: `${window.location.origin}${basePath}/logo.svg`,
  },
  variables: {
    colorPrimary: '#C71D1D', colorForeground: '#252321', colorMutedForeground: '#77716B',
    colorDanger: '#C71D1D', colorBackground: '#FFFFFF', colorInput: '#FFFFFF',
    colorInputForeground: '#252321', colorNeutral: '#E5E0DB', fontFamily: 'DM Sans, sans-serif',
    borderRadius: '0.75rem',
  },
  elements: {
    rootBox: 'w-full flex justify-center',
    cardBox: 'bg-white rounded-2xl w-[440px] max-w-full overflow-hidden shadow-xl',
    card: '!shadow-none !border-0 !bg-transparent !rounded-none',
    footer: '!shadow-none !border-0 !bg-transparent !rounded-none',
    headerTitle: 'text-stone-900 font-bold', headerSubtitle: 'text-stone-600',
    socialButtonsBlockButtonText: 'text-stone-800 font-semibold', formFieldLabel: 'text-stone-700 font-semibold',
    footerActionLink: 'text-red-700 font-semibold', footerActionText: 'text-stone-600',
    dividerText: 'text-stone-500', identityPreviewEditButton: 'text-red-700',
    formFieldSuccessText: 'text-green-800', alertText: 'text-stone-800', logoBox: 'mb-2',
    logoImage: 'max-h-10', socialButtonsBlockButton: 'border-stone-200 hover:bg-stone-50',
    formButtonPrimary: 'bg-red-700 hover:bg-red-800 text-white font-semibold',
    formFieldInput: 'border-stone-300 text-stone-900 focus:ring-red-700',
    footerAction: 'border-t border-stone-200', dividerLine: 'bg-stone-200',
    alert: 'border-stone-200', otpCodeFieldInput: 'border-stone-300',
    formFieldRow: 'mb-4', main: 'gap-5',
  },
};

function ClerkCacheSync() {
  const { addListener } = useClerk();
  const qc = useQueryClient();
  const lastUser = useRef<string | null | undefined>(undefined);
  useEffect(() => addListener(({ user }) => {
    const id = user?.id ?? null;
    if (lastUser.current !== undefined && lastUser.current !== id) qc.clear();
    lastUser.current = id;
  }), [addListener, qc]);
  return null;
}

function SignInPage() {
  return <AuthFrame><SignIn routing="path" path={`${basePath}/sign-in`} signUpUrl={`${basePath}/sign-up`} /></AuthFrame>;
}
function SignUpPage() {
  return <AuthFrame><SignUp routing="path" path={`${basePath}/sign-up`} signInUrl={`${basePath}/sign-in`} /></AuthFrame>;
}
function AuthFrame({ children }: { children: ReactNode }) {
  return <div className="min-h-[100dvh] flex flex-col items-center justify-center bg-[#f6f3ef] px-4 py-10">
    <Link href="/" className="mb-7 flex items-center gap-3" data-testid="link-auth-home">
      <img src="https://rekker.co.ke/Logo.jpg" className="h-9 w-auto" alt="Rekker" data-testid="img-auth-logo" />
      <span className="border-l border-stone-300 pl-3 text-sm font-semibold text-stone-600">PeopleOS</span>
    </Link>
    {children}
    <p className="mt-6 text-xs text-stone-500" data-testid="text-auth-security">Secure access for Rekker teams</p>
  </div>;
}

function Home() {
  const { user } = useUser();
  return <div className="min-h-[100dvh] bg-[#f7f5f1]">
    <header className="mx-auto flex max-w-[1320px] items-center justify-between px-5 py-5 md:px-10">
      <Link href="/" className="flex items-center gap-3" data-testid="link-home-brand">
        <img src="https://rekker.co.ke/Logo.jpg" alt="Rekker" className="h-9 w-auto" data-testid="img-home-logo" />
        <span className="border-l border-stone-300 pl-3 font-display text-sm font-semibold text-stone-700">PeopleOS</span>
      </Link>
      <nav className="flex items-center gap-2">
        <Link href="/sign-in" className="btn btn-ghost" data-testid="link-home-signin">Sign in</Link>
        <Link href="/sign-up" className="btn btn-primary" data-testid="link-home-signup">Request access <ArrowRight size={15} /></Link>
      </nav>
    </header>
    <main className="mx-auto max-w-[1320px] px-5 pb-16 pt-8 md:px-10 md:pt-14">
      <Show when="signed-in"><Redirect to="/overview" /></Show>
      <Show when="signed-out">
        <section className="relative overflow-hidden rounded-[24px] bg-[#191817] px-7 py-12 text-white md:px-14 md:py-20">
          <div className="absolute -right-24 -top-36 h-[480px] w-[480px] rounded-full border border-white/10" />
          <div className="absolute -right-4 -top-16 h-[330px] w-[330px] rounded-full border border-white/10" />
          <div className="relative max-w-[780px] enter">
            <div className="mb-7 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/[.07] px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[.16em] text-white/75">
              <span className="h-1.5 w-1.5 rounded-full bg-[#5bb77b]" /> Workforce operations
            </div>
            <h1 className="font-display text-4xl font-semibold leading-[1.08] tracking-[-.04em] md:text-[64px]">
              People work,<br /><span className="text-[#e15a52]">in good order.</span>
            </h1>
            <p className="mt-6 max-w-[560px] text-base leading-7 text-white/70 md:text-lg">
              A clear operating view of the people behind the products moving across Kenya. Rekker PeopleOS brings everyday HR work into one dependable place.
            </p>
            <div className="mt-9 flex flex-wrap gap-3">
              <Link href="/sign-in" className="btn btn-primary min-h-12 px-5" data-testid="link-home-enter">Open PeopleOS <ArrowRight size={16} /></Link>
              <a href="https://rekker.co.ke/" target="_blank" rel="noreferrer" className="btn min-h-12 border border-white/20 px-5 text-white hover:bg-white/10" data-testid="link-official-site">rekker.co.ke ↗</a>
              <a href="https://shop.rekker.co.ke/" target="_blank" rel="noreferrer" className="btn min-h-12 border border-white/20 px-5 text-white hover:bg-white/10" data-testid="link-official-shop">shop.rekker.co.ke ↗</a>
              <Link href="/careers" className="btn min-h-12 border border-white/20 px-5 text-white hover:bg-white/10" data-testid="link-home-careers">Careers</Link>
            </div>
          </div>
          <div className="relative mt-14 grid max-w-[800px] grid-cols-1 gap-px overflow-hidden rounded-xl border border-white/10 bg-white/10 sm:grid-cols-3">
            {[
              ['01', 'People records', 'One current view of teams and roles'],
              ['02', 'Operational rhythm', 'Requests and approvals with clear ownership'],
              ['03', 'Accountable access', 'Role-aware tools and an audit trail'],
            ].map(([n, title, copy]) => <div key={n} className="bg-[#211f1d] p-5" data-testid={`card-home-pillar-${n}`}>
              <span className="font-mono text-xs text-[#e15a52]">{n}</span><h2 className="mt-3 font-display text-lg font-semibold">{title}</h2>
              <p className="mt-1 text-sm leading-5 text-white/55">{copy}</p>
            </div>)}
          </div>
        </section>
        <section className="grid gap-12 py-14 md:grid-cols-[1fr_1.15fr] md:items-center md:py-20">
          <div><p className="text-xs font-bold uppercase tracking-[.16em] text-[#C71D1D]">Built for the real work</p>
            <h2 className="mt-4 max-w-lg font-display text-3xl font-semibold tracking-[-.035em] text-stone-900 md:text-4xl">From production floor to nationwide routes.</h2>
          </div>
          <p className="max-w-xl text-base leading-7 text-stone-600">Rekker is a manufacturer, brand developer and nationwide distributor across Kenya. PeopleOS is shaped around the practical work of supporting that workforce: visible teams, clear coverage, timely decisions and a record of what changed.</p>
        </section>
        <section className="grid gap-3 border-t border-stone-200 pt-7 sm:grid-cols-3">
          {[
            ['01 / SEE', 'A workforce overview grounded in the records available to your role.'],
            ['02 / ACT', 'Move people and leave workflows forward without losing the context.'],
            ['03 / TRUST', 'Keep access role-aware and decisions traceable.'],
          ].map(([tag, text]) => <div key={tag} className="py-4 pr-5" data-testid={`text-home-principle-${tag.slice(0, 2)}`}><span className="text-[11px] font-bold tracking-[.14em] text-stone-400">{tag}</span><p className="mt-3 text-sm leading-6 text-stone-700">{text}</p></div>)}
        </section>
        {user ? <p className="sr-only" data-testid="text-signedin-name">{user.fullName}</p> : null}
      </Show>
    </main>
    <footer className="mx-auto flex max-w-[1320px] flex-col gap-2 border-t border-stone-200 px-5 py-6 text-xs text-stone-500 sm:flex-row sm:justify-between md:px-10">
      <span>Rekker PeopleOS</span><span>People operations for a distributed workforce</span>
    </footer>
  </div>;
}

type NavItem = { label: string; href: string; icon: typeof Users; permission?: 'canViewAudit' | 'canViewPayroll' | 'canManageSettings' };
const primaryNav: NavItem[] = [
  { label: 'Overview', href: '/overview', icon: LayoutDashboard },
  { label: 'My workspace', href: '/self-service', icon: UserCheck },
  { label: 'People', href: '/people', icon: Users },
  { label: 'Organization', href: '/organization', icon: GitBranch },
  { label: 'Leave', href: '/leave', icon: CalendarDays },
  { label: 'Approvals', href: '/approvals', icon: BadgeCheck },
];
const workNav: NavItem[] = [
  { label: 'Recruitment', href: '/recruitment', icon: BriefcaseBusiness },
  { label: 'Onboarding', href: '/onboarding', icon: ArrowRight },
  { label: 'Attendance', href: '/attendance', icon: Clock3 },
  { label: 'Payroll', href: '/payroll', icon: Activity, permission: 'canViewPayroll' },
  { label: 'Expenses', href: '/expenses', icon: Receipt },
  { label: 'Company assets', href: '/assets', icon: Laptop },
  { label: 'Performance', href: '/performance', icon: ArrowUpRight },
  { label: 'Learning', href: '/learning', icon: FileText },
  { label: 'Documents', href: '/documents', icon: FileText },
  { label: 'ML intelligence', href: '/ml', icon: BrainCircuit },
  { label: 'Reports & Analytics', href: '/reports', icon: ArrowDownRight },
];
const commercialNav: NavItem[] = [
  { label: 'CRM & Quotes', href: '/crm', icon: Target },
  { label: 'Partner approvals', href: '/partner-approvals', icon: Handshake },
];

function AppHomeRedirect() { return <><Show when="signed-in"><Redirect to="/overview" /></Show><Show when="signed-out"><Home /></Show></>; }

function ProtectedRouter() {
  return <><Show when="signed-in"><AppFrame /></Show><Show when="signed-out"><Redirect to="/sign-in" /></Show></>;
}
function AppFrame() {
  const { data: auth, isLoading, isError, refetch } = useGetAuthContext();
  const [location, setLocation] = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [notifOpen, setNotifOpen] = useState(false);
  const [darkMode, setDarkMode] = useState(() => typeof window !== 'undefined' && window.localStorage.getItem('peopleos-theme') === 'dark');
  const { signOut } = useClerk();

  const approvalsQuery = useListApprovals();
  const quickEmployees = useListEmployees({ page: 1, pageSize: 25 });
  const aiApprovalsQuery = useQuery({
    queryKey: ['header-ai-approvals'],
    queryFn: () => apiGet<{ items?: Array<{ id: string; summary: string; agentKey: string; status: string }> }>('/api/ai/approvals'),
    enabled: !!auth,
  });

  useEffect(() => {
    document.documentElement.classList.toggle('dark', darkMode);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem('peopleos-theme', darkMode ? 'dark' : 'light');
    }
  }, [darkMode]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setSearchOpen(prev => !prev);
      }
      if (e.key === 'Escape') {
        setSearchOpen(false);
        setNotifOpen(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  if (isLoading) return <LoadingScreen label="Loading your workspace" />;
  if (isError || !auth) return <ErrorState onRetry={() => refetch()} title="Workspace access unavailable" />;
  const visibleWorkNav = workNav.filter(item => item.permission !== 'canViewPayroll' || auth.canViewPayroll);
  const nav = [...primaryNav, ...commercialNav, ...visibleWorkNav, { label: 'Agent hub', href: '/agent-hub', icon: Sparkles }, ...(auth.canViewAudit ? [{ label: 'Audit trail', href: '/audit', icon: ShieldCheck, permission: 'canViewAudit' as const }] : []), ...(auth.canManageSettings ? [{ label: 'Settings', href: '/settings', icon: Settings2, permission: 'canManageSettings' as const }] : [])];

  const pendingApprovals = Array.isArray(approvalsQuery.data) ? approvalsQuery.data : [];
  const pendingAiApprovals = (aiApprovalsQuery.data?.items ?? []).filter(a => a.status === 'pending');
  const notificationCount = pendingApprovals.length + pendingAiApprovals.length;

  const qLower = searchQuery.trim().toLowerCase();
  const matchedNav = nav.filter(n => !qLower || n.label.toLowerCase().includes(qLower) || n.href.toLowerCase().includes(qLower)).slice(0, 6);
  const matchedPeople = (quickEmployees.data?.items ?? []).filter(p => !qLower || `${p.firstName} ${p.lastName} ${p.jobTitle} ${p.employeeNumber} ${p.departmentName}`.toLowerCase().includes(qLower)).slice(0, 6);

  const renderNav = (items: NavItem[]) => items.map(item => {
    const Icon = item.icon;
    return <Link key={item.href} href={item.href} onClick={() => setMobileOpen(false)} data-testid={`link-nav-${item.href.slice(1)}`}
      className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-[13px] font-semibold transition-colors ${location === item.href || (item.href === '/people' && location.startsWith('/people/')) ? 'bg-[#f9e9e6] text-[#a91919]' : 'text-stone-600 hover:bg-stone-100 hover:text-stone-950'}`}>
      <Icon size={17} strokeWidth={1.8} /><span>{item.label}</span>
      {item.href === '/approvals' && <span className="ml-auto rounded-full bg-[#f5d8d4] px-2 py-0.5 text-[10px] text-[#a91919]" data-testid="badge-approvals-nav">{notificationCount > 0 ? notificationCount : 'Open'}</span>}
    </Link>;
  });
  return <div className="app-shell">
    <div className="flex min-h-[100dvh]">
      {mobileOpen && <button aria-label="Close navigation" className="fixed inset-0 z-30 bg-stone-950/40 md:hidden" onClick={() => setMobileOpen(false)} data-testid="button-close-nav-overlay" />}
      <aside className={`fixed inset-y-0 left-0 z-40 flex w-[248px] flex-col border-r border-stone-200 bg-white transition-transform md:sticky md:top-0 md:h-[100dvh] md:translate-x-0 ${mobileOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="flex h-[72px] items-center justify-between border-b border-stone-100 px-5">
          <Link href="/overview" className="flex items-center gap-3" data-testid="link-sidebar-brand">
            <img src="https://rekker.co.ke/Logo.jpg" alt="Rekker" className="h-8 w-auto" data-testid="img-sidebar-logo" />
            <span className="border-l border-stone-300 pl-3 font-display text-[13px] font-bold text-stone-800">PeopleOS</span>
          </Link>
          <button className="btn btn-ghost min-h-8 px-2 md:hidden" onClick={() => setMobileOpen(false)} aria-label="Close menu" data-testid="button-close-menu"><X size={17} /></button>
        </div>
        <div className="px-3 pt-5">
          <div className="mb-2 px-3 text-[10px] font-bold uppercase tracking-[.16em] text-stone-400">Workspace</div>{renderNav(primaryNav)}
        </div>
        <div className="mt-6 flex-1 overflow-y-auto px-3">
          <div className="mb-2 px-3 text-[10px] font-bold uppercase tracking-[.16em] text-stone-400">Commercial &amp; CRM</div>{renderNav(commercialNav)}
          <div className="mb-2 mt-6 px-3 text-[10px] font-bold uppercase tracking-[.16em] text-stone-400">People operations</div>{renderNav(visibleWorkNav)}
          <div className="mb-2 mt-6 px-3 text-[10px] font-bold uppercase tracking-[.16em] text-stone-400">Governance</div>{renderNav(nav.slice(primaryNav.length + commercialNav.length + visibleWorkNav.length))}
        </div>
        <div className="border-t border-stone-100 p-3">
          <div className="mb-2 grid grid-cols-2 gap-1.5">
            <a href="https://rekker.co.ke/" target="_blank" rel="noreferrer" className="flex items-center justify-center rounded-lg border border-stone-200 py-1.5 text-[11px] font-semibold text-stone-700 hover:bg-stone-50" data-testid="link-ext-rekker">rekker.co.ke ↗</a>
            <a href="https://shop.rekker.co.ke/" target="_blank" rel="noreferrer" className="flex items-center justify-center rounded-lg border border-stone-200 py-1.5 text-[11px] font-semibold text-stone-700 hover:bg-stone-50" data-testid="link-ext-shop">shop.rekker ↗</a>
          </div>
          <div className="mb-2 grid grid-cols-2 gap-1.5">
            <Link href="/portal" className="flex items-center justify-center rounded-lg bg-stone-100 py-1.5 text-[11px] font-semibold text-stone-700 hover:bg-stone-200">Buyer Portal</Link>
            <Link href="/distributor" className="flex items-center justify-center rounded-lg bg-stone-100 py-1.5 text-[11px] font-semibold text-stone-700 hover:bg-stone-200">Partner Portal</Link>
          </div>
          <div className="mb-3 rounded-xl bg-[#f7f4f0] p-3">
            <div className="flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-[#338956]" /><span className="text-xs font-bold text-stone-800">{auth.isDemo ? 'Demo workspace' : 'Live workspace'}</span></div>
            <p className="mt-1 text-[11px] leading-4 text-stone-500">{auth.organizationName} · {auth.role.replaceAll('_', ' ')}</p>
          </div>
          <button onClick={() => signOut({ redirectUrl: basePath || '/' })} className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-xs font-semibold text-stone-600 hover:bg-stone-100" data-testid="button-sign-out"><LogOut size={16} /> Sign out</button>
        </div>
      </aside>
      <div className="min-w-0 flex-1">
        <header className="sticky top-0 z-20 flex h-[68px] items-center justify-between border-b border-stone-200 bg-[#fbfaf8]/95 px-4 backdrop-blur md:px-8">
          <div className="flex items-center gap-3">
            <button className="btn btn-ghost min-h-9 px-2 md:hidden" onClick={() => setMobileOpen(true)} aria-label="Open menu" data-testid="button-open-menu"><Menu size={19} /></button>
            <span className="text-[11px] font-semibold text-stone-400">REKKER /</span><span className="text-xs font-bold text-stone-800">{nav.find(n => n.href === location)?.label ?? (location.startsWith('/people/') ? 'Employee profile' : 'PeopleOS')}</span>
          </div>
          <div className="relative flex items-center gap-2 md:gap-3">
            <button onClick={() => setSearchOpen(true)} className="hidden items-center gap-2 rounded-lg border border-stone-200 bg-white px-3 py-1.5 text-xs text-stone-500 hover:border-stone-300 sm:inline-flex" data-testid="button-global-search">
              <Search size={14} /><span>Quick jump</span><kbd className="rounded bg-stone-100 px-1.5 py-0.5 text-[10px] font-semibold text-stone-400">⌘K</kbd>
            </button>
            <button onClick={() => setSearchOpen(true)} className="btn btn-ghost min-h-9 px-2 sm:hidden" aria-label="Quick search"><Search size={17} /></button>
            <button onClick={() => setDarkMode(d => !d)} className="btn btn-ghost min-h-9 px-2" aria-label={darkMode ? 'Switch to light mode' : 'Switch to dark mode'} data-testid="button-theme-toggle">
              {darkMode ? <Sun size={17} /> : <Moon size={17} />}
            </button>
            <div className="relative">
              <button onClick={() => setNotifOpen(o => !o)} className="btn btn-ghost relative min-h-9 px-2" aria-label="Notifications" data-testid="button-notifications">
                <Bell size={17} />
                {notificationCount > 0 && <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-[#C71D1D] px-1 text-[9px] font-bold text-white">{notificationCount}</span>}
              </button>
              {notifOpen && <div className="surface absolute right-0 top-11 z-50 w-80 p-4 shadow-xl" data-testid="popover-notifications">
                <div className="flex items-center justify-between border-b border-stone-100 pb-2"><span className="text-xs font-bold text-stone-900">Action queue ({notificationCount})</span><button onClick={() => setNotifOpen(false)} className="text-stone-400 hover:text-stone-700"><X size={14} /></button></div>
                <div className="mt-3 max-h-64 space-y-2 overflow-y-auto">
                  {pendingAiApprovals.map(a => <Link key={a.id} href="/agent-hub" onClick={() => setNotifOpen(false)} className="block rounded-lg border border-amber-200 bg-amber-50/70 p-2.5 text-xs hover:bg-amber-50"><p className="font-bold text-amber-900">AI proposal · {a.agentKey}</p><p className="mt-0.5 text-amber-800">{a.summary}</p></Link>)}
                  {pendingApprovals.slice(0, 5).map(item => <Link key={item.id} href="/approvals" onClick={() => setNotifOpen(false)} className="block rounded-lg border border-stone-200 p-2.5 text-xs hover:bg-stone-50"><p className="font-bold text-stone-800">{item.requester}</p><p className="mt-0.5 text-stone-500">{item.title} · {item.type.replaceAll('_', ' ')}</p></Link>)}
                  {notificationCount === 0 && <p className="py-4 text-center text-xs text-stone-500">All queues are clear.</p>}
                </div>
              </div>}
            </div>
            <span className="hidden text-xs text-stone-500 sm:inline" data-testid="text-auth-display-name">{auth.displayName}</span>
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[#eee2d8] font-display text-xs font-bold text-stone-700" data-testid="avatar-user">{auth.displayName.split(' ').map(v => v[0]).join('').slice(0, 2).toUpperCase()}</div>
          </div>
        </header>
        {auth.isDemo && <div className="border-b border-[#e9d2aa] bg-[#fbf1dc] px-4 py-2 text-center text-[11px] font-semibold text-[#76551d] md:text-left md:px-8" data-testid="banner-demo-mode">Demo data · Synthetic workforce records are shown. Decisions are not applied to real employee records.</div>}
        <main className="mx-auto max-w-[1480px] px-4 py-6 md:px-8 md:py-8 enter">
          <Switch>
            <Route path="/dashboard"><Redirect to="/overview" /></Route>
            <Route path="/overview" component={OverviewPage} />
            <Route path="/self-service" component={SelfServicePage} />
            <Route path="/people" component={PeoplePage} />
            <Route path="/people/:employeeId" component={EmployeePage} />
            <Route path="/organization" component={OrganizationPage} />
            <Route path="/leave" component={LeavePage} />
            <Route path="/approvals" component={ApprovalsPage} />
            <Route path="/audit" component={AuditPage} />
            <Route path="/ai" component={AgentHubPage} />
            <Route path="/agent-hub" component={AgentHubPage} />
            <Route path="/settings" component={SettingsPage} />
            <Route path="/recruitment" component={RecruitmentPage} />
            <Route path="/onboarding" component={OnboardingPage} />
            <Route path="/attendance" component={AttendancePage} />
            <Route path="/payroll" component={PayrollPage} />
            <Route path="/expenses" component={ExpensesPage} />
            <Route path="/assets" component={AssetsPage} />
            <Route path="/performance" component={PerformancePage} />
            <Route path="/learning" component={LearningPage} />
            <Route path="/documents" component={DocumentsPage} />
            <Route path="/ml" component={PredictiveMlPage} />
            <Route path="/reports" component={ReportsPage} />
            <Route path="/crm" component={CrmPipelinePage} />
            <Route path="/partner-approvals" component={PartnerApprovalsPage} />
            <Route component={NotFound} />
          </Switch>
        </main>
      </div>
    </div>
    {searchOpen && <div className="fixed inset-0 z-50 flex items-start justify-center bg-stone-950/50 p-4 pt-20" onClick={() => setSearchOpen(false)} data-testid="dialog-global-search">
      <div className="surface w-full max-w-lg overflow-hidden shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center gap-2 border-b border-stone-200 px-4 py-3">
          <Search size={16} className="text-stone-400" />
          <input autoFocus value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder="Jump to any PeopleOS module or employee..." className="w-full bg-transparent text-sm text-stone-900 outline-none" data-testid="input-global-search" />
          <button onClick={() => setSearchOpen(false)} className="text-xs font-semibold text-stone-400 hover:text-stone-700">Esc</button>
        </div>
        <div className="max-h-80 overflow-y-auto p-3 space-y-4">
          {matchedNav.length > 0 && <div><p className="px-2 text-[10px] font-bold uppercase tracking-[.14em] text-stone-400">Modules</p><div className="mt-1 space-y-1">{matchedNav.map(item => { const Icon = item.icon; return <button key={item.href} onClick={() => { setLocation(item.href); setSearchOpen(false); setSearchQuery(''); }} className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-xs font-semibold text-stone-700 hover:bg-stone-100"><Icon size={15} className="text-[#C71D1D]" /><span>{item.label}</span><span className="ml-auto text-[10px] text-stone-400">{item.href}</span></button>; })}</div></div>}
          {matchedPeople.length > 0 && <div><p className="px-2 text-[10px] font-bold uppercase tracking-[.14em] text-stone-400">People</p><div className="mt-1 space-y-1">{matchedPeople.map(emp => <button key={emp.id} onClick={() => { setLocation(`/people/${emp.id}`); setSearchOpen(false); setSearchQuery(''); }} className="flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-left text-xs hover:bg-stone-100"><span><strong className="text-stone-800">{emp.firstName} {emp.lastName}</strong> <span className="text-stone-500">· {emp.jobTitle}</span></span><span className="font-mono text-[10px] text-stone-400">{emp.employeeNumber}</span></button>)}</div></div>}
          {matchedNav.length === 0 && matchedPeople.length === 0 && <p className="py-6 text-center text-xs text-stone-500">No modules or people match "{searchQuery}".</p>}
        </div>
      </div>
    </div>}
  </div>;
}

function PageHeading({ eyebrow, title, description, action }: { eyebrow: string; title: string; description?: string; action?: ReactNode }) {
  return <div className="mb-7 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
    <div><p className="mb-2 text-[10px] font-bold uppercase tracking-[.17em] text-[#bd2725]">{eyebrow}</p><h1 className="font-display text-3xl font-semibold tracking-[-.035em] text-stone-900 md:text-[34px]" data-testid={`heading-${title.toLowerCase().replaceAll(/[^a-z0-9]+/g, '-')}`}>{title}</h1>{description && <p className="mt-2 max-w-2xl text-sm leading-6 text-stone-500">{description}</p>}</div>
    {action}
  </div>;
}
function LoadingScreen({ label }: { label: string }) {
  return <div className="min-h-[55vh] p-5" role="status" data-testid="status-loading"><div className="skeleton mb-6 h-3 w-28" /><div className="skeleton mb-8 h-10 w-64" /><div className="grid gap-4 md:grid-cols-3"><div className="skeleton h-28" /><div className="skeleton h-28" /><div className="skeleton h-28" /></div><p className="sr-only">{label}</p></div>;
}
function ErrorState({ title, onRetry }: { title: string; onRetry: () => void }) {
  return <div className="surface flex flex-col items-start gap-3 p-6" data-testid="state-error"><div className="flex items-center gap-2 text-sm font-bold text-stone-900"><AlertCircle size={17} className="text-[#C71D1D]" />{title}</div><p className="text-sm text-stone-500">The service did not return this information. Your access and records have not been changed.</p><button className="btn btn-secondary" onClick={onRetry} data-testid="button-retry">Try again</button></div>;
}
function EmptyState({ title, message, action }: { title: string; message: string; action?: ReactNode }) {
  return <div className="flex flex-col items-center justify-center py-12 text-center" data-testid="state-empty"><div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-[#f5ede7] text-[#a2493f]"><CircleHelp size={20} /></div><h3 className="font-display text-base font-semibold text-stone-800">{title}</h3><p className="mt-1 max-w-sm text-sm leading-5 text-stone-500">{message}</p>{action && <div className="mt-4">{action}</div>}</div>;
}
function ModeBadge({ demo }: { demo: boolean }) {
  return <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-[10px] font-bold ${demo ? 'bg-[#fbf0da] text-[#785716]' : 'bg-[#e7f1e9] text-[#2e7144]'}`} data-testid={`badge-data-mode-${demo ? 'demo' : 'live'}`}>{demo ? 'Demo record' : 'Live record'}</span>;
}
function StatusPill({ status }: { status: string }) {
  const styles: Record<string, string> = { active: 'bg-[#e9f3ec] text-[#397650]', probation: 'bg-[#fff2db] text-[#8b6417]', on_leave: 'bg-[#eaf1f7] text-[#42657e]', suspended: 'bg-[#fbe9e7] text-[#a7352c]', former: 'bg-stone-100 text-stone-500', pending: 'bg-[#fff2db] text-[#8b6417]', approved: 'bg-[#e9f3ec] text-[#397650]', rejected: 'bg-[#fbe9e7] text-[#a7352c]', cancelled: 'bg-stone-100 text-stone-500' };
  return <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold capitalize ${styles[status] ?? 'bg-stone-100 text-stone-600'}`} data-testid={`status-pill-${status}`}>{status.replaceAll('_', ' ')}</span>;
}

function OverviewPage() {
  const overview = useGetPeopleOsOverview();
  const auth = useGetAuthContext();
  if (overview.isLoading) return <LoadingScreen label="Loading workforce overview" />;
  if (overview.isError || !overview.data) return <ErrorState title="Workforce overview could not load" onRetry={() => overview.refetch()} />;
  const data = overview.data;
  const rawMonthly = Array.isArray(data?.monthlyHeadcount) ? data.monthlyHeadcount : [];
  const monthlyHeadcount = rawMonthly.map(item => ({
    month: item?.month ?? '',
    headcount: typeof item?.headcount === 'number' ? item.headcount : (typeof (item as any)?.count === 'number' ? (item as any).count : 0),
  }));
  const max = Math.max(...monthlyHeadcount.map(v => v.headcount), 1);
  const rawPriorities = Array.isArray(data?.priorities) ? data.priorities : [];
  const priorities = rawPriorities.map(p => ({
    id: p?.id ?? String(Math.random()),
    title: p?.title ?? '',
    description: p?.description ?? '',
    category: (p?.category === 'approval' || p?.category === 'milestone' || p?.category === 'staffing') ? p.category : 'milestone',
    source: p?.source ?? 'People Operations',
    href: p?.href ?? '/people',
  }));
  interface OverviewDept {
    id: string;
    name: string;
    code: string;
    location: string;
    headcount: number;
    budgetedPositions: number;
    description?: string;
  }
  const rawDepartments: OverviewDept[] = Array.isArray(data?.departments)
    ? data.departments
    : Array.isArray((data as any)?.departmentHeadcount)
      ? (data as any).departmentHeadcount.map((d: any) => ({
          id: d?.departmentId ?? d?.id ?? String(Math.random()),
          name: d?.departmentName ?? d?.name ?? 'Department',
          code: d?.departmentCode ?? d?.code ?? 'DEPT',
          headcount: d?.count ?? d?.headcount ?? 0,
          budgetedPositions: d?.budgeted ?? d?.budgetedPositions ?? 0,
          location: d?.location ?? 'Nairobi, Kenya',
          description: d?.description,
        }))
      : [];
  const departments = rawDepartments;
  const statsData = data?.stats;
  const totalEmployees = statsData?.totalEmployees ?? (statsData as any)?.totalHeadcount ?? 0;
  const activeEmployees = statsData?.activeEmployees ?? (statsData as any)?.activeHeadcount ?? 0;
  const onLeave = statsData?.onLeave ?? (statsData as any)?.onLeaveHeadcount ?? 0;
  const pendingApprovals = statsData?.pendingApprovals ?? (statsData as any)?.pendingApprovalsCount ?? 0;

  const stats: { name: string; value: number; note: string; icon: typeof Users; color: string }[] = [
    { name: 'Workforce', value: totalEmployees, note: 'people records', icon: Users, color: 'stone' },
    { name: 'Active today', value: activeEmployees, note: 'active employees', icon: Activity, color: 'green' },
    { name: 'On leave', value: onLeave, note: 'away from work', icon: CalendarDays, color: 'blue' },
    { name: 'Approvals waiting', value: pendingApprovals, note: 'need a decision', icon: Clock3, color: 'red' },
  ];
  return <div>
    <PageHeading eyebrow="People operations / Overview" title="Workforce overview" description={`A practical read of today's people operations at ${auth.data?.organizationName ?? 'Rekker'}.`} action={<Link href="/people" className="btn btn-primary" data-testid="button-overview-directory">Open directory <ArrowRight size={15} /></Link>} />
    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {stats.map(({ name, value, note, icon: IconComponent, color }) => {
        return <div key={String(name)} className="surface p-5" data-testid={`card-stat-${String(name).toLowerCase().replaceAll(' ', '-')}`}>
          <div className="flex items-start justify-between"><span className="text-xs font-semibold text-stone-500">{name}</span><span className={`flex h-8 w-8 items-center justify-center rounded-lg ${color === 'red' ? 'bg-[#fae9e7] text-[#bd2725]' : color === 'green' ? 'bg-[#e8f2eb] text-[#34734d]' : color === 'blue' ? 'bg-[#e9eff4] text-[#49687e]' : 'bg-stone-100 text-stone-600'}`}><IconComponent size={16} /></span></div>
          <div className="mt-4 font-display text-3xl font-semibold tracking-[-.04em] text-stone-900" data-testid={`value-stat-${String(name).toLowerCase().replaceAll(' ', '-')}`}>{value}</div><p className="mt-1 text-xs text-stone-500">{note}</p>
        </div>;
      })}
    </section>
    <div className="mt-4 grid gap-4 xl:grid-cols-[1.45fr_1fr]">
      <section className="surface p-5 md:p-6">
        <div className="flex items-start justify-between"><div><h2 className="font-display text-lg font-semibold text-stone-900">Headcount movement</h2><p className="mt-1 text-xs text-stone-500">Monthly workforce records</p></div><span className="rounded-md bg-[#f6f1eb] px-2 py-1 text-[10px] font-bold text-stone-500">12 MONTHS</span></div>
        <div className="mt-7 flex h-[190px] items-end gap-2 border-b border-stone-200 pb-1 sm:gap-4" data-testid="chart-monthly-headcount">
          {monthlyHeadcount.map((item, i) => <div key={`${item.month}-${i}`} className="flex h-full flex-1 flex-col items-center justify-end gap-2" data-testid={`bar-headcount-${i}`}>
            <span className="text-[9px] font-semibold text-stone-500">{item.headcount}</span><div className={`w-full max-w-9 rounded-t-[4px] ${i === monthlyHeadcount.length - 1 ? 'bg-[#C71D1D]' : 'bg-[#e7c8c0]'}`} style={{ height: `${Math.max(10, item.headcount / max * 125)}px` }} />
            <span className="text-[9px] text-stone-400">{item.month.slice(0, 3)}</span>
          </div>)}
        </div>
        <div className="mt-4 flex items-center gap-2 text-xs text-stone-500"><span className="h-2 w-2 rounded-full bg-[#C71D1D]" /> Latest reported headcount</div>
      </section>
      <section className="surface p-5 md:p-6">
        <div className="flex items-start justify-between"><div><h2 className="font-display text-lg font-semibold text-stone-900">Operational priorities</h2><p className="mt-1 text-xs text-stone-500">Items raised from current PeopleOS data</p></div><span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#fae9e7] text-[#bd2725]"><Activity size={16} /></span></div>
        <div className="mt-4 divide-y divide-stone-100">
          {priorities.length ? priorities.slice(0, 4).map(item => <Link key={item.id} href={item.href} className="flex gap-3 py-4" data-testid={`link-priority-${item.id}`}>
            <span className={`mt-1 h-2 w-2 shrink-0 rounded-full ${item.category === 'approval' ? 'bg-[#C71D1D]' : item.category === 'staffing' ? 'bg-[#338956]' : 'bg-[#c3923e]'}`} />
            <span className="min-w-0 flex-1"><span className="block text-sm font-semibold text-stone-800">{item.title}</span><span className="mt-1 block text-xs leading-5 text-stone-500">{item.description}</span><span className="mt-1 block text-[10px] font-semibold text-stone-400">Source: {item.source}</span></span><ArrowRight size={14} className="mt-1 shrink-0 text-stone-400" />
          </Link>) : <EmptyState title="No priorities to surface" message="There are no workforce items to action from the current records." />}
        </div>
      </section>
    </div>
    <section className="surface mt-4 p-5 md:p-6">
      <div className="mb-5 flex items-center justify-between"><div><h2 className="font-display text-lg font-semibold text-stone-900">Teams across the operation</h2><p className="mt-1 text-xs text-stone-500">Current headcount against budgeted positions</p></div><Link href="/organization" className="text-xs font-bold text-[#a91919]" data-testid="link-overview-organization">View organization</Link></div>
      {departments.length ? <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{departments.slice(0, 6).map((dept: OverviewDept) => <div key={dept.id} className="rounded-xl border border-stone-200 p-4" data-testid={`card-overview-department-${dept.id}`}>
        <div className="flex justify-between gap-3"><div><p className="text-sm font-bold text-stone-800">{dept.name}</p><p className="mt-1 text-xs text-stone-500">{dept.location}</p></div><span className="font-mono text-[10px] text-stone-400">{dept.code}</span></div>
        <div className="mt-4 flex items-end justify-between"><span className="font-display text-2xl font-semibold text-stone-900">{dept.headcount}<small className="ml-1 text-xs font-medium text-stone-400">people</small></span><span className="text-[11px] text-stone-500">{dept.budgetedPositions} budgeted</span></div>
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-stone-100"><div className="h-full rounded-full bg-[#338956]" style={{ width: `${Math.min(100, dept.budgetedPositions ? dept.headcount / dept.budgetedPositions * 100 : 0)}%` }} /></div>
      </div>)}</div> : <EmptyState title="No department data" message="Department information will appear when available to your role." />}
    </section>
    <p className="mt-4 text-[10px] text-stone-400" data-testid="text-overview-mode">Data mode: {data.dataMode}</p>
  </div>;
}

function PeoplePage() {
  const [search, setSearch] = useState('');
  const [departmentId, setDepartmentId] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [createOpen, setCreateOpen] = useState(false);
  const auth = useGetAuthContext();
  const qc = useQueryClient();
  const params = useMemo(() => ({ search: search || undefined, departmentId: departmentId || undefined, status: status ? status as Employee['status'] : undefined, page, pageSize: 20 }), [search, departmentId, status, page]);
  const list = useListEmployees(params);
  const depts = useListDepartments();
  const create = useCreateEmployee();
  const canCreate = !!auth.data?.canManagePeople;
  return <div>
    <PageHeading eyebrow="People operations / Records" title="People directory" description="Find colleagues and review the work details available to your role." action={canCreate ? <button className="btn btn-primary" onClick={() => setCreateOpen(true)} data-testid="button-create-employee"><Plus size={16} /> Add employee</button> : undefined} />
    <div className="surface p-4">
      <div className="grid gap-3 md:grid-cols-[1fr_210px_180px_auto]">
        <label className="relative"><span className="sr-only">Search people</span><Search size={16} className="absolute left-3 top-3 text-stone-400" /><input value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} className="field pl-9" placeholder="Search name, role or employee number" data-testid="input-people-search" /></label>
        <select value={departmentId} onChange={e => { setDepartmentId(e.target.value); setPage(1); }} className="field" aria-label="Filter by department" data-testid="select-people-department"><option value="">All departments</option>{depts.data?.map(d => <option value={d.id} key={d.id}>{d.name}</option>)}</select>
        <select value={status} onChange={e => { setStatus(e.target.value); setPage(1); }} className="field" aria-label="Filter by employment status" data-testid="select-people-status"><option value="">All statuses</option>{['active','probation','on_leave','suspended','former'].map(s => <option key={s} value={s}>{s.replaceAll('_',' ')}</option>)}</select>
        <button onClick={() => { setSearch(''); setDepartmentId(''); setStatus(''); setPage(1); }} className="btn btn-secondary" data-testid="button-clear-people-filters"><Filter size={14} /> Clear</button>
      </div>
      <div className="mt-4 flex items-center justify-between text-xs text-stone-500"><span data-testid="text-people-result-count">{list.data ? `${list.data.total} records` : 'Loading records'}</span><span>{list.data?.dataMode ?? '—'} data</span></div>
      {list.isLoading ? <div className="mt-4 space-y-3" data-testid="state-people-loading">{[1,2,3,4].map(i => <div className="skeleton h-[60px]" key={i} />)}</div> : list.isError ? <div className="mt-4"><ErrorState title="People records could not load" onRetry={() => list.refetch()} /></div> : !list.data?.items.length ? <EmptyState title="No people found" message="Try another name or adjust the department and status filters." action={canCreate && <button onClick={() => setCreateOpen(true)} className="btn btn-primary" data-testid="button-empty-create-employee"><Plus size={14} /> Add employee</button>} /> :
        <div className="mt-4 overflow-x-auto"><table className="w-full min-w-[760px] text-left"><thead><tr className="border-b border-stone-200 text-[10px] uppercase tracking-[.12em] text-stone-400"><th className="px-3 py-3 font-bold">Employee</th><th className="px-3 py-3 font-bold">Role / team</th><th className="px-3 py-3 font-bold">Location</th><th className="px-3 py-3 font-bold">Status</th><th className="px-3 py-3 font-bold">Started</th><th /></tr></thead><tbody>
          {list.data.items.map(employee => <tr key={employee.id} className="data-row hover:bg-[#fcfaf7]" data-testid={`row-employee-${employee.id}`}>
            <td className="px-3 py-4"><Link href={`/people/${employee.id}`} className="flex items-center gap-3" data-testid={`link-employee-${employee.id}`}><Avatar employee={employee} /><span><span className="block text-sm font-bold text-stone-800">{employee.preferredName || employee.firstName} {employee.lastName}</span><span className="mt-1 block text-[11px] text-stone-500">{employee.employeeNumber} · {employee.workEmail}</span></span></Link></td>
            <td className="px-3 py-4"><span className="block text-xs font-semibold text-stone-700">{employee.jobTitle}</span><span className="mt-1 block text-[11px] text-stone-500">{employee.departmentName}</span></td><td className="px-3 py-4 text-xs text-stone-600">{employee.location}</td><td className="px-3 py-4"><StatusPill status={employee.status} /></td><td className="px-3 py-4 text-xs text-stone-500">{formatDate(employee.startDate)}</td><td className="px-3 py-4"><Link href={`/people/${employee.id}`} className="btn btn-ghost min-h-8 px-2" aria-label={`View ${employee.firstName}`} data-testid={`button-view-employee-${employee.id}`}><ChevronRight size={16} /></Link></td>
          </tr>)}
        </tbody></table>
        <div className="flex items-center justify-between border-t border-stone-100 pt-4"><span className="text-xs text-stone-500">Page {list.data.page} of {Math.max(1, Math.ceil(list.data.total / list.data.pageSize))}</span><div className="flex gap-2"><button className="btn btn-secondary min-h-8 px-3" disabled={page <= 1} onClick={() => setPage(v => v - 1)} data-testid="button-people-prev"><ChevronLeft size={14} /> Previous</button><button className="btn btn-secondary min-h-8 px-3" disabled={page * list.data.pageSize >= list.data.total} onClick={() => setPage(v => v + 1)} data-testid="button-people-next">Next <ChevronRight size={14} /></button></div></div></div>}
    </div>
    {createOpen && <Modal title="Add employee record" onClose={() => setCreateOpen(false)} testId="dialog-create-employee">
      <EmployeeForm departments={depts.data ?? []} pending={create.isPending} onCancel={() => setCreateOpen(false)} onSubmit={values => create.mutate({ data: values }, { onSuccess: () => { qc.invalidateQueries({ queryKey: getListEmployeesQueryKey() }); qc.invalidateQueries({ queryKey: getGetPeopleOsOverviewQueryKey() }); setCreateOpen(false); }, onError: () => {} })} />
      {create.isError && <p className="mt-3 text-xs text-[#a91919]" data-testid="text-create-employee-error">Employee record could not be saved. Check required fields and your access.</p>}
    </Modal>}
  </div>;
}

function Avatar({ employee, large = false }: { employee: Employee; large?: boolean }) {
  const initials = `${employee.firstName[0] ?? ''}${employee.lastName[0] ?? ''}`.toUpperCase();
  return <span className={`flex shrink-0 items-center justify-center rounded-full bg-[#efe2d8] font-display font-bold text-[#745444] ${large ? 'h-14 w-14 text-base' : 'h-9 w-9 text-[11px]'}`} data-testid={`avatar-employee-${employee.id}`}>{initials}</span>;
}
function EmployeeForm({ departments, employee, pending, onCancel, onSubmit }: { departments: { id: string; name: string }[]; employee?: Employee; pending: boolean; onCancel: () => void; onSubmit: (values: EmployeeInput) => void }) {
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); const fd = new FormData(event.currentTarget);
    onSubmit({
      employeeNumber: String(fd.get('employeeNumber') ?? '').trim(), firstName: String(fd.get('firstName') ?? '').trim(), lastName: String(fd.get('lastName') ?? '').trim(),
      preferredName: String(fd.get('preferredName') ?? '').trim() || null, workEmail: String(fd.get('workEmail') ?? '').trim(),
      phone: String(fd.get('phone') ?? '').trim() || null, jobTitle: String(fd.get('jobTitle') ?? '').trim(),
      departmentId: String(fd.get('departmentId') ?? ''), managerId: String(fd.get('managerId') ?? '').trim() || null,
      location: String(fd.get('location') ?? '').trim(), employmentType: String(fd.get('employmentType') ?? 'permanent') as EmployeeInput['employmentType'],
      status: String(fd.get('status') ?? 'active') as EmployeeInput['status'], startDate: String(fd.get('startDate') ?? ''),
      probationEndDate: String(fd.get('probationEndDate') ?? '') || null, contractEndDate: String(fd.get('contractEndDate') ?? '') || null,
    });
  };
  return <form onSubmit={submit} className="space-y-4" data-testid="form-employee">
    {!departments.length && <div className="rounded-lg border border-[#ead4b1] bg-[#fbf3e4] p-3 text-xs leading-5 text-[#6f5a30]" data-testid="notice-no-departments">A department list is required to save an employee record. Department data is unavailable right now.</div>}
    <div className="grid gap-3 sm:grid-cols-2">
      <Field name="employeeNumber" label="Employee number" defaultValue={employee?.employeeNumber} required disabled={!!employee} />
      <Field name="workEmail" label="Work email" type="email" defaultValue={employee?.workEmail} required disabled={!!employee} />
      <Field name="firstName" label="First name" defaultValue={employee?.firstName} required disabled={!!employee} />
      <Field name="lastName" label="Last name" defaultValue={employee?.lastName} required disabled={!!employee} />
      <Field name="preferredName" label="Preferred name" defaultValue={employee?.preferredName ?? ''} />
      <Field name="phone" label="Work phone (optional)" defaultValue={employee?.phone ?? ''} />
      <Field name="jobTitle" label="Job title" defaultValue={employee?.jobTitle} required />
      <label><span className="label">Department</span><select className="field" name="departmentId" defaultValue={employee?.departmentId ?? departments[0]?.id} required data-testid="select-employee-department">{departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}</select></label>
      <Field name="location" label="Work location" defaultValue={employee?.location} required />
      <label><span className="label">Employment type</span><select name="employmentType" className="field" defaultValue={employee?.employmentType ?? 'permanent'} disabled={!!employee} data-testid="select-employee-type">{['permanent','fixed_term','casual','intern'].map(v => <option key={v} value={v}>{v.replaceAll('_',' ')}</option>)}</select></label>
      <label><span className="label">Status</span><select name="status" className="field" defaultValue={employee?.status ?? 'active'} data-testid="select-employee-status">{['active','probation','on_leave','suspended','former'].map(v => <option key={v} value={v}>{v.replaceAll('_',' ')}</option>)}</select></label>
      <Field name="startDate" label="Start date" type="date" defaultValue={employee?.startDate?.slice(0,10)} required disabled={!!employee} />
      <Field name="managerId" label="Manager employee ID (optional)" defaultValue={employee?.managerId ?? ''} />
      <Field name="probationEndDate" label="Probation end date" type="date" defaultValue={employee?.probationEndDate?.slice(0,10) ?? ''} />
      <Field name="contractEndDate" label="Contract end date" type="date" defaultValue={employee?.contractEndDate?.slice(0,10) ?? ''} />
    </div>
    <div className="flex justify-end gap-2 border-t border-stone-100 pt-4"><button type="button" className="btn btn-secondary" onClick={onCancel} data-testid="button-cancel-employee">Cancel</button><button className="btn btn-primary" disabled={pending || !departments.length} data-testid="button-save-employee">{pending ? 'Saving…' : employee ? 'Save changes' : 'Create record'}</button></div>
  </form>;
}
function Field({ name, label, type = 'text', defaultValue, required, disabled }: { name: string; label: string; type?: string; defaultValue?: string | null; required?: boolean; disabled?: boolean }) {
  return <label><span className="label">{label}</span><input name={name} type={type} className="field" defaultValue={defaultValue ?? ''} required={required} disabled={disabled} data-testid={`input-employee-${name}`} /></label>;
}
function Modal({ title, children, onClose, testId }: { title: string; children: ReactNode; onClose: () => void; testId: string }) {
  return <div className="fixed inset-0 z-50 flex items-end justify-center bg-stone-950/40 p-0 backdrop-blur-[2px] sm:items-center sm:p-4" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }} data-testid={testId}>
    <div className="max-h-[92dvh] w-full max-w-[680px] overflow-y-auto rounded-t-2xl bg-white p-5 shadow-2xl sm:rounded-2xl md:p-7">
      <div className="mb-5 flex items-center justify-between"><h2 className="font-display text-xl font-semibold text-stone-900">{title}</h2><button className="btn btn-ghost min-h-8 px-2" onClick={onClose} aria-label="Close dialog" data-testid={`button-close-${testId.replace('dialog-','')}`}><X size={17} /></button></div>{children}
    </div>
  </div>;
}
function formatDate(value: string) { if (!value) return '—'; const date = new Date(`${value.slice(0,10)}T00:00:00`); return Number.isNaN(date.valueOf()) ? value : new Intl.DateTimeFormat('en-KE', { day: 'numeric', month: 'short', year: 'numeric' }).format(date); }
function EmployeePage() {
  const params = (useLocation()[0].split('/').filter(Boolean).at(-1) ?? '');
  const employee = useGetEmployee(params, { query: { enabled: !!params, queryKey: getGetEmployeeQueryKey(params) } });
  const profile360 = useQuery({
    queryKey: ['employee-360', params],
    queryFn: () => apiGet<any>(`/api/employees/${params}/profile-360`),
    enabled: !!params,
  });
  const departments = useListDepartments();
  const auth = useGetAuthContext();
  const [editing, setEditing] = useState(false);
  const qc = useQueryClient();
  const update = useUpdateEmployee();
  if (employee.isLoading) return <LoadingScreen label="Loading employee profile" />;
  if (employee.isError || !employee.data) return <ErrorState title="Employee profile unavailable" onRetry={() => employee.refetch()} />;
  const person = employee.data;
  const p360 = profile360.data;
  return <div>
    <Link href="/people" className="mb-5 inline-flex items-center gap-2 text-xs font-bold text-stone-500 hover:text-stone-900" data-testid="link-back-people"><ChevronLeft size={15} /> People directory</Link>
    <section className="surface p-5 md:p-7">
      <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
        <Avatar employee={person} large /><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h1 className="font-display text-2xl font-semibold tracking-[-.03em] text-stone-900" data-testid="text-employee-name">{person.preferredName || person.firstName} {person.lastName}</h1><StatusPill status={person.status} /><ModeBadge demo={person.isDemo} /></div><p className="mt-1 text-sm text-stone-600">{person.jobTitle} · {person.departmentName}</p><p className="mt-1 text-xs text-stone-500">{person.employeeNumber} · {person.location}</p></div>
        {auth.data?.canManagePeople && <button className="btn btn-secondary self-start" onClick={() => setEditing(true)} data-testid="button-edit-employee"><Settings2 size={15} /> Edit details</button>}
      </div>
      <div className="mt-7 grid gap-4 border-t border-stone-100 pt-6 sm:grid-cols-2 lg:grid-cols-3">
        <Info label="Work email" value={person.workEmail} testId="employee-email" /><Info label="Work phone" value={person.phone || 'Not provided'} testId="employee-phone" />
        <Info label="Employment type" value={person.employmentType.replaceAll('_',' ')} testId="employee-type" /><Info label="Start date" value={formatDate(person.startDate)} testId="employee-start-date" />
        <Info label="Manager" value={person.managerName || 'Not assigned'} testId="employee-manager" /><Info label="Work location" value={person.location} testId="employee-location" />
        <Info label="Probation end" value={person.probationEndDate ? formatDate(person.probationEndDate) : 'Not recorded'} testId="employee-probation" /><Info label="Contract end" value={person.contractEndDate ? formatDate(person.contractEndDate) : 'Not recorded'} testId="employee-contract-end" />
      </div>
    </section>
    {p360 && <section className="mt-4 grid gap-4 lg:grid-cols-3" data-testid="section-employee-360">
      <div className="surface p-5">
        <div className="flex items-center justify-between"><h2 className="font-display text-base font-semibold text-stone-900">Statutory identifiers</h2><span className="rounded-full bg-[#e8f2eb] px-2 py-0.5 text-[10px] font-bold text-[#34734d]">ODPC Masked</span></div>
        <div className="mt-4 space-y-2.5 text-xs">
          <div className="flex justify-between"><span className="text-stone-500">KRA PIN</span><span className="font-mono font-semibold text-stone-800">{p360.statutoryIdentifiers?.kraPin ?? 'RESTRICTED'}</span></div>
          <div className="flex justify-between"><span className="text-stone-500">National ID</span><span className="font-mono font-semibold text-stone-800">{p360.statutoryIdentifiers?.nationalId ?? 'RESTRICTED'}</span></div>
          <div className="flex justify-between"><span className="text-stone-500">NSSF No.</span><span className="font-mono font-semibold text-stone-800">{p360.statutoryIdentifiers?.nssfNo ?? 'RESTRICTED'}</span></div>
          <div className="flex justify-between"><span className="text-stone-500">SHIF / SHA</span><span className="font-mono font-semibold text-stone-800">{p360.statutoryIdentifiers?.shaNo ?? 'RESTRICTED'}</span></div>
        </div>
        <p className="mt-3 text-[10px] text-stone-400">{p360.statutoryIdentifiers?.encryptionStatus ?? 'AES-256-GCM Field Protection'}</p>
      </div>
      <div className="surface p-5">
        <h2 className="font-display text-base font-semibold text-stone-900">Reporting line & emergency</h2>
        <p className="mt-3 text-xs text-stone-500">Reports to: <strong className="text-stone-800">{p360.reportingLine?.managerName || 'Executive Board'}</strong></p>
        {Array.isArray(p360.reportingLine?.directReports) && p360.reportingLine.directReports.length > 0 && <div className="mt-3"><p className="text-[10px] font-bold uppercase tracking-[.12em] text-stone-400">Direct reports</p><div className="mt-1.5 flex flex-wrap gap-1.5">{p360.reportingLine.directReports.map((r: any) => <Link key={r.id} href={`/people/${r.id}`} className="rounded-lg bg-stone-100 px-2.5 py-1 text-[11px] font-semibold text-stone-700 hover:bg-stone-200">{r.name}</Link>)}</div></div>}
        {p360.emergencyContact ? <div className="mt-4 border-t border-stone-100 pt-3 text-xs"><p className="text-[10px] font-bold uppercase tracking-[.12em] text-stone-400">Next of kin</p><p className="mt-1 font-semibold text-stone-800">{p360.emergencyContact.name} · {p360.emergencyContact.relationship}</p><p className="font-mono text-[11px] text-stone-500">{p360.emergencyContact.phone}</p></div> : <p className="mt-4 text-xs text-stone-400">Emergency contact visible to HR or self only.</p>}
      </div>
      <div className="surface p-5">
        <h2 className="font-display text-base font-semibold text-stone-900">Compensation & capabilities</h2>
        <div className="mt-3 rounded-lg bg-[#f7f4f0] p-3 text-xs">{p360.compensationSummary?.authorizedToView ? <><p className="font-semibold text-stone-800">{p360.compensationSummary.currency} · {p360.compensationSummary.payFrequency}</p><p className="mt-0.5 text-stone-500">Channel: {p360.compensationSummary.paymentChannel}</p></> : <p className="text-stone-500">Compensation visible to payroll officers or employee.</p>}</div>
        {Array.isArray(p360.skills) && p360.skills.length > 0 && <div className="mt-3 flex flex-wrap gap-1.5">{p360.skills.map((skill: string) => <span key={skill} className="rounded-full bg-[#f9e9e6] px-2.5 py-1 text-[10px] font-semibold text-[#a91919]">{skill}</span>)}</div>}
        <div className="mt-4 flex flex-wrap gap-2"><Link href="/documents" className="btn btn-secondary min-h-8 px-3 text-xs">Employment Act §10</Link>{p360.compensationSummary?.authorizedToView && <Link href="/self-service" className="btn btn-secondary min-h-8 px-3 text-xs">View P9A card</Link>}</div>
      </div>
    </section>}
    {editing && <Modal title="Edit employee details" onClose={() => setEditing(false)} testId="dialog-edit-employee">
      <EmployeeForm employee={person} departments={departments.data ?? []} pending={update.isPending} onCancel={() => setEditing(false)} onSubmit={values => {
        const data: EmployeeUpdate = { preferredName: values.preferredName, phone: values.phone, jobTitle: values.jobTitle, departmentId: values.departmentId, managerId: values.managerId, location: values.location, status: values.status, probationEndDate: values.probationEndDate, contractEndDate: values.contractEndDate };
        update.mutate({ employeeId: person.id, data }, { onSuccess: () => { qc.invalidateQueries({ queryKey: getGetEmployeeQueryKey(person.id) }); qc.invalidateQueries({ queryKey: getListEmployeesQueryKey() }); qc.invalidateQueries({ queryKey: getGetPeopleOsOverviewQueryKey() }); setEditing(false); } });
      }} />
      {update.isError && <p className="mt-3 text-xs text-[#a91919]" data-testid="text-edit-employee-error">Changes could not be saved. Check your access and try again.</p>}
    </Modal>}
  </div>;
}
function Info({ label, value, testId }: { label: string; value: string; testId: string }) {
  return <div data-testid={`info-${testId}`}><p className="text-[10px] font-bold uppercase tracking-[.12em] text-stone-400">{label}</p><p className="mt-1.5 text-sm font-semibold capitalize text-stone-700">{value}</p></div>;
}

function OrganizationPage() {
  const query = useListDepartments();
  if (query.isLoading) return <LoadingScreen label="Loading departments" />;
  if (query.isError) return <ErrorState title="Organization view could not load" onRetry={() => query.refetch()} />;
  return <div><PageHeading eyebrow="Structure / Teams" title="Organization" description="Department structure, team leads and planned capacity across the operation." />
    <div className="mb-4 flex flex-wrap gap-2"><span className="rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-stone-600 ring-1 ring-stone-200" data-testid="text-department-count">{query.data?.length ?? 0} departments</span><span className="rounded-full bg-[#e8f2eb] px-3 py-1.5 text-xs font-semibold text-[#34734d]" data-testid="text-organization-headcount">{query.data?.reduce((sum,d) => sum + d.headcount,0) ?? 0} current team members</span></div>
    {!query.data?.length ? <div className="surface"><EmptyState title="No department structure available" message="Department data will appear here once it is available to your role." /></div> :
      <div className="grid gap-4 lg:grid-cols-2">{query.data.map(dept => <section className="surface p-5 md:p-6" key={dept.id} data-testid={`card-department-${dept.id}`}>
        <div className="flex items-start justify-between"><div><span className="font-mono text-[10px] font-bold tracking-widest text-[#bd2725]">{dept.code}</span><h2 className="mt-2 font-display text-xl font-semibold text-stone-900">{dept.name}</h2></div><span className="rounded-lg bg-[#f5f1ec] p-2 text-stone-500"><GitBranch size={17} /></span></div>
        <p className="mt-2 text-sm leading-6 text-stone-500">{dept.description || 'Department information is available through the current organization record.'}</p>
        <div className="mt-5 grid grid-cols-2 gap-3 rounded-xl bg-[#faf8f5] p-4"><div><p className="text-[10px] font-bold uppercase tracking-wider text-stone-400">Headcount</p><p className="mt-1 font-display text-2xl font-semibold text-stone-900">{dept.headcount}<span className="ml-1 text-xs font-medium text-stone-400">/ {dept.budgetedPositions}</span></p></div><div><p className="text-[10px] font-bold uppercase tracking-wider text-stone-400">Department lead</p><p className="mt-2 text-sm font-semibold text-stone-700">{dept.managerName || 'Not assigned'}</p></div></div>
        <div className="mt-4 flex items-center gap-2 text-xs text-stone-500"><span className="h-2 w-2 rounded-full bg-[#338956]" />{dept.location}</div>
      </section>)}</div>}
  </div>;
}

function LeavePage() {
  const [showForm, setShowForm] = useState(false);
  const [showPolicyForm, setShowPolicyForm] = useState(false);
  const [editingPolicy, setEditingPolicy] = useState<LeavePolicy | null>(null);
  const [filter, setFilter] = useState('');
  const [balanceEmployeeId, setBalanceEmployeeId] = useState('');
  const [balanceYear, setBalanceYear] = useState(new Date().getUTCFullYear());
  const [policyFormError, setPolicyFormError] = useState(false);
  const list = useListLeaveRequests({ status: filter ? filter as 'pending' | 'approved' | 'rejected' | 'cancelled' : undefined });
  const employees = useListEmployees({ page: 1, pageSize: 100 });
  const policies = useListLeavePolicies();
  const balances = useListLeaveBalances({ year: balanceYear });
  const auth = useGetAuthContext();
  const create = useCreateLeaveRequest();
  const decide = useDecideLeaveRequest();
  const createPolicy = useCreateLeavePolicy();
  const updatePolicy = useUpdateLeavePolicy();
  const qc = useQueryClient();
  const refresh = () => {
    qc.invalidateQueries({ queryKey: getListLeaveRequestsQueryKey() });
    qc.invalidateQueries({ queryKey: getListApprovalsQueryKey() });
    qc.invalidateQueries({ queryKey: getGetPeopleOsOverviewQueryKey() });
    qc.invalidateQueries({ queryKey: getListLeavePoliciesQueryKey() });
    qc.invalidateQueries({ queryKey: getListLeaveBalancesQueryKey() });
  };
  const activePolicies = policies.data?.filter(policy => policy.active) ?? [];
  const availableBalanceEmployees = [...new Map((balances.data ?? []).map(balance => [balance.employeeId, balance.employeeName])).entries()];
  const visibleBalances = (balances.data ?? []).filter(balance => !balanceEmployeeId || balance.employeeId === balanceEmployeeId);
  const canManagePolicies = Boolean(auth.data?.canManagePeople);
  const canChooseBalanceEmployee = Boolean(auth.data?.canApproveLeave);
  const savePolicy = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const data = {
      name: String(formData.get('name') ?? '').trim(),
      entitlementDays: Number(formData.get('entitlementDays')),
      accrualMethod: String(formData.get('accrualMethod')) as 'annual' | 'monthly',
    };
    setPolicyFormError(false);
    if (editingPolicy) {
      updatePolicy.mutate({
        policyId: editingPolicy.id,
        data: { ...data, active: editingPolicy.active },
      }, {
        onSuccess: () => {
          refresh();
          setShowPolicyForm(false);
          setEditingPolicy(null);
        },
        onError: () => setPolicyFormError(true),
      });
    } else {
      createPolicy.mutate({ data }, {
        onSuccess: () => {
          refresh();
          setShowPolicyForm(false);
          setEditingPolicy(null);
        },
        onError: () => setPolicyFormError(true),
      });
    }
  };
  const togglePolicy = (policy: LeavePolicy) => {
    updatePolicy.mutate({
      policyId: policy.id,
      data: {
        name: policy.name,
        entitlementDays: policy.entitlementDays,
        accrualMethod: policy.accrualMethod,
        active: !policy.active,
      },
    }, { onSuccess: refresh });
  };
  return <div><PageHeading eyebrow="People operations / Time away" title="Leave management" description="Review requests against team coverage and keep leave decisions moving." action={<button className="btn btn-primary" disabled={!activePolicies.length} onClick={() => setShowForm(true)} data-testid="button-new-leave"><Plus size={15} /> Request leave</button>} />
    <section className="surface mb-4 p-4 md:p-5" data-testid="section-leave-balances">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div><h2 className="font-display text-lg font-semibold text-stone-900">Leave balances</h2><p className="mt-1 text-xs leading-5 text-stone-500">Remaining days subtract both approved leave and pending requests. Monthly policies accrue as the year progresses.</p></div>
        <div className="flex flex-col gap-2 sm:flex-row">
          {canChooseBalanceEmployee && <label className="min-w-48"><span className="label">Employee</span><select className="field" value={balanceEmployeeId} onChange={event => setBalanceEmployeeId(event.target.value)} data-testid="select-leave-balance-employee"><option value="">All permitted employees</option>{availableBalanceEmployees.map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></label>}
          <label className="w-full sm:w-28"><span className="label">Year</span><select className="field" value={balanceYear} onChange={event => setBalanceYear(Number(event.target.value))} data-testid="select-leave-balance-year">{Array.from({ length: 4 }, (_, index) => new Date().getUTCFullYear() - 2 + index).map(year => <option key={year} value={year}>{year}</option>)}</select></label>
        </div>
      </div>
      {balances.isLoading ? <div className="skeleton h-24" data-testid="state-leave-balances-loading" /> :
        balances.isError ? <ErrorState title="Leave balances could not load" onRetry={() => balances.refetch()} /> :
        !policies.data?.length ? <EmptyState title="Leave policies are not configured" message={canManagePolicies ? "Add organization leave types and their entitlement rules below. No statutory amounts are pre-filled." : "Your HR team has not configured leave types and entitlement rules yet."} /> :
        !visibleBalances.length ? <EmptyState title="No balances for this year" message="No leave policies or employee balances were returned for the selected year." /> :
        <div className="overflow-x-auto">
          <table className="w-full min-w-[700px] text-left text-xs" data-testid="table-leave-balances">
            <thead><tr className="border-b border-stone-200 text-[10px] font-bold uppercase tracking-wider text-stone-400">
              {canChooseBalanceEmployee && !balanceEmployeeId && <th className="px-3 py-3">Employee</th>}
              <th className="px-3 py-3">Leave type</th><th className="px-3 py-3">Entitlement</th><th className="px-3 py-3">Used</th><th className="px-3 py-3">Pending</th><th className="px-3 py-3">Remaining</th>
            </tr></thead>
            <tbody>{visibleBalances.map(balance => <tr className="border-b border-stone-100 last:border-0" key={`${balance.employeeId}-${balance.leaveType}`} data-testid={`row-leave-balance-${balance.employeeId}-${balance.leaveType}`}>
              {canChooseBalanceEmployee && !balanceEmployeeId && <td className="px-3 py-3 font-semibold text-stone-700">{balance.employeeName}</td>}
              <td className="px-3 py-3"><p className="font-semibold text-stone-800">{balance.leaveTypeName}{!balance.active && <span className="ml-2 rounded-full bg-stone-100 px-2 py-0.5 text-[9px] font-bold text-stone-500">Inactive</span>}</p><p className="mt-1 text-[10px] text-stone-400">{balance.accrualMethod === 'monthly' ? `${balance.accruedDays} of ${balance.entitlementDays} accrued` : 'Annual allocation'} · {balance.year}</p></td>
              <td className="px-3 py-3 text-stone-600">{balance.entitlementDays} days</td><td className="px-3 py-3 text-stone-600">{balance.usedDays} days</td><td className="px-3 py-3 text-stone-600">{balance.pendingDays} days</td>
              <td className={`px-3 py-3 font-bold ${balance.remainingDays < 0 ? 'text-[#a91919]' : 'text-[#34734d]'}`}>{balance.remainingDays} days</td>
            </tr>)}</tbody>
          </table>
        </div>}
    </section>
    {canManagePolicies && <section className="surface mb-4 p-4 md:p-5" data-testid="section-leave-policies">
      <div className="mb-4 flex items-start justify-between gap-3"><div><h2 className="font-display text-lg font-semibold text-stone-900">Organization leave policies</h2><p className="mt-1 text-xs text-stone-500">Set entitlements and accrual for this organization. Entitlement amounts are not pre-populated.</p></div><button className="btn btn-secondary min-h-9 shrink-0 px-3" onClick={() => { setEditingPolicy(null); setPolicyFormError(false); setShowPolicyForm(true); }} data-testid="button-add-leave-policy"><Plus size={14} /> Add leave type</button></div>
      {policies.isLoading ? <div className="skeleton h-16" data-testid="state-leave-policies-loading" /> :
        policies.isError ? <ErrorState title="Leave policies could not load" onRetry={() => policies.refetch()} /> :
        !policies.data?.length ? <EmptyState title="No leave types yet" message="Add your organization's leave types and rules. You choose the entitlement and whether it accrues annually or monthly." /> :
        <div className="divide-y divide-stone-100">{policies.data.map(policy => <article key={policy.id} className="flex flex-col gap-3 py-3 sm:flex-row sm:items-center" data-testid={`card-leave-policy-${policy.id}`}>
          <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h3 className="text-sm font-semibold text-stone-800">{policy.name}</h3><span className={`rounded-full px-2 py-0.5 text-[9px] font-bold uppercase ${policy.active ? 'bg-[#e8f2eb] text-[#34734d]' : 'bg-stone-100 text-stone-500'}`}>{policy.active ? 'Active' : 'Inactive'}</span></div><p className="mt-1 text-xs text-stone-500">{policy.entitlementDays} days per year · {policy.accrualMethod === 'monthly' ? 'Accrues monthly' : 'Granted annually'}</p></div>
          <div className="flex gap-2"><button className="btn btn-secondary min-h-9 px-3" onClick={() => { setEditingPolicy(policy); setPolicyFormError(false); setShowPolicyForm(true); }} data-testid={`button-edit-leave-policy-${policy.id}`}>Edit</button><button className="btn btn-ghost min-h-9 px-3 text-xs" disabled={updatePolicy.isPending} onClick={() => togglePolicy(policy)} data-testid={`button-toggle-leave-policy-${policy.id}`}>{policy.active ? 'Deactivate' : 'Reactivate'}</button></div>
        </article>)}</div>}
      {updatePolicy.isError && !showPolicyForm && <p className="mt-3 text-xs text-[#a91919]" data-testid="text-leave-policy-toggle-error">The leave policy status could not be changed. Refresh and try again.</p>}
    </section>}
    <div className="mb-4 grid gap-3 sm:grid-cols-3">
      {['pending','approved','rejected'].map(s => <div className="surface px-4 py-3" key={s} data-testid={`card-leave-summary-${s}`}><p className="text-[10px] font-bold uppercase tracking-wider text-stone-400">{s} requests</p><p className="mt-1 font-display text-2xl font-semibold text-stone-900">{list.data?.filter(r => r.status === s).length ?? '—'}</p></div>)}
    </div>
    <section className="surface p-4 md:p-5">
      <div className="mb-4 flex flex-col justify-between gap-3 sm:flex-row sm:items-center"><div><h2 className="font-display text-lg font-semibold text-stone-900">Leave requests</h2><p className="mt-1 text-xs text-stone-500">Records visible to your account</p></div><select className="field w-full sm:w-48" value={filter} onChange={e => setFilter(e.target.value)} aria-label="Filter leave status" data-testid="select-leave-status"><option value="">All statuses</option>{['pending','approved','rejected','cancelled'].map(s => <option key={s} value={s}>{s}</option>)}</select></div>
      {list.isLoading ? <div className="space-y-3" data-testid="state-leave-loading">{[1,2,3].map(x => <div className="skeleton h-16" key={x} />)}</div> : list.isError ? <ErrorState title="Leave requests could not load" onRetry={() => list.refetch()} /> : !list.data?.length ? <EmptyState title="No leave requests" message="Requests matching this filter will appear here." /> :
      <div className="space-y-3">{list.data.map(req => <article key={req.id} className="rounded-xl border border-stone-200 p-4" data-testid={`card-leave-request-${req.id}`}>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start"><div className="flex-1"><div className="flex flex-wrap items-center gap-2"><h3 className="text-sm font-bold text-stone-800">{req.employeeName}</h3><StatusPill status={req.status} /><ModeBadge demo={req.isDemo} /></div><p className="mt-1 text-xs capitalize text-stone-500">{req.leaveType} leave · {req.days} days</p><p className="mt-2 text-sm text-stone-700">{formatDate(req.startDate)} — {formatDate(req.endDate)}</p><p className="mt-2 text-xs leading-5 text-stone-500">{req.reason}</p></div>
          <div className="flex items-center gap-2 text-[10px] text-stone-400"><Clock3 size={13} /> Submitted {formatDate(req.submittedAt)}</div>
          {req.status === 'pending' && auth.data?.canApproveLeave && <div className="flex gap-2"><button className="btn btn-primary min-h-9 px-3" disabled={decide.isPending} onClick={() => decide.mutate({ requestId: req.id, data: { decision: 'approve' } }, { onSuccess: refresh })} data-testid={`button-approve-leave-${req.id}`}><Check size={14} /> Approve</button><button className="btn btn-secondary min-h-9 px-3" disabled={decide.isPending} onClick={() => { const comment = window.prompt('Optional reason for declining this request') ?? ''; decide.mutate({ requestId: req.id, data: { decision: 'reject', comment: comment || null } }, { onSuccess: refresh }); }} data-testid={`button-reject-leave-${req.id}`}>Decline</button></div>}
        </div>
      </article>)}</div>}
      {decide.isError && <p className="mt-3 text-xs text-[#a91919]" data-testid="text-leave-decision-error">Decision could not be saved. Refresh and confirm you still have approval access.</p>}
    </section>
    {showForm && <Modal title="Request time away" onClose={() => setShowForm(false)} testId="dialog-create-leave">
      <form className="space-y-4" data-testid="form-leave-request" onSubmit={e => { e.preventDefault(); const fd = new FormData(e.currentTarget); const data: LeaveRequestInput = { employeeId: String(fd.get('employeeId') ?? ''), leaveType: String(fd.get('leaveType')), startDate: String(fd.get('startDate')), endDate: String(fd.get('endDate')), reason: String(fd.get('reason')).trim() }; create.mutate({ data }, { onSuccess: () => { refresh(); setShowForm(false); } }); }}>
        <label><span className="label">Employee</span><select className="field" name="employeeId" required data-testid="select-leave-employee"><option value="">Select a permitted employee record</option>{employees.data?.items.map(e => <option key={e.id} value={e.id}>{e.firstName} {e.lastName} · {e.departmentName}</option>)}</select><span className="mt-1 block text-[10px] text-stone-400">Only employee records returned for your account are listed.</span></label>
        <label><span className="label">Leave type</span><select className="field" name="leaveType" required disabled={!activePolicies.length} data-testid="select-leave-type"><option value="">Select a configured leave type</option>{activePolicies.map(policy => <option key={policy.code} value={policy.code}>{policy.name} · {policy.entitlementDays} days/year</option>)}</select></label>
        <div className="grid gap-3 sm:grid-cols-2"><Field name="startDate" label="First day away" type="date" required /><Field name="endDate" label="Last day away" type="date" required /></div>
        <label><span className="label">Reason</span><textarea className="field min-h-24 resize-y" name="reason" minLength={3} maxLength={1000} required placeholder="Add context for your manager" data-testid="input-leave-reason" /></label>
        {create.isError && <p className="text-xs text-[#a91919]" data-testid="text-leave-create-error">{create.error instanceof Error ? create.error.message : 'Request could not be submitted. Check the dates, available balance, and leave type.'}</p>}
        <div className="flex justify-end gap-2 border-t border-stone-100 pt-4"><button type="button" className="btn btn-secondary" onClick={() => setShowForm(false)} data-testid="button-cancel-leave">Cancel</button><button className="btn btn-primary" disabled={create.isPending || !activePolicies.length} data-testid="button-submit-leave">{create.isPending ? 'Submitting…' : 'Submit request'}</button></div>
      </form>
    </Modal>}
    {showPolicyForm && <Modal title={editingPolicy ? 'Edit leave policy' : 'Add leave type'} onClose={() => { setShowPolicyForm(false); setEditingPolicy(null); }} testId="dialog-leave-policy">
      <form className="space-y-4" onSubmit={savePolicy} data-testid="form-leave-policy">
        <Field name="name" label="Leave type name" defaultValue={editingPolicy?.name} required />
        <label><span className="label">Annual entitlement (days)</span><input className="field" name="entitlementDays" type="number" min="0" max="366" step="1" defaultValue={editingPolicy?.entitlementDays ?? ''} required data-testid="input-leave-policy-entitlement" /></label>
        <label><span className="label">Accrual rule</span><select className="field" name="accrualMethod" defaultValue={editingPolicy?.accrualMethod ?? 'annual'} data-testid="select-leave-policy-accrual"><option value="annual">Granted annually</option><option value="monthly">Accrues monthly</option></select></label>
        {policyFormError && <p className="text-xs text-[#a91919]" data-testid="text-leave-policy-error">{createPolicy.error instanceof Error ? createPolicy.error.message : updatePolicy.error instanceof Error ? updatePolicy.error.message : 'The policy could not be saved. Check the values and whether this leave type already exists.'}</p>}
        <div className="flex justify-end gap-2 border-t border-stone-100 pt-4"><button type="button" className="btn btn-secondary" onClick={() => { setShowPolicyForm(false); setEditingPolicy(null); }} data-testid="button-cancel-leave-policy">Cancel</button><button className="btn btn-primary" disabled={createPolicy.isPending || updatePolicy.isPending} data-testid="button-save-leave-policy">{createPolicy.isPending || updatePolicy.isPending ? 'Saving…' : 'Save policy'}</button></div>
      </form>
    </Modal>}
  </div>;
}

function ApprovalsPage() {
  const approvals = useListApprovals();
  const leaves = useListLeaveRequests({ status: 'pending' });
  const decide = useDecideLeaveRequest();
  const qc = useQueryClient();
  const auth = useGetAuthContext();
  const refresh = () => { qc.invalidateQueries({ queryKey: getListApprovalsQueryKey() }); qc.invalidateQueries({ queryKey: getListLeaveRequestsQueryKey() }); qc.invalidateQueries({ queryKey: getGetPeopleOsOverviewQueryKey() }); };
  if (approvals.isLoading) return <LoadingScreen label="Loading manager approvals" />;
  if (approvals.isError) return <ErrorState title="Approvals could not load" onRetry={() => approvals.refetch()} />;
  return <div><PageHeading eyebrow="People operations / Decisions" title="Approvals" description="Manager tasks routed for a decision. Each action updates the originating request." />
    {auth.data?.canApproveLeave && <div className="mb-4 flex items-center gap-3 rounded-xl border border-[#e8d5b4] bg-[#fbf4e7] p-4" data-testid="notice-approval-permission"><ShieldCheck size={17} className="text-[#8b6417]" /><p className="text-xs leading-5 text-[#6b552b]">Approval actions are governed by your account permissions. The API remains the authority for each decision.</p></div>}
    {!approvals.data?.length ? <div className="surface"><EmptyState title="No decisions waiting" message="When an item needs your attention, it will appear here." /></div> : <div className="grid gap-3">{approvals.data.map(item => {
      const req = leaves.data?.find(r => r.id === item.id);
      return <article className="surface flex flex-col gap-4 p-5 md:flex-row md:items-center" key={item.id} data-testid={`card-approval-${item.id}`}>
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#fae9e7] text-[#b22020]"><BadgeCheck size={18} /></div>
        <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h2 className="text-sm font-bold text-stone-800">{item.title}</h2><span className="rounded-full bg-stone-100 px-2 py-1 text-[9px] font-bold uppercase text-stone-500">{item.type.replaceAll('_',' ')}</span></div><p className="mt-1 text-xs text-stone-500">Requested by {item.requester} · {formatDate(item.submittedAt)}</p>{req && <p className="mt-2 text-xs text-stone-600">{req.days} days · {formatDate(req.startDate)} to {formatDate(req.endDate)} · {req.reason}</p>}</div>
        {((item.type as any) === 'leave' || (item.type as any) === 'leave_request') && auth.data?.canApproveLeave && req && <div className="flex gap-2"><button className="btn btn-primary min-h-9 px-3" disabled={decide.isPending} onClick={() => decide.mutate({ requestId: req.id, data: { decision:'approve' } }, { onSuccess: refresh })} data-testid={`button-approval-approve-${item.id}`}><Check size={14} /> Approve</button><button className="btn btn-secondary min-h-9 px-3" disabled={decide.isPending} onClick={() => { const comment = window.prompt('Optional reason for declining this request') ?? ''; decide.mutate({ requestId: req.id, data: { decision:'reject', comment: comment || null } }, { onSuccess: refresh }); }} data-testid={`button-approval-reject-${item.id}`}>Decline</button></div>}
        {(!req || ((item.type as any) !== 'leave' && (item.type as any) !== 'leave_request')) && <Link href={item.href} className="btn btn-secondary min-h-9" data-testid={`link-approval-open-${item.id}`}>Open item <ArrowRight size={14} /></Link>}
      </article>;
    })}</div>}
    {decide.isError && <div className="mt-4"><ErrorState title="Decision could not be saved" onRetry={refresh} /></div>}
    <div className="mt-5 text-[10px] text-stone-400" data-testid="text-approvals-count">{approvals.data?.length ?? 0} items routed to your approval queue</div>
  </div>;
}

function AuditPage() {
  const auth = useGetAuthContext();
  const audit = useListAuditEvents({ limit: 100 }, { query: { enabled: !!auth.data?.canViewAudit, queryKey: getListAuditEventsQueryKey({ limit: 100 }) } });
  if (auth.isLoading) return <LoadingScreen label="Checking audit access" />;
  if (!auth.data?.canViewAudit) return <div><PageHeading eyebrow="Governance" title="Audit trail" /><div className="surface"><EmptyState title="Restricted area" message="Audit events are available only to designated audit roles. Ask your system administrator if your role should include this access." /></div></div>;
  if (audit.isLoading) return <LoadingScreen label="Loading audit events" />;
  if (audit.isError) return <ErrorState title="Audit events could not load" onRetry={() => audit.refetch()} />;
  return <div><PageHeading eyebrow="Governance / Record of changes" title="Audit trail" description="A chronological record of actions returned for your authorized audit view." />
    {!audit.data?.length ? <div className="surface"><EmptyState title="No audit events" message="No events were returned for this timeline." /></div> :
    <div className="surface divide-y divide-stone-100">{audit.data.map((event,i) => <div className="flex gap-4 p-4 md:p-5" key={event.id} data-testid={`row-audit-event-${event.id}`}>
      <div className="flex w-20 shrink-0 flex-col items-end pt-1 text-right"><span className="text-[10px] font-bold text-stone-700">{formatDate(event.occurredAt)}</span><span className="mt-1 text-[10px] text-stone-400">{new Date(event.occurredAt).toLocaleTimeString('en-KE',{hour:'2-digit',minute:'2-digit'})}</span></div>
      <div className="relative flex w-5 shrink-0 justify-center"><span className={`mt-1 h-2.5 w-2.5 rounded-full ${i === 0 ? 'bg-[#C71D1D]' : 'bg-stone-300'}`} />{i !== (audit.data?.length ?? 0) - 1 && <span className="absolute top-4 h-full w-px bg-stone-200" />}</div>
      <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><span className="text-sm font-bold text-stone-800">{event.action}</span><ModeBadge demo={event.isDemo} /></div><p className="mt-1 text-xs leading-5 text-stone-600">{event.summary}</p><p className="mt-2 text-[10px] text-stone-400">By {event.actor} · {event.targetType} · Ref {event.targetId}</p></div>
    </div>)}</div>}
  </div>;
}



function SettingsPage() {
  const auth = useGetAuthContext();
  const provider = useGetAgentProviderStatus();
  const securityQuery = useQuery({
    queryKey: ['security-status'],
    queryFn: () => apiGet<any>('/api/security/status'),
    enabled: !!auth.data?.canManageSettings,
  });
  if (auth.isLoading || provider.isLoading) return <LoadingScreen label="Loading settings" />;
  const sec = securityQuery.data;
  return <div><PageHeading eyebrow="Workspace / Configuration" title="Settings" description="Role access, security controls, and provider readiness for this PeopleOS workspace." />
    {!auth.data?.canManageSettings ? <div className="surface"><EmptyState title="Settings access is restricted" message="Only authorized system administrators can manage workspace settings. Your role can still review permitted PeopleOS information." /></div> : <>
      <section className="surface p-5 md:p-7" data-testid="section-role-access">
        <div className="flex items-center gap-3"><div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#f5ebe7] text-[#a91919]"><ShieldCheck size={18} /></div><div><h2 className="font-display text-lg font-semibold text-stone-900">Your access profile</h2><p className="text-xs text-stone-500">Permissions are supplied by the PeopleOS authorization service.</p></div></div>
        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {[
            ['Organization role', auth.data?.role.replaceAll('_',' ') ?? '—', true],
            ['Manage people', auth.data?.canManagePeople, auth.data?.canManagePeople],
            ['Approve leave', auth.data?.canApproveLeave, auth.data?.canApproveLeave],
            ['View audit', auth.data?.canViewAudit, auth.data?.canViewAudit],
            ['View payroll', auth.data?.canViewPayroll, auth.data?.canViewPayroll],
            ['Manage settings', auth.data?.canManageSettings, auth.data?.canManageSettings],
          ].map(([label,value,allowed]) => <div key={String(label)} className="flex items-center justify-between rounded-xl border border-stone-200 p-4" data-testid={`card-permission-${String(label).toLowerCase().replaceAll(' ','-')}`}><div><p className="text-xs font-bold capitalize text-stone-700">{label}</p><p className="mt-1 text-[10px] capitalize text-stone-400">{typeof value === 'boolean' ? (value ? 'Granted' : 'Not granted') : value}</p></div><span className={`h-2.5 w-2.5 rounded-full ${allowed ? 'bg-[#338956]' : 'bg-stone-300'}`} /></div>)}
        </div>
        <p className="mt-4 text-[10px] text-stone-400">UI visibility is not a security boundary. The server enforces access for every request.</p>
      </section>
      <section className="surface mt-4 p-5 md:p-7" data-testid="section-security-posture">
        <div className="flex items-start justify-between gap-3"><div><h2 className="font-display text-lg font-semibold text-stone-900">Enterprise security posture</h2><p className="mt-1 text-xs text-stone-500">Server-enforced encryption, Kenya ODPC PII protection, rate limiting, and session verification.</p></div><span className="rounded-full bg-[#e8f2eb] px-2.5 py-1 text-[10px] font-bold text-[#34734d]">{sec?.encryptionStandard ?? 'AES-256-GCM'}</span></div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-xl border border-stone-200 p-3.5"><p className="text-[10px] font-bold uppercase tracking-[.12em] text-stone-400">Auth provider</p><p className="mt-1 text-xs font-bold capitalize text-stone-800">{String(sec?.authProvider ?? 'clerk_or_sandbox').replaceAll('_', ' ')}</p></div>
          <div className="rounded-xl border border-stone-200 p-3.5"><p className="text-[10px] font-bold uppercase tracking-[.12em] text-stone-400">Session MFA</p><p className="mt-1 text-xs font-bold text-stone-800">{sec?.mfaVerified ? 'MFA Verified' : 'Standard / Sandbox'}</p></div>
          <div className="rounded-xl border border-stone-200 p-3.5"><p className="text-[10px] font-bold uppercase tracking-[.12em] text-stone-400">ODPC masking</p><p className="mt-1 text-xs font-bold text-[#34734d]">{sec?.odpcCompliantMasking !== false ? 'Enforced' : 'Disabled'}</p></div>
          <div className="rounded-xl border border-stone-200 p-3.5"><p className="text-[10px] font-bold uppercase tracking-[.12em] text-stone-400">API rate limiter</p><p className="mt-1 text-xs font-bold text-[#34734d]">{sec?.rateLimitingActive !== false ? 'Sliding window active' : 'Inactive'}</p></div>
        </div>
      </section>
      <section className="surface mt-4 p-5 md:p-7" data-testid="section-provider-setup">
        <div className="flex items-start justify-between gap-3"><div><h2 className="font-display text-lg font-semibold text-stone-900">AI provider setup</h2><p className="mt-1 text-xs text-stone-500">Provider credentials are not editable in this interface.</p></div><span className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${provider.data?.configured ? 'bg-[#e8f2eb] text-[#34734d]' : 'bg-[#fbf0da] text-[#785716]'}`} data-testid="status-settings-provider">{provider.data?.configured ? 'Configured' : 'Setup required'}</span></div>
        <div className="mt-4 rounded-xl bg-[#f7f4ef] p-4"><p className="text-sm font-semibold text-stone-700">Provider: {provider.data?.provider || 'Not configured'}</p><p className="mt-1 text-xs text-stone-500">{provider.data?.message || 'No provider key has been supplied. No model calls are made.'}</p><p className="mt-2 text-[10px] text-stone-400">Set up through the approved server environment process. Never paste provider secrets into the browser.</p></div>
      </section>
    </>}
  </div>;
}

function PhasePage({ title }: { title: string }) {
  return <div><PageHeading eyebrow="People operations / Planned module" title={title} description="This area is part of the PeopleOS navigation, but is not yet configured for operational use." />
    <section className="surface relative overflow-hidden p-6 md:p-9" data-testid={`section-phase-${title.toLowerCase().replaceAll(/[^a-z0-9]+/g,'-')}`}>
      <div className="absolute right-0 top-0 h-40 w-40 -translate-y-1/3 translate-x-1/3 rounded-full border border-[#e9ded4]" /><div className="absolute right-8 top-8 h-20 w-20 rounded-full border border-[#e9ded4]" />
      <div className="relative max-w-xl"><div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#f6eee7] text-[#a3543c]"><Command size={19} /></div><p className="mt-5 text-[10px] font-bold uppercase tracking-[.16em] text-[#bd2725]">Phase not configured</p><h2 className="mt-2 font-display text-2xl font-semibold text-stone-900">{title} is not yet available</h2><p className="mt-2 text-sm leading-6 text-stone-500">No records or actions are presented here. This phase will become operational once its approved PeopleOS service and workflow are configured.</p><div className="mt-5 inline-flex items-center gap-2 rounded-lg bg-stone-100 px-3 py-2 text-[11px] font-semibold text-stone-500" data-testid="status-module-not-configured"><Clock3 size={14} /> Not configured</div></div>
    </section>
  </div>;
}

function RoutedBoundary({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>;
}
function RouterContents() {
  return <RoutedBoundary><Switch>
    <Route path="/" component={AppHomeRedirect} />
    <Route path="/careers" component={CareersPage} />
    <Route path="/privacy">{() => <LegalPage mode="privacy" />}</Route>
    <Route path="/terms">{() => <LegalPage mode="terms" />}</Route>
    <Route path="/portal">{() => <><Show when="signed-in"><CustomerPortalPage /></Show><Show when="signed-out"><Redirect to="/sign-in" /></Show></>}</Route>
    <Route path="/distributor">{() => <><Show when="signed-in"><DistributorPortalPage /></Show><Show when="signed-out"><Redirect to="/sign-in" /></Show></>}</Route>
    <Route path="/sign-in/*?" component={SignInPage} />
    <Route path="/sign-up/*?" component={SignUpPage} />
    <Route component={ProtectedRouter} />
  </Switch></RoutedBoundary>;
}
function ClerkRoutes() {
  const [, setLocation] = useLocation();
  return <UnifiedAuthProvider
    clerkPubKey={hasValidClerkKey ? clerkPubKey : undefined}
    appearance={appearance}
    basePath={basePath}
    routerPush={to => setLocation(stripBase(to))}
    routerReplace={to => setLocation(stripBase(to), { replace: true })}
  >
    <QueryClientProvider client={queryClient}>
      <ClerkCacheSync />
      <RouterContents />
      <Toaster />
    </QueryClientProvider>
  </UnifiedAuthProvider>;
}
function App() {
  return <TooltipProvider><WouterRouter base={basePath}><ClerkRoutes /></WouterRouter></TooltipProvider>;
}
export default App;
