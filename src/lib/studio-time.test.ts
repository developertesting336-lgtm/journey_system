import { describe, it, expect, beforeEach } from "vitest";
import {
  DEFAULT_TIME_ZONE,
  setActiveTimeZone,
  getActiveTimeZone,
  isValidTimeZone,
  toDate,
  studioDateKey,
  startOfStudioDay,
  endOfStudioDay,
  isSameStudioDay,
  formatStudioTime,
  formatStudioDate,
  zonedHM,
  studioHour,
  calendarLabelKey,
  studioDayBoundsForKey,
  wallClockToInstant,
} from "./studio-time";

const ET = "America/New_York";

beforeEach(() => {
  setActiveTimeZone(ET);
});

describe("timezone configuration", () => {
  it("defaults to Eastern", () => {
    setActiveTimeZone(undefined);
    expect(getActiveTimeZone()).toBe(DEFAULT_TIME_ZONE);
    expect(DEFAULT_TIME_ZONE).toBe("America/New_York");
  });

  it("ignores a garbage timezone rather than throwing", () => {
    setActiveTimeZone("Not/AZone");
    expect(getActiveTimeZone()).toBe(DEFAULT_TIME_ZONE);
  });

  it("accepts a real timezone", () => {
    setActiveTimeZone("America/Chicago");
    expect(getActiveTimeZone()).toBe("America/Chicago");
  });

  it("validates timezone strings", () => {
    expect(isValidTimeZone("America/New_York")).toBe(true);
    expect(isValidTimeZone("")).toBe(false);
    expect(isValidTimeZone(null)).toBe(false);
    expect(isValidTimeZone("Mars/Olympus")).toBe(false);
  });
});

describe("toDate", () => {
  it("accepts Firestore Timestamp-like objects", () => {
    const real = new Date("2026-05-26T13:15:00Z");
    expect(toDate({ toDate: () => real })?.toISOString()).toBe(
      real.toISOString(),
    );
  });

  it("accepts ISO strings and epoch millis", () => {
    expect(toDate("2026-05-26T13:15:00Z")?.getTime()).toBe(
      Date.parse("2026-05-26T13:15:00Z"),
    );
    expect(toDate(1779887700000)?.getTime()).toBe(1779887700000);
  });

  it("returns null for unusable input instead of Invalid Date", () => {
    expect(toDate(null)).toBeNull();
    expect(toDate(undefined)).toBeNull();
    expect(toDate("not a date")).toBeNull();
  });

  it("reads a Timestamp that lost its prototype", () => {
    // {seconds, nanoseconds} with no methods — the shape that rendered
    // "INVALID DATE" in the session grid.
    expect(toDate({ seconds: 1787000000, nanoseconds: 0 } as any)?.getTime()).toBe(
      1787000000000,
    );
  });

  it("reads a Timestamp exposing only toMillis", () => {
    expect(toDate({ toMillis: () => 1787000000000 } as any)?.getTime()).toBe(
      1787000000000,
    );
  });

  it("returns null for an object with no usable time at all", () => {
    expect(toDate({} as any)).toBeNull();
    expect(toDate({ foo: "bar" } as any)).toBeNull();
  });

  it("formats a prototype-less Timestamp rather than 'Invalid Date'", () => {
    const stripped = { seconds: 1787000000, nanoseconds: 0 } as any;
    expect(formatStudioTime(stripped, ET)).not.toContain("Invalid");
    expect(formatStudioTime({} as any, ET, "")).toBe("");
  });
});

describe("studio calendar day", () => {
  it("buckets a late-evening ET appointment onto the correct ET day", () => {
    // 01:15 UTC on the 27th is 21:15 ET on the 26th.
    const instant = new Date("2026-05-27T01:15:00Z");
    expect(studioDateKey(instant, ET)).toBe("2026-05-26");
  });

  it("does not shift with the machine's own timezone", () => {
    // Same instant, explicitly asked for in two zones: the ET answer must hold
    // regardless of where the test process runs.
    const instant = new Date("2026-05-27T01:15:00Z");
    expect(studioDateKey(instant, ET)).toBe("2026-05-26");
    expect(studioDateKey(instant, "UTC")).toBe("2026-05-27");
  });

  it("starts the ET day at 04:00 UTC during daylight saving", () => {
    // EDT is UTC-4, so midnight ET on 26 May is 04:00 UTC.
    const start = startOfStudioDay(new Date("2026-05-26T18:00:00Z"), ET);
    expect(start.toISOString()).toBe("2026-05-26T04:00:00.000Z");
  });

  it("starts the ET day at 05:00 UTC during standard time", () => {
    // EST is UTC-5, so midnight ET on 15 Jan is 05:00 UTC.
    const start = startOfStudioDay(new Date("2026-01-15T18:00:00Z"), ET);
    expect(start.toISOString()).toBe("2026-01-15T05:00:00.000Z");
  });

  it("handles the spring-forward day, when the ET day is 23 hours long", () => {
    // 8 March 2026: clocks jump 02:00 -> 03:00 ET.
    const start = startOfStudioDay(new Date("2026-03-08T12:00:00Z"), ET);
    const end = endOfStudioDay(new Date("2026-03-08T12:00:00Z"), ET);
    const hours = (end.getTime() + 1 - start.getTime()) / 3_600_000;
    expect(start.toISOString()).toBe("2026-03-08T05:00:00.000Z");
    expect(hours).toBe(23);
  });

  it("handles the fall-back day, when the ET day is 25 hours long", () => {
    // 1 November 2026: clocks fall 02:00 -> 01:00 ET.
    const start = startOfStudioDay(new Date("2026-11-01T12:00:00Z"), ET);
    const end = endOfStudioDay(new Date("2026-11-01T12:00:00Z"), ET);
    const hours = (end.getTime() + 1 - start.getTime()) / 3_600_000;
    expect(hours).toBe(25);
  });

  it("bounds contain the whole studio day and nothing outside it", () => {
    const noonEt = new Date("2026-05-26T16:00:00Z");
    const start = startOfStudioDay(noonEt, ET);
    const end = endOfStudioDay(noonEt, ET);

    expect(studioDateKey(start, ET)).toBe("2026-05-26");
    expect(studioDateKey(end, ET)).toBe("2026-05-26");
    expect(studioDateKey(new Date(start.getTime() - 1), ET)).toBe("2026-05-25");
    expect(studioDateKey(new Date(end.getTime() + 1), ET)).toBe("2026-05-27");
  });

  it("treats two instants on the same ET day as the same day", () => {
    expect(
      isSameStudioDay(
        new Date("2026-05-26T13:00:00Z"), // 09:00 ET
        new Date("2026-05-27T01:00:00Z"), // 21:00 ET, same ET day
        ET,
      ),
    ).toBe(true);
  });

  it("treats an instant that crosses the ET midnight as a different day", () => {
    expect(
      isSameStudioDay(
        new Date("2026-05-27T01:00:00Z"), // 21:00 ET on the 26th
        new Date("2026-05-27T05:00:00Z"), // 01:00 ET on the 27th
        ET,
      ),
    ).toBe(false);
  });
});

describe("calendar anchors vs instants", () => {
  it("labels a local anchor by its own Y/M/D, not a converted one", () => {
    // An anchor built locally for 18 Aug means 18 Aug, whatever zone we are in.
    const anchor = new Date(2026, 7, 18, 0, 0, 0);
    expect(calendarLabelKey(anchor)).toBe("2026-08-18");
  });

  it("bounds a named day by the studio clock", () => {
    const { start, end } = studioDayBoundsForKey("2026-08-18", ET);
    // EDT is UTC-4 in August.
    expect(start.toISOString()).toBe("2026-08-18T04:00:00.000Z");
    expect(end.toISOString()).toBe("2026-08-19T03:59:59.999Z");
  });

  it("selects exactly the appointments on that studio day", () => {
    const { start, end } = studioDayBoundsForKey("2026-08-18", ET);
    const within = (iso: string) => {
      const t = new Date(iso).getTime();
      return t >= start.getTime() && t <= end.getTime();
    };

    expect(within("2026-08-18T11:00:00Z")).toBe(true); // 07:00 ET, first slot
    expect(within("2026-08-19T00:30:00Z")).toBe(true); // 20:30 ET, last slot
    expect(within("2026-08-18T03:59:59Z")).toBe(false); // 23:59 ET previous day
    expect(within("2026-08-19T04:00:00Z")).toBe(false); // 00:00 ET next day
  });

  it("keeps a full studio day inside one hour band, not spread over 24", () => {
    // The regression: filtering by the viewer's day while reading studio hours
    // scattered a normal 7am-8pm schedule across every hour of the clock.
    const { start, end } = studioDayBoundsForKey("2026-08-18", ET);
    const appointments = [
      "2026-08-18T11:00:00Z", // 07:00 ET
      "2026-08-18T13:30:00Z", // 09:30 ET
      "2026-08-18T20:00:00Z", // 16:00 ET
      "2026-08-19T00:00:00Z", // 20:00 ET
    ].map((iso) => new Date(iso));

    const selected = appointments.filter(
      (d) => d >= start && d <= end,
    );
    expect(selected).toHaveLength(4);

    const hours = selected.map((d) => studioHour(d, ET)!);
    expect(Math.min(...hours)).toBe(7);
    expect(Math.max(...hours)).toBe(20);
  });
});

describe("wallClockToInstant", () => {
  it("resolves a MindBody wall-clock time against the studio, not the machine", () => {
    // MindBody sends site-local time with no offset. 07:00 at an ET studio is
    // 11:00 UTC in August, whatever timezone the syncing machine sits in.
    const instant = wallClockToInstant("2026-08-18T07:00:00", ET);
    expect(instant?.toISOString()).toBe("2026-08-18T11:00:00.000Z");
    expect(formatStudioTime(instant, ET)).toBe("7:00 AM");
  });

  it("round-trips every slot of a normal training day", () => {
    for (const [wall, expected] of [
      ["2026-08-18T06:00:00", "6:00 AM"],
      ["2026-08-18T12:30:00", "12:30 PM"],
      ["2026-08-18T20:00:00", "8:00 PM"],
    ] as const) {
      expect(formatStudioTime(wallClockToInstant(wall, ET), ET)).toBe(expected);
    }
  });

  it("uses standard time offsets in winter", () => {
    // EST is UTC-5, so 07:00 ET in January is 12:00 UTC.
    expect(wallClockToInstant("2026-01-15T07:00:00", ET)?.toISOString()).toBe(
      "2026-01-15T12:00:00.000Z",
    );
  });

  it("does not reinterpret a string that already carries an offset", () => {
    expect(wallClockToInstant("2026-08-18T07:00:00Z", ET)?.toISOString()).toBe(
      "2026-08-18T07:00:00.000Z",
    );
    expect(
      wallClockToInstant("2026-08-18T07:00:00-04:00", ET)?.toISOString(),
    ).toBe("2026-08-18T11:00:00.000Z");
  });

  it("accepts a space separator and missing seconds", () => {
    expect(wallClockToInstant("2026-08-18 07:00", ET)?.toISOString()).toBe(
      "2026-08-18T11:00:00.000Z",
    );
  });

  it("returns null for unusable input", () => {
    expect(wallClockToInstant(null, ET)).toBeNull();
    expect(wallClockToInstant("", ET)).toBeNull();
  });
});

describe("zonedHM / studioHour", () => {
  it("reads the studio wall clock, not the viewer's", () => {
    const instant = new Date("2026-05-26T13:15:00Z"); // 09:15 ET
    expect(zonedHM(instant, ET)).toEqual({ hour: 9, minute: 15 });
    expect(zonedHM(instant, "UTC")).toEqual({ hour: 13, minute: 15 });
  });

  it("reports midnight as hour 0, not 24", () => {
    // 04:00 UTC is exactly midnight ET in summer.
    expect(studioHour(new Date("2026-05-26T04:00:00Z"), ET)).toBe(0);
  });

  it("keeps an evening appointment in the evening", () => {
    // 01:15 UTC on the 27th is 21:15 ET on the 26th — must not read as 1 AM.
    expect(studioHour(new Date("2026-05-27T01:15:00Z"), ET)).toBe(21);
  });

  it("returns null for unusable input", () => {
    expect(zonedHM(null, ET)).toBeNull();
    expect(studioHour("nonsense", ET)).toBeNull();
  });
});

describe("formatting", () => {
  it("renders an appointment in studio time, not machine time", () => {
    const instant = new Date("2026-05-26T13:15:00Z"); // 09:15 ET
    expect(formatStudioTime(instant, ET)).toBe("9:15 AM");
    expect(formatStudioTime(instant, "UTC")).toBe("1:15 PM");
  });

  it("uses the configured active zone when none is passed", () => {
    setActiveTimeZone("UTC");
    expect(formatStudioTime(new Date("2026-05-26T13:15:00Z"))).toBe("1:15 PM");
    setActiveTimeZone(ET);
    expect(formatStudioTime(new Date("2026-05-26T13:15:00Z"))).toBe("9:15 AM");
  });

  it("formats the date in studio time across a midnight boundary", () => {
    const instant = new Date("2026-05-27T01:15:00Z");
    expect(formatStudioDate(instant, undefined, ET)).toBe("5/26/2026");
  });

  it("returns the fallback for missing values rather than 'Invalid Date'", () => {
    expect(formatStudioTime(null, ET)).toBe("--");
    expect(formatStudioDate(undefined, undefined, ET)).toBe("--");
    expect(formatStudioTime("nonsense", ET, "n/a")).toBe("n/a");
  });
});
