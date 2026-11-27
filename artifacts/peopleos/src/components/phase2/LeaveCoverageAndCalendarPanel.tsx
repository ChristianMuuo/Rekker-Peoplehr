import { useState, useMemo, type FormEvent } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CalendarDays,
  Calendar,
  ChevronLeft,
  ChevronRight,
  Clock,
  Eye,
  Filter,
  Grid,
  Info,
  List,
  Lock,
  ShieldCheck,
  Sparkles,
  Users,
  X,
} from 'lucide-react';
import { apiGet, apiPost } from '@/lib/api';

export interface LeaveCalendarEntry {
  id: string;
  employeeId: string;
  employeeName: string;
  departmentId: string | null;
  departmentName: string;
  startDate: string;
  endDate: string;
  days: number;
  status: 'approved' | 'pending';
  displayType: string;
  reason: string | null;
  isOwn: boolean;
}

export interface LeaveCalendarResponse {
  period: {
    month: string;
    startDate: string;
    endDate: string;
  };
  workCalendar: {
    timezone: string;
    workdays: number[];
    shiftStartTime: string;
    shiftEndTime: string;
  };
  holidays: Array<{ date: string; name: string }>;
  entries: LeaveCalendarEntry[];
  summary: {
    totalEmployeesOnLeave: number;
    approvedCount: number;
    pendingCount: number;
    holidaysCount: number;
  };
  viewMode: 'hr' | 'manager' | 'peer';
}

const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

const WEEKDAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export function LeaveCoverageAndCalendarPanel({
  canManageSettings,
}: {
  canManageSettings: boolean;
}) {
  const qc = useQueryClient();

  // Current year & month state (defaults dynamically to current month)
  const initialDate = new Date();
  const [selectedYear, setSelectedYear] = useState(initialDate.getFullYear());
  const [selectedMonth, setSelectedMonth] = useState(initialDate.getMonth() + 1); // 1-indexed
  const [selectedDepartment, setSelectedDepartment] = useState<string>('all');
  const [calendarView, setCalendarView] = useState<'grid' | 'timeline'>('grid');

  // Modals state
  const [calModalOpen, setCalModalOpen] = useState(false);
  const [selectedEntry, setSelectedEntry] = useState<LeaveCalendarEntry | null>(null);
  const [saving, setSaving] = useState(false);

  const monthParam = `${selectedYear}-${String(selectedMonth).padStart(2, '0')}`;

  // Query leave calendar data
  const calendarQuery = useQuery({
    queryKey: ['leave-calendar', monthParam, selectedDepartment],
    queryFn: () => {
      const qs = new URLSearchParams({ month: monthParam });
      if (selectedDepartment !== 'all') {
        qs.set('departmentId', selectedDepartment);
      }
      return apiGet<LeaveCalendarResponse>(`/api/leave/calendar?${qs.toString()}`);
    },
  });

  // Query work calendars
  const calendarsQuery = useQuery({
    queryKey: ['work-calendars'],
    queryFn: () => apiGet<{ orgTimezone?: string; items: any[] }>('/api/peopleos/work-calendars'),
  });

  // Query department coverage
  const coverageQuery = useQuery({
    queryKey: ['leave-department-coverage', monthParam],
    queryFn: () => {
      const [y, m] = [selectedYear, selectedMonth];
      const start = `${monthParam}-01`;
      const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
      const end = `${monthParam}-${String(lastDay).padStart(2, '0')}`;
      return apiGet<{ items?: any[]; departments?: any[] }>(
        `/api/leave/department-coverage?startDate=${start}&endDate=${end}`,
      );
    },
  });

  const calendars = calendarsQuery.data?.items ?? [];
  const defaultCal = calendars[0];
  const calendarData = calendarQuery.data;

  // Month navigation handlers
  const handlePrevMonth = () => {
    if (selectedMonth === 1) {
      setSelectedYear((y) => y - 1);
      setSelectedMonth(12);
    } else {
      setSelectedMonth((m) => m - 1);
    }
  };

  const handleNextMonth = () => {
    if (selectedMonth === 12) {
      setSelectedYear((y) => y + 1);
      setSelectedMonth(1);
    } else {
      setSelectedMonth((m) => m + 1);
    }
  };

  const handleCurrentMonth = () => {
    const now = new Date();
    setSelectedYear(now.getFullYear());
    setSelectedMonth(now.getMonth() + 1);
  };

  // Calendar Grid computation (Monday-first)
  const gridCells = useMemo(() => {
    const y = selectedYear;
    const m = selectedMonth;
    const firstDayDate = new Date(Date.UTC(y, m - 1, 1));
    const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
    const prevMonthDays = new Date(Date.UTC(y, m - 1, 0)).getUTCDate();

    // Monday-first index: JS 0 is Sunday -> 6; 1 is Monday -> 0
    const startOffset = (firstDayDate.getUTCDay() + 6) % 7;

    const cells: Array<{
      dateIso: string;
      dayNumber: number;
      isCurrentMonth: boolean;
      isWeekend: boolean;
      holidayName: string | null;
      entries: LeaveCalendarEntry[];
    }> = [];

    const holidayMap = new Map((calendarData?.holidays ?? []).map((h) => [h.date, h.name]));
    const entries = calendarData?.entries ?? [];

    // Leading days from previous month
    for (let i = startOffset - 1; i >= 0; i--) {
      const prevDay = prevMonthDays - i;
      const prevM = m === 1 ? 12 : m - 1;
      const prevY = m === 1 ? y - 1 : y;
      const dateIso = `${prevY}-${String(prevM).padStart(2, '0')}-${String(prevDay).padStart(2, '0')}`;
      const cellDate = new Date(Date.UTC(prevY, prevM - 1, prevDay));
      const dayOfWeek = cellDate.getUTCDay();
      const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

      cells.push({
        dateIso,
        dayNumber: prevDay,
        isCurrentMonth: false,
        isWeekend,
        holidayName: holidayMap.get(dateIso) ?? null,
        entries: entries.filter((e) => e.startDate <= dateIso && e.endDate >= dateIso),
      });
    }

    // Days in current month
    for (let d = 1; d <= daysInMonth; d++) {
      const dateIso = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const cellDate = new Date(Date.UTC(y, m - 1, d));
      const dayOfWeek = cellDate.getUTCDay();
      const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

      cells.push({
        dateIso,
        dayNumber: d,
        isCurrentMonth: true,
        isWeekend,
        holidayName: holidayMap.get(dateIso) ?? null,
        entries: entries.filter((e) => e.startDate <= dateIso && e.endDate >= dateIso),
      });
    }

    // Trailing days from next month to complete row of 7
    const remainder = cells.length % 7;
    if (remainder > 0) {
      const trailingCount = 7 - remainder;
      const nextM = m === 12 ? 1 : m + 1;
      const nextY = m === 12 ? y + 1 : y;
      for (let d = 1; d <= trailingCount; d++) {
        const dateIso = `${nextY}-${String(nextM).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
        const cellDate = new Date(Date.UTC(nextY, nextM - 1, d));
        const dayOfWeek = cellDate.getUTCDay();
        const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

        cells.push({
          dateIso,
          dayNumber: d,
          isCurrentMonth: false,
          isWeekend,
          holidayName: holidayMap.get(dateIso) ?? null,
          entries: entries.filter((e) => e.startDate <= dateIso && e.endDate >= dateIso),
        });
      }
    }

    return cells;
  }, [selectedYear, selectedMonth, calendarData]);

  // Unique departments for filter
  const departmentsList = useMemo(() => {
    const raw = coverageQuery.data?.departments ?? coverageQuery.data?.items ?? [];
    return raw.map((d: any) => ({
      id: d.departmentId,
      name: d.departmentName ?? d.name,
    }));
  }, [coverageQuery.data]);

  // Unique employees with leaves for Timeline View
  const timelineEmployees = useMemo(() => {
    const entries = calendarData?.entries ?? [];
    const map = new Map<string, { employeeId: string; employeeName: string; departmentName: string; entries: LeaveCalendarEntry[] }>();
    for (const e of entries) {
      if (!map.has(e.employeeId)) {
        map.set(e.employeeId, {
          employeeId: e.employeeId,
          employeeName: e.employeeName,
          departmentName: e.departmentName,
          entries: [],
        });
      }
      map.get(e.employeeId)!.entries.push(e);
    }
    return Array.from(map.values());
  }, [calendarData?.entries]);

  const daysInCurrentMonth = useMemo(() => {
    const days: number[] = [];
    const count = new Date(Date.UTC(selectedYear, selectedMonth, 0)).getUTCDate();
    for (let i = 1; i <= count; i++) days.push(i);
    return days;
  }, [selectedYear, selectedMonth]);

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
      qc.invalidateQueries({ queryKey: ['leave-calendar'] });
    } finally {
      setSaving(false);
    }
  };

  const todayIso = new Date().toISOString().slice(0, 10);

  return (
    <div className="mb-6 space-y-4" data-testid="section-leave-coverage-and-calendar">
      {/* ── Main Interactive Calendar Surface ───────────────────────────────── */}
      <section className="surface p-4 md:p-6 shadow-sm">
        {/* Top Header & Navigation */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-stone-200 pb-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-[#C71D1D]/10 text-[#C71D1D]">
                <CalendarDays size={18} />
              </span>
              <h2 className="font-display text-xl font-bold text-stone-900 tracking-tight">
                Team Availability &amp; Leave Calendar
              </h2>
            </div>
            <p className="mt-1 text-xs text-stone-500">
              Interactive monthly schedule, public holidays &amp; department coverage. Timezone:{' '}
              <span className="font-semibold text-stone-700">
                {calendarData?.workCalendar.timezone ?? 'Africa/Nairobi (EAT)'}
              </span>
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* View Mode Toggle */}
            <div className="inline-flex rounded-lg border border-stone-200 bg-stone-100 p-0.5 text-xs">
              <button
                type="button"
                onClick={() => setCalendarView('grid')}
                className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 font-medium transition ${
                  calendarView === 'grid'
                    ? 'bg-white text-stone-900 shadow-sm'
                    : 'text-stone-600 hover:text-stone-900'
                }`}
                data-testid="button-calendar-view-grid"
              >
                <Grid size={13} /> Month Grid
              </button>
              <button
                type="button"
                onClick={() => setCalendarView('timeline')}
                className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 font-medium transition ${
                  calendarView === 'timeline'
                    ? 'bg-white text-stone-900 shadow-sm'
                    : 'text-stone-600 hover:text-stone-900'
                }`}
                data-testid="button-calendar-view-timeline"
              >
                <List size={13} /> Timeline
              </button>
            </div>

            {canManageSettings && (
              <button
                type="button"
                onClick={() => setCalModalOpen(true)}
                className="btn btn-secondary min-h-8 px-3 text-xs"
                data-testid="button-configure-work-calendar"
              >
                <Clock size={13} /> Configure Work Calendar
              </button>
            )}
          </div>
        </div>

        {/* Filter and Month Controls */}
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          {/* Month selector */}
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={handlePrevMonth}
              className="btn btn-ghost min-h-8 px-2"
              title="Previous Month"
              data-testid="button-calendar-prev-month"
            >
              <ChevronLeft size={16} />
            </button>
            <span className="min-w-36 text-center font-display text-base font-bold text-stone-800">
              {MONTH_NAMES[selectedMonth - 1]} {selectedYear}
            </span>
            <button
              type="button"
              onClick={handleNextMonth}
              className="btn btn-ghost min-h-8 px-2"
              title="Next Month"
              data-testid="button-calendar-next-month"
            >
              <ChevronRight size={16} />
            </button>
            <button
              type="button"
              onClick={handleCurrentMonth}
              className="btn btn-secondary min-h-8 px-2.5 text-xs text-stone-600"
              data-testid="button-calendar-today"
            >
              Today
            </button>
          </div>

          {/* Department Filter & Privacy Pill */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1.5 text-xs">
              <Filter size={13} className="text-stone-400" />
              <select
                value={selectedDepartment}
                onChange={(e) => setSelectedDepartment(e.target.value)}
                className="field min-h-8 py-1 text-xs"
                data-testid="select-calendar-department"
              >
                <option value="all">All Departments</option>
                {departmentsList.map((d: any) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Privacy Badge */}
            <span
              className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${
                calendarData?.viewMode === 'hr'
                  ? 'bg-purple-50 text-purple-700 border border-purple-200'
                  : calendarData?.viewMode === 'manager'
                    ? 'bg-blue-50 text-blue-700 border border-blue-200'
                    : 'bg-stone-100 text-stone-600 border border-stone-200'
              }`}
              title={
                calendarData?.viewMode === 'hr'
                  ? 'HR Officer: Full visibility across all leave types and notes.'
                  : calendarData?.viewMode === 'manager'
                    ? 'Manager: Sensitive medical/compassionate leaves redacted to "Leave".'
                    : 'Team Peer: All peer absences protected as "Away" under KDPA 2019.'
              }
            >
              {calendarData?.viewMode === 'hr' ? (
                <>
                  <ShieldCheck size={12} /> HR Access
                </>
              ) : calendarData?.viewMode === 'manager' ? (
                <>
                  <Users size={12} /> Manager Scope
                </>
              ) : (
                <>
                  <Lock size={12} /> Peer Protected
                </>
              )}
            </span>
          </div>
        </div>

        {/* Summary Metric Pills */}
        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <div className="rounded-xl border border-stone-200 bg-[#faf8f5] p-3">
            <p className="text-[11px] font-medium text-stone-500">Employees on Leave</p>
            <p className="mt-0.5 font-display text-lg font-bold text-stone-900">
              {calendarData?.summary.totalEmployeesOnLeave ?? 0}
            </p>
          </div>
          <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-3">
            <p className="text-[11px] font-medium text-emerald-700">Approved Spans</p>
            <p className="mt-0.5 font-display text-lg font-bold text-emerald-800">
              {calendarData?.summary.approvedCount ?? 0}
            </p>
          </div>
          <div className="rounded-xl border border-amber-200 bg-amber-50/50 p-3">
            <p className="text-[11px] font-medium text-amber-700">Pending Decisions</p>
            <p className="mt-0.5 font-display text-lg font-bold text-amber-800">
              {calendarData?.summary.pendingCount ?? 0}
            </p>
          </div>
          <div className="rounded-xl border border-purple-200 bg-purple-50/50 p-3">
            <p className="text-[11px] font-medium text-purple-700">Gazetted Holidays</p>
            <p className="mt-0.5 font-display text-lg font-bold text-purple-800">
              {calendarData?.summary.holidaysCount ?? 0}
            </p>
          </div>
        </div>

        {/* ── View 1: Month Grid View ────────────────────────────────────────── */}
        {calendarView === 'grid' && (
          <div className="mt-4 overflow-hidden rounded-xl border border-stone-200 bg-white">
            {/* Weekday column headers */}
            <div className="grid grid-cols-7 border-b border-stone-200 bg-stone-50 text-center text-xs font-semibold text-stone-600">
              {WEEKDAY_NAMES.map((w, idx) => (
                <div
                  key={w}
                  className={`py-2.5 ${idx >= 5 ? 'text-stone-400 bg-stone-100/60' : ''}`}
                >
                  {w}
                </div>
              ))}
            </div>

            {/* Calendar Days Matrix */}
            <div className="grid grid-cols-7 auto-rows-fr divide-x divide-y divide-stone-200">
              {gridCells.map((cell) => {
                const isToday = cell.dateIso === todayIso;

                return (
                  <div
                    key={cell.dateIso}
                    className={`min-h-[105px] p-1.5 transition ${
                      !cell.isCurrentMonth
                        ? 'bg-stone-50/60 text-stone-400'
                        : cell.isWeekend
                          ? 'bg-stone-50/40'
                          : 'bg-white'
                    }`}
                  >
                    {/* Date header & flags */}
                    <div className="flex items-center justify-between">
                      <span
                        className={`inline-flex h-5 w-5 items-center justify-center rounded-full text-xs font-medium ${
                          isToday
                            ? 'bg-[#C71D1D] text-white font-bold'
                            : cell.isCurrentMonth
                              ? 'text-stone-800'
                              : 'text-stone-400'
                        }`}
                      >
                        {cell.dayNumber}
                      </span>

                      {cell.holidayName && (
                        <span
                          className="truncate rounded bg-purple-100 px-1 py-0.5 text-[9px] font-bold text-purple-700"
                          title={cell.holidayName}
                        >
                          🇰🇪 {cell.holidayName}
                        </span>
                      )}
                    </div>

                    {/* Active Leaves on this date */}
                    <div className="mt-1.5 space-y-1">
                      {cell.entries.slice(0, 3).map((entry) => (
                        <button
                          key={`${cell.dateIso}-${entry.id}`}
                          type="button"
                          onClick={() => setSelectedEntry(entry)}
                          className={`w-full text-left truncate rounded px-1.5 py-0.5 text-[10px] font-medium transition ${
                            entry.status === 'approved'
                              ? 'bg-emerald-100/70 text-emerald-900 hover:bg-emerald-200 border-l-2 border-emerald-600'
                              : 'bg-amber-100/70 text-amber-900 hover:bg-amber-200 border-l-2 border-amber-600'
                          } ${entry.isOwn ? 'ring-1 ring-blue-500 font-semibold' : ''}`}
                          title={`${entry.employeeName} (${entry.displayType}) - ${entry.status}`}
                        >
                          <span className="font-semibold">{entry.employeeName.split(' ')[0]}</span> ·{' '}
                          {entry.displayType}
                        </button>
                      ))}

                      {cell.entries.length > 3 && (
                        <span className="block text-[9px] font-semibold text-stone-500 pl-1">
                          +{cell.entries.length - 3} more away
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── View 2: Team Schedule Timeline ─────────────────────────────────── */}
        {calendarView === 'timeline' && (
          <div className="mt-4 overflow-x-auto rounded-xl border border-stone-200 bg-white">
            {!timelineEmployees.length ? (
              <div className="p-8 text-center text-xs text-stone-500">
                No employees are on leave or scheduled away during {MONTH_NAMES[selectedMonth - 1]}{' '}
                {selectedYear}.
              </div>
            ) : (
              <div className="min-w-[800px]">
                {/* Timeline Header Days */}
                <div className="flex border-b border-stone-200 bg-stone-50 text-[10px] font-semibold text-stone-600">
                  <div className="w-56 shrink-0 p-2.5 font-bold text-stone-700">Team Member</div>
                  <div className="flex flex-1">
                    {daysInCurrentMonth.map((d) => {
                      const dateIso = `${selectedYear}-${String(selectedMonth).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
                      const dayOfWeek = new Date(Date.UTC(selectedYear, selectedMonth - 1, d)).getUTCDay();
                      const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

                      return (
                        <div
                          key={d}
                          className={`flex-1 border-l border-stone-200 py-2 text-center ${
                            isWeekend ? 'bg-stone-100/70 text-stone-400' : ''
                          }`}
                        >
                          {d}
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Timeline Rows per employee */}
                <div className="divide-y divide-stone-100 text-xs">
                  {timelineEmployees.map((emp) => (
                    <div key={emp.employeeId} className="flex items-center hover:bg-stone-50/50">
                      <div className="w-56 shrink-0 p-2.5">
                        <p className="font-semibold text-stone-800">{emp.employeeName}</p>
                        <p className="text-[10px] text-stone-400 truncate">{emp.departmentName}</p>
                      </div>

                      <div className="flex flex-1 relative h-10 border-l border-stone-200">
                        {daysInCurrentMonth.map((d) => {
                          const dateIso = `${selectedYear}-${String(selectedMonth).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
                          const dayOfWeek = new Date(Date.UTC(selectedYear, selectedMonth - 1, d)).getUTCDay();
                          const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
                          const activeEntry = emp.entries.find(
                            (e) => e.startDate <= dateIso && e.endDate >= dateIso,
                          );

                          return (
                            <div
                              key={d}
                              className={`flex-1 border-r border-stone-100 relative ${
                                isWeekend ? 'bg-stone-50/60' : ''
                              }`}
                            >
                              {activeEntry && (
                                <button
                                  type="button"
                                  onClick={() => setSelectedEntry(activeEntry)}
                                  className={`absolute inset-y-1.5 inset-x-0.5 rounded text-[9px] font-bold transition flex items-center justify-center ${
                                    activeEntry.status === 'approved'
                                      ? 'bg-emerald-500 text-white shadow-xs'
                                      : 'bg-amber-400 text-amber-950 shadow-xs'
                                  }`}
                                  title={`${emp.employeeName}: ${activeEntry.displayType} (${activeEntry.startDate} to ${activeEntry.endDate})`}
                                >
                                  {d === Number(activeEntry.startDate.slice(8, 10)) && (
                                    <span className="truncate px-1">{activeEntry.displayType}</span>
                                  )}
                                </button>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Legend */}
        <div className="mt-3 flex flex-wrap items-center gap-4 text-xs text-stone-500 pt-2 border-t border-stone-100">
          <div className="flex items-center gap-1.5">
            <span className="h-3 w-3 rounded bg-emerald-500" />
            <span>Approved Leave</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="h-3 w-3 rounded bg-amber-400" />
            <span>Pending Review</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="h-3 w-3 rounded bg-purple-400" />
            <span>Gazetted Public Holiday</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="h-3 w-3 rounded bg-stone-200" />
            <span>Rest Day (Weekend)</span>
          </div>
        </div>
      </section>

      {/* ── Department Coverage & Statutory Section ──────────────────────────── */}
      <div className="grid gap-3 lg:grid-cols-2">
        <div className="surface p-4 text-xs">
          <div className="flex items-center gap-2 font-semibold text-stone-800">
            <Users size={15} className="text-[#C71D1D]" /> Team Minimum Cover &amp; Shift Presence
          </div>
          <p className="mt-1 text-stone-500">
            Real-time active headcount versus scheduled absences across Rekker operations:
          </p>

          <div className="mt-3 space-y-2">
            {(coverageQuery.data?.departments ?? coverageQuery.data?.items ?? []).map((c: any) => {
              const total = c.activeHeadcount ?? c.totalHeadcount ?? 1;
              const available = c.availableCount ?? total;
              const onLeave = c.onLeaveOrScheduledCount ?? c.onLeaveCount ?? 0;
              const pct = Math.round((available / Math.max(total, 1)) * 100);

              return (
                <div key={c.departmentId} className="space-y-1">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="font-semibold text-stone-700">{c.departmentName}</span>
                    <span className="font-mono text-stone-600">
                      {available} available · {onLeave} on leave ({pct}%)
                    </span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-stone-100">
                    <div
                      className={`h-full rounded-full transition-all ${
                        pct >= 80 ? 'bg-emerald-500' : pct >= 60 ? 'bg-amber-500' : 'bg-red-500'
                      }`}
                      style={{ width: `${Math.min(pct, 100)}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="rounded-2xl border border-[#ead4b1] bg-[#fbf3e4] p-4 text-xs text-[#6f5a30]">
          <div className="flex items-center gap-2 font-bold">
            <ShieldCheck size={16} /> Kenya Statutory Leave &amp; Privacy Governance
          </div>
          <p className="mt-2 leading-relaxed">
            • <strong>Employment Act 2007 (Cap 226) §28:</strong> Employees are entitled to at least
            21 working days of paid annual leave per 12-month period, accrued proportionally.
          </p>
          <p className="mt-1.5 leading-relaxed">
            • <strong>Gazetted Public Holidays:</strong> Workdays exclude public holidays and rest
            days configured in the organization work calendar.
          </p>
          <p className="mt-1.5 leading-relaxed">
            • <strong>ODPC Privacy Scoping:</strong> Medical reasons and personal grievance details
            are strictly redacted from peer views to protect statutory data privacy.
          </p>
        </div>
      </div>

      {/* ── Entry Detail Drawer / Modal ───────────────────────────────────────── */}
      {selectedEntry && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-950/40 p-4 backdrop-blur-[2px]">
          <div className="w-full max-w-[480px] rounded-2xl bg-white p-6 shadow-2xl">
            <div className="mb-4 flex items-center justify-between border-b border-stone-100 pb-3">
              <div className="flex items-center gap-2">
                <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-stone-100 text-stone-700">
                  <Calendar size={16} />
                </span>
                <div>
                  <h3 className="font-display text-base font-bold text-stone-900">
                    Leave Record Details
                  </h3>
                  <p className="text-[11px] text-stone-500">ID: {selectedEntry.id}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedEntry(null)}
                className="btn btn-ghost min-h-8 px-2"
              >
                <X size={16} />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="rounded-xl border border-stone-100 bg-stone-50 p-3">
                <p className="text-[11px] text-stone-400">Team Member</p>
                <p className="font-bold text-stone-800 text-sm">{selectedEntry.employeeName}</p>
                <p className="text-stone-500">{selectedEntry.departmentName}</p>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-xl border border-stone-100 bg-stone-50 p-3">
                  <p className="text-[11px] text-stone-400">Leave Type</p>
                  <p className="font-semibold text-stone-800">{selectedEntry.displayType}</p>
                </div>
                <div className="rounded-xl border border-stone-100 bg-stone-50 p-3">
                  <p className="text-[11px] text-stone-400">Status</p>
                  <span
                    className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-bold uppercase text-[10px] ${
                      selectedEntry.status === 'approved'
                        ? 'bg-emerald-100 text-emerald-800'
                        : 'bg-amber-100 text-amber-800'
                    }`}
                  >
                    {selectedEntry.status}
                  </span>
                </div>
              </div>

              <div className="rounded-xl border border-stone-100 bg-stone-50 p-3">
                <p className="text-[11px] text-stone-400">Schedule &amp; Duration</p>
                <p className="font-semibold text-stone-800">
                  {selectedEntry.startDate} to {selectedEntry.endDate}
                </p>
                <p className="mt-1 text-stone-500">
                  Total Working Days: <strong>{selectedEntry.days} days</strong> (excluding weekends &amp; holidays)
                </p>
              </div>

              {selectedEntry.reason ? (
                <div className="rounded-xl border border-stone-100 bg-stone-50 p-3">
                  <p className="text-[11px] text-stone-400">Request Reason</p>
                  <p className="text-stone-700 italic">"{selectedEntry.reason}"</p>
                </div>
              ) : (
                <div className="rounded-xl border border-stone-200 bg-stone-50/50 p-3 text-stone-400 italic text-[11px]">
                  Reason and medical particulars redacted under workplace privacy protections.
                </div>
              )}
            </div>

            <div className="mt-5 flex justify-end border-t border-stone-100 pt-3">
              <button
                type="button"
                onClick={() => setSelectedEntry(null)}
                className="btn btn-secondary text-xs"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Configure Calendar Modal ─────────────────────────────────────────── */}
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
                  defaultValue={(
                    defaultCal?.publicHolidays ?? [
                      '2026-01-01',
                      '2026-05-01',
                      '2026-06-01',
                      '2026-10-10',
                      '2026-10-20',
                      '2026-12-12',
                      '2026-12-25',
                      '2026-12-26',
                    ]
                  ).join('\n')}
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
