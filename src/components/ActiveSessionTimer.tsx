import React, { useState, useEffect, memo } from "react";
import { Play, Pause } from "lucide-react";
import { cn } from "@/lib/utils";

interface ActiveSessionTimerProps {
  startTime: any;
  paused?: boolean;
  onTogglePause?: () => void;
  isMobile?: boolean;
}

// Robust, Touch-Optimized Active Session Timer with Pause/Play toggles
export const ActiveSessionTimer = memo(function ActiveSessionTimer({
  startTime,
  paused = false,
  onTogglePause,
  isMobile = false,
}: ActiveSessionTimerProps) {
  const [elapsed, setElapsed] = useState<number>(0);
  const [accumulatedPauseTime, setAccumulatedPauseTime] = useState<number>(0);
  const [pauseStart, setPauseStart] = useState<number | null>(null);

  useEffect(() => {
    if (!startTime) return;

    // When paused state turns on, record when we paused
    if (paused && pauseStart === null) {
      setPauseStart(Date.now());
    }
    // When paused state turns off, sum up the time spent paused
    else if (!paused && pauseStart !== null) {
      setAccumulatedPauseTime((prev) => prev + (Date.now() - pauseStart));
      setPauseStart(null);
    }
  }, [paused, startTime]);

  useEffect(() => {
    if (!startTime || paused) return;

    const start = startTime?.toDate ? startTime.toDate() : new Date(startTime);

    const updateTime = () => {
      const now = new Date();
      // Calculate total elapsed excluding the total time we spent paused
      let diff = Math.floor(
        (now.getTime() - accumulatedPauseTime - start.getTime()) / 1000,
      );
      if (diff < 0) diff = 0;
      setElapsed(diff);
    };

    updateTime();
    const interval = setInterval(updateTime, 1000);

    return () => clearInterval(interval);
  }, [startTime, paused, accumulatedPauseTime]);

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
            paused
              ? "bg-cta hover:opacity-90 text-white shadow-[0_0_12px_rgba(240,108,34,0.4)]"
              : "bg-slate-200 hover:bg-slate-300 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200",
          )}
          title={paused ? "Resume Session" : "Pause Session"}
        >
          {paused ? (
            <Play
              className={
                isMobile ? "w-3 h-3 fill-current ml-0.5" : "w-4 h-4 fill-current ml-0.5"
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
          {paused ? "PAUSED" : "ELAPSED"}
        </span>
        <span
          className={cn(
            "tabular-nums font-mono font-black leading-none",
            paused ? "text-amber-500" : "text-slate-800 dark:text-slate-100",
            isMobile ? "text-[15px]" : "text-xl sm:text-2xl",
          )}
        >
          {formatTime(elapsed)}
        </span>
      </div>
    </div>
  );
});
