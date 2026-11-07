import React, { useState } from 'react';
import {
  Target, TrendingUp, CheckCircle2, Clock, Plus, Sparkles,
  UserCheck, AlertCircle, Award, ChevronRight, X
} from 'lucide-react';
import { peopleOsStore, type Goal } from '../data/mockStore';

export function PerformancePage() {
  const [goals, setGoals] = useState<Goal[]>(peopleOsStore.getGoals());
  const [showGoalModal, setShowGoalModal] = useState(false);
  const [showAiOkrModal, setShowAiOkrModal] = useState(false);
  const [aiRole, setAiRole] = useState('Manufacturing Quality Lead');
  const [generatedOkr, setGeneratedOkr] = useState<string | null>(null);

  const handleUpdateProgress = (goalId: string, newProgress: number) => {
    peopleOsStore.updateGoalProgress(goalId, newProgress);
    setGoals(peopleOsStore.getGoals());
  };

  const handleGenerateOkr = () => {
    const okr = `ROLE: ${aiRole.toUpperCase()}
OBJECTIVE: Enhance Commercial Brewing Consistency & Minimize Line Bottlenecks

KEY RESULT 1:
Maintain cold wort temperature stability within ±0.2°C across all fermentation batches, reducing yeast stress indices by 25%.

KEY RESULT 2:
Conduct weekly sensory panel audits with 100% calibration compliance according to KEBS beer grading criteria.

KEY RESULT 3:
Achieve zero packaging line contamination stoppages over the Q2 operational quarter.`;
    setGeneratedOkr(okr);
  };

  return (
    <div className="space-y-6">
      {/* Top Heading */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="mb-2 text-[10px] font-bold uppercase tracking-[.17em] text-[#bd2725]">Growth & Alignment</p>
          <h1 className="font-display text-3xl font-semibold tracking-[-.035em] text-stone-900 md:text-[34px]">
            Performance & OKRs
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-stone-500">
            Track individual and department objectives, evaluate quarterly key results, and facilitate continuous 360 feedback.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => { setShowAiOkrModal(true); setGeneratedOkr(null); }}
            className="btn btn-secondary flex items-center gap-2 text-xs font-semibold"
          >
            <Sparkles size={15} className="text-red-700" /> AI OKR Assistant
          </button>
        </div>
      </div>

      {/* Review Cycle Status Banner */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between rounded-2xl border border-stone-200 bg-white p-5 shadow-xs">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-red-100 text-red-700">
            <Award size={22} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-display text-base font-bold text-stone-900">Q1 2026 Strategic Performance Cycle</h3>
              <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-[10px] font-bold text-emerald-800">In Progress</span>
            </div>
            <p className="text-xs text-stone-500">Manager reviews and self-assessments due by April 15, 2026.</p>
          </div>
        </div>
        <div className="flex items-center gap-4 text-xs font-semibold text-stone-600">
          <div><span className="font-bold text-stone-900">{goals.length}</span> Active Goals</div>
          <div><span className="font-bold text-emerald-800">85%</span> Org Alignment</div>
        </div>
      </div>

      {/* Goals Cards List */}
      <div className="grid gap-4 md:grid-cols-2">
        {goals.map((g) => (
          <div key={g.id} className="rounded-2xl border border-stone-200 bg-white p-5 shadow-xs flex flex-col justify-between">
            <div>
              <div className="flex items-start justify-between gap-2">
                <span className="rounded-md bg-stone-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-stone-600">
                  {g.category}
                </span>
                <span
                  className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                    g.status === 'completed'
                      ? 'bg-emerald-100 text-emerald-800'
                      : g.status === 'behind'
                      ? 'bg-rose-100 text-rose-800'
                      : 'bg-amber-100 text-amber-800'
                  }`}
                >
                  {g.status.replace('_', ' ').toUpperCase()}
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

              {/* Progress Bar & Slider */}
              <div className="mt-2 relative">
                <div className="h-2.5 w-full rounded-full bg-stone-100 overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-300 ${
                      g.progress >= 80 ? 'bg-emerald-600' : g.progress >= 50 ? 'bg-amber-500' : 'bg-red-600'
                    }`}
                    style={{ width: `${g.progress}%` }}
                  />
                </div>
                <input
                  type="range"
                  min="0"
                  max="100"
                  step="5"
                  value={g.progress}
                  onChange={(e) => handleUpdateProgress(g.id, Number(e.target.value))}
                  className="mt-2 w-full accent-red-700 cursor-pointer"
                />
              </div>

              <div className="mt-2 flex items-center justify-between text-[10px] text-stone-400">
                <span>Target: {g.targetDate}</span>
                <span className="text-red-700 font-semibold cursor-pointer hover:underline">Slide to update %</span>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Modal: AI OKR Assistant */}
      {showAiOkrModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-950/40 p-4 backdrop-blur-xs">
          <div className="w-full max-w-xl rounded-2xl bg-white p-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-stone-100 pb-3">
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-red-100 text-red-700">
                  <Sparkles size={16} />
                </div>
                <h3 className="font-display text-lg font-bold text-stone-900">AI Goal & OKR Drafter</h3>
              </div>
              <button onClick={() => setShowAiOkrModal(false)} className="text-stone-400 hover:text-stone-700"><X size={18} /></button>
            </div>

            <div className="mt-4 space-y-4">
              <div>
                <label className="text-xs font-bold text-stone-700">Role / Department Target</label>
                <div className="mt-1 flex gap-2">
                  <input
                    type="text"
                    value={aiRole}
                    onChange={(e) => setAiRole(e.target.value)}
                    className="flex-1 rounded-lg border border-stone-200 px-3 py-2 text-xs focus:border-red-700 focus:outline-hidden"
                  />
                  <button
                    onClick={handleGenerateOkr}
                    className="btn btn-primary flex items-center gap-1.5 text-xs"
                  >
                    <Sparkles size={14} /> Draft OKR
                  </button>
                </div>
              </div>

              {generatedOkr && (
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-bold text-stone-700">AI Proposed Framework</span>
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(generatedOkr);
                        alert('OKR copied to clipboard!');
                      }}
                      className="text-[11px] font-semibold text-red-700 hover:underline"
                    >
                      Copy Framework
                    </button>
                  </div>
                  <pre className="max-h-64 overflow-y-auto rounded-xl bg-stone-50 p-4 font-mono text-[11px] leading-relaxed text-stone-700 whitespace-pre-wrap border border-stone-200">
                    {generatedOkr}
                  </pre>
                </div>
              )}
            </div>

            <div className="mt-5 flex justify-end gap-2 border-t border-stone-100 pt-3">
              <button onClick={() => setShowAiOkrModal(false)} className="btn btn-secondary text-xs">
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
