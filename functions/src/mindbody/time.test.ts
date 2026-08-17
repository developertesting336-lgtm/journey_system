import { describe, it, expect } from "vitest";
import {
  wallClockToInstant,
  isValidTimeZone,
  DEFAULT_TIME_ZONE,
} from "./time";

const ET = "America/New_York";

const readInEt = (d: Date | null) =>
  d === null
    ? null
    : new Intl.DateTimeFormat("en-US", {
        timeZone: ET,
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
      }).format(d);

describe("wallClockToInstant", () => {
  it("reads a MindBody time on the studio clock, not the host's", () => {
    // Cloud Functions run in UTC. Without this, 07:00 was stored as 07:00 UTC,
    // which is 3:00 AM at an Eastern studio.
    const instant = wallClockToInstant("2026-08-18T07:00:00", ET);
    expect(instant?.toISOString()).toBe("2026-08-18T11:00:00.000Z");
    expect(readInEt(instant)).toBe("7:00 AM");
  });

  it("is unaffected by the process timezone", () => {
    // Same input, same answer, regardless of where this test runs.
    const a = wallClockToInstant("2026-08-18T07:00:00", ET);
    process.env.TZ = "UTC";
    const b = wallClockToInstant("2026-08-18T07:00:00", ET);
    expect(a?.toISOString()).toBe(b?.toISOString());
  });

  it("applies standard time in winter", () => {
    expect(wallClockToInstant("2026-01-15T07:00:00", ET)?.toISOString()).toBe(
      "2026-01-15T12:00:00.000Z",
    );
  });

  it("leaves absolute timestamps alone", () => {
    expect(wallClockToInstant("2026-08-18T11:00:00Z", ET)?.toISOString()).toBe(
      "2026-08-18T11:00:00.000Z",
    );
    expect(
      wallClockToInstant("2026-08-18T07:00:00-04:00", ET)?.toISOString(),
    ).toBe("2026-08-18T11:00:00.000Z");
  });

  it("falls back to Eastern when handed an unusable zone", () => {
    expect(
      wallClockToInstant("2026-08-18T07:00:00", "Mars/Olympus")?.toISOString(),
    ).toBe("2026-08-18T11:00:00.000Z");
    expect(DEFAULT_TIME_ZONE).toBe(ET);
  });

  it("returns null rather than an Invalid Date", () => {
    expect(wallClockToInstant(null, ET)).toBeNull();
    expect(wallClockToInstant(undefined, ET)).toBeNull();
    expect(wallClockToInstant("", ET)).toBeNull();
    expect(wallClockToInstant("not a time", ET)).toBeNull();
  });

  it("validates timezones", () => {
    expect(isValidTimeZone(ET)).toBe(true);
    expect(isValidTimeZone("nonsense")).toBe(false);
    expect(isValidTimeZone(undefined)).toBe(false);
  });
});
