import React from "react";
import { cn } from "@/lib/utils";
import { Target, List } from "lucide-react";

interface RoutineCompareCardProps {
  variant: "scheduled" | "previous";
  label: string;
  title: string;
  meta: string;
}

export function RoutineCompareCard({
  variant,
  label,
  title,
  meta,
}: RoutineCompareCardProps) {
  const isScheduled = variant === "scheduled";

  return (
    <div
      className={cn(
        "relative flex flex-col p-3 rounded-[14px] overflow-hidden justify-center min-h-17 sm:h-19 w-full",
        isScheduled ? "bg-bg-dark-2" : "bg-surface-subtle border-transparent",
      )}
    >
      <div className="flex flex-col z-10">
        <span
          className={cn(
            "text-[10px] sm:text-[11px] font-medium tracking-wide opacity-60 uppercase mb-0.5 sm:mb-1",
            isScheduled ? "text-cyan" : "text-ink-d2",
          )}
        >
          {label}
        </span>
        <span className="text-[14px] sm:text-[16px] text-ink-d1 uppercase font-black tracking-wide leading-none mb-1 truncate">
          {title}
        </span>
        <span
          className={cn(
            "text-[10px] sm:text-[11px] font-medium font-sans opacity-80",
            isScheduled ? "text-cyan/80" : "text-ink-d3",
          )}
        >
          {meta}
        </span>
      </div>

      {/* Decorative Icon Background */}
      <div className="absolute -right-2.5 -bottom-2.5 opacity-20 pointer-events-none">
        {isScheduled ? (
          <Target
            className="w-14 h-14 sm:w-16 sm:h-16 text-cyan"
            strokeWidth={1}
          />
        ) : (
          <List
            className="w-14 h-14 sm:w-16 sm:h-16 text-ink-d1"
            strokeWidth={1}
          />
        )}
      </div>
    </div>
  );
}
