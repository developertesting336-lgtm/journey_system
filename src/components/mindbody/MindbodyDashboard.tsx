import React, { useState } from "react";
import StudioHubGrid from "./StudioHubGrid";
import ShiftRosterRow from "./ShiftRosterRow";
import WaitlistRecoveryWidget from "./WaitlistRecoveryWidget";
import ClientReliabilityScore from "./ClientReliabilityScore";
import CrossTrainApprovalCard from "./CrossTrainApprovalCard";
import CrossTrainAccessGate from "./CrossTrainAccessGate";
import { Button } from "@/components/ui/button";
import { useActiveStudio } from "../../ActiveStudioContext";

export function MindbodyDashboard() {
  const { activeStudio } = useActiveStudio();
  const [role, setRole] = useState<"trainer" | "leader">("trainer");
  const [showGate, setShowGate] = useState(false);
  const [accessState, setAccessState] = useState<
    "locked" | "granted" | "pending"
  >("locked");
  const [tokenStatus, setTokenStatus] = useState<string>(
    "Linked (API Key Active)",
  );
  const [isLoadingToken, setIsLoadingToken] = useState(false);

  const testGetUserToken = async () => {
    // Verifies the live connection for the studio you are actually in, using the
    // server's own source credentials. It used to hard-code the MindBody sandbox
    // site and demo login, which proved nothing about this studio.
    if (!activeStudio?.mindbodySiteId) {
      setTokenStatus(
        `${activeStudio?.name || "This studio"} has no MindBody Site ID configured.`,
      );
      return;
    }

    setIsLoadingToken(true);
    setTokenStatus("Verifying Connection...");
    try {
      const response = await fetch("/api/mindbody/locations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ siteId: String(activeStudio.mindbodySiteId) }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Failed to reach MindBody");
      }
      setTokenStatus(
        `Verified Active on Site ${activeStudio.mindbodySiteId} (${(data.locations || []).length} location(s)).`,
      );
    } catch (error: any) {
      console.error("Error verifying MindBody connection:", error);
      setTokenStatus(`Error: ${error.message || "Check console"}`);
    } finally {
      setIsLoadingToken(false);
    }
  };

  const handleGateRequest = (notes: string) => {
    console.log("Request submitted:", notes);
    setShowGate(false);
    setAccessState("pending");
  };

  const handleApprove = () => {
    console.log("Approved by leader");
    setAccessState("granted");
  };

  const handleDeny = () => {
    console.log("Denied by leader");
    setAccessState("locked");
  };

  return (
    <div className="min-h-full w-full bg-slate-50 dark:bg-slate-950 p-4 sm:p-6 md:p-8 flex flex-col gap-6 text-slate-900 dark:text-slate-100 pb-24">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white dark:bg-slate-900 p-4 sm:p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
        <div>
          <h2 className="text-xl sm:text-2xl font-black uppercase italic tracking-tight text-slate-900 dark:text-white">
            Mindbody End-to-End Integration
          </h2>
          <p className="text-xs sm:text-sm font-bold text-slate-500 dark:text-slate-400 mt-1 uppercase tracking-wider">
            Manage your studio operations seamlessly.
          </p>
        </div>
        <div className="flex gap-2 sm:gap-4 shrink-0">
          <Button
            variant={role === "trainer" ? "default" : "outline"}
            onClick={() => setRole("trainer")}
            className={
              role === "trainer"
                ? "bg-[#F06C22] text-white hover:bg-[#F06C22]/90 font-bold"
                : "border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 font-bold"
            }
          >
            Trainer View
          </Button>
          <Button
            variant={role === "leader" ? "default" : "outline"}
            onClick={() => setRole("leader")}
            className={
              role === "leader"
                ? "bg-[#F06C22] text-white hover:bg-[#F06C22]/90 font-bold"
                : "border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 font-bold"
            }
          >
            Leader View
          </Button>
        </div>
      </div>

      {accessState === "locked" && (
        <div className="bg-white dark:bg-slate-900 p-4 sm:p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
          <h3 className="font-bold text-slate-900 dark:text-white uppercase tracking-wide mb-3">
            Cross-Train Operations
          </h3>
          <Button
            onClick={() => setShowGate(true)}
            className="bg-[#F06C22] hover:bg-[#F06C22]/90 text-white font-black uppercase text-xs tracking-wider"
          >
            Access Foreign Client Record
          </Button>
        </div>
      )}

      <div className="bg-white dark:bg-slate-900 p-4 sm:p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
        <h3 className="font-bold text-slate-900 dark:text-white uppercase tracking-wide mb-3">
          Mindbody API Connection
        </h3>
        <div className="flex items-center gap-2 mb-4">
          <span className="text-xs sm:text-sm font-semibold text-slate-500 dark:text-slate-400">
            Status:
          </span>
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            {tokenStatus}
          </span>
        </div>
        <Button
          onClick={testGetUserToken}
          disabled={isLoadingToken}
          className="bg-slate-900 dark:bg-slate-100 hover:bg-slate-800 dark:hover:bg-white text-white dark:text-slate-900 font-black uppercase text-xs tracking-wider max-w-full h-auto py-2.5 px-4 whitespace-normal text-center cursor-pointer"
        >
          {isLoadingToken
            ? "Verifying..."
            : "Verify Mindbody API Sandbox Connection"}
        </Button>
      </div>

      {accessState === "pending" && (
        <div className="bg-white dark:bg-slate-900 p-4 sm:p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm max-w-sm">
          <h3 className="font-bold text-slate-900 dark:text-white uppercase tracking-wide mb-4">
            Leader Inbox View
          </h3>
          <CrossTrainApprovalCard
            request={{
              id: "req123",
              requestingTrainerName: "Marina",
              requestingTrainerInitials: "MR",
              targetClientName: "Allison P.",
              targetStudioName: "Uptown Studio",
              reason: "Covering a shift",
              createdAt: new Date(),
            }}
            onApprove={handleApprove}
            onDeny={handleDeny}
          />
        </div>
      )}

      {accessState === "granted" && (
        <div className="bg-white dark:bg-slate-900 p-4 sm:p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
          <h3 className="font-bold text-emerald-500 uppercase tracking-wide mb-2">
            Access Granted
          </h3>
          <p className="text-xs text-slate-600 dark:text-slate-400">
            The foreign visitor banner would now display "access granted"
            globally for this trainer.
          </p>
          <Button
            variant="outline"
            className="mt-4 border-slate-200 dark:border-slate-800"
            onClick={() => setAccessState("locked")}
          >
            Reset Workflow
          </Button>
        </div>
      )}

      {accessState !== "granted" && (
        <CrossTrainAccessGate
          open={showGate}
          onOpenChange={setShowGate}
          existingRequestStatus={accessState === "pending" ? "pending" : "none"}
          clientName="Allison P."
          clientHomeStudioName="Uptown Studio"
          currentStudioName="Downtown Studio"
          onRequest={() => handleGateRequest("Need to review notes.")}
          onBack={() => setShowGate(false)}
        />
      )}

      <div className="border border-slate-200 dark:border-slate-800 rounded-2xl bg-white dark:bg-slate-900 overflow-hidden shadow-sm">
        <StudioHubGrid
          role={role}
          studioName="Downtown Studio"
          dailyPulse={{
            shiftRoster: (
              <ShiftRosterRow
                trainer={{
                  id: "t1",
                  initials: "MA",
                  fullName: "Marina",
                  brandColor: "#F37427",
                  sessionCount: 11,
                }}
                timeColumns={[
                  "07:00",
                  "07:30",
                  "08:00",
                  "08:30",
                  "09:00",
                  "09:30",
                  "10:00",
                ]}
                appointments={[
                  {
                    id: "a1",
                    clientName: "Marquita R.",
                    time: "07:00",
                    state: "scheduled",
                    isNextUp: true,
                  },
                  {
                    id: "a2",
                    clientName: "Allison P.",
                    time: "08:00",
                    state: "arrived",
                    syncState: "syncing",
                  },
                  {
                    id: "a3",
                    clientName: "Mike C.",
                    time: "08:30",
                    state: "active",
                  },
                  {
                    id: "a4",
                    clientName: "Karen D.",
                    time: "09:00",
                    state: "completed",
                  },
                  {
                    id: "a5",
                    clientName: "Foreign C.",
                    time: "10:00",
                    state: "scheduled",
                    isForeign: true,
                    isLocked: accessState !== "granted",
                  },
                ]}
                currentTime={new Date(new Date().setHours(8, 35, 0, 0))}
                availableTimes={[
                  "07:00",
                  "07:30",
                  "08:00",
                  "08:30",
                  "09:00",
                  "09:30",
                  "10:00",
                ]}
                onAppointmentClick={(apt) => {
                  if (apt.isForeign && apt.isLocked) {
                    setShowGate(true);
                  } else {
                    console.log("clicked", apt.id);
                  }
                }}
              />
            ),
            waitlistRecovery: (
              <WaitlistRecoveryWidget
                openSlots={[
                  {
                    id: "s1",
                    time: new Date(new Date().setHours(7, 30, 0, 0)),
                    trainerId: "t1",
                    trainerName: "Marina",
                  },
                  {
                    id: "s2",
                    time: new Date(new Date().setHours(8, 0, 0, 0)),
                    trainerId: "t2",
                    trainerName: "Giovanni",
                  },
                ]}
                waitlist={[
                  {
                    clientId: "c1",
                    clientName: "Karen Doe",
                    preferences: "mornings only",
                  },
                  { clientId: "c2", clientName: "Mike Chen", preferences: "" },
                  {
                    clientId: "c3",
                    clientName: "Mandeep Singh",
                    preferences: "Marina specifically",
                  },
                ]}
                onMatch={(slotId, clientId) =>
                  console.log("match", slotId, clientId)
                }
              />
            ),
          }}
          retention={{
            reliabilityScore: (
              <ClientReliabilityScore
                score={82}
                counts={{
                  completed: 120,
                  reschedule: 10,
                  earlyCancel: 10,
                  lateCancel: 4,
                  noShow: 1,
                }}
              />
            ),
          }}
        />
      </div>
    </div>
  );
}
