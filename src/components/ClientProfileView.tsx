import React, { useState, useEffect, useMemo, useCallback } from "react";
import { createPortal } from "react-dom";
import {
  collection,
  onSnapshot,
  query,
  where,
  orderBy,
  limit,
  getDocs,
  addDoc,
  updateDoc,
  setDoc,
  doc,
  serverTimestamp,
  Timestamp,
  getCountFromServer,
  deleteDoc,
  startAfter,
} from "firebase/firestore";
import { db, auth } from "../firebase";
import { studioHour, formatStudioTime } from "../lib/studio-time";
import {
  User,
  Phone,
  Mail,
  MapPin,
  Activity,
  Contact,
  ChevronLeft,
  ChevronRight,
  Edit3,
  Plus,
  Trash2,
  Save,
  Clock,
  Dumbbell,
  TrendingUp,
  AlertCircle,
  Play,
  History,
  Maximize,
  Calendar,
  Maximize2,
  Battery,
  CalendarDays,
  Star,
  Database,
  AlertTriangle,
  Cake,
  UserCheck,
  Award,
  Target,
  X,
  GripVertical,
  ChevronDown,
  ChevronUp,
  Check,
  Search,
  Layout,
  Timer,
  Orbit,
  MessageSquare,
  CheckCircle2,
} from "lucide-react";
import {
  DndContext,
  closestCenter,
  useSensor,
  useSensors,
  PointerSensor,
  KeyboardSensor,
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
import { generateMockClientWithHistory } from "../lib/mockDataGenerator";
import { motion, AnimatePresence } from "motion/react";
import {
  AreaChart,
  Area,
  LineChart,
  Line,
  BarChart,
  Bar,
  ReferenceLine,
  CartesianGrid,
  XAxis,
  YAxis,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  Legend,
} from "recharts";
import { MachineSettingsDashboardModal } from "./MachineSettingsDashboardModal";
import { getMachineStyle } from "../lib/machine-colors";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  CardFooter,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ClientEquipmentPrescriptions } from "./ClientEquipmentPrescriptions";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ROUTINE_TEMPLATES, RoutineTemplateType } from "../constants";
import { ClientFocusDashboard } from "./ClientFocusDashboard";
import { ClientClinicalReviewPreloader } from "./ClientClinicalReviewPreloader";
import { ClientInfoSheet } from "./ClientInfoSheet";
import {
  Client,
  Machine,
  WorkoutSession,
  ExerciseLog,
  Routine,
  RoutineAdjustment,
  View,
  ClientMachineSetting,
  TrainerFocus,
  Trainer,
  ScheduleEntry,
  ProgressReport,
  FocusRecord,
  ClinicalSafetyFlag,
  Studio,
  SessionNote,
  ClinicalIncident,
} from "../types";
import { StickyCTA } from "./StickyCTA";
import { OperationType, handleFirestoreError } from "../lib/firestore-errors";
import { WorkoutChartGrid } from "./WorkoutChartGrid";
import { useToast } from "../contexts/ToastContext";
import { StrongConfirmationModal } from "./StrongConfirmationModal";
import { ClientHistoryCalendar } from "./ClientHistoryCalendar";
import { OccupationSelect } from "./OccupationSelect";
import { getErgonomicRisk } from "../data/occupational-matrix";
import {
  cn,
  parseSessionDate,
  getMillis,
  calculateExerciseVolume,
  getMuscleGroupColor,
  isBig5Machine,
  orderMachineSettings,
} from "../lib/utils";
import { RoutineBuilderView } from "./RoutineBuilderView";
import { CLINICAL_FLAGS_MATRIX } from "../data/clinical-matrix";
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from "@/components/ui/accordion";
import { useActiveSessionCheck } from "../hooks/useActiveSessionCheck";
import { isOwner as checkIsOwner } from "../lib/permissions";
import { FocusCategory } from "../types";

const JOURNAL_CATEGORY_DEFINITIONS: Record<
  FocusCategory,
  {
    icon: any;
    color: string;
    bg: string;
    border: string;
    description: string;
    helper: string;
  }
> = {
  Posture: {
    icon: Layout,
    color: "text-blue-500 dark:text-blue-400",
    bg: "bg-blue-500/10",
    border: "border-blue-500/20",
    description:
      "Rigid midsection and stable setup to prevent energy leaks and ensure precise loading.",
    helper: "Chest up? Posterior pelvic tilt? No momentum?",
  },
  Pace: {
    icon: Timer,
    color: "text-amber-500 dark:text-amber-400",
    bg: "bg-amber-500/10",
    border: "border-amber-500/20",
    description:
      "Smooth, continuous 6-to-10-second speed. No resting at turnarounds.",
    helper: "Constant tension. No 'clunking' at the end of the range.",
  },
  Path: {
    icon: Orbit,
    color: "text-purple-500 dark:text-purple-400",
    bg: "bg-purple-500/10",
    border: "border-purple-500/20",
    description:
      "Maintaining limbs in the exact prescribed plane to force target muscle work.",
    helper: "Straight lines. No shifting load to fresh muscles.",
  },
  Purpose: {
    icon: Target,
    color: "text-cta",
    bg: "bg-cta/10",
    border: "border-cta/20",
    description:
      "Internal focus. Creating maximum tension by moving through resistance.",
    helper: "Mind-muscle connection. Intentional squeezing.",
  },
};

export function ClientProfileView({
  clientId,
  isLoadingClient = false,
  clients,
  machines,
  authTrainer,
  trainers,
  onDelete,
  onSelectReport,
  setView,
  setSelectedClientId,
  hasQuotaError,
  user,
  studios,
  activeStudioId,
}: {
  clientId: string | null;
  /** True while the selected client document is still being fetched. */
  isLoadingClient?: boolean;
  clients: Client[];
  machines: Machine[];
  authTrainer?: Trainer | null;
  trainers: Trainer[];
  onDelete: (id: string) => void;
  onSelectReport: (id: string) => void;
  setView: (v: View, data?: { isIntroSession?: boolean }) => void;
  setSelectedClientId: (id: string | null) => void;
  hasQuotaError?: boolean;
  user?: any;
  studios?: Studio[];
  activeStudioId: string | null;
}) {
  const { success: toastSuccess, error: toastError } = useToast();
  const [reportToDelete, setReportToDelete] = useState<ProgressReport | null>(
    null,
  );
  const [routines, setRoutines] = useState<Routine[]>([]);
  const [allLogs, setAllLogs] = useState<ExerciseLog[]>([]);
  const [sessions, setSessions] = useState<WorkoutSession[]>([]);
  const [clientSettings, setClientSettings] = useState<
    Record<string, ClientMachineSetting>
  >({});
  const [trainerFocuses, setTrainerFocuses] = useState<TrainerFocus[]>([]);
  const [progressReports, setProgressReports] = useState<ProgressReport[]>([]);
  const [showMockConfirm, setShowMockConfirm] = useState(false);

  const performReportDelete = async () => {
    if (!reportToDelete?.id) return;
    try {
      await deleteDoc(doc(db, "progressReports", reportToDelete.id));
      toastSuccess("Progress report deleted successfully.");
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, "progressReports");
    } finally {
      setReportToDelete(null);
    }
  };

  const performMockGeneration = async () => {
    if (!authTrainer) return;
    try {
      const { clientName } = await generateMockClientWithHistory(
        authTrainer.id!,
        authTrainer.initials,
      );
      toastSuccess(`Success: Created ${clientName}`);
      window.location.reload();
    } catch (err: any) {
      toastError(err.message);
    } finally {
      setShowMockConfirm(false);
    }
  };

  const [scheduledSessions, setScheduledSessions] = useState<ScheduleEntry[]>(
    [],
  );
  const [isEditingFocus, setIsEditingFocus] = useState(false);
  const [isEditingSessionCount, setIsEditingSessionCount] = useState(false);
  const [sessionCountInput, setSessionCountInput] = useState("");
  const [focusForm, setFocusForm] = useState<Partial<TrainerFocus>>({
    category: "Path",
    notes: "",
  });
  const [selectedTimingSessionId, setSelectedTimingSessionId] = useState<
    string | null
  >(null);
  const [isSavingFocus, setIsSavingFocus] = useState(false);
  const [isEditingRoutine, setIsEditingRoutine] = useState<string | null>(null);
  const [routineEditData, setRoutineEditData] = useState<{
    name: string;
    machineIds: string[];
  }>({ name: "", machineIds: [] });
  const [highlightRoutine, setHighlightRoutine] = useState<"A" | "B" | null>(
    null,
  );

  // Routines Redesign additions
  const [routineAdjustments, setRoutineAdjustments] = useState<
    RoutineAdjustment[]
  >([]);
  const [selectedRoutineTodayId, setSelectedRoutineTodayId] = useState<
    string | null
  >(null);

  // States for routine edit drawer
  const [isEditDrawerOpen, setIsEditDrawerOpen] = useState(false);
  const [editingRoutineId, setEditingRoutineId] = useState<string | null>(null);
  const [editDrawerMachineIds, setEditDrawerMachineIds] = useState<string[]>(
    [],
  );
  const [editingRoutineName, setEditingRoutineName] = useState<string>("");
  const [originalMachineIdsSnapshot, setOriginalMachineIdsSnapshot] = useState<
    string[]
  >([]);
  const [drawerReason, setDrawerReason] = useState<string>("");
  const [isSavingDrawer, setIsSavingDrawer] = useState(false);
  const [machineSearchQuery, setMachineSearchQuery] = useState("");

  // States for toggle B reason dialog
  const [isToggleReasonDialogOpen, setIsToggleReasonDialogOpen] =
    useState(false);
  const [pendingToggleBValue, setPendingToggleBValue] = useState<
    boolean | null
  >(null);
  const [toggleBReason, setToggleBReason] = useState<string>("");
  const [isSavingToggle, setIsSavingToggle] = useState(false);
  const [historyPage, setHistoryPage] = useState(0);
  const [showFullChart, setShowFullChart] = useState(false);
  const [sessionLimit, setSessionLimit] = useState(10);
  const [lastVisibleSession, setLastVisibleSession] = useState<any>(null);
  const [hasMoreSessions, setHasMoreSessions] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [calculatedSessionCount, setCalculatedSessionCount] =
    useState<number>(0);

  // Use the new soft lock handoff hook
  const { activeInProgressSession, isCheckingActiveSession } =
    useActiveSessionCheck(clientId);

  const client = clients.find((c) => c.id === clientId);

  useEffect(() => {
    if (!clientId) return;
    const fetchSessionCount = async () => {
      try {
        const snapshot = await getCountFromServer(
          query(
            collection(db, "sessions"),
            where("clientId", "==", clientId),
            where("status", "==", "Completed"),
          ),
        );
        const actualCount = snapshot.data().count;
        setCalculatedSessionCount(actualCount);

        // Ensure client document stays perfectly in sync with actual history length
        if (client && client.sessionCount !== actualCount) {
          // Fire and forget update
          updateDoc(doc(db, "clients", clientId), {
            sessionCount: actualCount,
          }).catch(console.error);
        }
      } catch (err) {
        console.error("Error fetching session count", err);
      }
    };
    fetchSessionCount();
  }, [clientId, sessions, client?.sessionCount]); // re-fetch when sessions state changes

  useEffect(() => {
    const handleOpenImport = () => setView("chart-importer" as any);
    window.addEventListener("open-bulk-import", handleOpenImport);
    return () =>
      window.removeEventListener("open-bulk-import", handleOpenImport);
  }, []);

  const [activeTab, setActiveTab] = useState("journey");
  const [isInfoSheetOpen, setIsInfoSheetOpen] = useState(false);
  const [infoSheetTab, setInfoSheetTab] = useState("identity");
  const [journeyDensity, setJourneyDensity] = useState<
    "Compact" | "Comfortable" | "Full"
  >(() => {
    if (typeof window !== "undefined" && clientId) {
      return (
        (localStorage.getItem(`journeyDensity_${clientId}`) as any) ||
        "Comfortable"
      );
    }
    return "Comfortable";
  });

  useEffect(() => {
    if (clientId) {
      localStorage.setItem(`journeyDensity_${clientId}`, journeyDensity);
    }
  }, [journeyDensity, clientId]);

  function getTrainerChipStyles(initials: string) {
    if (!initials) return "bg-ink-l2 text-white";
    const colors = [
      "bg-cyan text-white",
      "bg-cta text-white",
      "bg-green text-ink-l1",
      "bg-amber text-white",
      "bg-ink-l2 text-white",
    ];
    let hash = 0;
    for (let i = 0; i < initials.length; i++) {
      hash = initials.charCodeAt(i) + ((hash << 5) - hash);
    }
    const index = Math.abs(hash) % colors.length;
    return colors[index];
  }

  useEffect(() => {
    setIsInfoSheetOpen(false);
  }, [clientId]);

  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) =>
      e.key === "Escape" && setIsInfoSheetOpen(false);
    window.addEventListener("keydown", handleEsc);
    return () => window.removeEventListener("keydown", handleEsc);
  }, []);
  const [clientNotesInput, setClientNotesInput] = useState("");
  const [isSavingNotes, setIsSavingNotes] = useState(false);
  const [sessionNotes, setSessionNotes] = useState<SessionNote[]>([]);

  // Coaching Journal states
  const [focusRecords, setFocusRecords] = useState<FocusRecord[]>([]);
  const [clinicalIncidents, setClinicalIncidents] = useState<
    ClinicalIncident[]
  >([]);
  const [activeTypeFilter, setActiveTypeFilter] = useState<
    "All" | "Focus" | "Notes" | "Incidents"
  >("All");
  const [activeTrainerFilter, setActiveTrainerFilter] = useState<string>("All");
  const [activeWindowFilter, setActiveWindowFilter] = useState<
    "7d" | "30d" | "90d" | "All"
  >("All");
  const [isAddJournalOpen, setIsAddJournalOpen] = useState(false);
  const [newJournalType, setNewType] = useState<"Focus" | "Note">("Focus");
  const [newFocusCategory, setNewFocusCategory] =
    useState<FocusCategory>("Posture");
  const [newTargetMachineId, setNewTargetMachineId] = useState<string>("none");
  const [newFocusNotes, setNewFocusNotes] = useState<string>("");
  const [newNotePriority, setNewNotePriority] = useState<
    "High" | "Medium" | "Low"
  >("Medium");
  const [newNoteContent, setNewNoteContent] = useState<string>("");
  const [isSavingJournalEntry, setIsSavingJournalEntry] = useState(false);
  const [activeMachine, setActiveMachine] = useState<string | null>(null);
  const [selectedChartMachines, setSelectedChartMachines] = useState<string[]>(
    [],
  );
  const [hasInitializedChartMachines, setHasInitializedChartMachines] =
    useState(false);
  const [infoForm, setInfoForm] = useState<Partial<Client>>({});
  const [newEventForm, setNewEventForm] = useState<{
    date: string;
    title: string;
    type: any;
    notes: string;
  }>({
    date: new Date().toISOString().split("T")[0],
    title: "",
    type: "Other",
    notes: "",
  });
  const [isSavingEvent, setIsSavingEvent] = useState(false);
  const [isSavingInfo, setIsSavingInfo] = useState(false);
  const [stagedMachineIds, setStagedMachineIds] = useState<
    Record<string, string[]>
  >({});
  const [isSavingRoutine, setIsSavingRoutine] = useState<
    Record<string, boolean>
  >({});
  const [routineBuilderTarget, setRoutineBuilderTarget] = useState<
    string | null
  >(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [editingSettings, setEditingSettings] = useState<{
    machineId: string;
    settings: Record<string, string>;
  } | null>(null);
  const [isSavingSettings, setIsSavingSettings] = useState(false);
  const [matrixRoutineFilter, setMatrixRoutineFilter] = useState<string>("all");
  const SESSIONS_PER_PAGE = 3;

  const handleUpdateMachineSettings = async () => {
    if (!editingSettings || !clientId) return;
    setIsSavingSettings(true);
    try {
      const settingId = `${clientId}_${editingSettings.machineId}`;
      await setDoc(
        doc(db, "clientMachineSettings", settingId),
        {
          clientId,
          machineId: editingSettings.machineId,
          settings: editingSettings.settings,
          updatedBy: auth.currentUser?.email || "Unknown",
          updatedAt: serverTimestamp(),
          studioId: clients.find((c) => c.id === clientId)?.homeStudioId || "",
        },
        { merge: true },
      );
      setEditingSettings(null);
    } catch (error) {
      handleFirestoreError(
        error,
        OperationType.UPDATE,
        `clientMachineSettings/${editingSettings.machineId}`,
      );
    } finally {
      setIsSavingSettings(false);
    }
  };

  const formatToMMDDYYYY = (dateVal: any) => {
    if (!dateVal) return "";
    const d = dateVal.toDate ? dateVal.toDate() : new Date(dateVal);
    if (isNaN(d.getTime())) return "";
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    const year = d.getFullYear();
    return `${month}/${day}/${year}`;
  };

  useEffect(() => {
    if (client) {
      setClientNotesInput(client.notes || "");
      setInfoForm({
        firstName: client.firstName,
        lastName: client.lastName,
        email: client.email || "",
        phone: client.phone || "",
        gender: client.gender || "Male",
        height: client.height || "",
        weight: client.weight || "",
        age: client.age ?? null,
        occupation: client.occupation || "",
        isRetired: client.isRetired ?? false,
        clinicalProfile: client.clinicalProfile || [],
        clinicalFlags: client.clinicalFlags || [],
        clinicalNotes: client.clinicalNotes || "",
        activityLevel: client.activityLevel || "Moderate",
        trainingPedigree: client.trainingPedigree || "Novice",
        recoveryMetric: client.recoveryMetric || "Average",
        emergencyContactName: client.emergencyContactName || "",
        emergencyContactPhone: client.emergencyContactPhone || "",
        globalNotes: client.globalNotes || "",
        isActive: client.isActive ?? true,
        isRoutineBActive: client.isRoutineBActive ?? false,
        consultationCompleted: client.consultationCompleted ?? false,
        discoveryNotes: client.discoveryNotes || "",
        packageTier: client.packageTier || "None",
        remainingSessions: client.remainingSessions ?? 0,
        firstSessionDate: client.firstSessionDate || null,
        firstSessionDateRaw: formatToMMDDYYYY(client.firstSessionDate),
      });
    }
  }, [client]);

  const handleSaveInfo = async () => {
    if (!clientId) return;
    setIsSavingInfo(true);
    try {
      const sanitizedData = { ...infoForm };

      // Ensure age is a number or null, not an empty string
      if (sanitizedData.age === "" || sanitizedData.age === undefined) {
        delete sanitizedData.age;
      } else {
        const parsed = parseInt(sanitizedData.age as any, 10);
        sanitizedData.age = isNaN(parsed) ? null : parsed;
      }

      // Ensure remainingSessions is a number
      if (sanitizedData.remainingSessions !== undefined) {
        const parsed = parseInt(sanitizedData.remainingSessions as any, 10);
        sanitizedData.remainingSessions = isNaN(parsed) ? 0 : parsed;
      }

      // Parse firstSessionDate from typed MM/DD/YYYY if present
      if (sanitizedData.firstSessionDateRaw) {
        const cleanRaw = sanitizedData.firstSessionDateRaw.replace(/\D/g, "");
        if (cleanRaw.length === 8) {
          const m = parseInt(cleanRaw.slice(0, 2), 10);
          const d_val = parseInt(cleanRaw.slice(2, 4), 10);
          const y = parseInt(cleanRaw.slice(4, 8), 10);
          if (m >= 1 && m <= 12 && d_val >= 1 && d_val <= 31 && y >= 1900) {
            const selectedDate = new Date(y, m - 1, d_val);
            sanitizedData.firstSessionDate = Timestamp.fromDate(selectedDate);
          }
        } else if (cleanRaw.length === 6) {
          const m = parseInt(cleanRaw.slice(0, 2), 10);
          const d_val = parseInt(cleanRaw.slice(2, 4), 10);
          let y = parseInt(cleanRaw.slice(4, 6), 10);
          if (m >= 1 && m <= 12 && d_val >= 1 && d_val <= 31) {
            y = y < 50 ? 2000 + y : 1900 + y;
            const selectedDate = new Date(y, m - 1, d_val);
            sanitizedData.firstSessionDate = Timestamp.fromDate(selectedDate);
          }
        }
      }
      delete (sanitizedData as any).firstSessionDateRaw;

      // Cleanup other potentially empty strings to null or delete them if rules prefer
      Object.keys(sanitizedData).forEach((key) => {
        if ((sanitizedData as any)[key] === undefined) {
          delete (sanitizedData as any)[key];
        }
      });

      await updateDoc(doc(db, "clients", clientId), {
        ...sanitizedData,
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `clients/${clientId}`);
    } finally {
      setIsSavingInfo(false);
    }
  };

  const handleSaveNotes = async () => {
    if (!clientId) return;
    setIsSavingNotes(true);
    try {
      await updateDoc(doc(db, "clients", clientId), {
        notes: clientNotesInput,
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `clients/${clientId}`);
    } finally {
      setIsSavingNotes(false);
    }
  };

  const formatDateForInput = (dateVal: any) => {
    if (!dateVal) return "";
    const d = dateVal.toDate ? dateVal.toDate() : new Date(dateVal);
    if (isNaN(d.getTime())) return "";
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  };

  const handleStartDateChange = async (newVal: string) => {
    if (!clientId || !newVal) return;
    try {
      let selectedDate: Date;
      if (newVal.includes("/")) {
        const parts = newVal.split("/");
        const month = parseInt(parts[0], 10);
        const day = parseInt(parts[1], 10);
        const year = parseInt(parts[2], 10);
        selectedDate = new Date(year, month - 1, day);
      } else {
        selectedDate = new Date(newVal + "T00:00:00");
      }
      const timestamp = Timestamp.fromDate(selectedDate);
      await updateDoc(doc(db, "clients", clientId), {
        firstSessionDate: timestamp,
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `clients/${clientId}`);
    }
  };

  // Coaching Journal lookup maps for O(1) trainer lookup
  const trainerMap = useMemo(() => {
    return new Map(trainers.map((t) => [t.id, t]));
  }, [trainers]);

  const initialsMap = useMemo(() => {
    return new Map(trainers.map((t) => [t.initials.toUpperCase(), t]));
  }, [trainers]);

  // Deterministic chip color classes for trainer initials (Utilizing Design Tokens)
  const getTrainerChipClasses = (initials: string) => {
    const chars = (initials || "TR").toUpperCase();
    const sum = chars
      .split("")
      .reduce((acc, char) => acc + char.charCodeAt(0), 0);
    const styles = [
      "bg-cyan/10 text-cyan dark:bg-cyan/20 border-cyan/20",
      "bg-cta/10 text-[#F06C22] dark:text-[#F06C22] dark:bg-cta/20 border-cta/20",
      "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 dark:bg-emerald-500/20 border-emerald-500/10",
      "bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 dark:bg-indigo-500/20 border-indigo-500/10",
      "bg-purple-500/10 text-purple-600 dark:text-purple-400 dark:bg-purple-500/20 border-purple-500/10",
      "bg-pink-500/10 text-pink-600 dark:text-pink-400 dark:bg-pink-500/20 border-pink-500/10",
    ];
    return styles[sum % styles.length];
  };

  // Discriminated union type representing an entry in Sandra's coaching journal.
  type JournalEntry =
    | {
        id: string;
        type: "focus";
        date: Date;
        trainerId: string;
        trainer: string;
        content: string;
        category: FocusCategory;
        status: "Active" | "Achieved";
        targetMachineId?: string;
        raw: FocusRecord;
      }
    | {
        id: string;
        type: "note";
        date: Date;
        trainerId: string;
        trainer: string;
        content: string;
        priority: "High" | "Medium" | "Low";
      }
    | {
        id: string;
        type: "session_note";
        date: Date;
        trainerId: string;
        trainer: string;
        content: string;
        priority?: "High" | "Medium" | "Low";
      }
    | {
        id: string;
        type: "incident";
        date: Date;
        trainerId: string;
        trainer: string;
        content: string;
        resolvedAt?: any;
        raw: ClinicalIncident;
      };

  // Compile and merge all disparate intelligence source logs chronologically
  const mergedJournalEntries = useMemo(() => {
    const list: JournalEntry[] = [];

    // A. Focus Records
    focusRecords.forEach((f) => {
      let d = new Date();
      if (f.dateAssigned) {
        d = f.dateAssigned.toDate
          ? f.dateAssigned.toDate()
          : new Date(f.dateAssigned);
      }
      const tId =
        f.trainerId ||
        (f.assignedBy
          ? initialsMap.get(f.assignedBy.toUpperCase())?.id || "unknown"
          : "unknown");
      list.push({
        id: f.id,
        type: "focus",
        date: d,
        trainerId: tId,
        trainer: f.assignedBy || "TR",
        content: f.clinicalNotes,
        category: f.category,
        status: f.status,
        targetMachineId: f.targetMachineId || undefined,
        raw: f,
      });
    });

    // B. Explicit sessionNotes collection logs
    sessionNotes.forEach((sn) => {
      let d = new Date();
      if (sn.createdAt) {
        d = sn.createdAt.toDate
          ? sn.createdAt.toDate()
          : new Date(sn.createdAt);
      }
      const tId =
        sn.trainerId ||
        (sn.trainerInitials
          ? initialsMap.get(sn.trainerInitials.toUpperCase())?.id || "unknown"
          : "unknown");
      list.push({
        id: sn.id || Math.random().toString(),
        type: "session_note",
        date: d,
        trainerId: tId,
        trainer: sn.trainerInitials || "TR",
        content: sn.content,
        priority: sn.priority || "Medium",
      });
    });

    // C. Traditional workout standard notes merged as session_note
    sessions.forEach((s) => {
      if (s.notes && s.notes.trim()) {
        let d = new Date();
        if (s.startTime) {
          d = s.startTime.toDate ? s.startTime.toDate() : new Date(s.startTime);
        } else if (s.date) {
          d = new Date(s.date + "T12:00:00");
        }
        const tId =
          s.trainerId ||
          (s.trainerInitials
            ? initialsMap.get(s.trainerInitials.toUpperCase())?.id || "unknown"
            : "unknown");
        list.push({
          id: `session-briefing-${s.id}`,
          type: "session_note",
          date: d,
          trainerId: tId,
          trainer: s.trainerInitials || "TR",
          content: s.notes,
        });
      }
    });

    // D. Global notes from core profile fields
    if (client?.notes && client.notes.trim()) {
      let d = new Date();
      const anyClient = client as any;
      if (anyClient.updatedAt) {
        d = anyClient.updatedAt.toDate
          ? anyClient.updatedAt.toDate()
          : new Date(anyClient.updatedAt);
      } else if (anyClient.createdAt) {
        d = anyClient.createdAt.toDate
          ? anyClient.createdAt.toDate()
          : new Date(anyClient.createdAt);
      }
      list.push({
        id: "profile-global-notes",
        type: "note",
        date: d,
        trainerId: "profile-fields",
        trainer: "SYS",
        content: client.notes,
        priority: "Medium",
      });
    }

    // E. Clinical safety incident records
    clinicalIncidents.forEach((ci) => {
      let d = new Date();
      if (ci.createdAt) {
        d = ci.createdAt.toDate
          ? ci.createdAt.toDate()
          : new Date(ci.createdAt);
      }
      const tId = ci.reportedByTrainerId || "unknown";
      list.push({
        id: ci.id || Math.random().toString(),
        type: "incident",
        date: d,
        trainerId: tId,
        trainer: trainerMap.get(tId)?.initials || "TR",
        content: ci.description,
        resolvedAt: ci.resolvedAt,
        raw: ci,
      });
    });

    // Order chronological descending (newest first)
    return list.sort((a, b) => b.date.getTime() - a.date.getTime());
  }, [
    focusRecords,
    sessionNotes,
    sessions,
    client,
    clinicalIncidents,
    trainerMap,
    initialsMap,
  ]);

  // Derive per-trainer entry summary states (O(1) with indexed lookup)
  const perTrainerSummary = useMemo(() => {
    const summaryMap = new Map<
      string,
      {
        trainerId: string;
        trainerInitials: string;
        trainerName: string;
        currentFocus: string | null;
        entryCount: number;
        lastEntryDate: Date | null;
      }
    >();

    mergedJournalEntries.forEach((entry) => {
      if (entry.trainerId === "profile-fields" || entry.trainerId === "unknown")
        return;

      const trainerObj =
        trainerMap.get(entry.trainerId) ||
        initialsMap.get(entry.trainer.toUpperCase());
      const tId = trainerObj?.id || entry.trainerId;
      const tName = trainerObj?.fullName || entry.trainer || "Coach";
      const tInitials = trainerObj?.initials || entry.trainer || "TR";

      if (!summaryMap.has(tId)) {
        summaryMap.set(tId, {
          trainerId: tId,
          trainerInitials: tInitials.toUpperCase(),
          trainerName: tName,
          currentFocus: null,
          entryCount: 0,
          lastEntryDate: null,
        });
      }

      const summary = summaryMap.get(tId)!;
      summary.entryCount += 1;

      if (!summary.lastEntryDate || entry.date > summary.lastEntryDate) {
        summary.lastEntryDate = entry.date;
      }
    });

    focusRecords.forEach((f) => {
      if (f.status === "Active") {
        const trainerObj =
          trainerMap.get(f.trainerId) ||
          initialsMap.get(f.assignedBy.toUpperCase());
        const tId = trainerObj?.id || f.trainerId;
        if (tId && summaryMap.has(tId)) {
          const summary = summaryMap.get(tId)!;
          if (!summary.currentFocus) {
            summary.currentFocus = `${f.category}${f.targetMachineId ? ` on ${machines.find((m) => m.id === f.targetMachineId)?.name || "unit"}` : ""}: "${f.clinicalNotes}"`;
          }
        }
      }
    });

    return Array.from(summaryMap.values());
  }, [mergedJournalEntries, focusRecords, trainerMap, initialsMap, machines]);

  // Final filtered list based on the active state of filter widgets
  const filteredJournalEntries = useMemo(() => {
    let list = mergedJournalEntries;

    if (activeTypeFilter === "Focus") {
      list = list.filter((e) => e.type === "focus");
    } else if (activeTypeFilter === "Notes") {
      list = list.filter((e) => e.type === "note" || e.type === "session_note");
    } else if (activeTypeFilter === "Incidents") {
      list = list.filter((e) => e.type === "incident");
    }

    if (activeTrainerFilter !== "All") {
      list = list.filter((e) => {
        const trainerObj =
          trainerMap.get(e.trainerId) ||
          initialsMap.get(e.trainer.toUpperCase());
        const tId = trainerObj?.id || e.trainerId;
        const targetTrainerObj =
          trainerMap.get(activeTrainerFilter) ||
          initialsMap.get(activeTrainerFilter.toUpperCase());
        const targetId = targetTrainerObj?.id || activeTrainerFilter;
        return tId === targetId;
      });
    }

    if (activeWindowFilter !== "All") {
      const msInDay = 24 * 60 * 60 * 1000;
      const now = Date.now();
      const limitDays =
        activeWindowFilter === "7d"
          ? 7
          : activeWindowFilter === "30d"
            ? 30
            : 90;
      list = list.filter((e) => {
        const diffDays = (now - e.date.getTime()) / msInDay;
        return diffDays <= limitDays;
      });
    }

    return list;
  }, [
    mergedJournalEntries,
    activeTypeFilter,
    activeTrainerFilter,
    activeWindowFilter,
    trainerMap,
    initialsMap,
  ]);

  // Submits a new journal entry into clinical database logs
  const handleSubmitJournalEntry = async () => {
    if (!clientId || !client) return;
    setIsSavingJournalEntry(true);
    try {
      if (newJournalType === "Focus") {
        if (!newFocusCategory || !newFocusNotes.trim()) {
          setIsSavingJournalEntry(false);
          return;
        }

        await addDoc(collection(db, "focusRecords"), {
          clientId,
          category: newFocusCategory,
          targetMachineId:
            newTargetMachineId === "none" ? null : newTargetMachineId,
          clinicalNotes: newFocusNotes.trim(),
          status: "Active",
          assignedBy: authTrainer?.initials || "TR",
          trainerId: authTrainer?.id || "unknown",
          dateAssigned: serverTimestamp(),
          studioId: client.homeStudioId || "",
        });
      } else {
        if (!newNoteContent.trim()) {
          setIsSavingJournalEntry(false);
          return;
        }

        await addDoc(collection(db, "sessionNotes"), {
          clientId,
          content: newNoteContent.trim(),
          priority: newNotePriority,
          trainerId: authTrainer?.id || "unknown",
          trainerInitials: authTrainer?.initials || "TR",
          createdAt: serverTimestamp(),
          studioId: client.homeStudioId || "",
        });
      }

      setNewFocusNotes("");
      setNewNoteContent("");
      setNewFocusCategory("Posture");
      setNewTargetMachineId("none");
      setNewNotePriority("Medium");
      setIsAddJournalOpen(false);
    } catch (error) {
      handleFirestoreError(
        error,
        OperationType.CREATE,
        newJournalType === "Focus" ? "focusRecords" : "sessionNotes",
      );
    } finally {
      setIsSavingJournalEntry(false);
    }
  };

  // Toggle active focus status off to Achieved ledger status
  const handleMarkFocusAchieved = async (id: string) => {
    try {
      await updateDoc(doc(db, "focusRecords", id), {
        status: "Achieved",
        dateUpdated: serverTimestamp(),
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `focusRecords/${id}`);
    }
  };

  // Human-readable relative date string
  const getDaysAgo = (d: Date | null) => {
    if (!d) return "no entries";
    const diffMs = Date.now() - d.getTime();
    if (diffMs < 0) return "today";
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    if (diffDays === 0) return "today";
    if (diffDays === 1) return "1 day ago";
    return `${diffDays} days ago`;
  };

  const getCombinedTimelineNotes = () => {
    const list: {
      id: string;
      date: Date;
      type: "pre" | "during" | "post" | "general" | "session_note";
      title: string;
      content: string;
      trainer: string;
      priority?: string;
    }[] = [];

    // Add sessionNotes collection documents
    sessionNotes.forEach((sn) => {
      let d = new Date();
      if (sn.createdAt) {
        d = sn.createdAt.toDate
          ? sn.createdAt.toDate()
          : new Date(sn.createdAt);
      }
      list.push({
        id: sn.id || Math.random().toString(),
        date: d,
        type: "session_note",
        title: sn.priority
          ? `Session Note (${sn.priority} Priority)`
          : "Session Note",
        content: sn.content,
        trainer: sn.trainerInitials || "Coach",
        priority: sn.priority,
      });
    });

    // Add WorkoutSession standard notes
    sessions.forEach((s) => {
      if (s.notes && s.notes.trim()) {
        let d = new Date();
        if (s.startTime) {
          d = s.startTime.toDate ? s.startTime.toDate() : new Date(s.startTime);
        } else if (s.date) {
          d = new Date(s.date + "T12:00:00");
        }
        list.push({
          id: `session-notes-${s.id}`,
          date: d,
          type: "during",
          title: s.sessionType
            ? `${s.sessionType} Session Briefing`
            : "Session Briefing",
          content: s.notes,
          trainer: s.trainerInitials || "Coach",
        });
      }
    });

    // Sort list chronologically descending (newest first)
    return list.sort((a, b) => b.date.getTime() - a.date.getTime());
  };

  const handleAddEvent = async () => {
    if (!clientId || !client || !newEventForm.title || !newEventForm.date)
      return;
    setIsSavingEvent(true);
    try {
      let priority: "High" | "Medium" | "Low" = "Low";
      if (
        newEventForm.type === "Progress Report" ||
        newEventForm.type === "InBody Scan"
      )
        priority = "High";
      else if (newEventForm.type === "Routine Change") priority = "Medium";

      const newEvent = {
        id: Math.random().toString(36).substring(2, 9),
        ...newEventForm,
        priority,
        createdAt: new Date().toISOString(),
      };

      const updatedEvents = [...(client.events || []), newEvent];
      await updateDoc(doc(db, "clients", clientId), {
        events: updatedEvents,
        updatedAt: serverTimestamp(),
      });
      setNewEventForm({
        date: new Date().toISOString().split("T")[0],
        title: "",
        type: "Other",
        notes: "",
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `clients/${clientId}`);
    } finally {
      setIsSavingEvent(false);
    }
  };

  const handleDeleteEvent = async (eventId: string) => {
    if (!clientId || !client?.events) return;
    try {
      const updatedEvents = client.events.filter((e) => e.id !== eventId);
      await updateDoc(doc(db, "clients", clientId), {
        events: updatedEvents,
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `clients/${clientId}`);
    }
  };

  const handleSaveSessionCount = async () => {
    if (!clientId) return;
    const num = parseInt(sessionCountInput, 10);
    if (isNaN(num)) return;

    try {
      await updateDoc(doc(db, "clients", clientId), {
        sessionCount: num,
        updatedAt: serverTimestamp(),
      });
      setIsEditingSessionCount(false);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `clients/${clientId}`);
    }
  };

  const handleToggleRoutineB = async (checked: boolean) => {
    if (!clientId) return;
    try {
      await updateDoc(doc(db, "clients", clientId), {
        isRoutineBActive: checked,
        updatedAt: serverTimestamp(),
      });
      setInfoForm((prev) => ({ ...prev, isRoutineBActive: checked }));
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `clients/${clientId}`);
    }
  };

  const toggleMachineInRoutine = (routineName: string, machineId: string) => {
    const current = stagedMachineIds[routineName] || [];
    const next = current.includes(machineId)
      ? current.filter((id) => id !== machineId)
      : [...current, machineId];

    setStagedMachineIds((prev) => ({ ...prev, [routineName]: next }));
  };

  const handleSaveRoutineConfig = async (routineName: string) => {
    if (!clientId) return;
    const machineIds = stagedMachineIds[routineName] || [];

    setIsSavingRoutine((prev) => ({ ...prev, [routineName]: true }));
    try {
      const existing = routines.find((r) => r.name === routineName);
      if (existing) {
        await updateDoc(doc(db, "routines", existing.id!), {
          machineIds,
          updatedAt: serverTimestamp(),
        });
      } else {
        await addDoc(collection(db, "routines"), {
          clientId,
          name: routineName,
          machineIds,
          createdAt: serverTimestamp(),
          studioId: clients.find((c) => c.id === clientId)?.homeStudioId || "",
        });
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, "routines");
    } finally {
      setIsSavingRoutine((prev) => ({ ...prev, [routineName]: false }));
    }
  };

  const handleApplyTemplate = (
    templateType: RoutineTemplateType,
    routineName: string,
  ) => {
    if (!clientId) return;

    const templateNames = ROUTINE_TEMPLATES[templateType];
    const machineIds = templateNames
      .map(
        (name) =>
          machines.find((m) => m.name === name || m.fullName === name)?.id,
      )
      .filter((id): id is string => !!id);

    setStagedMachineIds((prev) => ({ ...prev, [routineName]: machineIds }));

    if (routineName?.includes("Routine B")) {
      handleToggleRoutineB(true);
    }
  };

  useEffect(() => {
    if (!clientId || hasQuotaError) return;

    const fetchRoutines = async () => {
      try {
        const routinesQuery = query(
          collection(db, "routines"),
          where("clientId", "==", clientId),
        );
        const snap = await getDocs(routinesQuery);
        const routinesData = snap.docs.map(
          (doc) => ({ id: doc.id, ...doc.data() }) as Routine,
        );
        setRoutines(routinesData);

        setStagedMachineIds((prev) => {
          const newStaged: Record<string, string[]> = { ...prev };
          routinesData.forEach((r) => {
            if (!prev[r.name]) {
              newStaged[r.name] = r.machineIds;
            }
          });
          return newStaged;
        });
      } catch (error: any) {
        handleFirestoreError(error, OperationType.GET, "routines");
      }
    };

    fetchRoutines();
  }, [clientId, hasQuotaError]);

  useEffect(() => {
    if (!clientId || hasQuotaError) return;

    const q = query(
      collection(db, "routineAdjustments"),
      where("clientId", "==", clientId),
    );

    const unsubscribe = onSnapshot(
      q,
      (snap) => {
        const adjustments = snap.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        })) as RoutineAdjustment[];
        // Sort desc by createdAt, handling firestore Timestamp properly
        adjustments.sort((a, b) => {
          const timeA =
            a.createdAt?.toMillis?.() ||
            (typeof a.createdAt === "number" ? a.createdAt : 0);
          const timeB =
            b.createdAt?.toMillis?.() ||
            (typeof b.createdAt === "number" ? b.createdAt : 0);
          return timeB - timeA;
        });
        setRoutineAdjustments(adjustments);
      },
      (error) => {
        console.error("Error fetching routine adjustments:", error);
      },
    );

    return () => unsubscribe();
  }, [clientId, hasQuotaError]);

  useEffect(() => {
    if (activeInProgressSession?.routineId) {
      setSelectedRoutineTodayId(activeInProgressSession.routineId);
    } else if (client?.preferredTodayRoutineId) {
      setSelectedRoutineTodayId(client.preferredTodayRoutineId);
    } else {
      setSelectedRoutineTodayId(null);
    }
  }, [activeInProgressSession?.routineId, client?.preferredTodayRoutineId]);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const handleDragEndDrawer = (event: DragEndEvent) => {
    const { active, over } = event;
    if (active && over && active.id !== over.id) {
      setEditDrawerMachineIds((items) => {
        const oldIndex = items.indexOf(active.id as string);
        const newIndex = items.indexOf(over.id as string);
        return arrayMove(items, oldIndex, newIndex);
      });
    }
  };

  const handleOpenEditDrawer = (r: Routine) => {
    setEditingRoutineId(r.id || null);
    setEditingRoutineName(r.name);
    setEditDrawerMachineIds([...r.machineIds]);
    setOriginalMachineIdsSnapshot([...r.machineIds]);
    setDrawerReason("");
    setMachineSearchQuery("");
    setIsEditDrawerOpen(true);
  };

  const handleSaveEditDrawer = async () => {
    if (!editingRoutineId || !clientId) return;
    if (drawerReason.trim().length < 12) return;

    setIsSavingDrawer(true);
    try {
      const routineName =
        editingRoutineId.includes("-a") ||
        editingRoutineId.includes("A") ||
        editingRoutineName === "Routine A"
          ? "Routine A"
          : "Routine B";

      let finalId = editingRoutineId;
      if (editingRoutineId.startsWith("temp-")) {
        const docRef = await addDoc(collection(db, "routines"), {
          clientId,
          name: routineName,
          machineIds: editDrawerMachineIds,
          createdAt: serverTimestamp(),
          studioId: client?.homeStudioId || activeStudioId || "",
        });
        finalId = docRef.id;

        await addDoc(collection(db, "routineAdjustments"), {
          clientId,
          routineId: finalId,
          previousMachineIds: [],
          newMachineIds: editDrawerMachineIds,
          trainerId: authTrainer?.id || "unknown",
          notes: drawerReason,
          studioId: client?.homeStudioId || activeStudioId || "",
          changeType: "created",
          createdAt: serverTimestamp(),
        });
      } else {
        await updateDoc(doc(db, "routines", editingRoutineId), {
          machineIds: editDrawerMachineIds,
          updatedAt: serverTimestamp(),
        });

        await addDoc(collection(db, "routineAdjustments"), {
          clientId,
          routineId: editingRoutineId,
          previousMachineIds: originalMachineIdsSnapshot,
          newMachineIds: editDrawerMachineIds,
          trainerId: authTrainer?.id || "unknown",
          notes: drawerReason,
          studioId: client?.homeStudioId || activeStudioId || "",
          changeType: "machines",
          createdAt: serverTimestamp(),
        });
      }

      // Re-trigger routines fetch
      const qRoutines = query(
        collection(db, "routines"),
        where("clientId", "==", clientId),
      );
      const snap = await getDocs(qRoutines);
      setRoutines(
        snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }) as Routine),
      );

      setIsEditDrawerOpen(false);
      setDrawerReason("");
    } catch (error) {
      console.error("Error saving routine edit drawer:", error);
    } finally {
      setIsSavingDrawer(false);
    }
  };

  const handlePromptToggleB = (checked: boolean) => {
    setPendingToggleBValue(checked);
    setToggleBReason("");
    setIsToggleReasonDialogOpen(true);
  };

  const handleConfirmToggleB = async () => {
    if (pendingToggleBValue === null || !clientId) return;
    if (toggleBReason.trim().length < 12) return;

    setIsSavingToggle(true);
    try {
      await updateDoc(doc(db, "clients", clientId), {
        isRoutineBActive: pendingToggleBValue,
      });

      const routineName = "Routine B";
      let routine = routines.find((r) => r.name === routineName);
      let routineId = routine?.id || "temp-b";

      if (routineId === "temp-b") {
        const docRef = await addDoc(collection(db, "routines"), {
          clientId,
          name: routineName,
          machineIds: [],
          createdAt: serverTimestamp(),
          studioId: client?.homeStudioId || activeStudioId || "",
        });
        routineId = docRef.id;
      }

      await addDoc(collection(db, "routineAdjustments"), {
        clientId,
        routineId,
        previousMachineIds: routine?.machineIds || [],
        newMachineIds: routine?.machineIds || [],
        trainerId: authTrainer?.id || "unknown",
        notes: toggleBReason,
        studioId: client?.homeStudioId || activeStudioId || "",
        changeType: pendingToggleBValue ? "enabled" : "disabled",
        createdAt: serverTimestamp(),
      });

      if (client) {
        client.isRoutineBActive = pendingToggleBValue;
      }

      // Re-trigger routines fetch
      const qRoutines = query(
        collection(db, "routines"),
        where("clientId", "==", clientId),
      );
      const snap = await getDocs(qRoutines);
      setRoutines(
        snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }) as Routine),
      );

      setIsToggleReasonDialogOpen(false);
      setToggleBReason("");
    } catch (err) {
      console.error("Error toggling Routine B:", err);
    } finally {
      setIsSavingToggle(false);
    }
  };

  const handleUseToday = async (routine: Routine) => {
    if (!clientId) return;

    let rotId = routine.id;
    if (rotId.startsWith("temp-")) {
      const rotName = rotId === "temp-a" ? "Routine A" : "Routine B";
      const docRef = await addDoc(collection(db, "routines"), {
        clientId,
        name: rotName,
        machineIds: [],
        createdAt: serverTimestamp(),
        studioId: client?.homeStudioId || activeStudioId || "",
      });
      rotId = docRef.id;

      const qRoutines = query(
        collection(db, "routines"),
        where("clientId", "==", clientId),
      );
      const snap = await getDocs(qRoutines);
      setRoutines(
        snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }) as Routine),
      );
    }

    try {
      await updateDoc(doc(db, "clients", clientId), {
        preferredTodayRoutineId: rotId,
      });

      if (activeInProgressSession?.id) {
        await updateDoc(doc(db, "sessions", activeInProgressSession.id), {
          routineId: rotId,
        });
      }

      setSelectedRoutineTodayId(rotId || null);
    } catch (err) {
      console.error("Error setting routine today:", err);
    }
  };

  const calculateChangesThisMonth = useCallback(
    (adjustments: RoutineAdjustment[]) => {
      const now = new Date();
      const currentMonth = now.getMonth();
      const currentYear = now.getFullYear();

      return adjustments.filter((adj) => {
        if (!adj.createdAt) return false;
        const time =
          adj.createdAt.toMillis?.() ||
          (typeof adj.createdAt === "number" ? adj.createdAt : 0);
        if (!time) return false;
        const d = new Date(time);
        return d.getMonth() === currentMonth && d.getFullYear() === currentYear;
      }).length;
    },
    [],
  );

  const getAdjustmentDiff = useCallback(
    (adj: RoutineAdjustment) => {
      const addedIds = adj.newMachineIds.filter(
        (id) => !adj.previousMachineIds.includes(id),
      );
      const removedIds = adj.previousMachineIds.filter(
        (id) => !adj.newMachineIds.includes(id),
      );

      const addedNames = addedIds
        .map((id) => machines.find((m) => m.id === id)?.name || "Unknown")
        .filter(Boolean);
      const removedNames = removedIds
        .map((id) => machines.find((m) => m.id === id)?.name || "Unknown")
        .filter(Boolean);

      return { addedNames, removedNames };
    },
    [machines],
  );

  const availableMachines = useMemo(() => {
    return machines.filter((m) => {
      if (editDrawerMachineIds.includes(m.id!)) return false;
      if (machineSearchQuery) {
        const q = machineSearchQuery.toLowerCase();
        const nameMatch = m.name?.toLowerCase().includes(q);
        const fullNameMatch = m.fullName?.toLowerCase().includes(q);
        const regionMatch = m.anatomicalRegion?.toLowerCase().includes(q);
        return nameMatch || fullNameMatch || regionMatch;
      }
      return true;
    });
  }, [machines, editDrawerMachineIds, machineSearchQuery]);

  const getSelectedRoutineLabel = () => {
    if (!selectedRoutineTodayId) return "";
    const found = routines.find((r) => r.id === selectedRoutineTodayId);
    if (found) return found.name.toUpperCase();
    if (
      selectedRoutineTodayId.includes("-a") ||
      selectedRoutineTodayId.includes("A")
    )
      return "ROUTINE A";
    if (
      selectedRoutineTodayId.includes("-b") ||
      selectedRoutineTodayId.includes("B")
    )
      return "ROUTINE B";
    return "ROUTINE";
  };

  const renderRoutineCard = (routineName: "Routine A" | "Routine B") => {
    const raw = routines.find((r) => r.name === routineName);
    const routine: Routine = raw || {
      id: routineName === "Routine A" ? "temp-a" : "temp-b",
      name: routineName,
      clientId: clientId || "",
      machineIds: [],
      studioId: client?.homeStudioId || "",
    };

    const isB = routineName === "Routine B";
    const isBActive = !isB || !!client?.isRoutineBActive;

    const getLastChangedText = () => {
      const adjs = routineAdjustments.filter((a) => a.routineId === routine.id);
      if (adjs.length === 0) {
        if (routine.updatedAt) {
          return `last changed long ago`;
        }
        return `no changes logged yet`;
      }
      const latest = adjs[0];
      const trainer = trainers.find((t) => t.id === latest.trainerId);
      const trainerInitials =
        trainer?.initials ||
        latest.trainerId?.substring(0, 2).toUpperCase() ||
        "TR";

      let diffDays = 0;
      if (latest.createdAt) {
        const time =
          latest.createdAt.toMillis?.() ||
          (typeof latest.createdAt === "number" ? latest.createdAt : 0);
        if (time) {
          const diffMs = Date.now() - time;
          diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
        }
      }

      if (diffDays <= 0) {
        return `last changed today by ${trainerInitials}`;
      } else if (diffDays === 1) {
        return `last changed 1 day ago by ${trainerInitials}`;
      } else {
        return `last changed ${diffDays} days ago by ${trainerInitials}`;
      }
    };

    const isTodaySelected = selectedRoutineTodayId === routine.id;

    return (
      <Card
        key={routineName}
        className={cn(
          "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm transition-all overflow-hidden flex flex-col relative",
          isTodaySelected &&
            "ring-2 ring-cyan shadow-[0_0_20px_rgba(6,182,212,0.3)] border-cyan/40",
          !isBActive && "opacity-60 grayscale-15",
        )}
      >
        {isTodaySelected && (
          <div className="absolute top-0 left-0 right-0 h-1 bg-cyan" />
        )}

        <CardHeader className="p-5 lg:p-6 pb-4 border-b border-slate-100 dark:border-slate-800/40 bg-slate-50/50 dark:bg-slate-900/40">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div
                className={cn(
                  "w-12 h-12 rounded-xl flex items-center justify-center text-xl font-bold font-sans italic shadow-sm text-white",
                  isB ? "bg-cta shadow-cta/20" : "bg-cyan shadow-cyan/20",
                )}
              >
                {routineName.split(" ")[1]}
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <CardTitle className="text-lg lg:text-xl font-bold uppercase tracking-tight text-slate-800 dark:text-neutral-100">
                    {routineName}
                  </CardTitle>
                  {isB && (
                    <div className="flex items-center gap-1.5 bg-slate-100 dark:bg-slate-800 px-2.5 py-1 rounded-full border border-slate-200 dark:border-slate-700 select-none">
                      <span
                        className={cn(
                          "inline-block w-1.5 h-1.5 rounded-full",
                          client?.isRoutineBActive
                            ? "bg-emerald-500 animate-pulse"
                            : "bg-slate-400",
                        )}
                      />
                      <span className="text-[9px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300">
                        {client?.isRoutineBActive
                          ? "Protocol B Active"
                          : "B Inactive"}
                      </span>
                      <Switch
                        checked={!!client?.isRoutineBActive}
                        onCheckedChange={(checked) =>
                          handlePromptToggleB(checked)
                        }
                        className="scale-75 touch-none pointer-events-auto"
                      />
                    </div>
                  )}
                </div>
                <p className="text-[10px] text-slate-400 font-mono tracking-wide mt-0.5">
                  {routine.machineIds.length}{" "}
                  {routine.machineIds.length === 1 ? "unit" : "units"}{" "}
                  assignment · {getLastChangedText()}
                </p>
              </div>
            </div>

            {isBActive && (
              <div className="flex items-center gap-2 self-end sm:self-auto shrink-0 animate-fade-in animate-duration-150">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-9 rounded-xl font-bold uppercase text-[11px] tracking-wider border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 transition-all px-4"
                  onClick={() => handleOpenEditDrawer(routine)}
                >
                  Edit
                </Button>
                <Button
                  variant={isTodaySelected ? "default" : "outline"}
                  size="sm"
                  className={cn(
                    "h-9 rounded-xl font-bold uppercase text-[11px] tracking-wider transition-all px-4",
                    isTodaySelected
                      ? "bg-cyan hover:bg-cyan/90 border-transparent text-white"
                      : "border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800",
                  )}
                  onClick={() => handleUseToday(routine)}
                >
                  {isTodaySelected ? "Active Today" : "Use Today"}
                </Button>
              </div>
            )}
          </div>
        </CardHeader>

        <CardContent className="p-5 lg:p-6 flex-1">
          {routine.machineIds.length === 0 ? (
            <div className="py-8 text-center border-2 border-dashed border-slate-200 dark:border-slate-800/40 rounded-xl bg-slate-50/40 dark:bg-slate-900/10 flex flex-col items-center justify-center p-4">
              <p className="text-xs text-slate-400 font-medium font-sans uppercase tracking-widest mb-3">
                No Machines Assigned
              </p>
              {isBActive && (
                <Button
                  onClick={() => handleOpenEditDrawer(routine)}
                  variant="outline"
                  size="sm"
                  className="text-xs font-bold uppercase tracking-wider rounded-xl border-slate-200 dark:border-slate-800"
                >
                  Configure Routine
                </Button>
              )}
            </div>
          ) : (
            <div className="space-y-2">
              {routine.machineIds.map((machineId, idx) => {
                const machine = machines.find((m) => m.id === machineId);
                if (!machine) return null;

                const metric = client?.currentMachineMetrics?.[machineId];
                const latestSessionWithLog = sessions.find((s) =>
                  allLogs?.some(
                    (l) => l.sessionId === s.id && l.machineId === machineId,
                  ),
                );
                const latestLog = latestSessionWithLog
                  ? allLogs.find(
                      (l) =>
                        l.sessionId === latestSessionWithLog.id &&
                        l.machineId === machineId,
                    )
                  : allLogs
                      ?.filter((l) => l.machineId === machineId)
                      ?.sort((a, b) => {
                        const sessA = sessions.find((s) => s.id === a.sessionId);
                        const sessB = sessions.find((s) => s.id === b.sessionId);
                        const numA =
                          sessA?.sessionNumber ??
                          parseSessionDate(sessA?.date || "");
                        const numB =
                          sessB?.sessionNumber ??
                          parseSessionDate(sessB?.date || "");
                        return numB - numA;
                      })[0];

                const weightVal =
                  metric?.weight ||
                  latestLog?.weight ||
                  latestLog?.loadLb ||
                  clientSettings[machineId]?.currentWeight ||
                  clientSettings[machineId]?.startingWeight ||
                  "--";
                const repsVal =
                  metric?.reps ||
                  metric?.seconds ||
                  latestLog?.reps ||
                  latestLog?.seconds ||
                  latestLog?.outcomeTut ||
                  "--";
                const isHold =
                  metric?.isStaticHold ??
                  latestLog?.isStaticHold ??
                  latestLog?.isTSC;

                return (
                  <div
                    key={`${machineId}-${idx}`}
                    className="flex items-center justify-between p-3.5 rounded-xl bg-slate-50/70 dark:bg-slate-900/30 border border-slate-100 dark:border-slate-800/40 hover:bg-slate-50 dark:hover:bg-slate-900/50 transition-colors"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="flex items-center justify-center h-7 w-7 rounded-lg bg-slate-100 dark:bg-slate-800 text-xs font-mono font-bold text-slate-500 dark:text-slate-400 shrink-0">
                        {idx + 1}
                      </div>
                      <div className="min-w-0">
                        <span className="text-xs font-bold uppercase tracking-tight text-slate-800 dark:text-neutral-200 block">
                          {machine.name}
                        </span>
                        <span className="text-[10px] text-slate-400 dark:text-slate-500 font-medium uppercase tracking-wider">
                          {machine.anatomicalRegion || "Other Region"}
                        </span>
                      </div>
                    </div>

                    <div className="text-right shrink-0">
                      <span className="text-xs font-mono font-bold text-slate-700 dark:text-neutral-300">
                        {weightVal !== "--" ? `${weightVal} lb` : "--"}
                      </span>
                      <span className="text-[10px] text-slate-400 font-mono block">
                        {repsVal !== "--"
                          ? `${repsVal}${isHold ? "s Hold" : " reps"}`
                          : "--"}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    );
  };

  const [isJournalExpanded, setIsJournalExpanded] = useState(false);

  const renderRoutineJournalList = () => {
    const changesThisMonth = calculateChangesThisMonth(routineAdjustments);

    return (
      <Card className="col-span-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm mt-4 p-5 lg:p-6">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <History className="w-5 h-5 text-slate-500" />
            <h3 className="text-sm font-bold uppercase tracking-tight text-slate-800 dark:text-neutral-200">
              Routine Adjustment Journal
            </h3>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setIsJournalExpanded(!isJournalExpanded)}
            className="rounded-xl font-bold uppercase text-[11px] tracking-wider border-slate-200 dark:border-slate-800"
          >
            {isJournalExpanded ? "Collapse Journal" : "Open Journal"}
            <span className="ml-2 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 px-2 py-0.5 rounded-full text-[10px]">
              {changesThisMonth} {changesThisMonth === 1 ? "change" : "changes"}{" "}
              this month
            </span>
            {isJournalExpanded ? (
              <ChevronUp className="w-3.5 h-3.5 ml-1.5" />
            ) : (
              <ChevronDown className="w-3.5 h-3.5 ml-1.5" />
            )}
          </Button>
        </div>

        {isJournalExpanded && (
          <div className="mt-5 space-y-4 max-h-87.5 overflow-y-auto pr-1">
            {routineAdjustments.length === 0 ? (
              <p className="text-xs text-slate-400 font-medium uppercase tracking-wide text-center py-6">
                No adjustments recorded in clinical logs
              </p>
            ) : (
              routineAdjustments.map((adj) => {
                const { addedNames, removedNames } = getAdjustmentDiff(adj);

                let dateText = "Date unknown";
                if (adj.createdAt) {
                  const time =
                    adj.createdAt.toMillis?.() ||
                    (typeof adj.createdAt === "number" ? adj.createdAt : 0);
                  if (time) {
                    dateText = new Date(time).toLocaleDateString(undefined, {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    });
                  }
                }

                const trainerObj = trainers.find((t) => t.id === adj.trainerId);
                const initials =
                  trainerObj?.initials ||
                  adj.trainerId?.substring(0, 2).toUpperCase() ||
                  "TR";
                const isToggle =
                  adj.changeType === "enabled" || adj.changeType === "disabled";

                return (
                  <div
                    key={adj.id}
                    className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 space-y-2 text-xs"
                  >
                    <div className="flex items-center justify-between gap-2 border-b border-slate-200/40 dark:border-slate-800/40 pb-2">
                      <div className="flex items-center gap-2">
                        <div className="flex items-center justify-center w-7 h-7 bg-slate-200 dark:bg-slate-800 text-[11px] font-bold font-mono text-slate-700 dark:text-slate-300 rounded-[#10px]">
                          {initials}
                        </div>
                        <div>
                          <p className="font-bold text-slate-700 dark:text-neutral-200">
                            {trainerObj?.fullName || adj.trainerId}
                          </p>
                          <p className="text-[10px] text-slate-400 font-medium">
                            {dateText}
                          </p>
                        </div>
                      </div>
                      <span className="font-mono text-[9px] bg-slate-100 dark:bg-slate-800 text-slate-550 dark:text-slate-400 px-2 py-0.5 rounded uppercase">
                        {adj.changeType || "machines"}
                      </span>
                    </div>

                    {!isToggle &&
                      (addedNames.length > 0 || removedNames.length > 0) && (
                        <div className="space-y-1 py-1">
                          {addedNames.length > 0 && (
                            <p className="text-emerald-600 dark:text-emerald-400 font-bold uppercase tracking-tight flex items-center gap-1">
                              <span className="text-emerald-500 font-extrabold">
                                + ADDED:
                              </span>
                              <span className="font-medium text-slate-700 dark:text-slate-300">
                                {addedNames.join(", ")}
                              </span>
                            </p>
                          )}
                          {removedNames.length > 0 && (
                            <p className="text-red-500 dark:text-red-400 font-bold uppercase tracking-tight flex items-center gap-1">
                              <span className="text-red-400 font-extrabold">
                                - REMOVED:
                              </span>
                              <span className="font-medium text-slate-700 dark:text-slate-300">
                                {removedNames.join(", ")}
                              </span>
                            </p>
                          )}
                        </div>
                      )}

                    {isToggle && (
                      <p
                        className={cn(
                          "font-bold uppercase tracking-wide",
                          adj.changeType === "enabled"
                            ? "text-emerald-600 dark:text-emerald-400"
                            : "text-red-500 dark:text-red-450",
                        )}
                      >
                        Protocol Routine B{" "}
                        {adj.changeType === "enabled" ? "Enabled" : "Disabled"}
                      </p>
                    )}

                    {adj.notes && (
                      <p className="italic text-slate-600 dark:text-neutral-305 bg-white/40 dark:bg-slate-900/40 p-2.5 rounded-lg border border-slate-200 dark:border-slate-800">
                        "{adj.notes}"
                      </p>
                    )}
                  </div>
                );
              })
            )}
          </div>
        )}
      </Card>
    );
  };

  const fetchLogsForSessions = async (sessionIds: string[]) => {
    if (sessionIds.length === 0) return [];
    const chunks = [];
    for (let i = 0; i < sessionIds.length; i += 10) {
      chunks.push(sessionIds.slice(i, i + 10));
    }
    let fetchedLogs: ExerciseLog[] = [];
    for (const chunk of chunks) {
      const qs = query(
        collection(db, "exerciseLogs"),
        where("sessionId", "in", chunk),
      );
      const snap = await getDocs(qs);
      fetchedLogs = [
        ...fetchedLogs,
        ...snap.docs.map(
          (doc) => ({ id: doc.id, ...doc.data() }) as ExerciseLog,
        ),
      ];
    }
    return fetchedLogs;
  };

  useEffect(() => {
    if (!clientId || hasQuotaError) return;

    if (
      activeTab !== "journey" &&
      activeTab !== "history" &&
      activeTab !== "clinical"
    ) {
      return;
    }

    const fetchInitialSessions = async () => {
      try {
        // 2. Firebase Query Limits & Pagination
        // Always restrict the initial query to 10 to save massive memory/bandwidth.
        const sessionsQuery = query(
          collection(db, "sessions"),
          where("clientId", "==", clientId),
          orderBy("date", "desc"),
          limit(10), // STRICT LIMIT 10
        );

        const sessionSnap = await getDocs(sessionsQuery);
        const docs = sessionSnap.docs;

        if (!docs.length) {
          setSessions([]);
          setAllLogs([]);
          setHasMoreSessions(false);
          return;
        }

        setLastVisibleSession(docs[docs.length - 1]);
        setHasMoreSessions(docs.length === 10);

        const liveSessionsData = docs.map(
          (doc) => ({ id: doc.id, ...doc.data() }) as WorkoutSession,
        );

        // Merge gracefully to not erase older paginated history if coach loaded more
        setSessions((prev: WorkoutSession[]) => {
          const merged = new Map(prev.map((s) => [s.id, s]));
          liveSessionsData.forEach((s) => merged.set(s.id, s));
          const finalArr = Array.from(merged.values());
          finalArr.sort(
            (a, b) => parseSessionDate(b.date) - parseSessionDate(a.date),
          );
          return finalArr;
        });

        const sessionIds = liveSessionsData.map((s) => s.id!).filter(Boolean);
        const newLogs = await fetchLogsForSessions(sessionIds);

        setAllLogs((prev) => {
          const merged = new Map(prev.map((l) => [l.id, l]));
          newLogs.forEach((l) => merged.set(l.id, l));
          return Array.from(merged.values());
        });
      } catch (error: any) {
        handleFirestoreError(error, OperationType.GET, "sessions");
      }
    };

    const fetchSessionNotesObj = async () => {
      if (!clientId) return;
      try {
        const notesQ = query(
          collection(db, "sessionNotes"),
          where("clientId", "==", clientId),
          orderBy("createdAt", "desc"),
          limit(50),
        );
        const snap = await getDocs(notesQ);
        const notesData = snap.docs.map(
          (doc) => ({ id: doc.id, ...doc.data() }) as SessionNote,
        );
        setSessionNotes(notesData);
      } catch (error) {
        console.warn("Could not fetch session notes:", error);
      }
    };

    fetchInitialSessions();
    fetchSessionNotesObj();
  }, [clientId, activeTab, hasQuotaError]);

  const handleLoadMoreHistory = async () => {
    if (!lastVisibleSession || !hasMoreSessions || isLoadingMore || !clientId)
      return;
    setIsLoadingMore(true);
    try {
      const moreQuery = query(
        collection(db, "sessions"),
        where("clientId", "==", clientId),
        orderBy("date", "desc"),
        startAfter(lastVisibleSession),
        limit(10),
      );
      const snap = await getDocs(moreQuery);
      if (snap.empty) {
        setHasMoreSessions(false);
        return;
      }

      setLastVisibleSession(snap.docs[snap.docs.length - 1]);
      setHasMoreSessions(snap.docs.length === 10);

      const moreSessionsData = snap.docs.map(
        (doc) => ({ id: doc.id, ...doc.data() }) as WorkoutSession,
      );

      const sessionIds = moreSessionsData.map((s) => s.id!).filter(Boolean);
      const moreLogs = await fetchLogsForSessions(sessionIds);

      setSessions((prev) => {
        const out = [...prev, ...moreSessionsData].sort(
          (a, b) => parseSessionDate(b.date) - parseSessionDate(a.date),
        );
        return Array.from(new Map(out.map((s) => [s.id, s])).values());
      });
      setAllLogs((prev) => [...prev, ...moreLogs]);
    } catch (err) {
      console.error("Error loading older history", err);
    } finally {
      setIsLoadingMore(false);
    }
  };

  useEffect(() => {
    if (!clientId) return;

    const settingsQ = query(
      collection(db, "clientMachineSettings"),
      where("clientId", "==", clientId),
    );

    const unsubscribe = onSnapshot(
      settingsQ,
      (snap) => {
        const settingsMap: Record<string, ClientMachineSetting> = {};
        snap.docs.forEach((doc) => {
          const data = { id: doc.id, ...doc.data() } as ClientMachineSetting;
          settingsMap[data.machineId] = data;
        });
        setClientSettings(settingsMap);
      },
      (error) => {
        handleFirestoreError(error, OperationType.GET, "clientMachineSettings");
      },
    );

    return () => unsubscribe();
  }, [clientId]);

  useEffect(() => {
    if (!clientId || hasQuotaError) return;
    if (activeTab !== "journey" && activeTab !== "journal") return;

    const fetchFocuses = async () => {
      try {
        const focusQ = query(
          collection(db, "trainerFocuses"),
          where("clientId", "==", clientId),
          orderBy("updatedAt", "desc"),
          limit(50),
        );
        const snap = await getDocs(focusQ);
        setTrainerFocuses(
          snap.docs.map(
            (doc) => ({ id: doc.id, ...doc.data() }) as TrainerFocus,
          ),
        );
      } catch (error) {
        handleFirestoreError(error, OperationType.GET, "trainerFocuses");
      }
    };

    fetchFocuses();

    // Subscribe to Focus Records
    const focusRecsQ = query(
      collection(db, "focusRecords"),
      where("clientId", "==", clientId),
      orderBy("dateAssigned", "desc"),
    );
    const unsubscribeFocusRecs = onSnapshot(
      focusRecsQ,
      (snap) => {
        setFocusRecords(
          snap.docs.map(
            (doc) => ({ id: doc.id, ...doc.data() }) as FocusRecord,
          ),
        );
      },
      (err) => {
        handleFirestoreError(err, OperationType.GET, "focusRecords");
      },
    );

    // Subscribe to Clinical Incidents
    const incidentsQ = query(
      collection(db, "clinicalIncidents"),
      where("clientId", "==", clientId),
    );
    const unsubscribeIncidents = onSnapshot(
      incidentsQ,
      (snap) => {
        setClinicalIncidents(
          snap.docs.map(
            (doc) => ({ id: doc.id, ...doc.data() }) as ClinicalIncident,
          ),
        );
      },
      (err) => {
        handleFirestoreError(err, OperationType.GET, "clinicalIncidents");
      },
    );

    return () => {
      unsubscribeFocusRecs();
      unsubscribeIncidents();
    };
  }, [clientId, activeTab]);

  useEffect(() => {
    if (!clientId || hasQuotaError || !user) return;
    if (activeTab !== "clinical") return;

    const q = query(
      collection(db, "progressReports"),
      where("clientId", "==", clientId),
      orderBy("createdAt", "desc"),
      limit(50),
    );

    const unsubscribe = onSnapshot(
      q,
      (snap) => {
        setProgressReports(
          snap.docs.map(
            (doc) => ({ id: doc.id, ...doc.data() }) as ProgressReport,
          ),
        );
      },
      (error: any) => {
        handleFirestoreError(error, OperationType.GET, "progressReports");
      },
    );

    return () => unsubscribe();
  }, [clientId, activeTab, user?.uid]);

  useEffect(() => {
    if (!clientId || !user) return;
    const fetchSchedules = async () => {
      try {
        const q = query(
          collection(db, "schedules"),
          where("clientId", "==", clientId),
          where("startTime", ">=", Timestamp.now()),
          orderBy("startTime", "asc"),
          limit(50),
        );
        const snap = await getDocs(q);
        setScheduledSessions(
          snap.docs.map(
            (doc) => ({ id: doc.id, ...doc.data() }) as ScheduleEntry,
          ),
        );
      } catch (error: any) {
        handleFirestoreError(error, OperationType.GET, "schedules");
      }
    };
    fetchSchedules();
  }, [clientId, user?.uid]);

  useEffect(() => {
    const myFocus = trainerFocuses.find((f) => f.trainerId === authTrainer?.id);
    if (myFocus) {
      setFocusForm({
        category: myFocus.category,
        notes: myFocus.notes,
      });
    }
  }, [trainerFocuses, authTrainer]);

  const handleSaveFocus = async () => {
    if (!clientId || !authTrainer) return;
    setIsSavingFocus(true);
    try {
      const myFocus = trainerFocuses.find(
        (f) => f.trainerId === authTrainer.id,
      );
      const focusData = {
        clientId,
        trainerId: authTrainer.id,
        trainerName: authTrainer.fullName,
        category: focusForm.category,
        notes: focusForm.notes,
        updatedAt: serverTimestamp(),
      };

      if (myFocus) {
        await updateDoc(doc(db, "trainerFocuses", myFocus.id!), focusData);
      } else {
        await addDoc(collection(db, "trainerFocuses"), focusData);
      }
      setIsEditingFocus(false);
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, "trainerFocuses");
    } finally {
      setIsSavingFocus(false);
    }
  };

  const handleSaveRoutine = async () => {
    if (!clientId || !isEditingRoutine) return;

    const original = routines.find((r) => r.id === isEditingRoutine);
    if (!original) return;

    try {
      // 1. Update existing routine
      await updateDoc(doc(db, "routines", isEditingRoutine), {
        name: routineEditData.name,
        machineIds: routineEditData.machineIds,
        updatedAt: serverTimestamp(),
      });

      // 2. Log adjustment in backend for history
      await addDoc(collection(db, "routineAdjustments"), {
        routineId: isEditingRoutine,
        clientId,
        previousMachineIds: original.machineIds,
        newMachineIds: routineEditData.machineIds,
        trainerId: authTrainer?.id || "unknown",
        createdAt: serverTimestamp(),
        studioId: clients.find((c) => c.id === clientId)?.homeStudioId || "",
      });

      setIsEditingRoutine(null);
    } catch (error) {
      handleFirestoreError(
        error,
        OperationType.UPDATE,
        `routines/${isEditingRoutine}`,
      );
    }
  };

  const startEditRoutine = (routine: Routine) => {
    setIsEditingRoutine(routine.id!);
    setRoutineEditData({
      name: routine.name,
      machineIds: [...routine.machineIds],
    });
  };

  // Task 3: Aggressive Memoization
  const memoizedCompletedSessionsAsc = useMemo(() => {
    return [...sessions]
      .filter((s) => s.status === "Completed")
      .sort((a, b) => parseSessionDate(a.date) - parseSessionDate(b.date));
  }, [sessions]);

  const memoizedCompletedSessionsDesc = useMemo(() => {
    return [...memoizedCompletedSessionsAsc].reverse();
  }, [memoizedCompletedSessionsAsc]);

  const memoizedEfficiencySessions = useMemo(() => {
    return memoizedCompletedSessionsAsc.filter((s) => s.startTime && s.endTime);
  }, [memoizedCompletedSessionsAsc]);

  const memoizedMachineStatsByDate = useMemo(() => {
    const machineStatsByDate: Record<string, Record<string, number>> = {};
    const machineWeightsByDate: Record<string, Record<string, number>> = {};
    const machineBaselines: Record<string, number> = {};

    [...allLogs]
      .sort(
        (a, b) =>
          (a.createdAt?.toMillis?.() || 0) - (b.createdAt?.toMillis?.() || 0),
      )
      .forEach((l) => {
        if (!l.weight) return;
        const w = parseInt(l.weight.toString() || "0");
        if (w > 0) {
          if (!machineBaselines[l.machineId]) {
            machineBaselines[l.machineId] = w;
          }
          const session = sessions.find((s) => s.id === l.sessionId);
          if (session && session.date) {
            const dateStr = new Date(
              parseSessionDate(session.date),
            ).toLocaleDateString("en-US", { month: "short", day: "numeric" });
            if (!machineStatsByDate[dateStr]) {
              machineStatsByDate[dateStr] = {};
            }
            if (!machineWeightsByDate[dateStr]) {
              machineWeightsByDate[dateStr] = {};
            }
            const base = machineBaselines[l.machineId];
            machineStatsByDate[dateStr][l.machineId] =
              ((w - base) / base) * 100;
            machineWeightsByDate[dateStr][l.machineId] = w;
          }
        }
      });
    return { machineStatsByDate, machineWeightsByDate, machineBaselines };
  }, [allLogs, sessions]);

  const memoizedVolumeByDate = useMemo(() => {
    const sixtyDaysAgo = new Date();
    sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);
    const volumeByDate: Record<string, number> = {};

    memoizedCompletedSessionsAsc.forEach((session) => {
      const time =
        session.createdAt?.toMillis?.() || parseSessionDate(session.date);
      if (time >= sixtyDaysAgo.getTime()) {
        const sLogs = allLogs.filter((l) => l.sessionId === session.id);
        const totalVol = sLogs.reduce((acc, log) => {
          const w = parseInt(log.weight?.toString() || "0");
          const r = parseInt(log.reps?.toString() || "0");
          return acc + w * r;
        }, 0);
        const dateStr = session.date
          ? new Date(parseSessionDate(session.date)).toLocaleDateString(
              "en-US",
              { month: "short", day: "numeric" },
            )
          : "";
        if (dateStr) {
          volumeByDate[dateStr] = (volumeByDate[dateStr] || 0) + totalVol;
        }
      }
    });
    return volumeByDate;
  }, [memoizedCompletedSessionsAsc, allLogs]);

  if (!client) {
    // Three different situations used to collapse into one "select a client"
    // message, so opening a profile flashed an empty state while the document
    // was still being fetched.
    if (isLoadingClient)
      return (
        <div className="flex flex-col items-center justify-center p-20 gap-4">
          <div
            role="status"
            aria-label="Loading client profile"
            className="w-10 h-10 border-4 border-cyan border-t-transparent rounded-full animate-spin"
          />
          <p className="text-muted-foreground font-medium">
            Loading client profile...
          </p>
        </div>
      );

    if (clientId)
      return (
        <div className="flex flex-col items-center justify-center p-20 gap-4">
          <AlertCircle className="w-12 h-12 text-rose-500 opacity-40" />
          <p className="text-muted-foreground font-medium">
            This client could not be found. They may have been deleted.
          </p>
          <Button onClick={() => setView("clients")}>Back to Clients</Button>
        </div>
      );

    return (
      <div className="flex flex-col items-center justify-center p-20 gap-4">
        <AlertCircle className="w-12 h-12 text-muted-foreground opacity-20" />
        <p className="text-muted-foreground font-medium">
          Select a client to view their profile.
        </p>
        <Button onClick={() => setView("clients")}>Back to Clients</Button>
      </div>
    );
  }

  if (routineBuilderTarget) {
    return (
      <RoutineBuilderView
        client={client}
        onBack={() => setRoutineBuilderTarget(null)}
        onSaveRoutine={(machineIds) => {
          setStagedMachineIds((prev) => ({
            ...prev,
            [routineBuilderTarget]: machineIds,
          }));
          setRoutineBuilderTarget(null);
        }}
      />
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="max-w-350 mx-auto space-y-2 pb-8 px-2 sm:px-4 bg-slate-50 dark:bg-slate-950 min-h-screen pt-4"
    >
      {/* Alerts / Notifications */}
      {(() => {
        if (client.requiresConsultation && !client.consultationCompleted) {
          return (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              className="mb-2"
            >
              <div className="bg-[#5BC0BE]/10 border-2 border-[#5BC0BE]/20 rounded-3xl p-4 flex items-center gap-4 text-[#5BC0BE]">
                <AlertCircle className="w-6 h-6 shrink-0" />
                <div className="flex-1">
                  <p className="text-xs font-bold uppercase tracking-tight">
                    Profile Setup Needed
                  </p>
                  <p className="text-[11px] font-bold opacity-80 uppercase tracking-widest mt-0.5">
                    Set up their routine in the 'Equipment' tab or head to
                    profile details to build their profile.
                  </p>
                </div>
              </div>
            </motion.div>
          );
        }

        if (progressReports.length === 0) {
          // Only show "Report Required" if client is older than 3 months
          const clientCreatedAt =
            client.createdAt?.toDate?.() ||
            (client.createdAt ? new Date(client.createdAt) : new Date());
          const threeMonthsAgo = new Date();
          threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);

          if (clientCreatedAt > threeMonthsAgo) {
            return null;
          }

          return (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
            >
              <div className="bg-red-500/10 border-2 border-red-500/20 rounded-3xl p-4 flex items-center gap-4 text-red-600">
                <AlertCircle className="w-6 h-6 shrink-0" />
                <div>
                  <p className="text-xs font-bold uppercase tracking-tight">
                    Report Required
                  </p>
                  <p className="text-[11px] font-bold opacity-80">
                    This client has no progress report on file. Please perform
                    an evaluation.
                  </p>
                </div>
                <Button
                  variant="ghost"
                  className="ml-auto text-[11px] font-medium uppercase hover:bg-red-500/10"
                  onClick={() => setView("progress-report")}
                >
                  Start Now
                </Button>
              </div>
            </motion.div>
          );
        }

        const lastDate = new Date(parseSessionDate(progressReports[0].date));
        const nextDueDate = new Date(lastDate);
        nextDueDate.setMonth(nextDueDate.getMonth() + 3);

        const today = new Date();
        const diffTime = nextDueDate.getTime() - today.getTime();
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

        if (diffDays <= 21) {
          const isOverdue = diffDays < 0;
          return (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
            >
              <div
                className={`${isOverdue ? "bg-red-500/10 border-red-200 text-red-600" : "bg-amber-500/10 border-amber-200 text-amber-600"} border-2 rounded-3xl p-4 flex items-center gap-4`}
              >
                <AlertCircle className="w-6 h-6 shrink-0" />
                <div>
                  <p className="text-xs font-bold uppercase tracking-tight">
                    Report Due {isOverdue ? "Yesterday" : `Soon`}
                  </p>
                  <p className="text-[11px] font-bold opacity-80">
                    {isOverdue
                      ? `The 3-month progress report was due on ${nextDueDate.toLocaleDateString()}.`
                      : `The next progress report is due on ${nextDueDate.toLocaleDateString()} (in ${diffDays} days).`}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  className={`ml-auto text-[11px] font-medium uppercase ${isOverdue ? "hover:bg-red-500/10" : "hover:bg-amber-500/10"}`}
                  onClick={() => setView("progress-report")}
                >
                  Schedule Report
                </Button>
              </div>
            </motion.div>
          );
        }
        return null;
      })()}

      {/* Redesigned Session Status Header */}
      <div className="bg-white dark:bg-slate-950 border-b border-slate-200 dark:border-slate-800/60 pb-6 mb-8 pt-2">
        <div className="flex flex-col xl:flex-row xl:justify-between xl:items-start gap-6">
          <div className="flex items-start gap-3 sm:gap-4 flex-1 min-w-0">
            <Button
              onClick={() => {
                setSelectedClientId(null);
                setView("client-directory");
              }}
              variant="ghost"
              size="icon"
              className="shrink-0 text-slate-400 dark:text-slate-500 hover:text-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full h-10 w-10 mt-1 sm:mt-1.5"
            >
              <ChevronLeft className="w-6 h-6" />
            </Button>

            <div className="flex flex-col min-w-0 flex-1">
              <div className="flex items-center gap-3 mb-2 flex-wrap">
                <h1 className="text-3xl sm:text-4xl lg:text-5xl font-black tracking-tight leading-none text-slate-900 dark:text-white truncate">
                  {client.firstName} {client.lastName}
                </h1>

                {(client.notes ||
                  (client.clinicalFlags &&
                    client.clinicalFlags.length > 0)) && (
                  <div className="bg-amber-50 dark:bg-amber-500/10 text-amber-600 dark:text-amber-500 border border-amber-500/30 rounded px-2.5 py-1 flex items-center gap-1.5 animate-pulse shrink-0 mt-1 sm:mt-0">
                    <AlertTriangle className="w-3.5 h-3.5" />
                    <span className="text-[10px] font-bold uppercase tracking-widest">
                      Clinical Notes Active
                    </span>
                  </div>
                )}
              </div>

              {/* Priority Information Row */}
              <div className="flex flex-wrap items-center gap-x-6 gap-y-4 mt-3 sm:mt-5">
                {/* Top Trainer */}
                <div className="flex flex-col">
                  <span className="text-[10px] uppercase font-bold tracking-widest text-[#68717A] dark:text-slate-500 mb-1">
                    Top Trainer
                  </span>
                  <div className="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-slate-100">
                    <UserCheck className="w-4 h-4 text-[#F06C22]" />
                    {(() => {
                      const trainerCount: Record<string, number> = {};
                      sessions.forEach((s) => {
                        if (s.trainerId)
                          trainerCount[s.trainerId] =
                            (trainerCount[s.trainerId] || 0) + 1;
                        else if (s.trainerName) {
                          const t = trainers.find(
                            (tr) =>
                              tr.fullName === s.trainerName ||
                              tr.initials === s.trainerName,
                          );
                          if (t && t.id)
                            trainerCount[t.id] = (trainerCount[t.id] || 0) + 1;
                        }
                      });
                      let topTrainerId = null;
                      let maxCount = 0;
                      for (const [id, count] of Object.entries(trainerCount)) {
                        if (count > maxCount) {
                          maxCount = count;
                          topTrainerId = id;
                        }
                      }
                      if (topTrainerId) {
                        const t = trainers.find((tr) => tr.id === topTrainerId);
                        return t ? t.fullName : "N/A";
                      }
                      return "N/A";
                    })()}
                  </div>
                </div>

                <div className="hidden sm:block w-px h-8 bg-slate-200 dark:bg-slate-800"></div>

                {/* Last Session */}
                <div className="flex flex-col">
                  <span className="text-[10px] uppercase font-bold tracking-widest text-[#68717A] dark:text-slate-500 mb-1">
                    Last Session
                  </span>
                  <div className="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-slate-100">
                    <History className="w-4 h-4 text-[#68717A]" />
                    {sessions[0]?.date
                      ? new Date(
                          parseSessionDate(sessions[0].date),
                        ).toLocaleDateString([], {
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                        })
                      : "N/A"}
                  </div>
                </div>

                <div className="hidden sm:block w-px h-8 bg-slate-200 dark:bg-slate-800"></div>

                {/* Next Session & Pre-booked */}
                <div className="flex flex-col">
                  <span className="text-[10px] uppercase font-bold tracking-widest text-[#68717A] dark:text-slate-500 mb-1">
                    Next Session
                  </span>
                  <div className="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-slate-100">
                    <CalendarDays className="w-4 h-4 text-[#68717A]" />
                    {scheduledSessions.length > 0 ? (
                      <>
                        <span>
                          {(() => {
                            const dateVal = scheduledSessions[0].startTime;
                            if (!dateVal) return "N/A";
                            let d: Date;
                            if (typeof (dateVal as any).toDate === "function") {
                              d = (dateVal as any).toDate();
                            } else if (typeof dateVal === "string") {
                              d = new Date(
                                dateVal.includes("T")
                                  ? dateVal
                                  : dateVal + "T12:00:00",
                              );
                            } else {
                              d = new Date(dateVal);
                            }
                            return isNaN(d.getTime())
                              ? "N/A"
                              : d.toLocaleDateString([], {
                                  month: "short",
                                  day: "numeric",
                                });
                          })()}
                        </span>
                        {scheduledSessions.length > 1 && (
                          <span className="text-[10px] bg-slate-100 dark:bg-slate-800 text-[#68717A] dark:text-slate-300 px-1.5 py-0.5 rounded ml-1">
                            +{scheduledSessions.length - 1} booked
                          </span>
                        )}
                      </>
                    ) : (
                      <span className="text-[#68717A] font-medium italic">
                        Not Scheduled
                      </span>
                    )}
                  </div>
                </div>

                <div className="hidden sm:block w-px h-8 bg-slate-200 dark:bg-slate-800"></div>

                {/* Session Counter */}
                <div className="flex flex-col">
                  <span className="text-[10px] uppercase font-bold tracking-widest text-[#68717A] dark:text-slate-500 mb-1">
                    Sessions Completed
                  </span>
                  <div className="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-slate-100 leading-none mt-1">
                    <span className="text-2xl font-black text-[#F06C22]">
                      {calculatedSessionCount}
                    </span>
                    <span className="text-[#68717A] text-[11px] uppercase tracking-widest opacity-80 mt-1">
                      /{" "}
                      {calculatedSessionCount + (client.remainingSessions ?? 0)}{" "}
                      total
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3 shrink-0 self-start xl:pt-2 ml-14 xl:ml-0 mt-2 xl:mt-0">
            <Button
              onClick={() => {
                setInfoSheetTab("identity");
                setIsInfoSheetOpen(true);
              }}
              variant="outline"
              className="rounded-xl border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 h-10 sm:h-12 px-4 shadow-sm transition-colors"
            >
              <Contact className="w-4 h-4 sm:mr-2" />
              <span className="font-bold uppercase tracking-widest text-[10px] sm:text-xs hidden sm:inline">
                Profile Details
              </span>
            </Button>

            {activeInProgressSession ? (
              <DropdownMenu>
                <DropdownMenuTrigger className="inline-flex items-center justify-center whitespace-nowrap bg-amber-500 hover:bg-amber-600 rounded-xl font-bold uppercase text-[10px] sm:text-xs tracking-widest h-10 sm:h-12 px-4 sm:px-6 shadow-sm border-none w-auto text-white transition-colors">
                  <Clock className="w-4 h-4 mr-1.5 animate-pulse" />
                  IN-PROGRESS ({activeInProgressSession.trainerInitials})
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  align="end"
                  className="w-60 rounded-2xl p-2 bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800"
                >
                  <div className="px-3 py-2 mb-2 border-b border-slate-200 dark:border-slate-800">
                    <p className="text-[11px] font-medium uppercase text-amber-500 tracking-widest">
                      Active Session Detected
                    </p>
                    <p className="text-[11px] font-bold text-slate-800 dark:text-slate-200 mt-1">
                      Started by {activeInProgressSession.trainerInitials} at{" "}
                      {new Date(
                        activeInProgressSession.startTime?.toMillis?.() || 0,
                      ).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </p>
                  </div>
                  <DropdownMenuItem
                    onClick={() => {
                      localStorage.setItem(
                        "max_strength_active_session_id",
                        activeInProgressSession.id!,
                      );
                      setView("workouts");
                    }}
                    className="rounded-xl hover:bg-amber-50 dark:hover:bg-amber-500/20 transition-colors cursor-pointer flex items-center gap-2 p-3 text-amber-700 dark:text-amber-500"
                  >
                    <Play className="w-4 h-4" />
                    <span className="font-bold uppercase text-xs">
                      Take Over Session
                    </span>
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => setView("workouts")}
                    className="rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors cursor-pointer flex items-center gap-2 p-3 text-slate-700 dark:text-slate-300"
                  >
                    <Maximize className="w-4 h-4" />
                    <span className="font-bold uppercase text-xs">
                      View Current Profile
                    </span>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              <Button
                onClick={() => {
                  localStorage.removeItem("max_strength_active_session_id");
                  setView("workouts");
                }}
                disabled={isCheckingActiveSession}
                className="bg-[#F06C22] hover:bg-[#F06C22]/90 rounded-xl font-bold uppercase text-[10px] sm:text-xs tracking-widest h-10 sm:h-12 px-4 sm:px-6 shadow-sm border-none w-auto text-white dark:text-white transition-transform active:scale-95"
              >
                <Play className="w-4 h-4 sm:mr-2" />
                <span className="hidden sm:inline">
                  {isCheckingActiveSession ? "Checking..." : "Start Session"}
                </span>
                <span className="sm:hidden">
                  {isCheckingActiveSession ? "Checking..." : "Start"}
                </span>
              </Button>
            )}
          </div>
        </div>
      </div>

      <Tabs
        value={activeTab}
        className="w-full flex-1 flex flex-col min-h-0"
        onValueChange={setActiveTab}
      >
        <div className="mb-6 w-full">
          <div className="w-full pb-1">
            <TabsList className="bg-transparent p-0 grid grid-cols-6 w-full h-11! border-b border-slate-200 dark:border-slate-800 gap-0">
              {[
                { val: "journey", label: "Journey" },
                { val: "routines", label: "Routines" },
                { val: "equipment", label: "Equipment" },
                { val: "journal", label: "Journal" },
                { val: "history", label: "History" },
                { val: "clinical", label: "Clinical" },
              ].map((tab) => (
                <TabsTrigger
                  key={tab.val}
                  value={tab.val}
                  className="relative w-full h-11! px-1 sm:px-3 font-display italic text-[10px] sm:text-[13px] font-bold uppercase tracking-wider sm:tracking-widest text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 data-[state=active]:bg-slate-100 dark:data-[state=active]:bg-slate-800/80 data-[state=active]:text-[#F06C22] dark:data-[state=active]:text-[#F06C22] transition-all text-center cursor-pointer select-none rounded-none border-b-2 border-transparent data-[state=active]:border-[#F06C22] truncate flex items-center justify-center"
                >
                  {tab.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </div>
        </div>
        <TabsContent value="equipment">
          <ClientEquipmentPrescriptions
            client={client}
            clientId={clientId}
            machines={machines}
            clientSettings={clientSettings}
            clientBodyWeight={parseInt(client?.weight || "150", 10)}
            allLogs={allLogs}
            activeStudioId={activeStudioId}
            authTrainer={authTrainer}
          />
        </TabsContent>
        <TabsContent
          value="journey"
          className="mt-0 flex-1 overflow-hidden min-h-0 flex flex-col rounded-xl relative"
        >
          <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-3 px-2 flex-none gap-3">
            <h3 className="text-[13px] font-bold uppercase text-slate-800 dark:text-slate-200 tracking-widest pl-1 border-l-4 border-[#F06C22]">
              Recent Journey
            </h3>
            <div className="flex flex-wrap items-center gap-2 sm:gap-3">
              <div className="flex p-0.5 bg-slate-100 dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700">
                <button
                  onClick={() => setJourneyDensity("Compact")}
                  className={cn(
                    "px-2.5 sm:px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest rounded-md transition-colors",
                    journeyDensity === "Compact"
                      ? "bg-white dark:bg-slate-700 text-foreground dark:text-white shadow-sm"
                      : "text-slate-500 hover:text-slate-700 dark:hover:text-slate-300",
                  )}
                >
                  Compact
                </button>
                <button
                  onClick={() => setJourneyDensity("Comfortable")}
                  className={cn(
                    "px-2.5 sm:px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest rounded-md transition-colors",
                    journeyDensity === "Comfortable"
                      ? "bg-white dark:bg-slate-700 text-foreground dark:text-white shadow-sm"
                      : "text-slate-500 hover:text-slate-700 dark:hover:text-slate-300",
                  )}
                >
                  Comfortable
                </button>
                <button
                  onClick={() => setJourneyDensity("Full")}
                  className={cn(
                    "px-2.5 sm:px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest rounded-md transition-colors",
                    journeyDensity === "Full"
                      ? "bg-white dark:bg-slate-700 text-foreground dark:text-white shadow-sm"
                      : "text-slate-500 hover:text-slate-700 dark:hover:text-slate-300",
                  )}
                >
                  Full
                </button>
              </div>
              <Button
                onClick={() => setShowFullChart(true)}
                size="sm"
                variant="outline"
                className="h-9 sm:h-10 px-3.5 sm:px-5 text-[10px] sm:text-[11px] uppercase font-bold tracking-widest text-slate-700 dark:text-slate-300 hover:text-[#115E8D] border-slate-300 shadow-sm transition-all hover:bg-slate-50 rounded-full"
              >
                <Maximize2 className="w-3.5 h-3.5 mr-1.5" /> Expanded Journey
              </Button>
            </div>
          </div>
          <div className="w-full flex-1 overflow-x-auto overflow-y-auto bg-white dark:bg-slate-900 shadow-sm border border-slate-200 dark:border-slate-800 rounded-xl relative">
            <table className="w-full text-left border-collapse table-fixed select-none min-w-175">
              <thead>
                <tr className="bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 uppercase text-[11px] font-bold tracking-widest leading-none h-10 border-b border-slate-200 dark:border-slate-700">
                  <th className="p-2 pl-4 w-[25%] border-r border-slate-200 dark:border-slate-700 truncate">
                    Equipment & Settings
                  </th>
                  {sessions
                    .slice(0, 6)
                    .reverse()
                    .map((s, sIdx) => {
                      const displaySessions = sessions.slice(0, 6).reverse();
                      const globalIndexIdx = sessions.findIndex(
                        (sess) => sess.id === s.id,
                      );
                      // Calculate purely based on history length to fix inconsistencies from deleted/imported logs
                      const totalRecords = Math.max(
                        calculatedSessionCount,
                        sessions.length,
                      );
                      const sNum = totalRecords - globalIndexIdx;

                      return (
                        <th
                          key={s.id}
                          className="p-1 px-2 text-center border-r border-slate-200 dark:border-slate-700 truncate w-[10%] opacity-90"
                        >
                          <div className="flex flex-col items-center justify-center space-y-1 py-1">
                            <div className="bg-slate-200 dark:bg-white/10 rounded-md px-1.5 min-w-5 py-0.5 shadow-sm inline-flex items-center justify-center mb-1">
                              <span className="font-bold tabular-nums text-[11px] leading-none text-slate-800 dark:text-white">
                                {sNum.toString().padStart(2, "0")}
                              </span>
                            </div>
                            <span className="text-[11px] text-slate-500 dark:text-slate-400 font-bold uppercase tracking-tight">
                              {s.date
                                ? new Date(
                                    parseSessionDate(s.date),
                                  ).toLocaleDateString("en-US", {
                                    month: "short",
                                    day: "numeric",
                                  })
                                : "--"}
                            </span>
                            <span className="text-[11px] text-[#38BDF8] dark:text-[#38BDF8] font-bold uppercase tracking-widest">
                              {s.legacy_filemaker_id ||
                              s.trainerId === "legacy-trainer" ||
                              s.trainerInitials === "Legacy" ||
                              s.trainerInitials === "Chart"
                                ? "Imported"
                                : formatStudioTime(s.startTime, undefined, "")}
                            </span>
                            {s.trainerInitials && (
                              <div
                                className={cn(
                                  "w-6 h-6 mt-1 rounded-full flex items-center justify-center text-[11px] font-extrabold uppercase shrink-0",
                                  getTrainerChipStyles(s.trainerInitials),
                                )}
                              >
                                {s.trainerInitials.substring(0, 2)}
                              </div>
                            )}
                          </div>
                        </th>
                      );
                    })}
                  <th className="p-2 text-center bg-slate-100 dark:bg-slate-800 truncate w-[5%] border-l border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200">
                    <Target className="w-5 h-5 mx-auto" />
                  </th>
                </tr>
              </thead>
              <tbody className="text-foreground dark:text-slate-100 border-t border-slate-200 dark:border-slate-800">
                {machines
                  .filter((machine) => {
                    if (journeyDensity !== "Compact") return true;

                    // "compact should only show machines they have preformed or have target and or starting weights for"
                    const machineLogs = allLogs.filter(
                      (l) => l.machineId === machine.id,
                    );
                    const hasPerformed = machineLogs.length > 0;

                    const targetWeight =
                      clientSettings[machine.id!]?.targetWeight ||
                      client?.currentMachineMetrics?.[machine.id!]?.weight;
                    const hasTarget =
                      targetWeight !== undefined &&
                      targetWeight !== null &&
                      targetWeight !== "" &&
                      targetWeight !== "-";

                    const startingWeight =
                      clientSettings[machine.id!]?.startingWeight;
                    const hasStarting =
                      startingWeight !== undefined &&
                      startingWeight !== null &&
                      startingWeight !== "";

                    return hasPerformed || hasTarget || hasStarting;
                  })
                  .sort((a, b) => (a.order || 0) - (b.order || 0))
                  .map((machine, idx) => {
                    const machineLogs = allLogs.filter(
                      (l) => l.machineId === machine.id,
                    );
                    const sortedMachineLogs = [...machineLogs].sort(
                      (a, b) =>
                        (b.createdAt?.toMillis?.() || 0) -
                        (a.createdAt?.toMillis?.() || 0),
                    );
                    const currentLog = sortedMachineLogs[0] || null;
                    const colors = getMachineStyle(machine.name);
                    const displaySessions = sessions.slice(0, 6).reverse();

                    return (
                      <tr
                        key={machine.id}
                        onClick={() => {
                          const currentSettings =
                            clientSettings[machine.id!]?.settings || {};
                          setEditingSettings({
                            machineId: machine.id!,
                            settings: { ...currentSettings },
                          });
                        }}
                        className="even:bg-[#F9FAFB] odd:bg-white dark:even:bg-slate-900/40 dark:odd:bg-slate-900/60 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer h-12 transition-all group border-b border-slate-200 dark:border-slate-800 last:border-b-0"
                      >
                        <td
                          className={cn(
                            "p-2 pl-4 border-r border-slate-200 dark:border-slate-800 truncate align-middle relative overflow-hidden h-full",
                            getMuscleGroupColor(machine.name),
                          )}
                        >
                          <div className="absolute left-0 top-0 bottom-0 w-1 bg-[#115E8D]/0 group-hover:bg-[#115E8D] transition-colors" />
                          <div className="flex flex-col justify-center h-full">
                            <div className="flex items-center gap-2 mb-1 max-w-full">
                              <span className="font-bold uppercase tracking-tighter text-[14px] leading-none truncate shrink-0 max-w-full inline-flex items-center">
                                <span>{machine.name}</span>
                                {isBig5Machine(machine.name) && (
                                  <Star className="w-3 h-3 ml-1.5 fill-amber-400 text-amber-500 inline shrink-0" />
                                )}
                              </span>
                              {clientSettings[machine.id!]?.machineNotes?.some(
                                (n) => n.isImportant,
                              ) && (
                                <AlertCircle className="w-3.5 h-3.5 text-red-500 shrink-0" />
                              )}
                            </div>
                            <div className="flex items-center gap-2 text-[11px] tracking-widest truncate leading-none uppercase mt-0.5 flex-wrap">
                              {(() => {
                                const settings =
                                  clientSettings[machine.id!]?.settings || {};
                                const currentStudio = studios?.find(
                                  (s) => s.id === activeStudioId,
                                );
                                const stdSettings =
                                  currentStudio?.machineSettings?.[
                                    machine.id!
                                  ] ||
                                  machine.standardSettings ||
                                  {};
                                const options = machine.settingOptions || [];
                                const sortedEntries = orderMachineSettings(
                                  settings,
                                  stdSettings,
                                  options,
                                );

                                return sortedEntries.map(([k, v], i) => (
                                  <span
                                    key={i}
                                    className="inline-flex items-baseline bg-slate-100 dark:bg-slate-800 px-1 py-0.5 rounded-lg"
                                  >
                                    <span className="font-semibold text-slate-400 font-sans mr-0.5">
                                      {k}:
                                    </span>
                                    <span className="font-bold text-slate-800 dark:text-slate-200">
                                      {v}
                                    </span>
                                  </span>
                                ));
                              })()}
                            </div>
                          </div>
                        </td>
                        {displaySessions.map((s, sIdx) => {
                          const log = machineLogs.find(
                            (l) => l.sessionId === s.id,
                          );
                          const isLast = sIdx === displaySessions.length - 1;

                          let bgClass = "bg-transparent";
                          let labelColor = "text-slate-800 dark:text-slate-200";
                          let repsColor = "text-slate-600 dark:text-slate-400";
                          let borderColor =
                            "border-slate-200/50 dark:border-slate-700/50";

                          if (log) {
                            labelColor = isLast
                              ? "text-foreground dark:text-white"
                              : "text-slate-700 dark:text-slate-300";
                            repsColor = isLast
                              ? "text-slate-600 dark:text-slate-400"
                              : "text-slate-500 dark:text-slate-500";

                            if (
                              journeyDensity === "Full" ||
                              journeyDensity === "Compact"
                            ) {
                              if (log.repQuality === 3) {
                                bgClass =
                                  "bg-emerald-200 dark:bg-emerald-500/20";
                                borderColor =
                                  "border-emerald-400 dark:border-emerald-500/30";
                                if (isLast) {
                                  labelColor =
                                    "text-emerald-900 dark:text-emerald-100";
                                  repsColor =
                                    "text-emerald-800 dark:text-emerald-300";
                                }
                              } else if (log.repQuality === 2) {
                                bgClass = "bg-amber-200 dark:bg-amber-500/20";
                                borderColor =
                                  "border-amber-400 dark:border-amber-500/30";
                                if (isLast) {
                                  labelColor =
                                    "text-amber-900 dark:text-amber-100";
                                  repsColor =
                                    "text-amber-800 dark:text-amber-300";
                                }
                              } else if (log.repQuality === 1) {
                                bgClass = "bg-rose-200 dark:bg-rose-500/20";
                                borderColor =
                                  "border-rose-400 dark:border-rose-500/30";
                                if (isLast) {
                                  labelColor =
                                    "text-rose-900 dark:text-rose-100";
                                  repsColor =
                                    "text-rose-800 dark:text-rose-300";
                                }
                              }
                            }
                          }

                          if (journeyDensity === "Compact") {
                            if (bgClass === "bg-transparent") {
                              borderColor = "border-transparent";
                            }
                          }

                          return (
                            <td
                              key={s.id}
                              className={cn(
                                "p-0 border-r border-slate-200 dark:border-slate-800 align-middle h-full transition-colors",
                                bgClass,
                              )}
                            >
                              {log ? (
                                <div className="flex flex-col w-full h-full text-center">
                                  <div
                                    className={cn(
                                      "flex-1 flex flex-col items-center justify-center p-1",
                                      journeyDensity !== "Compact"
                                        ? "border-b min-h-5.5"
                                        : "h-full",
                                      borderColor,
                                    )}
                                  >
                                    <div className="flex items-center flex-col justify-center gap-0.5">
                                      <span
                                        className={cn(
                                          "font-bold font-sans tracking-tight leading-none",
                                          journeyDensity === "Compact"
                                            ? "text-[14px]"
                                            : "text-[12px] sm:text-[13px]",
                                          labelColor,
                                        )}
                                      >
                                        {log.weight}
                                      </span>
                                      {journeyDensity === "Full" && log.rpe && (
                                        <span className="text-[9px] bg-black/5 dark:bg-white/5 px-1 rounded-[3px] text-slate-500 font-semibold tracking-widest leading-none mt-0.5 py-0.5 uppercase">
                                          RPE {log.rpe}
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                  {journeyDensity !== "Compact" && (
                                    <div className="flex-1 flex items-center justify-center p-1 min-h-5">
                                      <span
                                        className={cn(
                                          "font-extrabold text-[11px] leading-none",
                                          repsColor,
                                        )}
                                      >
                                        {log.repsLeft !== undefined &&
                                        log.repsRight !== undefined ? (
                                          `${log.repsLeft}L|${log.repsRight}R`
                                        ) : log.isStaticHold ? (
                                          <>
                                            {log.seconds}
                                            <span className="text-[11px] ml-0.5 lowercase font-medium opacity-80">
                                              s
                                            </span>
                                          </>
                                        ) : (
                                          log.reps
                                        )}
                                      </span>
                                    </div>
                                  )}
                                </div>
                              ) : (
                                <div className="h-full w-full flex items-center justify-center">
                                  <span className="text-[12px] text-slate-300 dark:text-slate-600 font-medium">
                                    --
                                  </span>
                                </div>
                              )}
                            </td>
                          );
                        })}
                        <td className="p-0 text-center bg-[#F9FAFB] dark:bg-slate-900/40 align-middle border-l border-slate-200 dark:border-slate-800 h-full w-[5%] relative">
                          <div className="flex flex-col items-center justify-center h-full w-full opacity-70 transition-opacity hover:opacity-100 py-1.5 border-l-[3px] border-l-transparent">
                            <Target className="w-3.5 h-3.5 mb-1.5 text-slate-400" />
                            <span className="font-bold text-[11px] text-slate-600 dark:text-slate-400">
                              {clientSettings[machine.id!]?.targetWeight ||
                                client?.currentMachineMetrics?.[machine.id!]
                                  ?.weight ||
                                "-"}
                            </span>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        </TabsContent>
        <TabsContent
          value="routines"
          className="mt-0 flex-1 min-h-0 focus-visible:outline-none"
        >
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 items-start">
            {/* Render Routine A Card */}
            {renderRoutineCard("Routine A")}

            {/* Render Routine B Card */}
            {renderRoutineCard("Routine B")}

            {/* Collapsible Routine Audit Journal */}
            {renderRoutineJournalList()}
          </div>

          {/* Sticky Selected Routine Indicator */}
          {selectedRoutineTodayId && (
            <div className="mt-6 flex justify-center">
              <StickyCTA
                label={`${getSelectedRoutineLabel()} SELECTED`}
                onClick={() => {
                  setView("workouts");
                }}
              />
            </div>
          )}

          {/* Dialog/Modal for Routine B Toggle Reason */}
          <Dialog
            open={isToggleReasonDialogOpen}
            onOpenChange={setIsToggleReasonDialogOpen}
          >
            <DialogContent
              showCloseButton={false}
              className="rounded-2xl max-w-md p-6 bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800"
            >
              <DialogHeader>
                <DialogTitle className="text-lg font-bold uppercase tracking-tight text-slate-950 dark:text-white font-display italic">
                  Reason Required for Protocol B Change
                </DialogTitle>
                <DialogDescription className="text-xs text-slate-500 mt-1">
                  Please provide a brief justification to explain why you are{" "}
                  {pendingToggleBValue ? "enabling" : "disabling"} the optional
                  Routine B protocol for {client?.firstName}.
                </DialogDescription>
              </DialogHeader>
              <div className="mt-4 space-y-4">
                <Textarea
                  value={toggleBReason}
                  onChange={(e) => setToggleBReason(e.target.value)}
                  placeholder="e.g., Sandra is experiencing shoulder tightness; setting up B as a low-impact chest day."
                  rows={3}
                  className="rounded-xl border-div-l bg-slate-50/50 dark:bg-slate-950/20 text-xs text-slate-800 dark:text-neutral-200 resize-none"
                />
                <div className="flex justify-between items-center text-[10px]">
                  <span className="text-slate-400 font-medium">
                    Be brief and clinical for Sandra's logs.
                  </span>
                  <span
                    className={cn(
                      "font-semibold tracking-wide",
                      toggleBReason.trim().length >= 12
                        ? "text-emerald-500"
                        : "text-amber-500",
                    )}
                  >
                    {toggleBReason.trim().length}/12 characters minimum
                  </span>
                </div>
              </div>
              <div className="mt-6 flex justify-end gap-3 border-t border-div-l/40 pt-4">
                <Button
                  variant="ghost"
                  onClick={() => setIsToggleReasonDialogOpen(false)}
                  className="rounded-xl uppercase font-bold text-xs"
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleConfirmToggleB}
                  disabled={toggleBReason.trim().length < 12 || isSavingToggle}
                  className="bg-cta text-white hover:bg-cta-strong rounded-xl uppercase font-bold text-xs shadow-md shadow-cta/15"
                >
                  {isSavingToggle ? "Saving..." : "Confirm Switch"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>

          {/* RoutineEditDrawer Bottom Sheet Slide-Up Dialog */}
          <Dialog open={isEditDrawerOpen} onOpenChange={setIsEditDrawerOpen}>
            <DialogContent
              showCloseButton={false}
              className="max-w-2xl max-h-[90vh] overflow-hidden flex flex-col p-6 bg-white dark:bg-slate-900 rounded-t-3xl sm:rounded-2xl border border-div-l"
            >
              <DialogHeader className="pb-4 border-b border-div-l shrink-0">
                <div className="flex items-center justify-between">
                  <DialogTitle className="text-xl font-bold uppercase tracking-tight text-slate-900 dark:text-neutral-100 italic font-display">
                    Edit {editingRoutineName}
                  </DialogTitle>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setIsEditDrawerOpen(false)}
                    className="h-8 w-8 p-0"
                  >
                    <X className="w-5 h-5" />
                  </Button>
                </div>
                <DialogDescription className="text-xs text-slate-500 mt-1">
                  Adjust the machine order, remove/add machines, and provide a
                  mandatory reason explaining this clinical adjustment.
                </DialogDescription>
              </DialogHeader>

              {/* Drawer Body: Sortable Machines List and Add Machine form */}
              <div className="flex-1 overflow-y-auto py-4 space-y-6">
                <div>
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3 font-mono">
                    Sequence Order (Drag to Reorder)
                  </h3>

                  {editDrawerMachineIds.length === 0 ? (
                    <p className="text-xs text-slate-400 italic py-4">
                      No units in routine. Tap Add Machine below.
                    </p>
                  ) : (
                    <DndContext
                      sensors={sensors}
                      collisionDetection={closestCenter}
                      onDragEnd={handleDragEndDrawer}
                    >
                      <SortableContext
                        items={editDrawerMachineIds}
                        strategy={verticalListSortingStrategy}
                      >
                        <div className="space-y-2">
                          {editDrawerMachineIds.map((machineId, idx) => {
                            const machine = machines.find(
                              (m) => m.id === machineId,
                            );
                            if (!machine) return null;

                            return (
                              <SortableRoutineMachineRow
                                key={machineId}
                                id={machineId}
                                machineName={machine.name || "Unknown Machine"}
                                weightText=""
                                repsText=""
                                isEditMode={true}
                                onRemove={() => {
                                  setEditDrawerMachineIds((prev) =>
                                    prev.filter((id) => id !== machineId),
                                  );
                                }}
                              />
                            );
                          })}
                        </div>
                      </SortableContext>
                    </DndContext>
                  )}
                </div>

                {/* Add Machine Search Picker */}
                <div className="pt-4 border-t border-div-l/40">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3 font-mono">
                    Add Machine Unit
                  </h3>
                  <div className="relative mb-3">
                    <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400 pointer-events-none" />
                    <Input
                      value={machineSearchQuery}
                      onChange={(e) => setMachineSearchQuery(e.target.value)}
                      placeholder="Search by machine name or body region..."
                      className="pl-9 rounded-xl border-div-l text-xs h-10 bg-slate-50/50 dark:bg-slate-950/20"
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 max-h-40 overflow-y-auto p-2 bg-slate-50 dark:bg-slate-900/30 rounded-xl border border-div-l/30">
                    {availableMachines.length === 0 ? (
                      <p className="col-span-full text-xs text-slate-400 text-center py-4">
                        No matching machines
                      </p>
                    ) : (
                      availableMachines.map((m) => (
                        <button
                          key={m.id}
                          type="button"
                          onClick={() => {
                            setEditDrawerMachineIds((prev) => [...prev, m.id!]);
                            setMachineSearchQuery(""); // clear search on add
                          }}
                          className="flex items-center gap-1.5 p-2 bg-white dark:bg-slate-900 border border-div-l/50 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl text-left transition-colors text-xs font-medium uppercase tracking-tight text-slate-700 dark:text-neutral-300"
                        >
                          <Plus className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                          <span className="truncate">{m.name}</span>
                        </button>
                      ))
                    )}
                  </div>
                </div>

                {/* Reason Area */}
                <div className="pt-4 border-t border-div-l/40 bg-slate-50/20 dark:bg-slate-950/20 p-4 rounded-xl">
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-neutral-350 mb-2 font-display">
                    Why are you making this change?{" "}
                    <span className="text-red-500">*</span>
                  </label>
                  <Textarea
                    value={drawerReason}
                    onChange={(e) => setDrawerReason(e.target.value)}
                    placeholder="e.g., Decreasing spinal load post L4 herniation flare-up; swapping leg press for leg extension today."
                    rows={3}
                    className="rounded-xl border-div-l bg-white dark:bg-slate-900 resize-none text-xs text-slate-800 dark:text-neutral-100"
                  />
                  <div className="flex justify-between items-center mt-2">
                    <p className="text-[10px] text-slate-400">
                      Provide a brief clinical rationale for Sandra's profile
                      logs.
                    </p>
                    <p
                      className={cn(
                        "text-[10px] font-semibold tracking-wide",
                        drawerReason.trim().length >= 12
                          ? "text-emerald-500"
                          : "text-amber-500",
                      )}
                    >
                      {drawerReason.trim().length}/12 characters
                    </p>
                  </div>
                </div>
              </div>

              <div className="pt-4 border-t border-div-l flex justify-end gap-3 shrink-0">
                <Button
                  variant="ghost"
                  onClick={() => setIsEditDrawerOpen(false)}
                  className="rounded-xl uppercase font-bold text-xs"
                >
                  Close
                </Button>
                <Button
                  onClick={handleSaveEditDrawer}
                  disabled={drawerReason.trim().length < 12 || isSavingDrawer}
                  className="bg-cta text-white hover:bg-cta-strong rounded-xl uppercase font-bold text-xs shadow-md shadow-cta/15"
                >
                  {isSavingDrawer ? "Saving Changes..." : "Apply Routine"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </TabsContent>
        <TabsContent
          value="journal"
          className="mt-0 flex-1 min-h-0 focus-visible:outline-none"
        >
          <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-6 shadow-sm space-y-6">
            {/* Header Content & Trigger */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-100 dark:border-slate-800 pb-5">
              <div>
                <h2 className="text-xl font-black tracking-tight text-slate-900 dark:text-slate-100 font-display italic uppercase">
                  Coaching Journal
                </h2>
                <p className="text-xs text-slate-500 mt-1">
                  {client?.firstName} {client?.lastName} ·{" "}
                  {filteredJournalEntries.length} filtered records under{" "}
                  {perTrainerSummary.length} active coach profiles
                </p>
              </div>

              {/* Action Buttons */}
              <div className="flex flex-wrap items-center gap-2 sm:gap-3 self-start md:self-auto">
                <Button
                  onClick={() => {
                    setInfoSheetTab("events");
                    setIsInfoSheetOpen(true);
                  }}
                  variant="outline"
                  className="h-10 sm:h-11 px-3 sm:px-5 rounded-xl border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-200 font-black uppercase text-[10px] sm:text-xs tracking-wider cursor-pointer shadow-sm hover:bg-slate-50 dark:hover:bg-slate-800"
                >
                  <Calendar className="w-4 h-4 mr-1.5" />
                  <span>Events & Alerts</span>
                </Button>
                <Button
                  onClick={() => setIsAddJournalOpen(true)}
                  className="h-10 sm:h-11 px-3.5 sm:px-5 rounded-xl bg-cta text-white hover:bg-cta-strong font-black uppercase text-[10px] sm:text-xs tracking-wider shadow-md shadow-cta/15 flex items-center gap-1.5 cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  <span>Add Journal Entry</span>
                </Button>
              </div>
            </div>

            {/* Filter Bar */}
            <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 py-5 border-b border-slate-200 dark:border-slate-800 items-start">
              {/* Type Filter */}
              <div className="space-y-1.5">
                <span className="text-[10px] font-bold tracking-wider text-slate-400 uppercase font-mono">
                  Stream Type
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {(["All", "Focus", "Notes", "Incidents"] as const).map(
                    (t) => (
                      <button
                        key={t}
                        onClick={() => setActiveTypeFilter(t)}
                        className={cn(
                          "h-11 px-4 text-xs font-semibold uppercase tracking-wider rounded-xl border transition-all cursor-pointer",
                          activeTypeFilter === t
                            ? "bg-[#F06C22] text-white border-transparent shadow-sm shadow-[#F06C22]/20"
                            : "bg-slate-100 dark:bg-slate-800/60 border-slate-200/60 dark:border-slate-700/60 hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300",
                        )}
                      >
                        {t}
                      </button>
                    ),
                  )}
                </div>
              </div>

              {/* Coach Selector */}
              <div className="space-y-1.5">
                <span className="text-[10px] font-bold tracking-wider text-slate-400 uppercase font-mono">
                  Filter by Coach
                </span>
                <div className="flex flex-wrap gap-1.5">
                  <button
                    onClick={() => setActiveTrainerFilter("All")}
                    className={cn(
                      "h-11 px-4 text-xs font-semibold uppercase tracking-wider rounded-xl border transition-all cursor-pointer",
                      activeTrainerFilter === "All"
                        ? "bg-[#F06C22] text-white border-transparent shadow-sm shadow-[#F06C22]/20"
                        : "bg-slate-100 dark:bg-slate-800/60 border-slate-200/60 dark:border-slate-700/60 hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300",
                    )}
                  >
                    All
                  </button>
                  {perTrainerSummary.map((summary) => (
                    <button
                      key={summary.trainerId}
                      onClick={() => setActiveTrainerFilter(summary.trainerId)}
                      className={cn(
                        "h-11 px-4 text-xs font-semibold uppercase tracking-wider rounded-xl border transition-all flex items-center gap-2 cursor-pointer",
                        activeTrainerFilter === summary.trainerId
                          ? "bg-[#F06C22] text-white border-transparent shadow-sm shadow-[#F06C22]/20"
                          : "bg-slate-100 dark:bg-slate-800/60 border-slate-200/60 dark:border-slate-700/60 hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300",
                      )}
                    >
                      <span className="w-5 h-5 rounded-md bg-slate-200 dark:bg-slate-700 flex items-center justify-center font-mono font-bold text-[10px] text-slate-700 dark:text-slate-300 shrink-0">
                        {summary.trainerInitials}
                      </span>
                      <span>{summary.trainerInitials}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Date Filter */}
              <div className="space-y-1.5">
                <span className="text-[10px] font-bold tracking-wider text-slate-400 uppercase font-mono">
                  Date Range
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {(["7d", "30d", "90d", "All"] as const).map((w) => (
                    <button
                      key={w}
                      onClick={() => setActiveWindowFilter(w)}
                      className={cn(
                        "h-11 px-4 text-xs font-semibold uppercase tracking-wider rounded-xl border transition-all cursor-pointer",
                        activeWindowFilter === w
                          ? "bg-[#F06C22] text-white border-transparent shadow-sm shadow-[#F06C22]/20"
                          : "bg-slate-100 dark:bg-slate-800/60 border-slate-200/60 dark:border-slate-700/60 hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300",
                      )}
                    >
                      {w}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Per-Trainer Highlights */}
            <div className="py-4">
              <h3 className="text-xs font-bold tracking-wider text-slate-400 uppercase font-mono mb-4">
                Active Coach Directives
              </h3>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                {perTrainerSummary.map((summary) => (
                  <button
                    key={summary.trainerId}
                    onClick={() =>
                      setActiveTrainerFilter(
                        summary.trainerId === activeTrainerFilter
                          ? "All"
                          : summary.trainerId,
                      )
                    }
                    className={cn(
                      "p-4 rounded-xl border text-left transition-all bg-slate-50/55 dark:bg-slate-900/50 hover:bg-slate-50 dark:hover:bg-slate-900 border-slate-200/70 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 relative group flex gap-3.5 cursor-pointer",
                      activeTrainerFilter === summary.trainerId &&
                        "ring-2 ring-cyan border-transparent shadow bg-white dark:bg-slate-900",
                    )}
                  >
                    <div
                      className={cn(
                        "w-10 h-10 rounded-lg font-bold shrink-0 flex items-center justify-center font-sans tracking-wide text-xs",
                        getTrainerChipClasses(summary.trainerInitials),
                      )}
                    >
                      {summary.trainerInitials}
                    </div>
                    <div className="min-w-0 flex-1 space-y-1">
                      <p className="text-xs font-bold uppercase tracking-tight text-slate-800 dark:text-slate-100 truncate">
                        {summary.trainerName}
                      </p>
                      <p className="text-[10px] text-slate-400 font-medium">
                        {summary.entryCount}{" "}
                        {summary.entryCount === 1 ? "entry" : "entries"} ·{" "}
                        {getDaysAgo(summary.lastEntryDate)}
                      </p>
                      <div className="mt-2 border-t border-slate-200/40 dark:border-slate-850/40 pt-2 text-[11px] leading-snug">
                        {summary.currentFocus ? (
                          <div className="text-slate-650 dark:text-slate-300">
                            <span className="font-bold text-slate-700 dark:text-slate-200 uppercase tracking-wide">
                              Focus:
                            </span>{" "}
                            {summary.currentFocus}
                          </div>
                        ) : (
                          <span className="text-slate-400 italic">
                            No active custom-focus recorded
                          </span>
                        )}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Timeline Area */}
            <div className="space-y-4 pt-4 border-t border-slate-200 dark:border-slate-800">
              <h3 className="text-xs font-bold tracking-wider text-slate-400 uppercase font-mono mb-2">
                Chronological Timeline Ledger
              </h3>

              {filteredJournalEntries.length === 0 ? (
                <div className="py-16 text-center border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-2xl bg-slate-50/10 dark:bg-slate-950/10 flex flex-col items-center justify-center">
                  <Clock className="w-11 h-11 text-slate-400 opacity-40 mb-3" />
                  <p className="text-xs font-bold tracking-wider text-slate-400 uppercase">
                    No Timeline Entries Found
                  </p>
                  <p className="text-[11px] text-slate-400 mt-1">
                    Try relaxing some of your filter criteria.
                  </p>
                </div>
              ) : (
                <div className="space-y-3.5">
                  {filteredJournalEntries.map((entry) => {
                    // Borders based on entry types
                    let borderClass =
                      "border-l-slate-300 dark:border-l-slate-700";
                    if (entry.type === "focus") {
                      borderClass = "border-l-[5px] border-l-cyan";
                    } else if (entry.type === "session_note") {
                      borderClass = "border-l-[5px] border-l-cta";
                    } else if (entry.type === "incident") {
                      borderClass = entry.resolvedAt
                        ? "border-l-[5px] border-l-yellow"
                        : "border-l-[5px] border-l-red";
                    }

                    return (
                      <div
                        key={entry.id}
                        className={cn(
                          "flex flex-col sm:flex-row sm:items-start gap-4 p-4 rounded-xl border bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 pl-5 transition-colors relative overflow-hidden",
                          borderClass,
                        )}
                      >
                        <div className="flex-1 space-y-3">
                          {/* Heading row */}
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-[11px] font-mono text-slate-500 dark:text-slate-400 font-semibold">
                              {entry.date.toLocaleDateString([], {
                                month: "short",
                                day: "numeric",
                                year: "numeric",
                              })}{" "}
                              at{" "}
                              {entry.date.toLocaleTimeString([], {
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                            </span>

                            <span
                              className={cn(
                                "text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider",
                                getTrainerChipClasses(entry.trainer),
                              )}
                            >
                              Coach: {entry.trainer}
                            </span>

                            <Badge
                              className={cn(
                                "text-[9px] uppercase tracking-wider font-extrabold font-mono",
                                entry.type === "focus" &&
                                  "bg-cyan/10 text-cyan border-none",
                                entry.type === "note" &&
                                  "bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-none",
                                entry.type === "session_note" &&
                                  "bg-cta/10 text-cta border-none",
                                entry.type === "incident" &&
                                  "bg-red/10 text-red border-none",
                              )}
                            >
                              {entry.type === "focus"
                                ? "Directive"
                                : entry.type === "note"
                                  ? "Global Note"
                                  : entry.type === "session_note"
                                    ? "Session Brief"
                                    : "Clinical Safety"}
                            </Badge>

                            {entry.type === "focus" && (
                              <Badge className="text-[9px] uppercase tracking-widest bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 font-extrabold border-none">
                                {entry.category}
                              </Badge>
                            )}

                            {entry.type === "note" &&
                              (entry as any).priority && (
                                <Badge
                                  className={cn(
                                    "text-[9px] uppercase tracking-widest border-none font-bold",
                                    (entry as any).priority === "High"
                                      ? "bg-red/15 text-red"
                                      : (entry as any).priority === "Medium"
                                        ? "bg-yellow/15 text-yellow-700"
                                        : "bg-green/15 text-green",
                                  )}
                                >
                                  {(entry as any).priority} Priority
                                </Badge>
                              )}
                          </div>

                          {/* Content paragraph */}
                          <div>
                            {entry.type === "focus" && (
                              <div className="flex items-center gap-2 text-[11px] uppercase tracking-wider font-bold text-slate-400 dark:text-slate-500 font-mono mb-1">
                                <span>Coaching Focus: Actionable Cue</span>
                                {entry.targetMachineId && (
                                  <span className="text-cyan font-semibold">
                                    ·{" "}
                                    {machines.find(
                                      (m) => m.id === entry.targetMachineId,
                                    )?.name || "Machine Action"}
                                  </span>
                                )}
                              </div>
                            )}

                            <p className="text-xs text-slate-850 dark:text-slate-200 leading-relaxed font-medium whitespace-pre-line">
                              {entry.content}
                            </p>
                          </div>

                          {/* Interactive statuses */}
                          {entry.type === "focus" && (
                            <div className="pt-2 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <span className="text-[10px] text-slate-400 dark:text-slate-500 font-semibold">
                                  Category definition:{" "}
                                  {
                                    JOURNAL_CATEGORY_DEFINITIONS[entry.category]
                                      ?.description
                                  }
                                </span>
                              </div>

                              {entry.status === "Active" ? (
                                <button
                                  type="button"
                                  onClick={() =>
                                    handleMarkFocusAchieved(entry.id)
                                  }
                                  className="h-8 px-3 rounded-lg text-[10px] font-bold uppercase tracking-wider text-green hover:bg-green/10 border border-green/20 ml-auto flex items-center gap-1.5 shrink-0 shadow-sm cursor-pointer"
                                >
                                  <Check className="w-3.5 h-3.5" />
                                  Mark Achieved
                                </button>
                              ) : (
                                <div className="flex items-center gap-1 text-green font-bold text-[10px] uppercase tracking-wider ml-auto bg-green/10 px-2.5 py-1 rounded-lg border border-green/20 shrink-0">
                                  <CheckCircle2 className="w-3.5 h-3.5" />
                                  <span>Achieved Ledgered</span>
                                </div>
                              )}
                            </div>
                          )}

                          {entry.type === "incident" && (
                            <div className="pt-2 border-t border-slate-200 dark:border-slate-800 flex items-center gap-2 text-xs">
                              {entry.resolvedAt ? (
                                <span className="text-green font-bold uppercase tracking-wider flex items-center gap-1">
                                  <CheckCircle2 className="w-3.5 h-3.5" />{" "}
                                  Resolved
                                </span>
                              ) : (
                                <span className="text-red font-black uppercase tracking-wider flex items-center gap-1 animate-pulse">
                                  <AlertCircle className="w-3.5 h-3.5" />{" "}
                                  UNRESOLVED SAFETY INCIDENT
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <Card className="rounded-[40px] border-2 shadow-xl overflow-hidden min-h-75">
              <CardHeader className="p-6 sm:p-8 border-b">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <CardTitle className="text-lg sm:text-xl font-bold uppercase italic tracking-tighter">
                      Progress Report Archive
                    </CardTitle>
                    <CardDescription className="text-[10px] sm:text-[11px] font-medium uppercase tracking-wide opacity-70 mt-0.5 sm:mt-1">
                      Evaluations, Goals & Outcomes
                    </CardDescription>
                  </div>
                  <Button
                    onClick={() => setView("progress-report")}
                    variant="default"
                    size="sm"
                    className="rounded-xl font-bold uppercase text-[10px] sm:text-[11px] tracking-wide h-10 sm:h-11 px-3.5 sm:px-4 bg-primary shrink-0 self-start sm:self-auto"
                  >
                    <Plus className="w-4 h-4 mr-1.5" /> New Evaluation
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                <div className="divide-y relative max-h-100 overflow-y-auto custom-scrollbar">
                  {progressReports.length > 0 ? (
                    progressReports
                      .sort(
                        (a, b) =>
                          parseSessionDate(b.date) - parseSessionDate(a.date),
                      )
                      .map((report) => (
                        <div
                          key={report.id}
                          className="p-6 hover:bg-muted/30 transition-colors group flex items-center justify-between"
                        >
                          <div className="flex items-center gap-4">
                            <div className="w-12 h-12 rounded-2xl bg-muted/50 flex flex-col items-center justify-center border group-hover:bg-primary/5 group-hover:border-primary/20 transition-all font-bold uppercase italic text-primary">
                              <span className="text-[11px] leading-none">
                                {report.date.split("-")[1]}/
                                {report.date.split("-")[2]}
                              </span>
                              <span className="text-[11px] opacity-30 mt-1">
                                {report.date.split("-")[0]}
                              </span>
                            </div>
                            <div>
                              <div className="flex items-center gap-2">
                                <p className="text-sm font-bold italic uppercase tracking-tight text-foreground">
                                  Client Progress Evaluation
                                </p>
                                <Badge
                                  variant={
                                    report.status === "Finalized"
                                      ? "default"
                                      : "secondary"
                                  }
                                  className={`px-1.5 py-0 h-4 text-[11px] font-bold uppercase border-none ${report.status === "Finalized" ? "bg-emerald-500/10 text-emerald-600" : "bg-amber-500/10 text-amber-600"}`}
                                >
                                  {report.status || "Finalized"}
                                </Badge>
                              </div>
                              <div className="flex items-center gap-4 mt-1">
                                <span className="text-[11px] text-muted-foreground font-bold uppercase tracking-widest bg-muted px-2 py-0.5 rounded">
                                  Session #
                                  {report.sessionNumber ||
                                    Math.round(
                                      report.attendance?.totalSessions,
                                    ) ||
                                    "---"}
                                </span>
                                <span className="text-[11px] text-muted-foreground font-bold uppercase flex items-center gap-1">
                                  <User className="w-2.5 h-2.5" />
                                  {report.trainerName ||
                                    report.trainerInitials ||
                                    "Team"}
                                </span>
                              </div>
                            </div>
                          </div>
                          <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setReportToDelete(report)}
                              className="rounded-xl font-bold uppercase italic text-[11px] tracking-widest text-red-500 hover:text-red-600 hover:bg-red-500/10 mr-2"
                            >
                              <Trash2 className="w-3 h-3 md:mr-2" />
                              <span className="hidden md:inline">Delete</span>
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => onSelectReport(report.id!)}
                              className="rounded-xl font-bold uppercase italic text-[11px] tracking-widest text-primary"
                            >
                              {report.status === "Draft"
                                ? "Resume Draft"
                                : "View / Present"}
                            </Button>
                          </div>
                        </div>
                      ))
                  ) : (
                    <div className="p-12 text-center space-y-4">
                      <TrendingUp className="w-12 h-12 text-muted-foreground mx-auto opacity-20" />
                      <p className="text-muted-foreground font-bold uppercase tracking-widest text-xs">
                        No progress reports registered in archive
                      </p>
                      <Button
                        variant="outline"
                        className="rounded-full font-medium uppercase text-[11px] tracking-wide opacity-70 border-2 mt-4"
                        onClick={() => setView("progress-report")}
                      >
                        Perform First Evaluation
                      </Button>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
        {/* Add Entry sheet/dialog */}
        <Dialog open={isAddJournalOpen} onOpenChange={setIsAddJournalOpen}>
          <DialogContent className="max-w-xl w-full bg-card rounded-3xl p-6 border border-border shadow-2xl">
            <DialogHeader className="border-b border-border pb-4">
              <DialogTitle className="text-lg font-black uppercase italic tracking-tight text-card-foreground font-display">
                New clinical/coaching entry
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground font-medium">
                Add an actionable coaching focus directive or a detailed
                progress session note for {client?.firstName}.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-5 py-4">
              {/* Type Switcher */}
              <div className="space-y-1.5">
                <Label className="text-[10px] font-bold tracking-wider text-muted-foreground uppercase font-mono">
                  Entry Ledger Category
                </Label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setNewType("Focus")}
                    className={cn(
                      "h-11 rounded-xl text-xs font-bold uppercase tracking-wider border transition-all cursor-pointer",
                      newJournalType === "Focus"
                        ? "bg-cyan/10 border-cyan text-cyan"
                        : "bg-muted border-border hover:bg-accent text-muted-foreground",
                    )}
                  >
                    Clinical Focus Directive
                  </button>
                  <button
                    type="button"
                    onClick={() => setNewType("Note")}
                    className={cn(
                      "h-11 rounded-xl text-xs font-bold uppercase tracking-wider border transition-all cursor-pointer",
                      newJournalType === "Note"
                        ? "bg-cta/15 border-cta text-cta"
                        : "bg-muted border-border hover:bg-accent text-muted-foreground",
                    )}
                  >
                    Session / Clinical Note
                  </button>
                </div>
              </div>

              {/* Focus Specific Fields */}
              {newJournalType === "Focus" ? (
                <>
                  {/* Category Pill Picker */}
                  <div className="space-y-2">
                    <Label className="text-[10px] font-bold tracking-wider text-muted-foreground uppercase font-mono">
                      The 4 P's Category Definition
                    </Label>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {(
                        [
                          "Posture",
                          "Pace",
                          "Path",
                          "Purpose",
                        ] as FocusCategory[]
                      ).map((cat) => {
                        const def = JOURNAL_CATEGORY_DEFINITIONS[cat];
                        const IconComponent = def.icon;
                        const isSelected = newFocusCategory === cat;
                        return (
                          <button
                            key={cat}
                            type="button"
                            onClick={() => setNewFocusCategory(cat)}
                            className={cn(
                              "p-3 rounded-xl border text-left transition-all flex items-start gap-2.5 cursor-pointer",
                              isSelected
                                ? "bg-card border-2 border-cyan ring-1 ring-cyan"
                                : "bg-muted border-border hover:bg-accent",
                            )}
                          >
                            <div
                              className={cn(
                                "w-8 h-8 rounded-lg flex items-center justify-center shrink-0",
                                def.bg,
                              )}
                            >
                              <IconComponent
                                className={cn("w-4 h-4", def.color)}
                              />
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="text-xs font-bold uppercase text-card-foreground tracking-tight leading-none mb-1">
                                {cat}
                              </p>
                              <p className="text-[9px] text-muted-foreground leading-tight font-medium line-clamp-2">
                                {def.helper}
                              </p>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Machine optional field */}
                  <div className="space-y-1.5">
                    <Label
                      htmlFor="target-machine"
                      className="text-[10px] font-bold tracking-wider text-muted-foreground uppercase font-mono"
                    >
                      Target Equipment Unit (Optional)
                    </Label>
                    <Select
                      value={newTargetMachineId}
                      onValueChange={setNewTargetMachineId}
                    >
                      <SelectTrigger
                        id="target-machine"
                        className="h-11 rounded-xl bg-muted border-border text-card-foreground border font-medium"
                      >
                        <SelectValue placeholder="Global / Client Profile" />
                      </SelectTrigger>
                      <SelectContent className="bg-card border border-border rounded-xl text-card-foreground font-medium">
                        <SelectItem value="none">
                          Global / Client Profile Level
                        </SelectItem>
                        {machines.map((m) => (
                          <SelectItem key={m.id} value={m.id}>
                            {m.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Focus Directive Notes */}
                  <div className="space-y-1.5">
                    <Label
                      htmlFor="clinical-notes"
                      className="text-[10px] font-bold tracking-wider text-muted-foreground uppercase font-mono"
                    >
                      Clinical focus cue instructions
                    </Label>
                    <Textarea
                      id="clinical-notes"
                      value={newFocusNotes}
                      onChange={(e) => setNewFocusNotes(e.target.value)}
                      placeholder="e.g., Maintain 8s rhythm. Emphasize scapular retraction at extreme range. Avoid shoulder rolling."
                      className="min-h-25 text-xs p-3 rounded-xl bg-muted border-border text-card-foreground focus-visible:ring-cyan text-medium leading-relaxed"
                    />
                  </div>
                </>
              ) : (
                <>
                  {/* Priority selector */}
                  <div className="space-y-1.5">
                    <Label className="text-[10px] font-bold tracking-wider text-muted-foreground uppercase font-mono">
                      Log Priority Level
                    </Label>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                      {(["High", "Medium", "Low"] as const).map((prio) => (
                        <button
                          key={prio}
                          type="button"
                          onClick={() => setNewNotePriority(prio)}
                          className={cn(
                            "h-11 rounded-xl text-xs font-bold uppercase tracking-wider border transition-all cursor-pointer",
                            newNotePriority === prio
                              ? prio === "High"
                                ? "bg-red/15 border-red text-red-700"
                                : prio === "Medium"
                                  ? "bg-yellow/15 border-yellow text-yellow-800"
                                  : "bg-green/10 border-green text-green-700"
                              : "bg-muted border-border hover:bg-accent text-muted-foreground",
                          )}
                        >
                          {prio} Priority
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Content area */}
                  <div className="space-y-1.5">
                    <Label
                      htmlFor="note-content"
                      className="text-[10px] font-bold tracking-wider text-muted-foreground uppercase font-mono"
                    >
                      Progress entry content
                    </Label>
                    <Textarea
                      id="note-content"
                      value={newNoteContent}
                      onChange={(e) => setNewNoteContent(e.target.value)}
                      placeholder="Enter detailed clinical session documentation, progress updates, trainer observations..."
                      className="min-h-35 text-xs p-3 rounded-xl bg-muted border border-border text-card-foreground focus-visible:ring-cta text-medium leading-relaxed"
                    />
                  </div>
                </>
              )}
            </div>

            {/* Footer triggers */}
            <div className="border-t border-border pt-4 flex items-center justify-end gap-2 shrink-0">
              <Button
                variant="outline"
                onClick={() => setIsAddJournalOpen(false)}
                className="h-11 px-5 rounded-xl border-border text-card-foreground font-bold uppercase tracking-wider text-xs"
              >
                Cancel
              </Button>
              <Button
                onClick={handleSubmitJournalEntry}
                disabled={isSavingJournalEntry}
                className={cn(
                  "h-11 px-6 rounded-xl text-white font-extrabold uppercase tracking-widest text-xs",
                  newJournalType === "Focus"
                    ? "bg-cyan hover:bg-cyan/95"
                    : "bg-cta hover:bg-cta-strong",
                )}
              >
                {isSavingJournalEntry ? "Saving Ledger..." : "Save Log Entry"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
        <TabsContent
          value="history"
          className="flex-1 min-h-100 relative pb-20 overflow-y-auto custom-scrollbar"
        >
          <div className="space-y-6">
            {clientId && (
              <div className="flex flex-col gap-4">
                <ClientHistoryCalendar
                  clientId={clientId}
                  clientHomeStudioId={client?.homeStudioId}
                  machines={machines}
                  trainers={trainers}
                  user={user}
                  allLogs={allLogs}
                  clientEvents={client?.events || []}
                />

                <div className="flex justify-center pb-8">
                  <Button
                    variant="outline"
                    onClick={() => setSessionLimit((prev) => prev + 30)}
                    className="border-[#38BDF8]/50 text-[#38BDF8] hover:bg-[#38BDF8]/10 font-bold tracking-widest uppercase text-[11px] h-12 rounded-2xl px-6"
                  >
                    Load More Sessions
                  </Button>
                </div>
              </div>
            )}
          </div>
        </TabsContent>
        <TabsContent
          value="clinical"
          className="mt-0 flex-1 min-h-125 focus-visible:outline-none"
        >
          {client && (
            <ClientClinicalReviewPreloader
              client={client}
              machines={machines}
              initialLogs={allLogs}
              initialSessions={sessions}
              onOpenBriefing={() => setView("workouts")}
              onClose={() => setActiveTab("journey")}
            />
          )}
        </TabsContent>
        <TabsContent value="statistics_disabled" className="hidden">
          {/* Consistency & Training Frequency Insights */}
          {(() => {
            const completedSessions = sessions
              .filter((s) => s.status === "Completed")
              .sort(
                (a, b) => parseSessionDate(a.date) - parseSessionDate(b.date),
              );
            if (completedSessions.length === 0) return null;

            const firstDate = client.firstSessionDate
              ? new Date(
                  client.firstSessionDate?.toDate?.() ||
                    client.firstSessionDate,
                )
              : new Date(parseSessionDate(completedSessions[0].date));

            let totalRestDays = 0;
            let restIntervals = 0;
            for (let i = 1; i < completedSessions.length; i++) {
              const prev = parseSessionDate(completedSessions[i - 1].date);
              const curr = parseSessionDate(completedSessions[i].date);
              const diffDays = Math.floor(
                (curr - prev) / (1000 * 60 * 60 * 24),
              );
              if (diffDays > 0) {
                totalRestDays += diffDays;
                restIntervals++;
              }
            }
            const avgRestDays =
              restIntervals > 0
                ? (totalRestDays / restIntervals).toFixed(1)
                : "N/A";

            const timeRanges = { Morning: 0, Afternoon: 0, Evening: 0 };
            completedSessions.forEach((s) => {
              let hour = 12;
              if (s.startTime?.toDate) {
                hour = studioHour(s.startTime.toDate()) ?? 12;
              } else if (s.createdAt?.toDate) {
                hour = studioHour(s.createdAt.toDate()) ?? 12;
              }
              if (hour < 12) timeRanges.Morning++;
              else if (hour < 17) timeRanges.Afternoon++;
              else timeRanges.Evening++;
            });
            const favoriteTime = Object.keys(timeRanges).reduce((a, b) =>
              timeRanges[a as keyof typeof timeRanges] >
              timeRanges[b as keyof typeof timeRanges]
                ? a
                : b,
            );

            const thirtyDaysAgo = new Date();
            thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
            const sessionsPast30 = completedSessions.filter(
              (s) => parseSessionDate(s.date) >= thirtyDaysAgo.getTime(),
            ).length;
            const past30Weeks = 30 / 7;
            const avgPerWeek30 = (sessionsPast30 / past30Weeks).toFixed(1);

            const lifetimeDays = Math.max(
              1,
              Math.floor(
                (Date.now() - firstDate.getTime()) / (1000 * 60 * 60 * 24),
              ),
            );
            const lifetimeWeeks = lifetimeDays / 7;
            const avgPerWeekLife = (
              completedSessions.length / Math.max(1, lifetimeWeeks)
            ).toFixed(1);

            return (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
                <Card className="rounded-3xl overflow-hidden border-2 shadow-sm bg-linear-to-br from-card to-card hover:border-primary/30 transition-all group">
                  <CardContent className="p-6">
                    <div className="flex items-center gap-3 mb-2">
                      <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center group-hover:scale-110 transition-transform">
                        <CalendarDays className="w-4 h-4 text-primary" />
                      </div>
                      <p className="text-[11px] uppercase tracking-widest font-bold text-muted-foreground">
                        Origin
                      </p>
                    </div>
                    <div className="text-2xl font-bold italic tracking-tighter text-foreground">
                      {firstDate.toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      })}
                    </div>
                    <p className="text-[11px] font-bold text-muted-foreground mt-1 opacity-60">
                      First Recorded App Session
                    </p>
                  </CardContent>
                </Card>

                <Card className="rounded-3xl overflow-hidden border-2 shadow-sm bg-linear-to-br from-card to-card hover:border-emerald-500/30 transition-all group">
                  <CardContent className="p-6">
                    <div className="flex items-center gap-3 mb-2">
                      <div className="w-8 h-8 rounded-full bg-emerald-500/10 flex items-center justify-center group-hover:scale-110 transition-transform">
                        <TrendingUp className="w-4 h-4 text-emerald-500" />
                      </div>
                      <p className="text-[11px] uppercase tracking-widest font-bold text-muted-foreground">
                        Frequency
                      </p>
                    </div>
                    <div className="flex items-end gap-2">
                      <div className="text-3xl font-bold italic tracking-tighter text-foreground">
                        {avgPerWeek30}
                      </div>
                      <span className="text-xs font-bold uppercase mb-1.5 opacity-60">
                        per week (30 Days)
                      </span>
                    </div>
                    <p className="text-[11px] font-bold text-emerald-600 mt-1 uppercase tracking-widest leading-none bg-emerald-500/10 w-fit px-2 py-1 rounded">
                      Lifetime: {avgPerWeekLife} / wk
                    </p>
                  </CardContent>
                </Card>

                <Card className="rounded-3xl overflow-hidden border-2 shadow-sm bg-linear-to-br from-card to-card hover:border-amber-500/30 transition-all group">
                  <CardContent className="p-6">
                    <div className="flex items-center gap-3 mb-2">
                      <div className="w-8 h-8 rounded-full bg-amber-500/10 flex items-center justify-center group-hover:scale-110 transition-transform">
                        <Battery className="w-4 h-4 text-amber-500" />
                      </div>
                      <p className="text-[11px] uppercase tracking-widest font-bold text-muted-foreground">
                        Recovery Avg
                      </p>
                    </div>
                    <div className="flex items-end gap-2">
                      <div className="text-3xl font-bold italic tracking-tighter text-foreground">
                        {avgRestDays}
                      </div>
                      <span className="text-xs font-bold uppercase mb-1.5 opacity-60">
                        days
                      </span>
                    </div>
                    <p className="text-[11px] font-bold text-amber-600 mt-1 uppercase tracking-widest leading-none bg-amber-500/10 w-fit px-2 py-1 rounded">
                      Between sessions
                    </p>
                  </CardContent>
                </Card>

                <Card className="rounded-3xl overflow-hidden border-2 shadow-sm bg-linear-to-br from-card to-card hover:border-indigo-500/30 transition-all group">
                  <CardContent className="p-6">
                    <div className="flex items-center gap-3 mb-2">
                      <div className="w-8 h-8 rounded-full bg-indigo-500/10 flex items-center justify-center group-hover:scale-110 transition-transform">
                        <Clock className="w-4 h-4 text-indigo-500" />
                      </div>
                      <p className="text-[11px] uppercase tracking-widest font-bold text-muted-foreground">
                        Preferred Time
                      </p>
                    </div>
                    <div className="text-2xl font-bold italic tracking-tighter text-foreground">
                      {favoriteTime}
                    </div>
                    <p className="text-[11px] font-bold text-indigo-600 mt-1 uppercase tracking-widest leading-none bg-indigo-500/10 w-fit px-2 py-1 rounded">
                      Routine Dominance
                    </p>
                  </CardContent>
                </Card>
              </div>
            );
          })()}

          {/* Strength Journey Overall Growth Chart */}
          {(() => {
            const machineStatsByDate =
              memoizedMachineStatsByDate.machineStatsByDate;
            const machineWeightsByDate =
              memoizedMachineStatsByDate.machineWeightsByDate;
            const allDatesSet = new Set<string>();
            Object.keys(machineStatsByDate).forEach((d) => allDatesSet.add(d));

            const sortedDates = Array.from(allDatesSet).sort(
              (a, b) =>
                new Date(a + " " + new Date().getFullYear()).getTime() -
                new Date(b + " " + new Date().getFullYear()).getTime(),
            );

            let lastKnownStats: Record<string, number> = {};
            let lastKnownWeights: Record<string, number> = {};
            const seenMachines = new Set<string>();

            const growthChartData = sortedDates.map((dateStr) => {
              const currentStats = machineStatsByDate[dateStr];
              const currentWeights = machineWeightsByDate[dateStr];
              const row: any = { date: dateStr };
              machines.forEach((m) => {
                if (currentStats && currentStats[m.id!] !== undefined) {
                  row[m.id!] = Math.round(currentStats[m.id!] * 10) / 10;
                  row[m.id + "_weight"] = currentWeights[m.id!];
                  lastKnownStats[m.id!] = row[m.id!];
                  lastKnownWeights[m.id!] = row[m.id + "_weight"];

                  if (!seenMachines.has(m.id!)) {
                    row[m.id + "_isFirst"] = true;
                    seenMachines.add(m.id!);
                  }
                } else if (lastKnownStats[m.id!] !== undefined) {
                  row[m.id!] = lastKnownStats[m.id!];
                  row[m.id + "_weight"] = lastKnownWeights[m.id!];
                }
              });
              return row;
            });

            // Calculate total machine growths for the top 3 and average growth
            const machineGrowths: Array<{
              id: string;
              name: string;
              growth: number;
            }> = [];
            machines.forEach((m) => {
              if (
                lastKnownStats[m.id!] !== undefined &&
                lastKnownStats[m.id!] > 0
              ) {
                machineGrowths.push({
                  id: m.id!,
                  name: m.name,
                  growth: lastKnownStats[m.id!],
                });
              }
            });

            machineGrowths.sort((a, b) => b.growth - a.growth);

            // Initialize chart machines exactly once to all performed machines
            if (!hasInitializedChartMachines && seenMachines.size > 0) {
              setSelectedChartMachines(Array.from(seenMachines));
              setHasInitializedChartMachines(true);
            }

            const totalGrowth = machineGrowths.reduce(
              (sum, m) => sum + m.growth,
              0,
            );
            const avgGrowth =
              machineGrowths.length > 0
                ? Math.round(totalGrowth / machineGrowths.length)
                : 0;

            const CustomGrowthTooltip = ({ active, payload }: any) => {
              if (active && payload && payload.length) {
                const data = payload[0].payload;
                return (
                  <div className="bg-[#0A2E46] border border-slate-200 dark:border-slate-700 p-3 rounded-lg shadow-xl min-w-50">
                    <p className="text-[11px] uppercase tracking-widest text-[#68717A] mb-2">
                      {data.date}
                    </p>
                    <div className="space-y-2">
                      {payload.map((entry: any, index: number) => {
                        const machine = machines.find(
                          (m) => m.id === entry.dataKey,
                        );
                        if (!machine) return null;
                        const weight = data[entry.dataKey + "_weight"];
                        const baselineWeight =
                          memoizedMachineStatsByDate.machineBaselines[
                            machine.id!
                          ];
                        return (
                          <div
                            key={index}
                            className="flex flex-col text-xs bg-slate-900/50 p-1.5 rounded"
                          >
                            <div className="flex justify-between items-center w-full">
                              <span
                                style={{ color: entry.color }}
                                className="font-bold truncate max-w-30"
                              >
                                {machine.name}
                              </span>
                              <span className="font-bold text-[11px] px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-400">
                                +{entry.value}%
                              </span>
                            </div>
                            {weight !== undefined &&
                              baselineWeight !== undefined && (
                                <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-widest text-[#68717A] mt-1">
                                  <span>
                                    Start:{" "}
                                    <span className="text-ink-d1 font-bold">
                                      {baselineWeight} lbs
                                    </span>
                                  </span>
                                  <span>→</span>
                                  <span>
                                    Current:{" "}
                                    <span className="text-ink-d1 font-bold">
                                      {weight} lbs
                                    </span>
                                  </span>
                                </div>
                              )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              }
              return null;
            };

            const OriginDot = (props: any) => {
              const { cx, cy, payload, dataKey, stroke } = props;
              if (payload[dataKey + "_isFirst"] && cx && cy) {
                return (
                  <circle
                    cx={cx}
                    cy={cy}
                    r={5}
                    fill={stroke}
                    stroke="#fff"
                    strokeWidth={2}
                  />
                );
              }
              return null;
            };

            const getColorForMachine = (machineName: string) => {
              const lowerName = machineName.toLowerCase();
              if (lowerName.includes("neck")) return "#64748b"; // Slate (Neck)
              if (
                (lowerName.includes("press") && !lowerName.includes("leg")) ||
                lowerName.includes("raise") ||
                lowerName.includes("fly") ||
                lowerName.includes("tricep") ||
                lowerName.includes("dip")
              )
                return "#3b82f6"; // Steel Blue (Push)
              if (
                lowerName.includes("pull") ||
                lowerName.includes("row") ||
                lowerName.includes("bicep")
              )
                return "#f59e0b"; // Amber (Pull)
              if (
                lowerName.includes("ab") ||
                lowerName.includes("lumbar") ||
                lowerName.includes("torso") ||
                lowerName.includes("core")
              )
                return "#a855f7"; // Purple (Core)
              if (
                lowerName.includes("leg") ||
                lowerName.includes("hip") ||
                lowerName.includes("calf") ||
                lowerName.includes("thigh")
              )
                return "#10b981"; // Sage Green (Lower Body)

              return "#64748b"; // Fallback Slate
            };

            // Calculate filtered machines based on dropdown
            const activeChartMachines = machines.filter((m) =>
              selectedChartMachines.includes(m.id!),
            );

            return (
              <div className="space-y-6">
                {/* Average Growth Summary Card */}
                {machineGrowths.length > 0 && (
                  <Card className="rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-800 shadow-sm bg-white dark:bg-slate-900 border-l-4 border-l-[#10b981]">
                    <CardContent className="p-6 flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-full bg-[#10b981]/10 flex items-center justify-center">
                          <TrendingUp className="w-6 h-6 text-[#10b981]" />
                        </div>
                        <div>
                          <p className="text-[11px] uppercase tracking-widest font-bold text-slate-500">
                            Average Studio Growth
                          </p>
                          <p className="text-sm font-medium text-slate-600 dark:text-slate-400">
                            Total average increase across{" "}
                            {machineGrowths.length} machines
                          </p>
                        </div>
                      </div>
                      <div className="text-right flex items-center gap-2">
                        <span className="text-emerald-500 font-bold text-3xl">
                          +{avgGrowth}%
                        </span>
                      </div>
                    </CardContent>
                  </Card>
                )}

                <Card className="rounded-[40px] border border-slate-200 dark:border-slate-800 shadow-xl overflow-hidden bg-white dark:bg-slate-900">
                  <CardHeader className="p-8 border-b border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900">
                    <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                      <div>
                        <CardTitle className="text-2xl font-bold uppercase italic tracking-tighter text-[#0A2E46] dark:text-slate-200 flex items-center gap-2">
                          <TrendingUp className="w-5 h-5 text-[#F06C22]" />{" "}
                          Strength Journey
                        </CardTitle>
                        <CardDescription className="text-xs font-bold uppercase tracking-widest mt-2 text-slate-500">
                          Percentage Growth vs. Starting Weight
                        </CardDescription>
                      </div>

                      {/* Compare Machines Dropdown */}
                      <DropdownMenu>
                        <DropdownMenuTrigger className="inline-flex items-center justify-center whitespace-nowrap border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-bold uppercase tracking-widest rounded-xl hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-900 dark:text-white transition-colors h-9 px-4 py-2">
                          Compare Machines ({selectedChartMachines.length})
                        </DropdownMenuTrigger>
                        <DropdownMenuContent
                          align="end"
                          className="w-70 p-2 bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 max-h-100 overflow-y-auto"
                        >
                          {machines
                            .filter((m) => seenMachines.has(m.id!))
                            .map((m) => {
                              const isSelected = selectedChartMachines.includes(
                                m.id!,
                              );
                              return (
                                <DropdownMenuItem
                                  key={m.id}
                                  className="flex items-center gap-2 py-2 cursor-pointer focus:bg-slate-50 dark:focus:bg-slate-800"
                                  onSelect={(e) => {
                                    e.preventDefault();
                                    if (isSelected) {
                                      setSelectedChartMachines((prev) =>
                                        prev.filter((id) => id !== m.id),
                                      );
                                    } else {
                                      setSelectedChartMachines((prev) => [
                                        ...prev,
                                        m.id!,
                                      ]);
                                    }
                                  }}
                                >
                                  <div
                                    className={cn(
                                      "w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-colors",
                                      isSelected
                                        ? "bg-blue-500 border-blue-500"
                                        : "border-slate-300 dark:border-slate-600",
                                    )}
                                  >
                                    {isSelected && (
                                      <div className="w-2 h-2 rounded-sm bg-white" />
                                    )}
                                  </div>
                                  <span className="text-[11px] font-bold uppercase truncate flex-1">
                                    {m.name}
                                  </span>
                                  {machineGrowths.find(
                                    (x) => x.id === m.id,
                                  ) && (
                                    <span className="text-[11px] font-bold text-emerald-500">
                                      +
                                      {
                                        machineGrowths.find(
                                          (x) => x.id === m.id,
                                        )?.growth
                                      }
                                      %
                                    </span>
                                  )}
                                </DropdownMenuItem>
                              );
                            })}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </CardHeader>
                  <CardContent className="p-8 h-137.5 bg-slate-50 dark:bg-slate-900/50">
                    {growthChartData.length > 0 &&
                    activeChartMachines.length > 0 ? (
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart
                          data={growthChartData}
                          margin={{ top: 20, right: 30, left: -10, bottom: 20 }}
                        >
                          <XAxis
                            dataKey="date"
                            stroke="#94a3b8"
                            tick={{
                              fill: "#64748b",
                              fontSize: 10,
                              fontWeight: 700,
                            }}
                            tickMargin={15}
                            axisLine={{ stroke: "#e2e8f0", strokeWidth: 2 }}
                            tickLine={false}
                          />
                          <YAxis
                            stroke="#94a3b8"
                            tick={{
                              fill: "#64748b",
                              fontSize: 10,
                              fontWeight: 700,
                            }}
                            axisLine={false}
                            tickLine={false}
                            tickFormatter={(val) => `+${val}%`}
                            domain={[0, "auto"]}
                          />
                          <CartesianGrid
                            strokeDasharray="3 3"
                            vertical={false}
                            stroke="#e2e8f0"
                          />
                          <RechartsTooltip content={<CustomGrowthTooltip />} />
                          <Legend
                            wrapperStyle={{ paddingTop: "20px" }}
                            onMouseEnter={(e) =>
                              setActiveMachine(e.dataKey as string)
                            }
                            onMouseLeave={() => setActiveMachine(null)}
                            onClick={(e) =>
                              setActiveMachine(
                                activeMachine === e.dataKey
                                  ? null
                                  : (e.dataKey as string),
                              )
                            }
                            iconType="circle"
                            iconSize={8}
                          />
                          {activeChartMachines.map((m, idx) => {
                            const hasData = growthChartData.some(
                              (d) => d[m.id!] !== undefined,
                            );
                            if (!hasData) return null;

                            const isActive = activeMachine === m.id;
                            const isFaded = activeMachine !== null && !isActive;
                            const color = getColorForMachine(m.name);

                            return (
                              <Line
                                key={m.id}
                                name={m.name} // Legend uses name
                                type="stepAfter" // Make it a step chart to show plateaus clearly
                                dataKey={m.id!}
                                stroke={color}
                                strokeWidth={isActive ? 4 : 2.5}
                                strokeOpacity={isFaded ? 0.15 : 1}
                                dot={<OriginDot stroke={color} />}
                                activeDot={{
                                  r: 6,
                                  fill: "#fff",
                                  stroke: color,
                                  strokeWidth: 2,
                                }}
                                connectNulls
                              />
                            );
                          })}
                        </LineChart>
                      </ResponsiveContainer>
                    ) : (
                      <div className="h-full flex flex-col items-center justify-center opacity-30">
                        <TrendingUp className="w-12 h-12 text-[#68717A] mb-4" />
                        <p className="text-xs font-bold uppercase tracking-widest text-[#68717A]">
                          {growthChartData.length === 0
                            ? "Not enough data available"
                            : "Select machines to compare"}
                        </p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            );
          })()}

          {/* 60-Day Global Volume Chart */}
          {(() => {
            const sixtyDaysAgo = new Date();
            sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);

            const volumeByDate: Record<string, number> = {};
            const completedSessions = sessions
              .filter((s) => s.status === "Completed")
              .reverse(); // reverse chronological already reversed for rendering?
            const chronologicalSessions = [...completedSessions].sort(
              (a, b) => parseSessionDate(a.date) - parseSessionDate(b.date),
            );

            chronologicalSessions.forEach((session) => {
              const time =
                getMillis(session.createdAt) || parseSessionDate(session.date);
              if (time >= sixtyDaysAgo.getTime()) {
                const sLogs = allLogs.filter((l) => l.sessionId === session.id);
                const totalVol = sLogs.reduce(
                  (acc, log) => acc + calculateExerciseVolume(log),
                  0,
                );
                const dateStr = session.date
                  ? new Date(parseSessionDate(session.date)).toLocaleDateString(
                      "en-US",
                      { month: "short", day: "numeric" },
                    )
                  : "";
                if (dateStr) {
                  // Accumulate in case of multiple sessions a day
                  volumeByDate[dateStr] =
                    (volumeByDate[dateStr] || 0) + totalVol;
                }
              }
            });

            const volumeChartData = Object.keys(volumeByDate).map(
              (dateStr) => ({
                date: dateStr,
                volume: volumeByDate[dateStr],
              }),
            );

            const CustomVolumeTooltip = ({ active, payload, label }: any) => {
              if (active && payload && payload.length) {
                return (
                  <div className="bg-[#0A2E46] border border-slate-200 dark:border-slate-700 p-3 rounded-lg shadow-xl min-w-30">
                    <p className="text-[11px] uppercase tracking-widest text-[#68717A] mb-1">
                      {label}
                    </p>
                    <p className="text-[#38BDF8] font-bold text-xl leading-none">
                      {payload[0].value.toLocaleString()}{" "}
                      <span className="text-xs">LBS</span>
                    </p>
                  </div>
                );
              }
              return null;
            };

            return (
              <Card className="rounded-[40px] border-2 shadow-xl overflow-hidden min-h-100">
                <CardHeader className="p-8 border-b bg-muted/20">
                  <div className="flex justify-between items-center">
                    <div>
                      <CardTitle className="text-xl font-bold uppercase italic tracking-tighter">
                        Total Volume Progression
                      </CardTitle>
                      <CardDescription className="text-[11px] font-medium uppercase tracking-wide opacity-70 mt-1">
                        60-Day Work Capacity Trend
                      </CardDescription>
                      <p className="text-slate-700 dark:text-slate-400 text-sm mt-1 italic">
                        Charts reflect currently loaded history. Load more
                        sessions to expand the timeline.
                      </p>
                    </div>
                    <Badge
                      variant="outline"
                      className="text-[11px] font-bold bg-[#38BDF8]/10 text-[#38BDF8] border-[#38BDF8]/20"
                    >
                      Workload
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="p-8 h-87.5">
                  {volumeChartData.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart
                        data={volumeChartData}
                        margin={{ top: 20, right: 20, left: -20, bottom: 0 }}
                      >
                        <defs>
                          <linearGradient
                            id="colorVolume"
                            x1="0"
                            y1="0"
                            x2="0"
                            y2="1"
                          >
                            <stop
                              offset="5%"
                              stopColor="#38BDF8"
                              stopOpacity={0.4}
                            />
                            <stop
                              offset="95%"
                              stopColor="#0A2E46"
                              stopOpacity={0}
                            />
                          </linearGradient>
                        </defs>
                        <XAxis
                          dataKey="date"
                          stroke="#68717A"
                          tick={{
                            fill: "#68717A",
                            fontSize: 10,
                            fontWeight: 700,
                          }}
                          tickMargin={10}
                          axisLine={false}
                          tickLine={false}
                        />
                        <YAxis
                          stroke="#68717A"
                          tick={{ fill: "#68717A", fontSize: 10 }}
                          axisLine={false}
                          tickLine={false}
                          tickFormatter={(val) =>
                            val >= 1000 ? `${(val / 1000).toFixed(1)}k` : val
                          }
                        />
                        <RechartsTooltip content={<CustomVolumeTooltip />} />
                        <Area
                          type="monotone"
                          dataKey="volume"
                          stroke="#38BDF8"
                          strokeWidth={4}
                          fillOpacity={1}
                          fill="url(#colorVolume)"
                          activeDot={{
                            r: 6,
                            fill: "#fff",
                            stroke: "#38BDF8",
                            strokeWidth: 2,
                          }}
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="h-full flex flex-col items-center justify-center opacity-30">
                      <TrendingUp className="w-12 h-12 text-[#68717A] mb-4" />
                      <p className="text-xs font-bold uppercase tracking-widest text-[#68717A]">
                        Not enough data in the last 60 days
                      </p>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })()}

          <Card className="rounded-[40px] border-2 shadow-xl overflow-hidden min-h-100">
            <CardHeader className="p-8 border-b bg-muted/20">
              <div className="flex justify-between items-center">
                <div>
                  <CardTitle className="text-xl font-bold uppercase italic tracking-tighter">
                    Time Spent on Machines
                  </CardTitle>
                  <CardDescription className="text-[11px] font-medium uppercase tracking-wide opacity-70 mt-1">
                    Efficiency & Pace Analytics
                  </CardDescription>
                </div>
                <div className="flex gap-4">
                  {(() => {
                    const completedSessions = sessions.filter(
                      (s) =>
                        s.status === "Completed" && s.startTime && s.endTime,
                    );
                    if (completedSessions.length === 0) return null;

                    const totalMins = completedSessions.reduce((acc, s) => {
                      return (
                        acc + (getMillis(s.endTime) - getMillis(s.startTime))
                      );
                    }, 0);
                    const avgMins = Math.round(
                      totalMins / completedSessions.length / 60000,
                    );

                    return (
                      <div className="text-right">
                        <p className="text-[11px] font-bold uppercase text-muted-foreground opacity-60">
                          Avg Session
                        </p>
                        <p className="text-sm font-bold italic text-primary">
                          {avgMins}m
                        </p>
                      </div>
                    );
                  })()}
                  <Badge
                    variant="outline"
                    className="text-[11px] font-bold bg-primary/10 text-primary border-primary/20"
                  >
                    Efficiency
                  </Badge>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0 flex flex-col md:flex-row h-150">
              {/* Sidebar: Session List */}
              <div className="w-full md:w-64 border-r overflow-y-auto bg-muted/5 divide-y">
                {sessions
                  .filter((s) => s.status === "Completed")
                  .map((s) => (
                    <button
                      key={s.id}
                      onClick={() => setSelectedTimingSessionId(s.id!)}
                      className={`w-full p-4 text-left hover:bg-white transition-all group ${selectedTimingSessionId === s.id ? "bg-white shadow-sm ring-1 ring-primary/5" : ""}`}
                    >
                      <p
                        className={`text-[11px] flex justify-between items-center font-bold uppercase tracking-tighter ${selectedTimingSessionId === s.id ? "text-primary" : "text-muted-foreground"}`}
                      >
                        <span>{s.date}</span>
                        <span className="text-[11px] opacity-70 font-bold">
                          {s.legacy_filemaker_id ||
                          s.trainerId === "legacy-trainer" ||
                          s.trainerInitials === "Legacy" ||
                          s.trainerInitials === "Chart"
                            ? "Imported"
                            : s.startTime
                              ? new Date(
                                  s.startTime?.toMillis?.() || s.startTime,
                                ).toLocaleTimeString("en-US", {
                                  hour: "2-digit",
                                  minute: "2-digit",
                                })
                              : ""}
                        </span>
                      </p>
                      <p className="text-xs font-bold truncate mt-1">
                        {s.routineName || "Session"}
                      </p>
                      {s.startTime && s.endTime && (
                        <p className="text-[11px] font-bold text-muted-foreground/60 uppercase mt-1">
                          {Math.round(
                            (getMillis(s.endTime) - getMillis(s.startTime)) /
                              60000,
                          )}{" "}
                          mins
                        </p>
                      )}
                    </button>
                  ))}
                {sessions.filter((s) => s.status === "Completed").length ===
                  0 && (
                  <div className="p-8 text-center opacity-20">
                    <Clock className="w-8 h-8 mx-auto mb-2" />
                    <p className="text-[11px] font-medium uppercase tracking-wide opacity-70 leading-tight">
                      No data
                    </p>
                  </div>
                )}
              </div>

              {/* Main Content: Detailed Analysis */}
              <div className="flex-1 overflow-y-auto p-8">
                {(() => {
                  const focusSession =
                    sessions.find((s) => s.id === selectedTimingSessionId) ||
                    sessions[0];

                  if (!focusSession) {
                    return (
                      <div className="h-full flex flex-col items-center justify-center opacity-20 space-y-4">
                        <Activity className="w-16 h-16" />
                        <p className="text-xs font-bold uppercase tracking-widest">
                          Select a session for analysis
                        </p>
                      </div>
                    );
                  }

                  const sessionLogs = allLogs
                    .filter((l) => l.sessionId === focusSession.id)
                    .sort((a, b) => {
                      const timeA =
                        a.updatedAt?.toMillis?.() ||
                        a.createdAt?.toMillis?.() ||
                        0;
                      const timeB =
                        b.updatedAt?.toMillis?.() ||
                        b.createdAt?.toMillis?.() ||
                        0;
                      return timeA - timeB;
                    });

                  const startTime =
                    focusSession.startTime?.toMillis?.() ||
                    focusSession.createdAt?.toMillis?.();

                  const SETUP_BUFFER_SECONDS = 45;

                  const sStartTime =
                    focusSession.startTime?.toMillis?.() ||
                    focusSession.createdAt?.toMillis?.() ||
                    0;

                  const tutData: any[] = [];
                  sessionLogs.forEach((log, idx) => {
                    const lTimeMs =
                      log.updatedAt?.toMillis?.() ||
                      log.createdAt?.toMillis?.() ||
                      0;
                    const pTimeMs =
                      idx === 0
                        ? sStartTime
                        : sessionLogs[idx - 1].updatedAt?.toMillis?.() ||
                          sessionLogs[idx - 1].createdAt?.toMillis?.() ||
                          0;

                    let grossTimeSeconds = 0;
                    if (lTimeMs > 0 && pTimeMs > 0 && lTimeMs > pTimeMs) {
                      grossTimeSeconds = Math.round((lTimeMs - pTimeMs) / 1000);
                    }

                    if (grossTimeSeconds === 0 && log.timeSpent) {
                      const parsed = parseInt(log.timeSpent, 10);
                      if (!isNaN(parsed)) grossTimeSeconds = parsed;
                    }

                    const netActiveTime = Math.max(
                      0,
                      grossTimeSeconds - SETUP_BUFFER_SECONDS,
                    );
                    const reps = log.reps
                      ? parseInt(log.reps.toString(), 10)
                      : 0;
                    let estimatedTutPerRep = 0;

                    const isStatic =
                      log.isStaticHold ||
                      log.isTSC ||
                      (log.seconds &&
                        (!log.reps || parseInt(log.reps.toString()) === 0));

                    if (isStatic) {
                      estimatedTutPerRep =
                        reps > 0 ? netActiveTime / reps : netActiveTime;
                    } else {
                      if (reps > 0) {
                        estimatedTutPerRep = netActiveTime / reps;
                      }
                    }

                    const machine = machines.find(
                      (m) => m.id === log.machineId,
                    );

                    tutData.push({
                      id: log.id,
                      machineId: log.machineId,
                      machineName: machine?.name || "Unknown",
                      grossTimeSeconds,
                      netActiveTime,
                      reps,
                      isStatic,
                      estimatedTutPerRep:
                        Math.round(estimatedTutPerRep * 10) / 10,
                    });
                  });

                  // Format as MM:SS helper for tooltip
                  const formatMMSS = (totalSeconds: number) => {
                    if (isNaN(totalSeconds) || totalSeconds < 0) return "0:00";
                    const mins = Math.floor(totalSeconds / 60);
                    const secs = Math.floor(totalSeconds % 60);
                    return `${mins}:${secs.toString().padStart(2, "0")}`;
                  };

                  const CustomTutTooltip = ({ active, payload }: any) => {
                    if (active && payload && payload.length) {
                      const data = payload[0].payload;
                      return (
                        <div className="bg-[#0A2E46] border border-slate-200 dark:border-slate-700 p-4 rounded-xl shadow-xl">
                          <p className="font-bold uppercase text-sm mb-2">
                            {data.machineName}
                          </p>
                          <div className="space-y-1">
                            <div className="flex justify-between gap-6">
                              <span className="text-slate-800 dark:text-slate-400 text-[11px] font-medium uppercase">
                                Estimated TUT/Rep:
                              </span>
                              <span className="text-[#38BDF8] text-sm font-bold">
                                {data.estimatedTutPerRep}s
                              </span>
                            </div>
                            <div className="flex justify-between gap-6">
                              <span className="text-slate-800 dark:text-slate-400 text-[11px] font-medium uppercase">
                                Reps:
                              </span>
                              <span className="text-xs font-bold">
                                {data.isStatic ? "Static Hold" : data.reps}
                              </span>
                            </div>
                            <div className="flex justify-between gap-6">
                              <span className="text-slate-800 dark:text-slate-400 text-[11px] font-medium uppercase">
                                Gross Time:
                              </span>
                              <span className="text-xs font-bold">
                                {formatMMSS(data.grossTimeSeconds)}
                              </span>
                            </div>
                            <div className="flex justify-between gap-6">
                              <span className="text-slate-800 dark:text-slate-400 text-[11px] font-medium uppercase">
                                Net Active:
                              </span>
                              <span className="text-xs font-bold">
                                {formatMMSS(data.netActiveTime)}
                              </span>
                            </div>
                          </div>
                        </div>
                      );
                    }
                    return null;
                  };

                  return (
                    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-2 h-full flex flex-col">
                      <div className="flex items-center justify-between border-b pb-4 shrink-0">
                        <div>
                          <h4 className="text-lg font-bold uppercase italic text-primary">
                            {focusSession.date}
                          </h4>
                          <p className="text-[11px] font-bold text-muted-foreground uppercase">
                            {focusSession.routineName || "Free Protocol"}
                          </p>
                        </div>
                        {focusSession.startTime && focusSession.endTime && (
                          <div className="text-right">
                            <p className="text-xl font-bold italic text-foreground leading-none">
                              {Math.round(
                                (getMillis(focusSession.endTime) -
                                  getMillis(focusSession.startTime)) /
                                  60000,
                              )}
                              m
                            </p>
                            <p className="text-[11px] font-bold text-muted-foreground uppercase opacity-60">
                              Total Duration
                            </p>
                          </div>
                        )}
                      </div>

                      <div className="flex-1 min-h-100">
                        {tutData.length > 0 ? (
                          <ResponsiveContainer width="100%" height="100%">
                            <BarChart
                              data={tutData}
                              margin={{
                                top: 20,
                                right: 30,
                                left: -20,
                                bottom: 40,
                              }}
                            >
                              <CartesianGrid
                                strokeDasharray="3 3"
                                stroke="#334155"
                                vertical={false}
                              />
                              <XAxis
                                dataKey="machineName"
                                stroke="#64748b"
                                tick={{
                                  fill: "#64748b",
                                  fontSize: 9,
                                  fontWeight: "bold",
                                }}
                                interval={0}
                                angle={-45}
                                textAnchor="end"
                              />
                              <YAxis
                                stroke="#64748b"
                                tick={{
                                  fill: "#64748b",
                                  fontSize: 10,
                                  fontWeight: "bold",
                                }}
                                tickFormatter={(val) => `${val}s`}
                              />
                              <RechartsTooltip
                                content={<CustomTutTooltip />}
                                cursor={{ fill: "rgba(255,255,255,0.05)" }}
                              />
                              <ReferenceLine
                                y={12}
                                stroke="#f43f5e"
                                strokeDasharray="3 3"
                                strokeWidth={2}
                                label={{
                                  position: "top",
                                  value: "12s (IDEAL TUT)",
                                  fill: "#f43f5e",
                                  fontSize: 10,
                                  fontWeight: "bold",
                                }}
                              />
                              <Bar
                                dataKey="estimatedTutPerRep"
                                fill="#38BDF8"
                                radius={[4, 4, 0, 0]}
                                maxBarSize={40}
                              />
                            </BarChart>
                          </ResponsiveContainer>
                        ) : (
                          <div className="h-full flex flex-col items-center justify-center opacity-30">
                            <Activity className="w-10 h-10 mx-auto mb-3" />
                            <p className="text-xs font-bold uppercase tracking-widest">
                              No timing logs for this session
                            </p>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })()}
              </div>
            </CardContent>
          </Card>
        </TabsContent>{" "}
        <TabsContent value="details_disabled" className="hidden">
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 mb-6">
            {/* 1. The "Why" (Goals & Motivation) */}
            <Card className="rounded-[40px] shadow-xl bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700">
              <CardHeader className="p-8 border-b border-slate-200 dark:border-slate-700">
                <CardTitle className="text-xl font-bold uppercase italic tracking-tighter">
                  The 'Why' (Goals & Motivation)
                </CardTitle>
                <CardDescription className="text-[11px] font-medium uppercase tracking-wide opacity-70 text-[#38BDF8]">
                  Discovery & Intent Path
                </CardDescription>
              </CardHeader>
              <CardContent className="p-8 space-y-6">
                <div className="space-y-2">
                  <Label className="text-[11px] font-medium uppercase tracking-wide opacity-70 text-slate-800 dark:text-slate-400 ml-1">
                    Discovery Notes (Stage 1)
                  </Label>
                  <Textarea
                    value={infoForm.discoveryNotes || ""}
                    onChange={(e) =>
                      setInfoForm((f) => ({
                        ...f,
                        discoveryNotes: e.target.value,
                      }))
                    }
                    className="min-h-25 rounded-2xl font-bold p-4 bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 focus-visible:ring-[#38BDF8] resize-none"
                    placeholder="Context from initial contact..."
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-[11px] font-medium uppercase tracking-wide opacity-70 text-slate-800 dark:text-slate-400 ml-1">
                    Primary Training Goals & Deep Intent
                  </Label>
                  <Textarea
                    value={infoForm.globalNotes || ""}
                    onChange={(e) =>
                      setInfoForm((f) => ({
                        ...f,
                        globalNotes: e.target.value,
                      }))
                    }
                    className="min-h-35 rounded-2xl font-bold p-4 bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 focus-visible:ring-[#38BDF8]"
                    placeholder="What are we really solving for? (e.g. 'I want to be able to pick up my grandkids without back pain')..."
                  />
                </div>
              </CardContent>
            </Card>

            {/* 2. Lifestyle & Environment */}
            <Card className="rounded-[40px] shadow-xl bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700">
              <CardHeader className="p-8 border-b border-slate-200 dark:border-slate-700">
                <CardTitle className="text-xl font-bold uppercase italic tracking-tighter">
                  Lifestyle & Environment
                </CardTitle>
                <CardDescription className="text-[11px] font-medium uppercase tracking-wide opacity-70 text-[#38BDF8]">
                  External Stressors & Physical Context
                </CardDescription>
              </CardHeader>
              <CardContent className="p-8 space-y-6">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="text-[11px] font-medium uppercase tracking-wide opacity-70 text-slate-800 dark:text-slate-400 ml-1">
                      Occupation
                    </Label>
                    <OccupationSelect
                      value={infoForm.occupation || ""}
                      onChange={(v) =>
                        setInfoForm((f) => ({ ...f, occupation: v }))
                      }
                      disabled={infoForm.isRetired}
                    />
                  </div>
                  <div className="space-y-2 flex flex-col justify-center">
                    <div className="flex items-center gap-4 mt-2">
                      <Switch
                        checked={infoForm.isRetired}
                        onCheckedChange={(v) =>
                          setInfoForm((f) => ({ ...f, isRetired: v }))
                        }
                        className="data-[state=checked]:bg-[#38BDF8]"
                      />
                      <Label className="text-[11px] font-medium uppercase tracking-wide opacity-70 text-slate-700 dark:text-slate-300">
                        Retired
                      </Label>
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label className="text-[11px] font-medium uppercase tracking-wide opacity-70 text-slate-800 dark:text-slate-400 ml-1">
                    Daily Activity Level
                  </Label>
                  <Select
                    value={infoForm.activityLevel || "Moderate"}
                    onValueChange={(v) =>
                      setInfoForm((f) => ({ ...f, activityLevel: v as any }))
                    }
                  >
                    <SelectTrigger className="w-full h-12 bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 font-bold rounded-2xl focus-visible:ring-[#38BDF8]">
                      <SelectValue placeholder="Select Activity" />
                    </SelectTrigger>
                    <SelectContent className="bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 rounded-xl">
                      <SelectItem value="Sedentary">Sedentary</SelectItem>
                      <SelectItem value="Light">Light</SelectItem>
                      <SelectItem value="Moderate">Moderate</SelectItem>
                      <SelectItem value="High">High</SelectItem>
                      <SelectItem value="Manual Labor">Manual Labor</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label className="text-[11px] font-medium uppercase tracking-wide opacity-70 text-slate-800 dark:text-slate-400 ml-1">
                    Systemic Recovery (Sleep/Stress)
                  </Label>
                  <Select
                    value={infoForm.recoveryMetric || "Average"}
                    onValueChange={(v) =>
                      setInfoForm((f) => ({ ...f, recoveryMetric: v as any }))
                    }
                  >
                    <SelectTrigger className="w-full h-12 bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 font-bold rounded-2xl focus-visible:ring-[#38BDF8]">
                      <SelectValue placeholder="Select Recovery" />
                    </SelectTrigger>
                    <SelectContent className="bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 rounded-xl">
                      <SelectItem value="Poor">Poor</SelectItem>
                      <SelectItem value="Average">Average</SelectItem>
                      <SelectItem value="Optimal">Optimal</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label className="text-[11px] font-medium uppercase tracking-wide opacity-70 text-slate-800 dark:text-slate-400 ml-1">
                    Experience Level
                  </Label>
                  <Select
                    value={infoForm.trainingPedigree || "Novice"}
                    onValueChange={(v) =>
                      setInfoForm((f) => ({ ...f, trainingPedigree: v as any }))
                    }
                  >
                    <SelectTrigger className="w-full h-12 bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 font-bold rounded-2xl focus-visible:ring-[#38BDF8]">
                      <SelectValue placeholder="Select Experience" />
                    </SelectTrigger>
                    <SelectContent className="bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 rounded-xl">
                      <SelectItem value="Novice">
                        Novice (No lifting experience)
                      </SelectItem>
                      <SelectItem value="Intermediate">
                        Intermediate (Standard gym experience)
                      </SelectItem>
                      <SelectItem value="Advanced">
                        Advanced (Extensive free weights/machines)
                      </SelectItem>
                      <SelectItem value="Protocol Veteran">
                        Protocol Veteran (Prior high-intensity experience)
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </CardContent>
            </Card>

            {/* 3. The Clinical Baseline (Medical) */}
            <Card className="rounded-[40px] shadow-xl bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 lg:col-span-2">
              <CardHeader className="p-8 border-b border-slate-200 dark:border-slate-700">
                <CardTitle className="text-xl font-bold uppercase italic tracking-tighter">
                  The Clinical Baseline (Medical)
                </CardTitle>
                <CardDescription className="text-[11px] font-medium uppercase tracking-wide opacity-70 text-[#38BDF8]">
                  Orthopedic & Safety Flags
                </CardDescription>
              </CardHeader>
              <CardContent className="p-8">
                {(() => {
                  // Group clinical flags by category
                  const groupedFlags = CLINICAL_FLAGS_MATRIX.reduce(
                    (acc, flag) => {
                      if (!acc[flag.category]) acc[flag.category] = [];
                      acc[flag.category].push(flag);
                      return acc;
                    },
                    {} as Record<string, typeof CLINICAL_FLAGS_MATRIX>,
                  );

                  return (
                    <div className="space-y-6">
                      {infoForm.clinicalFlags &&
                        infoForm.clinicalFlags.length > 0 && (
                          <div className="w-full flex flex-col gap-2 mb-4 bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm">
                            <Label className="text-[11px] font-medium uppercase tracking-wide opacity-70 text-slate-800 dark:text-slate-400">
                              Active Health Flags
                            </Label>
                            <div className="flex flex-wrap gap-2">
                              {infoForm.clinicalFlags.map((flagId) => {
                                const flag = CLINICAL_FLAGS_MATRIX.find(
                                  (f) => f.id === flagId,
                                );
                                if (!flag) return null;

                                const bgColors = {
                                  "Absolute Contraindication":
                                    "bg-rose-950/50 border-rose-600/50 text-rose-200",
                                  "High Risk":
                                    "bg-amber-950/50 border-amber-500/50 text-amber-200",
                                  "Moderate / Needs Modification":
                                    "bg-blue-950/50 border-blue-500/50 text-blue-200",
                                };

                                return (
                                  <div
                                    key={flagId}
                                    className={`px-3 py-1.5 rounded-lg border flex items-center text-xs font-bold leading-none ${bgColors[flag.category as keyof typeof bgColors] || "bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-800 text-slate-200"}`}
                                  >
                                    <AlertCircle className="w-3 h-3 mr-1.5 opacity-70" />
                                    {flag.conditionName}
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )}

                      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                        <div className="space-y-4">
                          <Label className="text-[11px] font-medium uppercase tracking-wide opacity-70 text-slate-800 dark:text-slate-400 ml-1">
                            Select Pertinent Health Flags
                          </Label>
                          <div className="w-full space-y-2">
                            {Object.entries(groupedFlags).map(
                              ([category, flags]) => (
                                <div key={category}>
                                  <h4 className="text-sm font-bold text-slate-300 mb-3 mt-6 first:mt-0">
                                    {category}
                                  </h4>
                                  <div className="flex flex-wrap gap-2">
                                    {(flags as ClinicalSafetyFlag[]).map(
                                      (flag) => {
                                        const isChecked =
                                          infoForm.clinicalFlags?.includes(
                                            flag.id,
                                          ) || false;

                                        const unselectedStyles =
                                          "bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:bg-slate-800 transition-colors px-3 py-1.5 rounded-full text-xs font-medium";

                                        let selectedStyles = "";
                                        if (
                                          flag.severity ===
                                          "Absolute Contraindication"
                                        ) {
                                          selectedStyles =
                                            "bg-rose-950/50 border border-rose-500 text-rose-400 px-3 py-1.5 rounded-full text-xs font-medium shadow-[0_0_10px_rgba(244,63,94,0.1)]";
                                        } else if (
                                          flag.severity === "High Risk"
                                        ) {
                                          selectedStyles =
                                            "bg-amber-950/50 border border-amber-500 text-amber-400 px-3 py-1.5 rounded-full text-xs font-medium shadow-[0_0_10px_rgba(245,158,11,0.1)]";
                                        } else {
                                          selectedStyles =
                                            "bg-blue-950/50 border border-blue-500 text-blue-400 px-3 py-1.5 rounded-full text-xs font-medium shadow-[0_0_10px_rgba(59,130,246,0.1)]";
                                        }

                                        return (
                                          <button
                                            key={flag.id}
                                            onClick={() => {
                                              const current =
                                                infoForm.clinicalFlags || [];
                                              if (!isChecked) {
                                                setInfoForm((f) => ({
                                                  ...f,
                                                  clinicalFlags: [
                                                    ...current,
                                                    flag.id,
                                                  ],
                                                }));
                                              } else {
                                                setInfoForm((f) => ({
                                                  ...f,
                                                  clinicalFlags: current.filter(
                                                    (a) => a !== flag.id,
                                                  ),
                                                }));
                                              }
                                            }}
                                            className={
                                              isChecked
                                                ? selectedStyles
                                                : unselectedStyles
                                            }
                                          >
                                            {flag.conditionName}
                                          </button>
                                        );
                                      },
                                    )}
                                  </div>
                                </div>
                              ),
                            )}
                          </div>
                        </div>

                        <div className="space-y-4">
                          <div className="space-y-2">
                            <Label className="text-[11px] font-medium uppercase tracking-wide opacity-70 text-slate-800 dark:text-slate-400 ml-1">
                              Ailments, Injuries & Limitations
                            </Label>
                            <Textarea
                              value={infoForm.clinicalNotes || ""}
                              onChange={(e) =>
                                setInfoForm((f) => ({
                                  ...f,
                                  clinicalNotes: e.target.value,
                                }))
                              }
                              className="min-h-50 rounded-2xl font-bold p-4 bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 focus-visible:ring-[#38BDF8] transition-all"
                              placeholder="Detail any orthopedic history or clinical considerations..."
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })()}
              </CardContent>
            </Card>

            {/* 4. Client Information */}
            <Card className="rounded-[40px] shadow-sm bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 flex flex-col h-full">
              <CardHeader className="p-8 border-b border-slate-200 dark:border-slate-800">
                <CardTitle className="text-2xl font-bold uppercase tracking-tighter text-slate-900 dark:text-white">
                  Client Information
                </CardTitle>
                <CardDescription className="text-xs font-bold uppercase tracking-widest text-slate-500">
                  Identity & Membership Overview
                </CardDescription>
              </CardHeader>
              <CardContent className="p-8 flex-1">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  <div className="space-y-2">
                    <Label className="text-[11px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400">
                      Full Name
                    </Label>
                    <div className="flex gap-3">
                      <Input
                        value={infoForm.firstName || ""}
                        onChange={(e) =>
                          setInfoForm((f) => ({
                            ...f,
                            firstName: e.target.value,
                          }))
                        }
                        placeholder="First"
                        className="h-14 md:h-16 text-lg sm:text-xl rounded-2xl font-bold px-5 bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 focus-visible:ring-[#F06C22] shadow-sm text-slate-900 dark:text-slate-100"
                      />
                      <Input
                        value={infoForm.lastName || ""}
                        onChange={(e) =>
                          setInfoForm((f) => ({
                            ...f,
                            lastName: e.target.value,
                          }))
                        }
                        placeholder="Last"
                        className="h-14 md:h-16 text-lg sm:text-xl rounded-2xl font-bold px-5 bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 focus-visible:ring-[#F06C22] shadow-sm text-slate-900 dark:text-slate-100"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-[11px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400">
                      Email
                    </Label>
                    <Input
                      value={infoForm.email || ""}
                      onChange={(e) =>
                        setInfoForm((f) => ({ ...f, email: e.target.value }))
                      }
                      className="h-14 md:h-16 text-lg sm:text-xl rounded-2xl font-bold px-5 bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 focus-visible:ring-[#F06C22] shadow-sm text-slate-900 dark:text-slate-100"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label className="text-[11px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400">
                      Age
                    </Label>
                    <Input
                      type="number"
                      value={infoForm.age ?? ""}
                      onChange={(e) =>
                        setInfoForm((f) => ({
                          ...f,
                          age: e.target.value ? parseInt(e.target.value) : null,
                        }))
                      }
                      className="h-14 md:h-16 text-lg sm:text-xl rounded-2xl font-bold px-5 bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 focus-visible:ring-[#F06C22] shadow-sm text-slate-900 dark:text-slate-100"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label className="text-[11px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400">
                      Package Tier
                    </Label>
                    <Select
                      value={infoForm.packageTier || "None"}
                      onValueChange={(v: any) =>
                        setInfoForm((f) => ({ ...f, packageTier: v }))
                      }
                    >
                      <SelectTrigger className="h-14 md:h-16 text-lg sm:text-xl rounded-2xl font-bold px-5 bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 focus-visible:ring-[#F06C22] shadow-sm text-slate-900 dark:text-slate-100 data-placeholder:text-slate-400">
                        <SelectValue placeholder="Select Tier" />
                      </SelectTrigger>
                      <SelectContent className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 font-bold p-2">
                        <SelectItem
                          value="None"
                          className="h-12 text-sm sm:text-base"
                        >
                          None / Trial
                        </SelectItem>
                        <SelectItem
                          value="6-Month"
                          className="h-12 text-sm sm:text-base"
                        >
                          6-Month
                        </SelectItem>
                        <SelectItem
                          value="12-Month"
                          className="h-12 text-sm sm:text-base"
                        >
                          12-Month
                        </SelectItem>
                        <SelectItem
                          value="18-Month"
                          className="h-12 text-sm sm:text-base"
                        >
                          18-Month VIP
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-[11px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400">
                      Start Date
                    </Label>
                    <Input
                      type="text"
                      placeholder="MM/DD/YYYY"
                      value={infoForm.firstSessionDateRaw || ""}
                      onChange={(e) => {
                        const val = e.target.value;
                        const numbersOnly = val.replace(/\D/g, "");
                        let formatted = numbersOnly;
                        if (numbersOnly.length > 2 && numbersOnly.length <= 4) {
                          formatted = `${numbersOnly.slice(0, 2)}/${numbersOnly.slice(2)}`;
                        } else if (numbersOnly.length > 4) {
                          formatted = `${numbersOnly.slice(0, 2)}/${numbersOnly.slice(2, 4)}/${numbersOnly.slice(4, 8)}`;
                        }

                        setInfoForm((f) => ({
                          ...f,
                          firstSessionDateRaw: formatted,
                        }));

                        if (numbersOnly.length === 8) {
                          const m = parseInt(numbersOnly.slice(0, 2), 10);
                          const d_val = parseInt(numbersOnly.slice(2, 4), 10);
                          const y = parseInt(numbersOnly.slice(4, 8), 10);
                          if (
                            m >= 1 &&
                            m <= 12 &&
                            d_val >= 1 &&
                            d_val <= 31 &&
                            y >= 1900
                          ) {
                            const selectedDate = new Date(y, m - 1, d_val);
                            const timestamp = Timestamp.fromDate(selectedDate);
                            setInfoForm((f) => ({
                              ...f,
                              firstSessionDate: timestamp,
                              firstSessionDateRaw: formatted,
                            }));
                            handleStartDateChange(`${formatted}`);
                          }
                        } else if (numbersOnly.length === 0) {
                          setInfoForm((f) => ({
                            ...f,
                            firstSessionDate: null,
                            firstSessionDateRaw: "",
                          }));
                        }
                      }}
                      className="h-14 md:h-16 text-lg sm:text-xl rounded-2xl font-bold px-5 bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 focus-visible:ring-[#F06C22] shadow-sm text-slate-900 dark:text-slate-100"
                    />
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            <div className="lg:col-span-1 space-y-6">
              <Card className="rounded-[40px] shadow-xl bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 overflow-hidden">
                <CardHeader className="p-8 border-b border-slate-200 dark:border-slate-700 flex flex-row items-center justify-between">
                  <div>
                    <CardTitle className="text-xl font-bold uppercase italic tracking-tighter">
                      Reminders
                    </CardTitle>
                    <CardDescription className="text-[11px] font-medium uppercase tracking-wide opacity-70 text-[#38BDF8]">
                      Alerts & Follow-ups
                    </CardDescription>
                  </div>
                </CardHeader>
                <CardContent className="p-8 space-y-6">
                  <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-3xl p-6 shadow-sm">
                    <div className="grid grid-cols-1 gap-4 mb-4">
                      <div className="space-y-2">
                        <Label className="text-[11px] font-medium uppercase tracking-wide opacity-70 text-slate-800 dark:text-slate-400 ml-1">
                          Event Type
                        </Label>
                        <Select
                          value={newEventForm.type}
                          onValueChange={(v: any) =>
                            setNewEventForm({ ...newEventForm, type: v })
                          }
                        >
                          <SelectTrigger className="w-full h-12 bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 font-bold rounded-2xl focus-visible:ring-[#38BDF8]">
                            <SelectValue placeholder="Select Type..." />
                          </SelectTrigger>
                          <SelectContent className="bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 rounded-xl">
                            <SelectItem value="Progress Report">
                              Progress Report
                            </SelectItem>
                            <SelectItem value="InBody Scan">
                              InBody Scan
                            </SelectItem>
                            <SelectItem value="Routine Change">
                              Routine Change
                            </SelectItem>
                            <SelectItem value="Vacation">Vacation</SelectItem>
                            <SelectItem value="Birthday/Anniversary">
                              Birthday/Anniversary
                            </SelectItem>
                            <SelectItem value="Other">Other</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label className="text-[11px] font-medium uppercase tracking-wide opacity-70 text-slate-800 dark:text-slate-400 ml-1">
                          Date
                        </Label>
                        <Input
                          type="date"
                          value={newEventForm.date}
                          onChange={(e) =>
                            setNewEventForm((f) => ({
                              ...f,
                              date: e.target.value,
                            }))
                          }
                          className="h-12 rounded-2xl font-bold px-4 bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 focus-visible:ring-[#38BDF8]"
                        />
                      </div>
                    </div>
                    <div className="space-y-2 mb-4">
                      <Label className="text-[11px] font-medium uppercase tracking-wide opacity-70 text-slate-800 dark:text-slate-400 ml-1">
                        Event Title
                      </Label>
                      <Input
                        value={newEventForm.title}
                        onChange={(e) =>
                          setNewEventForm((f) => ({
                            ...f,
                            title: e.target.value,
                          }))
                        }
                        placeholder="Brief description..."
                        className="h-12 rounded-2xl font-bold px-4 bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 focus-visible:ring-[#38BDF8]"
                      />
                    </div>
                    <div className="space-y-2 mb-6">
                      <Label className="text-[11px] font-medium uppercase tracking-wide opacity-70 text-slate-800 dark:text-slate-400 ml-1">
                        Notes
                      </Label>
                      <Textarea
                        value={newEventForm.notes}
                        onChange={(e) =>
                          setNewEventForm((f) => ({
                            ...f,
                            notes: e.target.value,
                          }))
                        }
                        className="min-h-20 rounded-3xl font-medium p-4 bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 focus-visible:ring-[#38BDF8] resize-none"
                        placeholder="Optional details..."
                      />
                    </div>
                    <Button
                      onClick={handleAddEvent}
                      disabled={
                        !newEventForm.title ||
                        !newEventForm.date ||
                        isSavingEvent
                      }
                      className="w-full bg-[#38BDF8] hover:bg-[#0ea5e9] font-bold uppercase tracking-widest text-xs h-12 rounded-full transition-all"
                    >
                      {isSavingEvent ? "Adding..." : "Add Event"}
                    </Button>
                  </div>

                  {client?.events && client.events.length > 0 ? (
                    <div className="space-y-3 mt-8">
                      <h4 className="text-[11px] font-medium uppercase tracking-wide opacity-70 text-slate-800 dark:text-slate-400 ml-1 mb-4">
                        Scheduled Events
                      </h4>
                      {client.events
                        .sort(
                          (a, b) =>
                            new Date(b.date).getTime() -
                            new Date(a.date).getTime(),
                        )
                        .map((event) => (
                          <div
                            key={event.id}
                            className="flex flex-col gap-2 p-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl group transition-all hover:bg-slate-50 shadow-sm"
                          >
                            <div className="flex items-center justify-between">
                              <div className="flex flex-col">
                                <span
                                  className={cn(
                                    "text-[11px] font-bold uppercase tracking-widest mb-1",
                                    event.priority === "High"
                                      ? "text-red-400"
                                      : event.priority === "Medium"
                                        ? "text-amber-400"
                                        : "text-slate-600 dark:text-slate-400",
                                  )}
                                >
                                  {event.type} • {event.priority} Priority
                                </span>
                                <span className="font-bold">{event.title}</span>
                              </div>
                              <div className="flex flex-col items-end">
                                <span className="text-[11px] font-bold tracking-widest uppercase text-slate-800 dark:text-slate-400 mb-1">
                                  {new Date(
                                    parseSessionDate(event.date),
                                  ).toLocaleDateString()}
                                </span>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleDeleteEvent(event.id)}
                                  className="h-8 w-8 p-0 text-red-500/50 hover:text-red-500 hover:bg-red-500/10 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </Button>
                              </div>
                            </div>
                            {event.notes && (
                              <p className="text-xs text-slate-500 dark:text-slate-600 mt-1 font-medium bg-white dark:bg-slate-900 p-3 flex rounded-xl">
                                {event.notes}
                              </p>
                            )}
                          </div>
                        ))}
                    </div>
                  ) : null}
                </CardContent>
              </Card>
            </div>

            <div className="space-y-6">
              <Card className="rounded-2xl shadow-sm bg-surface-1 border border-div-d">
                <CardHeader className="p-8 border-b border-div-d">
                  <CardTitle className="text-xl font-bold uppercase italic tracking-tighter text-white">
                    Retention Status
                  </CardTitle>
                  <CardDescription className="text-[11px] font-medium uppercase tracking-wide opacity-70 text-cyan">
                    MIA Tracking & Overrides
                  </CardDescription>
                </CardHeader>
                <CardContent className="p-8 space-y-6">
                  <div className="flex flex-col gap-4">
                    <div className="flex items-center justify-between bg-surface-2 p-4 rounded-xl border border-div-d">
                      <div>
                        <Label className="text-[11px] font-medium uppercase tracking-wide opacity-70 text-ink-d2">
                          Exclude from MIA Tracking
                        </Label>
                        <p className="text-[11px] font-bold opacity-40 uppercase tracking-tighter mt-0.5 text-ink-d3">
                          Temporarily pause retention alerts
                        </p>
                      </div>
                      <Switch
                        checked={
                          infoForm.retentionMeta?.excludedFromMIA || false
                        }
                        onCheckedChange={(v) => {
                          setInfoForm((f) => ({
                            ...f,
                            retentionMeta: {
                              ...f.retentionMeta,
                              excludedFromMIA: v,
                              excludedBy: v ? authTrainer?.fullName : undefined,
                            },
                          }));
                        }}
                        className="data-[state=checked]:bg-cyan"
                      />
                    </div>

                    {infoForm.retentionMeta?.excludedFromMIA && (
                      <div className="bg-surface-2 p-4 rounded-xl border border-div-d space-y-4">
                        <div className="flex flex-col gap-2">
                          <Label className="text-[11px] font-medium uppercase tracking-wide opacity-70 text-ink-d2">
                            Reason
                          </Label>
                          <Select
                            value={infoForm.retentionMeta.excludedReason || ""}
                            onValueChange={(val) =>
                              setInfoForm((f) => ({
                                ...f,
                                retentionMeta: {
                                  ...f.retentionMeta,
                                  excludedReason: val,
                                },
                              }))
                            }
                          >
                            <SelectTrigger className="w-full bg-surface-1 border border-div-d rounded-xl min-h-11 text-white focus:ring-2 focus:ring-cyan focus:ring-offset-2 focus:ring-offset-bg-dark">
                              <SelectValue placeholder="Select reason..." />
                            </SelectTrigger>
                            <SelectContent className="bg-surface-2 text-white border-div-d">
                              <SelectItem value="Vacation">Vacation</SelectItem>
                              <SelectItem value="Medical / Injury">
                                Medical / Injury
                              </SelectItem>
                              <SelectItem value="Snowbird / Seasonal Relocation">
                                Snowbird / Seasonal Relocation
                              </SelectItem>
                              <SelectItem value="Other">Other</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>

                        <div className="flex flex-col gap-2">
                          <Label className="text-[11px] font-medium uppercase tracking-wide opacity-70 text-ink-d2">
                            Auto-Resume Date
                          </Label>
                          <input
                            type="date"
                            value={
                              infoForm.retentionMeta.autoIncludeAfter
                                ? new Date(
                                    infoForm.retentionMeta.autoIncludeAfter,
                                  )
                                    .toISOString()
                                    .split("T")[0]
                                : ""
                            }
                            onChange={(e) =>
                              setInfoForm((f) => ({
                                ...f,
                                retentionMeta: {
                                  ...f.retentionMeta,
                                  autoIncludeAfter: e.target.value
                                    ? new Date(e.target.value).toISOString()
                                    : undefined,
                                },
                              }))
                            }
                            className="flex min-h-11 w-full rounded-xl border border-div-d bg-surface-1 px-3 py-2 text-[14px] text-white focus:outline-none focus:ring-2 focus:ring-cyan focus:ring-offset-2 focus:ring-offset-bg-dark"
                          />
                        </div>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>

              <Card className="rounded-[40px] shadow-sm bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800">
                <CardHeader className="p-8 border-b border-slate-200 dark:border-slate-800">
                  <CardTitle className="text-xl font-bold uppercase italic tracking-tighter">
                    Account Actions
                  </CardTitle>
                  <CardDescription className="text-[11px] font-medium uppercase tracking-wide opacity-70 text-[#38BDF8]">
                    Protocol & Membership Management
                  </CardDescription>
                </CardHeader>
                <CardContent className="p-8 space-y-6">
                  <div className="flex items-center justify-between bg-slate-50 dark:bg-slate-800 p-4 rounded-2xl border border-slate-200 dark:border-slate-800">
                    <div>
                      <Label className="text-[11px] font-medium uppercase tracking-wide opacity-70 text-slate-800 dark:text-slate-400">
                        Active Account
                      </Label>
                      <p className="text-[11px] font-bold opacity-40 uppercase tracking-tighter mt-0.5 text-slate-300">
                        Toggle client visibility in lists
                      </p>
                    </div>
                    <Switch
                      checked={infoForm.isActive}
                      onCheckedChange={(v) =>
                        setInfoForm((f) => ({ ...f, isActive: v }))
                      }
                      className="data-[state=checked]:bg-emerald-500"
                    />
                  </div>

                  <div className="grid grid-cols-1 gap-4">
                    <Button
                      onClick={() => setView("chart-importer" as any)}
                      className="w-full bg-[#0ea5e9]/10 hover:bg-[#0ea5e9]/20 text-[#38BDF8] border border-[#38BDF8]/30 rounded-2xl font-bold uppercase italic tracking-widest h-12 shadow-sm transition-all"
                    >
                      <Maximize className="w-4 h-4 mr-2" />
                      Open Migration Hub
                    </Button>

                    <Button
                      onClick={() =>
                        setView("workouts", { isIntroSession: true })
                      }
                      className="w-full bg-[#115E8D] hover:bg-[#115E8D]/90 rounded-2xl font-bold uppercase italic tracking-widest h-12 shadow-md shadow-[#115E8D]/20"
                    >
                      Start Introductory Session
                    </Button>

                    <Button
                      disabled={isSavingInfo}
                      onClick={handleSaveInfo}
                      className="w-full h-12 rounded-full bg-[#F06C22] hover:bg-[#ea580c] font-bold uppercase italic text-xs tracking-widest shadow-[0_0_20px_rgba(240,108,34,0.3)] transition-all"
                    >
                      {isSavingInfo ? "Processing..." : "Save All Changes"}
                    </Button>

                    <div className="pt-4 mt-2 border-t border-slate-200 dark:border-slate-800">
                      <Button
                        variant="outline"
                        className="w-full h-10 rounded-full border-red-500/20 text-red-500 hover:bg-red-500/10 hover:text-red-400 font-bold uppercase tracking-widest text-[11px] transition-all bg-transparent shadow-none"
                        onClick={() => setIsDeleting(true)}
                      >
                        <Trash2 className="w-3.5 h-3.5 mr-2" />
                        Delete Member Profile
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {checkIsOwner(authTrainer) && (
                <Card className="rounded-[40px] shadow-sm bg-amber-500/5 border-amber-500/10">
                  <CardHeader className="p-8 border-b border-amber-500/10 flex flex-row items-center justify-between">
                    <div>
                      <CardTitle className="text-xl font-bold uppercase italic tracking-tighter">
                        Debug Tools
                      </CardTitle>
                      <CardDescription className="text-[11px] font-medium uppercase tracking-wide opacity-70 text-amber-500/80">
                        Administrative Utilities
                      </CardDescription>
                    </div>
                  </CardHeader>
                  <CardContent className="p-8 space-y-4">
                    <Button
                      onClick={() => setShowMockConfirm(true)}
                      className="w-full bg-amber-500 hover:bg-amber-600 text-black rounded-2xl font-bold uppercase italic tracking-widest h-12 shadow-sm transition-all"
                    >
                      <Database className="w-4 h-4 mr-2" />
                      Provision Mock Client Data
                    </Button>
                    <p className="text-[11px] text-center text-amber-500/40 font-bold uppercase tracking-widest">
                      Creates a new test entity with full history
                    </p>
                  </CardContent>
                </Card>
              )}
            </div>
          </div>
        </TabsContent>
      </Tabs>

      {isInfoSheetOpen && client && (
        <ClientInfoSheet
          isOpen={isInfoSheetOpen}
          onOpenChange={setIsInfoSheetOpen}
          client={client}
          authTrainer={authTrainer}
          defaultTab={infoSheetTab}
        />
      )}

      {showFullChart &&
        clientId &&
        createPortal(
          <WorkoutChartGrid
            clientId={clientId}
            clients={clients}
            machines={machines}
            routines={routines}
            onBack={() => setShowFullChart(false)}
            user={user}
            preloadedSessions={sessions}
            preloadedLogs={allLogs}
            onLoadMoreHistory={handleLoadMoreHistory}
            studios={studios}
            activeStudioId={activeStudioId}
          />,
          document.body,
        )}

      <Dialog open={isDeleting} onOpenChange={setIsDeleting}>
        <DialogContent
          showCloseButton={false}
          className="rounded-[40px] border border-slate-200 dark:border-slate-800 shadow-2xl p-0 overflow-hidden max-w-sm bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
        >
          <div className="bg-red-600 p-8 flex flex-col items-center gap-4">
            <div className="w-16 h-16 rounded-full bg-white/20 flex items-center justify-center animate-pulse">
              <AlertCircle className="w-8 h-8" />
            </div>
            <div className="text-center">
              <h2 className="text-2xl font-bold uppercase italic tracking-tighter leading-none">
                Confirm Deletion
              </h2>
              <p className="text-[11px] font-medium uppercase tracking-wide opacity-70 mt-2">
                This action is permanent
              </p>
            </div>
          </div>
          <div className="p-8 space-y-6 text-center bg-white dark:bg-slate-900">
            <p className="text-sm font-medium text-muted-foreground leading-relaxed">
              Are you absolutely sure you want to delete{" "}
              <span className="font-bold text-foreground">
                {" "}
                {client.firstName} {client.lastName}'s
              </span>{" "}
              profile? All historical session data and machine settings will be
              lost.
            </p>
            <div className="flex flex-col gap-3">
              <Button
                variant="destructive"
                className="h-14 rounded-full font-bold uppercase italic tracking-widest text-xs shadow-xl shadow-red-200"
                onClick={() => {
                  if (client.id) onDelete(client.id);
                  setIsDeleting(false);
                }}
              >
                Delete Everything
              </Button>
              <Button
                variant="ghost"
                className="h-12 rounded-full font-bold text-muted-foreground"
                onClick={() => setIsDeleting(false)}
              >
                Go Back
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <MachineSettingsDashboardModal
        editingSettings={editingSettings}
        setEditingSettings={setEditingSettings}
        machines={machines}
        exerciseLogs={allLogs}
        sessions={sessions}
        isSaving={isSavingSettings}
        onSave={handleUpdateMachineSettings}
        studios={studios}
        activeStudioId={activeStudioId}
      />

      <Dialog
        open={isEditingSessionCount}
        onOpenChange={setIsEditingSessionCount}
      >
        <DialogContent
          showCloseButton={false}
          className="rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xl p-6 sm:max-w-xs text-slate-900 dark:text-white"
        >
          <DialogHeader>
            <DialogTitle className="text-xl font-bold uppercase italic tracking-tighter">
              Edit Session Count
            </DialogTitle>
            <DialogDescription className="text-xs uppercase tracking-widest text-[#38BDF8] font-bold">
              Adjust {client.firstName}'s total sessions.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label className="font-bold text-xs uppercase tracking-widest">
                Total Sessions completed
              </Label>
              <Input
                type="number"
                value={sessionCountInput}
                onChange={(e) => setSessionCountInput(e.target.value)}
                className="bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 font-bold text-lg h-12 focus-visible:ring-[#38BDF8]"
                placeholder="0"
              />
            </div>
            <div className="flex gap-3">
              <Button
                variant="outline"
                onClick={() => setIsEditingSessionCount(false)}
                className="flex-1 border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-xl font-bold uppercase tracking-widest text-[11px]"
              >
                Cancel
              </Button>
              <Button
                onClick={handleSaveSessionCount}
                className="flex-2 bg-[#38BDF8] hover:bg-[#0284c7] rounded-full font-bold uppercase tracking-widest text-[11px]"
              >
                Save
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <StrongConfirmationModal
        isOpen={!!reportToDelete}
        title="Delete Progress Report"
        description="Are you sure you want to delete this progress report? This action is permanent and cannot be undone."
        confirmationPhrase="DELETE REPORT"
        onConfirm={performReportDelete}
        onCancel={() => setReportToDelete(null)}
      />

      <StrongConfirmationModal
        isOpen={showMockConfirm}
        title="Provision Mock Client Data"
        description="Are you sure you want to generate a new mock client with 60 days of historical workout data? This will create a temporary member record for validation."
        confirmationPhrase="GENERATE MOCK"
        onConfirm={performMockGeneration}
        onCancel={() => setShowMockConfirm(false)}
      />
    </motion.div>
  );
}

interface SortableRoutineMachineRowProps {
  key?: any;
  id: string;
  machineName: string;
  weightText: string;
  repsText: string;
  isEditMode?: boolean;
  onRemove?: () => void;
}

export function SortableRoutineMachineRow({
  id,
  machineName,
  weightText,
  repsText,
  isEditMode,
  onRemove,
}: SortableRoutineMachineRowProps) {
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
        "flex items-center justify-between p-3 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200/60 dark:border-slate-800/60 transition-all",
        isDragging &&
          "opacity-95 scale-[1.02] shadow-md ring-2 ring-cyan/30 z-50 bg-white dark:bg-slate-850 border-cyan/40",
      )}
    >
      <div className="flex items-center gap-3 min-w-0 flex-1">
        {isEditMode ? (
          <div
            {...attributes}
            {...listeners}
            className="flex items-center justify-center h-12 w-12 cursor-grab active:cursor-grabbing bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-500 rounded-lg shrink-0 touch-none"
            title="Drag to reorder"
          >
            <GripVertical className="w-5 h-5 text-slate-400 dark:text-slate-500" />
          </div>
        ) : (
          <div className="flex items-center justify-center h-7 w-7 rounded bg-slate-100 dark:bg-slate-800 text-[11px] font-mono font-bold text-slate-500 dark:text-slate-400 shrink-0">
            •
          </div>
        )}
        <div className="min-w-0 flex-1">
          <p className="text-xs font-bold uppercase tracking-tight text-slate-800 dark:text-neutral-200 truncate">
            {machineName}
          </p>
          {!isEditMode && weightText && (
            <p className="text-[10px] text-slate-400 font-mono">
              {weightText} × {repsText}
            </p>
          )}
        </div>
      </div>

      {isEditMode && onRemove && (
        <Button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          variant="ghost"
          size="sm"
          className="h-10 w-10 p-0 text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 rounded-lg shrink-0"
        >
          <X className="w-4 h-4" />
        </Button>
      )}
    </div>
  );
}
