import React from 'react';
import { Zap } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '../../lib/utils';
import { zonedHM } from "../../lib/studio-time";

export type OpenSlot = {
  id: string;
  time: Date;
  trainerId: string;
  trainerName: string;
};

export type WaitlistEntry = {
  clientId: string;
  clientName: string;
  preferences: string;
};

export type WaitlistRecoveryWidgetProps = {
  openSlots: OpenSlot[];
  waitlist: WaitlistEntry[];
  onMatch: (slotId: string, clientId: string) => void;
  className?: string;
};

function formatTimeShort(date: Date): string {
  const hm = zonedHM(date);
  let hour = hm ? hm.hour : 0;
  const m = String(hm ? hm.minute : 0).padStart(2, '0');
  const period = hour >= 12 ? 'PM' : 'AM';
  hour = hour % 12 || 12;
  return `${hour}:${m} ${period}`;
}

function firstName(fullName: string): string {
  if (!fullName) return '';
  return fullName.trim().split(/\s+/)[0];
}

function plural(n: number): string {
  return n === 1 ? '' : 's';
}

/**
 * WaitlistRecoveryWidget
 * 
 * Surfaces revenue-recovery opportunities when a slot opens and waitlist matches exist.
 * Has three visual modes: quiet-no-slots, quiet-no-waitlist, active-recovery.
 */
export default function WaitlistRecoveryWidget({
  openSlots,
  waitlist,
  onMatch,
  className,
}: WaitlistRecoveryWidgetProps): React.ReactElement {
  if (openSlots.length === 0) {
    return (
      <div
        className={cn("bg-card border border-border/40 rounded-2xl p-4 transition-all", className)}
        role="region"
        aria-label="Waitlist recovery"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Zap className="size-4 text-muted-foreground" aria-hidden="true" />
            <span className="text-sm font-medium text-foreground/80">Waitlist Recovery</span>
          </div>
          <span className="text-muted-foreground text-xs">All slots filled</span>
        </div>
      </div>
    );
  }

  if (waitlist.length === 0) {
    return (
      <div
        className={cn("bg-card border border-border/40 rounded-2xl p-4 transition-all", className)}
        role="region"
        aria-label="Waitlist recovery"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Zap className="size-4 text-muted-foreground" aria-hidden="true" />
            <span className="text-sm font-medium text-foreground/80">Waitlist Recovery</span>
          </div>
          <span className="text-muted-foreground text-xs">
            {openSlots.length} open slot{plural(openSlots.length)} · No waitlist matches
          </span>
        </div>
        <div className="mt-3 flex flex-col gap-1">
          {openSlots.map(slot => (
            <div key={slot.id} className="text-sm text-muted-foreground">
              {formatTimeShort(slot.time)} with {slot.trainerName}
            </div>
          ))}
        </div>
      </div>
    );
  }

  const visibleWaitlist = waitlist.slice(0, 5);
  const hiddenCount = Math.max(0, waitlist.length - 5);

  return (
    <div
      className={cn(
        "bg-card border-2 border-amber rounded-2xl p-4 transition-all animate-pulse shadow-[0_0_24px_rgba(245,166,35,0.35)]",
        className
      )}
      role="region"
      aria-label="Waitlist recovery"
      aria-live="polite"
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Zap className="size-4 text-amber" aria-hidden="true" />
          <span className="font-display italic uppercase text-sm tracking-wide text-foreground">
            Waitlist Recovery
          </span>
        </div>
        <span className="text-amber text-sm font-semibold">
          {openSlots.length} slot{plural(openSlots.length)} to recover
        </span>
      </div>
      <div className="mt-4 flex flex-col gap-4">
        {openSlots.map(slot => {
          const timeStr = formatTimeShort(slot.time);
          
          return (
            <div key={slot.id} className="flex flex-col gap-2">
              <div className="text-sm font-medium text-foreground">
                {timeStr} with {slot.trainerName}
              </div>
              <div className="flex gap-2 overflow-x-auto no-scrollbar">
                {visibleWaitlist.map(entry => {
                  const name = firstName(entry.clientName);
                  const ariaLbl = `Match ${name} to ${timeStr} slot with ${slot.trainerName}`;
                  
                  const matchChip = (
                    <button
                      type="button"
                      onClick={() => onMatch(slot.id, entry.clientId)}
                      className="inline-flex items-center gap-1.5 rounded-full bg-cta/10 border border-cta/40 text-cta px-2.5 py-1 text-xs font-medium hover:bg-cta/20 transition-colors whitespace-nowrap shrink-0"
                      aria-label={ariaLbl}
                    >
                      {name}
                    </button>
                  );

                  if (entry.preferences) {
                    return (
                      <React.Fragment key={entry.clientId}>
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger render={matchChip} />
                            <TooltipContent side="top">
                              {entry.clientName} — {entry.preferences}
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      </React.Fragment>
                    );
                  }

                  return <React.Fragment key={entry.clientId}>{matchChip}</React.Fragment>;
                })}
                {hiddenCount > 0 && (
                  <button
                    type="button"
                    disabled
                    className="inline-flex items-center gap-1.5 rounded-full bg-muted text-muted-foreground border border-border px-2.5 py-1 text-xs font-medium whitespace-nowrap shrink-0 cursor-not-allowed"
                  >
                    +{hiddenCount} more
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
