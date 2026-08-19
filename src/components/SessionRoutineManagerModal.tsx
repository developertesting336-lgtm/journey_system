import React, { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Machine } from "../types";
import { Plus, X } from "lucide-react";
import { SequenceRow } from "./SequenceRow";
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

interface Props {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  currentMachineIds: string[];
  machines: Machine[];
  onSave: (machineIds: string[]) => void;
}

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
    <div ref={setNodeRef} style={style} className="relative group">
      <div className="flex items-center gap-2 mb-2">
        {showAddMachine && (
          <button
            onClick={onRemove}
            className="w-13 h-13 shrink-0 bg-rose-500/10 hover:bg-rose-500/20 text-rose-500 rounded-[10px] flex items-center justify-center transition-colors border border-rose-500/20"
          >
            <X className="w-5 h-5" />
          </button>
        )}
        <div className="flex-1 touch-none" {...attributes} {...listeners}>
          {children}
        </div>
      </div>
    </div>
  );
}

export function SessionRoutineManagerModal({
  isOpen,
  onOpenChange,
  currentMachineIds,
  machines,
  onSave,
}: Props) {
  const [localIds, setLocalIds] = useState<string[]>([]);
  const [showAddMachine, setShowAddMachine] = useState(true);

  useEffect(() => {
    if (isOpen) {
      setLocalIds(currentMachineIds);
    }
  }, [isOpen, currentMachineIds]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      setLocalIds((items) => {
        const oldIndex = items.indexOf(active.id as string);
        const newIndex = items.indexOf(over.id as string);
        return arrayMove(items, oldIndex, newIndex);
      });
    }
  };

  const removeMachine = (index: number) => {
    const updated = [...localIds];
    updated.splice(index, 1);
    setLocalIds(updated);
  };

  const addMachine = (machineId: string) => {
    if (!localIds.includes(machineId)) {
      setLocalIds([...localIds, machineId]);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-136 sm:max-w-136 w-full bg-bg-dark border border-div-d text-ink-d1 p-0 overflow-hidden shadow-2xl rounded-3xl flex flex-col h-[80vh] md:h-[70vh]">
        <DialogHeader className="p-4 md:p-6 bg-bg-dark border-b border-div-d shrink-0 relative z-20">
          <DialogTitle className="text-xl md:text-2xl font-display italic font-black uppercase tracking-widest text-ink-d1">
            Edit Routine Sequence
          </DialogTitle>
          <DialogDescription className="text-ink-d3 font-bold uppercase tracking-widest text-[11px] md:text-xs mt-1 md:mt-2">
            Drag to reorder. Tap X to remove.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto bg-bg-dark p-4 md:p-6 custom-scrollbar">
          <div className="flex flex-col">
            {localIds.length === 0 ? (
              <div className="flex flex-col items-center justify-center p-12 min-h-50 border border-dashed border-div-l rounded-2xl bg-bg-l-card mt-2 text-ink-l">
                No machines in sequence. Add some below.
              </div>
            ) : (
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={handleDragEnd}
              >
                <SortableContext
                  items={localIds}
                  strategy={verticalListSortingStrategy}
                >
                  {localIds.map((machineId, idx) => {
                    const machine = machines.find((m) => m.id === machineId);
                    if (!machine) return null;

                    const isTSC =
                      machine.targetRepRange?.toLowerCase().includes("tsc") ||
                      machine.targetRepRange
                        ?.toLowerCase()
                        .includes("static") ||
                      machine.targetRepRange?.toLowerCase().includes("time");

                    const displayMachine = {
                      idx: idx + 1,
                      name: machine.name,
                      lastLb: null,
                      lastReps: null,
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
              <div className="mt-4 p-4 border border-dashed border-cyan/20 rounded-xl bg-cyan/5">
                <div className="text-[11px] font-medium tracking-wide opacity-60 text-cyan mb-3 uppercase">
                  ADD MACHINE
                </div>
                <div className="flex flex-wrap gap-2">
                  {machines
                    .filter((m) => !localIds.includes(m.id!))
                    .map((m) => (
                      <button
                        key={m.id}
                        onClick={() => addMachine(m.id!)}
                        className="text-[12px] font-medium text-ink-d1 bg-surface-2 hover:bg-surface-1 border border-div-d px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition-colors"
                      >
                        <Plus className="w-3.5 h-3.5 text-cyan" /> {m.name}
                      </button>
                    ))}
                </div>
              </div>
            )}
          </div>
        </div>

        <DialogFooter className="p-4 md:p-6 bg-surface-1 border-t border-div-d shrink-0 relative z-20 flex flex-row items-center justify-end gap-3">
          <Button
            variant="ghost"
            onClick={() => onOpenChange(false)}
            className="text-ink hover:text-ink-d1 uppercase font-bold tracking-widest text-[11px]"
          >
            Cancel
          </Button>
          <Button
            onClick={() => {
              onSave(localIds);
              onOpenChange(false);
            }}
            className="bg-cta hover:bg-cta-strong text-ink-d1 font-system font-bold uppercase tracking-widest shadow-md text-[11px]"
          >
            Confirm Sequence
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
