import React, { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  Users,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import axios from "axios";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ScheduleEntry, Trainer } from "../types";
import { cn } from "../lib/utils";
import { isFuzzyNameMatch } from "../lib/sync-utils";
import {
  studioDateKey,
  zonedHM,
  studioHour,
  calendarLabelKey,
  studioDayBoundsForKey,
} from "../lib/studio-time";
import { db } from "../firebase";
import {
  updateDoc,
  doc,
  getDocs,
  query,
  collection,
  where,
} from "firebase/firestore";

export function CalendarView({
  schedules,
  trainers,
  authTrainer,
  isAdmin,
  activeStudioId,
  onSelectClient,
  onStartNewClientOnboarding,
  setView,
  clients,
}: {
  schedules: ScheduleEntry[];
  trainers: Trainer[];
  authTrainer: Trainer | null;
  isAdmin: boolean;
  activeStudioId?: string;
  onSelectClient?: (id: string) => void;
  onStartNewClientOnboarding?: (name: string) => void;
  setView?: (view: any) => void;
  clients?: any[];
}) {
  const [viewMode, setViewMode] = useState<"month" | "week" | "day">("month");
  const [shiftMode, setShiftMode] = useState<"ALL" | "AM" | "PM">("ALL");
  const [filterMode, setFilterMode] = useState<"all" | "sessions" | "events">(
    "all",
  );
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [selectedTrainerId, setSelectedTrainerId] = useState<string>(
    isAdmin ? "all" : authTrainer?.id || "all",
  );

  const visibleCalendarTrainers = React.useMemo(() => {
    return trainers.filter((t) => {
      if (t.isVisibleOnCalendar === false) return false;

      const isAssigned =
        !activeStudioId ||
        t.primaryHomeStudioId === activeStudioId ||
        t.accessibleStudioIds?.includes(activeStudioId) ||
        t.activeGuestStudioIds?.includes(activeStudioId);
      if (isAssigned) return true;

      const hasSessionInActiveStudio = schedules.some((s) => {
        if (s.status === "Cancelled") return false;
        if (activeStudioId && s.studioId && s.studioId !== activeStudioId)
          return false;
        if (
          s.trainerId &&
          t.id &&
          (s.trainerId === t.id || String(s.trainerId) === String(t.id))
        )
          return true;
        if (
          s.trainerName &&
          t.fullName &&
          s.trainerName.toLowerCase() === t.fullName.toLowerCase()
        )
          return true;
        return false;
      });
      return hasSessionInActiveStudio;
    });
  }, [trainers, activeStudioId, schedules]);

  const allClientEvents = React.useMemo(() => {
    const events: any[] = [];
    if (clients) {
      clients.forEach((c) => {
        if (c.events && Array.isArray(c.events)) {
          c.events.forEach((e) => {
            events.push({
              ...e,
              isClientEvent: true, // Marker
              clientId: c.id,
              clientName: `${c.firstName} ${c.lastName}`,
            });
          });
        }
      });
    }
    return events;
  }, [clients]);

  // Robust trainer lookup function by ID, exact name, or fuzzy match
  const getTrainerIdForSession = React.useCallback(
    (s: any) => {
      if (!s) return null;
      const sId = s.trainerId || s.staffId || s.StaffId;
      if (sId) {
        const found = trainers.find(
          (t) => t.id === sId || String(t.id) === String(sId),
        );
        if (found) return found.id;
      }
      const sName = (s.trainerName || s.staffName || s.StaffFirstName || "")
        .trim()
        .toLowerCase();
      if (sName) {
        const found = trainers.find((t) => {
          if (!t.fullName) return false;
          const tFull = t.fullName.trim().toLowerCase();
          const tFirst = ((t as any).firstName || t.fullName)
            .split(" ")[0]
            .trim()
            .toLowerCase();
          if (
            sName === tFull ||
            sName === tFirst ||
            sName.startsWith(tFirst) ||
            tFirst.startsWith(sName)
          )
            return true;
          return false;
        });
        if (found) return found.id;
      }
      return null;
    },
    [trainers],
  );

  const trainerMap = React.useMemo(() => {
    const map: Record<string, string> = {};
    trainers.forEach((t) => {
      if (t.fullName) {
        map[t.fullName] = t.id!;
        map[t.fullName.trim().toLowerCase()] = t.id!;
      }
    });
    return map;
  }, [trainers]);

  // Handle trainer filtering for sessions and partition Unavailability to events
  const { normalSchedules, unavailEvents } = React.useMemo(() => {
    const normal: any[] = [];
    const unavail: any[] = [];
    schedules.forEach((s) => {
      if (s.status === "Cancelled") return;
      const tId = getTrainerIdForSession(s);
      const trainerMatches =
        selectedTrainerId === "all" || (tId && tId === selectedTrainerId);
      if (!trainerMatches) return;

      if (s.clientName?.toLowerCase().includes("unavailab")) {
        unavail.push({
          ...s,
          isClientEvent: true,
          isUnavailabilityEvent: true,
          date: getScheduleDate(s),
          title: "Unavailability",
          type: "Other",
          priority: "Low",
          notes: (s as any).notes || "",
        });
      } else {
        normal.push(s);
      }
    });
    return { normalSchedules: normal, unavailEvents: unavail };
  }, [schedules, selectedTrainerId, getTrainerIdForSession]);

  const filteredItems = React.useMemo(() => {
    let items: any[] = [];
    if (filterMode === "all" || filterMode === "sessions") {
      items = [...items, ...normalSchedules];
    }
    if (filterMode === "all" || filterMode === "events") {
      items = [...items, ...allClientEvents, ...unavailEvents];
    }
    return items;
  }, [filterMode, normalSchedules, allClientEvents, unavailEvents]);

  const daysInMonth = (year: number, month: number) =>
    new Date(year, month + 1, 0).getDate();
  const firstDayOfMonth = (year: number, month: number) =>
    new Date(year, month, 1).getDay();

  const safeToDate = (time: any) => {
    if (!time) return null;
    if (typeof time.toDate === "function") return time.toDate();
    if (time.seconds !== undefined) return new Date(time.seconds * 1000);
    if (typeof time === "string" || typeof time === "number") {
      const d = new Date(time);
      return isNaN(d.getTime()) ? null : d;
    }
    return null;
  };

  const getScheduleDate = (s: any): Date | null => {
    if (!s) return null;
    return safeToDate(s.startTime || s.StartDateTime || s.date || s.start);
  };

  const getScheduleEndDate = (s: any): Date | null => {
    if (!s) return null;
    return safeToDate(
      s.endTime ||
        s.EndDateTime ||
        s.endDate ||
        s.startTime ||
        s.StartDateTime ||
        s.date,
    );
  };

  const isTrainerMatch = (s: any, trainer: Trainer): boolean => {
    if (!s || !trainer) return false;
    const sId = s.trainerId || s.staffId || s.StaffId;
    if (sId && trainer.id && String(sId) === String(trainer.id)) return true;

    const sName = (s.trainerName || s.staffName || s.StaffFirstName || "")
      .trim()
      .toLowerCase();
    const tFull = (trainer.fullName || "").trim().toLowerCase();
    const tFirst = ((trainer as any).firstName || trainer.fullName || "")
      .split(" ")[0]
      .trim()
      .toLowerCase();

    if (!sName || !tFull) return false;
    if (sName === tFull) return true;
    if (tFirst.length >= 2 && sName === tFirst) return true;
    if (
      sName.length >= 3 &&
      tFull.length >= 3 &&
      (sName.includes(tFull) || tFull.includes(sName))
    ) {
      return true;
    }
    return false;
  };

  const getSlotHeader = (date: Date) => {
    const hm = zonedHM(date);
    let h = hm ? hm.hour : 0;
    const m = hm ? hm.minute : 0;
    const slotM = m < 30 ? "00" : "30";
    const ampm = h >= 12 ? "PM" : "AM";
    h = h % 12;
    h = h ? h : 12;
    return `${h}:${slotM} ${ampm}`;
  };

  const handlePrev = () => {
    const prev = new Date(selectedDate);
    if (viewMode === "month") prev.setMonth(selectedDate.getMonth() - 1);
    else if (viewMode === "week") prev.setDate(selectedDate.getDate() - 7);
    else if (viewMode === "day") prev.setDate(selectedDate.getDate() - 1);
    setSelectedDate(prev);
  };

  const handleNext = () => {
    const next = new Date(selectedDate);
    if (viewMode === "month") next.setMonth(selectedDate.getMonth() + 1);
    else if (viewMode === "week") next.setDate(selectedDate.getDate() + 7);
    else if (viewMode === "day") next.setDate(selectedDate.getDate() + 1);
    setSelectedDate(next);
  };

  const calendarLabelKey = (date: Date) =>
    `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
      date.getDate(),
    ).padStart(2, "0")}`;

  const isToday = (date: Date) =>
    calendarLabelKey(date) === studioDateKey(new Date());

  const isSameDay = (instant: Date, gridDate: Date) =>
    studioDateKey(instant) === calendarLabelKey(gridDate);

  const eventCoversDay = (item: any, gridDate: Date): boolean => {
    const toKey = (v: any): string => {
      if (!v) return "";
      if (typeof v === "string") return v.slice(0, 10);
      const d = safeToDate(v);
      return d ? (studioDateKey(d) ?? "") : "";
    };
    const startKey = toKey(item.date);
    if (!startKey) return false;
    const endKey = toKey(item.endDate) || startKey;
    const dayKey = calendarLabelKey(gridDate);
    return dayKey >= startKey && dayKey <= endKey;
  };

  const amSlots = React.useMemo(() => {
    let minH = 6;
    let maxH = 13;

    (schedules || []).forEach((s) => {
      const d = safeToDate(
        s.startTime ||
          (s as any).StartDateTime ||
          (s as any).date ||
          (s as any).start,
      );
      if (d) {
        const h = studioHour(d) ?? 0;
        if (h < 14) {
          if (h < minH) minH = h;
          if (h > maxH) maxH = h;
        }
      }
    });

    const slots: string[] = [];
    for (let h = minH; h <= maxH; h++) {
      const displayHour = h % 12 === 0 ? 12 : h % 12;
      const ampm = h >= 12 ? "PM" : "AM";
      slots.push(`${displayHour}:00 ${ampm}`);
      slots.push(`${displayHour}:30 ${ampm}`);
    }
    return slots;
  }, [schedules]);

  const pmSlots = React.useMemo(() => {
    let minH = 14;
    let maxH = 20;

    (schedules || []).forEach((s) => {
      const d = safeToDate(
        s.startTime ||
          (s as any).StartDateTime ||
          (s as any).date ||
          (s as any).start,
      );
      if (d) {
        const h = studioHour(d) ?? 0;
        if (h >= 14) {
          if (h < minH) minH = h;
          if (h > maxH) maxH = h;
        }
      }
    });

    const slots: string[] = [];
    for (let h = minH; h <= maxH; h++) {
      const displayHour = h % 12 === 0 ? 12 : h % 12;
      const ampm = h >= 12 ? "PM" : "AM";
      slots.push(`${displayHour}:00 ${ampm}`);
      slots.push(`${displayHour}:30 ${ampm}`);
    }
    return slots;
  }, [schedules]);

  const dynamicSlots = React.useMemo(() => {
    return Array.from(new Set([...amSlots, ...pmSlots]));
  }, [amSlots, pmSlots]);

  const TRAINER_COLORS = [
    {
      border: "border-[#38BDF8]",
      bg: "bg-[#38BDF8]/10",
      solidBg: "bg-[#38BDF8]",
      text: "text-[#38BDF8]",
    },
    {
      border: "border-[#10B981]",
      bg: "bg-[#10B981]/10",
      solidBg: "bg-[#10B981]",
      text: "text-[#10B981]",
    },
    {
      border: "border-[#F06C22]",
      bg: "bg-[#F06C22]/10",
      solidBg: "bg-[#F06C22]",
      text: "text-[#F06C22]",
    },
    {
      border: "border-[#A855F7]",
      bg: "bg-[#A855F7]/10",
      solidBg: "bg-[#A855F7]",
      text: "text-[#A855F7]",
    },
    {
      border: "border-[#22D3EE]",
      bg: "bg-[#22D3EE]/10",
      solidBg: "bg-[#22D3EE]",
      text: "text-[#22D3EE]",
    },
  ];

  const getWeekDays = (date: Date) => {
    const start = new Date(date);
    start.setHours(0, 0, 0, 0);
    start.setDate(date.getDate() - date.getDay());
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      return d;
    });
  };

  const handleClientClick = (session: ScheduleEntry) => {
    if (onSelectClient && setView) {
      const clientName = session.clientName || "";

      const scheduleTrainer = trainers.find(
        (t) =>
          t.id === session.trainerId ||
          (t.fullName &&
            session.trainerName &&
            t.fullName.toLowerCase() === session.trainerName.toLowerCase()),
      );
      const targetStudioId = scheduleTrainer?.primaryHomeStudioId;

      let matchedClient: any = null;

      // 1. Try matching with strict name/fuzzy in the trainer's home studio first
      if (clients && targetStudioId) {
        matchedClient = clients.find(
          (c) =>
            c.homeStudioId === targetStudioId &&
            (c.id === session.clientId ||
              isFuzzyNameMatch(
                clientName,
                c.firstName || "",
                c.lastName || "",
                c.mindbody_name,
              )),
        );
      }

      // 2. Fallback globally
      if (!matchedClient && clients) {
        matchedClient = clients.find(
          (c) =>
            c.id === session.clientId ||
            isFuzzyNameMatch(
              clientName,
              c.firstName || "",
              c.lastName || "",
              c.mindbody_name,
            ),
        );
      }

      // 3. Quick check: Has this exact name been linked in any previous schedule entry?
      if (!matchedClient && schedules) {
        const pastLink = schedules.find(
          (s) => s.clientName === clientName && !!s.clientId,
        );
        if (pastLink && clients) {
          matchedClient = clients.find((c) => c.id === pastLink.clientId);
        }
      }

      // Helper to trigger navigation
      const selectMatchedClient = (clientId: string, nameToStore?: string) => {
        if (
          session.id &&
          (!session.clientId || session.clientId !== clientId)
        ) {
          try {
            updateDoc(doc(db, "schedules", session.id!), {
              clientId: clientId,
            }).catch((err) =>
              console.error(
                "Error auto-linking clicked calendar schedule:",
                err,
              ),
            );
            if (nameToStore) {
              updateDoc(doc(db, "clients", clientId), {
                mindbody_name: nameToStore,
              }).catch((err) =>
                console.error("Error setting mindbody_name on click:", err),
              );
            }
          } catch (e) {
            console.error("Could not update Firebase for auto-link:", e);
          }
        }

        onSelectClient(clientId);
        setView("profile");
      };

      if (matchedClient) {
        selectMatchedClient(
          matchedClient.id,
          !matchedClient.mindbody_name ? clientName : undefined,
        );
      } else {
        // If not found in current UI state array (or if the day of schedule is different),
        // query Firestore in real-time under trainer's home studio first, then globally.
        const searchDatabase = async () => {
          try {
            const clientsRef = collection(db, "clients");
            let dbMatched: any = null;

            const nameVariants = Array.from(
              new Set([
                clientName,
                clientName.toLowerCase(),
                clientName.toUpperCase(),
                clientName
                  .split(/\s+/)
                  .map(
                    (p) => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase(),
                  )
                  .join(" "),
              ]),
            );

            // A. Try querying trainer's home studio clients first
            if (targetStudioId) {
              const mbSnap = await getDocs(
                query(
                  clientsRef,
                  where("homeStudioId", "==", targetStudioId),
                  where("mindbody_name", "in", nameVariants),
                ),
              );

              if (!mbSnap.empty) {
                dbMatched = { id: mbSnap.docs[0].id, ...mbSnap.docs[0].data() };
              } else {
                const parts = clientName.split(/\s+/);
                if (parts.length >= 1) {
                  const first = parts[0];
                  const firstVariants = Array.from(
                    new Set([
                      first,
                      first.toLowerCase(),
                      first.toUpperCase(),
                      first.charAt(0).toUpperCase() +
                        first.slice(1).toLowerCase(),
                      ...nameVariants,
                    ]),
                  );

                  const flSnap = await getDocs(
                    query(
                      clientsRef,
                      where("homeStudioId", "==", targetStudioId),
                      where("firstName", "in", firstVariants),
                    ),
                  );

                  const matchingDoc = flSnap.docs.find((docData) => {
                    const data = docData.data();
                    return isFuzzyNameMatch(
                      clientName,
                      data.firstName || "",
                      data.lastName || "",
                      data.mindbody_name,
                    );
                  });

                  if (matchingDoc) {
                    dbMatched = { id: matchingDoc.id, ...matchingDoc.data() };
                  }
                }
              }
            }

            // B. Fallback globally
            if (!dbMatched) {
              const mbSnapGlobal = await getDocs(
                query(clientsRef, where("mindbody_name", "in", nameVariants)),
              );

              if (!mbSnapGlobal.empty) {
                dbMatched = {
                  id: mbSnapGlobal.docs[0].id,
                  ...mbSnapGlobal.docs[0].data(),
                };
              } else {
                const parts = clientName.split(/\s+/);
                if (parts.length >= 1) {
                  const first = parts[0];
                  const firstVariants = Array.from(
                    new Set([
                      first,
                      first.toLowerCase(),
                      first.toUpperCase(),
                      first.charAt(0).toUpperCase() +
                        first.slice(1).toLowerCase(),
                      ...nameVariants,
                    ]),
                  );

                  const flSnapGlobal = await getDocs(
                    query(clientsRef, where("firstName", "in", firstVariants)),
                  );

                  const matchingDoc = flSnapGlobal.docs.find((docData) => {
                    const data = docData.data();
                    return isFuzzyNameMatch(
                      clientName,
                      data.firstName || "",
                      data.lastName || "",
                      data.mindbody_name,
                    );
                  });

                  if (matchingDoc) {
                    dbMatched = { id: matchingDoc.id, ...matchingDoc.data() };
                  }
                }
              }
            }

            if (dbMatched) {
              selectMatchedClient(
                dbMatched.id,
                !dbMatched.mindbody_name ? clientName : undefined,
              );
            } else {
              if (onStartNewClientOnboarding) {
                onStartNewClientOnboarding(clientName);
              }
            }
          } catch (err) {
            console.error(
              "Calendar real-time Firestore client match failed:",
              err,
            );
            if (onStartNewClientOnboarding) {
              onStartNewClientOnboarding(clientName);
            }
          }
        };

        searchDatabase();
      }
    }
  };

  const renderMonth = () => {
    const year = selectedDate.getFullYear();
    const month = selectedDate.getMonth();
    const firstDay = firstDayOfMonth(year, month);
    const totalDays = daysInMonth(year, month);
    const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

    const prevMonthDays = daysInMonth(year, month - 1);
    const matrix: { num: number; current: boolean; date: Date }[] = [];

    for (let i = 0; i < 42; i++) {
      const dayNum = i - firstDay + 1;
      if (dayNum <= 0) {
        matrix.push({
          num: prevMonthDays + dayNum,
          current: false,
          date: new Date(year, month - 1, prevMonthDays + dayNum),
        });
      } else if (dayNum > totalDays) {
        matrix.push({
          num: dayNum - totalDays,
          current: false,
          date: new Date(year, month + 1, dayNum - totalDays),
        });
      } else {
        matrix.push({
          num: dayNum,
          current: true,
          date: new Date(year, month, dayNum),
        });
      }
    }

    return (
      <div className="w-full overflow-x-auto no-scrollbar rounded-2xl sm:rounded-3xl border border-slate-200 dark:border-slate-800 shadow-xl bg-white dark:bg-slate-950">
        <div className="grid grid-cols-7 gap-px bg-slate-200 dark:bg-slate-800/80 min-w-162.5 sm:min-w-0">
          {dayNames.map((d) => (
            <div
              key={d}
              className="bg-slate-100/90 dark:bg-slate-900/90 p-2 sm:p-3 text-center border-b border-slate-200 dark:border-slate-800"
            >
              <span className="text-[10px] sm:text-xs font-black uppercase tracking-wider text-slate-600 dark:text-slate-400">
                {d}
              </span>
            </div>
          ))}
          {matrix.map((day, idx) => {
            const today = isToday(day.date);
            const daySessions = filteredItems.filter((item) => {
              if (item.isClientEvent) return false;
              const d = getScheduleDate(item);
              return isSameDay(d, day.date);
            });
            const dayEvents = filteredItems.filter((item) => {
              if (!item.isClientEvent || item.isUnavailabilityEvent)
                return false;
              if (!item.date) return false;
              return eventCoversDay(item, day.date);
            });

            // Sort events: High priority first
            const sortedEvents = [...dayEvents].sort((a, b) => {
              const priorities: any = { High: 3, Medium: 2, Low: 1 };
              return priorities[b.priority] - priorities[a.priority];
            });

            // Heatmap color logic based on number of sessions
            let heatmapClass = "bg-white dark:bg-slate-900";
            let heatmapTextClass = "text-slate-900 dark:text-slate-100";
            if (day.current && daySessions.length > 0) {
              if (daySessions.length <= 2) {
                heatmapClass = "bg-sky-500/10 dark:bg-sky-500/20";
                heatmapTextClass = "text-sky-800 dark:text-sky-300 font-bold";
              } else if (daySessions.length <= 5) {
                heatmapClass = "bg-sky-500/25 dark:bg-sky-500/40";
                heatmapTextClass = "text-sky-950 dark:text-sky-100 font-black";
              } else {
                heatmapClass = "bg-[#0284c7] text-white";
                heatmapTextClass = "text-white font-black";
              }
            }

            return (
              <div
                key={`day-${idx}`}
                className={cn(
                  "min-h-18.75 sm:min-h-27.5 p-2 sm:p-3.5 transition-all group relative cursor-pointer flex flex-col justify-between select-none",
                  !day.current
                    ? "bg-slate-100/50 dark:bg-slate-950/40 opacity-50"
                    : heatmapClass,
                  today && "ring-2 ring-inset ring-[#38BDF8] z-10",
                )}
                onClick={() => {
                  if (day.current) {
                    setSelectedDate(day.date);
                    setViewMode("day");
                  }
                }}
              >
                <div className="flex justify-between items-start mb-1">
                  <span
                    className={cn(
                      "text-xs sm:text-sm font-black flex items-center justify-center rounded-full transition-all w-7 h-7 sm:w-8 sm:h-8",
                      today
                        ? "bg-[#38BDF8] text-slate-950 shadow-md font-black"
                        : !day.current
                          ? "text-slate-400 dark:text-slate-600"
                          : heatmapTextClass,
                    )}
                  >
                    {day.num}
                  </span>
                </div>

                {day.current && (
                  <div className="flex flex-col mt-auto gap-1.5">
                    {/* Render Events */}
                    {sortedEvents.map((evt, eIdx) => (
                      <div
                        key={`evt-${eIdx}`}
                        className={cn(
                          "px-1.5 py-0.5 sm:px-2 sm:py-1 rounded border shadow-sm truncate",
                          evt.priority === "High"
                            ? "border-[#F06C22] bg-[#F06C22]/10 text-[#F06C22]"
                            : cn(
                                "border-current/20 bg-transparent",
                                heatmapTextClass,
                              ),
                        )}
                        onClick={(e) => {
                          e.stopPropagation();
                          if (evt.clientId && onSelectClient && setView) {
                            onSelectClient(evt.clientId);
                            setView("profile");
                          }
                        }}
                      >
                        <span
                          className={cn(
                            "text-[10px] sm:text-[11px] font-bold uppercase tracking-tighter truncate w-full inline-block",
                            evt.priority === "High"
                              ? "text-[#F06C22]"
                              : heatmapTextClass,
                          )}
                        >
                          {evt.type === "Progress Report" ||
                          evt.type === "InBody Scan"
                            ? "Alert"
                            : evt.type}
                        </span>
                        <div
                          className={cn(
                            "text-[11px] sm:text-xs font-black truncate",
                            heatmapTextClass,
                          )}
                        >
                          {evt.clientName}
                        </div>
                      </div>
                    ))}
                    {/* Render Sessions Trainer Badges */}
                    {daySessions.length > 0 && (
                      <div className="flex flex-col gap-1 mt-1.5 w-full">
                        <span
                          className={cn(
                            "text-[10px] sm:text-xs font-black uppercase tracking-wider truncate block opacity-90",
                            heatmapTextClass,
                          )}
                        >
                          {daySessions.length}{" "}
                          {daySessions.length === 1 ? "Session" : "Sessions"}
                        </span>
                        <div className="flex flex-wrap gap-1 items-center mt-0.5">
                          {(() => {
                            const trainerGroupMap = new Map<
                              string,
                              {
                                trainerName: string;
                                count: number;
                                trainerObj?: Trainer;
                              }
                            >();

                            daySessions.forEach((s) => {
                              const matchedTrainer =
                                visibleCalendarTrainers.find((t) =>
                                  isTrainerMatch(s, t),
                                );
                              const key = matchedTrainer
                                ? matchedTrainer.id!
                                : (
                                    s.trainerName ||
                                    s.staffName ||
                                    s.StaffFirstName ||
                                    "Unassigned"
                                  ).trim();
                              const name = matchedTrainer
                                ? matchedTrainer.fullName
                                : s.trainerName ||
                                  s.staffName ||
                                  s.StaffFirstName ||
                                  "Staff";

                              if (!trainerGroupMap.has(key)) {
                                trainerGroupMap.set(key, {
                                  trainerName: name,
                                  count: 0,
                                  trainerObj: matchedTrainer,
                                });
                              }
                              trainerGroupMap.get(key)!.count += 1;
                            });

                            return Array.from(trainerGroupMap.entries()).map(
                              ([key, group]) => {
                                const initials = group.trainerName
                                  .substring(0, 2)
                                  .toUpperCase();
                                const first = group.trainerName.split(" ")[0];

                                return (
                                  <div
                                    key={key}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      if (group.trainerObj)
                                        setSelectedTrainerId(
                                          group.trainerObj.id!,
                                        );
                                    }}
                                    className="flex items-center gap-1.5 px-2 py-0.5 rounded-full border text-[10px] font-black uppercase tracking-tight transition-all shadow-md cursor-pointer hover:scale-105 bg-slate-900 text-white dark:bg-white dark:text-slate-950 border-slate-700 dark:border-slate-300"
                                    title={`${group.trainerName} (${group.count} session${group.count > 1 ? "s" : ""})`}
                                  >
                                    <span className="w-4 h-4 rounded-full bg-orange-500 text-white text-[9px] font-black flex items-center justify-center shrink-0 shadow-xs">
                                      {initials}
                                    </span>
                                    <span className="truncate max-w-16 font-extrabold text-white dark:text-slate-950">
                                      {first}
                                    </span>
                                    <span className="font-mono text-[10px] font-black text-amber-400 dark:text-orange-600">
                                      ({group.count})
                                    </span>
                                  </div>
                                );
                              },
                            );
                          })()}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  const renderWeek = () => {
    const weekDays = getWeekDays(selectedDate);
    const allSlots = dynamicSlots;

    // Bound the week by the studio's midnights; these filter real timestamps.
    const weekStart = studioDayBoundsForKey(
      calendarLabelKey(weekDays[0]),
    ).start;
    const weekEnd = studioDayBoundsForKey(calendarLabelKey(weekDays[6])).end;

    const activeSessions = filteredItems
      .filter((s) => !s.isClientEvent || s.isUnavailabilityEvent)
      .filter((s) => {
        const d = getScheduleDate(s);
        return d && d >= weekStart && d <= weekEnd;
      });

    return (
      <div className="flex flex-col gap-6">
        {/* Trainer Legend */}
        {visibleCalendarTrainers.length > 0 && (
          <div className="flex flex-wrap gap-3">
            {isAdmin && (
              <button
                onClick={() => setSelectedTrainerId("all")}
                className={cn(
                  "px-4 py-1.5 rounded-full text-[11px] font-black uppercase tracking-widest transition-all",
                  selectedTrainerId === "all"
                    ? "bg-primary text-primary-foreground"
                    : "bg-bg-dark-3 text-ink-d3 hover:bg-muted",
                )}
              >
                All Trainers
              </button>
            )}
            {visibleCalendarTrainers
              .filter((t) => isAdmin || t.id === authTrainer?.id)
              .map((trainer) => {
                const color =
                  TRAINER_COLORS[
                    visibleCalendarTrainers.indexOf(trainer) %
                      TRAINER_COLORS.length
                  ];
                const isSelected =
                  selectedTrainerId === trainer.id ||
                  selectedTrainerId === "all";

                return (
                  <button
                    key={trainer.id}
                    onClick={() =>
                      setSelectedTrainerId(
                        selectedTrainerId === trainer.id ? "all" : trainer.id!,
                      )
                    }
                    className={cn(
                      "flex items-center gap-2 px-3 py-1.5 rounded-full text-[11px] font-black uppercase tracking-widest transition-all border border-transparent",
                      isSelected
                        ? `${color.bg} ${color.text} border-current/20`
                        : "bg-bg-dark-3 text-ink-d3 opacity-50 hover:opacity-100 hover:grayscale-0 grayscale",
                    )}
                  >
                    <span
                      className={cn(
                        "w-2 h-2 rounded-full",
                        isSelected ? "bg-current" : "bg-slate-500",
                      )}
                    />
                    {trainer.fullName}
                  </button>
                );
              })}
          </div>
        )}

        <div className="bg-bg-dark border border-div-d rounded-[32px] overflow-x-auto no-scrollbar shadow-2xl">
          <table className="w-full border-collapse table-fixed min-w-200 sm:min-w-0">
            <thead>
              <tr className="border-b border-div-d">
                <th className="p-3 text-[11px] font-black uppercase tracking-widest text-ink-d3 border-r border-div-d w-14 bg-bg-dark-2/50 text-center">
                  Time
                </th>
                {weekDays.map((date, idx) => {
                  const active = isToday(date);
                  return (
                    <th
                      key={`week-day-${idx}`}
                      className={cn(
                        "p-4 text-center border-r border-div-d last:border-r-0",
                        active && "bg-white/5",
                      )}
                    >
                      <p
                        className={cn(
                          "text-[11px] font-black uppercase tracking-widest",
                          active ? "text-ink-d1" : "text-ink-d3",
                        )}
                      >
                        {date.toLocaleDateString("en-US", {
                          weekday: "short",
                        })}
                      </p>
                      <p
                        className={cn(
                          "text-2xl font-black mt-1 leading-none",
                          active ? "text-[#38BDF8]" : "text-ink-d1",
                        )}
                      >
                        {date.getDate()}
                      </p>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {/* All-Day Events Row */}
              <tr className="border-b-2 border-div-d bg-bg-dark-2/40">
                <td className="p-3 text-center border-r border-div-d">
                  <span className="text-[11px] font-black uppercase tracking-widest text-ink-d3">
                    Events
                  </span>
                </td>
                {weekDays.map((date, dIdx) => {
                  const dayEvents = filteredItems.filter((i) => {
                    if (!i.isClientEvent || i.isUnavailabilityEvent)
                      return false;
                    if (!i.date) return false;
                    return eventCoversDay(i, date);
                  });
                  // Sort: High priority first
                  const sortedEvents = dayEvents.sort((a, b) => {
                    const priorities: any = { High: 3, Medium: 2, Low: 1 };
                    return priorities[b.priority] - priorities[a.priority];
                  });

                  return (
                    <td
                      key={`week-evt-${dIdx}`}
                      className="p-1 border-r border-div-d align-top relative"
                    >
                      <div className="flex flex-col gap-1">
                        {sortedEvents.map((evt, eIdx) => (
                          <div
                            key={`wevt-${eIdx}`}
                            className={cn(
                              "px-2 py-1 rounded border shadow-sm truncate cursor-pointer transition-all hover:scale-105",
                              evt.priority === "High"
                                ? "border-[#F06C22] bg-[#F06C22]/10 text-red-100"
                                : "border-div-d bg-transparent text-slate-300",
                            )}
                            onClick={(e) => {
                              e.stopPropagation();
                              if (evt.clientId && onSelectClient && setView) {
                                onSelectClient(evt.clientId);
                                setView("profile");
                              }
                            }}
                          >
                            <span
                              className={cn(
                                "text-[11px] font-bold uppercase tracking-tighter truncate w-full inline-block",
                                evt.priority === "High"
                                  ? "text-[#F06C22]"
                                  : "text-ink-d3",
                              )}
                            >
                              {evt.type === "Progress Report" ||
                              evt.type === "InBody Scan"
                                ? "Alert"
                                : evt.type}
                            </span>
                            <div className="text-[11px] font-black truncate">
                              {evt.clientName}
                            </div>
                          </div>
                        ))}
                      </div>
                    </td>
                  );
                })}
              </tr>

              {(() => {
                const skippedWeekCells = new Set<string>();
                return allSlots.map((slot, sIdx) => {
                  const isGap = slot === "15:00" && sIdx > 0;
                  return (
                    <React.Fragment key={`week-slot-${slot}-${sIdx}`}>
                      {isGap && (
                        <tr className="bg-bg-dark-2/50 h-8 border-y border-div-d">
                          <td colSpan={8} className="text-center border-div-d">
                            <span className="text-[11px] font-black uppercase tracking-[0.3em] text-slate-600">
                              Midday Gap
                            </span>
                          </td>
                        </tr>
                      )}
                      <tr className="border-b border-div-d last:border-0 hover:bg-white/2 transition-colors group">
                        <td className="p-3 text-center border-r border-div-d bg-bg-dark-2/20 group-hover:bg-bg-dark-2/40">
                          <span className="text-[11px] font-black tracking-tight text-ink-d3">
                            {slot}
                          </span>
                        </td>
                        {weekDays.map((date, dIdx) => {
                          const cellId = `${dIdx}-${slot}`;
                          if (skippedWeekCells.has(cellId)) return null;

                          const daySessions = activeSessions.filter((s) => {
                            const d = getScheduleDate(s);
                            if (!d) return false;
                            const tStr = getSlotHeader(d);
                            return isSameDay(d, date) && tStr === slot;
                          });

                          const active = isToday(date);

                          let maxRowSpan = 1;
                          if (daySessions.length > 0) {
                            const calculatedSpans = daySessions.map((s) => {
                              const start = getScheduleDate(s);
                              const end = getScheduleEndDate(s);
                              if (start && end) {
                                const duration =
                                  (end.getTime() - start.getTime()) /
                                  (1000 * 60);
                                return Math.max(1, Math.round(duration / 30));
                              }
                              return 1;
                            });
                            const maxSpan = Math.max(...calculatedSpans);

                            let canExpand = maxSpan > 1;
                            for (let i = 1; i < maxSpan; i++) {
                              const nextSlot = allSlots[sIdx + i];
                              if (!nextSlot) {
                                canExpand = false;
                                break;
                              }
                              const hasSessionInNextSlot = activeSessions.some(
                                (s) => {
                                  const d = getScheduleDate(s);
                                  if (!d) return false;
                                  const tStr = getSlotHeader(d);
                                  return (
                                    isSameDay(d, date) && tStr === nextSlot
                                  );
                                },
                              );
                              if (hasSessionInNextSlot) {
                                canExpand = false;
                                break;
                              }
                            }

                            if (canExpand) {
                              maxRowSpan = maxSpan;
                              for (let i = 1; i < maxRowSpan; i++) {
                                if (allSlots[sIdx + i]) {
                                  skippedWeekCells.add(
                                    `${dIdx}-${allSlots[sIdx + i]}`,
                                  );
                                }
                              }
                            }
                          }

                          return (
                            <td
                              key={`week-cell-${dIdx}-${slot}`}
                              rowSpan={maxRowSpan}
                              className={cn(
                                "p-1.5 border-r border-div-d last:border-r-0 align-top relative",
                                active ? "bg-white/2" : "",
                                daySessions.length === 0
                                  ? "hover:bg-bg-dark-3/30"
                                  : "",
                                maxRowSpan > 1 ? "" : "min-h-15",
                              )}
                              onClick={() => {
                                setSelectedDate(date);
                                setViewMode("day");
                              }}
                            >
                              <div className="flex flex-col gap-1.5 h-full">
                                {daySessions.length === 0 && (
                                  <div className="absolute inset-2 border-2 border-dashed border-div-d/30 rounded-xl pointer-events-none" />
                                )}
                                {daySessions.map((session, sessIdx) => {
                                  const isUnavail =
                                    session.isUnavailabilityEvent ||
                                    session.clientName
                                      ?.toLowerCase()
                                      .includes("unavailab");
                                  const tId = getTrainerIdForSession(session);
                                  const trainerIdx =
                                    visibleCalendarTrainers.findIndex(
                                      (t) => t.id === tId,
                                    );
                                  const trainer =
                                    trainerIdx !== -1
                                      ? visibleCalendarTrainers[trainerIdx]
                                      : null;
                                  const color = trainer
                                    ? TRAINER_COLORS[
                                        trainerIdx % TRAINER_COLORS.length
                                      ]
                                    : TRAINER_COLORS[0];

                                  const isTrainerSelected =
                                    selectedTrainerId === "all" ||
                                    (tId && tId === selectedTrainerId);

                                  const formatClientName = (
                                    fullName: string,
                                  ) => {
                                    if (!fullName) return "Unknown";
                                    if (
                                      fullName
                                        .toLowerCase()
                                        .includes("unavailab")
                                    )
                                      return "Unavailable";
                                    const parts = fullName.trim().split(" ");
                                    if (parts.length > 1) {
                                      return `${parts[0]} ${parts[parts.length - 1][0]}.`;
                                    }
                                    return parts[0];
                                  };
                                  const formattedName = isUnavail
                                    ? "Unavailable"
                                    : formatClientName(
                                        session.clientName || "",
                                      );

                                  return (
                                    <div
                                      key={session.id || `sess-${sessIdx}`}
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        if (!isUnavail)
                                          handleClientClick(session);
                                      }}
                                      className={cn(
                                        "flex flex-col overflow-hidden p-1.5 rounded-xl border shadow-sm transition-all relative",
                                        isUnavail
                                          ? "bg-[repeating-linear-gradient(45deg,#0a2e46,#0a2e46_10px,#0f172a_10px,#0f172a_20px)] border-2 border-div-d cursor-not-allowed opacity-90 text-ink-d3"
                                          : cn(
                                              isTrainerSelected
                                                ? `${color.border} opacity-100 hover:brightness-125`
                                                : "border-div-d opacity-20 grayscale",
                                              "border-l-4",
                                              color.bg,
                                            ),
                                        maxRowSpan > 1 ? "grow" : "",
                                      )}
                                    >
                                      <span className="text-[11px] text-ink-d1/90 font-medium leading-none mb-1 whitespace-nowrap text-ellipsis overflow-hidden">
                                        {slot}
                                      </span>
                                      <span
                                        className="text-xs font-bold text-ink-d1 truncate whitespace-nowrap text-ellipsis leading-none"
                                        title={
                                          isUnavail
                                            ? "Unavailable"
                                            : session.clientName
                                        }
                                      >
                                        {formattedName}
                                      </span>
                                    </div>
                                  );
                                })}
                              </div>
                            </td>
                          );
                        })}
                      </tr>
                    </React.Fragment>
                  );
                });
              })()}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  const renderDay = () => {
    const slots =
      shiftMode === "AM"
        ? amSlots
        : shiftMode === "PM"
          ? pmSlots
          : dynamicSlots;
    const filteredTrainers =
      selectedTrainerId === "all"
        ? visibleCalendarTrainers
        : visibleCalendarTrainers.filter((t) => t.id === selectedTrainerId);

    // Calculate current time indicator position
    const now = new Date();
    const isTodaySelected = isToday(selectedDate);
    const timeToPosition = (date: Date) => {
      if (!isTodaySelected) return null;

      // The "now" indicator has to sit on the studio clock like everything else.
      const hm = zonedHM(date);
      const totalMins = hm ? hm.hour * 60 + hm.minute : 0;

      const shiftStartMins = shiftMode === "PM" ? 14 * 60 : 6 * 60;
      const shiftEndMins = shiftMode === "AM" ? 14 * 60 : 21 * 60;

      if (totalMins < shiftStartMins || totalMins > shiftEndMins) return null;

      const minsFromStart = totalMins - shiftStartMins;
      const totalShiftMins = shiftEndMins - shiftStartMins;

      // Return percentage from top for the time indicator
      return (minsFromStart / totalShiftMins) * 100;
    };
    const currentTimePos = timeToPosition(now);

    return (
      <div className="flex flex-col h-[80vh]">
        {/* Schedule Grid */}
        <div className="grow flex flex-col bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-[24px] sm:rounded-[32px] overflow-hidden shadow-2xl relative">
          <div className="flex items-center justify-center p-3 sm:p-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50">
            <div className="flex bg-slate-100 dark:bg-slate-900 p-1 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm gap-1">
              <button
                onClick={() => setShiftMode("ALL")}
                className={cn(
                  "px-3 sm:px-5 py-1.5 sm:py-2 rounded-lg text-[10px] sm:text-xs font-black uppercase tracking-widest transition-all cursor-pointer",
                  shiftMode === "ALL"
                    ? "bg-[#0284c7] text-white shadow-sm font-black"
                    : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white",
                )}
              >
                All Day
              </button>
              <button
                onClick={() => setShiftMode("AM")}
                className={cn(
                  "px-3 sm:px-5 py-1.5 sm:py-2 rounded-lg text-[10px] sm:text-xs font-black uppercase tracking-widest transition-all cursor-pointer",
                  shiftMode === "AM"
                    ? "bg-[#0284c7] text-white shadow-sm font-black"
                    : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white",
                )}
              >
                AM Shift
              </button>
              <button
                onClick={() => setShiftMode("PM")}
                className={cn(
                  "px-3 sm:px-5 py-1.5 sm:py-2 rounded-lg text-[10px] sm:text-xs font-black uppercase tracking-widest transition-all cursor-pointer",
                  shiftMode === "PM"
                    ? "bg-[#0284c7] text-white shadow-sm font-black"
                    : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white",
                )}
              >
                PM Shift
              </button>
            </div>
          </div>

          <div className="overflow-x-auto grow relative">
            <div className="min-w-200 h-full relative">
              {currentTimePos !== null && (
                <div
                  className="absolute left-14 sm:left-16 right-0 border-t-2 border-[#F06C22] z-20 pointer-events-none shadow-[0_0_15px_rgba(240,108,34,0.6)]"
                  style={{
                    top: `calc(80px + (100% - 80px) * ${currentTimePos} / 100)`,
                  }}
                >
                  <div className="absolute left-0 top-1/2 -translate-y-1/2 bg-[#F06C22] text-slate-950 text-[9px] sm:text-[11px] font-black uppercase px-2 py-1 rounded-r-md tracking-widest flex items-center shadow-md">
                    <span className="w-2 h-2 rounded-full bg-white mr-1.5 animate-pulse"></span>
                    Current Time
                  </div>
                </div>
              )}
              <table className="w-full border-collapse table-fixed h-full">
                <thead>
                  <tr className="bg-slate-100/90 dark:bg-slate-900/90 border-b border-slate-200 dark:border-slate-800 h-16 sm:h-20">
                    <th className="p-3 sm:p-4 text-[10px] sm:text-[11px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400 border-r border-slate-200 dark:border-slate-800 w-14 sm:w-16 sticky left-0 bg-slate-100 dark:bg-slate-900 z-30">
                      Time
                    </th>
                    {filteredTrainers.map((trainer) => {
                      const trainerSessionCount = normalSchedules.filter(
                        (s) => {
                          const d = getScheduleDate(s);
                          if (!d) return false;
                          return (
                            isSameDay(d, selectedDate) &&
                            isTrainerMatch(s, trainer)
                          );
                        },
                      ).length;

                      return (
                        <th
                          key={trainer.id}
                          className="p-3 sm:p-4 border-r border-slate-200 dark:border-slate-800 last:border-r-0 text-center z-20 sticky top-0 bg-slate-100/90 dark:bg-slate-900/90 backdrop-blur-md"
                        >
                          <div className="flex flex-col items-center gap-1">
                            <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-sky-500/10 border-2 border-slate-200 dark:border-slate-700 flex items-center justify-center text-[#0284c7] dark:text-[#38BDF8] font-black text-xs sm:text-sm shadow-xs">
                              {trainer.initials}
                            </div>
                            <span className="text-[10px] sm:text-xs font-black uppercase tracking-wider text-slate-900 dark:text-white mt-1">
                              {trainer.fullName}
                            </span>
                            <div className="bg-sky-500/10 text-[#0284c7] dark:text-[#38BDF8] px-2 py-0.5 rounded-full flex items-center gap-1 leading-none mt-0.5 border border-sky-500/20">
                              <span className="text-[10px] font-extrabold tracking-widest whitespace-nowrap uppercase">
                                {trainerSessionCount} Sess.
                              </span>
                            </div>
                          </div>
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody className="relative">
                  {/* Events Row */}
                  <tr className="border-b-2 border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-900/40">
                    <td className="p-2 sm:p-3 text-center border-r border-slate-200 dark:border-slate-800 sticky left-0 bg-slate-50 dark:bg-slate-900 z-10 text-slate-500 dark:text-slate-400">
                      <span className="text-[10px] sm:text-[11px] font-black uppercase tracking-widest">
                        Events
                      </span>
                    </td>
                    <td colSpan={filteredTrainers.length} className="p-1.5">
                      <div className="flex flex-wrap gap-1.5 sm:gap-2">
                        {(() => {
                          const dayEvents = filteredItems.filter((i) => {
                            if (!i.isClientEvent || i.isUnavailabilityEvent)
                              return false;
                            if (!i.date) return false;
                            return eventCoversDay(i, selectedDate);
                          });
                          const sortedEvents = dayEvents.sort((a, b) => {
                            const priorities: any = {
                              High: 3,
                              Medium: 2,
                              Low: 1,
                            };
                            return (
                              priorities[b.priority] - priorities[a.priority]
                            );
                          });
                          return sortedEvents.map((evt, eIdx) => (
                            <div
                              key={`devt-${eIdx}`}
                              className={cn(
                                "px-2.5 py-1 rounded-lg border shadow-sm flex items-center gap-2 cursor-pointer transition-all hover:scale-105",
                                evt.priority === "High"
                                  ? "border-[#F06C22] bg-[#F06C22]/10 text-slate-900 dark:text-white"
                                  : evt.priority === "Medium"
                                    ? "border-amber-500 bg-amber-500/10 text-slate-900 dark:text-white"
                                    : "border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200",
                              )}
                              onClick={(e) => {
                                e.stopPropagation();
                                if (evt.clientId && onSelectClient && setView) {
                                  onSelectClient(evt.clientId);
                                  setView("profile");
                                }
                              }}
                            >
                              <span
                                className={cn(
                                  "text-[9px] sm:text-[11px] font-black uppercase tracking-widest",
                                  evt.priority === "High"
                                    ? "text-[#F06C22]"
                                    : evt.priority === "Medium"
                                      ? "text-amber-500"
                                      : "text-slate-500 dark:text-slate-400",
                                )}
                              >
                                {evt.type === "Progress Report" ||
                                evt.type === "InBody Scan"
                                  ? "Alert"
                                  : evt.type}
                              </span>
                              <span className="text-xs sm:text-sm font-black text-slate-900 dark:text-white">
                                {evt.clientName}
                              </span>
                            </div>
                          ));
                        })()}
                      </div>
                    </td>
                  </tr>

                  {(() => {
                    const skippedCells = new Set<string>();
                    return slots.map((slot, sIdx) => {
                      return (
                        <tr
                          key={slot}
                          className="border-b border-slate-200 dark:border-slate-800/80 last:border-0 hover:bg-slate-50/50 dark:hover:bg-slate-900/30 transition-colors group relative"
                        >
                          <td className="p-3 text-center border-r border-slate-200 dark:border-slate-800 sticky left-0 bg-white dark:bg-slate-950 z-10 text-slate-500 dark:text-slate-400">
                            <span className="text-[11px] font-black tracking-tight group-hover:text-slate-900 dark:group-hover:text-white transition-colors">
                              {slot}
                            </span>
                          </td>
                          {filteredTrainers.map((trainer) => {
                            const cellId = `${trainer.id}-${slot}`;
                            if (skippedCells.has(cellId)) return null;

                            const cellSessions = filteredItems.filter((s) => {
                              if (s.isClientEvent && !s.isUnavailabilityEvent)
                                return false;
                              const d = getScheduleDate(s);
                              if (!d) return false;
                              const tStr = getSlotHeader(d);
                              return (
                                isSameDay(d, selectedDate) &&
                                tStr === slot &&
                                isTrainerMatch(s, trainer)
                              );
                            });

                            const trainerIdx =
                              visibleCalendarTrainers.indexOf(trainer);
                            const color =
                              TRAINER_COLORS[
                                trainerIdx % TRAINER_COLORS.length
                              ];

                            let rowSpan = 1;
                            if (cellSessions.length === 1) {
                              const session = cellSessions[0];
                              const start = getScheduleDate(session);
                              const end = getScheduleEndDate(session);
                              if (start && end) {
                                const duration =
                                  (end.getTime() - start.getTime()) /
                                  (1000 * 60);
                                const calculatedSpan = Math.max(
                                  1,
                                  Math.round(duration / 30),
                                );

                                let canExpand = calculatedSpan > 1;
                                for (let i = 1; i < calculatedSpan; i++) {
                                  const nextSlot = slots[sIdx + i];
                                  if (!nextSlot) {
                                    canExpand = false;
                                    break;
                                  }
                                  const hasOtherSessionStarting =
                                    filteredItems.some((s) => {
                                      if (
                                        s.isClientEvent &&
                                        !s.isUnavailabilityEvent
                                      )
                                        return false;
                                      const d = getScheduleDate(s);
                                      if (!d) return false;
                                      const tStr = getSlotHeader(d);
                                      return (
                                        isSameDay(d, selectedDate) &&
                                        tStr === nextSlot &&
                                        isTrainerMatch(s, trainer)
                                      );
                                    });
                                  if (hasOtherSessionStarting) {
                                    canExpand = false;
                                    break;
                                  }
                                }

                                if (canExpand) {
                                  rowSpan = calculatedSpan;
                                  for (let i = 1; i < rowSpan; i++) {
                                    if (slots[sIdx + i]) {
                                      skippedCells.add(
                                        `${trainer.id}-${slots[sIdx + i]}`,
                                      );
                                    }
                                  }
                                }
                              }
                            }

                            return (
                              <td
                                key={`${trainer.id}-${slot}`}
                                rowSpan={rowSpan}
                                className={cn(
                                  "p-1 border-r border-slate-200 dark:border-slate-800 last:border-r-0 align-top",
                                  rowSpan > 1 ? "" : "h-15",
                                )}
                              >
                                {cellSessions.length > 0 ? (
                                  <div className="flex flex-col gap-1.5 h-full w-full">
                                    {cellSessions.map((session, csIdx) => {
                                      const isUnavail =
                                        session.isUnavailabilityEvent ||
                                        session.clientName
                                          ?.toLowerCase()
                                          .includes("unavailab");
                                      return (
                                        <div
                                          key={
                                            session.id ||
                                            session.mindbodyAppointmentId ||
                                            csIdx
                                          }
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            if (!isUnavail)
                                              handleClientClick(session);
                                          }}
                                          className={cn(
                                            "p-3 rounded-xl flex flex-col gap-0.5 hover:scale-[1.02] transition-all cursor-pointer shadow-md flex-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800",
                                            isUnavail
                                              ? "bg-slate-200 dark:bg-slate-800 border-2 border-slate-300 dark:border-slate-700 text-slate-500 cursor-not-allowed opacity-90"
                                              : cn("border-l-4", color.border),
                                          )}
                                        >
                                          <div className="flex justify-between items-start mb-1">
                                            <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 tabular-nums leading-none tracking-tight">
                                              {slot} -{" "}
                                              {session.endTime
                                                ? getSlotHeader(
                                                    safeToDate(session.endTime),
                                                  )
                                                : "30m"}
                                            </span>
                                            {rowSpan > 1 && !isUnavail && (
                                              <Badge
                                                variant="outline"
                                                className="text-[10px] h-4 bg-sky-500/10 border-sky-500/30 text-[#0284c7] dark:text-[#38BDF8] font-bold"
                                              >
                                                {Math.round(
                                                  (safeToDate(
                                                    session.endTime ||
                                                      session.endDate,
                                                  ).getTime() -
                                                    safeToDate(
                                                      session.startTime ||
                                                        session.date,
                                                    ).getTime()) /
                                                    60000,
                                                )}
                                                m
                                              </Badge>
                                            )}
                                          </div>
                                          <span className="text-xs sm:text-sm font-black truncate text-slate-900 dark:text-white leading-tight">
                                            {isUnavail
                                              ? "Unavailable"
                                              : session.clientName}
                                          </span>
                                          {rowSpan > 1 &&
                                            session.serviceName &&
                                            !isUnavail && (
                                              <span className="text-[11px] text-slate-500 dark:text-slate-400 font-medium mt-1 truncate">
                                                {session.serviceName}
                                              </span>
                                            )}
                                        </div>
                                      );
                                    })}
                                  </div>
                                ) : (
                                  <div className="h-full w-full opacity-0 hover:opacity-100 transition-all flex items-center justify-center p-2 bg-slate-100/90 dark:bg-slate-800/90 border border-dashed border-slate-300 dark:border-slate-700 rounded-xl cursor-pointer shadow-sm">
                                    <span className="text-[11px] font-black uppercase tracking-widest text-[#0284c7] dark:text-[#38BDF8]">
                                      OPEN
                                    </span>
                                  </div>
                                )}
                              </td>
                            );
                          })}
                        </tr>
                      );
                    });
                  })()}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-4 sm:space-y-8 pb-12 w-full overflow-x-hidden p-3 sm:p-8 bg-white dark:bg-slate-950 min-h-screen rounded-[24px] sm:rounded-[40px] border border-slate-200 dark:border-slate-800 shadow-2xl relative">
      <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4 sm:gap-6 relative z-10 pb-2 border-b border-slate-100 dark:border-slate-800/80">
        <div className="flex items-center gap-3 sm:gap-5">
          <div className="w-10 h-10 sm:w-14 sm:h-14 bg-slate-100 dark:bg-slate-900 rounded-2xl flex items-center justify-center shadow-inner border border-slate-200 dark:border-slate-800 shrink-0">
            <CalendarIcon className="w-5 h-5 sm:w-7 sm:h-7 text-[#0284c7] dark:text-[#38BDF8]" />
          </div>
          <div>
            <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
              <h2 className="text-xl sm:text-3xl font-black tracking-tight uppercase italic text-slate-900 dark:text-white leading-none">
                {viewMode === "month"
                  ? "Month View"
                  : viewMode === "week"
                    ? "Week View"
                    : "Day View"}
              </h2>
              <Badge
                variant="outline"
                className="text-[9px] sm:text-[11px] font-black h-5 px-2 tracking-widest border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-900 uppercase not-italic shrink-0"
              >
                Read Only
              </Badge>
            </div>
            <p className="text-slate-500 dark:text-slate-400 font-black uppercase text-[9px] sm:text-[11px] tracking-[0.15em] sm:tracking-[0.2em] mt-1 border-l-2 border-[#38BDF8] pl-2 leading-none">
              {viewMode === "month"
                ? selectedDate.toLocaleDateString(undefined, {
                    month: "long",
                    year: "numeric",
                  })
                : viewMode === "week"
                  ? `${getWeekDays(selectedDate)[0].toLocaleDateString(undefined, { month: "short", day: "numeric" })} - ${getWeekDays(selectedDate)[6].toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}`
                  : selectedDate.toLocaleDateString(undefined, {
                      month: "long",
                      day: "numeric",
                      year: "numeric",
                      weekday: "long",
                    })}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 sm:gap-3 shrink-0">
          <div className="flex bg-slate-100 dark:bg-slate-900 p-1 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs shrink-0">
            <button
              onClick={() => setFilterMode("all")}
              className={cn(
                "px-2.5 sm:px-3.5 py-1 rounded-lg text-[9px] sm:text-[11px] font-black uppercase tracking-wider transition-all cursor-pointer",
                filterMode === "all"
                  ? "bg-[#0284c7] text-white shadow-xs"
                  : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white",
              )}
            >
              View All
            </button>
            <button
              onClick={() => setFilterMode("sessions")}
              className={cn(
                "px-2.5 sm:px-3.5 py-1 rounded-lg text-[9px] sm:text-[11px] font-black uppercase tracking-wider transition-all cursor-pointer",
                filterMode === "sessions"
                  ? "bg-[#0284c7] text-white shadow-xs"
                  : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white",
              )}
            >
              Sessions
            </button>
            <button
              onClick={() => setFilterMode("events")}
              className={cn(
                "px-2.5 sm:px-3.5 py-1 rounded-lg text-[9px] sm:text-[11px] font-black uppercase tracking-wider transition-all cursor-pointer",
                filterMode === "events"
                  ? "bg-[#0284c7] text-white shadow-xs"
                  : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white",
              )}
            >
              Events
            </button>
          </div>

          <div className="flex bg-slate-100 dark:bg-slate-900 p-1 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs shrink-0">
            <Button
              size="sm"
              onClick={() => setViewMode("month")}
              className={cn(
                "rounded-lg font-black uppercase text-[9px] sm:text-[11px] tracking-wider px-2.5 sm:px-3.5 h-7 transition-all cursor-pointer",
                viewMode === "month"
                  ? "bg-[#0284c7] text-white shadow-xs"
                  : "bg-transparent text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white",
              )}
            >
              Month
            </Button>
            <Button
              size="sm"
              onClick={() => setViewMode("week")}
              className={cn(
                "rounded-lg font-black uppercase text-[9px] sm:text-[11px] tracking-wider px-2.5 sm:px-3.5 h-7 transition-all cursor-pointer",
                viewMode === "week"
                  ? "bg-[#0284c7] text-white shadow-xs"
                  : "bg-transparent text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white",
              )}
            >
              Week
            </Button>
            <Button
              size="sm"
              onClick={() => setViewMode("day")}
              className={cn(
                "rounded-lg font-black uppercase text-[9px] sm:text-[11px] tracking-wider px-2.5 sm:px-3.5 h-7 transition-all cursor-pointer",
                viewMode === "day"
                  ? "bg-[#0284c7] text-white shadow-xs"
                  : "bg-transparent text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white",
              )}
            >
              Day
            </Button>
          </div>

          <div className="flex items-center bg-slate-100 dark:bg-slate-900 px-3 py-1 rounded-xl border border-slate-200 dark:border-slate-800 gap-2 shadow-xs shrink-0 h-9">
            <Users className="w-3.5 h-3.5 text-[#0284c7] dark:text-[#38BDF8] shrink-0" />
            <Select
              value={selectedTrainerId}
              onValueChange={setSelectedTrainerId}
            >
              <SelectTrigger className="h-6 border-none bg-transparent focus:ring-0 text-[10px] sm:text-[11px] font-black uppercase tracking-wider min-w-24 p-0 shadow-none text-slate-900 dark:text-white hover:text-[#0284c7] dark:hover:text-[#38BDF8] transition-colors">
                <SelectValue placeholder="Team Filter">
                  {selectedTrainerId === "all"
                    ? "Entire Team"
                    : trainers.find((t) => t.id === selectedTrainerId)
                        ?.fullName ||
                      visibleCalendarTrainers.find(
                        (t) => t.id === selectedTrainerId,
                      )?.fullName ||
                      selectedTrainerId}
                </SelectValue>
              </SelectTrigger>
              <SelectContent className="rounded-xl border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-900 dark:text-white max-h-64">
                <SelectItem
                  value="all"
                  className="font-bold focus:bg-slate-100 dark:focus:bg-slate-800 text-xs"
                >
                  Entire Team
                </SelectItem>
                {trainers.map((t) => (
                  <SelectItem
                    key={t.id}
                    value={t.id!}
                    className="font-bold focus:bg-slate-100 dark:focus:bg-slate-800 text-xs"
                  >
                    {t.fullName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-900 p-1 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs shrink-0 h-9">
            <Button
              variant="ghost"
              size="icon"
              onClick={handlePrev}
              className="rounded-lg h-7 w-7 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-800 shrink-0 cursor-pointer"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
            </Button>
            <Button
              variant="ghost"
              onClick={() => setSelectedDate(new Date())}
              className="rounded-lg font-black uppercase text-[10px] sm:text-[11px] tracking-wider px-3 h-7 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-800 cursor-pointer"
            >
              Today
            </Button>
            <Button
              variant="ghost"
              onClick={handleNext}
              className="rounded-lg h-7 w-7 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-800 shrink-0 cursor-pointer"
            >
              <ChevronRight className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={viewMode + selectedDate.toISOString() + selectedTrainerId}
          initial={{ opacity: 0, y: 5 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -5 }}
          transition={{ duration: 0.15 }}
          className="relative z-10"
        >
          {viewMode === "month" && renderMonth()}
          {viewMode === "week" && renderWeek()}
          {viewMode === "day" && renderDay()}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
