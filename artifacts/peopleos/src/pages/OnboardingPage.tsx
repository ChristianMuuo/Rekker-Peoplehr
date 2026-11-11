import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, Clock, Plus, X, ArrowRightLeft } from 'lucide-react';
import { useGetAuthContext, useListEmployees } from '@workspace/api-client-react';
import { apiGet, apiPatch, apiPost } from '../lib/api';

export function OnboardingPage() {
  const auth = useGetAuthContext();
  const employees = useListEmployees({ page: 1, pageSize: 50 });
  const qc = useQueryClient();
  const [workflowTab, setWorkflowTab] = useState<'onboarding' | 'offboarding'>('onboarding');
  const [showAddModal, setShowAddModal] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newEmployeeId, setNewEmployeeId] = useState('10000000-0000-4000-8000-000000000008');
  const [newCategory, setNewCategory] = useState('Compliance');
  const [newDueDate, setNewDueDate] = useState('2026-04-30');

  const tasksQuery = useQuery({
    queryKey: ['onboarding-tasks', workflowTab],
    queryFn: () => apiGet(`/api/onboarding/tasks?workflowType=${workflowTab}`),
  });

  const allItems: any[] = tasksQuery.data?.items ?? [];
  const tasks = allItems.filter(t => t.workflowType === workflowTab);
  const completedCount = tasks.filter(t => t.completed).length;
  const progressPct = tasks.length ? Math.round((completedCount / tasks.length) * 100) : 0;
  const canManage = Boolean(auth.data?.canManagePeople);

  const toggleTask = async (taskId: string) => {
    await apiPatch(`/api/onboarding/tasks/${taskId}/toggle`, {});
    qc.invalidateQueries({ queryKey: ['onboarding-tasks'] });
  };

  const handleAddTask = async (e: React.FormEvent) => {
    e.preventDefault();
    await apiPost('/api/onboarding/tasks', {
      employeeId: newEmployeeId,
      workflowType: workflowTab,
      title: newTitle,
      category: newCategory,
      dueDate: newDueDate,
    });
    setNewTitle('');
    setShowAddModal(false);
    qc.invalidateQueries({ queryKey: ['onboarding-tasks'] });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="mb-2 text-[10px] font-bold uppercase tracking-[.17em] text-[#bd2725]">Employee Lifecycle / Onboarding & Exit</p>
          <h1 className="font-display text-3xl font-semibold tracking-[-.035em] text-stone-900">
            Onboarding & Offboarding
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-stone-500">
            Track 30-60-90 day onboarding milestones, Kenyan statutory enrollment, IT asset issuance, and structured offboarding clearances.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setWorkflowTab('onboarding')}
            className={`btn text-xs ${workflowTab === 'onboarding' ? 'btn-primary' : 'btn-secondary'}`}
          >
            Onboarding ({allItems.filter(i => i.workflowType === 'onboarding').length || tasks.length})
          </button>
          <button
            onClick={() => setWorkflowTab('offboarding')}
            className={`btn text-xs ${workflowTab === 'offboarding' ? 'btn-primary' : 'btn-secondary'}`}
          >
            <ArrowRightLeft size={14} /> Offboarding
          </button>
          {canManage && (
            <button onClick={() => setShowAddModal(true)} className="btn btn-secondary text-xs">
              <Plus size={14} /> Add Checklist Item
            </button>
          )}
        </div>
      </div>

      {/* Progress Overview Card */}
      <div className="surface p-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between border-b border-stone-100 pb-4">
          <div>
            <h3 className="font-display text-lg font-bold text-stone-900">
              {workflowTab === 'onboarding' ? 'Active Onboarding Checklists & 90-Day Probation' : 'Fixed-Term Expiry & Offboarding Clearance'}
            </h3>
            <p className="text-xs text-stone-500">
              {workflowTab === 'onboarding' ? 'Statutory KRA/NSSF/SHIF enrollment, §10 contract & probation signoff.' : 'Asset return, exit interviews & final KRA P9A settlement.'}
            </p>
          </div>
          <div className="text-right">
            <p className="text-[11px] font-bold uppercase text-stone-400">Completion</p>
            <p className="font-display text-2xl font-bold text-emerald-700">{progressPct}%</p>
            <p className="text-[10px] text-stone-500">{completedCount} of {tasks.length} resolved</p>
          </div>
        </div>
        <div className="mt-4 h-2 w-full overflow-hidden rounded-full bg-stone-100">
          <div className="h-full rounded-full bg-emerald-600 transition-all" style={{ width: `${progressPct}%` }} />
        </div>
      </div>

      {/* Checklist */}
      <div className="surface p-6">
        {tasksQuery.isLoading ? (
          <div className="skeleton h-32" />
        ) : !tasks.length ? (
          <p className="py-8 text-center text-xs text-stone-500">No checklist tasks in {workflowTab}.</p>
        ) : (
          <div className="divide-y divide-stone-100">
            {tasks.map((task) => (
              <div key={task.id} onClick={() => toggleTask(task.id)} className="flex cursor-pointer items-center justify-between py-3.5 px-2 hover:bg-stone-50 rounded-lg transition">
                <div className="flex items-center gap-3">
                  <div className={`flex h-5 w-5 items-center justify-center rounded border ${task.completed ? 'border-emerald-600 bg-emerald-600 text-white' : 'border-stone-300 bg-white'}`}>
                    {task.completed && <CheckCircle2 size={14} />}
                  </div>
                  <div>
                    <p className={`text-xs font-semibold ${task.completed ? 'line-through text-stone-400' : 'text-stone-900'}`}>{task.title}</p>
                    <p className="text-[10px] text-stone-500">{task.employeeName || 'Employee'} · {task.category} · Due {task.dueDate}</p>
                  </div>
                </div>
                <span className={`rounded-full px-2 py-0.5 text-[9px] font-bold ${task.completed ? 'bg-emerald-100 text-emerald-800' : 'bg-stone-100 text-stone-600'}`}>
                  {task.completed ? 'RESOLVED' : 'PENDING'}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-950/40 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-stone-100 pb-3">
              <h3 className="font-display text-base font-bold text-stone-900">Add {workflowTab === 'onboarding' ? 'Onboarding' : 'Offboarding'} Task</h3>
              <button onClick={() => setShowAddModal(false)}><X size={18} /></button>
            </div>
            <form onSubmit={handleAddTask} className="mt-4 space-y-3 text-xs">
              <div>
                <label className="label">Employee</label>
                <select value={newEmployeeId} onChange={e => setNewEmployeeId(e.target.value)} className="field">
                  {(employees.data?.items ?? []).map(emp => (
                    <option key={emp.id} value={emp.id}>{emp.firstName} {emp.lastName}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label">Checklist Task Title</label>
                <input required value={newTitle} onChange={e => setNewTitle(e.target.value)} className="field" placeholder="e.g., Recover company vehicle keys & badge" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Category</label>
                  <select value={newCategory} onChange={e => setNewCategory(e.target.value)} className="field">
                    <option>Compliance</option>
                    <option>IT & Assets</option>
                    <option>HR & Benefits</option>
                    <option>Training</option>
                  </select>
                </div>
                <div>
                  <label className="label">Due Date</label>
                  <input type="date" value={newDueDate} onChange={e => setNewDueDate(e.target.value)} className="field" />
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setShowAddModal(false)} className="btn btn-secondary text-xs">Cancel</button>
                <button type="submit" className="btn btn-primary text-xs">Create Task</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
