import React from "react";
import { ChevronRight, GripHorizontal, Timer } from "lucide-react";

interface SeqMachine {
  idx: number;
  name: string;
  lastLb: number | string | null;
  lastReps: number | string | null;
  lastUnit?: "reps" | "sec";
  isTSC?: boolean;
}

interface SequenceRowProps extends React.HTMLAttributes<HTMLDivElement> {
  key?: number | string;
  machine: SeqMachine;
}

export function SequenceRow({ machine, ...props }: SequenceRowProps) {
  return (
    <div
      {...props}
      className="flex items-center bg-bg-dark-2 border border-div-d rounded-[10px] px-2.5 sm:px-3.5 py-2 sm:py-2.5 min-h-13 w-full transition-all"
    >
      <div className="w-4 sm:w-5 text-cta font-display italic text-[11px] sm:text-[12px] font-bold shrink-0">
        {machine.idx}
      </div>

      <div className="flex-1 flex gap-1.5 sm:gap-2 items-center text-ink-d1 font-display italic text-[12px] sm:text-[14px] uppercase tracking-[0.02em] min-w-0 pr-2">
        <span className="truncate">{machine.name}</span>
        {machine.isTSC && (
          <span className="flex items-center gap-1 bg-cyan/10 text-cyan rounded-full px-1.5 py-0.5 text-[10px] sm:text-[11px] shrink-0 font-sans font-bold">
            <Timer className="w-2.5 h-2.5 sm:w-3 sm:h-3" />
            <span>TSC</span>
          </span>
        )}
      </div>

      <div className="flex items-center gap-2.5 sm:gap-4 shrink-0 mr-1 sm:mr-3">
        <div className="flex flex-col items-end justify-center min-w-9.5 sm:min-w-12">
          <span className="text-[9px] sm:text-[11px] text-ink-d3 font-medium tracking-wide opacity-60 uppercase mb-0.5 whitespace-nowrap">
            LAST LB
          </span>
          <span className="text-[13px] sm:text-[15px] text-ink-d1 font-black italic tabular-nums leading-none">
            {machine.lastLb !== null &&
            machine.lastLb !== undefined &&
            machine.lastLb !== "" ? (
              machine.lastLb
            ) : (
              <span className="text-ink-d3">—</span>
            )}
          </span>
        </div>
        <div className="flex flex-col items-end justify-center min-w-10.5 sm:min-w-13">
          <span className="text-[9px] sm:text-[11px] text-ink-d3 font-medium tracking-wide opacity-60 uppercase mb-0.5 whitespace-nowrap">
            LAST {machine.lastUnit === "sec" ? "SEC" : "REPS"}
          </span>
          <span className="text-[13px] sm:text-[15px] text-ink-d1 font-black italic tabular-nums leading-none">
            {machine.lastReps !== null &&
            machine.lastReps !== undefined &&
            machine.lastReps !== "" ? (
              machine.lastReps
            ) : (
              <span className="text-ink-d3">—</span>
            )}
          </span>
        </div>
      </div>

      <ChevronRight className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-ink-d3 opacity-50 shrink-0" />
    </div>
  );
}
