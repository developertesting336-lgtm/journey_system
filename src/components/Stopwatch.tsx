import React, { useState, useEffect, useRef, memo } from "react";
import { Play, Pause, RotateCcw, Timer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { motion } from "motion/react";

// 1. Isolate the Timer: Use React.memo so the parent doesn't re-render on interval tick.
export const Stopwatch = memo(function Stopwatch({
  initialValue = 0,
  onLogTSC,
}: {
  initialValue?: number;
  onLogTSC?: (seconds: number) => void;
}) {
  const [time, setTime] = useState(initialValue);
  const [isActive, setIsActive] = useState(false);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (isActive) {
      intervalRef.current = setInterval(() => {
        setTime((prev) => prev + 1);
      }, 1000);
    } else {
      if (intervalRef.current) clearInterval(intervalRef.current);
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [isActive]);

  const toggle = () => setIsActive(!isActive);

  const reset = () => {
    setIsActive(false);
    setTime(0);
  };

  const formatTime = (s: number) => {
    const mins = Math.floor(s / 60);
    const secs = s % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  return (
    <div className="flex items-center justify-center pointer-events-none px-2">
      <motion.div
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        className="bg-bg-dark-2/95 backdrop-blur-md border border-div-d px-2.5 sm:px-4 py-1.5 sm:py-2 rounded-full shadow-2xl flex items-center gap-2 sm:gap-4 pointer-events-auto max-w-full"
      >
        <div className="flex items-center gap-1.5 sm:gap-3">
          <div className="flex flex-col items-start">
            <span className="text-[9px] sm:text-[11px] font-black uppercase text-cta tracking-[0.15em] sm:tracking-[0.2em] leading-none mb-0.5">
              Timer
            </span>
            <span className="text-base sm:text-xl font-black italic tracking-tighter text-ink-d1 font-mono tabular-nums leading-none min-w-11 sm:min-w-15">
              {formatTime(time)}
            </span>
          </div>

          <div className="h-5 sm:h-6 w-px bg-div-d mx-0.5 sm:mx-1" />

          <div className="flex gap-1">
            <Button
              size="icon"
              variant="ghost"
              className={`h-7 w-7 sm:h-9 sm:w-9 rounded-full transition-all duration-300 ${isActive ? "text-amber-400 hover:text-amber-300 hover:bg-white/5" : "text-emerald-400 hover:text-emerald-300 hover:bg-white/5"}`}
              onClick={toggle}
            >
              {isActive ? (
                <Pause className="w-3.5 h-3.5 sm:w-5 sm:h-5 fill-current" />
              ) : (
                <Play className="w-3.5 h-3.5 sm:w-5 sm:h-5 fill-current" />
              )}
            </Button>

            <Button
              size="icon"
              variant="ghost"
              className="h-7 w-7 sm:h-9 sm:w-9 rounded-full text-slate-400 hover:text-ink-d1 hover:bg-white/5"
              onClick={reset}
            >
              <RotateCcw className="w-3 h-3 sm:w-4 sm:h-4" />
            </Button>
          </div>
        </div>

        {onLogTSC && (
          <>
            <div className="h-5 sm:h-6 w-px bg-div-d mx-0.5 sm:mx-1" />
            <Button
              onClick={() => {
                onLogTSC(time);
                setIsActive(false);
              }}
              className="bg-cta hover:opacity-90 text-white font-black uppercase italic tracking-wider text-[10px] sm:text-[11px] px-2.5 sm:px-4 h-7 sm:h-9 rounded-full shadow-[0_0_15px_rgba(240,108,34,0.3)] transition-all active:scale-95 cursor-pointer whitespace-nowrap"
            >
              <Timer className="w-3 h-3 sm:w-3.5 sm:h-3.5 mr-1 sm:mr-1.5" />
              Log as TSC
            </Button>
          </>
        )}
      </motion.div>
    </div>
  );
});
