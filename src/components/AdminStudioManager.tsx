import React, { useState, useEffect } from "react";
import {
  collection,
  query,
  addDoc,
  deleteDoc,
  getDocs,
  updateDoc,
  doc,
  orderBy,
  arrayUnion,
  arrayRemove,
  deleteField,
} from "firebase/firestore";
import { db } from "../firebase";
import { Studio, Trainer, FranchiseNetwork } from "../types";
import {
  Building2,
  Users,
  ChevronRight,
  MapPin,
  Mail,
  Phone,
  Clock,
  Save,
  ArrowLeft,
  Plus,
  Trash2,
  Star,
  UserCircle,
  BadgeInfo,
  ShieldCheck,
  Network,
  Link2,
  Unlink2,
  Crown,
  Key,
  Flame,
  Layers,
  Sparkles,
} from "lucide-react";
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
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { motion, AnimatePresence } from "motion/react";
import { cn, getRoleColor, getRoleDisplayName } from "@/lib/utils";
import { OperationType, handleFirestoreError } from "../lib/firestore-errors";
import { useToast } from "../contexts/ToastContext";
import { StrongConfirmationModal } from "./StrongConfirmationModal";

interface Props {
  authTrainer: Trainer;
  studios: Studio[];
  networks: FranchiseNetwork[];
  trainers: Trainer[];
  isAdmin?: boolean;
  onBack?: () => void;
  onRefresh?: (
    collectionName: "studios" | "networks" | "trainers",
  ) => Promise<void>;
}

export function AdminStudioManager({
  authTrainer,
  studios: allStudios,
  networks,
  trainers,
  isAdmin = false,
  onBack,
  onRefresh,
}: Props) {
  const { success: toastSuccess, error: toastError } = useToast();
  const [studioToDelete, setStudioToDelete] = useState<Studio | null>(null);
  const [networkToDelete, setNetworkToDelete] =
    useState<FranchiseNetwork | null>(null);

  // Tabs
  const [activeTab, setActiveTab] = useState<"networks" | "studios">(
    "networks",
  );

  // Selection state
  const [selectedNetworkId, setSelectedNetworkId] = useState<string | null>(
    null,
  );
  const [selectedStudioId, setSelectedStudioId] = useState<string | null>(null);

  // Creation / modification states
  const [newNetworkName, setNewNetworkName] = useState("");
  const [newNetworkOwnerIds, setNewNetworkOwnerIds] = useState<string[]>([]);
  const [newNetworkState, setNewNetworkState] = useState("");
  const [isCreatingNetwork, setIsCreatingNetwork] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isAddingStaff, setIsAddingStaff] = useState(false);
  const [staffLoading, setStaffLoading] = useState(false);

  // Filter studios based on access permissions
  // Super Admin / Franchise Owners see all; local managers see their matched territories
  const manageableStudios = React.useMemo(() => {
    if (
      isAdmin ||
      authTrainer.role === "Admin" ||
      authTrainer.role === "Founder" ||
      authTrainer.role === "Overseer"
    ) {
      return allStudios;
    }
    // Filter to studios where the authTrainer is the designated owner, listed in ownedStudioIds, or owns the network
    const ownedNetworkStudioIds = new Set<string>();
    networks.forEach((n) => {
      if (
        (n.ownerIds || []).includes(authTrainer.id!) ||
        n.ownerId === authTrainer.id
      ) {
        (n.studioIds || []).forEach((id) => ownedNetworkStudioIds.add(id));
      }
    });

    return allStudios.filter(
      (s) =>
        s.ownerId === authTrainer.id ||
        authTrainer.ownedStudioIds?.includes(s.id!) ||
        (s.id && ownedNetworkStudioIds.has(s.id)),
    );
  }, [allStudios, networks, authTrainer, isAdmin]);

  // Selected entities helper
  const selectedStudio = allStudios.find((s) => s.id === selectedStudioId);
  const selectedNetwork = networks.find((n) => n.id === selectedNetworkId);

  // Filter independent studios (not linked to any network)
  const independentStudios = React.useMemo(() => {
    return allStudios.filter((s) => {
      const isLinkedToAny = networks.some((n) => n.studioIds?.includes(s.id!));
      return !isLinkedToAny && !s.networkId;
    });
  }, [allStudios, networks]);

  // Find staff for a selected studio
  const getStaffForStudio = (studioId: string) => {
    return trainers.filter(
      (t) =>
        t.primaryHomeStudioId === studioId ||
        t.accessibleStudioIds?.includes(studioId) ||
        t.activeGuestStudioIds?.includes(studioId) ||
        t.id === selectedStudio?.ownerId ||
        t.id === selectedStudio?.headTrainerId,
    );
  };

  // 1. CREATE FRANCHISE NETWORK
  const handleCreateNetwork = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newNetworkName.trim() || newNetworkOwnerIds.length === 0) {
      toastError(
        "Please provide a network name and assign at least one franchise owner.",
      );
      return;
    }

    setIsSaving(true);
    try {
      await addDoc(collection(db, "networks"), {
        name: newNetworkName,
        ownerId: newNetworkOwnerIds[0], // Keep for backward compatibility
        ownerIds: newNetworkOwnerIds,
        state: newNetworkState,
        studioIds: [],
        createdAt: new Date(),
      });
      setNewNetworkName("");
      setNewNetworkOwnerIds([]);
      setNewNetworkState("");
      setIsCreatingNetwork(false);
      await onRefresh?.("networks");
      toastSuccess("Franchise network created successfully.");
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, "networks");
    } finally {
      setIsSaving(false);
    }
  };

  // 2. CREATE STUDIO
  const [newStudioName, setNewStudioName] = useState("");
  const [newStudioSiteId, setNewStudioSiteId] = useState("");
  const handleCreateStudio = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newStudioName.trim() || !newStudioSiteId.trim()) {
      toastError(
        "Please provide both a new location name and a Mindbody Site ID.",
      );
      return;
    }

    const trimmedSiteId = newStudioSiteId.trim();
    const isDuplicate = allStudios.some(
      (s) => s.mindbodySiteId === trimmedSiteId,
    );

    if (isDuplicate) {
      toastError(
        "This Mindbody Site ID is already assigned to another studio. It must be unique.",
      );
      return;
    }

    setIsSaving(true);
    try {
      await addDoc(collection(db, "studios"), {
        name: newStudioName,
        timezone: "America/New_York",
        createdAt: new Date(),
        ownerId: authTrainer.id,
        mindbodySiteId: trimmedSiteId,
      });
      setNewStudioName("");
      setNewStudioSiteId("");
      await onRefresh?.("studios");
      toastSuccess("Studio location registered successfully.");
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, "studios");
    } finally {
      setIsSaving(false);
    }
  };

  // 3. DELETE STUDIO
  const handleDeleteStudio = async (sId: string) => {
    const studio = allStudios.find((s) => s.id === sId);
    if (!studio) return;
    setStudioToDelete(studio);
  };

  const performStudioDelete = async () => {
    if (!studioToDelete?.id) return;
    const sId = studioToDelete.id;
    try {
      await deleteDoc(doc(db, "studios", sId));
      if (selectedStudioId === sId) {
        setSelectedStudioId(null);
      }
      await onRefresh?.("studios");
      toastSuccess(`Successfully deleted studio "${studioToDelete.name}".`);
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `studios/${sId}`);
    } finally {
      setStudioToDelete(null);
    }
  };

  // 4. DELETE FRANCHISE NETWORK
  const handleDeleteNetwork = async (networkId: string) => {
    const net = networks.find((n) => n.id === networkId);
    if (!net) return;
    setNetworkToDelete(net);
  };

  const performNetworkDelete = async () => {
    if (!networkToDelete?.id) return;
    const networkId = networkToDelete.id;
    try {
      // Unlink studios first if any exist
      if (networkToDelete.studioIds && networkToDelete.studioIds.length > 0) {
        for (const sId of networkToDelete.studioIds) {
          try {
            const sRef = doc(db, "studios", sId);
            await updateDoc(sRef, { networkId: deleteField() });
          } catch (e) {
            console.warn(`Could not unlink studio ${sId}`, e);
          }
        }
      }

      await deleteDoc(doc(db, "networks", networkId));
      if (selectedNetworkId === networkId) {
        setSelectedNetworkId(null);
      }
      // Force refresh on both to clear states
      await onRefresh?.("networks");
      await onRefresh?.("studios");
      toastSuccess(
        `Successfully disbanded franchise network "${networkToDelete.name}".`,
      );
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `networks/${networkId}`);
    } finally {
      setNetworkToDelete(null);
    }
  };

  // 3. LINK STUDIO TO NETWORK
  const handleLinkStudio = async (networkId: string, studioId: string) => {
    if (!networkId || !studioId) {
      toastError("Invalid selection. Missing network or location ID.");
      return;
    }
    try {
      const net = networks.find((n) => n.id === networkId);
      if (!net) return;

      const alreadyLinked = net.studioIds?.includes(studioId);
      if (alreadyLinked) return;

      const currentIds = (net.studioIds || []).filter(Boolean);
      const updatedStudioIds = [...currentIds, studioId];
      // Update Network doc
      await updateDoc(doc(db, "networks", networkId), {
        studioIds: updatedStudioIds,
      });
      // Update Studio doc
      await updateDoc(doc(db, "studios", studioId), {
        networkId: networkId,
      });
      await onRefresh?.("networks");
      await onRefresh?.("studios");
      toastSuccess("Studio linked to network successfully.");
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `networks/${networkId}`);
    }
  };

  // 4. UNLINK STUDIO FROM NETWORK
  const handleUnlinkStudio = async (networkId: string, studioId: string) => {
    if (!networkId || !studioId) {
      toastError("Invalid selection. Missing network or location ID.");
      return;
    }
    try {
      const net = networks.find((n) => n.id === networkId);
      if (!net) return;

      const updatedStudioIds = (net.studioIds || []).filter(
        (id) => !!id && id !== studioId,
      );
      // Update Network doc
      await updateDoc(doc(db, "networks", networkId), {
        studioIds: updatedStudioIds,
      });
      // Update Studio doc
      await updateDoc(doc(db, "studios", studioId), {
        networkId: deleteField(),
      });
      await onRefresh?.("networks");
      await onRefresh?.("studios");
      toastSuccess("Studio unlinked from network successfully.");
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `networks/${networkId}`);
    }
  };

  // 5. UPDATE STUDIO METADATA (INCLUDING REASSIGNING ROLES)
  const handleUpdateStudioMetadata = async (
    e: React.FormEvent<HTMLFormElement>,
  ) => {
    e.preventDefault();
    if (!selectedStudio?.id) return;

    setIsSaving(true);
    const formData = new FormData(e.currentTarget);
    const ownerIdVal = formData.get("ownerId") as string;
    const headTrainerIdVal = formData.get("headTrainerId") as string;
    const siteIdVal = ((formData.get("mindbodySiteId") as string) || "").trim();

    if (!siteIdVal) {
      toastError("Mindbody Site ID is required.");
      setIsSaving(false);
      return;
    }

    const isDuplicate = allStudios.some(
      (s) => s.id !== selectedStudio.id && s.mindbodySiteId === siteIdVal,
    );

    if (isDuplicate) {
      toastError(
        "This Mindbody Site ID is already assigned to another studio. It must be unique.",
      );
      setIsSaving(false);
      return;
    }

    const updates: Partial<Studio> = {
      name: formData.get("name") as string,
      contactEmail: formData.get("contactEmail") as string,
      phone: formData.get("phone") as string,
      address: formData.get("address") as string,
      timezone: formData.get("timezone") as string,
      mindbodySiteId: siteIdVal,
      locationType: formData.get("locationType") as any,
      brandColor: (formData.get("brandColor") as string) || "#F37427",
      ownerId: ownerIdVal === "none" ? deleteField() : ownerIdVal,
      headTrainerId:
        headTrainerIdVal === "none" ? deleteField() : headTrainerIdVal,
    } as any;

    try {
      await updateDoc(doc(db, "studios", selectedStudio.id), updates);

      // Auto-update Trainer roles if we assigned them
      if (ownerIdVal && ownerIdVal !== "none") {
        await updateDoc(doc(db, "trainers", ownerIdVal), {
          role: "StudioOwner",
          ownedStudioIds: arrayUnion(selectedStudio.id),
        });
      }
      if (headTrainerIdVal && headTrainerIdVal !== "none") {
        await updateDoc(doc(db, "trainers", headTrainerIdVal), {
          role: "HeadTrainer",
          accessibleStudioIds: arrayUnion(selectedStudio.id),
        });
      }

      toastSuccess("Clinical Studio profile synchronization complete!");
      await onRefresh?.("studios");
      await onRefresh?.("trainers");
    } catch (err) {
      handleFirestoreError(
        err,
        OperationType.UPDATE,
        `studios/${selectedStudio.id}`,
      );
    } finally {
      setIsSaving(false);
    }
  };

  // 6. ROSTER: ADD TRAINER
  const handleAddTrainerToStudio = async (trainerId: string) => {
    if (!selectedStudioId) return;
    try {
      await updateDoc(doc(db, "trainers", trainerId), {
        accessibleStudioIds: arrayUnion(selectedStudioId),
      });
      setIsAddingStaff(false);
      await onRefresh?.("trainers");
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `trainers/${trainerId}`);
    }
  };

  // 7. ROSTER: REMOVE TRAINER
  const handleRemoveTrainerFromStudio = async (trainerId: string) => {
    if (!selectedStudioId) return;
    if (
      trainerId === selectedStudio?.ownerId ||
      trainerId === selectedStudio?.headTrainerId
    ) {
      toastError(
        "You cannot remove an active designated Business Owner or Head Trainer from the location roster. Re-assign their roles first in the card above.",
      );
      return;
    }

    try {
      await updateDoc(doc(db, "trainers", trainerId), {
        accessibleStudioIds: arrayRemove(selectedStudioId),
        activeGuestStudioIds: arrayRemove(selectedStudioId),
      });
      await onRefresh?.("trainers");
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `trainers/${trainerId}`);
    }
  };

  // RENDER SUITE / TABS Layout
  return (
    <div className="min-h-screen text-slate-900 dark:text-slate-100 p-4 sm:p-6 md:p-8 font-sans selection:bg-[#F06C22]/35 pb-32">
      <div className="max-w-7xl mx-auto space-y-8">
        {/* Main Header Row */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 border-b border-slate-900 pb-8">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-3xl bg-linear-to-br from-[#F06C22] to-amber-600 flex items-center justify-center text-ink-d1 shadow-2xl shadow-[#F06C22]/20">
              <Network className="w-7 h-7" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-3xl md:text-4xl font-black uppercase italic tracking-tighter text-ink-d1">
                  Studio Command
                </h1>
                <Badge className="bg-[#F06C22]/15 text-[#F06C22] border border-[#F06C22]/20 text-[11px] font-black uppercase tracking-widest px-2 py-0.5">
                  Enterprise
                </Badge>
              </div>
              <p className="text-[11px] sm:text-xs font-black uppercase tracking-[0.25em] text-zinc-500 mt-1">
                Cross-Studio Infrastructure & Role Mapping Matrix
              </p>
            </div>
          </div>
          {onBack && (
            <Button
              variant="outline"
              onClick={onBack}
              className="border-slate-850 hover:bg-slate-900 text-zinc-300 hover:text-ink-d1 font-black uppercase tracking-widest text-[11px] h-12 rounded-2xl px-6 bg-bg-dark-2 transition-all shadow-xl"
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Overview
            </Button>
          )}
        </div>

        {/* Selected Studio Subview (Configure Staff / Metadata) */}
        {selectedStudioId ? (
          <motion.div
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-8"
          >
            {/* Context breadcrumb back */}
            <button
              onClick={() => setSelectedStudioId(null)}
              className="flex items-center gap-2 text-[#F06C22] hover:text-[#F06C22]/80 transition-colors uppercase font-black text-[11px] tracking-widest"
            >
              <ArrowLeft className="w-4 h-4" />
              Return to Executive Registries
            </button>

            <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 pb-6 border-b border-slate-900">
              <div>
                <div className="flex items-center gap-3">
                  <span className="w-10 h-10 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-center text-[#F06C22]">
                    <Building2 className="w-5 h-5" />
                  </span>
                  <div>
                    <h2 className="text-3xl font-black uppercase italic tracking-tight text-ink-d1 leading-none mb-1">
                      {selectedStudio.name}
                    </h2>
                    <span className="text-[11px] font-bold text-zinc-500 uppercase tracking-widest">
                      Station Security ID: {selectedStudio.id}
                    </span>
                  </div>
                </div>
              </div>
              <div>
                <Badge className="bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 uppercase tracking-widest text-[11px] font-black py-1 px-3 rounded-full">
                  Territory Active
                </Badge>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-10">
              {/* Studio Config and Role Assignment (Super / Franchise Owner Level) */}
              <div className="lg:col-span-2 space-y-8">
                <Card className="rounded-[32px] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm relative overflow-hidden">
                  <div className="absolute top-0 right-0 w-32 h-32 bg-[#F06C22]/5 filter blur-3xl rounded-full" />
                  <CardHeader className="p-8 border-b border-slate-100 dark:border-slate-800 flex flex-row items-center gap-4">
                    <span className="w-10 h-10 bg-[#F06C22]/15 border border-[#F06C22]/20 rounded-xl flex items-center justify-center text-[#F06C22] shrink-0">
                      <BadgeInfo className="w-5 h-5" />
                    </span>
                    <div>
                      <CardTitle className="text-lg font-black uppercase tracking-wider text-slate-900 dark:text-white">
                        Studio Infrastructure Setup
                      </CardTitle>
                      <CardDescription className="text-slate-500 dark:text-slate-400 text-[11px] uppercase font-bold tracking-widest mt-0.5">
                        Parameters synchronizing physical location and systems
                      </CardDescription>
                    </div>
                  </CardHeader>
                  <CardContent className="p-8">
                    <form
                      onSubmit={handleUpdateStudioMetadata}
                      className="grid grid-cols-1 md:grid-cols-2 gap-6"
                    >
                      <div className="space-y-2">
                        <Label className="text-[11px] font-black uppercase tracking-widest text-[#F06C22] ml-1">
                          Site Display Name
                        </Label>
                        <Input
                          name="name"
                          defaultValue={selectedStudio.name}
                          className="bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white rounded-2xl h-12 focus:border-[#F06C22] focus:ring-0 font-bold"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label className="text-[11px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400 ml-1">
                          Business Email
                        </Label>
                        <Input
                          name="contactEmail"
                          defaultValue={selectedStudio.contactEmail}
                          className="bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white rounded-2xl h-12 font-bold focus:border-[#F06C22]"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label className="text-[11px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400 ml-1">
                          Phone Number
                        </Label>
                        <Input
                          name="phone"
                          defaultValue={selectedStudio.phone}
                          className="bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white rounded-2xl h-12 font-bold focus:border-[#F06C22]"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label className="text-[11px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400 ml-1">
                          Operating Timezone
                        </Label>
                        <Input
                          name="timezone"
                          defaultValue={selectedStudio.timezone}
                          className="bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white rounded-2xl h-12 font-bold focus:border-[#F06C22]"
                        />
                      </div>
                      <div className="md:col-span-2 space-y-2">
                        <Label className="text-[11px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400 ml-1">
                          Physical Address
                        </Label>
                        <Input
                          name="address"
                          defaultValue={selectedStudio.address}
                          className="bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white rounded-2xl h-12 font-bold focus:border-[#F06C22]"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label className="text-[11px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400 ml-1">
                          MindBody Site ID
                        </Label>
                        <Input
                          name="mindbodySiteId"
                          defaultValue={selectedStudio.mindbodySiteId}
                          className="bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white rounded-2xl h-12 font-bold focus:border-[#F06C22]"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label className="text-[11px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400 ml-1">
                          Location Type
                        </Label>
                        <Select
                          name="locationType"
                          defaultValue={
                            selectedStudio.locationType || "franchise"
                          }
                        >
                          <SelectTrigger className="bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white rounded-2xl h-12 font-bold focus:border-[#F06C22]">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white">
                            <SelectItem value="corporate" className="font-bold">
                              Corporate Owned
                            </SelectItem>
                            <SelectItem value="franchise" className="font-bold">
                              Franchised
                            </SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="space-y-2">
                        <Label className="text-[11px] font-black uppercase tracking-widest text-[#F06C22] ml-1">
                          Brand Accent Color
                        </Label>
                        <div className="flex items-center gap-2">
                          <Input
                            type="color"
                            defaultValue={
                              selectedStudio.brandColor || "#F37427"
                            }
                            onChange={(e) => {
                              const input = e.target.form?.elements.namedItem(
                                "brandColor",
                              ) as HTMLInputElement;
                              if (input) input.value = e.target.value;
                            }}
                            className="p-1 h-12 w-16 bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 rounded-2xl cursor-pointer"
                          />
                          <Input
                            name="brandColor"
                            defaultValue={
                              selectedStudio.brandColor || "#F37427"
                            }
                            className="bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white rounded-2xl h-12 font-mono text-sm focus:border-[#F06C22] flex-1"
                            placeholder="#F37427"
                          />
                        </div>
                      </div>

                      <div className="md:col-span-2 pt-6 border-t border-slate-100 dark:border-slate-800 flex justify-between items-center">
                        <Button
                          type="button"
                          variant="destructive"
                          onClick={() =>
                            selectedStudio.id &&
                            handleDeleteStudio(selectedStudio.id)
                          }
                          className="font-black uppercase tracking-widest text-[11px] h-12 px-6 rounded-2xl cursor-pointer"
                        >
                          <Trash2 className="w-4 h-4 mr-2" /> Delete Studio
                        </Button>
                        <Button
                          type="submit"
                          disabled={isSaving}
                          className="bg-[#F06C22] hover:bg-[#D95B16] text-white font-black uppercase tracking-widest text-xs h-12 px-8 rounded-2xl shadow-md cursor-pointer"
                        >
                          {isSaving ? (
                            "Saving Configurations..."
                          ) : (
                            <div className="flex items-center gap-2">
                              <Save className="w-4 h-4" />
                              Synchronize Systems
                            </div>
                          )}
                        </Button>
                      </div>
                    </form>
                  </CardContent>
                </Card>
              </div>

              {/* Sidebar Stats and Control Metrics */}
              <div className="space-y-6">
                <Card className="rounded-[28px] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 space-y-6 shadow-sm">
                  <div className="flex items-center gap-2 text-[#F06C22] border-b border-slate-100 dark:border-slate-800 pb-4">
                    <ShieldCheck className="w-5 h-5" />
                    <span className="text-xs font-black uppercase tracking-widest">
                      Studio Quick Stats
                    </span>
                  </div>

                  <div className="space-y-4">
                    <div>
                      <p className="text-[11px] font-black uppercase tracking-widest text-[#F06C22]">
                        Home Base Staff
                      </p>
                      <p className="text-2xl font-black text-slate-900 dark:text-white tracking-widest mt-0.5">
                        {
                          trainers.filter(
                            (t) => t.primaryHomeStudioId === selectedStudio.id,
                          ).length
                        }
                      </p>
                      <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400 leading-normal uppercase mt-1">
                        Trainers designated natively to this specific home
                        location.
                      </p>
                    </div>

                    <div className="pt-4 border-t border-slate-100 dark:border-slate-800">
                      <p className="text-[11px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400">
                        Cross-Training Access
                      </p>
                      <p className="text-2xl font-black text-rose-500 dark:text-rose-400 tracking-widest mt-0.5">
                        {
                          trainers.filter(
                            (t) =>
                              t.accessibleStudioIds?.includes(
                                selectedStudio.id,
                              ) && t.primaryHomeStudioId !== selectedStudio.id,
                          ).length
                        }
                      </p>
                      <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400 leading-normal uppercase mt-1">
                        Affiliated trainers with authorized cross-studio client
                        permissions.
                      </p>
                    </div>
                  </div>
                </Card>
              </div>
            </div>
          </motion.div>
        ) : (
          <div className="space-y-8">
            {/* Tab Swappers */}
            <div className="flex bg-slate-100 dark:bg-slate-900 p-1.5 rounded-2xl sm:rounded-[22px] max-w-md border border-slate-200 dark:border-slate-800 shadow-sm">
              <button
                onClick={() => setActiveTab("networks")}
                className={cn(
                  "flex-1 py-2.5 sm:py-3 text-[10px] sm:text-xs font-black uppercase tracking-wider rounded-xl transition-all cursor-pointer",
                  activeTab === "networks"
                    ? "bg-white dark:bg-slate-800 text-[#F06C22] dark:text-[#F06C22] shadow-sm border border-slate-200 dark:border-slate-700"
                    : "text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white",
                )}
              >
                Franchise Networks
              </button>
              <button
                onClick={() => setActiveTab("studios")}
                className={cn(
                  "flex-1 py-2.5 sm:py-3 text-[10px] sm:text-xs font-black uppercase tracking-wider rounded-xl transition-all cursor-pointer",
                  activeTab === "studios"
                    ? "bg-white dark:bg-slate-800 text-[#F06C22] dark:text-[#F06C22] shadow-sm border border-slate-200 dark:border-slate-700"
                    : "text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white",
                )}
              >
                Location Registry
              </button>
            </div>

            {/* TAB 1: FRANCHISE NETWORKS */}
            {activeTab === "networks" && (
              <div className="space-y-12">
                {/* Network Builder (Super Admin or Franchise Owner) */}
                {(isAdmin ||
                  authTrainer.role === "FranchiseOwner" ||
                  authTrainer.role === "Admin") && (
                  <Card className="rounded-2xl sm:rounded-[32px] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 sm:p-8 relative overflow-hidden shadow-sm">
                    <div className="absolute top-0 left-0 w-1.5 h-full bg-[#F06C22]" />
                    <div className="flex items-center gap-3 mb-6">
                      <div className="w-10 h-10 rounded-xl bg-[#F06C22]/10 border border-[#F06C22]/20 flex items-center justify-center text-[#F06C22] shrink-0">
                        <Flame className="w-5 h-5" />
                      </div>
                      <div>
                        <h3 className="text-lg sm:text-xl font-black uppercase italic tracking-tight text-slate-900 dark:text-white leading-none">
                          Regional Franchise Builder
                        </h3>
                        <p className="text-[10px] sm:text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest mt-1">
                          Bootstrap new regional networks and link territories
                          under single ownership
                        </p>
                      </div>
                    </div>

                    <form
                      onSubmit={handleCreateNetwork}
                      className="grid grid-cols-1 md:grid-cols-4 gap-4 sm:gap-6 items-end"
                    >
                      <div className="space-y-2">
                        <Label className="text-[11px] font-black uppercase tracking-widest text-[#F06C22]">
                          Franchise Name
                        </Label>
                        <Input
                          placeholder="e.g. Max Strength Northeast Ohio"
                          value={newNetworkName}
                          onChange={(e) => setNewNetworkName(e.target.value)}
                          className="bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white rounded-xl h-11 sm:h-12 focus:border-[#F06C22] font-semibold placeholder:text-slate-400"
                        />
                      </div>

                      <div className="space-y-2">
                        <Label className="text-[11px] font-black uppercase tracking-widest text-[#F06C22]">
                          State
                        </Label>
                        <Input
                          placeholder="e.g. Ohio"
                          value={newNetworkState}
                          onChange={(e) => setNewNetworkState(e.target.value)}
                          className="bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white rounded-xl h-11 sm:h-12 focus:border-[#F06C22] font-semibold placeholder:text-slate-400"
                        />
                      </div>

                      <div className="space-y-2">
                        <Label className="text-[11px] font-black uppercase tracking-widest text-[#F06C22]">
                          Franchise Principals (Owners)
                        </Label>
                        <Select
                          value={""}
                          onValueChange={(id) => {
                            if (!newNetworkOwnerIds.includes(id)) {
                              setNewNetworkOwnerIds([
                                ...newNetworkOwnerIds,
                                id,
                              ]);
                            }
                          }}
                        >
                          <SelectTrigger className="bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white h-11 sm:h-12 rounded-xl font-bold">
                            <SelectValue
                              placeholder={
                                newNetworkOwnerIds.length > 0
                                  ? `${newNetworkOwnerIds.length} Owner(s) Selected`
                                  : "Select Owners"
                              }
                            />
                          </SelectTrigger>
                          <SelectContent className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white max-h-60 overflow-y-auto">
                            {trainers
                              .filter(
                                (t) =>
                                  t.role === "FranchiseOwner" ||
                                  t.role === "Owner" ||
                                  t.role === "StudioOwner" ||
                                  t.role === "Admin",
                              )
                              .map((t) => (
                                <SelectItem key={t.id} value={t.id!}>
                                  {t.fullName} ({t.role})
                                </SelectItem>
                              ))}
                          </SelectContent>
                        </Select>
                        {/* Display selected owners as chips */}
                        {newNetworkOwnerIds.length > 0 && (
                          <div className="flex flex-wrap gap-2 mt-2">
                            {newNetworkOwnerIds.map((id) => {
                              const t = trainers.find((tr) => tr.id === id);
                              return (
                                <Badge
                                  key={id}
                                  onClick={() =>
                                    setNewNetworkOwnerIds(
                                      newNetworkOwnerIds.filter(
                                        (oid) => oid !== id,
                                      ),
                                    )
                                  }
                                  className="cursor-pointer bg-slate-200 dark:bg-slate-800 text-slate-800 dark:text-slate-200 hover:bg-slate-300 dark:hover:bg-slate-700 text-xs"
                                >
                                  {t?.fullName || id} &times;
                                </Badge>
                              );
                            })}
                          </div>
                        )}
                      </div>

                      <Button
                        type="submit"
                        disabled={isSaving}
                        className="bg-[#F06C22] hover:bg-[#D95B16] text-white font-black uppercase tracking-widest text-xs h-11 sm:h-12 rounded-xl shadow-md flex items-center justify-center gap-2 cursor-pointer"
                      >
                        <Sparkles className="w-4 h-4" />
                        Incorporate Network
                      </Button>
                    </form>
                  </Card>
                )}

                {/* Networks grid list */}
                <div className="space-y-6">
                  <div className="flex items-center justify-between pb-2 border-b border-slate-200 dark:border-slate-800">
                    <h3 className="text-xs sm:text-sm font-black uppercase tracking-widest text-slate-600 dark:text-slate-400 italic">
                      Active Incorporated Networks ({networks.length})
                    </h3>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6 sm:gap-8">
                    {[...networks]
                      .sort((a, b) =>
                        (a.state || "").localeCompare(b.state || ""),
                      )
                      .map((network) => {
                        const regionalOwners = network.ownerIds
                          ? trainers.filter((t) =>
                              network.ownerIds!.includes(t.id!),
                            )
                          : network.ownerId
                            ? [
                                trainers.find(
                                  (t) =>
                                    t.id === network.ownerId ||
                                    t.fullName === network.ownerId,
                                ),
                              ].filter(Boolean)
                            : [];
                        const assignedStudios = allStudios.filter(
                          (s) =>
                            network.studioIds?.includes(s.id!) ||
                            s.networkId === network.id,
                        );

                        return (
                          <Card
                            key={network.id}
                            className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl sm:rounded-[28px] overflow-hidden flex flex-col justify-between p-5 sm:p-6 relative shadow-sm"
                          >
                            <div className="absolute top-0 left-0 w-full h-1 bg-linear-to-r from-[#F06C22]/60 to-transparent" />

                            <div className="space-y-4">
                              <div className="flex items-center justify-between">
                                <div>
                                  <h4 className="text-lg sm:text-xl font-extrabold uppercase italic tracking-tight text-slate-900 dark:text-white">
                                    {network.name}
                                  </h4>
                                  <div className="flex items-center gap-2 mt-0.5">
                                    <p className="text-[10px] sm:text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest">
                                      REGIONAL FRANCHISE NETWORK
                                    </p>
                                    {network.state && (
                                      <Badge
                                        variant="outline"
                                        className="text-[10px] sm:text-[11px] tracking-widest border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300"
                                      >
                                        {network.state}
                                      </Badge>
                                    )}
                                  </div>
                                </div>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() =>
                                    handleDeleteNetwork(network.id)
                                  }
                                  className="w-8 h-8 rounded-lg text-slate-400 hover:text-rose-500 hover:bg-rose-500/10 transition-colors cursor-pointer"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </Button>
                              </div>

                              <div className="flex items-center gap-2 bg-slate-50 dark:bg-slate-950 p-3 rounded-xl border border-slate-200 dark:border-slate-800">
                                <Crown className="w-4 h-4 text-amber-500 shrink-0" />
                                <div className="text-left w-full">
                                  <p className="text-[10px] sm:text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest leading-none mb-1">
                                    Franchise Principals
                                  </p>
                                  <div className="flex flex-wrap gap-1 mt-1">
                                    {regionalOwners.length > 0 ? (
                                      regionalOwners.map((ro) => (
                                        <Badge
                                          key={ro?.id}
                                          variant="secondary"
                                          className="bg-slate-200 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white text-[11px]"
                                        >
                                          {ro?.fullName || "Unknown"}
                                        </Badge>
                                      ))
                                    ) : (
                                      <p className="text-xs font-black text-slate-900 dark:text-white uppercase leading-none">
                                        Jeff (HQ)
                                      </p>
                                    )}
                                  </div>
                                </div>
                              </div>

                              {/* Linked Studios */}
                              <div className="space-y-2 pt-2">
                                <p className="text-[11px] font-bold text-[#F06C22] uppercase tracking-widest">
                                  Incorporated Studios ({assignedStudios.length}
                                  )
                                </p>
                                <div className="space-y-1.5">
                                  {assignedStudios.map((studio) => (
                                    <div
                                      key={studio.id}
                                      className="flex items-center justify-between bg-slate-50 dark:bg-slate-950 px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800"
                                    >
                                      <span className="text-xs font-bold uppercase text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                                        <Building2 className="w-3.5 h-3.5 text-[#F06C22]" />
                                        {studio.name}
                                      </span>
                                      <Button
                                        variant="ghost"
                                        onClick={() =>
                                          handleUnlinkStudio(
                                            network.id,
                                            studio.id!,
                                          )
                                        }
                                        className="text-[#F06C22] hover:text-[#F06C22]/80 font-black uppercase text-[11px] tracking-widest px-2.5 py-1 rounded h-auto flex items-center gap-1 hover:bg-[#F06C22]/10 cursor-pointer"
                                      >
                                        <Unlink2 className="w-3 h-3" />
                                        Unlink
                                      </Button>
                                    </div>
                                  ))}

                                  {assignedStudios.length === 0 && (
                                    <p className="text-[11px] text-slate-400 font-bold uppercase tracking-widest py-1 italic">
                                      No physical locations linked.
                                    </p>
                                  )}
                                </div>
                              </div>
                            </div>

                            {/* Link studio selection to this network */}
                            {independentStudios.length > 0 && (
                              <div className="pt-4 mt-6 border-t border-slate-200 dark:border-slate-800">
                                <p className="text-[11px] font-black uppercase tracking-widest text-[#F06C22] mb-2 leading-none">
                                  Link Independent Location:
                                </p>
                                <Select
                                  onValueChange={(studioId: string) =>
                                    handleLinkStudio(
                                      network.id as string,
                                      studioId,
                                    )
                                  }
                                >
                                  <SelectTrigger className="bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white h-10 rounded-xl text-[11px] font-black uppercase tracking-wider">
                                    <SelectValue placeholder="Add Independent Location" />
                                  </SelectTrigger>
                                  <SelectContent className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white">
                                    {independentStudios.map((s) => (
                                      <SelectItem key={s.id} value={s.id!}>
                                        {s.name}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </div>
                            )}
                          </Card>
                        );
                      })}

                    {networks.length === 0 && (
                      <div className="col-span-full py-16 sm:py-20 text-center bg-slate-50 dark:bg-slate-900/40 rounded-2xl sm:rounded-[40px] border border-dashed border-slate-200 dark:border-slate-800">
                        <Network className="w-10 h-10 sm:w-12 sm:h-12 text-slate-400 dark:text-slate-600 mx-auto mb-4" />
                        <p className="text-xs sm:text-sm font-black uppercase tracking-widest text-slate-500 dark:text-slate-400">
                          No active regional network commands incorporated
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* TAB 2: STUDIO LOCATION REGISTRY */}
            {activeTab === "studios" && (
              <div className="space-y-6">
                {(isAdmin ||
                  authTrainer.role === "Founder" ||
                  authTrainer.role === "Admin") && (
                  <Card className="rounded-2xl sm:rounded-[32px] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 sm:p-8 relative overflow-hidden mb-8 shadow-sm">
                    <div className="absolute top-0 left-0 w-1.5 h-full bg-[#F06C22]" />
                    <div className="flex items-center gap-3 mb-6">
                      <div className="w-10 h-10 rounded-xl bg-[#F06C22]/10 border border-[#F06C22]/20 flex items-center justify-center text-[#F06C22] shrink-0">
                        <Building2 className="w-5 h-5" />
                      </div>
                      <div>
                        <h3 className="text-lg sm:text-xl font-black uppercase italic tracking-tight text-slate-900 dark:text-white leading-none">
                          Studio Location Registry
                        </h3>
                        <p className="text-[10px] sm:text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest mt-1">
                          Register new physical clinic locations into the
                          platform
                        </p>
                      </div>
                    </div>

                    <form
                      onSubmit={handleCreateStudio}
                      className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-6 items-end"
                    >
                      <div className="space-y-2 relative">
                        <Label className="text-[11px] font-black uppercase tracking-widest text-[#F06C22]">
                          Physical Location Name
                        </Label>
                        <Input
                          placeholder="e.g. Max Strength Chardon"
                          value={newStudioName}
                          onChange={(e) => setNewStudioName(e.target.value)}
                          className="bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white rounded-xl h-11 sm:h-12 focus:border-[#F06C22] font-semibold placeholder:text-slate-400"
                        />
                      </div>

                      <div className="space-y-2 relative">
                        <Label className="text-[11px] font-black uppercase tracking-widest text-[#F06C22]">
                          Mindbody Site ID (Required & Unique)
                        </Label>
                        <Input
                          placeholder="e.g. 12345"
                          value={newStudioSiteId}
                          onChange={(e) => setNewStudioSiteId(e.target.value)}
                          className="bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white rounded-xl h-11 sm:h-12 focus:border-[#F06C22] font-semibold placeholder:text-slate-400"
                        />
                      </div>

                      <Button
                        type="submit"
                        disabled={isSaving}
                        className="bg-[#F06C22] hover:bg-[#D95B16] text-white font-black uppercase tracking-widest text-xs h-11 sm:h-12 rounded-xl shadow-md flex items-center justify-center gap-2 cursor-pointer"
                      >
                        <Building2 className="w-4 h-4" />
                        Incorporate Location
                      </Button>
                    </form>
                  </Card>
                )}

                <h3 className="text-xs sm:text-sm font-black uppercase tracking-widest text-slate-600 dark:text-slate-400 italic pb-2 border-b border-slate-200 dark:border-slate-800">
                  Location Registry ({manageableStudios.length} Physical
                  Locations)
                </h3>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
                  {manageableStudios.map((studio) => {
                    const parentNetwork = networks.find(
                      (n) =>
                        n.studioIds?.includes(studio.id!) ||
                        studio.networkId === n.id,
                    );
                    const staffRoster = getStaffForStudio(studio.id!);

                    return (
                      <div
                        key={studio.id}
                        onClick={() => setSelectedStudioId(studio.id!)}
                        className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl sm:rounded-[28px] p-5 sm:p-6 shadow-sm flex flex-col justify-between min-h-60 relative overflow-hidden cursor-pointer hover:border-[#F06C22] transition-all group"
                      >
                        <div className="absolute top-0 left-0 w-full h-1 bg-linear-to-r from-transparent via-slate-200 dark:via-slate-800 to-transparent group-hover:via-[#F06C22] transition-colors" />
                        <div>
                          <div className="flex items-center justify-between mb-4">
                            <span className="w-8 h-8 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center border border-slate-200 dark:border-slate-700 text-[#F06C22] group-hover:bg-[#F06C22] group-hover:text-white transition-colors">
                              <Building2 className="w-4 h-4" />
                            </span>
                            {parentNetwork ? (
                              <span className="text-[10px] sm:text-[11px] font-black uppercase bg-[#F06C22]/15 text-[#F06C22] px-2.5 py-0.5 rounded-full border border-[#F06C22]/20">
                                {parentNetwork.name}
                              </span>
                            ) : (
                              <span className="text-[10px] sm:text-[11px] font-black uppercase bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 px-2.5 py-0.5 rounded-full border border-slate-200 dark:border-slate-700">
                                Independent Clinic
                              </span>
                            )}
                          </div>

                          <h4 className="font-extrabold uppercase italic tracking-tight text-base sm:text-lg text-slate-900 dark:text-white mb-1 leading-none group-hover:text-[#F06C22] transition-colors">
                            {studio.name}
                          </h4>
                          <div className="flex items-center gap-1.5 text-slate-500 dark:text-slate-400 mb-6 mt-2">
                            <MapPin className="w-3.5 h-3.5 shrink-0 text-[#F06C22]" />
                            <span className="text-[10px] sm:text-[11px] font-bold uppercase tracking-wider truncate">
                              {studio.address || "Address Not Configured"}
                            </span>
                          </div>
                        </div>

                        {/* Staff count footer */}
                        <div className="border-t border-slate-100 dark:border-slate-800 pt-4 flex items-center justify-between">
                          <span className="text-[10px] sm:text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest">
                            AUTHORIZED STAFF:
                          </span>
                          <span className="text-sm font-black text-slate-900 dark:text-white">
                            {staffRoster.length}
                          </span>
                        </div>
                      </div>
                    );
                  })}

                  {manageableStudios.length === 0 && (
                    <div className="col-span-full py-20 text-center bg-slate-900/40 rounded-[40px] border border-dashed border-slate-850/80">
                      <Building2 className="w-12 h-12 text-slate-850 mx-auto mb-4" />
                      <p className="text-sm font-black uppercase tracking-widest text-zinc-400">
                        No manageable studio locations found under your
                        authorization
                      </p>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      <StrongConfirmationModal
        isOpen={!!studioToDelete}
        title="Delete Studio Location"
        description={`Are you absolutely sure you want to delete the studio "${studioToDelete?.name || ""}"? This action cannot be undone and will permanently erase all associated data.`}
        confirmationPhrase="DELETE STUDIO"
        onConfirm={performStudioDelete}
        onCancel={() => setStudioToDelete(null)}
      />

      <StrongConfirmationModal
        isOpen={!!networkToDelete}
        title="Disband Regional Command"
        description={`Are you absolutely sure you want to disband the franchise network "${networkToDelete?.name || ""}"? This will unlink ${networkToDelete?.studioIds?.length || 0} associated studio locations.`}
        confirmationPhrase="DISBAND NETWORK"
        onConfirm={performNetworkDelete}
        onCancel={() => setNetworkToDelete(null)}
      />
    </div>
  );
}
