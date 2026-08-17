import { useState, useEffect } from "react";
import { collection, query, where, orderBy, onSnapshot, getDocs, Timestamp, QueryConstraint, doc, updateDoc } from "firebase/firestore";
import { db } from "../firebase";
import { Client, ScheduleEntry } from "../types";
import { OperationType, handleFirestoreError } from "../lib/firestore-errors";
import { startOfStudioDay, endOfStudioDay } from "../lib/studio-time";

export function useLiveSchedule(activeStudioId: string | null, isReady: boolean) {
  const [schedules, setSchedules] = useState<ScheduleEntry[]>([]);
  const [liveRosterClients, setLiveRosterClients] = useState<Client[]>([]);

  useEffect(() => {
    if (!isReady) return;

    const now = new Date();
    const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const thirtyDaysAhead = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

    const scheduleConstraints: QueryConstraint[] = [
      where("startTime", ">=", Timestamp.fromDate(twentyFourHoursAgo)),
      where("startTime", "<=", Timestamp.fromDate(thirtyDaysAhead)),
      orderBy("startTime", "asc"),
    ];

    // STRICT FILTERING BY ACTIVE STUDIO
    if (activeStudioId) {
      scheduleConstraints.push(where("studioId", "==", activeStudioId));
    }

    const unsubscribeSchedules = onSnapshot(
      query(collection(db, "schedules"), ...scheduleConstraints),
      async (snap) => {
        const schedulesData = snap.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        }        )) as ScheduleEntry[];
        const activeSchedulesData = schedulesData.filter((s) => s.status !== "Cancelled");
        setSchedules(activeSchedulesData);

        // "Today" means the studio's calendar day, not the viewer's. Using the
        // browser's midnight made the roster shift for anyone in another zone.
        const startOfToday = startOfStudioDay();
        const endOfToday = endOfStudioDay();

        const todaySchedules = activeSchedulesData.filter((s) => {
          if (!s.startTime) return false;
          // Handle both Firestore Timestamp and JS Date/ISO string
          const d = s.startTime.toDate
            ? s.startTime.toDate()
            : new Date(s.startTime);
          return d >= startOfToday && d <= endOfToday;
        });

        // Background auto-matching lookup check has been disabled to prevent quota/query leaks on schedule snapshots.
        // (Used to iterate over unlinkedSchedules and query 'trainers'/'clients' redundantly)

        // Fetch client data ONLY for today's schedule to stay within read quotas
        const clientIds = Array.from(
          new Set(todaySchedules.map((s) => s.clientId).filter(Boolean)),
        ) as string[];
        if (clientIds.length > 0) {
          const chunks = [];
          for (let i = 0; i < clientIds.length; i += 10)
            chunks.push(clientIds.slice(i, i + 10));
          const snapshots = await Promise.all(
            chunks.map((chunk) =>
              getDocs(
                query(
                  collection(db, "clients"),
                  where("__name__", "in", chunk),
                ),
              ),
            ),
          );
          const fetchedClients = snapshots.flatMap((snap) =>
            snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }) as Client),
          );
          setLiveRosterClients(fetchedClients);

          // Self-heal: check if any of the loaded schedules reference a clientId that does not exist in the database,
          // and reset it to null so the fuzzy auto-linker can resolve it to the correct profile.
          const validClientIdsSet = new Set(fetchedClients.map((c) => c.id));
          const invalidSchedules = todaySchedules.filter(
            (s) => s.clientId && !validClientIdsSet.has(s.clientId),
          );
          if (invalidSchedules.length > 0) {
            for (const s of invalidSchedules) {
              console.log(
                `Self-healing schedule ${s.id}: resetting invalid/deleted clientId "${s.clientId}" to null`,
              );
              try {
                await updateDoc(doc(db, "schedules", s.id), {
                  clientId: null,
                });
              } catch (err) {
                console.error(`Failed to self-heal schedule ${s.id}:`, err);
              }
            }
          }
        } else {
          setLiveRosterClients([]);
        }
      },
      (error) => {
        handleFirestoreError(error, OperationType.GET, "schedules");
      },
    );

    return () => unsubscribeSchedules();
  }, [activeStudioId, isReady]);

  return { schedules, liveRosterClients };
}
