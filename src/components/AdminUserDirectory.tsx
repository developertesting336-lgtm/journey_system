import React, { useState, useEffect } from "react";
import {
  collection,
  query,
  getDocs,
  getDoc,
  doc,
  setDoc,
  updateDoc,
  deleteDoc,
  limit,
  where,
  addDoc,
} from "firebase/firestore";
import { db } from "../firebase";
import { useToast } from "../contexts/ToastContext";
import { Trainer, Studio, CreateTrainerPayload, UserRole } from "../types";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import {
  Search,
  Edit,
  Trash2,
  UserCog,
  User,
  ShieldCheck,
  Loader2,
  Plus,
  Home,
  Key,
  Sparkles,
  Lock,
  Mail,
  Filter,
  Building2,
  CalendarDays,
  Activity,
  Check,
  X,
  Phone,
  MessageSquare,
  Clock,
  ShieldAlert,
  Inbox,
  UserCheck,
} from "lucide-react";
import {
  OperationType,
  handleFirestoreError,
  DocumentIdMissingError,
} from "../lib/firestore-errors";
import { useDebounce } from "../hooks/useDebounce";
import {
  cn,
  getRoleColor,
  getRoleDisplayName,
  generateSearchTokens,
} from "@/lib/utils";
import { CreateTrainerModal } from "./CreateTrainerModal";
import { EditTrainerModal } from "./EditTrainerModal";

interface Props {
  studios: Studio[];
  onRefresh?: (collectionName: "trainers") => Promise<void>;
}

export function AdminUserDirectory({ studios, onRefresh }: Props) {
  const { success: toastSuccess, error: toastError } = useToast();
  const [searchTerm, setSearchTerm] = useState("");
  const debouncedSearch = useDebounce(searchTerm, 400); // Wait 400ms after last keystroke

  const [users, setUsers] = useState<Trainer[]>([]);
  const [loading, setLoading] = useState(false);
  const [editingTrainer, setEditingTrainer] = useState<Trainer | null>(null);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);

  // Pending Access Requests state
  const [requests, setRequests] = useState<any[]>([]);
  const [loadingRequests, setLoadingRequests] = useState(false);

  // State for rejecting/deleting access requests
  const [rejectingRequest, setRejectingRequest] = useState<any | null>(null);
  const [isRejectModalOpen, setIsRejectModalOpen] = useState(false);
  const [deletingRequest, setDeletingRequest] = useState<any | null>(null);
  const [isDeleteRequestModalOpen, setIsDeleteRequestModalOpen] =
    useState(false);

  // State for deleting user profiles
  const [deletingUser, setDeletingUser] = useState<Trainer | null>(null);
  const [isDeleteUserModalOpen, setIsDeleteUserModalOpen] = useState(false);

  // State for approval modal
  const [approvingRequest, setApprovingRequest] = useState<any | null>(null);
  const [approvingHomeStudioId, setApprovingHomeStudioId] = useState("");
  const [approvingRole, setApprovingRole] =
    useState<UserRole>("LifeTransformer");
  const [approvingInitials, setApprovingInitials] = useState("");
  const [approvingCalendarVisible, setApprovingCalendarVisible] =
    useState(true);
  const [isApproveModalOpen, setIsApproveModalOpen] = useState(false);

  const fetchRequests = async () => {
    setLoadingRequests(true);
    try {
      const q = query(
        collection(db, "access_requests"),
        where("status", "==", "Pending"),
      );
      const snap = await getDocs(q);
      const data = snap.docs.map((d) => ({
        id: d.id,
        ...d.data(),
      }));
      setRequests(data);
    } catch (err) {
      console.error("Error fetching access requests:", err);
    } finally {
      setLoadingRequests(false);
    }
  };

  useEffect(() => {
    fetchRequests();
  }, []);

  const confirmRejectRequest = async () => {
    if (!rejectingRequest) return;
    try {
      await updateDoc(doc(db, "access_requests", rejectingRequest.id), {
        status: "Rejected",
        updatedAt: new Date().toISOString(),
      });
      setRequests((prev) => prev.filter((r) => r.id !== rejectingRequest.id));
      setIsRejectModalOpen(false);
      setRejectingRequest(null);
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, "access_requests");
    }
  };

  const handleApproveStudioAccess = async (req: any) => {
    try {
      if (!req.trainerId || !req.studioId)
        throw new Error("Missing trainer or studio ID in request");

      const trainerRef = doc(db, "trainers", req.trainerId);
      const trainerSnap = await getDoc(trainerRef);
      if (!trainerSnap.exists()) throw new Error("Trainer does not exist");

      const trainerData = trainerSnap.data();
      const currentGuestStudios = trainerData.activeGuestStudioIds || [];

      if (!currentGuestStudios.includes(req.studioId)) {
        await updateDoc(trainerRef, {
          activeGuestStudioIds: [...currentGuestStudios, req.studioId],
        });
      }

      await updateDoc(doc(db, "access_requests", req.id), {
        status: "Approved",
        updatedAt: new Date().toISOString(),
      });

      setRequests((prev) => prev.filter((r) => r.id !== req.id));
      await onRefresh?.("trainers");
    } catch (err) {
      handleFirestoreError(
        err,
        OperationType.UPDATE,
        "access_requests/trainer",
      );
    }
  };

  const confirmDeleteRequest = async () => {
    if (!deletingRequest) return;
    try {
      await deleteDoc(doc(db, "access_requests", deletingRequest.id));
      setRequests((prev) => prev.filter((r) => r.id !== deletingRequest.id));
      setIsDeleteRequestModalOpen(false);
      setDeletingRequest(null);
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, "access_requests");
    }
  };

  const handleOpenApproval = (req: any) => {
    if (req.type === "studio_access") {
      handleApproveStudioAccess(req);
      return;
    }

    setApprovingRequest(req);
    // Default to first studio
    setApprovingHomeStudioId(studios[0]?.id || "");

    // Derive initials
    const nameParts = req.fullName.trim().split(" ");
    let initials = "";
    if (nameParts.length > 1) {
      initials = (
        nameParts[0][0] + nameParts[nameParts.length - 1][0]
      ).toUpperCase();
    } else if (nameParts[0]) {
      initials = nameParts[0].substring(0, 2).toUpperCase();
    }
    setApprovingInitials(initials);

    // Assign mapped role
    const requested = req.roleRequested;
    if (requested === "StudioOwner") {
      setApprovingRole("StudioOwner");
    } else if (requested === "Trainer" || requested === "LifeTransformer") {
      setApprovingRole("LifeTransformer");
    } else if (requested === "Administrative") {
      setApprovingRole("Admin");
    } else {
      setApprovingRole("LifeTransformer");
    }

    setApprovingCalendarVisible(true);
    setIsApproveModalOpen(true);
  };

  const handleConfirmApproval = async () => {
    if (!approvingRequest || !approvingHomeStudioId || !approvingInitials) {
      toastError(
        "Please fill in all required fields (Initials & Primary Facility).",
      );
      return;
    }
    if (approvingInitials.length < 2) {
      toastError("Initials must be at least 2 characters.");
      return;
    }
    if (!approvingRequest.userId) {
      toastError(
        "No signed-in account attached — have them sign in with Google first, then re-approve.",
      );
      return;
    }

    try {
      const searchTokens = generateSearchTokens(approvingRequest.fullName);

      const trainerData = {
        fullName: approvingRequest.fullName,
        initials: approvingInitials.trim(),
        pin: "",
        pinHash: "",
        role: approvingRole,
        primaryHomeStudioId: approvingHomeStudioId,
        accessibleStudioIds: [approvingHomeStudioId],
        activeGuestStudioIds: [],
        isVisibleOnCalendar: approvingCalendarVisible,
        email: approvingRequest.email.trim().toLowerCase(),
        searchTokens,
        systemStatus: "active",
        createdAt: new Date().toISOString(),
      };

      // 1. Write Trainer to firestore
      const newTrainerId = approvingRequest.userId;
      await setDoc(doc(db, "trainers", newTrainerId), trainerData);

      // 2. Mark access request as Approved
      await updateDoc(doc(db, "access_requests", approvingRequest.id), {
        status: "Approved",
        approvedTrainerId: newTrainerId,
        updatedAt: new Date().toISOString(),
      });

      // 3. Update local directory state
      const newTrainer: Trainer = {
        id: newTrainerId,
        ...trainerData,
      };

      setUsers((prev) => [newTrainer, ...prev]);
      setRequests((prev) => prev.filter((r) => r.id !== approvingRequest.id));
      setIsApproveModalOpen(false);
      setApprovingRequest(null);

      await onRefresh?.("trainers");
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, "trainers");
    }
  };

  // Filters state
  const [roleFilter, setRoleFilter] = useState<string>("all");
  const [studioFilter, setStudioFilter] = useState<string>("all");

  // Fetch logic
  const fetchUsers = async (viewAll: boolean = false) => {
    setLoading(true);
    try {
      let q;
      if (viewAll || debouncedSearch.trim() === "") {
        q = query(collection(db, "trainers"), limit(100));
      } else {
        const term = debouncedSearch.toLowerCase().trim();
        q = query(
          collection(db, "trainers"),
          where("searchTokens", "array-contains", term),
          limit(100),
        );
      }

      const snap = await getDocs(q);
      const data = snap.docs.map(
        (doc) =>
          ({ id: doc.id, ...(doc.data() as Omit<Trainer, "id">) }) as Trainer,
      );

      setUsers(data);
    } catch (err) {
      handleFirestoreError(err, OperationType.GET, "trainers");
    } finally {
      setLoading(false);
    }
  };

  // Initial load on mount and when search term updates
  useEffect(() => {
    if (debouncedSearch.length >= 2) {
      fetchUsers(false);
    } else if (debouncedSearch.length === 0) {
      fetchUsers(true); // Load all by default if search is cleared
    }
  }, [debouncedSearch]);

  const handleUpdateTrainerFields = async (updatedFields: Partial<Trainer>) => {
    if (!editingTrainer || !editingTrainer.id) return;
    try {
      await updateDoc(doc(db, "trainers", editingTrainer.id), updatedFields);
      setUsers((prev) =>
        prev.map((u) =>
          u.id === editingTrainer.id ? { ...u, ...updatedFields } : u,
        ),
      );
      await onRefresh?.("trainers");
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, "trainers");
    }
  };

  const confirmDeleteUser = async () => {
    if (!deletingUser || !deletingUser.id) return;
    try {
      await deleteDoc(doc(db, "trainers", deletingUser.id));
      setUsers((prev) => prev.filter((u) => u.id !== deletingUser.id));
      setIsDeleteUserModalOpen(false);
      setDeletingUser(null);
      await onRefresh?.("trainers");
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, "trainers");
    }
  };

  const handleDeleteUser = (user: Trainer) => {
    setDeletingUser(user);
    setIsDeleteUserModalOpen(true);
  };

  const handleCreateUser = async (trainerData: CreateTrainerPayload) => {
    try {
      const role: UserRole = trainerData.isOwner ? "Owner" : "LifeTransformer";
      const { pinHash, pin, ...restData } = trainerData;
      const ref = await addDoc(collection(db, "trainers"), {
        ...restData,
        role: role,
        systemStatus: "active",
        createdAt: new Date().toISOString(),
      });

      // Add the newly created user to the state
      const newUser: Trainer = {
        id: ref.id,
        fullName: trainerData.fullName,
        initials: trainerData.initials,
        requiresPinReset: trainerData.requiresPinReset,
        primaryHomeStudioId: trainerData.primaryHomeStudioId,
        accessibleStudioIds: trainerData.accessibleStudioIds,
        activeGuestStudioIds: trainerData.activeGuestStudioIds || [],
        role: role,
        isVisibleOnCalendar: trainerData.isVisibleOnCalendar,
        searchTokens: trainerData.searchTokens,
        email: trainerData.email,
        createdAt: new Date().toISOString(),
      };
      setUsers((prev) => [newUser, ...prev]);
      await onRefresh?.("trainers");
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, "trainers");
    }
  };

  const getStudioName = (studioId: string) => {
    const studio = studios.find((s) => s.id === studioId);
    return studio ? studio.name : "Unknown Studio";
  };

  // Perform multi-axis filtration
  const filteredUsers = users.filter((user) => {
    const matchesRole = roleFilter === "all" || user.role === roleFilter;
    const matchesStudio =
      studioFilter === "all" ||
      user.primaryHomeStudioId === studioFilter ||
      user.accessibleStudioIds?.includes(studioFilter) ||
      user.activeGuestStudioIds?.includes(studioFilter);
    return matchesRole && matchesStudio;
  });

  return (
    <div className="space-y-6">
      {/* Pending Access Requests Panel */}
      {requests.length > 0 && (
        <Card className="rounded-[32px] bg-linear-to-r from-amber-500/10 to-orange-500/10 dark:from-amber-950/20 dark:to-orange-950/20 border border-amber-500/20 dark:border-amber-950/40 shadow-md p-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-amber-500/20 text-amber-600 dark:text-amber-400 rounded-xl flex items-center justify-center animate-pulse">
                <ShieldAlert className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-lg font-black uppercase italic tracking-tight text-slate-800 dark:text-amber-100 leading-none">
                  Pending Authentication Requests ({requests.length})
                </h2>
                <p className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest mt-1">
                  New staffs or trainers requesting access to the Max Strength
                  system
                </p>
              </div>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={fetchRequests}
              className="text-[10px] gap-2 font-black uppercase tracking-widest h-8 rounded-lg border-amber-500/30 text-slate-700 dark:text-amber-300 dark:hover:bg-amber-950/30 bg-white dark:bg-slate-900"
            >
              <Loader2
                className={cn("w-3 h-3", loadingRequests && "animate-spin")}
              />
              Sync Requests
            </Button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {requests.map((req) => (
              <div
                key={req.id}
                className="flex flex-col justify-between p-5 rounded-3xl border border-slate-200/60 dark:border-slate-800/80 bg-white/70 dark:bg-slate-900/60 backdrop-blur-md shadow-sm space-y-4"
              >
                <div className="space-y-3">
                  {/* Title & Role */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <h3 className="font-extrabold text-slate-900 dark:text-white text-base leading-tight truncate">
                        {req.type === "studio_access"
                          ? req.trainerName
                          : req.fullName}
                      </h3>
                      {req.email && (
                        <span className="text-[10px] text-slate-500 font-semibold block truncate mt-0.5">
                          {req.email}
                        </span>
                      )}
                    </div>
                    {req.type === "studio_access" ? (
                      <Badge className="bg-indigo-500/10 hover:bg-indigo-500/15 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20 self-start px-2 py-0.5 text-[9px] uppercase font-black tracking-widest rounded-md shrink-0">
                        Add Studio
                      </Badge>
                    ) : (
                      <Badge className="bg-amber-500/10 hover:bg-amber-500/15 text-amber-600 dark:text-[#ff9800] border border-amber-500/20 self-start px-2 py-0.5 text-[9px] uppercase font-black tracking-widest rounded-md shrink-0">
                        {req.roleRequested || "Trainer"}
                      </Badge>
                    )}
                  </div>

                  {/* Body fields */}
                  <div className="space-y-1.5 text-xs text-slate-600 dark:text-slate-300 font-medium">
                    {req.type === "studio_access" ? (
                      <div className="flex items-center gap-2 text-[11px] font-bold text-slate-500 dark:text-slate-400">
                        <Building2 className="w-3.5 h-3.5" />
                        <span>Requested Studio: {req.studioName}</span>
                      </div>
                    ) : (
                      <>
                        {req.phone && (
                          <div className="flex items-center gap-2 text-[11px] font-bold text-slate-500 dark:text-slate-400">
                            <Phone className="w-3.5 h-3.5" />
                            <span>{req.phone}</span>
                          </div>
                        )}
                        {req.reason && (
                          <div className="flex items-start gap-2 bg-slate-50 dark:bg-slate-900/40 p-2.5 rounded-xl border border-slate-100 dark:border-slate-800/50 mt-1 italic">
                            <MessageSquare className="w-3.5 h-3.5 mt-0.5 text-slate-400 shrink-0" />
                            <p className="flex-1 text-[11px] leading-relaxed wrap-break-word">
                              "{req.reason}"
                            </p>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                </div>

                {/* Actions row */}
                <div className="flex gap-2 pt-2 border-t border-slate-100 dark:border-slate-800/40">
                  <Button
                    onClick={() => handleOpenApproval(req)}
                    size="sm"
                    className="flex-1 h-9 rounded-xl text-[10px] font-black uppercase tracking-widest bg-emerald-600 hover:bg-emerald-500 text-white shadow-sm flex items-center justify-center gap-1.5"
                  >
                    <UserCheck className="w-3.5 h-3.5" />
                    Approve Access
                  </Button>
                  <Button
                    onClick={() => {
                      setRejectingRequest(req);
                      setIsRejectModalOpen(true);
                    }}
                    variant="outline"
                    size="icon"
                    className="h-9 w-9 p-0 rounded-xl border-slate-200 dark:border-slate-800 hover:bg-amber-50 hover:text-amber-600 dark:hover:bg-amber-950/20 text-slate-400 hover:border-amber-200 dark:hover:border-amber-900 shrink-0 flex items-center justify-center"
                    title="Reject Request"
                  >
                    <X className="w-4 h-4" />
                  </Button>
                  <Button
                    onClick={() => {
                      setDeletingRequest(req);
                      setIsDeleteRequestModalOpen(true);
                    }}
                    variant="outline"
                    size="icon"
                    className="h-9 w-9 p-0 rounded-xl border-slate-200 dark:border-slate-800 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950/20 text-slate-400 hover:border-rose-200 dark:hover:border-rose-900 shrink-0 flex items-center justify-center"
                    title="Delete Request Permanently"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      <Card className="rounded-2xl sm:rounded-[32px] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm p-4 sm:p-6 overflow-visible">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 sm:w-10 sm:h-10 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-500 rounded-xl flex flex-col items-center justify-center shrink-0">
              <UserCog className="w-4 h-4 sm:w-5 sm:h-5 animate-pulse" />
            </div>
            <div>
              <h2 className="text-lg sm:text-xl font-black uppercase italic tracking-tight text-slate-900 dark:text-white leading-none">
                Staff & User Directory
              </h2>
              <p className="text-[10px] sm:text-[11px] font-bold text-slate-500 uppercase tracking-widest mt-1">
                Manage Roles, Studio Involvements & Credentials
              </p>
            </div>
          </div>

          <div className="flex flex-wrap sm:flex-nowrap items-center gap-2 sm:gap-3 w-full md:w-auto">
            <Button
              onClick={() => setIsCreateModalOpen(true)}
              className="flex-1 sm:flex-initial text-[10px] sm:text-[11px] font-black uppercase tracking-widest h-9 sm:h-10 px-3 sm:px-4 rounded-xl bg-indigo-500 hover:bg-indigo-600 text-white shadow-sm shrink-0 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5 sm:w-4 sm:h-4 mr-1.5 sm:mr-2" />
              New User
            </Button>
            <Button
              onClick={() => fetchUsers(true)}
              variant="outline"
              className="flex-1 sm:flex-initial text-[10px] sm:text-[11px] font-black uppercase tracking-widest h-9 sm:h-10 px-3 sm:px-4 rounded-xl border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 shrink-0 cursor-pointer"
            >
              Force Refresh
            </Button>
          </div>
        </div>

        {/* Dual Axis Controls Grid */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-4 mb-8">
          {/* Main search bar */}
          <div className="relative md:col-span-6">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
            <Input
              type="text"
              placeholder="Search by name or email..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-12 h-12 bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white rounded-2xl font-bold font-sans text-sm focus:border-indigo-500"
            />
          </div>

          {/* Role Filter */}
          <div className="md:col-span-3">
            <Select value={roleFilter} onValueChange={setRoleFilter}>
              <SelectTrigger className="h-12 bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 rounded-2xl text-xs font-black uppercase tracking-wider">
                <div className="flex items-center gap-2">
                  <Filter className="w-3.5 h-3.5 text-slate-400" />
                  <span className="truncate">
                    Role:{" "}
                    {roleFilter === "all"
                      ? "All Roles"
                      : getRoleDisplayName(roleFilter as UserRole)}
                  </span>
                </div>
              </SelectTrigger>
              <SelectContent className="bg-white dark:bg-slate-900 text-slate-900 dark:text-white border-slate-200 dark:border-slate-800">
                <SelectItem
                  value="all"
                  className="font-bold uppercase text-[11px]"
                >
                  All Roles
                </SelectItem>
                <SelectItem
                  value="LifeTransformer"
                  className="font-bold uppercase text-[11px]"
                >
                  Life Transformer
                </SelectItem>
                <SelectItem
                  value="StudioLeader"
                  className="font-bold uppercase text-[11px]"
                >
                  Studio Leader
                </SelectItem>
                <SelectItem
                  value="Owner"
                  className="font-bold uppercase text-[11px]"
                >
                  Owner
                </SelectItem>
                <SelectItem
                  value="Founder"
                  className="font-bold uppercase text-[11px]"
                >
                  Founder
                </SelectItem>
                <SelectItem
                  value="Admin"
                  className="font-bold uppercase text-[11px]"
                >
                  Admin
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Studio Filter */}
          <div className="md:col-span-3">
            <Select value={studioFilter} onValueChange={setStudioFilter}>
              <SelectTrigger className="h-12 bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 rounded-2xl text-xs font-black uppercase tracking-wider">
                <div className="flex items-center gap-2">
                  <Building2 className="w-3.5 h-3.5 text-slate-400" />
                  <span className="truncate">
                    Studio:{" "}
                    {studioFilter === "all"
                      ? "All Locations"
                      : getStudioName(studioFilter)}
                  </span>
                </div>
              </SelectTrigger>
              <SelectContent className="bg-white dark:bg-slate-900 text-slate-900 dark:text-white border-slate-200 dark:border-slate-800">
                <SelectItem
                  value="all"
                  className="font-bold uppercase text-[11px]"
                >
                  All Locations
                </SelectItem>
                {studios.map((s) => (
                  <SelectItem
                    key={s.id}
                    value={s.id || ""}
                    className="font-bold uppercase text-[11px]"
                  >
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="space-y-4">
          {loading ? (
            <div className="flex justify-center py-12 text-indigo-500">
              <Loader2 className="w-8 h-8 animate-spin" />
            </div>
          ) : filteredUsers.length === 0 ? (
            <div className="py-12 text-center border-2 border-dashed border-slate-100 dark:border-slate-800 rounded-3xl">
              <User className="w-12 h-12 text-slate-300 dark:text-slate-700 mx-auto mb-3" />
              <p className="text-sm font-black uppercase tracking-widest text-slate-400">
                No users match the search filters.
              </p>
              <p className="text-xs text-slate-400 mt-1 uppercase tracking-wider font-bold">
                Try adjustment of your search term or selection controls.
              </p>
            </div>
          ) : (
            filteredUsers.map((user) => {
              const hasPinSet = !!(user.pin || user.pinHash);
              const otherAccess = (user.accessibleStudioIds || []).filter(
                (id) =>
                  Boolean(id && id.trim()) &&
                  id !== user.primaryHomeStudioId &&
                  studios.some((s) => s.id === id),
              );
              const guestAccess = (user.activeGuestStudioIds || []).filter(
                (id) =>
                  Boolean(id && id.trim()) && studios.some((s) => s.id === id),
              );

              return (
                <div
                  key={user.id}
                  className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 p-5 rounded-3xl border border-slate-100 dark:border-slate-800/80 bg-slate-50/40 dark:bg-slate-900/30 hover:bg-white dark:hover:bg-slate-950 transition-all shadow-sm"
                >
                  {/* Basic Profile Description */}
                  <div className="flex items-start gap-4 flex-1">
                    <div className="w-12 h-12 rounded-2xl bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-100/30 text-indigo-600 dark:text-indigo-400 flex items-center justify-center font-black text-sm shadow-sm shrink-0">
                      {user.initials ||
                        user.fullName.substring(0, 2).toUpperCase()}
                    </div>
                    <div className="space-y-1.5 min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="font-black text-slate-900 dark:text-white tracking-tight truncate text-base leading-none">
                          {user.fullName}
                        </h3>
                        <Badge
                          variant="outline"
                          className={cn(
                            "px-2.5 py-0.5 text-[10px] uppercase font-black tracking-widest rounded-md",
                            getRoleColor(user.role),
                          )}
                        >
                          {getRoleDisplayName(user.role)}
                        </Badge>
                        {hasPinSet && (
                          <Badge
                            variant="secondary"
                            className="bg-emerald-50 dark:bg-emerald-950/20 text-emerald-600 border border-emerald-100/50 dark:border-emerald-900/40 px-2 py-0.5 text-[9px] font-extrabold uppercase rounded-md flex items-center gap-1"
                          >
                            <Lock className="w-2.5 h-2.5" /> PIN Locked
                          </Badge>
                        )}
                        {user.isVisibleOnCalendar === false && (
                          <Badge
                            variant="outline"
                            className="bg-yellow-50 dark:bg-yellow-950/20 text-yellow-600 border-yellow-200/50 px-2 py-0.5 text-[9px] font-extrabold uppercase rounded-md"
                          >
                            Hidden on Calendar
                          </Badge>
                        )}
                      </div>

                      {/* Details row */}
                      <div className="flex flex-wrap items-center gap-y-1.5 gap-x-4 text-xs font-bold text-slate-500 dark:text-slate-400 mt-2 min-w-0 max-w-full">
                        {user.email && (
                          <div className="flex items-center gap-1.5 bg-slate-100 dark:bg-slate-900 px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800/80 min-w-0 max-w-full overflow-hidden">
                            <Mail className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
                            <span className="text-[9px] uppercase tracking-widest text-slate-400 font-black shrink-0">
                              Email:
                            </span>
                            <span className="text-slate-700 dark:text-slate-300 font-bold truncate min-w-0 max-w-64 sm:max-w-xs">
                              {user.email}
                            </span>
                          </div>
                        )}
                        <span className="text-[10px] uppercase tracking-wider text-slate-400 font-bold shrink-0">
                          Initials: {user.initials}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Studio Involvements Dashboard Display */}
                  <div className="flex flex-col sm:flex-row sm:items-center gap-4 bg-white dark:bg-slate-900/20 border border-slate-100 dark:border-slate-800/60 p-3 rounded-2xl lg:min-w-85 max-w-full">
                    {/* Primary Studio */}
                    <div className="space-y-1">
                      <span className="text-[9px] font-extrabold uppercase tracking-widest text-slate-400 flex items-center gap-1">
                        <Home className="w-3 h-3 text-[#F06C22]" /> Primary
                        Facility
                      </span>
                      <span className="block text-xs font-black text-slate-800 dark:text-slate-200 uppercase tracking-wide">
                        {getStudioName(user.primaryHomeStudioId)}
                      </span>
                    </div>

                    {/* Shared/Guest Staffing columns */}
                    {(otherAccess.length > 0 || guestAccess.length > 0) && (
                      <div className="h-px sm:h-8 w-full sm:w-px bg-slate-100 dark:bg-slate-800 shrink-0" />
                    )}

                    <div className="space-y-1 min-w-0">
                      {otherAccess.length > 0 && (
                        <div className="flex items-center gap-1.5 min-w-0">
                          <span className="text-[9px] font-extrabold uppercase tracking-widest text-[#F06C22] shrink-0 flex items-center gap-0.5">
                            <Key className="w-2.5 h-2.5" /> Staff:
                          </span>
                          <span className="text-[10px] font-semibold text-slate-600 dark:text-slate-400 truncate max-w-50">
                            {otherAccess
                              .map((id) => getStudioName(id))
                              .join(", ")}
                          </span>
                        </div>
                      )}

                      {guestAccess.length > 0 && (
                        <div className="flex items-center gap-1.5 min-w-0">
                          <span className="text-[9px] font-extrabold uppercase tracking-widest text-indigo-500 shrink-0 flex items-center gap-0.5">
                            <Sparkles className="w-2.5 h-2.5" /> Guest:
                          </span>
                          <span className="text-[10px] font-semibold text-slate-600 dark:text-slate-400 truncate max-w-50">
                            {guestAccess
                              .map((id) => getStudioName(id))
                              .join(", ")}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Actions Column */}
                  <div className="flex items-center justify-end gap-2.5 shrink-0">
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-10 rounded-xl px-4 text-xs font-black uppercase tracking-wider flex items-center gap-1 border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800"
                      onClick={() => {
                        setEditingTrainer(user);
                        setIsEditModalOpen(true);
                      }}
                    >
                      <Edit className="w-3.5 h-3.5 text-slate-500" />
                      Configure
                    </Button>
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-10 w-10 rounded-xl border-slate-200 dark:border-slate-800 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950/30"
                      onClick={() => handleDeleteUser(user)}
                    >
                      <Trash2 className="w-3.5 h-3.5 text-slate-400" />
                    </Button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </Card>

      <CreateTrainerModal
        isOpen={isCreateModalOpen}
        onOpenChange={setIsCreateModalOpen}
        onSubmit={handleCreateUser}
      />

      <EditTrainerModal
        trainer={editingTrainer}
        studios={studios}
        isOpen={isEditModalOpen}
        onOpenChange={setIsEditModalOpen}
        onSave={handleUpdateTrainerFields}
        isAdminMode={true}
      />

      {/* Access Request Approval Modal */}
      <Dialog open={isApproveModalOpen} onOpenChange={setIsApproveModalOpen}>
        <DialogContent className="sm:max-w-106.25 bg-white dark:bg-slate-900 text-slate-900 dark:text-white border border-slate-200 dark:border-slate-800 shadow-2xl rounded-3xl">
          <DialogHeader>
            <DialogTitle className="text-2xl font-black italic uppercase text-slate-900 dark:text-white tracking-widest flex items-center gap-2">
              <UserCheck className="w-6 h-6 text-emerald-500" />
              Configure Roster Account
            </DialogTitle>
          </DialogHeader>

          {approvingRequest && (
            <div className="space-y-4 py-3">
              <div className="bg-slate-50 dark:bg-slate-800/40 p-4 rounded-2xl border border-slate-100 dark:border-slate-800">
                <span className="text-[10px] font-black uppercase tracking-wider text-indigo-500 block">
                  Approving Access For
                </span>
                <span className="text-sm font-black text-slate-800 dark:text-slate-200 block mt-0.5">
                  {approvingRequest.fullName}
                </span>
                <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 block truncate mt-0.5">
                  {approvingRequest.email}
                </span>
              </div>

              {/* Home Studio */}
              <div className="space-y-1.5">
                <Label className="text-[11px] font-black uppercase text-slate-500 dark:text-slate-400 tracking-widest">
                  Primary Facility <span className="text-rose-500">*</span>
                </Label>
                <Select
                  value={approvingHomeStudioId}
                  onValueChange={setApprovingHomeStudioId}
                >
                  <SelectTrigger className="bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white rounded-xl h-11 text-sm font-bold">
                    <SelectValue placeholder="Select primary studio..." />
                  </SelectTrigger>
                  <SelectContent className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-705 text-slate-900 dark:text-white max-h-75">
                    {studios.map((studio) => (
                      <SelectItem
                        key={studio.id}
                        value={studio.id || ""}
                        className="focus:bg-[#38BDF8] focus:text-slate-950 cursor-pointer text-xs font-bold uppercase"
                      >
                        {studio.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Initials */}
              <div className="space-y-1.5">
                <Label className="text-[11px] font-black uppercase text-slate-500 dark:text-slate-400 tracking-widest">
                  Trainer Initials <span className="text-rose-500">*</span>
                </Label>
                <Input
                  value={approvingInitials}
                  onChange={(e) =>
                    setApprovingInitials(e.target.value.toUpperCase())
                  }
                  className="bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white rounded-xl h-11 uppercase font-black"
                  placeholder="Initials (e.g., JD)"
                  maxLength={3}
                />
              </div>

              {/* Roster Assignment Role */}
              <div className="space-y-1.5">
                <Label className="text-[11px] font-black uppercase text-slate-500 dark:text-slate-400 tracking-widest">
                  System Role
                </Label>
                <Select
                  value={approvingRole}
                  onValueChange={(val) => setApprovingRole(val as UserRole)}
                >
                  <SelectTrigger className="bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white rounded-xl h-11 text-sm font-bold">
                    <SelectValue placeholder="Select system role..." />
                  </SelectTrigger>
                  <SelectContent className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white">
                    <SelectItem
                      value="LifeTransformer"
                      className="font-bold uppercase text-[10px]"
                    >
                      Life Transformer (Standard)
                    </SelectItem>
                    <SelectItem
                      value="StudioLeader"
                      className="font-bold uppercase text-[10px]"
                    >
                      Studio Leader
                    </SelectItem>
                    <SelectItem
                      value="Owner"
                      className="font-bold uppercase text-[10px]"
                    >
                      Owner
                    </SelectItem>
                    <SelectItem
                      value="Admin"
                      className="font-bold uppercase text-[10px]"
                    >
                      System Administrator
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Calendar Visibility */}
              <div className="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-800/30 border border-slate-150 dark:border-slate-800 rounded-xl">
                <div className="space-y-0.5">
                  <Label className="text-xs font-black text-slate-800 dark:text-white">
                    Visible on Calendar
                  </Label>
                  <p className="text-[9px] text-slate-500 font-bold uppercase">
                    Allow clients to schedule sessions
                  </p>
                </div>
                <Switch
                  checked={approvingCalendarVisible}
                  onCheckedChange={setApprovingCalendarVisible}
                />
              </div>
            </div>
          )}

          <DialogFooter>
            <Button
              onClick={handleConfirmApproval}
              disabled={
                !approvingHomeStudioId ||
                !approvingInitials ||
                approvingInitials.length < 2
              }
              className="w-full bg-[#F06C22] hover:bg-[#d95b16] text-white font-black uppercase text-xs h-11 rounded-xl transition-all shadow-[0_4px_12px_rgba(240,108,34,0.3)]"
            >
              Commit Approval & Build Profile
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reject Request Confirmation Modal */}
      <Dialog open={isRejectModalOpen} onOpenChange={setIsRejectModalOpen}>
        <DialogContent className="sm:max-w-100 bg-white dark:bg-slate-900 text-slate-900 dark:text-white border border-slate-200 dark:border-slate-800 shadow-2xl rounded-3xl p-6">
          <DialogHeader>
            <DialogTitle className="text-xl font-black italic uppercase text-slate-900 dark:text-white tracking-widest flex items-center gap-2">
              <ShieldAlert className="w-5 h-5 text-amber-500" />
              Reject Request
            </DialogTitle>
          </DialogHeader>
          <div className="py-4 space-y-3">
            <p className="text-sm font-bold text-slate-600 dark:text-slate-300">
              Are you sure you want to reject the request from{" "}
              <span className="text-amber-500 font-extrabold">
                {rejectingRequest?.fullName}
              </span>
              ?
            </p>
            <p className="text-xs text-slate-400 font-medium leading-relaxed">
              This request will be deactivated and archived as "Rejected". They
              will not be granted access to the rosters or calendar.
            </p>
          </div>
          <DialogFooter className="flex gap-2 sm:gap-0">
            <Button
              variant="outline"
              onClick={() => {
                setIsRejectModalOpen(false);
                setRejectingRequest(null);
              }}
              className="flex-1 rounded-xl uppercase text-xs font-black tracking-widest text-slate-700 dark:text-slate-300"
            >
              Cancel
            </Button>
            <Button
              onClick={confirmRejectRequest}
              className="flex-1 bg-amber-600 hover:bg-amber-500 text-white font-black uppercase text-xs h-10 rounded-xl transition-all shadow-md"
            >
              Confirm Reject
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Request Permanently Confirmation Modal */}
      <Dialog
        open={isDeleteRequestModalOpen}
        onOpenChange={setIsDeleteRequestModalOpen}
      >
        <DialogContent className="sm:max-w-100 bg-white dark:bg-slate-900 text-slate-900 dark:text-white border border-slate-200 dark:border-slate-800 shadow-2xl rounded-3xl p-6">
          <DialogHeader>
            <DialogTitle className="text-xl font-black italic uppercase text-slate-900 dark:text-white tracking-widest flex items-center gap-2">
              <Trash2 className="w-5 h-5 text-rose-500" />
              Delete Request
            </DialogTitle>
          </DialogHeader>
          <div className="py-4 space-y-3">
            <p className="text-sm font-bold text-slate-600 dark:text-slate-300">
              Are you sure you want to permanently delete the request from{" "}
              <span className="text-rose-500 font-extrabold">
                {deletingRequest?.fullName}
              </span>
              ?
            </p>
            <p className="text-xs text-slate-400 font-medium leading-relaxed">
              This will completely erase the access request document from the
              database. This action is irreversible.
            </p>
          </div>
          <DialogFooter className="flex gap-2 sm:gap-0">
            <Button
              variant="outline"
              onClick={() => {
                setIsDeleteRequestModalOpen(false);
                setDeletingRequest(null);
              }}
              className="flex-1 rounded-xl uppercase text-xs font-black tracking-widest text-slate-700 dark:text-slate-300"
            >
              Cancel
            </Button>
            <Button
              onClick={confirmDeleteRequest}
              className="flex-1 bg-rose-600 hover:bg-rose-500 text-white font-black uppercase text-xs h-10 rounded-xl transition-all shadow-md"
            >
              Confirm Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete User/Trainer Profile Confirmation Modal */}
      <Dialog
        open={isDeleteUserModalOpen}
        onOpenChange={setIsDeleteUserModalOpen}
      >
        <DialogContent className="sm:max-w-100 bg-white dark:bg-slate-900 text-slate-900 dark:text-white border border-slate-200 dark:border-slate-800 shadow-2xl rounded-3xl p-6">
          <DialogHeader>
            <DialogTitle className="text-xl font-black italic uppercase text-slate-900 dark:text-white tracking-widest flex items-center gap-2">
              <Trash2 className="w-5 h-5 text-rose-500" />
              Delete Profile
            </DialogTitle>
          </DialogHeader>
          <div className="py-4 space-y-3">
            <p className="text-sm font-bold text-slate-600 dark:text-slate-300">
              Are you sure you want to permanently delete the profile for{" "}
              <span className="text-rose-500 font-extrabold">
                {deletingUser?.fullName}
              </span>
              ?
            </p>
            <p className="text-xs text-slate-400 font-medium leading-relaxed">
              This will permanently delete their staff roster account from the
              workspace. This action is irreversible.
            </p>
          </div>
          <DialogFooter className="flex gap-2 sm:gap-0">
            <Button
              variant="outline"
              onClick={() => {
                setIsDeleteUserModalOpen(false);
                setDeletingUser(null);
              }}
              className="flex-1 rounded-xl uppercase text-xs font-black tracking-widest text-slate-700 dark:text-slate-300"
            >
              Cancel
            </Button>
            <Button
              onClick={confirmDeleteUser}
              className="flex-1 bg-rose-600 hover:bg-rose-500 text-white font-black uppercase text-xs h-10 rounded-xl transition-all shadow-md"
            >
              Confirm Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
