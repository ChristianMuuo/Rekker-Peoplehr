/**
 * Dynamic demo-date helpers.
 * All demo records are expressed as offsets from today (Africa/Nairobi clock),
 * so the UI always looks current regardless of when it is viewed.
 *
 * Usage:
 *   demoDate(-30)          → ISO date 30 days ago   e.g. "2026-10-26"
 *   demoDate(7)            → ISO date 7 days ahead
 *   demoDateTime(-10, '09:00') → ISO datetime string
 *   demoYearMonth(-1)      → "YYYY-MM" for the previous month
 */

const NAIROBI_OFFSET_MS = 3 * 60 * 60 * 1000; // UTC+3

function todayNairobi(): Date {
  const now = new Date();
  const utc = now.getTime() + now.getTimezoneOffset() * 60_000;
  return new Date(utc + NAIROBI_OFFSET_MS);
}

/** Returns an ISO date string (YYYY-MM-DD) offset by deltaDays from today (EAT). */
export function demoDate(deltaDays: number): string {
  const d = todayNairobi();
  d.setDate(d.getDate() + deltaDays);
  return d.toISOString().slice(0, 10);
}

/** Returns an ISO datetime string (YYYY-MM-DDTHH:mm:ssZ) offset by deltaDays at the given UTC time. */
export function demoDateTime(deltaDays: number, timeUtc = "09:00:00"): string {
  return `${demoDate(deltaDays)}T${timeUtc}Z`;
}

/** Returns "YYYY-MM" for the month that is deltaMonths before/after the current month. */
export function demoYearMonth(deltaMonths: number): string {
  const d = todayNairobi();
  d.setDate(1);
  d.setMonth(d.getMonth() + deltaMonths);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${yyyy}-${mm}`;
}

/** Returns the current year as a string. */
export function demoYear(): string {
  return String(todayNairobi().getFullYear());
}

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

/** Returns "Month YYYY" (e.g. "November 2026") for deltaMonths before/after current Nairobi month. */
export function demoMonthLabel(deltaMonths: number): string {
  const d = todayNairobi();
  d.setDate(1);
  d.setMonth(d.getMonth() + deltaMonths);
  return `${MONTH_NAMES[d.getMonth()]} ${d.getFullYear()}`;
}

/** Returns month names from January through the current Nairobi month (for P9A YTD cards). */
export function demoYtdMonthNames(): string[] {
  const mIdx = todayNairobi().getMonth();
  return MONTH_NAMES.slice(0, mIdx + 1);
}

/** Returns current calendar year as a number in Africa/Nairobi time. */
export function demoYearNumber(): number {
  return todayNairobi().getFullYear();
}
