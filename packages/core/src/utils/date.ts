export function formatTimestamp(date: Date): string {
  return date.toISOString();
}

export function daysBetween(a: Date, b: Date): number {
  return Math.abs(a.getTime() - b.getTime()) / (1000 * 60 * 60 * 24);
}

export function isWithinDays(date: Date, days: number): boolean {
  return daysBetween(date, new Date()) <= days;
}

export function parseDate(value: string | Date): Date {
  return value instanceof Date ? value : new Date(value);
}
