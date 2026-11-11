import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Plus, Sparkles, Filter, ChevronRight, X, Calendar, Award, ShieldCheck
} from 'lucide-react';
import { apiGet, apiPatch, apiPost } from '../lib/api';

const STAGES = ['applied', 'screening', 'interview', 'offer', 'hired'] as const;
const STAGE_LABELS: Record<string, string> = {
  applied: 'Applied',
  screening: 'Screening',
  interview: 'Technical Interview',
  offer: 'Offer Extended',
  hired: 'Hired',
  rejected: 'Archived',
};

export function RecruitmentPage() {
  const qc = useQueryClient();
  const [selectedReq, setSelectedReq] = useState<string>('all');
  const [activeTab, setActiveTab] = useState<'pipeline' | 'interviews' | 'ml_ranking'>('pipeline');
  const [showNewReqModal, setShowNewReqModal] = useState(false);
  const [showInterviewModal, setShowInterviewModal] = useState(false);
  const [showAiJdModal, setShowAiJdModal] = useState(false);
  const [aiPromptTitle, setAiPromptTitle] = useState('Lead Formulation & Filling Line Engineer');
  const [generatedJd, setGeneratedJd] = useState<string | null>(null);

  // New req form
  const [newTitle, setNewTitle] = useState('');
  const [newMinSalary, setNewMinSalary] = useState(150000);
  const [newMaxSalary, setNewMaxSalary] = useState(210000);
  const [newOpenings, setNewOpenings] = useState(1);
  const [newDesc, setNewDesc] = useState('');

  // Schedule interview form
  const [intCandidateId, setIntCandidateId] = useState('cand_01');
  const [intInterviewer, setIntInterviewer] = useState('Achieng Odhiambo');
  const [intDate, setIntDate] = useState('2026-03-18T10:00');
  const [intMode, setIntMode] = useState<'onsite' | 'virtual'>('onsite');

  const reqsQuery = useQuery({
    queryKey: ['recruitment-requisitions'],
    queryFn: () => apiGet('/api/recruitment/requisitions'),
  });
  const candsQuery = useQuery({
    queryKey: ['recruitment-candidates'],
    queryFn: () => apiGet('/api/recruitment/candidates'),
  });
  const interviewsQuery = useQuery({
    queryKey: ['recruitment-interviews'],
    queryFn: () => apiGet('/api/recruitment/interviews'),
  });
  const mlMatchQuery = useQuery({
    queryKey: ['recruitment-ml-match', selectedReq],
    queryFn: () => apiPost('/api/recruitment/match', { requisitionId: selectedReq === 'all' ? undefined : selectedReq }),
    enabled: activeTab === 'ml_ranking',
  });

  const requisitions: any[] = reqsQuery.data?.items ?? [];
  const candidates: any[] = candsQuery.data?.items ?? [];
  const interviews: any[] = interviewsQuery.data?.items ?? [];
  const filteredCandidates = selectedReq === 'all' ? candidates : candidates.filter(c => c.requisitionId === selectedReq);

  const handleAdvanceStage = async (candId: string, currentStage: string) => {
    const map: Record<string, string> = { applied: 'screening', screening: 'interview', interview: 'offer', offer: 'hired' };
    const next = map[currentStage];
    if (!next) return;
    await apiPatch(`/api/recruitment/candidates/${candId}/stage`, { stage: next });
    qc.invalidateQueries({ queryKey: ['recruitment-candidates'] });
  };

  const handleCreateRequisition = async (e: React.FormEvent) => {
    e.preventDefault();
    await apiPost('/api/recruitment/requisitions', {
      title: newTitle,
      minSalary: Number(newMinSalary),
      maxSalary: Number(newMaxSalary),
      openings: Number(newOpenings),
      description: newDesc,
    });
    setNewTitle('');
    setNewDesc('');
    setShowNewReqModal(false);
    qc.invalidateQueries({ queryKey: ['recruitment-requisitions'] });
  };

  const handleScheduleInterview = async (e: React.FormEvent) => {
    e.preventDefault();
    await apiPost('/api/recruitment/interviews', {
      candidateId: intCandidateId,
      interviewerName: intInterviewer,
      scheduledAt: new Date(intDate).toISOString(),
      mode: intMode,
    });
    setShowInterviewModal(false);
    qc.invalidateQueries({ queryKey: ['recruitment-interviews'] });
  };

  const handleAiJd = async () => {
    try {
      const res = await apiPost('/api/ai/chat', {
        agentRole: 'recruitment',
        query: `Draft a comprehensive Job Description for ${aiPromptTitle}`,
      });
      setGeneratedJd(res.response || '');
    } catch {
      setGeneratedJd(`JOB TITLE: ${aiPromptTitle}\nLOCATION: Nairobi Industrial Plant\nREQUIREMENTS: Job-related skills, KEBS/ISO compliance, technical leadership.`);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="mb-2 text-[10px] font-bold uppercase tracking-[.17em] text-[#bd2725]">Talent Acquisition / ATS</p>
          <h1 className="font-display text-3xl font-semibold tracking-[-.035em] text-stone-900">
            Recruitment & Interviews
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-stone-500">
            Requisitions, Kanban applicant tracking, structured interview scorecards, and explainable job-criteria candidate matching.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => { setShowAiJdModal(true); setGeneratedJd(null); }} className="btn btn-secondary text-xs">
            <Sparkles size={14} className="text-red-700" /> AI JD Drafter
          </button>
          <button onClick={() => setShowInterviewModal(true)} className="btn btn-secondary text-xs">
            <Calendar size={14} /> Schedule Interview
          </button>
          <button onClick={() => setShowNewReqModal(true)} className="btn btn-primary text-xs">
            <Plus size={14} /> Post Job Opening
          </button>
        </div>
      </div>

      {/* Requisitions Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {requisitions.map((req) => (
          <div
            key={req.id}
            onClick={() => setSelectedReq(selectedReq === req.id ? 'all' : req.id)}
            className={`surface cursor-pointer p-5 transition-all ${selectedReq === req.id ? 'border-red-700 ring-1 ring-red-700' : 'hover:border-stone-300'}`}
          >
            <div className="flex items-start justify-between gap-2">
              <span className="rounded bg-stone-100 px-2 py-0.5 text-[10px] font-bold uppercase text-stone-600">{req.location}</span>
              <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800">{req.status}</span>
            </div>
            <h3 className="mt-3 font-display text-base font-bold text-stone-900 line-clamp-1">{req.title}</h3>
            <p className="mt-1 text-xs text-stone-500 line-clamp-2">{req.description}</p>
            <div className="mt-4 flex justify-between border-t border-stone-100 pt-3 text-xs text-stone-600">
              <span>KES {((req.minSalary || 0) / 1000).toFixed(0)}k – {((req.maxSalary || 0) / 1000).toFixed(0)}k</span>
              <span className="font-semibold text-red-700">{req.applicantsCount || 0} Applicants</span>
            </div>
          </div>
        ))}
      </div>

      {/* Sub-navigation Tabs */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-stone-200 bg-white p-3">
        <div className="flex gap-2">
          <button onClick={() => setActiveTab('pipeline')} className={`btn min-h-8 px-3 text-xs ${activeTab === 'pipeline' ? 'btn-primary' : 'btn-secondary'}`}>Kanban Pipeline</button>
          <button onClick={() => setActiveTab('interviews')} className={`btn min-h-8 px-3 text-xs ${activeTab === 'interviews' ? 'btn-primary' : 'btn-secondary'}`}>Interviews & Scorecards ({interviews.length})</button>
          <button onClick={() => setActiveTab('ml_ranking')} className={`btn min-h-8 px-3 text-xs ${activeTab === 'ml_ranking' ? 'btn-primary' : 'btn-secondary'}`}>Explainable ML Ranking</button>
        </div>
        <select value={selectedReq} onChange={e => setSelectedReq(e.target.value)} className="field min-h-8 w-64 text-xs font-semibold">
          <option value="all">All Requisitions ({candidates.length})</option>
          {requisitions.map(r => <option key={r.id} value={r.id}>{r.title}</option>)}
        </select>
      </div>

      {activeTab === 'pipeline' && (
        <div className="grid gap-4 md:grid-cols-5">
          {STAGES.map((stage) => {
            const stageCands = filteredCandidates.filter(c => c.stage === stage);
            return (
              <div key={stage} className="rounded-2xl border border-stone-200 bg-stone-50/70 p-3">
                <div className="mb-3 flex items-center justify-between border-b border-stone-200 pb-2">
                  <span className="text-xs font-bold text-stone-800">{STAGE_LABELS[stage]}</span>
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-stone-200 text-[10px] font-bold">{stageCands.length}</span>
                </div>
                <div className="space-y-3">
                  {stageCands.map((cand) => (
                    <div key={cand.id} className="rounded-xl border border-stone-200 bg-white p-3.5 shadow-xs">
                      <div className="flex justify-between gap-1">
                        <h4 className="font-display text-xs font-bold text-stone-900">{cand.fullName}</h4>
                        <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-[9px] font-bold text-emerald-700">{cand.matchScore}%</span>
                      </div>
                      <p className="mt-1 text-[11px] text-stone-500 line-clamp-1">{cand.jobTitle}</p>
                      <p className="mt-2 text-[10px] text-stone-600 line-clamp-2">{cand.skillsSummary}</p>
                      <div className="mt-3 flex items-center justify-between border-t border-stone-100 pt-2">
                        <span className="text-[10px] text-stone-400">{cand.experienceYears}y exp</span>
                        {stage !== 'hired' && (
                          <button onClick={() => handleAdvanceStage(cand.id, stage)} className="flex items-center gap-1 text-[10px] font-bold text-red-700 hover:text-red-900">
                            Advance <ChevronRight size={12} />
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                  {!stageCands.length && <div className="rounded-xl border border-dashed border-stone-200 p-4 text-center text-[11px] text-stone-400">Empty</div>}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {activeTab === 'interviews' && (
        <div className="surface divide-y divide-stone-100 p-4">
          {interviews.map((i) => (
            <div key={i.id} className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <h4 className="font-display text-sm font-bold text-stone-900">{i.candidateName}</h4>
                  <span className="rounded-full bg-stone-100 px-2 py-0.5 text-[10px] font-bold uppercase">{i.status}</span>
                  {i.overallRating && <span className="rounded bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800">{i.overallRating} / 5.0</span>}
                </div>
                <p className="mt-1 text-xs text-stone-500">{i.jobTitle} · Lead Panelist: {i.interviewerName} · {i.mode}</p>
                {i.feedbackSummary && <p className="mt-1.5 text-xs text-stone-700">{i.feedbackSummary}</p>}
              </div>
              <span className="font-mono text-xs text-stone-500">{String(i.scheduledAt).slice(0, 16).replace('T', ' ')}</span>
            </div>
          ))}
        </div>
      )}

      {activeTab === 'ml_ranking' && (
        <div className="surface p-5 space-y-4">
          <div className="flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50/70 p-3 text-xs text-emerald-900">
            <ShieldCheck size={17} className="mt-0.5 shrink-0 text-emerald-700" />
            <div>
              <p className="font-bold">Explainable Fairness Guardrail Active</p>
              <p>Python TF-IDF semantic cosine similarity + experience matching scores job criteria only. Protected attributes are excluded and candidates are never auto-rejected.</p>
            </div>
          </div>
          {mlMatchQuery.isLoading ? (
            <div className="skeleton h-32" />
          ) : (
            <div className="space-y-3">
              {(mlMatchQuery.data?.rankings ?? []).map((r: any) => (
                <div key={r.candidateId} className="rounded-xl border border-stone-200 p-4 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="font-display text-sm font-bold text-stone-900">{r.fullName}</span>
                    <span className="rounded-full bg-red-50 px-2.5 py-1 font-bold text-red-700">{r.overallMatchPct}% Job Match</span>
                  </div>
                  <p className="mt-1 text-stone-600">Skills Similarity: {r.semanticSkillsScorePct}% · Experience Fit: {r.experienceAlignmentPct}%</p>
                  <p className="mt-1 text-[11px] text-stone-500">Matched Job Terms: <span className="font-mono">{(r.matchedJobCriteria || []).join(', ') || 'experience'}</span></p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* New Req Modal */}
      {showNewReqModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-950/40 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-stone-100 pb-3">
              <h3 className="font-display text-base font-bold">Post Job Requisition</h3>
              <button onClick={() => setShowNewReqModal(false)}><X size={18} /></button>
            </div>
            <form onSubmit={handleCreateRequisition} className="mt-4 space-y-3 text-xs">
              <div><label className="label">Job Title</label><input required value={newTitle} onChange={e => setNewTitle(e.target.value)} className="field" /></div>
              <div className="grid grid-cols-3 gap-2">
                <div><label className="label">Min KES</label><input type="number" value={newMinSalary} onChange={e => setNewMinSalary(Number(e.target.value))} className="field" /></div>
                <div><label className="label">Max KES</label><input type="number" value={newMaxSalary} onChange={e => setNewMaxSalary(Number(e.target.value))} className="field" /></div>
                <div><label className="label">Openings</label><input type="number" min="1" value={newOpenings} onChange={e => setNewOpenings(Number(e.target.value))} className="field" /></div>
              </div>
              <div><label className="label">Job Requirements</label><textarea value={newDesc} onChange={e => setNewDesc(e.target.value)} className="field min-h-24" /></div>
              <div className="flex justify-end gap-2"><button type="button" onClick={() => setShowNewReqModal(false)} className="btn btn-secondary text-xs">Cancel</button><button type="submit" className="btn btn-primary text-xs">Publish</button></div>
            </form>
          </div>
        </div>
      )}

      {/* Interview Modal */}
      {showInterviewModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-950/40 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-stone-100 pb-3">
              <h3 className="font-display text-base font-bold">Schedule Candidate Interview</h3>
              <button onClick={() => setShowInterviewModal(false)}><X size={18} /></button>
            </div>
            <form onSubmit={handleScheduleInterview} className="mt-4 space-y-3 text-xs">
              <div><label className="label">Candidate</label><select value={intCandidateId} onChange={e => setIntCandidateId(e.target.value)} className="field">{candidates.map(c => <option key={c.id} value={c.id}>{c.fullName}</option>)}</select></div>
              <div><label className="label">Panelist Name</label><input required value={intInterviewer} onChange={e => setIntInterviewer(e.target.value)} className="field" /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="label">Date & Time</label><input type="datetime-local" value={intDate} onChange={e => setIntDate(e.target.value)} className="field" /></div>
                <div><label className="label">Mode</label><select value={intMode} onChange={e => setIntMode(e.target.value as any)} className="field"><option value="onsite">Onsite (Nairobi)</option><option value="virtual">Virtual Video</option></select></div>
              </div>
              <div className="flex justify-end gap-2"><button type="button" onClick={() => setShowInterviewModal(false)} className="btn btn-secondary text-xs">Cancel</button><button type="submit" className="btn btn-primary text-xs">Schedule</button></div>
            </form>
          </div>
        </div>
      )}

      {/* AI JD Modal */}
      {showAiJdModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-950/40 p-4 backdrop-blur-xs">
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-stone-100 pb-3">
              <h3 className="font-display text-base font-bold">AI Recruitment JD Assistant</h3>
              <button onClick={() => setShowAiJdModal(false)}><X size={18} /></button>
            </div>
            <div className="mt-4 space-y-3 text-xs">
              <div className="flex gap-2">
                <input value={aiPromptTitle} onChange={e => setAiPromptTitle(e.target.value)} className="field flex-1" />
                <button onClick={handleAiJd} className="btn btn-primary text-xs"><Sparkles size={14} /> Generate</button>
              </div>
              {generatedJd && <pre className="max-h-64 overflow-y-auto whitespace-pre-wrap rounded-xl border border-stone-200 bg-stone-50 p-4 font-sans text-xs">{generatedJd}</pre>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
