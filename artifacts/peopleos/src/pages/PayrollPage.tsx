import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Calculator, CheckCircle2, Eye, FileText, ShieldCheck, X,
  Smartphone, Settings2, AlertTriangle, Plus
} from 'lucide-react';
import { apiGet, apiPost } from '../lib/api';
import { calculateKenyaPayroll } from '../data/mockStore';

export function PayrollPage() {
  const qc = useQueryClient();
  const [selectedRunId, setSelectedRunId] = useState<string>('run_2026_03');
  const [selectedPayslip, setSelectedPayslip] = useState<any | null>(null);
  const [p9aEmployeeId, setP9aEmployeeId] = useState<string | null>(null);
  const [showConfigModal, setShowConfigModal] = useState(false);
  const [showJournalModal, setShowJournalModal] = useState(false);
  const [showNewRunModal, setShowNewRunModal] = useState(false);
  const [newRunPeriod, setNewRunPeriod] = useState('April 2026');
  const [statusTone, setStatusTone] = useState<'ok' | 'error'>('ok');
  const [statusBanner, setStatusBanner] = useState<string | null>(null);
  const [customGross, setCustomGross] = useState<number>(180000);

  // Config editor form
  const [cfgName, setCfgName] = useState('Kenya Statutory Schedule 2026 Custom');
  const [cfgEffectiveFrom, setCfgEffectiveFrom] = useState('2026-04-01');
  const [cfgTier1, setCfgTier1] = useState(9000);
  const [cfgTier2, setCfgTier2] = useState(108000);
  const [cfgShifRate, setCfgShifRate] = useState(2.75);
  const [cfgAhlRate, setCfgAhlRate] = useState(1.5);
  const [cfgPersonalRelief, setCfgPersonalRelief] = useState(2400);

  const runsQuery = useQuery({
    queryKey: ['payroll-runs'],
    queryFn: () => apiGet('/api/payroll/runs'),
  });

  const itemsQuery = useQuery({
    queryKey: ['payroll-items', selectedRunId],
    queryFn: () => apiGet(`/api/payroll/runs/${selectedRunId}/items`),
  });

  const configsQuery = useQuery({
    queryKey: ['statutory-configs'],
    queryFn: () => apiGet('/api/payroll/statutory-configs'),
  });

  const anomaliesQuery = useQuery({
    queryKey: ['payroll-anomalies'],
    queryFn: () => apiGet('/api/payroll/anomalies'),
  });

  const calcQuery = useQuery({
    queryKey: ['payroll-calc', customGross],
    queryFn: () => apiPost('/api/payroll/calculate', { grossSalary: customGross }),
  });

  const p9aQuery = useQuery({
    queryKey: ['payroll-p9a', p9aEmployeeId],
    queryFn: () => apiGet(`/api/payroll/p9a/${p9aEmployeeId}`),
    enabled: Boolean(p9aEmployeeId),
  });

  const runs: any[] = runsQuery.data?.runs ?? [];
  const activeRun = runs.find(r => r.id === selectedRunId) ?? itemsQuery.data?.run ?? runs[0];
  const payrollItems: any[] = itemsQuery.data?.items ?? [];
  const configs: any[] = configsQuery.data?.items ?? [];
  const activeConfig = configs.find(c => c.isActive) ?? configs[0];

  const liveCalc = calcQuery.data?.grossPay !== undefined ? calcQuery.data : calculateKenyaPayroll(customGross);

  const totalGross = payrollItems.reduce((s, r) => s + (r.grossPay || 0), 0) || activeRun?.totalGross || 0;
  const totalNet = payrollItems.reduce((s, r) => s + (r.netPay || 0), 0) || activeRun?.totalNet || 0;
  const totalPaye = payrollItems.reduce((s, r) => s + (r.netPaye || 0), 0) || activeRun?.totalPaye || 0;
  const totalNssf = payrollItems.reduce((s, r) => s + (r.totalNssf || 0), 0) || activeRun?.totalNssf || 0;
  const totalSha = payrollItems.reduce((s, r) => s + (r.sha || 0), 0) || activeRun?.totalSha || 0;
  const totalHousing = payrollItems.reduce((s, r) => s + (r.housingLevy || 0), 0) || activeRun?.totalHousingLevy || 0;

  const handleApproveRun = async () => {
    if (!activeRun) return;
    try {
      const res = await apiPost('/api/payroll/approve', { period: activeRun.id });
      setStatusTone('ok');
      setStatusBanner(res.message || `Payroll run ${activeRun.period} approved for disbursement.`);
      qc.invalidateQueries({ queryKey: ['payroll-runs'] });
      qc.invalidateQueries({ queryKey: ['payroll-items', selectedRunId] });
      qc.invalidateQueries({ queryKey: ['payroll-journal', selectedRunId] });
    } catch (err: any) {
      setStatusTone('error');
      setStatusBanner(err?.message || 'Maker-Checker rule prevented self-approval on this payroll run.');
    }
  };

  const journalQuery = useQuery({
    queryKey: ['payroll-journal', selectedRunId],
    queryFn: () => apiGet<any>(`/api/payroll/runs/${selectedRunId}/journal`),
    enabled: showJournalModal && !!selectedRunId,
  });

  const handleExportJournalCsv = () => {
    const linesData: any[] = journalQuery.data?.lines ?? [];
    if (!linesData.length) return;
    const header = ['AccountCode', 'AccountName', 'CostCentre', 'DebitKES', 'CreditKES'];
    const rows = linesData.map((l: any) =>
      [
        l.accountCode,
        `"${String(l.accountName).replace(/"/g, '""')}"`,
        `"${String(l.costCentre || 'Rekker HQ').replace(/"/g, '""')}"`,
        l.debitKes ?? 0,
        l.creditKes ?? 0,
      ].join(','),
    );
    const blob = new Blob([[header.join(','), ...rows].join('\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `rekker-gl-journal-${selectedRunId}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleMpesaDisburse = async () => {
    if (!activeRun) return;
    try {
      const res = await apiPost(`/api/payroll/runs/${activeRun.id}/disburse-mpesa`, {});
      setStatusTone('ok');
      setStatusBanner(
        `Disbursed KES ${(res.totalDisbursedKes || 0).toLocaleString()} to ${res.totalEmployeesPaid} employees via M-Pesa B2C (${res.providerMode}).`,
      );
      qc.invalidateQueries({ queryKey: ['payroll-runs'] });
      qc.invalidateQueries({ queryKey: ['payroll-items', selectedRunId] });
    } catch (err: any) {
      setStatusTone('error');
      setStatusBanner(err?.message || 'Disbursement blocked until payroll run receives human approval.');
    }
  };

  const handleSaveConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    await apiPost('/api/payroll/statutory-configs', {
      name: cfgName,
      effectiveFrom: cfgEffectiveFrom,
      activate: true,
      nssf: { rate: 0.06, tier1UpperLimitKes: Number(cfgTier1), tier2UpperLimitKes: Number(cfgTier2), employerMatch: true },
      shif: { rate: Number(cfgShifRate) / 100, minimumKes: 300, deductibleFromTaxablePay: false, insuranceReliefRate: 0.15, insuranceReliefMaxKes: 5000 },
      housingLevy: { employeeRate: Number(cfgAhlRate) / 100, employerRate: Number(cfgAhlRate) / 100, deductibleFromTaxablePay: false },
      paye: {
        personalReliefKes: Number(cfgPersonalRelief),
        bands: activeConfig?.paye?.bands ?? [
          { label: 'First KES 24,000', limitKes: 24000, rate: 0.1 },
          { label: 'Next KES 8,333', limitKes: 8333, rate: 0.25 },
          { label: 'Next KES 467,667', limitKes: 467667, rate: 0.3 },
          { label: 'Next KES 300,000', limitKes: 300000, rate: 0.325 },
          { label: 'Above KES 800,000', limitKes: null, rate: 0.35 },
        ],
      },
    });
    setShowConfigModal(false);
    setStatusBanner(`Activated new Kenyan statutory rule configuration: "${cfgName}"`);
    qc.invalidateQueries({ queryKey: ['statutory-configs'] });
    qc.invalidateQueries({ queryKey: ['payroll-items'] });
    qc.invalidateQueries({ queryKey: ['payroll-calc'] });
  };

  const handleCreateRun = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await apiPost('/api/payroll/runs', { period: newRunPeriod });
      setShowNewRunModal(false);
      setStatusTone('ok');
      setStatusBanner(`Generated payroll run "${newRunPeriod}" ready for Maker-Checker review.`);
      await qc.invalidateQueries({ queryKey: ['payroll-runs'] });
      if (res?.run?.id) setSelectedRunId(res.run.id);
    } catch (err: any) {
      setStatusTone('error');
      setStatusBanner(err?.message || 'Unable to generate payroll run.');
    }
  };

  const handleExportRegisterCsv = () => {
    if (!payrollItems.length) return;
    const header = ['Employee', 'Department', 'KRA_PIN', 'GrossKES', 'NSSF_KES', 'SHIF_KES', 'AHL_KES', 'PAYE_KES', 'NetPayKES'];
    const rows = payrollItems.map((r: any) =>
      [`"${r.employeeName}"`, `"${r.departmentName}"`, r.kraPinMasked || '', r.grossPay, r.totalNssf, r.sha, r.housingLevy, r.netPaye, r.netPay].join(','),
    );
    const blob = new Blob([[header.join(','), ...rows].join('\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `rekker-payroll-register-${selectedRunId}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="mb-2 text-[10px] font-bold uppercase tracking-[.17em] text-[#bd2725]">Compensation, Tax & Disbursement</p>
          <h1 className="font-display text-3xl font-semibold tracking-[-.035em] text-stone-900 md:text-[34px]">
            Payroll & Kenya Statutory Engine
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-stone-500">
            Versioned, effective-dated Kenyan PAYE, NSSF, SHIF & Affordable Housing Levy engine with M-Pesa B2C payout gating.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button onClick={() => setShowNewRunModal(true)} className="btn btn-secondary text-xs" data-testid="button-open-new-run">
            <Plus size={15} /> Run Monthly Payroll
          </button>
          <button onClick={() => setShowConfigModal(true)} className="btn btn-secondary text-xs">
            <Settings2 size={15} /> Configure Statutory Rates
          </button>
          <button onClick={() => setShowJournalModal(true)} className="btn btn-secondary text-xs" data-testid="button-payroll-journal">
            <FileText size={15} /> Finance GL Journal
          </button>
          {activeRun?.status === 'reviewed' && (
            <button onClick={handleApproveRun} className="btn btn-primary text-xs">
              <ShieldCheck size={15} /> Approve Payroll Run
            </button>
          )}
          {activeRun?.status === 'approved' && (
            <button onClick={handleMpesaDisburse} className="btn bg-emerald-700 text-white hover:bg-emerald-800 text-xs">
              <Smartphone size={15} /> Disburse via M-Pesa B2C
            </button>
          )}
          {activeRun?.status === 'disbursed' && (
            <div className="inline-flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-800">
              <CheckCircle2 size={15} /> Disbursed ({activeRun.period})
            </div>
          )}
        </div>
      </div>

      {statusBanner && (
        <div
          className={`flex items-center justify-between rounded-xl border px-4 py-3 text-xs font-semibold ${
            statusTone === 'error'
              ? 'border-red-200 bg-red-50 text-red-900'
              : 'border-emerald-200 bg-emerald-50 text-emerald-900'
          }`}
        >
          <span>{statusBanner}</span>
          <button onClick={() => setStatusBanner(null)}><X size={14} /></button>
        </div>
      )}

      {/* Active Ruleset & Period Selector */}
      <div className="flex flex-col gap-3 rounded-2xl border border-stone-200 bg-white p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="text-xs">
          <span className="font-bold text-stone-700">Active Statutory Schedule:</span>{' '}
          <span className="font-mono text-red-700">{activeConfig?.name || 'Kenya 2025/2026 Schedule'}</span>{' '}
          <span className="text-stone-400">(Effective {activeConfig?.effectiveFrom || '2025-02-01'})</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-stone-500">Payroll Period:</span>
          <select value={selectedRunId} onChange={e => setSelectedRunId(e.target.value)} className="field min-h-9 w-44 text-xs font-bold">
            {runs.map(r => (
              <option key={r.id} value={r.id}>{r.period} ({r.status})</option>
            ))}
          </select>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="surface p-5">
          <p className="text-[11px] font-bold uppercase tracking-wider text-stone-400">Total Workforce Gross</p>
          <p className="mt-2 font-display text-2xl font-bold text-stone-900">KES {totalGross.toLocaleString()}</p>
          <p className="mt-1 text-[11px] text-stone-500">{payrollItems.length} Active Employees</p>
        </div>
        <div className="surface p-5">
          <p className="text-[11px] font-bold uppercase tracking-wider text-stone-400">Total Net Take-Home</p>
          <p className="mt-2 font-display text-2xl font-bold text-emerald-800">KES {totalNet.toLocaleString()}</p>
          <p className="mt-1 text-[11px] text-stone-500">{totalGross ? ((totalNet / totalGross) * 100).toFixed(1) : '0.0'}% payout ratio</p>
        </div>
        <div className="surface p-5">
          <p className="text-[11px] font-bold uppercase tracking-wider text-stone-400">KRA (PAYE + AHL)</p>
          <p className="mt-2 font-display text-2xl font-bold text-red-700">KES {(totalPaye + totalHousing).toLocaleString()}</p>
          <p className="mt-1 text-[11px] text-stone-500">PAYE: {totalPaye.toLocaleString()} · AHL: {totalHousing.toLocaleString()}</p>
        </div>
        <div className="surface p-5">
          <p className="text-[11px] font-bold uppercase tracking-wider text-stone-400">NSSF + SHIF</p>
          <p className="mt-2 font-display text-2xl font-bold text-stone-900">KES {(totalNssf + totalSha).toLocaleString()}</p>
          <p className="mt-1 text-[11px] text-stone-500">NSSF: {totalNssf.toLocaleString()} · SHIF: {totalSha.toLocaleString()}</p>
        </div>
      </div>

      {/* Live Configurable Tax Simulator */}
      <div className="surface p-6">
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between border-b border-stone-200/80 pb-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-red-100 text-red-700"><Calculator size={20} /></div>
            <div>
              <h3 className="font-display text-base font-bold text-stone-900">Kenya Configurable Statutory Simulator</h3>
              <p className="text-xs text-stone-500">Driven live by active organization statutory rules via /api/payroll/calculate.</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-stone-600">Gross KES:</span>
            <input type="number" step="5000" min="0" value={customGross} onChange={e => setCustomGross(Number(e.target.value) || 0)} className="field w-36 min-h-9 text-xs font-bold" />
          </div>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-3 lg:grid-cols-6 text-center">
          <div className="rounded-xl border border-stone-200 p-3"><p className="text-[10px] font-bold uppercase text-stone-400">NSSF Tier 1&2</p><p className="mt-1 text-sm font-bold">KES {(liveCalc.totalNssf || 0).toLocaleString()}</p></div>
          <div className="rounded-xl border border-stone-200 p-3"><p className="text-[10px] font-bold uppercase text-stone-400">SHIF</p><p className="mt-1 text-sm font-bold">KES {(liveCalc.sha || 0).toLocaleString()}</p></div>
          <div className="rounded-xl border border-stone-200 p-3"><p className="text-[10px] font-bold uppercase text-stone-400">Housing Levy</p><p className="mt-1 text-sm font-bold">KES {(liveCalc.housingLevy || 0).toLocaleString()}</p></div>
          <div className="rounded-xl border border-stone-200 p-3"><p className="text-[10px] font-bold uppercase text-stone-400">Net PAYE</p><p className="mt-1 text-sm font-bold text-red-700">KES {(liveCalc.netPaye || 0).toLocaleString()}</p></div>
          <div className="rounded-xl border border-stone-200 p-3"><p className="text-[10px] font-bold uppercase text-stone-400">Total Deducts</p><p className="mt-1 text-sm font-bold">KES {(liveCalc.totalDeductions || 0).toLocaleString()}</p></div>
          <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-3"><p className="text-[10px] font-bold uppercase text-emerald-800">Net Pay</p><p className="mt-1 text-sm font-bold text-emerald-900">KES {(liveCalc.netPay || 0).toLocaleString()}</p></div>
        </div>
      </div>

      {/* Statutory Audit Checks */}
      {(anomaliesQuery.data?.anomalies?.length ?? 0) > 0 && (
        <div className="surface p-4 flex flex-wrap gap-3">
          {anomaliesQuery.data.anomalies.map((a: any, i: number) => (
            <div key={i} className="flex items-center gap-2 rounded-lg border border-stone-200 bg-stone-50 px-3 py-2 text-xs">
              <CheckCircle2 size={14} className={a.status === 'passed' ? 'text-emerald-700' : 'text-amber-600'} />
              <span className="font-semibold text-stone-800">{a.description}</span>
            </div>
          ))}
        </div>
      )}

      {/* Payroll Items Table */}
      <div className="surface overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-stone-100 p-4">
          <h3 className="font-display text-sm font-bold text-stone-900">{activeRun?.period || 'Current'} Payroll Register</h3>
          <div className="flex items-center gap-2">
            <button type="button" onClick={handleExportRegisterCsv} disabled={!payrollItems.length} className="btn btn-secondary min-h-8 px-2.5 text-[11px]" data-testid="button-export-payroll-csv">
              <FileText size={13} /> Export Register CSV
            </button>
            <span className="rounded-md bg-stone-100 px-2.5 py-1 text-xs font-semibold text-stone-600">{payrollItems.length} Employees</span>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
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
                  <td className="px-4 py-3 font-semibold text-stone-900">{r.employeeName}<p className="text-[10px] font-normal text-stone-500">{r.departmentName}</p></td>
                  <td className="px-4 py-3 font-mono text-[11px] text-stone-500">{r.kraPinMasked || 'Masked'}</td>
                  <td className="px-4 py-3 text-right font-medium">KES {r.grossPay.toLocaleString()}</td>
                  <td className="px-4 py-3 text-right text-stone-600">KES {r.totalNssf.toLocaleString()}</td>
                  <td className="px-4 py-3 text-right text-stone-600">KES {r.sha.toLocaleString()}</td>
                  <td className="px-4 py-3 text-right text-stone-600">KES {r.housingLevy.toLocaleString()}</td>
                  <td className="px-4 py-3 text-right font-semibold text-red-700">KES {r.netPaye.toLocaleString()}</td>
                  <td className="px-4 py-3 text-right font-bold text-emerald-800">KES {r.netPay.toLocaleString()}</td>
                  <td className="px-4 py-3 text-right space-x-1">
                    <button onClick={() => setSelectedPayslip(r)} className="inline-flex items-center gap-1 rounded bg-stone-100 px-2 py-1 text-[10px] font-bold hover:bg-stone-200"><Eye size={11} /> Payslip</button>
                    <button onClick={() => setP9aEmployeeId(r.employeeId)} className="inline-flex items-center gap-1 rounded bg-red-50 px-2 py-1 text-[10px] font-bold text-red-700 hover:bg-red-100"><FileText size={11} /> P9A</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Payslip Modal */}
      {selectedPayslip && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-950/40 p-4 backdrop-blur-xs">
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-stone-200 pb-3">
              <div>
                <h3 className="font-display text-base font-bold text-stone-900">Rekker Limited</h3>
                <p className="text-xs text-stone-500">Official Payslip · {selectedPayslip.period} · {selectedPayslip.employeeName}</p>
              </div>
              <button onClick={() => setSelectedPayslip(null)}><X size={18} /></button>
            </div>
            <div className="mt-4 space-y-2 text-xs">
              <div className="flex justify-between"><span>Base + Allowances</span><span className="font-bold">KES {selectedPayslip.grossPay.toLocaleString()}</span></div>
              <div className="flex justify-between text-stone-600"><span>NSSF (Tier I + II)</span><span>- KES {selectedPayslip.totalNssf.toLocaleString()}</span></div>
              <div className="flex justify-between text-stone-600"><span>SHIF Contribution</span><span>- KES {selectedPayslip.sha.toLocaleString()}</span></div>
              <div className="flex justify-between text-stone-600"><span>Affordable Housing Levy</span><span>- KES {selectedPayslip.housingLevy.toLocaleString()}</span></div>
              <div className="flex justify-between text-stone-600"><span>KRA Net PAYE</span><span>- KES {selectedPayslip.netPaye.toLocaleString()}</span></div>
              <div className="flex justify-between border-t border-stone-200 pt-2 text-sm font-bold text-emerald-800"><span>Net Payout</span><span>KES {selectedPayslip.netPay.toLocaleString()}</span></div>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button onClick={() => window.print()} className="btn btn-secondary text-xs">Print</button>
              <button onClick={() => setSelectedPayslip(null)} className="btn btn-primary text-xs">Close</button>
            </div>
          </div>
        </div>
      )}

      {/* KRA P9A Modal */}
      {p9aEmployeeId && p9aQuery.data && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-950/40 p-4 backdrop-blur-xs">
          <div className="w-full max-w-2xl rounded-2xl bg-white p-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-stone-200 pb-3">
              <div>
                <h3 className="font-display text-base font-bold text-stone-900">{p9aQuery.data.formType}</h3>
                <p className="text-xs text-stone-500">{p9aQuery.data.employeeName} · PIN {p9aQuery.data.employeePinMasked}</p>
              </div>
              <button onClick={() => setP9aEmployeeId(null)}><X size={18} /></button>
            </div>
            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-stone-50 text-[10px] uppercase text-stone-500">
                  <tr><th className="p-2">Month</th><th className="p-2 text-right">Gross</th><th className="p-2 text-right">NSSF</th><th className="p-2 text-right">Chargeable</th><th className="p-2 text-right">PAYE</th></tr>
                </thead>
                <tbody className="divide-y divide-stone-100">
                  {p9aQuery.data.months.map((m: any) => (
                    <tr key={m.month}><td className="p-2 font-semibold">{m.month}</td><td className="p-2 text-right">{m.grossPay.toLocaleString()}</td><td className="p-2 text-right">{m.nssfContribution.toLocaleString()}</td><td className="p-2 text-right">{m.chargeablePay.toLocaleString()}</td><td className="p-2 text-right font-bold text-red-700">{m.payeDeducted.toLocaleString()}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button onClick={() => window.print()} className="btn btn-secondary text-xs">Print P9A Card</button>
              <button onClick={() => setP9aEmployeeId(null)} className="btn btn-primary text-xs">Done</button>
            </div>
          </div>
        </div>
      )}

      {/* Statutory Rule Config Modal */}
      {showConfigModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-950/40 p-4 backdrop-blur-xs">
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-stone-200 pb-3">
              <h3 className="font-display text-base font-bold text-stone-900">Configure Kenya Statutory Rates</h3>
              <button onClick={() => setShowConfigModal(false)}><X size={18} /></button>
            </div>
            <form onSubmit={handleSaveConfig} className="mt-4 space-y-3 text-xs">
              <div><label className="label">Schedule Version Name</label><input required value={cfgName} onChange={e => setCfgName(e.target.value)} className="field" /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="label">Effective Date</label><input type="date" required value={cfgEffectiveFrom} onChange={e => setCfgEffectiveFrom(e.target.value)} className="field" /></div>
                <div><label className="label">Personal Relief (KES)</label><input type="number" required value={cfgPersonalRelief} onChange={e => setCfgPersonalRelief(Number(e.target.value))} className="field" /></div>
                <div><label className="label">NSSF Tier I Limit (KES)</label><input type="number" required value={cfgTier1} onChange={e => setCfgTier1(Number(e.target.value))} className="field" /></div>
                <div><label className="label">NSSF Tier II Limit (KES)</label><input type="number" required value={cfgTier2} onChange={e => setCfgTier2(Number(e.target.value))} className="field" /></div>
                <div><label className="label">SHIF Rate (%)</label><input type="number" step="0.05" required value={cfgShifRate} onChange={e => setCfgShifRate(Number(e.target.value))} className="field" /></div>
                <div><label className="label">Housing Levy Rate (%)</label><input type="number" step="0.1" required value={cfgAhlRate} onChange={e => setCfgAhlRate(Number(e.target.value))} className="field" /></div>
              </div>
              <div className="flex justify-end gap-2 pt-3">
                <button type="button" onClick={() => setShowConfigModal(false)} className="btn btn-secondary text-xs">Cancel</button>
                <button type="submit" className="btn btn-primary text-xs"><Plus size={14} /> Save & Activate Schedule</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showJournalModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-950/40 p-4 backdrop-blur-xs" data-testid="modal-payroll-journal">
          <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-stone-100 pb-4">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[.16em] text-[#bd2725]">Finance ERP Integration / Cost-Centre GL</p>
                <h2 className="font-display text-xl font-bold text-stone-900">Double-Entry Payroll Journal ({activeRun?.period ?? selectedRunId})</h2>
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
                <button onClick={() => setShowJournalModal(false)} className="btn btn-ghost min-h-8 px-2" aria-label="Close GL journal">
                  <X size={18} />
                </button>
              </div>
            </div>

            {journalQuery.isLoading ? (
              <p className="py-8 text-center text-sm text-stone-500">Generating cost-centre general ledger journal…</p>
            ) : journalQuery.isError ? (
              <p className="py-6 text-sm text-red-700">Failed to generate GL journal for this payroll run.</p>
            ) : (
              <div className="mt-4 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-stone-200 bg-stone-50 px-4 py-3 text-xs">
                  <span>
                    <strong className="text-stone-800">Schedule:</strong> {journalQuery.data?.configName ?? 'Kenya Statutory 2025/2026'}
                  </span>
                  <div className="flex items-center gap-4">
                    <span>Debits: <strong>KES {(journalQuery.data?.totalDebitsKes ?? 0).toLocaleString()}</strong></span>
                    <span>Credits: <strong>KES {(journalQuery.data?.totalCreditsKes ?? 0).toLocaleString()}</strong></span>
                    <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ${journalQuery.data?.balanced ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-800'}`}>
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
                      {(journalQuery.data?.lines ?? []).map((line: any, idx: number) => (
                        <tr key={`${line.accountCode}-${idx}`} className="hover:bg-stone-50/70">
                          <td className="px-3 py-2.5">
                            <span className="font-mono text-[11px] font-bold text-stone-700">{line.accountCode}</span>{' '}
                            <span className="text-stone-800">{line.accountName}</span>
                          </td>
                          <td className="px-3 py-2.5 font-mono text-[11px] text-stone-600">{line.costCentre}</td>
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

      {showNewRunModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-950/40 p-4 backdrop-blur-xs" onClick={() => setShowNewRunModal(false)} data-testid="modal-new-payroll-run">
          <form onSubmit={handleCreateRun} onClick={(e) => e.stopPropagation()} className="w-full max-w-md space-y-4 rounded-2xl bg-white p-6 text-xs shadow-2xl">
            <div className="flex items-center justify-between border-b border-stone-200 pb-3">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[.16em] text-[#bd2725]">Monthly Cycle Preparation</p>
                <h3 className="font-display text-lg font-bold text-stone-900">Generate New Payroll Run</h3>
              </div>
              <button type="button" onClick={() => setShowNewRunModal(false)}><X size={18} /></button>
            </div>
            <p className="leading-5 text-stone-500">
              Computes gross earnings, NSSF Tier I &amp; II, SHIF, Affordable Housing Levy, and PAYE using the active effective-dated statutory schedule, then enters <strong>reviewed</strong> state for separate Checker signoff.
            </p>
            <div>
              <label className="label">Payroll Period Label</label>
              <input required value={newRunPeriod} onChange={(e) => setNewRunPeriod(e.target.value)} className="field" placeholder="e.g. April 2026" data-testid="input-new-run-period" />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setShowNewRunModal(false)} className="btn btn-secondary text-xs">Cancel</button>
              <button type="submit" className="btn btn-primary text-xs" data-testid="button-confirm-new-run">
                <Plus size={14} /> Generate Run
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
