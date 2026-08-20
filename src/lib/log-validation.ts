import type { ExerciseLog } from "../types";

/**
 * A logged set must carry a measurement.
 *
 * Weight alone is not a record of work: the session rollup scores reps directly
 * and converts seconds for holds (`sync-utils`), so a set saved without either
 * counts as zero toward the client's lifetime reps and volume. It disappears
 * from their progress while still looking logged on screen.
 */

/** True when a value is a real, positive number. */
export function hasCount(value: unknown): boolean {
  if (value === null || value === undefined || value === "") return false;
  const n = Number(value);
  return !isNaN(n) && n > 0;
}

/**
 * Does this set record a measurement?
 *
 * Holds (TSC / static) are measured in seconds; everything else in reps. A set
 * flagged as a hold is not satisfied by a rep count, or vice versa — that
 * mismatch is how a duration ends up stored as a rep count.
 */
export function hasRequiredCount(
  log: Partial<ExerciseLog> | undefined | null,
): boolean {
  if (!log) return false;
  const isHold = Boolean(log.isStaticHold || log.isTSC);
  return isHold ? hasCount(log.seconds) : hasCount(log.reps);
}

/** Whether the trainer has entered anything at all for this set. */
export function isLogStarted(
  log: Partial<ExerciseLog> | undefined | null,
): boolean {
  if (!log) return false;
  return (
    hasCount(log.weight) ||
    hasCount(log.reps) ||
    hasCount(log.seconds) ||
    Boolean(log.repQuality)
  );
}

/**
 * Sets that were begun but never given a count — the ones that would silently
 * score zero. Returns each machine id with the reason, for reporting.
 */
export function findIncompleteLogs(
  logs: Record<string, Partial<ExerciseLog>>,
): { key: string; machineId: string; reason: "missing-seconds" | "missing-reps" }[] {
  return Object.entries(logs)
    .filter(([, log]) => isLogStarted(log) && !hasRequiredCount(log))
    .map(([key, log]) => ({
      key,
      machineId: String(log.machineId ?? ""),
      reason: (log.isStaticHold || log.isTSC
        ? "missing-seconds"
        : "missing-reps") as "missing-seconds" | "missing-reps",
    }));
}
