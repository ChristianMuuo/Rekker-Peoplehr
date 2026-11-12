import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { BarChart3, CheckCircle2, ShieldAlert, ShieldCheck } from 'lucide-react';
import { apiGet } from '@/lib/api';

export function PeopleAnalyticsAndComplianceSection() {
  const [subTab, setSubTab] = useState<'workforce' | 'lifecycle' | 'quality' | 'compliance'>('workforce');

  const workforceQ = useQuery({
    queryKey: ['analytics-workforce'],
    queryFn: () => apiGet<any>('/api/peopleos/analytics/workforce'),
  });
  const lifecycleQ = useQuery({
    queryKey: ['analytics-lifecycle'],
    queryFn: () => apiGet<any>('/api/peopleos/analytics/lifecycle'),
    enabled: subTab === 'lifecycle',
  });
  const qualityQ = useQuery({
    queryKey: ['analytics-data-quality'],
    queryFn: () => apiGet<any>('/api/peopleos/analytics/data-quality'),
    enabled: subTab === 'quality',
  });
  const complianceQ = useQuery({
    queryKey: ['compliance-kenya-readiness'],
    queryFn: () => apiGet<any>('/api/peopleos/compliance/kenya-readiness'),
    enabled: subTab === 'compliance',
  });

  const wf = workforceQ.data;
  const lc = lifecycleQ.data;
  const dq = qualityQ.data;
  const cr = complianceQ.data;

  return (
    <section className="surface p-5 md:p-6" data-testid="section-people-analytics-compliance">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-stone-100 pb-4">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[.16em] text-[#C71D1D]">
            People Operations Intelligence &amp; Statutory Readiness
          </p>
          <h2 className="mt-1 font-display text-lg font-semibold text-stone-900">
            Workforce Analytics, Data Quality &amp; Kenyan Employment Compliance
          </h2>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {(
            [
              ['workforce', 'Workforce'],
              ['lifecycle', 'Lifecycle'],
              ['quality', 'Data Quality'],
              ['compliance', 'Kenya §10 & ODPC'],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setSubTab(id)}
              className={`rounded-xl px-3 py-1.5 text-xs font-semibold ${
                subTab === id
                  ? 'bg-[#C71D1D] text-white'
                  : 'bg-stone-100 text-stone-700 hover:bg-stone-200'
              }`}
              data-testid={`tab-analytics-${id}`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {subTab === 'workforce' && wf && (
        <div className="mt-4 space-y-4">
          {wf.privacySuppressionApplied && (
            <div className="flex items-start gap-2 rounded-xl border border-[#ead4b1] bg-[#fbf3e4] p-3 text-xs text-[#6f5a30]">
              <ShieldAlert size={15} className="mt-0.5 shrink-0" />
              <span>
                <strong>ODPC Privacy Suppression Applied:</strong> Subgroup counts of {wf.smallGroupThreshold ?? 3} or fewer are masked as <code>&le;{wf.smallGroupThreshold ?? 3}</code> for non-HR roles to prevent re-identification.
              </span>
            </div>
          )}

          <div className="grid gap-3 sm:grid-cols-4">
            <div className="rounded-xl bg-[#faf8f5] p-3.5">
              <p className="text-[10px] font-bold uppercase text-stone-400">Active Headcount</p>
              <p className="mt-1 font-display text-2xl font-semibold text-stone-900">
                {wf.summary?.activeHeadcount ?? wf.totals?.activeHeadcount ?? 0}
              </p>
            </div>
            <div className="rounded-xl bg-[#faf8f5] p-3.5">
              <p className="text-[10px] font-bold uppercase text-stone-400">Open Vacancies</p>
              <p className="mt-1 font-display text-2xl font-semibold text-[#C71D1D]">
                {wf.summary?.openVacanciesCount ?? 0}
              </p>
            </div>
            <div className="rounded-xl bg-[#faf8f5] p-3.5">
              <p className="text-[10px] font-bold uppercase text-stone-400">Budgeted Cap</p>
              <p className="mt-1 font-display text-2xl font-semibold text-stone-900">
                {wf.summary?.departmentBudgetedCapacity ?? 0}
              </p>
            </div>
            <div className="rounded-xl bg-[#faf8f5] p-3.5">
              <p className="text-[10px] font-bold uppercase text-stone-400">Contract Expiries (60d)</p>
              <p className="mt-1 font-display text-2xl font-semibold text-stone-900">
                {wf.summary?.upcomingContractExpiries60d ?? 0}
              </p>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2 text-xs">
            <div className="rounded-xl border border-stone-200 p-3.5">
              <p className="mb-2 flex items-center gap-1.5 font-bold uppercase tracking-wider text-stone-500">
                <BarChart3 size={14} className="text-[#C71D1D]" /> By Department
              </p>
              <div className="space-y-1.5">
                {(wf.breakdowns?.byDepartment ?? wf.byDepartment ?? []).map((row: any, i: number) => (
                  <div key={i} className="flex justify-between border-b border-stone-100 pb-1 last:border-0">
                    <span>{row.department ?? row.departmentName}</span>
                    <span className="font-mono font-bold">
                      {row.suppressed ? `≤${row.threshold ?? 3}` : (row.count ?? row.headcount)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
            <div className="rounded-xl border border-stone-200 p-3.5">
              <p className="mb-2 font-bold uppercase tracking-wider text-stone-500">
                Metric Definitions &amp; Freshness
              </p>
              <p className="text-[11px] text-stone-500">
                Computed at:{' '}
                <span className="font-mono">
                  {wf.dataFreshnessAt ? new Date(wf.dataFreshnessAt).toLocaleString() : 'Live'}
                </span>
              </p>
              <ul className="mt-2 space-y-1 text-[11px] text-stone-600">
                {Object.entries(wf.metricDefinitions ?? wf.definitions ?? {}).map(([k, v]) => (
                  <li key={k}>
                    <strong>{k}:</strong> {String(v)}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}

      {subTab === 'lifecycle' && lc && (
        <div className="mt-4 space-y-3 text-xs">
          {lc.historicalGapNotice && (
            <div className="rounded-xl border border-[#ead4b1] bg-[#fbf3e4] p-3 text-[#6f5a30]">
              {lc.historicalGapNotice}
            </div>
          )}
          <div className="grid gap-3 sm:grid-cols-4">
            <div className="rounded-xl bg-[#faf8f5] p-3.5">
              <p className="text-[10px] font-bold uppercase text-stone-400">Open Requisitions</p>
              <p className="mt-1 font-display text-2xl font-semibold">
                {lc.openRequisitionsCount ?? lc.recruitment?.openRequisitions ?? 0}
              </p>
            </div>
            <div className="rounded-xl bg-[#faf8f5] p-3.5">
              <p className="text-[10px] font-bold uppercase text-stone-400">Onboarding Completion</p>
              <p className="mt-1 font-display text-2xl font-semibold text-[#34734d]">
                {lc.onboardingCompletionRatePct ?? 0}%
              </p>
            </div>
            <div className="rounded-xl bg-[#faf8f5] p-3.5">
              <p className="text-[10px] font-bold uppercase text-stone-400">Probation Due</p>
              <p className="mt-1 font-display text-2xl font-semibold text-[#C71D1D]">
                {lc.pendingProbationReviewsCount ?? 0}
              </p>
            </div>
            <div className="rounded-xl bg-[#faf8f5] p-3.5">
              <p className="text-[10px] font-bold uppercase text-stone-400">Assignment Transitions</p>
              <p className="mt-1 font-display text-2xl font-semibold">
                {lc.recordedAssignmentTransitionsCount ?? 0}
              </p>
            </div>
          </div>
        </div>
      )}

      {subTab === 'quality' && dq && (
        <div className="mt-4 space-y-3 text-xs">
          <div className="grid gap-3 sm:grid-cols-4">
            <div className="rounded-xl bg-[#faf8f5] p-3.5">
              <p className="text-[10px] font-bold uppercase text-stone-400">Avg §10 Completeness</p>
              <p className="mt-1 font-display text-2xl font-semibold text-[#34734d]">
                {dq.averageSection10CompletenessPct ?? 0}%
              </p>
            </div>
            <div className="rounded-xl bg-[#faf8f5] p-3.5">
              <p className="text-[10px] font-bold uppercase text-stone-400">Fully Compliant Records</p>
              <p className="mt-1 font-display text-2xl font-semibold">
                {dq.fullyCompliantRecordsCount ?? 0} / {dq.totalEvaluatedEmployees ?? 0}
              </p>
            </div>
            <div className="rounded-xl bg-[#faf8f5] p-3.5">
              <p className="text-[10px] font-bold uppercase text-stone-400">Hierarchy Alerts</p>
              <p className="mt-1 font-display text-2xl font-semibold text-[#C71D1D]">
                {dq.hierarchyIntegrityAlertsCount ?? 0}
              </p>
            </div>
            <div className="rounded-xl bg-[#faf8f5] p-3.5">
              <p className="text-[10px] font-bold uppercase text-stone-400">Unlinked User Accounts</p>
              <p className="mt-1 font-display text-2xl font-semibold">
                {dq.unlinkedMembershipAccountsCount ?? 0}
              </p>
            </div>
          </div>
        </div>
      )}

      {subTab === 'compliance' && cr && (
        <div className="mt-4 space-y-3 text-xs" data-testid="panel-kenya-compliance">
          <div className="flex items-start gap-2 rounded-xl border border-[#ead4b1] bg-[#fbf3e4] p-3 text-[#6f5a30]">
            <ShieldCheck size={16} className="mt-0.5 shrink-0" />
            <div>
              <p className="font-bold">
                Informational Legal Reference · Verified Date:{' '}
                {cr.dateResearched ?? cr.legalMetadata?.[0]?.dateResearched ?? '2026-11-12'} · HR/Legal Counsel Review Required
              </p>
              <p className="mt-0.5">
                {cr.disclaimer ||
                  'Checklist & SLA metrics support internal readiness and do not constitute formal legal advice; consult qualified Kenyan legal counsel.'}
              </p>
            </div>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            {(cr.legalMetadata ?? cr.references ?? cr.statutoryReferences ?? []).map((ref: any, idx: number) => (
              <div key={idx} className="rounded-xl border border-stone-200 p-3">
                <div className="flex items-center justify-between gap-2 font-semibold text-stone-900">
                  <span>{ref.title ?? ref.statute ?? ref.citation}</span>
                  <span className="flex shrink-0 items-center gap-1 rounded-full bg-[#e8f2eb] px-2 py-0.5 text-[10px] text-[#34734d]">
                    <CheckCircle2 size={11} /> {ref.requiresHrLegalReview ? 'HR/Legal Review' : (ref.status ?? 'Tracked')}
                  </span>
                </div>
                <p className="mt-0.5 text-[11px] font-medium text-stone-500">{ref.statute}</p>
                <p className="mt-1 text-stone-600">{ref.summary ?? ref.topic}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
