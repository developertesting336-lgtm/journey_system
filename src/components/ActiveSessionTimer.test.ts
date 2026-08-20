import { describe, it, expect } from "vitest";
import { computeElapsedSeconds, toMillis } from "./ActiveSessionTimer";

const NOW = Date.parse("2026-08-18T12:00:00Z");
const min = (n: number) => n * 60_000;

describe("computeElapsedSeconds", () => {
  it("counts wall-clock time when the session has never been paused", () => {
    expect(
      computeElapsedSeconds({
        startMs: NOW - min(10),
        pausedAtMs: null,
        now: NOW,
      }),
    ).toBe(600);
  });

  it("subtracts completed pauses", () => {
    // Started 30 minutes ago, 10 of which were paused.
    expect(
      computeElapsedSeconds({
        startMs: NOW - min(30),
        pausedAtMs: null,
        totalPausedMs: min(10),
        now: NOW,
      }),
    ).toBe(min(20) / 1000);
  });

  it("holds steady while currently paused", () => {
    // Paused 5 minutes ago; the reading must not advance during the pause.
    const args = {
      startMs: NOW - min(30),
      pausedAtMs: NOW - min(5),
      totalPausedMs: 0,
    };
    expect(computeElapsedSeconds({ ...args, now: NOW })).toBe(min(25) / 1000);
    // One minute later, still paused: same value.
    expect(computeElapsedSeconds({ ...args, now: NOW + min(1) })).toBe(
      min(25) / 1000,
    );
  });

  it("combines an earlier pause with the one in progress", () => {
    expect(
      computeElapsedSeconds({
        startMs: NOW - min(60),
        pausedAtMs: NOW - min(5),
        totalPausedMs: min(10),
        now: NOW,
      }),
    ).toBe(min(45) / 1000);
  });

  it("survives a refresh mid-pause — the regression this replaced", () => {
    // Old behaviour kept pause totals in component state, so after a refresh the
    // break counted as training time. Derived from the document, it does not.
    const beforeRefresh = computeElapsedSeconds({
      startMs: NOW - min(30),
      pausedAtMs: NOW - min(10),
      totalPausedMs: 0,
      now: NOW,
    });
    const afterRefresh = computeElapsedSeconds({
      startMs: NOW - min(30),
      pausedAtMs: NOW - min(10),
      totalPausedMs: 0,
      now: NOW,
    });
    expect(afterRefresh).toBe(beforeRefresh);
    expect(afterRefresh).toBe(min(20) / 1000);
  });

  it("returns 0 rather than a negative number if the clock disagrees", () => {
    // Device clock behind the server's start timestamp.
    expect(
      computeElapsedSeconds({ startMs: NOW + min(5), pausedAtMs: null, now: NOW }),
    ).toBe(0);
  });

  it("returns 0 when there is no start time yet", () => {
    expect(
      computeElapsedSeconds({ startMs: null, pausedAtMs: null, now: NOW }),
    ).toBe(0);
  });

  it("treats a missing totalPausedMs as zero", () => {
    expect(
      computeElapsedSeconds({
        startMs: NOW - min(10),
        pausedAtMs: null,
        totalPausedMs: undefined,
        now: NOW,
      }),
    ).toBe(600);
  });
});

describe("toMillis", () => {
  it("reads Firestore Timestamps", () => {
    expect(toMillis({ toMillis: () => NOW })).toBe(NOW);
    expect(toMillis({ toDate: () => new Date(NOW) })).toBe(NOW);
  });

  it("reads Dates and ISO strings", () => {
    expect(toMillis(new Date(NOW))).toBe(NOW);
    expect(toMillis("2026-08-18T12:00:00Z")).toBe(NOW);
  });

  it("returns null for a pending serverTimestamp() and other empties", () => {
    // The case that froze the timer at 00:00 until the write confirmed.
    expect(toMillis(null)).toBeNull();
    expect(toMillis(undefined)).toBeNull();
    expect(toMillis("not a date")).toBeNull();
  });
});
