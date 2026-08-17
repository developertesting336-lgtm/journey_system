import React from "react";
import AppointmentCard, {
  AppointmentState,
  AppointmentSyncState,
} from "./AppointmentCard";
import { cn } from "../../lib/utils";
import { zonedHM } from "../../lib/studio-time";

export type ShiftRosterTrainer = {
  id: string;
  initials: string;
  fullName?: string;
  brandColor?: string;
  sessionCount?: number;
};

export type ShiftRosterAppointment = {
  id: string;
  clientName: string;
  time: string;
  state: AppointmentState;
  syncState?: AppointmentSyncState;
  isNextUp?: boolean;
  isForeign?: boolean;
  isLocked?: boolean;
  rescheduledToTime?: string;
};

export type ShiftRosterRowProps = {
  trainer: ShiftRosterTrainer;
  timeColumns: string[];
  appointments: ShiftRosterAppointment[];
  currentTime: Date;
  availableTimes?: string[];
  onAppointmentClick?: (apt: ShiftRosterAppointment) => void;
  className?: string;
};

function findNowColumn(
  timeColumns: string[],
  currentTime: Date,
): string | null {
  const hm = zonedHM(currentTime);
  const currentTotalMins = hm ? hm.hour * 60 + hm.minute : 0;

  let latestCol: string | null = null;
  let latestMins = -1;

  for (const col of timeColumns) {
    const [hStr, mStr] = col.split(":");
    const h = parseInt(hStr, 10);
    const m = parseInt(mStr, 10);
    if (isNaN(h) || isNaN(m)) continue;

    const colTotalMins = h * 60 + m;
    if (colTotalMins <= currentTotalMins) {
      if (colTotalMins > latestMins) {
        latestMins = colTotalMins;
        latestCol = col;
      }
    }
  }

  return latestCol;
}

export default function ShiftRosterRow({
  trainer,
  timeColumns,
  appointments,
  currentTime,
  availableTimes,
  onAppointmentClick,
  className,
}: ShiftRosterRowProps): React.ReactElement {
  const nowColumn = findNowColumn(timeColumns, currentTime);

  return (
    <div
      role="row"
      aria-label={`${trainer.fullName ?? trainer.initials}'s shift`}
      className={cn(
        "flex items-stretch border-b border-slate-200 dark:border-slate-800 min-h-18 w-full min-w-0 overflow-x-auto no-scrollbar",
        className,
      )}
    >
      <div className="sticky left-0 z-10 bg-white dark:bg-slate-900 shrink-0 flex flex-col items-center justify-center w-16 sm:w-20 px-2 border-r border-slate-200 dark:border-slate-800 shadow-sm">
        <div
          className={cn(
            "h-8 w-8 sm:h-9 sm:w-9 rounded-full flex items-center justify-center text-white text-xs font-display italic uppercase font-bold",
            !trainer.brandColor && "bg-slate-700",
          )}
          style={
            trainer.brandColor
              ? { backgroundColor: trainer.brandColor }
              : undefined
          }
        >
          {trainer.initials}
        </div>
        {trainer.sessionCount !== undefined && (
          <div className="text-[10px] font-bold text-slate-500 dark:text-slate-400 tabular-nums mt-1">
            {trainer.sessionCount}
          </div>
        )}
      </div>
      <div className="flex-1 flex overflow-x-auto no-scrollbar min-w-0">
        {timeColumns.map((col) => {
          const isNow = col === nowColumn;
          const isAvailable = availableTimes
            ? availableTimes.includes(col)
            : true;
          const colAppointments = appointments.filter((a) => a.time === col);

          return (
            <div
              key={col}
              role="gridcell"
              className={cn(
                "min-w-30 sm:min-w-35 shrink-0 flex flex-col gap-1 items-stretch justify-center px-1.5 py-2 relative",
                isNow &&
                  "bg-amber-500/5 dark:bg-amber-950/20 before:absolute before:left-0 before:top-1 before:bottom-1 before:w-0.5 before:bg-[#F06C22] before:rounded-full",
                !isAvailable &&
                  "opacity-40 bg-slate-100/50 dark:bg-slate-950/50",
              )}
            >
              {colAppointments.map((apt) => (
                <React.Fragment key={apt.id}>
                  <AppointmentCard
                    appointmentId={apt.id}
                    clientName={apt.clientName}
                    time={apt.time}
                    state={apt.state}
                    syncState={apt.syncState}
                    isNextUp={apt.isNextUp}
                    isForeign={apt.isForeign}
                    isLocked={apt.isLocked}
                    rescheduledToTime={apt.rescheduledToTime}
                    onClick={
                      onAppointmentClick
                        ? () => onAppointmentClick(apt)
                        : undefined
                    }
                    className="w-full"
                  />
                </React.Fragment>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}
