import { useState, type FormEvent } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarDays, Clock, ShieldCheck, Users, X } from 'lucide-react';
import { apiGet, apiPost } from '@/lib/api';

export function LeaveCoverageAndCalendarPanel({ canManageSettings }: { canManageSettings: boolean }) {
  const qc = useQueryClient();
  const [calModalOpen, setCalModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const calendarsQuery = useQuery({
    queryKey: ['work-calendars'],
    queryFn: () => apiGet<{ orgTimezone?: string; items: any[] }>('/api/peopleos/work-calendars'),
  });

  const coverageQuery = useQuery({
    queryKey: ['leave-department-coverage'],
    queryFn: () => apiGet<{ items: any[] }>('/api/leave/department-coverage'),
  });

  const calendars = calendarsQuery.data?.items ?? [];
  const defaultCal = calendars[0];

  const saveCalendar = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSaving(true);
    const fd = new FormData(e.currentTarget);
    const holidaysRaw = String(fd.get('publicHolidays') ?? '');
    const holidayDates = holidaysRaw
      .split(/[\n,]/)
      .map((s) => s.trim())
      .filter((s) => /^\d{4}-\d{2}-\d{2}$/.test(s));
    const workdays = [1, 2, 3, 4, 5];
    if (fd.get('restSat') !== 'on') workdays.push(6);
    if (fd.get('restSun') !== 'on') workdays.unshift(0);

    try {
      await apiPost('/api/peopleos/work-calendars', {
        name: String(fd.get('name') ?? 'Kenya HQ Work Calendar'),
        timezone: String(fd.get('timezone') ?? 'Africa/Nairobi'),
        workdays,
        holidays: holidayDates.map((date) => ({ date, name: 'Public Holiday' })),
        shiftStartTime: '08:00',
        shiftEndTime: '17:00',
        isDefault: true,
      });
      setCalModalOpen(false);
      qc.invalidateQueries({ queryKey: ['work-calendars'] });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mb-4 space-y-4">
      <section className="surface p-4 md:p-5" data-testid="section-leave-calendars-coverage">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="font-display text-base font-semibold text-stone-900">
              Work Calendar, Holidays &amp; Department Coverage
            </h2>
            <p className="mt-1 text-xs text-stone-500">
              Timezone: <strong>{calendarsQuery.data?.orgTimezone ?? defaultCal?.timezone ?? 'Africa/Nairobi'}</strong> · Rest days and configured holidays are automatically excluded from requested working days.
            </p>
          </div>
          {canManageSettings && (
            <button
              type="button"
              onClick={() => setCalModalOpen(true)}
              className="btn btn-secondary min-h-8 px-3 text-xs"
              data-testid="button-configure-work-calendar"
            >
              <CalendarDays size={13} /> Configure Work Calendar
            </button>
          )}
        </div>

        <div className="mt-4 grid gap-3 lg:grid-cols-2">
          <div className="rounded-xl border border-stone-200 bg-[#faf8f5] p-3.5 text-xs">
            <div className="flex items-center gap-2 font-semibold text-stone-800">
              <Users size={14} className="text-[#C71D1D]" /> Department Team Coverage Snapshot
            </div>
            {!(coverageQuery.data?.items?.length) ? (
              <p className="mt-2 text-stone-500">
                No department leave overlaps recorded across active teams.
              </p>
            ) : (
              <div className="mt-2 space-y-1.5">
                {coverageQuery.data.items.slice(0, 6).map((c: any) => (
                  <div key={c.departmentId} className="flex items-center justify-between">
                    <span className="font-medium text-stone-700">{c.departmentName}</span>
                    <span className="font-mono text-stone-600">
                      {c.availableCount ?? c.activeCount ?? 0} available · {c.onLeaveCount ?? 0} on leave
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="rounded-xl border border-[#ead4b1] bg-[#fbf3e4] p-3.5 text-xs text-[#6f5a30]">
            <div className="flex items-center gap-2 font-bold">
              <ShieldCheck size={14} /> Kenyan Employment Act Cap 226 §28 Reference
            </div>
            <p className="mt-1.5 leading-5">
              Statutory reference notes 21 working days of annual leave after 12 months of continuous service, accrued pro rata if configured. Organization policies remain unseeded until explicitly configured by HR above.
            </p>
            <div className="mt-2 flex items-center gap-2 text-[11px] font-semibold">
              <Clock size={12} /> Active Holidays Configured: {(defaultCal?.holidays ?? defaultCal?.publicHolidays ?? []).length}
            </div>
          </div>
        </div>
      </section>

      {calModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-950/40 p-4 backdrop-blur-[2px]">
          <div className="w-full max-w-[520px] rounded-2xl bg-white p-6 shadow-2xl">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="font-display text-lg font-semibold text-stone-900">
                Configure Organization Work Calendar
              </h3>
              <button
                type="button"
                onClick={() => setCalModalOpen(false)}
                className="btn btn-ghost min-h-8 px-2"
              >
                <X size={16} />
              </button>
            </div>
            <form onSubmit={saveCalendar} className="space-y-3 text-xs">
              <label className="block">
                <span className="label">Calendar Name</span>
                <input
                  name="name"
                  defaultValue={defaultCal?.name ?? 'Kenya HQ Work Calendar'}
                  required
                  className="field"
                />
              </label>
              <label className="block">
                <span className="label">IANA Timezone</span>
                <input
                  name="timezone"
                  defaultValue={defaultCal?.timezone ?? 'Africa/Nairobi'}
                  required
                  className="field font-mono"
                />
              </label>
              <div className="flex gap-4 py-1">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    name="restSat"
                    defaultChecked={(defaultCal?.restDays ?? [0, 6]).includes(6)}
                  />
                  <span>Saturday Rest Day</span>
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    name="restSun"
                    defaultChecked={(defaultCal?.restDays ?? [0, 6]).includes(0)}
                  />
                  <span>Sunday Rest Day</span>
                </label>
              </div>
              <label className="block">
                <span className="label">Public Holidays (YYYY-MM-DD, comma or newline separated)</span>
                <textarea
                  name="publicHolidays"
                  rows={4}
                  defaultValue={(defaultCal?.publicHolidays ?? ['2026-01-01', '2026-05-01', '2026-06-01', '2026-10-20', '2026-12-12', '2026-12-25', '2026-12-26']).join('\n')}
                  className="field font-mono"
                />
              </label>
              <div className="flex justify-end gap-2 border-t border-stone-100 pt-3">
                <button
                  type="button"
                  onClick={() => setCalModalOpen(false)}
                  className="btn btn-secondary"
                >
                  Cancel
                </button>
                <button type="submit" disabled={saving} className="btn btn-primary">
                  {saving ? 'Saving…' : 'Save Work Calendar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
