import { useState, type FormEvent } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useGetAuthContext } from '@workspace/api-client-react';
import {
  AlertCircle,
  CheckCircle2,
  ClipboardEdit,
  FileText,
  Laptop,
  Receipt,
  ShieldCheck,
  UserCheck,
  Users,
} from 'lucide-react';
import { apiGet, apiPost } from '@/lib/api';

export function SelfServicePage() {
  const qc = useQueryClient();
  const auth = useGetAuthContext();
  const [tab, setTab] = useState<'overview' | 'corrections' | 'privacy' | 'team'>('overview');
  const [feedback, setFeedback] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const meQuery = useQuery({
    queryKey: ['peopleos-me', auth.data?.role ?? 'anon', auth.data?.canManagePeople ?? false],
    queryFn: () => apiGet<any>('/api/peopleos/me'),
  });

  const me = meQuery.data;
  const linkedEmpId: string | undefined = me?.linked ? me.employee?.id : undefined;
  const scopeKey = [
    auth.data?.role ?? 'anon',
    me?.userId ?? 'anon',
    me?.organizationId ?? 'org',
    linkedEmpId ?? 'unlinked',
  ];

  const p9aQuery = useQuery({
    queryKey: ['self-service-p9a', ...scopeKey],
    queryFn: () => apiGet<any>(`/api/payroll/p9a/${linkedEmpId}`),
    enabled: Boolean(linkedEmpId),
  });

  const expensesQuery = useQuery({
    queryKey: ['self-service-expenses', ...scopeKey],
    queryFn: () => apiGet<{ items: any[] }>('/api/expenses'),
    enabled: Boolean(linkedEmpId),
  });

  const managerQuery = useQuery({
    queryKey: ['peopleos-manager-workspace', ...scopeKey],
    queryFn: () => apiGet<any>('/api/peopleos/manager/workspace'),
    enabled: Boolean(me?.isManager || auth.data?.canApproveLeave || auth.data?.canManagePeople),
  });

  const refreshMe = () => {
    qc.invalidateQueries({ queryKey: ['peopleos-me'] });
    qc.invalidateQueries({ queryKey: ['peopleos-manager-workspace'] });
  };

  const submitCorrection = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setFeedback(null);
    setErrorMsg(null);
    const fd = new FormData(e.currentTarget);
    try {
      await apiPost('/api/peopleos/profile-correction-requests', {
        fieldName: String(fd.get('fieldName')),
        proposedValue: String(fd.get('proposedValue')),
        reason: String(fd.get('reason')),
      });
      setFeedback('Profile correction request submitted for human HR approval.');
      e.currentTarget.reset();
      refreshMe();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Unable to submit correction.');
    }
  };

  const decideCorrection = async (requestId: string, decision: 'approved' | 'rejected') => {
    setFeedback(null);
    setErrorMsg(null);
    try {
      await apiPost(`/api/peopleos/profile-correction-requests/${requestId}/decision`, {
        decision,
        comment: `Reviewed via Self-Service Manager/HR Workspace`,
      });
      setFeedback(`Correction request ${decision}.`);
      refreshMe();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Unable to decide request.');
    }
  };

  const submitPrivacy = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setFeedback(null);
    setErrorMsg(null);
    const fd = new FormData(e.currentTarget);
    try {
      await apiPost('/api/peopleos/privacy-requests', {
        requestType: String(fd.get('requestType')),
        details: String(fd.get('details')),
      });
      setFeedback('ODPC data rights request logged with statutory SLA due date. Retention review required.');
      e.currentTarget.reset();
      refreshMe();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Unable to submit privacy request.');
    }
  };

  const decidePrivacy = async (
    requestId: string,
    status: 'under_review' | 'fulfilled' | 'retention_exception_retained' | 'rejected',
  ) => {
    setFeedback(null);
    setErrorMsg(null);
    try {
      await apiPost(`/api/peopleos/privacy-requests/${requestId}/decision`, {
        status,
        decisionNotes: `Handled under Kenya Data Protection Act 2019 & Employment Act retention check.`,
      });
      setFeedback(`Privacy request updated to '${status}'.`);
      refreshMe();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Unable to update privacy request.');
    }
  };

  if (meQuery.isLoading) {
    return <div className="surface p-8 text-xs text-stone-500">Loading authenticated employee workspace…</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-[#C71D1D]">
            Employee Self-Service &amp; ODPC Rights
          </p>
          <h1 className="mt-1 font-display text-2xl font-bold text-stone-900 md:text-3xl">
            Personal &amp; Manager Workspace
          </h1>
          <p className="mt-1 text-sm text-stone-500">
            Strictly bound to your server-verified membership identity ({auth.data?.role?.replaceAll('_', ' ') ?? 'user'}).
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          {(
            [
              ['overview', 'My Workspace'],
              ['corrections', 'Profile Corrections'],
              ['privacy', 'ODPC Privacy Rights'],
              ...(me?.isManager || auth.data?.canApproveLeave || auth.data?.canManagePeople
                ? [['team', 'Manager Direct Reports'] as const]
                : []),
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              className={`rounded-xl px-3.5 py-2 text-xs font-semibold ${
                tab === id
                  ? 'bg-[#C71D1D] text-white'
                  : 'bg-white text-stone-700 ring-1 ring-stone-200 hover:bg-stone-50'
              }`}
              data-testid={`tab-self-service-${id}`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {!me?.linked && (
        <div
          className="flex items-start gap-3 rounded-2xl border border-[#ead4b1] bg-[#fbf3e4] p-4 text-xs text-[#6f5a30]"
          data-testid="banner-unlinked-employee"
        >
          <AlertCircle size={18} className="mt-0.5 shrink-0" />
          <div>
            <p className="font-bold">Account Not Linked to an Employee Record</p>
            <p className="mt-1 leading-5">
              {me?.notice ||
                'Your signed-in account does not have an assigned employeeId in this organization. Self-service payslips, leave requests, and profile changes are withheld until HR links your account.'}
            </p>
          </div>
        </div>
      )}

      {feedback && (
        <div className="flex items-center gap-2 rounded-xl border border-[#b9dfc6] bg-[#e8f2eb] p-3 text-xs text-[#235436]">
          <CheckCircle2 size={15} />
          <span>{feedback}</span>
        </div>
      )}
      {errorMsg && (
        <div className="flex items-center gap-2 rounded-xl border border-[#f2c8c8] bg-[#fdf2f2] p-3 text-xs text-[#9b1c1c]">
          <AlertCircle size={15} />
          <span>{errorMsg}</span>
        </div>
      )}

      {tab === 'overview' && me?.linked && (
        <div className="space-y-4">
          <div className="grid gap-4 md:grid-cols-3">
            <section className="surface p-5">
              <div className="flex items-center gap-2 text-[#C71D1D]">
                <UserCheck size={17} />
                <h2 className="font-display text-base font-semibold text-stone-900">
                  Identity &amp; Section 10 Status
                </h2>
              </div>
              <div className="mt-3 space-y-1.5 text-xs">
                <p className="text-sm font-bold text-stone-900">
                  {me.employee.preferredName || me.employee.firstName} {me.employee.lastName}
                </p>
                <p className="text-stone-600">
                  {me.employee.jobTitle} · {me.employee.departmentName}
                </p>
                <p className="font-mono text-[11px] text-stone-500">
                  {me.employee.employeeNumber} · {me.employee.location}
                </p>
                <p className="text-stone-500">
                  Manager: <strong>{me.manager?.fullName ?? 'Executive Board'}</strong>
                </p>
                <p className="text-stone-500">
                  National ID (ODPC Masked):{' '}
                  <span className="font-mono">{me.employee.maskedNationalId ?? 'On File'}</span>
                </p>
                <div className="mt-2 rounded-lg bg-[#faf8f5] p-2.5">
                  <div className="flex justify-between font-semibold">
                    <span>Section 10 Completeness</span>
                    <span className="text-[#C71D1D]">{me.completeness?.scorePercent ?? 85}%</span>
                  </div>
                </div>
              </div>
            </section>

            <section className="surface p-5">
              <div className="flex items-center gap-2 text-[#C71D1D]">
                <FileText size={17} />
                <h2 className="font-display text-base font-semibold text-stone-900">
                  Statutory P9A Summary
                </h2>
              </div>
              <div className="mt-3 space-y-2 text-xs">
                <div className="flex justify-between">
                  <span className="text-stone-500">Year</span>
                  <span className="font-semibold">{p9aQuery.data?.year ?? '2026'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-stone-500">Gross YTD</span>
                  <span className="font-mono font-semibold">
                    KES {Number(p9aQuery.data?.totals?.grossPay ?? 0).toLocaleString()}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-stone-500">PAYE Deducted</span>
                  <span className="font-mono font-semibold text-[#C71D1D]">
                    KES {Number(p9aQuery.data?.totals?.paye ?? 0).toLocaleString()}
                  </span>
                </div>
              </div>
            </section>

            <section className="surface p-5">
              <div className="flex items-center gap-2 text-[#C71D1D]">
                <Laptop size={17} />
                <h2 className="font-display text-base font-semibold text-stone-900">
                  Assigned Assets &amp; Tasks
                </h2>
              </div>
              <p className="mt-3 text-xs text-stone-600">
                <strong>{(me.assets ?? []).length}</strong> assigned company asset(s) ·{' '}
                <strong>{(me.onboardingTasks ?? []).length}</strong> active checklist task(s)
              </p>
              <div className="mt-2 space-y-1.5 text-xs">
                {(me.assets ?? []).slice(0, 3).map((a: any) => (
                  <div key={a.id} className="flex justify-between rounded bg-stone-50 px-2.5 py-1.5">
                    <span className="font-medium text-stone-700">{a.assetTag || a.name}</span>
                    <span className="font-mono text-[10px] text-stone-500">{a.status}</span>
                  </div>
                ))}
              </div>
            </section>
          </div>

          <section className="surface p-5">
            <div className="flex items-center gap-2 text-[#C71D1D]">
              <Receipt size={17} />
              <h2 className="font-display text-base font-semibold text-stone-900">
                My Submitted Expenses &amp; Recent Leave
              </h2>
            </div>
            <div className="mt-3 grid gap-4 md:grid-cols-2 text-xs">
              <div>
                <p className="mb-2 font-bold uppercase tracking-wider text-stone-400">Expenses</p>
                {(expensesQuery.data?.items ?? []).length === 0 ? (
                  <p className="text-stone-500">No personal expense claims logged.</p>
                ) : (
                  <div className="space-y-1.5">
                    {(expensesQuery.data?.items ?? []).slice(0, 4).map((x: any) => (
                      <div key={x.id} className="flex justify-between rounded-lg bg-stone-50 p-2.5">
                        <span className="font-medium">{x.title || x.category}</span>
                        <span className="font-mono">
                          KES {Number(x.amountKes ?? x.amount ?? 0).toLocaleString()} ({x.status})
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div>
                <p className="mb-2 font-bold uppercase tracking-wider text-stone-400">
                  Recent Leave Requests
                </p>
                {(me.leaveRequests ?? []).length === 0 ? (
                  <p className="text-stone-500">No recent leave requests.</p>
                ) : (
                  <div className="space-y-1.5">
                    {(me.leaveRequests ?? []).slice(0, 4).map((l: any) => (
                      <div key={l.id} className="flex justify-between rounded-lg bg-stone-50 p-2.5">
                        <span className="capitalize">
                          {l.leaveType} ({l.days}d)
                        </span>
                        <span className="font-semibold capitalize">{l.status}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </section>
        </div>
      )}

      {tab === 'corrections' && me?.linked && (
        <div className="grid gap-4 lg:grid-cols-2">
          <section className="surface p-5">
            <div className="flex items-center gap-2 text-[#C71D1D]">
              <ClipboardEdit size={17} />
              <h2 className="font-display text-base font-semibold text-stone-900">
                Request Profile Correction
              </h2>
            </div>
            <p className="mt-1 text-xs text-stone-500">
              Permits personal contact updates subject to HR approval. Protected fields (job title, department, salary, statutory IDs) are blocked here and require formal HR workflows.
            </p>
            <form onSubmit={submitCorrection} className="mt-4 space-y-3 text-xs">
              <label className="block">
                <span className="label">Field to Update</span>
                <select name="fieldName" className="field" required>
                  <option value="preferredName">Preferred Name</option>
                  <option value="personalEmail">Personal Email</option>
                  <option value="phone">Telephone Number</option>
                  <option value="timezone">Preferred Timezone</option>
                  <option value="emergencyContactJson">Emergency Contact (JSON/Text)</option>
                  <option value="contactPreferencesJson">Contact Preferences</option>
                </select>
              </label>
              <label className="block">
                <span className="label">Proposed New Value</span>
                <input name="proposedValue" required className="field" placeholder="Enter corrected value" />
              </label>
              <label className="block">
                <span className="label">Reason / Supporting Context</span>
                <textarea name="reason" rows={2} required className="field" />
              </label>
              <button type="submit" className="btn btn-primary" data-testid="button-submit-profile-correction">
                Submit for HR Approval
              </button>
            </form>
          </section>

          <section className="surface p-5">
            <h2 className="font-display text-base font-semibold text-stone-900">
              My Profile Correction Requests
            </h2>
            <div className="mt-3 space-y-2 text-xs">
              {(me.profileCorrectionRequests ?? []).length === 0 ? (
                <p className="text-stone-500">No profile correction requests submitted yet.</p>
              ) : (
                (me.profileCorrectionRequests ?? []).map((r: any) => (
                  <div key={r.id} className="rounded-xl border border-stone-200 p-3">
                    <div className="flex justify-between font-semibold">
                      <span>{r.fieldName}</span>
                      <span className="uppercase text-[#C71D1D]">{r.status}</span>
                    </div>
                    <p className="mt-1 text-stone-600">Proposed: {r.proposedValue}</p>
                    <p className="mt-0.5 text-[11px] text-stone-400">{r.reason}</p>
                  </div>
                ))
              )}
            </div>
          </section>
        </div>
      )}

      {tab === 'privacy' && me?.linked && (
        <div className="grid gap-4 lg:grid-cols-2">
          <section className="surface p-5">
            <div className="flex items-center gap-2 text-[#C71D1D]">
              <ShieldCheck size={17} />
              <h2 className="font-display text-base font-semibold text-stone-900">
                Kenya Data Protection Act 2019 — Data Subject Rights
              </h2>
            </div>
            <p className="mt-1 text-xs leading-5 text-stone-500">
              Submit formal access (Reg 9(4) — 7 days), rectification (Reg 10(4) — 14 days), erasure (Reg 12(3) — 14 days), or processing restriction requests. Note: Erasure requests never auto-delete statutory payroll/tax records without Human &amp; Legal retention review.
            </p>
            <form onSubmit={submitPrivacy} className="mt-4 space-y-3 text-xs">
              <label className="block">
                <span className="label">Right Exercised</span>
                <select name="requestType" className="field" required>
                  <option value="access">Right of Access (7-day SLA)</option>
                  <option value="rectification">Right to Rectification (14-day SLA)</option>
                  <option value="erasure">Right to Erasure (14-day SLA + Retention Review)</option>
                  <option value="restriction">Restriction of Processing (14-day SLA)</option>
                </select>
              </label>
              <label className="block">
                <span className="label">Request Details</span>
                <textarea
                  name="details"
                  rows={3}
                  required
                  placeholder="Describe the specific personal data records or processing action requested."
                  className="field"
                />
              </label>
              <button type="submit" className="btn btn-primary" data-testid="button-submit-privacy-request">
                Submit ODPC Request
              </button>
            </form>
          </section>

          <section className="surface p-5">
            <h2 className="font-display text-base font-semibold text-stone-900">
              Submitted Privacy Requests &amp; SLA Tracking
            </h2>
            <div className="mt-3 space-y-2 text-xs">
              {(me.privacyRequests ?? []).length === 0 ? (
                <p className="text-stone-500">No data privacy requests logged.</p>
              ) : (
                (me.privacyRequests ?? []).map((pr: any) => (
                  <div key={pr.id} className="rounded-xl border border-stone-200 p-3">
                    <div className="flex justify-between font-semibold">
                      <span className="capitalize">{pr.requestType} request</span>
                      <span className="font-mono text-[#C71D1D]">SLA Due: {pr.statutoryDueDate}</span>
                    </div>
                    <p className="mt-1 text-stone-600">{pr.details}</p>
                    <p className="mt-1 text-[11px] text-stone-400">
                      Status: <strong>{pr.status}</strong> · {pr.legalBasisReference}
                    </p>
                    {auth.data?.canManagePeople && pr.status === 'submitted' && (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        <button
                          type="button"
                          onClick={() => void decidePrivacy(pr.id, 'fulfilled')}
                          className="btn btn-primary min-h-7 px-2 text-[11px]"
                        >
                          Fulfill
                        </button>
                        <button
                          type="button"
                          onClick={() => void decidePrivacy(pr.id, 'retention_exception_retained')}
                          className="btn btn-secondary min-h-7 px-2 text-[11px]"
                        >
                          Retain (Statutory Exception)
                        </button>
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </section>
        </div>
      )}

      {tab === 'team' && managerQuery.data && (
        <div className="space-y-4" data-testid="section-manager-workspace">
          <div className="grid gap-3 sm:grid-cols-4">
            <div className="surface p-4">
              <p className="text-[10px] font-bold uppercase text-stone-400">Direct Reports</p>
              <p className="mt-1 font-display text-2xl font-semibold">
                {managerQuery.data.teamCount ?? 0}
              </p>
            </div>
            <div className="surface p-4">
              <p className="text-[10px] font-bold uppercase text-stone-400">Available Today</p>
              <p className="mt-1 font-display text-2xl font-semibold text-[#34734d]">
                {managerQuery.data.availableCount ?? 0}
              </p>
            </div>
            <div className="surface p-4">
              <p className="text-[10px] font-bold uppercase text-stone-400">Pending Corrections</p>
              <p className="mt-1 font-display text-2xl font-semibold text-[#C71D1D]">
                {(managerQuery.data.pendingProfileCorrections ?? []).length}
              </p>
            </div>
            <div className="surface p-4">
              <p className="text-[10px] font-bold uppercase text-stone-400">Probation Due</p>
              <p className="mt-1 font-display text-2xl font-semibold">
                {(managerQuery.data.probationReviewsDue ?? []).length}
              </p>
            </div>
          </div>

          <section className="surface p-5">
            <div className="flex items-center gap-2 text-[#C71D1D]">
              <Users size={17} />
              <h2 className="font-display text-base font-semibold text-stone-900">
                Direct-Report Roster ({managerQuery.data.scope})
              </h2>
            </div>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-stone-200 text-[10px] uppercase tracking-wider text-stone-400">
                    <th className="py-2 pr-3">Employee</th>
                    <th className="py-2 pr-3">Role</th>
                    <th className="py-2 pr-3">Location</th>
                    <th className="py-2">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100">
                  {(managerQuery.data.directReports ?? []).map((dr: any) => (
                    <tr key={dr.id}>
                      <td className="py-2.5 pr-3 font-semibold">
                        {dr.fullName} ({dr.employeeNumber})
                      </td>
                      <td className="py-2.5 pr-3 text-stone-600">{dr.jobTitle}</td>
                      <td className="py-2.5 pr-3 text-stone-600">{dr.location}</td>
                      <td className="py-2.5 capitalize">{dr.status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {(managerQuery.data.pendingProfileCorrections ?? []).length > 0 && (
              <div className="mt-5 border-t border-stone-100 pt-4">
                <h3 className="text-xs font-bold uppercase tracking-wider text-stone-500">
                  Pending Team Profile Corrections
                </h3>
                <div className="mt-2 space-y-2">
                  {managerQuery.data.pendingProfileCorrections.map((c: any) => (
                    <div
                      key={c.id}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-stone-200 p-3 text-xs"
                    >
                      <div>
                        <span className="font-semibold">{c.fieldName}</span> →{' '}
                        <span className="font-mono">{c.proposedValue}</span> ({c.reason})
                      </div>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => void decideCorrection(c.id, 'approved')}
                          className="btn btn-primary min-h-7 px-2.5 text-[11px]"
                        >
                          Approve
                        </button>
                        <button
                          type="button"
                          onClick={() => void decideCorrection(c.id, 'rejected')}
                          className="btn btn-secondary min-h-7 px-2.5 text-[11px]"
                        >
                          Reject
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
