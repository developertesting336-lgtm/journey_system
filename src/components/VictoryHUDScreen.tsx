import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { AppHeader } from "./AppHeader";
import { StickyCTA } from "./StickyCTA";
import { FeelToggle } from "./FeelToggle";
import { BentoStatTile } from "./BentoStatTile";
import {
  Client,
  WorkoutSession,
  ExerciseLog,
  Trainer,
  ScheduleEntry,
  Machine,
} from "../types";
import { safeToDate } from "../lib/utils";
import { getBroadMuscleGroup } from "../lib/clinical-review-utils";

export interface VictoryHUDScreenProps {
  client: Client;
  session: WorkoutSession;
  logs: ExerciseLog[];
  allLogs?: ExerciseLog[];
  schedules?: ScheduleEntry[];
  authTrainer: Trainer | null;
  onFinalize: (postData: {
    clientFeel: string;
    noteContent: string;
    notePriority: "High" | "Medium" | "Low";
  }) => void;
  isSyncing?: boolean;
  machines?: Machine[];
  rightControls?: React.ReactNode;
  trainerDropdown?: React.ReactNode;
  onStudioClick?: () => void;
}

export function VictoryHUDScreen({
  client,
  session,
  logs,
  allLogs = [],
  schedules = [],
  authTrainer,
  onFinalize,
  isSyncing,
  machines = [],
  rightControls,
  trainerDropdown,
  onStudioClick,
}: VictoryHUDScreenProps) {
  const [feel, setFeel] = useState<
    "great" | "good" | "fatigued" | "sore" | "pain"
  >("good");
  const [notes, setNotes] = useState("");
  const [priority, setPriority] = useState<"High" | "Medium" | "Low">("Medium");
  const [particles, setParticles] = useState<
    {
      id: number;
      x: number;
      y: number;
      color: string;
      size: number;
      delay: number;
    }[]
  >([]);

  useEffect(() => {
    // Generate particle burst elements shooting out from center
    const colors = [
      "#F06C22",
      "#38BDF8",
      "#4FDB8E",
      "#FCD661",
      "#A855F7",
      "#E2E8F0",
    ];
    const generated = Array.from({ length: 45 }).map((_, i) => ({
      id: i,
      x: (Math.random() - 0.5) * 360,
      y: (Math.random() - 0.6) * 360 - 50,
      color: colors[Math.floor(Math.random() * colors.length)],
      size: Math.random() * 8 + 4,
      delay: Math.random() * 0.15,
    }));
    setParticles(generated);
  }, []);

  // Multi-format support for stats
  const getLogLoad = (l: ExerciseLog) =>
    parseFloat(l.loadLb || l.weight || "0") || 0;
  const getLogReps = (l: ExerciseLog) => {
    if (l.isTSC || l.isStaticHold) {
      const secs =
        parseFloat(
          l.seconds || (l.isTSC || l.isStaticHold ? l.reps : "") || "0",
        ) || 0;
      return (secs / 30) * 2;
    }
    return parseFloat(l.outcomeReps || l.reps || "0") || 0;
  };
  const getLogTut = (l: ExerciseLog) => {
    return (
      parseFloat(
        l.outcomeTut ||
          l.seconds ||
          (l.isTSC || l.isStaticHold ? l.reps : "") ||
          "0",
      ) || 0
    );
  };

  // Calculate actual total tonnage from today's logs
  const totalTonnage = logs.reduce(
    (sum, l) => sum + getLogLoad(l) * getLogReps(l),
    0,
  );

  // Calculate today's broad muscle grouping breakdown
  const todayBroad: Record<string, number> = {
    "Lower Body": 0,
    "Upper Body": 0,
    "Core & Spine": 0,
    Other: 0,
  };

  logs.forEach((l) => {
    const machine = machines.find((m) => m.id === l.machineId);
    const region = machine?.anatomicalRegion || "";
    const name = machine?.name || "";
    const group = getBroadMuscleGroup(region, name);
    const tonnage = getLogLoad(l) * getLogReps(l);
    todayBroad[group] += tonnage;
  });

  const todayBroadList = [
    {
      name: "Lower Body",
      value: todayBroad["Lower Body"],
      color: "bg-emerald-500",
    },
    { name: "Upper Body", value: todayBroad["Upper Body"], color: "bg-cyan" },
    {
      name: "Core & Spine",
      value: todayBroad["Core & Spine"],
      color: "bg-orange-500",
    },
    { name: "Other", value: todayBroad["Other"], color: "bg-indigo-500" },
  ].filter((item) => item.value > 0 || item.name !== "Other");

  // Total session duration
  const startD = safeToDate(session.startTime) || safeToDate(session.createdAt);
  const endD = safeToDate(session.endTime) || new Date();

  // Calculate Time Under Tension using background timers (or fallback estimate for legacy logs)
  const totalReps = logs.reduce((sum, l) => sum + getLogReps(l), 0);
  const sessionDurationMs = startD
    ? Math.max(0, endD.getTime() - startD.getTime())
    : 0;
  const sessionDurationSeconds = sessionDurationMs / 1000;
  const numMachines = logs.length || 1;
  const fallbackTimePerMachineSeconds = sessionDurationSeconds / numMachines;

  const estimatedTotalTUT = logs.reduce((sum, l) => {
    // Time Under Tension = the actual time spent on the machine under load.
    // Use the exact background timer if available, otherwise the per-machine session estimate.
    // We do NOT divide by reps — the full machine duration IS the TUT regardless of rep count.
    const machineDuration = l.machineDurationSeconds ?? l.totalTimeUnderLoad;
    if (machineDuration !== undefined && machineDuration > 0) {
      return sum + machineDuration;
    }
    return sum + fallbackTimePerMachineSeconds;
  }, 0);

  const estimatedTUTDisplay =
    estimatedTotalTUT >= 60
      ? `${Math.floor(estimatedTotalTUT / 60)}:${Math.floor(
          estimatedTotalTUT % 60,
        )
          .toString()
          .padStart(2, "0")}`
      : `${Math.round(estimatedTotalTUT)}`;

  const estimatedTUTUnit = estimatedTotalTUT >= 60 ? "" : "s";

  // Calculate max strength sets
  const maxStrengthSets = logs.filter((l) => (l.repQuality || 0) >= 3).length;
  const totalSets = logs.length;

  // Duration formatting

  let durationFormat = "0:00";
  if (startD) {
    const durationMs = Math.max(0, endD.getTime() - startD.getTime());
    if (durationMs < 1000 * 60 * 60 * 12) {
      const durationMins = Math.floor(durationMs / 60000);
      const durationSecs = Math.floor((durationMs % 60000) / 1000);
      durationFormat = `${durationMins}:${durationSecs.toString().padStart(2, "0")}`;
    }
  }

  // Lifetime stats
  const lifetimeVolume = allLogs.reduce(
    (sum, l) => sum + getLogLoad(l) * getLogReps(l),
    0,
  );
  const lifetimeReps = allLogs.reduce((sum, l) => sum + getLogReps(l), 0);
  const sessionCount = new Set(allLogs.map((l) => l.sessionId)).size;
  const avgRepsPerSession =
    sessionCount > 0 ? (lifetimeReps / sessionCount).toFixed(1) : "0";

  const tiles = [
    {
      id: "tonnage",
      label: "TODAY'S TONNAGE",
      value: totalTonnage,
      unit: "lb",
      variant: "hero" as const,
      broadBreakdown: todayBroadList,
    },
    {
      id: "tut",
      label: "EST. TIME UNDER TENSION",
      value: estimatedTUTDisplay,
      unit: estimatedTUTUnit,
      variant: "default" as const,
    },
    {
      id: "elite",
      label: "MAX STRENGTH SETS",
      value: maxStrengthSets.toString(),
      meta: `/ ${totalSets}`,
      progress: { current: maxStrengthSets, target: totalSets },
      variant: "default" as const,
    },
    {
      id: "reps",
      label: "TOTAL REPS",
      value: Number.isInteger(totalReps)
        ? totalReps
        : parseFloat(totalReps.toFixed(1)),
      variant: "default" as const,
    },
    {
      id: "duration",
      label: "DURATION",
      value: durationFormat,
      variant: "default" as const,
    },
    {
      id: "lifetimeVol",
      label: "LIFETIME VOLUME",
      value: lifetimeVolume.toLocaleString(),
      unit: "lb",
      meta: `${sessionCount} sessions`,
      variant: "elevated" as const,
    },
    {
      id: "lifetimeReps",
      label: "LIFETIME REPS",
      value: lifetimeReps.toLocaleString(),
      meta: `avg ${avgRepsPerSession} / session`,
      variant: "elevated" as const,
    },
  ];

  return (
    <div className="w-full h-full min-h-screen bg-bg-dark font-sans flex flex-col overflow-hidden relative">
      {/* Confetti Particle Explosion */}
      <div className="absolute inset-0 pointer-events-none z-50 flex items-center justify-center overflow-hidden">
        {particles.map((p) => (
          <motion.div
            key={p.id}
            initial={{ scale: 0, x: 0, y: 0, opacity: 1 }}
            animate={{
              scale: [0, 1.2, 1, 0],
              x: p.x,
              y: p.y,
              opacity: [1, 1, 0.7, 0],
              rotate: Math.random() * 360,
            }}
            transition={{
              duration: 1.4,
              delay: p.delay,
              ease: [0.1, 0.8, 0.3, 1],
            }}
            className="absolute rounded-xs"
            style={{
              width: p.size,
              height: p.size,
              backgroundColor: p.color,
            }}
          />
        ))}
      </div>

      <div className="max-w-205 mx-auto w-full h-full relative flex flex-col pb-24 border-x border-div-d shadow-2xl">
        <AppHeader
          variant="dark"
          trainerInitials={authTrainer?.initials || "AJ"}
          rightControls={rightControls}
          trainerDropdown={trainerDropdown}
          onStudioClick={onStudioClick}
        />

        <div className="flex-1 overflow-y-auto no-scrollbar relative z-10 flex flex-col pb-30">
          {/* Header Title block */}
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: "easeOut" }}
            className="px-6 py-3.5"
          >
            <div className="font-display italic text-cyan text-[11px] uppercase tracking-[0.16em] mb-1">
              🏆 VICTORY HUD
            </div>
            <h1 className="font-display italic text-ink-d1 text-[38px] uppercase tracking-[-0.01em] leading-none mb-2 mt-2">
              SESSION COMPLETE
            </h1>
            <div className="flex items-center gap-2 text-ink-d2 text-[13px]">
              <span>Great work · {client.firstName}'s numbers for today.</span>
              <div className="font-mono text-[11px] bg-white/10 px-2 py-0.75 rounded-[10px] tracking-[0.04em] uppercase text-ink-d1 ml-2">
                SESSION · {session.id.substring(0, 8)}…
              </div>
            </div>
          </motion.div>

          {/* Staggered Bento stat grid */}
          <div className="px-5 mt-2">
            <div className="grid grid-cols-4 auto-rows-[86px] gap-2.5">
              {tiles.map((tile, index) => {
                const colSpan =
                  tile.variant === "hero"
                    ? "col-span-4 row-span-4 sm:row-span-2"
                    : "col-span-2 row-span-1";
                return (
                  <motion.div
                    key={tile.id}
                    initial={{ opacity: 0, scale: 0.9, y: 20 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    transition={{
                      duration: 0.45,
                      delay: 0.1 + index * 0.05,
                      ease: [0.16, 1, 0.3, 1],
                    }}
                    className={colSpan}
                  >
                    <BentoStatTile {...tile} />
                  </motion.div>
                );
              })}
            </div>
          </div>

          {/* Feedback Form Card */}
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.5, ease: "easeOut" }}
            className="mx-5 mt-4 p-3.5 px-4 bg-bg-dark-2 border border-div-d rounded-[14px] flex flex-col gap-3"
          >
            <div className="font-display italic text-cyan text-[11px] uppercase tracking-widest">
              RECOVERY + CLINICAL LOG
            </div>

            <div className="font-display italic text-ink-d1 text-[17px] uppercase -mt-1">
              How does {client.firstName} feel?
            </div>

            <FeelToggle value={feel} onChange={(val) => setFeel(val as any)} />

            <textarea
              className="w-full bg-black/25 border border-white/10 rounded-[10px] p-2.5 px-3 min-h-15 text-[13px] text-ink-d1 placeholder:text-ink-d3 placeholder:italic placeholder:font-sans resize-none outline-none focus:border-cyan transition-colors mt-1"
              placeholder="Post-session notes — any closing observations? These feed into next briefing."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />

            <div className="flex items-center justify-between mt-1">
              <span className="font-display italic text-[11px] text-ink-d3 uppercase tracking-wider">
                PRIORITY FOR NEXT TIME
              </span>
              <button
                onClick={() => {
                  const next: Record<string, "High" | "Medium" | "Low"> = {
                    High: "Low",
                    Low: "Medium",
                    Medium: "High",
                  };
                  setPriority(next[priority]);
                }}
                className={`font-display italic text-[11px] uppercase px-4 min-h-11 min-w-11 rounded-xl flex items-center gap-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan focus-visible:ring-offset-2 focus-visible:ring-offset-bg-dark ${
                  priority === "High"
                    ? "bg-orange-500/20 border border-orange-500/30 text-orange-400 hover:bg-orange-500/30"
                    : priority === "Medium"
                      ? "bg-cyan/10 border border-cyan/30 text-cyan hover:bg-cyan/20"
                      : "bg-white/5 border border-white/10 text-white hover:bg-white/10"
                }`}
              >
                {priority} <span className="text-[11px] opacity-70">▼</span>
              </button>
            </div>
          </motion.div>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.6 }}
          className="w-full absolute bottom-0 left-0 px-5"
        >
          <StickyCTA
            label={isSyncing ? "SAVING..." : "FINALIZE & RETURN TO HUB"}
            icon={
              !isSyncing ? (
                <span className="text-[13px] order-last ml-1">▶</span>
              ) : undefined
            }
            onClick={() =>
              onFinalize({
                clientFeel: feel,
                noteContent: notes,
                notePriority: priority,
              })
            }
            className="mb-8"
          />
        </motion.div>
      </div>
    </div>
  );
}
