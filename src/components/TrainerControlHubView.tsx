import React, { useState } from "react";
import Papa from "papaparse";
import {
  collection,
  addDoc,
  serverTimestamp,
  Timestamp,
  query,
  where,
  getDocs,
  onSnapshot,
  doc,
  setDoc,
  updateDoc,
  deleteDoc,
  orderBy,
  writeBatch,
} from "firebase/firestore";
import { db } from "../firebase";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Upload,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Database,
  Link,
  RefreshCcw,
  ShieldCheck,
  LogOut,
  Plus,
  Trash2,
  Shield,
  Settings2,
  Building2,
  HardDrive,
  Lock,
  ShieldAlert,
  MonitorPlay,
  Trash,
  UserCog,
  TrendingUp,
  Trophy,
  Sparkles,
  Megaphone,
  Gift,
  ChevronDown,
  ChevronUp,
  Users,
  Clock,
  User,
  Settings,
  Webhook,
  Download,
  Bell,
  FileSpreadsheet,
  Mail,
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CreateTrainerModal } from "./CreateTrainerModal";
import { TrainerMachineEditor } from "./TrainerMachineEditor";
import {
  Machine,
  Client,
  Trainer,
  WorkoutSession,
  ScheduleEntry,
  Studio,
  HubAnnouncement,
  CreateTrainerPayload,
} from "../types";
import { useTheme } from "./ThemeProvider";
import { Bug } from "lucide-react";
import { useToast } from "../contexts/ToastContext";
import { StrongConfirmationModal } from "./StrongConfirmationModal";
import {
  findMatchingTrainer,
  normalizeName,
  cleanAlphanumeric,
} from "../lib/sync-utils";
import {
  isAdmin as checkIsAdmin,
  isFounder as checkIsFounder,
  isOwner as checkIsOwner,
  isStudioLeader as checkIsStudioLeader,
  hasPermission,
} from "../lib/permissions";
import { ROLE_LABELS } from "../types";
import { parseMachineSettings, isSessionValid } from "../lib/utils";
import { DocumentIdMissingError, OperationType } from "../lib/firestore-errors";

import { DataMigrationTool } from "./DataMigrationTool";

export function TrainerControlHubView({
  trainers,
  machines,
  clients,
  sessions = [],
  authTrainer,
  activeStudioId,
  isAdmin,
  onAppCleanse,
  onSeedDemoClient,
  onRestoreMachines,
  onLogout,
  onReorderTrainers,
  setView,
  studios,
}: {
  trainers: Trainer[];
  machines: Machine[];
  clients: Client[];
  sessions?: WorkoutSession[];
  authTrainer: Trainer | null;
  activeStudioId: string | null;
  isAdmin: boolean;
  onAppCleanse: () => void;
  onSeedDemoClient: () => void;
  onRestoreMachines: () => void;
  onLogout?: () => void;
  onReorderTrainers?: () => void;
  setView?: (v: string) => void;
  studios: Studio[];
}) {
  const { success: toastSuccess, error: toastError } = useToast();
  const activeStudio = studios.find((s) => s.id === activeStudioId);
  const [sessionToTerminate, setSessionToTerminate] =
    useState<WorkoutSession | null>(null);
  const [isSyncingAll, setIsSyncingAll] = useState(false);
  const [syncingTrainerId, setSyncingTrainerId] = useState<string | null>(null);
  const [isRestoringMachines, setIsRestoringMachines] = useState(false);
  const [isCleansingApp, setIsCleansingApp] = useState(false);

  // Announcements State
  const [announcements, setAnnouncements] = useState<HubAnnouncement[]>([]);
  const [isCreatingAnnouncement, setIsCreatingAnnouncement] = useState(false);
  const [lifespan, setLifespan] = useState("24h");
  const [newAnnouncement, setNewAnnouncement] = useState<
    Partial<HubAnnouncement>
  >({
    title: "",
    shortContent: "",
    longContent: "",
    studioId: "all",
    priority: "low",
    isActive: true,
  });

  // Layout State
  const [activeTab, setActiveTab] = useState<
    | "equipment_settings"
    | "app_settings"
    | "team_management"
    | "data_exports"
    | "notifications"
  >("equipment_settings");

  const [exportStartDate, setExportStartDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return d.toISOString().split("T")[0];
  });
  const [exportEndDate, setExportEndDate] = useState(() => {
    return new Date().toISOString().split("T")[0];
  });
  const [isExportingPayroll, setIsExportingPayroll] = useState(false);
  const [isExportingAttendance, setIsExportingAttendance] = useState(false);
  const [isExportingProgress, setIsExportingProgress] = useState(false);
  const [studioToDelete, setStudioToDelete] = useState<Studio | null>(null);

  // Mindbody Staff ID Edit State
  const [editingStaffId, setEditingStaffId] = useState<string | null>(null);
  const [newStaffId, setNewStaffId] = useState("");
  const [isUpdatingStaffId, setIsUpdatingStaffId] = useState(false);

  const { theme, setTheme } = useTheme();

  const [bugReport, setBugReport] = useState({
    issueType: "UI Problem",
    description: "",
  });
  const [isSubmittingBug, setIsSubmittingBug] = useState(false);

  const submitBug = async () => {
    if (!bugReport.description) return;
    setIsSubmittingBug(true);
    try {
      await addDoc(collection(db, "bug_reports"), {
        ...bugReport,
        userId: authTrainer?.id || "unknown",
        userEmail: authTrainer?.email || "unknown",
        userName: authTrainer?.fullName || "unknown",
        studioId: authTrainer?.primaryHomeStudioId || "unassigned",
        createdAt: serverTimestamp(),
        browser: window.navigator.userAgent,
        platform: window.navigator.platform,
        status: "open",
      });
      setBugReport({ issueType: "UI Problem", description: "" });
      toastSuccess("Bug report submitted successfully! Thank you.");
    } catch (e: any) {
      toastError("Failed to submit bug report: " + e.message);
    } finally {
      setIsSubmittingBug(false);
    }
  };

  // New states for Create/Delete overrides
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [trainerToDelete, setTrainerToDelete] = useState<Trainer | null>(null);
  const [selectedTrainer, setSelectedTrainer] = useState<Trainer | null>(null);
  const [trainerSearchQuery, setTrainerSearchQuery] = useState("");

  const [newStudioName, setNewStudioName] = useState("");
  const [isAddingStudio, setIsAddingStudio] = useState(false);
  const [isEquipmentExpanded, setIsEquipmentExpanded] = useState(false);

  const handleAddStudio = async () => {
    if (!newStudioName.trim()) return;
    setIsAddingStudio(true);
    try {
      await addDoc(collection(db, "studios"), {
        name: newStudioName.trim(),
        createdAt: serverTimestamp(),
      });
      setNewStudioName("");
      toastSuccess("Studio location added successfully.");
    } catch (e: any) {
      toastError("Error adding studio: " + e.message);
    } finally {
      setIsAddingStudio(false);
    }
  };

  const handleDeleteStudio = async (studioId: string) => {
    try {
      await deleteDoc(doc(db, "studios", studioId));
      toastSuccess("Studio location deleted successfully.");
    } catch (e: any) {
      toastError("Error deleting studio: " + e.message);
    }
  };

  const handleCreateTrainer = async (data: CreateTrainerPayload) => {
    try {
      const { pinHash, pin, ...restData } = data;
      const ref = await addDoc(collection(db, "trainers"), {
        ...restData,
        order: (restData as any).order || Date.now(),
        primaryHomeStudioId: restData.primaryHomeStudioId || activeStudioId,
        createdAt: serverTimestamp(),
      });
      toastSuccess("Trainer profile created successfully.");
    } catch (e: any) {
      toastError("Error creating trainer: " + e.message);
    }
  };

  const handleDeleteTrainer = async () => {
    if (!trainerToDelete?.id) return;
    try {
      await deleteDoc(doc(db, "trainers", trainerToDelete.id));
      toastSuccess("Trainer profile deleted successfully.");
      setTrainerToDelete(null);
    } catch (e: any) {
      toastError("Error deleting trainer: " + e.message);
    }
  };

  // Fetch Announcements (Hybrid One-Time Fetch to save read quota)
  React.useEffect(() => {
    let active = true;
    const fetchAnnouncements = async () => {
      try {
        const q = query(collection(db, "hub_announcements"));
        const snap = await getDocs(q);
        if (!active) return;

        const data = snap.docs.map(
          (doc) => ({ id: doc.id, ...doc.data() }) as HubAnnouncement,
        );

        // Filter and sort in memory to be resilient to missing indexes
        const filtered = data
          .filter((a) => a.isActive !== false) // Handle active only
          .filter((a) => {
            if (a.expiresAt) {
              const expTime = a.expiresAt.toDate
                ? a.expiresAt.toDate().getTime()
                : typeof a.expiresAt === "number"
                  ? a.expiresAt
                  : 0;
              if (expTime > 0 && expTime < Date.now()) return false;
            }
            return true;
          })
          .filter(
            (a) =>
              a.targetScope === "universal" ||
              a.studioId === "all" ||
              (activeStudioId && a.studioId === activeStudioId),
          )
          .sort((a, b) => {
            const timeA = a.createdAt?.toMillis?.() || 0;
            const timeB = b.createdAt?.toMillis?.() || 0;
            return timeB - timeA;
          });

        setAnnouncements(filtered);
      } catch (error) {
        console.error("Announcements collection error:", error);
      }
    };

    fetchAnnouncements();
    return () => {
      active = false;
    };
  }, [activeStudioId]);

  const handleCreateAnnouncement = async () => {
    if (!authTrainer || !newAnnouncement.title || !newAnnouncement.shortContent)
      return;
    setIsCreatingAnnouncement(true);
    try {
      const isSuperUser = isAdmin || checkIsFounder(authTrainer);
      const assignedStudioIds = !isSuperUser
        ? [
            authTrainer?.primaryHomeStudioId,
            ...(authTrainer?.accessibleStudioIds || []),
          ].filter(Boolean)
        : [];
      const filteredStudiosForAnnouncement = studios.filter(
        (s) => isSuperUser || (assignedStudioIds as string[]).includes(s.id!),
      );
      const defaultStudioId = isSuperUser
        ? "all"
        : filteredStudiosForAnnouncement[0]?.id || "";
      const finalStudioId =
        newAnnouncement.studioId === "all" && !isSuperUser
          ? defaultStudioId
          : newAnnouncement.studioId || defaultStudioId;
      const isUniversal = finalStudioId === "all";

      const now = new Date();
      let expiresAt = new Date(now);
      if (lifespan === "24h") expiresAt.setHours(expiresAt.getHours() + 24);
      else if (lifespan === "1w") expiresAt.setDate(expiresAt.getDate() + 7);
      else expiresAt.setMonth(expiresAt.getMonth() + 1);

      const docRef = await addDoc(collection(db, "hub_announcements"), {
        ...newAnnouncement,
        studioId: finalStudioId,
        targetScope: isUniversal ? "universal" : "studio",
        type: newAnnouncement.type || "news",
        authorId: authTrainer.id,
        authorName: authTrainer.fullName,
        createdAt: serverTimestamp(),
        expiresAt: expiresAt,
        isActive: true,
        readBy: [],
      });

      const createdObj: HubAnnouncement = {
        id: docRef.id,
        title: newAnnouncement.title,
        shortContent: newAnnouncement.shortContent,
        longContent: newAnnouncement.longContent || "",
        authorId: authTrainer.id!,
        authorName: authTrainer.fullName,
        studioId: finalStudioId,
        targetScope: isUniversal ? "universal" : "studio",
        type: newAnnouncement.type || "news",
        createdAt: { toMillis: () => Date.now(), toDate: () => new Date() }, // Local mock of timestamp
        expiresAt: expiresAt,
        isActive: true,
        priority: newAnnouncement.priority as any,
        readBy: [],
      };

      setAnnouncements((prev) => [createdObj, ...prev]);

      setNewAnnouncement({
        title: "",
        shortContent: "",
        longContent: "",
        studioId: "all",
        priority: "low",
        type: "news",
        isActive: true,
      });
      toastSuccess("Announcement published!");
    } catch (err: any) {
      toastError("Error creating announcement: " + err.message);
    } finally {
      setIsCreatingAnnouncement(false);
    }
  };

  const handleToggleVisibility = async (
    trainerId: string,
    currentVal: boolean,
  ) => {
    try {
      await updateDoc(doc(db, "trainers", trainerId), {
        isVisibleOnCalendar: !currentVal,
      });
      toastSuccess("Trainer calendar visibility toggled.");
    } catch (e: any) {
      toastError("Error updating visibility: " + e.message);
    }
  };

  const handleToggleNotificationSetting = async (
    key: "bookingRemindersEnabled" | "dailySummaryEnabled",
    val: boolean,
  ) => {
    if (!activeStudioId) return;
    try {
      await updateDoc(doc(db, "studios", activeStudioId), {
        [`notificationSettings.${key}`]: val,
      });
      toastSuccess("Notification settings updated successfully.");
    } catch (e: any) {
      toastError("Failed to update notification settings: " + e.message);
    }
  };

  const fetchSessionsForExport = async (
    startDateStr: string,
    endDateStr: string,
  ) => {
    try {
      const start = new Date(startDateStr);
      start.setHours(0, 0, 0, 0);
      const end = new Date(endDateStr);
      end.setHours(23, 59, 59, 999);

      let q = query(
        collection(db, "sessions"),
        where("createdAt", ">=", Timestamp.fromDate(start)),
        where("createdAt", "<=", Timestamp.fromDate(end)),
      );

      const snap = await getDocs(q);
      let data = snap.docs.map(
        (doc) => ({ id: doc.id, ...doc.data() }) as WorkoutSession,
      );

      // Filter by status === 'Completed'
      data = data.filter((s) => s.status === "Completed");

      // Filter by activeStudioId if selected
      if (activeStudioId) {
        data = data.filter((s) => s.hostedAtStudioId === activeStudioId);
      }

      return data;
    } catch (err: any) {
      console.error(err);
      toastError("Failed to fetch sessions: " + err.message);
      return [];
    }
  };

  const fetchSchedulesForExport = async (
    startDateStr: string,
    endDateStr: string,
  ) => {
    try {
      const start = new Date(startDateStr);
      start.setHours(0, 0, 0, 0);
      const end = new Date(endDateStr);
      end.setHours(23, 59, 59, 999);

      let q = query(
        collection(db, "schedules"),
        where("startTime", ">=", Timestamp.fromDate(start)),
        where("startTime", "<=", Timestamp.fromDate(end)),
      );

      const snap = await getDocs(q);
      let data = snap.docs.map(
        (doc) => ({ id: doc.id, ...doc.data() }) as ScheduleEntry,
      );

      // Filter by activeStudioId if not 'all'
      if (activeStudioId) {
        data = data.filter((s) => s.studioId === activeStudioId);
      }

      return data;
    } catch (err: any) {
      console.error(err);
      toastError("Failed to fetch schedule data: " + err.message);
      return [];
    }
  };

  const handleExportPayroll = async () => {
    setIsExportingPayroll(true);
    try {
      const allSessions = await fetchSessionsForExport(
        exportStartDate,
        exportEndDate,
      );
      if (allSessions.length === 0) {
        toastError("No completed sessions found in the selected date range.");
        return;
      }

      const payrollData = allSessions.map((s) => {
        const trainerObj = trainers.find(
          (t) => t.id === s.trainerId || t.initials === s.trainerInitials,
        );
        const clientObj = clients.find((c) => c.id === s.clientId);
        const studioObj = studios.find((std) => std.id === s.hostedAtStudioId);

        const dateObj = s.createdAt?.toDate?.() || new Date(s.createdAt);

        return {
          "Trainer Initials": s.trainerInitials || "N/A",
          "Trainer Name": trainerObj?.fullName || "Unknown Trainer",
          "Studio ID": s.hostedAtStudioId || "N/A",
          "Studio Name": studioObj?.name || "Unknown Studio",
          "Client Name": clientObj
            ? `${clientObj.firstName} ${clientObj.lastName}`
            : "Unknown Client",
          "Session Date": dateObj.toISOString().split("T")[0],
          "Session Type": s.sessionType || "Standard",
          "Session Notes": s.notes || "",
        };
      });

      const filename = `payroll_details_${exportStartDate}_to_${exportEndDate}.csv`;
      const csv = Papa.unparse(payrollData);
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.setAttribute("href", url);
      link.setAttribute("download", filename);
      link.style.visibility = "hidden";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      toastSuccess(`Payroll CSV (${filename}) downloaded successfully.`);
    } catch (err: any) {
      console.error(err);
      toastError("Failed to export payroll summary: " + err.message);
    } finally {
      setIsExportingPayroll(false);
    }
  };

  const handleExportAttendance = async () => {
    setIsExportingAttendance(true);
    try {
      const schedules = await fetchSchedulesForExport(
        exportStartDate,
        exportEndDate,
      );
      if (schedules.length === 0) {
        toastError("No attendance logs found in the selected date range.");
        return;
      }

      const attendanceData = schedules.map((s) => {
        const dateObj = s.startTime?.toDate?.() || new Date(s.startTime);
        return {
          Date: dateObj.toISOString().split("T")[0],
          "Start Time": dateObj.toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
          }),
          "Client ID": s.clientId || "Unassigned",
          "Client Name": s.clientName || "Unknown Client",
          "Trainer ID": s.trainerId || "Unassigned",
          "Trainer Name": s.trainerName || "Unknown Trainer",
          Status: s.status || "Scheduled",
          Service: s.serviceName || "Workout",
          Source: s.source || "Manual",
          "Studio ID": s.studioId || "",
        };
      });

      const filename = `client_attendance_${exportStartDate}_to_${exportEndDate}.csv`;
      const csv = Papa.unparse(attendanceData);
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.setAttribute("href", url);
      link.setAttribute("download", filename);
      link.style.visibility = "hidden";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      toastSuccess(`Attendance CSV (${filename}) downloaded successfully.`);
    } catch (err: any) {
      console.error(err);
      toastError("Failed to export attendance summary: " + err.message);
    } finally {
      setIsExportingAttendance(false);
    }
  };

  const handleExportProgress = async () => {
    setIsExportingProgress(true);
    try {
      const allSessions = await fetchSessionsForExport(
        exportStartDate,
        exportEndDate,
      );
      if (allSessions.length === 0) {
        toastError("No completed sessions found in the selected date range.");
        return;
      }

      const start = new Date(exportStartDate);
      start.setHours(0, 0, 0, 0);
      const end = new Date(exportEndDate);
      end.setHours(23, 59, 59, 999);

      const logsSnap = await getDocs(
        query(
          collection(db, "exerciseLogs"),
          where("createdAt", ">=", Timestamp.fromDate(start)),
          where("createdAt", "<=", Timestamp.fromDate(end)),
        ),
      );

      const logsBySession: Record<string, any[]> = {};
      logsSnap.forEach((doc) => {
        const data = doc.data();
        if (data.sessionId) {
          if (!logsBySession[data.sessionId])
            logsBySession[data.sessionId] = [];
          logsBySession[data.sessionId].push(data);
        }
      });

      const groupedByClient: Record<
        string,
        { sessions: WorkoutSession[]; weights: number[] }
      > = {};
      allSessions.forEach((s) => {
        if (!s.clientId) return;
        if (!groupedByClient[s.clientId]) {
          groupedByClient[s.clientId] = { sessions: [], weights: [] };
        }
        groupedByClient[s.clientId].sessions.push(s);

        const sLogs = logsBySession[s.id || ""] || [];
        sLogs.forEach((log) => {
          const w = parseFloat(log.weight);
          if (!isNaN(w) && w > 0) {
            groupedByClient[s.clientId!].weights.push(w);
          }
        });
      });

      const progressData = Object.entries(groupedByClient).map(
        ([cId, data]) => {
          const clientObj = clients.find((c) => c.id === cId);
          const name = clientObj
            ? `${clientObj.firstName} ${clientObj.lastName}`
            : "Unknown Client";
          const studioObj = studios.find(
            (std) => std.id === clientObj?.homeStudioId,
          );

          const sessionsCount = data.sessions.length;
          const totalWeight = data.weights.reduce((sum, w) => sum + w, 0);
          const avgWeight =
            data.weights.length > 0
              ? (totalWeight / data.weights.length).toFixed(1)
              : "0";

          return {
            "Client ID": cId,
            "Client Name": name,
            "Home Studio": studioObj?.name || "Unknown Studio",
            "Sessions Completed": sessionsCount,
            "Average Exercise Resistance (lbs)": avgWeight,
            "Logs Recorded": data.weights.length,
          };
        },
      );

      const filename = `client_progress_${exportStartDate}_to_${exportEndDate}.csv`;
      const csv = Papa.unparse(progressData);
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.setAttribute("href", url);
      link.setAttribute("download", filename);
      link.style.visibility = "hidden";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      toastSuccess(
        `Client Progress CSV (${filename}) downloaded successfully.`,
      );
    } catch (err: any) {
      console.error(err);
      toastError("Failed to export client progress: " + err.message);
    } finally {
      setIsExportingProgress(false);
    }
  };

  const visibleTrainers = (() => {
    if (!isAdmin) {
      return trainers.filter((t) => t.id === authTrainer?.id);
    }
    if (activeStudioId) {
      return trainers.filter(
        (t) =>
          t.primaryHomeStudioId === activeStudioId ||
          (t.accessibleStudioIds || []).includes(activeStudioId) ||
          (t.activeGuestStudioIds || []).includes(activeStudioId),
      );
    }
    return trainers;
  })();

  const filteredTrainers = visibleTrainers.filter((t) =>
    t.fullName.toLowerCase().includes(trainerSearchQuery.toLowerCase()),
  );

  const currentSelectedTrainer =
    trainers.find((t) => t.id === selectedTrainer?.id) ||
    (filteredTrainers.length > 0 ? filteredTrainers[0] : null);

  const handleAllTrainersSync = async () => {
    if (!activeStudio?.mindbodySiteId) {
      toastError("Mindbody Site ID must be configured for this studio.");
      return;
    }
    setIsSyncingAll(true);
    try {
      const { syncMindbodySchedules } =
        await import("../lib/mindbody-api-sync");
      const result = await syncMindbodySchedules(
        activeStudio.mindbodySiteId,
        trainers,
        clients,
        studios,
        null,
      );
      if (result.errors.length > 0) {
        toastError(`Sync completed with errors: ${result.errors[0]}`);
      } else {
        toastSuccess(
          `Sync completed. Added: ${result.added}, Updated: ${result.updated}`,
        );
      }
    } catch (err: any) {
      toastError("Mass sync failed: " + err.message);
    } finally {
      setIsSyncingAll(false);
    }
  };

  const handleTrainerSync = async (trainerId: string) => {
    if (!activeStudio?.mindbodySiteId) {
      toastError("Mindbody Site ID must be configured for this studio.");
      return;
    }
    setSyncingTrainerId(trainerId);
    try {
      const { syncMindbodySchedules } =
        await import("../lib/mindbody-api-sync");
      const result = await syncMindbodySchedules(
        activeStudio.mindbodySiteId,
        trainers,
        clients,
        studios,
        trainerId,
      );
      if (result.errors.length > 0) {
        toastError(`Sync completed with errors: ${result.errors[0]}`);
      } else {
        toastSuccess(
          `Trainer sync completed. Added: ${result.added}, Updated: ${result.updated}`,
        );
      }
    } catch (err: any) {
      toastError("Sync failed: " + err.message);
    } finally {
      setSyncingTrainerId(null);
    }
  };

  const handleUpdateHomeStudio = async (
    trainerId: string,
    studioId: string,
  ) => {
    try {
      await updateDoc(doc(db, "trainers", trainerId), {
        primaryHomeStudioId: studioId,
        updatedAt: serverTimestamp(),
      });
      toastSuccess("Trainer home studio updated.");
    } catch (err: any) {
      toastError("Failed to update home studio: " + err.message);
    }
  };

  const handleToggleAccessibleStudio = async (
    trainer: Trainer,
    studioId: string,
    isAccessible: boolean,
  ) => {
    try {
      if (!trainer.id) {
        throw new DocumentIdMissingError("trainers", OperationType.UPDATE);
      }
      const current = trainer.accessibleStudioIds || [];
      const updated = isAccessible
        ? [...new Set([...current, studioId])]
        : current.filter((id) => id !== studioId);

      await updateDoc(doc(db, "trainers", trainer.id), {
        accessibleStudioIds: updated,
        updatedAt: serverTimestamp(),
      });
      toastSuccess("Trainer studio access updated.");
    } catch (err: any) {
      toastError("Failed to update accessible studios: " + err.message);
    }
  };

  const handleUpdateStaffId = async (
    trainerId: string,
    staffId: string | null,
  ) => {
    setIsUpdatingStaffId(true);
    try {
      await updateDoc(doc(db, "trainers", trainerId), {
        mindbodyStaffId: staffId || null,
        updatedAt: serverTimestamp(),
      });
      setEditingStaffId(null);
      setNewStaffId("");
      toastSuccess("Trainer Mindbody Staff ID updated successfully.");
    } catch (err: any) {
      toastError("Failed to update Staff ID: " + err.message);
    } finally {
      setIsUpdatingStaffId(false);
    }
  };

  const [isImporting, setIsImporting] = useState(false);
  const [isLegacyImporting, setIsLegacyImporting] = useState(false);
  const [importStats, setImportStats] = useState<{
    success: number;
    failed: number;
  } | null>(null);
  const [legacyStats, setLegacyStats] = useState<{
    clients: number;
    sessions: number;
    logs: number;
    failed: number;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [legacyError, setLegacyError] = useState<string | null>(null);

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsImporting(true);
    setError(null);
    setImportStats(null);

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: async (results) => {
        try {
          const data = results.data as any[];
          const importId = `import_${Date.now()}`;

          const [clientsSnap] = await Promise.all([
            getDocs(collection(db, "clients")),
          ]);

          const clientMap: Record<string, string> = {};
          clientsSnap.forEach((d) => {
            const c = d.data() as Client;
            const fullName = `${c.firstName || ""} ${c.lastName || ""}`;
            clientMap[normalizeName(fullName)] = d.id!;
            clientMap[cleanAlphanumeric(fullName)] = d.id!;
            if (c.mindbody_name) {
              clientMap[normalizeName(c.mindbody_name)] = d.id!;
              clientMap[cleanAlphanumeric(c.mindbody_name)] = d.id!;
            }
          });

          let successCount = 0;
          let failedCount = 0;

          let batch = writeBatch(db);
          let opCount = 0;

          for (const row of data) {
            const clientName =
              row["Client Name"] || row["Client"] || row["Student"] || "";
            const mbTrainerName =
              row["Trainer"] || row["Staff"] || row["Teacher"] || "";
            const startTimeStr = row["Start Time"] || row["Start"] || "";
            const endTimeStr = row["End Time"] || row["End"] || "";
            const status = row["Status"] || "Scheduled";
            const serviceName =
              row["Service"] || row["Class"] || "Personal Training";

            if (!clientName || !startTimeStr) {
              failedCount++;
              continue;
            }

            const startTime = new Date(startTimeStr.replace(" ", "T"));
            const endTime = endTimeStr
              ? new Date(endTimeStr.replace(" ", "T"))
              : new Date(startTime.getTime() + 60 * 60 * 1000);

            if (isNaN(startTime.getTime())) {
              failedCount++;
              continue;
            }

            const clientId =
              clientMap[normalizeName(clientName)] ||
              clientMap[cleanAlphanumeric(clientName)];
            const matchingTrainer = findMatchingTrainer(
              mbTrainerName,
              trainers,
            );
            const trainerId = matchingTrainer?.id || null;

            const docRef = doc(collection(db, "schedules"));
            batch.set(docRef, {
              clientName,
              trainerName: mbTrainerName,
              clientId: clientId || null,
              trainerId,
              startTime: Timestamp.fromDate(startTime),
              endTime: Timestamp.fromDate(endTime),
              status,
              serviceName,
              source: "MindBody",
              importId,
              createdAt: serverTimestamp(),
            });
            successCount++;
            opCount++;

            if (opCount >= 400) {
              await batch.commit();
              batch = writeBatch(db);
              opCount = 0;
            }
          }

          if (opCount > 0) {
            await batch.commit();
          }

          setImportStats({ success: successCount, failed: failedCount });
        } catch (err: any) {
          console.error("Import error:", err);
          setError(err.message || "Failed to import schedule");
        } finally {
          setIsImporting(false);
          event.target.value = "";
        }
      },
      error: (err) => {
        setError(err.message);
        setIsImporting(false);
        event.target.value = "";
      },
    });
  };

  const handleLegacyFileUpload = (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsLegacyImporting(true);
    setLegacyError(null);
    setLegacyStats(null);

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: async (results) => {
        try {
          const data = results.data as any[];
          let clientCount = 0;
          let sessionCount = 0;
          let logCount = 0;
          let failedCount = 0;

          const clientCache: Record<string, string> = {};
          const machineCache: Record<string, string> = {};

          const machinesSnap = await getDocs(collection(db, "machines"));
          machinesSnap.forEach((doc) => {
            const m = doc.data() as Machine;
            machineCache[m.name.toLowerCase()] = doc.id;
            if (m.fullName) machineCache[m.fullName.toLowerCase()] = doc.id;
          });

          const clientsSnap = await getDocs(collection(db, "clients"));
          clientsSnap.forEach((doc) => {
            const c = doc.data() as Client;
            clientCache[`${c.firstName} ${c.lastName}`.toLowerCase()] = doc.id;
          });

          let batch = writeBatch(db);
          let opCount = 0;
          const localSessionCache: Record<string, string> = {};

          for (const row of data) {
            const firstName = row["First Name"] || row["FirstName"] || "";
            const lastName = row["Last Name"] || row["LastName"] || "";
            const fullName =
              row["Client Name"] ||
              row["Client"] ||
              row["Full Name"] ||
              `${firstName} ${lastName}`.trim();

            const machineName =
              row["Machine"] || row["Exercise"] || row["Equipment"] || "";
            const weight = row["Weight"] || row["Resistance"] || "";
            const reps = row["Reps"] || row["Repetitions"] || "";
            const dateStr =
              row["Date"] || row["Timestamp"] || row["Workout Date"] || "";
            const trainerInitials = (
              row["Trainer"] ||
              row["Staff"] ||
              row["Initials"] ||
              "FM"
            ).toUpperCase();
            const notes = row["Notes"] || row["Comments"] || "";
            const settingsStr =
              row["Settings"] || row["Machine Settings"] || "";

            if (!fullName || !machineName || !dateStr) {
              failedCount++;
              continue;
            }

            let clientId = clientCache[fullName.toLowerCase()];
            if (!clientId) {
              const nameParts = fullName.split(" ");
              const fName = nameParts[0] || "Imported";
              const lName = nameParts.slice(1).join(" ") || "Client";

              const clientRef = doc(collection(db, "clients"));
              clientId = clientRef.id;

              batch.set(clientRef, {
                firstName: fName,
                lastName: lName,
                gender: "Other",
                height: row["Height"] || "N/A",
                isActive: true,
                remainingSessions: 0,
                consultationCompleted: true,
                globalNotes: row["Client Notes"] || "",
                createdAt: serverTimestamp(),
              });
              clientCache[fullName.toLowerCase()] = clientId;
              clientCount++;
              opCount++;
            }

            const machineId = machineCache[machineName.toLowerCase()];
            if (!machineId) {
              failedCount++;
              continue;
            }

            const sessionDate = new Date(dateStr);
            if (isNaN(sessionDate.getTime())) {
              failedCount++;
              continue;
            }

            // High Performance Cache for Session Retrieval within loop
            let sessionId: string;
            const sessionCacheKey = `${clientId}_${sessionDate.toISOString().split("T")[0]}`;

            if (localSessionCache[sessionCacheKey]) {
              sessionId = localSessionCache[sessionCacheKey];
            } else {
              const q = query(
                collection(db, "sessions"),
                where("clientId", "==", clientId),
                where("date", "==", sessionDate.toISOString().split("T")[0]),
              );
              const existingSessions = await getDocs(q);

              if (existingSessions.empty) {
                const sessionRef = doc(collection(db, "sessions"));
                batch.set(sessionRef, {
                  clientId,
                  sessionType: "Standard",
                  sessionNumber: 0,
                  date: sessionDate.toISOString().split("T")[0],
                  trainerInitials,
                  status: "Completed",
                  notes: row["Session Notes"] || "",
                  createdAt: Timestamp.fromDate(sessionDate),
                });
                sessionId = sessionRef.id;
                sessionCount++;
                opCount++;
              } else {
                sessionId = existingSessions.docs[0].id;
              }
              localSessionCache[sessionCacheKey] = sessionId;
            }

            const logRef = doc(collection(db, "exerciseLogs"));
            batch.set(logRef, {
              sessionId,
              clientId,
              machineId,
              weight,
              reps,
              notes,
              machineSettings: settingsStr
                ? parseMachineSettings(settingsStr)
                : {},
              createdAt: Timestamp.fromDate(sessionDate),
              studioId:
                activeStudioId ||
                authTrainer?.primaryHomeStudioId ||
                "unassigned",
            });
            logCount++;
            opCount++;

            if (settingsStr) {
              const settings = parseMachineSettings(settingsStr);
              const settingsRef = doc(
                db,
                "clientMachineSettings",
                `${clientId}_${machineId}`,
              );

              batch.set(
                settingsRef,
                {
                  clientId,
                  machineId,
                  settings,
                  updatedBy: trainerInitials,
                  updatedAt: Timestamp.fromDate(sessionDate),
                  studioId:
                    activeStudioId ||
                    authTrainer?.primaryHomeStudioId ||
                    "unassigned",
                },
                { merge: true },
              );
              opCount++;
            }

            if (opCount >= 400) {
              await batch.commit();
              batch = writeBatch(db);
              opCount = 0;
            }
          }

          if (opCount > 0) {
            await batch.commit();
          }

          setLegacyStats({
            clients: clientCount,
            sessions: sessionCount,
            logs: logCount,
            failed: failedCount,
          });
        } catch (err: any) {
          console.error("Legacy import error:", err);
          setLegacyError(err.message || "Failed to import legacy data");
        } finally {
          setIsLegacyImporting(false);
          event.target.value = "";
        }
      },
      error: (err) => {
        setLegacyError(err.message);
        setIsLegacyImporting(false);
        event.target.value = "";
      },
    });
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="max-w-6xl mx-auto w-full overflow-x-hidden px-2.5 sm:px-8 py-4 sm:py-8"
    >
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6 sm:mb-8">
        <div className="flex flex-col gap-1 w-full sm:w-auto">
          <h2 className="text-2xl sm:text-3xl font-black tracking-tight uppercase italic text-foreground">
            Hub Settings
          </h2>
          <p className="text-muted-foreground uppercase text-[9px] sm:text-[11px] font-black tracking-widest leading-relaxed">
            Manage your schedule sync and standard studio settings.
          </p>
        </div>

        <div className="flex gap-1.5 w-full sm:w-auto sm:ml-auto">
          {setView && (isAdmin || checkIsStudioLeader(authTrainer)) && (
            <Button
              onClick={() => setView("integrations")}
              className="rounded-xl sm:rounded-2xl border border-indigo-500/30 bg-indigo-500/10 text-indigo-500 hover:text-indigo-400 hover:bg-indigo-500/20 h-8 sm:h-12 px-2.5 sm:px-6 font-black uppercase text-[8px] sm:text-[11px] tracking-widest shadow-sm transition-colors flex-1 sm:flex-initial justify-center"
            >
              <Webhook className="w-3 h-3 sm:w-4 sm:h-4 mr-1 sm:mr-2" />
              Integrations
            </Button>
          )}
          {onLogout && (
            <Button
              variant="outline"
              onClick={onLogout}
              className="rounded-xl sm:rounded-2xl border-border bg-card text-muted-foreground hover:text-foreground hover:bg-muted h-8 sm:h-12 px-2.5 sm:px-6 font-black uppercase text-[8px] sm:text-[11px] tracking-widest flex-1 sm:flex-initial justify-center"
            >
              <LogOut className="w-3 h-3 sm:w-4 sm:h-4 mr-1 sm:mr-2" />
              Switch Trainer
            </Button>
          )}
        </div>
      </div>

      <div className="flex flex-col lg:flex-row gap-6 sm:gap-8">
        <div className="w-full lg:w-64 shrink-0 flex flex-col gap-2">
          {[
            {
              id: "equipment_settings",
              label: "Hardware Settings",
              icon: MonitorPlay,
            },
            { id: "app_settings", label: "App Settings", icon: Settings },
            { id: "team_management", label: "Team Management", icon: UserCog },
            { id: "data_exports", label: "Data & Reports", icon: Download },
            { id: "notifications", label: "Alerts & Comms", icon: Bell },
          ]
            .filter((tab) => {
              if (
                tab.id === "app_settings" ||
                tab.id === "team_management" ||
                tab.id === "data_exports" ||
                tab.id === "notifications"
              ) {
                return (
                  isAdmin ||
                  checkIsOwner(authTrainer) ||
                  checkIsStudioLeader(authTrainer)
                );
              }
              return true;
            })
            .map((tab) => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as any)}
                  className={cn(
                    "flex items-center gap-2.5 sm:gap-3 px-3.5 sm:px-4 py-3 sm:py-4 rounded-xl sm:rounded-2xl transition-all border text-left font-bold uppercase text-[10px] sm:text-[11px] tracking-widest",
                    activeTab === tab.id
                      ? "bg-cta/10 border-cta text-slate-900 dark:text-white shadow-sm"
                      : "bg-background border-border text-muted-foreground hover:bg-card hover:text-foreground",
                  )}
                >
                  <Icon
                    className={cn(
                      "w-4 h-4 sm:w-5 sm:h-5",
                      activeTab === tab.id ? "text-cta" : "opacity-50",
                    )}
                  />
                  {tab.label}
                </button>
              );
            })}
        </div>

        {/* Content Area */}
        <div className="flex-1 space-y-6">
          {activeTab === "team_management" && (
            <Card className="border border-border bg-card shadow-2xl dark:shadow-none rounded-[32px] overflow-hidden">
              <CardHeader className="bg-background pb-8 border-b border-border">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-2xl bg-muted flex items-center justify-center border border-border shadow-inner">
                      <UserCog className="w-6 h-6 text-cta" />
                    </div>
                    <div>
                      <CardTitle className="text-2xl font-black text-foreground italic tracking-tight">
                        Team Management
                      </CardTitle>
                      <CardDescription className="text-muted-foreground font-medium uppercase text-[11px] tracking-widest">
                        Manage individual Schedule Sync URLs.
                      </CardDescription>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {isAdmin && (
                      <Button
                        onClick={() => setIsCreateModalOpen(true)}
                        className="rounded-xl bg-cta text-white h-10 px-4 font-black uppercase text-[11px] tracking-widest gap-2 shadow-sm dark:shadow-none"
                      >
                        <Plus className="w-4 h-4" />
                        Add New
                      </Button>
                    )}
                    {isAdmin && onReorderTrainers && (
                      <Button
                        variant="outline"
                        onClick={onReorderTrainers}
                        className="rounded-xl border-border text-muted-foreground bg-card hover:text-foreground hover:bg-muted h-10 px-4 font-black uppercase text-[11px] tracking-widest gap-2"
                      >
                        <RefreshCcw className="w-3 h-3" />
                        Sort
                      </Button>
                    )}
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-8">
                <div className="space-y-6">
                  {visibleTrainers.length === 0 ? (
                    <p className="text-center py-8 text-muted-foreground font-medium italic">
                      No matching trainer records found.
                    </p>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                      {/* Left Column: Master List */}
                      <div className="space-y-4">
                        <Label className="text-xs font-black uppercase tracking-widest text-muted-foreground">
                          Roster
                        </Label>
                        <div className="relative">
                          <Input
                            type="search"
                            placeholder="Search trainers..."
                            value={trainerSearchQuery}
                            onChange={(e) =>
                              setTrainerSearchQuery(e.target.value)
                            }
                            className="bg-card border-border text-foreground pl-9 h-10 rounded-xl text-xs font-bold"
                          />
                          <User className="w-4 h-4 text-muted-foreground absolute left-3 top-3" />
                        </div>

                        <div className="space-y-2 max-h-125 overflow-y-auto pr-1">
                          {filteredTrainers.length === 0 ? (
                            <p className="text-center py-6 text-muted-foreground font-medium italic text-xs">
                              No matching trainers.
                            </p>
                          ) : (
                            filteredTrainers.map((t) => {
                              const isSelected =
                                currentSelectedTrainer?.id === t.id;
                              return (
                                <div
                                  key={t.id}
                                  onClick={() => setSelectedTrainer(t)}
                                  className={cn(
                                    "p-4 rounded-2xl cursor-pointer transition-all border flex items-center justify-between text-left group",
                                    isSelected
                                      ? "bg-muted border-l-4 border-l-cta border-border shadow-sm"
                                      : "bg-background hover:bg-muted/50 border-border",
                                  )}
                                >
                                  <div className="flex items-center gap-3 min-w-0">
                                    <div
                                      className={cn(
                                        "w-10 h-10 rounded-xl flex items-center justify-center font-black text-xs italic shrink-0",
                                        checkIsOwner(t)
                                          ? "bg-amber/10  text-amber border border-amber/30 "
                                          : "bg-card text-muted-foreground  border border-border ",
                                      )}
                                    >
                                      {t.initials}
                                    </div>
                                    <div className="min-w-0">
                                      <p className="text-xs font-black text-foreground uppercase italic truncate">
                                        {t.fullName}
                                      </p>
                                      <p className="text-[11px] font-bold uppercase tracking-widest text-cta truncate mt-0.5">
                                        {checkIsOwner(t)
                                          ? "System Admin"
                                          : ROLE_LABELS[t.role] ||
                                            "Performance Trainer"}
                                      </p>
                                    </div>
                                  </div>

                                  {isAdmin && (
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setTrainerToDelete(t);
                                      }}
                                      className="p-1 px-2 text-muted-foreground hover:text-red hover:bg-red/10 rounded-lg transition-all opacity-0 group-hover:opacity-100 shrink-0"
                                      title="Delete Trainer"
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                  )}
                                </div>
                              );
                            })
                          )}
                        </div>
                      </div>

                      {/* Right Column: Detail Panel */}
                      <div className="md:col-span-2">
                        {currentSelectedTrainer ? (
                          <div className="p-6 bg-background border border-border rounded-[24px] space-y-6">
                            {/* Profile Detail Header */}
                            <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4 pb-6 border-b border-border">
                              <div className="flex items-center gap-4 min-w-0">
                                <div
                                  className={cn(
                                    "w-14 h-14 rounded-2xl flex items-center justify-center font-black text-xl italic shrink-0",
                                    checkIsOwner(currentSelectedTrainer)
                                      ? "bg-amber/10  text-amber border border-amber/30 "
                                      : "bg-card text-muted-foreground  border border-border ",
                                  )}
                                >
                                  {currentSelectedTrainer.initials}
                                </div>
                                <div className="min-w-0">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <h3 className="text-lg font-black text-foreground uppercase italic leading-none truncate">
                                      {currentSelectedTrainer.fullName}
                                    </h3>
                                    {checkIsOwner(currentSelectedTrainer) && (
                                      <span className="bg-amber/10 text-amber border border-amber/30 px-1.5 py-0.5 rounded text-[11px] font-black uppercase shrink-0">
                                        Owner
                                      </span>
                                    )}
                                  </div>
                                  <p className="text-[11px] font-bold uppercase tracking-widest text-cta leading-none mt-2 truncate">
                                    {checkIsOwner(currentSelectedTrainer)
                                      ? "System Admin"
                                      : ROLE_LABELS[
                                          currentSelectedTrainer.role
                                        ] || "Performance Trainer"}
                                  </p>
                                </div>
                              </div>

                              <div className="flex items-center justify-between p-3 px-4 bg-card rounded-xl border border-border shrink-0 self-start xl:self-auto max-w-full">
                                <Label className="text-xs font-bold text-muted-foreground cursor-pointer mr-3 whitespace-nowrap">
                                  Show on Hub Calendar
                                </Label>
                                <Switch
                                  checked={
                                    currentSelectedTrainer.isVisibleOnCalendar !==
                                    false
                                  }
                                  onCheckedChange={() => {
                                    if (!currentSelectedTrainer.id) return;
                                    handleToggleVisibility(
                                      currentSelectedTrainer.id,
                                      currentSelectedTrainer.isVisibleOnCalendar ??
                                        true,
                                    );
                                  }}
                                  className="data-[state=checked]:bg-[#10B981] data-[state=unchecked]:bg-muted-foreground shrink-0"
                                />
                              </div>
                            </div>

                            {/* Home Studio Assignment */}
                            <div className="flex flex-col gap-2 p-4 bg-card rounded-2xl border border-border">
                              <Label className="text-[11px] font-black uppercase text-muted-foreground tracking-widest leading-none">
                                Primary Home Studio
                              </Label>
                              <Select
                                value={
                                  currentSelectedTrainer.primaryHomeStudioId ||
                                  "unassigned"
                                }
                                onValueChange={(val) => {
                                  if (!currentSelectedTrainer.id) return;
                                  handleUpdateHomeStudio(
                                    currentSelectedTrainer.id,
                                    val,
                                  );
                                }}
                              >
                                <SelectTrigger className="h-10 bg-card border-border text-xs text-foreground font-bold">
                                  <SelectValue placeholder="Select Studio">
                                    {studios.find(
                                      (s) =>
                                        s.id ===
                                        currentSelectedTrainer.primaryHomeStudioId,
                                    )?.name ||
                                      (currentSelectedTrainer.primaryHomeStudioId ===
                                      "unassigned"
                                        ? "Unassigned"
                                        : "Select Studio")}
                                  </SelectValue>
                                </SelectTrigger>
                                <SelectContent className="bg-card border-border text-foreground">
                                  <SelectItem value="unassigned">
                                    Unassigned
                                  </SelectItem>
                                  {studios.map((s) => (
                                    <SelectItem key={s.id} value={s.id}>
                                      {s.name}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>

                            {/* Accessible Studios (Cross-Training) */}
                            <div className="flex flex-col gap-3 p-4 bg-card rounded-2xl border border-border">
                              <Label className="text-[11px] font-black uppercase text-muted-foreground tracking-widest leading-none">
                                Accessible Studios (Cross-Training)
                              </Label>
                              <div className="flex flex-wrap gap-2">
                                {(
                                  currentSelectedTrainer.accessibleStudioIds ||
                                  []
                                ).length === 0 ? (
                                  <span className="text-xs text-muted-foreground italic">
                                    No secondary locations assigned
                                  </span>
                                ) : (
                                  (
                                    currentSelectedTrainer.accessibleStudioIds ||
                                    []
                                  ).map((studioId) => {
                                    const s = studios.find(
                                      (st) => st.id === studioId,
                                    );
                                    if (!s) return null;
                                    return (
                                      <div
                                        key={studioId}
                                        className="flex items-center gap-1.5 pl-3 pr-1 py-1.5 rounded-xl bg-cta/10 border border-cta/20 text-brand font-bold text-xs"
                                      >
                                        <span>{s.name}</span>
                                        <button
                                          type="button"
                                          onClick={() =>
                                            handleToggleAccessibleStudio(
                                              currentSelectedTrainer,
                                              studioId,
                                              false,
                                            )
                                          }
                                          className="p-1 text-cta hover:text-cta-strong hover:bg-cta/20 rounded-lg transition-colors"
                                        >
                                          <Plus className="w-3.5 h-3.5 rotate-45" />
                                        </button>
                                      </div>
                                    );
                                  })
                                )}
                              </div>

                              {studios.filter(
                                (s) =>
                                  !(
                                    currentSelectedTrainer.accessibleStudioIds ||
                                    []
                                  ).includes(s.id!),
                              ).length > 0 && (
                                <div className="flex items-center gap-2 max-w-xs mt-1">
                                  <Select
                                    value=""
                                    onValueChange={(val) => {
                                      if (val) {
                                        handleToggleAccessibleStudio(
                                          currentSelectedTrainer,
                                          val,
                                          true,
                                        );
                                      }
                                    }}
                                  >
                                    <SelectTrigger className="h-9 bg-card border-border text-xs text-foreground font-bold">
                                      <SelectValue placeholder="+ Grant Studio Access" />
                                    </SelectTrigger>
                                    <SelectContent className="bg-card border-border text-foreground">
                                      {studios
                                        .filter(
                                          (s) =>
                                            !(
                                              currentSelectedTrainer.accessibleStudioIds ||
                                              []
                                            ).includes(s.id!),
                                        )
                                        .map((s) => (
                                          <SelectItem key={s.id} value={s.id!}>
                                            {s.name}
                                          </SelectItem>
                                        ))}
                                    </SelectContent>
                                  </Select>
                                </div>
                              )}
                              <p className="text-[11px] text-muted-foreground font-medium leading-relaxed">
                                Toggle secondary locations this trainer teaches
                                at so their scheduled bookings propagate across
                                those live floor calendars.
                              </p>
                            </div>

                            {/* MindBody integrations */}
                            <div className="pt-4 border-t border-border">
                              <div className="flex flex-col gap-3">
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center gap-2 text-muted-foreground">
                                    <RefreshCcw className="w-3.5 h-3.5 text-[#F06C22]" />
                                    <h4 className="font-bold uppercase text-[11px] tracking-widest leading-none">
                                      Mindbody API Sync Connection
                                    </h4>
                                  </div>
                                  {currentSelectedTrainer.mindbodyStaffId && (
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      disabled={
                                        syncingTrainerId ===
                                        currentSelectedTrainer.id
                                      }
                                      onClick={() => {
                                        if (!currentSelectedTrainer.id) return;
                                        handleTrainerSync(
                                          currentSelectedTrainer.id,
                                        );
                                      }}
                                      className="h-7 text-[11px] flex items-center px-3 font-black uppercase text-[#F06C22] hover:text-[#F06C22]/90 hover:bg-[#F06C22]/10 rounded-lg border border-[#F06C22]/30"
                                    >
                                      {syncingTrainerId ===
                                      currentSelectedTrainer.id ? (
                                        <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />
                                      ) : null}
                                      Sync Schedule
                                    </Button>
                                  )}
                                </div>

                                {editingStaffId ===
                                currentSelectedTrainer.id ? (
                                  <div className="flex flex-col gap-2">
                                    <Input
                                      placeholder="Mindbody Staff ID (e.g. 100000123)"
                                      value={newStaffId}
                                      onChange={(e) =>
                                        setNewStaffId(
                                          e.target.value.replace(/[^0-9]/g, ""),
                                        )
                                      }
                                      className="h-10 rounded-xl bg-card border-border text-xs text-foreground px-3 focus-visible:ring-[#F06C22]"
                                    />
                                    <div className="flex items-center justify-end gap-1.5">
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => setEditingStaffId(null)}
                                        className="h-8 px-3 font-bold uppercase text-[11px] rounded-lg tracking-widest text-muted-foreground"
                                      >
                                        Cancel
                                      </Button>
                                      <Button
                                        size="sm"
                                        onClick={() => {
                                          if (!currentSelectedTrainer.id)
                                            return;
                                          handleUpdateStaffId(
                                            currentSelectedTrainer.id,
                                            newStaffId,
                                          );
                                        }}
                                        disabled={isUpdatingStaffId}
                                        className="bg-[#F06C22] hover:bg-[#F06C22]/90 text-white h-8 px-4 rounded-lg font-black uppercase text-[11px] tracking-widest"
                                      >
                                        {isUpdatingStaffId ? (
                                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                        ) : (
                                          "Save"
                                        )}
                                      </Button>
                                    </div>
                                  </div>
                                ) : (
                                  <div className="flex items-center justify-between gap-2 overflow-hidden group/link bg-card p-3 rounded-xl border border-border">
                                    {currentSelectedTrainer.mindbodyStaffId ? (
                                      <>
                                        <Users className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                                        <span className="text-[11px] text-muted-foreground font-medium truncate flex-1 font-mono">
                                          Mindbody Staff ID:{" "}
                                          {
                                            currentSelectedTrainer.mindbodyStaffId
                                          }
                                        </span>
                                        <Button
                                          variant="ghost"
                                          size="sm"
                                          onClick={() => {
                                            if (!currentSelectedTrainer.id)
                                              return;
                                            setEditingStaffId(
                                              currentSelectedTrainer.id,
                                            );
                                            setNewStaffId(
                                              currentSelectedTrainer.mindbodyStaffId ||
                                                "",
                                            );
                                          }}
                                          className="h-7 w-7 p-0 rounded-lg shrink-0 opacity-0 group-hover/link:opacity-100 border border-border text-muted-foreground hover:text-foreground hover:bg-muted"
                                        >
                                          <RefreshCcw className="w-3.5 h-3.5" />
                                        </Button>
                                      </>
                                    ) : (
                                      <>
                                        <span className="text-[11px] text-muted-foreground font-medium italic select-none">
                                          No Mindbody Staff ID linked
                                        </span>
                                        <Button
                                          variant="outline"
                                          size="sm"
                                          onClick={() => {
                                            if (!currentSelectedTrainer.id)
                                              return;
                                            setEditingStaffId(
                                              currentSelectedTrainer.id,
                                            );
                                            setNewStaffId("");
                                          }}
                                          className="h-8 border-border bg-card text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg px-4 font-black uppercase text-[11px] tracking-widest"
                                        >
                                          Link Staff ID
                                        </Button>
                                      </>
                                    )}
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        ) : (
                          <div className="h-full flex flex-col items-center justify-center py-20 px-6 border border-dashed border-border rounded-[24px] text-center bg-muted/50">
                            <User className="w-12 h-12 text-muted-foreground mb-4 animate-pulse" />
                            <h4 className="font-bold text-foreground">
                              No Trainer Selected
                            </h4>
                            <p className="text-xs text-muted-foreground mt-1 max-w-xs">
                              Select a trainer from the list to synchronize
                              their scheduling feeds and control accessible home
                              studios.
                            </p>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          {activeTab === "equipment_settings" &&
            (() => {
              const isSuperUser = isAdmin || checkIsFounder(authTrainer);
              const assignedStudioIds = !isSuperUser
                ? [
                    authTrainer?.primaryHomeStudioId,
                    ...(authTrainer?.accessibleStudioIds || []),
                  ].filter(Boolean)
                : [];
              const filteredStudiosForAnnouncement = studios.filter(
                (s) =>
                  isSuperUser ||
                  (assignedStudioIds as string[]).includes(s.id!),
              );
              const defaultStudioId = isSuperUser
                ? "all"
                : filteredStudiosForAnnouncement[0]?.id || "";
              const currentAudienceValue =
                newAnnouncement.studioId === "all" && !isSuperUser
                  ? defaultStudioId
                  : newAnnouncement.studioId || defaultStudioId;

              return (
                <div className="space-y-8 animate-fade-in">
                  {/* Step 1: Dashboard Grid Layout */}
                  <div className="hidden">
                    {/* Step 2: Column 1 - Operations & Telemetry */}
                    <div className="space-y-6">
                      {/* Live Floor Status Card */}
                      <Card className="border border-border bg-card shadow-sm rounded-[32px] overflow-hidden">
                        <CardHeader className="bg-background pb-6 border-b border-border">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-4 flex-wrap">
                              <div className="w-12 h-12 rounded-2xl bg-green/10 flex items-center justify-center border border-green/30 shadow-inner">
                                <MonitorPlay className="w-6 h-6 text-green" />
                              </div>
                              <div>
                                <CardTitle className="text-2xl font-black text-foreground italic tracking-tight">
                                  Live Floor Status
                                </CardTitle>
                                <CardDescription className="text-muted-foreground font-medium uppercase text-[11px] tracking-widest">
                                  Active sessions and concurrency monitoring.
                                </CardDescription>
                              </div>
                            </div>
                            <div className="px-4 py-2 bg-card rounded-xl border border-border shrink-0">
                              <span className="text-[11px] font-black uppercase text-green tracking-widest animate-pulse">
                                ● System Live
                              </span>
                            </div>
                          </div>
                        </CardHeader>
                        <CardContent className="p-8 space-y-6">
                          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <div className="p-5 bg-green/10 rounded-2xl border border-green/30">
                              <p className="text-[11px] font-black uppercase tracking-widest text-green mb-1 leading-none">
                                Total Active
                              </p>
                              <p className="text-3xl font-black text-foreground italic mt-2 leading-none">
                                {
                                  sessions.filter(
                                    (s) =>
                                      s.status === "In-Progress" &&
                                      isSessionValid(s),
                                  ).length
                                }
                              </p>
                            </div>
                            <div className="p-5 bg-amber/10 rounded-2xl border border-amber/30">
                              <p className="text-[11px] font-black uppercase tracking-widest text-amber mb-1 leading-none">
                                Stale Sessions
                              </p>
                              <p className="text-3xl font-black text-amber italic mt-2 leading-none">
                                {
                                  sessions.filter(
                                    (s) =>
                                      s.status === "In-Progress" &&
                                      !isSessionValid(s),
                                  ).length
                                }
                              </p>
                            </div>
                            <div className="p-5 bg-cta/10 rounded-2xl border border-cta/20">
                              <p className="text-[11px] font-black uppercase tracking-widest text-cta mb-1 leading-none">
                                Current Sync
                              </p>
                              <p className="text-[11px] font-bold text-foreground italic mt-2.5 leading-none flex items-center gap-1">
                                <Clock className="w-3.5 h-3.5 text-cta" />
                                {new Date().toLocaleTimeString([], {
                                  hour: "2-digit",
                                  minute: "2-digit",
                                })}
                              </p>
                            </div>
                          </div>

                          <div className="space-y-3">
                            <h3 className="text-xs font-black uppercase tracking-widest text-muted-foreground px-1">
                              Active Floor Feed
                            </h3>
                            <div className="space-y-2.5 max-h-75 overflow-y-auto pr-1">
                              {sessions
                                .filter((s) => s.status === "In-Progress")
                                .map((session) => {
                                  const isValid = isSessionValid(session);
                                  const client = clients.find(
                                    (c) => c.id === session.clientId,
                                  );
                                  return (
                                    <div
                                      key={session.id}
                                      className={cn(
                                        "p-3.5 rounded-2xl border transition-all flex items-center justify-between group",
                                        isValid
                                          ? "bg-card border-border"
                                          : "bg-background border-amber/20 opacity-70 grayscale",
                                      )}
                                    >
                                      <div className="flex items-center gap-3 min-w-0 flex-1">
                                        <div
                                          className={cn(
                                            "w-10 h-10 rounded-xl flex items-center justify-center font-black text-xs border shrink-0",
                                            isValid
                                              ? "bg-muted text-cta border-border"
                                              : "bg-amber/10 text-amber border-amber/30",
                                          )}
                                        >
                                          {client
                                            ? `${(client.firstName || "?")[0] || "?"}${(client.lastName || "")[0] || ""}`
                                            : "UN"}
                                        </div>
                                        <div className="min-w-0 flex-1">
                                          <div className="flex items-center gap-1.5 flex-wrap">
                                            <h4 className="font-bold text-foreground text-xs truncate max-w-37.5">
                                              {client
                                                ? `${client.firstName} ${client.lastName}`
                                                : "Unassigned Session"}
                                            </h4>
                                            {!isValid && (
                                              <span className="bg-amber/10 text-amber border border-amber/30 px-1 rounded-lg text-[7px] font-black uppercase">
                                                Abandoned
                                              </span>
                                            )}
                                          </div>
                                          <p className="text-[11px] text-muted-foreground font-bold uppercase tracking-wider flex items-center gap-1.5 mt-0.5 leading-none">
                                            <Users className="w-3 h-3" /> TR:{" "}
                                            {session.trainerInitials || "---"}
                                            <span className="text-muted-foreground">
                                              •
                                            </span>
                                            <Clock className="w-3 h-3" />{" "}
                                            {session.lastHeartbeatAt
                                              ? (
                                                  session.lastHeartbeatAt.toDate?.() ||
                                                  new Date(
                                                    session.lastHeartbeatAt,
                                                  )
                                                ).toLocaleTimeString([], {
                                                  hour: "2-digit",
                                                  minute: "2-digit",
                                                })
                                              : "Just Started"}
                                          </p>
                                        </div>
                                      </div>
                                      {!isValid && (
                                        <Button
                                          variant="ghost"
                                          size="sm"
                                          onClick={() =>
                                            setSessionToTerminate(session)
                                          }
                                          className="h-8 px-3 rounded-lg bg-amber/10 text-amber hover:bg-amber/20 font-black uppercase text-[11px] tracking-widest border border-amber/40 opacity-0 group-hover:opacity-100 duration-200 transition-opacity shrink-0"
                                        >
                                          Sweep
                                        </Button>
                                      )}
                                    </div>
                                  );
                                })}
                              {sessions.filter(
                                (s) => s.status === "In-Progress",
                              ).length === 0 && (
                                <div className="py-12 border border-border border-dashed rounded-2xl flex flex-col items-center justify-center text-muted-foreground italic text-xs">
                                  Floor is currently empty.
                                </div>
                              )}
                            </div>
                          </div>
                        </CardContent>
                      </Card>

                      {/* Studio Configuration Card */}
                      <Card className="border border-border bg-card shadow-sm rounded-[32px] overflow-hidden">
                        <CardHeader className="bg-background pb-6 border-b border-border">
                          <div className="flex items-center gap-4">
                            <div className="w-12 h-12 rounded-2xl bg-amber/10 flex items-center justify-center border border-amber/30 shadow-inner">
                              <Building2 className="w-6 h-6 text-amber" />
                            </div>
                            <div>
                              <CardTitle className="text-2xl font-black text-foreground italic tracking-tight">
                                Studio Configuration
                              </CardTitle>
                              <CardDescription className="text-muted-foreground font-medium uppercase text-[11px] tracking-widest">
                                Manage franchise locations.
                              </CardDescription>
                            </div>
                          </div>
                        </CardHeader>
                        <CardContent className="p-8 space-y-5">
                          <div className="space-y-4">
                            {studios.length > 0 ? (
                              <div className="border border-border rounded-2xl overflow-hidden divide-y divide-border/60 bg-card">
                                {studios.map((studio) => (
                                  <div
                                    key={studio.id}
                                    className="flex items-center justify-between p-4 px-5 hover:bg-muted/50 transition-colors"
                                  >
                                    <span className="text-xs font-black uppercase text-foreground tracking-wider font-mono">
                                      {studio.name}
                                    </span>
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      className="text-muted-foreground hover:text-red p-1 px-2 hover:bg-red/10 rounded-lg transition-all"
                                      onClick={() => setStudioToDelete(studio)}
                                    >
                                      <Trash2 className="w-4 h-4" />
                                    </Button>
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <div className="p-8 text-center text-muted-foreground text-sm italic bg-background rounded-2xl border border-border border-dashed">
                                No physical studios configured.
                              </div>
                            )}

                            <div className="flex items-center gap-2 p-1.5 bg-background border border-border rounded-xl max-w-md">
                              <Input
                                value={newStudioName}
                                onChange={(e) =>
                                  setNewStudioName(e.target.value)
                                }
                                placeholder="Studio location name (e.g. Solon, OH)"
                                className="h-9 bg-transparent border-0 focus-visible:ring-0 focus-visible:ring-offset-0 text-foreground font-medium text-xs placeholder:text-muted-foreground shadow-none"
                              />
                              <Button
                                onClick={handleAddStudio}
                                disabled={
                                  !newStudioName.trim() || isAddingStudio
                                }
                                className="bg-cta hover:bg-cta-strong text-white rounded-lg h-9 px-4 text-xs font-black uppercase tracking-wider shrink-0"
                              >
                                {isAddingStudio ? (
                                  <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />
                                ) : (
                                  <Plus className="w-3.5 h-3.5 mr-1.5" />
                                )}
                                Add
                              </Button>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    </div>

                    {/* Step 3: Column 2 - Communications */}
                    <div className="space-y-6">
                      {(isAdmin || checkIsOwner(authTrainer)) && (
                        <Card className="border border-border bg-card shadow-sm rounded-[32px] overflow-hidden">
                          <CardHeader className="bg-background pb-6 border-b border-border">
                            <div className="flex items-center gap-4">
                              <div className="w-12 h-12 rounded-2xl bg-cta/10 flex items-center justify-center border border-cta/30 shadow-inner">
                                <Megaphone className="w-6 h-6 text-cta" />
                              </div>
                              <div>
                                <CardTitle className="text-2xl font-black text-foreground italic tracking-tight">
                                  Hub Announcements
                                </CardTitle>
                                <CardDescription className="text-muted-foreground font-medium uppercase text-[11px] tracking-widest">
                                  Share informative insights with your team.
                                </CardDescription>
                              </div>
                            </div>
                          </CardHeader>
                          <CardContent className="p-8 space-y-6">
                            {/* Compact Form */}
                            <div className="p-5 bg-muted/50 rounded-[24px] border border-border space-y-4">
                              <div className="flex items-center gap-2">
                                <Sparkles className="w-4.5 h-4.5 text-amber" />
                                <h3 className="text-xs font-black text-foreground uppercase tracking-wider italic leading-none">
                                  Draft New Message
                                </h3>
                              </div>

                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <div className="space-y-1">
                                  <Label className="text-[11px] font-bold uppercase text-muted-foreground">
                                    Headline
                                  </Label>
                                  <Input
                                    value={newAnnouncement.title}
                                    onChange={(e) =>
                                      setNewAnnouncement((prev) => ({
                                        ...prev,
                                        title: e.target.value,
                                      }))
                                    }
                                    placeholder="e.g. Master the Turnaround"
                                    className="bg-card border-border text-foreground text-xs h-9 rounded-xl font-medium"
                                  />
                                </div>
                                <div className="space-y-1">
                                  <Label className="text-[11px] font-bold uppercase text-muted-foreground">
                                    Audience
                                  </Label>
                                  <Select
                                    value={currentAudienceValue}
                                    onValueChange={(v) =>
                                      setNewAnnouncement((prev) => ({
                                        ...prev,
                                        studioId: v,
                                      }))
                                    }
                                  >
                                    <SelectTrigger className="bg-card border-border text-foreground font-bold text-xs h-9 rounded-xl">
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent className="bg-card border-border text-foreground">
                                      {isSuperUser && (
                                        <SelectItem value="all">
                                          Company Wide (All Trainers)
                                        </SelectItem>
                                      )}
                                      {filteredStudiosForAnnouncement.map(
                                        (s) => (
                                          <SelectItem key={s.id} value={s.id!}>
                                            Just {s.name} Trainers
                                          </SelectItem>
                                        ),
                                      )}
                                    </SelectContent>
                                  </Select>
                                </div>
                              </div>

                              <div className="space-y-1">
                                <Label className="text-[11px] font-bold uppercase text-muted-foreground">
                                  Short Snippet (Quick Header View)
                                </Label>
                                <Input
                                  value={newAnnouncement.shortContent}
                                  onChange={(e) =>
                                    setNewAnnouncement((prev) => ({
                                      ...prev,
                                      shortContent: e.target.value,
                                    }))
                                  }
                                  placeholder="e.g. Why the 3-second turnaround pause is critical..."
                                  className="bg-card border-border text-foreground text-xs h-9 rounded-xl font-medium"
                                />
                              </div>

                              <div className="space-y-1">
                                <Label className="text-[11px] font-bold uppercase text-muted-foreground">
                                  Full Details (Expanded View)
                                </Label>
                                <Textarea
                                  value={newAnnouncement.longContent}
                                  onChange={(e) =>
                                    setNewAnnouncement((prev) => ({
                                      ...prev,
                                      longContent: e.target.value,
                                    }))
                                  }
                                  placeholder="Share the full depth of your knowledge here..."
                                  className="bg-card border-border text-foreground text-xs min-h-20 rounded-xl font-medium"
                                />
                              </div>

                              <div className="flex items-center justify-between pt-3 border-t border-border">
                                <div className="flex flex-wrap items-center gap-4">
                                  <div className="flex items-center gap-2">
                                    <Label className="text-[11px] font-bold uppercase text-muted-foreground mt-0.5">
                                      Priority:
                                    </Label>
                                    <Select
                                      value={newAnnouncement.priority}
                                      onValueChange={(v: any) =>
                                        setNewAnnouncement((prev) => ({
                                          ...prev,
                                          priority: v,
                                        }))
                                      }
                                    >
                                      <SelectTrigger className="w-24 h-8 bg-card border-border text-[11px] uppercase font-black rounded-lg">
                                        <SelectValue />
                                      </SelectTrigger>
                                      <SelectContent className="bg-card border-border text-foreground">
                                        <SelectItem value="low">
                                          Standard
                                        </SelectItem>
                                        <SelectItem value="medium">
                                          Growth
                                        </SelectItem>
                                        <SelectItem value="high">
                                          Urgent
                                        </SelectItem>
                                      </SelectContent>
                                    </Select>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <Label className="text-[11px] font-bold uppercase text-muted-foreground mt-0.5">
                                      Type:
                                    </Label>
                                    <Select
                                      value={newAnnouncement.type || "news"}
                                      onValueChange={(v: any) =>
                                        setNewAnnouncement((prev) => ({
                                          ...prev,
                                          type: v,
                                        }))
                                      }
                                    >
                                      <SelectTrigger className="w-24 h-8 bg-card border-border text-[11px] uppercase font-black rounded-lg">
                                        <SelectValue />
                                      </SelectTrigger>
                                      <SelectContent className="bg-card border-border text-foreground">
                                        <SelectItem value="shout-out">
                                          Shout-out
                                        </SelectItem>
                                        <SelectItem value="tip">Tip</SelectItem>
                                        <SelectItem value="news">
                                          News
                                        </SelectItem>
                                        <SelectItem value="event">
                                          Event
                                        </SelectItem>
                                        <SelectItem value="holiday">
                                          Holiday
                                        </SelectItem>
                                      </SelectContent>
                                    </Select>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <Label className="text-[11px] font-bold uppercase text-muted-foreground mt-0.5">
                                      Lifespan:
                                    </Label>
                                    <Select
                                      value={lifespan}
                                      onValueChange={(v) => setLifespan(v)}
                                    >
                                      <SelectTrigger className="w-24 h-8 bg-card border-border text-[11px] uppercase font-black rounded-lg">
                                        <SelectValue />
                                      </SelectTrigger>
                                      <SelectContent className="bg-card border-border text-foreground">
                                        <SelectItem value="24h">
                                          24 Hours
                                        </SelectItem>
                                        <SelectItem value="1w">
                                          1 Week
                                        </SelectItem>
                                        <SelectItem value="1m">
                                          1 Month
                                        </SelectItem>
                                      </SelectContent>
                                    </Select>
                                  </div>
                                </div>
                                <Button
                                  onClick={handleCreateAnnouncement}
                                  disabled={
                                    isCreatingAnnouncement ||
                                    !newAnnouncement.title ||
                                    !newAnnouncement.shortContent
                                  }
                                  className="bg-cta hover:bg-cta-strong text-white font-black uppercase text-[11px] tracking-widest h-9 px-5 rounded-xl gap-1.5 shadow-sm"
                                >
                                  {isCreatingAnnouncement ? (
                                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                  ) : (
                                    <Plus className="w-3.5 h-3.5" />
                                  )}
                                  Publish
                                </Button>
                              </div>
                            </div>

                            {/* Announcements Feed */}
                            <div className="space-y-3.5">
                              <h3 className="text-[11px] font-black uppercase tracking-widest text-muted-foreground px-1">
                                Active Messages
                              </h3>
                              {announcements.length === 0 ? (
                                <div className="py-12 border border-border border-dashed rounded-[24px] flex flex-col items-center justify-center text-muted-foreground italic text-xs">
                                  No active announcements found.
                                </div>
                              ) : (
                                <div className="space-y-3">
                                  {announcements.map((a) => (
                                    <div
                                      key={a.id}
                                      className="p-4 bg-card border border-border rounded-2xl flex items-center justify-between group"
                                    >
                                      <div className="flex items-start gap-3 min-w-0 flex-1">
                                        <div
                                          className={cn(
                                            "w-9 h-9 rounded-xl flex items-center justify-center border shrink-0 mt-0.5",
                                            a.priority === "high"
                                              ? "bg-red/10 border-red/30 text-red"
                                              : a.priority === "medium"
                                                ? "bg-amber/10 border-amber/30 text-amber"
                                                : "bg-cta/10 border-cta/30 text-cta",
                                          )}
                                        >
                                          <Megaphone className="w-4 h-4" />
                                        </div>
                                        <div className="min-w-0 flex-1">
                                          <div className="flex items-center gap-1.5 flex-wrap">
                                            <h4 className="font-black text-foreground italic text-xs truncate max-w-38.75">
                                              {a.title}
                                            </h4>
                                            <span className="text-[7px] bg-background text-muted-foreground px-1.5 py-0.5 rounded uppercase font-black border border-border">
                                              {a.studioId === "all"
                                                ? "Universal"
                                                : "Studio Specific"}
                                            </span>
                                          </div>
                                          <p className="text-[11px] text-muted-foreground mt-1 truncate">
                                            {a.shortContent}
                                          </p>
                                          <p className="text-[11px] text-muted-foreground mt-2 font-bold uppercase tracking-widest">
                                            By {a.authorName} •{" "}
                                            {a.createdAt
                                              ?.toDate?.()
                                              ?.toLocaleDateString() ||
                                              "Recently"}
                                          </p>
                                        </div>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          </CardContent>
                        </Card>
                      )}
                    </div>
                  </div>

                  {/* Step 4: The Hardware Editor (De-Cluttering) */}
                  <div className="w-full">
                    <div className="border border-border bg-card shadow-sm rounded-[32px] overflow-hidden">
                      <button
                        type="button"
                        onClick={() =>
                          setIsEquipmentExpanded(!isEquipmentExpanded)
                        }
                        className="w-full text-left p-8 flex items-center justify-between hover:bg-muted transition-colors cursor-pointer"
                      >
                        <div className="flex items-center gap-4">
                          <div className="w-12 h-12 rounded-2xl bg-amber/10 flex items-center justify-center border border-amber/30 shadow-inner">
                            <Settings className="w-6 h-6 text-amber" />
                          </div>
                          <div>
                            <h3 className="text-2xl font-black text-foreground italic tracking-tight">
                              Hardware & Equipment Configuration
                            </h3>
                            <p className="text-muted-foreground font-medium uppercase text-[11px] tracking-widest">
                              Map, test, and calibrate live floor biometric
                              machines.
                            </p>
                          </div>
                        </div>
                        <div className="p-2 bg-muted rounded-xl">
                          <ChevronDown
                            className={cn(
                              "w-5 h-5 text-muted-foreground transition-transform duration-200",
                              isEquipmentExpanded && "rotate-180",
                            )}
                          />
                        </div>
                      </button>
                      {isEquipmentExpanded && (
                        <div className="p-8 border-t border-border bg-muted/50">
                          <TrainerMachineEditor machines={machines} />
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })()}

          {activeTab === "app_settings" &&
            (() => {
              const hasAccess = isAdmin || checkIsOwner(authTrainer);
              if (!hasAccess) {
                return (
                  <div className="flex items-center justify-center p-6 min-h-100 animate-fade-in">
                    <Card className="border border-border bg-card shadow-sm rounded-[32px] p-8 max-w-md w-full text-center space-y-6">
                      <div className="mx-auto w-16 h-16 rounded-full bg-red/10 flex items-center justify-center border border-red/30">
                        <Lock className="w-8 h-8 text-red" />
                      </div>
                      <div className="space-y-2">
                        <h3 className="text-xl font-black text-foreground uppercase italic tracking-tight">
                          Access Restricted
                        </h3>
                        <p className="text-muted-foreground text-xs leading-relaxed font-semibold">
                          System architecture and data pipelines are limited to
                          System Administrators and Overseers.
                        </p>
                      </div>
                    </Card>
                  </div>
                );
              }

              return (
                <div className="space-y-8 animate-fade-in">
                  <Card className="border border-border bg-card shadow-sm rounded-[32px] overflow-hidden">
                    <CardHeader className="bg-background pb-8 border-b border-border">
                      <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-2xl bg-amber/10 flex items-center justify-center border border-amber/30 shadow-inner">
                          <Database className="w-6 h-6 text-amber" />
                        </div>
                        <div>
                          <CardTitle className="text-2xl font-black text-foreground italic tracking-tight">
                            Legacy Data Ingestion Pipeline
                          </CardTitle>
                          <CardDescription className="text-muted-foreground font-medium uppercase text-[11px] tracking-widest">
                            Import historical client logs via CSV to populate
                            the demographic engine.
                          </CardDescription>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="p-8 space-y-8">
                      {/* Interface Theme */}
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between p-6 bg-muted/50 border border-border rounded-2xl gap-6">
                        <div className="space-y-1">
                          <Label className="text-xs font-bold uppercase text-muted-foreground flex items-center gap-2 leading-none">
                            <Sparkles className="w-4 h-4 text-amber" />
                            Interface Theme
                          </Label>
                          <p className="text-[11px] text-muted-foreground font-medium leading-relaxed max-w-sm mt-1">
                            Toggle between dark mode, light mode, or system
                            default.
                          </p>
                        </div>
                        <div className="flex bg-card rounded-xl border border-border shrink-0">
                          <Select
                            value={theme}
                            onValueChange={(val) => setTheme(val as any)}
                          >
                            <SelectTrigger className="w-32 bg-transparent border-none text-xs font-bold uppercase tracking-widest outline-none focus:ring-0">
                              <SelectValue placeholder="Theme" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="light">Light</SelectItem>
                              <SelectItem value="dark">Dark</SelectItem>
                              <SelectItem value="system">System</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>

                      <div className="p-6 bg-red/10 border border-red/30 rounded-2xl space-y-4">
                        <div className="space-y-1">
                          <Label className="text-xs font-bold uppercase text-red flex items-center gap-2 leading-none">
                            <Bug className="w-4 h-4" />
                            Report a Bug
                          </Label>
                          <p className="text-[11px] text-muted-foreground font-medium leading-relaxed max-w-sm mt-1 mb-4">
                            Found an issue? Let us know so our engineering team
                            can investigate.
                          </p>
                        </div>

                        <div className="space-y-3 pt-2">
                          <Select
                            value={bugReport.issueType}
                            onValueChange={(v) =>
                              setBugReport((p) => ({ ...p, issueType: v }))
                            }
                          >
                            <SelectTrigger className="bg-card border-border">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="UI Problem">
                                UI/Visual Problem
                              </SelectItem>
                              <SelectItem value="Data Not Loading">
                                Data Not Loading/Syncing
                              </SelectItem>
                              <SelectItem value="Crash">App Crash</SelectItem>
                              <SelectItem value="Login Issue">
                                Authentication Issue
                              </SelectItem>
                              <SelectItem value="Other">Other</SelectItem>
                            </SelectContent>
                          </Select>

                          <Textarea
                            value={bugReport.description}
                            onChange={(e) =>
                              setBugReport((p) => ({
                                ...p,
                                description: e.target.value,
                              }))
                            }
                            placeholder="Please describe what happened, what you expected, and any steps to reproduce the issue."
                            className="min-h-25 bg-card border-border text-sm"
                          />

                          <Button
                            onClick={submitBug}
                            disabled={!bugReport.description || isSubmittingBug}
                            className="w-full bg-red hover:bg-red/80 text-white font-black uppercase text-[11px] tracking-widest"
                          >
                            {isSubmittingBug
                              ? "Submitting..."
                              : "Submit Bug Report"}
                          </Button>
                        </div>
                      </div>

                      <div className="space-y-4">
                        <Label
                          htmlFor="legacy-upload"
                          className="text-[11px] font-black uppercase tracking-widest text-muted-foreground px-1"
                        >
                          Historical Workout Data (CSV)
                        </Label>
                        <div className="relative group">
                          {/* High-end SaaS drop zone */}
                          <div className="w-full h-44 border-2 border-dashed border-border bg-background rounded-3xl flex flex-col items-center justify-center p-6 text-center transition-all duration-200 group-hover:bg-muted/70 group-hover:border-cta">
                            {isLegacyImporting ? (
                              <div className="flex flex-col items-center gap-3">
                                <Loader2 className="w-8 h-8 animate-spin text-cta" />
                                <span className="text-sm font-black uppercase italic tracking-wider text-cta">
                                  Processing Legacy Data...
                                </span>
                              </div>
                            ) : (
                              <div className="flex flex-col items-center space-y-3">
                                <div className="w-12 h-12 rounded-full bg-card border border-border flex items-center justify-center shadow-sm text-muted-foreground group-hover:text-cta group-hover:border-cta/30 transition-colors">
                                  <Database className="w-6 h-6" />
                                </div>
                                <div className="space-y-1">
                                  <p className="text-xs font-black text-foreground uppercase tracking-wider">
                                    Drag & drop or click to upload CSV
                                  </p>
                                  <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest">
                                    Supports legacy FileMaker schemas & metrics
                                  </p>
                                </div>
                              </div>
                            )}
                          </div>
                          <Input
                            id="legacy-upload"
                            type="file"
                            accept=".csv"
                            onChange={handleLegacyFileUpload}
                            disabled={isLegacyImporting}
                            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                          />
                        </div>
                      </div>

                      {legacyStats && (
                        <div className="p-6 bg-green/10 border border-green/30 rounded-2xl flex items-start gap-4">
                          <CheckCircle2 className="w-6 h-6 text-green shrink-0 mt-0.5" />
                          <div>
                            <p className="font-black text-green uppercase italic tracking-wider text-sm">
                              Import Success
                            </p>
                            <div className="text-muted-foreground font-bold uppercase tracking-widest grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-x-8 gap-y-2 mt-3 text-[11px]">
                              <p>
                                Clients:{" "}
                                <span className="font-mono text-xs text-foreground font-black">
                                  {legacyStats.clients}
                                </span>
                              </p>
                              <p>
                                Sessions:{" "}
                                <span className="font-mono text-xs text-foreground font-black">
                                  {legacyStats.sessions}
                                </span>
                              </p>
                              <p>
                                Logs:{" "}
                                <span className="font-mono text-xs text-foreground font-black">
                                  {legacyStats.logs}
                                </span>
                              </p>
                              <p>
                                Skipped:{" "}
                                <span className="font-mono text-xs text-foreground font-black">
                                  {legacyStats.failed}
                                </span>
                              </p>
                            </div>
                          </div>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </div>
              );
            })()}

          {activeTab === "data_exports" &&
            (() => {
              return (
                <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 fill-mode-both">
                  <Card className="border border-border bg-card shadow-2xl dark:shadow-none rounded-[32px] overflow-hidden">
                    <CardHeader className="bg-background pb-8 border-b border-border">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                        <div className="flex items-center gap-4">
                          <div className="w-12 h-12 rounded-2xl bg-muted flex items-center justify-center border border-border shadow-inner">
                            <Download className="w-6 h-6 text-cta" />
                          </div>
                          <div>
                            <CardTitle className="text-2xl font-black text-foreground italic tracking-tight">
                              Data Exports & Reporting
                            </CardTitle>
                            <CardDescription className="text-muted-foreground font-medium uppercase text-[11px] tracking-widest">
                              Generate CSV reports for performance, payroll, and
                              logs.
                            </CardDescription>
                          </div>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="p-8 space-y-6">
                      <div className="flex flex-col sm:flex-row gap-4 p-4 bg-muted/20 border border-border rounded-2xl mb-4 items-end">
                        <div className="flex-1 space-y-2 text-left">
                          <Label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                            Start Date
                          </Label>
                          <Input
                            type="date"
                            value={exportStartDate}
                            onChange={(e) => setExportStartDate(e.target.value)}
                            className="bg-background border-border font-bold"
                          />
                        </div>
                        <div className="flex-1 space-y-2 text-left">
                          <Label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                            End Date
                          </Label>
                          <Input
                            type="date"
                            value={exportEndDate}
                            onChange={(e) => setExportEndDate(e.target.value)}
                            className="bg-background border-border font-bold"
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <Card className="bg-card border-border shadow-sm">
                          <CardHeader className="pb-3 border-b border-border">
                            <CardTitle className="text-sm font-bold uppercase tracking-widest text-foreground flex items-center">
                              <FileSpreadsheet className="w-4 h-4 mr-2" />
                              Trainer & Payroll Summary
                            </CardTitle>
                          </CardHeader>
                          <CardContent className="p-4 flex flex-col gap-4">
                            <p className="text-[11px] text-muted-foreground font-medium leading-relaxed">
                              Generate a trailing 7/30-day view of payroll
                              summary session counts and trainer performance
                              metrics.
                            </p>
                            <Button
                              disabled={true}
                              className="w-full text-xs font-bold uppercase bg-slate-700/50 text-slate-400 cursor-not-allowed opacity-50 rounded-xl flex items-center justify-center gap-2"
                            >
                              Download CSV
                            </Button>
                          </CardContent>
                        </Card>

                        <Card className="bg-card border-border shadow-sm">
                          <CardHeader className="pb-3 border-b border-border">
                            <CardTitle className="text-sm font-bold uppercase tracking-widest text-foreground flex items-center">
                              <Users className="w-4 h-4 mr-2" />
                              Client Attendance Logs
                            </CardTitle>
                          </CardHeader>
                          <CardContent className="p-4 flex flex-col gap-4">
                            <p className="text-[11px] text-muted-foreground font-medium leading-relaxed">
                              Instantly export historical records of client
                              check-ins, session completions, and no-shows data.
                            </p>
                            <Button
                              disabled={true}
                              className="w-full text-xs font-bold uppercase bg-slate-700/50 text-slate-400 cursor-not-allowed opacity-50 rounded-xl flex items-center justify-center gap-2"
                            >
                              Download CSV
                            </Button>
                          </CardContent>
                        </Card>

                        <Card className="bg-card border-border shadow-sm">
                          <CardHeader className="pb-3 border-b border-border">
                            <CardTitle className="text-sm font-bold uppercase tracking-widest text-foreground flex items-center">
                              <TrendingUp className="w-4 h-4 mr-2" />
                              Client Progress Data
                            </CardTitle>
                          </CardHeader>
                          <CardContent className="p-4 flex flex-col gap-4">
                            <p className="text-[11px] text-muted-foreground font-medium leading-relaxed">
                              Export sessions count, average resistance
                              workload, and target tracking parameters per
                              client.
                            </p>
                            <Button
                              disabled={true}
                              className="w-full text-xs font-bold uppercase bg-slate-700/50 text-slate-400 cursor-not-allowed opacity-50 rounded-xl flex items-center justify-center gap-2"
                            >
                              Download CSV
                            </Button>
                          </CardContent>
                        </Card>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              );
            })()}

          {activeTab === "notifications" &&
            (() => {
              return (
                <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 fill-mode-both">
                  <Card className="border border-border bg-card shadow-2xl dark:shadow-none rounded-[32px] overflow-hidden">
                    <CardHeader className="bg-background pb-8 border-b border-border">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                        <div className="flex items-center gap-4">
                          <div className="w-12 h-12 rounded-2xl bg-muted flex items-center justify-center border border-border shadow-inner">
                            <Bell className="w-6 h-6 text-cta" />
                          </div>
                          <div>
                            <CardTitle className="text-2xl font-black text-foreground italic tracking-tight">
                              Notifications & Alerts
                            </CardTitle>
                            <CardDescription className="text-muted-foreground font-medium uppercase text-[11px] tracking-widest">
                              Configure automated SMS/email reminders and daily
                              digests.
                            </CardDescription>
                          </div>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="p-0">
                      <div className="p-6 sm:p-8 flex items-start sm:items-center justify-between gap-4 hover:bg-muted/50 transition-colors border-b border-border">
                        <div className="flex items-center gap-4 text-left group">
                          <div className="w-10 h-10 rounded-xl bg-card border border-border flex items-center justify-center shrink-0 shadow-sm">
                            <Mail className="w-5 h-5 text-cta" />
                          </div>
                          <div>
                            <h4 className="font-black text-foreground uppercase tracking-wider text-sm">
                              Client Booking Reminders
                            </h4>
                            <p className="text-[11px] text-muted-foreground font-medium leading-relaxed">
                              Automatically send automated SMS/Email reminders
                              to clients 24 hours before their session.
                            </p>
                          </div>
                        </div>
                        <Switch
                          checked={
                            activeStudio?.notificationSettings
                              ?.bookingRemindersEnabled ?? true
                          }
                          onCheckedChange={(val) =>
                            handleToggleNotificationSetting(
                              "bookingRemindersEnabled",
                              val,
                            )
                          }
                        />
                      </div>

                      <div className="p-6 sm:p-8 flex items-start sm:items-center justify-between gap-4 hover:bg-muted/50 transition-colors">
                        <div className="flex items-center gap-4 text-left group">
                          <div className="w-10 h-10 rounded-xl bg-card border border-border flex items-center justify-center shrink-0 shadow-sm">
                            <Settings className="w-5 h-5 text-cta" />
                          </div>
                          <div>
                            <h4 className="font-black text-foreground uppercase tracking-wider text-sm">
                              Owner Daily Action Summary
                            </h4>
                            <p className="text-[11px] text-muted-foreground font-medium leading-relaxed">
                              Configure daily summary reports of completed
                              sessions to be sent directly to the studio owner's
                              email.
                            </p>
                          </div>
                        </div>
                        <Switch
                          checked={
                            activeStudio?.notificationSettings
                              ?.dailySummaryEnabled ?? false
                          }
                          onCheckedChange={(val) =>
                            handleToggleNotificationSetting(
                              "dailySummaryEnabled",
                              val,
                            )
                          }
                        />
                      </div>
                    </CardContent>
                  </Card>
                </div>
              );
            })()}
        </div>
      </div>

      <CreateTrainerModal
        isOpen={isCreateModalOpen}
        onOpenChange={setIsCreateModalOpen}
        onSubmit={handleCreateTrainer}
      />

      {/* Delete Confirmation Modal */}
      {trainerToDelete && (
        <div className="fixed inset-0 z-100 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <motion.div
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="bg-card border border-border rounded-3xl p-8 max-w-sm w-full shadow-2xl dark:shadow-none flex flex-col items-center text-center space-y-6"
          >
            <div className="w-16 h-16 rounded-full bg-red/20 flex items-center justify-center border border-red/30">
              <AlertCircle className="w-8 h-8 text-red" />
            </div>
            <div>
              <h3 className="text-xl font-black text-foreground italic tracking-tighter uppercase">
                Delete Trainer?
              </h3>
              <p className="text-muted-foreground mt-2 text-sm leading-relaxed">
                Are you sure you want to remove{" "}
                <strong className="text-foreground">
                  {trainerToDelete?.fullName}
                </strong>
                ? This action cannot be undone.
              </p>
            </div>
            <div className="flex gap-3 w-full">
              <Button
                onClick={() => setTrainerToDelete(null)}
                variant="outline"
                className="flex-1 rounded-xl h-12 bg-card border-border text-foreground hover:bg-muted font-bold uppercase tracking-widest text-[11px]"
              >
                Cancel
              </Button>
              <Button
                onClick={handleDeleteTrainer}
                variant="destructive"
                className="flex-1 rounded-xl h-12 bg-red hover:bg-red/80 text-foreground font-black uppercase tracking-widest shadow-sm dark:shadow-none border-none text-[11px]"
              >
                Confirm
              </Button>
            </div>
          </motion.div>
        </div>
      )}

      {/* Sweep Deletion Modal */}
      <StrongConfirmationModal
        isOpen={!!sessionToTerminate}
        title="Sweep Session"
        description="Are you sure you want to manually terminate this abandoned session? This will mark the session as Completed."
        confirmationPhrase="TERMINATE SESSION"
        onConfirm={async () => {
          if (!sessionToTerminate?.id) return;
          try {
            await updateDoc(doc(db, "sessions", sessionToTerminate.id), {
              status: "Completed",
              updatedAt: serverTimestamp(),
            });
            toastSuccess("Session terminated successfully.");
          } catch (e: any) {
            toastError("Failed to terminate session: " + e.message);
          } finally {
            setSessionToTerminate(null);
          }
        }}
        onCancel={() => setSessionToTerminate(null)}
      />

      {/* Studio Deletion Confirmation Modal */}
      <StrongConfirmationModal
        isOpen={!!studioToDelete}
        title="Delete Studio Location"
        description={`Are you absolutely sure you want to delete the studio location "${studioToDelete?.name || ""}"? This action is permanent, and all associated configurations will be lost.`}
        confirmationPhrase="DELETE STUDIO"
        onConfirm={async () => {
          if (!studioToDelete?.id) return;
          try {
            await deleteDoc(doc(db, "studios", studioToDelete.id));
            toastSuccess("Studio location deleted successfully.");
          } catch (e: any) {
            toastError("Failed to delete studio: " + e.message);
          } finally {
            setStudioToDelete(null);
          }
        }}
        onCancel={() => setStudioToDelete(null)}
      />
    </motion.div>
  );
}
