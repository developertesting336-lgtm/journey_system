import { describe, it, expect } from "vitest";
import { planLegacyImport } from "./legacy-import-utils";
import type {
  ValidationSession,
  ValidationLog,
} from "../services/geminiService";

function log(overrides: Partial<ValidationLog> = {}): ValidationLog {
  return {
    id: `log-${Math.random()}`,
    name: "Leg Press",
    machineId: "m-leg-press",
    weight: 120,
    reps: 8,
    isStaticHold: false,
    ...overrides,
  };
}

function session(
  sessionNumber: number,
  machines: ValidationLog[],
  overrides: Partial<ValidationSession> = {},
): ValidationSession {
  return {
    id: `sess-${sessionNumber}`,
    sessionNumber,
    date: "2026-05-04",
    trainer: "MB",
    trainerId: "trainer-mb",
    machines,
    ...overrides,
  };
}

/**
 * Mirrors the Dale Kermode chart: six real session columns followed by blank
 * columns that the OCR still returns headers for and the chronology engine
 * back-dates. Those blanks are what must never reach Firestore.
 */
function chartWithTrailingBlanks(): ValidationSession[] {
  const real = [1, 2, 3, 4, 5, 6].map((n) =>
    session(n, [log(), log({ name: "Lumbar", machineId: "m-lumbar" })]),
  );
  const blanks = [7, 8, 9, 10, 11, 12].map((n) =>
    session(n, [], { trainer: "Legacy", isInferredDate: true }),
  );
  return [...real, ...blanks];
}

describe("planLegacyImport", () => {
  it("excludes sessions that have no exercises", () => {
    const plan = planLegacyImport(chartWithTrailingBlanks());

    expect(plan.sessionsToImport).toHaveLength(6);
    expect(plan.sessionsToImport.map((s) => s.sessionNumber)).toEqual([
      1, 2, 3, 4, 5, 6,
    ]);
    expect(plan.skippedEmptySessionNumbers).toEqual([7, 8, 9, 10, 11, 12]);
  });

  it("derives completedSessions from real sessions only", () => {
    const all = chartWithTrailingBlanks();
    // The bug this guards: incrementing by every column rather than the real ones.
    expect(all).toHaveLength(12);
    expect(planLegacyImport(all).sessionsToImport.length).toBe(6);
  });

  it("takes sessionCount from the highest imported session, not the blanks", () => {
    // Blank column 12 must not become the client's session count.
    expect(planLegacyImport(chartWithTrailingBlanks()).highestSessionNumber).toBe(
      6,
    );
  });

  it("counts only logs that matched a machine", () => {
    const plan = planLegacyImport([
      session(1, [
        log(),
        log({ name: "Mystery Machine", machineId: undefined }),
        log({ name: "Lumbar", machineId: "m-lumbar" }),
      ]),
    ]);

    expect(plan.totalLogs).toBe(2);
  });

  it("reports unmatched exercises instead of hiding them", () => {
    const plan = planLegacyImport([
      session(3, [
        log(),
        log({ name: "Squat Rack", rawName: "sqt rk", machineId: undefined }),
      ]),
    ]);

    expect(plan.droppedLogs).toEqual([
      { sessionNumber: 3, name: "Squat Rack", rawName: "sqt rk" },
    ]);
  });

  it("does not report dropped logs from sessions that were skipped entirely", () => {
    // An empty session has no logs to drop; it must not double-report.
    const plan = planLegacyImport([session(1, []), session(2, [log()])]);

    expect(plan.skippedEmptySessionNumbers).toEqual([1]);
    expect(plan.droppedLogs).toEqual([]);
  });

  it("returns an empty plan when nothing has exercises", () => {
    const plan = planLegacyImport([session(1, []), session(2, [])]);

    expect(plan.sessionsToImport).toEqual([]);
    expect(plan.totalLogs).toBe(0);
    expect(plan.highestSessionNumber).toBe(0);
    expect(plan.skippedEmptySessionNumbers).toEqual([1, 2]);
  });

  it("handles a chart with no blank columns unchanged", () => {
    const clean = [1, 2, 3].map((n) => session(n, [log()]));
    const plan = planLegacyImport(clean);

    expect(plan.sessionsToImport).toHaveLength(3);
    expect(plan.skippedEmptySessionNumbers).toEqual([]);
    expect(plan.highestSessionNumber).toBe(3);
    expect(plan.totalLogs).toBe(3);
  });

  it("keeps non-contiguous session numbers intact", () => {
    // Page 2 of a multi-page chart continues numbering; gaps must not renumber.
    const plan = planLegacyImport([
      session(13, [log()]),
      session(14, []),
      session(15, [log()]),
    ]);

    expect(plan.sessionsToImport.map((s) => s.sessionNumber)).toEqual([13, 15]);
    expect(plan.highestSessionNumber).toBe(15);
  });
});
