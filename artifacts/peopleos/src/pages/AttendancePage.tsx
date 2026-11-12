import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Filter, Play, Square, Plus, X, Check } from 'lucide-react';
import { useGetAuthContext } from '@workspace/api-client-react';
import { apiGet, apiPost } from '../lib/api';

export function AttendancePage() {
  const auth = useGetAuthContext();
  const qc = useQueryClient();
  const [filterShift, setFilterShift] = useState('all');
  const [clockedState, setClockedState] = useState<'in' | 'out'>('out');
  const [clockTime, setClockTime] = useState<string | null>(null);
  const [showCorrectionModal, setShowCorrectionModal] = useState(false);

  const [corrDate, setCorrDate] = useState('2026-03-06');
  const [corrIn, setCorrIn] = useState('08:30');
  const [corrOut, setCorrOut] = useState('17:00');
  const [corrReason, setCorrReason] = useState('');
  const [clockError, setClockError] = useState<string | null>(null);

  const meQuery = useQuery({
    queryKey: ['peopleos-me-att', auth.data?.role ?? 'anon'],
    queryFn: () => apiGet<any>('/api/peopleos/me'),
  });
  const recordsQuery = useQuery({
    queryKey: ['attendance-records'],
    queryFn: () => apiGet('/api/attendance'),
  });
  const correctionsQuery = useQuery({
    queryKey: ['attendance-corrections'],
    queryFn: () => apiGet('/api/attendance/corrections'),
  });
  const anomaliesQuery = useQuery({
    queryKey: ['attendance-anomalies'],
    queryFn: () => apiGet('/api/attendance/anomalies'),
  });

  const records: any[] = recordsQuery.data?.items ?? [];
  const corrections: any[] = correctionsQuery.data?.items ?? [];
  const canApprove = Boolean(auth.data?.canApproveLeave);
  const orgTimezone: string = recordsQuery.data?.timezone ?? 'Africa/Nairobi';
  const callerName = meQuery.data?.linked
    ? `${meQuery.data.employee.firstName} ${meQuery.data.employee.lastName}`
    : `${auth.data?.role?.replaceAll('_', ' ') || 'Authenticated User'}`;

  const handleToggleClock = async () => {
    setClockError(null);
    try {
      if (clockedState === 'out') {
        const rec = await apiPost('/api/attendance/clock-in', {});
        setClockedState('in');
        setClockTime(rec.clockIn);
      } else {
        await apiPost('/api/attendance/clock-out', {});
        setClockedState('out');
      }
      qc.invalidateQueries({ queryKey: ['attendance-records'] });
      qc.invalidateQueries({ queryKey: ['attendance-anomalies'] });
    } catch (err) {
      setClockError(err instanceof Error ? err.message : 'Unable to record attendance punch.');
    }
  };

  const handleSubmitCorrection = async (e: React.FormEvent) => {
    e.preventDefault();
    await apiPost('/api/attendance/corrections', {
      date: corrDate,
      requestedClockIn: corrIn,
      requestedClockOut: corrOut,
      reason: corrReason,
    });
    setCorrReason('');
    setShowCorrectionModal(false);
    qc.invalidateQueries({ queryKey: ['attendance-corrections'] });
  };

  const handleCorrectionDecision = async (id: string, decision: 'approve' | 'reject') => {
    await apiPost(`/api/attendance/corrections/${id}/decision`, { decision });
    qc.invalidateQueries({ queryKey: ['attendance-corrections'] });
  };

  const filtered = filterShift === 'all' ? records : records.filter(r => r.shift?.toLowerCase().includes(filterShift.toLowerCase()));

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="mb-2 text-[10px] font-bold uppercase tracking-[.17em] text-[#bd2725]">Workforce Operations / Time</p>
          <h1 className="font-display text-3xl font-semibold tracking-[-.035em] text-stone-900">Attendance & Shifts</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-stone-500">
            Real-time clock-in telemetry, shift scheduling, correction approvals, and ML duplicate/late anomaly detection.
          </p>
        </div>
        <button onClick={() => setShowCorrectionModal(true)} className="btn btn-secondary text-xs">
          <Plus size={15} /> Request Correction
        </button>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <div className="surface p-5 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase text-stone-400">Self-Service Terminal</span>
              <span className={`h-2.5 w-2.5 rounded-full ${clockedState === 'in' ? 'bg-emerald-500 animate-pulse' : 'bg-stone-300'}`} />
            </div>
            <h3 className="mt-2 font-display text-lg font-bold text-stone-900">{callerName}</h3>
            <p className="text-xs text-stone-500">Scheduled: Day Shift (08:30 - 17:00) · TZ: {orgTimezone}</p>
            {clockError && <p className="mt-2 text-xs text-[#a91919]">{clockError}</p>}
          </div>
          <button
            onClick={handleToggleClock}
            className={`mt-5 flex w-full items-center justify-center gap-2 rounded-xl py-3 text-xs font-bold text-white transition ${clockedState === 'out' ? 'bg-red-700 hover:bg-red-800' : 'bg-stone-800 hover:bg-stone-900'}`}
          >
            {clockedState === 'out' ? <><Play size={14} fill="currentColor" /> Clock In for Shift</> : <><Square size={14} fill="currentColor" /> Clock Out</>}
          </button>
          {clockTime && <p className="mt-2 text-center text-[11px] font-semibold text-emerald-700">Clocked in at {clockTime}</p>}
        </div>

        <div className="surface p-5">
          <p className="text-[11px] font-bold uppercase text-stone-400">Shift Roster Coverage</p>
          <div className="mt-3 space-y-2.5 text-xs">
            <div className="flex justify-between border-b border-stone-100 pb-2"><span className="font-semibold">Morning Shift (06:00–14:00)</span><span className="rounded bg-stone-100 px-2 py-0.5 font-bold">2 active</span></div>
            <div className="flex justify-between border-b border-stone-100 pb-2"><span className="font-semibold">Day Shift (08:30–17:00)</span><span className="rounded bg-emerald-100 px-2 py-0.5 font-bold text-emerald-800">3 active</span></div>
            <div className="flex justify-between"><span className="font-semibold">Night Shift (14:00–22:00)</span><span className="rounded bg-stone-100 px-2 py-0.5 font-bold">Scheduled</span></div>
          </div>
        </div>

        <div className="rounded-2xl border border-amber-200 bg-amber-50/50 p-5">
          <div className="flex items-center gap-2 text-amber-800"><AlertTriangle size={17} /><span className="text-xs font-bold uppercase">ML Attendance Anomalies</span></div>
          <p className="mt-2 text-xs text-amber-900">
            {(anomaliesQuery.data?.anomalies ?? []).length} anomaly signal(s) flagged via IsolationForest & duplicate punch rules.
          </p>
          <div className="mt-2 space-y-1 text-[11px] text-amber-800">
            {(anomaliesQuery.data?.anomalies ?? []).slice(0, 2).map((a: any, i: number) => (
              <p key={i}>• <strong>{a.employeeName}</strong>: {a.explanation}</p>
            ))}
          </div>
        </div>
      </div>

      {/* Filter + Records Table */}
      <div className="surface overflow-hidden">
        <div className="flex items-center justify-between border-b border-stone-100 p-4">
          <div className="flex items-center gap-2">
            <Filter size={15} className="text-stone-400" />
            <select value={filterShift} onChange={e => setFilterShift(e.target.value)} className="field min-h-8 w-52 text-xs font-semibold">
              <option value="all">All Shifts</option>
              <option value="Morning">Morning (06:00 - 14:00)</option>
              <option value="Day">Day (08:30 - 17:00)</option>
              <option value="Night">Night (14:00 - 22:00)</option>
            </select>
          </div>
          <span className="text-xs text-stone-400">{filtered.length} records</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-stone-200 bg-stone-50 text-[10px] font-bold uppercase text-stone-500">
              <tr><th className="px-4 py-3">Employee</th><th className="px-4 py-3">Shift</th><th className="px-4 py-3">Clock In</th><th className="px-4 py-3">Clock Out</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Notes</th></tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {filtered.map((r) => (
                <tr key={r.id}>
                  <td className="px-4 py-3 font-semibold text-stone-900">{r.employeeName || 'Teammate'}</td>
                  <td className="px-4 py-3 text-stone-600">{r.shift}</td>
                  <td className="px-4 py-3 font-mono">{r.clockIn || '—'}</td>
                  <td className="px-4 py-3 font-mono">{r.clockOut || 'Active'}</td>
                  <td className="px-4 py-3"><span className="rounded-full bg-stone-100 px-2 py-0.5 text-[10px] font-bold uppercase">{r.status}</span></td>
                  <td className="px-4 py-3 text-stone-500">{r.anomalyFlag || 'Normal adherence'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Corrections Queue */}
      <div className="surface p-5">
        <h3 className="mb-3 font-display text-sm font-bold text-stone-900">Attendance Correction Requests</h3>
        <div className="divide-y divide-stone-100">
          {corrections.map((c) => (
            <div key={c.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between text-xs">
              <div>
                <p className="font-bold text-stone-900">{c.employeeName} · {c.date} ({c.requestedClockIn} – {c.requestedClockOut})</p>
                <p className="text-stone-500">{c.reason}</p>
              </div>
              <div className="flex items-center gap-2">
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${c.status === 'pending' ? 'bg-amber-100 text-amber-800' : c.status === 'approved' ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'}`}>{c.status}</span>
                {c.status === 'pending' && canApprove && (
                  <>
                    <button onClick={() => handleCorrectionDecision(c.id, 'approve')} className="btn btn-primary min-h-7 px-2.5 text-[10px]"><Check size={12} /> Approve</button>
                    <button onClick={() => handleCorrectionDecision(c.id, 'reject')} className="btn btn-secondary min-h-7 px-2.5 text-[10px]">Decline</button>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {showCorrectionModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-950/40 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-stone-100 pb-3">
              <h3 className="font-display text-base font-bold">Request Attendance Correction</h3>
              <button onClick={() => setShowCorrectionModal(false)}><X size={18} /></button>
            </div>
            <form onSubmit={handleSubmitCorrection} className="mt-4 space-y-3 text-xs">
              <div><label className="label">Date</label><input type="date" required value={corrDate} onChange={e => setCorrDate(e.target.value)} className="field" /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="label">Clock In</label><input type="time" required value={corrIn} onChange={e => setCorrIn(e.target.value)} className="field" /></div>
                <div><label className="label">Clock Out</label><input type="time" required value={corrOut} onChange={e => setCorrOut(e.target.value)} className="field" /></div>
              </div>
              <div><label className="label">Reason</label><textarea required value={corrReason} onChange={e => setCorrReason(e.target.value)} className="field min-h-20" /></div>
              <div className="flex justify-end gap-2"><button type="button" onClick={() => setShowCorrectionModal(false)} className="btn btn-secondary text-xs">Cancel</button><button type="submit" className="btn btn-primary text-xs">Submit Request</button></div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
