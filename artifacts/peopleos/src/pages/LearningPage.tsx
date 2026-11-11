import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowRight, CheckCircle2, Plus, X } from 'lucide-react';
import { useGetAuthContext } from '@workspace/api-client-react';
import { apiGet, apiPost } from '../lib/api';

export function LearningPage() {
  const auth = useGetAuthContext();
  const qc = useQueryClient();
  const [filterType, setFilterType] = useState<string>('all');
  const [showAddModal, setShowAddModal] = useState(false);
  const [enrolledBanner, setEnrolledBanner] = useState<string | null>(null);
  const [newTitle, setNewTitle] = useState('');
  const [newProvider, setNewProvider] = useState('DOSHS / KEBS Institute');

  const coursesQuery = useQuery({
    queryKey: ['learning-courses'],
    queryFn: () => apiGet('/api/learning/courses'),
  });

  const courses: any[] = coursesQuery.data?.items ?? [];
  const filtered = filterType === 'all' ? courses : courses.filter(c => c.status === filterType);
  const canManage = Boolean(auth.data?.canManagePeople);

  const handleEnroll = async (course: any) => {
    await apiPost(`/api/learning/courses/${course.id}/enroll`, {});
    setEnrolledBanner(`Team enrolled in "${course.title}".`);
    qc.invalidateQueries({ queryKey: ['learning-courses'] });
  };

  const handleCreateCourse = async (e: React.FormEvent) => {
    e.preventDefault();
    await apiPost('/api/learning/courses', {
      title: newTitle,
      provider: newProvider,
      category: 'Technical & Compliance',
      durationHours: 6,
      status: 'mandatory',
    });
    setNewTitle('');
    setShowAddModal(false);
    qc.invalidateQueries({ queryKey: ['learning-courses'] });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="mb-2 text-[10px] font-bold uppercase tracking-[.17em] text-[#bd2725]">People Growth / Academy</p>
          <h1 className="font-display text-3xl font-semibold tracking-[-.035em] text-stone-900">Learning & Certifications</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-stone-500">
            Mandatory OSHA, KEBS, and ODPC compliance training plus technical engineering certifications.
          </p>
        </div>
        {canManage && (
          <button onClick={() => setShowAddModal(true)} className="btn btn-primary text-xs">
            <Plus size={15} /> Add Training Course
          </button>
        )}
      </div>

      {enrolledBanner && (
        <div className="flex items-center justify-between rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs font-semibold text-emerald-900">
          <span className="flex items-center gap-2"><CheckCircle2 size={15} /> {enrolledBanner}</span>
          <button onClick={() => setEnrolledBanner(null)}><X size={14} /></button>
        </div>
      )}

      <div className="flex items-center justify-between border-b border-stone-200 pb-3">
        <h3 className="font-display text-base font-bold text-stone-900">Training Catalog ({filtered.length})</h3>
        <select value={filterType} onChange={e => setFilterType(e.target.value)} className="field min-h-8 w-48 text-xs font-semibold">
          <option value="all">All Courses</option>
          <option value="mandatory">Mandatory Statutory</option>
          <option value="elective">Elective Skills</option>
        </select>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {filtered.map((c) => {
          const enrolled = c.enrolledCount || 0;
          const completed = c.completedCount || 0;
          const pct = enrolled ? Math.round((completed / enrolled) * 100) : 0;
          return (
            <div key={c.id} className="surface p-5 flex flex-col justify-between">
              <div>
                <div className="flex justify-between gap-2">
                  <span className="rounded bg-stone-100 px-2 py-0.5 text-[10px] font-bold uppercase text-stone-600">{c.category}</span>
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${c.status === 'mandatory' ? 'bg-red-100 text-red-800' : 'bg-stone-100 text-stone-700'}`}>{String(c.status).toUpperCase()}</span>
                </div>
                <h3 className="mt-3 font-display text-base font-bold text-stone-900">{c.title}</h3>
                <p className="mt-1 text-xs text-stone-500">Provider: {c.provider}</p>
              </div>
              <div className="mt-5 border-t border-stone-100 pt-3">
                <div className="flex justify-between text-xs">
                  <span className="text-stone-500">{c.durationHours} Hours · {enrolled} Enrolled</span>
                  <span className="font-bold text-emerald-800">{pct}% Completed</span>
                </div>
                <div className="mt-2 h-2 w-full rounded-full bg-stone-100 overflow-hidden"><div className="h-full rounded-full bg-emerald-600" style={{ width: `${pct}%` }} /></div>
                <div className="mt-3 flex justify-end">
                  <button onClick={() => handleEnroll(c)} className="btn btn-secondary min-h-8 px-3 text-xs">
                    Enroll Team <ArrowRight size={13} />
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-950/40 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-stone-100 pb-3">
              <h3 className="font-display text-base font-bold">Add Certification Module</h3>
              <button onClick={() => setShowAddModal(false)}><X size={18} /></button>
            </div>
            <form onSubmit={handleCreateCourse} className="mt-4 space-y-3 text-xs">
              <div><label className="label">Course Title</label><input required value={newTitle} onChange={e => setNewTitle(e.target.value)} className="field" /></div>
              <div><label className="label">Accredited Provider</label><input required value={newProvider} onChange={e => setNewProvider(e.target.value)} className="field" /></div>
              <div className="flex justify-end gap-2"><button type="button" onClick={() => setShowAddModal(false)} className="btn btn-secondary text-xs">Cancel</button><button type="submit" className="btn btn-primary text-xs">Save Course</button></div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
