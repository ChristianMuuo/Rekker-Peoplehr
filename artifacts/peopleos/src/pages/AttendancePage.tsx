import React, { useState } from 'react';
import {
  Clock, Clock3, AlertTriangle, CheckCircle2, UserCheck, Calendar,
  Filter, Play, Square, AlertCircle, Plus, X
} from 'lucide-react';
import { peopleOsStore, type AttendanceRecord } from '../data/mockStore';

export function AttendancePage() {
  const [records, setRecords] = useState<AttendanceRecord[]>(peopleOsStore.getAttendance());
  const [filterShift, setFilterShift] = useState<string>('all');
  const [clockedState, setClockedState] = useState<'in' | 'out'>('out');
  const [clockTime, setClockTime] = useState<string | null>(null);
  const [showCorrectionModal, setShowCorrectionModal] = useState(false);

  const handleToggleClock = () => {
    const userEmpId = 'emp_07'; // Current logged-in HR Admin (David Kibet)
    if (clockedState === 'out') {
      const rec = peopleOsStore.clockIn(userEmpId);
      setClockedState('in');
      setClockTime(rec.clockIn);
      setRecords(peopleOsStore.getAttendance());
    } else {
      peopleOsStore.clockOut(userEmpId);
      setClockedState('out');
      setRecords(peopleOsStore.getAttendance());
    }
  };

  const filtered = filterShift === 'all'
    ? records
    : records.filter((r) => r.shift.toLowerCase().includes(filterShift.toLowerCase()));

  const anomalies = records.filter((r) => r.status === 'late' || r.anomalyFlag);

  return (
    <div className="space-y-6">
      {/* Top Heading */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="mb-2 text-[10px] font-bold uppercase tracking-[.17em] text-[#bd2725]">Workforce Operations / Time</p>
          <h1 className="font-display text-3xl font-semibold tracking-[-.035em] text-stone-900 md:text-[34px]">
            Attendance & Shifts
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-stone-500">
            Real-time shift management, employee clock-in telemetry, overtime monitoring, and anomaly detection.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowCorrectionModal(true)}
            className="btn btn-secondary flex items-center gap-2 text-xs font-semibold"
          >
            <Plus size={15} /> Request Correction
          </button>
        </div>
      </div>

      {/* Clock-in Console & Shift Status */}
      <div className="grid gap-4 md:grid-cols-3">
        {/* Clock In / Out Console */}
        <div className="rounded-2xl border border-stone-200 bg-white p-5 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wider text-stone-400">Self-Service Terminal</span>
              <span className={`h-2.5 w-2.5 rounded-full ${clockedState === 'in' ? 'bg-emerald-500 animate-pulse' : 'bg-stone-300'}`} />
            </div>
            <h3 className="mt-2 font-display text-lg font-bold text-stone-900">David Kibet (HR Admin)</h3>
            <p className="text-xs text-stone-500">Scheduled: Day Shift (08:30 - 17:00) · Westlands Office</p>
          </div>

          <div className="mt-6 flex items-center gap-3">
            <button
              onClick={handleToggleClock}
              className={`flex-1 flex items-center justify-center gap-2 rounded-xl py-3 text-xs font-bold transition ${
                clockedState === 'out'
                  ? 'bg-red-700 text-white hover:bg-red-800'
                  : 'bg-stone-800 text-white hover:bg-stone-900'
              }`}
            >
              {clockedState === 'out' ? (
                <>
                  <Play size={15} fill="currentColor" /> Clock In for Shift
                </>
              ) : (
                <>
                  <Square size={15} fill="currentColor" /> Clock Out of Shift
                </>
              )}
            </button>
          </div>
          {clockTime && (
            <p className="mt-2 text-center text-[11px] text-emerald-700 font-medium">
              Clocked in today at {clockTime}
            </p>
          )}
        </div>

        {/* Shift Coverage Overview */}
        <div className="rounded-2xl border border-stone-200 bg-white p-5 shadow-xs">
          <p className="text-[11px] font-bold uppercase tracking-wider text-stone-400">Today's Shift Roster</p>
          <div className="mt-3 space-y-2.5 text-xs">
            <div className="flex items-center justify-between border-b border-stone-100 pb-2">
              <span className="font-semibold text-stone-800">Morning Shift (06:00 - 14:00)</span>
              <span className="rounded bg-stone-100 px-2 py-0.5 font-bold text-stone-700">2 on duty</span>
            </div>
            <div className="flex items-center justify-between border-b border-stone-100 pb-2">
              <span className="font-semibold text-stone-800">Day Shift (08:30 - 17:00)</span>
              <span className="rounded bg-emerald-100 px-2 py-0.5 font-bold text-emerald-800">3 on duty</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="font-semibold text-stone-800">Night Shift (14:00 - 22:00)</span>
              <span className="rounded bg-stone-100 px-2 py-0.5 font-bold text-stone-500">Scheduled</span>
            </div>
          </div>
        </div>

        {/* AI Anomaly Alert Card */}
        <div className="rounded-2xl border border-amber-200 bg-amber-50/50 p-5 shadow-xs">
          <div className="flex items-center gap-2 text-amber-800">
            <AlertTriangle size={17} />
            <span className="text-xs font-bold uppercase tracking-wider">Workforce Anomaly Flag</span>
          </div>
          <p className="mt-2 text-xs leading-relaxed text-amber-900">
            Detected <strong>1 late arrival</strong> in the Logistics & Distribution hub. Juma Omondi clocked in 18 minutes after shift schedule.
          </p>
          <div className="mt-3 border-t border-amber-200/80 pt-2 text-[11px] font-semibold text-amber-800">
            Telemetry: Geofence Verified · Fleet Operations unaffected
          </div>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="flex items-center justify-between rounded-xl border border-stone-200 bg-white p-4">
        <div className="flex items-center gap-2">
          <Filter size={16} className="text-stone-400" />
          <span className="text-xs font-bold text-stone-700">Filter Shift:</span>
          <select
            value={filterShift}
            onChange={(e) => setFilterShift(e.target.value)}
            className="rounded-lg border border-stone-200 bg-stone-50 px-3 py-1.5 text-xs font-semibold text-stone-700"
          >
            <option value="all">All Shifts</option>
            <option value="Morning">Morning (06:00 - 14:00)</option>
            <option value="Day">Day (08:30 - 17:00)</option>
            <option value="Night">Night (14:00 - 22:00)</option>
          </select>
        </div>
        <span className="text-xs text-stone-400">
          Displaying {filtered.length} active time records for 2026-03-06
        </span>
      </div>

      {/* Attendance Events Table */}
      <div className="overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-stone-200 bg-stone-50 text-[10px] font-bold uppercase tracking-wider text-stone-500">
              <tr>
                <th className="px-4 py-3">Employee</th>
                <th className="px-4 py-3">Assigned Shift</th>
                <th className="px-4 py-3">Clock In</th>
                <th className="px-4 py-3">Clock Out</th>
                <th className="px-4 py-3">Overtime</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Anomalies / Notes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {filtered.map((r) => (
                <tr key={r.id} className="hover:bg-stone-50/70 transition">
                  <td className="px-4 py-3 font-semibold text-stone-900">{r.employeeName}</td>
                  <td className="px-4 py-3 text-stone-600">{r.shift}</td>
                  <td className="px-4 py-3 font-mono font-medium text-stone-800">{r.clockIn || '—'}</td>
                  <td className="px-4 py-3 font-mono font-medium text-stone-800">{r.clockOut || 'Active on shift'}</td>
                  <td className="px-4 py-3 text-stone-600">{r.overtimeHours > 0 ? `${r.overtimeHours} hrs` : '—'}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                        r.status === 'on_time'
                          ? 'bg-emerald-100 text-emerald-800'
                          : r.status === 'overtime'
                          ? 'bg-blue-100 text-blue-800'
                          : r.status === 'late'
                          ? 'bg-amber-100 text-amber-800'
                          : 'bg-rose-100 text-rose-800'
                      }`}
                    >
                      {r.status.replace('_', ' ').toUpperCase()}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-stone-500">
                    {r.anomalyFlag ? (
                      <span className="text-amber-800 font-medium">{r.anomalyFlag}</span>
                    ) : (
                      'Normal schedule adherence'
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal: Correction Request */}
      {showCorrectionModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-950/40 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-stone-100 pb-3">
              <h3 className="font-display text-base font-bold text-stone-900">Request Attendance Correction</h3>
              <button onClick={() => setShowCorrectionModal(false)} className="text-stone-400 hover:text-stone-700">
                <X size={18} />
              </button>
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                alert('Attendance correction submitted for supervisor review.');
                setShowCorrectionModal(false);
              }}
              className="mt-4 space-y-3"
            >
              <div>
                <label className="text-xs font-bold text-stone-700">Date</label>
                <input
                  type="date"
                  required
                  defaultValue="2026-03-06"
                  className="mt-1 w-full rounded-lg border border-stone-200 px-3 py-2 text-xs focus:border-red-700 focus:outline-hidden"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-stone-700">Correct Clock In</label>
                  <input
                    type="time"
                    required
                    defaultValue="08:30"
                    className="mt-1 w-full rounded-lg border border-stone-200 px-3 py-2 text-xs focus:border-red-700 focus:outline-hidden"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-stone-700">Correct Clock Out</label>
                  <input
                    type="time"
                    required
                    defaultValue="17:00"
                    className="mt-1 w-full rounded-lg border border-stone-200 px-3 py-2 text-xs focus:border-red-700 focus:outline-hidden"
                  />
                </div>
              </div>
              <div>
                <label className="text-xs font-bold text-stone-700">Reason for Adjustment</label>
                <textarea
                  rows={2}
                  required
                  placeholder="e.g., Biometric reader offline during morning shift changeover..."
                  className="mt-1 w-full rounded-lg border border-stone-200 px-3 py-2 text-xs focus:border-red-700 focus:outline-hidden"
                />
              </div>
              <div className="flex justify-end gap-2 border-t border-stone-100 pt-3">
                <button
                  type="button"
                  onClick={() => setShowCorrectionModal(false)}
                  className="btn btn-secondary text-xs"
                >
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary text-xs font-semibold">
                  Submit Adjustment
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
