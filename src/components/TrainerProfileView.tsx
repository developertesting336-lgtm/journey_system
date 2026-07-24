import React, { useState } from "react";
import {
  UserCircle,
  Calendar,
  History,
  Clock,
  CheckCircle2,
  ArrowRight,
  TrendingDown,
  Dumbbell,
  Star,
  ShieldCheck,
  Award,
  MapPin,
  Building2,
  Briefcase,
  Edit2,
} from "lucide-react";
import { motion } from "motion/react";
import { doc, getDoc, setDoc, updateDoc } from "firebase/firestore";
import { db } from "../firebase";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  ScheduleEntry,
  WorkoutSession,
  Client,
  Trainer,
  Studio,
} from "../types";
import { parseSessionDate } from "../lib/utils";
import { OperationType, handleFirestoreError } from "../lib/firestore-errors";
import { EditTrainerModal } from "./EditTrainerModal";

interface TrainerProfileViewProps {
  trainer: Trainer;
  authTrainer: Trainer | null;
  schedules: ScheduleEntry[];
  sessions: WorkoutSession[];
  clients: Client[];
  studios: Studio[];
  onSelectClient: (clientId: string) => void;
  setView: (view: any) => void;
}

export function TrainerProfileView({
  trainer,
  authTrainer,
  schedules,
  sessions,
  clients,
  studios,
  onSelectClient,
  setView,
}: TrainerProfileViewProps) {
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const now = new Date();

  const handleSaveProfile = async (updates: Partial<Trainer>) => {
    if (!trainer.id) return;
    try {
      const ref = doc(db, "trainers", trainer.id);
      const snap = await getDoc(ref);
      if (snap.exists()) {
        await updateDoc(ref, updates);
      } else {
        await setDoc(ref, { ...trainer, ...updates, createdAt: new Date() });
      }
    } catch (e) {
      handleFirestoreError(e, OperationType.UPDATE, `trainers/${trainer.id}`);
      throw e;
    }
  };

  const isEditable =
    authTrainer?.id === trainer.id ||
    authTrainer?.role === "StudioOwner" ||
    authTrainer?.role === "Admin" ||
    authTrainer?.role === "Overseer";

  // Filter schedules for this trainer
  const upcomingSchedules = React.useMemo(() => {
    return schedules
      .filter((s) => {
        if (s.status === "Cancelled" || s.status === "Completed") return false;
        const timeVal = s.startTime || (s as any).date;
        if (!timeVal) return false;
        let sDate: Date | null = null;
        if (typeof timeVal.toDate === "function") sDate = timeVal.toDate();
        else if (timeVal.seconds !== undefined)
          sDate = new Date(timeVal.seconds * 1000);
        else sDate = new Date(timeVal);
        if (!sDate || isNaN(sDate.getTime())) return false;

        const isTrainerMatch =
          s.trainerId === trainer.id ||
          (s.trainerName &&
            trainer.fullName &&
            (s.trainerName.toLowerCase() === trainer.fullName.toLowerCase() ||
              s.trainerName
                .toLowerCase()
                .includes(trainer.fullName.toLowerCase())));
        return isTrainerMatch;
      })
      .sort((a, b) => {
        const timeA = a.startTime || (a as any).date;
        const timeB = b.startTime || (b as any).date;
        const dA =
          typeof timeA?.toDate === "function"
            ? timeA.toDate().getTime()
            : new Date(timeA).getTime();
        const dB =
          typeof timeB?.toDate === "function"
            ? timeB.toDate().getTime()
            : new Date(timeB).getTime();
        return dA - dB;
      });
  }, [schedules, trainer]);

  // Filter completed sessions for this trainer
  const recentSessions = React.useMemo(() => {
    return sessions
      .filter(
        (s) =>
          (s.trainerId === trainer.id ||
            s.startedByTrainerId === trainer.id ||
            (s.trainerInitials &&
              trainer.initials &&
              s.trainerInitials.toLowerCase() ===
                trainer.initials.toLowerCase())) &&
          s.status === "Completed",
      )
      .sort((a, b) => parseSessionDate(b.date) - parseSessionDate(a.date));
  }, [sessions, trainer]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="max-w-350 mx-auto space-y-6 sm:space-y-8 pb-20 p-4 sm:p-6 lg:p-8 bg-[#0A2E46] min-h-[calc(100vh-100px)] rounded-2xl sm:rounded-3xl md:rounded-[40px] shadow-2xl relative overflow-hidden text-white"
    >
      <div className="absolute right-0 top-0 opacity-[0.03] pointer-events-none">
        <Dumbbell className="w-64 h-64 sm:w-96 sm:h-96 text-white" />
      </div>

      {/* Header Section */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 sm:gap-6 border-b border-slate-700/50 pb-5 sm:pb-6 relative z-10">
        <div className="flex items-center gap-4 sm:gap-6">
          <div
            className="w-14 h-14 sm:w-20 sm:h-20 rounded-2xl sm:rounded-[32px] bg-slate-800 flex items-center justify-center text-[#38BDF8] border-2 shadow-xl shadow-black/20 shrink-0"
            style={{
              color: trainer.brandColor || "#38BDF8",
              borderColor: trainer.brandColor
                ? `${trainer.brandColor}50`
                : "#334155",
            }}
          >
            <UserCircle className="w-9 h-9 sm:w-12 sm:h-12" />
          </div>
          <div className="flex flex-col gap-1 min-w-0">
            <p
              className="text-[10px] sm:text-[11px] font-black uppercase tracking-[0.2em] italic leading-none truncate"
              style={{ color: trainer.brandColor || "#38BDF8" }}
            >
              Tactical Command Center
            </p>
            <h2 className="text-2xl sm:text-3xl lg:text-4xl font-black tracking-tighter uppercase italic text-white truncate">
              {trainer.fullName}{" "}
              {trainer.nickname && (
                <span className="text-slate-300 text-lg sm:text-2xl">
                  "{trainer.nickname}"
                </span>
              )}
            </h2>
            <div className="flex flex-wrap items-center gap-1.5 sm:gap-3 mt-1">
              <Badge
                variant="outline"
                className="rounded-md border-slate-700 bg-slate-800 font-black uppercase text-[10px] sm:text-[11px] h-5"
                style={{
                  color: trainer.brandColor || "#cbd5e1",
                }}
              >
                {trainer.initials}
              </Badge>
              {trainer.mindbodyLinked && (
                <Badge className="rounded-md bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 font-black uppercase text-[9px] sm:text-[10px] tracking-widest h-5">
                  Mindbody Synced
                </Badge>
              )}
              {(trainer.role === "StudioOwner" ||
                trainer.role === "Admin" ||
                trainer.role === "Overseer") && (
                <Badge className="rounded-md bg-amber-500 hover:bg-amber-600 text-slate-950 font-black uppercase text-[10px] sm:text-[11px] h-5 shadow-[0_0_10px_rgba(245,158,11,0.5)] border-none">
                  Owner
                </Badge>
              )}
              {trainer.role === "Admin" && (
                <Badge className="rounded-md bg-sky-500 hover:bg-sky-600 text-slate-950 font-black uppercase text-[10px] sm:text-[11px] h-5 shadow-[0_0_10px_rgba(56,189,248,0.5)] border-none">
                  Admin
                </Badge>
              )}
            </div>
          </div>
        </div>
        <div className="flex flex-wrap sm:flex-nowrap gap-2 sm:gap-4 w-full md:w-auto">
          {isEditable && (
            <Button
              variant="outline"
              onClick={() => setIsEditModalOpen(true)}
              className="flex-1 sm:flex-initial h-11 sm:h-14 px-4 sm:px-6 rounded-xl sm:rounded-2xl font-black uppercase text-[10px] sm:text-xs border-indigo-500/30 bg-indigo-500/10 text-indigo-300 hover:bg-indigo-500 hover:text-white transition-all shadow-xl shadow-black/20 shrink-0"
            >
              <Edit2 className="w-3.5 h-3.5 sm:w-4 sm:h-4 mr-1.5 sm:mr-2" />
              Edit Profile
            </Button>
          )}
          <Button
            variant="outline"
            onClick={() => setView("calendar")}
            className="flex-1 sm:flex-initial h-11 sm:h-14 px-4 sm:px-8 rounded-xl sm:rounded-2xl font-black uppercase tracking-wider sm:tracking-widest text-[10px] sm:text-xs border-slate-700 bg-slate-800/80 text-slate-200 hover:bg-[#38BDF8] hover:text-slate-950 hover:border-[#38BDF8] transition-all shadow-xl shadow-black/20 shrink-0"
          >
            Studio Calendar
            <Calendar className="w-3.5 h-3.5 sm:w-4 sm:h-4 ml-2 sm:ml-3 opacity-60" />
          </Button>
        </div>
      </div>

      <div className="flex flex-col gap-10 relative z-10">
        {/* Professional Intelligence Section (New Details) */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-6">
            <div className="flex flex-col gap-1">
              <h3 className="text-2xl font-black uppercase italic text-white tracking-tighter">
                Professional Dossier
              </h3>
              <p className="text-[#38BDF8] text-[11px] font-black uppercase tracking-widest">
                Authorized expertise & qualifications
              </p>
            </div>

            <Card className="rounded-[40px] bg-slate-900/80 border-slate-700 shadow-2xl overflow-hidden backdrop-blur-sm">
              <div className="h-1 bg-linear-to-r from-[#38BDF8] to-indigo-500" />
              <CardContent className="p-8 space-y-8">
                {/* Bio */}
                <div className="space-y-3">
                  <div className="flex items-center gap-2 text-[#38BDF8]">
                    <ShieldCheck className="w-5 h-5" />
                    <h4 className="text-[11px] font-black uppercase tracking-widest leading-none">
                      Intelligence Summary
                    </h4>
                  </div>
                  <p className="text-slate-200 text-sm leading-relaxed font-medium italic border-l-2 border-slate-700 pl-4 py-1">
                    {trainer.bio ||
                      "No tactical biography provided. Field experience and specialized training confirmed through system authorization."}
                  </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
                  {/* Certifications */}
                  <div className="space-y-4">
                    <div className="flex items-center gap-2 text-[#38BDF8]">
                      <Award className="w-5 h-5" />
                      <h4 className="text-[11px] font-black uppercase tracking-widest leading-none">
                        Combat Grade Certifications
                      </h4>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {trainer.certifications &&
                      trainer.certifications.length > 0 ? (
                        trainer.certifications.map((cert, idx) => (
                          <Badge
                            key={idx}
                            variant="outline"
                            className="rounded-xl border-slate-700 bg-slate-800 text-white font-bold px-3 py-1.5 text-[11px]"
                          >
                            {cert}
                          </Badge>
                        ))
                      ) : (
                        <p className="text-slate-300 text-[11px] uppercase font-bold italic tracking-widest">
                          Level 1 Practitioner
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Core Stats */}
                  <div className="space-y-4">
                    <div className="flex items-center gap-2 text-[#38BDF8]">
                      <Clock className="w-5 h-5" />
                      <h4 className="text-[11px] font-black uppercase tracking-widest leading-none">
                        Service Timeline
                      </h4>
                    </div>
                    <div className="space-y-3">
                      <div className="flex justify-between items-center border-b border-slate-800 pb-2">
                        <span className="text-slate-300 text-[11px] font-black uppercase tracking-widest">
                          Duty Start Date
                        </span>
                        <span className="text-white font-bold text-xs">
                          {trainer.employmentStartDate
                            ? new Date(
                                trainer.employmentStartDate.toDate?.() ||
                                  trainer.employmentStartDate,
                              ).toLocaleDateString()
                            : "Baseline Personnel"}
                        </span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-slate-300 text-[11px] font-black uppercase tracking-widest">
                          Total Ops Vol
                        </span>
                        <span className="text-white font-bold text-xs">
                          {recentSessions.length} Logged Sessions
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="space-y-6">
            <div className="flex flex-col gap-1">
              <h3 className="text-2xl font-black uppercase italic text-white tracking-tighter">
                Network Access
              </h3>
              <p className="text-amber-400 text-[11px] font-black uppercase tracking-widest">
                Verified Multi-Location Footprint
              </p>
            </div>

            <div className="space-y-4">
              {/* Home Studio */}
              <div className="p-6 rounded-[32px] bg-slate-900 border-2 border-indigo-500/30 shadow-xl relative overflow-hidden group">
                <Building2 className="w-12 h-12 absolute -right-3 -top-3 text-white/5 group-hover:text-indigo-500/10 transition-all" />
                <p className="text-[11px] font-black text-indigo-400 uppercase tracking-widest mb-3 flex items-center gap-2">
                  <MapPin className="w-3 h-3" />
                  Primary Home Base
                </p>
                <p className="text-xl font-black text-white uppercase italic tracking-tighter">
                  {studios.find((s) => s.id === trainer.primaryHomeStudioId)
                    ?.name ||
                    studios[0]?.name ||
                    "Primary Studio"}
                </p>
              </div>

              {/* Other Access */}
              <div className="p-6 rounded-[32px] bg-slate-900/80 border border-slate-700 space-y-4">
                <div>
                  <p className="text-[11px] font-black text-slate-300 uppercase tracking-widest mb-3">
                    Station Access (Permanent)
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {trainer.accessibleStudioIds
                      ?.filter((id) => id !== trainer.primaryHomeStudioId)
                      .map((id) => (
                        <Badge
                          key={id}
                          variant="secondary"
                          className="bg-slate-800 text-slate-200 font-bold uppercase text-[11px] px-2 py-1 border-none"
                        >
                          {studios.find((s) => s.id === id)?.name || id}
                        </Badge>
                      ))}
                    {(!trainer.accessibleStudioIds ||
                      trainer.accessibleStudioIds.filter(
                        (id) => id !== trainer.primaryHomeStudioId,
                      ).length === 0) && (
                      <p className="text-slate-300 text-[11px] font-extrabold uppercase italic">
                        Single Base Clearance
                      </p>
                    )}
                  </div>
                </div>

                <div className="pt-4 border-t border-slate-800">
                  <p className="text-[11px] font-black text-amber-400 uppercase tracking-widest mb-3">
                    Guest Credentials (Temporary)
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {trainer.activeGuestStudioIds?.map((id) => (
                      <Badge
                        key={id}
                        variant="outline"
                        className="border-amber-500/30 text-amber-400 font-bold uppercase text-[11px] px-2 py-1 bg-amber-500/5"
                      >
                        {studios.find((s) => s.id === id)?.name || id}
                      </Badge>
                    ))}
                    {(!trainer.activeGuestStudioIds ||
                      trainer.activeGuestStudioIds.length === 0) && (
                      <p className="text-slate-300 text-[11px] font-extrabold uppercase italic">
                        No Active Guest Ops
                      </p>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Roster Grid */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex flex-col gap-1">
              <h3 className="text-2xl font-black uppercase italic text-white tracking-tighter">
                Daily Roster
              </h3>
              <p className="text-[#38BDF8] text-[11px] font-black uppercase tracking-widest">
                Upcoming appointments • {upcomingSchedules.length} Scheduled
              </p>
            </div>
          </div>

          {upcomingSchedules.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {upcomingSchedules.slice(0, 12).map((s, i) => {
                const timeVal = s.startTime || s.date;
                let sTime: Date = new Date();
                if (timeVal) {
                  if (typeof timeVal.toDate === "function")
                    sTime = timeVal.toDate();
                  else if (timeVal.seconds !== undefined)
                    sTime = new Date(timeVal.seconds * 1000);
                  else sTime = new Date(timeVal);
                }
                const isToday = sTime.toDateString() === now.toDateString();
                const client = clients.find((c) => c.id === s.clientId);

                return (
                  <motion.div
                    key={s.id || i}
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: i * 0.05 }}
                    className="flex flex-col p-5 bg-[#115E8D]/20 border-2 border-slate-700 hover:border-[#38BDF8] hover:bg-[#115E8D]/40 transition-all rounded-[32px] group cursor-pointer shadow-lg relative overflow-hidden h-full"
                    onClick={() => {
                      if (s.clientId) {
                        onSelectClient(s.clientId);
                        setView("profile");
                      }
                    }}
                  >
                    <div className="absolute -right-4 -bottom-4 opacity-[0.03] group-hover:opacity-[0.06] transition-opacity pointer-events-none">
                      <UserCircle className="w-32 h-32 text-white" />
                    </div>

                    <div className="flex justify-between items-start mb-6">
                      <div className="flex flex-col gap-1 min-w-0 pr-2">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-black text-2xl text-white uppercase italic tracking-tight truncate leading-none pt-1">
                            {s.clientName}
                          </p>
                          {client?.packageTier === "18-Month" && (
                            <Star className="w-4 h-4 text-amber-400 fill-amber-400 drop-shadow-[0_0_5px_rgba(251,191,36,0.8)] mt-1" />
                          )}
                        </div>
                      </div>

                      <div className="flex flex-col items-end gap-2 shrink-0">
                        {isToday && (
                          <Badge className="bg-rose-500 text-white font-black uppercase text-[11px] px-2 shadow-[0_0_10px_rgba(244,63,94,0.4)] border-none">
                            Today
                          </Badge>
                        )}
                        <div className="flex gap-2">
                          <div className="bg-[#F06C22] text-white font-black uppercase text-[11px] px-3 py-1 rounded-lg shadow-[0_0_15px_rgba(240,108,34,0.6)] border border-[#F06C22]/50 whitespace-nowrap">
                            Session #{client?.sessionCount ?? 0}
                          </div>
                          {client?.remainingSessions != null && (
                            <div className="bg-emerald-500/10 text-emerald-400 font-black uppercase text-[11px] px-3 py-1 rounded-lg shadow-[0_0_15px_rgba(52,211,153,0.2)] border border-emerald-500/30 whitespace-nowrap">
                              {client.remainingSessions} Left
                            </div>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 text-slate-300 mt-auto pt-4 border-t border-slate-700/50">
                      <div className="flex items-center gap-1.5 bg-slate-900/60 px-3 py-1.5 rounded-lg border border-slate-800 shadow-inner">
                        <Clock className="w-4 h-4 text-[#38BDF8]" />
                        <span className="text-[12px] font-black uppercase text-slate-200">
                          {sTime.toLocaleTimeString([], {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5 ml-1">
                        <Calendar className="w-3.5 h-3.5 text-slate-400" />
                        <span className="text-[11px] font-bold uppercase text-slate-300">
                          {sTime.toLocaleDateString([], {
                            month: "short",
                            day: "numeric",
                          })}
                        </span>
                      </div>
                      <div className="ml-auto w-10 h-10 rounded-2xl bg-slate-800 group-hover:bg-[#38BDF8] flex items-center justify-center transition-colors shadow-inner border border-slate-700 group-hover:border-[#38BDF8]">
                        <ArrowRight className="w-5 h-5 text-slate-300 group-hover:text-slate-950 transition-colors" />
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          ) : (
            <div className="text-center py-16 bg-slate-800/40 border-2 border-dashed border-slate-700 rounded-[40px] flex flex-col items-center gap-4">
              <div className="w-16 h-16 rounded-full bg-slate-800 flex items-center justify-center shadow-inner border border-slate-700">
                <Calendar className="w-8 h-8 text-[#38BDF8]" />
              </div>
              <p className="text-xs font-black uppercase tracking-widest leading-relaxed text-slate-300">
                No upcoming sessions
                <br />
                found in schedule.
              </p>
            </div>
          )}
        </div>

        {/* Recently Trained */}
        <div className="space-y-4 pt-8 border-t border-slate-700/50">
          <div className="flex items-center justify-between">
            <div className="flex flex-col gap-1">
              <h3 className="text-xl font-black uppercase italic text-white tracking-tighter">
                Recently Logged
              </h3>
              <p className="text-emerald-400 text-[11px] font-black uppercase tracking-widest">
                Historical sessions
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
            {recentSessions.length > 0 ? (
              recentSessions.slice(0, 6).map((s, i) => {
                const client = clients.find((c) => c.id === s.clientId);
                const ts = parseSessionDate(s.date);
                const sessionDate = ts > 0 ? new Date(ts) : new Date();

                return (
                  <motion.div
                    key={s.id || i}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.05 }}
                    className="flex flex-col p-4 bg-slate-800/60 border-2 border-slate-700 hover:border-emerald-500/50 hover:bg-slate-800/90 transition-all rounded-3xl group cursor-pointer"
                    onClick={() => {
                      if (s.clientId) {
                        onSelectClient(s.clientId);
                        setView("history");
                      }
                    }}
                  >
                    <div className="flex justify-between items-center mb-3">
                      <p className="font-black text-white text-lg uppercase italic tracking-tight truncate">
                        {client
                          ? `${client.firstName} ${client.lastName}`
                          : "System Log"}
                      </p>
                      <div className="w-8 h-8 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center group-hover:bg-emerald-500 group-hover:text-slate-950 transition-colors">
                        <CheckCircle2 className="w-4 h-4 text-emerald-400 group-hover:text-slate-950 transition-colors" />
                      </div>
                    </div>

                    <div className="flex justify-between items-center mt-auto">
                      <div className="flex items-center gap-1.5 text-slate-400">
                        <Calendar className="w-3.5 h-3.5 text-slate-400" />
                        <span className="text-[11px] font-bold uppercase text-slate-300">
                          {sessionDate.toLocaleDateString([], {
                            month: "short",
                            day: "numeric",
                            year: "numeric",
                          })}
                        </span>
                      </div>
                      <Badge
                        variant="outline"
                        className="text-emerald-400 border-none bg-emerald-500/10 font-black uppercase text-[11px] tracking-widest px-2 shadow-inner"
                      >
                        Logged
                      </Badge>
                    </div>
                  </motion.div>
                );
              })
            ) : (
              <div className="col-span-full text-center py-12 bg-slate-800/40 border-2 border-dashed border-slate-700 rounded-[32px] flex flex-col items-center gap-3">
                <TrendingDown className="w-10 h-10 text-slate-400 mb-1" />
                <p className="text-[11px] font-black uppercase tracking-widest leading-relaxed text-slate-300">
                  No recent activity recorded.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
      <EditTrainerModal
        trainer={trainer}
        authTrainer={authTrainer}
        studios={studios}
        isOpen={isEditModalOpen}
        onOpenChange={setIsEditModalOpen}
        onSave={handleSaveProfile}
      />
    </motion.div>
  );
}
