import { useState, type FormEvent } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getGetEmployeeQueryKey, getListEmployeesQueryKey } from '@workspace/api-client-react';
import { CalendarClock, CheckCircle2, ClipboardCheck, History, Plus, ShieldCheck, X } from 'lucide-react';
import { Link } from 'wouter';
import { apiGet, apiPost } from '@/lib/api';

interface Props {
  employeeId: string;
  person: any;
  p360: any;
  departments: Array<{ id: string; name: string }>;
  canManagePeople: boolean;
  formatDate: (v: string) => string;
}

export function Employee360View({
  employeeId,
  person,
  p360,
  departments,
  canManagePeople,
  formatDate,
}: Props) {
  const qc = useQueryClient();
  const [tab, setTab] = useState<'overview' | 'timeline' | 'credentials'>('overview');
  const [changeOpen, setChangeOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const timelineQuery = useQuery({
    queryKey: ['employee-timeline', employeeId],
    queryFn: () =>
      apiGet<{ history: any[]; events: any[] }>(
        `/api/peopleos/employees/${employeeId}/timeline`,
      ),
    enabled: Boolean(employeeId),
  });

  const submitAssignmentChange = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSaving(true);
    setSaveError(null);
    const fd = new FormData(e.currentTarget);
    try {
      await apiPost(`/api/peopleos/employees/${employeeId}/assignment-changes`, {
        effectiveDate: String(fd.get('effectiveDate')),
        changeType: String(fd.get('changeType')),
        departmentId: String(fd.get('departmentId') || person.departmentId),
        jobTitle: String(fd.get('jobTitle') || person.jobTitle),
        location: String(fd.get('location') || person.location),
        employmentType: String(fd.get('employmentType') || person.employmentType),
        status: String(fd.get('status') || person.status),
        reason: String(fd.get('reason') || ''),
      });
      setChangeOpen(false);
      qc.invalidateQueries({ queryKey: ['employee-timeline', employeeId] });
      qc.invalidateQueries({ queryKey: getGetEmployeeQueryKey(employeeId) });
      qc.invalidateQueries({ queryKey: getListEmployeesQueryKey() });
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Unable to save assignment change.');
    } finally {
      setSaving(false);
    }
  };

  const completenessScore = person.completenessScore ?? p360?.completenessScore ?? 80;

  return (
    <div className="mt-4 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-2">
          {(
            [
              ['overview', 'Overview & Statutory'],
              ['timeline', 'Assignment History & Timeline'],
              ['credentials', 'Qualifications & Contact Prefs'],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              className={`rounded-xl px-3.5 py-2 text-xs font-semibold transition-colors ${
                tab === id
                  ? 'bg-[#C71D1D] text-white'
                  : 'bg-white text-stone-700 ring-1 ring-stone-200 hover:bg-stone-50'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        {canManagePeople && (
          <button
            type="button"
            onClick={() => {
              setSaveError(null);
              setChangeOpen(true);
            }}
            className="btn btn-secondary min-h-9 px-3 text-xs"
            data-testid="button-record-assignment-change"
          >
            <Plus size={14} /> Effective-Dated Assignment Change
          </button>
        )}
      </div>

      {tab === 'overview' && (
        <div className="grid gap-4 lg:grid-cols-3" data-testid="section-employee-360">
          <div className="surface p-5">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-base font-semibold text-stone-900">
                Kenyan §10 &amp; Statutory Identifiers
              </h2>
              <span className="rounded-full bg-[#e8f2eb] px-2 py-0.5 text-[10px] font-bold text-[#34734d]">
                ODPC Masked
              </span>
            </div>
            <div className="mt-3 rounded-lg bg-[#faf8f5] p-3">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-stone-700">Section 10 Completeness</span>
                <span className="font-mono font-bold text-[#C71D1D]">{completenessScore}%</span>
              </div>
              <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-stone-200">
                <div
                  className="h-full rounded-full bg-[#C71D1D]"
                  style={{ width: `${Math.min(100, completenessScore)}%` }}
                />
              </div>
            </div>
            <div className="mt-4 space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-stone-500">KRA PIN</span>
                <span className="font-mono font-semibold text-stone-800">
                  {p360?.statutoryIdentifiers?.kraPin ?? 'RESTRICTED'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-stone-500">National ID</span>
                <span className="font-mono font-semibold text-stone-800">
                  {p360?.statutoryIdentifiers?.nationalId ?? 'RESTRICTED'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-stone-500">NSSF No.</span>
                <span className="font-mono font-semibold text-stone-800">
                  {p360?.statutoryIdentifiers?.nssfNo ?? 'RESTRICTED'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-stone-500">SHIF / SHA</span>
                <span className="font-mono font-semibold text-stone-800">
                  {p360?.statutoryIdentifiers?.shaNo ?? 'RESTRICTED'}
                </span>
              </div>
            </div>
          </div>

          <div className="surface p-5">
            <h2 className="font-display text-base font-semibold text-stone-900">
              Reporting Line &amp; Master Metadata
            </h2>
            <p className="mt-3 text-xs text-stone-500">
              Reports to:{' '}
              <strong className="text-stone-800">
                {p360?.reportingLine?.managerName || person.managerName || 'Executive Board'}
              </strong>
            </p>
            <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
              <div className="rounded-lg bg-stone-50 p-2.5">
                <span className="block text-[10px] uppercase text-stone-400">Category</span>
                <span className="font-semibold capitalize text-stone-800">
                  {person.employeeCategory || 'office'}
                </span>
              </div>
              <div className="rounded-lg bg-stone-50 p-2.5">
                <span className="block text-[10px] uppercase text-stone-400">Timezone</span>
                <span className="font-mono text-[11px] font-semibold text-stone-800">
                  {person.timezone || 'Africa/Nairobi'}
                </span>
              </div>
            </div>
            {Array.isArray(p360?.reportingLine?.directReports) &&
              p360.reportingLine.directReports.length > 0 && (
                <div className="mt-3">
                  <p className="text-[10px] font-bold uppercase tracking-[.12em] text-stone-400">
                    Direct reports
                  </p>
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {p360.reportingLine.directReports.map((r: any) => (
                      <Link
                        key={r.id}
                        href={`/people/${r.id}`}
                        className="rounded-lg bg-stone-100 px-2.5 py-1 text-[11px] font-semibold text-stone-700 hover:bg-stone-200"
                      >
                        {r.name}
                      </Link>
                    ))}
                  </div>
                </div>
              )}
          </div>

          <div className="surface p-5">
            <h2 className="font-display text-base font-semibold text-stone-900">
              Compensation &amp; Compliance Links
            </h2>
            <div className="mt-3 rounded-lg bg-[#f7f4f0] p-3 text-xs">
              {p360?.compensationSummary?.authorizedToView ? (
                <>
                  <p className="font-semibold text-stone-800">
                    {p360.compensationSummary.currency} · {p360.compensationSummary.payFrequency}
                  </p>
                  <p className="mt-0.5 text-stone-500">
                    Channel: {p360.compensationSummary.paymentChannel}
                  </p>
                </>
              ) : (
                <p className="text-stone-500">
                  Compensation visible to payroll officers or employee.
                </p>
              )}
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <Link href="/documents" className="btn btn-secondary min-h-8 px-3 text-xs">
                <ClipboardCheck size={13} /> §10 Records
              </Link>
              <Link href="/reports" className="btn btn-secondary min-h-8 px-3 text-xs">
                <ShieldCheck size={13} /> Compliance Readiness
              </Link>
            </div>
          </div>
        </div>
      )}

      {tab === 'timeline' && (
        <div className="grid gap-4 lg:grid-cols-2">
          <section className="surface p-5">
            <div className="flex items-center gap-2 border-b border-stone-100 pb-3">
              <History size={16} className="text-[#C71D1D]" />
              <h2 className="font-display text-base font-semibold text-stone-900">
                Effective-Dated Assignment History
              </h2>
            </div>
            <div className="mt-3 space-y-2.5">
              {timelineQuery.isLoading ? (
                <p className="text-xs text-stone-500">Loading assignment history…</p>
              ) : !(timelineQuery.data?.history?.length) ? (
                <p className="text-xs text-stone-500">
                  No effective-dated assignment transitions recorded since baseline master creation.
                </p>
              ) : (
                timelineQuery.data.history.map((h: any) => (
                  <div
                    key={h.id}
                    className="rounded-xl border border-stone-200 bg-[#faf8f5] p-3 text-xs"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold capitalize text-stone-900">
                        {String(h.changeType).replaceAll('_', ' ')} — {h.jobTitle}
                      </span>
                      <span className="font-mono text-[11px] font-bold text-[#C71D1D]">
                        {formatDate(h.effectiveDate)}
                      </span>
                    </div>
                    <p className="mt-1 text-stone-600">
                      {h.location} · {h.employmentType} · {h.status}
                    </p>
                    {h.reason && <p className="mt-1 text-[11px] text-stone-500">Reason: {h.reason}</p>}
                  </div>
                ))
              )}
            </div>
          </section>

          <section className="surface p-5">
            <div className="flex items-center gap-2 border-b border-stone-100 pb-3">
              <CalendarClock size={16} className="text-[#C71D1D]" />
              <h2 className="font-display text-base font-semibold text-stone-900">
                Lifecycle Event Timeline
              </h2>
            </div>
            <div className="mt-3 space-y-2.5">
              {(timelineQuery.data?.events ?? []).map((ev: any) => (
                <div key={ev.id} className="flex gap-3 border-l-2 border-[#C71D1D]/40 pl-3 text-xs">
                  <div className="flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold text-stone-900">{ev.title}</span>
                      <span className="font-mono text-[10px] text-stone-400">
                        {formatDate(ev.date)}
                      </span>
                    </div>
                    <p className="mt-0.5 text-[11px] text-stone-500">{ev.details}</p>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>
      )}

      {tab === 'credentials' && (
        <section className="surface grid gap-4 p-5 md:grid-cols-2">
          <div>
            <h2 className="font-display text-base font-semibold text-stone-900">
              Personal Contact &amp; Work Profile
            </h2>
            <div className="mt-3 space-y-2 text-xs">
              <div className="flex justify-between border-b border-stone-100 pb-2">
                <span className="text-stone-500">Personal Email</span>
                <span className="font-medium text-stone-800">
                  {person.personalEmail || 'Not provided'}
                </span>
              </div>
              <div className="flex justify-between border-b border-stone-100 pb-2">
                <span className="text-stone-500">Contract Start Date</span>
                <span className="font-medium text-stone-800">
                  {person.contractStartDate ? formatDate(person.contractStartDate) : formatDate(person.startDate)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-stone-500">Position Reference</span>
                <span className="font-mono text-stone-800">
                  {person.positionId || 'Unassigned position'}
                </span>
              </div>
            </div>
          </div>
          <div>
            <h2 className="font-display text-base font-semibold text-stone-900">
              Qualifications, Certifications &amp; Experience
            </h2>
            <p className="mt-2 flex items-center gap-1.5 text-xs text-stone-500">
              <CheckCircle2 size={14} className="text-[#34734d]" />
              Stored securely in structured employee master JSON attributes.
            </p>
            <pre className="mt-2 max-h-40 overflow-auto rounded-xl bg-stone-50 p-3 font-mono text-[11px] text-stone-700">
              {JSON.stringify(
                {
                  qualifications: person.qualificationsJson ?? null,
                  certifications: person.certificationsJson ?? null,
                  workExperience: person.workExperienceJson ?? null,
                },
                null,
                2,
              )}
            </pre>
          </div>
        </section>
      )}

      {changeOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-stone-950/40 p-0 backdrop-blur-[2px] sm:items-center sm:p-4"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setChangeOpen(false);
          }}
        >
          <div className="max-h-[92dvh] w-full max-w-[560px] overflow-y-auto rounded-t-2xl bg-white p-5 shadow-2xl sm:rounded-2xl md:p-6">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="font-display text-lg font-semibold text-stone-900">
                Record Effective-Dated Assignment Change
              </h3>
              <button
                type="button"
                onClick={() => setChangeOpen(false)}
                className="btn btn-ghost min-h-8 px-2"
              >
                <X size={16} />
              </button>
            </div>
            <form onSubmit={submitAssignmentChange} className="space-y-3 text-xs">
              <div className="grid gap-3 sm:grid-cols-2">
                <label>
                  <span className="label">Effective Date</span>
                  <input
                    name="effectiveDate"
                    type="date"
                    defaultValue={new Date().toISOString().slice(0, 10)}
                    required
                    className="field"
                  />
                </label>
                <label>
                  <span className="label">Change Type</span>
                  <select name="changeType" className="field" defaultValue="transfer">
                    <option value="promotion">Promotion</option>
                    <option value="transfer">Department Transfer</option>
                    <option value="location_change">Location Change</option>
                    <option value="manager_change">Reporting Line Change</option>
                    <option value="contract_renewal">Contract Renewal</option>
                    <option value="status_change">Status Change</option>
                  </select>
                </label>
                <label>
                  <span className="label">Department</span>
                  <select name="departmentId" className="field" defaultValue={person.departmentId}>
                    {departments.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  <span className="label">Job Title</span>
                  <input name="jobTitle" defaultValue={person.jobTitle} required className="field" />
                </label>
                <label>
                  <span className="label">Location</span>
                  <input name="location" defaultValue={person.location} required className="field" />
                </label>
                <label>
                  <span className="label">Employment Type</span>
                  <select name="employmentType" className="field" defaultValue={person.employmentType}>
                    <option value="permanent">Permanent</option>
                    <option value="fixed_term">Fixed Term</option>
                    <option value="casual">Casual</option>
                    <option value="intern">Intern</option>
                  </select>
                </label>
              </div>
              <label className="block">
                <span className="label">Status</span>
                <select name="status" className="field" defaultValue={person.status}>
                  <option value="active">Active</option>
                  <option value="probation">Probation</option>
                  <option value="on_leave">On Leave</option>
                  <option value="suspended">Suspended</option>
                </select>
              </label>
              <label className="block">
                <span className="label">Business Reason / Reference</span>
                <textarea
                  name="reason"
                  rows={2}
                  required
                  placeholder="Document approved promotion, transfer, or restructuring decision"
                  className="field"
                />
              </label>
              {saveError && <p className="text-xs text-[#a91919]">{saveError}</p>}
              <div className="flex justify-end gap-2 border-t border-stone-100 pt-3">
                <button
                  type="button"
                  onClick={() => setChangeOpen(false)}
                  className="btn btn-secondary"
                >
                  Cancel
                </button>
                <button type="submit" disabled={saving} className="btn btn-primary">
                  {saving ? 'Recording…' : 'Save Effective Change'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

