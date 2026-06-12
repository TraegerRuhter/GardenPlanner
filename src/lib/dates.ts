/**
 * Date helpers. All horticulture math runs on ISO dates ("YYYY-MM-DD") at
 * UTC noon so DST and timezone shifts can never move a calendar day (§6).
 */

export type ISODate = string;

export function toDate(iso: ISODate): Date {
  return new Date(`${iso}T12:00:00Z`);
}

export function toISO(d: Date): ISODate {
  return d.toISOString().slice(0, 10);
}

export function todayISO(): ISODate {
  return toISO(new Date());
}

export function addDays(iso: ISODate, days: number): ISODate {
  const d = toDate(iso);
  d.setUTCDate(d.getUTCDate() + days);
  return toISO(d);
}

export function addWeeks(iso: ISODate, weeks: number): ISODate {
  return addDays(iso, Math.round(weeks * 7));
}

/** Whole days from a to b (positive when b is later). */
export function diffDays(a: ISODate, b: ISODate): number {
  return Math.round((toDate(b).getTime() - toDate(a).getTime()) / 86_400_000);
}

export function dayOfYear(iso: ISODate): number {
  const d = toDate(iso);
  const jan1 = new Date(Date.UTC(d.getUTCFullYear(), 0, 1, 12));
  return Math.round((d.getTime() - jan1.getTime()) / 86_400_000) + 1;
}

/** Materialize a day-of-year in a given year (clamps Dec 31 overflow). */
export function fromDayOfYear(year: number, doy: number): ISODate {
  const jan1 = new Date(Date.UTC(year, 0, 1, 12));
  jan1.setUTCDate(jan1.getUTCDate() + Math.min(doy, isLeap(year) ? 366 : 365) - 1);
  return toISO(jan1);
}

export function isLeap(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

export function monthOf(iso: ISODate): number {
  return Number(iso.slice(5, 7));
}

export function yearOf(iso: ISODate): number {
  return Number(iso.slice(0, 4));
}

/** "MM-DD" — climate profiles store frost dates year-agnostically (§7.8). */
export function monthDayOf(iso: ISODate): string {
  return iso.slice(5);
}

/** Materialize an "MM-DD" (or full ISO) in a specific year. */
export function inYear(monthDay: string, year: number): ISODate {
  const md = monthDay.length === 5 ? monthDay : monthDay.slice(5);
  return `${year}-${md}`;
}

export function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return NaN;
  const idx = (p / 100) * (sorted.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  const frac = idx - lo;
  return sorted[lo] * (1 - frac) + sorted[hi] * frac;
}

export function formatShort(iso: ISODate): string {
  const d = toDate(iso);
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}
