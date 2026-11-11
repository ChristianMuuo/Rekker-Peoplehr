import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Lock, Plus, ShieldAlert, X } from 'lucide-react';
import { useGetAuthContext } from '@workspace/api-client-react';
import { apiGet, apiPatch, apiPost } from '../lib/api';

export function HrCasesPage() {
  const auth = useGetAuthContext();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('grievance');
  const [severity, setSeverity] = useState('medium');
  const [description, setDescription] = useState('');
  const [notesDraft, setNotesDraft] = useState<Record<string, string>>({});

  const casesQuery = useQuery({
    queryKey: ['hr-cases'],
    queryFn: () => apiGet('/api/hr-cases'),
  });

  const items: any[] = casesQuery.data?.items ?? [];
  const scope = casesQuery.data?.accessScope ?? 'RESTRICTED';
  const isHrOfficer = Boolean(auth.data?.canManagePeople);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await apiPost('/api/hr-cases', { title, category, severity, description });
    setOpen(false);
    setTitle('');
    setDescription('');
    qc.invalidateQueries({ queryKey: ['hr-cases'] });
  };

  const handleUpdateStatus = async (caseId: string, status: string) => {
    await apiPatch(`/api/hr-cases/${caseId}`, {
      status,
      ...(notesDraft[caseId] ? { confidentialNotes: notesDraft[caseId] } : {}),
    });
    qc.invalidateQueries({ queryKey: ['hr-cases'] });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[.16em] text-[#C71D1D]">Phase 3 · Employee Relations</p>
          <h1 className="mt-1 font-display text-3xl font-bold tracking-tight text-stone-900">Confidential HR Case Management</h1>
          <p className="mt-1 text-xs text-stone-500">Strictly separated from general employee records. Investigation notes remain sealed to HR Case Officers.</p>
        </div>
        <button onClick={() => setOpen(true)} className="btn btn-primary text-xs" data-testid="button-open-hr-case">
          <Plus size={15} /> Submit Confidential HR Case
        </button>
      </div>

      <div className="flex items-center gap-3 rounded-xl border border-stone-200 bg-white p-4 text-xs">
        <Lock size={16} className="text-[#C71D1D]" />
        <span>Active Privacy Boundary: <strong className="font-mono text-stone-900">{scope}</strong></span>
      </div>

      {casesQuery.isError ? (
        <div className="surface p-8 text-center text-xs text-[#C71D1D]">
          Confidential HR Case viewing is restricted for your current role.
        </div>
      ) : items.length === 0 ? (
        <div className="surface p-10 text-center text-xs text-stone-500">
          No confidential grievances, disciplinary investigations, or workplace queries visible to your access level.
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((c) => (
            <div key={c.id} className="surface space-y-3 p-5 text-xs">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="font-mono font-bold text-[#C71D1D]">{c.caseNumber}</span>
                  <span className="rounded bg-stone-100 px-2 py-0.5 text-[10px] font-bold uppercase">{c.category}</span>
                  <span className="rounded bg-amber-50 px-2 py-0.5 text-[10px] font-bold uppercase text-amber-800">{c.severity}</span>
                </div>
                <span className="rounded-full bg-stone-900 px-2.5 py-0.5 text-[10px] font-bold uppercase text-white">{c.status}</span>
              </div>
              <h2 className="font-display text-base font-bold text-stone-900">{c.title}</h2>
              <p className="text-stone-600">{c.description}</p>
              {isHrOfficer && c.confidentialNotes && (
                <div className="rounded-lg border border-red-200 bg-red-50/60 p-3 text-red-950">
                  <p className="text-[10px] font-bold uppercase text-[#C71D1D]">Sealed HR Investigation Notes</p>
                  <p className="mt-1">{c.confidentialNotes}</p>
                </div>
              )}
              {isHrOfficer && (
                <div className="flex flex-wrap items-center gap-2 border-t border-stone-100 pt-3">
                  <input
                    value={notesDraft[c.id] ?? ''}
                    onChange={(e) => setNotesDraft((prev) => ({ ...prev, [c.id]: e.target.value }))}
                    placeholder="Add confidential investigator note..."
                    className="field min-h-8 flex-1 py-1 text-xs"
                  />
                  <button onClick={() => handleUpdateStatus(c.id, 'investigating')} className="btn btn-secondary min-h-8 px-3 text-xs">Investigate</button>
                  <button onClick={() => handleUpdateStatus(c.id, 'resolved')} className="btn btn-primary min-h-8 px-3 text-xs">Resolve Case</button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-950/50 p-4" onClick={() => setOpen(false)}>
          <form onSubmit={handleSubmit} className="w-full max-w-md space-y-3 rounded-2xl bg-white p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between"><h3 className="font-display text-lg font-bold">Submit Confidential HR Case</h3><button type="button" onClick={() => setOpen(false)}><X size={18} /></button></div>
            <input required value={title} onChange={(e) => setTitle(e.target.value)} className="field" placeholder="Subject *" />
            <div className="grid grid-cols-2 gap-3">
              <select value={category} onChange={(e) => setCategory(e.target.value)} className="field">
                <option value="grievance">Employee Grievance</option>
                <option value="workplace_query">Workplace Policy Query</option>
                <option value="disciplinary">Disciplinary Matter (HR)</option>
                <option value="policy_breach">Policy Breach</option>
              </select>
              <select value={severity} onChange={(e) => setSeverity(e.target.value)} className="field">
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="critical">Critical</option>
              </select>
            </div>
            <textarea required minLength={10} value={description} onChange={(e) => setDescription(e.target.value)} className="field min-h-24" placeholder="Provide detailed factual context..." />
            <button type="submit" className="btn btn-primary w-full text-xs">Log Case Securely</button>
          </form>
        </div>
      )}
    </div>
  );
}

