import React, { useState, useEffect, memo } from "react";
import { Play, Pause } from "lucide-react";
import { cn } from "@/lib/utils";

interface ActiveSessionTimerProps {
  /** Session start. Firestore Timestamp, Date, or ISO string. */
  startTime: any;
  /** Client-clock start, used while a serverTimestamp() write is still pending. */
  fallbackStartTime?: any;
  /** When the current pause began, or null/undefined while running. */
  pausedAt?: any;
  /** Milliseconds accumulated across previous pauses. */
  totalPausedMs?: number;
  onTogglePause?: () => void;
  isMobile?: boolean;
}

/**
 * Seconds of active training time, excluding any paused spans.
 *
 * Exported so the arithmetic can be verified directly — an off-by-one here shows
 * up as a session that silently over- or under-reports its duration.
 */
export function computeElapsedSeconds(params: {
  startMs: number | null;
  pausedAtMs: number | null;
  totalPausedMs?: number;
  now?: number;
}): number {
  const { startMs, pausedAtMs, totalPausedMs = 0, now = Date.now() } = params;
  if (startMs === null) return 0;

  const currentPause = pausedAtMs !== null ? Math.max(0, now - pausedAtMs) : 0;
  const pausedSoFar = (Number(totalPausedMs) || 0) + currentPause;

  return Math.max(0, Math.floor((now - startMs - pausedSoFar) / 1000));
}

/** Milliseconds from a Firestore Timestamp, Date, or ISO string; null if absent. */
export function toMillis(value: any): number | null {
  if (!value) return null;
  if (typeof value.toMillis === "function") return value.toMillis();
  if (typeof value.toDate === "function") return value.toDate().getTime();
  const ms = new Date(value).getTime();
  return isNaN(ms) ? null : ms;
}

/**
 * Elapsed session time.
 *
 * Every input is derived from the session document rather than held in component
 * state, so the reading is identical after a refresh, a navigation, or on another
 * device. The previous version tracked pauses in local state, which meant a
 * refresh mid-pause silently counted the break as training time, and a remount
 * restarted the count from zero.
 */
export const ActiveSessionTimer = memo(function ActiveSessionTimer({
  startTime,
  fallbackStartTime,
  pausedAt,
  totalPausedMs = 0,
  onTogglePause,
  isMobile = false,
}: ActiveSessionTimerProps) {
  // Re-render once a second; the value itself is computed, never accumulated.
  const [, setTick] = useState(0);

  const pausedAtMs = toMillis(pausedAt);
  const isPaused = pausedAtMs !== null;

  useEffect(() => {
    if (isPaused) return;
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, [isPaused]);

  // serverTimestamp() reads as null locally until the server confirms the write,
  // so fall back to the client clock and the timer starts moving immediately.
  const startMs = toMillis(startTime) ?? toMillis(fallbackStartTime);

  const elapsed = computeElapsedSeconds({ startMs, pausedAtMs, totalPausedMs });

  const formatTime = (s: number) => {
    const mins = Math.floor(s / 60);
    const secs = s % 60;
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  return (
    <div
      className={cn(
        "flex items-center transition-all backdrop-blur-md shrink-0 select-none",
        isMobile
          ? "gap-2 bg-slate-100/90 dark:bg-slate-900/90 border border-slate-200/80 dark:border-slate-800/80 px-2.5 py-1 rounded-xl shadow-sm"
          : "gap-3.5 bg-slate-100/95 dark:bg-slate-900/95 border-2 border-slate-200/90 dark:border-slate-800/90 px-4 py-2 rounded-2xl shadow-[0_4px_12px_rgba(0,0,0,0.08)]",
      )}
    >
      {onTogglePause && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onTogglePause();
          }}
          className={cn(
            "flex items-center justify-center transition-all cursor-pointer select-none active:scale-95 shrink-0",
            isMobile ? "w-7 h-7 rounded-lg" : "w-10 h-10 rounded-xl",
            isPaused
              ? "bg-cta hover:opacity-90 text-white shadow-[0_0_12px_rgba(240,108,34,0.4)]"
              : "bg-slate-200 hover:bg-slate-300 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200",
          )}
          title={isPaused ? "Resume Session" : "Pause Session"}
        >
          {isPaused ? (
            <Play
              className={
                isMobile
                  ? "w-3 h-3 fill-current ml-0.5"
                  : "w-4 h-4 fill-current ml-0.5"
              }
            />
          ) : (
            <Pause
              className={
                isMobile ? "w-3 h-3 fill-current" : "w-4 h-4 fill-current"
              }
            />
          )}
        </button>
      )}
      <div className="flex flex-col items-start leading-none justify-center">
        <span
          className={cn(
            "font-black uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-0.5",
            isMobile ? "text-[8px]" : "text-[10px]",
          )}
        >
          {isPaused ? "PAUSED" : "ELAPSED"}
        </span>
        <span
          className={cn(
            "tabular-nums font-mono font-black leading-none",
            isPaused ? "text-amber-500" : "text-slate-800 dark:text-slate-100",
            isMobile ? "text-[15px]" : "text-xl sm:text-2xl",
          )}
        >
          {formatTime(elapsed)}
        </span>
      </div>
    </div>
  );
});
