import { describe, it, expect } from "vitest";
import {
  matchesRoutineLetter,
  routineLetterOf,
  findRoutineByLetter,
} from "./routine-utils";

describe("matchesRoutineLetter", () => {
  it("matches the standard naming", () => {
    expect(matchesRoutineLetter({ name: "Routine A" }, "A")).toBe(true);
    expect(matchesRoutineLetter({ name: "Routine B" }, "B")).toBe(true);
  });

  it("matches the demo seeder's bare-letter naming", () => {
    // AppContent seeds demo clients with name "A" / "B" rather than "Routine A".
    expect(matchesRoutineLetter({ name: "A" }, "A")).toBe(true);
    expect(matchesRoutineLetter({ name: "B" }, "B")).toBe(true);
  });

  it("ignores case and surrounding whitespace", () => {
    expect(matchesRoutineLetter({ name: "  routine a " }, "A")).toBe(true);
    expect(matchesRoutineLetter({ name: "ROUTINE B" }, "B")).toBe(true);
  });

  it("does not confuse A with B", () => {
    expect(matchesRoutineLetter({ name: "Routine A" }, "B")).toBe(false);
    expect(matchesRoutineLetter({ name: "B" }, "A")).toBe(false);
  });

  it("does not match unrelated routines", () => {
    expect(matchesRoutineLetter({ name: "Demo Routine" }, "A")).toBe(false);
    expect(matchesRoutineLetter({ name: "Rehab" }, "B")).toBe(false);
  });

  it("returns false instead of throwing when the name is missing", () => {
    // The crash this guards: `r.name.includes(...)` on a document with no name
    // threw during render and blanked the session screen.
    expect(() => matchesRoutineLetter({} as any, "A")).not.toThrow();
    expect(matchesRoutineLetter({} as any, "A")).toBe(false);
    expect(matchesRoutineLetter(null, "A")).toBe(false);
    expect(matchesRoutineLetter(undefined, "B")).toBe(false);
    expect(matchesRoutineLetter({ name: undefined } as any, "A")).toBe(false);
    expect(matchesRoutineLetter({ name: "" }, "A")).toBe(false);
  });
});

describe("routineLetterOf", () => {
  it("reports the letter for either naming convention", () => {
    expect(routineLetterOf({ name: "Routine A" })).toBe("A");
    expect(routineLetterOf({ name: "B" })).toBe("B");
  });

  it("returns null for anything else, including a nameless routine", () => {
    expect(routineLetterOf({ name: "Demo Routine" })).toBeNull();
    expect(routineLetterOf({} as any)).toBeNull();
    expect(routineLetterOf(null)).toBeNull();
  });
});

describe("findRoutineByLetter", () => {
  it("finds routines across mixed naming in one list", () => {
    const routines = [
      { id: "1", name: "A" },
      { id: "2", name: "Routine B" },
    ] as any[];
    expect(findRoutineByLetter(routines, "A")?.id).toBe("1");
    expect(findRoutineByLetter(routines, "B")?.id).toBe("2");
  });

  it("survives a nameless routine sitting in the list", () => {
    const routines = [{ id: "bad" }, { id: "good", name: "Routine A" }] as any[];
    expect(() => findRoutineByLetter(routines, "A")).not.toThrow();
    expect(findRoutineByLetter(routines, "A")?.id).toBe("good");
  });

  it("handles an empty or missing list", () => {
    expect(findRoutineByLetter([], "A")).toBeUndefined();
    expect(findRoutineByLetter(null, "A")).toBeUndefined();
  });
});
