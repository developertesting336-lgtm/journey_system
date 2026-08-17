/**
 * Timezone handling for inbound MindBody payloads.
 *
 * MindBody sends appointment times as site-local wall clock with no offset
 * ("2026-08-18T07:00:00"). Passing that to `new Date()` resolves it against the
 * host's timezone — and Cloud Functions run in UTC, so a 7:00 AM booking at an
 * Eastern studio was being stored as 07:00 UTC, i.e. 3:00 AM local. Every live
 * booking arrived four or five hours early.
 *
 * Deliberately duplicated from src/lib/studio-time.ts: functions/ is a separate
 * package with its own dependency tree and cannot import from the app bundle.
 */

export const DEFAULT_TIME_ZONE = "America/New_York";

export function isValidTimeZone(tz?: string | null): boolean {
  if (!tz || typeof tz !== "string" || !tz.trim()) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** Formatters are costly to build and safe to share, so cache one per zone. */
const offsetFormatters = new Map<string, Intl.DateTimeFormat>();

function offsetFormatter(tz: string): Intl.DateTimeFormat {
  let f = offsetFormatters.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      hour12: false,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    offsetFormatters.set(tz, f);
  }
  return f;
}

/** Milliseconds between a UTC instant and the wall clock reading in `tz`. */
function zoneOffsetMs(at: Date, tz: string): number {
  const parts = offsetFormatter(tz).formatToParts(at);

  const get = (type: string) =>
    Number(parts.find((p) => p.type === type)?.value ?? "0");

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

/**
 * Resolves a naive wall-clock string to the instant it names in `tz`.
 *
 * Strings already carrying `Z` or an explicit offset are unambiguous and are
 * returned as-is. Resolution takes two passes because the offset depends on the
 * instant, which lands an hour off on DST transition days otherwise.
 */
export function wallClockToInstant(
  value: unknown,
  tz: string = DEFAULT_TIME_ZONE,
): Date | null {
  if (value === null || value === undefined) return null;
  const raw = String(value).trim();
  if (!raw) return null;

  const zone = isValidTimeZone(tz) ? tz : DEFAULT_TIME_ZONE;

  if (/(?:Z|[+-]\d{2}:?\d{2})$/.test(raw)) {
    const abs = new Date(raw);
    return isNaN(abs.getTime()) ? null : abs;
  }

  const m = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?/.exec(raw);
  if (!m) {
    const fallback = new Date(raw);
    return isNaN(fallback.getTime()) ? null : fallback;
  }

  const [, y, mo, d, h, mi, s] = m;
  const naive = Date.UTC(+y, +mo - 1, +d, +h, +mi, +(s ?? 0));
  let ms = naive - zoneOffsetMs(new Date(naive), zone);
  ms = naive - zoneOffsetMs(new Date(ms), zone);
  return new Date(ms);
}
