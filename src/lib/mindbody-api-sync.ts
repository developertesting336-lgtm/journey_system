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

function resolveStudioId(
  locationId: number | undefined,
  studios: Studio[],
): string | null {
  if (!locationId) return null;
  const studio = studios.find(
    (s) => s.mindbodySiteId && String(s.mindbodySiteId) === String(locationId),
  );
  return studio?.id || null;
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

  const activeStudio = studios.find(
    (s) =>
      s.id === targetStudioIdOverride ||
      (s.mindbodySiteId &&
        String(s.mindbodySiteId).trim() === String(siteId).trim()),
  );
  const targetStudioId =
    targetStudioIdOverride || activeStudio?.id || studios[0]?.id || null;
  const studioName = activeStudio?.name || "Studio";

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
    const appointments: MindbodyAppointment[] = data.appointments || [];

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

        const startTime = Timestamp.fromDate(new Date(appt.StartDateTime));
        const endTime = Timestamp.fromDate(new Date(appt.EndDateTime));

        const isCancelled =
          appt.Status?.toLowerCase().includes("cancel") ||
          appt.Status?.toLowerCase().includes("late cancel") ||
          appt.Status?.toLowerCase() === "cancelled";

        const matchedStudioBySite = studios.find(
          (s) =>
            s.mindbodySiteId &&
            String(s.mindbodySiteId).trim() === String(siteId).trim(),
        );

        const studioId =
          matchedStudioBySite?.id ||
          resolveStudioId(appt.LocationId, studios) ||
          trainer?.primaryHomeStudioId ||
          targetStudioId;

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
  } catch (err: any) {
    result.errors.push(err.message);
  }

  return result;
}
