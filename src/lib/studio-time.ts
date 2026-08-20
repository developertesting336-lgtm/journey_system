/**
 * Studio-local time.
 *
 * Every timestamp in Firestore is an absolute instant, but the app used to render
 * and bucket them in whatever timezone the viewer's browser happened to be in.
 * A trainer in Ohio and a developer elsewhere would see the same appointment at
 * different times, and "today's roster" would shift with the viewer.
 *
 * All display and day-bucketing goes through here instead, pinned to the active
 * studio's configured timezone.
 */

/** Used when a studio has no timezone configured. */
export const DEFAULT_TIME_ZONE = "America/New_York";

let activeTimeZone = DEFAULT_TIME_ZONE;

/**
 * Points every helper below at a studio's timezone. Called by
 * ActiveStudioContext when the active studio changes; the app only ever shows
 * one studio at a time, so a module-level value keeps call sites free of
 * plumbing.
 */
export function setActiveTimeZone(tz?: string | null): void {
  activeTimeZone = isValidTimeZone(tz) ? (tz as string) : DEFAULT_TIME_ZONE;
}

export function getActiveTimeZone(): string {
  return activeTimeZone;
}

const validZoneCache = new Map<string, boolean>();

export function isValidTimeZone(tz?: string | null): boolean {
  if (!tz || typeof tz !== "string" || !tz.trim()) return false;
  // setActiveTimeZone runs on every provider render, and the throwing path is
  // especially slow, so remember the verdict per string.
  const cached = validZoneCache.get(tz);
  if (cached !== undefined) return cached;
  let valid = false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    valid = true;
  } catch {
    valid = false;
  }
  validZoneCache.set(tz, valid);
  return valid;
}

/** Accepts Firestore Timestamps, Dates, ISO strings, or epoch millis. */
export type DateLike =
  | Date
  | string
  | number
  | { toDate: () => Date }
  | null
  | undefined;

export function toDate(value: DateLike): Date | null {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return isNaN(value.getTime()) ? null : value;

  if (typeof value === "object") {
    const obj = value as any;
    if (typeof obj.toDate === "function") {
      const d = obj.toDate();
      return d instanceof Date && !isNaN(d.getTime()) ? d : null;
    }
    if (typeof obj.toMillis === "function") {
      const ms = obj.toMillis();
      return typeof ms === "number" && !isNaN(ms) ? new Date(ms) : null;
    }
    // A Timestamp that lost its prototype — after cache rehydration or any
    // structured copy — arrives as a bare {seconds, nanoseconds}. Passing that
    // to `new Date()` yields Invalid Date, which is how "INVALID DATE" reached
    // the session grid.
    if (typeof obj.seconds === "number") {
      const ms = obj.seconds * 1000 + (obj.nanoseconds ?? 0) / 1e6;
      return isNaN(ms) ? null : new Date(ms);
    }
    return null;
  }

  const d = new Date(value as string | number);
  return isNaN(d.getTime()) ? null : d;
}

/**
 * Intl.DateTimeFormat construction costs roughly 80µs; reading from an existing
 * one costs well under 3µs. The calendar calls these helpers once per session
 * per slot per day, so building a formatter each time added seconds to a render
 * and froze the day filter. Formatters are immutable and safe to share, so each
 * (timezone, option-set) pair is built once and reused.
 */
const formatterCache = new Map<string, Intl.DateTimeFormat>();

function getFormatter(
  cacheKey: string,
  tz: string,
  options: Intl.DateTimeFormatOptions,
  locale = "en-US",
): Intl.DateTimeFormat {
  const key = `${locale}|${tz}|${cacheKey}`;
  let formatter = formatterCache.get(key);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat(locale, { ...options, timeZone: tz });
    formatterCache.set(key, formatter);
  }
  return formatter;
}

const OFFSET_OPTIONS: Intl.DateTimeFormatOptions = {
  hour12: false,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
};

/**
 * Milliseconds to add to a UTC instant to get the wall-clock reading in `tz`.
 * Derived from Intl rather than a hardcoded table so DST is handled by the
 * platform's tz database.
 */
function zoneOffsetMs(at: Date, tz: string): number {
  const parts = getFormatter("offset", tz, OFFSET_OPTIONS).formatToParts(at);

  const get = (type: string) =>
    Number(parts.find((p) => p.type === type)?.value ?? "0");

  // hour comes back as 24 at midnight under hour12:false in some engines.
  const asUtc = Date.UTC(
    get("year"),
    get("month") - 1,
    get("day"),
    get("hour") % 24,
    get("minute"),
    get("second"),
  );
  return asUtc - at.getTime();
}

/** Calendar year/month/day as read in the studio's timezone. */
export function zonedYMD(
  value: DateLike,
  tz: string = activeTimeZone,
): { year: number; month: number; day: number } | null {
  const d = toDate(value);
  if (!d) return null;
  const parts = getFormatter(
    "ymd",
    tz,
    { year: "numeric", month: "2-digit", day: "2-digit" },
    "en-CA",
  ).formatToParts(d);
  const get = (type: string) =>
    Number(parts.find((p) => p.type === type)?.value ?? "0");
  return { year: get("year"), month: get("month"), day: get("day") };
}

/**
 * Wall-clock hour and minute as read in the studio's timezone.
 *
 * Replaces `date.getHours()` / `date.getMinutes()`, which read the *viewer's*
 * clock — that is what dropped appointments into the wrong slot on a calendar
 * opened from another timezone.
 */
export function zonedHM(
  value: DateLike,
  tz: string = activeTimeZone,
): { hour: number; minute: number } | null {
  const d = toDate(value);
  if (!d) return null;
  const parts = getFormatter("hm", tz, {
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(d);
  const get = (type: string) =>
    Number(parts.find((p) => p.type === type)?.value ?? "0");
  return { hour: get("hour") % 24, minute: get("minute") };
}

/** Hour 0-23 in studio time, or null when the value is unusable. */
export function studioHour(
  value: DateLike,
  tz: string = activeTimeZone,
): number | null {
  return zonedHM(value, tz)?.hour ?? null;
}

/** `YYYY-MM-DD` for the studio's calendar day. Safe to compare or use as a key. */
export function studioDateKey(
  value: DateLike,
  tz: string = activeTimeZone,
): string | null {
  const ymd = zonedYMD(value, tz);
  if (!ymd) return null;
  return `${ymd.year}-${String(ymd.month).padStart(2, "0")}-${String(
    ymd.day,
  ).padStart(2, "0")}`;
}

/**
 * The instant at which the studio's calendar day begins.
 * Resolved in two passes because the offset itself depends on the instant —
 * a single pass lands an hour off on DST transition days.
 */
export function startOfStudioDay(
  value: DateLike = new Date(),
  tz: string = activeTimeZone,
): Date {
  const ymd = zonedYMD(value, tz) ?? zonedYMD(new Date(), tz)!;
  const naive = Date.UTC(ymd.year, ymd.month - 1, ymd.day, 0, 0, 0, 0);
  let instant = naive - zoneOffsetMs(new Date(naive), tz);
  instant = naive - zoneOffsetMs(new Date(instant), tz);
  return new Date(instant);
}

/**
 * Turns a naive wall-clock string into the instant it names in `tz`.
 *
 * MindBody returns appointment times as site-local wall clock with no offset
 * ("2026-08-18T07:00:00"). `new Date()` resolves those against the *browser's*
 * timezone, so syncing from a machine outside the studio's zone stored every
 * appointment shifted by the difference — data corruption that only became
 * visible once display stopped making the same mistake in reverse.
 *
 * Strings that already carry `Z` or an explicit offset are absolute and are
 * passed through untouched.
 */
export function wallClockToInstant(
  value: string | null | undefined,
  tz: string = activeTimeZone,
): Date | null {
  if (!value || typeof value !== "string") return null;
  const raw = value.trim();

  // Already unambiguous — do not reinterpret.
  if (/(?:Z|[+-]\d{2}:?\d{2})$/.test(raw)) return toDate(raw);

  const m = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?/.exec(raw);
  if (!m) return toDate(raw);

  const [, y, mo, d, h, mi, s] = m;
  const naive = Date.UTC(+y, +mo - 1, +d, +h, +mi, +(s ?? 0));
  let ms = naive - zoneOffsetMs(new Date(naive), tz);
  ms = naive - zoneOffsetMs(new Date(ms), tz);
  return new Date(ms);
}

/**
 * Calendar-day label for a locally-constructed anchor date.
 *
 * UI code builds dates like `new Date(); d.setDate(n)` purely to *name* a day —
 * a column header, a selected day button. Their local Y/M/D is the day they
 * mean, so they must never be run through a timezone conversion; doing so
 * relabels the column itself. Use this for anchors, and `studioDateKey` for real
 * timestamps.
 */
export function calendarLabelKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(
    2,
    "0",
  )}-${String(date.getDate()).padStart(2, "0")}`;
}

/**
 * The instants bounding a named calendar day in the studio's timezone.
 *
 * Pair this with `calendarLabelKey` whenever a locally-built anchor selects
 * which timestamps to show. Filtering with the viewer's midnight while reading
 * hours in studio time pulls in a window offset from the studio's actual day.
 */
export function studioDayBoundsForKey(
  key: string,
  tz: string = activeTimeZone,
): { start: Date; end: Date } {
  const [year, month, day] = key.split("-").map(Number);
  const naive = Date.UTC(year, month - 1, day, 0, 0, 0, 0);
  let startMs = naive - zoneOffsetMs(new Date(naive), tz);
  startMs = naive - zoneOffsetMs(new Date(startMs), tz);
  const start = new Date(startMs);
  return { start, end: endOfStudioDay(start, tz) };
}

/** The last millisecond of the studio's calendar day. */
export function endOfStudioDay(
  value: DateLike = new Date(),
  tz: string = activeTimeZone,
): Date {
  const start = startOfStudioDay(value, tz);
  const nextDay = new Date(start.getTime() + 36 * 60 * 60 * 1000);
  return new Date(startOfStudioDay(nextDay, tz).getTime() - 1);
}

/** True when both instants fall on the same studio calendar day. */
export function isSameStudioDay(
  a: DateLike,
  b: DateLike,
  tz: string = activeTimeZone,
): boolean {
  const ka = studioDateKey(a, tz);
  const kb = studioDateKey(b, tz);
  return ka !== null && ka === kb;
}

function format(
  value: DateLike,
  options: Intl.DateTimeFormatOptions,
  tz: string,
  fallback: string,
): string {
  const d = toDate(value);
  if (!d) return fallback;
  // Options vary here, so the cache key includes them. Still far cheaper than
  // rebuilding the formatter on every row.
  return getFormatter(JSON.stringify(options), tz, options).format(d);
}

/** e.g. "9:15 AM" */
export function formatStudioTime(
  value: DateLike,
  tz: string = activeTimeZone,
  fallback = "--",
): string {
  return format(
    value,
    { hour: "numeric", minute: "2-digit", hour12: true },
    tz,
    fallback,
  );
}

/** e.g. "5/26/2026" */
export function formatStudioDate(
  value: DateLike,
  options: Intl.DateTimeFormatOptions = {
    month: "numeric",
    day: "numeric",
    year: "numeric",
  },
  tz: string = activeTimeZone,
  fallback = "--",
): string {
  return format(value, options, tz, fallback);
}

/** e.g. "May 26, 2026, 9:15 AM" */
export function formatStudioDateTime(
  value: DateLike,
  tz: string = activeTimeZone,
  fallback = "--",
): string {
  return format(
    value,
    {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    },
    tz,
    fallback,
  );
}

/** Short zone label for the UI, e.g. "EDT". */
export function studioZoneLabel(tz: string = activeTimeZone): string {
  const parts = getFormatter("zoneLabel", tz, {
    timeZoneName: "short",
  }).formatToParts(new Date());
  return parts.find((p) => p.type === "timeZoneName")?.value ?? tz;
}
