import type { ValidationSession } from "../services/geminiService";

export interface LegacyImportPlan {
  /** Sessions that will actually be written. */
  sessionsToImport: ValidationSession[];
  /** Session numbers dropped for having no exercises at all. */
  skippedEmptySessionNumbers: number[];
  /** Exercises the commit path discards because no machine matched. */
  droppedLogs: { sessionNumber: number; name: string; rawName?: string }[];
  /** Count of exercise logs that will be written. */
  totalLogs: number;
  /** Highest session number among imported sessions; becomes client.sessionCount. */
  highestSessionNumber: number;
}

/**
 * Decides what a legacy chart import will actually write.
 *
 * The OCR pass returns a header for all 12 grid columns even when a column is
 * blank, and the chronology engine then assigns those blanks an inferred date.
 * Importing them would create sessions with no exercises and inflate
 * `completedSessions`, which uses `increment()` and therefore compounds on every
 * re-run. A session is only real if it carries at least one exercise.
 *
 * Kept pure and separate from the component so the counts driving
 * `completedSessions`, `sessionCount`, and the lifetime rollups can be verified
 * without a DOM or a Firestore connection.
 */
export function planLegacyImport(
  sessions: ValidationSession[],
): LegacyImportPlan {
  const sessionsToImport = sessions.filter((s) => s.machines.length > 0);

  const skippedEmptySessionNumbers = sessions
    .filter((s) => s.machines.length === 0)
    .map((s) => s.sessionNumber);

  const droppedLogs = sessionsToImport.flatMap((s) =>
    s.machines
      .filter((m) => !m.machineId)
      .map((m) => ({
        sessionNumber: s.sessionNumber,
        name: m.name,
        rawName: m.rawName,
      })),
  );

  const totalLogs = sessionsToImport.reduce(
    (acc, s) => acc + s.machines.filter((m) => m.machineId).length,
    0,
  );

  const highestSessionNumber =
    sessionsToImport.length > 0
      ? Math.max(...sessionsToImport.map((s) => s.sessionNumber))
      : 0;

  return {
    sessionsToImport,
    skippedEmptySessionNumbers,
    droppedLogs,
    totalLogs,
    highestSessionNumber,
  };
}
