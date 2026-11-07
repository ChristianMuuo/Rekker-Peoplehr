import React, { useState } from 'react';
import {
  UserCheck, CheckCircle2, Clock, AlertCircle, ArrowRight,
  ShieldCheck, FileCheck, Laptop, Send, Plus
} from 'lucide-react';
import { peopleOsStore } from '../data/mockStore';

export interface OnboardingTask {
  id: string;
  title: string;
  assignee: string;
  category: 'Compliance' | 'IT & Assets' | 'HR & Benefits' | 'Training';
  completed: boolean;
  dueDate: string;
}

const INITIAL_TASKS: OnboardingTask[] = [
  { id: 'task-01', title: 'Collect & Verify KRA PIN, NSSF & SHA Numbers', assignee: 'Faith Chebet', category: 'Compliance', completed: true, dueDate: '2026-01-20' },
  { id: 'task-02', title: 'Sign Permanent Employment Agreement & NDA', assignee: 'Faith Chebet', category: 'Compliance', completed: true, dueDate: '2026-01-22' },
  { id: 'task-03', title: 'Provision Corporate Laptop, Email & ERP Access', assignee: 'Faith Chebet', category: 'IT & Assets', completed: true, dueDate: '2026-01-25' },
  { id: 'task-04', title: 'Complete OSHA Plant Safety & GMP Refresher', assignee: 'Faith Chebet', category: 'Training', completed: true, dueDate: '2026-02-15' },
  { id: 'task-05', title: 'Conduct 60-Day Performance & Cultural Check-in', assignee: 'Faith Chebet', category: 'HR & Benefits', completed: true, dueDate: '2026-03-05' },
  { id: 'task-06', title: 'Final 90-Day Probation Assessment & Confirmation', assignee: 'Faith Chebet', category: 'HR & Benefits', completed: false, dueDate: '2026-04-15' },
];

export function OnboardingPage() {
  const [tasks, setTasks] = useState<OnboardingTask[]>(INITIAL_TASKS);

  const toggleTask = (taskId: string) => {
    setTasks(tasks.map(t => t.id === taskId ? { ...t, completed: !t.completed } : t));
  };

  const completedCount = tasks.filter(t => t.completed).length;
  const progressPct = Math.round((completedCount / tasks.length) * 100);

  return (
    <div className="space-y-6">
      {/* Top Heading */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="mb-2 text-[10px] font-bold uppercase tracking-[.17em] text-[#bd2725]">Talent Operations / Lifecycle</p>
          <h1 className="font-display text-3xl font-semibold tracking-[-.035em] text-stone-900 md:text-[34px]">
            Employee Onboarding & Probation
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-stone-500">
            Guide new hires from offer acceptance to 90-day confirmation with automated checklists and milestone tracking.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => alert('Automated 90-day probation review invite sent to Manager.')}
            className="btn btn-primary flex items-center gap-2 text-xs font-semibold"
          >
            <Send size={15} /> Trigger Review Milestone
          </button>
        </div>
      </div>

      {/* Active Onboarding Candidate Highlight */}
      <div className="rounded-2xl border border-stone-200 bg-white p-6 shadow-xs">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between border-b border-stone-100 pb-5">
          <div className="flex items-center gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-red-700 font-display text-lg font-bold text-white shadow-xs">
              FC
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-display text-lg font-bold text-stone-900">Faith Chebet</h3>
                <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-[10px] font-bold text-amber-800">
                  90-Day Probation (Day 51)
                </span>
              </div>
              <p className="text-xs text-stone-500">
                Talent Acquisition & Employee Experience Officer · People Operations & Culture · Joined Jan 15, 2026
              </p>
            </div>
          </div>

          <div className="text-right">
            <p className="text-[11px] font-bold uppercase tracking-wider text-stone-400">Onboarding Completion</p>
            <p className="font-display text-2xl font-bold text-emerald-800">{progressPct}%</p>
            <p className="text-[10px] text-stone-500">{completedCount} of {tasks.length} tasks resolved</p>
          </div>
        </div>

        {/* Progress Bar */}
        <div className="mt-4">
          <div className="h-2 w-full rounded-full bg-stone-100 overflow-hidden">
            <div className="h-full rounded-full bg-emerald-600 transition-all duration-300" style={{ width: `${progressPct}%` }} />
          </div>
        </div>

        {/* 30-60-90 Day Timeline */}
        <div className="mt-6 grid gap-3 sm:grid-cols-3">
          <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-3.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-emerald-900">Day 1 – 30: Foundations</span>
              <CheckCircle2 size={16} className="text-emerald-700" />
            </div>
            <p className="mt-1 text-[11px] text-emerald-800">Statutory KRA/NSSF enrollment, asset issuance, team introductions.</p>
          </div>

          <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-3.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-emerald-900">Day 31 – 60: Alignment</span>
              <CheckCircle2 size={16} className="text-emerald-700" />
            </div>
            <p className="mt-1 text-[11px] text-emerald-800">Full ownership of job postings, 60-day check-in with David Kibet.</p>
          </div>

          <div className="rounded-xl border border-amber-200 bg-amber-50/50 p-3.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-amber-900">Day 61 – 90: Confirmation</span>
              <Clock size={16} className="text-amber-700" />
            </div>
            <p className="mt-1 text-[11px] text-amber-800">Final manager performance signoff and confirmation letter (Due April 15).</p>
          </div>
        </div>
      </div>

      {/* Task Checklist */}
      <div className="rounded-2xl border border-stone-200 bg-white p-6 shadow-xs">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="font-display text-sm font-bold text-stone-900">Onboarding Action Items & Checklists</h3>
          <span className="text-xs text-stone-400">Click checkmark to toggle task status</span>
        </div>

        <div className="divide-y divide-stone-100">
          {tasks.map((task) => (
            <div
              key={task.id}
              onClick={() => toggleTask(task.id)}
              className="flex items-center justify-between py-3.5 cursor-pointer hover:bg-stone-50/50 px-2 rounded-lg transition"
            >
              <div className="flex items-center gap-3">
                <div
                  className={`flex h-5 w-5 items-center justify-center rounded-md border transition ${
                    task.completed
                      ? 'border-emerald-600 bg-emerald-600 text-white'
                      : 'border-stone-300 bg-white hover:border-stone-500'
                  }`}
                >
                  {task.completed && <CheckCircle2 size={14} />}
                </div>
                <div>
                  <p className={`text-xs font-semibold ${task.completed ? 'line-through text-stone-400' : 'text-stone-900'}`}>
                    {task.title}
                  </p>
                  <span className="text-[10px] text-stone-500">{task.category} · Due {task.dueDate}</span>
                </div>
              </div>

              <span
                className={`rounded-full px-2 py-0.5 text-[9px] font-bold ${
                  task.completed ? 'bg-emerald-100 text-emerald-800' : 'bg-stone-100 text-stone-600'
                }`}
              >
                {task.completed ? 'RESOLVED' : 'PENDING'}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
