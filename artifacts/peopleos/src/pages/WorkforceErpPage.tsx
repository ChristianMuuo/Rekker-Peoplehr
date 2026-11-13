import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Activity,
  AlertCircle,
  AlertTriangle,
  ArrowRightLeft,
  Award,
  Calendar,
  Check,
  CheckCircle2,
  Clock,
  Cpu,
  DollarSign,
  Factory,
  FileText,
  Filter,
  Layers,
  MapPin,
  Plus,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  TrendingUp,
  Truck,
  UserCheck,
  Users,
  Warehouse,
  Wrench,
  X,
  Zap,
} from 'lucide-react';
import { useListEmployees } from '@workspace/api-client-react';
import { apiGet, apiPost } from '../lib/api';

export function WorkforceErpPage() {
  const qc = useQueryClient();
  const [tab, setTab] = useState<
    'overview' | 'production' | 'relief' | 'competencies' | 'drivers' | 'sales' | 'integrations'
  >('overview');

  // Filters & State
  const [unitFilter, setUnitFilter] = useState<string>('all');
  const [selectedDate, setSelectedDate] = useState<string>(new Date().toISOString().slice(0, 10));
  const [certFilterCategory, setCertFilterCategory] = useState<string>('all');
  const [banner, setBanner] = useState<{ type: 'success' | 'error' | 'warning'; message: string } | null>(null);

  // Modals
  const [showShiftModal, setShowShiftModal] = useState(false);
  const [showCertModal, setShowCertModal] = useState(false);
  const [showSwapModal, setShowSwapModal] = useState(false);
  const [showDispatchCheckModal, setShowDispatchCheckModal] = useState(false);

  // Shift Modal State
  const [shiftEmpId, setShiftEmpId] = useState('');
  const [shiftUnit, setShiftUnit] = useState('production');
  const [shiftZone, setShiftZone] = useState('Formulation Line A');
  const [shiftName, setShiftName] = useState('Morning (06:00-14:00)');
  const [shiftSkill, setShiftSkill] = useState('Line Formulation & Filling');
  const [shiftCostCentre, setShiftCostCentre] = useState('CC-MFG-01');
  const [shiftStartTime, setShiftStartTime] = useState('06:00');
  const [shiftEndTime, setShiftEndTime] = useState('14:00');

  // Cert Modal State
  const [certEmpId, setCertEmpId] = useState('');
  const [certCategory, setCertCategory] = useState<'production_safety' | 'equipment_operation' | 'driving_license' | 'compliance'>('equipment_operation');
  const [certType, setCertType] = useState('Counterbalance Forklift (Class I/IV)');
  const [certEquipment, setCertEquipment] = useState('Counterbalance Forklift');
  const [certIssuingOrg, setCertIssuingOrg] = useState('Toyota Forklift Training Academy');
  const [certNumber, setCertNumber] = useState('');
  const [certIssueDate, setCertIssueDate] = useState(new Date().toISOString().slice(0, 10));
  const [certExpiryDate, setCertExpiryDate] = useState(
    new Date(Date.now() + 365 * 2 * 86400000).toISOString().slice(0, 10),
  );

  // Swap Modal State
  const [swapTargetEmpId, setSwapTargetEmpId] = useState('');
  const [swapCurrentShift, setSwapCurrentShift] = useState('Morning (06:00-14:00)');
  const [swapProposedShift, setSwapProposedShift] = useState('Afternoon (14:00-22:00)');
  const [swapReason, setSwapReason] = useState('');

  // Dispatch Simulator State
  const [dispatchDriverEmpId, setDispatchDriverEmpId] = useState('');
  const [dispatchVehicle, setDispatchVehicle] = useState('KDM 482L · Box Distribution Truck');
  const [dispatchResult, setDispatchResult] = useState<any>(null);

  // Queries
  const employeesQ = useListEmployees({ page: 1, pageSize: 50 });
  const overviewQ = useQuery({
    queryKey: ['wf-erp-overview', selectedDate, unitFilter],
    queryFn: () => apiGet(`/api/workforce-erp/overview?date=${selectedDate}`),
  });
  const execSummaryQ = useQuery({
    queryKey: ['wf-erp-exec-summary'],
    queryFn: () => apiGet('/api/workforce-erp/executive-summary'),
  });
  const linesQ = useQuery({
    queryKey: ['wf-erp-lines'],
    queryFn: () => apiGet('/api/workforce-erp/production/lines'),
  });
  const templatesQ = useQuery({
    queryKey: ['wf-erp-templates'],
    queryFn: () => apiGet('/api/workforce-erp/shift-templates'),
  });
  const replacementsQ = useQuery({
    queryKey: ['wf-erp-replacements', selectedDate],
    queryFn: () => apiGet(`/api/workforce-erp/production/replacements?date=${selectedDate}`),
  });
  const certsQ = useQuery({
    queryKey: ['wf-erp-certs'],
    queryFn: () => apiGet('/api/workforce-erp/certifications'),
  });
  const driversQ = useQuery({
    queryKey: ['wf-erp-drivers'],
    queryFn: () => apiGet('/api/workforce-erp/drivers'),
  });
  const salesQ = useQuery({
    queryKey: ['wf-erp-sales'],
    queryFn: () => apiGet('/api/workforce-erp/sales-force'),
  });
  const territoriesQ = useQuery({
    queryKey: ['wf-erp-territories'],
    queryFn: () => apiGet('/api/workforce-erp/territories'),
  });
  const swapsQ = useQuery({
    queryKey: ['wf-erp-swaps'],
    queryFn: () => apiGet('/api/workforce-erp/shift-swaps'),
  });
  const integrationsQ = useQuery({
    queryKey: ['wf-erp-integrations'],
    queryFn: () => apiGet('/api/workforce-erp/integrations'),
  });

  const employeeList = employeesQ.data?.items ?? [];
  const heatmap: any[] = overviewQ.data?.heatmap ?? [];
  const roster: any[] = overviewQ.data?.roster ?? [];
  const filteredRoster = unitFilter === 'all' ? roster : roster.filter((r) => r.unitType === unitFilter);
  const execSummary = execSummaryQ.data;
  const lines: any[] = linesQ.data?.items ?? [];
  const templates: any[] = templatesQ.data?.items ?? [];
  const missingCoverage: any[] = replacementsQ.data?.missingCoverageEmployees ?? [];
  const qualifiedReplacements: any[] = replacementsQ.data?.qualifiedReplacements ?? [];
  const excludedCandidates: any[] = replacementsQ.data?.excludedCandidatesSummary ?? [];
  const certs: any[] = certsQ.data?.items ?? [];
  const filteredCerts =
    certFilterCategory === 'all' ? certs : certs.filter((c) => c.category === certFilterCategory);
  const drivers: any[] = driversQ.data?.items ?? [];
  const salesReps: any[] = salesQ.data?.items ?? [];
  const territories: any[] = territoriesQ.data?.items ?? [];
  const swaps: any[] = swapsQ.data?.items ?? [];
  const adapters: any[] = integrationsQ.data?.adapters ?? [];

  // Handlers
  const handleAssignShift = async (e: React.FormEvent) => {
    e.preventDefault();
    const targetEmpId = shiftEmpId || employeeList[0]?.id;
    if (!targetEmpId) return;
    try {
      await apiPost('/api/workforce-erp/shifts', {
        employeeId: targetEmpId,
        unitType: shiftUnit,
        workZone: shiftZone,
        shiftDate: selectedDate,
        shiftName,
        startTime: shiftStartTime,
        endTime: shiftEndTime,
        roleSkill: shiftSkill,
        costCentreCode: shiftCostCentre,
      });
      setShowShiftModal(false);
      setBanner({
        type: 'success',
        message: `Scheduled shift assignment on ${shiftZone} (${shiftName}) for ${selectedDate}.`,
      });
      qc.invalidateQueries({ queryKey: ['wf-erp-overview'] });
    } catch (err: any) {
      setBanner({
        type: 'error',
        message: err?.message || 'Failed to assign shift. Please check for schedule conflicts or leave.',
      });
    }
  };

  const handleDeployRelief = async (replacementEmployeeId: string, name: string) => {
    const missing = missingCoverage[0];
    const targetZone = missing ? `${missing.departmentName} Coverage` : 'Formulation Line A';
    try {
      const res = await apiPost('/api/workforce-erp/production/assign-relief', {
        replacementEmployeeId,
        targetUnitType: missing?.departmentName?.toLowerCase().includes('logistics') ? 'warehouse' : 'production',
        targetZone,
        shiftDate: selectedDate,
        shiftName: 'Morning (06:00-14:00)',
      });
      setBanner({
        type: 'success',
        message: `Deployed ${name} as safety-cleared relief onto ${res.targetZone ?? targetZone}.`,
      });
      qc.invalidateQueries({ queryKey: ['wf-erp-overview'] });
      qc.invalidateQueries({ queryKey: ['wf-erp-replacements'] });
    } catch (err: any) {
      setBanner({
        type: 'error',
        message: err?.message || 'Failed to deploy relief operator.',
      });
    }
  };

  const handleRegisterCert = async (e: React.FormEvent) => {
    e.preventDefault();
    const targetEmpId = certEmpId || employeeList[0]?.id;
    if (!targetEmpId || !certNumber) return;
    try {
      await apiPost('/api/workforce-erp/certifications', {
        employeeId: targetEmpId,
        category: certCategory,
        competencyType: certType,
        equipmentType: certEquipment || null,
        issuingOrg: certIssuingOrg,
        certificateNumber: certNumber,
        issueDate: certIssueDate,
        expiryDate: certExpiryDate,
      });
      setShowCertModal(false);
      setCertNumber('');
      setBanner({
        type: 'success',
        message: `Registered ${certType} certification (pending supervisor verification).`,
      });
      qc.invalidateQueries({ queryKey: ['wf-erp-certs'] });
    } catch (err: any) {
      setBanner({ type: 'error', message: err?.message || 'Failed to register certification.' });
    }
  };

  const handleCertDecision = async (certId: string, decision: 'verified' | 'rejected' | 'revoked') => {
    try {
      await apiPost(`/api/workforce-erp/certifications/${certId}/verify`, {
        decision,
        reason: decision === 'verified' ? 'Verified against issuing authority registry' : 'Does not meet safety criteria',
      });
      setBanner({
        type: 'success',
        message: `Certification successfully updated to ${decision.toUpperCase()}.`,
      });
      qc.invalidateQueries({ queryKey: ['wf-erp-certs'] });
    } catch (err: any) {
      setBanner({ type: 'error', message: err?.message || 'Action failed.' });
    }
  };

  const handleRequestSwap = async (e: React.FormEvent) => {
    e.preventDefault();
    const targetEmpId = swapTargetEmpId || employeeList[1]?.id;
    if (!targetEmpId) return;
    try {
      await apiPost('/api/workforce-erp/shift-swaps', {
        targetEmployeeId: targetEmpId,
        shiftDate: selectedDate,
        currentShiftName: swapCurrentShift,
        proposedShiftName: swapProposedShift,
        reason: swapReason || 'Personal schedule adjustment',
      });
      setShowSwapModal(false);
      setSwapReason('');
      setBanner({
        type: 'success',
        message: 'Shift swap request submitted for supervisor approval.',
      });
      qc.invalidateQueries({ queryKey: ['wf-erp-swaps'] });
    } catch (err: any) {
      setBanner({ type: 'error', message: err?.message || 'Failed to submit shift swap.' });
    }
  };

  const handleSwapDecision = async (swapId: string, decision: 'approved' | 'rejected') => {
    try {
      await apiPost(`/api/workforce-erp/shift-swaps/${swapId}/decision`, {
        decision,
        decisionComment: decision === 'approved' ? 'Approved by operations supervisor.' : 'Rejected due to line minimum staffing constraints.',
      });
      setBanner({
        type: 'success',
        message: `Shift swap ${decision}.`,
      });
      qc.invalidateQueries({ queryKey: ['wf-erp-swaps'] });
      qc.invalidateQueries({ queryKey: ['wf-erp-overview'] });
    } catch (err: any) {
      setBanner({ type: 'error', message: err?.message || 'Failed to record swap decision.' });
    }
  };

  const handleValidateDispatch = async (e: React.FormEvent) => {
    e.preventDefault();
    const targetDriverId = dispatchDriverEmpId || drivers[0]?.employeeId;
    if (!targetDriverId) return;
    try {
      const res = await apiPost('/api/workforce-erp/drivers/validate-dispatch', {
        driverEmployeeId: targetDriverId,
        vehicleAssetTag: dispatchVehicle,
      });
      setDispatchResult(res);
    } catch (err: any) {
      setDispatchResult({
        dispatchAllowed: false,
        reasons: [err?.message || 'Dispatch check failed'],
        alertLevel: 'expired',
      });
    }
  };

  const handlePingAdapter = async (key: string, name: string) => {
    try {
      const res = await apiPost(`/api/workforce-erp/integrations/${key}/ping`);
      setBanner({
        type: res.status === 'reachable' ? 'success' : 'warning',
        message: `${name}: ${res.status.toUpperCase()} (${res.latencyMs ? `${res.latencyMs}ms` : 'No response'} · ${res.message})`,
      });
      qc.invalidateQueries({ queryKey: ['wf-erp-integrations'] });
    } catch (err: any) {
      setBanner({ type: 'error', message: `Ping failed for ${name}: ${err?.message}` });
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-red-50 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[#C71D1D]">
              <Factory size={12} /> Phase 4 · Enterprise ERP
            </span>
            <span className="text-xs text-stone-400">Operational Scheduling &amp; Governance</span>
          </div>
          <h1 className="mt-1 font-display text-3xl font-bold tracking-tight text-stone-900">
            Workforce ERP Operations
          </h1>
          <p className="mt-1 max-w-3xl text-xs text-stone-500">
            Real-time synchronization between Employee Master records, Leave availability, Manufacturing lines,
            Warehouse equipment authorizations, Distribution fleet licenses, Sales territories, and External adapters.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => setShowCertModal(true)}
            className="btn btn-secondary text-xs"
            data-testid="button-open-register-cert"
          >
            <Award size={14} /> Register Cert
          </button>
          <button
            onClick={() => setShowShiftModal(true)}
            className="btn btn-primary text-xs"
            data-testid="button-open-schedule-shift"
          >
            <Plus size={14} /> Schedule Shift
          </button>
        </div>
      </div>

      {/* Notification Banner */}
      {banner && (
        <div
          className={`flex items-center justify-between rounded-xl border px-4 py-3 text-xs font-semibold ${
            banner.type === 'success'
              ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
              : banner.type === 'warning'
                ? 'border-amber-200 bg-amber-50 text-amber-900'
                : 'border-red-200 bg-red-50 text-red-900'
          }`}
        >
          <div className="flex items-center gap-2">
            {banner.type === 'success' && <CheckCircle2 size={16} className="text-emerald-600" />}
            {banner.type === 'warning' && <AlertTriangle size={16} className="text-amber-600" />}
            {banner.type === 'error' && <AlertCircle size={16} className="text-red-600" />}
            <span>{banner.message}</span>
          </div>
          <button onClick={() => setBanner(null)} aria-label="Dismiss banner" className="hover:opacity-75">
            <X size={14} />
          </button>
        </div>
      )}

      {/* Executive Metrics Bar */}
      {execSummary && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
          <div className="surface p-3.5">
            <p className="text-[10px] font-bold uppercase tracking-wider text-stone-400">Shift Coverage</p>
            <div className="mt-1 flex items-baseline gap-2">
              <span className={`font-display text-2xl font-bold ${execSummary.overallCoveragePct < 90 ? 'text-amber-700' : 'text-emerald-700'}`}>
                {execSummary.overallCoveragePct}%
              </span>
              <span className="text-[10px] text-stone-400">roster target</span>
            </div>
          </div>
          <div className="surface p-3.5">
            <p className="text-[10px] font-bold uppercase tracking-wider text-stone-400">Critical Shortages</p>
            <div className="mt-1 flex items-baseline gap-2">
              <span className={`font-display text-2xl font-bold ${execSummary.criticalShortagesCount > 0 ? 'text-[#C71D1D]' : 'text-stone-700'}`}>
                {execSummary.criticalShortagesCount}
              </span>
              <span className="text-[10px] text-stone-400">units affected</span>
            </div>
          </div>
          <div className="surface p-3.5">
            <p className="text-[10px] font-bold uppercase tracking-wider text-stone-400">Active Drivers</p>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="font-display text-2xl font-bold text-stone-900">{execSummary.activeDriversCount}</span>
              <span className="text-[10px] text-stone-400">BCE/C1 fleet</span>
            </div>
          </div>
          <div className="surface p-3.5">
            <p className="text-[10px] font-bold uppercase tracking-wider text-stone-400">Fleet Expiry Alerts</p>
            <div className="mt-1 flex items-baseline gap-2">
              <span className={`font-display text-2xl font-bold ${execSummary.driverAlertsCount > 0 ? 'text-amber-700' : 'text-stone-700'}`}>
                {execSummary.driverAlertsCount}
              </span>
              <span className="text-[10px] text-stone-400">&le;45d / expired</span>
            </div>
          </div>
          <div className="surface p-3.5">
            <p className="text-[10px] font-bold uppercase tracking-wider text-stone-400">Sales Attainment</p>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="font-display text-2xl font-bold text-emerald-700">{execSummary.salesTargetAttainmentPct}%</span>
              <span className="text-[10px] text-stone-400">territory target</span>
            </div>
          </div>
          <div className="surface p-3.5">
            <p className="text-[10px] font-bold uppercase tracking-wider text-stone-400">Expiring Certs (30d)</p>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="font-display text-2xl font-bold text-amber-700">{execSummary.expiringCertifications30dCount}</span>
              <span className="text-[10px] text-stone-400">require review</span>
            </div>
          </div>
        </div>
      )}

      {/* Navigation Tabs */}
      <div className="flex flex-wrap gap-1.5 border-b border-stone-200 pb-3">
        {[
          { id: 'overview', label: 'Availability Heatmap', icon: Layers },
          { id: 'production', label: 'Lines & Shift Scheduling', icon: Factory },
          { id: 'relief', label: 'Absence Relief & Swaps', icon: ArrowRightLeft },
          { id: 'competencies', label: 'Equipment & Competency', icon: Award },
          { id: 'drivers', label: 'Distribution & Fleet', icon: Truck },
          { id: 'sales', label: 'Territories & Sales Force', icon: MapPin },
          { id: 'integrations', label: 'Integrations & Adapters', icon: Cpu },
        ].map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setTab(id as any)}
            className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-bold transition-colors ${
              tab === id
                ? 'bg-[#C71D1D] text-white shadow-xs'
                : 'bg-white text-stone-600 ring-1 ring-stone-200 hover:bg-stone-50'
            }`}
            data-testid={`tab-wf-${id}`}
          >
            <Icon size={14} /> {label}
          </button>
        ))}
      </div>

      {/* TAB 1: AVAILABILITY HEATMAP & ROSTERS */}
      {tab === 'overview' && (
        <div className="space-y-6">
          {/* Controls Bar */}
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-stone-200 bg-stone-50 p-4 text-xs">
            <div className="flex flex-wrap items-center gap-3">
              <span className="flex items-center gap-1 font-bold text-stone-700">
                <Calendar size={14} /> Schedule Date:
              </span>
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="field max-w-[160px] bg-white py-1 text-xs font-semibold"
              />
              <button
                type="button"
                onClick={() => setSelectedDate(new Date().toISOString().slice(0, 10))}
                className="btn btn-secondary py-1 text-[11px]"
              >
                Today
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
              <span className="font-bold text-stone-600">Unit:</span>
              {['all', 'production', 'warehouse', 'distribution', 'sales', 'corporate'].map((u) => (
                <button
                  key={u}
                  type="button"
                  onClick={() => setUnitFilter(u)}
                  className={`rounded-full px-3 py-1 text-[11px] font-bold capitalize transition-colors ${
                    unitFilter === u
                      ? 'bg-[#C71D1D] text-white'
                      : 'bg-white text-stone-600 ring-1 ring-stone-200 hover:bg-stone-100'
                  }`}
                >
                  {u}
                </button>
              ))}
            </div>
          </div>

          {/* Heatmap Cards Grid */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {heatmap.map((h) => {
              const isShortage = h.coveragePct < 70;
              const isWarning = h.coveragePct < 100 && h.coveragePct >= 70;
              return (
                <div key={h.unitType} className="surface p-5">
                  <div className="flex items-center justify-between text-xs font-bold uppercase text-stone-500">
                    <span className="flex items-center gap-1.5 capitalize text-stone-900">
                      <Layers size={13} className="text-[#C71D1D]" /> {h.unitType}
                    </span>
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-extrabold ${
                        isShortage
                          ? 'bg-red-50 text-[#C71D1D]'
                          : isWarning
                            ? 'bg-amber-50 text-amber-800'
                            : 'bg-emerald-50 text-emerald-700'
                      }`}
                    >
                      {h.coveragePct}%
                    </span>
                  </div>
                  <div className="mt-3 flex items-baseline justify-between">
                    <div>
                      <p className="font-display text-3xl font-bold text-stone-900">
                        {h.present} <span className="text-sm font-normal text-stone-400">/ {h.required ?? h.scheduled}</span>
                      </p>
                      <p className="text-[11px] text-stone-500">Eligible on duty / Required</p>
                    </div>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-stone-400">
                      {h.shortageStatus?.replace('_', ' ') ?? 'NORMAL'}
                    </span>
                  </div>
                  <div className="mt-3 h-2 overflow-hidden rounded-full bg-stone-100">
                    <div
                      className={`h-full rounded-full transition-all duration-300 ${
                        isShortage ? 'bg-[#C71D1D]' : isWarning ? 'bg-amber-500' : 'bg-[#338956]'
                      }`}
                      style={{ width: `${Math.min(h.coveragePct, 100)}%` }}
                    />
                  </div>
                  <p className="mt-2 text-[11px] text-stone-500">
                    {h.awayOrPendingLeave > 0 ? (
                      <span className="font-semibold text-amber-700">{h.awayOrPendingLeave} away on approved leave</span>
                    ) : (
                      <span className="text-emerald-700">0 absences · 100% capacity</span>
                    )}
                  </p>
                </div>
              );
            })}
          </div>

          {/* Operational Shift Roster Table */}
          <div className="surface overflow-x-auto">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-stone-100 p-5">
              <div>
                <h2 className="font-display text-lg font-bold text-stone-900">
                  Operational Shift &amp; Competency Roster
                </h2>
                <p className="text-xs text-stone-500">
                  Live snapshot of scheduled personnel, verified skills, and leave clearances for {selectedDate}.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowShiftModal(true)}
                className="btn btn-secondary text-xs"
              >
                <Plus size={14} /> Add Shift Entry
              </button>
            </div>
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-stone-200 text-[10px] font-bold uppercase tracking-wider text-stone-400">
                  <th className="p-4">Employee</th>
                  <th className="p-4">Unit</th>
                  <th className="p-4">Work Zone / Line</th>
                  <th className="p-4">Shift Window</th>
                  <th className="p-4">Certified Skill / Role</th>
                  <th className="p-4">Cost Centre</th>
                  <th className="p-4">Duty Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {filteredRoster.map((r, idx) => (
                  <tr key={`${r.employeeId}-${r.workZone}-${idx}`} className="hover:bg-stone-50/60">
                    <td className="p-4">
                      <div className="font-bold text-stone-900">{r.employeeName}</div>
                      <div className="text-[10px] font-mono text-stone-400">{r.employeeId.slice(0, 8)}...</div>
                    </td>
                    <td className="p-4 capitalize text-stone-600">
                      <span className="rounded bg-stone-100 px-2 py-0.5 text-[10px] font-bold uppercase text-stone-600">
                        {r.unitType}
                      </span>
                    </td>
                    <td className="p-4 font-semibold text-stone-800">{r.workZone}</td>
                    <td className="p-4 text-stone-600">{r.shiftName}</td>
                    <td className="p-4">
                      <div className="flex items-center gap-1.5 text-stone-700">
                        <Award size={13} className="text-emerald-600" />
                        <span>{r.roleSkill}</span>
                      </div>
                    </td>
                    <td className="p-4 font-mono font-bold text-[#C71D1D]">{r.costCentreCode}</td>
                    <td className="p-4">
                      <span
                        className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-bold ${
                          r.availableToday
                            ? 'bg-emerald-50 text-emerald-700'
                            : 'bg-amber-50 text-amber-800'
                        }`}
                      >
                        {r.availableToday ? (
                          <>
                            <CheckCircle2 size={11} /> Present / Cleared
                          </>
                        ) : (
                          <>
                            <AlertTriangle size={11} /> Leave / Relief Needed
                          </>
                        )}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 2: PRODUCTION LINES & SHIFT SCHEDULING */}
      {tab === 'production' && (
        <div className="space-y-6">
          {/* Production Lines Section */}
          <div>
            <div className="flex items-center justify-between pb-3">
              <div>
                <h2 className="font-display text-lg font-bold text-stone-900">
                  Manufacturing Lines &amp; Work Zones
                </h2>
                <p className="text-xs text-stone-500">
                  Track minimum operational staffing thresholds, operating hours, and required safety certifications.
                </p>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              {lines.map((l) => (
                <div key={l.id} className="surface p-5">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-xs font-bold text-stone-400">{l.code}</span>
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase ${
                        l.operationalStatus === 'active'
                          ? 'bg-emerald-50 text-emerald-700'
                          : l.operationalStatus === 'maintenance'
                            ? 'bg-amber-50 text-amber-800'
                            : 'bg-stone-100 text-stone-600'
                      }`}
                    >
                      {l.operationalStatus}
                    </span>
                  </div>
                  <h3 className="mt-2 font-display text-base font-bold text-stone-900">{l.name}</h3>
                  <p className="text-xs text-stone-500">{l.workZone}</p>

                  <div className="mt-4 space-y-2 rounded-xl bg-stone-50 p-3 text-xs">
                    <div className="flex justify-between">
                      <span className="text-stone-500">Min Staffing</span>
                      <strong className="text-stone-900">{l.minStaffing} Operators</strong>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-stone-500">Hours</span>
                      <span className="font-semibold text-stone-700">{l.operatingHours}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-stone-500">Cost Centre</span>
                      <strong className="font-mono text-[#C71D1D]">{l.costCentreCode}</strong>
                    </div>
                  </div>

                  <div className="mt-3">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-stone-400">Required Skills</p>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {l.requiredSkills?.map((s: string) => (
                        <span key={s} className="rounded bg-stone-100 px-2 py-0.5 text-[10px] font-medium text-stone-700">
                          {s}
                        </span>
                      ))}
                    </div>
                  </div>

                  <div className="mt-3">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-stone-400">Safety Protocols</p>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {l.requiredCertifications?.map((c: string) => (
                        <span key={c} className="rounded bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-800">
                          {c}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Shift Templates List */}
          <div className="surface p-5">
            <h2 className="font-display text-base font-bold text-stone-900">Configured Operational Shift Templates</h2>
            <p className="text-xs text-stone-500">
              Standardized shift windows ensuring compliance with Kenyan Employment Act working hour limits.
            </p>
            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              {templates.map((tpl) => (
                <div key={tpl.id} className="rounded-xl border border-stone-200 p-4 text-xs">
                  <div className="flex justify-between">
                    <span className="font-mono text-[11px] font-bold text-stone-400">{tpl.code}</span>
                    <span className="rounded bg-stone-100 px-2 py-0.5 text-[10px] font-bold uppercase text-stone-600">
                      {tpl.unitType}
                    </span>
                  </div>
                  <h4 className="mt-1 font-bold text-stone-900">{tpl.name}</h4>
                  <p className="text-[11px] text-stone-500">{tpl.workZone}</p>
                  <div className="mt-3 flex items-center justify-between border-t border-stone-100 pt-2 text-[11px]">
                    <span className="font-semibold text-stone-700">
                      {tpl.startTime} &ndash; {tpl.endTime} ({tpl.durationHours}h)
                    </span>
                    <span className="font-mono font-bold text-[#C71D1D]">{tpl.costCentreCode}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: INTELLIGENT ABSENCE RELIEF & SHIFT SWAPS */}
      {tab === 'relief' && (
        <div className="space-y-6">
          <div className="grid gap-6 lg:grid-cols-2">
            {/* Missing Coverage Alert Card */}
            <div className="surface p-6">
              <div className="flex items-center gap-2">
                <ShieldAlert size={18} className="text-amber-600" />
                <h2 className="font-display text-lg font-bold text-stone-900">Missing Shift Coverage</h2>
              </div>
              <p className="mt-1 text-xs text-stone-500">
                Scheduled operators currently on approved annual, sick, or compassionate leave.
              </p>

              {!missingCoverage.length ? (
                <div className="mt-6 flex flex-col items-center justify-center rounded-xl border border-dashed border-stone-200 p-8 text-center">
                  <CheckCircle2 size={32} className="text-emerald-600" />
                  <p className="mt-2 text-xs font-bold text-stone-900">Full Shift Integrity</p>
                  <p className="text-[11px] text-stone-500">All scheduled manufacturing &amp; warehouse operators are active.</p>
                </div>
              ) : (
                <div className="mt-4 space-y-3">
                  {missingCoverage.map((m) => (
                    <div key={m.employeeId} className="rounded-xl border border-amber-200 bg-amber-50/70 p-4 text-xs">
                      <div className="flex items-center justify-between">
                        <strong className="font-bold text-amber-950">{m.name}</strong>
                        <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-[10px] font-bold text-amber-800">
                          Approved Leave
                        </span>
                      </div>
                      <p className="mt-1 text-amber-900">{m.departmentName} &middot; {m.shiftName}</p>
                      <p className="mt-2 text-[11px] text-amber-800">
                        Station: <strong>{m.workZone}</strong> &middot; Replacement deployment required.
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Transparent Replacement Recommendations */}
            <div className="surface p-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <UserCheck size={18} className="text-emerald-600" />
                  <h2 className="font-display text-lg font-bold text-stone-900">Intelligent Replacement Matching</h2>
                </div>
                <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-[10px] font-bold text-emerald-800">
                  Multi-Factor Scored
                </span>
              </div>
              <p className="mt-1 text-xs text-stone-500">
                Ranked by competency match (+40), zone familiarity (+25), zero conflict (+20), and tenure (+15).
              </p>

              {!qualifiedReplacements.length ? (
                <div className="mt-6 rounded-xl border border-stone-200 p-6 text-center text-xs text-stone-500">
                  No replacement candidates match all hard qualification gates for this date.
                </div>
              ) : (
                <div className="mt-4 space-y-3">
                  {qualifiedReplacements.map((q) => (
                    <div
                      key={q.employeeId}
                      className="rounded-xl border border-stone-200 bg-white p-4 text-xs shadow-2xs"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <div className="flex items-center gap-2">
                            <strong className="text-sm font-bold text-stone-900">{q.name}</strong>
                            <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-extrabold text-emerald-800">
                              {q.score}/100 Match
                            </span>
                          </div>
                          <p className="text-stone-500">{q.jobTitle} &middot; {q.departmentName}</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleDeployRelief(q.employeeId, q.name)}
                          className="btn btn-primary min-h-8 px-3 text-[11px]"
                          data-testid={`button-deploy-relief-${q.employeeId}`}
                        >
                          Deploy Relief
                        </button>
                      </div>

                      <div className="mt-2.5 flex flex-wrap gap-1">
                        {q.qualifyingReasons?.map((r: string) => (
                          <span key={r} className="rounded bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-800">
                            {r}
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Excluded Candidates Breakdown */}
          {excludedCandidates.length > 0 && (
            <div className="surface p-5">
              <h3 className="font-display text-sm font-bold text-stone-800">Excluded Candidate Summary</h3>
              <p className="text-xs text-stone-500">
                Hard eligibility gates strictly exclude personnel with active leave, shift overlap, or unverified safety credentials.
              </p>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                {excludedCandidates.map((exc) => (
                  <div key={exc.employeeId} className="rounded-lg border border-stone-200 bg-stone-50/80 p-3 text-xs">
                    <span className="font-bold text-stone-800">{exc.name}</span> &middot;{' '}
                    <span className="text-stone-500">{exc.jobTitle}</span>
                    <ul className="mt-1 list-inside list-disc text-[11px] text-amber-800">
                      {exc.excludedReasons?.map((r: string) => <li key={r}>{r}</li>)}
                    </ul>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Shift Swaps Workflow */}
          <div className="surface p-6">
            <div className="flex items-center justify-between pb-3">
              <div>
                <h2 className="font-display text-lg font-bold text-stone-900">Peer Shift Swap Requests</h2>
                <p className="text-xs text-stone-500">
                  Audited shift swap requests requiring mutual employee consent and supervisor signoff.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowSwapModal(true)}
                className="btn btn-secondary text-xs"
              >
                <Plus size={14} /> Propose Swap
              </button>
            </div>

            {!swaps.length ? (
              <p className="py-4 text-xs text-stone-400">No shift swap requests active.</p>
            ) : (
              <div className="mt-3 space-y-3">
                {swaps.map((s) => (
                  <div key={s.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-stone-200 p-4 text-xs">
                    <div>
                      <div className="flex items-center gap-2">
                        <strong className="text-stone-900">{s.requestingEmployeeName}</strong>
                        <ArrowRightLeft size={13} className="text-stone-400" />
                        <strong className="text-stone-900">{s.targetEmployeeName}</strong>
                        <span
                          className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${
                            s.status === 'approved'
                              ? 'bg-emerald-50 text-emerald-700'
                              : s.status === 'rejected'
                                ? 'bg-red-50 text-red-700'
                                : 'bg-amber-50 text-amber-800'
                          }`}
                        >
                          {s.status}
                        </span>
                      </div>
                      <p className="mt-1 text-stone-600">
                        {s.currentShiftName} &rarr; {s.proposedShiftName}
                      </p>
                      <p className="text-[11px] text-stone-400">Reason: {s.reason}</p>
                    </div>

                    {s.status === 'pending' && (
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => handleSwapDecision(s.id, 'approved')}
                          className="btn btn-primary min-h-8 px-3 text-[11px]"
                        >
                          Approve Swap
                        </button>
                        <button
                          type="button"
                          onClick={() => handleSwapDecision(s.id, 'rejected')}
                          className="btn btn-secondary min-h-8 px-3 text-[11px]"
                        >
                          Reject
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 4: WAREHOUSE & EQUIPMENT COMPETENCIES */}
      {tab === 'competencies' && (
        <div className="space-y-6">
          {/* Equipment Authorizations Category Grid */}
          <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-6">
            {[
              { name: 'Counterbalance Forklift', desc: 'Class I / IV', code: 'FL-01' },
              { name: 'High-Bay Reach Truck', desc: 'Class II High Lift', code: 'RT-02' },
              { name: 'VNA Man-Up Turret', desc: 'Very Narrow Aisle', code: 'VNA-03' },
              { name: 'Powered Pallet Truck', desc: 'PPT Operator', code: 'PPT-04' },
              { name: 'Order Picker', desc: 'High Level Picking', code: 'OP-05' },
              { name: 'Overhead Crane', desc: 'Heavy Hoist Operation', code: 'CR-06' },
            ].map((eq) => (
              <div key={eq.code} className="surface p-3.5 text-center">
                <span className="font-mono text-[10px] font-bold text-stone-400">{eq.code}</span>
                <p className="mt-1 font-bold text-stone-900">{eq.name}</p>
                <p className="text-[10px] text-stone-500">{eq.desc}</p>
              </div>
            ))}
          </div>

          {/* Certifications Table */}
          <div className="surface overflow-x-auto">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-stone-100 p-5">
              <div>
                <h2 className="font-display text-lg font-bold text-stone-900">
                  Equipment Operation &amp; Safety Certifications Registry
                </h2>
                <p className="text-xs text-stone-500">
                  Verification status lifecycle: Pending Review &rarr; Verified, Rejected, or Revoked.
                </p>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {['all', 'equipment_operation', 'production_safety', 'driving_license', 'compliance'].map((cat) => (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setCertFilterCategory(cat)}
                    className={`rounded-full px-3 py-1 text-[11px] font-bold capitalize ${
                      certFilterCategory === cat
                        ? 'bg-[#C71D1D] text-white'
                        : 'bg-stone-100 text-stone-600 hover:bg-stone-200'
                    }`}
                  >
                    {cat.replace('_', ' ')}
                  </button>
                ))}
              </div>
            </div>

            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-stone-200 text-[10px] font-bold uppercase tracking-wider text-stone-400">
                  <th className="p-4">Employee</th>
                  <th className="p-4">Competency / Equipment</th>
                  <th className="p-4">Issuing Authority</th>
                  <th className="p-4">Certificate #</th>
                  <th className="p-4">Validity Window</th>
                  <th className="p-4">Status</th>
                  <th className="p-4 text-right">Supervisor Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {filteredCerts.map((c) => (
                  <tr key={c.id} className="hover:bg-stone-50/60">
                    <td className="p-4 font-bold text-stone-900">{c.employeeName}</td>
                    <td className="p-4">
                      <div className="font-semibold text-stone-800">{c.competencyType}</div>
                      {c.equipmentType && (
                        <div className="text-[10px] text-stone-500">Machine: {c.equipmentType}</div>
                      )}
                    </td>
                    <td className="p-4 text-stone-600">{c.issuingOrg}</td>
                    <td className="p-4 font-mono font-bold text-stone-700">{c.certificateNumber}</td>
                    <td className="p-4 text-stone-600">
                      <span>{c.issueDate}</span> &rarr; <strong>{c.expiryDate}</strong>
                    </td>
                    <td className="p-4">
                      <span
                        className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase ${
                          c.verificationStatus === 'verified'
                            ? 'bg-emerald-50 text-emerald-700'
                            : c.verificationStatus === 'pending_verification'
                              ? 'bg-amber-50 text-amber-800'
                              : 'bg-red-50 text-red-700'
                        }`}
                      >
                        {c.verificationStatus.replace('_', ' ')}
                      </span>
                    </td>
                    <td className="p-4 text-right">
                      {c.verificationStatus === 'pending_verification' ? (
                        <div className="flex justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => handleCertDecision(c.id, 'verified')}
                            className="btn btn-primary min-h-7 px-2 text-[10px]"
                            title="Verify Certification"
                          >
                            <Check size={12} /> Verify
                          </button>
                          <button
                            type="button"
                            onClick={() => handleCertDecision(c.id, 'rejected')}
                            className="btn btn-secondary min-h-7 px-2 text-[10px]"
                            title="Reject"
                          >
                            <X size={12} />
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => handleCertDecision(c.id, 'revoked')}
                          className="text-[11px] font-semibold text-stone-400 hover:text-red-700"
                        >
                          Revoke
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 5: DISTRIBUTION FLEET & DRIVERS */}
      {tab === 'drivers' && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-display text-lg font-bold text-stone-900">Commercial Fleet Drivers &amp; NTSA Compliance</h2>
              <p className="text-xs text-stone-500">
                Dynamic server-date calculation of license expiries, corridor assignments, and vehicle asset links.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowDispatchCheckModal(true)}
              className="btn btn-primary text-xs"
              data-testid="button-open-dispatch-check"
            >
              <Truck size={14} /> Validate Dispatch Clearance
            </button>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            {drivers.map((d) => {
              const isExpired = d.alertLevel === 'expired';
              const isWarning = d.alertLevel === 'expiring_soon';
              return (
                <div key={d.employeeId} className="surface p-6 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="font-mono font-bold text-stone-500">{d.licenseNumber}</span>
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase ${
                        isExpired
                          ? 'bg-red-50 text-[#C71D1D]'
                          : isWarning
                            ? 'bg-amber-50 text-amber-800'
                            : 'bg-emerald-50 text-emerald-700'
                      }`}
                    >
                      {isExpired
                        ? 'EXPIRED (GROUNDED)'
                        : isWarning
                          ? `RENEW IN ${d.daysRemaining}D`
                          : 'VALID & COMPLIANT'}
                    </span>
                  </div>
                  <h3 className="mt-2 font-display text-lg font-bold text-stone-900">{d.driverName}</h3>
                  <p className="font-semibold text-stone-700">{d.licenseClass}</p>

                  <div className="mt-4 space-y-2 rounded-xl bg-stone-50 p-3.5">
                    <div className="flex justify-between">
                      <span className="text-stone-500">Vehicle Asset</span>
                      <strong className="text-stone-900">{d.assignedVehicleSnapshot ?? d.assignedVehicle}</strong>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-stone-500">Route Corridor</span>
                      <span className="font-semibold text-stone-800">{d.routeCorridor}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-stone-500">NTSA License Expiry</span>
                      <strong>{d.licenseExpiryDate ?? d.licenseExpiry}</strong>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-stone-500">PSV / Safety Cert</span>
                      <span>{d.psvOrSafetyCertExpiry ?? 'Not Required'}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* TAB 6: SALES FORCE & TERRITORIES */}
      {tab === 'sales' && (
        <div className="space-y-6">
          <div>
            <h2 className="font-display text-lg font-bold text-stone-900">Commercial Territories &amp; Regional Hubs</h2>
            <p className="text-xs text-stone-500">
              Assigned coverage corridors with monthly sales targets and real-time attainment attribution.
            </p>
            <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {territories.map((t) => (
                <div key={t.id} className="surface p-4 text-xs">
                  <div className="flex justify-between">
                    <span className="font-mono font-bold text-stone-400">{t.code}</span>
                    <span className="font-mono font-bold text-[#C71D1D]">{t.costCentreCode}</span>
                  </div>
                  <h3 className="mt-1 font-bold text-stone-900">{t.name}</h3>
                  <p className="text-[11px] text-stone-500">Regional Hub: {t.regionalHub}</p>
                  <div className="mt-3 flex justify-between border-t border-stone-100 pt-2">
                    <span className="text-stone-500">Monthly Target</span>
                    <strong>KES {(t.monthlyTargetKes ?? 0).toLocaleString()}</strong>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div>
            <h2 className="font-display text-lg font-bold text-stone-900">
              Sales Rep Performance &amp; Commission Calculation
            </h2>
            <p className="text-xs text-stone-500">
              Attributed territory sales with transparent commission previews. Actual disbursements executed via payroll maker-checker.
            </p>
            <div className="mt-3 grid gap-4 md:grid-cols-2">
              {salesReps.map((s) => (
                <div key={s.employeeId} className="surface p-6 text-xs">
                  <div className="flex justify-between">
                    <span className="font-mono font-bold text-[#C71D1D]">{s.costCentreCode}</span>
                    <span className="font-bold text-emerald-700">{s.attainmentPct}% Attainment</span>
                  </div>
                  <h3 className="mt-2 font-display text-lg font-bold text-stone-900">{s.repName}</h3>
                  <p className="text-stone-600">Territory: {s.territory}</p>

                  <div className="mt-4 h-2 overflow-hidden rounded-full bg-stone-100">
                    <div
                      className={`h-full rounded-full ${
                        s.attainmentPct >= 100 ? 'bg-emerald-600' : 'bg-[#C71D1D]'
                      }`}
                      style={{ width: `${Math.min(s.attainmentPct, 100)}%` }}
                    />
                  </div>

                  <div className="mt-4 space-y-1.5 rounded-xl bg-stone-50 p-3.5">
                    <div className="flex justify-between">
                      <span>Monthly Target</span>
                      <strong>KES {s.monthlyTargetKes.toLocaleString()}</strong>
                    </div>
                    <div className="flex justify-between">
                      <span>Attributed Sales</span>
                      <strong className="text-stone-900">KES {s.actualAttributedKes.toLocaleString()}</strong>
                    </div>
                    <div className="flex justify-between text-[#C71D1D]">
                      <span>Est. Commission ({s.commissionRatePct}%)</span>
                      <strong className="text-base font-bold">KES {s.estimatedCommissionKes.toLocaleString()}</strong>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* TAB 7: INTEGRATIONS & HARDWARE READINESS */}
      {tab === 'integrations' && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-display text-lg font-bold text-stone-900">
                Honest Integration Readiness Center
              </h2>
              <p className="text-xs text-stone-500">
                External integrations never simulate connection. Adapters report honest missing credentials and provide diagnostic ping testing.
              </p>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {adapters.map((a) => (
              <div key={a.key} className="surface p-6 text-xs">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-[10px] font-bold uppercase text-stone-400">{a.category}</span>
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase ${
                      a.status === 'live_network_active'
                        ? 'bg-emerald-50 text-emerald-700'
                        : a.status === 'sandbox_simulation'
                          ? 'bg-blue-50 text-blue-700'
                          : 'bg-amber-50 text-amber-800'
                    }`}
                  >
                    {a.status?.replace('_', ' ')}
                  </span>
                </div>
                <h3 className="mt-2 font-display text-base font-bold text-stone-900">{a.name}</h3>
                <p className="mt-1 text-stone-500">{a.detail}</p>

                <div className="mt-4 rounded-xl border border-stone-200 bg-stone-50 p-3 text-[11px]">
                  <p className="font-bold text-stone-700">Configuration Requirement:</p>
                  <p className="font-mono text-stone-600">{a.configurationRequirement}</p>
                  {a.latencyMs && (
                    <p className="mt-1 font-semibold text-emerald-700">Heartbeat: {a.latencyMs}ms latency</p>
                  )}
                </div>

                <div className="mt-4 flex justify-end">
                  <button
                    type="button"
                    onClick={() => handlePingAdapter(a.key, a.name)}
                    className="btn btn-secondary min-h-8 px-3 text-[11px]"
                    data-testid={`button-ping-${a.key}`}
                  >
                    <RefreshCw size={12} /> Diagnostic Ping
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* MODAL 1: SCHEDULE SHIFT */}
      {showShiftModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-stone-950/50 p-4 backdrop-blur-xs"
          onClick={() => setShowShiftModal(false)}
          data-testid="modal-schedule-shift"
        >
          <form
            onSubmit={handleAssignShift}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-lg space-y-3 rounded-2xl bg-white p-6 text-xs shadow-2xl"
          >
            <div className="flex items-center justify-between border-b border-stone-100 pb-3">
              <h3 className="font-display text-lg font-bold text-stone-900">Schedule Operational Shift</h3>
              <button type="button" onClick={() => setShowShiftModal(false)}><X size={18} /></button>
            </div>

            <div>
              <label className="label">Employee</label>
              <select
                value={shiftEmpId || employeeList[0]?.id || ''}
                onChange={(e) => setShiftEmpId(e.target.value)}
                className="field"
              >
                {employeeList.map((emp) => (
                  <option key={emp.id} value={emp.id}>
                    {emp.firstName} {emp.lastName} &middot; {emp.departmentName}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Unit Type</label>
                <select value={shiftUnit} onChange={(e) => setShiftUnit(e.target.value)} className="field">
                  <option value="production">Production</option>
                  <option value="warehouse">Warehouse</option>
                  <option value="distribution">Distribution</option>
                  <option value="sales">Sales Force</option>
                  <option value="corporate">Corporate</option>
                </select>
              </div>
              <div>
                <label className="label">Cost Centre</label>
                <input
                  required
                  value={shiftCostCentre}
                  onChange={(e) => setShiftCostCentre(e.target.value)}
                  className="field font-mono"
                />
              </div>
            </div>

            <div>
              <label className="label">Work Zone / Production Line</label>
              <input
                required
                value={shiftZone}
                onChange={(e) => setShiftZone(e.target.value)}
                className="field"
                placeholder="e.g. Formulation Line A"
              />
            </div>

            <div>
              <label className="label">Shift Name / Template</label>
              <input
                required
                value={shiftName}
                onChange={(e) => setShiftName(e.target.value)}
                className="field"
                placeholder="e.g. Morning (06:00-14:00)"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Start Time</label>
                <input
                  required
                  value={shiftStartTime}
                  onChange={(e) => setShiftStartTime(e.target.value)}
                  className="field"
                />
              </div>
              <div>
                <label className="label">End Time</label>
                <input
                  required
                  value={shiftEndTime}
                  onChange={(e) => setShiftEndTime(e.target.value)}
                  className="field"
                />
              </div>
            </div>

            <div>
              <label className="label">Certified Skill / Role</label>
              <input
                required
                value={shiftSkill}
                onChange={(e) => setShiftSkill(e.target.value)}
                className="field"
                placeholder="e.g. Line Formulation & Filling"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setShowShiftModal(false)} className="btn btn-secondary">
                Cancel
              </button>
              <button type="submit" className="btn btn-primary" data-testid="button-submit-shift">
                Save Shift Assignment
              </button>
            </div>
          </form>
        </div>
      )}

      {/* MODAL 2: REGISTER CERTIFICATION */}
      {showCertModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-stone-950/50 p-4 backdrop-blur-xs"
          onClick={() => setShowCertModal(false)}
          data-testid="modal-register-cert"
        >
          <form
            onSubmit={handleRegisterCert}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-lg space-y-3 rounded-2xl bg-white p-6 text-xs shadow-2xl"
          >
            <div className="flex items-center justify-between border-b border-stone-100 pb-3">
              <h3 className="font-display text-lg font-bold text-stone-900">Register Safety / Equipment Certification</h3>
              <button type="button" onClick={() => setShowCertModal(false)}><X size={18} /></button>
            </div>

            <div>
              <label className="label">Employee</label>
              <select
                value={certEmpId || employeeList[0]?.id || ''}
                onChange={(e) => setCertEmpId(e.target.value)}
                className="field"
              >
                {employeeList.map((emp) => (
                  <option key={emp.id} value={emp.id}>
                    {emp.firstName} {emp.lastName} &middot; {emp.departmentName}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Category</label>
                <select
                  value={certCategory}
                  onChange={(e) => setCertCategory(e.target.value as any)}
                  className="field"
                >
                  <option value="equipment_operation">Equipment Operation</option>
                  <option value="production_safety">Production Safety</option>
                  <option value="driving_license">Driving License</option>
                  <option value="compliance">Compliance</option>
                </select>
              </div>
              <div>
                <label className="label">Certificate #</label>
                <input
                  required
                  value={certNumber}
                  onChange={(e) => setCertNumber(e.target.value)}
                  className="field font-mono"
                  placeholder="e.g. TFT-FL-2024-991"
                />
              </div>
            </div>

            <div>
              <label className="label">Competency Type</label>
              <input
                required
                value={certType}
                onChange={(e) => setCertType(e.target.value)}
                className="field"
                placeholder="e.g. Counterbalance Forklift (Class I/IV)"
              />
            </div>

            <div>
              <label className="label">Equipment Type (If Applicable)</label>
              <input
                value={certEquipment}
                onChange={(e) => setCertEquipment(e.target.value)}
                className="field"
                placeholder="e.g. Counterbalance Forklift"
              />
            </div>

            <div>
              <label className="label">Issuing Authority</label>
              <input
                required
                value={certIssuingOrg}
                onChange={(e) => setCertIssuingOrg(e.target.value)}
                className="field"
                placeholder="e.g. Toyota Forklift Training Academy"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Issue Date</label>
                <input
                  type="date"
                  required
                  value={certIssueDate}
                  onChange={(e) => setCertIssueDate(e.target.value)}
                  className="field"
                />
              </div>
              <div>
                <label className="label">Expiry Date</label>
                <input
                  type="date"
                  required
                  value={certExpiryDate}
                  onChange={(e) => setCertExpiryDate(e.target.value)}
                  className="field"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setShowCertModal(false)} className="btn btn-secondary">
                Cancel
              </button>
              <button type="submit" className="btn btn-primary" data-testid="button-submit-cert">
                Submit for Verification
              </button>
            </div>
          </form>
        </div>
      )}

      {/* MODAL 3: PROPOSE SHIFT SWAP */}
      {showSwapModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-stone-950/50 p-4 backdrop-blur-xs"
          onClick={() => setShowSwapModal(false)}
          data-testid="modal-propose-swap"
        >
          <form
            onSubmit={handleRequestSwap}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md space-y-3 rounded-2xl bg-white p-6 text-xs shadow-2xl"
          >
            <div className="flex items-center justify-between border-b border-stone-100 pb-3">
              <h3 className="font-display text-lg font-bold text-stone-900">Propose Shift Swap</h3>
              <button type="button" onClick={() => setShowSwapModal(false)}><X size={18} /></button>
            </div>

            <div>
              <label className="label">Target Peer Operator</label>
              <select
                value={swapTargetEmpId || employeeList[1]?.id || ''}
                onChange={(e) => setSwapTargetEmpId(e.target.value)}
                className="field"
              >
                {employeeList.map((emp) => (
                  <option key={emp.id} value={emp.id}>
                    {emp.firstName} {emp.lastName} &middot; {emp.departmentName}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="label">Current Shift</label>
              <input
                required
                value={swapCurrentShift}
                onChange={(e) => setSwapCurrentShift(e.target.value)}
                className="field"
              />
            </div>

            <div>
              <label className="label">Proposed Swap Shift</label>
              <input
                required
                value={swapProposedShift}
                onChange={(e) => setSwapProposedShift(e.target.value)}
                className="field"
              />
            </div>

            <div>
              <label className="label">Reason for Swap</label>
              <textarea
                required
                value={swapReason}
                onChange={(e) => setSwapReason(e.target.value)}
                className="field min-h-20"
                placeholder="Explain the reason for this shift swap request..."
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setShowSwapModal(false)} className="btn btn-secondary">
                Cancel
              </button>
              <button type="submit" className="btn btn-primary" data-testid="button-submit-swap">
                Submit Swap Request
              </button>
            </div>
          </form>
        </div>
      )}

      {/* MODAL 4: DISPATCH CLEARANCE CHECK */}
      {showDispatchCheckModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-stone-950/50 p-4 backdrop-blur-xs"
          onClick={() => setShowDispatchCheckModal(false)}
          data-testid="modal-dispatch-check"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-lg space-y-4 rounded-2xl bg-white p-6 text-xs shadow-2xl"
          >
            <div className="flex items-center justify-between border-b border-stone-100 pb-3">
              <h3 className="font-display text-lg font-bold text-stone-900">
                Fleet Dispatch Clearance Check
              </h3>
              <button type="button" onClick={() => setShowDispatchCheckModal(false)}><X size={18} /></button>
            </div>

            <form onSubmit={handleValidateDispatch} className="space-y-3">
              <div>
                <label className="label">Select Commercial Driver</label>
                <select
                  value={dispatchDriverEmpId || drivers[0]?.employeeId || ''}
                  onChange={(e) => setDispatchDriverEmpId(e.target.value)}
                  className="field"
                >
                  {drivers.map((d) => (
                    <option key={d.employeeId} value={d.employeeId}>
                      {d.driverName} &middot; {d.licenseClass} ({d.licenseNumber})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="label">Target Vehicle Asset</label>
                <input
                  required
                  value={dispatchVehicle}
                  onChange={(e) => setDispatchVehicle(e.target.value)}
                  className="field"
                />
              </div>

              <button type="submit" className="btn btn-primary w-full text-xs" data-testid="button-run-dispatch-check">
                <Truck size={14} /> Validate Dispatch Clearance
              </button>
            </form>

            {dispatchResult && (
              <div
                className={`rounded-xl border p-4 text-xs ${
                  dispatchResult.dispatchAllowed
                    ? 'border-emerald-200 bg-emerald-50 text-emerald-950'
                    : 'border-red-200 bg-red-50 text-red-950'
                }`}
              >
                <div className="flex items-center gap-2">
                  {dispatchResult.dispatchAllowed ? (
                    <CheckCircle2 size={18} className="text-emerald-600" />
                  ) : (
                    <AlertTriangle size={18} className="text-[#C71D1D]" />
                  )}
                  <strong className="text-sm">
                    {dispatchResult.dispatchAllowed ? 'DISPATCH CLEARED' : 'DISPATCH BLOCKED'}
                  </strong>
                </div>

                <p className="mt-2 text-stone-700">Driver: <strong>{dispatchResult.driverName}</strong></p>
                {dispatchResult.daysRemaining !== undefined && (
                  <p className="text-[11px] text-stone-600">License Days Remaining: {dispatchResult.daysRemaining} days</p>
                )}

                {!dispatchResult.dispatchAllowed && dispatchResult.reasons?.length > 0 && (
                  <div className="mt-2 text-[11px] text-red-800">
                    <p className="font-bold">Blocking Infractions:</p>
                    <ul className="list-inside list-disc">
                      {dispatchResult.reasons.map((r: string) => <li key={r}>{r}</li>)}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
