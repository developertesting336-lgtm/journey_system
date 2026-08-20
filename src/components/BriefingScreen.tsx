import React, { useState, useEffect } from "react";
import {
  Moon,
  Bell,
  Settings,
  X,
  Plus,
  Activity,
  GripVertical,
  Info,
  Lightbulb,
  Target,
} from "lucide-react";
import { MaxStrengthLogo } from "./MaxStrengthLogo";
import { Button } from "@/components/ui/button";
import { ConditionChip } from "./ConditionChip";
import { RoutineCompareCard } from "./RoutineCompareCard";
import { SequenceRow } from "./SequenceRow";
import { cn } from "@/lib/utils";
import { findRoutineByLetter, matchesRoutineLetter } from "../lib/routine-utils";
import { AppHeader } from "./AppHeader";
import { StickyCTA } from "./StickyCTA";
import {
  Machine,
  Routine,
  SessionNote,
  Trainer,
  Client,
  WorkoutSession,
  TrainerFocus,
  FocusRecord,
  ExerciseLog,
  PreSessionCheckIn,
  SleepQuality,
  BodyStateTag,
} from "../types";
import { BodyStateTracker } from "./BodyStateTracker";
import { CLINICAL_FLAGS_MATRIX } from "../data/clinical-matrix";
import { safeToDate } from "../lib/utils";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

function SortableSequenceItem({
  id,
  children,
  showAddMachine,
  onRemove,
}: {
  key?: React.Key;
  id: string;
  children: React.ReactNode;
  showAddMachine: boolean;
  onRemove: () => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 50 : "auto",
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "flex items-center gap-2 group transition-all rounded-xl",
        isDragging &&
          "opacity-95 scale-[1.02] shadow-2xl drop-shadow-2xl brightness-110 relative bg-bg-dark z-50 ring-2 ring-cyan/30",
      )}
    >
      {showAddMachine && (
        <div
          {...attributes}
          {...listeners}
          className="flex items-center justify-center min-h-11 min-w-11 cursor-grab active:cursor-grabbing bg-white/5 hover:bg-white/10 text-ink-d2 hover:text-white rounded-xl transition-colors border border-transparent hover:border-div-d touch-none shrink-0"
        >
          <GripVertical className="w-5 h-5 pointer-events-none" />
        </div>
      )}
      <div className="flex-1 min-w-0 pointer-events-none">{children}</div>
      {showAddMachine && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          className="flex items-center justify-center min-h-11 min-w-11 text-red-500 hover:text-red-400 bg-red-500/10 hover:bg-red-500/20 rounded-xl transition-colors shrink-0"
        >
          <X className="w-5 h-5 pointer-events-none" />
        </button>
      )}
    </div>
  );
}

export interface BriefingScreenProps {
  authTrainer: Trainer | null;
  client: Client;
  targetRoutine: Routine | null;
  lastSession: WorkoutSession | null;
  onStart: (
    routineType: "A" | "B" | "Free",
    customMachines?: string[],
    note?: string,
    checkIn?: PreSessionCheckIn,
  ) => void;
  onClose: () => void;
  machines: Machine[];
  routines: Routine[];
  trainerFocuses: TrainerFocus[];
  focusRecords?: FocusRecord[];
  sessionNotes: SessionNote[];
  logs?: ExerciseLog[];
  isIntroSession?: boolean;
  rightControls?: React.ReactNode;
  trainerDropdown?: React.ReactNode;
  onStudioClick?: () => void;
}

export function BriefingScreen({
  authTrainer,
  client,
  targetRoutine,
  lastSession,
  onStart,
  onClose,
  machines,
  routines,
  trainerFocuses,
  focusRecords = [],
  sessionNotes,
  logs = [],
  isIntroSession = false,
  rightControls,
  trainerDropdown,
  onStudioClick,
}: BriefingScreenProps) {
  const [selectedRoutineType, setSelectedRoutineType] = useState<
    "A" | "B" | "Free" | "Create_A" | "Create_B"
  >("A");
  const [adjustedMachineIds, setAdjustedMachineIds] = useState<string[]>([]);
  const [adjustmentNote, setAdjustmentNote] = useState("");
  const [isAdjusting, setIsAdjusting] = useState(false);
  const [showAddMachine, setShowAddMachine] = useState(false);
  const [sleepQuality, setSleepQuality] = useState<SleepQuality | undefined>(
    undefined,
  );
  const [stressLevel, setStressLevel] = useState<1 | 2 | 3 | 4 | 5 | undefined>(
    undefined,
  );
  const [bodyStates, setBodyStates] = useState<BodyStateTag[]>([]);

  const routineA = findRoutineByLetter(routines, "A");
  const routineB = findRoutineByLetter(routines, "B");

  /** Set once the trainer picks a routine by hand, so a background refetch of
   *  `routines` cannot silently reset their choice back to the suggestion. */
  const [routinePickedByTrainer, setRoutinePickedByTrainer] = useState(false);

  /** Which routine the alternation logic proposed, shown as a hint on the toggle. */
  const suggestedType: "A" | "B" = matchesRoutineLetter(targetRoutine, "B")
    ? "B"
    : "A";

  const handlePickRoutine = (type: "A" | "B") => {
    setRoutinePickedByTrainer(true);
    setIsAdjusting(false);
    if (type === "A") {
      setSelectedRoutineType(routineA ? "A" : "Create_A");
      setAdjustedMachineIds(routineA?.machineIds || []);
    } else {
      setSelectedRoutineType(routineB ? "B" : "Create_B");
      setAdjustedMachineIds(routineB?.machineIds || []);
    }
  };

  useEffect(() => {
    if (isIntroSession) {
      const demoRoutine = routines.find((r) => r.name === "Demo Routine");
      if (
        demoRoutine &&
        demoRoutine.machineIds &&
        demoRoutine.machineIds.length > 0
      ) {
        setSelectedRoutineType(routineA ? "A" : "Create_A");
        setAdjustedMachineIds(demoRoutine.machineIds);
        setIsAdjusting(true);
        return;
      }
    }

    let type: "A" | "B" | "Free" | "Create_A" | "Create_B" = routineA ? "A" : "Create_A";
    if (targetRoutine) {
      if (matchesRoutineLetter(targetRoutine, "A")) type = routineA ? "A" : "Create_A";
      else if (matchesRoutineLetter(targetRoutine, "B")) type = routineB ? "B" : "Create_B";
    }

    if (type === "B" && !routineB) {
      type = "Create_B";
    }

    // A hand-picked routine wins over the suggestion.
    if (routinePickedByTrainer) return;

    setSelectedRoutineType(type);
    if (type === "B") {
      setAdjustedMachineIds(routineB?.machineIds || []);
    } else if (type === "A") {
      setAdjustedMachineIds(routineA?.machineIds || []);
    } else {
      setAdjustedMachineIds([]);
    }
  }, [targetRoutine, routineA, routineB, routinePickedByTrainer, isIntroSession, routines]);

  const getCurrentBaseSequence = () => {
    if (
      isAdjusting ||
      ["Free", "Create_A", "Create_B"].includes(selectedRoutineType)
    )
      return adjustedMachineIds;
    return selectedRoutineType === "A"
      ? routineA?.machineIds || []
      : routineB?.machineIds || [];
  };

  const removeMachine = (index: number) => {
    const currentItems = getCurrentBaseSequence();
    const newSequence = [...currentItems];
    newSequence.splice(index, 1);
    setAdjustedMachineIds(newSequence);
    setIsAdjusting(true);
  };

  const addMachine = (machineId: string) => {
    const currentItems = getCurrentBaseSequence();
    setAdjustedMachineIds([...currentItems, machineId]);
    setIsAdjusting(true);
    setShowAddMachine(false);
  };

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 5,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      const currentItems = getCurrentBaseSequence();
      const oldIndex = currentItems.indexOf(active.id as string);
      const newIndex = currentItems.indexOf(over.id as string);
      const newSequence = arrayMove(currentItems, oldIndex, newIndex);
      setAdjustedMachineIds(newSequence);
      setIsAdjusting(true);
    }
  };

  const handleStart = () => {
    const checkIn: PreSessionCheckIn = {};
    if (sleepQuality) checkIn.sleepQuality = sleepQuality;
    if (stressLevel) checkIn.stressLevel = stressLevel;
    if (bodyStates.length > 0) checkIn.bodyStates = bodyStates;

    onStart(
      selectedRoutineType === "Create_B"
        ? "B"
        : selectedRoutineType === "Create_A"
          ? "A"
          : (selectedRoutineType as any),
      isAdjusting ||
        ["Free", "Create_A", "Create_B"].includes(selectedRoutineType)
        ? adjustedMachineIds
        : undefined,
      adjustmentNote,
      checkIn,
    );
  };

  const orthopedics = client.medicalHistory;
  const globalNotes = client.globalNotes;

  const clientFlags = (client.clinicalFlags || [])
    .map((flagId) => CLINICAL_FLAGS_MATRIX.find((f) => f.id === flagId))
    .filter(Boolean) as typeof CLINICAL_FLAGS_MATRIX;

  const severityOrder = {
    "Absolute Contraindication": 0,
    "High Risk": 1,
    "Moderate / Needs Modification": 2,
  };
  clientFlags.sort(
    (a, b) => severityOrder[a.severity] - severityOrder[b.severity],
  );

  const displayNotes = sessionNotes.filter((n) => n.priority === "High");

  const lastRoutineName = lastSession
    ? routines.find((r) => r.id === lastSession.routineId)?.name ||
      ((lastSession.sessionType as string) === "Free"
        ? "Open Session"
        : lastSession.sessionType)
    : "None";

  const lastSessionDate = safeToDate(lastSession?.endTime)
    ? safeToDate(lastSession.endTime)!.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : "Never";

  // Follows the trainer's selection, not the original suggestion — otherwise the
  // card keeps naming the auto-picked routine after they switch.
  const isBSelected = ["B", "Create_B"].includes(selectedRoutineType);
  const scheduledRoutineName = isBSelected
    ? routineB?.name || "Routine B"
    : routineA?.name || "Routine A";

  const activeFocuses = focusRecords.filter(
    (f) => f.status === "Active" && f.clientId === client.id,
  );

  const selectedRoutineIds =
    isAdjusting ||
    ["Free", "Create_A", "Create_B"].includes(selectedRoutineType)
      ? adjustedMachineIds
      : selectedRoutineType === "A"
        ? routineA?.machineIds || []
        : routineB?.machineIds || [];

  return (
    <div className="w-full h-full min-h-screen bg-slate-50 dark:bg-bg-dark font-sans flex flex-col overflow-hidden text-slate-900 dark:text-white">
      <div className="max-w-3xl lg:max-w-4xl mx-auto w-full h-full relative flex flex-col pb-28 shadow-2xl">
        <AppHeader
          variant="dark"
          trainerInitials={authTrainer?.initials || "AJ"}
          rightControls={rightControls}
          trainerDropdown={trainerDropdown}
          onStudioClick={onStudioClick}
        />

        <div className="flex-1 overflow-y-auto no-scrollbar relative z-10 flex flex-col">
          <div className="px-3.5 sm:px-5 lg:px-6 py-4 sm:py-5 flex-1 flex flex-col gap-3.5 sm:gap-4 pb-4">
            {/* 2. Client hero card */}
            <div className="rounded-2xl p-4 border border-cyan/30 shadow-sm relative overflow-hidden bg-white dark:bg-slate-900 dark:border-slate-800">
              <div className="flex justify-between items-start relative z-10">
                <div>
                  <h1 className="font-display italic text-slate-900 dark:text-white text-[24px] sm:text-[28px] font-black leading-[1.1] uppercase">
                    {client.firstName} {client.lastName}
                  </h1>
                  <div className="font-display italic text-slate-500 dark:text-slate-400 text-[11px] tracking-[0.08em] uppercase mt-1">
                    LAST SESSION · {lastSessionDate.toUpperCase()} ·{" "}
                    {lastRoutineName.toUpperCase()}
                  </div>
                </div>
                <button
                  onClick={onClose}
                  className="w-10 h-10 sm:w-11 sm:h-11 rounded-full bg-slate-100 dark:bg-white/5 flex items-center justify-center text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-white/10 hover:text-slate-900 dark:hover:text-white transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="flex flex-wrap gap-1.5 mt-3 relative z-10">
                {clientFlags.map((cond, i) => (
                  <ConditionChip
                    key={i}
                    label={cond.conditionName || (cond as any).label}
                    severity={
                      cond.severity === "High Risk" ||
                      cond.severity === "Absolute Contraindication"
                        ? "critical"
                        : "standard"
                    }
                  />
                ))}
              </div>

              <div className="mt-4 bg-slate-50 dark:bg-slate-800/60 rounded-xl p-3.5 relative z-10 border border-slate-200 dark:border-slate-700/60">
                <div className="flex items-center gap-1.5 text-[11px] font-bold tracking-wide text-slate-500 dark:text-slate-400 uppercase mb-1">
                  <Lightbulb className="w-3.5 h-3.5 text-amber-500" /> GLOBAL
                  GOAL
                </div>
                <div className="italic text-slate-800 dark:text-slate-100 text-[14px] sm:text-[15px] font-semibold opacity-95">
                  "{client.globalNotes || "No specific global goal set."}"
                </div>
              </div>

              {/* Note displays below goal */}
              {displayNotes.length > 0 && (
                <div className="mt-2 space-y-1.5 relative z-10">
                  {displayNotes.map((n) => (
                    <div
                      key={n.id}
                      className="bg-slate-50 dark:bg-slate-800/60 rounded-2xl p-3 border border-slate-200 dark:border-slate-700/60"
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-[11px] font-bold tracking-wide text-amber-500 uppercase flex items-center gap-1.5">
                          <Info className="w-3.5 h-3.5" /> HIGH PRIORITY
                        </span>
                        <span className="text-[11px] text-slate-400 font-bold uppercase">
                          {n.trainerInitials}
                        </span>
                      </div>
                      <div className="text-[14px] text-slate-800 dark:text-slate-100 font-medium">
                        {n.content}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Display active Focuses */}
              {activeFocuses.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-2 relative z-10">
                  {activeFocuses.map((f) => (
                    <div
                      key={f.id}
                      className="bg-slate-50 dark:bg-slate-800/60 rounded-2xl p-3 flex flex-col w-full border border-slate-200 dark:border-slate-700/60"
                    >
                      <span className="text-[11px] font-bold tracking-wide text-slate-500 dark:text-slate-400 uppercase flex items-center gap-1.5 mb-1">
                        {f.category === "Posture"
                          ? "🦴"
                          : f.category === "Pace"
                            ? "⏱️"
                            : f.category === "Path"
                              ? "🛤️"
                              : f.category === "Purpose"
                                ? "🧠"
                                : "🎯"}
                        ACTIVE FOCUS: {f.category}
                      </span>
                      <span className="text-[14px] text-slate-800 dark:text-slate-100 font-medium italic">
                        "{f.clinicalNotes}"
                      </span>
                      {f.targetMachineId && (
                        <span className="text-[11px] font-bold tracking-wide text-cyan mt-1.5 uppercase">
                          TARGET:{" "}
                          {machines.find((m) => m.id === f.targetMachineId)
                            ?.name || "Unknown Machine"}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* Pre-Session Check-in */}
              <div className="mt-4 bg-slate-50 dark:bg-slate-800/60 rounded-2xl p-4 relative z-10 border border-slate-200 dark:border-slate-700/60">
                <div className="flex items-center gap-1.5 text-[11px] font-bold tracking-wide text-slate-500 dark:text-slate-400 uppercase mb-4">
                  <Activity className="w-3.5 h-3.5 text-cyan" /> DAILY RECOVERY
                  CHECK-IN (OPTIONAL)
                </div>

                {/* Sleep — qualitative pill group */}
                <div className="space-y-2 mb-4">
                  <label className="text-[11px] uppercase tracking-widest text-slate-600 dark:text-slate-300 font-extrabold ml-1 block">
                    Sleep
                  </label>
                  <div className="flex w-full gap-2">
                    {(
                      [
                        { value: "poor", label: "Poor" },
                        { value: "average", label: "Average" },
                        { value: "optimal", label: "Optimal" },
                      ] as { value: SleepQuality; label: string }[]
                    ).map((opt) => {
                      const isActive = sleepQuality === opt.value;
                      return (
                        <button
                          key={opt.value}
                          type="button"
                          onClick={() =>
                            setSleepQuality((prev) =>
                              prev === opt.value ? undefined : opt.value,
                            )
                          }
                          aria-pressed={isActive}
                          className={`flex-1 h-12 rounded-xl text-[13px] font-extrabold uppercase tracking-wide transition-all cursor-pointer active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan ${
                            isActive
                              ? "bg-[#38BDF8] text-slate-950 font-black shadow-md"
                              : "bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700"
                          }`}
                        >
                          {opt.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Stress — 1-5 scale */}
                <div className="space-y-2 mb-4">
                  <label className="text-[11px] uppercase tracking-widest text-slate-600 dark:text-slate-300 font-extrabold ml-1 block">
                    Stress Level (1-5)
                  </label>
                  <div className="flex w-full gap-2">
                    {([1, 2, 3, 4, 5] as const).map((lvl) => {
                      const isActive = stressLevel === lvl;
                      return (
                        <button
                          key={lvl}
                          type="button"
                          onClick={() =>
                            setStressLevel((prev) =>
                              prev === lvl ? undefined : lvl,
                            )
                          }
                          aria-pressed={isActive}
                          className={`flex-1 h-12 rounded-xl text-[13px] font-extrabold uppercase tracking-wide transition-all cursor-pointer active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan ${
                            isActive
                              ? "bg-[#38BDF8] text-slate-950 font-black shadow-md"
                              : "bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700"
                          }`}
                        >
                          {lvl}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Pre-Session Notes (UNCHANGED from existing implementation) */}
                <div className="space-y-2">
                  <label className="text-[11px] uppercase tracking-widest text-slate-600 dark:text-slate-300 font-extrabold ml-1">
                    Pre-Session Notes (Optional)
                  </label>
                  <textarea
                    value={adjustmentNote}
                    onChange={(e) => setAdjustmentNote(e.target.value)}
                    placeholder="How is the client feeling? Any adjustments to the routine?"
                    className="w-full min-h-20 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-slate-100 text-sm p-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan transition-all resize-y"
                  />
                </div>
              </div>
            </div>

            {/* 3a. Routine selector — the alternation logic proposes one, the
                    trainer can override it before starting. */}
            <div className="space-y-1.5">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 px-1">
                <span className="text-[11px] uppercase tracking-widest text-slate-600 dark:text-slate-300 font-extrabold">
                  Today's Routine
                </span>
                <span className="text-[10px] uppercase tracking-wider font-bold text-slate-400">
                  {routinePickedByTrainer
                    ? "Manually selected"
                    : `Suggested: Routine ${suggestedType}`}
                </span>
              </div>
              <div
                role="group"
                aria-label="Select today's routine"
                className="grid grid-cols-2 gap-2"
              >
                {(["A", "B"] as const).map((type) => {
                  const routine = type === "A" ? routineA : routineB;
                  const active =
                    type === "A"
                      ? ["A", "Create_A"].includes(selectedRoutineType)
                      : ["B", "Create_B"].includes(selectedRoutineType);
                  return (
                    <button
                      key={type}
                      type="button"
                      onClick={() => handlePickRoutine(type)}
                      aria-pressed={active}
                      className={cn(
                        "min-h-14 rounded-xl border px-4 py-2 text-left transition-all cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan",
                        active
                          ? "bg-cyan/10 border-cyan text-slate-900 dark:text-white shadow-[0_0_16px_rgba(6,182,212,0.25)]"
                          : "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 hover:border-slate-300 dark:hover:border-slate-700",
                      )}
                    >
                      <span className="block font-display italic uppercase tracking-wide text-sm">
                        Routine {type}
                      </span>
                      <span className="block text-[10px] font-bold uppercase tracking-wider mt-0.5 text-slate-400">
                        {routine
                          ? `${routine.machineIds?.length || 0} machines`
                          : "Not set up — tap to build"}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* 3. Routine compare strip */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <RoutineCompareCard
                variant="scheduled"
                label="SCHEDULED TODAY"
                title={scheduledRoutineName}
                meta={`${selectedRoutineIds.length} machines`}
              />
              <RoutineCompareCard
                variant="previous"
                label="LAST PERFORMED"
                title={lastRoutineName}
                meta={`${lastSessionDate.toUpperCase()}`}
              />
            </div>

            {/* 4. Execution sequence */}
            <div className="mt-2 flex flex-col gap-1.5 min-h-100">
              <div className="flex justify-between items-end mb-2 px-1">
                <div className="flex items-center gap-1.5 text-slate-900 dark:text-white text-[16px] font-black uppercase tracking-wide">
                  <Activity className="w-4 h-4 text-cyan" />
                  <span className="mt-0.5">Execution Sequence</span>
                </div>
                <button
                  type="button"
                  className="text-cyan font-bold text-[11px] uppercase tracking-wide cursor-pointer hover:text-[#0284c7] dark:hover:text-white transition-colors min-h-11 px-4 -mr-2 bg-cyan/10 hover:bg-cyan/20 rounded-full flex items-center justify-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan"
                  onClick={() => setShowAddMachine(!showAddMachine)}
                >
                  {showAddMachine ? "✓ DONE EDITING" : "⇅ EDIT ROUTINE"}
                </button>
              </div>

              {selectedRoutineIds.length === 0 ? (
                <div className="flex flex-col items-center justify-center p-12 min-h-50 border border-dashed border-slate-200 dark:border-slate-800 rounded-2xl bg-white dark:bg-slate-900 mt-2">
                  <button
                    onClick={() => setShowAddMachine(true)}
                    className="bg-cta hover:bg-cta-strong text-white font-display italic px-6 py-3 rounded-full tracking-wide transition-all hover:scale-105 active:scale-95 flex items-center gap-2 text-sm shadow-md cursor-pointer"
                  >
                    <Plus className="w-4 h-4" /> ADD FIRST MACHINE
                  </button>
                </div>
              ) : (
                <DndContext
                  sensors={sensors}
                  collisionDetection={closestCenter}
                  onDragEnd={handleDragEnd}
                >
                  <SortableContext
                    items={selectedRoutineIds}
                    strategy={verticalListSortingStrategy}
                  >
                    {selectedRoutineIds.map((machineId, idx) => {
                      const machine = machines.find((m) => m.id === machineId);
                      if (!machine) return null;

                      const getMillis = (ts: any) => {
                        if (!ts) return 0;
                        if (typeof ts.toMillis === "function")
                          return ts.toMillis();
                        if (typeof ts.toDate === "function")
                          return ts.toDate().getTime();
                        if (ts.seconds !== undefined) return ts.seconds * 1000;
                        const d = new Date(ts);
                        return isNaN(d.getTime()) ? 0 : d.getTime();
                      };

                      const mLogs = logs
                        .filter((l) => l.machineId === machineId)
                        .sort(
                          (a, b) =>
                            getMillis(b.createdAt) - getMillis(a.createdAt),
                        );
                      const lastLog = mLogs[0];
                      const clientMetric = client?.currentMachineMetrics?.[machineId];

                      const isTSC =
                        machine.targetRepRange?.toLowerCase().includes("tsc") ||
                        machine.targetRepRange
                          ?.toLowerCase()
                          .includes("static") ||
                        machine.targetRepRange?.toLowerCase().includes("time") ||
                        Boolean(lastLog?.isTSC) ||
                        Boolean(clientMetric?.isTSC);

                      const rawWeight =
                        lastLog?.weight !== undefined && lastLog?.weight !== ""
                          ? lastLog.weight
                          : lastLog?.loadLb !== undefined && lastLog?.loadLb !== ""
                            ? lastLog.loadLb
                            : clientMetric?.weight !== undefined && clientMetric?.weight !== ""
                              ? clientMetric.weight
                              : null;

                      const rawReps = isTSC
                        ? lastLog?.seconds !== undefined && lastLog?.seconds !== ""
                          ? lastLog.seconds
                          : lastLog?.outcomeTut !== undefined && lastLog?.outcomeTut !== ""
                            ? lastLog.outcomeTut
                            : lastLog?.timeSpent !== undefined && lastLog?.timeSpent !== ""
                              ? lastLog.timeSpent
                              : clientMetric?.seconds !== undefined && clientMetric?.seconds !== ""
                                ? clientMetric.seconds
                                : lastLog?.reps !== undefined && lastLog?.reps !== ""
                                  ? lastLog.reps
                                  : clientMetric?.reps !== undefined && clientMetric?.reps !== ""
                                    ? clientMetric.reps
                                    : null
                        : lastLog?.reps !== undefined && lastLog?.reps !== ""
                          ? lastLog.reps
                          : lastLog?.outcomeReps !== undefined && lastLog?.outcomeReps !== ""
                            ? lastLog.outcomeReps
                            : clientMetric?.reps !== undefined && clientMetric?.reps !== ""
                              ? clientMetric.reps
                              : null;

                      const displayMachine = {
                        idx: idx + 1,
                        name: machine.name,
                        lastLb: rawWeight,
                        lastReps: rawReps,
                        lastUnit: isTSC ? "sec" : "reps",
                        isTSC: isTSC,
                      };

                      return (
                        <SortableSequenceItem
                          key={machineId}
                          id={machineId}
                          showAddMachine={showAddMachine}
                          onRemove={() => removeMachine(idx)}
                        >
                          <SequenceRow machine={displayMachine as any} />
                        </SortableSequenceItem>
                      );
                    })}
                  </SortableContext>
                </DndContext>
              )}

              {showAddMachine && (
                <div className="mt-4 p-4 border border-dashed border-cyan/30 rounded-xl bg-cyan/5">
                  <div className="text-[11px] font-bold tracking-wide text-cyan mb-3 uppercase">
                    ADD MACHINE
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {machines
                      .filter((m) => !selectedRoutineIds.includes(m.id))
                      .map((m) => (
                        <button
                          key={m.id}
                          onClick={() => addMachine(m.id)}
                          className="text-[12px] font-bold text-slate-800 dark:text-white bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition-colors cursor-pointer"
                        >
                          <Plus className="w-3.5 h-3.5 text-cyan" /> {m.name}
                        </button>
                      ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        <div
          className="shrink-0 px-6 pb-4 pt-3 z-20"
          style={{
            background: 'linear-gradient(to top, var(--bg-dark) 60%, rgba(13,26,43,0) 100%)'
          }}
        >
          <button
            onClick={handleStart}
            className="w-full h-[60px] min-h-[44px] rounded-[30px] font-display italic text-[18px] uppercase tracking-wide bg-gradient-to-br from-cta to-cta-strong text-white shadow-[0_4px_24px_rgba(243,116,39,0.3)] hover:shadow-[0_6px_32px_rgba(243,116,39,0.4)] border border-white/20 transition-all flex items-center justify-center gap-2 cursor-pointer"
          >
            <div className="w-0 h-0 border-t-[5px] border-t-transparent border-l-8 border-l-white border-b-[5px] border-b-transparent mr-1" />
            START SESSION
          </button>
        </div>
      </div>
    </div>
  );
}
