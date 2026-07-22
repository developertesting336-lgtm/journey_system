import React, { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  Building2,
  ChevronLeft,
  MapPin,
  CheckCircle2,
  Lock,
  ArrowRight,
  Loader2,
} from "lucide-react";
import { Studio, FranchiseNetwork, Trainer } from "../types";
import { Button } from "@/components/ui/button";
import { MaxStrengthLogo } from "./MaxStrengthLogo";
import { db } from "../firebase";
import {
  collection,
  addDoc,
  serverTimestamp,
  query,
  where,
  getDocs,
  doc,
  updateDoc,
} from "firebase/firestore";
import { useToast } from "../contexts/ToastContext";
import { Shield } from "lucide-react";
import { isStudioLeader } from "../lib/permissions";

interface StudioSelectionViewProps {
  studios: Studio[];
  networks?: FranchiseNetwork[];
  trainers?: Trainer[];
  authTrainer?: Trainer;
  onSelectTrainer: (trainer: Trainer, studioId: string) => void;
  onGoToAdmin?: () => void;
  onBack: () => void;
}

export function StudioSelectionView({
  studios,
  networks = [],
  trainers = [],
  authTrainer,
  onSelectTrainer,
  onGoToAdmin,
  onBack,
}: StudioSelectionViewProps) {
  const { success: toastSuccess, error: toastError } = useToast();
  const [requestingStudioId, setRequestingStudioId] = useState<string | null>(
    null,
  );
  const [requestedStudios, setRequestedStudios] = useState<Set<string>>(
    new Set(),
  );

  const isAdminUser =
    isStudioLeader(authTrainer || null) ||
    authTrainer?.role === "Admin" ||
    authTrainer?.role === "Founder" ||
    authTrainer?.role === "Overseer" ||
    authTrainer?.email === "developertesting336@gmail.com";

  // Check if we've already requested access on mount
  React.useEffect(() => {
    if (!authTrainer?.id) return;

    const checkRequests = async () => {
      try {
        const q = query(
          collection(db, "access_requests"),
          where("trainerId", "==", authTrainer.id),
          where("type", "==", "studio_access"),
          where("status", "==", "Pending"),
        );
        const snap = await getDocs(q);
        const requestedVars = new Set<string>();
        snap.forEach((doc) => {
          if (doc.data().studioId) requestedVars.add(doc.data().studioId);
        });
        setRequestedStudios(requestedVars);
      } catch (err) {
        console.error("Error fetching access requests:", err);
      }
    };
    checkRequests();
  }, [authTrainer?.id]);

  const handleRequestAccess = async (studio: Studio) => {
    if (!authTrainer || !studio.id) return;

    setRequestingStudioId(studio.id);

    try {
      await addDoc(collection(db, "access_requests"), {
        type: "studio_access",
        trainerId: authTrainer.id,
        trainerName: authTrainer.fullName,
        studioId: studio.id,
        studioName: studio.name,
        status: "Pending",
        createdAt: serverTimestamp(),
      });

      setRequestedStudios((prev) => new Set(prev).add(studio.id!));
      toastSuccess(`Access request to ${studio.name} sent successfully.`);
    } catch (err) {
      console.error("Failed to request access:", err);
      toastError("Failed to send access request. Please try again.");
    } finally {
      setRequestingStudioId(null);
    }
  };

  // Group studios by Network ID
  const groupedStudios = React.useMemo(() => {
    const networkMap: Record<string, Studio[]> = {};
    const unassociated: Studio[] = [];

    studios.forEach((studio) => {
      // Find space network association either by studio.networkId, or if it lies in network.studioIds
      const parentNet = networks.find((net) =>
        net.studioIds.includes(studio.id || ""),
      );
      if (parentNet) {
        if (!networkMap[parentNet.id]) {
          networkMap[parentNet.id] = [];
        }
        networkMap[parentNet.id].push(studio);
      } else if (
        studio.networkId &&
        networks.some((n) => n.id === studio.networkId)
      ) {
        if (!networkMap[studio.networkId]) {
          networkMap[studio.networkId] = [];
        }
        networkMap[studio.networkId].push(studio);
      } else {
        unassociated.push(studio);
      }
    });

    return { networkMap, unassociated };
  }, [studios, networks]);

  const hasAccessToStudio = (studioId: string) => {
    if (!authTrainer) return false;
    return (
      authTrainer.primaryHomeStudioId === studioId ||
      authTrainer.accessibleStudioIds?.includes(studioId) ||
      authTrainer.activeGuestStudioIds?.includes(studioId) ||
      authTrainer.role === "Admin" ||
      authTrainer.role === "Founder" ||
      authTrainer.role === "Overseer"
    );
  };

  return (
    <div className="min-h-screen bg-bg-dark-2 flex flex-col items-center justify-start p-6 md:p-12 text-ink-d1">
      <motion.div
        initial={{ opacity: 0, scale: 0.98 }}
        animate={{ opacity: 1, scale: 1 }}
        className="w-full max-w-5xl"
      >
        <div className="text-center mb-10 flex flex-col items-center">
          <MaxStrengthLogo size="xl" className="mb-6" />
          <h2 className="text-3xl font-black uppercase italic tracking-tight text-ink-d1 mb-2 leading-none">
            Enterprise Station Entry
          </h2>
          <p className="text-zinc-500 font-bold uppercase tracking-widest text-[11px] max-w-md mt-1">
            Choose your active territory for this session
          </p>
          {isAdminUser && onGoToAdmin && (
            <Button
              onClick={onGoToAdmin}
              className="mt-4 bg-slate-800 hover:bg-slate-700 text-white font-bold uppercase text-[11px] tracking-widest px-4 h-9 rounded-xl border border-slate-700 flex items-center gap-2 cursor-pointer shadow-md"
            >
              <Shield className="w-3.5 h-3.5 text-[#F06C22]" /> Go To Admin Panel
            </Button>
          )}
        </div>

        {/* Render grouped/networked studios */}
        <div className="space-y-12">
          {networks.map((network) => {
            const networkStudios = groupedStudios.networkMap[network.id] || [];
            if (networkStudios.length === 0) return null;

            return (
              <div key={network.id} className="space-y-4">
                <div className="flex items-center gap-3 border-b border-slate-800 pb-2">
                  <div className="w-1.5 h-6 bg-[#F06C22] rounded-full" />
                  <div>
                    <h3 className="text-xs font-black uppercase tracking-widest text-[#F06C22] italic">
                      {network.name}
                    </h3>
                    <p className="text-[11px] font-bold text-zinc-550 uppercase tracking-widest leading-none mt-0.5">
                      Franchise System Territory
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {networkStudios.map((studio) => {
                    const hasAccess = hasAccessToStudio(studio.id || "");
                    const isRequested = requestedStudios.has(studio.id || "");
                    const isRequesting = requestingStudioId === studio.id;

                    return (
                      <div
                        key={studio.id}
                        className="bg-bg-dark-2 border border-slate-800/80 rounded-[28px] p-6 shadow-xl flex flex-col justify-between min-h-55 relative overflow-hidden"
                      >
                        <div className="absolute top-0 left-0 w-full h-1 bg-linear-to-r from-[#F06C22]/40 to-transparent" />
                        <div>
                          <div className="flex items-center justify-between mb-4">
                            <span className="w-8 h-8 rounded-lg bg-bg-dark-2 flex items-center justify-center border border-slate-800 text-zinc-400">
                              <Building2 className="w-4 h-4" />
                            </span>
                            <span className="text-[11px] font-black uppercase bg-[#F06C22]/10 text-[#F06C22] px-2 py-0.5 rounded-full border border-[#F06C22]/15">
                              Active
                            </span>
                          </div>

                          <h4 className="font-extrabold uppercase italic tracking-tight text-lg text-ink-d1 mb-1 leading-none">
                            {studio.name}
                          </h4>
                          <div className="flex items-center gap-1 text-zinc-500 mb-6">
                            <MapPin className="w-3 h-3 shrink-0" />
                            <span className="text-[11px] font-bold uppercase tracking-wider truncate">
                              {studio.address || "Active Territory"}
                            </span>
                          </div>
                        </div>

                        <div className="border-t border-slate-800/80 pt-4 mt-2">
                          {hasAccess ? (
                            <Button
                              onClick={() => {
                                if (authTrainer && studio.id)
                                  onSelectTrainer(authTrainer, studio.id);
                              }}
                              className="w-full bg-[#F06C22] hover:bg-[#F06C22]/90 text-ink-d1 font-black uppercase tracking-widest text-xs h-10 rounded-xl flex items-center justify-center gap-2"
                            >
                              Enter Studio <ArrowRight className="w-4 h-4" />
                            </Button>
                          ) : isRequested ? (
                            <Button
                              disabled
                              className="w-full bg-bg-dark-3 text-ink-d3 font-black uppercase tracking-widest text-xs h-10 rounded-xl flex items-center justify-center gap-2 cursor-not-allowed"
                            >
                              <CheckCircle2 className="w-4 h-4" /> Access
                              Requested
                            </Button>
                          ) : (
                            <Button
                              onClick={() => handleRequestAccess(studio)}
                              disabled={isRequesting}
                              className="w-full bg-bg-dark-3/50 hover:bg-bg-dark-3 text-slate-300 font-bold uppercase tracking-widest text-[11px] h-10 rounded-xl flex items-center justify-center gap-2 border border-div-d/50"
                            >
                              {isRequesting ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                              ) : (
                                <Lock className="w-3 h-3" />
                              )}
                              Request Access
                            </Button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}

          {/* Render Independent / Unassociated studios */}
          {groupedStudios.unassociated.length > 0 && (
            <div className="space-y-4">
              <div className="flex items-center gap-3 border-b border-slate-800 pb-2">
                <div className="w-1.5 h-6 bg-zinc-700 rounded-full" />
                <div>
                  <h3 className="text-xs font-black uppercase tracking-widest text-zinc-500 italic">
                    Independent Locations
                  </h3>
                  <p className="text-[11px] font-bold text-zinc-550 uppercase tracking-widest leading-none mt-0.5">
                    Unassociated Franchise Bases
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {groupedStudios.unassociated.map((studio) => {
                  const hasAccess = hasAccessToStudio(studio.id || "");
                  const isRequested = requestedStudios.has(studio.id || "");
                  const isRequesting = requestingStudioId === studio.id;

                  return (
                    <div
                      key={studio.id}
                      className="bg-bg-dark-2 border border-slate-800/80 rounded-[28px] p-6 shadow-xl flex flex-col justify-between min-h-55 relative overflow-hidden"
                    >
                      <div className="absolute top-0 left-0 w-full h-1 bg-linear-to-r from-zinc-750/40 to-transparent" />
                      <div>
                        <div className="flex items-center justify-between mb-4">
                          <span className="w-8 h-8 rounded-lg bg-bg-dark-2 flex items-center justify-center border border-slate-800 text-zinc-400">
                            <Building2 className="w-4 h-4" />
                          </span>
                          <span className="text-[11px] font-black uppercase bg-zinc-800 text-zinc-400 px-2 py-0.5 rounded-full border border-zinc-700/30">
                            Standalone
                          </span>
                        </div>

                        <h4 className="font-extrabold uppercase italic tracking-tight text-lg text-ink-d1 mb-1 leading-none">
                          {studio.name}
                        </h4>
                        <div className="flex items-center gap-1 text-zinc-500 mb-6">
                          <MapPin className="w-3 h-3 shrink-0" />
                          <span className="text-[11px] font-bold uppercase tracking-wider truncate">
                            {studio.address || "Independent Clinic"}
                          </span>
                        </div>
                      </div>

                      <div className="border-t border-slate-800/80 pt-4 mt-2">
                        {hasAccess ? (
                          <Button
                            onClick={() => {
                              if (authTrainer && studio.id)
                                onSelectTrainer(authTrainer, studio.id);
                            }}
                            className="w-full bg-[#F06C22] hover:bg-[#F06C22]/90 text-ink-d1 font-black uppercase tracking-widest text-xs h-10 rounded-xl flex items-center justify-center gap-2"
                          >
                            Enter Studio <ArrowRight className="w-4 h-4" />
                          </Button>
                        ) : isRequested ? (
                          <Button
                            disabled
                            className="w-full bg-bg-dark-3 text-ink-d3 font-black uppercase tracking-widest text-xs h-10 rounded-xl flex items-center justify-center gap-2 cursor-not-allowed"
                          >
                            <CheckCircle2 className="w-4 h-4" /> Access
                            Requested
                          </Button>
                        ) : (
                          <Button
                            onClick={() => handleRequestAccess(studio)}
                            disabled={isRequesting}
                            className="w-full bg-bg-dark-3/50 hover:bg-bg-dark-3 text-slate-300 font-bold uppercase tracking-widest text-[11px] h-10 rounded-xl flex items-center justify-center gap-2 border border-div-d/50"
                          >
                            {isRequesting ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              <Lock className="w-3 h-3" />
                            )}
                            Request Access
                          </Button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {studios.length === 0 && (
            <div className="py-20 px-6 text-center bg-bg-dark-2/60 rounded-[40px] border border-dashed border-slate-800 flex flex-col items-center justify-center gap-4">
              <Building2 className="w-12 h-12 text-[#F06C22] mx-auto" />
              <div>
                <p className="text-base font-black uppercase tracking-widest text-white">
                  No Authorized Studios Configuration Found
                </p>
                <p className="text-xs uppercase tracking-wider text-slate-400 mt-1 max-w-md">
                  Database clean start complete. Access the Admin Panel to manage studios, create location entries, configure Mindbody Site IDs, and manage staff.
                </p>
              </div>
              {isAdminUser && onGoToAdmin && (
                <Button
                  onClick={onGoToAdmin}
                  className="mt-2 bg-[#F06C22] hover:bg-[#d95b16] text-white font-black uppercase tracking-widest text-xs h-12 px-8 rounded-xl shadow-lg shadow-[#F06C22]/20 flex items-center gap-2.5 cursor-pointer"
                >
                  <Shield className="w-4 h-4" /> Go To Admin Panel
                </Button>
              )}
            </div>
          )}
        </div>

        <div className="mt-12 flex justify-center">
          <Button
            variant="ghost"
            onClick={onBack}
            className="text-zinc-500 hover:text-ink-d1 font-black uppercase text-[11px] tracking-widest gap-2 bg-transparent"
          >
            <ChevronLeft className="w-4 h-4" />
            Clear active session
          </Button>
        </div>
      </motion.div>
    </div>
  );
}
