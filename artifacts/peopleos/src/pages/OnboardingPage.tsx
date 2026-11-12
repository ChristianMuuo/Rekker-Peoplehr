import { useEffect, useState, type FormEvent } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useListEmployees, useGetAuthContext } from '@workspace/api-client-react';
import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  ClipboardCheck,
  FilePlus2,
  ListChecks,
  UserMinus,
  UserPlus,
} from 'lucide-react';
import { apiGet, apiPatch, apiPost } from '@/lib/api';

export function OnboardingPage() {
  const qc = useQueryClient();
  const auth = useGetAuthContext();
  const employeesQuery = useListEmployees({ page: 1, pageSize: 100 });
  const employees = employeesQuery.data?.items ?? [];

  const [tab, setTab] = useState<'tasks' | 'templates' | 'probation' | 'offboard'>('tasks');
  const [workflowTab, setWorkflowTab] = useState<'onboarding' | 'offboarding'>('onboarding');
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [newEmployeeId, setNewEmployeeId] = useState('');
  const [newCategory, setNewCategory] = useState('IT & Systems');
  const [notice, setNotice] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!newEmployeeId && employees.length > 0) {
      setNewEmployeeId(employees[0]!.id);
    }
  }, [employees, newEmployeeId]);

  const tasksQuery = useQuery({
    queryKey: ['onboarding-tasks', workflowTab],
    queryFn: () => apiGet<{ items: any[] }>(`/api/onboarding/tasks?workflowType=${workflowTab}`),
  });

  const templatesQuery = useQuery({
    queryKey: ['onboarding-templates'],
    queryFn: () => apiGet<{ templates?: any[]; items?: any[] }>('/api/onboarding/templates'),
    enabled: tab === 'templates' || tab === 'offboard',
  });

  const probationQuery = useQuery({
    queryKey: ['onboarding-probation-contracts'],
    queryFn: () =>
      apiGet<{ probationReviews: any[]; contractReminders: any[] }>(
        '/api/onboarding/probation-and-contracts',
      ),
    enabled: tab === 'probation',
  });

  const toggleTask = async (taskId: string) => {
    await apiPatch(`/api/onboarding/tasks/${taskId}/toggle`, {});
    qc.invalidateQueries({ queryKey: ['onboarding-tasks'] });
  };

  const handleCreateTask = async (e: FormEvent) => {
    e.preventDefault();
    if (!newTaskTitle.trim() || !newEmployeeId) return;
    await apiPost('/api/onboarding/tasks', {
      employeeId: newEmployeeId,
      workflowType: workflowTab,
      title: newTaskTitle.trim(),
      category: newCategory,
      dueDate: new Date(Date.now() + 7 * 86400 * 1000).toISOString().slice(0, 10),
    });
    setNewTaskTitle('');
    qc.invalidateQueries({ queryKey: ['onboarding-tasks'] });
  };

  const createTemplate = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setNotice(null);
    setErrorMsg(null);
    const fd = new FormData(e.currentTarget);
    const rawLines = String(fd.get('tasksText') ?? '')
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean);
    try {
      await apiPost('/api/onboarding/templates', {
        name: String(fd.get('name')),
        workflowType: String(fd.get('workflowType')),
        tasks: rawLines.map((line, i) => ({
          title: line,
          category: 'Standard Checklist',
          dueOffsetDays: (i + 1) * 3,
        })),
      });
      setNotice('Reusable lifecycle checklist template saved.');
      e.currentTarget.reset();
      templatesQuery.refetch();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Unable to save template.');
    }
  };

  const decideProbation = async (
    reviewId: string,
    decision: 'confirm' | 'extend' | 'do_not_confirm',
  ) => {
    setNotice(null);
    setErrorMsg(null);
    const extendedUntilDate =
      decision === 'extend'
        ? new Date(Date.now() + 90 * 86400 * 1000).toISOString().slice(0, 10)
        : undefined;
    try {
      await apiPost(`/api/onboarding/probation-reviews/${reviewId}/decide`, {
        decision,
        extendedUntilDate,
        notes: `Kenya §42 human-reviewed probation outcome: ${decision}`,
      });
      setNotice(`Probation review decision '${decision}' recorded.`);
      probationQuery.refetch();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Probation decision failed.');
    }
  };

  const actContractReminder = async (
    reminderId: string,
    action: 'acknowledge' | 'non_renewal_review',
  ) => {
    setNotice(null);
    setErrorMsg(null);
    try {
      await apiPost(`/api/onboarding/contract-reminders/${reminderId}/action`, {
        action,
        notes: 'Flagged for formal HR & legal renewal review without automatic termination.',
      });
      setNotice(`Contract reminder updated (${action}).`);
      probationQuery.refetch();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Contract reminder update failed.');
    }
  };

  const runOffboarding = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setNotice(null);
    setErrorMsg(null);
    const fd = new FormData(e.currentTarget);
    try {
      const res = await apiPost<any>('/api/onboarding/offboard', {
        employeeId: String(fd.get('employeeId')),
        effectiveDate: String(fd.get('effectiveDate')),
        reason: String(fd.get('reason')),
        onboardingTemplateId: String(fd.get('templateId') || '') || null,
      });
      setNotice(
        `Structured offboarding initiated. Unreturned assets flagged for clearance: ${
          res?.unreturnedAssets?.length ?? 0
        }.`,
      );
      qc.invalidateQueries({ queryKey: ['onboarding-tasks'] });
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Unable to initiate offboarding.');
    }
  };

  const tasks = tasksQuery.data?.items ?? [];
  const templates = templatesQuery.data?.templates ?? templatesQuery.data?.items ?? [];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-[#C71D1D]">
            Employee Lifecycle Governance
          </p>
          <h1 className="mt-1 font-display text-2xl font-bold text-stone-900 md:text-3xl">
            Onboarding, Probation &amp; Offboarding
          </h1>
          <p className="mt-1 text-sm text-stone-500">
            Reusable templates, Kenya §42 human-reviewed probation milestones, contract reminders, and asset-linked exit clearance.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {(
            [
              ['tasks', 'Active Tasks'],
              ['templates', 'Checklist Templates'],
              ['probation', 'Probation & Contracts'],
              ['offboard', 'Structured Offboarding'],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              className={`rounded-xl px-3.5 py-2 text-xs font-semibold ${
                tab === id
                  ? 'bg-[#C71D1D] text-white'
                  : 'bg-white text-stone-700 ring-1 ring-stone-200'
              }`}
              data-testid={`tab-lifecycle-${id}`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {notice && (
        <div className="flex items-center gap-2 rounded-xl border border-[#b9dfc6] bg-[#e8f2eb] p-3 text-xs text-[#235436]">
          <CheckCircle2 size={15} />
          <span>{notice}</span>
        </div>
      )}
      {errorMsg && (
        <div className="flex items-center gap-2 rounded-xl border border-[#f2c8c8] bg-[#fdf2f2] p-3 text-xs text-[#9b1c1c]">
          <AlertTriangle size={15} />
          <span>{errorMsg}</span>
        </div>
      )}

      {tab === 'tasks' && (
        <div className="space-y-4">
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setWorkflowTab('onboarding')}
              className={`inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-semibold ${
                workflowTab === 'onboarding'
                  ? 'bg-stone-900 text-white'
                  : 'bg-white text-stone-700 ring-1 ring-stone-200'
              }`}
            >
              <UserPlus size={14} /> Onboarding Tasks
            </button>
            <button
              type="button"
              onClick={() => setWorkflowTab('offboarding')}
              className={`inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-semibold ${
                workflowTab === 'offboarding'
                  ? 'bg-stone-900 text-white'
                  : 'bg-white text-stone-700 ring-1 ring-stone-200'
              }`}
            >
              <UserMinus size={14} /> Offboarding Tasks
            </button>
          </div>

          {auth.data?.canManagePeople && (
            <form onSubmit={handleCreateTask} className="surface grid gap-3 p-4 md:grid-cols-4">
              <select
                value={newEmployeeId}
                onChange={(e) => setNewEmployeeId(e.target.value)}
                className="field text-xs"
                required
                aria-label="Select employee"
              >
                <option value="">Select employee…</option>
                {employees.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.firstName} {e.lastName} ({e.employeeNumber})
                  </option>
                ))}
              </select>
              <input
                value={newTaskTitle}
                onChange={(e) => setNewTaskTitle(e.target.value)}
                placeholder="Checklist task title (e.g. Issue PPE & Factory Badge)"
                required
                className="field text-xs md:col-span-2"
              />
              <div className="flex gap-2">
                <select
                  value={newCategory}
                  onChange={(e) => setNewCategory(e.target.value)}
                  className="field text-xs"
                >
                  <option value="IT & Systems">IT &amp; Systems</option>
                  <option value="Compliance & §10">Compliance &amp; §10</option>
                  <option value="Safety & PPE">Safety &amp; PPE</option>
                  <option value="Asset Clearance">Asset Clearance</option>
                </select>
                <button type="submit" disabled={!newEmployeeId} className="btn btn-primary shrink-0 text-xs">
                  Add Task
                </button>
              </div>
            </form>
          )}

          <div className="surface divide-y divide-stone-100">
            {tasks.length === 0 ? (
              <p className="p-6 text-center text-xs text-stone-500">
                No {workflowTab} tasks active.
              </p>
            ) : (
              tasks.map((t: any) => (
                <div
                  key={t.id}
                  className="flex flex-wrap items-center justify-between gap-3 p-4 text-xs"
                >
                  <div>
                    <p
                      className={`font-semibold ${
                        t.completed ? 'line-through text-stone-400' : 'text-stone-900'
                      }`}
                    >
                      {t.title}
                    </p>
                    <p className="mt-0.5 text-[11px] text-stone-500">
                      {t.category} · Due {t.dueDate || 'TBD'}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => void toggleTask(t.id)}
                    className={`btn min-h-8 px-3 text-xs ${
                      t.completed ? 'btn-secondary' : 'btn-primary'
                    }`}
                  >
                    <ClipboardCheck size={13} /> {t.completed ? 'Completed' : 'Mark Complete'}
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {tab === 'templates' && (
        <div className="grid gap-4 lg:grid-cols-2">
          <section className="surface p-5">
            <div className="flex items-center gap-2 text-[#C71D1D]">
              <FilePlus2 size={17} />
              <h2 className="font-display text-base font-semibold text-stone-900">
                Create Reusable Checklist Template
              </h2>
            </div>
            <form onSubmit={createTemplate} className="mt-4 space-y-3 text-xs">
              <label className="block">
                <span className="label">Template Name</span>
                <input name="name" required placeholder="Nairobi Factory Production Onboarding" className="field" />
              </label>
              <label className="block">
                <span className="label">Workflow Type</span>
                <select name="workflowType" className="field" defaultValue="onboarding">
                  <option value="onboarding">Onboarding</option>
                  <option value="offboarding">Offboarding</option>
                </select>
              </label>
              <label className="block">
                <span className="label">Checklist Tasks (one per line)</span>
                <textarea
                  name="tasksText"
                  rows={4}
                  required
                  defaultValue={
                    'Verify Section 10 Signed Particulars\nCollect KRA PIN, NSSF & SHIF Details\nComplete Factory Safety & GMP Induction'
                  }
                  className="field"
                />
              </label>
              <button type="submit" className="btn btn-primary">
                Save Template
              </button>
            </form>
          </section>

          <section className="surface p-5">
            <div className="flex items-center gap-2 text-[#C71D1D]">
              <ListChecks size={17} />
              <h2 className="font-display text-base font-semibold text-stone-900">
                Saved Templates
              </h2>
            </div>
            <div className="mt-3 space-y-2 text-xs">
              {templates.length === 0 ? (
                <p className="text-stone-500">No custom lifecycle templates created yet.</p>
              ) : (
                templates.map((tpl: any) => (
                  <div key={tpl.id} className="rounded-xl border border-stone-200 p-3">
                    <div className="flex justify-between font-semibold text-stone-900">
                      <span>{tpl.name}</span>
                      <span className="uppercase text-[#C71D1D]">{tpl.workflowType}</span>
                    </div>
                    <p className="mt-1 text-stone-500">
                      {(tpl.tasks ?? []).length} standardized task(s)
                    </p>
                  </div>
                ))
              )}
            </div>
          </section>
        </div>
      )}

      {tab === 'probation' && (
        <div className="grid gap-4 lg:grid-cols-2">
          <section className="surface p-5">
            <div className="flex items-center gap-2 text-[#C71D1D]">
              <CalendarClock size={17} />
              <h2 className="font-display text-base font-semibold text-stone-900">
                Kenya §42 Probation Reviews (Human Confirmation Required)
              </h2>
            </div>
            <div className="mt-3 space-y-2.5 text-xs">
              {(probationQuery.data?.probationReviews ?? []).length === 0 ? (
                <p className="text-stone-500">No probation review milestones tracked yet.</p>
              ) : (
                probationQuery.data!.probationReviews.map((pr: any) => (
                  <div key={pr.id} className="rounded-xl border border-stone-200 p-3">
                    <div className="flex justify-between font-semibold">
                      <span>
                        {pr.employeeName} ({pr.milestoneDay}d milestone)
                      </span>
                      <span className="uppercase text-[#C71D1D]">{pr.status}</span>
                    </div>
                    <p className="mt-1 text-stone-500">
                      End Date: {pr.probationEndDate} · Extensions used: {pr.extensionCount ?? 0}/1
                    </p>
                    {pr.status === 'pending_review' && auth.data?.canManagePeople && (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        <button
                          type="button"
                          onClick={() => void decideProbation(pr.id, 'confirm')}
                          className="btn btn-primary min-h-7 px-2.5 text-[11px]"
                        >
                          Confirm Appointment
                        </button>
                        {(pr.extensionCount ?? 0) < 1 && (
                          <button
                            type="button"
                            onClick={() => void decideProbation(pr.id, 'extend')}
                            className="btn btn-secondary min-h-7 px-2.5 text-[11px]"
                          >
                            Extend (Once §42)
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </section>

          <section className="surface p-5">
            <h2 className="font-display text-base font-semibold text-stone-900">
              Fixed-Term Contract Reminders (No Auto-Termination)
            </h2>
            <div className="mt-3 space-y-2.5 text-xs">
              {(probationQuery.data?.contractReminders ?? []).length === 0 ? (
                <p className="text-stone-500">No upcoming contract expiry reminders.</p>
              ) : (
                probationQuery.data!.contractReminders.map((cr: any) => (
                  <div key={cr.id} className="rounded-xl border border-stone-200 p-3">
                    <div className="flex justify-between font-semibold">
                      <span>{cr.employeeName}</span>
                      <span className="font-mono text-[#C71D1D]">Ends {cr.contractEndDate}</span>
                    </div>
                    <p className="mt-1 text-stone-500">Status: {cr.status}</p>
                    {cr.status === 'open' && auth.data?.canManagePeople && (
                      <div className="mt-2 flex gap-2">
                        <button
                          type="button"
                          onClick={() => void actContractReminder(cr.id, 'acknowledge')}
                          className="btn btn-secondary min-h-7 px-2.5 text-[11px]"
                        >
                          Acknowledge Review
                        </button>
                        <button
                          type="button"
                          onClick={() => void actContractReminder(cr.id, 'non_renewal_review')}
                          className="btn btn-secondary min-h-7 px-2.5 text-[11px]"
                        >
                          Flag Renewal Check
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

      {tab === 'offboard' && (
        <section className="surface max-w-xl p-5">
          <h2 className="font-display text-base font-semibold text-stone-900">
            Structured Offboarding &amp; Asset Clearance
          </h2>
          <p className="mt-1 text-xs text-stone-500">
            Records an effective-dated status transition to former employee, spawns exit checklist tasks, and checks assigned company assets.
          </p>
          <form onSubmit={runOffboarding} className="mt-4 space-y-3 text-xs">
            <label className="block">
              <span className="label">Employee</span>
              <select name="employeeId" required className="field">
                <option value="">Select employee…</option>
                {employees.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.firstName} {e.lastName} ({e.employeeNumber})
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="label">Separation Effective Date</span>
              <input
                name="effectiveDate"
                type="date"
                required
                defaultValue={new Date().toISOString().slice(0, 10)}
                className="field"
              />
            </label>
            <label className="block">
              <span className="label">Offboarding Template (optional)</span>
              <select name="templateId" className="field">
                <option value="">Default exit &amp; asset clearance checklist</option>
                {templates
                  .filter((t: any) => t.workflowType === 'offboarding')
                  .map((t: any) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
              </select>
            </label>
            <label className="block">
              <span className="label">Separation Reason</span>
              <input
                name="reason"
                required
                placeholder="Resignation, mutual separation, or end of fixed term"
                className="field"
              />
            </label>
            <button type="submit" className="btn btn-primary" data-testid="button-initiate-offboarding">
              Initiate Structured Offboarding
            </button>
          </form>
        </section>
      )}
    </div>
  );
}
