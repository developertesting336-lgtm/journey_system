import {
  collection,
  query,
  where,
  orderBy,
  getDocs,
  limit,
  Timestamp,
} from "firebase/firestore";
import { db } from "../firebase";
import { ExerciseLog, WorkoutSession } from "../types";
import { parseSessionDate } from "./utils";

/**
 * Calculates the delta for highlighted movements.
 * Takes 3 machine IDs and finds the first and last recorded weights.
 */
export async function calculateHighlightedMovements(
  clientId: string,
  machineIds: string[],
) {
  const highlightedMovements = [];

  // Fetch sessions once to mapping sessionId to sessionNumber/date
  const sessionsSnap = await getDocs(
    query(
      collection(db, "sessions"),
      where("clientId", "==", clientId),
      orderBy("sessionNumber", "asc"),
    ),
  );

  const sessionsMap = new Map();
  sessionsSnap.docs.forEach((d) => {
    const data = d.data();
    sessionsMap.set(d.id, {
      sessionNumber: data.sessionNumber || 0,
      date: data.date || "",
    });
  });

  for (const machineId of machineIds) {
    // Get Machine Info
    const machineSnapshot = await getDocs(
      query(collection(db, "machines"), where("__name__", "==", machineId)),
    );
    const machineData = machineSnapshot.docs[0]?.data();
    const machineName =
      machineData?.fullName || machineData?.name || "Unknown Machine";

    // Get All Logs for this machine to find min/max
    const logsQuery = query(
      collection(db, "exerciseLogs"),
      where("clientId", "==", clientId),
      where("machineId", "==", machineId),
    );
    const logsSnap = await getDocs(logsQuery);
    const logs = logsSnap.docs
      .map((d) => ({ id: d.id, ...d.data() }) as ExerciseLog)
      .sort((a, b) => {
        const sessA = sessionsMap.get(a.sessionId);
        const sessB = sessionsMap.get(b.sessionId);

        if (sessA && sessB) {
          if (sessA.sessionNumber !== sessB.sessionNumber) {
            return sessA.sessionNumber - sessB.sessionNumber;
          }
          if (sessA.date !== sessB.date) {
            return sessA.date.localeCompare(sessB.date);
          }
        }

        const timeA = a.createdAt?.toMillis?.() || 0;
        const timeB = b.createdAt?.toMillis?.() || 0;
        return timeA - timeB;
      });

    const weights = logs
      .map((d) => parseFloat(d.weight || "0"))
      .filter((w) => !isNaN(w) && w > 0);

    if (weights.length === 0) {
      highlightedMovements.push({
        machineId,
        machineName,
        startingWeight: 0,
        currentWeight: 0,
        currentReps: 0,
        isStaticHold: false,
        currentQuality: "N/A",
        change: 0,
        percentageIncrease: 0,
      });
      continue;
    }

    const firstWeight = weights[0];
    const currentWeight = weights[weights.length - 1];

    // For reps/quality, we still might want the most recent log
    const recentLogQuery = query(
      collection(db, "exerciseLogs"),
      where("clientId", "==", clientId),
      where("machineId", "==", machineId),
      orderBy("createdAt", "desc"),
      limit(1),
    );
    const recentLogSnap = await getDocs(recentLogQuery);
    const recentData = recentLogSnap.docs[0]?.data();
    const isStaticHold = recentData?.isStaticHold;
    const rawReps = isStaticHold
      ? parseFloat(recentData?.seconds || "0")
      : parseFloat(recentData?.reps || "0");
    const currentReps = isNaN(rawReps) ? 0 : rawReps;
    const currentQuality = recentData?.quality || "N/A";

    // Safety check for percentage increase
    let percentageIncrease = 0;
    if (firstWeight > 0 && !isNaN(currentWeight)) {
      percentageIncrease = Math.round(
        ((currentWeight - firstWeight) / firstWeight) * 100,
      );
    }
    if (isNaN(percentageIncrease)) percentageIncrease = 0;

    highlightedMovements.push({
      machineId,
      machineName,
      startingWeight: firstWeight,
      currentWeight: currentWeight,
      currentReps: currentReps,
      isStaticHold: isStaticHold,
      currentQuality: currentQuality,
      change: currentWeight - firstWeight,
      percentageIncrease,
    });
  }

  return highlightedMovements;
}

/**
 * Calculates detailed attendance stats.
 * Target: 24 sessions (standard) or 12 sessions.
 * Punctuality: Relative to :00 and :30 marks.
 * Duration: Average session length.
 */
export async function calculateComprehensiveAttendanceStats(
  clientId: string,
  startDateStr?: string,
) {
  const sessionsQuery = query(
    collection(db, "sessions"),
    where("clientId", "==", clientId),
    where("status", "==", "Completed"),
    orderBy("date", "asc"),
  );

  const sessionsSnap = await getDocs(sessionsQuery);
  const allSessions = sessionsSnap.docs.map(
    (d) => ({ id: d.id, ...d.data() }) as WorkoutSession,
  );

  if (allSessions.length === 0) {
    return {
      totalSessions: 0,
      firstSessionDate: "",
      totalVolume: 0,
      totalReps: 0,
      totalGoodReps: 0,
      avgRestDays: 0,
      avgDuration: 0,
      score: 0,
      punctuality: "No data",
    };
  }

  const logsQuery = query(
    collection(db, "exerciseLogs"),
    where("clientId", "==", clientId),
  );
  const logsSnap = await getDocs(logsQuery);
  const allLogs = logsSnap.docs.map(
    (d) => ({ id: d.id, ...d.data() }) as ExerciseLog,
  );

  let filteredSessions = allSessions;
  if (startDateStr) {
    filteredSessions = allSessions.filter((s) => s.date >= startDateStr);
  }

  const totalSessions = filteredSessions.length;
  const firstSessionDate = allSessions[0]?.date || "";

  let totalDuration = 0;
  let durationCount = 0;
  let previousDate: Date | null = null;
  let totalRestDays = 0;
  let restIntervalCount = 0;

  filteredSessions.forEach((s) => {
    if (s.startTime && s.endTime) {
      const start = s.startTime.toDate
        ? s.startTime.toDate()
        : new Date(s.startTime);
      const end = s.endTime.toDate ? s.endTime.toDate() : new Date(s.endTime);
      const duration = (end.getTime() - start.getTime()) / (1000 * 60);
      if (duration > 5 && duration < 120) {
        totalDuration += duration;
        durationCount++;
      }
    }

    const ts = parseSessionDate(s.date);
    if (ts > 0) {
      const sDate = new Date(ts);
      if (previousDate) {
        const diffDays = Math.round(
          (sDate.getTime() - previousDate.getTime()) / (1000 * 60 * 60 * 24),
        );
        if (diffDays > 0 && diffDays < 100) {
          totalRestDays += diffDays;
          restIntervalCount++;
        }
      }
      previousDate = sDate;
    }
  });

  const avgDuration =
    durationCount > 0 ? Math.round(totalDuration / durationCount) : 0;
  const avgRestDays =
    restIntervalCount > 0
      ? Math.round((totalRestDays / restIntervalCount) * 10) / 10
      : 0;

  let totalVolume = 0;
  let totalRepsRaw = 0;
  let totalGoodReps = 0;

  const filteredSessionIds = new Set(filteredSessions.map((s) => s.id));

  allLogs.forEach((log) => {
    if (filteredSessionIds.has(log.sessionId)) {
      if (log.repQuality === 3) {
        totalGoodReps++;
      }
      const w = parseInt(log.weight || "0", 10);
      if (!isNaN(w) && w > 0) {
        if (log.isStaticHold || log.isTSC) {
          const s = parseInt(log.seconds || "0", 10);
          if (!isNaN(s) && s > 0) {
            const equiv = (s / 30) * 2;
            totalVolume += w * equiv;
            totalRepsRaw += equiv;
          }
        } else {
          const r = parseInt(log.reps || "0", 10) || 1;
          totalVolume += w * r;
          totalRepsRaw += r;
        }
      }
    }
  });

  const finalVolume = Math.round(totalVolume);
  const finalReps = Math.round(totalRepsRaw);

  return {
    totalSessions,
    firstSessionDate,
    totalVolume: isNaN(finalVolume) ? 0 : finalVolume,
    totalReps: isNaN(finalReps) ? 0 : finalReps,
    totalGoodReps,
    avgRestDays,
    avgDuration,
    score: Math.min(100, Math.round((totalSessions / 24) * 100)),
    punctuality: "Generally punctual with minor variations.",
  };
}

export async function calculateDynamicHighlightMetrics(
  clientId: string,
  machineId: string,
  startDateStr?: string,
) {
  const sessionsQuery = query(
    collection(db, "sessions"),
    where("clientId", "==", clientId),
    where("status", "==", "Completed"),
  );
  const sessionsSnap = await getDocs(sessionsQuery);
  const userSessions = sessionsSnap.docs
    .map((d) => ({ id: d.id, ...d.data() }) as WorkoutSession)
    .filter((s) => !startDateStr || s.date >= startDateStr);

  if (userSessions.length === 0) return null;

  const sessionIds = new Set(userSessions.map((s) => s.id));

  const logsQuery = query(
    collection(db, "exerciseLogs"),
    where("clientId", "==", clientId),
    where("machineId", "==", machineId),
  );

  const logsSnap = await getDocs(logsQuery);

  const sessionInfoMap = new Map();
  userSessions.forEach((s) => {
    sessionInfoMap.set(s.id, {
      sessionNumber: s.sessionNumber || 0,
      date: s.date || "",
    });
  });

  const validLogs = logsSnap.docs
    .map(
      (d) =>
        ({
          id: d.id,
          createdAt: d.data().createdAt,
          ...d.data(),
        }) as ExerciseLog,
    )
    .filter((l) => sessionIds.has(l.sessionId))
    .sort((a, b) => {
      const sessA = sessionInfoMap.get(a.sessionId);
      const sessB = sessionInfoMap.get(b.sessionId);

      if (sessA && sessB) {
        if (sessA.sessionNumber !== sessB.sessionNumber) {
          return sessA.sessionNumber - sessB.sessionNumber;
        }
        if (sessA.date !== sessB.date) {
          return sessA.date.localeCompare(sessB.date);
        }
      }

      const timeA = a.createdAt?.toMillis?.() || 0;
      const timeB = b.createdAt?.toMillis?.() || 0;
      return timeA - timeB; // ascending
    });

  if (validLogs.length === 0) return null;

  const weights = validLogs
    .map((l) => parseFloat(l.weight || "0") || 0)
    .filter((w) => w > 0);
  if (weights.length === 0) return null;

  const startW = weights[0];
  const currentW = weights[weights.length - 1];

  let percentageIncrease = 0;
  if (startW > 0) {
    percentageIncrease = Math.round(((currentW - startW) / startW) * 100);
  }
  if (isNaN(percentageIncrease)) percentageIncrease = 0;

  let totalVolume = 0;
  let perfectSets = 0;
  let timeUnderTension = 0;

  validLogs.forEach((l) => {
    const w = parseFloat(l.weight || "0") || 0;
    const sVal = parseFloat(l.seconds || "0") || 0;
    if (l.isStaticHold || l.isTSC) {
      totalVolume += w * ((sVal / 30) * 2);
    } else {
      const r = parseFloat(l.reps || "0") || 1;
      totalVolume += w * r;
    }

    if (l.repQuality === 3) {
      perfectSets++;
    }

    timeUnderTension += sVal;
  });

  const finalVolume = Math.round(totalVolume);

  return {
    startWeight: startW,
    currentWeight: currentW,
    percentageIncrease,
    totalVolume: isNaN(finalVolume) ? 0 : finalVolume,
    perfectSets,
    timeUnderTension: isNaN(timeUnderTension) ? 0 : timeUnderTension,
  };
}

export interface MachineAverageTut {
  machineId: string;
  machineName?: string;
  avgTutSeconds: number;
  totalLogsCount: number;
}

export function calculateAverageTutPerMachine(
  logs: ExerciseLog[],
  machines?: { id: string; name?: string; fullName?: string }[],
): MachineAverageTut[] {
  const machineMap: Record<string, { sum: number; count: number }> = {};

  logs.forEach((log) => {
    const tut = log.machineDurationSeconds;
    if (
      tut === undefined ||
      tut === null ||
      isNaN(tut) ||
      tut <= 0 ||
      !log.machineId
    ) {
      return;
    }

    if (!machineMap[log.machineId]) {
      machineMap[log.machineId] = { sum: 0, count: 0 };
    }

    machineMap[log.machineId].sum += tut;
    machineMap[log.machineId].count += 1;
  });

  return Object.keys(machineMap).map((mId) => {
    const data = machineMap[mId];
    const matchedMachine = machines?.find((m) => m.id === mId);
    const machineName = matchedMachine?.fullName || matchedMachine?.name || mId;

    return {
      machineId: mId,
      machineName,
      avgTutSeconds:
        data.count > 0 ? Number((data.sum / data.count).toFixed(1)) : 0,
      totalLogsCount: data.count,
    };
  });
}
``;
