/**
 * Calendar days in Pakistan time (Asia/Karachi, UTC+5, no daylight saving) as yyyy-mm-dd — the
 * same days the database uses (its timezone is Asia/Karachi). Never use `new Date().toISOString()`
 * for "today": that is the UTC date, which is still yesterday between midnight and 5 AM in Pakistan.
 */
const PAKISTAN_OFFSET_MS = 5 * 3_600_000;
const DAY_MS = 86_400_000;

/** Today in Pakistan, plus `days` (negative for the past). */
export function pakistanToday(days = 0, now = Date.now()): string {
  return new Date(now + PAKISTAN_OFFSET_MS + days * DAY_MS).toISOString().slice(0, 10);
}

/** yyyy-mm-dd plus `days`. */
export function addDays(isoDate: string, days: number): string {
  return new Date(Date.parse(`${isoDate}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
}
