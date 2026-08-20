import { describe, it, expect } from "vitest";
import {
  hasCount,
  hasRequiredCount,
  isLogStarted,
  findIncompleteLogs,
} from "./log-validation";

describe("hasCount", () => {
  it("accepts positive numbers and numeric strings", () => {
    expect(hasCount(12)).toBe(true);
    expect(hasCount("12")).toBe(true);
    expect(hasCount("43")).toBe(true);
  });

  it("rejects the values that were slipping through", () => {
    // "" is what an untouched input field saved.
    expect(hasCount("")).toBe(false);
    expect(hasCount(null)).toBe(false);
    expect(hasCount(undefined)).toBe(false);
    expect(hasCount(0)).toBe(false);
    expect(hasCount("0")).toBe(false);
    expect(hasCount("abc")).toBe(false);
  });
});

describe("hasRequiredCount", () => {
  it("requires seconds for a hold", () => {
    expect(hasRequiredCount({ isStaticHold: true, seconds: "43" })).toBe(true);
    // The exact bug seen in the grid: 92 lbs, hold flagged, no duration.
    expect(hasRequiredCount({ isStaticHold: true, seconds: "" })).toBe(false);
    expect(hasRequiredCount({ isTSC: true, seconds: undefined })).toBe(false);
  });

  it("requires reps for a normal set", () => {
    expect(hasRequiredCount({ reps: "8" })).toBe(true);
    expect(hasRequiredCount({ reps: "" })).toBe(false);
  });

  it("does not accept the wrong unit", () => {
    // A hold with reps but no seconds is still missing its measurement.
    expect(hasRequiredCount({ isStaticHold: true, reps: "8", seconds: "" })).toBe(
      false,
    );
    // A normal set is not satisfied by a stray seconds value.
    expect(hasRequiredCount({ reps: "", seconds: "43" })).toBe(false);
  });

  it("treats a missing log as incomplete", () => {
    expect(hasRequiredCount(undefined)).toBe(false);
    expect(hasRequiredCount(null)).toBe(false);
  });
});

describe("isLogStarted", () => {
  it("is true once anything has been entered", () => {
    expect(isLogStarted({ weight: "92" })).toBe(true);
    expect(isLogStarted({ repQuality: 2 })).toBe(true);
    expect(isLogStarted({ reps: "8" })).toBe(true);
  });

  it("is false for an untouched row", () => {
    expect(isLogStarted({})).toBe(false);
    expect(isLogStarted({ weight: "", reps: "", seconds: "" })).toBe(false);
    expect(isLogStarted(undefined)).toBe(false);
  });
});

describe("findIncompleteLogs", () => {
  it("flags a hold saved without seconds", () => {
    const result = findIncompleteLogs({
      s1_hipabd: {
        machineId: "m-hip-abd",
        weight: "92",
        isStaticHold: true,
        seconds: "",
        repQuality: 2,
      },
    });
    expect(result).toEqual([
      { key: "s1_hipabd", machineId: "m-hip-abd", reason: "missing-seconds" },
    ]);
  });

  it("flags a normal set saved without reps", () => {
    const result = findIncompleteLogs({
      s1_pulldown: { machineId: "m-pulldown", weight: "114", reps: "" },
    });
    expect(result[0].reason).toBe("missing-reps");
  });

  it("ignores rows nobody touched", () => {
    expect(
      findIncompleteLogs({
        s1_untouched: { machineId: "m-chest-press" },
        s1_blank: { machineId: "m-dip", weight: "", reps: "" },
      }),
    ).toEqual([]);
  });

  it("ignores properly completed sets", () => {
    expect(
      findIncompleteLogs({
        s1_legcurl: {
          machineId: "m-leg-curl",
          weight: "92",
          isStaticHold: true,
          seconds: "43",
          repQuality: 3,
        },
        s1_legext: { machineId: "m-ext", weight: "52", reps: "11" },
      }),
    ).toEqual([]);
  });

  it("returns every offender, not just the first", () => {
    const result = findIncompleteLogs({
      a: { machineId: "m-hip-abd", weight: "92", isStaticHold: true, seconds: "" },
      b: { machineId: "m-pulldown", weight: "114", isTSC: true, seconds: "" },
      c: { machineId: "m-ext", weight: "52", reps: "11" },
    });
    expect(result.map((r) => r.machineId)).toEqual(["m-hip-abd", "m-pulldown"]);
  });
});
