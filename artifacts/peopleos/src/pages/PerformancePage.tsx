import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Award, Plus, Sparkles, X } from 'lucide-react';
import { apiGet, apiPatch, apiPost } from '../lib/api';

export function PerformancePage() {
  const qc = useQueryClient();
  const [showGoalModal, setShowGoalModal] = useState(false);
  const [showAiOkrModal, setShowAiOkrModal] = useState(false);
  const [aiRole, setAiRole] = useState('Manufacturing Quality Lead');
  const [generatedOkr, setGeneratedOkr] = useState<string | null>(null);
  const [newTitle, setNewTitle] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newCategory, setNewCategory] = useState('Operational');
  const [newTargetDate, setNewTargetDate] = useState('2026-06-30');

  const goalsQuery = useQuery({
    queryKey: ['performance-goals'],
    queryFn: () => apiGet('/api/performance/goals'),
  });

  const goals: any[] = goalsQuery.data?.items ?? [];

  const handleUpdateProgress = async (goalId: string, progress: number) => {
    await apiPatch(`/api/performance/goals/${goalId}/progress`, { progress });
    qc.invalidateQueries({ queryKey: ['performance-goals'] });
  };

  const handleCreateGoal = async (e: React.FormEvent) => {
    e.preventDefault();
    await apiPost('/api/performance/goals', {
      title: newTitle,
      description: newDesc,
      category: newCategory,
      targetDate: newTargetDate,
    });
    setNewTitle('');
    setNewDesc('');
    setShowGoalModal(false);
    qc.invalidateQueries({ queryKey: ['performance-goals'] });
  };

  const handleGenerateOkr = async () => {
    try {
      const res = await apiPost('/api/ai/chat', {
        agentRole: 'performance',
        query: `Draft Q2 2026 OKRs and measurable KPIs for ${aiRole}`,
      });
      setGeneratedOkr(res.response || '');
    } catch {
      setGeneratedOkr(`ROLE: ${aiRole}\nOBJECTIVE: Drive operational quality & KPI reliability.\nKR1: Achieve 99.8% SLA target.`);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="mb-2 text-[10px] font-bold uppercase tracking-[.17em] text-[#bd2725]">Growth & Alignment</p>
          <h1 className="font-display text-3xl font-semibold tracking-[-.035em] text-stone-900">Performance & OKRs</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-stone-500">
            Track individual and division objectives, update key-result completion metrics, and draft AI-assisted OKRs.
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => { setShowAiOkrModal(true); setGeneratedOkr(null); }} className="btn btn-secondary text-xs">
            <Sparkles size={15} className="text-red-700" /> AI OKR Assistant
          </button>
          <button onClick={() => setShowGoalModal(true)} className="btn btn-primary text-xs">
            <Plus size={15} /> Add Goal / OKR
          </button>
        </div>
      </div>

      <div className="surface flex flex-col gap-4 md:flex-row md:items-center md:justify-between p-5">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-red-100 text-red-700"><Award size={22} /></div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-display text-base font-bold text-stone-900">Q1/Q2 2026 Strategic Performance Cycle</h3>
              <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-[10px] font-bold text-emerald-800">Active</span>
            </div>
            <p className="text-xs text-stone-500">Continuous goal tracking aligned with Rekker Kenya departmental KPIs.</p>
          </div>
        </div>
        <div className="flex items-center gap-4 text-xs font-semibold text-stone-600">
          <div><span className="font-bold text-stone-900">{goals.length}</span> Active Goals</div>
          <div>
            <span className="font-bold text-emerald-800">
              {goals.length ? Math.round(goals.reduce((s, g) => s + (g.progress || 0), 0) / goals.length) : 0}%
            </span> Avg Progress
          </div>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {goals.map((g) => (
          <div key={g.id} className="surface p-5 flex flex-col justify-between">
            <div>
              <div className="flex items-start justify-between gap-2">
                <span className="rounded-md bg-stone-100 px-2 py-0.5 text-[10px] font-bold uppercase text-stone-600">{g.category}</span>
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${g.status === 'completed' ? 'bg-emerald-100 text-emerald-800' : g.status === 'behind' ? 'bg-rose-100 text-rose-800' : 'bg-amber-100 text-amber-800'}`}>
                  {String(g.status || 'in_progress').replace('_', ' ').toUpperCase()}
                </span>
              </div>
              <h3 className="mt-3 font-display text-base font-bold text-stone-900">{g.title}</h3>
              <p className="mt-1 text-xs text-stone-500 leading-relaxed">{g.description}</p>
              <p className="mt-2 text-[11px] font-medium text-stone-600">Owner: {g.employeeName}</p>
            </div>
            <div className="mt-5 border-t border-stone-100 pt-3">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-stone-600">Progress:</span>
                <span className="font-bold text-stone-900">{g.progress}%</span>
              </div>
              <div className="mt-2">
                <div className="h-2.5 w-full rounded-full bg-stone-100 overflow-hidden">
                  <div className={`h-full rounded-full transition-all ${g.progress >= 80 ? 'bg-emerald-600' : g.progress >= 50 ? 'bg-amber-500' : 'bg-red-600'}`} style={{ width: `${g.progress}%` }} />
                </div>
                <input type="range" min="0" max="100" step="5" value={g.progress} onChange={e => handleUpdateProgress(g.id, Number(e.target.value))} className="mt-2 w-full accent-red-700 cursor-pointer" />
              </div>
              <div className="mt-2 flex justify-between text-[10px] text-stone-400">
                <span>Target: {g.targetDate}</span>
                <span className="text-red-700 font-semibold">Persisted on slide</span>
              </div>
            </div>
          </div>
        ))}
      </div>

      {showGoalModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-950/40 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-stone-100 pb-3">
              <h3 className="font-display text-base font-bold">New Objective / OKR</h3>
              <button onClick={() => setShowGoalModal(false)}><X size={18} /></button>
            </div>
            <form onSubmit={handleCreateGoal} className="mt-4 space-y-3 text-xs">
              <div><label className="label">Goal Title</label><input required value={newTitle} onChange={e => setNewTitle(e.target.value)} className="field" /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="label">Category</label><select value={newCategory} onChange={e => setNewCategory(e.target.value)} className="field"><option>Operational</option><option>Quality</option><option>Compliance</option><option>Growth</option></select></div>
                <div><label className="label">Target Date</label><input type="date" value={newTargetDate} onChange={e => setNewTargetDate(e.target.value)} className="field" /></div>
              </div>
              <div><label className="label">Key Result Metrics</label><textarea value={newDesc} onChange={e => setNewDesc(e.target.value)} className="field min-h-20" /></div>
              <div className="flex justify-end gap-2"><button type="button" onClick={() => setShowGoalModal(false)} className="btn btn-secondary text-xs">Cancel</button><button type="submit" className="btn btn-primary text-xs">Create Goal</button></div>
            </form>
          </div>
        </div>
      )}

      {showAiOkrModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-950/40 p-4 backdrop-blur-xs">
          <div className="w-full max-w-xl rounded-2xl bg-white p-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-stone-100 pb-3">
              <h3 className="font-display text-base font-bold">AI OKR & KPI Assistant</h3>
              <button onClick={() => setShowAiOkrModal(false)}><X size={18} /></button>
            </div>
            <div className="mt-4 space-y-3 text-xs">
              <div className="flex gap-2">
                <input value={aiRole} onChange={e => setAiRole(e.target.value)} className="field flex-1" />
                <button onClick={handleGenerateOkr} className="btn btn-primary text-xs"><Sparkles size={14} /> Draft OKR</button>
              </div>
              {generatedOkr && <pre className="max-h-64 overflow-y-auto whitespace-pre-wrap rounded-xl border border-stone-200 bg-stone-50 p-4 font-sans text-xs">{generatedOkr}</pre>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
