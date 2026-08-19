import React, { useState, useEffect } from "react";
import {
  Search,
  Plus,
  Activity,
  Calendar,
  Users,
  CheckCircle2,
  History,
  Play,
  Loader2,
  RefreshCw,
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import {
  collection,
  query,
  where,
  limit,
  getDocs,
  updateDoc,
  doc,
} from "firebase/firestore";
import { db } from "../firebase";
import { Client, Trainer, View, WorkoutSession } from "../types";
import { isFuzzyNameMatch } from "../lib/sync-utils";
import {
  zonedHM,
  studioHour,
  calendarLabelKey,
  studioDayBoundsForKey,
  studioDateKey,
} from "../lib/studio-time";
import {
  safeToDate,
  getMillis,
  isSessionValid,
  parseSessionDate,
} from "../lib/utils";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";

export function ClientsView({
  clients,
  trainers,
  sortedTrainers,
  activeStudioId,
  onSelectClient,
  onStartNewClientOnboarding,
  setView,
  schedules,
  sessions,
  editingClient,
  setEditingClient,
  formData,
  setFormData,
  onSubmit,
  setSelectedSessionId,
  handleRefreshSchedule,
  isRefreshingSchedule,
}: {
  clients: Client[];
  trainers: Trainer[];
  sortedTrainers: Trainer[];
  isAdmin: boolean;
  activeStudioId: string;
  authTrainer: Trainer | null;
  onSelectClient: (id: string) => void;
  onStartNewClientOnboarding?: (name: string, scheduleInfo?: { scheduleId: string; clientName: string }) => void;
  setView: (v: View) => void;
  schedules: any[];
  sessions: WorkoutSession[];
  editingClient: Client | null;
  setEditingClient: (c: Client | null) => void;
  formData: any;
  setFormData: (f: any) => void;
  onSubmit: (e: React.FormEvent) => void;
  startEdit: (c: Client) => void;
  updateSessions: (id: string, current: number, delta: number) => void;
  setSelectedSessionId: (id: string | null) => void;
  onSelectTrainer?: (id: string) => void;
  handleRefreshSchedule: () => Promise<void>;
  isRefreshingSchedule: boolean;
}) {
  const [searchTerm, setSearchTerm] = useState("");
  const [dbSearchResults, setDbSearchResults] = useState<Client[]>([]);
  const [isSearchingDb, setIsSearchingDb] = useState(false);

  const [activeTab, setActiveTab] = useState<"morning" | "afternoon">(() => {
    return (studioHour(new Date()) ?? 0) >= 12 ? "afternoon" : "morning";
  });
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [linkingSession, setLinkingSession] = useState<any | null>(null);
  const [isLinking, setIsLinking] = useState(false);
  const [searchTermLink, setSearchTermLink] = useState("");
  const [dbSearchResultsLink, setDbSearchResultsLink] = useState<Client[]>([]);
  const [isSearchingDbLink, setIsSearchingDbLink] = useState(false);
  const [currentTime, setCurrentTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 60000);
    return () => clearInterval(timer);
  }, []);

  // Sync / search database in real-time when trainer searches on main screen
  useEffect(() => {
    if (!searchTerm.trim()) {
      setDbSearchResults([]);
      return;
    }
    const fetchClients = async () => {
      setIsSearchingDb(true);
      try {
        const term = searchTerm.trim().toLowerCase();
        const alphaOnly = term.replace(/[^a-z]/g, "");
        const prefixLen = alphaOnly.length > 3 ? 3 : alphaOnly.length;
        const prefix = alphaOnly.slice(0, prefixLen);
        const prefixCapitalized =
          prefix.charAt(0).toUpperCase() + prefix.slice(1);

        if (!prefixCapitalized) {
          setDbSearchResults([]);
          return;
        }

        const clientsRef = collection(db, "clients");
        const q1 = query(
          clientsRef,
          where("firstName", ">=", prefixCapitalized),
          where("firstName", "<=", prefixCapitalized + "\uf8ff"),
          limit(30),
        );
        const q2 = query(
          clientsRef,
          where("lastName", ">=", prefixCapitalized),
          where("lastName", "<=", prefixCapitalized + "\uf8ff"),
          limit(30),
        );

        const [snap1, snap2] = await Promise.all([getDocs(q1), getDocs(q2)]);
        const uniqueDocs = new Map<string, any>();
        [...snap1.docs, ...snap2.docs].forEach((d) => {
          uniqueDocs.set(d.id, { id: d.id, ...d.data() });
        });

        const candidates = Array.from(uniqueDocs.values());
        const fetched = candidates.filter((c) => {
          const first = (c.firstName || "").toLowerCase();
          const last = (c.lastName || "").toLowerCase();
          const full = `${first} ${last}`;
          const mb = (c.mindbody_name || "").toLowerCase();

          return (
            first.includes(term) ||
            last.includes(term) ||
            full.includes(term) ||
            mb.includes(term) ||
            term.includes(first) ||
            term.includes(last) ||
            isFuzzyNameMatch(
              term,
              c.firstName || "",
              c.lastName || "",
              c.mindbody_name,
            )
          );
        });

        setDbSearchResults(fetched);
      } catch (err) {
        console.error("Error searching matching clients in main search:", err);
      } finally {
        setIsSearchingDb(false);
      }
    };

    const delayDebounceFn = setTimeout(() => {
      fetchClients();
    }, 300);

    return () => clearTimeout(delayDebounceFn);
  }, [searchTerm]);

  // Sync / search database in real-time when trainer searches on Link Client Dialog
  useEffect(() => {
    if (!searchTermLink.trim()) {
      setDbSearchResultsLink([]);
      return;
    }
    const fetchClientsLink = async () => {
      setIsSearchingDbLink(true);
      try {
        const term = searchTermLink.trim().toLowerCase();
        const alphaOnly = term.replace(/[^a-z]/g, "");
        const prefixLen = alphaOnly.length > 3 ? 3 : alphaOnly.length;
        const prefix = alphaOnly.slice(0, prefixLen);
        const prefixCapitalized =
          prefix.charAt(0).toUpperCase() + prefix.slice(1);

        if (!prefixCapitalized) {
          setDbSearchResultsLink([]);
          return;
        }

        const clientsRef = collection(db, "clients");
        const q1 = query(
          clientsRef,
          where("firstName", ">=", prefixCapitalized),
          where("firstName", "<=", prefixCapitalized + "\uf8ff"),
          limit(30),
        );
        const q2 = query(
          clientsRef,
          where("lastName", ">=", prefixCapitalized),
          where("lastName", "<=", prefixCapitalized + "\uf8ff"),
          limit(30),
        );

        const [snap1, snap2] = await Promise.all([getDocs(q1), getDocs(q2)]);
        const uniqueDocs = new Map<string, any>();
        [...snap1.docs, ...snap2.docs].forEach((d) => {
          uniqueDocs.set(d.id, { id: d.id, ...d.data() });
        });

        const candidates = Array.from(uniqueDocs.values());
        const fetched = candidates.filter((c) => {
          const first = (c.firstName || "").toLowerCase();
          const last = (c.lastName || "").toLowerCase();
          const full = `${first} ${last}`;
          const mb = (c.mindbody_name || "").toLowerCase();

          return (
            first.includes(term) ||
            last.includes(term) ||
            full.includes(term) ||
            mb.includes(term) ||
            term.includes(first) ||
            term.includes(last) ||
            isFuzzyNameMatch(
              term,
              c.firstName || "",
              c.lastName || "",
              c.mindbody_name,
            )
          );
        });

        setDbSearchResultsLink(fetched);
      } catch (err) {
        console.error("Error searching clients in link dialog:", err);
      } finally {
        setIsSearchingDbLink(false);
      }
    };

    const delayDebounceFn = setTimeout(() => {
      fetchClientsLink();
    }, 300);

    return () => clearTimeout(delayDebounceFn);
  }, [searchTermLink]);

  const filteredClients = clients.filter((c) =>
    `${c.firstName} ${c.lastName}`
      .toLowerCase()
      .includes(searchTerm.toLowerCase()),
  );

  // Merge local filtered clients of today and dynamic DB search results uniquely by client ID
  const mergedSearchClients = Array.from(
    new Map(
      [...filteredClients, ...dbSearchResults].map((c) => [c.id, c]),
    ).values(),
  );

  const now = new Date();

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

  const getScheduleSlotStr = (s: any): string => {
    const date = safeToDate(s?.startTime || s?.StartDateTime || s?.date);
    if (!date) return "";
    const hm = zonedHM(date);
    let h = hm ? hm.hour : 0;
    const m = Math.floor((hm ? hm.minute : 0) / 30) * 30;
    const mStr = m.toString().padStart(2, "0");
    const ampm = h >= 12 ? "PM" : "AM";
    h = h % 12;
    h = h ? h : 12;
    return `${h}:${mStr} ${ampm}`;
  };

  // Sessions for the selected day, bounded by the STUDIO's midnight. Using the
  // viewer's midnight here while reading hours in studio time selected a window
  // offset from the studio's day, which scattered a normal 7am-8pm schedule
  // across every hour from 12 AM to 11:30 PM.
  const { start: dateStart, end: dateEnd } = studioDayBoundsForKey(
    calendarLabelKey(selectedDate),
  );

  const todaysSchedules = (schedules || [])
    .filter((s) => {
      const date = safeToDate(s.startTime || s.StartDateTime || s.date);
      if (!date) return false;
      return date >= dateStart && date <= dateEnd && s.status !== "Cancelled";
    })
    .sort(
      (a, b) =>
        getMillis(a.startTime || a.StartDateTime || a.date) -
        getMillis(b.startTime || b.StartDateTime || b.date),
    );

  const AM_SLOTS = React.useMemo(() => {
    let minHour = 7;
    let maxHour = 13;
    (todaysSchedules || []).forEach((s) => {
      const d = safeToDate(s.startTime || s.StartDateTime || s.date);
      if (d) {
        const h = studioHour(d) ?? 0;
        if (h < 14) {
          if (h < minHour) minHour = h;
          if (h > maxHour) maxHour = h;
        }
      }
    });

    const slots: string[] = [];
    for (let h = minHour; h <= maxHour; h++) {
      let displayHour = h % 12;
      displayHour = displayHour ? displayHour : 12;
      const ampm = h >= 12 ? "PM" : "AM";
      slots.push(`${displayHour}:00 ${ampm}`);
      slots.push(`${displayHour}:30 ${ampm}`);
    }
    return slots;
  }, [todaysSchedules]);

  const PM_SLOTS = React.useMemo(() => {
    let minHour = 14;
    let maxHour = 19;
    (todaysSchedules || []).forEach((s) => {
      const d = safeToDate(s.startTime || s.StartDateTime || s.date);
      if (d) {
        const h = studioHour(d) ?? 0;
        if (h >= 14) {
          if (h < minHour) minHour = h;
          if (h > maxHour) maxHour = h;
        }
      }
    });

    const slots: string[] = [];
    for (let h = minHour; h <= maxHour; h++) {
      let displayHour = h % 12;
      displayHour = displayHour ? displayHour : 12;
      const ampm = h >= 12 ? "PM" : "AM";
      slots.push(`${displayHour}:00 ${ampm}`);
      slots.push(`${displayHour}:30 ${ampm}`);
    }
    return slots;
  }, [todaysSchedules]);

  const amSessionsCount = todaysSchedules.filter((s) => {
    if (s.clientName?.toLowerCase().includes("unavailab")) return false;
    const sDate = safeToDate(s.startTime || s.StartDateTime || s.date);
    if (!sDate) return false;
    return (studioHour(sDate) ?? 0) < 14;
  }).length;

  const pmSessionsCount = todaysSchedules.filter((s) => {
    if (s.clientName?.toLowerCase().includes("unavailab")) return false;
    const sDate = safeToDate(s.startTime || s.StartDateTime || s.date);
    if (!sDate) return false;
    return (studioHour(sDate) ?? 0) >= 14;
  }).length;

  const preBookedCount = amSessionsCount + pmSessionsCount;

  const activeClientsCount = React.useMemo(() => {
    return clients.filter(
      (c) =>
        (!activeStudioId || c.homeStudioId === activeStudioId) &&
        c.isActive !== false,
    ).length;
  }, [clients, activeStudioId]);

  const sessionsCompletedThisWeek = React.useMemo(() => {
    const today = new Date();
    const dayOfWeek = today.getDay();
    const monday = new Date(today);
    monday.setDate(today.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1));
    monday.setHours(0, 0, 0, 0);

    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    sunday.setHours(23, 59, 59, 999);

    return (sessions || []).filter((s) => {
      if (s.status !== "Completed") return false;
      if (activeStudioId && s.hostedAtStudioId !== activeStudioId) return false;
      const sDate = parseSessionDate(s.date);
      return sDate >= monday.getTime() && sDate <= sunday.getTime();
    }).length;
  }, [sessions, activeStudioId]);

  // Generate 6 days starting from today or Monday (skipping Sundays)
  const getUpcomingDays = () => {
    const days = [];
    let temp = new Date();
    // Start from today, but if today is Sunday, start tomorrow
    if (temp.getDay() === 0) temp.setDate(temp.getDate() + 1);

    let count = 0;
    let curr = new Date(temp);
    while (count < 6) {
      if (curr.getDay() !== 0) {
        days.push(new Date(curr));
        count++;
      }
      curr.setDate(curr.getDate() + 1);
    }
    return days;
  };
  const weekDays = getUpcomingDays();

  // Helper for time slots
  const generateSlots = (
    startHour: number,
    endHour: number,
    ampmStr: string,
  ) => {
    const slots = [];
    for (let h = startHour; h <= endHour; h++) {
      const displayHour = h > 12 ? h - 12 : h === 0 ? 12 : h;
      const suffix =
        h >= 12 && ampmStr === "AUTO"
          ? "PM"
          : h < 12 && ampmStr === "AUTO"
            ? "AM"
            : ampmStr;
      slots.push(`${displayHour}:00 ${suffix}`);
      if (h !== endHour) {
        slots.push(`${displayHour}:30 ${suffix}`);
      }
    }
    return slots;
  };

  const currentSlots = activeTab === "morning" ? AM_SLOTS : PM_SLOTS;

  // Active trainers for column display
  const TRAINER_COLORS = [
    { border: "border-sky-500", bg: "bg-sky-500/10" },
    { border: "border-[#10B981]", bg: "bg-[#10B981]/10" },
    {
      border: "border-orange-500",
      bg: "bg-orange-500/10 dark:bg-orange-600/10",
    },
    { border: "border-purple-400", bg: "bg-purple-400/10" },
    { border: "border-pink-400", bg: "bg-pink-400/10" },
  ];

  const timeToPosition = (date: Date) => {
    // "Is the selected day today?" must be asked of the studio's clock, or the
    // now-indicator disappears whenever the viewer's date differs from theirs.
    if (calendarLabelKey(selectedDate) !== studioDateKey(new Date())) return null;
    const hm = zonedHM(date);
    const totalMins = hm ? hm.hour * 60 + hm.minute : 0;
    const shiftStartMins = activeTab === "morning" ? 7 * 60 : 14 * 60;
    const shiftEndMins = activeTab === "morning" ? 13 * 60 : 19 * 60;
    if (totalMins < shiftStartMins || totalMins > shiftEndMins) return null;
    const minsFromStart = totalMins - shiftStartMins;
    const totalShiftMins = shiftEndMins - shiftStartMins;
    return (minsFromStart / totalShiftMins) * 100;
  };
  const currentTimePos = timeToPosition(now);

  // Find if a slot has any sessions for any trainer
  const getSlotSessions = (slot: string) => {
    return todaysSchedules.filter((s) => {
      const date = safeToDate(s.startTime);
      if (!date) return false;
      const hm = zonedHM(date);
      const h = String(hm ? hm.hour : 0).padStart(2, "0");
      const m = String(hm ? hm.minute : 0).padStart(2, "0");
      return `${h}:${m}` === slot;
    });
  };

  const findClientForSession = (session: any) => {
    if (!session) return null;
    const sName = (session.clientName || "").trim();

    const scheduleTrainer = trainers.find(
      (t) =>
        t.id === session.trainerId ||
        (t.fullName &&
          session.trainerName &&
          t.fullName.toLowerCase() === session.trainerName.toLowerCase()),
    );
    const targetStudioId = scheduleTrainer?.primaryHomeStudioId;

    let matched: Client | undefined = undefined;

    // 1. First, search under the trainer's home studio
    if (targetStudioId) {
      matched = clients.find(
        (c) =>
          c.homeStudioId === targetStudioId &&
          (c.id === session.clientId ||
            isFuzzyNameMatch(
              sName,
              c.firstName || "",
              c.lastName || "",
              c.mindbody_name,
            )),
      );
    }

    // 2. Global fallback
    if (!matched) {
      matched = clients.find(
        (c) =>
          c.id === session.clientId ||
          isFuzzyNameMatch(
            sName,
            c.firstName || "",
            c.lastName || "",
            c.mindbody_name,
          ),
      );
    }

    // 3. Quick check: Has this exact name been linked in any previous schedule entry?
    if (!matched && schedules) {
      const pastLink = schedules.find(
        (s) => s.clientName === sName && !!s.clientId,
      );
      if (pastLink) {
        matched = clients.find((c) => c.id === pastLink.clientId);
      }
    }

    return matched || null;
  };

  const hasUnassignedAnywhereInGrid =
    todaysSchedules.some(
      (s) =>
        !s.trainerName ||
        s.trainerName.toLowerCase().includes("select") ||
        s.trainerName === "",
    ) ||
    sessions.some(
      (s) =>
        s.status === "In-Progress" &&
        (s as any).isUnassigned &&
        isSessionValid(s),
    ); // check for active unassigned sessions

  const getClientSessions = (client: Client) => {
    const clientName = `${client.firstName} ${client.lastName}`;
    const next = schedules
      .filter((s) => {
        const d = safeToDate(s.startTime);
        return (
          (s.clientId === client.id ||
            s.clientName.toLowerCase() === clientName.toLowerCase()) &&
          d &&
          d > now &&
          s.status !== "Cancelled"
        );
      })
      .sort((a, b) => getMillis(a.startTime) - getMillis(b.startTime))[0];
    const last = sessions
      .filter((s) => s.clientId === client.id)
      .sort((a, b) => parseSessionDate(b.date) - parseSessionDate(a.date))[0];
    return { next, last };
  };

  const visibleTrainersList = React.useMemo(() => {
    const activeTrainers = sortedTrainers.filter((t) => {
      if (t.isVisibleOnCalendar === false) return false;

      const isAssigned =
        !activeStudioId ||
        t.primaryHomeStudioId === activeStudioId ||
        t.accessibleStudioIds?.includes(activeStudioId) ||
        t.activeGuestStudioIds?.includes(activeStudioId);
      if (isAssigned) return true;

      const hasSessionToday = todaysSchedules.some(
        (s) =>
          (!activeStudioId || !s.studioId || s.studioId === activeStudioId) &&
          s.trainerName &&
          t.fullName &&
          s.trainerName.toLowerCase() === t.fullName.toLowerCase(),
      );
      return hasSessionToday;
    });

    const missingTrainerNames = new Set<string>();
    todaysSchedules.forEach((s) => {
      if (activeStudioId && s.studioId && s.studioId !== activeStudioId) return;
      if (
        s.trainerName &&
        !s.trainerName.toLowerCase().includes("select") &&
        !s.trainerName.toLowerCase().includes("unavailab") &&
        !activeTrainers.some(
          (t) =>
            t.fullName &&
            t.fullName.toLowerCase() === s.trainerName.toLowerCase(),
        )
      ) {
        missingTrainerNames.add(s.trainerName);
      }
    });

    const extraTrainers = Array.from(missingTrainerNames).map((name) => ({
      id: `virtual-${name}`,
      fullName: name,
      firstName: name.split(" ")[0],
      lastName: name.split(" ").slice(1).join(" "),
      role: "Trainer" as const,
      color: "#0EA5E9",
      initials: name.substring(0, 2).toUpperCase(),
    }));

    const combined = [...activeTrainers, ...extraTrainers];

    const withSessions = combined.filter((t) =>
      todaysSchedules.some(
        (s) =>
          (!activeStudioId || !s.studioId || s.studioId === activeStudioId) &&
          s.trainerName &&
          t.fullName &&
          s.trainerName.toLowerCase() === t.fullName.toLowerCase() &&
          !s.clientName?.toLowerCase().includes("unavailab"),
      ),
    );
    return withSessions.length > 0 ? withSessions : activeTrainers;
  }, [sortedTrainers, activeStudioId, todaysSchedules]);

  return (
    <motion.div
      key="clients"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="flex flex-col h-full bg-slate-50 dark:bg-slate-950 text-foreground dark:text-white w-full overflow-hidden"
    >
      <div className="flex flex-col gap-3 shrink-0 p-4 pb-0 bg-slate-50 dark:bg-slate-950 z-30">
        <div className="flex items-center gap-3 w-full">
          <div className="relative flex-1">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500 dark:text-slate-400" />
            <Input
              placeholder="Search clients..."
              className="pl-12 h-12 rounded-2xl bg-white dark:bg-bg-dark border-none font-bold text-base text-foreground dark:text-white focus-visible:ring-sky-500"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <Button
            onClick={() => {
              if (onStartNewClientOnboarding) {
                onStartNewClientOnboarding("");
              }
            }}
            size="lg"
            className="rounded-xl h-12 px-8 shadow-[0_0_20px_rgba(56,189,248,0.2)] bg-sky-500 hover:bg-[#0284C7] text-foreground font-black uppercase tracking-widest text-sm hidden sm:flex items-center shrink-0"
          >
            <Plus className="w-5 h-5 mr-2" />
            Add New Client
          </Button>
        </div>
        <div className="sm:hidden w-full">
          <Button
            onClick={() => {
              if (onStartNewClientOnboarding) {
                onStartNewClientOnboarding("");
              }
            }}
            size="lg"
            className="rounded-xl h-12 px-8 shadow-[0_0_20px_rgba(56,189,248,0.2)] bg-sky-500 hover:bg-[#0284C7] text-foreground font-black w-full uppercase tracking-widest text-sm flex items-center justify-center"
          >
            <Plus className="w-5 h-5 mr-2" />
            Add New Client
          </Button>
        </div>
      </div>

      <AnimatePresence>
        {/* Registration form removed for unified modal; only editing is kept here for now or until unified */}
        {editingClient && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden mb-8"
          >
            <Card className="border-2 border-primary/20 shadow-2xl dark:shadow-none rounded-3xl overflow-hidden">
              <CardHeader>
                <CardTitle>Edit Client Profile</CardTitle>
                <CardDescription>
                  Updating information for {editingClient.firstName}
                </CardDescription>
              </CardHeader>
              <form onSubmit={onSubmit}>
                <CardContent className="space-y-6">
                  <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
                    <div className="space-y-3">
                      <Label
                        htmlFor="firstName"
                        className="text-base font-bold"
                      >
                        First Name
                      </Label>
                      <Input
                        id="firstName"
                        placeholder="First Name"
                        value={formData.firstName}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            firstName: e.target.value,
                          })
                        }
                        required
                        className="h-14 text-lg"
                      />
                    </div>
                    <div className="space-y-3">
                      <Label htmlFor="lastName" className="text-base font-bold">
                        Last Name
                      </Label>
                      <Input
                        id="lastName"
                        placeholder="Last Name"
                        value={formData.lastName}
                        onChange={(e) =>
                          setFormData({ ...formData, lastName: e.target.value })
                        }
                        required
                        className="h-14 text-lg"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
                    <div className="space-y-3">
                      <Label htmlFor="gender" className="text-base font-bold">
                        Gender
                      </Label>
                      <div className="flex gap-2">
                        {["Male", "Female", "Other"].map((g) => (
                          <Button
                            key={g}
                            type="button"
                            variant={
                              formData.gender === g ? "default" : "outline"
                            }
                            className="flex-1 h-12 font-bold"
                            onClick={() =>
                              setFormData({ ...formData, gender: g as any })
                            }
                          >
                            {g}
                          </Button>
                        ))}
                      </div>
                    </div>
                    <div className="space-y-3">
                      <Label className="text-base font-bold">Height</Label>
                      <div className="flex gap-3">
                        <div className="relative flex-1">
                          <Input
                            id="heightFeet"
                            type="number"
                            placeholder="Ft"
                            value={formData.heightFeet}
                            onChange={(e) =>
                              setFormData({
                                ...formData,
                                heightFeet: e.target.value,
                              })
                            }
                            required
                            className="h-14 text-lg pr-8"
                          />
                          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground font-bold">
                            ft
                          </span>
                        </div>
                        <div className="relative flex-1">
                          <Input
                            id="heightInches"
                            type="number"
                            placeholder="In"
                            value={formData.heightInches}
                            onChange={(e) =>
                              setFormData({
                                ...formData,
                                heightInches: e.target.value,
                              })
                            }
                            required
                            className="h-14 text-lg pr-8"
                          />
                          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground font-bold">
                            in
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="space-y-3">
                      <Label htmlFor="weight" className="text-base font-bold">
                        Weight (lbs)
                      </Label>
                      <Input
                        id="weight"
                        type="number"
                        placeholder="e.g. 185"
                        value={formData.weight}
                        onChange={(e) =>
                          setFormData({ ...formData, weight: e.target.value })
                        }
                        className="h-14 text-lg"
                      />
                    </div>
                    <div className="space-y-3">
                      <Label htmlFor="age" className="text-base font-bold">
                        Age
                      </Label>
                      <Input
                        id="age"
                        type="number"
                        placeholder="Years"
                        value={formData.age}
                        onChange={(e) =>
                          setFormData({ ...formData, age: e.target.value })
                        }
                        className="h-14 text-lg"
                      />
                    </div>
                    <div className="space-y-3">
                      <Label
                        htmlFor="occupation"
                        className="text-base font-bold"
                      >
                        Occupation
                      </Label>
                      <Input
                        id="occupation"
                        placeholder="e.g. Software Engineer"
                        value={formData.occupation}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            occupation: e.target.value,
                          })
                        }
                        className="h-14 text-lg"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
                    <div className="space-y-3">
                      <Label htmlFor="phone" className="text-base font-bold">
                        Phone Number
                      </Label>
                      <Input
                        id="phone"
                        placeholder="(555) 000-0000"
                        value={formData.phone}
                        onChange={(e) =>
                          setFormData({ ...formData, phone: e.target.value })
                        }
                        className="h-14 text-lg"
                      />
                    </div>
                    <div className="space-y-3">
                      <Label htmlFor="email" className="text-base font-bold">
                        Email Address
                      </Label>
                      <Input
                        id="email"
                        type="email"
                        placeholder="client@example.com"
                        value={formData.email}
                        onChange={(e) =>
                          setFormData({ ...formData, email: e.target.value })
                        }
                        className="h-14 text-lg"
                      />
                    </div>
                  </div>

                  <div className="space-y-3">
                    <Label htmlFor="address" className="text-base font-bold">
                      Address
                    </Label>
                    <Input
                      id="address"
                      placeholder="123 Main St, City, State, Zip"
                      value={formData.address}
                      onChange={(e) =>
                        setFormData({ ...formData, address: e.target.value })
                      }
                      className="h-14 text-lg"
                    />
                  </div>

                  <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
                    <div className="space-y-3">
                      <Label
                        htmlFor="emergencyName"
                        className="text-base font-bold"
                      >
                        Emergency Contact Name
                      </Label>
                      <Input
                        id="emergencyName"
                        placeholder="Full Name"
                        value={formData.emergencyContactName}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            emergencyContactName: e.target.value,
                          })
                        }
                        className="h-14 text-lg"
                      />
                    </div>
                    <div className="space-y-3">
                      <Label
                        htmlFor="emergencyPhone"
                        className="text-base font-bold"
                      >
                        Emergency Contact Phone
                      </Label>
                      <Input
                        id="emergencyPhone"
                        placeholder="(555) 000-0000"
                        value={formData.emergencyContactPhone}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            emergencyContactPhone: e.target.value,
                          })
                        }
                        className="h-14 text-lg"
                      />
                    </div>
                  </div>

                  <div className="space-y-3">
                    <Label
                      htmlFor="legacy_id_c"
                      className="text-base font-bold text-amber-600"
                    >
                      Legacy FileMaker ID
                    </Label>
                    <Input
                      id="legacy_id_c"
                      placeholder="Fm-XXXXX"
                      value={formData.legacy_filemaker_id}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          legacy_filemaker_id: e.target.value,
                        })
                      }
                      className="h-14 text-lg border-amber-500/30 bg-amber-500/5 focus:ring-amber-500"
                    />
                  </div>

                  <div className="flex items-center justify-between p-4 bg-muted rounded-2xl">
                    <div className="space-y-0.5">
                      <Label className="text-base font-bold">
                        Active Status
                      </Label>
                      <p className="text-sm text-muted-foreground">
                        Is this client currently training?
                      </p>
                    </div>
                    <Switch
                      checked={formData.isActive}
                      onCheckedChange={(v) =>
                        setFormData({ ...formData, isActive: v })
                      }
                    />
                  </div>

                  <div className="space-y-3">
                    <Label
                      htmlFor="medicalHistory"
                      className="text-base font-bold"
                    >
                      Medical History / Injuries
                    </Label>
                    <Textarea
                      id="medicalHistory"
                      placeholder="List any medical history, injuries, or contraindications..."
                      value={formData.medicalHistory}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          medicalHistory: e.target.value,
                        })
                      }
                      className="min-h-25 text-lg p-4"
                    />
                  </div>

                  <div className="space-y-3">
                    <Label htmlFor="notes" className="text-base font-bold">
                      Session Preferences / Notes
                    </Label>
                    <Textarea
                      id="notes"
                      placeholder="Trainer notes about preferences, motivations, etc."
                      value={formData.globalNotes}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          globalNotes: e.target.value,
                        })
                      }
                      className="min-h-25 text-lg p-4"
                    />
                  </div>
                </CardContent>
                <CardFooter className="flex gap-4">
                  <Button
                    type="submit"
                    className="flex-1 h-14 text-lg font-bold uppercase tracking-widest"
                  >
                    Update Profile
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setEditingClient(null);
                    }}
                    className="h-14 px-8"
                  >
                    Cancel
                  </Button>
                </CardFooter>
              </form>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="flex-1 flex flex-col min-h-0 overflow-hidden w-full">
        {!searchTerm ? (
          <div className="flex-1 overflow-y-auto custom-scrollbar bg-slate-50 dark:bg-slate-950 p-6 space-y-10">
            {/* Header / Week Selector / Shift Toggle */}
            <section className="bg-white dark:bg-bg-dark rounded-[24px] md:rounded-[32px] p-4 md:p-6 shadow-[0_4px_30px_rgba(0,0,0,0.05)] dark:shadow-[0_4px_30px_rgba(0,0,0,0.2)] border border-slate-200 dark:border-slate-700/50 space-y-6 shrink-0 relative overflow-hidden">
              <div className="absolute inset-0 bg-linear-to-br from-slate-50 via-slate-100/50 to-slate-100 dark:from-slate-900 dark:via-slate-800 dark:to-slate-900 opacity-80 pointer-events-none"></div>
              <div className="relative flex flex-col xl:flex-row xl:items-center justify-between gap-6 z-10">
                {/* Week Selector */}
                <div className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-6 gap-2 w-full xl:w-auto flex-1">
                  {weekDays.map((date) => {
                    const isSelected =
                      date.toDateString() === selectedDate.toDateString();
                    const isToday =
                      date.toDateString() === new Date().toDateString();
                    return (
                      <button
                        key={date.toISOString()}
                        onClick={() => setSelectedDate(date)}
                        className={`w-full px-4 py-3 sm:py-4 rounded-xl flex flex-col items-center gap-1.5 transition-all border cursor-pointer ${
                          isSelected
                            ? "bg-cyan border-cyan text-slate-900 shadow-[0_0_20px_rgba(56,189,248,0.3)] scale-105 z-10"
                            : "bg-slate-100 dark:bg-surface-2 border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:border-cyan/50 hover:bg-slate-200 dark:hover:bg-surface-1 hover:text-slate-900 dark:hover:text-white"
                        }`}
                      >
                        <span className="text-[10px] sm:text-[11px] font-black uppercase tracking-widest leading-none opacity-80">
                          {date.toLocaleDateString([], { weekday: "short" })}
                        </span>
                        <span
                          className={`text-[16px] sm:text-[18px] font-black leading-none ${isSelected ? "text-slate-900" : "text-slate-800 dark:text-slate-100"}`}
                        >
                          {isToday
                            ? "Today"
                            : date.toLocaleDateString([], { day: "numeric" })}
                        </span>
                      </button>
                    );
                  })}
                </div>

                {/* Right Actions: Shift Selector & Refresh Button */}
                <div className="flex flex-col sm:flex-row sm:items-center gap-3 self-start xl:self-center w-full xl:w-auto">
                  {/* Shift Selector */}
                  <div className="relative flex p-1.5 bg-slate-100 dark:bg-surface-2 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-inner w-full sm:w-[320px] h-16 xl:h-20 shrink-0">
                    <div
                      className={cn(
                        "absolute top-1.5 bottom-1.5 w-[calc(50%-6px)] bg-white dark:bg-slate-800 rounded-[14px] shadow-sm transition-transform duration-300 ease-out z-0",
                        activeTab === "morning"
                          ? "translate-x-0"
                          : "translate-x-full",
                      )}
                    />
                    <button
                      onClick={() => setActiveTab("morning")}
                      className={cn(
                        "relative flex-1 rounded-[14px] transition-colors z-10 flex flex-col items-center justify-center gap-1 cursor-pointer",
                        activeTab === "morning"
                          ? "text-foreground dark:text-white"
                          : "text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-300",
                      )}
                    >
                      <span className="text-xs sm:text-sm font-black uppercase tracking-widest leading-none mt-0.5 xl:mt-1">
                        AM Shift
                      </span>
                      <span
                        className={cn(
                          "text-[10px] sm:text-xs font-bold uppercase tracking-widest leading-none",
                          activeTab === "morning"
                            ? "text-[#0A2E46] dark:text-cyan-400"
                            : "opacity-60",
                        )}
                      >
                        {amSessionsCount} Sessions
                      </span>
                    </button>
                    <button
                      onClick={() => setActiveTab("afternoon")}
                      className={cn(
                        "relative flex-1 rounded-[14px] transition-colors z-10 flex flex-col items-center justify-center gap-1 cursor-pointer",
                        activeTab === "afternoon"
                          ? "text-foreground dark:text-white"
                          : "text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-300",
                      )}
                    >
                      <span className="text-xs sm:text-sm font-black uppercase tracking-widest leading-none mt-0.5 xl:mt-1">
                        PM Shift
                      </span>
                      <span
                        className={cn(
                          "text-[10px] sm:text-xs font-bold uppercase tracking-widest leading-none",
                          activeTab === "afternoon"
                            ? "text-orange-600 dark:text-orange-400"
                            : "opacity-60",
                        )}
                      >
                        {pmSessionsCount} Sessions
                      </span>
                    </button>
                  </div>

                  {/* Refresh Schedule Button */}
                  <button
                    onClick={handleRefreshSchedule}
                    disabled={isRefreshingSchedule}
                    className="relative px-6 rounded-2xl bg-[#F06C22] border-2 border-[#F06C22] hover:bg-[#F06C22]/90 hover:border-[#F06C22] text-white disabled:opacity-55 transition-all flex items-center justify-center gap-2 shadow-[0_0_15px_rgba(240,108,34,0.35)] font-black uppercase tracking-widest text-xs sm:text-sm h-16 xl:h-20 w-full sm:w-auto cursor-pointer select-none"
                  >
                    <RefreshCw
                      className={cn(
                        "w-4 h-4",
                        isRefreshingSchedule && "animate-spin",
                      )}
                    />
                    {isRefreshingSchedule ? "Syncing..." : "Refresh Schedule"}
                  </button>
                </div>
              </div>
            </section>

            {/* Main Training Grid */}
            <section className="bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-[32px] overflow-hidden shadow-none relative">
              <div className="overflow-x-auto grow relative">
                <div className="min-w-full relative">
                  {currentTimePos !== null && (
                    <div
                      className="absolute left-0 right-0 h-px bg-linear-to-r from-cyan-500 via-orange-500 to-transparent z-20 pointer-events-none"
                      style={{
                        top: `calc(64px + (100% - 64px) * ${currentTimePos} / 100)`,
                      }}
                    >
                      <div className="absolute left-0 -top-2.5 bg-orange-500 text-white text-[11px] font-black uppercase px-2 py-0.5 rounded-r-full shadow-sm flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse"></span>
                        NOW
                      </div>
                    </div>
                  )}
                  <table className="w-full border-collapse table-fixed h-full bg-white dark:bg-slate-950">
                    <thead className="relative z-30">
                      <tr className="bg-slate-50 dark:bg-bg-dark border-b-2 border-slate-300 dark:border-slate-700 h-21 sm:h-25">
                        <th className="p-1 sm:p-2 border-r-2 border-slate-300 dark:border-slate-700 w-14 min-w-14 max-w-14 sticky left-0 bg-slate-50 dark:bg-bg-dark z-40"></th>
                        {visibleTrainersList.length === 0 && (
                          <th className="w-full bg-slate-50 dark:bg-bg-dark"></th>
                        )}
                        {visibleTrainersList.map((trainer) => {
                          const sessionCount = todaysSchedules.filter((s) => {
                            if (!isTrainerMatch(s, trainer)) return false;
                            if (
                              s.clientName?.toLowerCase().includes("unavailab")
                            )
                              return false;
                            if (s.status === "Cancelled") return false;
                            const sDate = safeToDate(
                              s.startTime || s.StartDateTime || s.date,
                            );
                            if (!sDate) return false;
                            return activeTab === "morning"
                              ? (studioHour(sDate) ?? 0) < 14
                              : (studioHour(sDate) ?? 0) >= 14;
                          }).length;
                          return (
                            <th
                              key={trainer.id}
                              className="p-2 sm:p-3 border-r-2 border-slate-300 dark:border-slate-700 last:border-r-0 text-center sticky top-0 bg-slate-50 dark:bg-bg-dark shadow-sm min-w-17.5"
                            >
                              <div className="flex flex-col items-center justify-center gap-1 sm:gap-2 pt-1">
                                <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-primary border-2 border-white dark:border-slate-800 shadow-lg flex items-center justify-center">
                                  <span className="text-[12px] sm:text-[14px] font-black text-primary-foreground uppercase tracking-widest">
                                    {trainer.fullName.substring(0, 2)}
                                  </span>
                                </div>
                                <span className="text-[11px] sm:text-[13px] font-black uppercase tracking-widest text-foreground dark:text-white leading-none whitespace-nowrap overflow-hidden text-ellipsis w-11/12">
                                  {trainer.fullName.split(" ")[0]}
                                </span>
                                <div className="bg-slate-200/50 dark:bg-surface-1 text-slate-600 dark:text-slate-400 px-2 py-0.5 rounded flex items-center gap-1 leading-none mt-0.5">
                                  <span className="text-[11px] sm:text-[11px] font-bold tracking-widest whitespace-nowrap uppercase">
                                    {sessionCount} Sess.
                                  </span>
                                </div>
                              </div>
                            </th>
                          );
                        })}
                      </tr>
                    </thead>
                    <tbody className="relative">
                      {(() => {
                        const skippedGridCells = new Set<string>();
                        return currentSlots.map((slot, sIdx) => {
                          return (
                            <tr
                              key={slot}
                              className="border-b-2 border-slate-300 dark:border-slate-700 last:border-0 hover:bg-slate-50 dark:hover:bg-surface-1/5 transition-colors group relative h-18"
                            >
                              <td className="p-1 sm:p-2 w-14 min-w-14 max-w-14 text-center border-r-2 border-slate-300 dark:border-slate-700 left-0 bg-slate-100 dark:bg-surface-1 z-10 relative box-border shadow-[2px_0_10px_rgba(0,0,0,0.05)]">
                                <div className="flex flex-col items-center justify-center">
                                  <span className="text-[12px] sm:text-[14px] font-black tracking-widest text-[#0A2E46] dark:text-white uppercase leading-none">
                                    {slot
                                      .replace(" AM", "")
                                      .replace(" PM", "")
                                      .replace(":00", "")
                                      .replace(":30", ":30")}
                                  </span>
                                  <span className="text-[11px] font-bold text-[#F06C22] uppercase tracking-widest">
                                    {slot.includes("AM") ? "AM" : "PM"}
                                  </span>
                                </div>
                              </td>
                              {visibleTrainersList.length === 0 && (
                                <td className="w-full bg-slate-50 dark:bg-bg-dark border-r-2 border-slate-300 dark:border-slate-700 p-2 text-center text-slate-400 font-bold tracking-widest uppercase text-xs">
                                  No Trainers Displayed
                                </td>
                              )}
                              {visibleTrainersList.map((trainer, tIdx) => {
                                const cellId = `${trainer.id}-${slot}`;
                                if (skippedGridCells.has(cellId)) return null;

                                const cellSessions = todaysSchedules.filter(
                                  (s) => {
                                    if (!isTrainerMatch(s, trainer))
                                      return false;
                                    const tStr = getScheduleSlotStr(s);
                                    return (
                                      tStr === slot && s.status !== "Cancelled"
                                    );
                                  },
                                );

                                let rowSpan = 1;
                                if (cellSessions.length === 1) {
                                  const session = cellSessions[0];
                                  const start = safeToDate(
                                    session.startTime ||
                                      session.StartDateTime ||
                                      session.date,
                                  );
                                  const end = safeToDate(
                                    session.endTime || session.EndDateTime,
                                  );
                                  if (start && end) {
                                    const duration =
                                      (end.getTime() - start.getTime()) /
                                      (1000 * 60);
                                    rowSpan = Math.max(
                                      1,
                                      Math.round(duration / 30),
                                    );
                                    if (rowSpan > 1) {
                                      for (let i = 1; i < rowSpan; i++) {
                                        if (currentSlots[sIdx + i]) {
                                          skippedGridCells.add(
                                            `${trainer.id}-${currentSlots[sIdx + i]}`,
                                          );
                                        }
                                      }
                                    }
                                  }
                                }

                                return (
                                  <td
                                    key={cellId}
                                    rowSpan={rowSpan}
                                    className={cn(
                                      "p-1 sm:p-1.5 border-r border-slate-300 dark:border-slate-700 last:border-r-0 align-top",
                                      rowSpan > 1 ? "" : "h-18",
                                    )}
                                  >
                                    {cellSessions.length > 0 ? (
                                      <div className="flex flex-col gap-1.5 h-full w-full">
                                        {cellSessions.map((session, sIdx) => {
                                          const clientObj =
                                            findClientForSession(session);
                                          const workoutSession = clientObj
                                            ? sessions.find(
                                                (s) =>
                                                  s.clientId === clientObj.id &&
                                                  new Date(
                                                    s.createdAt?.toDate?.() ||
                                                      s.date,
                                                  ).toDateString() ===
                                                    new Date().toDateString(),
                                              )
                                            : null;
                                          const isInSession =
                                            workoutSession?.status ===
                                            "In-Progress";
                                          const isCompleted =
                                            session &&
                                            !isInSession &&
                                            (session.status === "Completed" ||
                                              getMillis(
                                                session.startTime ||
                                                  session.StartDateTime,
                                              ) < now.getTime());
                                          const isUnavailable =
                                            session?.clientName
                                              ?.toLowerCase()
                                              .includes("unavailab");
                                          const isAlreadyCompleted =
                                            workoutSession?.status ===
                                            "Completed";
                                          const sessionNumber = clientObj
                                            ? (clientObj.sessionCount || 0) +
                                              (isAlreadyCompleted ? 0 : 1)
                                            : 1;
                                          const isMilestone =
                                            sessionNumber === 1 ||
                                            sessionNumber % 25 === 0;
                                          const hasAlert =
                                            clientObj &&
                                            ((clientObj.clinicalProfile &&
                                              clientObj.clinicalProfile.length >
                                                0) ||
                                              !!clientObj.clinicalNotes ||
                                              !!clientObj.medicalHistory);

                                          const formatClientName = (
                                            name: string,
                                          ) => {
                                            if (!name) return "";
                                            const parts = name
                                              .trim()
                                              .split(" ");
                                            if (parts.length > 1) {
                                              return `${parts[0]} ${parts[parts.length - 1][0]}.`;
                                            }
                                            return parts[0];
                                          };
                                          const formattedClientName =
                                            formatClientName(
                                              session?.clientName || "",
                                            );

                                          const sDate = safeToDate(
                                            session.startTime ||
                                              session.StartDateTime ||
                                              session.date,
                                          );
                                          const exactTimeStr = sDate
                                            ? sDate.toLocaleTimeString([], {
                                                hour: "numeric",
                                                minute: "2-digit",
                                              })
                                            : "";

                                          return (
                                            <div
                                              key={
                                                session.id ||
                                                session.mindbodyAppointmentId ||
                                                sIdx
                                              }
                                              onClick={() => {
                                                if (isUnavailable) return;
                                                if (clientObj) {
                                                  onSelectClient(clientObj.id!);
                                                  setView("profile");
                                                } else {
                                                  setLinkingSession(session);
                                                  setIsLinking(true);
                                                }
                                              }}
                                              className={cn(
                                                "flex flex-col p-2 sm:p-2.5 rounded-xl shadow-sm transition-all h-full box-border relative overflow-hidden",
                                                isUnavailable
                                                  ? "bg-[repeating-linear-gradient(45deg,#f8fafc,#f8fafc_10px,#f1f5f9_10px,#f1f5f9_20px)] dark:bg-[repeating-linear-gradient(45deg,#0f172a,#0f172a_10px,#1e293b_10px,#1e293b_20px)] border-2 border-slate-200 dark:border-slate-700 cursor-not-allowed opacity-90"
                                                  : isCompleted
                                                    ? "opacity-60 grayscale bg-slate-50 dark:bg-surface-2 border-2 border-slate-200 dark:border-slate-700/80 cursor-pointer"
                                                    : isInSession
                                                      ? isMilestone
                                                        ? "bg-[#F06C22] border-2 border-[#F06C22] shadow-[0_0_15px_rgba(240,108,34,0.65)] cursor-pointer hover:shadow-[0_0_20px_rgba(240,108,34,0.8)] text-white"
                                                        : "bg-cyan border-2 border-cyan shadow-[0_0_12px_rgba(56,189,248,0.5)] cursor-pointer hover:shadow-[0_0_16px_rgba(56,189,248,0.7)] text-slate-955"
                                                      : isMilestone
                                                        ? "bg-white dark:bg-surface-1 border-2 border-[#F06C22]/85 shadow-[0_0_10px_rgba(240,108,34,0.4)] dark:shadow-[0_0_12px_rgba(240,108,34,0.55)] cursor-pointer hover:border-[#F06C22] hover:shadow-[0_0_16px_rgba(240,108,34,0.7)]"
                                                        : "bg-white dark:bg-surface-1 border-2 border-cyan/85 shadow-[0_0_8px_rgba(56,189,248,0.3)] dark:shadow-[0_0_10px_rgba(56,189,248,0.45)] cursor-pointer hover:border-cyan hover:shadow-[0_0_14px_rgba(56,189,248,0.6)]",
                                                hasAlert &&
                                                  !isCompleted &&
                                                  !isUnavailable
                                                  ? "border-l-4 border-l-red-500"
                                                  : "",
                                              )}
                                            >
                                              <div className="flex flex-col w-full h-full justify-between items-start gap-1 relative z-10">
                                                <div className="w-full">
                                                  <div className="flex items-start justify-between gap-1 mb-0.5 relative z-20">
                                                    <span
                                                      className={cn(
                                                        "leading-tight truncate text-sm font-bold",
                                                        isUnavailable
                                                          ? "text-slate-500 italic uppercase tracking-widest text-[11px]"
                                                          : isInSession
                                                            ? isMilestone
                                                              ? "text-white font-black"
                                                              : "text-slate-955 font-black"
                                                            : "text-slate-900 dark:text-slate-50",
                                                      )}
                                                    >
                                                      {isUnavailable
                                                        ? "Unavailable"
                                                        : formattedClientName}
                                                    </span>
                                                    {hasAlert &&
                                                      !isCompleted &&
                                                      !isUnavailable && (
                                                        <div className="w-1.5 h-1.5 rounded-full bg-red-500 animate-[pulse_2s_ease-in-out_infinite] shrink-0 mt-1.5" />
                                                      )}
                                                  </div>
                                                  {sDate &&
                                                    (zonedHM(sDate)?.minute ?? 0) % 30 !==
                                                      0 &&
                                                    exactTimeStr && (
                                                      <div className="text-[10px] font-black text-amber-500 uppercase tracking-tight">
                                                        {exactTimeStr}
                                                      </div>
                                                    )}
                                                </div>

                                                {!isUnavailable && (
                                                  <div className="w-full flex items-end justify-end mt-auto pt-1 relative z-20">
                                                    <span
                                                      className={cn(
                                                        "inline-flex items-center text-[11px] sm:text-[12px] font-black leading-none px-1.5 py-0.5 rounded-md border",
                                                        isCompleted
                                                          ? "text-slate-500/50 border-slate-200/50 bg-slate-100/50 dark:bg-surface-2"
                                                          : isInSession
                                                            ? isMilestone
                                                              ? "text-white bg-white/20 border-white/30 font-mono shadow-[0_0_5px_rgba(255,255,255,0.25)]"
                                                              : "text-slate-955 bg-black/10 border-black/20 font-mono"
                                                            : isMilestone
                                                              ? "text-[#F06C22] bg-[#F06C22]/10 border-[#F06C22]/30 shadow-[0_0_5px_rgba(240,108,34,0.15)] font-mono"
                                                              : "text-cyan bg-cyan/10 border-cyan/20",
                                                      )}
                                                    >
                                                      {sessionNumber}
                                                    </span>
                                                  </div>
                                                )}
                                              </div>
                                            </div>
                                          );
                                        })}
                                      </div>
                                    ) : (
                                      <div className="h-full w-full opacity-0 hover:opacity-[0.03] transition-opacity flex items-center justify-center p-2 bg-bg-dark rounded-lg pointer-events-none">
                                        <span className="text-[11px] font-black uppercase tracking-widest text-foreground dark:text-white">
                                          Open
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
            </section>

            {/* Quick Stats Trackers */}
            <section className="space-y-6 pt-10 border-t border-slate-200 dark:border-slate-800/50">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-orange-500/10 flex items-center justify-center border border-orange-500/20">
                    <Activity className="w-5 h-5 text-orange-500" />
                  </div>
                  <h3 className="text-[17px] font-black uppercase tracking-widest text-foreground dark:text-white">
                    Studio Overview
                  </h3>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="bg-white dark:bg-slate-950 rounded-[2rem] border border-slate-200 dark:border-slate-800/80 p-6 flex flex-col justify-between shadow-xl">
                  <div className="flex items-center gap-3 mb-6">
                    <div className="w-12 h-12 rounded-2xl bg-sky-500/10 flex items-center justify-center border border-sky-500/20 text-sky-500">
                      <Calendar className="w-5 h-5" />
                    </div>
                    <span className="text-[13px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400 leading-tight">
                      Pre-Booked
                      <br />
                      Sessions
                    </span>
                  </div>
                  <div className="text-4xl font-black text-foreground dark:text-white tracking-widest">
                    {preBookedCount}
                  </div>
                </div>

                <div className="bg-white dark:bg-slate-950 rounded-[2rem] border border-slate-200 dark:border-slate-800/80 p-6 flex flex-col justify-between shadow-xl">
                  <div className="flex items-center gap-3 mb-6">
                    <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 flex items-center justify-center border border-emerald-500/20 text-emerald-500">
                      <Users className="w-5 h-5" />
                    </div>
                    <span className="text-[13px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400 leading-tight">
                      Active
                      <br />
                      Clients
                    </span>
                  </div>
                  <div className="text-4xl font-black text-foreground dark:text-white tracking-widest">
                    {activeClientsCount}
                  </div>
                </div>

                <div className="bg-white dark:bg-slate-950 rounded-[2rem] border border-slate-200 dark:border-slate-800/80 p-6 flex flex-col justify-between shadow-xl">
                  <div className="flex items-center gap-3 mb-6">
                    <div className="w-12 h-12 rounded-2xl bg-indigo-500/10 flex items-center justify-center border border-indigo-500/20 text-indigo-500">
                      <CheckCircle2 className="w-5 h-5" />
                    </div>
                    <span className="text-[13px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400 leading-tight">
                      Sessions Completed
                      <br />
                      This Week
                    </span>
                  </div>
                  <div className="text-4xl font-black text-foreground dark:text-white tracking-widest">
                    {sessionsCompletedThisWeek}
                  </div>
                </div>
              </div>
            </section>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto custom-scrollbar bg-slate-50 dark:bg-slate-950 p-6">
            <div className="flex items-center gap-3 mb-8">
              {isSearchingDb ? (
                <Loader2 className="w-6 h-6 text-sky-500 animate-spin" />
              ) : (
                <Search className="w-6 h-6 text-sky-500" />
              )}
              <h3 className="text-xl font-black uppercase tracking-widest text-foreground dark:text-white">
                Client Directory{" "}
                <span className="text-slate-500 dark:text-slate-400 ml-2">
                  ({mergedSearchClients.length})
                </span>
              </h3>
            </div>
            <div className="space-y-4 max-w-5xl">
              {mergedSearchClients.map((client) => {
                const { next, last } = getClientSessions(client);
                const clientName = `${client.firstName} ${client.lastName}`;

                return (
                  <motion.div
                    key={client.id}
                    layout
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                  >
                    <Card className="group hover:border-primary/50 transition-all cursor-pointer overflow-hidden rounded-3xl">
                      <CardContent className="p-0">
                        <div className="flex flex-col lg:flex-row p-6 gap-6">
                          <div
                            className="flex flex-col gap-2 cursor-pointer grow min-w-50"
                            onClick={() => {
                              onSelectClient(client.id!);
                              setView("profile");
                            }}
                          >
                            <div className="flex items-center gap-3">
                              <h3 className="text-2xl font-bold tracking-tight text-foreground group-hover:text-primary transition-colors">
                                {clientName}
                              </h3>
                              {client.isActive ? (
                                <Badge className="bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/20 border-none font-black text-[11px] uppercase">
                                  Active
                                </Badge>
                              ) : (
                                <Badge
                                  variant="secondary"
                                  className="font-black text-[11px] uppercase"
                                >
                                  Inactive
                                </Badge>
                              )}
                            </div>
                            <div className="flex gap-4 text-[11px] font-bold text-muted-foreground uppercase">
                              <span>{client.height}</span>
                              <span>•</span>
                              <span>{client.weight || "--"} LBS</span>
                              <span>•</span>
                              <span className="text-primary">
                                {client.remainingSessions} SESSIONS
                              </span>
                            </div>
                          </div>

                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 grow-2">
                            {/* Last Session Info */}
                            <div className="bg-white dark:bg-bg-dark p-4 rounded-2xl border border-border/50 flex flex-col justify-between">
                              <p className="text-[11px] font-black uppercase tracking-widest text-muted-foreground mb-1">
                                Previous Session
                              </p>
                              {last ? (
                                <div className="space-y-1">
                                  <p className="text-sm font-black">
                                    {new Date(last.date).toLocaleDateString(
                                      [],
                                      {
                                        month: "short",
                                        day: "numeric",
                                        year: "numeric",
                                      },
                                    )}
                                  </p>
                                  <p className="text-[11px] font-bold text-muted-foreground uppercase italic">
                                    TR: {last.trainerInitials}
                                  </p>
                                </div>
                              ) : (
                                <p className="text-xs font-bold text-muted-foreground/30 uppercase italic">
                                  No history
                                </p>
                              )}
                            </div>

                            {/* Next Session Info */}
                            <div className="bg-primary/5 p-4 rounded-2xl border border-primary/10 flex flex-col justify-between">
                              <p className="text-[11px] font-black uppercase tracking-widest text-primary mb-1">
                                Next Scheduled
                              </p>
                              {next ? (
                                <div className="space-y-1">
                                  <p className="text-sm font-black text-primary">
                                    {safeToDate(
                                      next.startTime,
                                    )?.toLocaleDateString([], {
                                      month: "short",
                                      day: "numeric",
                                    })}{" "}
                                    @{" "}
                                    {safeToDate(
                                      next.startTime,
                                    )?.toLocaleTimeString([], {
                                      hour: "2-digit",
                                      minute: "2-digit",
                                    })}
                                  </p>
                                  <p className="text-[11px] font-black text-primary/70 uppercase italic">
                                    TR: {next.trainerName}
                                  </p>
                                </div>
                              ) : (
                                <p className="text-xs font-bold text-muted-foreground/30 uppercase italic">
                                  Not scheduled
                                </p>
                              )}
                            </div>
                          </div>

                          <div className="flex items-center gap-2 shrink-0">
                            <Button
                              variant="outline"
                              className="h-20 w-20 rounded-2xl font-black flex flex-col gap-1 border-2 shadow-sm dark:shadow-none uppercase group-hover:border-primary/20"
                              onClick={() => {
                                setSelectedSessionId(null);
                                onSelectClient(client.id!);
                                setView("history");
                              }}
                            >
                              <History className="w-6 h-6" />
                              <span className="text-[11px]">History</span>
                            </Button>
                            <Button
                              className="h-20 w-20 rounded-2xl font-black flex flex-col gap-1 shadow-lg shadow-primary/20 uppercase"
                              onClick={() => {
                                onSelectClient(client.id!);
                                setView("workouts");
                              }}
                            >
                              <Play className="w-6 h-6 fill-current" />
                              <span className="text-[11px]">Start</span>
                            </Button>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </motion.div>
                );
              })}
              {mergedSearchClients.length === 0 && !isSearchingDb && (
                <div className="py-20 text-center border-2 border-dashed rounded-3xl bg-muted/10 opacity-50">
                  <Users className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                  <p className="text-xs font-black uppercase">
                    No client matches "{searchTerm}"
                  </p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      <Dialog open={isLinking} onOpenChange={setIsLinking}>
        <DialogContent className="rounded-[32px] border-2 w-[calc(100%-2rem)] sm:max-w-md bg-background shadow-2xl dark:shadow-none">
          <DialogHeader>
            <div className="w-12 h-12 rounded-2xl bg-amber-500/10 flex items-center justify-center mb-4">
              <Users className="w-6 h-6 text-amber-500" />
            </div>
            <DialogTitle className="text-2xl font-black uppercase italic tracking-tight">
              Unlinked Reservation
            </DialogTitle>
            <DialogDescription className="font-bold text-xs">
              "{linkingSession?.clientName}" is booked via Mindbody but has no
              Max Strength profile.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6 pt-4">
            <div className="bg-[#F06C22]/5 border-2 border-dashed border-[#F06C22]/20 rounded-2xl p-4 flex flex-col items-center justify-center gap-4 text-center">
              <div className="space-y-1">
                <p className="text-[11px] font-bold text-muted-foreground uppercase">
                  Time Slot
                </p>
                <p className="text-base font-black text-foreground dark:text-white">
                  {linkingSession
                    ? safeToDate(linkingSession.startTime)?.toLocaleTimeString(
                        [],
                        {
                          hour: "2-digit",
                          minute: "2-digit",
                        },
                      )
                    : ""}{" "}
                  with {linkingSession?.trainerName || "Unassigned"}
                </p>
              </div>
              <Button
                className="w-full h-12 rounded-xl font-black bg-cyan border-2 border-cyan shadow-[0_0_15px_rgba(56,189,248,0.3)] hover:shadow-[0_0_20px_rgba(56,189,248,0.5)] text-slate-950 text-xs uppercase"
                onClick={() => {
                  if (onStartNewClientOnboarding) {
                    onStartNewClientOnboarding(
                      linkingSession?.clientName || "",
                      linkingSession?.id
                        ? {
                            scheduleId: linkingSession.id,
                            clientName: linkingSession.clientName || "",
                          }
                        : undefined,
                    );
                  }
                  setIsLinking(false);
                }}
              >
                Create Hub Profile for "{linkingSession?.clientName}"
                <Plus className="w-5 h-5" />
              </Button>
            </div>

            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-background px-2 text-muted-foreground font-bold">
                  Or Link to Existing
                </span>
              </div>
            </div>

            <div className="space-y-2">
              <div className="relative">
                {isSearchingDbLink ? (
                  <Loader2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-sky-500 animate-spin" />
                ) : (
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                )}
                <Input
                  placeholder="Search existing clients..."
                  className="pl-10 h-12 rounded-xl border-2"
                  value={searchTermLink}
                  onChange={(e) => setSearchTermLink(e.target.value)}
                />
              </div>
              <div className="max-h-50 overflow-y-auto space-y-1 pr-2 custom-scrollbar">
                {(() => {
                  const filteredLocal = clients.filter((c) =>
                    `${c.firstName} ${c.lastName}`
                      .toLowerCase()
                      .includes(searchTermLink.toLowerCase()),
                  );
                  const mergedLink = Array.from(
                    new Map(
                      [...filteredLocal, ...dbSearchResultsLink].map((c) => [
                        c.id,
                        c,
                      ]),
                    ).values(),
                  );

                  return mergedLink.map((client) => (
                    <Button
                      key={client.id}
                      variant="ghost"
                      className="w-full h-10 rounded-lg justify-start font-bold text-xs hover:bg-primary/5 hover:text-primary transition-all border border-transparent hover:border-primary/10"
                      onClick={async () => {
                        try {
                          await updateDoc(doc(db, "clients", client.id!), {
                            mindbody_name: linkingSession.clientName,
                          });
                          // Also immediately link the current schedule in Firestore
                          await updateDoc(
                            doc(db, "schedules", linkingSession.id),
                            {
                              clientId: client.id!,
                            },
                          );
                          setIsLinking(false);
                          setSearchTermLink("");
                        } catch (err) {
                          console.error("Link failed:", err);
                        }
                      }}
                    >
                      {client.firstName} {client.lastName}
                    </Button>
                  ));
                })()}
                {clients.length > 0 &&
                  clients.filter((c) =>
                    `${c.firstName} ${c.lastName}`
                      .toLowerCase()
                      .includes(searchTermLink.toLowerCase()),
                  ).length === 0 &&
                  dbSearchResultsLink.length === 0 &&
                  !isSearchingDbLink && (
                    <p className="text-[11px] text-center py-4 text-muted-foreground italic font-medium">
                      No clients match your search
                    </p>
                  )}
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </motion.div>
  );
}
