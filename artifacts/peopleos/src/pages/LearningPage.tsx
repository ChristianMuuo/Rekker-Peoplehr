import React, { useState } from 'react';
import {
  FileText, BookOpen, Award, CheckCircle2, Clock, Users,
  Filter, Search, ArrowRight, ExternalLink
} from 'lucide-react';
import { peopleOsStore, type TrainingCourse } from '../data/mockStore';

export function LearningPage() {
  const [courses, setCourses] = useState<TrainingCourse[]>(peopleOsStore.getCourses());
  const [filterType, setFilterType] = useState<string>('all');

  const filtered = filterType === 'all'
    ? courses
    : courses.filter((c) => c.status === filterType);

  const handleEnroll = (courseId: string) => {
    alert('Successfully enrolled team members in the certification course.');
  };

  return (
    <div className="space-y-6">
      {/* Top Heading */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="mb-2 text-[10px] font-bold uppercase tracking-[.17em] text-[#bd2725]">People Growth / Academy</p>
          <h1 className="font-display text-3xl font-semibold tracking-[-.035em] text-stone-900 md:text-[34px]">
            Learning & Certifications
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-stone-500">
            Mandatory statutory compliance courses, brewery manufacturing certifications, and workforce skills training.
          </p>
        </div>
      </div>

      {/* Overview Stat Cards */}
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border border-stone-200 bg-white p-5 shadow-xs">
          <p className="text-[11px] font-bold uppercase tracking-wider text-stone-400">Total Courses</p>
          <p className="mt-2 font-display text-2xl font-bold text-stone-900">{courses.length} Modules</p>
          <p className="mt-1 text-[11px] text-stone-500">3 Mandatory Compliance · 1 Elective</p>
        </div>

        <div className="rounded-2xl border border-stone-200 bg-white p-5 shadow-xs">
          <p className="text-[11px] font-bold uppercase tracking-wider text-stone-400">Certifications Awarded</p>
          <p className="mt-2 font-display text-2xl font-bold text-emerald-800">52 Verified</p>
          <p className="mt-1 text-[11px] text-stone-500">KEBS, DOSHS & ODPC Accredited</p>
        </div>

        <div className="rounded-2xl border border-stone-200 bg-white p-5 shadow-xs">
          <p className="text-[11px] font-bold uppercase tracking-wider text-stone-400">Workforce Completion Rate</p>
          <p className="mt-2 font-display text-2xl font-bold text-red-700">92.4%</p>
          <p className="mt-1 text-[11px] text-stone-500">Compliant with OSHA & Food Safety audit</p>
        </div>
      </div>

      {/* Courses List */}
      <div className="space-y-4">
        <div className="flex items-center justify-between border-b border-stone-200 pb-3">
          <h3 className="font-display text-base font-bold text-stone-900">Training Catalog & Certifications</h3>
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-stone-500">Filter:</span>
            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value)}
              className="rounded-lg border border-stone-200 bg-white px-2.5 py-1 text-xs text-stone-700"
            >
              <option value="all">All Courses</option>
              <option value="mandatory">Mandatory Statutory</option>
              <option value="elective">Elective Skills</option>
            </select>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          {filtered.map((c) => {
            const completionPct = Math.round((c.completedCount / c.enrolledCount) * 100);
            return (
              <div key={c.id} className="rounded-2xl border border-stone-200 bg-white p-5 shadow-xs flex flex-col justify-between">
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <span className="rounded-md bg-stone-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-stone-600">
                      {c.category}
                    </span>
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                        c.status === 'mandatory' ? 'bg-red-100 text-red-800' : 'bg-stone-100 text-stone-700'
                      }`}
                    >
                      {c.status.toUpperCase()}
                    </span>
                  </div>

                  <h3 className="mt-3 font-display text-base font-bold text-stone-900">{c.title}</h3>
                  <p className="mt-1 text-xs text-stone-500">Provider: {c.provider}</p>
                </div>

                <div className="mt-5 border-t border-stone-100 pt-3">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-stone-500">{c.durationHours} Hours · {c.enrolledCount} Enrolled</span>
                    <span className="font-bold text-emerald-800">{completionPct}% Completed</span>
                  </div>

                  <div className="mt-2 h-2 w-full rounded-full bg-stone-100 overflow-hidden">
                    <div className="h-full rounded-full bg-emerald-600" style={{ width: `${completionPct}%` }} />
                  </div>

                  <div className="mt-3 flex items-center justify-end">
                    <button
                      onClick={() => handleEnroll(c.id)}
                      className="btn btn-secondary flex items-center gap-1.5 text-xs font-semibold"
                    >
                      Enroll Team <ArrowRight size={13} />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
