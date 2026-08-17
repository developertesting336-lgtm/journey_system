import {
  Firestore,
  getFirestore,
  Timestamp,
  FieldValue,
} from "firebase-admin/firestore";
import { onRequest } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";
import { verifyMindbodySignature } from "./verifySignature";
import { recordHealthEvent } from "./healthState";
import { tryRecordEvent } from "./idempotency";
import { wallClockToInstant, isValidTimeZone, DEFAULT_TIME_ZONE } from "./time";

export type WebhookRequest = {
  rawBody: string;
  signatureHeader: string | undefined;
};

export type WebhookResponse = {
  statusCode: 200 | 400 | 401 | 500;
  body?: string;
};

export type WebhookDeps = {
  firestore: Firestore;
  webhookSecret: string;
};

type CachedStudio = {
  id: string;
  siteId: string;
  locationId?: string;
  /** IANA zone the studio's wall-clock times are expressed in. */
  timeZone?: string;
};

let studiosCache: CachedStudio[] | null = null;
let lastCacheUpdate = 0;

/** Clears the module-level studio cache. Exported for tests. */
export function resetStudioCache(): void {
  studiosCache = null;
  lastCacheUpdate = 0;
}

async function getStudios(firestore: Firestore): Promise<CachedStudio[]> {
  const now = Date.now();
  if (!studiosCache || now - lastCacheUpdate > 60000) {
    // Cache for 1 minute
    const next: CachedStudio[] = [];
    const snap = await firestore.collection("studios").get();
    snap.forEach((doc) => {
      const data = doc.data();
      if (data.mindbodySiteId) {
        next.push({
          id: doc.id,
          siteId: String(data.mindbodySiteId).trim(),
          locationId:
            data.mindbodyLocationId !== undefined &&
            data.mindbodyLocationId !== null
              ? String(data.mindbodyLocationId).trim()
              : undefined,
          timeZone: isValidTimeZone(data.timezone)
            ? String(data.timezone).trim()
            : undefined,
        });
      }
    });
    studiosCache = next;
    lastCacheUpdate = now;
  }
  return studiosCache;
}

export type StudioResolution = {
  studioId?: string;
  /** True when several studios share the site and the event names no location. */
  ambiguous: boolean;
  /** Timezone of the resolved studio, for reading MindBody's naive times. */
  timeZone?: string;
};

async function resolveStudio(
  firestore: Firestore,
  siteId: string | number,
  locationId?: string | number,
): Promise<StudioResolution> {
  const studios = await getStudios(firestore);
  const site = String(siteId).trim();
  const onSite = studios.filter((s) => s.siteId === site);

  if (onSite.length === 0) return { ambiguous: false };
  if (locationId !== undefined && locationId !== null && locationId !== "") {
    const loc = String(locationId).trim();
    const match = onSite.find((s) => s.locationId === loc);
    return match
      ? { studioId: match.id, ambiguous: false, timeZone: match.timeZone }
      : { ambiguous: true };
  }

  if (onSite.length === 1)
    return {
      studioId: onSite[0].id,
      ambiguous: false,
      timeZone: onSite[0].timeZone,
    };
  return { ambiguous: true };
}

/**
 * Handles incoming Mindbody webhooks.
 * Validates the signature, ensures uniqueness via idempotency checks,
 * and updates client records directly in Firestore.
 */
export async function handleMindbodyWebhook(
  deps: WebhookDeps,
  req: WebhookRequest,
): Promise<WebhookResponse> {
  const signature = req.signatureHeader || "";

  // 1. Strict Verification Guard
  if (!verifyMindbodySignature(req.rawBody, signature, deps.webhookSecret)) {
    await recordHealthEvent(deps.firestore, { type: "signature_failure" });
    return { statusCode: 401 };
  }

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(req.rawBody);
  } catch (e) {
    return { statusCode: 400 };
  }

  // We use messageId or eventId as the tracking event ID.
  const eventId =
    typeof parsed.messageId === "string"
      ? parsed.messageId
      : typeof parsed.eventId === "string"
        ? parsed.eventId
        : undefined;
  const eventType =
    typeof parsed.eventId === "string"
      ? parsed.eventId
      : typeof parsed.eventName === "string"
        ? parsed.eventName
        : "unknown_event";

  if (typeof eventId !== "string" || !eventId.trim()) {
    return { statusCode: 400 };
  }

  // 2. Idempotency Check
  try {
    const { wasNew } = await tryRecordEvent(deps.firestore, eventId, eventType);
    if (!wasNew) {
      // Return 200 to satisfy Mindbody retry loop for duplicates
      return { statusCode: 200 };
    }
  } catch (e) {
    console.error("Idempotency check failed", e);
    return { statusCode: 500 };
  }

  // 3. Payload Mapping & Upsert
  try {
    // Navigate potentially nested payload structures
    const payloadData =
      (parsed.eventData as Record<string, unknown> | undefined) ||
      (parsed.eventInstance as Record<string, unknown> | undefined) ||
      parsed;

    // Safely extract required fields
    const clientId =
      typeof payloadData.clientId === "string" ||
      typeof payloadData.clientId === "number"
        ? payloadData.clientId
        : typeof parsed.clientId === "string" ||
            typeof parsed.clientId === "number"
          ? parsed.clientId
          : undefined;

    const siteId =
      typeof payloadData.siteId === "string" ||
      typeof payloadData.siteId === "number"
        ? payloadData.siteId
        : typeof parsed.siteId === "string" || typeof parsed.siteId === "number"
          ? parsed.siteId
          : undefined;

    // MindBody spells this differently across event types; any of them pins the
    // event to one physical studio.
    const rawLocationId =
      payloadData.locationId ??
      payloadData.LocationId ??
      (payloadData.location as Record<string, unknown> | undefined)?.id ??
      parsed.locationId;
    const locationId =
      typeof rawLocationId === "string" || typeof rawLocationId === "number"
        ? rawLocationId
        : undefined;

    const isBookingEvent =
      eventType.toLowerCase().includes("booking") ||
      eventType.toLowerCase().includes("appointment");
    const isClientEvent = !isBookingEvent;

    if (isClientEvent && clientId) {
      const updates: Record<string, unknown> = {};

      // Extract Active Membership Status / Tier Name
      if (typeof payloadData.membershipStatus === "string")
        updates.membershipStatus = payloadData.membershipStatus;
      if (typeof payloadData.tierName === "string")
        updates.packageTier = payloadData.tierName;
      if (
        typeof payloadData.activeMembership === "boolean" ||
        typeof payloadData.activeMembership === "string"
      )
        updates.activeMembership = payloadData.activeMembership;

      // Last Visited Timestamp
      if (typeof payloadData.lastVisited === "string")
        updates.lastSessionDate = payloadData.lastVisited;

      // Prebooked Schedule Arrays
      if (Array.isArray(payloadData.prebookedSchedules))
        updates.prebookedSchedules = payloadData.prebookedSchedules;
      if (Array.isArray(payloadData.upcomingBookings))
        updates.upcomingBookings = payloadData.upcomingBookings;

      // Extract mindbody_name if given to help match
      if (
        typeof payloadData.firstName === "string" ||
        typeof payloadData.lastName === "string"
      ) {
        updates.mindbody_name =
          `${typeof payloadData.firstName === "string" ? payloadData.firstName : ""} ${typeof payloadData.lastName === "string" ? payloadData.lastName : ""}`.trim();
      }

      if (siteId) {
        const { studioId, ambiguous } = await resolveStudio(
          deps.firestore,
          siteId,
          locationId,
        );
        if (studioId) {
          updates.homeStudioId = studioId;
        } else if (ambiguous) {
          // Reassigning a client's home studio decides who may view their
          // clinical record, so leave it alone rather than pick one.
          console.warn(
            `Mindbody webhook: site ${siteId} maps to multiple studios and the event named no resolvable location; leaving homeStudioId untouched for client ${clientId}.`,
          );
        }
      }

      // Execute an atomic Firestore set() operation with { merge: true }
      const clientDocId = String(clientId);
      const clientRef = deps.firestore.collection("clients").doc(clientDocId);

      await clientRef.set(updates, { merge: true });
    } else if (isBookingEvent) {
      const bookingId =
        typeof payloadData.id === "string" || typeof payloadData.id === "number"
          ? String(payloadData.id)
          : typeof payloadData.appointmentId === "string" ||
              typeof payloadData.appointmentId === "number"
            ? String(payloadData.appointmentId)
            : typeof payloadData.bookingId === "string" ||
                typeof payloadData.bookingId === "number"
              ? String(payloadData.bookingId)
              : eventId;

      const isCancelled =
        eventType.toLowerCase().includes("cancel") ||
        eventType.toLowerCase().includes("delete") ||
        (typeof payloadData.status === "string" &&
          payloadData.status.toLowerCase() === "cancelled");

      const rawStart =
        payloadData.startDateTime || payloadData.startTime || payloadData.start;
      const rawEnd =
        payloadData.endDateTime || payloadData.endTime || payloadData.end;

      // Resolved before the times are read: MindBody's wall-clock strings are
      // meaningless without knowing which studio's clock they belong to.
      let studioId: string | null = null;
      let studioTimeZone = DEFAULT_TIME_ZONE;
      if (siteId) {
        const resolution = await resolveStudio(
          deps.firestore,
          siteId,
          locationId,
        );
        if (resolution.studioId) {
          studioId = resolution.studioId;
          if (resolution.timeZone) studioTimeZone = resolution.timeZone;
        } else if (resolution.ambiguous) {
          // A booking filed against the wrong studio shows on that studio's
          // roster and desyncs the schedule importer's duplicate check, so drop
          // it here. 200 stops MindBody retrying an event we will never accept;
          // the scheduled importer picks the booking up once the location is
          // mapped in Admin -> Studios.
          console.warn(
            `Mindbody webhook: dropping booking ${bookingId} — site ${siteId}${
              locationId !== undefined ? ` / location ${locationId}` : ""
            } does not resolve to a single studio.`,
          );
          await recordHealthEvent(deps.firestore, {
            type: "webhook_success",
            hydrationLatencyMs: 0,
          });
          return { statusCode: 200 };
        }
      }

      // Now that the owning studio is known, read its wall clock.
      const startDate = wallClockToInstant(rawStart, studioTimeZone);
      const endDate = wallClockToInstant(rawEnd, studioTimeZone);
      const startTime: Timestamp | null = startDate
        ? Timestamp.fromDate(startDate)
        : null;
      const endTime: Timestamp | null = endDate
        ? Timestamp.fromDate(endDate)
        : null;

      let clientName = "";
      if (typeof payloadData.clientName === "string") {
        clientName = payloadData.clientName;
      } else if (
        typeof payloadData.firstName === "string" ||
        typeof payloadData.lastName === "string"
      ) {
        clientName =
          `${typeof payloadData.firstName === "string" ? payloadData.firstName : ""} ${typeof payloadData.lastName === "string" ? payloadData.lastName : ""}`.trim();
      } else if (
        typeof payloadData.clientFirstName === "string" ||
        typeof payloadData.clientLastName === "string"
      ) {
        clientName =
          `${typeof payloadData.clientFirstName === "string" ? payloadData.clientFirstName : ""} ${typeof payloadData.clientLastName === "string" ? payloadData.clientLastName : ""}`.trim();
      }

      if (!clientName && clientId) {
        const clientSnap = await deps.firestore
          .collection("clients")
          .doc(String(clientId))
          .get();
        if (clientSnap.exists) {
          const cData = clientSnap.data();
          if (cData) {
            clientName =
              `${cData.firstName || ""} ${cData.lastName || ""}`.trim();
          }
        }
      }

      if (!clientName) {
        clientName = "Unknown Client";
      }

      let trainerId: string | null = null;
      let trainerName = "";
      if (typeof payloadData.staffName === "string") {
        trainerName = payloadData.staffName;
      } else if (typeof payloadData.instructorName === "string") {
        trainerName = payloadData.instructorName;
      } else if (typeof payloadData.teacherName === "string") {
        trainerName = payloadData.teacherName;
      } else if (typeof payloadData.trainerName === "string") {
        trainerName = payloadData.trainerName;
      }

      if (trainerName) {
        const trainersSnap = await deps.firestore.collection("trainers").get();
        const normalized = trainerName.trim().toLowerCase();
        trainersSnap.forEach((docSnap) => {
          const tData = docSnap.data();
          if (
            tData.fullName &&
            tData.fullName.trim().toLowerCase() === normalized
          ) {
            trainerId = docSnap.id;
          } else if (
            tData.nickname &&
            tData.nickname.trim().toLowerCase() === normalized
          ) {
            trainerId = docSnap.id;
          }
        });
      }

      const serviceName =
        typeof payloadData.serviceName === "string"
          ? payloadData.serviceName
          : typeof payloadData.sessionType === "string"
            ? payloadData.sessionType
            : typeof payloadData.className === "string"
              ? payloadData.className
              : "Training Session";

      const scheduleData: Record<string, unknown> = {
        clientName,
        trainerName,
        trainerId,
        studioId,
        startTime,
        endTime,
        status: isCancelled ? "Cancelled" : "Scheduled",
        serviceName,
        source: "MindBody",
        lastSyncAt: FieldValue.serverTimestamp(),
      };

      if (clientId) {
        scheduleData.clientId = String(clientId);
      }

      const scheduleRef = deps.firestore.collection("schedules").doc(bookingId);
      const existingDoc = await scheduleRef.get();
      if (!existingDoc.exists) {
        scheduleData.createdAt = FieldValue.serverTimestamp();
      }

      await scheduleRef.set(scheduleData, { merge: true });
    }

    await recordHealthEvent(deps.firestore, {
      type: "webhook_success",
      hydrationLatencyMs: 0,
    });
    return { statusCode: 200 };

    // 4. Resiliency & Edge Errors
  } catch (error) {
    console.error("Webhook processing error:", { error: String(error) });

    await recordHealthEvent(deps.firestore, { type: "webhook_failure" });

    // Catch errors without silently swallowing them
    return { statusCode: 500 };
  }
}

const mindbodyWebhookSecret = defineSecret("MINDBODY_WEBHOOK_SECRET");
let firestoreInstance: Firestore | null = null;

/**
 * The expected public entry point for Mindbody webhooks.
 * Wires the pure HTTP handler logic to Firebase, Pub/Sub, and secret parameters.
 * Lazy initialization is used for external clients.
 */
export const mindbodyWebhook = onRequest(
  {
    secrets: [mindbodyWebhookSecret],
    cors: false,
    region: "us-central1",
    maxInstances: 100,
    timeoutSeconds: 10,
  },
  async (req, res) => {
    if (req.method === "HEAD") {
      res.status(200).end();
      return;
    }

    if (!firestoreInstance) {
      firestoreInstance = getFirestore(
        "ai-studio-32cbbdcc-6e08-4770-9665-867c68878efa",
      );
    }

    const payloadBuffer = req.rawBody; // req.rawBody is a Buffer natively in firebase-functions
    const rawBodyStr = payloadBuffer ? payloadBuffer.toString("utf8") : "";

    const deps: WebhookDeps = {
      firestore: firestoreInstance,
      webhookSecret: mindbodyWebhookSecret.value(),
    };

    const webhookReq: WebhookRequest = {
      rawBody: rawBodyStr,
      signatureHeader: req.header("x-mindbody-signature"),
    };

    const response = await handleMindbodyWebhook(deps, webhookReq);
    res.status(response.statusCode).send(response.body || "");
  },
);
