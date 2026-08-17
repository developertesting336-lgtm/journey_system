import {
  collection,
  getDocs,
  writeBatch,
  doc,
  setDoc,
  query,
  where,
  Timestamp,
} from "firebase/firestore";
import { db } from "../firebase";
import { Trainer, Client, Studio } from "../types";
import { normalizeName, cleanAlphanumeric } from "./sync-utils";
import {
  wallClockToInstant,
  isValidTimeZone,
  DEFAULT_TIME_ZONE,
} from "./studio-time";

export interface MindbodySyncResult {
  added: number;
  updated: number;
  skipped: number;
  errors: string[];
}

export interface MindbodyAppointment {
  Id: number;
  StaffId: number;
  StaffFirstName?: string;
  StaffLastName?: string;
  ClientId?: string;
  ClientFirstName?: string;
  ClientLastName?: string;
  ClientPhone?: string;
  ClientEmail?: string;
  ClientDOB?: string;
  ClientGender?: string;
  ClientAddress?: string;
  ClientPhotoUrl?: string;
  ClientEmergencyName?: string;
  ClientEmergencyPhone?: string;
  StartDateTime: string;
  EndDateTime: string;
  Status?: string;
  SessionTypeName?: string;
  LocationId?: number;
}

function findClientId(
  clientName: string,
  clientsData: Client[],
  trainerHomeStudioId?: string,
  mbClientId?: string | null,
): string | null {
  if (!clientName && !mbClientId) return null;
  const normalizedSName = normalizeName(clientName || "");
  const cleanSName = cleanAlphanumeric(clientName || "");

  if (mbClientId) {
    const mbMatch = clientsData.find(
      (c) =>
        (c.mindbodyClientId &&
          String(c.mindbodyClientId).trim() === String(mbClientId).trim()) ||
        (c.id && String(c.id).trim() === String(mbClientId).trim()),
    );
    if (mbMatch) return mbMatch.id;
  }

  const isFuzzyMatch = (
    sName: string,
    first: string,
    last: string,
    mbName?: string,
  ): boolean => {
    const sNameClean = sName
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, "");
    const cFirstClean = (first || "")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "");
    const cLastClean = (last || "")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "");
    const cFullClean = `${cFirstClean} ${cLastClean}`.trim();

    if (mbName) {
      const mbClean = mbName
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, "");
      if (sNameClean === mbClean) return true;
    }
    if (sNameClean === cFullClean) return true;

    const sWords = sNameClean.split(/\s+/).filter(Boolean);
    const cWords = [cFirstClean, cLastClean].filter(Boolean);
    if (sWords.length === 0 || cWords.length === 0) return false;
    if (sWords[0] !== cWords[0]) return false;
    if (sWords.length === 1 && cWords.length > 1) return true;
    if (sWords.length > 1 && cWords.length === 1) return true;
    if (sWords.length >= 2 && cWords.length >= 2) {
      const sLast = sWords.slice(1).join(" ");
      const cLast = cWords.slice(1).join(" ");
      if (sLast === cLast) return true;
      if (sLast.length === 1 && cLast.startsWith(sLast)) return true;
      if (cLast.length === 1 && sLast.startsWith(cLast)) return true;
    }
    return false;
  };

  if (trainerHomeStudioId) {
    const match = clientsData.find((c) => {
      if (c.homeStudioId && c.homeStudioId !== trainerHomeStudioId)
        return false;
      const first = c.firstName || "";
      const last = c.lastName || "";
      const fullName = normalizeName(`${first} ${last}`);
      if (
        fullName === normalizedSName ||
        cleanAlphanumeric(fullName) === cleanSName
      )
        return true;
      if (c.mindbody_name && normalizeName(c.mindbody_name) === normalizedSName)
        return true;
      return isFuzzyMatch(clientName, first, last, c.mindbody_name);
    });
    if (match) return match.id || null;
  }

  const matchGlobal = clientsData.find((c) => {
    const first = c.firstName || "";
    const last = c.lastName || "";
    const fullName = normalizeName(`${first} ${last}`);
    if (
      fullName === normalizedSName ||
      cleanAlphanumeric(fullName) === cleanSName
    )
      return true;
    if (c.mindbody_name && normalizeName(c.mindbody_name) === normalizedSName)
      return true;
    return isFuzzyMatch(clientName, first, last, c.mindbody_name);
  });
  return matchGlobal ? matchGlobal.id || null : null;
}

/**
 * Resolves the studio that owns a MindBody appointment.
 *
 * One MindBody site can contain several locations, each of which is a separate
 * physical studio here, so the location is the only identifier precise enough to
 * file an appointment against. Matching on the site would return whichever studio
 * happened to be first in the array and mix every location's bookings together.
 *
 * Falls back to the site only when exactly one studio claims it, i.e. when there
 * is no ambiguity to get wrong.
 */
export function resolveStudioId(
  locationId: number | string | undefined,
  siteId: string,
  studios: Studio[],
): string | null {
  if (locationId !== undefined && locationId !== null && locationId !== "") {
    const locStr = String(locationId).trim();
    const studioByLocation = studios.find(
      (s) =>
        s.mindbodyLocationId &&
        String(s.mindbodyLocationId).trim() === locStr &&
        s.mindbodySiteId &&
        String(s.mindbodySiteId).trim() === String(siteId).trim(),
    );
    if (studioByLocation) return studioByLocation.id || null;
  }

  const studiosOnSite = studios.filter(
    (s) =>
      s.mindbodySiteId &&
      String(s.mindbodySiteId).trim() === String(siteId).trim(),
  );
  return studiosOnSite.length === 1 ? studiosOnSite[0].id || null : null;
}

export async function syncMindbodySchedules(
  siteId: string,
  trainers: Trainer[],
  clients: Client[],
  studios: Studio[],
  targetStaffId?: string | null,
  startDate?: string,
  endDate?: string,
  targetStudioIdOverride?: string | null,
  targetLocationId?: string | number | null,
): Promise<MindbodySyncResult> {
  const result: MindbodySyncResult = {
    added: 0,
    updated: 0,
    skipped: 0,
    errors: [],
  };
  const now = new Date();
  const start = startDate || now.toISOString().split("T")[0];
  const end =
    endDate ||
    new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000)
      .toISOString()
      .split("T")[0];

  let targetTrainers = trainers;
  let staffIdsToFetch: string[] = [];

  if (targetStaffId) {
    targetTrainers = trainers.filter((t) => t.id === targetStaffId);
    staffIdsToFetch = targetTrainers
      .map((t) => t.mindbodyStaffId)
      .filter((id): id is string => Boolean(id));
  } else {
    // Studio-wide sync: fetch all staff appointments for the studio
    staffIdsToFetch = [];
  }

  // Resolve the studio being synced explicitly. Matching by site alone is only
  // safe when a single studio claims it; `studios[0]` used to stand in otherwise,
  // which silently wrote one studio's appointments onto an unrelated studio.
  const studiosOnSite = studios.filter(
    (s) =>
      s.mindbodySiteId &&
      String(s.mindbodySiteId).trim() === String(siteId).trim(),
  );
  const activeStudio = targetStudioIdOverride
    ? studios.find((s) => s.id === targetStudioIdOverride)
    : studiosOnSite.length === 1
      ? studiosOnSite[0]
      : undefined;

  const targetStudioId = activeStudio?.id || null;
  const studioName = activeStudio?.name || "Studio";

  if (!targetStudioId) {
    result.errors.push(
      `Could not determine which studio to sync: MindBody Site ${siteId} is claimed by ${studiosOnSite.length} studios. Open a specific studio and sync from there.`,
    );
    return result;
  }

  const unresolvedLocations = new Set<string>();

  // The studio's own clock defines what MindBody's naive times mean.
  const studioTimeZone = isValidTimeZone(activeStudio?.timezone)
    ? (activeStudio!.timezone as string)
    : DEFAULT_TIME_ZONE;

  const effectiveLocationId =
    targetLocationId !== undefined && targetLocationId !== null
      ? String(targetLocationId).trim()
      : activeStudio?.mindbodyLocationId
      ? String(activeStudio.mindbodyLocationId).trim()
      : null;

  // Sharing a site without a location means every sibling studio's appointments
  // arrive in one undifferentiated batch, so refuse instead of guessing.
  if (studiosOnSite.length > 1 && !effectiveLocationId) {
    result.errors.push(
      `${studioName} shares MindBody Site ${siteId} with ${studiosOnSite.length - 1} other studio(s) but has no Location ID. Set it in Admin → Studios before syncing.`,
    );
    return result;
  }

  try {
    const response = await fetch("/api/mindbody/staff-appointments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        siteId,
        startDate: start,
        endDate: end,
        staffIds: staffIdsToFetch.length > 0 ? staffIdsToFetch : undefined,
      }),
    });

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      throw new Error(errData.error || `API error ${response.status}`);
    }

    const data = await response.json();
    let appointments: MindbodyAppointment[] = data.appointments || [];

    if (effectiveLocationId) {
      appointments = appointments.filter(
        (a) =>
          a.LocationId !== undefined &&
          a.LocationId !== null &&
          String(a.LocationId).trim() === effectiveLocationId,
      );
    }

    if (appointments.length === 0) {
      return result;
    }

    // Fetch all clients from Firestore to guarantee clientId matching across all dates/studios
    let allClients = clients;
    try {
      const clientsSnap = await getDocs(collection(db, "clients"));
      if (!clientsSnap.empty) {
        allClients = clientsSnap.docs.map((d) => ({
          id: d.id,
          ...d.data(),
        })) as Client[];
      }
    } catch (e) {
      console.warn(
        "Could not fetch all clients snapshot, fallback to passed clients array:",
        e,
      );
    }

    const existingSnap = await getDocs(
      query(
        collection(db, "schedules"),
        where("studioId", "==", targetStudioId),
      ),
    );

    const existingByMbId: Record<string, { docId: string; data: any }> = {};
    existingSnap.forEach((d) => {
      const docData = d.data();
      if (docData.mindbodyAppointmentId) {
        existingByMbId[String(docData.mindbodyAppointmentId)] = {
          docId: d.id,
          data: docData,
        };
      }
    });

    const currentMbIds = new Set(appointments.map((a) => String(a.Id)));
    let batch = writeBatch(db);
    let batchCount = 0;

    for (const appt of appointments) {
      try {
        const mbId = String(appt.Id);

        // Location decides ownership, and it is settled before anything is
        // written. Anything that cannot be resolved to the studio being synced
        // is skipped rather than filed under it — misplaced appointments surface
        // on the wrong studio's roster and break the duplicate check next run.
        const studioId = resolveStudioId(appt.LocationId, siteId, studios);

        if (!studioId) {
          result.skipped++;
          unresolvedLocations.add(
            appt.LocationId != null ? String(appt.LocationId) : "none",
          );
          continue;
        }

        if (studioId !== targetStudioId) {
          result.skipped++;
          continue;
        }

        // Try matching trainer by mindbodyStaffId AND studio assignment first
        let trainer = trainers.find(
          (t) =>
            t.mindbodyStaffId &&
            String(t.mindbodyStaffId).trim() === String(appt.StaffId).trim() &&
            (!targetStudioId ||
              t.primaryHomeStudioId === targetStudioId ||
              t.accessibleStudioIds?.includes(targetStudioId)),
        );

        // Fallback: Try matching trainer by full name AND studio assignment
        if (!trainer && (appt.StaffFirstName || appt.StaffLastName)) {
          const mbStaffFullName =
            `${appt.StaffFirstName || ""} ${appt.StaffLastName || ""}`
              .trim()
              .toLowerCase();
          trainer = trainers.find(
            (t) =>
              t.fullName &&
              t.fullName.toLowerCase() === mbStaffFullName &&
              (!targetStudioId ||
                t.primaryHomeStudioId === targetStudioId ||
                t.accessibleStudioIds?.includes(targetStudioId)),
          );
        }

        const rawStaffName =
          `${appt.StaffFirstName || ""} ${appt.StaffLastName || ""}`.trim();
        const trainerName = trainer
          ? trainer.fullName
          : rawStaffName
            ? rawStaffName
            : `${studioName} Rotation`;
        const trainerId = trainer?.id || null;

        const clientName =
          `${appt.ClientFirstName || ""} ${appt.ClientLastName || ""}`.trim() ||
          "Unknown Client";

        const mbClientId = appt.ClientId ? String(appt.ClientId).trim() : null;

        const clientId = findClientId(
          clientName,
          allClients,
          trainer?.primaryHomeStudioId || targetStudioId || undefined,
          mbClientId,
        );

        if (clientId) {
          const matchedClient = allClients.find((c) => c.id === clientId);
          if (matchedClient) {
            const clientUpdates: Record<string, any> = {};
            if (mbClientId && !matchedClient.mindbodyClientId) {
              clientUpdates.mindbodyClientId = mbClientId;
              matchedClient.mindbodyClientId = mbClientId;
            }
            if (appt.ClientPhone && !matchedClient.phone) {
              clientUpdates.phone = appt.ClientPhone;
              matchedClient.phone = appt.ClientPhone;
            }
            if (appt.ClientEmail && !matchedClient.email) {
              clientUpdates.email = appt.ClientEmail;
              matchedClient.email = appt.ClientEmail;
            }
            if (appt.ClientDOB && !matchedClient.dateOfBirth) {
              clientUpdates.dateOfBirth = appt.ClientDOB;
              matchedClient.dateOfBirth = appt.ClientDOB;
            }
            if (appt.ClientGender && !matchedClient.gender) {
              clientUpdates.gender = appt.ClientGender;
              matchedClient.gender = appt.ClientGender;
            }
            if (appt.ClientAddress && !matchedClient.address) {
              clientUpdates.address = appt.ClientAddress;
              matchedClient.address = appt.ClientAddress;
            }
            if (appt.ClientPhotoUrl && !matchedClient.photoUrl) {
              clientUpdates.photoUrl = appt.ClientPhotoUrl;
              matchedClient.photoUrl = appt.ClientPhotoUrl;
            }
            if (
              appt.ClientEmergencyName &&
              !matchedClient.emergencyContactName
            ) {
              clientUpdates.emergencyContactName = appt.ClientEmergencyName;
              matchedClient.emergencyContactName = appt.ClientEmergencyName;
            }
            if (
              appt.ClientEmergencyPhone &&
              !matchedClient.emergencyContactPhone
            ) {
              clientUpdates.emergencyContactPhone = appt.ClientEmergencyPhone;
              matchedClient.emergencyContactPhone = appt.ClientEmergencyPhone;
            }

            if (Object.keys(clientUpdates).length > 0) {
              batch.update(doc(db, "clients", clientId), clientUpdates);
              batchCount++;
            }
          }
        }

        // MindBody sends site-local wall clock with no offset. Letting `new
        // Date()` resolve it against the syncing machine's timezone stored every
        // appointment shifted by that machine's offset from the studio.
        const startDate = wallClockToInstant(appt.StartDateTime, studioTimeZone);
        const endDate = wallClockToInstant(appt.EndDateTime, studioTimeZone);
        if (!startDate) {
          result.errors.push(
            `Appt ${appt.Id}: unreadable start time "${appt.StartDateTime}"`,
          );
          result.skipped++;
          continue;
        }
        const startTime = Timestamp.fromDate(startDate);
        const endTime = Timestamp.fromDate(
          endDate ?? new Date(startDate.getTime() + 30 * 60 * 1000),
        );

        const isCancelled =
          appt.Status?.toLowerCase().includes("cancel") ||
          appt.Status?.toLowerCase().includes("late cancel") ||
          appt.Status?.toLowerCase() === "cancelled";

        const payload: Record<string, any> = {
          mindbodyAppointmentId: mbId,
          mindbodyClientId: mbClientId,
          clientName,
          clientId: clientId || null,
          trainerId,
          trainerName,
          startTime,
          endTime,
          studioId,
          status: isCancelled ? "Cancelled" : "Scheduled",
          serviceName: appt.SessionTypeName || "Training Session",
          source: "MindBody",
          lastSyncAt: Timestamp.now(),
        };

        const existing = existingByMbId[mbId];
        if (!existing) {
          const newRef = doc(collection(db, "schedules"));
          batch.set(newRef, { ...payload, createdAt: Timestamp.now() });
          result.added++;
        } else {
          const curr = existing.data;
          const hasChanged =
            curr.status !== payload.status ||
            curr.clientName !== payload.clientName ||
            curr.clientId !== payload.clientId ||
            curr.trainerId !== payload.trainerId ||
            curr.studioId !== payload.studioId ||
            curr.startTime?.toMillis?.() !== startTime.toMillis();

          if (hasChanged) {
            batch.update(doc(db, "schedules", existing.docId), payload);
            result.updated++;
          } else {
            result.skipped++;
          }
        }

        batchCount++;
        if (batchCount >= 400) {
          await batch.commit();
          batch = writeBatch(db);
          batchCount = 0;
        }
      } catch (apptErr: any) {
        result.errors.push(`Appt ${appt.Id}: ${apptErr.message}`);
      }
    }

    for (const [mbId, existing] of Object.entries(existingByMbId)) {
      if (!currentMbIds.has(mbId) && existing.data.status !== "Cancelled") {
        batch.update(doc(db, "schedules", existing.docId), {
          status: "Cancelled",
          lastSyncAt: Timestamp.now(),
        });
        result.updated++;
        batchCount++;
        if (batchCount >= 400) {
          await batch.commit();
          batch = writeBatch(db);
          batchCount = 0;
        }
      }
    }

    if (batchCount > 0) {
      await batch.commit();
    }

    // Surface rather than swallow: an unmapped location means appointments exist
    // in MindBody that no studio here has claimed.
    if (unresolvedLocations.size > 0) {
      result.errors.push(
        `Skipped appointments from unmapped MindBody location(s): ${[...unresolvedLocations].join(", ")}. Assign these Location IDs to a studio in Admin → Studios.`,
      );
    }

    console.log("✅ [REFRESH SCHEDULE] SYNC COMPLETE RESULT:", result);
    return result;
  } catch (err: any) {
    result.errors.push(err.message);
  }

  return result;
}
