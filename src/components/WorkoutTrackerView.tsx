import React, { useState, useEffect, useMemo, useRef } from "react";
import {
  Search,
  Users,
  Plus,
  AlertCircle,
  Trash2,
  ChevronRight,
  Check,
  Sparkles,
  MessageSquare,
  Zap,
  LayoutList,
  Settings2,
  ClipboardList,
  PlusCircle,
  History,
  Loader2,
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import {
  collection,
  onSnapshot,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  query,
  orderBy,
  serverTimestamp,
  where,
  setDoc,
  getDocs,
  getDoc,
  limit,
  Timestamp,
} from "firebase/firestore";
import { User as FirebaseUser } from "firebase/auth";

import { db } from "../firebase";
import {
  Client,
  Machine,
  Trainer,
  View,
  WorkoutSession,
  ExerciseLog,
  ClientMachineSetting,
  SessionType,
  TrainerFocus,
  FocusRecord,
  SessionNote,
  Routine,
  PreSessionCheckIn,
} from "../types";
import { handleFirestoreError, OperationType } from "../lib/firestore-errors";
import {
  matchesRoutineLetter,
  routineLetterOf,
  findRoutineByLetter,
} from "../lib/routine-utils";
import {
  parseSessionDate,
  safeToDate,
  orderMachineSettings,
} from "../lib/utils";
import { completeWorkoutSession } from "../lib/sync-utils";
import { getLatestTargetWeight } from "../lib/historical-utils";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";

import { useActiveStudio } from "../ActiveStudioContext";
import { Stopwatch } from "./Stopwatch";
import { useToast } from "../contexts/ToastContext";
import {
  hasCount,
  hasRequiredCount,
  findIncompleteLogs,
} from "../lib/log-validation";
import { ActiveSessionTimer } from "./ActiveSessionTimer";
import { SessionRoutineManagerModal } from "./SessionRoutineManagerModal";
import { SessionNotesSidebar } from "./SessionNotesSidebar";
import { BriefingScreen } from "./BriefingScreen";
import { VictoryHUDScreen } from "./VictoryHUDScreen";
import { ConsultationSetupWizard } from "./ConsultationSetupWizard";

type RoutineType = "A" | "B" | "Free";

function ClientSelectionDialog({
  clients,
  onSelect,
  onClose,
  open = true,
  title = "Select Client",
  description = "Choose a client to start their current training session.",
}: {
  clients: Client[];
  onSelect: (id: string) => void;
  onClose: () => void;
  open?: boolean;
  title?: string;
  description?: string;
}) {
  const [search, setSearch] = useState("");
  const filtered = clients.filter((c) =>
    `${c.firstName} ${c.lastName}`.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <Dialog open={open} onOpenChange={(val) => !val && onClose()}>
      <DialogContent className="sm:max-w-112.5 rounded-3xl p-0 overflow-hidden">
        <DialogHeader className="p-6 pb-2">
          <DialogTitle className="text-2xl font-black uppercase italic tracking-tight">
            {title}
          </DialogTitle>
          <DialogDescription className="font-bold text-xs">
            {description}
          </DialogDescription>
        </DialogHeader>

        <div className="px-6 pb-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Find client..."
              className="pl-10 h-11 rounded-xl bg-white dark:bg-bg-dark border-none"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              autoFocus
            />
          </div>
        </div>

        <div className="max-h-[60vh] overflow-y-auto px-6 pb-6 pt-2 space-y-2">
          {filtered.length > 0 ? (
            filtered.map((client) => (
              <button
                key={client.id}
                onClick={() => onSelect(client.id!)}
                className="w-full text-left p-4 rounded-2xl border-2 border-transparent hover:border-primary/20 hover:bg-primary/5 transition-all flex items-center justify-between group"
              >
                <div>
                  <p className="font-black text-lg leading-tight uppercase">
                    {client.firstName} {client.lastName}
                  </p>
                  <p className="text-[11px] font-bold text-muted-foreground uppercase opacity-60">
                    {client.height} • {client.weight || "--"} lbs
                  </p>
                </div>
                <ChevronRight className="w-5 h-5 text-muted-foreground group-hover:text-primary transition-colors" />
              </button>
            ))
          ) : (
            <div className="py-12 text-center opacity-40">
              <Users className="w-12 h-12 mx-auto mb-2" />
              <p className="text-xs font-black uppercase">No clients found</p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function MachineSettingsDialog({
  machine,
  client,
  currentSettings,
  onClose,
  onSave,
}: {
  machine: Machine;
  client: Client;
  currentSettings?: ClientMachineSetting;
  onClose: () => void;
  onSave: (settings: Record<string, string>, reason: string) => void;
}) {
  const [settings, setSettings] = useState<Record<string, string>>(
    currentSettings?.settings || {},
  );
  const [reason, setReason] = useState("");

  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-100 rounded-3xl">
        <DialogHeader>
          <DialogTitle className="text-2xl font-black">
            Machine Settings
          </DialogTitle>
          <DialogDescription>
            Configure {machine.name} for {client.firstName} ({client.height},{" "}
            {client.gender}).
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-6 py-4">
          {machine.settings && (
            <div className="bg-primary/5 border border-primary/10 rounded-2xl p-4">
              <p className="text-[11px] font-black uppercase tracking-widest text-primary mb-2">
                Standard Benchmarks (Reference)
              </p>
              <p className="text-xs font-bold italic leading-relaxed text-primary/80">
                {machine.settings}
              </p>
            </div>
          )}
          <div className="space-y-4">
            {machine.settingOptions?.map((option) => (
              <div key={option} className="space-y-2">
                <div className="flex justify-between items-center pr-1">
                  <Label className="text-sm font-bold">{option}</Label>
                  {machine.standardSettings?.[option] && (
                    <span
                      className="text-xs font-semibold text-slate-500 dark:text-slate-400"
                      title="Standard Setting"
                    >
                      STD: {machine.standardSettings[option]}
                    </span>
                  )}
                </div>
                <Input
                  placeholder={
                    machine.standardSettings?.[option] ||
                    `Enter ${option} setting`
                  }
                  value={settings[option] || ""}
                  onChange={(e) =>
                    setSettings({ ...settings, [option]: e.target.value })
                  }
                  className="h-12 rounded-xl font-bold"
                />
              </div>
            ))}
            {(!machine.settingOptions ||
              machine.settingOptions.length === 0) && (
              <div className="space-y-2">
                <Label className="text-sm font-bold">General Setting</Label>
                <Input
                  placeholder="Enter setting"
                  value={settings["General"] || ""}
                  onChange={(e) =>
                    setSettings({ ...settings, ["General"]: e.target.value })
                  }
                  className="h-12 rounded-xl font-bold"
                />
              </div>
            )}
          </div>

          <div className="space-y-2">
            <Label className="text-sm font-bold">
              Reason for Change (Optional)
            </Label>
            <Textarea
              placeholder="e.g. Better alignment, client discomfort..."
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="rounded-xl min-h-20"
            />
          </div>

          <Button
            className="h-14 rounded-2xl font-black text-lg shadow-lg bg-action text-action-foreground hover:bg-action/90 shadow-action/20"
            onClick={() => onSave(settings, reason)}
          >
            Save Settings
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function PerformanceEntryDialog({
  machine,
  currentWeight,
  currentReps,
  currentQuality,
  pastMachineLogs,
  isStaticHold,
  side,
  isTorsoFull,
  currentRepsRight,
  onSave,
  onClose,
  machineSettings,
}: {
  machine: Machine;
  currentWeight: string;
  currentReps: string;
  currentQuality: number;
  pastMachineLogs: { log: ExerciseLog; session: WorkoutSession }[];
  isStaticHold?: boolean;
  side?: "Left" | "Right";
  isTorsoFull?: boolean;
  currentRepsRight?: string;
  onSave: (
    weight: string,
    repsOrSeconds: string,
    quality: number,
    isHold: boolean,
    side?: "Left" | "Right",
    repsRight?: string,
  ) => void;
  onClose: () => void;
  machineSettings?: ClientMachineSetting;
}) {
  const { activeStudio } = useActiveStudio();
  const prevLog = pastMachineLogs[0]?.log;
  const prevWeight = prevLog?.weight || "0";

  const initialWeight =
    parseFloat(currentWeight) > 0
      ? parseFloat(currentWeight)
      : parseFloat(prevWeight) || 0;

  // Deliberately NOT seeded from the previous session. Weight carries forward
  // because a starting load is a setting; a rep or second count is a measurement
  // and must come from this set. Last session's number appears only as a greyed
  // placeholder, and `canSave` below refuses to store an empty field.
  const initialReps = currentReps !== "" ? parseFloat(currentReps) : "";
  const initialRepsRight =
    currentRepsRight !== undefined && currentRepsRight !== ""
      ? parseFloat(currentRepsRight)
      : "";

  const [current, setCurrent] = useState<number>(initialWeight);
  const [reps, setReps] = useState<number | string>(initialReps);
  const [repsRt, setRepsRt] = useState<number | string>(initialRepsRight);
  const [quality, setQuality] = useState<number>(currentQuality || 0);
  const [isHold, setIsHold] = useState(isStaticHold || false);

  const roundUpTo2 = (val: number) => Math.ceil(val / 2) * 2;

  const adjustCurrent = (amount: number) =>
    setCurrent(Math.max(0, roundUpTo2(current + amount)));

  const getBaseReps = (currentVal: string | number, prevValStr: string) => {
    if (typeof currentVal === "number" && currentVal > 0) return currentVal;
    if (typeof currentVal === "string" && currentVal !== "")
      return parseFloat(currentVal);
    return parseFloat(prevValStr) || 0;
  };

  /**
   * A set is only saveable with a quality *and* an actual rep/second count.
   * Previously only quality was required, so a blank field saved an empty value
   * that rendered as "s" with no number and scored zero toward the client's
   * lifetime volume.
   */
  const countsEntered = isTorsoFull
    ? hasCount(reps) && hasCount(repsRt)
    : hasCount(reps);
  const canSave = Boolean(quality) && quality !== 0 && countsEntered;

  const saveLabel = !countsEntered
    ? isHold
      ? "Enter Seconds To Save"
      : "Enter Reps To Save"
    : !quality || quality === 0
      ? "Select Quality To Save"
      : "Save Set";

  const prevRepsLeftPlaceholder = isHold
    ? prevLog?.seconds || ""
    : prevLog?.reps || "";
  const prevRepsRightPlaceholder =
    (prevLog as any)?.repsRight || prevRepsLeftPlaceholder;

  /**
   * Reps and seconds are different units — 8 reps is not 8 seconds — so switching
   * mode re-seeds the field from that mode's own previous value rather than
   * carrying the old number across.
   */
  const switchMode = (hold: boolean) => {
    if (hold === isHold) return;
    setIsHold(hold);
    // Clear rather than carry the number across: the units are different, so a
    // rep count left sitting in the seconds field would be saved as a duration.
    setReps("");
    if (isTorsoFull) setRepsRt("");
  };

  const adjustReps = (amount: number) => {
    const base = getBaseReps(reps, prevRepsLeftPlaceholder);
    setReps(Math.max(0, base + amount));
  };

  const adjustRepsRt = (amount: number) => {
    const base = getBaseReps(repsRt, prevRepsRightPlaceholder);
    setRepsRt(Math.max(0, base + amount));
  };

  const prevW = parseFloat(prevWeight) || 0;
  const weightDelta = prevW > 0 ? current - prevW : 0;
  const weightDeltaPct =
    prevW > 0 ? ((weightDelta / prevW) * 100).toFixed(1) : "0.0";

  const settings = machineSettings?.settings || {};
  const hasSettings = Object.keys(settings).length > 0;

  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-100 rounded-[32px] p-0 overflow-hidden border-slate-200 dark:border-slate-800 bg-white dark:bg-bg-dark shadow-2xl dark:shadow-none flex flex-col h-full max-h-[85vh] sm:max-h-150">
        {/* Header */}
        <div className="bg-white dark:bg-bg-dark p-4 text-slate-900 dark:text-white relative overflow-hidden border-b border-slate-200 dark:border-slate-800 shrink-0">
          <div className="absolute top-0 right-0 p-8 opacity-5 rotate-12">
            <Zap className="w-24 h-24" />
          </div>
          <div className="flex items-center gap-3 relative z-10">
            <div className="w-10 h-10 bg-slate-700 rounded-xl flex items-center justify-center shrink-0">
              <Zap className="w-5 h-5 text-sky-500" />
            </div>
            <div className="min-w-0">
              <h2 className="text-xl font-black italic uppercase tracking-tight leading-none truncate">
                {machine.name}
              </h2>
              <div className="flex items-center gap-2 mt-1">
                {side && (
                  <span className="text-orange-500 text-[11px] font-black uppercase tracking-widest leading-none">
                    Rotation: {side}
                  </span>
                )}
                {side && <span className="w-1 h-1 bg-slate-600 rounded-full" />}
                <p className="text-[11px] uppercase font-bold text-sky-500 tracking-widest leading-none">
                  Entry HUD
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar">
          {/* Settings Shorthand Bar */}
          <div className="bg-slate-50/40 border border-slate-200 dark:border-slate-800 rounded-2xl px-4 py-2.5 flex items-center justify-center gap-x-5 gap-y-1.5 flex-wrap">
            {(() => {
              const stdSettings =
                activeStudio?.machineSettings?.[machine.id!] ||
                machine.standardSettings ||
                {};
              const options = machine.settingOptions || [];
              const sorted = orderMachineSettings(
                settings,
                stdSettings,
                options,
              );
              return sorted.map(([key, value, originalKey], i) => (
                <div
                  key={originalKey || i}
                  className="flex items-center gap-1.5"
                >
                  <span className="text-[11px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-tighter">
                    {key}:
                  </span>
                  <span className="text-[12px] font-black text-orange-500 italic">
                    {value}
                  </span>
                </div>
              ));
            })()}
          </div>

          {/* Smart Stepper: Weight */}
          <div className="bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-2xl p-3 flex flex-col items-center relative">
            <Label className="text-[11px] font-black uppercase text-slate-500 dark:text-slate-400 tracking-widest text-center block mb-2">
              Weight (lbs)
            </Label>
            <div className="flex items-center justify-between w-full h-14 px-1">
              <button
                className="w-11 h-11 rounded-xl bg-slate-200 dark:bg-slate-700/50 text-slate-700 dark:text-slate-300 font-black text-lg flex items-center justify-center active:scale-95 transition-transform border border-slate-300 dark:border-slate-700"
                onClick={() => adjustCurrent(-2)}
              >
                -2
              </button>

              <div className="flex flex-col items-center justify-center flex-1">
                <input
                  type="number"
                  inputMode="decimal"
                  value={current || ""}
                  onChange={(e) => setCurrent(parseFloat(e.target.value) || 0)}
                  className="font-black text-5xl text-slate-900 dark:text-white tracking-tighter leading-none bg-transparent border-none text-center w-full p-0 m-0 no-arrows focus:ring-0"
                />
                {prevW > 0 && (
                  <div
                    className={`mt-0.5 text-[11px] font-black uppercase px-1.5 py-0.5 rounded-md ${weightDelta > 0 ? "bg-emerald-500/20 text-emerald-400" : weightDelta < 0 ? "bg-rose-500/20 text-rose-400" : "bg-slate-700 text-slate-500 dark:text-slate-400"}`}
                  >
                    {weightDelta > 0 ? "+" : ""}
                    {weightDelta} lbs ({weightDelta > 0 ? "+" : ""}
                    {weightDeltaPct}%)
                  </div>
                )}
              </div>

              <button
                className="w-11 h-11 rounded-xl bg-orange-500 dark:bg-orange-600 text-white font-black text-lg flex items-center justify-center shadow-[0_4px_12px_rgba(240,108,34,0.3)] active:scale-95 transition-transform"
                onClick={() => adjustCurrent(2)}
              >
                +2
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4">
            {/* Smart Stepper: Reps / Seconds */}
            <div className="bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-2xl p-3 flex flex-col items-center relative">
              <div className="flex items-center justify-center gap-1.5 bg-white dark:bg-bg-dark border border-slate-200 dark:border-slate-800 rounded-xl p-1 mb-2.5 w-full max-w-45">
                <button
                  onClick={() => switchMode(false)}
                  className={`flex-1 h-6 rounded-lg font-black uppercase text-[11px] tracking-widest transition-all ${!isHold ? "bg-sky-500 text-slate-900 dark:text-white" : "text-slate-600 hover:text-slate-500 dark:text-slate-400"}`}
                >
                  REPS
                </button>
                <button
                  onClick={() => switchMode(true)}
                  className={`flex-1 h-6 rounded-lg font-black uppercase text-[11px] tracking-widest transition-all ${isHold ? "bg-sky-500 text-slate-900 dark:text-white" : "text-slate-600 hover:text-slate-500 dark:text-slate-400"}`}
                >
                  TSC
                </button>
              </div>

              {!isTorsoFull ? (
                <div className="flex items-center justify-between w-full h-12 px-1">
                  <button
                    className="w-10 h-10 rounded-xl bg-slate-200 dark:bg-slate-700/50 text-slate-700 dark:text-slate-300 font-black text-lg flex items-center justify-center active:scale-95 transition-transform border border-slate-300 dark:border-slate-700 shrink-0"
                    onClick={() => adjustReps(-1)}
                  >
                    -1
                  </button>

                  <div className="flex flex-col items-center justify-center flex-1 min-w-0">
                    <input
                      type="number"
                      inputMode="numeric"
                      value={reps || ""}
                      onChange={(e) =>
                        setReps(
                          e.target.value === ""
                            ? ""
                            : parseFloat(e.target.value) || 0,
                        )
                      }
                      placeholder={prevRepsLeftPlaceholder}
                      className="font-black text-4xl text-slate-900 dark:text-white tracking-tight leading-none bg-transparent border-none text-center w-full p-0 m-0 no-arrows focus:ring-0 placeholder:text-slate-600/50"
                    />
                  </div>

                  <button
                    className="w-10 h-10 rounded-xl bg-sky-500 text-slate-900 dark:text-white font-black text-lg flex items-center justify-center shadow-[0_4px_12px_rgba(56,189,248,0.3)] active:scale-95 transition-transform shrink-0"
                    onClick={() => adjustReps(1)}
                  >
                    +1
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-4 w-full px-1">
                  <div className="flex flex-col items-center flex-1 bg-slate-50 dark:bg-slate-950 p-2 rounded-xl border border-slate-200 dark:border-slate-800">
                    <span className="text-[11px] font-black uppercase tracking-widest text-orange-500 mb-1">
                      Left ({isHold ? "SEC" : "REPS"})
                    </span>
                    <div className="flex items-center justify-between w-full h-10">
                      <button
                        onClick={() => adjustReps(-1)}
                        className="w-8 h-8 rounded-lg bg-slate-700/50 text-slate-500 dark:text-slate-400 font-black text-sm flex items-center justify-center active:scale-95 border border-slate-300/30 shrink-0"
                      >
                        -
                      </button>
                      <input
                        type="number"
                        inputMode="numeric"
                        value={reps || ""}
                        onChange={(e) =>
                          setReps(
                            e.target.value === ""
                              ? ""
                              : parseFloat(e.target.value) || 0,
                          )
                        }
                        placeholder={prevRepsLeftPlaceholder}
                        className="font-black text-2xl text-slate-900 dark:text-white tracking-tight leading-none bg-transparent border-none text-center w-full p-0 m-0 no-arrows focus:ring-0 min-w-0 placeholder:text-slate-600/50"
                      />
                      <button
                        onClick={() => adjustReps(1)}
                        className="w-8 h-8 rounded-lg bg-sky-500 text-slate-900 dark:text-white font-black text-sm flex items-center justify-center shadow-lg active:scale-95 shrink-0"
                      >
                        +
                      </button>
                    </div>
                  </div>
                  <div className="flex flex-col items-center flex-1 bg-slate-50 dark:bg-slate-950 p-2 rounded-xl border border-slate-200 dark:border-slate-800">
                    <span className="text-[11px] font-black uppercase tracking-widest text-orange-500 mb-1">
                      Right ({isHold ? "SEC" : "REPS"})
                    </span>
                    <div className="flex items-center justify-between w-full h-10">
                      <button
                        onClick={() => adjustRepsRt(-1)}
                        className="w-8 h-8 rounded-lg bg-slate-700/50 text-slate-500 dark:text-slate-400 font-black text-sm flex items-center justify-center active:scale-95 border border-slate-300/30 shrink-0"
                      >
                        -
                      </button>
                      <input
                        type="number"
                        inputMode="numeric"
                        value={repsRt || ""}
                        onChange={(e) =>
                          setRepsRt(
                            e.target.value === ""
                              ? ""
                              : parseFloat(e.target.value) || 0,
                          )
                        }
                        placeholder={prevRepsRightPlaceholder}
                        className="font-black text-2xl text-slate-900 dark:text-white tracking-tight leading-none bg-transparent border-none text-center w-full p-0 m-0 no-arrows focus:ring-0 min-w-0 placeholder:text-slate-600/50"
                      />
                      <button
                        onClick={() => adjustRepsRt(1)}
                        className="w-8 h-8 rounded-lg bg-sky-500 text-slate-900 dark:text-white font-black text-sm flex items-center justify-center shadow-lg active:scale-95 shrink-0"
                      >
                        +
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Quality Rating */}
            <div
              className={`bg-slate-50 dark:bg-slate-950 border rounded-2xl p-3 flex flex-col items-center relative transition-colors ${!quality || quality === 0 ? "border-amber-500/50 dark:border-amber-500/40" : "border-slate-200 dark:border-slate-800"}`}
            >
              <Label className="text-[11px] font-black uppercase tracking-widest text-center block mb-2.5 items-center gap-1 text-slate-500 dark:text-slate-400">
                Set Quality / RPE{" "}
                {!quality && (
                  <span className="text-amber-500 font-bold text-xs">
                    * Required
                  </span>
                )}
              </Label>
              <div className="flex items-center gap-1.5 w-full h-9">
                <button
                  onClick={() => setQuality(1)}
                  className={`flex-1 h-full rounded-xl font-black uppercase text-[11px] tracking-widest transition-all ${quality === 1 ? "bg-rose-500 text-slate-900 dark:text-white shadow-[0_4px_10px_rgba(244,63,94,0.3)]" : "bg-white border border-slate-200 dark:border-slate-800 text-slate-600 hover:text-slate-500 dark:text-slate-400"}`}
                >
                  Poor
                </button>
                <button
                  onClick={() => setQuality(2)}
                  className={`flex-1 h-full rounded-xl font-black uppercase text-[11px] tracking-widest transition-all ${quality === 2 ? "bg-amber-500 text-slate-900 dark:text-white shadow-[0_4px_10px_rgba(245,158,11,0.3)]" : "bg-white border border-slate-200 dark:border-slate-800 text-slate-600 hover:text-slate-500 dark:text-slate-400"}`}
                >
                  Completed
                </button>
                <button
                  onClick={() => setQuality(3)}
                  className={`flex-1 h-full rounded-xl font-black uppercase text-[11px] tracking-widest transition-all ${quality === 3 ? "bg-emerald-500 text-slate-900 dark:text-white shadow-[0_4px_10px_rgba(16,185,129,0.3)]" : "bg-white border border-slate-200 dark:border-slate-800 text-slate-600 hover:text-slate-500 dark:text-slate-400"}`}
                >
                  Max Strength
                </button>
              </div>
            </div>
          </div>

          {/* Trend History */}
          {pastMachineLogs.length > 0 && (
            <div className="bg-slate-50/30 border border-slate-200 dark:border-slate-800/50 rounded-xl p-2.5 flex flex-col gap-1.5">
              <div className="flex justify-between items-center px-1">
                <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest">
                  Trend History
                </span>
                <span className="text-[11px] font-bold text-slate-600 dark:text-slate-400 uppercase tracking-widest">
                  Last 3 Sets
                </span>
              </div>
              {pastMachineLogs.map((entry, idx) => {
                const isHoldLog = entry.log.isStaticHold;
                let metrics = "";
                if (
                  entry.log.repsLeft !== undefined &&
                  entry.log.repsRight !== undefined
                ) {
                  metrics = `${entry.log.repsLeft}L|${entry.log.repsRight}R`;
                } else {
                  metrics = isHoldLog
                    ? `${entry.log.seconds}s`
                    : `${entry.log.reps}R`;
                }

                const olderEntry = pastMachineLogs[idx + 1];
                let arrow = null;
                if (olderEntry && olderEntry.log.weight) {
                  const currW = parseFloat(entry.log.weight || "0");
                  const oldW = parseFloat(olderEntry.log.weight || "0");
                  if (currW > oldW) {
                    arrow = (
                      <span className="text-emerald-500 font-bold ml-1 text-[11px]">
                        ↑
                      </span>
                    );
                  } else if (currW < oldW) {
                    arrow = (
                      <span className="text-rose-500 font-bold ml-1 text-[11px]">
                        ↓
                      </span>
                    );
                  }
                }

                return (
                  <div
                    key={idx}
                    className="flex justify-between items-center text-[11px] bg-slate-50 dark:bg-slate-950 rounded-lg px-2 py-1.5 border border-slate-200 dark:border-slate-800/30"
                  >
                    <span className="text-slate-500 dark:text-slate-400 font-bold uppercase text-[11px]">
                      {new Date(
                        parseSessionDate(entry.session.date),
                      ).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                      })}
                    </span>
                    <span className="font-black text-slate-700 dark:text-slate-300 flex items-center tabular-nums">
                      {entry.log.weight}
                      <span className="text-[11px] text-slate-500 dark:text-slate-400 ml-0.5">
                        lbs
                      </span>
                      <span className="mx-1.5 text-slate-700 dark:text-slate-300">
                        |
                      </span>
                      {metrics}
                      {arrow}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Fixed Footer */}
        <div className="p-4 bg-white dark:bg-bg-dark border-t border-slate-200 dark:border-slate-800 shrink-0 grid grid-cols-1 sm:grid-cols-2 gap-3 shadow-[0_-10px_20px_rgba(0,0,0,0.2)]">
          <Button
            variant="outline"
            className="h-12 rounded-xl font-black uppercase text-[11px] tracking-widest border border-slate-300 dark:border-slate-700 bg-slate-700/50 text-slate-600 dark:text-slate-400 hover:bg-slate-700 hover:text-slate-900 dark:hover:text-slate-50 transition-all shadow-md"
            onClick={onClose}
          >
            Cancel
          </Button>
          <Button
            className="h-12 rounded-xl font-black uppercase text-[11px] tracking-widest bg-orange-500 dark:bg-orange-600 text-white hover:bg-orange-600 dark:hover:bg-orange-700 shadow-[0_4px_15px_rgba(240,108,34,0.4)] border-none active:scale-95 transition-all disabled:opacity-40 disabled:pointer-events-none"
            disabled={!canSave}
            onClick={() => {
              if (!canSave) return;
              onSave(
                current.toString(),
                reps.toString(),
                quality,
                isHold,
                side,
                repsRt.toString(),
              );
            }}
          >
            {saveLabel}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ExerciseHistoryDialog({
  clientId,
  machine,
  onClose,
  user,
}: {
  clientId: string;
  machine: Machine;
  onClose: () => void;
  user: any;
}) {
  const [history, setHistory] = useState<ExerciseLog[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user || !machine.id || !clientId) return;
    const q = query(
      collection(db, "exerciseLogs"),
      where("clientId", "==", clientId),
      where("machineId", "==", machine.id),
      orderBy("createdAt", "desc"),
    );

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const logs = snapshot.docs.map(
          (doc) => ({ id: doc.id, ...doc.data() }) as ExerciseLog,
        );
        setHistory(logs);
        setLoading(false);
      },
      (error) => {
        handleFirestoreError(error, OperationType.GET, "exerciseLogs");
      },
    );

    return () => unsubscribe();
  }, [clientId, machine.id, user]);

  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-125 h-[80vh] flex flex-col rounded-3xl p-0 overflow-hidden">
        <DialogHeader className="p-6 pb-2">
          <DialogTitle className="text-2xl font-black uppercase italic tracking-tight flex items-center gap-2">
            <History className="w-6 h-6 text-primary" />
            {machine.name} History
          </DialogTitle>
          <DialogDescription className="font-bold text-xs">
            Performance tracking from origin to present.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-6 pb-6 pt-2">
          {loading ? (
            <div className="flex items-center justify-center h-40">
              <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
          ) : history.length === 0 ? (
            <div className="text-center py-20 opacity-50 space-y-2">
              <ClipboardList className="w-12 h-12 mx-auto" />
              <p className="font-bold uppercase text-xs">
                No historical data found
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {history.map((log, idx) => {
                const isOrigin = idx === history.length - 1;
                return (
                  <div
                    key={log.id}
                    className={`p-4 rounded-2xl border transition-all ${isOrigin ? "bg-primary/5 border-primary/20 ring-1 ring-primary/10" : "bg-white dark:bg-surface-1"}`}
                  >
                    <div className="flex justify-between items-start mb-2">
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] font-black text-muted-foreground uppercase">
                          {safeToDate(log.createdAt)?.toLocaleDateString() ||
                            "Recent"}
                        </span>
                        {isOrigin && (
                          <Badge className="bg-primary text-slate-900 dark:text-white text-[11px] font-black rounded px-1.5 h-4 border-none uppercase">
                            Origin
                          </Badge>
                        )}
                      </div>
                      <div className="flex gap-1">
                        {log.isStaticHold && (
                          <Badge
                            variant="outline"
                            className="text-[11px] border-primary text-primary h-4"
                          >
                            Static
                          </Badge>
                        )}
                        {log.notes && (
                          <MessageSquare className="w-3 h-3 text-primary/40" />
                        )}
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                      <div className="space-y-0.5">
                        <p className="text-[11px] font-black text-muted-foreground uppercase">
                          Weight
                        </p>
                        <p className="text-xl font-black">
                          {log.weight}{" "}
                          <span className="text-[11px] font-normal italic">
                            lbs
                          </span>
                        </p>
                      </div>
                      <div className="space-y-0.5">
                        <p className="text-[11px] font-black text-muted-foreground uppercase">
                          {log.isStaticHold ? "Seconds" : "Reps"}
                        </p>
                        <p
                          className={`text-xl font-black ${
                            log.repQuality === 3
                              ? "text-emerald-500"
                              : log.repQuality === 2
                                ? "text-amber-500"
                                : log.repQuality === 1
                                  ? "text-red-500"
                                  : ""
                          }`}
                        >
                          {log.isStaticHold
                            ? log.seconds || "0"
                            : log.reps || "0"}
                        </p>
                      </div>
                      <div className="space-y-0.5">
                        <p className="text-[11px] font-black text-muted-foreground uppercase">
                          Quality
                        </p>
                        <div
                          className={`w-fit px-2 py-0.5 rounded-full text-[11px] font-black text-slate-900 dark:text-white ${
                            log.repQuality === 3
                              ? "bg-emerald-500"
                              : log.repQuality === 2
                                ? "bg-amber-500"
                                : log.repQuality === 1
                                  ? "bg-red-500"
                                  : "bg-muted text-muted-foreground"
                          }`}
                        >
                          {log.repQuality === 3
                            ? "MAX STRENGTH"
                            : log.repQuality === 2
                              ? "COMPLETED"
                              : log.repQuality === 1
                                ? "POOR"
                                : "NONE"}
                        </div>
                      </div>
                    </div>

                    {log.notes && (
                      <div className="mt-3 text-[11px] bg-white dark:bg-bg-dark p-2 rounded-lg font-medium text-muted-foreground border-l-2 border-primary/30 italic">
                        "{log.notes}"
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** How long a locally-created session is protected from being cleared by a
 *  snapshot that has not caught up with the write yet. */
const JUST_STARTED_GRACE_MS = 15000;

/** Milliseconds from a Firestore Timestamp, Date, or ISO string; null if absent. */
function toMillisOrNull(value: any): number | null {
  if (!value) return null;
  if (typeof value.toMillis === "function") return value.toMillis();
  if (typeof value.toDate === "function") return value.toDate().getTime();
  const ms = new Date(value).getTime();
  return isNaN(ms) ? null : ms;
}

export function WorkoutTrackerView({
  clientId,
  clients,
  machines,
  trainers,
  user,
  setView,
  setSelectedClientId,
  showClientPicker,
  setShowClientPicker,
  onStartNewClientOnboarding,
  setClientFormData,
  onOpenInfo,
  authTrainer,
  trainerFocuses,
  isSyncing,
  setIsSyncing,
  schedules,
  isIntroSession,
  rightControls,
  trainerDropdown,
  onStudioClick,
}: {
  clientId: string | null;
  clients: Client[];
  machines: Machine[];
  schedules: any[];
  trainers: Trainer[];
  user: FirebaseUser;
  setView: (v: View, data?: { isIntroSession?: boolean }) => void;
  setSelectedClientId: (id: string | null) => void;
  showClientPicker: boolean;
  setShowClientPicker: (v: boolean) => void;
  onStartNewClientOnboarding: (v: string) => void;
  setClientFormData: (v: any) => void;
  onOpenInfo: (m: Machine) => void;
  authTrainer: Trainer | null;
  trainerFocuses: TrainerFocus[];
  isSyncing: boolean;
  setIsSyncing: (v: boolean) => void;
  isIntroSession?: boolean;
  rightControls?: React.ReactNode;
  trainerDropdown?: React.ReactNode;
  onStudioClick?: () => void;
}) {
  const { activeStudioId: contextActiveStudioId, activeStudio } =
    useActiveStudio();
  const { error: toastError } = useToast();
  const [sessions, setSessions] = useState<WorkoutSession[]>([]);
  const [logs, setLogs] = useState<Record<string, ExerciseLog>>({});
  const [routines, setRoutines] = useState<Routine[]>([]);
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [currentSession, setCurrentSession] = useState<WorkoutSession | null>(
    null,
  );
  const [activeMachineIds, setActiveMachineIds] = useState<string[]>([]);
  const [clientMachineSettings, setClientMachineSettings] = useState<
    Record<string, ClientMachineSetting>
  >({});
  const [focusRecords, setFocusRecords] = useState<FocusRecord[]>([]);
  const [sessionNotes, setSessionNotes] = useState<SessionNote[]>([]);
  const [currentSessionNotes, setCurrentSessionNotes] = useState<string>("");
  const lastMachineLoggedAt = React.useRef<number>(Date.now());
  const pauseStartTime = React.useRef<number | null>(null);
  const currentSegmentPauseDuration = React.useRef<number>(0);
  const [isEditingRoutine, setIsEditingRoutine] = useState(false);
  const [showRoutinePicker, setShowRoutinePicker] = useState(false);
  const [editingSettingsMachineId, setEditingSettingsMachineId] = useState<
    string | null
  >(null);
  const [editingWeightMachineId, setEditingWeightMachineId] = useState<
    string | null
  >(null);
  const [isStaticHoldOverride, setIsStaticHoldOverride] = useState(false);
  const [historyMachineId, setHistoryMachineId] = useState<string | null>(null);
  const [isSettingUpRoutine, setIsSettingUpRoutine] = useState(false);
  const [showAllMachines, setShowAllMachines] = useState(true);
  const [routineMachines, setRoutineMachines] = useState<string[]>([]);
  const [lastRoutineLogs, setLastRoutineLogs] = useState<
    Record<string, ExerciseLog>
  >({});
  const [isPreSessionMode, setIsPreSessionMode] = useState(false);
  const [isAdjustingProtocol, setIsAdjustingProtocol] = useState(false);
  const [adjustmentNote, setAdjustmentNote] = useState("");
  const [adjustmentScope, setAdjustmentScope] = useState<"once" | "permanent">(
    "once",
  );
  const [adjustedMachineIds, setAdjustedMachineIds] = useState<string[]>([]);
  const [preSessionSelectedRoutine, setPreSessionSelectedRoutine] =
    useState<RoutineType>("A");
  const [targetRoutine, setTargetRoutine] = useState<Routine | null>(null);
  const [isPaused, setIsPaused] = useState(false);

  /**
   * Pause/resume, recorded on the session document.
   *
   * Pausing stores the instant; resuming folds that span into totalPausedMs.
   * Keeping it here rather than in component state means a refresh mid-pause no
   * longer counts the break as training time.
   */
  const toggleSessionPause = async () => {
    const session = currentSession;
    if (!session?.id) {
      setIsPaused((p) => !p);
      return;
    }

    const pausedAtMs = toMillisOrNull(session.pausedAt);
    const alreadyPaused = pausedAtMs !== null;

    // Update locally first so the button responds immediately.
    setIsPaused(!alreadyPaused);

    const updates = alreadyPaused
      ? {
          pausedAt: null,
          totalPausedMs:
            (Number(session.totalPausedMs) || 0) +
            Math.max(0, Date.now() - pausedAtMs),
        }
      : { pausedAt: Timestamp.now() };

    setCurrentSession((prev) =>
      prev && prev.id === session.id
        ? ({ ...prev, ...updates } as WorkoutSession)
        : prev,
    );

    try {
      await updateDoc(doc(db, "sessions", session.id), updates);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, "sessions");
    }
  };

  /**
   * Set the instant a session is created locally. Firestore's snapshot can lag a
   * beat behind the write, and without this the very next snapshot would report
   * "no session in progress" and immediately clear the one just started.
   */
  const justStartedSessionRef = useRef<{
    id: string;
    clientId: string;
    at: number;
  } | null>(null);

  const [machineTimeElapsed, setMachineTimeElapsed] = useState<number>(0);

  useEffect(() => {
    const takeoverSessionId = localStorage.getItem(
      "max_strength_active_session_id",
    );
    if (takeoverSessionId && !currentSession) {
      const fetchTakeoverSession = async () => {
        try {
          const sRef = doc(db, "sessions", takeoverSessionId);
          const sSnap = await getDoc(sRef);
          if (sSnap.exists()) {
            const data = { id: sSnap.id, ...sSnap.data() } as WorkoutSession;
            if (data.status === "In-Progress") {
              setCurrentSession(data);
              setSessions([data]);
              setIsPreSessionMode(false);
              setShowRoutinePicker(false);
              // Clear it so we don't keep doing this if the trainer navigates away and back manually
              localStorage.removeItem("max_strength_active_session_id");
            }
          }
        } catch (error) {
          console.error("Error fetching takeover session:", error);
        }
      };
      fetchTakeoverSession();
    }
  }, []);

  useEffect(() => {
    if (!currentSession) return;
    let didUpdate = false;

    // Check all logs for the current session to see if any are "completed" but lack timeSpent
    activeMachineIds.forEach((mId) => {
      const isTorso = mId === "torso_rotation"; // Using specific id match based on earlier logic
      if (isTorso) {
        const logL = logs[`${currentSession.id}_${mId}_Left`];
        const logR = logs[`${currentSession.id}_${mId}_Right`];

        if (
          logL?.weight &&
          (logL?.reps || logL?.seconds) &&
          logL?.repQuality &&
          !logL?.timeSpent
        ) {
          const manualSeconds = logL?.seconds ? parseFloat(logL.seconds) : 0;
          const rawTimeDiff = Math.floor(
            (Date.now() - lastMachineLoggedAt.current) / 1000,
          );
          const computedTimeDiff = Math.max(
            0,
            Math.floor(
              (Date.now() -
                lastMachineLoggedAt.current -
                currentSegmentPauseDuration.current) /
                1000,
            ),
          );
          const timeDiff = manualSeconds > 0 ? manualSeconds : computedTimeDiff;
          const isStatic =
            logL.isStaticHold ||
            logL.isTSC ||
            (logL.seconds && (!logL.reps || parseInt(logL.reps) === 0));
          const reps = parseInt(logL.reps || "0");
          const avgTime =
            !isStatic && reps > 0
              ? parseFloat((timeDiff / reps).toFixed(1))
              : undefined;

          updateLogMultiple(
            currentSession.id,
            mId,
            {
              timeSpent: rawTimeDiff.toString(),
              totalTimeUnderLoad: timeDiff,
              machineDurationSeconds: timeDiff,
              ...(avgTime !== undefined && { averageTimePerRep: avgTime }),
            },
            "Left",
          );
          lastMachineLoggedAt.current = Date.now();
          currentSegmentPauseDuration.current = 0;
          didUpdate = true;
        }
        if (
          logR?.weight &&
          (logR?.reps || logR?.seconds) &&
          logR?.repQuality &&
          !logR?.timeSpent
        ) {
          const manualSeconds = logR?.seconds ? parseFloat(logR.seconds) : 0;
          const rawTimeDiff = Math.floor(
            (Date.now() - lastMachineLoggedAt.current) / 1000,
          );
          const computedTimeDiff = Math.max(
            0,
            Math.floor(
              (Date.now() -
                lastMachineLoggedAt.current -
                currentSegmentPauseDuration.current) /
                1000,
            ),
          );
          const timeDiff = manualSeconds > 0 ? manualSeconds : computedTimeDiff;
          const isStatic =
            logR.isStaticHold ||
            logR.isTSC ||
            (logR.seconds && (!logR.reps || parseInt(logR.reps) === 0));
          const reps = parseInt(logR.reps || "0");
          const avgTime =
            !isStatic && reps > 0
              ? parseFloat((timeDiff / reps).toFixed(1))
              : undefined;

          updateLogMultiple(
            currentSession.id,
            mId,
            {
              timeSpent: rawTimeDiff.toString(),
              totalTimeUnderLoad: timeDiff,
              machineDurationSeconds: timeDiff,
              ...(avgTime !== undefined && { averageTimePerRep: avgTime }),
            },
            "Right",
          );
          lastMachineLoggedAt.current = Date.now();
          currentSegmentPauseDuration.current = 0;
          didUpdate = true;
        }
      } else {
        const log = logs[`${currentSession.id}_${mId}`];
        if (
          log?.weight &&
          (log?.reps || log?.seconds) &&
          log?.repQuality &&
          !log?.timeSpent
        ) {
          const manualSeconds = log?.seconds ? parseFloat(log.seconds) : 0;
          const rawTimeDiff = Math.floor(
            (Date.now() - lastMachineLoggedAt.current) / 1000,
          );
          const computedTimeDiff = Math.max(
            0,
            Math.floor(
              (Date.now() -
                lastMachineLoggedAt.current -
                currentSegmentPauseDuration.current) /
                1000,
            ),
          );
          const timeDiff = manualSeconds > 0 ? manualSeconds : computedTimeDiff;
          const isStatic =
            log.isStaticHold ||
            log.isTSC ||
            (log.seconds && (!log.reps || parseInt(log.reps) === 0));
          const reps = parseInt(log.reps || "0");
          const avgTime =
            !isStatic && reps > 0
              ? parseFloat((timeDiff / reps).toFixed(1))
              : undefined;

          updateLogMultiple(currentSession.id, mId, {
            timeSpent: rawTimeDiff.toString(),
            totalTimeUnderLoad: timeDiff,
            machineDurationSeconds: timeDiff,
            ...(avgTime !== undefined && { averageTimePerRep: avgTime }),
          });
          lastMachineLoggedAt.current = Date.now();
          currentSegmentPauseDuration.current = 0;
          didUpdate = true;
        }
      }
    });

    if (didUpdate) {
      // Optional: Since it auto-advances focus, we could log that time tracked.
    }
  }, [logs, currentSession, activeMachineIds]);

  // Mirror the session's persisted pause state into local state, so per-machine
  // timing and the heartbeat also know the session is paused after a refresh.
  useEffect(() => {
    const paused = toMillisOrNull((currentSession as any)?.pausedAt) !== null;
    setIsPaused((prev) => (prev === paused ? prev : paused));
  }, [(currentSession as any)?.pausedAt, currentSession?.id]);

  useEffect(() => {
    if (!currentSession) return;
    if (isPaused) {
      if (!pauseStartTime.current) {
        pauseStartTime.current = Date.now();
      }
    } else {
      if (pauseStartTime.current) {
        currentSegmentPauseDuration.current +=
          Date.now() - pauseStartTime.current;
        pauseStartTime.current = null;
      }
    }
  }, [isPaused, currentSession]);

  useEffect(() => {
    if (!currentSession || isPaused) return;
    const interval = setInterval(() => {
      // Auto-abandon session if left open for > 60 minutes of active time to prevent infinite timers and resource consumption
      const start = currentSession.startTime?.toDate
        ? currentSession.startTime.toDate()
        : new Date(currentSession.startTime);
      const totalSessionMinutes =
        (Date.now() - start.getTime() - currentSegmentPauseDuration.current) /
        60000;
      if (totalSessionMinutes > 60) {
        if (currentSession.id) {
          deleteSession(currentSession.id);
        }
        return;
      }

      let extraPause = 0;
      if (isPaused && pauseStartTime.current) {
        extraPause = Date.now() - pauseStartTime.current;
      }
      setMachineTimeElapsed(
        Math.max(
          0,
          Math.floor(
            (Date.now() -
              lastMachineLoggedAt.current -
              currentSegmentPauseDuration.current -
              extraPause) /
              1000,
          ),
        ),
      );
    }, 1000);
    return () => clearInterval(interval);
  }, [currentSession, isPaused]);

  // Fetch all exercise logs for analysis (limited to last 1000 for performance)
  const [isShowingSessionNotes, setIsShowingSessionNotes] = useState(false);
  const [showAssignDialog, setShowAssignDialog] = useState(false);
  const [showEndConfirmation, setShowEndConfirmation] = useState(false);
  const [isPostSessionMode, setIsPostSessionMode] = useState(false);
  const [showCancelConfirmation, setShowCancelConfirmation] = useState(false);
  const [pendingAssignSession, setPendingAssignSession] =
    useState<WorkoutSession | null>(null);
  const [isSessionRoutineManagerOpen, setIsSessionRoutineManagerOpen] =
    useState(false);
  const handleSaveSessionMachineIds = (newIds: string[]) => {
    setActiveMachineIds(newIds);
  };

  const handleLogTSC = async (seconds: number) => {
    if (!currentSession || activeMachineIds.length === 0) return;

    let activeFocusMachineId: string | null = null;
    for (const mId of activeMachineIds) {
      const log = logs[`${currentSession.id}_${mId}`];
      if (
        !log ||
        !log.weight ||
        (!log.reps && !log.seconds) ||
        !log.repQuality
      ) {
        activeFocusMachineId = mId;
        break;
      }
    }

    if (activeFocusMachineId) {
      // Order matters. The dialog reads its starting value once, when it mounts,
      // so the seconds have to be in `logs` before it opens. Previously the
      // dialog was opened first and the writes followed behind four `await`s —
      // each of which yields to the microtask queue — so the dialog mounted on
      // the pre-write state and showed nothing.
      //
      // One combined write rather than four: updateLogMultiple also stamps a
      // session heartbeat, so the old version fired four Firestore writes per
      // logged hold.
      if (seconds > 0) {
        updateLogMultiple(currentSession.id, activeFocusMachineId, {
          seconds: seconds.toString(),
          reps: "0",
          isTSC: true,
          isStaticHold: true,
        });
      }
      setIsStaticHoldOverride(true);
      setEditingWeightMachineId(activeFocusMachineId);
    }
  };
  const [searchTerm, setSearchTerm] = useState("");
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState("");

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearchTerm(searchTerm);
    }, 300);
    return () => clearTimeout(handler);
  }, [searchTerm]);

  // Special listener for unassigned sessions when no client is selected
  useEffect(() => {
    if (!clientId && user) {
      const unassignedQuery = query(
        collection(db, "sessions"),
        where("isUnassigned", "==", true),
        where("status", "==", "In-Progress"),
        limit(1),
      );

      const unsubscribe = onSnapshot(
        unassignedQuery,
        (snapshot) => {
          if (!snapshot.empty) {
            const session = {
              id: snapshot.docs[0].id,
              ...snapshot.docs[0].data(),
            } as WorkoutSession;
            setCurrentSession(session);
            setSessions([session]);
          } else {
            setCurrentSession(null);
            setSessions([]);
          }
        },
        (error) => {
          handleFirestoreError(error, OperationType.GET, "sessions");
        },
      );

      return () => unsubscribe();
    }
  }, [clientId, user?.uid]);

  useEffect(() => {
    if (clientId && clients) {
      const client = clients.find((c) => c.id === clientId);
      setSelectedClient(client || null);
    }
  }, [clientId, clients]);

  useEffect(() => {
    if (clientId && user) {
      // Fetch Client Machine Settings
      const settingsQuery = query(
        collection(db, "clientMachineSettings"),
        where("clientId", "==", clientId),
      );
      const unsubscribeSettings = onSnapshot(
        settingsQuery,
        (snapshot) => {
          const settingsMap: Record<string, ClientMachineSetting> = {};
          snapshot.docs.forEach((doc) => {
            const data = { id: doc.id, ...doc.data() } as ClientMachineSetting;
            settingsMap[data.machineId] = data;
          });
          setClientMachineSettings(settingsMap);
        },
        (error) => {
          handleFirestoreError(
            error,
            OperationType.GET,
            "clientMachineSettings",
          );
        },
      );

      // Fetch Routines
      const routinesQuery = query(
        collection(db, "routines"),
        where("clientId", "==", clientId),
      );
      const unsubscribeRoutines = onSnapshot(
        routinesQuery,
        (snapshot) => {
          const routinesData = snapshot.docs.map(
            (doc) => ({ id: doc.id, ...doc.data() }) as Routine,
          );
          // Sort routines alphabetically so Routine A is default/first
          setRoutines(
            routinesData.sort((a, b) => a.name.localeCompare(b.name)),
          );
        },
        (error) => {
          handleFirestoreError(error, OperationType.GET, "routines");
        },
      );

      // Fetch Sessions
      const sessionsQuery = query(
        collection(db, "sessions"),
        where("clientId", "==", clientId),
      );

      const notesQuery = query(
        collection(db, "sessionNotes"),
        where("clientId", "==", clientId),
      );

      const focusQuery = query(
        collection(db, "focusRecords"),
        where("clientId", "==", clientId),
      );

      const unsubscribeSessions = onSnapshot(
        sessionsQuery,
        async (snapshot) => {
          const sessionsData = snapshot.docs
            .map((doc) => ({ id: doc.id, ...doc.data() }) as WorkoutSession)
            .sort((a, b) => {
              const timeA = a.createdAt?.toDate
                ? a.createdAt.toDate().getTime()
                : a.startTime
                  ? new Date(a.startTime).getTime()
                  : a.date
                    ? new Date(a.date).getTime()
                    : 0;
              const timeB = b.createdAt?.toDate
                ? b.createdAt.toDate().getTime()
                : b.startTime
                  ? new Date(b.startTime).getTime()
                  : b.date
                    ? new Date(b.date).getTime()
                    : 0;
              return timeB - timeA;
            });
          setSessions(sessionsData);

          // Auto-select In-Progress session if it exists
          const inProgress = sessionsData.find(
            (s) => s.status === "In-Progress",
          );
          if (inProgress) {
            setCurrentSession(inProgress);
            setShowRoutinePicker(false);
            setIsPreSessionMode(false);
          } else {
            // A session created a moment ago may not be in this snapshot yet, so
            // hold onto it briefly. Bounded on purpose: the previous version kept
            // *any* in-progress session forever, so one that had been completed or
            // deleted elsewhere stayed pinned and blocked starting a new one.
            const pending = justStartedSessionRef.current;
            const stillSettling =
              pending !== null &&
              pending.clientId === clientId &&
              Date.now() - pending.at < JUST_STARTED_GRACE_MS;

            if (!stillSettling) {
              justStartedSessionRef.current = null;
              // Set outside a state updater — updaters must stay pure, and React
              // invokes them twice under StrictMode.
              setCurrentSession(null);
              setIsPreSessionMode(true);
            }
          }
        },
        (error) => {
          handleFirestoreError(error, OperationType.GET, "sessions");
        },
      );

      const unsubscribeNotes = onSnapshot(
        notesQuery,
        (snapshot) => {
          const notesData = snapshot.docs.map(
            (doc) => ({ id: doc.id, ...doc.data() }) as SessionNote,
          );
          setSessionNotes(notesData);
        },
        (error) => {
          handleFirestoreError(error, OperationType.GET, "sessionNotes");
        },
      );

      const unsubscribeFocus = onSnapshot(
        focusQuery,
        (snapshot) => {
          const focusData = snapshot.docs.map(
            (doc) => ({ id: doc.id, ...doc.data() }) as FocusRecord,
          );
          setFocusRecords(focusData);
        },
        (error) => {
          handleFirestoreError(error, OperationType.GET, "focusRecords");
        },
      );

      return () => {
        unsubscribeSettings();
        unsubscribeRoutines();
        unsubscribeSessions();
        unsubscribeNotes();
        unsubscribeFocus();
      };
    }
  }, [clientId, user?.uid, clients]);

  useEffect(() => {
    const allSessionIds = new Set<string>();
    sessions.forEach((s) => {
      if (s.id) allSessionIds.add(s.id);
    });
    if (currentSession?.id) {
      allSessionIds.add(currentSession.id);
    }

    const sessionIds = Array.from(allSessionIds).filter(Boolean).slice(0, 30);
    if (sessionIds.length > 0) {
      const logsQuery = query(
        collection(db, "exerciseLogs"),
        where("sessionId", "in", sessionIds),
      );
      const unsubscribeLogs = onSnapshot(
        logsQuery,
        (snapshot) => {
          const logsMap: Record<string, ExerciseLog> = {};
          snapshot.docs.forEach((doc) => {
            const data = { id: doc.id, ...doc.data() } as ExerciseLog;
            const key = `${data.sessionId}_${data.machineId}${data.side ? "_" + data.side : ""}`;
            logsMap[key] = data;
          });
          setLogs(logsMap);
        },
        (error) => {
          handleFirestoreError(error, OperationType.GET, "exerciseLogs");
        },
      );
      return () => unsubscribeLogs();
    }
  }, [
    sessions
      .map((s) => s.id)
      .sort()
      .join(",") + `_${currentSession?.id || ""}`,
  ]);

  // Routine Alternation Logic & Historical Lifts Fetching
  useEffect(() => {
    if (clientId && !currentSession && isPreSessionMode) {
      const determineAndFetch = async () => {
        const completed = sessions.filter((s) => s.status === "Completed");
        const lastSess = completed[0];

        // Find Routine A and B specifically
        const routineA = routines.find((r) => r.name === "Routine A");
        const routineB = routines.find((r) => r.name === "Routine B");
        const isRoutineBActive = selectedClient?.isRoutineBActive || false;

        let target: Routine | null = null;

        // Sequence Selection Logic
        if (routines.length === 0) {
          // New Client: Default to Routine A Setup
          target = { name: "Routine A", machineIds: [], clientId } as Routine;
        } else if (routineA && routineB && isRoutineBActive) {
          // Strict Alternation Logic
          const lastRoutine = routines.find(
            (r) => r.id === lastSess?.routineId,
          );
          if (lastRoutine?.name === "Routine A") {
            target = routineB;
          } else {
            target = routineA;
          }
        } else {
          // Fallback to Routine A or whatever exists
          target = routineA || routines[0];
        }

        setTargetRoutine(target);
      };
      determineAndFetch();
    }
  }, [
    clientId,
    routines,
    currentSession,
    isPreSessionMode,
    sessions,
    selectedClient?.isRoutineBActive,
  ]);

  useEffect(() => {
    if (currentSession) {
      const routine = routines.find((r) => r.id === currentSession.routineId);
      if (routine) {
        setActiveMachineIds(routine.machineIds);
        setRoutineMachines(routine.machineIds);
      } else {
        setActiveMachineIds(machines.map((m) => m.id!));
        setRoutineMachines([]);
      }
    }
  }, [currentSession, routines, machines]);

  const updateRoutineNote = async (machineId: string, note: string) => {
    if (!currentSession?.routineId) return;
    const routine = routines.find((r) => r.id === currentSession.routineId);
    if (!routine) return;

    try {
      const notes = { ...(routine.machineNotes || {}), [machineId]: note };
      await updateDoc(doc(db, "routines", routine.id!), {
        machineNotes: notes,
      });
    } catch (error) {
      console.error("Error updating routine note:", error);
    }
  };

  const moveMachine = async (machineId: string, direction: "up" | "down") => {
    if (!currentSession?.routineId) return;
    const routine = routines.find((r) => r.id === currentSession.routineId);
    if (!routine) return;

    const ids = [...routine.machineIds];
    const idx = ids.indexOf(machineId);
    if (idx === -1) return;

    if (direction === "up" && idx > 0) {
      [ids[idx], ids[idx - 1]] = [ids[idx - 1], ids[idx]];
    } else if (direction === "down" && idx < ids.length - 1) {
      [ids[idx], ids[idx + 1]] = [ids[idx + 1], ids[idx]];
    }

    try {
      await updateDoc(doc(db, "routines", routine.id!), { machineIds: ids });
    } catch (error) {
      console.error("Error moving machine:", error);
    }
  };

  const startNewSession = async (
    routineType: "A" | "B" | "Free",
    sessionType: SessionType = "Standard",
    customMachines?: string[],
    adjustmentNote?: string,
    permanentSave?: boolean,
    preSessionCheckIn?: PreSessionCheckIn,
  ) => {
    if (!clientId) return;
    const nextNum = (selectedClient?.sessionCount || 0) + 1;

    // Auto-populate trainer and date
    const trainerInitials =
      authTrainer?.initials || trainers[0]?.initials || "??";
    const trainerName = authTrainer ? authTrainer.fullName : "";
    const trainerId = authTrainer?.id || "";
    const date = new Date().toISOString().split("T")[0];

    try {
      let routineId: string | undefined = undefined;

      if (routineType !== "Free") {
        const routineName = `Routine ${routineType}`;
        let routine = routines.find((r) => r.name === routineName);

        if (!routine) {
          // Create the routine if it doesn't exist
          const newRoutineRef = await addDoc(collection(db, "routines"), {
            clientId,
            name: routineName,
            machineIds: customMachines || [],
            createdAt: serverTimestamp(),
            studioId: selectedClient?.homeStudioId || "",
          });
          routineId = newRoutineRef.id;

          if (routineType === "B") {
            await updateDoc(doc(db, "clients", clientId), {
              isRoutineBActive: true,
            });
          }
        } else {
          routineId = routine.id;
          // If permanent save requested, update existing routine
          if (permanentSave && customMachines) {
            await updateDoc(doc(db, "routines", routine.id), {
              machineIds: customMachines,
            });
          }
        }
      }

      // 1. Create the session
      // STATISTICAL ROUTING & CROSS-TRAIN DETECTION
      // The session should log where it physically happened (the currently active studio)
      // but if the client belongs elsewhere, mark it as a cross-train event.
      const currentStudioId =
        contextActiveStudioId || authTrainer?.primaryHomeStudioId || null;

      // Explicit fetch/find of client's home studio to verify cross-train status
      const targetClient = clients.find((c) => c.id === clientId);
      const clientHomeStudioId = targetClient?.homeStudioId || null;

      // Cross-Train Logic: If client's home studio != current location, flag it.
      const isCrossTrain =
        clientHomeStudioId !== null &&
        currentStudioId !== null &&
        clientHomeStudioId !== currentStudioId;

      const cleanFirestorePayload = (obj: any): any => {
        if (obj === null || obj === undefined) return null;
        if (Array.isArray(obj)) return obj.map(cleanFirestorePayload);
        if (typeof obj !== "object") return obj;
        if (
          typeof obj.toDate === "function" ||
          obj.constructor?.name === "FieldValue" ||
          obj instanceof Date
        )
          return obj;

        const cleaned: Record<string, any> = {};
        Object.entries(obj).forEach(([k, v]) => {
          if (v !== undefined) {
            cleaned[k] = cleanFirestorePayload(v);
          }
        });
        return cleaned;
      };

      const sessionData: any = cleanFirestorePayload({
        clientId,
        mindbodyClientId:
          selectedClient?.mindbodyClientId ||
          selectedClient?.mindbodyId ||
          null,
        clientName: selectedClient
          ? `${selectedClient.firstName} ${selectedClient.lastName}`.trim()
          : "",
        homeStudioId: clientHomeStudioId || "",
        routineId: routineId || null,
        hostedAtStudioId: currentStudioId || "",
        clientHomeStudioId: clientHomeStudioId || "",
        sessionType: sessionType || "Standard",
        sessionNumber: nextNum,
        date,
        isCrossTrain: Boolean(isCrossTrain),
        trainerInitials: trainerInitials || "??",
        trainerName: trainerName || "",
        trainerId: trainerId || "",
        startedByTrainerId: trainerId || "",
        lastHeartbeatAt: serverTimestamp(),
        status: "In-Progress",
        // Timer bookkeeping lives on the document so elapsed time survives a
        // refresh, a navigation, or moving to another device.
        pausedAt: null,
        totalPausedMs: 0,
        // Client clock fallback: serverTimestamp() reads as null in the local
        // snapshot until the server confirms, which left the timer frozen at
        // 00:00 for that round trip.
        clientStartTime: new Date().toISOString(),
        startTime: serverTimestamp(),
        createdAt: serverTimestamp(),
        ...(preSessionCheckIn ? { preSessionCheckIn } : {}),
      });

      const docRef = await addDoc(collection(db, "sessions"), sessionData);

      // Protects this session from being cleared by a snapshot that predates it.
      justStartedSessionRef.current = {
        id: docRef.id,
        clientId,
        at: Date.now(),
      };

      const clientUpdateData: any = {};
      if (routineType === "B" && !selectedClient?.isRoutineBActive) {
        clientUpdateData.isRoutineBActive = true;
      }
      if (nextNum === 1 && !selectedClient?.firstSessionDate) {
        clientUpdateData.firstSessionDate = serverTimestamp();
      }
      if (Object.keys(clientUpdateData).length > 0) {
        await updateDoc(doc(db, "clients", clientId), clientUpdateData).catch(
          console.error,
        );
      }

      if (adjustmentNote && authTrainer) {
        await addDoc(collection(db, "sessionNotes"), {
          sessionId: docRef.id,
          clientId,
          trainerId: authTrainer.id || "",
          // Threw when a trainer record had neither initials nor a full name.
          // It only runs if a pre-session note was written, which is why the
          // crash looked intermittent.
          trainerInitials:
            authTrainer.initials ||
            (authTrainer.fullName || "").substring(0, 2).toUpperCase() ||
            "??",
          date: new Date().toLocaleDateString(),
          content: `[Protocol Adjustment]: ${adjustmentNote}`,
          createdAt: serverTimestamp(),
          studioId: selectedClient?.homeStudioId || "",
        });
      }

      // 2. Fetch last logs to pre-fill weights
      const machineLastLogs: Record<string, Partial<ExerciseLog>> = {};

      if (selectedClient && selectedClient.currentMachineMetrics) {
        Object.entries(selectedClient.currentMachineMetrics).forEach(
          ([mId, metricVal]) => {
            const metric = metricVal as any;
            // For simplicity, we just seed it directly mapping back to ExerciseLog properties
            machineLastLogs[mId] = {
              weight: metric.weight,
              reps: metric.reps,
              seconds: metric.seconds,
              isStaticHold: metric.isStaticHold,
              isTSC: metric.isTSC,
              machineId: mId,
              repQuality: 2, // default
            };
          },
        );
      }

      // Also fallback to clientMachineSettings if machine is not yet in currentMachineMetrics
      if (clientMachineSettings) {
        Object.entries(clientMachineSettings).forEach(
          ([mId, settingObjVal]) => {
            const settingObj = settingObjVal as any;
            if (!machineLastLogs[mId] && settingObj) {
              const w = settingObj.currentWeight ?? settingObj.startingWeight;
              if (w !== undefined && w !== null && String(w).trim() !== "") {
                machineLastLogs[mId] = {
                  weight: String(w),
                  machineId: mId,
                  repQuality: 2,
                };
              }
            }
          },
        );
      }

      // 3. Auto-populate logs for routine machines
      let activeMachineIds = customMachines;
      if (!activeMachineIds) {
        const routine = routineId
          ? routines.find((r) => r.id === routineId)
          : null;
        activeMachineIds = routine ? routine.machineIds : [];
      }

      if (activeMachineIds && activeMachineIds.length > 0) {
        const currentSettings = clientMachineSettings;

        const createLogPayload = (
          prevLog: Partial<ExerciseLog> | undefined,
          mId: string,
          side?: "Left" | "Right",
          defaultWeight?: number | null,
        ) => {
          const payload: any = {
            sessionId: docRef.id,
            clientId,
            homeStudioId: clientHomeStudioId || "",
            clientHomeStudioId: clientHomeStudioId || "",
            studioId: currentStudioId || clientHomeStudioId || "",
            machineId: mId,
            machineSettings:
              currentSettings[mId]?.settings || prevLog?.machineSettings || {},
            createdAt: serverTimestamp(),
          };
          if (side) payload.side = side;
          if (prevLog) {
            if (prevLog.weight) payload.weight = String(prevLog.weight);

            // Intentionally not auto-filling reps, seconds, or repQuality per user request

            if (prevLog.isStaticHold !== undefined)
              payload.isStaticHold = Boolean(prevLog.isStaticHold);
            if (prevLog.isTSC !== undefined)
              payload.isTSC = Boolean(prevLog.isTSC);
          } else if (defaultWeight) {
            payload.weight = String(defaultWeight);
          }
          return cleanFirestorePayload(payload);
        };

        for (const mId of activeMachineIds) {
          const mac = machines.find((m) => m.id === mId);
          // `mac?.name` guarded the machine but not the field: a machine
          // document without a name threw here, after the session had already
          // been created, leaving an In-Progress session with no logs.
          const isTorsoMac = (mac?.name || "")
            .toLowerCase()
            .includes("torso rotation");

          let defaultWeight: number | null = null;
          if (!machineLastLogs[mId] && selectedClient && mac && mac.name) {
            const gender =
              selectedClient.gender === "Female" ? "Female" : "Male";
            const { calculateStartingWeight } =
              await import("../lib/consultation-utils");
            const calculatedWeight = calculateStartingWeight(
              mac.name,
              gender,
              selectedClient.age || 45,
              "Novice",
            );
            defaultWeight = calculatedWeight > 0 ? calculatedWeight : null;
          }

          if (isTorsoMac) {
            const prefilledLeft =
              machineLastLogs[`${mId}_Left`] || machineLastLogs[mId];
            const prefilledRight =
              machineLastLogs[`${mId}_Right`] || machineLastLogs[mId];

            // Create Left set
            if (prefilledLeft || defaultWeight) {
              await addDoc(
                collection(db, "exerciseLogs"),
                createLogPayload(prefilledLeft, mId, "Left", defaultWeight),
              );
            }
            // Create Right set
            if (prefilledRight || defaultWeight) {
              await addDoc(
                collection(db, "exerciseLogs"),
                createLogPayload(prefilledRight, mId, "Right", defaultWeight),
              );
            }
          } else {
            const prefilledLog = machineLastLogs[mId];
            if (prefilledLog || defaultWeight) {
              await addDoc(
                collection(db, "exerciseLogs"),
                createLogPayload(prefilledLog, mId, undefined, defaultWeight),
              );
            }
          }
        }
      }

      const newSession = {
        id: docRef.id,
        clientId,
        routineId: routineId || null,
        sessionType,
        sessionNumber: nextNum,
        date,
        clientHomeStudioId: clientHomeStudioId || currentStudioId || "",
        hostedAtStudioId: currentStudioId || "",
        isCrossTrain,
        trainerInitials,
        trainerName,
        trainerId,
        status: "In-Progress",
        startTime: new Date(),
      };

      lastMachineLoggedAt.current = Date.now();
      setCurrentSession(newSession as WorkoutSession);
      setSessions((prev) => [
        newSession as WorkoutSession,
        ...prev.filter((s) => s.id !== newSession.id),
      ]);
      setShowRoutinePicker(false);
      setIsPreSessionMode(false);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, "sessions");
    }
  };

  const assignSessionToClient = async (targetClientId: string) => {
    const sessionToAssign = pendingAssignSession || currentSession;
    if (!sessionToAssign?.id) return;
    try {
      // 1. Update session
      await updateDoc(doc(db, "sessions", sessionToAssign.id), {
        clientId: targetClientId,
        isUnassigned: false,
        status: "Completed",
        endTime: serverTimestamp(),
      });

      // 2. Update all logs
      const logsQ = query(
        collection(db, "exerciseLogs"),
        where("sessionId", "==", sessionToAssign.id),
      );
      const snap = await getDocs(logsQ);
      for (const d of snap.docs) {
        await updateDoc(doc(db, "exerciseLogs", d.id), {
          clientId: targetClientId,
        });
      }

      // Update local state if it was the current session
      if (currentSession?.id === sessionToAssign.id) {
        setCurrentSession(null);
      }

      setSelectedClientId(targetClientId);
      setShowAssignDialog(false);
      setPendingAssignSession(null);
      setView("profile"); // Take them to profile to see the work
    } catch (error) {
      console.error("Error assigning session:", error);
    }
  };

  const deleteSession = async (sessionId: string) => {
    try {
      // Delete associated logs first
      const logsQ = query(
        collection(db, "exerciseLogs"),
        where("sessionId", "==", sessionId),
      );
      const logsSnap = await getDocs(logsQ);
      for (const logDoc of logsSnap.docs) {
        await deleteDoc(logDoc.ref);
      }
      // Delete associated notes
      const notesQ = query(
        collection(db, "sessionNotes"),
        where("sessionId", "==", sessionId),
      );
      const notesSnap = await getDocs(notesQ);
      for (const noteDoc of notesSnap.docs) {
        await deleteDoc(noteDoc.ref);
      }
      // Delete session
      await deleteDoc(doc(db, "sessions", sessionId));

      if (currentSession?.id === sessionId) {
        setCurrentSession(null);
        setLogs({});
        setSelectedClientId(null);
        setView("clients");
      }
      setShowEndConfirmation(false);
      setShowCancelConfirmation(false);
      setPendingAssignSession(null);
    } catch (error) {
      console.error("Error deleting session:", error);
    }
  };

  const handleEndSessionPress = () => {
    // Last line of defence. Logs are only written to Firestore at completion, so
    // this is the final chance to catch a set that was begun but never given a
    // count — it would be stored looking complete and score zero volume.
    const incomplete = findIncompleteLogs(logs);
    if (incomplete.length > 0) {
      const names = incomplete
        .map(
          (i) =>
            machines.find((m) => m.id === i.machineId)?.name || i.machineId,
        )
        .filter(Boolean);
      const unique = Array.from(new Set(names));
      toastError(
        `Add ${incomplete[0].reason === "missing-seconds" ? "a duration" : "reps"} for ${unique.join(", ")} before finishing. Sets without a count are recorded as zero.`,
      );
      setEditingWeightMachineId(incomplete[0].machineId);
      setIsStaticHoldOverride(incomplete[0].reason === "missing-seconds");
      return;
    }

    if (currentSession?.id && !currentSession.endTime) {
      const now = new Date();
      updateDoc(doc(db, "sessions", currentSession.id), {
        endTime: serverTimestamp(),
      }).catch(console.error);
      setCurrentSession((prev) => (prev ? { ...prev, endTime: now } : prev));
    }
    setIsPaused(true);
    setShowEndConfirmation(true);
  };

  const finalizeEndSession = async (postData?: {
    clientFeel: string;
    noteContent: string;
    notePriority: "High" | "Medium" | "Low";
  }) => {
    if (!currentSession?.id) return;

    setIsSyncing(true);
    try {
      const sessionLogs = Object.values(logs).filter(
        (l: any) => l.sessionId === currentSession.id,
      );

      await completeWorkoutSession(
        db,
        currentSession,
        selectedClient,
        sessionLogs,
        postData,
        currentSessionNotes,
        authTrainer,
        clientMachineSettings,
        user.uid,
      );

      setCurrentSession(null);
      setCurrentSessionNotes("");
      setShowEndConfirmation(false);
      setIsPostSessionMode(false);
      setSelectedClientId(null);
      setView("clients");
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, "sessions");
    } finally {
      setIsSyncing(false);
    }
  };

  const [selectedSessionType, setSelectedSessionType] =
    useState<SessionType>("Standard");
  const [editingWeightSide, setEditingWeightSide] = useState<
    "Left" | "Right" | undefined
  >(undefined);

  const updateLog = (
    sessionId: string,
    machineId: string,
    field: keyof ExerciseLog,
    value: any,
    side?: "Left" | "Right",
  ) => {
    updateLogMultiple(sessionId, machineId, { [field]: value }, side);
  };

  /**
   * Setting a quality is what marks a set as done, so it must not be possible
   * before a count exists. Tapping a quality dot on an empty row used to create
   * a log with a weight and a quality but no reps or seconds — which reads as
   * complete on screen and scores zero in the session rollup.
   */
  const setQualityWithGuard = (
    sessionId: string,
    machineId: string,
    quality: number,
    side?: "Left" | "Right",
  ) => {
    const key = `${sessionId}_${machineId}${side ? "_" + side : ""}`;
    const log = logs[key];

    if (!hasRequiredCount(log)) {
      const needsSeconds = Boolean(log?.isStaticHold || log?.isTSC);
      toastError(
        needsSeconds
          ? "Enter the hold duration before setting a quality."
          : "Enter reps before setting a quality.",
      );
      // Open the entry dialog so the count can be filled in straight away.
      setIsStaticHoldOverride(needsSeconds);
      setEditingWeightMachineId(machineId);
      return;
    }

    updateLog(sessionId, machineId, "repQuality", quality, side);
  };

  const updateLogMultiple = (
    sessionId: string,
    machineId: string,
    updates: Partial<ExerciseLog>,
    side?: "Left" | "Right",
  ) => {
    const key = `${sessionId}_${machineId}${side ? "_" + side : ""}`;
    const currentSettings = clientMachineSettings[machineId]?.settings || {};

    // Soft Lock Heartbeat: Update session activity timestamp
    if (currentSession?.id === sessionId) {
      updateDoc(doc(db, "sessions", sessionId), {
        lastHeartbeatAt: serverTimestamp(),
      }).catch(console.error);
    }

    setLogs((prev) => {
      const existing = prev[key];
      const updatedLog: ExerciseLog = existing
        ? { ...existing, ...updates, machineSettings: currentSettings }
        : ({
            id: `temp_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`, // Temporary ID for local state
            sessionId,
            clientId,
            machineId,
            ...(side ? { side } : {}),
            ...updates,
            machineSettings: currentSettings,
            createdAt: Timestamp.now(),
          } as any);

      return { ...prev, [key]: updatedLog };
    });
  };

  const saveMachineSettings = async (
    machineId: string,
    newSettings: Record<string, string>,
    reason: string,
  ) => {
    if (!clientId || !user) return;
    const current = clientMachineSettings[machineId];
    const trainerId = user.uid;

    try {
      // Use deterministic ID to prevent duplicates (same as importer)
      const deterministicId = `${clientId}_${machineId}`;
      const settingsRef = doc(db, "clientMachineSettings", deterministicId);

      await setDoc(
        settingsRef,
        {
          clientId,
          machineId,
          settings: newSettings,
          updatedBy: trainerId,
          updatedAt: serverTimestamp(),
        },
        { merge: true },
      );

      // Record Change Audit
      await addDoc(collection(db, "machineSettingChanges"), {
        machineId,
        clientId,
        trainerId,
        previousSettings: current?.settings || {},
        newSettings,
        reason,
        createdAt: serverTimestamp(),
        studioId: selectedClient?.homeStudioId || "",
      });

      // Save historic record in sidecar subcollection to keep documents optimized
      await addDoc(collection(db, "machines", machineId, "settingHistory"), {
        clientId,
        timestamp: new Date().toISOString(),
        trainerId,
        trainerName:
          authTrainer?.fullName || authTrainer?.initials || "Trainer",
        changeType: "SETTINGS",
        previousSettings: current?.settings || {},
        newSettings,
        reason: reason || "Settings Update",
      });

      setEditingSettingsMachineId(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, "clientMachineSettings");
    }
  };

  const toggleMachine = async (machineId: string) => {
    if (currentSession) return; // Disable during active session

    const newActiveIds = activeMachineIds.includes(machineId)
      ? activeMachineIds.filter((id) => id !== machineId)
      : [...activeMachineIds, machineId];

    setActiveMachineIds(newActiveIds);
  };

  const cancelActiveSession = async () => {
    if (!currentSession) {
      setSelectedClientId(null);
      setView("clients");
      return;
    }
    setShowCancelConfirmation(true);
  };

  const [isDeletingSession, setIsDeletingSession] = useState(false);

  const confirmScrapSession = async () => {
    setIsDeletingSession(true);
    try {
      if (currentSession?.id) {
        await deleteSession(currentSession.id);
      } else {
        setCurrentSession(null);
        setLogs({});
        setSelectedClientId(null);
        setView("clients");
        setShowCancelConfirmation(false);
      }
    } finally {
      setIsDeletingSession(false);
    }
  };

  const getSuggestedWeight = (machine: Machine, client: Client) => {
    // Basic safety baseline: 20% of body weight as safe start if no history exists
    if (client.weight) {
      const bw = parseFloat(client.weight);
      if (!isNaN(bw)) {
        return Math.round(bw * 0.2).toString();
      }
    }

    return "0";
  };

  if (!selectedClient && !currentSession) {
    return null; // The app routing will ensure this is never reached by redirecting to ClientDirectoryView instead
  }

  if (clientId && isPreSessionMode && selectedClient && !currentSession) {
    const completedSessionsCount = sessions.filter(
      (s) => s.status === "Completed",
    ).length;
    const totalSessionsCount = sessions.length;
    const hasRoutines = routines.length > 0;

    const shouldShowWizard =
      selectedClient.requiresConsultation === true &&
      selectedClient.consultationCompleted === false;

    if (shouldShowWizard) {
      return (
        <ConsultationSetupWizard
          clientName={selectedClient.firstName}
          onComplete={async (setupData) => {
            // setupData.routine is [{name: 'Leg Press', ...}]
            const machineNames = setupData.routine.map((r: any) => r.name);
            const customMachineIds = machineNames
              .map((name: string) => {
                const m = machines.find(
                  (mac) => mac.name === name || mac.fullName === name,
                );
                return m?.id;
              })
              .filter(Boolean) as string[];

            // Optional: update client with gender/age setup
            await updateDoc(doc(db, "clients", selectedClient.id!), {
              gender: setupData.gender || selectedClient.gender,
              consultationCompleted: true,
              requiresConsultation: false,
              updatedAt: serverTimestamp(),
            }).catch((e) => console.error(e));

            if (setupData.routine && setupData.routine.length > 0) {
              const machineNames = setupData.routine.map((r: any) => r.name);
              const customMachineIds = machines
                .filter((m) => machineNames.includes(m.name))
                .map((m) => m.id as string);
              startNewSession(
                "A",
                undefined,
                customMachineIds,
                "Consultation Baseline Protocol Generated",
              );
            } else {
              // If skipped, we don't start a session, just let the state refresh
              // which will cause the wizard to disappear because consultationCompleted is now true
              setIsPreSessionMode(true); // Land them on the BriefingScreen instead of hiding it
            }
          }}
          onCancel={() => {
            setIsPreSessionMode(false);
            setView("profile");
          }}
        />
      );
    }

    return (
      <BriefingScreen
        authTrainer={authTrainer}
        client={selectedClient}
        targetRoutine={targetRoutine}
        lastSession={
          sessions.filter((s) => s.status === "Completed")[0] || null
        }
        onStart={(routineType, customMachines, note, checkIn) =>
          startNewSession(
            routineType,
            undefined,
            customMachines,
            note,
            false,
            checkIn,
          )
        }
        onClose={() => {
          setIsPreSessionMode(false);
          setView("profile");
        }}
        machines={machines}
        routines={routines}
        trainerFocuses={trainerFocuses.filter((f) => f.clientId === clientId)}
        focusRecords={focusRecords}
        sessionNotes={sessionNotes}
        logs={
          Object.values(logs).filter(
            (l: any) => !l.clientId || l.clientId === clientId,
          ) as any
        }
        isIntroSession={isIntroSession}
        rightControls={rightControls}
        trainerDropdown={trainerDropdown}
        onStudioClick={onStudioClick}
      />
    );
  }

  if (isPostSessionMode && currentSession && selectedClient) {
    return (
      <VictoryHUDScreen
        client={selectedClient}
        session={currentSession}
        logs={
          Object.values(logs).filter(
            (l: any) => l.sessionId === currentSession.id,
          ) as any
        }
        allLogs={
          Object.values(logs).filter(
            (l: any) => l.clientId === selectedClient.id,
          ) as any
        }
        schedules={schedules}
        authTrainer={authTrainer}
        onFinalize={finalizeEndSession}
        isSyncing={isSyncing}
        machines={machines}
        rightControls={rightControls}
        trainerDropdown={trainerDropdown}
        onStudioClick={onStudioClick}
      />
    );
  }

  const clientNameDisplay = selectedClient
    ? `${selectedClient.firstName} ${selectedClient.lastName}`
    : "Open Session";
  const lastSession = sessions.length > 0 ? sessions[0] : null;
  const previousSession = sessions.length > 1 ? sessions[1] : null;

  // Suggested routine from targetRoutine state
  const getSuggestedType = (rt: Routine | null): "A" | "B" | "Free" =>
    routineLetterOf(rt) ?? (rt ? "Free" : "A");

  const suggestedRoutineType = (() => {
    if (routines.length === 0) return "A";
    if (routines.length === 1)
      return (
        matchesRoutineLetter(routines[0], "B") ? "B" : "A"
      ) as RoutineType;

    // If we have both, alternate based on last session
    if (!lastSession || !lastSession.routineId) return "A";

    const lastR = routines.find((r) => r.id === lastSession.routineId);
    if (!lastR) return "A";

    return matchesRoutineLetter(lastR, "A") ? "B" : "A";
  })();
  const isRoutineBActive = selectedClient?.isRoutineBActive || false;

  // Check for rest days (3 days recommended)
  const daysSinceLastSession = lastSession?.date
    ? Math.floor(
        (new Date().getTime() - parseSessionDate(lastSession.date)) /
          (1000 * 60 * 60 * 24),
      )
    : null;
  const needsRest = daysSinceLastSession !== null && daysSinceLastSession < 3;

  const hasActiveHeader = !!(selectedClient || currentSession);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className={cn(
        "h-[calc(100vh-80px)] flex flex-col gap-1 overflow-hidden relative",
        hasActiveHeader ? "pt-30 sm:pt-32 lg:pt-24" : "",
      )}
    >
      {isIntroSession && (
        <div className="bg-orange-500 dark:bg-orange-600 p-3 rounded-2xl flex items-center justify-center gap-3 shadow-lg shadow-orange-500/20 border border-white/20 animate-pulse mt-2 mx-4 relative z-40">
          <Sparkles className="w-5 h-5 text-slate-900 dark:text-white" />
          <span className="text-slate-900 dark:text-white font-black uppercase italic tracking-[0.15em] text-xs">
            NEW CLIENT INTRODUCTORY SESSION: CONVERSATIONAL BASELINE
          </span>
          <Sparkles className="w-5 h-5 text-slate-900 dark:text-white" />
        </div>
      )}
      {/* Persistent Active Header - Refactored as Sticky Fixed */}
      {(selectedClient || currentSession) && (
        <div className="fixed top-0 left-0 right-0 z-50 bg-white/95 dark:bg-bg-dark/95 backdrop-blur-md border-b border-slate-200 dark:border-slate-800 px-3 sm:px-4 lg:px-6 py-2 sm:py-2.5 lg:py-3 flex flex-col lg:flex-row lg:items-center justify-between min-h-25 lg:h-19 shadow-md transition-all gap-2 lg:gap-0">
          {/* Mobile & Tablet: Row 1 (Identity & Timer), Desktop: Left Column */}
          <div className="flex items-center justify-between lg:justify-start w-full lg:w-auto gap-2 sm:gap-3 shrink-0">
            <div className="flex items-center gap-2 sm:gap-2.5 min-w-0">
              {/* Left: Client & Trainer Identity */}
              <div className="flex flex-col min-w-0 max-w-32.5 sm:max-w-50 lg:max-w-55">
                <h3 className="text-xs sm:text-sm lg:text-base font-bold tracking-tight text-slate-900 dark:text-white truncate">
                  {selectedClient
                    ? `${selectedClient.firstName} ${selectedClient.lastName}`
                    : currentSession?.isUnassigned
                      ? "Unassigned Tracking"
                      : "Initializing..."}
                </h3>
                <div className="flex items-center gap-1 mt-0.5 text-[10px] sm:text-xs font-medium text-slate-500 dark:text-slate-400">
                  <div className="w-4 h-4 sm:w-4.5 sm:h-4.5 rounded-full bg-white dark:bg-bg-dark flex items-center justify-center border border-slate-200 dark:border-slate-700 shadow-sm shrink-0">
                    <span className="text-[9px] sm:text-[10px] font-bold">
                      {authTrainer?.initials ||
                        currentSession?.trainerInitials ||
                        "??"}
                    </span>
                  </div>
                  <span className="truncate">Trainer</span>
                </div>
              </div>

              {/* Notes Action Button */}
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsShowingSessionNotes(true)}
                className="border-slate-200 text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-surface-1 h-7 sm:h-8 px-2 sm:px-2.5 rounded-lg text-[10px] sm:text-[11px] flex items-center gap-1 transition-colors cursor-pointer shrink-0"
              >
                <MessageSquare className="w-2.5 h-2.5 sm:w-3 sm:h-3 text-cta shrink-0 fill-current" />
                Notes
              </Button>
            </div>

            {/* Mobile & Tablet Timer on right side of Row 1 */}
            <div className="flex lg:hidden items-center shrink-0">
              {currentSession && (
                <ActiveSessionTimer
                  startTime={currentSession.startTime}
                  fallbackStartTime={(currentSession as any).clientStartTime}
                  pausedAt={(currentSession as any).pausedAt}
                  totalPausedMs={(currentSession as any).totalPausedMs}
                  onTogglePause={toggleSessionPause}
                  isMobile
                />
              )}
            </div>
          </div>

          {/* Desktop Center Timer: Non-colliding flex child */}
          <div className="hidden lg:flex items-center justify-center shrink-0 mx-2">
            {currentSession && (
              <ActiveSessionTimer
                startTime={currentSession.startTime}
                fallbackStartTime={(currentSession as any).clientStartTime}
                pausedAt={(currentSession as any).pausedAt}
                totalPausedMs={(currentSession as any).totalPausedMs}
                onTogglePause={toggleSessionPause}
              />
            )}
          </div>

          {/* Action Buttons: Row 2 on mobile, Right side on desktop */}
          <div className="flex items-center justify-end gap-1 sm:gap-2 w-full lg:w-auto shrink-0">
            <Button
              variant="outline"
              className={cn(
                "border-slate-200 text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-surface-1 h-7 sm:h-8.5 lg:h-9 px-2 sm:px-3 text-[10px] sm:text-xs font-semibold transition-colors flex-1 lg:flex-initial",
                !showAllMachines
                  ? "bg-cta text-white hover:opacity-90 dark:text-white border-transparent"
                  : "",
              )}
              onClick={() => setShowAllMachines(!showAllMachines)}
            >
              <LayoutList className="w-3 h-3 sm:w-3.5 sm:h-3.5 mr-1" />
              <span>Focus</span>
            </Button>

            <Button
              variant="outline"
              className="border-slate-200 text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-surface-1 h-7 sm:h-8.5 lg:h-9 px-2 sm:px-3 text-[10px] sm:text-xs font-semibold transition-colors flex-1 lg:flex-initial"
              onClick={() => setIsSessionRoutineManagerOpen(true)}
            >
              <Settings2 className="w-3 h-3 sm:w-3.5 sm:h-3.5 mr-1" />
              <span>Routine</span>
            </Button>

            <Button
              variant="outline"
              className="border-red-500/30 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 h-7 sm:h-8.5 lg:h-9 px-2 sm:px-3 text-[10px] sm:text-xs font-bold uppercase tracking-wider transition-colors flex-1 lg:flex-initial"
              onClick={() => setShowCancelConfirmation(true)}
              title="Discard active session without saving"
            >
              <Trash2 className="w-3 h-3 sm:w-3.5 sm:h-3.5 mr-1" />
              <span>Discard</span>
            </Button>

            <Button
              className="bg-cta hover:opacity-90 text-white font-bold shadow-sm transition-all h-7 sm:h-8.5 lg:h-9 px-2.5 sm:px-4 lg:px-5 rounded-lg text-[10px] sm:text-xs flex-1 lg:flex-initial cursor-pointer whitespace-nowrap"
              onClick={handleEndSessionPress}
            >
              <span>Finish</span>
              <span className="hidden sm:inline">&nbsp;Session</span>
            </Button>
          </div>
        </div>
      )}
      {/* Machine Performance Entry Dialog */}
      {editingWeightMachineId &&
        currentSession &&
        (() => {
          const theMachine = machines.find(
            (m) => m.id === editingWeightMachineId,
          )!;
          const isTorso = theMachine.name
            .toLowerCase()
            .includes("torso rotation");

          let sideToUse = editingWeightSide;
          if (isTorso) sideToUse = undefined; // We handle both sides in the dialog

          const keyL = `${currentSession.id}_${editingWeightMachineId}_Left`;
          const keyR = `${currentSession.id}_${editingWeightMachineId}_Right`;
          const keyDef = `${currentSession.id}_${editingWeightMachineId}${sideToUse ? "_" + sideToUse : ""}`;

          const logL = isTorso ? logs[keyL] : logs[keyDef];
          const logR = isTorso ? logs[keyR] : undefined;

          let currentWeight =
            (isTorso ? logL?.weight || logR?.weight : logL?.weight) || "0";
          const clientId = currentSession.clientId || selectedClient?.id;
          if (currentWeight === "0" && clientId) {
            currentWeight = getLatestTargetWeight(
              clientId,
              editingWeightMachineId,
              sessions,
              Object.values(logs),
              sideToUse,
            );
          }

          const currentRepsLeft = logL
            ? logL?.isStaticHold
              ? logL.seconds || ""
              : logL?.reps || ""
            : "";
          const currentRepsRightStr = logR
            ? logR?.isStaticHold
              ? logR.seconds || ""
              : logR?.reps || ""
            : "";

          return (
            <PerformanceEntryDialog
              machine={theMachine}
              side={sideToUse}
              isTorsoFull={isTorso}
              machineSettings={clientMachineSettings[editingWeightMachineId]}
              currentWeight={currentWeight}
              currentReps={currentRepsLeft}
              currentRepsRight={isTorso ? currentRepsRightStr : undefined}
              currentQuality={logL?.repQuality || 0}
              pastMachineLogs={sessions
                .filter((s) =>
                  currentSession ? s.id !== currentSession.id : true,
                )
                .map((s) => {
                  const log =
                    logs[
                      `${s.id}_${editingWeightMachineId}${isTorso ? "_Left" : sideToUse ? "_" + sideToUse : ""}`
                    ] || logs[`${s.id}_${editingWeightMachineId}`];
                  return log && log.weight ? { log, session: s } : null;
                })
                .filter(
                  (x): x is { log: ExerciseLog; session: WorkoutSession } =>
                    Boolean(x),
                )
                .slice(0, 3)}
              isStaticHold={isStaticHoldOverride || logL?.isStaticHold}
              onClose={() => {
                setEditingWeightMachineId(null);
                setEditingWeightSide(undefined);
                setIsStaticHoldOverride(false);
              }}
              onSave={async (
                weight,
                repsOrSeconds,
                quality,
                isHold,
                side,
                repsRightStr,
              ) => {
                const timeDiff = Math.floor(
                  (Date.now() - lastMachineLoggedAt.current) / 1000,
                );

                if (isTorso) {
                  // Save Left Side
                  await updateLog(
                    currentSession.id!,
                    editingWeightMachineId,
                    "weight",
                    weight,
                    "Left",
                  );
                  await updateLog(
                    currentSession.id!,
                    editingWeightMachineId,
                    "repQuality",
                    quality,
                    "Left",
                  );
                  await updateLog(
                    currentSession.id!,
                    editingWeightMachineId,
                    "isStaticHold",
                    isHold,
                    "Left",
                  );
                  if (isHold) {
                    await updateLog(
                      currentSession.id!,
                      editingWeightMachineId,
                      "seconds",
                      repsOrSeconds,
                      "Left",
                    );
                    await updateLog(
                      currentSession.id!,
                      editingWeightMachineId,
                      "reps",
                      "0",
                      "Left",
                    );
                  } else {
                    await updateLog(
                      currentSession.id!,
                      editingWeightMachineId,
                      "reps",
                      repsOrSeconds,
                      "Left",
                    );
                    await updateLog(
                      currentSession.id!,
                      editingWeightMachineId,
                      "seconds",
                      "0",
                      "Left",
                    );
                  }

                  // Save Right Side (using the same weight and quality, but its own reps)
                  await updateLog(
                    currentSession.id!,
                    editingWeightMachineId,
                    "weight",
                    weight,
                    "Right",
                  );
                  await updateLog(
                    currentSession.id!,
                    editingWeightMachineId,
                    "repQuality",
                    quality,
                    "Right",
                  );
                  await updateLog(
                    currentSession.id!,
                    editingWeightMachineId,
                    "isStaticHold",
                    isHold,
                    "Right",
                  );
                  if (isHold) {
                    await updateLog(
                      currentSession.id!,
                      editingWeightMachineId,
                      "seconds",
                      repsRightStr || "0",
                      "Right",
                    );
                    await updateLog(
                      currentSession.id!,
                      editingWeightMachineId,
                      "reps",
                      "0",
                      "Right",
                    );
                  } else {
                    await updateLog(
                      currentSession.id!,
                      editingWeightMachineId,
                      "reps",
                      repsRightStr || "0",
                      "Right",
                    );
                    await updateLog(
                      currentSession.id!,
                      editingWeightMachineId,
                      "seconds",
                      "0",
                      "Right",
                    );
                  }
                } else {
                  await updateLog(
                    currentSession.id!,
                    editingWeightMachineId,
                    "weight",
                    weight,
                    side,
                  );
                  await updateLog(
                    currentSession.id!,
                    editingWeightMachineId,
                    "repQuality",
                    quality,
                    side,
                  );
                  await updateLog(
                    currentSession.id!,
                    editingWeightMachineId,
                    "isStaticHold",
                    isHold,
                    side,
                  );
                  if (isHold) {
                    await updateLog(
                      currentSession.id!,
                      editingWeightMachineId,
                      "seconds",
                      repsOrSeconds,
                      side,
                    );
                    await updateLog(
                      currentSession.id!,
                      editingWeightMachineId,
                      "reps",
                      "0",
                      side,
                    );
                  } else {
                    await updateLog(
                      currentSession.id!,
                      editingWeightMachineId,
                      "reps",
                      repsOrSeconds,
                      side,
                    );
                    await updateLog(
                      currentSession.id!,
                      editingWeightMachineId,
                      "seconds",
                      "0",
                      side,
                    );
                  }
                }

                setEditingWeightMachineId(null);
                setEditingWeightSide(undefined);
              }}
            />
          );
        })()}

      {/* Machine Settings Dialog */}
      {editingSettingsMachineId && (
        <MachineSettingsDialog
          machine={machines.find((m) => m.id === editingSettingsMachineId)!}
          client={selectedClient}
          currentSettings={clientMachineSettings[editingSettingsMachineId]}
          onClose={() => setEditingSettingsMachineId(null)}
          onSave={(settings, reason) =>
            saveMachineSettings(editingSettingsMachineId, settings, reason)
          }
        />
      )}

      {/* Exercise History Dialog */}
      {historyMachineId && clientId && (
        <ExerciseHistoryDialog
          clientId={clientId}
          machine={machines.find((m) => m.id === historyMachineId)!}
          onClose={() => setHistoryMachineId(null)}
          user={user}
        />
      )}

      {/* Machine Details Modal */}
      {showClientPicker && (
        <ClientSelectionDialog
          clients={clients}
          onSelect={(id) => {
            setSelectedClientId(id);
            setShowClientPicker(false);
            setView("workouts");
          }}
          onClose={() => setShowClientPicker(false)}
        />
      )}

      {/* Client Selection Dialog (for assigning) */}
      <ClientSelectionDialog
        open={showAssignDialog}
        clients={clients}
        onSelect={assignSessionToClient}
        onClose={() => {
          setShowAssignDialog(false);
          setCurrentSession(null);
        }}
        title="Assign Completed Session"
        description="Choose which client's profile should receive this session's data."
      />

      {/* End Session Confirmation Dialog */}
      <Dialog open={showEndConfirmation} onOpenChange={setShowEndConfirmation}>
        <DialogContent className="sm:max-w-100 rounded-[32px] p-0 overflow-hidden border-none shadow-2xl dark:shadow-none">
          <div className="bg-primary p-8 text-slate-900 dark:text-white space-y-3">
            <div className="w-12 h-12 bg-white/20 rounded-2xl flex items-center justify-center mb-2">
              <AlertCircle className="w-6 h-6 text-slate-900 dark:text-white" />
            </div>
            <h3 className="text-2xl font-black italic uppercase tracking-tight">
              End Session?
            </h3>
            <p className="text-primary-foreground/90 font-medium text-sm leading-relaxed">
              Are you sure you want to conclude this{" "}
              {currentSession?.sessionType.toLowerCase()} workout session?
            </p>
          </div>

          <div className="p-6 space-y-4">
            {currentSession?.isUnassigned ? (
              <div className="space-y-3">
                <p className="text-[11px] font-black uppercase tracking-widest text-muted-foreground px-1 mb-2">
                  Unassigned Session Actions
                </p>
                <Button
                  className="w-full h-14 rounded-2xl font-black italic uppercase tracking-widest text-sm shadow-lg shadow-primary/20"
                  onClick={() => {
                    setShowEndConfirmation(false);
                    setShowAssignDialog(true);
                  }}
                >
                  <Users className="w-4 h-4 mr-3" /> Assign to Client
                </Button>
                <Button
                  variant="outline"
                  className="w-full h-14 rounded-2xl font-black italic uppercase tracking-widest text-sm border-2"
                  onClick={() => {
                    setShowEndConfirmation(false);
                    setPendingAssignSession(currentSession);
                    onStartNewClientOnboarding("");
                    // We don't necessarily need to setView('clients') if the modal is global,
                    // but it helps if user cancels modal to be in a logical place.
                    setView("clients");
                  }}
                >
                  <PlusCircle className="w-4 h-4 mr-3" /> Create New Client
                </Button>
                <div className="py-2 flex items-center gap-4">
                  <div className="h-px bg-border flex-1" />
                  <span className="text-[11px] font-black text-muted-foreground uppercase tracking-widest">
                    Danger Zone
                  </span>
                  <div className="h-px bg-border flex-1" />
                </div>
                <Button
                  variant="ghost"
                  className="w-full h-14 rounded-2xl font-black italic uppercase tracking-widest text-sm text-red-600 hover:text-red-700 hover:bg-red-50"
                  onClick={() => deleteSession(currentSession!.id!)}
                >
                  <Trash2 className="w-4 h-4 mr-3" /> Delete Session
                </Button>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex flex-col gap-2">
                  <label className="text-xs font-black uppercase tracking-widest text-slate-500 dark:text-slate-400">
                    Session Notes
                  </label>
                  <Textarea
                    value={currentSessionNotes}
                    onChange={(e) => setCurrentSessionNotes(e.target.value)}
                    placeholder="Log general observations here..."
                    className="min-h-25 border-2 border-slate-200 dark:border-slate-800 bg-white dark:bg-bg-dark resize-none text-slate-800 dark:text-slate-200 placeholder:text-slate-500 focus-visible:ring-orange-500 focus-visible:border-orange-500"
                  />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <Button
                    variant="outline"
                    className="h-14 rounded-2xl font-black uppercase tracking-widest text-xs border-2 dark:border-slate-800 dark:hover:bg-surface-1"
                    onClick={() => setShowEndConfirmation(false)}
                  >
                    Keep Training
                  </Button>
                  <Button
                    className="h-14 rounded-2xl font-black uppercase tracking-widest text-xs shadow-lg shadow-primary/20 bg-red-600 text-white hover:bg-red-700"
                    onClick={() => {
                      if (currentSession) {
                        setCurrentSession({
                          ...currentSession,
                          endTime: new Date(),
                        });
                      }
                      setShowEndConfirmation(false);
                      setIsPostSessionMode(true);
                    }}
                    disabled={isSyncing}
                  >
                    Confirm End
                  </Button>
                </div>
                <div className="pt-4 flex justify-center border-t border-slate-100 dark:border-slate-800 mt-2">
                  <button
                    onClick={() => {
                      setShowEndConfirmation(false);
                      setShowCancelConfirmation(true);
                    }}
                    className="text-xs font-bold uppercase tracking-widest text-red-500 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 transition-colors py-3 px-6 rounded-xl hover:bg-red-50 dark:hover:bg-red-900/20"
                  >
                    Abort Session (No Record)
                  </button>
                </div>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Scrap Session Confirmation Dialog */}
      <Dialog
        open={showCancelConfirmation}
        onOpenChange={(v) => !isDeletingSession && setShowCancelConfirmation(v)}
      >
        <DialogContent className="sm:max-w-100 rounded-[32px] p-0 overflow-hidden border-none shadow-2xl dark:shadow-none">
          <div className="bg-white dark:bg-bg-dark p-8 text-slate-900 dark:text-white space-y-3">
            <div
              className={`w-12 h-12 rounded-2xl flex items-center justify-center mb-2 transition-all ${isDeletingSession ? "bg-red-500/20 text-red-500 animate-pulse" : "bg-red-500 text-white shadow-[0_0_20px_rgba(239,68,68,0.4)]"}`}
            >
              {isDeletingSession ? (
                <Loader2 className="w-6 h-6 animate-spin text-red-500" />
              ) : (
                <Trash2 className="w-6 h-6" />
              )}
            </div>
            <h3 className="text-2xl font-black italic uppercase tracking-tight">
              {isDeletingSession
                ? "Deleting Session..."
                : "Scrap Active Session?"}
            </h3>
            <p className="text-slate-500 dark:text-slate-400 font-medium text-sm leading-relaxed">
              {isDeletingSession
                ? "Scrapping all logged sets, timers, and notes. Cleaning database records..."
                : "Are you sure you want to cancel this session? All data logged so far will be scrapped and will not be recorded in the database."}
            </p>
          </div>

          <div className="p-6 grid grid-cols-1 sm:grid-cols-2 gap-3 bg-white dark:bg-bg-dark border-t border-slate-100 dark:border-slate-800">
            <Button
              variant="outline"
              disabled={isDeletingSession}
              className="h-14 rounded-2xl font-black uppercase tracking-widest text-xs border-2 border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-surface-2 disabled:opacity-50"
              onClick={() => setShowCancelConfirmation(false)}
            >
              Resume Session
            </Button>
            <Button
              disabled={isDeletingSession}
              className="h-14 rounded-2xl font-black uppercase tracking-widest text-xs bg-red-600 text-white shadow-lg shadow-red-200 dark:shadow-none hover:bg-red-700 disabled:opacity-80 flex items-center justify-center gap-2"
              onClick={confirmScrapSession}
            >
              {isDeletingSession ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Deleting...</span>
                </>
              ) : (
                "Scrap Session"
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      {/* Workout Table Scroll Area */}
      <div className="flex-1 overflow-hidden border border-slate-200 dark:border-slate-800 rounded-xl bg-white dark:bg-bg-dark shadow-sm flex flex-col">
        <div className="w-full h-full overflow-x-auto custom-scrollbar bg-slate-50 dark:bg-slate-950">
          <table className="w-full text-left border-collapse table-fixed select-none min-w-150 h-full flex flex-col bg-white dark:bg-bg-dark border border-slate-200 dark:border-slate-800 shadow-sm">
            <thead className="flex w-full shrink-0">
              <tr className="bg-slate-50 dark:bg-surface-1 border-b border-slate-200 dark:border-slate-700 uppercase text-xs font-semibold tracking-wider text-slate-500 dark:text-slate-400 leading-none h-9 w-full flex items-center">
                <th className="p-0 flex items-center justify-center w-10 shrink-0 border-r border-slate-200 dark:border-slate-700 h-full">
                  {currentSession ? (
                    <button
                      onClick={() => setIsSessionRoutineManagerOpen(true)}
                      className="w-full h-full flex items-center justify-center hover:bg-slate-100 dark:hover:bg-slate-700/50 transition-colors"
                      title="Edit Routine"
                    >
                      <Settings2 className="w-4 h-4 text-slate-500 dark:text-slate-400" />
                    </button>
                  ) : (
                    "#"
                  )}
                </th>
                <th className="p-1.5 pl-3 flex-1 border-r border-slate-200 dark:border-slate-700 h-full flex items-center truncate">
                  Exercise & Settings
                </th>
                <th className="p-1.5 text-center w-12.5 shrink-0 border-r border-slate-200 dark:border-slate-700 h-full flex items-center justify-center">
                  Prev
                </th>
                <th className="p-1.5 text-center w-15 shrink-0 border-r border-slate-200 dark:border-slate-700 h-full flex items-center justify-center">
                  Weight
                </th>
                <th className="p-1.5 text-center w-15 shrink-0 border-r border-slate-200 dark:border-slate-700 h-full flex items-center justify-center">
                  Reps
                </th>
                <th className="p-1.5 text-center w-15 shrink-0 h-full flex items-center justify-center">
                  Quality
                </th>
              </tr>
            </thead>

            <tbody className="flex-1 overflow-y-auto block w-full text-slate-900 dark:text-slate-50">
              {(() => {
                let activeFocusMachineId: string | null = null;
                if (currentSession) {
                  for (const mId of activeMachineIds) {
                    const mac = machines.find((m) => m.id === mId);
                    const isTorsoMac = mac?.name
                      .toLowerCase()
                      .includes("torso rotation");

                    if (isTorsoMac) {
                      const logL = logs[`${currentSession.id}_${mId}_Left`];
                      const logR = logs[`${currentSession.id}_${mId}_Right`];
                      const lComp =
                        logL &&
                        logL.weight &&
                        (logL.reps || logL.seconds) &&
                        logL.repQuality;
                      const rComp =
                        logR &&
                        logR.weight &&
                        (logR.reps || logR.seconds) &&
                        logR.repQuality;

                      if (!lComp || !rComp) {
                        activeFocusMachineId = mId;
                        break;
                      }
                    } else {
                      const log = logs[`${currentSession.id}_${mId}`];
                      if (
                        !log ||
                        !log.weight ||
                        (!log.reps && !log.seconds) ||
                        !log.repQuality
                      ) {
                        activeFocusMachineId = mId;
                        break;
                      }
                    }
                  }
                }

                return (
                  <>
                    {currentSession?.routineId &&
                      activeMachineIds.length === 0 && (
                        <tr className="flex">
                          <td colSpan={5} className="p-4 text-center w-full">
                            <p className="text-[11px] text-slate-500 dark:text-slate-400 font-bold uppercase">
                              Routine blank. Start selecting machines.
                            </p>
                          </td>
                        </tr>
                      )}
                    {machines
                      .sort((a, b) => {
                        if (!showAllMachines) {
                          const routine = routines.find(
                            (r) => r.id === currentSession?.routineId,
                          );
                          if (routine) {
                            const idxA = activeMachineIds.indexOf(a.id!);
                            const idxB = activeMachineIds.indexOf(b.id!);
                            if (idxA !== -1 && idxB !== -1) return idxA - idxB;
                            if (idxA !== -1) return -1;
                            if (idxB !== -1) return 1;
                          }
                        }
                        return a.order - b.order;
                      })
                      .map((machine) => {
                        const isTorso = machine.name
                          .toLowerCase()
                          .includes("torso rotation");

                        const logL = currentSession
                          ? logs[`${currentSession.id}_${machine.id}_Left`] ||
                            {}
                          : {};
                        const logR = currentSession
                          ? logs[`${currentSession.id}_${machine.id}_Right`] ||
                            {}
                          : {};
                        const logStd = currentSession
                          ? logs[`${currentSession.id}_${machine.id}`] || {}
                          : {};

                        // Decide which log to show as "primary" or show both
                        const currentLog = isTorso
                          ? logL.weight
                            ? logL
                            : logR
                          : logStd;

                        const isActive = activeMachineIds.includes(machine.id!);
                        const isCompleted = isTorso
                          ? logL.weight &&
                            (logL.reps || logL.seconds) &&
                            logL.repQuality &&
                            logR.weight &&
                            (logR.reps || logR.seconds) &&
                            logR.repQuality
                          : currentLog?.weight &&
                            (currentLog?.reps || currentLog?.seconds) &&
                            currentLog?.repQuality;

                        const seqPosition = isActive
                          ? activeMachineIds.indexOf(machine.id!) + 1
                          : null;
                        const pastMachineLogs = sessions
                          .filter((s) =>
                            currentSession ? s.id !== currentSession.id : true,
                          )
                          .map((s) => {
                            // For historical check, favor specific side if we are in side-mode, else look for any
                            const log = isTorso
                              ? logs[`${s.id}_${machine.id}_Left`] ||
                                logs[`${s.id}_${machine.id}_Right`] ||
                                logs[`${s.id}_${machine.id}`]
                              : logs[`${s.id}_${machine.id}`];
                            return log && log.weight
                              ? { log, session: s }
                              : null;
                          })
                          .filter(
                            (
                              x,
                            ): x is {
                              log: ExerciseLog;
                              session: WorkoutSession;
                            } => Boolean(x),
                          )
                          .slice(0, 3);
                        const prevLog = pastMachineLogs[0]?.log || null;
                        const isFocusMachine =
                          activeFocusMachineId === machine.id;

                        // Parse Settings
                        const settingsStr =
                          clientMachineSettings[machine.id!]?.settings || {};
                        const stdSettings =
                          activeStudio?.machineSettings?.[machine.id!] ||
                          machine.standardSettings ||
                          {};
                        const options = machine.settingOptions || [];
                        const sortedEntries = orderMachineSettings(
                          settingsStr,
                          stdSettings,
                          options,
                        );

                        const settingsDisplay = (
                          <div className="flex gap-1.5 items-center flex-wrap">
                            {sortedEntries.map(([k, v, originalKey], i) => (
                              <span
                                key={originalKey || i}
                                className="flex gap-0.5 items-baseline"
                              >
                                <span className="text-slate-500 dark:text-slate-400 text-[11px] uppercase font-medium">
                                  {k}:
                                </span>
                                <span className="font-medium text-slate-700 dark:text-slate-300 text-[11px] uppercase">
                                  {v}
                                </span>
                                {i < sortedEntries.length - 1 && (
                                  <span className="text-slate-300 dark:text-slate-600 ml-0.5 text-[11px]">
                                    •
                                  </span>
                                )}
                              </span>
                            ))}
                          </div>
                        );

                        return (
                          <tr
                            key={machine.id}
                            className={`flex w-full group transition-colors h-8.5 sm:h-9 items-center border-b border-slate-100 dark:border-slate-800/50 last:border-b-0 border-l-4 bg-white dark:bg-bg-dark hover:bg-slate-50 dark:hover:bg-surface-2
                              ${!isActive && !showAllMachines ? "opacity-30 grayscale hover:grayscale-0" : ""}
                              ${isFocusMachine ? "border-l-blue-500" : isCompleted && isActive ? "border-l-emerald-500" : "border-l-transparent"}`}
                          >
                            <td className="w-10 shrink-0 flex items-center justify-center p-0 border-r border-slate-200 dark:border-slate-800/60 h-full">
                              {isActive ? (
                                <div
                                  className={`flex items-center justify-center rounded-md px-1.5 h-5 shadow-sm ${isFocusMachine ? "bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 font-bold" : isCompleted ? "bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400" : "bg-slate-100 dark:bg-surface-1 text-slate-500 font-medium"}`}
                                >
                                  {isCompleted ? (
                                    <Check className="w-3 h-3" />
                                  ) : (
                                    <span className="font-bold text-[11px] leading-none">
                                      {seqPosition}
                                    </span>
                                  )}
                                </div>
                              ) : !currentSession ? (
                                <button
                                  className="flex items-center justify-center transition-all rounded-full w-4 h-4 border border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:text-blue-500 hover:border-blue-500"
                                  onClick={() => toggleMachine(machine.id!)}
                                >
                                  <Plus className="w-2.5 h-2.5" />
                                </button>
                              ) : (
                                <div className="w-1 h-1 rounded-full bg-slate-200 dark:bg-slate-700"></div>
                              )}
                            </td>

                            <td className="flex-1 p-1 pl-3 border-r border-slate-200 dark:border-slate-800/60 h-full flex flex-col justify-center min-w-0 truncate">
                              <div className="flex items-center">
                                <span
                                  className={`font-medium text-xs ${isFocusMachine ? "text-blue-600 dark:text-blue-400 font-bold" : "text-slate-900 dark:text-slate-50"} leading-none truncate`}
                                >
                                  {machine.name}
                                </span>
                              </div>
                              <div
                                onClick={() =>
                                  setEditingSettingsMachineId(machine.id!)
                                }
                                className="leading-none mt-1 cursor-pointer hover:opacity-80 pb-1"
                              >
                                {isTorso ? (
                                  settingsDisplay
                                ) : isCompleted ? (
                                  <span className="font-medium text-[11px] text-slate-500 dark:text-slate-400">
                                    {currentLog.weight} lbs |{" "}
                                    {currentLog.repsLeft !== undefined &&
                                    currentLog.repsRight !== undefined ? (
                                      `${currentLog.repsLeft}L | ${currentLog.repsRight}R`
                                    ) : currentLog.isStaticHold ? (
                                      <>{currentLog.seconds}s</>
                                    ) : (
                                      `${currentLog.reps} reps`
                                    )}{" "}
                                    | Q: {currentLog.repQuality}
                                  </span>
                                ) : (
                                  settingsDisplay
                                )}
                              </div>
                            </td>

                            <td className="w-12.5 shrink-0 flex flex-col items-center justify-center p-0 border-r border-slate-200 dark:border-slate-800/60 h-full">
                              {prevLog && prevLog.weight ? (
                                <div className="flex flex-col items-center leading-none">
                                  <span className="font-medium text-xs text-slate-500 dark:text-slate-400">
                                    {prevLog.weight}
                                  </span>
                                  <span className="font-medium text-[11px] text-slate-400 dark:text-slate-500 mt-px">
                                    {prevLog.repsLeft !== undefined &&
                                    prevLog.repsRight !== undefined ? (
                                      `${prevLog.repsLeft}L|${prevLog.repsRight}R`
                                    ) : prevLog.isStaticHold ? (
                                      <>
                                        {prevLog.seconds}
                                        <span className="text-[7px] ml-0.5 lowercase">
                                          s
                                        </span>
                                      </>
                                    ) : (
                                      `${prevLog.reps}R`
                                    )}
                                  </span>
                                  {prevLog.repQuality !== undefined &&
                                    prevLog.repQuality !== null && (
                                      <span
                                        className={
                                          `font-black text-[7px] mt-0.5 px-1 rounded-sm ` +
                                          (prevLog.repQuality === 1
                                            ? "bg-red-500/10 text-red-600"
                                            : prevLog.repQuality === 2
                                              ? "bg-amber-500/10 text-amber-600"
                                              : "bg-emerald-500/10 text-emerald-600")
                                        }
                                      >
                                        Q{prevLog.repQuality}
                                      </span>
                                    )}
                                </div>
                              ) : (
                                <span className="text-[11px] text-slate-600 dark:text-slate-400 font-medium">
                                  --
                                </span>
                              )}
                            </td>

                            <td
                              className={`w-15 shrink-0 cursor-pointer group/weight p-0 border-r border-slate-200 dark:border-slate-800/60 h-full flex items-center justify-center transition-colors ${isFocusMachine ? "bg-white dark:bg-surface-1 shadow-[inset_0px_2px_4px_rgba(0,0,0,0.04)] ring-1 ring-inset ring-slate-200/50 dark:ring-slate-700/50" : "bg-slate-50/50 dark:bg-surface-2 hover:bg-slate-100 dark:hover:bg-surface-1"}`}
                            >
                              {isTorso ? (
                                <div className="flex flex-col items-center justify-center gap-0.5 w-full h-full">
                                  <div
                                    className="flex-1 w-full flex items-center justify-center hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setEditingWeightMachineId(machine.id!);
                                      setEditingWeightSide("Left");
                                    }}
                                  >
                                    <span
                                      className={`font-black text-[11px] ${logL.weight ? "text-slate-900 dark:text-slate-50" : "text-slate-400 dark:text-slate-500"}`}
                                    >
                                      {logL.weight || "--"}
                                    </span>
                                  </div>
                                  <div className="w-4 h-px bg-slate-200 dark:bg-slate-700" />
                                  <div
                                    className="flex-1 w-full flex items-center justify-center hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setEditingWeightMachineId(machine.id!);
                                      setEditingWeightSide("Right");
                                    }}
                                  >
                                    <span
                                      className={`font-black text-[11px] ${logR.weight ? "text-slate-900 dark:text-slate-50" : "text-slate-400 dark:text-slate-500"}`}
                                    >
                                      {logR.weight || "--"}
                                    </span>
                                  </div>
                                </div>
                              ) : (
                                <div
                                  className="w-full h-full flex items-center justify-center"
                                  onClick={() =>
                                    setEditingWeightMachineId(machine.id!)
                                  }
                                >
                                  {currentLog.weight ? (
                                    <span className="font-bold text-[13px] text-slate-900 dark:text-slate-50">
                                      {currentLog.weight}
                                    </span>
                                  ) : (
                                    <span
                                      className={`font-black text-[11px] ${isFocusMachine ? "text-slate-400 dark:text-slate-500" : "text-slate-300 dark:text-slate-600 group-hover/weight:text-slate-500"}`}
                                    >
                                      --
                                    </span>
                                  )}
                                </div>
                              )}
                            </td>

                            <td
                              className={`w-15 shrink-0 cursor-pointer group/reps p-0 border-r border-slate-200 dark:border-slate-800/60 h-full flex items-center justify-center transition-colors relative ${isFocusMachine ? "bg-white dark:bg-surface-1 shadow-[inset_0px_2px_4px_rgba(0,0,0,0.04)] ring-1 ring-inset ring-slate-200/50 dark:ring-slate-700/50" : "bg-slate-50/50 dark:bg-surface-2 hover:bg-slate-100 dark:hover:bg-surface-1"}`}
                            >
                              {isTorso ? (
                                <div className="flex flex-col items-center justify-center gap-0.5 w-full h-full">
                                  <div
                                    className="flex-1 w-full flex items-center justify-center hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setEditingWeightMachineId(machine.id!);
                                      setEditingWeightSide("Left");
                                    }}
                                  >
                                    <span
                                      className={`font-black text-[11px] ${logL.reps || logL.seconds ? "text-slate-900 dark:text-slate-50" : "text-slate-400 dark:text-slate-500"}`}
                                    >
                                      {logL.isStaticHold ? (
                                        <>
                                          {logL.seconds}
                                          <span className="text-[7px] ml-0.5 lowercase opacity-70">
                                            s
                                          </span>
                                        </>
                                      ) : (
                                        logL.reps || "--"
                                      )}
                                    </span>
                                  </div>
                                  <div className="w-4 h-px bg-slate-200 dark:bg-slate-700" />
                                  <div
                                    className="flex-1 w-full flex items-center justify-center hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setEditingWeightMachineId(machine.id!);
                                      setEditingWeightSide("Right");
                                    }}
                                  >
                                    <span
                                      className={`font-black text-[11px] ${logR.reps || logR.seconds ? "text-slate-900 dark:text-slate-50" : "text-slate-400 dark:text-slate-500"}`}
                                    >
                                      {logR.isStaticHold ? (
                                        <>
                                          {logR.seconds}
                                          <span className="text-[7px] ml-0.5 lowercase opacity-70">
                                            s
                                          </span>
                                        </>
                                      ) : (
                                        logR.reps || "--"
                                      )}
                                    </span>
                                  </div>
                                </div>
                              ) : (
                                <div
                                  className="w-full h-full flex items-center justify-center"
                                  onClick={() =>
                                    setEditingWeightMachineId(machine.id!)
                                  }
                                >
                                  {currentLog.isStaticHold ||
                                  currentLog.reps ? (
                                    <span className="font-bold text-[13px] text-slate-900 dark:text-slate-50">
                                      {currentLog.repsLeft !== undefined &&
                                      currentLog.repsRight !== undefined ? (
                                        `${currentLog.repsLeft}L | ${currentLog.repsRight}R`
                                      ) : currentLog.isStaticHold ? (
                                        <>
                                          {currentLog.seconds}
                                          <span className="text-[11px] ml-0.5 lowercase opacity-70">
                                            s
                                          </span>
                                        </>
                                      ) : (
                                        currentLog.reps
                                      )}
                                    </span>
                                  ) : (
                                    <span
                                      className={`font-black text-[11px] ${isFocusMachine ? "text-slate-400 dark:text-slate-500" : "text-slate-300 dark:text-slate-600 group-hover/reps:text-slate-500"}`}
                                    >
                                      --
                                    </span>
                                  )}
                                </div>
                              )}
                            </td>

                            <td
                              className={`w-15 shrink-0 px-1 border-r border-slate-200 dark:border-slate-800/60 flex items-center justify-center h-full transition-colors ${isFocusMachine ? "bg-white dark:bg-surface-1 shadow-[inset_0_2px_4px_rgba(0,0,0,0.02)]" : "group-hover:bg-slate-50 dark:group-hover:bg-surface-1"}`}
                            >
                              {isTorso ? (
                                <div className="flex flex-col gap-1 items-center">
                                  <div
                                    className={`flex rounded-full p-px gap-px ${isFocusMachine ? "bg-slate-100/80 border border-slate-200 dark:border-slate-700" : "bg-slate-100 dark:bg-surface-1"}`}
                                  >
                                    {[1, 2, 3].map((v) => {
                                      const isSelected = logL.repQuality === v;
                                      let bgClass = isFocusMachine
                                        ? "bg-slate-300 dark:bg-slate-600 hover:bg-slate-400 dark:hover:bg-slate-500"
                                        : "bg-slate-300/50 hover:bg-slate-400";
                                      if (isSelected) {
                                        if (v === 1)
                                          bgClass = "bg-red-500 shadow-sm";
                                        else if (v === 2)
                                          bgClass = "bg-amber-500 shadow-sm";
                                        else if (v === 3)
                                          bgClass = "bg-emerald-500 shadow-sm";
                                      }
                                      return (
                                        <button
                                          key={v}
                                          onClick={() =>
                                            currentSession?.id &&
                                            setQualityWithGuard(
                                              currentSession.id,
                                              machine.id!,
                                              v,
                                              "Left",
                                            )
                                          }
                                          className={`w-2.5 h-2.5 rounded-full transition-all ${bgClass}`}
                                        />
                                      );
                                    })}
                                  </div>
                                  <div
                                    className={`flex rounded-full p-px gap-px ${isFocusMachine ? "bg-slate-100/80 border border-slate-200 dark:border-slate-700" : "bg-slate-100 dark:bg-surface-1"}`}
                                  >
                                    {[1, 2, 3].map((v) => {
                                      const isSelected = logR.repQuality === v;
                                      let bgClass = isFocusMachine
                                        ? "bg-slate-300 dark:bg-slate-600 hover:bg-slate-400 dark:hover:bg-slate-500"
                                        : "bg-slate-300/50 hover:bg-slate-400";
                                      if (isSelected) {
                                        if (v === 1)
                                          bgClass = "bg-red-500 shadow-sm";
                                        else if (v === 2)
                                          bgClass = "bg-amber-500 shadow-sm";
                                        else if (v === 3)
                                          bgClass = "bg-emerald-500 shadow-sm";
                                      }
                                      return (
                                        <button
                                          key={v}
                                          onClick={() =>
                                            currentSession?.id &&
                                            setQualityWithGuard(
                                              currentSession.id,
                                              machine.id!,
                                              v,
                                              "Right",
                                            )
                                          }
                                          className={`w-2.5 h-2.5 rounded-full transition-all ${bgClass}`}
                                        />
                                      );
                                    })}
                                  </div>
                                </div>
                              ) : (
                                <div
                                  className={`flex rounded-full p-0.5 gap-0.5 ${isFocusMachine ? "bg-slate-100/80 border border-slate-200 dark:border-slate-700" : "bg-slate-100 dark:bg-surface-1"}`}
                                >
                                  {[1, 2, 3].map((v) => {
                                    const isSelected =
                                      currentLog.repQuality === v;
                                    let bgClass = isFocusMachine
                                      ? "bg-slate-300 dark:bg-slate-600 hover:bg-slate-400 dark:hover:bg-slate-500"
                                      : "bg-slate-300/50 hover:bg-slate-400";
                                    if (isSelected) {
                                      if (v === 1)
                                        bgClass = "bg-red-500 shadow-sm";
                                      else if (v === 2)
                                        bgClass = "bg-amber-500 shadow-sm";
                                      else if (v === 3)
                                        bgClass = "bg-emerald-500 shadow-sm";
                                    }
                                    return (
                                      <button
                                        key={v}
                                        onClick={() => {
                                          if (currentSession?.id) {
                                            setQualityWithGuard(
                                              currentSession.id,
                                              machine.id!,
                                              v,
                                            );
                                          }
                                        }}
                                        className={`w-3.5 h-3.5 rounded-full transition-all ${bgClass}`}
                                      />
                                    );
                                  })}
                                </div>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    {/* Spacer row to allow scrolling past the floating Stopwatch */}
                    {currentSession && (
                      <tr className="h-20 w-full shrink-0 flex items-center bg-transparent pointer-events-none" />
                    )}
                  </>
                );
              })()}
            </tbody>
          </table>
        </div>
      </div>

      <AnimatePresence>
        {isShowingSessionNotes && currentSession && (
          <SessionNotesSidebar
            session={currentSession}
            userTrainers={trainers}
            onClose={() => setIsShowingSessionNotes(false)}
            user={user}
          />
        )}
      </AnimatePresence>

      {currentSession && (
        <SessionRoutineManagerModal
          isOpen={isSessionRoutineManagerOpen}
          onOpenChange={setIsSessionRoutineManagerOpen}
          currentMachineIds={activeMachineIds}
          machines={machines}
          onSave={handleSaveSessionMachineIds}
        />
      )}

      {currentSession &&
        !isSessionRoutineManagerOpen &&
        !editingWeightMachineId &&
        !editingSettingsMachineId &&
        !isShowingSessionNotes && (
          <div className="fixed bottom-16 sm:bottom-20 left-0 right-0 z-110">
            <Stopwatch onLogTSC={handleLogTSC} />
          </div>
        )}

      {currentSession && activeMachineIds.length > 0 && (
        <div className="fixed bottom-0 left-2 p-1 pointer-events-none opacity-20 z-110">
          <span className="text-[11px] text-slate-800 dark:text-slate-200 font-mono tracking-widest">
            {machineTimeElapsed}s
          </span>
        </div>
      )}
    </motion.div>
  );
}
