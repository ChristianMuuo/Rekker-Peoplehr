import React, { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  Calculator,
  CheckCircle2,
  Eye,
  FileText,
  Layers,
  Plus,
  RefreshCw,
  Settings2,
  ShieldAlert,
  ShieldCheck,
  Smartphone,
  X,
} from 'lucide-react';
import { apiGet, apiPost } from '../lib/api';
import { calculateKenyaPayroll } from '../data/mockStore';

interface PayeBand {
  label: string;
  limitKes: number | null;
  rate: number;
}

interface StatutoryRuleConfig {
  id: string;
  organizationId?: string;
  name: string;
  effectiveFrom: string;
  effectiveTo?: string | null;
  isActive: boolean;
  nssf: {
    rate: number;
    tier1UpperLimitKes: number;
    tier2UpperLimitKes: number;
    employerMatch: boolean;
  };
  shif: {
    rate: number;
    minimumKes: number;
    deductibleFromTaxablePay: boolean;
    insuranceReliefRate: number;
    insuranceReliefMaxKes: number;
  };
  housingLevy: {
    employeeRate: number;
    employerRate: number;
    deductibleFromTaxablePay: boolean;
  };
  paye: {
    personalReliefKes: number;
    bands: PayeBand[];
  };
}

interface StatutoryConfigsResponse {
  items: StatutoryRuleConfig[];
  total: number;
}

interface PayrollRun {
  id: string;
  period: string;
  totalGross: number;
  totalNet: number;
  totalPaye: number;
  totalNssf: number;
  totalSha: number;
  totalHousingLevy: number;
  status: string;
  approvedBy: string | null;
  approvedAt: string | null;
}

interface PayrollRunsResponse {
  runs: PayrollRun[];
  mpesaLiveConfigured?: boolean;
}

interface PayrollBandBreakdownItem {
  label: string;
  taxableSlice: number;
  rate: number;
  tax: number;
}

interface PayrollCalculationResult {
  configId?: string;
  configName?: string;
  effectiveFrom?: string;
  grossPay: number;
  nssfTier1: number;
  nssfTier2: number;
  totalNssf: number;
  employerNssf?: number;
  sha: number;
  housingLevy: number;
  employerHousingLevy?: number;
  taxablePay: number;
  payeBeforeRelief: number;
  personalRelief: number;
  insuranceRelief: number;
  netPaye: number;
  totalDeductions: number;
  netPay: number;
  bandBreakdown?: PayrollBandBreakdownItem[];
}

interface PayrollItem extends PayrollCalculationResult {
  id: string;
  payrollRunId?: string;
  period: string;
  employeeId: string;
  employeeNumber?: string;
  employeeName: string;
  departmentName?: string;
  kraPinMasked?: string;
  baseSalary?: number;
  allowances?: number;
  overtimePay?: number;
}

interface PayrollItemsResponse {
  run: PayrollRun;
  items: PayrollItem[];
  configUsed?: { id: string; name: string };
}

interface PayrollAnomaly {
  type: string;
  severity: string;
  employee?: string;
  description: string;
  status: string;
}

interface PayrollAnomaliesResponse {
  auditedRun: string;
  statutorySchedule?: string;
  nssfMaxEmployeeCapKes?: number;
  anomalies: PayrollAnomaly[];
}

interface JournalLine {
  accountCode: string;
  accountName: string;
  costCentre: string;
  debitKes: number;
  creditKes: number;
}

interface PayrollJournalResponse {
  runId: string;
  period?: string;
  configName?: string;
  balanced: boolean;
  totalDebitsKes: number;
  totalCreditsKes: number;
  lines: JournalLine[];
}

interface P9aMonthRow {
  month: string;
  basicSalary?: number;
  allowances?: number;
  grossPay: number;
  nssfContribution: number;
  shifContribution?: number;
  housingLevy?: number;
  chargeablePay: number;
  taxCharged?: number;
  personalRelief?: number;
  payeDeducted: number;
}

interface P9aResponse {
  formType: string;
  taxYear?: number;
  employerName?: string;
  employerPin?: string;
  employeeId?: string;
  employeeName: string;
  employeeNumber?: string;
  employeePinMasked: string;
  statutoryConfigName?: string;
  months: P9aMonthRow[];
  totals?: {
    grossPay: number;
    nssf: number;
    shif: number;
    housingLevy: number;
    taxablePay: number;
    payeDeducted: number;
  };
}

interface ApproveRunResponse {
  message?: string;
  run: PayrollRun;
}

interface DisburseMpesaResponse {
  runId: string;
  period: string;
  providerMode: string;
  totalEmployeesPaid: number;
  totalDisbursedKes: number;
}

interface CreateRunResponse {
  run: PayrollRun;
  items: PayrollItem[];
  configUsed?: string;
}

function extractErrorMessage(err: unknown, fallback: string): string {
  if (err instanceof Error && err.message.trim()) return err.message;
  if (typeof err === 'object' && err !== null && 'message' in err) {
    const msg = (err as { message?: unknown }).message;
    if (typeof msg === 'string' && msg.trim()) return msg;
  }
  return fallback;
}

function getNairobiMonthLabel(deltaMonths: number): string {
  const now = new Date();
  const utc = now.getTime() + now.getTimezoneOffset() * 60_000;
  const nairobi = new Date(utc + 3 * 60 * 60 * 1000);
  nairobi.setDate(1);
  nairobi.setMonth(nairobi.getMonth() + deltaMonths);
  return new Intl.DateTimeFormat('en-KE', { month: 'long', year: 'numeric' }).format(nairobi);
}

function getNairobiFirstOfNextMonthIso(): string {
  const now = new Date();
  const utc = now.getTime() + now.getTimezoneOffset() * 60_000;
  const nairobi = new Date(utc + 3 * 60 * 60 * 1000);
  nairobi.setDate(1);
  nairobi.setMonth(nairobi.getMonth() + 1);
  const y = nairobi.getFullYear();
  const m = String(nairobi.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}-01`;
}

const DEFAULT_PAYE_BANDS: PayeBand[] = [
  { label: 'First KES 24,000', limitKes: 24000, rate: 0.1 },
  { label: 'Next KES 8,333', limitKes: 8333, rate: 0.25 },
  { label: 'Next KES 467,667', limitKes: 467667, rate: 0.3 },
  { label: 'Next KES 300,000', limitKes: 300000, rate: 0.325 },
  { label: 'Above KES 800,000', limitKes: null, rate: 0.35 },
];

export function PayrollPage() {
  const qc = useQueryClient();
  const [selectedRunId, setSelectedRunId] = useState<string>('');
  const [selectedPayslip, setSelectedPayslip] = useState<PayrollItem | null>(null);
  const [p9aEmployeeId, setP9aEmployeeId] = useState<string | null>(null);
  const [showConfigModal, setShowConfigModal] = useState(false);
  const [showJournalModal, setShowJournalModal] = useState(false);
  const [showNewRunModal, setShowNewRunModal] = useState(false);
  const [showBandBreakdown, setShowBandBreakdown] = useState(false);
  const [newRunPeriod, setNewRunPeriod] = useState<string>(() => getNairobiMonthLabel(1));
  const [statusTone, setStatusTone] = useState<'ok' | 'error'>('ok');
  const [statusBanner, setStatusBanner] = useState<string | null>(null);
  const [customGross, setCustomGross] = useState<number>(180000);
  const [isMutating, setIsMutating] = useState(false);

  // Config editor form
  const [cfgName, setCfgName] = useState('Kenya Statutory Schedule 2026 Custom');
  const [cfgEffectiveFrom, setCfgEffectiveFrom] = useState<string>(() => getNairobiFirstOfNextMonthIso());
  const [cfgTier1, setCfgTier1] = useState(9000);
  const [cfgTier2, setCfgTier2] = useState(108000);
  const [cfgShifRate, setCfgShifRate] = useState(2.75);
  const [cfgShifDeductible, setCfgShifDeductible] = useState(true);
  const [cfgAhlRate, setCfgAhlRate] = useState(1.5);
  const [cfgAhlDeductible, setCfgAhlDeductible] = useState(true);
  const [cfgPersonalRelief, setCfgPersonalRelief] = useState(2400);

  const runsQuery = useQuery<PayrollRunsResponse>({
    queryKey: ['payroll-runs'],
    queryFn: () => apiGet<PayrollRunsResponse>('/api/payroll/runs'),
  });

  const runs = runsQuery.data?.runs ?? [];
  const effectiveRunId =
    selectedRunId && runs.some((r) => r.id === selectedRunId)
      ? selectedRunId
      : runs[0]?.id ?? '';

  useEffect(() => {
    if (!selectedRunId && runs[0]?.id) {
      setSelectedRunId(runs[0].id);
    }
  }, [selectedRunId, runs]);

  const itemsQuery = useQuery<PayrollItemsResponse>({
    queryKey: ['payroll-items', effectiveRunId],
    queryFn: () => apiGet<PayrollItemsResponse>(`/api/payroll/runs/${effectiveRunId}/items`),
    enabled: Boolean(effectiveRunId),
  });

  const configsQuery = useQuery<StatutoryConfigsResponse>({
    queryKey: ['statutory-configs'],
    queryFn: () => apiGet<StatutoryConfigsResponse>('/api/payroll/statutory-configs'),
  });

  const anomaliesQuery = useQuery<PayrollAnomaliesResponse>({
    queryKey: ['payroll-anomalies'],
    queryFn: () => apiGet<PayrollAnomaliesResponse>('/api/payroll/anomalies'),
  });

  const calcQuery = useQuery<PayrollCalculationResult>({
    queryKey: ['payroll-calc', customGross, configsQuery.data?.items.find((c) => c.isActive)?.id],
    queryFn: () => apiPost<PayrollCalculationResult>('/api/payroll/calculate', { grossSalary: customGross }),
  });

  const p9aQuery = useQuery<P9aResponse>({
    queryKey: ['payroll-p9a', p9aEmployeeId],
    queryFn: () => apiGet<P9aResponse>(`/api/payroll/p9a/${p9aEmployeeId}`),
    enabled: Boolean(p9aEmployeeId),
  });

  const journalQuery = useQuery<PayrollJournalResponse>({
    queryKey: ['payroll-journal', effectiveRunId],
    queryFn: () => apiGet<PayrollJournalResponse>(`/api/payroll/runs/${effectiveRunId}/journal`),
    enabled: showJournalModal && Boolean(effectiveRunId),
  });

  const activeRun = runs.find((r) => r.id === effectiveRunId) ?? itemsQuery.data?.run ?? runs[0];
  const payrollItems = itemsQuery.data?.items ?? [];
  const configs = configsQuery.data?.items ?? [];
  const activeConfig = configs.find((c) => c.isActive) ?? configs[0];
  const mpesaLiveConfigured = Boolean(runsQuery.data?.mpesaLiveConfigured);

  const liveCalc: PayrollCalculationResult =
    calcQuery.data?.grossPay !== undefined ? calcQuery.data : calculateKenyaPayroll(customGross);

  const totalGross =
    payrollItems.reduce((s, r) => s + (r.grossPay || 0), 0) || activeRun?.totalGross || 0;
  const totalNet =
    payrollItems.reduce((s, r) => s + (r.netPay || 0), 0) || activeRun?.totalNet || 0;
  const totalPaye =
    payrollItems.reduce((s, r) => s + (r.netPaye || 0), 0) || activeRun?.totalPaye || 0;
  const totalNssf =
    payrollItems.reduce((s, r) => s + (r.totalNssf || 0), 0) || activeRun?.totalNssf || 0;
  const totalSha =
    payrollItems.reduce((s, r) => s + (r.sha || 0), 0) || activeRun?.totalSha || 0;
  const totalHousing =
    payrollItems.reduce((s, r) => s + (r.housingLevy || 0), 0) || activeRun?.totalHousingLevy || 0;

  const invalidatePayrollQueries = () => {
    void qc.invalidateQueries({ queryKey: ['payroll-runs'] });
    void qc.invalidateQueries({ queryKey: ['payroll-items'] });
    void qc.invalidateQueries({ queryKey: ['payroll-journal'] });
    void qc.invalidateQueries({ queryKey: ['payroll-anomalies'] });
    void qc.invalidateQueries({ queryKey: ['payroll-calc'] });
    void qc.invalidateQueries({ queryKey: ['payroll-p9a'] });
  };

  const handleActivateSchedule = async (configId: string) => {
    if (!configId || configId === activeConfig?.id) return;
    setIsMutating(true);
    try {
      const activated = await apiPost<StatutoryRuleConfig>(
        `/api/payroll/statutory-configs/${configId}/activate`,
        {},
      );
      setStatusTone('ok');
      setStatusBanner(`Activated Kenyan statutory schedule: "${activated.name}".`);
      await qc.invalidateQueries({ queryKey: ['statutory-configs'] });
      invalidatePayrollQueries();
    } catch (err: unknown) {
      setStatusTone('error');
      setStatusBanner(extractErrorMessage(err, 'Unable to switch active statutory schedule.'));
    } finally {
      setIsMutating(false);
    }
  };

  const handleApproveRun = async () => {
    if (!activeRun) return;
    setIsMutating(true);
    try {
      const res = await apiPost<ApproveRunResponse>('/api/payroll/approve', { period: activeRun.id });
      setStatusTone('ok');
      setStatusBanner(res.message || `Payroll run ${activeRun.period} approved for disbursement.`);
      invalidatePayrollQueries();
    } catch (err: unknown) {
      setStatusTone('error');
      setStatusBanner(
        extractErrorMessage(err, 'Maker-Checker rule prevented self-approval on this payroll run.'),
      );
    } finally {
      setIsMutating(false);
    }
  };

  const handleExportJournalCsv = () => {
    const linesData = journalQuery.data?.lines ?? [];
    if (!linesData.length) return;
    const header = ['AccountCode', 'AccountName', 'CostCentre', 'DebitKES', 'CreditKES'];
    const rows = linesData.map((l) =>
      [
        l.accountCode,
        `"${String(l.accountName).replace(/"/g, '""')}"`,
        `"${String(l.costCentre || 'Rekker HQ').replace(/"/g, '""')}"`,
        l.debitKes ?? 0,
        l.creditKes ?? 0,
      ].join(','),
    );
    const blob = new Blob([[header.join(','), ...rows].join('\n')], {
      type: 'text/csv;charset=utf-8',
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `rekker-gl-journal-${effectiveRunId || 'current'}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleMpesaDisburse = async () => {
    if (!activeRun) return;
    setIsMutating(true);
    try {
      const res = await apiPost<DisburseMpesaResponse>(
        `/api/payroll/runs/${activeRun.id}/disburse-mpesa`,
        {},
      );
      setStatusTone('ok');
      setStatusBanner(
        `Disbursed KES ${(res.totalDisbursedKes || 0).toLocaleString()} to ${res.totalEmployeesPaid} employees via M-Pesa B2C (${res.providerMode}).`,
      );
      invalidatePayrollQueries();
    } catch (err: unknown) {
      setStatusTone('error');
      setStatusBanner(
        extractErrorMessage(err, 'Disbursement blocked until payroll run receives human approval.'),
      );
    } finally {
      setIsMutating(false);
    }
  };

  const handleSaveConfig = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsMutating(true);
    try {
      await apiPost<StatutoryRuleConfig>('/api/payroll/statutory-configs', {
        name: cfgName.trim(),
        effectiveFrom: cfgEffectiveFrom,
        activate: true,
        nssf: {
          rate: 0.06,
          tier1UpperLimitKes: Number(cfgTier1),
          tier2UpperLimitKes: Number(cfgTier2),
          employerMatch: true,
        },
        shif: {
          rate: Number(cfgShifRate) / 100,
          minimumKes: 300,
          deductibleFromTaxablePay: cfgShifDeductible,
          insuranceReliefRate: cfgShifDeductible ? 0 : 0.15,
          insuranceReliefMaxKes: cfgShifDeductible ? 0 : 5000,
        },
        housingLevy: {
          employeeRate: Number(cfgAhlRate) / 100,
          employerRate: Number(cfgAhlRate) / 100,
          deductibleFromTaxablePay: cfgAhlDeductible,
        },
        paye: {
          personalReliefKes: Number(cfgPersonalRelief),
          bands: activeConfig?.paye?.bands ?? DEFAULT_PAYE_BANDS,
        },
      });
      setShowConfigModal(false);
      setStatusTone('ok');
      setStatusBanner(`Activated new Kenyan statutory rule configuration: "${cfgName.trim()}"`);
      await qc.invalidateQueries({ queryKey: ['statutory-configs'] });
      invalidatePayrollQueries();
    } catch (err: unknown) {
      setStatusTone('error');
      setStatusBanner(extractErrorMessage(err, 'Could not save statutory schedule configuration.'));
    } finally {
      setIsMutating(false);
    }
  };

  const handleCreateRun = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsMutating(true);
    try {
      const res = await apiPost<CreateRunResponse>('/api/payroll/runs', {
        period: newRunPeriod.trim(),
      });
      setShowNewRunModal(false);
      setStatusTone('ok');
      setStatusBanner(`Generated payroll run "${newRunPeriod.trim()}" ready for Maker-Checker review.`);
      await qc.invalidateQueries({ queryKey: ['payroll-runs'] });
      if (res?.run?.id) setSelectedRunId(res.run.id);
    } catch (err: unknown) {
      setStatusTone('error');
      setStatusBanner(extractErrorMessage(err, 'Unable to generate payroll run.'));
    } finally {
      setIsMutating(false);
    }
  };

  const handleExportRegisterCsv = () => {
    if (!payrollItems.length) return;
    const header = [
      'Employee',
      'Department',
      'KRA_PIN',
      'GrossKES',
      'NSSF_KES',
      'SHIF_KES',
      'AHL_KES',
      'TaxableKES',
      'PAYE_KES',
      'NetPayKES',
    ];
    const rows = payrollItems.map((r) =>
      [
        `"${String(r.employeeName).replace(/"/g, '""')}"`,
        `"${String(r.departmentName ?? '').replace(/"/g, '""')}"`,
        r.kraPinMasked || '',
        r.grossPay,
        r.totalNssf,
        r.sha,
        r.housingLevy,
        r.taxablePay,
        r.netPaye,
        r.netPay,
      ].join(','),
    );
    const blob = new Blob([[header.join(','), ...rows].join('\n')], {
      type: 'text/csv;charset=utf-8',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `rekker-payroll-register-${effectiveRunId || 'current'}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const nssfMaxCapKes = activeConfig
    ? Math.round(activeConfig.nssf.tier1UpperLimitKes * activeConfig.nssf.rate) +
      Math.round(
        Math.max(0, activeConfig.nssf.tier2UpperLimitKes - activeConfig.nssf.tier1UpperLimitKes) *
          activeConfig.nssf.rate,
      )
    : 6480;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="mb-2 text-[10px] font-bold uppercase tracking-[.17em] text-[#bd2725]">
            Compensation, Tax &amp; Disbursement
          </p>
          <h1
            className="font-display text-3xl font-semibold tracking-[-.035em] text-stone-900 md:text-[34px]"
            data-testid="heading-payroll"
          >
            Payroll &amp; Kenya Statutory Engine
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-stone-500">
            Versioned, effective-dated Kenyan PAYE, NSSF, SHIF &amp; Affordable Housing Levy engine with
            Maker-Checker approval and M-Pesa B2C payout gating.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[11px] font-bold ${
              mpesaLiveConfigured
                ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                : 'border-amber-200 bg-amber-50 text-amber-900'
            }`}
            data-testid="badge-mpesa-mode"
          >
            <Smartphone size={13} />
            {mpesaLiveConfigured ? 'M-Pesa B2C: LIVE DARAJA' : 'M-Pesa B2C: SANDBOX SIMULATION'}
          </span>
          <button
            type="button"
            disabled={isMutating}
            onClick={() => setShowNewRunModal(true)}
            className="btn btn-secondary text-xs"
            data-testid="button-open-new-run"
          >
            <Plus size={15} /> Run Monthly Payroll
          </button>
          <button
            type="button"
            disabled={isMutating}
            onClick={() => setShowConfigModal(true)}
            className="btn btn-secondary text-xs"
            data-testid="button-open-statutory-config"
          >
            <Settings2 size={15} /> Configure Statutory Rates
          </button>
          <button
            type="button"
            disabled={!effectiveRunId}
            onClick={() => setShowJournalModal(true)}
            className="btn btn-secondary text-xs"
            data-testid="button-payroll-journal"
          >
            <FileText size={15} /> Finance GL Journal
          </button>
          {activeRun?.status === 'reviewed' && (
            <button
              type="button"
              disabled={isMutating}
              onClick={() => void handleApproveRun()}
              className="btn btn-primary text-xs"
              data-testid="button-approve-payroll-run"
            >
              <ShieldCheck size={15} /> Approve Payroll Run
            </button>
          )}
          {activeRun?.status === 'approved' && (
            <button
              type="button"
              disabled={isMutating}
              onClick={() => void handleMpesaDisburse()}
              className="btn bg-emerald-700 text-xs text-white hover:bg-emerald-800"
              data-testid="button-disburse-mpesa"
            >
              <Smartphone size={15} /> Disburse via M-Pesa B2C
            </button>
          )}
          {activeRun?.status === 'disbursed' && (
            <div
              className="inline-flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-800"
              data-testid="badge-run-disbursed"
            >
              <CheckCircle2 size={15} /> Disbursed ({activeRun.period})
            </div>
          )}
        </div>
      </div>

      {/* Statutory & Legal Verification Notice */}
      <div
        className="flex flex-col gap-2 rounded-2xl border border-amber-200 bg-amber-50/70 px-4 py-3 text-xs text-amber-950 sm:flex-row sm:items-center sm:justify-between"
        data-testid="banner-payroll-legal-review"
      >
        <div className="flex items-start gap-2.5">
          <ShieldAlert size={16} className="mt-0.5 shrink-0 text-amber-700" />
          <div>
            <p className="font-bold">
              Statutory Schedule Notice ·{' '}
              <span className="font-mono text-[11px] uppercase tracking-wider text-amber-800">
                NEEDS_LEGAL_REVIEW
              </span>
            </p>
            <p className="mt-0.5 leading-5 text-amber-900">
              Defaults apply Kenya NSSF Year 4 limits (KES{' '}
              {(activeConfig?.nssf.tier1UpperLimitKes ?? 9000).toLocaleString()} / KES{' '}
              {(activeConfig?.nssf.tier2UpperLimitKes ?? 108000).toLocaleString()}, max KES{' '}
              {nssfMaxCapKes.toLocaleString()}), SHIF ({((activeConfig?.shif.rate ?? 0.0275) * 100).toFixed(2)}%,
              min KES {activeConfig?.shif.minimumKes ?? 300}), AHL (
              {((activeConfig?.housingLevy.employeeRate ?? 0.015) * 100).toFixed(1)}% +{' '}
              {((activeConfig?.housingLevy.employerRate ?? 0.015) * 100).toFixed(1)}%), and configurable pre-PAYE
              deductibility. Confirm effective-date tax filings with KRA/Finance counsel before production remittance.
            </p>
          </div>
        </div>
        {!mpesaLiveConfigured && (
          <span className="shrink-0 rounded-md border border-amber-300 bg-white/80 px-2.5 py-1 text-[11px] font-semibold text-amber-900">
            Daraja Sandbox Active
          </span>
        )}
      </div>

      {statusBanner && (
        <div
          className={`flex items-center justify-between rounded-xl border px-4 py-3 text-xs font-semibold ${
            statusTone === 'error'
              ? 'border-red-200 bg-red-50 text-red-900'
              : 'border-emerald-200 bg-emerald-50 text-emerald-900'
          }`}
          data-testid="banner-payroll-status"
        >
          <span>{statusBanner}</span>
          <button type="button" onClick={() => setStatusBanner(null)} aria-label="Dismiss notification">
            <X size={14} />
          </button>
        </div>
      )}

      {/* Active Ruleset Switcher & Period Selector */}
      <div className="flex flex-col gap-3 rounded-2xl border border-stone-200 bg-white p-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="space-y-1.5 text-xs">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-bold text-stone-700">Active Statutory Schedule:</span>
            <span className="font-mono font-semibold text-red-700" data-testid="text-active-schedule-name">
              {activeConfig?.name || 'Loading statutory schedule…'}
            </span>
            {activeConfig?.effectiveFrom && (
              <span className="text-stone-400">(Effective {activeConfig.effectiveFrom})</span>
            )}
          </div>
          {activeConfig && (
            <div className="flex flex-wrap gap-1.5 text-[10px] font-semibold">
              <span className="rounded bg-stone-100 px-2 py-0.5 text-stone-700">
                NSSF Cap: KES {nssfMaxCapKes.toLocaleString()}
              </span>
              <span
                className={`rounded px-2 py-0.5 ${
                  activeConfig.shif.deductibleFromTaxablePay
                    ? 'bg-emerald-50 text-emerald-800'
                    : 'bg-stone-100 text-stone-600'
                }`}
              >
                SHIF: {activeConfig.shif.deductibleFromTaxablePay ? 'Pre-PAYE Deductible' : 'Insurance Relief Eligible'}
              </span>
              <span
                className={`rounded px-2 py-0.5 ${
                  activeConfig.housingLevy.deductibleFromTaxablePay
                    ? 'bg-emerald-50 text-emerald-800'
                    : 'bg-stone-100 text-stone-600'
                }`}
              >
                AHL: {activeConfig.housingLevy.deductibleFromTaxablePay ? 'Pre-PAYE Deductible' : 'Post-Tax Deduction'}
              </span>
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {configs.length > 1 && (
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-stone-500">Schedule Version:</span>
              <select
                value={activeConfig?.id ?? ''}
                disabled={isMutating}
                onChange={(e) => void handleActivateSchedule(e.target.value)}
                className="field min-h-9 max-w-64 text-xs font-semibold"
                data-testid="select-statutory-schedule"
              >
                {configs.map((cfg) => (
                  <option key={cfg.id} value={cfg.id}>
                    {cfg.effectiveFrom} · {cfg.name}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-stone-500">Payroll Period:</span>
            <select
              value={effectiveRunId}
              onChange={(e) => setSelectedRunId(e.target.value)}
              className="field min-h-9 w-52 text-xs font-bold"
              data-testid="select-payroll-period"
            >
              {runs.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.period} ({r.status})
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Runs Load Error */}
      {runsQuery.isError && (
        <div className="surface flex items-center justify-between border-red-200 bg-red-50/70 p-4 text-xs text-red-900">
          <span className="flex items-center gap-2 font-semibold">
            <AlertTriangle size={15} /> Failed to load payroll cycles. Verify you hold Payroll / Finance access.
          </span>
          <button
            type="button"
            onClick={() => void runsQuery.refetch()}
            className="btn btn-secondary min-h-8 px-3 text-xs"
          >
            <RefreshCw size={13} /> Retry
          </button>
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="surface p-5">
          <p className="text-[11px] font-bold uppercase tracking-wider text-stone-400">Total Workforce Gross</p>
          <p className="mt-2 font-display text-2xl font-bold text-stone-900">
            KES {totalGross.toLocaleString()}
          </p>
          <p className="mt-1 text-[11px] text-stone-500">{payrollItems.length} Active Employees</p>
        </div>
        <div className="surface p-5">
          <p className="text-[11px] font-bold uppercase tracking-wider text-stone-400">Total Net Take-Home</p>
          <p className="mt-2 font-display text-2xl font-bold text-emerald-800">
            KES {totalNet.toLocaleString()}
          </p>
          <p className="mt-1 text-[11px] text-stone-500">
            {totalGross ? ((totalNet / totalGross) * 100).toFixed(1) : '0.0'}% payout ratio
          </p>
        </div>
        <div className="surface p-5">
          <p className="text-[11px] font-bold uppercase tracking-wider text-stone-400">KRA (PAYE + AHL)</p>
          <p className="mt-2 font-display text-2xl font-bold text-red-700">
            KES {(totalPaye + totalHousing).toLocaleString()}
          </p>
          <p className="mt-1 text-[11px] text-stone-500">
            PAYE: {totalPaye.toLocaleString()} · AHL: {totalHousing.toLocaleString()}
          </p>
        </div>
        <div className="surface p-5">
          <p className="text-[11px] font-bold uppercase tracking-wider text-stone-400">NSSF + SHIF</p>
          <p className="mt-2 font-display text-2xl font-bold text-stone-900">
            KES {(totalNssf + totalSha).toLocaleString()}
          </p>
          <p className="mt-1 text-[11px] text-stone-500">
            NSSF: {totalNssf.toLocaleString()} · SHIF: {totalSha.toLocaleString()}
          </p>
        </div>
      </div>

      {/* Live Configurable Tax Simulator */}
      <div className="surface p-6" data-testid="section-payroll-simulator">
        <div className="flex flex-col gap-3 border-b border-stone-200/80 pb-4 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-red-100 text-red-700">
              <Calculator size={20} />
            </div>
            <div>
              <h3 className="font-display text-base font-bold text-stone-900">
                Kenya Configurable Statutory Simulator
              </h3>
              <p className="text-xs text-stone-500">
                Driven live by active organization statutory rules via /api/payroll/calculate.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2">
              <span className="text-xs font-semibold text-stone-600">Gross KES:</span>
              <input
                type="number"
                step="5000"
                min="0"
                value={customGross}
                onChange={(e) => setCustomGross(Math.max(0, Number(e.target.value) || 0))}
                className="field min-h-9 w-36 text-xs font-bold"
                data-testid="input-simulator-gross"
              />
            </label>
            {Boolean(liveCalc.bandBreakdown?.length) && (
              <button
                type="button"
                onClick={() => setShowBandBreakdown((v) => !v)}
                className="btn btn-secondary min-h-9 px-3 text-xs"
                data-testid="button-toggle-paye-bands"
              >
                <Layers size={14} /> {showBandBreakdown ? 'Hide PAYE Bands' : 'Show PAYE Bands'}
              </button>
            )}
          </div>
        </div>

        <div className="mt-4 grid gap-3 text-center sm:grid-cols-3 lg:grid-cols-6">
          <div className="rounded-xl border border-stone-200 p-3">
            <p className="text-[10px] font-bold uppercase text-stone-400">NSSF Tier 1&amp;2</p>
            <p className="mt-1 text-sm font-bold" data-testid="text-sim-nssf">
              KES {(liveCalc.totalNssf || 0).toLocaleString()}
            </p>
            <p className="mt-0.5 text-[10px] text-stone-400">
              T1: {liveCalc.nssfTier1.toLocaleString()} · T2: {liveCalc.nssfTier2.toLocaleString()}
            </p>
          </div>
          <div className="rounded-xl border border-stone-200 p-3">
            <p className="text-[10px] font-bold uppercase text-stone-400">SHIF</p>
            <p className="mt-1 text-sm font-bold" data-testid="text-sim-shif">
              KES {(liveCalc.sha || 0).toLocaleString()}
            </p>
            <p className="mt-0.5 text-[10px] text-stone-400">
              Taxable Pay: KES {(liveCalc.taxablePay || 0).toLocaleString()}
            </p>
          </div>
          <div className="rounded-xl border border-stone-200 p-3">
            <p className="text-[10px] font-bold uppercase text-stone-400">Housing Levy</p>
            <p className="mt-1 text-sm font-bold" data-testid="text-sim-ahl">
              KES {(liveCalc.housingLevy || 0).toLocaleString()}
            </p>
            <p className="mt-0.5 text-[10px] text-stone-400">
              Employer: KES {(liveCalc.employerHousingLevy ?? liveCalc.housingLevy).toLocaleString()}
            </p>
          </div>
          <div className="rounded-xl border border-stone-200 p-3">
            <p className="text-[10px] font-bold uppercase text-stone-400">Net PAYE</p>
            <p className="mt-1 text-sm font-bold text-red-700" data-testid="text-sim-paye">
              KES {(liveCalc.netPaye || 0).toLocaleString()}
            </p>
            <p className="mt-0.5 text-[10px] text-stone-400">
              Relief: KES {((liveCalc.personalRelief || 0) + (liveCalc.insuranceRelief || 0)).toLocaleString()}
            </p>
          </div>
          <div className="rounded-xl border border-stone-200 p-3">
            <p className="text-[10px] font-bold uppercase text-stone-400">Total Deducts</p>
            <p className="mt-1 text-sm font-bold">
              KES {(liveCalc.totalDeductions || 0).toLocaleString()}
            </p>
            <p className="mt-0.5 text-[10px] text-stone-400">
              Gross Before Relief: KES {(liveCalc.payeBeforeRelief || 0).toLocaleString()}
            </p>
          </div>
          <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-3">
            <p className="text-[10px] font-bold uppercase text-emerald-800">Net Pay</p>
            <p className="mt-1 text-sm font-bold text-emerald-900" data-testid="text-sim-net">
              KES {(liveCalc.netPay || 0).toLocaleString()}
            </p>
            <p className="mt-0.5 text-[10px] text-emerald-700">
              Employer Cost: KES {(liveCalc.grossPay + (liveCalc.employerNssf ?? liveCalc.totalNssf) + (liveCalc.employerHousingLevy ?? liveCalc.housingLevy)).toLocaleString()}
            </p>
          </div>
        </div>

        {showBandBreakdown && liveCalc.bandBreakdown && liveCalc.bandBreakdown.length > 0 && (
          <div className="mt-4 overflow-x-auto rounded-xl border border-stone-200" data-testid="table-paye-bands">
            <table className="w-full text-left text-xs">
              <thead className="bg-stone-50 text-[10px] font-bold uppercase text-stone-500">
                <tr>
                  <th className="px-3 py-2">PAYE Tax Band</th>
                  <th className="px-3 py-2 text-right">Taxable Slice (KES)</th>
                  <th className="px-3 py-2 text-right">Rate</th>
                  <th className="px-3 py-2 text-right">Band Tax (KES)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {liveCalc.bandBreakdown.map((b) => (
                  <tr key={b.label}>
                    <td className="px-3 py-2 font-medium text-stone-800">{b.label}</td>
                    <td className="px-3 py-2 text-right font-mono">{b.taxableSlice.toLocaleString()}</td>
                    <td className="px-3 py-2 text-right font-mono">{(b.rate * 100).toFixed(1)}%</td>
                    <td className="px-3 py-2 text-right font-mono font-semibold text-red-700">
                      {b.tax.toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Statutory Audit Checks */}
      {(anomaliesQuery.data?.anomalies?.length ?? 0) > 0 && (
        <div className="surface flex flex-wrap gap-3 p-4" data-testid="section-payroll-anomalies">
          {anomaliesQuery.data?.anomalies.map((a, i) => (
            <div
              key={`${a.type}-${i}`}
              className="flex items-center gap-2 rounded-lg border border-stone-200 bg-stone-50 px-3 py-2 text-xs"
            >
              <CheckCircle2
                size={14}
                className={a.status === 'passed' ? 'text-emerald-700' : 'text-amber-600'}
              />
              <span className="font-semibold text-stone-800">{a.description}</span>
            </div>
          ))}
        </div>
      )}

      {/* Payroll Items Table */}
      <div className="surface overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-stone-100 p-4">
          <div>
            <h3 className="font-display text-sm font-bold text-stone-900">
              {activeRun?.period || 'Current'} Payroll Register
            </h3>
            {activeRun?.approvedBy && (
              <p className="text-[11px] text-stone-500">
                Approved by {activeRun.approvedBy}
                {activeRun.approvedAt ? ` · ${new Date(activeRun.approvedAt).toLocaleDateString('en-KE')}` : ''}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleExportRegisterCsv}
              disabled={!payrollItems.length}
              className="btn btn-secondary min-h-8 px-2.5 text-[11px]"
              data-testid="button-export-payroll-csv"
            >
              <FileText size={13} /> Export Register CSV
            </button>
            <span className="rounded-md bg-stone-100 px-2.5 py-1 text-xs font-semibold text-stone-600">
              {payrollItems.length} Employees
            </span>
          </div>
        </div>

        {itemsQuery.isLoading ? (
          <div className="space-y-2 p-4" data-testid="state-payroll-loading">
            {[1, 2, 3].map((idx) => (
              <div key={idx} className="skeleton h-12" />
            ))}
          </div>
        ) : itemsQuery.isError ? (
          <div className="p-6 text-center text-xs text-red-700">
            Could not load payroll items for this run.{' '}
            <button
              type="button"
              onClick={() => void itemsQuery.refetch()}
              className="font-bold underline"
            >
              Retry
            </button>
          </div>
        ) : payrollItems.length === 0 ? (
          <div className="p-8 text-center text-xs text-stone-500">
            No employee items recorded for this payroll period yet.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs" data-testid="table-payroll-register">
              <thead className="border-b border-stone-200 bg-stone-50 text-[10px] font-bold uppercase tracking-wider text-stone-500">
                <tr>
                  <th className="px-4 py-3">Employee</th>
                  <th className="px-4 py-3">KRA PIN</th>
                  <th className="px-4 py-3 text-right">Gross Pay</th>
                  <th className="px-4 py-3 text-right">NSSF</th>
                  <th className="px-4 py-3 text-right">SHIF</th>
                  <th className="px-4 py-3 text-right">AHL</th>
                  <th className="px-4 py-3 text-right">PAYE</th>
                  <th className="px-4 py-3 text-right">Net Pay</th>
                  <th className="px-4 py-3 text-right">Documents</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {payrollItems.map((r) => (
                  <tr key={r.id} className="hover:bg-stone-50/70">
                    <td className="px-4 py-3 font-semibold text-stone-900">
                      {r.employeeName}
                      <p className="text-[10px] font-normal text-stone-500">{r.departmentName ?? 'Staff'}</p>
                    </td>
                    <td className="px-4 py-3 font-mono text-[11px] text-stone-500">
                      {r.kraPinMasked || 'Masked'}
                    </td>
                    <td className="px-4 py-3 text-right font-medium">KES {r.grossPay.toLocaleString()}</td>
                    <td className="px-4 py-3 text-right text-stone-600">KES {r.totalNssf.toLocaleString()}</td>
                    <td className="px-4 py-3 text-right text-stone-600">KES {r.sha.toLocaleString()}</td>
                    <td className="px-4 py-3 text-right text-stone-600">
                      KES {r.housingLevy.toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-right font-semibold text-red-700">
                      KES {r.netPaye.toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-right font-bold text-emerald-800">
                      KES {r.netPay.toLocaleString()}
                    </td>
                    <td className="space-x-1 px-4 py-3 text-right">
                      <button
                        type="button"
                        onClick={() => setSelectedPayslip(r)}
                        className="inline-flex items-center gap-1 rounded bg-stone-100 px-2 py-1 text-[10px] font-bold hover:bg-stone-200"
                      >
                        <Eye size={11} /> Payslip
                      </button>
                      <button
                        type="button"
                        onClick={() => setP9aEmployeeId(r.employeeId)}
                        className="inline-flex items-center gap-1 rounded bg-red-50 px-2 py-1 text-[10px] font-bold text-red-700 hover:bg-red-100"
                      >
                        <FileText size={11} /> P9A
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Payslip Modal */}
      {selectedPayslip && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-stone-950/40 p-4 backdrop-blur-xs"
          onClick={() => setSelectedPayslip(null)}
          data-testid="modal-payslip"
        >
          <div
            className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-stone-200 pb-3">
              <div>
                <h3 className="font-display text-base font-bold text-stone-900">Rekker Limited</h3>
                <p className="text-xs text-stone-500">
                  Official Payslip · {selectedPayslip.period} · {selectedPayslip.employeeName}
                </p>
                <p className="text-[10px] text-stone-400">
                  KRA PIN: {selectedPayslip.kraPinMasked || 'Masked'} · {mpesaLiveConfigured ? 'M-Pesa Daraja' : 'Sandbox Preview'}
                </p>
              </div>
              <button type="button" onClick={() => setSelectedPayslip(null)} aria-label="Close payslip">
                <X size={18} />
              </button>
            </div>
            <div className="mt-4 space-y-2 text-xs">
              {selectedPayslip.baseSalary !== undefined && (
                <div className="flex justify-between text-stone-500">
                  <span>Basic Pay + Allowances</span>
                  <span>
                    KES {selectedPayslip.baseSalary.toLocaleString()} + KES{' '}
                    {(selectedPayslip.allowances ?? 0).toLocaleString()}
                  </span>
                </div>
              )}
              <div className="flex justify-between">
                <span>Total Gross Earnings</span>
                <span className="font-bold">KES {selectedPayslip.grossPay.toLocaleString()}</span>
              </div>
              <div className="flex justify-between text-stone-600">
                <span>NSSF (Tier I + II)</span>
                <span>- KES {selectedPayslip.totalNssf.toLocaleString()}</span>
              </div>
              <div className="flex justify-between text-stone-600">
                <span>SHIF Contribution</span>
                <span>- KES {selectedPayslip.sha.toLocaleString()}</span>
              </div>
              <div className="flex justify-between text-stone-600">
                <span>Affordable Housing Levy</span>
                <span>- KES {selectedPayslip.housingLevy.toLocaleString()}</span>
              </div>
              <div className="flex justify-between text-stone-500">
                <span>Chargeable Taxable Pay</span>
                <span>KES {selectedPayslip.taxablePay.toLocaleString()}</span>
              </div>
              <div className="flex justify-between text-stone-500">
                <span>Personal + Insurance Relief Applied</span>
                <span>
                  KES{' '}
                  {(selectedPayslip.personalRelief + selectedPayslip.insuranceRelief).toLocaleString()}
                </span>
              </div>
              <div className="flex justify-between text-stone-600">
                <span>KRA Net PAYE</span>
                <span>- KES {selectedPayslip.netPaye.toLocaleString()}</span>
              </div>
              <div className="flex justify-between border-t border-stone-200 pt-2 text-sm font-bold text-emerald-800">
                <span>Net Payout</span>
                <span>KES {selectedPayslip.netPay.toLocaleString()}</span>
              </div>
              <div className="mt-2 rounded-lg bg-stone-50 px-3 py-2 text-[11px] text-stone-500">
                Employer Statutory Match (not deducted from employee): NSSF KES{' '}
                {(selectedPayslip.employerNssf ?? selectedPayslip.totalNssf).toLocaleString()} · AHL KES{' '}
                {(selectedPayslip.employerHousingLevy ?? selectedPayslip.housingLevy).toLocaleString()}
              </div>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={() => window.print()} className="btn btn-secondary text-xs">
                Print
              </button>
              <button type="button" onClick={() => setSelectedPayslip(null)} className="btn btn-primary text-xs">
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* KRA P9A Modal */}
      {p9aEmployeeId && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-stone-950/40 p-4 backdrop-blur-xs"
          onClick={() => setP9aEmployeeId(null)}
          data-testid="modal-payroll-p9a"
        >
          <div
            className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {p9aQuery.isLoading ? (
              <div className="py-10 text-center text-xs text-stone-500">
                Generating KRA Form P9A tax deduction card…
              </div>
            ) : p9aQuery.isError || !p9aQuery.data ? (
              <div className="space-y-3 py-6 text-center text-xs text-red-700">
                <p>Could not load KRA P9A card for this employee.</p>
                <button
                  type="button"
                  onClick={() => setP9aEmployeeId(null)}
                  className="btn btn-secondary text-xs"
                >
                  Close
                </button>
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between border-b border-stone-200 pb-3">
                  <div>
                    <h3 className="font-display text-base font-bold text-stone-900">
                      {p9aQuery.data.formType} {p9aQuery.data.taxYear ? `· ${p9aQuery.data.taxYear}` : ''}
                    </h3>
                    <p className="text-xs text-stone-500">
                      {p9aQuery.data.employeeName} · PIN {p9aQuery.data.employeePinMasked}
                      {p9aQuery.data.employerPin ? ` · Employer PIN ${p9aQuery.data.employerPin}` : ''}
                    </p>
                    {p9aQuery.data.statutoryConfigName && (
                      <p className="mt-0.5 text-[10px] text-stone-400">
                        Schedule: {p9aQuery.data.statutoryConfigName}
                      </p>
                    )}
                  </div>
                  <button type="button" onClick={() => setP9aEmployeeId(null)} aria-label="Close P9A modal">
                    <X size={18} />
                  </button>
                </div>
                <div className="mt-4 overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-stone-50 text-[10px] uppercase text-stone-500">
                      <tr>
                        <th className="p-2">Month</th>
                        <th className="p-2 text-right">Gross</th>
                        <th className="p-2 text-right">NSSF</th>
                        <th className="p-2 text-right">SHIF</th>
                        <th className="p-2 text-right">AHL</th>
                        <th className="p-2 text-right">Chargeable</th>
                        <th className="p-2 text-right">PAYE</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-stone-100">
                      {p9aQuery.data.months.map((m) => (
                        <tr key={m.month}>
                          <td className="p-2 font-semibold">{m.month}</td>
                          <td className="p-2 text-right">{m.grossPay.toLocaleString()}</td>
                          <td className="p-2 text-right">{m.nssfContribution.toLocaleString()}</td>
                          <td className="p-2 text-right">{(m.shifContribution ?? 0).toLocaleString()}</td>
                          <td className="p-2 text-right">{(m.housingLevy ?? 0).toLocaleString()}</td>
                          <td className="p-2 text-right">{m.chargeablePay.toLocaleString()}</td>
                          <td className="p-2 text-right font-bold text-red-700">
                            {m.payeDeducted.toLocaleString()}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    {p9aQuery.data.totals && (
                      <tfoot className="border-t-2 border-stone-200 bg-stone-50 font-bold text-stone-900">
                        <tr>
                          <td className="p-2">YTD Total</td>
                          <td className="p-2 text-right">{p9aQuery.data.totals.grossPay.toLocaleString()}</td>
                          <td className="p-2 text-right">{p9aQuery.data.totals.nssf.toLocaleString()}</td>
                          <td className="p-2 text-right">{p9aQuery.data.totals.shif.toLocaleString()}</td>
                          <td className="p-2 text-right">
                            {p9aQuery.data.totals.housingLevy.toLocaleString()}
                          </td>
                          <td className="p-2 text-right">
                            {p9aQuery.data.totals.taxablePay.toLocaleString()}
                          </td>
                          <td className="p-2 text-right text-red-700">
                            {p9aQuery.data.totals.payeDeducted.toLocaleString()}
                          </td>
                        </tr>
                      </tfoot>
                    )}
                  </table>
                </div>
                <div className="mt-4 flex justify-end gap-2">
                  <button type="button" onClick={() => window.print()} className="btn btn-secondary text-xs">
                    Print P9A Card
                  </button>
                  <button type="button" onClick={() => setP9aEmployeeId(null)} className="btn btn-primary text-xs">
                    Done
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Statutory Rule Config Modal */}
      {showConfigModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-stone-950/40 p-4 backdrop-blur-xs"
          onClick={() => setShowConfigModal(false)}
          data-testid="modal-statutory-config"
        >
          <div
            className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-stone-200 pb-3">
              <div>
                <h3 className="font-display text-base font-bold text-stone-900">
                  Configure Kenya Statutory Rates
                </h3>
                <p className="text-[11px] text-stone-500">
                  Creates a new effective-dated schedule version (audited &amp; persisted).
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowConfigModal(false)}
                aria-label="Close statutory config modal"
              >
                <X size={18} />
              </button>
            </div>
            <form onSubmit={(e) => void handleSaveConfig(e)} className="mt-4 space-y-3 text-xs">
              <div>
                <label className="label">Schedule Version Name</label>
                <input
                  required
                  value={cfgName}
                  onChange={(e) => setCfgName(e.target.value)}
                  className="field"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Effective Date</label>
                  <input
                    type="date"
                    required
                    value={cfgEffectiveFrom}
                    onChange={(e) => setCfgEffectiveFrom(e.target.value)}
                    className="field"
                  />
                </div>
                <div>
                  <label className="label">Personal Relief (KES)</label>
                  <input
                    type="number"
                    min="0"
                    required
                    value={cfgPersonalRelief}
                    onChange={(e) => setCfgPersonalRelief(Number(e.target.value))}
                    className="field"
                  />
                </div>
                <div>
                  <label className="label">NSSF Tier I Limit (KES)</label>
                  <input
                    type="number"
                    min="0"
                    required
                    value={cfgTier1}
                    onChange={(e) => setCfgTier1(Number(e.target.value))}
                    className="field"
                  />
                </div>
                <div>
                  <label className="label">NSSF Tier II Limit (KES)</label>
                  <input
                    type="number"
                    min="0"
                    required
                    value={cfgTier2}
                    onChange={(e) => setCfgTier2(Number(e.target.value))}
                    className="field"
                  />
                </div>
                <div>
                  <label className="label">SHIF Rate (%)</label>
                  <input
                    type="number"
                    step="0.05"
                    min="0"
                    required
                    value={cfgShifRate}
                    onChange={(e) => setCfgShifRate(Number(e.target.value))}
                    className="field"
                  />
                </div>
                <div>
                  <label className="label">Housing Levy Rate (%)</label>
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    required
                    value={cfgAhlRate}
                    onChange={(e) => setCfgAhlRate(Number(e.target.value))}
                    className="field"
                  />
                </div>
              </div>
              <div className="grid gap-2 rounded-xl border border-stone-200 bg-stone-50 p-3 sm:grid-cols-2">
                <label className="flex cursor-pointer items-center gap-2 font-medium text-stone-700">
                  <input
                    type="checkbox"
                    checked={cfgShifDeductible}
                    onChange={(e) => setCfgShifDeductible(e.target.checked)}
                    className="h-4 w-4 rounded border-stone-300 text-[#C71D1D]"
                  />
                  <span>SHIF deductible pre-PAYE</span>
                </label>
                <label className="flex cursor-pointer items-center gap-2 font-medium text-stone-700">
                  <input
                    type="checkbox"
                    checked={cfgAhlDeductible}
                    onChange={(e) => setCfgAhlDeductible(e.target.checked)}
                    className="h-4 w-4 rounded border-stone-300 text-[#C71D1D]"
                  />
                  <span>Housing Levy deductible pre-PAYE</span>
                </label>
              </div>
              <div className="flex justify-end gap-2 pt-3">
                <button
                  type="button"
                  onClick={() => setShowConfigModal(false)}
                  className="btn btn-secondary text-xs"
                >
                  Cancel
                </button>
                <button type="submit" disabled={isMutating} className="btn btn-primary text-xs">
                  <Plus size={14} /> Save &amp; Activate Schedule
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* GL Journal Modal */}
      {showJournalModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-stone-950/40 p-4 backdrop-blur-xs"
          onClick={() => setShowJournalModal(false)}
          data-testid="modal-payroll-journal"
        >
          <div
            className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-stone-100 pb-4">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[.16em] text-[#bd2725]">
                  Finance ERP Integration / Cost-Centre GL
                </p>
                <h2 className="font-display text-xl font-bold text-stone-900">
                  Double-Entry Payroll Journal ({journalQuery.data?.period ?? activeRun?.period ?? effectiveRunId})
                </h2>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleExportJournalCsv}
                  disabled={!journalQuery.data?.lines?.length}
                  className="btn btn-secondary min-h-8 px-3 text-xs"
                  data-testid="button-export-journal-csv"
                >
                  <FileText size={14} /> Export GL CSV
                </button>
                <button
                  type="button"
                  onClick={() => setShowJournalModal(false)}
                  className="btn btn-ghost min-h-8 px-2"
                  aria-label="Close GL journal"
                >
                  <X size={18} />
                </button>
              </div>
            </div>

            {journalQuery.isLoading ? (
              <p className="py-8 text-center text-sm text-stone-500">
                Generating cost-centre general ledger journal…
              </p>
            ) : journalQuery.isError ? (
              <p className="py-6 text-sm text-red-700">
                Failed to generate GL journal for this payroll run.
              </p>
            ) : (
              <div className="mt-4 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-stone-200 bg-stone-50 px-4 py-3 text-xs">
                  <span>
                    <strong className="text-stone-800">Schedule:</strong>{' '}
                    {journalQuery.data?.configName ?? activeConfig?.name ?? 'Kenya Statutory Schedule'}
                  </span>
                  <div className="flex items-center gap-4">
                    <span>
                      Debits: <strong>KES {(journalQuery.data?.totalDebitsKes ?? 0).toLocaleString()}</strong>
                    </span>
                    <span>
                      Credits: <strong>KES {(journalQuery.data?.totalCreditsKes ?? 0).toLocaleString()}</strong>
                    </span>
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ${
                        journalQuery.data?.balanced
                          ? 'bg-emerald-100 text-emerald-800'
                          : 'bg-red-100 text-red-800'
                      }`}
                    >
                      {journalQuery.data?.balanced ? 'BALANCED' : 'UNBALANCED'}
                    </span>
                  </div>
                </div>
                <div className="overflow-x-auto rounded-xl border border-stone-200">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-stone-50 text-[10px] font-bold uppercase tracking-wider text-stone-500">
                      <tr>
                        <th className="px-3 py-2.5">Account</th>
                        <th className="px-3 py-2.5">Cost Centre</th>
                        <th className="px-3 py-2.5 text-right">Debit (KES)</th>
                        <th className="px-3 py-2.5 text-right">Credit (KES)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-stone-100">
                      {(journalQuery.data?.lines ?? []).map((line, idx) => (
                        <tr key={`${line.accountCode}-${line.costCentre}-${idx}`} className="hover:bg-stone-50/70">
                          <td className="px-3 py-2.5">
                            <span className="font-mono text-[11px] font-bold text-stone-700">
                              {line.accountCode}
                            </span>{' '}
                            <span className="text-stone-800">{line.accountName}</span>
                          </td>
                          <td className="px-3 py-2.5 font-mono text-[11px] text-stone-600">
                            {line.costCentre}
                          </td>
                          <td className="px-3 py-2.5 text-right font-mono text-stone-900">
                            {line.debitKes > 0 ? line.debitKes.toLocaleString() : '—'}
                          </td>
                          <td className="px-3 py-2.5 text-right font-mono text-stone-900">
                            {line.creditKes > 0 ? line.creditKes.toLocaleString() : '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* New Run Modal */}
      {showNewRunModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-stone-950/40 p-4 backdrop-blur-xs"
          onClick={() => setShowNewRunModal(false)}
          data-testid="modal-new-payroll-run"
        >
          <form
            onSubmit={(e) => void handleCreateRun(e)}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md space-y-4 rounded-2xl bg-white p-6 text-xs shadow-2xl"
          >
            <div className="flex items-center justify-between border-b border-stone-200 pb-3">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[.16em] text-[#bd2725]">
                  Monthly Cycle Preparation
                </p>
                <h3 className="font-display text-lg font-bold text-stone-900">Generate New Payroll Run</h3>
              </div>
              <button type="button" onClick={() => setShowNewRunModal(false)} aria-label="Close modal">
                <X size={18} />
              </button>
            </div>
            <p className="leading-5 text-stone-500">
              Computes gross earnings, NSSF Tier I &amp; II, SHIF, Affordable Housing Levy, and PAYE using
              the active effective-dated statutory schedule, then enters <strong>reviewed</strong> state for
              separate Checker signoff.
            </p>
            <div>
              <label className="label">Payroll Period Label</label>
              <input
                required
                value={newRunPeriod}
                onChange={(e) => setNewRunPeriod(e.target.value)}
                className="field"
                placeholder={`e.g. ${getNairobiMonthLabel(1)}`}
                data-testid="input-new-run-period"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowNewRunModal(false)}
                className="btn btn-secondary text-xs"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isMutating}
                className="btn btn-primary text-xs"
                data-testid="button-confirm-new-run"
              >
                <Plus size={14} /> Generate Run
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
