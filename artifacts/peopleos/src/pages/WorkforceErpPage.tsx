import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle, CheckCircle2, Factory, GitBranch, Layers, MapPin, Plus, ShieldCheck, Truck, Users, Warehouse, X,
} from 'lucide-react';
import { useListEmployees } from '@workspace/api-client-react';
import { apiGet, apiPost } from '../lib/api';

export function WorkforceErpPage() {
  const qc = useQueryClient();
  const [tab, setTab] = useState<'overview' | 'production' | 'drivers' | 'sales' | 'workflows'>('overview');
  const [unitFilter, setUnitFilter] = useState<string>('all');
  const [showShiftModal, setShowShiftModal] = useState(false);
  const [shiftEmpId, setShiftEmpId] = useState('');
  const [shiftUnit, setShiftUnit] = useState('production');
  const [shiftZone, setShiftZone] = useState('Formulation Line A');
  const [shiftName, setShiftName] = useState('Morning (06:00-14:00)');
  const [shiftSkill, setShiftSkill] = useState('Line Formulation & Filling');
  const [shiftCostCentre, setShiftCostCentre] = useState('CC-MFG-01');
  const [banner, setBanner] = useState<string | null>(null);
  const [wfDomain, setWfDomain] = useState('leave');
  const [wfName, setWfName] = useState('');
  const [wfLevels, setWfLevels] = useState('2');
  const [wfSla, setWfSla] = useState('24');

  const employeesQ = useListEmployees({ page: 1, pageSize: 50 });
  const overviewQ = useQuery({ queryKey: ['wf-erp-overview'], queryFn: () => apiGet('/api/workforce-erp/overview') });
  const replacementsQ = useQuery({ queryKey: ['wf-erp-replacements'], queryFn: () => apiGet('/api/workforce-erp/production/replacements') });
  const driversQ = useQuery({ queryKey: ['wf-erp-drivers'], queryFn: () => apiGet('/api/workforce-erp/drivers') });
  const salesQ = useQuery({ queryKey: ['wf-erp-sales'], queryFn: () => apiGet('/api/workforce-erp/sales-force') });
  const rulesQ = useQuery({ queryKey: ['wf-rules'], queryFn: () => apiGet('/api/workflow-rules') });
  const integrationsQ = useQuery({ queryKey: ['integrations-status'], queryFn: () => apiGet('/api/integrations/status') });

  const heatmap: any[] = overviewQ.data?.heatmap ?? [];
  const roster: any[] = overviewQ.data?.roster ?? [];
  const filteredRoster = unitFilter === 'all' ? roster : roster.filter((r) => r.unitType === unitFilter);
  const missingCoverage: any[] = replacementsQ.data?.missingCoverageEmployees ?? [];
  const qualifiedReplacements: any[] = replacementsQ.data?.qualifiedReplacements ?? [];
  const drivers: any[] = driversQ.data?.items ?? [];
  const salesReps: any[] = salesQ.data?.items ?? [];
  const rules: any[] = rulesQ.data?.items ?? [];
  const adapters: any[] = integrationsQ.data?.adapters ?? [];
  const employeeList = employeesQ.data?.items ?? [];

  const handleAssignShift = async (e: React.FormEvent) => {
    e.preventDefault();
    const targetEmpId = shiftEmpId || employeeList[0]?.id;
    if (!targetEmpId) return;
    await apiPost('/api/workforce-erp/shifts', {
      employeeId: targetEmpId,
      unitType: shiftUnit,
      workZone: shiftZone,
      shiftName,
      roleSkill: shiftSkill,
      costCentreCode: shiftCostCentre,
    });
    setShowShiftModal(false);
    setBanner(`Scheduled shift assignment on ${shiftZone} (${shiftName}).`);
    qc.invalidateQueries({ queryKey: ['wf-erp-overview'] });
  };

  const handleDeployRelief = async (replacementEmployeeId: string, name: string) => {
    const missing = missingCoverage[0];
    const targetZone = missing ? `${missing.departmentName} Coverage` : 'Formulation Line A';
    const res = await apiPost('/api/workforce-erp/production/assign-relief', {
      replacementEmployeeId,
      targetUnitType: missing?.departmentName?.toLowerCase().includes('logistics') ? 'warehouse' : 'production',
      targetZone,
      shiftName: 'Morning (06:00-14:00)',
    });
    setBanner(`Deployed ${name} as safety-cleared relief onto ${res.targetZone ?? targetZone}.`);
    qc.invalidateQueries({ queryKey: ['wf-erp-overview'] });
    qc.invalidateQueries({ queryKey: ['wf-erp-replacements'] });
  };

  const handleCreateRule = async (e: React.FormEvent) => {
    e.preventDefault();
    await apiPost('/api/workflow-rules', {
      domain: wfDomain,
      name: wfName,
      approvalLevels: Number(wfLevels) || 2,
      slaHours: Number(wfSla) || 24,
      requiredApproverRoles: ['department_manager', 'hr_manager'],
    });
    setWfName('');
    qc.invalidateQueries({ queryKey: ['wf-rules'] });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[.16em] text-[#C71D1D]">Phase 4 · Operational Integration</p>
          <h1 className="mt-1 font-display text-3xl font-bold tracking-tight text-stone-900">Workforce ERP Connections</h1>
          <p className="mt-1 max-w-2xl text-xs text-stone-500">
            Connect HR workforce readiness to Manufacturing lines, Warehouse rosters, Distribution driver licensing, Sales territories, Finance cost centres, and external integration adapters.
          </p>
        </div>
        <button onClick={() => setShowShiftModal(true)} className="btn btn-primary text-xs" data-testid="button-open-schedule-shift">
          <Plus size={15} /> Schedule Shift
        </button>
      </div>

      {banner && (
        <div className="flex items-center justify-between rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs font-semibold text-emerald-900">
          <span>{banner}</span>
          <button onClick={() => setBanner(null)} aria-label="Dismiss notification"><X size={14} /></button>
        </div>
      )}

      {/* Module Tabs */}
      <div className="flex flex-wrap gap-2 border-b border-stone-200 pb-3">
        {[
          { id: 'overview', label: 'Shift Heatmap & Rosters', icon: Layers },
          { id: 'production', label: 'Production Replacements', icon: Factory },
          { id: 'drivers', label: 'Fleet Drivers & Licenses', icon: Truck },
          { id: 'sales', label: 'Sales Force & Targets', icon: MapPin },
          { id: 'workflows', label: 'Approval Rules & Adapters', icon: GitBranch },
        ].map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setTab(id as any)}
            className={`inline-flex items-center gap-2 rounded-lg px-3.5 py-2 text-xs font-bold transition-colors ${
              tab === id ? 'bg-[#C71D1D] text-white' : 'bg-white text-stone-600 ring-1 ring-stone-200 hover:bg-stone-50'
            }`}
            data-testid={`tab-wf-${id}`}
          >
            <Icon size={14} /> {label}
          </button>
        ))}
      </div>

      {tab === 'overview' && (
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {heatmap.map((h) => (
              <div key={h.unitType} className="surface p-5">
                <div className="flex items-center justify-between text-xs font-bold uppercase text-stone-500">
                  <span>{h.unitType}</span>
                  <span className={h.coveragePct < 100 ? 'text-amber-700' : 'text-emerald-700'}>{h.coveragePct}% coverage</span>
                </div>
                <p className="mt-2 font-display text-3xl font-bold text-stone-900">{h.present} / {h.scheduled}</p>
                <div className="mt-3 h-2 overflow-hidden rounded-full bg-stone-100">
                  <div className={`h-full rounded-full ${h.coveragePct < 100 ? 'bg-amber-500' : 'bg-[#338956]'}`} style={{ width: `${h.coveragePct}%` }} />
                </div>
                <p className="mt-2 text-[11px] text-stone-500">{h.awayOrPendingLeave} away / leave pending</p>
              </div>
            ))}
          </div>

          <div className="surface overflow-x-auto">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-stone-100 p-5">
              <h2 className="font-display text-lg font-bold text-stone-900">Operational Shift &amp; Competency Roster</h2>
              <div className="flex flex-wrap gap-1.5">
                {['all', 'production', 'warehouse', 'distribution', 'sales'].map((u) => (
                  <button
                    key={u}
                    type="button"
                    onClick={() => setUnitFilter(u)}
                    className={`rounded-full px-3 py-1 text-[11px] font-bold capitalize ${
                      unitFilter === u ? 'bg-[#C71D1D] text-white' : 'bg-stone-100 text-stone-600 hover:bg-stone-200'
                    }`}
                  >
                    {u}
                  </button>
                ))}
              </div>
            </div>
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-stone-200 text-[10px] font-bold uppercase tracking-wider text-stone-400">
                  <th className="p-4">Employee</th>
                  <th className="p-4">Unit</th>
                  <th className="p-4">Work Zone / Line</th>
                  <th className="p-4">Shift</th>
                  <th className="p-4">Certified Skill</th>
                  <th className="p-4">Cost Centre</th>
                  <th className="p-4">Today</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {filteredRoster.map((r, idx) => (
                  <tr key={`${r.employeeId}-${r.workZone}-${idx}`}>
                    <td className="p-4 font-bold text-stone-900">{r.employeeName}</td>
                    <td className="p-4 capitalize text-stone-600">{r.unitType}</td>
                    <td className="p-4 text-stone-700">{r.workZone}</td>
                    <td className="p-4 text-stone-600">{r.shiftName}</td>
                    <td className="p-4">{r.roleSkill}</td>
                    <td className="p-4 font-mono font-bold text-[#C71D1D]">{r.costCentreCode}</td>
                    <td className="p-4">
                      <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold ${r.availableToday ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-800'}`}>
                        {r.availableToday ? 'Present / Cleared' : 'Leave / Relief Needed'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'production' && (
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="surface p-6">
            <h2 className="font-display text-lg font-bold text-stone-900">Missing Shift Coverage</h2>
            {!missingCoverage.length ? (
              <p className="mt-4 text-xs text-emerald-700">All scheduled production/logistics operators are active.</p>
            ) : (
              <div className="mt-4 space-y-3">
                {missingCoverage.map((m) => (
                  <div key={m.employeeId} className="rounded-xl border border-amber-200 bg-amber-50/70 p-4 text-xs">
                    <p className="font-bold text-amber-950">{m.name}</p>
                    <p className="text-amber-800">{m.departmentName} · Currently on leave / away</p>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="surface p-6">
            <h2 className="font-display text-lg font-bold text-stone-900">Qualified Available Replacements</h2>
            <div className="mt-4 space-y-3">
              {qualifiedReplacements.map((q) => (
                <div key={q.employeeId} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-stone-200 p-4 text-xs">
                  <div>
                    <p className="font-bold text-stone-900">{q.name}</p>
                    <p className="text-stone-500">{q.jobTitle} · {q.departmentName}</p>
                    <p className="mt-1 text-[11px] font-semibold text-emerald-700">{q.readinessNote}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="rounded bg-emerald-50 px-2.5 py-1 text-[10px] font-bold text-emerald-700">Safety Cleared</span>
                    <button
                      type="button"
                      onClick={() => handleDeployRelief(q.employeeId, q.name)}
                      className="btn btn-secondary min-h-8 px-3 text-[11px]"
                      data-testid={`button-deploy-relief-${q.employeeId}`}
                    >
                      Deploy Relief
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {tab === 'drivers' && (
        <div className="grid gap-4 md:grid-cols-2">
          {drivers.map((d) => (
            <div key={d.employeeId} className="surface p-6 text-xs">
              <div className="flex items-center justify-between">
                <span className="font-mono font-bold text-stone-500">{d.licenseNumber}</span>
                <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase ${d.alertLevel === 'valid' ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-[#C71D1D]'}`}>
                  {d.alertLevel === 'valid' ? 'Valid License' : `Renew in ${d.daysRemaining}d`}
                </span>
              </div>
              <h3 className="mt-2 font-display text-lg font-bold text-stone-900">{d.driverName}</h3>
              <p className="text-stone-600">{d.licenseClass} · Vehicle: <strong>{d.assignedVehicle}</strong></p>
              <p className="mt-1 text-stone-500">Corridor: {d.routeCorridor}</p>
              <div className="mt-3 flex justify-between rounded-lg bg-stone-50 p-3 font-semibold">
                <span>NTSA Expiry: {d.licenseExpiry}</span>
                <span>PSV / Safety: {d.psvOrSafetyCertExpiry}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {tab === 'sales' && (
        <div className="grid gap-4 md:grid-cols-2">
          {salesReps.map((s) => (
            <div key={s.employeeId} className="surface p-6 text-xs">
              <div className="flex justify-between">
                <span className="font-mono font-bold text-[#C71D1D]">{s.costCentreCode}</span>
                <span className="font-bold text-emerald-700">{s.attainmentPct}% of Target</span>
              </div>
              <h3 className="mt-2 font-display text-lg font-bold text-stone-900">{s.repName}</h3>
              <p className="text-stone-600">Territory: {s.territory}</p>
              <div className="mt-4 space-y-1.5 rounded-xl bg-stone-50 p-3.5">
                <div className="flex justify-between"><span>Monthly Target</span><strong>KES {s.monthlyTargetKes.toLocaleString()}</strong></div>
                <div className="flex justify-between"><span>Attributed Sales</span><strong>KES {s.actualAttributedKes.toLocaleString()}</strong></div>
                <div className="flex justify-between text-[#C71D1D]"><span>Est. Commission ({s.commissionRatePct}%)</span><strong>KES {s.estimatedCommissionKes.toLocaleString()}</strong></div>
              </div>
            </div>
          ))}
        </div>
      )}

      {tab === 'workflows' && (
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="surface p-6 space-y-4">
            <h2 className="font-display text-lg font-bold text-stone-900">Configurable Multi-Level Approval Rules</h2>
            <form onSubmit={handleCreateRule} className="grid gap-3 rounded-xl border border-stone-200 bg-stone-50 p-4 text-xs sm:grid-cols-2">
              <select value={wfDomain} onChange={(e) => setWfDomain(e.target.value)} className="field">
                <option value="leave">Leave Workflow</option>
                <option value="payroll">Payroll Signoff</option>
                <option value="expense">Expense Approval</option>
                <option value="hr_case">HR Case Escalation</option>
                <option value="onboarding">Onboarding Clearance</option>
              </select>
              <input required value={wfName} onChange={(e) => setWfName(e.target.value)} className="field" placeholder="Rule Name *" />
              <input type="number" min={1} max={4} value={wfLevels} onChange={(e) => setWfLevels(e.target.value)} className="field" placeholder="Approval Levels" />
              <input type="number" min={1} value={wfSla} onChange={(e) => setWfSla(e.target.value)} className="field" placeholder="Escalation SLA (hrs)" />
              <button type="submit" className="btn btn-primary sm:col-span-2 text-xs"><Plus size={14} /> Add Approval Rule</button>
            </form>
            <div className="space-y-2.5">
              {rules.map((r) => (
                <div key={r.id} className="flex items-center justify-between rounded-xl border border-stone-200 p-3.5 text-xs">
                  <div>
                    <span className="rounded bg-stone-100 px-2 py-0.5 text-[10px] font-bold uppercase text-stone-600">{r.domain}</span>
                    <p className="mt-1 font-bold text-stone-900">{r.name}</p>
                    <p className="text-[11px] text-stone-500">{r.approvalLevels} levels · Escalation SLA: {r.slaHours}h</p>
                  </div>
                  <CheckCircle2 size={16} className="text-emerald-600" />
                </div>
              ))}
            </div>
          </div>

          <div className="surface p-6 space-y-3">
            <h2 className="font-display text-lg font-bold text-stone-900">Honest Integration Adapter Readiness</h2>
            <p className="text-xs text-stone-500">External systems never simulate connected status unless valid server credentials are provisioned.</p>
            {adapters.map((a) => (
              <div key={a.key} className="rounded-xl border border-stone-200 p-4 text-xs">
                <div className="flex items-center justify-between">
                  <strong className="text-stone-900">{a.name}</strong>
                  <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold ${a.configured ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-800'}`}>
                    {a.status}
                  </span>
                </div>
                <p className="mt-1 text-stone-500">{a.detail}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {showShiftModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-950/50 p-4 backdrop-blur-xs" onClick={() => setShowShiftModal(false)} data-testid="modal-schedule-shift">
          <form onSubmit={handleAssignShift} onClick={(e) => e.stopPropagation()} className="w-full max-w-md space-y-3 rounded-2xl bg-white p-6 text-xs shadow-2xl">
            <div className="flex items-center justify-between border-b border-stone-100 pb-3">
              <h3 className="font-display text-lg font-bold text-stone-900">Schedule Operational Shift</h3>
              <button type="button" onClick={() => setShowShiftModal(false)}><X size={18} /></button>
            </div>
            <div>
              <label className="label">Employee</label>
              <select value={shiftEmpId || employeeList[0]?.id || ''} onChange={(e) => setShiftEmpId(e.target.value)} className="field">
                {employeeList.map((emp) => (
                  <option key={emp.id} value={emp.id}>{emp.firstName} {emp.lastName} · {emp.departmentName}</option>
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
                </select>
              </div>
              <div>
                <label className="label">Cost Centre</label>
                <input required value={shiftCostCentre} onChange={(e) => setShiftCostCentre(e.target.value)} className="field font-mono" />
              </div>
            </div>
            <div>
              <label className="label">Work Zone / Line</label>
              <input required value={shiftZone} onChange={(e) => setShiftZone(e.target.value)} className="field" placeholder="e.g. Automated Filling Line B" />
            </div>
            <div>
              <label className="label">Shift Window</label>
              <input required value={shiftName} onChange={(e) => setShiftName(e.target.value)} className="field" />
            </div>
            <div>
              <label className="label">Certified Role Skill</label>
              <input required value={shiftSkill} onChange={(e) => setShiftSkill(e.target.value)} className="field" />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setShowShiftModal(false)} className="btn btn-secondary">Cancel</button>
              <button type="submit" className="btn btn-primary" data-testid="button-submit-shift">Save Shift Assignment</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

