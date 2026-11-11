import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  BrainCircuit, TrendingUp, AlertTriangle, RefreshCw, ShieldCheck, Activity, Sparkles
} from 'lucide-react';
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, AreaChart, Area, CartesianGrid
} from 'recharts';
import { apiGet, apiPost } from '../lib/api';

export function PredictiveMlPage() {
  const [selectedModel, setSelectedModel] = useState<'attrition' | 'workforce_forecast' | 'sentiment' | 'skills_gap'>('attrition');

  const mlOverview = useQuery({
    queryKey: ['ml-overview'],
    queryFn: () => apiGet('/api/ml/overview'),
  });

  const activeTaskQuery = useQuery({
    queryKey: ['ml-task', selectedModel],
    queryFn: () => apiPost(`/api/ml/run/${selectedModel}`, {}),
  });

  const attrition = mlOverview.data?.models?.attrition ?? (selectedModel === 'attrition' ? activeTaskQuery.data : null);
  const forecast = mlOverview.data?.models?.workforce_forecast ?? mlOverview.data?.models?.forecast ?? (selectedModel === 'workforce_forecast' ? activeTaskQuery.data : null);
  const sentiment = mlOverview.data?.models?.sentiment ?? (selectedModel === 'sentiment' ? activeTaskQuery.data : null);
  const skillsGap = mlOverview.data?.models?.skills_gap ?? mlOverview.data?.models?.skillsGap ?? (selectedModel === 'skills_gap' ? activeTaskQuery.data : null);

  const analyticsMode =
    mlOverview.data?.analyticsMode ||
    attrition?.analyticsMode ||
    activeTaskQuery.data?.analyticsMode ||
    'LOADING';

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="mb-2 text-[10px] font-bold uppercase tracking-[.17em] text-[#bd2725]">Predictive Machine Learning Engine</p>
          <h1 className="font-display text-3xl font-semibold tracking-[-.035em] text-stone-900">
            Workforce ML Intelligence
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-stone-500">
            Python Scikit-learn & XGBoost models with cross-validation metrics, explainable drivers, and explicit data provenance guarantees.
          </p>
        </div>
        <button onClick={() => { mlOverview.refetch(); activeTaskQuery.refetch(); }} className="btn btn-secondary text-xs">
          <RefreshCw size={14} /> Retrain & Re-score Models
        </button>
      </div>

      {/* Transparency Banner: Explicitly distinguish Actual Analytics vs Simulated Demo */}
      <div className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50/70 p-4 text-xs text-amber-900">
        <ShieldCheck size={18} className="mt-0.5 shrink-0 text-amber-700" />
        <div>
          <p className="font-bold">Model Provenance & Data Integrity Mode: <span className="font-mono uppercase">{analyticsMode}</span></p>
          <p className="mt-1 text-amber-800">
            {mlOverview.data?.disclaimer || attrition?.disclaimer || 'Models execute via Python 3.14 (XGBoost & Scikit-learn). Simulated training baselines are clearly flagged whenever insufficient live historical exits exist.'}
          </p>
        </div>
      </div>

      {/* Model Selector Tabs */}
      <div className="flex flex-wrap gap-2">
        {[
          ['attrition', 'XGBoost Attrition Risk'],
          ['workforce_forecast', 'Ridge Demand Forecast'],
          ['sentiment', 'NLP Burnout & Sentiment'],
          ['skills_gap', 'Competency Skills-Gap'],
        ].map(([id, label]) => (
          <button
            key={id}
            onClick={() => setSelectedModel(id as any)}
            className={`btn min-h-9 px-3.5 text-xs ${selectedModel === id ? 'btn-primary' : 'btn-secondary'}`}
          >
            <BrainCircuit size={14} /> {label}
          </button>
        ))}
      </div>

      {mlOverview.isLoading && activeTaskQuery.isLoading ? (
        <div className="grid gap-4 md:grid-cols-2"><div className="skeleton h-64" /><div className="skeleton h-64" /></div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {/* Attrition Panel */}
          <div className="surface p-5">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h3 className="font-display text-base font-bold text-stone-900">Attrition Risk Distribution</h3>
                <p className="text-xs text-stone-500">
                  CV ROC-AUC: <span className="font-bold text-emerald-700">{attrition?.evaluationMetrics?.cvRocAuc ?? 'N/A'}</span> · F1: {attrition?.evaluationMetrics?.cvF1Score ?? 'N/A'}
                </p>
              </div>
              <span className="rounded bg-stone-100 px-2 py-0.5 font-mono text-[10px]">XGBClassifier</span>
            </div>
            {(attrition?.predictions?.length ?? 0) > 0 ? (
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={(attrition.predictions || []).slice(0, 6).map((p: any) => ({ name: p.employeeName.split(' ')[0], riskPct: Math.round(p.attritionProbability * 100) }))}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e7e5e4" />
                    <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                    <YAxis unit="%" tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Bar dataKey="riskPct" fill="#C71D1D" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <p className="py-12 text-center text-xs text-stone-400">Run live Python ML backend to inspect XGBoost feature attributions.</p>
            )}
          </div>

          {/* Workforce Forecast Panel */}
          <div className="surface p-5">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h3 className="font-display text-base font-bold text-stone-900">6-Month Headcount Forecast</h3>
                <p className="text-xs text-stone-500">
                  In-sample MAE: <span className="font-bold text-stone-900">{forecast?.evaluationMetrics?.inSampleMae ?? 'N/A'}</span> · Budget Capacity: {forecast?.evaluationMetrics?.budgetedTotal ?? 46}
                </p>
              </div>
              <span className="rounded bg-stone-100 px-2 py-0.5 font-mono text-[10px]">Ridge Trend</span>
            </div>
            {(forecast?.forecast?.length ?? 0) > 0 ? (
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={forecast.forecast}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e7e5e4" />
                    <XAxis dataKey="label" tick={{ fontSize: 10 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Area type="monotone" dataKey="upperBound95" stroke="#e7c8c0" fill="#fbe9e7" />
                    <Area type="monotone" dataKey="projectedHeadcount" stroke="#C71D1D" fill="#f5d8d4" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <p className="py-12 text-center text-xs text-stone-400">Connect Python ML engine for Ridge regression demand curves.</p>
            )}
          </div>

          {/* Explainable Attrition Drivers Table */}
          {(attrition?.predictions?.length ?? 0) > 0 && (
            <div className="surface p-5 lg:col-span-2">
              <h3 className="mb-3 font-display text-base font-bold text-stone-900">Explainable Per-Employee Retention Drivers</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="border-b border-stone-200 bg-stone-50 text-[10px] font-bold uppercase text-stone-500">
                    <tr>
                      <th className="px-4 py-2.5">Employee</th>
                      <th className="px-4 py-2.5">Department</th>
                      <th className="px-4 py-2.5">Risk Score</th>
                      <th className="px-4 py-2.5">Tier</th>
                      <th className="px-4 py-2.5">Top Explainability Drivers</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-100">
                    {attrition.predictions.map((p: any) => (
                      <tr key={p.employeeId}>
                        <td className="px-4 py-2.5 font-bold text-stone-900">{p.employeeName}</td>
                        <td className="px-4 py-2.5 text-stone-500">{p.department}</td>
                        <td className="px-4 py-2.5 font-mono font-bold">{(p.attritionProbability * 100).toFixed(1)}%</td>
                        <td className="px-4 py-2.5">
                          <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${p.riskTier === 'high' ? 'bg-red-100 text-red-800' : p.riskTier === 'medium' ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800'}`}>
                            {p.riskTier}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-stone-600">
                          {(p.topDrivers || []).map((d: any) => `${d.feature} (${d.direction === 'increases_risk' ? '+' : '-'})`).join(' · ')}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Sentiment & Skills Gap Cards */}
          {sentiment?.entries && (
            <div className="surface p-5">
              <h3 className="mb-2 font-display text-base font-bold text-stone-900">NLP Burnout & Sentiment Monitor</h3>
              <p className="mb-3 text-xs text-stone-500">Avg Polarity: {sentiment.averagePolarity} · Flagged Burnout Risk: {sentiment.atRiskCount}</p>
              <div className="space-y-2">
                {sentiment.entries.map((s: any) => (
                  <div key={s.id} className="rounded-xl border border-stone-100 bg-stone-50 p-3 text-xs">
                    <div className="flex justify-between font-bold">
                      <span>{s.author}</span>
                      <span className={s.sentiment === 'at_risk' ? 'text-red-700' : 'text-emerald-700'}>{s.sentiment.toUpperCase()}</span>
                    </div>
                    <p className="mt-1 text-stone-600">{s.excerpt}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {skillsGap?.employeeGaps && (
            <div className="surface p-5">
              <h3 className="mb-2 font-display text-base font-bold text-stone-900">Skills-Gap Readiness ({skillsGap.organizationSkillReadinessPct}%)</h3>
              <div className="space-y-2">
                {skillsGap.employeeGaps.slice(0, 5).map((g: any) => (
                  <div key={g.employeeId} className="rounded-xl border border-stone-100 bg-stone-50 p-3 text-xs">
                    <div className="flex justify-between font-bold">
                      <span>{g.employeeName}</span>
                      <span className="text-red-700">{g.coveragePct}% coverage</span>
                    </div>
                    <p className="mt-1 text-[11px] text-stone-500">Missing: {(g.missingSkills || []).join(', ') || 'Fully certified'}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

