import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { Studio, Trainer, Client } from "../types";

// The module pulls in the real Firebase app at import time; stub it out.
vi.mock("../firebase", () => ({ db: { __fake: true } }));

/** Every batch.set / batch.update issued during a run, in order. */
type BatchOp = {
  kind: "set" | "update";
  path: string;
  id: string;
  data: Record<string, any>;
};
let batchOps: BatchOp[] = [];
let commits = 0;

/** Snapshots keyed by collection path, set per test. */
let snapshots: Record<string, Array<{ id: string; data: () => any }>> = {};

function makeSnapshot(docs: Array<{ id: string; data: () => any }>) {
  return {
    empty: docs.length === 0,
    docs,
    forEach: (cb: (d: any) => void) => docs.forEach(cb),
  };
}

vi.mock("firebase/firestore", () => {
  let autoId = 0;
  return {
    collection: (_db: unknown, path: string) => ({ __collection: path }),
    // doc(collectionRef) mints an id; doc(db, path, id) addresses an existing doc.
    doc: (a: any, path?: string, id?: string) =>
      a && a.__collection
        ? { __path: a.__collection, __id: `auto-${++autoId}` }
        : { __path: path!, __id: id! },
    query: (coll: any, ...constraints: any[]) => ({ ...coll, constraints }),
    where: (field: string, op: string, value: unknown) => ({ field, op, value }),
    getDocs: vi.fn(async (target: any) =>
      makeSnapshot(snapshots[target.__collection] ?? []),
    ),
    setDoc: vi.fn(),
    writeBatch: () => ({
      set: (ref: any, data: any) =>
        batchOps.push({ kind: "set", path: ref.__path, id: ref.__id, data }),
      update: (ref: any, data: any) =>
        batchOps.push({ kind: "update", path: ref.__path, id: ref.__id, data }),
      commit: async () => {
        commits++;
      },
    }),
    Timestamp: {
      fromDate: (d: Date) => ({ __ms: d.getTime(), toMillis: () => d.getTime() }),
      now: () => ({ __ms: 0, toMillis: () => 0 }),
    },
  };
});

import { resolveStudioId, syncMindbodySchedules } from "./mindbody-api-sync";

const SITE = "29068";

/**
 * Solon is listed FIRST and Westlake LAST on purpose. The bug this suite guards
 * resolved a studio by site alone, which returns whichever entry the array
 * happens to yield first — so expectations that name Solon fail against that bug
 * instead of matching it by accident.
 */
const SHARED_SITE_STUDIOS: Studio[] = [
  {
    id: "studio-solon",
    name: "Solon",
    ownerId: "o1",
    timezone: "America/New_York",
    mindbodySiteId: SITE,
    mindbodyLocationId: "2",
  },
  {
    id: "studio-westlake",
    name: "Westlake",
    ownerId: "o1",
    timezone: "America/New_York",
    mindbodySiteId: SITE,
    mindbodyLocationId: "1",
  },
];

function appointment(overrides: Record<string, any> = {}) {
  return {
    Id: 5001,
    StaffId: 77,
    StaffFirstName: "Marina",
    StaffLastName: "K",
    ClientId: "mb-client-1",
    ClientFirstName: "Alice",
    ClientLastName: "Smith",
    ClientPhone: "555-0100",
    StartDateTime: "2026-01-13T10:00:00Z",
    EndDateTime: "2026-01-13T11:00:00Z",
    Status: "Booked",
    SessionTypeName: "Training Session",
    LocationId: 2,
    ...overrides,
  };
}

function mockAppointments(appts: any[]) {
  global.fetch = vi.fn(async () => ({
    ok: true,
    json: async () => ({ appointments: appts }),
  })) as any;
}

const TRAINERS: Trainer[] = [
  {
    id: "trainer-1",
    fullName: "Marina K",
    initials: "MK",
    role: "LifeTransformer",
    primaryHomeStudioId: "studio-solon",
    accessibleStudioIds: [],
    activeGuestStudioIds: [],
    mindbodyStaffId: "77",
  },
];

const CLIENTS: Client[] = [
  {
    id: "client-alice",
    firstName: "Alice",
    lastName: "Smith",
    homeStudioId: "studio-solon",
    height: "5'6\"",
    isActive: true,
    remainingSessions: 10,
  },
];

beforeEach(() => {
  batchOps = [];
  commits = 0;
  snapshots = { clients: [], schedules: [] };
  vi.clearAllMocks();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("resolveStudioId", () => {
  it("prefers the studio owning the location over array order", () => {
    expect(resolveStudioId(2, SITE, SHARED_SITE_STUDIOS)).toBe("studio-solon");
    expect(resolveStudioId(1, SITE, SHARED_SITE_STUDIOS)).toBe("studio-westlake");
  });

  it("matches numeric and string location ids interchangeably", () => {
    expect(resolveStudioId("2", SITE, SHARED_SITE_STUDIOS)).toBe("studio-solon");
    expect(resolveStudioId(" 2 ", SITE, SHARED_SITE_STUDIOS)).toBe("studio-solon");
  });

  it("returns null for a location no studio on the site claims", () => {
    expect(resolveStudioId(9, SITE, SHARED_SITE_STUDIOS)).toBeNull();
  });

  it("does not match a location belonging to a different site", () => {
    const otherSite: Studio[] = [
      {
        id: "studio-elsewhere",
        name: "Elsewhere",
        ownerId: "o2",
        timezone: "America/New_York",
        mindbodySiteId: "99999",
        mindbodyLocationId: "2",
      },
    ];
    expect(resolveStudioId(2, SITE, otherSite)).toBeNull();
  });

  it("falls back to the site only when exactly one studio claims it", () => {
    const single: Studio[] = [
      {
        id: "studio-only",
        name: "Only",
        ownerId: "o1",
        timezone: "America/New_York",
        mindbodySiteId: SITE,
      },
    ];
    expect(resolveStudioId(undefined, SITE, single)).toBe("studio-only");
    // Ambiguous: two studios, no location to disambiguate.
    expect(resolveStudioId(undefined, SITE, SHARED_SITE_STUDIOS)).toBeNull();
  });
});

describe("syncMindbodySchedules — studio isolation", () => {
  // These sync WESTLAKE, which is deliberately the LAST entry in the studios
  // array. A site-first resolver returns Solon (the first entry), so expecting
  // Westlake fails against the old bug rather than matching it by accident.
  it("files an appointment under the studio owning its location", async () => {
    mockAppointments([appointment({ LocationId: 1 })]);

    const result = await syncMindbodySchedules(
      SITE,
      TRAINERS,
      CLIENTS,
      SHARED_SITE_STUDIOS,
      null,
      undefined,
      undefined,
      "studio-westlake",
      "1",
    );

    expect(result.errors).toEqual([]);
    expect(result.added).toBe(1);

    const written = batchOps.filter((op) => op.path === "schedules");
    expect(written).toHaveLength(1);
    expect(written[0].data.studioId).toBe("studio-westlake");
    expect(commits).toBeGreaterThan(0);
  });

  it("keeps another location's appointments out of the active studio", async () => {
    // Both locations come back from the API; only Westlake's may be stored.
    mockAppointments([
      appointment({ Id: 1, LocationId: 1 }),
      appointment({ Id: 2, LocationId: 2, ClientFirstName: "Bob" }),
    ]);

    const result = await syncMindbodySchedules(
      SITE,
      TRAINERS,
      CLIENTS,
      SHARED_SITE_STUDIOS,
      null,
      undefined,
      undefined,
      "studio-westlake",
      "1",
    );

    const written = batchOps.filter((op) => op.path === "schedules");
    expect(written).toHaveLength(1);
    expect(written[0].data.mindbodyAppointmentId).toBe("1");
    expect(written.every((op) => op.data.studioId === "studio-westlake")).toBe(
      true,
    );
    expect(result.added).toBe(1);
  });

  it("refuses when the site is shared and the studio has no location", async () => {
    mockAppointments([appointment()]);

    // The studio being synced has no mindbodyLocationId, so nothing can
    // distinguish its bookings from its sibling's on the same site.
    const unmappedSolon: Studio[] = [
      { ...SHARED_SITE_STUDIOS[0], mindbodyLocationId: undefined },
      SHARED_SITE_STUDIOS[1],
    ];

    const result = await syncMindbodySchedules(
      SITE,
      TRAINERS,
      CLIENTS,
      unmappedSolon,
      null,
      undefined,
      undefined,
      "studio-solon",
      null,
    );

    expect(result.errors[0]).toMatch(/no Location ID/i);
    expect(result.added).toBe(0);
    expect(batchOps).toHaveLength(0);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("refuses when the target studio cannot be determined", async () => {
    mockAppointments([appointment()]);

    const result = await syncMindbodySchedules(
      SITE,
      TRAINERS,
      CLIENTS,
      SHARED_SITE_STUDIOS,
      null,
      undefined,
      undefined,
      null, // no studio specified, and the site is claimed by two
      null,
    );

    expect(result.errors[0]).toMatch(/claimed by 2 studios/i);
    expect(batchOps).toHaveLength(0);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("does not write client demographics for another location's appointments", async () => {
    // Alice is only seen at Solon's location; syncing Westlake must not enrich
    // her record from a booking that belongs to a different studio.
    mockAppointments([appointment({ Id: 3, LocationId: 2 })]);
    snapshots.clients = [
      { id: "client-alice", data: () => ({ ...CLIENTS[0], phone: undefined }) },
    ];

    await syncMindbodySchedules(
      SITE,
      TRAINERS,
      CLIENTS,
      SHARED_SITE_STUDIOS,
      null,
      undefined,
      undefined,
      "studio-westlake",
      "1",
    );

    expect(batchOps.filter((op) => op.path === "clients")).toHaveLength(0);
  });

  it("only cancels stale schedules belonging to the studio being synced", async () => {
    mockAppointments([appointment({ Id: 1, LocationId: 1 })]);
    snapshots.schedules = [
      {
        id: "sched-gone",
        data: () => ({
          mindbodyAppointmentId: "999",
          studioId: "studio-westlake",
          status: "Scheduled",
        }),
      },
    ];

    await syncMindbodySchedules(
      SITE,
      TRAINERS,
      CLIENTS,
      SHARED_SITE_STUDIOS,
      null,
      undefined,
      undefined,
      "studio-westlake",
      "1",
    );

    const cancelled = batchOps.filter(
      (op) => op.kind === "update" && op.data.status === "Cancelled",
    );
    expect(cancelled).toHaveLength(1);
    expect(cancelled[0].id).toBe("sched-gone");
  });
});
