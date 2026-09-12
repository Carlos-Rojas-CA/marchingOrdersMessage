/**
 * Display helpers.
 *
 * The governing rule: a trip's times are shown as they are written, in the
 * place they happen. Nothing here converts through the device's timezone,
 * because the traveller reading "check in 6:00 PM" is standing in Tokyo, not
 * wherever their phone last thought it was.
 */

const ZONED_ISO = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/;
const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;
const MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
] as const;

/** `2026-09-13T18:00:00+09:00` → `6:00 PM`. Empty when there is no usable time. */
export function formatTimeOfDay(iso: string | undefined): string {
  if (!iso) return '';
  const match = ZONED_ISO.exec(iso);
  if (!match) return '';

  const hours = Number(match[4]);
  const minutes = match[5]!;
  if (hours > 23) return '';

  const period = hours < 12 ? 'AM' : 'PM';
  const twelve = hours % 12 === 0 ? 12 : hours % 12;
  return `${twelve}:${minutes} ${period}`;
}

/** `2026-09-13` → `Sun, Sep 13`. Anything else is passed through untouched. */
export function formatDayLabel(date: string): string {
  const match = DATE_ONLY.exec(date);
  if (!match) return date;

  const [, year, month, day] = match;
  // UTC construction keeps the weekday derived from the literal date rather
  // than from the device's offset, which could shift it by a day.
  const at = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  return `${DAYS[at.getUTCDay()]}, ${MONTHS[at.getUTCMonth()]} ${at.getUTCDate()}`;
}

/**
 * Byte counts as a person would judge them before a download.
 *
 * MB is the working unit — it is what a roaming allowance is measured in — with
 * KB only for values too small to show as MB at all.
 */
export function formatSize(bytes: number): string {
  if (bytes > 0 && bytes < 100_000) {
    return `${Math.round(bytes / 1024)} KB`;
  }
  const mb = bytes / 1_000_000;
  return `${mb.toFixed(mb === 0 || mb >= 100 ? 0 : 1)} MB`;
}
