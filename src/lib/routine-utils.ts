import type { Routine } from "../types";

export type RoutineLetter = "A" | "B";

/**
 * Matching a client's A/B routines by name, safely.
 *
 * Two problems this solves:
 *
 * 1. Call sites did `routines.find(r => r.name.includes("Routine A"))`. A routine
 *    document without a `name` field made that throw during render, blanking the
 *    whole session screen.
 *
 * 2. Routines are not named consistently. Most code writes "Routine A"/"Routine B",
 *    but the demo seeder in AppContent writes plain "A"/"B". A strict lookup missed
 *    those, so a demo-seeded client showed an empty sequence and the session start
 *    created a duplicate routine alongside the existing one.
 *
 * Both spellings are accepted, comparison is case- and whitespace-insensitive, and
 * a missing name simply fails to match rather than throwing.
 */
export function matchesRoutineLetter(
  routine: Pick<Routine, "name"> | null | undefined,
  letter: RoutineLetter,
): boolean {
  const name = typeof routine?.name === "string" ? routine.name.trim().toLowerCase() : "";
  if (!name) return false;
  const target = letter.toLowerCase();
  return name === target || name === `routine ${target}`;
}

/** The A/B letter a routine represents, or null if it is neither. */
export function routineLetterOf(
  routine: Pick<Routine, "name"> | null | undefined,
): RoutineLetter | null {
  if (matchesRoutineLetter(routine, "A")) return "A";
  if (matchesRoutineLetter(routine, "B")) return "B";
  return null;
}

/** Finds a client's Routine A or B, tolerating either naming convention. */
export function findRoutineByLetter<T extends Pick<Routine, "name">>(
  routines: T[] | null | undefined,
  letter: RoutineLetter,
): T | undefined {
  return (routines || []).find((r) => matchesRoutineLetter(r, letter));
}
