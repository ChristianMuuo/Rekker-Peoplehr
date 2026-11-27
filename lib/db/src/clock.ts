/**
 * Clock abstraction for deterministic, timezone-aware dates across PeopleOS.
 * Storage is always UTC; business calendar display defaults to Africa/Nairobi (UTC+3).
 */
export const NAIROBI_TIMEZONE = "Africa/Nairobi";
export const NAIROBI_OFFSET_MS = 3 * 60 * 60 * 1000;

export interface AppClock {
  now(): Date;
  todayNairobi(): string; // YYYY-MM-DD in Africa/Nairobi
  formatDateNairobi(date: Date | string): string;
  currentYearNairobi(): number;
  currentMonthNairobi(): number; // 1..12
  addDaysIso(baseIso: string, deltaDays: number): string;
  addMonthsIso(baseIso: string, deltaMonths: number): string;
}

class SystemAppClock implements AppClock {
  private frozenNow: Date | null = null;

  setFrozenTime(date: Date | string | null): void {
    if (date === null) {
      this.frozenNow = null;
      return;
    }
    this.frozenNow = date instanceof Date ? new Date(date.getTime()) : new Date(date);
  }

  now(): Date {
    return this.frozenNow ? new Date(this.frozenNow.getTime()) : new Date();
  }

  todayNairobi(): string {
    const instant = this.now();
    try {
      const parts = new Intl.DateTimeFormat("en-CA", {
        timeZone: NAIROBI_TIMEZONE,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).formatToParts(instant);
      const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
      return `${get("year")}-${get("month")}-${get("day")}`;
    } catch {
      return new Date(instant.getTime() + NAIROBI_OFFSET_MS).toISOString().slice(0, 10);
    }
  }

  formatDateNairobi(date: Date | string): string {
    const d = date instanceof Date ? date : new Date(date);
    if (Number.isNaN(d.getTime())) return String(date);
    return new Intl.DateTimeFormat("en-KE", {
      timeZone: NAIROBI_TIMEZONE,
      year: "numeric",
      month: "short",
      day: "numeric",
    }).format(d);
  }

  currentYearNairobi(): number {
    return Number(this.todayNairobi().slice(0, 4));
  }

  currentMonthNairobi(): number {
    return Number(this.todayNairobi().slice(5, 7));
  }

  addDaysIso(baseIso: string, deltaDays: number): string {
    const d = new Date(`${baseIso.slice(0, 10)}T00:00:00.000Z`);
    d.setUTCDate(d.getUTCDate() + deltaDays);
    return d.toISOString().slice(0, 10);
  }

  addMonthsIso(baseIso: string, deltaMonths: number): string {
    const d = new Date(`${baseIso.slice(0, 10)}T00:00:00.000Z`);
    d.setUTCMonth(d.getUTCMonth() + deltaMonths);
    return d.toISOString().slice(0, 10);
  }
}

export const appClock = new SystemAppClock();

export function createFixedClock(isoInstant: string): AppClock {
  const fixed = new SystemAppClock();
  fixed.setFrozenTime(isoInstant);
  return fixed;
}
