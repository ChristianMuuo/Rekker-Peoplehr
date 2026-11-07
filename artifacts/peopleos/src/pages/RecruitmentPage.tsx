import React, { useState } from 'react';
import {
  BriefcaseBusiness, Plus, Search, Filter, Sparkles, CheckCircle2,
  Clock, UserCheck, AlertCircle, ArrowRight, ExternalLink, ChevronRight, X
} from 'lucide-react';
import { peopleOsStore, type JobRequisition, type Candidate } from '../data/mockStore';

export function RecruitmentPage() {
  const [requisitions, setRequisitions] = useState<JobRequisition[]>(peopleOsStore.getRequisitions());
  const [candidates, setCandidates] = useState<Candidate[]>(peopleOsStore.getCandidates());
  const [selectedReq, setSelectedReq] = useState<string>('all');
  const [showNewReqModal, setShowNewReqModal] = useState(false);
  const [showAiJdModal, setShowAiJdModal] = useState(false);
  const [aiPromptTitle, setAiPromptTitle] = useState('Senior Industrial Brewing & Quality Engineer');
  const [generatedJd, setGeneratedJd] = useState<string | null>(null);

  // New Requisition Form state
  const [newTitle, setNewTitle] = useState('');
  const [newDept, setNewDept] = useState('dept_mfg_01');
  const [newMinSalary, setNewMinSalary] = useState(150000);
  const [newMaxSalary, setNewMaxSalary] = useState(200000);
  const [newOpenings, setNewOpenings] = useState(1);
  const [newDesc, setNewDesc] = useState('');

  const filteredCandidates = selectedReq === 'all'
    ? candidates
    : candidates.filter(c => c.requisitionId === selectedReq);

  const stages: Candidate['stage'][] = ['applied', 'screening', 'interview', 'offer', 'hired'];

  const stageLabels: Record<Candidate['stage'], string> = {
    applied: 'Applied',
    screening: 'Screening',
    interview: 'Technical Interview',
    offer: 'Offer Extended',
    hired: 'Hired',
    rejected: 'Archived',
  };

  const handleAdvanceStage = (candId: string, currentStage: Candidate['stage']) => {
    const nextStageMap: Partial<Record<Candidate['stage'], Candidate['stage']>> = {
      applied: 'screening',
      screening: 'interview',
      interview: 'offer',
      offer: 'hired',
    };
    const next = nextStageMap[currentStage];
    if (next) {
      peopleOsStore.updateCandidateStage(candId, next);
      setCandidates(peopleOsStore.getCandidates());
    }
  };

  const handleCreateRequisition = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) return;

    peopleOsStore.addRequisition({
      title: newTitle.trim(),
      departmentId: newDept,
      location: 'Nairobi Industrial Hub',
      employmentType: 'Full-time Permanent',
      status: 'published',
      minSalary: Number(newMinSalary),
      maxSalary: Number(newMaxSalary),
      openings: Number(newOpenings),
      description: newDesc || 'Lead strategic operations in alignment with Rekker corporate goals.',
      requirements: ['Bachelor degree in relevant field', '3+ years FMCG/Brewery experience', 'Strong team leadership'],
    });

    setRequisitions(peopleOsStore.getRequisitions());
    setShowNewReqModal(false);
    setNewTitle('');
    setNewDesc('');
  };

  const handleGenerateAiJd = () => {
    const jd = `JOB TITLE: ${aiPromptTitle.toUpperCase()}
COMPANY: Rekker Breweries Kenya Ltd
LOCATION: Nairobi Industrial Area Plant
EMPLOYMENT TYPE: Full-time Permanent
COMPENSATION: KES 180,000 – KES 250,000 Gross + Medical & Pension

ROLE OVERVIEW:
Rekker Breweries is seeking a dynamic ${aiPromptTitle} to drive automated plant operations, fermentation precision, and continuous product quality across our high-capacity beverage production lines.

KEY RESPONSIBILITIES:
• Oversee day-to-day brewing cycles, wort cooling, yeast vitality metrics, and cellaring.
• Maintain adherence to KEBS KS EAS 104 and ISO 22000 Food Safety Management Standards.
• Minimize batch volume variances and lead preventative maintenance routines on high-speed bottling lines.
• Lead and mentor shift technicians while maintaining strict OSHA compliance.

QUALIFICATIONS & SKILLS:
• Bachelor's Degree in Chemical Engineering, Brewing Science, Food Technology or equivalent.
• 4+ years practical experience in high-volume commercial brewing or beverage manufacturing.
• Proven proficiency with SCADA systems and programmable logic controllers (PLC).`;

    setGeneratedJd(jd);
  };

  return (
    <div className="space-y-6">
      {/* Top Heading */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="mb-2 text-[10px] font-bold uppercase tracking-[.17em] text-[#bd2725]">Talent Acquisition / ATS</p>
          <h1 className="font-display text-3xl font-semibold tracking-[-.035em] text-stone-900 md:text-[34px]">
            Recruitment & Pipeline
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-stone-500">
            Manage open requisitions, review candidate match scores, and guide applicants through the hiring pipeline.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => { setShowAiJdModal(true); setGeneratedJd(null); }}
            className="btn btn-secondary flex items-center gap-2 text-xs font-semibold"
          >
            <Sparkles size={15} className="text-red-700" /> AI Job Drafter
          </button>
          <button
            onClick={() => setShowNewReqModal(true)}
            className="btn btn-primary flex items-center gap-2 text-xs font-semibold"
          >
            <Plus size={15} /> Post Job Opening
          </button>
        </div>
      </div>

      {/* Requisitions Overview Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {requisitions.map((req) => (
          <div
            key={req.id}
            onClick={() => setSelectedReq(selectedReq === req.id ? 'all' : req.id)}
            className={`cursor-pointer rounded-2xl border p-5 transition-all ${
              selectedReq === req.id
                ? 'border-red-700 bg-red-50/40 shadow-sm'
                : 'border-stone-200 bg-white hover:border-stone-300'
            }`}
          >
            <div className="flex items-start justify-between gap-2">
              <span className="rounded-md bg-stone-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-stone-600">
                {req.location}
              </span>
              <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800">
                {req.status}
              </span>
            </div>
            <h3 className="mt-3 font-display text-base font-bold text-stone-900 line-clamp-1">{req.title}</h3>
            <p className="mt-1 text-xs text-stone-500 line-clamp-2">{req.description}</p>
            <div className="mt-4 flex items-center justify-between border-t border-stone-100 pt-3 text-xs text-stone-600">
              <span>KES {(req.minSalary / 1000).toFixed(0)}k – {(req.maxSalary / 1000).toFixed(0)}k</span>
              <span className="font-semibold text-red-700">{req.applicantsCount} Applicants</span>
            </div>
          </div>
        ))}
      </div>

      {/* Filter Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-stone-200 bg-white p-4">
        <div className="flex items-center gap-2">
          <Filter size={16} className="text-stone-400" />
          <span className="text-xs font-bold text-stone-700">Filter By Job:</span>
          <select
            value={selectedReq}
            onChange={(e) => setSelectedReq(e.target.value)}
            className="rounded-lg border border-stone-200 bg-stone-50 px-3 py-1.5 text-xs font-semibold text-stone-700"
          >
            <option value="all">All Requisitions ({candidates.length} candidates)</option>
            {requisitions.map((r) => (
              <option key={r.id} value={r.id}>{r.title}</option>
            ))}
          </select>
        </div>
        <span className="text-xs text-stone-400">
          Showing {filteredCandidates.length} candidate applications
        </span>
      </div>

      {/* Kanban Stages Board */}
      <div className="grid gap-4 md:grid-cols-5">
        {stages.map((stage) => {
          const stageCands = filteredCandidates.filter((c) => c.stage === stage);
          return (
            <div key={stage} className="rounded-2xl border border-stone-200 bg-stone-50/70 p-3">
              <div className="mb-3 flex items-center justify-between border-b border-stone-200 pb-2">
                <span className="text-xs font-bold text-stone-800">{stageLabels[stage]}</span>
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-stone-200 text-[10px] font-bold text-stone-700">
                  {stageCands.length}
                </span>
              </div>

              <div className="space-y-3">
                {stageCands.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-stone-200 p-4 text-center text-[11px] text-stone-400">
                    No candidates
                  </div>
                ) : (
                  stageCands.map((cand) => (
                    <div
                      key={cand.id}
                      className="rounded-xl border border-stone-200 bg-white p-3.5 shadow-xs transition hover:shadow-sm"
                    >
                      <div className="flex items-start justify-between gap-1">
                        <h4 className="font-display text-xs font-bold text-stone-900">{cand.fullName}</h4>
                        <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-[9px] font-bold text-emerald-700">
                          {cand.matchScore}% match
                        </span>
                      </div>
                      <p className="mt-1 text-[11px] text-stone-500 line-clamp-1">{cand.jobTitle}</p>
                      <p className="mt-2 text-[10px] text-stone-600 line-clamp-2">{cand.skillsSummary}</p>

                      <div className="mt-3 flex items-center justify-between border-t border-stone-100 pt-2">
                        <span className="text-[10px] text-stone-400">{cand.experienceYears}y exp</span>
                        {stage !== 'hired' && (
                          <button
                            onClick={() => handleAdvanceStage(cand.id, stage)}
                            className="flex items-center gap-1 text-[10px] font-bold text-red-700 hover:text-red-900"
                            title="Advance candidate to next stage"
                          >
                            Advance <ChevronRight size={12} />
                          </button>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Modal: New Job Requisition */}
      {showNewReqModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-950/40 p-4 backdrop-blur-xs">
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-stone-100 pb-3">
              <h3 className="font-display text-lg font-bold text-stone-900">Create New Job Opening</h3>
              <button onClick={() => setShowNewReqModal(false)} className="text-stone-400 hover:text-stone-700"><X size={18} /></button>
            </div>
            <form onSubmit={handleCreateRequisition} className="mt-4 space-y-4">
              <div>
                <label className="text-xs font-bold text-stone-700">Job Title</label>
                <input
                  type="text"
                  required
                  placeholder="e.g., Senior Distribution Fleet Supervisor"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-stone-200 px-3 py-2 text-xs focus:border-red-700 focus:outline-hidden"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-stone-700">Department</label>
                  <select
                    value={newDept}
                    onChange={(e) => setNewDept(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-stone-200 px-3 py-2 text-xs text-stone-700 focus:border-red-700 focus:outline-hidden"
                  >
                    <option value="dept_mfg_01">Manufacturing & Brewing</option>
                    <option value="dept_dist_02">Logistics & Distribution</option>
                    <option value="dept_brand_03">Brand & Commercial</option>
                    <option value="dept_people_04">People Operations</option>
                    <option value="dept_fin_05">Finance & Supply</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs font-bold text-stone-700">Openings</label>
                  <input
                    type="number"
                    min="1"
                    max="20"
                    value={newOpenings}
                    onChange={(e) => setNewOpenings(Number(e.target.value))}
                    className="mt-1 w-full rounded-lg border border-stone-200 px-3 py-2 text-xs focus:border-red-700 focus:outline-hidden"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-stone-700">Min Salary (KES)</label>
                  <input
                    type="number"
                    step="5000"
                    value={newMinSalary}
                    onChange={(e) => setNewMinSalary(Number(e.target.value))}
                    className="mt-1 w-full rounded-lg border border-stone-200 px-3 py-2 text-xs focus:border-red-700 focus:outline-hidden"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-stone-700">Max Salary (KES)</label>
                  <input
                    type="number"
                    step="5000"
                    value={newMaxSalary}
                    onChange={(e) => setNewMaxSalary(Number(e.target.value))}
                    className="mt-1 w-full rounded-lg border border-stone-200 px-3 py-2 text-xs focus:border-red-700 focus:outline-hidden"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-stone-700">Job Description Overview</label>
                <textarea
                  rows={3}
                  placeholder="Outline key operational duties and team responsibilities..."
                  value={newDesc}
                  onChange={(e) => setNewDesc(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-stone-200 px-3 py-2 text-xs focus:border-red-700 focus:outline-hidden"
                />
              </div>

              <div className="flex justify-end gap-2 border-t border-stone-100 pt-3">
                <button
                  type="button"
                  onClick={() => setShowNewReqModal(false)}
                  className="btn btn-secondary text-xs"
                >
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary text-xs font-semibold">
                  Publish Requisition
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: AI Job Description Drafter */}
      {showAiJdModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-950/40 p-4 backdrop-blur-xs">
          <div className="w-full max-w-xl rounded-2xl bg-white p-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-stone-100 pb-3">
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-red-100 text-red-700">
                  <Sparkles size={16} />
                </div>
                <h3 className="font-display text-lg font-bold text-stone-900">AI Job Description Drafter</h3>
              </div>
              <button onClick={() => setShowAiJdModal(false)} className="text-stone-400 hover:text-stone-700"><X size={18} /></button>
            </div>

            <div className="mt-4 space-y-4">
              <div>
                <label className="text-xs font-bold text-stone-700">Target Role Title</label>
                <div className="mt-1 flex gap-2">
                  <input
                    type="text"
                    value={aiPromptTitle}
                    onChange={(e) => setAiPromptTitle(e.target.value)}
                    className="flex-1 rounded-lg border border-stone-200 px-3 py-2 text-xs focus:border-red-700 focus:outline-hidden"
                  />
                  <button
                    onClick={handleGenerateAiJd}
                    className="btn btn-primary flex items-center gap-1.5 text-xs"
                  >
                    <Sparkles size={14} /> Draft JD
                  </button>
                </div>
              </div>

              {generatedJd && (
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-bold text-stone-700">AI Generated Draft</span>
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(generatedJd);
                        alert('Job description copied to clipboard!');
                      }}
                      className="text-[11px] font-semibold text-red-700 hover:underline"
                    >
                      Copy to Clipboard
                    </button>
                  </div>
                  <pre className="max-h-64 overflow-y-auto rounded-xl bg-stone-50 p-4 font-mono text-[11px] leading-relaxed text-stone-700 whitespace-pre-wrap border border-stone-200">
                    {generatedJd}
                  </pre>
                </div>
              )}
            </div>

            <div className="mt-5 flex justify-end gap-2 border-t border-stone-100 pt-3">
              <button
                onClick={() => setShowAiJdModal(false)}
                className="btn btn-secondary text-xs"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
